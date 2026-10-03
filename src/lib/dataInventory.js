// Phase 6.5 hardening (structural remediation, Prompt 12 — GDPR
// Ownership / DSAR / Erasure Completeness invariant).
//
// api/delete-org-data.js used to keep its own hand-maintained table list,
// verified against the live schema at the time it was last edited and
// never revisited — the independent audit found two more org-scoped
// tables (case_access, organisation_themes) that had accumulated since.
// This module is the single source of truth instead: the runtime
// handler imports ORG_SCOPED_TABLES from here (so there is only one list
// to keep current, not two), and dataInventory.test.js checks it against
// an independently-authored snapshot of every org_id-bearing table this
// project's live schema actually has, so a newly-added org-scoped table
// that's never added here fails a test instead of silently surviving
// "Delete all data" forever.
//
// Every table below was verified directly against the live schema
// (information_schema.columns / table_constraints, not just read from a
// migration file's comment) on 2026-08-25.

// Tables with their own org_id column, actively DELETEd by
// api/delete-org-data.js. audit_log is handled by that same handler but
// kept out of this list and cleared separately — see its own call site
// comment for why (the deletion event itself needs to survive as the one
// audit row proving the erasure happened).
// ┌─ THIS ARRAY IS AN ORDER, NOT A SET ─────────────────────────────────────┐
// │ api/delete-org-data.js iterates it in sequence, one DELETE per table,    │
// │ each its own PostgREST request — so there is no transaction and no        │
// │ rollback. Five tables RESTRICT-reference employee_records, which means    │
// │ every one of them must be deleted BEFORE it or the delete raises a        │
// │ foreign-key violation and that table's rows survive the erasure.         │
// │                                                                          │
// │ NEW-44 (second pass) found exactly that, live: `meetings` was appended    │
// │ to the END of this list in Phase 4C.1 — correctly classified, genuinely   │
// │ deleted — but at index 23, after employee_records at index 9. Production   │
// │ holds 4 meetings rows, 2 with a non-null employee_id, ALL of them in the  │
// │ one active customer tenant, so "Delete all data" would have failed on     │
// │ employee_records and left the core PII record behind. It is moved up      │
// │ here, and the ordering is now a TEST against the live FK graph rather     │
// │ than something the next person appending a table has to remember.         │
// │                                                                          │
// │ Appending to this list is safe ONLY for a table nothing RESTRICT-points   │
// │ at. The test tells you; do not guess.                                     │
// └─────────────────────────────────────────────────────────────────────────┘
export const ORG_SCOPED_TABLES = [
  'cases',
  // meetings (Phase 4C.1, supabase/standalone_meetings_2026-09-25.sql) — the
  // standalone meeting store. Its own org_id column, and its case_id is NULLABLE
  // by design, so the cases cascade reaches only the linked ones and would leave
  // every genuinely standalone meeting behind. It must be deleted directly or
  // "Delete all data" would silently spare meeting transcripts forever.
  //
  // POSITION IS LOAD-BEARING: meetings.employee_id -> employee_records is
  // RESTRICT (verified live 2026-10-03), so it has to go before that table.
  'meetings',
  'starter_instances', 'dsar_requests', 'hr_review_requests', 'wellbeing_notes',
  'concern_referrals', 'leaver_instances', 'case_tasks', 'signing_requests', 'employee_records',
  'employee_portal_accounts', 'employee_portal_invites', 'case_views', 'improvement_initiatives',
  'manager_capability_insights', 'er_executive_briefs', 'org_events', 'integration_events',
  'organisation_themes',
  // Phase E1.6 — employee activities and their chronology. Both carry their own
  // org_id. employee_activity_records would also be reached by the cascade from
  // employee_activities, but it is listed explicitly so "delete all data" does
  // not depend on cascade order remaining what it is today.
  'employee_activities', 'employee_activity_records',
  // Phase E1.7 — employment events, own org_id; listed explicitly rather than
  // relying on the employee cascade.
  'employee_employment_events',
  // redundancy_cases (closes Prompt 16 audit finding H1) — its own direct
  // org_id column, no case_id/FK to cases at all, so nothing else's
  // cascade would ever reach it (see supabase/redundancy_cases_2026-08-27.sql).
  'redundancy_cases',
];

