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

// ─────────────────────────────────────────────────────────────────────────
// NEW-44D — table SHAPES, not just names.
//
// The governance audit found that tenancyViolations() was correct and
// mutation-proven, but the set of tables fed to it was a hand-maintained
// fixture inside a test. So a table added to the corpus with org_id and an
// employee_id/case_id was never evaluated unless somebody remembered to extend
// that fixture — the exact forgotten-list dependency NEW-44 exists to remove.
//
// This derives the shapes from the same corpus the name replay already uses. It
// is deliberately NOT a general SQL parser: it answers two questions and no
// others —
//
//   which columns does this table have?   which foreign keys cover them?
//
// Four DDL forms carry those answers in this corpus, verified by reading it:
//
//   create table public.x ( col type, ..., constraint n foreign key (a,b) references public.y(c,d) )
//   alter table public.x add column if not exists col type[, add column ...]
//   alter table public.x add constraint n foreign key (a, b) references public.y (c, d)
//   alter table public.x drop constraint if exists n
//
// plus inline `col type references public.y(id)` inside a create-table body —
// which is how every org_id -> organisations reference in this schema is
// written.
// ─────────────────────────────────────────────────────────────────────────

// Function bodies are removed before any shape parsing. A trigger body can
// legitimately contain the words "alter table" in an error message, and a
// `do $$ ... $$` block could contain real DDL that is conditional — neither
// should be read as a declaration. Verified safe: the table SET produced with
// and without this strip is identical (asserted in the tests), so this removes
// noise and never a table.
export function stripDollarQuoted(sql) {
  return String(sql || '').replace(/\$\$[\s\S]*?\$\$/g, ' ');
}

// Split a create-table body on TOP-LEVEL commas. A nested `(10, 2)` in a
// numeric type, or a multi-column constraint, must not end an item.
function splitTopLevel(body) {
  const items = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { items.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) items.push(current);
  return items;
}

// The parenthesised body of a create-table, found by balancing parentheses from
// the first `(` after the table name.
function balancedBody(text, from) {
  const open = text.indexOf('(', from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return { body: text.slice(open + 1, i), end: i };
    }
  }
  return null;
}

