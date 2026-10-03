// NEW-44 governance closure — structural tenancy, as a forward-looking rule.
//
// THE PROBLEM, FOUND BY THE D4.0 AUDIT. Three of the newest employee-linked
// tables declare tenancy in the SCHEMA:
//
//   meetings_employee_same_org_fkey             (employee_id, org_id)
//   employee_activities_employee_same_org_fkey  (employee_id, org_id)
//   employment_events_employee_same_org_fkey    (employee_id, org_id)
//                                                 -> employee_records(id, org_id)
//
// `cases` does not: cases_employee_id_fkey is single-column, and the boundary
// is held by the cases_employee_parentage_guard trigger plus
// reconcile_case_employee's own check. That is robust but not DECLARATIVE — the
// database would accept a cross-org pair if the trigger were ever dropped.
//
// ┌─ WHY THIS IS A RULE FOR NEW TABLES ONLY ────────────────────────────────┐
// │ Retrofitting `cases` is a migration with real blast radius and is        │
// │ explicitly out of scope. The point of this rule is narrower and more     │
// │ useful: a table added TOMORROW must not repeat the omission. The         │
// │ concrete case it exists for is D4's case_decisions, which must not be    │
// │ creatable with `case_id -> cases(id)` beside an unrelated `org_id`.      │
// │                                                                          │
// │ So legacy structures are ACCEPTED BY NAME, with the compensating control │
// │ recorded. An accepted exception is a decision; an unlisted one is a bug. │
// └─────────────────────────────────────────────────────────────────────────┘

// A table is subject to the rule when it carries org_id AND a tenant-scoped
// parent reference (employee_id or a case reference). Those are the shapes
// where "same organisation" is an invariant the schema can express.
export const TENANCY_PARENTS = Object.freeze({
  employee_id: 'employee_records',
  case_id: 'cases',
  linked_case_id: 'cases',
});

// Pre-existing single-column references, accepted with their compensating
// control stated. Adding to this list is a deliberate act and should be rare;
// the reason field is what makes it reviewable.
export const LEGACY_SINGLE_COLUMN_REFERENCES = Object.freeze({
  'cases.employee_id':
    'Historical. Same-org enforced by the cases_employee_parentage_guard trigger (verified live: raises '
    + 'on an org mismatch, blocks clearing employee_id, and blocks UUID->UUID outside the audited '
    + 'correction) and again inside reconcile_case_employee. Retrofitting the composite FK needs '
    + 'UNIQUE(id, org_id) on employee_records (which exists) plus a migration on 2,960 rows — out of '
    + 'NEW-44 scope by instruction.',
  // Found by this very rule when it was first run — meetings declares tenancy
  // structurally for its EMPLOYEE parent but not for its CASE parent. Accepted
  // because the compensating control is unusually strong and was read live
  // rather than assumed: meetings_parentage_guard raises
  // "Cannot link meeting % (org %) to a case in a different organisation"
  // on the only transition that can set case_id, and additionally forbids
  // creating a meeting already case-linked, moving a meeting between
  // organisations, moving it between cases, returning it to standalone, and
  // linking a meeting about one employee to a case about a different employee.
  // A composite FK would enforce less than this trigger does.
  'meetings.case_id':
    'Single-column by design. meetings_parentage_guard enforces same-org on the case link explicitly '
    + '(verified live 2026-10-03: it raises on target_org <> new.org_id), forbids creation while already '
    + 'case-linked, forbids moving between organisations or cases, forbids un-linking, and forbids '
    + 'linking a meeting about one employee to a case about another. case_id is also NULLABLE by design '
    + 'for standalone meetings, which a NOT NULL composite parentage FK would forbid outright.',
  'concern_referrals.employee_id':
    'Historical. ON DELETE RESTRICT to employee_records; referrals are created through a path that '
    + 'resolves the employee via findEmployeeById within the acting org.',
  'concern_referrals.linked_case_id':
    'Historical. ON DELETE SET NULL — a referral survives its case, so this is a soft link rather than '
    + 'a parentage claim.',
  'dsar_requests.employee_id':
    'Historical. ON DELETE RESTRICT; DSAR requests are created in the acting organisation only.',
  'wellbeing_notes.employee_id':
    'Historical. ON DELETE RESTRICT; notes are written in the acting organisation only.',
  'audit_log.employee_id':
    'Historical. ON DELETE SET NULL. The audit row is deliberately resilient to its subject being '
    + 'deleted, so a composite parentage FK would be the wrong shape here.',
  'audit_log.case_id':
    'Historical. ON DELETE SET NULL, for the same reason — an audit row must outlive its case.',
  'case_access.case_id':
    'Historical. NOT NULL ON DELETE CASCADE to cases; case_access has no independent org_id semantics '
    + 'of its own beyond the case it grants access to.',
  'allegations.case_id': 'Historical. NOT NULL ON DELETE CASCADE to cases.',
  'case_signals.case_id': 'Historical. NOT NULL ON DELETE CASCADE to cases.',
  'case_themes.case_id': 'Historical. NOT NULL ON DELETE CASCADE to cases.',
  'case_tasks.case_id': 'Historical. NULLABLE (org-level actions carry no case) ON DELETE CASCADE.',
  'case_views.case_id': 'Historical. Plain uuid columns, no FK at all — see api/delete-org-data.js.',
  'hr_review_requests.case_id': 'Historical. ON DELETE CASCADE to cases.',
  'meetings_legacy_unused.case_id':
    'A fossil holding zero rows, kept only so the 4C.1 migration can be rolled back. Classified '
    + 'unused_legacy; its emptiness is asserted by the drift command.',
});

// Does this foreign key express same-org parentage? True when the FK is
// composite over (<ref column>, org_id) against the parent's (id, org_id).
export function isSameOrgComposite(fk) {
  const cols = (fk.columns || []).map(c => c.toLowerCase());
  return cols.includes('org_id') && cols.some(c => c !== 'org_id' && c in TENANCY_PARENTS);
}

// Every table/column that should carry a same-org composite FK and does not,
// excluding the accepted legacy list.
//
// `tables` is [{ name, columns: [...] }] and `foreignKeys` is
// [{ table, columns: [...], parent }] — both read from the live schema or
// supplied as a fixture, so this function performs no introspection of its own.
export function tenancyViolations(tables = [], foreignKeys = [], legacy = LEGACY_SINGLE_COLUMN_REFERENCES) {
  const violations = [];
  for (const table of tables) {
    const cols = (table.columns || []).map(c => c.toLowerCase());
    if (!cols.includes('org_id')) continue;            // no tenant column: rule does not apply
    for (const refCol of Object.keys(TENANCY_PARENTS)) {
      if (!cols.includes(refCol)) continue;
      const key = `${table.name}.${refCol}`;
      if (legacy[key]) continue;                        // accepted, with a recorded reason
      const covering = foreignKeys.filter(
        fk => fk.table === table.name && (fk.columns || []).map(c => c.toLowerCase()).includes(refCol),
      );
      if (!covering.some(isSameOrgComposite)) {
        violations.push({
          table: table.name,
          column: refCol,
          expectedParent: TENANCY_PARENTS[refCol],
          why: `${key} is tenant-scoped but has no same-org composite foreign key. `
            + `Declare it as (${refCol}, org_id) -> ${TENANCY_PARENTS[refCol]}(id, org_id), or add it to `
            + `LEGACY_SINGLE_COLUMN_REFERENCES with the compensating control. A bare `
            + `${refCol} -> ${TENANCY_PARENTS[refCol]}(id) beside an unrelated org_id permits a `
            + `cross-organisation row.`,
        });
      }
    }
  }
  return violations;
}