// ── NEW-44 (second pass) — the ordering constraint, as data ────────────────
//
// Every RESTRICT / NO ACTION foreign key in the live schema, read from
// information_schema on 2026-10-03. Only edges whose BOTH ends are actively
// deleted constrain the order: where the parent is never deleted (locations,
// organisations) there is nothing to sequence against.
//
// Recorded here so the ordering test has something to check that is not the
// ordering itself. It is re-verified live by scripts/schema-drift-check.mjs,
// which is the half that catches a cascade changing underneath this list.
export const RESTRICTING_FOREIGN_KEYS = [
  { child: 'cases', parent: 'employee_records', column: 'employee_id', rule: 'RESTRICT' },
  { child: 'concern_referrals', parent: 'employee_records', column: 'employee_id', rule: 'RESTRICT' },
  { child: 'dsar_requests', parent: 'employee_records', column: 'employee_id', rule: 'RESTRICT' },
  { child: 'meetings', parent: 'employee_records', column: 'employee_id', rule: 'RESTRICT' },
  { child: 'wellbeing_notes', parent: 'employee_records', column: 'employee_id', rule: 'RESTRICT' },
  { child: 'employee_activities', parent: 'locations', column: 'location_id', rule: 'RESTRICT' },
  { child: 'employee_employment_events', parent: 'locations', column: 'new_location_id', rule: 'RESTRICT' },
  { child: 'employee_employment_events', parent: 'locations', column: 'old_location_id', rule: 'RESTRICT' },
  { child: 'employee_records', parent: 'locations', column: 'location_id', rule: 'RESTRICT' },
  { child: 'cases', parent: 'locations', column: 'location_id', rule: 'NO ACTION' },
  { child: 'cases', parent: 'organisations', column: 'org_id', rule: 'NO ACTION' },
  { child: 'employee_records', parent: 'organisations', column: 'org_id', rule: 'NO ACTION' },
  { child: 'meetings', parent: 'organisations', column: 'org_id', rule: 'NO ACTION' },
];

// Every ordering violation in the current deletion sequence. Empty is the only
// acceptable answer; the test asserts that and names any offender.
//
// A violation is NOT cosmetic. The handler issues one DELETE per table with no
// transaction, so a child deleted after its RESTRICT parent means the PARENT's
// delete raises, the parent's rows survive, and the erasure reports a partial
// failure — which is what GDPR Art. 17 was supposed to guarantee against.
export function deletionOrderViolations(order = ORG_SCOPED_TABLES, fks = RESTRICTING_FOREIGN_KEYS) {
  const index = new Map(order.map((t, i) => [t, i]));
  return fks
    .filter(fk => index.has(fk.child) && index.has(fk.parent))
    .filter(fk => index.get(fk.child) > index.get(fk.parent))
    .map(fk => ({
      ...fk,
      childIndex: index.get(fk.child),
      parentIndex: index.get(fk.parent),
      why: `${fk.child} is deleted at ${index.get(fk.child)} but ${fk.parent} at `
        + `${index.get(fk.parent)}; ${fk.child}.${fk.column} is ${fk.rule}, so `
        + `${fk.parent} would fail and its rows would survive the erasure.`,
    }));
}

// Tables with an org_id column that are NOT deleted directly, because a
// verified NOT NULL, ON DELETE CASCADE foreign key to `cases` (itself in
// ORG_SCOPED_TABLES above) already erases them the moment that handler's
// own `cases` delete runs. Listed explicitly, with each FK re-confirmed
// live, rather than left as an unstated assumption a future schema
// change could quietly invalidate — dataInventory.test.js keys off this
// exact list, so a schema change that drops one of these cascades (or
// makes case_id nullable) needs a human to update this file to notice.
export const CASCADE_COVERED_TABLES = [
  'allegations', 'case_signals', 'case_themes', 'case_access',
  // case_decisions (Wave D4.2, supabase/case_decisions_2026-10-03.sql) — its
  // (case_id, org_id) -> cases(id, org_id) foreign key is NOT NULL and
  // ON DELETE CASCADE, so the handler's own `cases` delete erases every
  // decision row. Adding it to ORG_SCOPED_TABLES would be inert, and would
  // also put it in the deletion ORDER where it does not belong.
  'case_decisions',
];