const NOT_A_COLUMN = /^(constraint|primary|foreign|unique|check|exclude|like|using|partition)\b/i;
const FK_CLAUSE = /foreign\s+key\s*\(([^)]*)\)\s*references\s+(?:public\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?/gi;
const INLINE_REF = /^\s*"?([a-z_][a-z0-9_]*)"?\s+[^,]*?\breferences\s+(?:public\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?/i;

const columnList = raw => raw.split(',').map(c => c.trim().replace(/^"|"$/g, '').toLowerCase()).filter(Boolean);

function foreignKeysIn(text) {
  const out = [];
  FK_CLAUSE.lastIndex = 0;
  for (let m = FK_CLAUSE.exec(text); m; m = FK_CLAUSE.exec(text)) {
    out.push({ columns: columnList(m[1]), parent: m[2].toLowerCase() });
  }
  return out;
}

// Replay the corpus and return { table: { columns: [], foreignKeys: [] } }.
// Renames move a shape; drops remove it — the same event model as the name
// replay, so the two cannot disagree about which tables exist.
export function declaredTableShapes(files = []) {
  const shapes = new Map();
  const ensure = name => {
    if (!shapes.has(name)) shapes.set(name, { columns: new Set(), foreignKeys: [] });
    return shapes.get(name);
  };

  for (const file of migrationOrder(files)) {
    const sql = stripDollarQuoted(stripSqlComments(file.sql || ''));

    // POSITION ORDER IS LOAD-BEARING, and getting this wrong is not theoretical
    // — the first draft of this parser collected creates and then applied
    // renames afterwards, so standalone_meetings_2026-09-25.sql's
    // `rename to meetings_legacy_unused` moved the shape of the NEW `meetings`
    // table into the fossil, and `meetings` was left holding only the columns
    // later ALTERs added. org_id vanished from it, the tenancy rule stopped
    // applying to it, and the suite still passed. So every shape-affecting
    // event is collected with its offset and replayed in the order Postgres
    // would execute it.
    const events = [];

    const CREATE_HEAD = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?/gi;
    CREATE_HEAD.lastIndex = 0;
    for (let m = CREATE_HEAD.exec(sql); m; m = CREATE_HEAD.exec(sql)) {
      events.push({
        at: m.index, kind: 'create', table: m[1].toLowerCase(),
        found: balancedBody(sql, m.index + m[0].length),
      });
    }

    const ALTER = /\balter\s+table\s+(?:if\s+exists\s+)?(?:public\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?([\s\S]*?);/gi;
    ALTER.lastIndex = 0;
    for (let m = ALTER.exec(sql); m; m = ALTER.exec(sql)) {
      events.push({ at: m.index, kind: 'alter', table: m[1].toLowerCase(), statement: m[2] || '' });
    }

    // Renames and drops come from the SAME event extractor the name replay
    // uses, so the two can never disagree about which tables exist.
    for (const ev of schemaEventsIn(file.sql || '')) {
      if (ev.kind === 'drop' || ev.kind === 'rename') events.push(ev);
    }

    events.sort((a, b) => a.at - b.at);

    for (const ev of events) {
      if (ev.kind === 'create') {
        const shape = ensure(ev.table);
        if (!ev.found) continue;                  // e.g. `create table x as select`
        for (const item of splitTopLevel(ev.found.body)) {
          const trimmed = item.trim();
          if (!trimmed) continue;
          if (NOT_A_COLUMN.test(trimmed)) {
            shape.foreignKeys.push(...foreignKeysIn(trimmed));
            continue;
          }
          const name = trimmed.match(/^"?([a-z_][a-z0-9_]*)"?/i);
          if (name) shape.columns.add(name[1].toLowerCase());
          const inline = trimmed.match(INLINE_REF);
          if (inline) shape.foreignKeys.push({ columns: [inline[1].toLowerCase()], parent: inline[2].toLowerCase() });
        }
      } else if (ev.kind === 'alter') {
        if (/\brename\s+to\b/i.test(ev.statement)) continue;   // the rename event handles it
        const shape = ensure(ev.table);
        const ADD_COL = /\badd\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
        for (let c = ADD_COL.exec(ev.statement); c; c = ADD_COL.exec(ev.statement)) {
          shape.columns.add(c[1].toLowerCase());
        }
        const DROP_COL = /\bdrop\s+column\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
        for (let c = DROP_COL.exec(ev.statement); c; c = DROP_COL.exec(ev.statement)) {
          shape.columns.delete(c[1].toLowerCase());
        }
        shape.foreignKeys.push(...foreignKeysIn(ev.statement));
      } else if (ev.kind === 'drop') {
        shapes.delete(ev.table);
      } else if (ev.kind === 'rename' && shapes.has(ev.table)) {
        shapes.set(ev.to, shapes.get(ev.table));
        shapes.delete(ev.table);
      }
    }
  }

  const out = {};
  for (const [table, shape] of shapes) {
    out[table] = { columns: [...shape.columns].sort(), foreignKeys: shape.foreignKeys };
  }
  return out;
}

// The shape of input tenancyViolations() expects, derived rather than typed.
// Only tables carrying org_id are returned: the tenancy rule does not apply
// without a tenant column, and narrowing here keeps the governance test's
// intent legible.
export function orgScopedShapes(files = []) {
  const shapes = declaredTableShapes(files);
  const tables = [];
  const foreignKeys = [];
  for (const [name, shape] of Object.entries(shapes)) {
    if (!shape.columns.includes('org_id')) continue;
    tables.push({ name, columns: shape.columns });
    for (const fk of shape.foreignKeys) foreignKeys.push({ table: name, ...fk });
  }
  return { tables: tables.sort((a, b) => a.name.localeCompare(b.name)), foreignKeys };
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
