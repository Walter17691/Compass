// NEW-44 — derive the public schema from the migration corpus, mechanically.
//
// WHY THIS EXISTS. src/test/dataInventory.test.js held a hand-authored list of
// every org_id-bearing table, "taken by directly querying information_schema on
// 2026-08-25". Its own header predicted how it would fail: "This snapshot can go
// stale the same way the old hand-maintained list did — the durable fix is a
// live-schema CI check, not a hardcoded array." It then went stale exactly as
// predicted, and NEW-44 is that bill arriving.
//
// A snapshot is a photograph of the schema. This module reads the schema's birth
// certificate instead: every one of the 43 tables production currently has was
// created by a committed file in supabase/, so replaying that corpus reproduces
// the live set without anyone retyping it.
//
// ┌─ WHY NOT THE LIVE API ──────────────────────────────────────────────────┐
// │ PostgREST publishes an OpenAPI document listing the tables it exposes,  │
// │ which looks like the ideal machine-readable live source. Measured       │
// │ against production on 2026-10-02 it returned 36 of the 43 real tables.  │
// │ The seven it cannot see are customer_contracts, team_invites,           │
// │ employee_activities, employee_activity_records,                          │
// │ employee_employment_events, meetings_legacy_unused and platform_admins   │
// │ — because it advertises only what is granted to the API roles, and a    │
// │ table nobody granted is precisely the kind nobody classified either.    │
// │                                                                          │
// │ The first two of those seven ARE NEW-44. A gate built on that document   │
// │ would have reported full coverage while the two tables it was written    │
// │ to catch stayed invisible. Do not "simplify" this module into that.      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// This source has its own, OPPOSITE blind spot, stated rather than discovered
// later: it sees what the repository declares, so a table created by hand in the
// Supabase dashboard is invisible to it. Only a SQL-level reading of
// information_schema closes that, which needs a credential this repo does not
// hold — scripts/schema-drift-check.mjs is that check, and it refuses to report
// "no drift" when it cannot actually look.

// SQL comments are stripped BEFORE any DDL is matched, and that is load-bearing
// rather than tidy. The corpus contains commented-out rollback instructions:
//
//   supabase/standalone_meetings_2026-09-25.sql:464
//     --   alter table public.meetings_legacy_unused rename to meetings;
//
// A parser that reads comments would apply that rollback and conclude the live
// table is called `meetings`, losing meetings_legacy_unused — a table holding
// transcript, prep_pack and outcome_letter columns — from the inventory
// entirely. Four commented `drop table` lines would likewise delete live tables
// from the derived set. The same trap caught a naive grep during this audit,
// which reported a table called `comment` from the prose
// "(see its CREATE TABLE comment above)".
export function stripSqlComments(sql) {
  if (typeof sql !== 'string') return '';
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // /* block */, including multi-line
    .replace(/--[^\n]*/g, ' ');          // -- to end of line
}

// Migration files are named <topic>_YYYY-MM-DD.sql. Alphabetical order is NOT
// chronological order (the topic sorts first), and order decides the answer:
// baseline_schema_2026-08-06 creates `meetings`, and standalone_meetings_
// 2026-09-25 renames that one away and creates a new table under the same name.
// Replayed by date the result is both tables, which is what production has;
// replayed alphabetically it is a coin toss.
export function migrationOrder(files = []) {
  const dateOf = name => {
    const match = String(name).match(/(\d{4}-\d{2}-\d{2})/);
    // A file with no date sorts first, so a hand-named migration is replayed
    // before everything rather than silently last.
    return match ? match[1] : '0000-00-00';
  };
  return [...files].sort((a, b) => {
    const d = dateOf(a.name).localeCompare(dateOf(b.name));
    return d !== 0 ? d : String(a.name).localeCompare(String(b.name));
  });
}

// `public.` is optional throughout: a file run in the Supabase SQL editor with
// the default search_path creates a public table whether or not it says so.
// Accepting both over-reports at worst (an unqualified table in some other
// schema would be listed and then need classifying), and over-reporting is the
// safe direction for an erasure gate — the unsafe direction is a table that
// exists and is never mentioned.
const CREATE = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?/gi;
const DROP = /\bdrop\s+table\s+(?:if\s+exists\s+)?(?:public\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?/gi;
// Anchored on `alter table` so `alter policy "Own meetings" on public.x rename
// to ...` — which sits on the line directly after the real rename in
// standalone_meetings_2026-09-25.sql — cannot be mistaken for a table rename.
const RENAME = /\balter\s+table\s+(?:if\s+exists\s+)?(?:public\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?\s+rename\s+to\s+"?([a-z_][a-z0-9_]*)"?/gi;

// Every DDL event in one file, in the order it would execute. Intra-file order
// matters as much as file order: audit_log_cloud_sync_2026-07-25.sql drops
// public.audit_log and recreates it twenty lines later, so a parser that
// collected creates and drops separately would decide audit_log does not exist.
export function schemaEventsIn(sql) {
  const body = stripSqlComments(sql);
  const events = [];
  const scan = (re, build) => {
    re.lastIndex = 0;
    for (let m = re.exec(body); m; m = re.exec(body)) events.push({ at: m.index, ...build(m) });
  };
  scan(CREATE, m => ({ kind: 'create', table: m[1].toLowerCase() }));
  scan(DROP, m => ({ kind: 'drop', table: m[1].toLowerCase() }));
  scan(RENAME, m => ({ kind: 'rename', table: m[1].toLowerCase(), to: m[2].toLowerCase() }));
  return events.sort((a, b) => a.at - b.at);
}

// Replay the whole corpus and return the table names it leaves behind, sorted.
// `files` is [{ name, sql }] — reading them from disk is the caller's job, so
// this stays pure and can be driven by a synthetic corpus in tests.
export function declaredPublicTables(files = []) {
  const present = new Set();
  for (const file of migrationOrder(files)) {
    for (const ev of schemaEventsIn(file.sql || '')) {
      if (ev.kind === 'create') present.add(ev.table);
      else if (ev.kind === 'drop') present.delete(ev.table);
      else if (ev.kind === 'rename' && present.has(ev.table)) {
        present.delete(ev.table);
        present.add(ev.to);
      }
    }
  }
  return [...present].sort();
}