// Tables with an org_id column that are deliberately left alone by
// "Delete all data" — org/account structure and integration config, not
// case or employee content. Deleting the organisation itself, removing
// teammates, or disconnecting calendar/mail integrations are different,
// much bigger actions than what this button has ever promised (see
// api/delete-org-data.js's own header comment).
export const INTENTIONALLY_EXCLUDED_TABLES = [
  'org_members', 'org_roles', 'locations', 'process_templates',
  'calendar_connections', 'graph_mail_connections',
  // ── NEW-44 ──────────────────────────────────────────────────────────
  // customer_contracts — Compass's own commercial record OF this customer:
  // legal name, contract dates, agreed fee, DPA status, order form
  // reference. Created by Compass, about the organisation as a counterparty,
  // and it is not case or employee content. An HR Director pressing "Delete
  // all data" in their own Settings must not be able to erase their
  // employer's signed-contract record, any more than they can delete the
  // organisation row itself — and it carries org_id NOT NULL ON DELETE
  // CASCADE to organisations, so it goes when the organisation genuinely
  // goes. Classified as excluded on the SAME contract as organisations,
  // not because it was convenient to leave out.
  'customer_contracts',
  // team_invites — a PENDING teammate: name, email, token_hash, intended
  // role. This is the org_members pipeline, and org_members (people who
  // already accepted, with full access) is deliberately excluded above, so
  // deleting invites would be the inconsistent choice: "delete all data"
  // does not dissolve the HR team.
  //
  // The asymmetry with employee_portal_invites, which IS actively deleted,
  // is deliberate and worth stating because it looks wrong at a glance. A
  // portal invite is an EMPLOYEE's access path to their own case records —
  // leaving it live after those records are erased was the defect the Phase
  // 6.5 review named ("a live login path into records that no longer
  // exist"). A team invite is an HR COLLEAGUE's path into the organisation,
  // whose membership this button has never claimed to touch.
  //
  // RECORDED SEPARATELY, NOT FIXED HERE: team_invites and
  // customer_contracts.primary_contact_name/email hold a named person's
  // data and neither is read by api/portal/_dsar-lookup.js, which does read
  // org_members, profiles, case_views, employee_portal_* and
  // signing_requests. That is a DSAR completeness gap rather than an
  // erasure gap, in a different inventory, and it is filed as its own
  // defect — see docs/release-1-defect-register.md.
  'team_invites',
];

// ─────────────────────────────────────────────────────────────────────────
// NEW-44 — the four categories above share one unstated assumption: that a
// table worth classifying has an org_id column. The snapshot test keyed off
// exactly that ("every table this project's live schema actually has an
// org_id column on"), and it is the wrong question.
//
// public.organisations is the tenant itself and has no org_id — its primary
// key IS the org id. public.calendar_synced_events holds 33 live rows of
// calendar mappings and has no org_id. public.meetings_legacy_unused has
// columns called transcript, prep_pack and outcome_letter and no org_id.
// None of the three could ever appear in an org_id sweep, so none was ever
// classified, and "we found no unclassified org_id tables" quietly meant
// "we did not look at the tables that cannot be erased by org_id at all" —
// which is the set most likely to survive an erasure.
//
// Relevance is therefore decided by SCHEMA, not by the presence of a
// column: every base table in `public` must land in exactly one category
// below. The categories that follow exist because those tables are real,
// not to absorb leftovers.
// ─────────────────────────────────────────────────────────────────────────

