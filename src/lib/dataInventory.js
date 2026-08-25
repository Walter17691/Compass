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
export const ORG_SCOPED_TABLES = [
  'cases', 'starter_instances', 'dsar_requests', 'hr_review_requests', 'wellbeing_notes',
  'concern_referrals', 'leaver_instances', 'case_tasks', 'signing_requests', 'employee_records',
  'employee_portal_accounts', 'employee_portal_invites', 'case_views', 'improvement_initiatives',
  'manager_capability_insights', 'er_executive_briefs', 'org_events', 'integration_events',
  'organisation_themes',
];

// Tables with an org_id column that are NOT deleted directly, because a
// verified NOT NULL, ON DELETE CASCADE foreign key to `cases` (itself in
// ORG_SCOPED_TABLES above) already erases them the moment that handler's
// own `cases` delete runs. Listed explicitly, with each FK re-confirmed
// live, rather than left as an unstated assumption a future schema
// change could quietly invalidate — dataInventory.test.js keys off this
// exact list, so a schema change that drops one of these cascades (or
// makes case_id nullable) needs a human to update this file to notice.
export const CASCADE_COVERED_TABLES = ['allegations', 'case_signals', 'case_themes', 'case_access'];

// Tables with an org_id column that are deliberately left alone by
// "Delete all data" — org/account structure and integration config, not
// case or employee content. Deleting the organisation itself, removing
// teammates, or disconnecting calendar/mail integrations are different,
// much bigger actions than what this button has ever promised (see
// api/delete-org-data.js's own header comment).
export const INTENTIONALLY_EXCLUDED_TABLES = [
  'org_members', 'org_roles', 'locations', 'process_templates',
  'calendar_connections', 'graph_mail_connections',
];

// audit_log is its own case (org-scoped, but cleared and then immediately
// re-seeded with the deletion event itself by the handler) — listed here
// only so the completeness test can account for it without adding it to
// ORG_SCOPED_TABLES and changing the handler's loop behaviour.
export const SEPARATELY_HANDLED_TABLES = ['audit_log'];

export function allKnownOrgScopedTables() {
  return [...ORG_SCOPED_TABLES, ...CASCADE_COVERED_TABLES, ...INTENTIONALLY_EXCLUDED_TABLES, ...SEPARATELY_HANDLED_TABLES];
}
