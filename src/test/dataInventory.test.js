import { describe, it, expect } from 'vitest';
import { ORG_SCOPED_TABLES, CASCADE_COVERED_TABLES, INTENTIONALLY_EXCLUDED_TABLES, SEPARATELY_HANDLED_TABLES, allKnownOrgScopedTables } from '../lib/dataInventory.js';

// Phase 6.5 hardening (structural remediation, Prompt 12 — GDPR
// Ownership / DSAR / Erasure Completeness invariant). This is
// deliberately NOT a copy of dataInventory.js's own arrays (that would
// be exactly the self-referential test the independent audit flagged in
// api/delete-org-data.test.js's old ALL_TABLES constant) — it's an
// independently-authored snapshot of every table this project's live
// schema actually has an org_id column on, taken by directly querying
// information_schema.columns against the live Supabase project on
// 2026-08-25. If a future migration adds a new org-scoped table and
// nobody updates dataInventory.js, this test fails instead of the new
// table silently surviving "Delete all data" forever.
//
// This snapshot can go stale the same way the old hand-maintained list
// did — the durable fix is a live-schema CI check (Family 9, test
// infrastructure), not a hardcoded array. Until that exists, this is the
// enforcement mechanism: re-run the information_schema query below
// whenever a migration adds/removes a table, and update both this file
// and dataInventory.js together.
const LIVE_ORG_ID_TABLES_2026_08_25 = [
  'allegations', 'audit_log', 'calendar_connections', 'case_access', 'case_signals',
  'case_tasks', 'case_themes', 'case_views', 'cases', 'concern_referrals', 'dsar_requests',
  'employee_portal_accounts', 'employee_portal_invites', 'employee_records', 'er_executive_briefs',
  'graph_mail_connections', 'hr_review_requests', 'improvement_initiatives', 'integration_events',
  'leaver_instances', 'locations', 'manager_capability_insights', 'org_events', 'org_members',
  'org_roles', 'organisation_themes', 'process_templates', 'signing_requests', 'starter_instances',
  'wellbeing_notes',
  // redundancy_cases added 2026-08-27 (closes Prompt 16 audit finding H1)
  // — see supabase/redundancy_cases_2026-08-27.sql.
  'redundancy_cases',
];

describe('dataInventory — GDPR erasure completeness', () => {
  it('accounts for every org-scoped table the live schema actually has, one way or another', () => {
    const known = new Set(allKnownOrgScopedTables());
    const missing = LIVE_ORG_ID_TABLES_2026_08_25.filter(t => !known.has(t));
    expect(missing, `Table(s) with org_id found live but not in dataInventory.js: ${missing.join(', ')} — classify each as actively deleted, cascade-covered, or intentionally excluded.`).toEqual([]);
  });

  it('has no table listed in more than one category — an ambiguous classification is itself a bug', () => {
    const lists = [ORG_SCOPED_TABLES, CASCADE_COVERED_TABLES, INTENTIONALLY_EXCLUDED_TABLES, SEPARATELY_HANDLED_TABLES];
    const seen = new Map();
    for (const list of lists) {
      for (const table of list) {
        expect(seen.has(table), `"${table}" appears in more than one dataInventory category`).toBe(false);
        seen.set(table, true);
      }
    }
  });

  it('includes organisation_themes as actively erased — the gap the independent audit found', () => {
    expect(ORG_SCOPED_TABLES).toContain('organisation_themes');
  });

  it('does not redundantly re-delete case_access — verified cascade-covered by cases (NOT NULL, ON DELETE CASCADE) as of 2026-08-25', () => {
    expect(ORG_SCOPED_TABLES).not.toContain('case_access');
    expect(CASCADE_COVERED_TABLES).toContain('case_access');
  });

  it('includes redundancy_cases as actively erased — closes Prompt 16 audit finding H1 (previously local-only, not in any table at all)', () => {
    expect(ORG_SCOPED_TABLES).toContain('redundancy_cases');
  });
});