// Platform- and account-level tables with NO org_id, which a tenant-scoped
// action must never touch. Listed so that "nothing deletes these" is a
// recorded decision with a reason, instead of a consequence of the sweep
// being unable to address them.
//
//   organisations    the tenant row itself; api/delete-org-data.js's header
//                    has always named it as deliberately spared. Most
//                    org-scoped tables FK to it ON DELETE CASCADE, so this
//                    row is the real "delete the organisation" lever and a
//                    far bigger action than this button.
//   profiles         the signed-in USER's own account identity (name, role,
//                    company), keyed to auth.users, not to an org. Erasing
//                    it would strip the HR Director's own identity while
//                    they remain an org_member. Already covered by DSAR via
//                    api/portal/_dsar-lookup.js. Currently 0 rows live.
//   platform_admins  Compass operator grants (user_id, granted/revoked by).
//                    A tenant-triggered write here would be a privilege
//                    boundary change, which is exactly what platform-admin
//                    isolation forbids. Never deleted, never written by any
//                    tenant path.
export const PLATFORM_SCOPED_TABLES = ['organisations', 'profiles', 'platform_admins'];

// Operational infrastructure: no org dimension to delete by, and no case or
// employee content.
//
//   api_rate_limits  (rate_key, window_start, request_count), RLS enabled
//                    with zero policies, reachable only through the
//                    SECURITY DEFINER check_rate_limit function. Honest
//                    caveat rather than a clean claim: rate_key is built as
//                    `chat:${caller.id}` / `send-letter:${caller.id}`, so a
//                    row does contain a pseudonymous auth user id, and
//                    rows are upserted rather than expired — 17 live. That
//                    is a retention question (no name, no case data, no org
//                    to scope a delete to), filed separately, not an
//                    erasure gap this button can address.
export const INFRASTRUCTURE_TABLES = ['api_rate_limits'];

// No org_id of their own, but a NOT NULL ON DELETE CASCADE foreign key to a
// parent that is INTENTIONALLY EXCLUDED — so their lifecycle correctly
// follows that parent, and "Delete all data" leaves both alone by the same
// contract. Distinct from CASCADE_COVERED_TABLES, whose parent IS deleted:
// conflating the two would claim erasure that does not happen.
//
//   calendar_synced_events  connection_id NOT NULL -> calendar_connections
//                           ON DELETE CASCADE (verified live 2026-10-02).
//                           Compass deadline <-> external calendar event id
//                           mappings; api/calendar/_disconnect.js relies on
//                           that same cascade. Disconnecting the integration
//                           removes them; 33 live rows.
export const PARENT_EXCLUDED_TABLES = ['calendar_synced_events'];

// Fossils: tables the application no longer uses, which must stay empty.
//
//   meetings_legacy_unused  the pre-Phase-4C.1 meeting store, renamed out of
//                           the way by supabase/standalone_meetings_
//                           2026-09-25.sql. 0 rows live (verified
//                           2026-10-02) and referenced by no application
//                           code — only by tests asserting it is not a rival
//                           store.
//
//                           It is classified here rather than as excluded
//                           because it is NOT safe if it ever fills up: it
//                           carries transcript, prep_pack, structured_record
//                           and outcome_letter columns, has no org_id, and
//                           its case_id -> cases cascade is NULLABLE — the
//                           precise defect shape that made standalone
//                           `meetings` need explicit deletion. So it cannot
//                           be erased per-organisation at all, and the only
//                           thing making that acceptable is that it holds
//                           nothing. That is an invariant, so it is checked
//                           rather than assumed: scripts/schema-drift-
//                           check.mjs fails if the row count is not zero.
//                           Dropping it is a schema change and belongs to
//                           its own ticket, not to this inventory.
export const UNUSED_LEGACY_TABLES = ['meetings_legacy_unused'];

// audit_log is its own case (org-scoped, but cleared and then immediately
// re-seeded with the deletion event itself by the handler) — listed here
// only so the completeness test can account for it without adding it to
// ORG_SCOPED_TABLES and changing the handler's loop behaviour.
export const SEPARATELY_HANDLED_TABLES = ['audit_log'];

// allKnownOrgScopedTables() USED TO LIVE HERE, and NEW-44 removed it rather
// than leaving it alongside allClassifiedTables() below. It returned the four
// org_id categories only, so after NEW-44 added four more it would answer
// "every table we know about" with a list missing organisations, profiles,
// platform_admins, api_rate_limits, calendar_synced_events and
// meetings_legacy_unused. A helper whose name promises completeness and
// quietly delivers a subset is the exact shape of the bug this ticket is
// about, and it had no callers left. Use allClassifiedTables().

// ─────────────────────────────────────────────────────────────────────────
// NEW-44 — the coverage rule, in code.
// ─────────────────────────────────────────────────────────────────────────

export const TABLE_CATEGORIES = {
  deleted: ORG_SCOPED_TABLES,
  cascade_covered: CASCADE_COVERED_TABLES,
  intentionally_excluded: INTENTIONALLY_EXCLUDED_TABLES,
  separately_handled: SEPARATELY_HANDLED_TABLES,
  platform_scoped: PLATFORM_SCOPED_TABLES,
  infrastructure: INFRASTRUCTURE_TABLES,
  parent_excluded: PARENT_EXCLUDED_TABLES,
  unused_legacy: UNUSED_LEGACY_TABLES,
};

export function allClassifiedTables() {
  return Object.values(TABLE_CATEGORIES).flat();
}

// Which category a table is in, or null if nobody has decided yet. null is the
// answer the gate is looking for: it means a table exists that no human has
// said anything about, which is how customer_contracts and team_invites came to
// sit in the live schema, unmentioned, for five weeks.
export function classifyTable(table) {
  const name = typeof table === 'string' ? table.toLowerCase() : '';
  for (const [category, tables] of Object.entries(TABLE_CATEGORIES)) {
    if (tables.includes(name)) return category;
  }
  return null;
}

// THE RELEVANCE RULE (NEW-44 §3), stated positively and narrowly:
//
//   a table is relevant iff it is a BASE TABLE in the `public` schema and is
//   not owned by a Postgres extension.
//
// Everything excluded is excluded by a property of the object, never by its
// name resembling infrastructure:
//
//   - other schemas. Postgres and Supabase keep their own machinery in auth,
//     storage, realtime, vault, extensions, graphql, cron, net, pg_catalog,
//     information_schema and supabase_migrations. Compass writes none of it,
//     cannot erase rows in auth.users through a tenant action, and must not
//     pretend to classify tables it does not own. Enumerated below so the test
//     can state them, but the implementation keys off `schema === 'public'` —
//     an unlisted schema appearing tomorrow is excluded by the rule, not by
//     whether somebody remembered to add it.
//   - views and materialised views. They hold no rows of their own; erasing the
//     base table erases what they show. Verified live on 2026-10-02: `public`
//     contains 43 relations and all 43 are ordinary tables, so this clause is
//     currently vacuous and exists to stay correct when it stops being.
//   - extension-owned tables, e.g. PostGIS's spatial_ref_sys, which arrive in
//     public without anyone choosing to put them there. Identified by
//     pg_depend/pg_extension membership rather than by a name pattern. None
//     exist in this project today (verified live, same query).
export const NON_RELEVANT_SCHEMAS = [
  'auth', 'storage', 'realtime', 'vault', 'extensions', 'graphql', 'graphql_public',
  'cron', 'net', 'pgsodium', 'pgbouncer', 'pg_catalog', 'information_schema',
  'supabase_migrations', 'supabase_functions',
];

export function isRelevantTable({ schema = 'public', kind = 'BASE TABLE', extension = null } = {}) {
  if (schema !== 'public') return false;
  if (extension) return false;
  return kind === 'BASE TABLE';
}

// Every relevant table nobody has classified. This is the gate's whole output,
// and the direction of the asymmetry is the point: an unclassified table is
// always reported, so the failure mode is a human being asked a question they
// have not answered — never a silent pass on a table that holds real records.
export function unclassifiedTables(tables = []) {
  return (Array.isArray(tables) ? tables : [])
    .filter(t => typeof t === 'string' && t)
    .map(t => t.toLowerCase())
    .filter(t => classifyTable(t) === null)
    .sort();
}
