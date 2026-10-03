import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  TABLE_CLASSIFICATION, DATA_CLASS, DSAR_DISPOSITION, SECURITY_POSTURE,
  RECORDED_RLS_2026_10_03, SERVICE_ROLE_ONLY_TABLES, postureFor, serviceRoleReasonFor,
  classificationFor, tablesWithDataClass,
} from '../lib/dataClassification.js';
import { DSAR_SUBJECT_SOURCES } from '../lib/dsarCompile.js';
import {
  tenancyViolations, isSameOrgComposite, LEGACY_SINGLE_COLUMN_REFERENCES, TENANCY_PARENTS,
} from '../lib/schemaGovernance.js';
import {
  computeInventoryFingerprint, VERIFIED_INVENTORY_FINGERPRINT, inventoryVerified,
  inventoryCanonicalForm, fingerprint,
} from '../lib/inventoryFingerprint.js';
import { ORG_SCOPED_TABLES } from '../lib/dataInventory.js';

// ─────────────────────────────────────────────────────────────────────────
// NEW-44 GOVERNANCE CLOSURE.
//
// The audit verified by hand that 28 tables classified `dsar: included`
// correspond exactly to the 28 inputs compileSubjectData consumes. Finding it
// correct was good news about the data and bad news about the process: a hand
// check cannot stop either side drifting. These tests turn each remaining
// hand-verified property into an enforced one.
//
// NO DISCLOSURE BEHAVIOUR IS CHANGED HERE. Wave 0's employee-facing/internal
// split, MEETING_WITHHELD_INTERNAL, the advisorNotes/riskScore/reviewDraft
// withholding, letter draft-vs-issued semantics and the human-review flags are
// all untouched — asserted at the end of this file.
// ─────────────────────────────────────────────────────────────────────────

// ── 1. DSAR classification ⟺ implementation, in BOTH directions ──
describe('NEW-44 — the DSAR invariant', () => {
  // Side (1): read the compiler's ACTUAL destructured parameter names out of
  // its own source. This is what makes the invariant derived rather than two
  // hand-maintained arrays facing each other.
  const NON_SOURCE_PARAMS = ['canonicalEmployeeId', 'meetingFetchFailed'];
  const compilerSignatureParams = () => {
    const src = readFileSync('src/lib/dsarCompile.js', 'utf8');
    const start = src.indexOf('export function compileSubjectData');
    expect(start, 'compileSubjectData not found — the parse target moved').toBeGreaterThan(-1);
    const sig = src.slice(start, src.indexOf(') {', start));
    return [...sig.matchAll(/([a-zA-Z][a-zA-Z0-9]*)\s*=\s*(?:\[\]|false|null)/g)]
      .map(m => m[1])
      .filter(p => !NON_SOURCE_PARAMS.includes(p));
  };

  it('the manifest describes exactly the parameters the function actually declares', () => {
    const fromSource = [...new Set(compilerSignatureParams())].sort();
    const fromManifest = Object.keys(DSAR_SUBJECT_SOURCES).sort();
    expect(
      fromManifest,
      'DSAR_SUBJECT_SOURCES has drifted from compileSubjectData\'s signature. '
      + 'Add or remove the entry, and decide the table\'s dsar disposition at the same time.',
    ).toEqual(fromSource);
  });

  it('A. a table classified dsar:included MUST be wired into the compiler', () => {
    const included = Object.entries(TABLE_CLASSIFICATION)
      .filter(([, m]) => m.dsar === DSAR_DISPOSITION.INCLUDED).map(([n]) => n).sort();
    const wired = new Set(Object.values(DSAR_SUBJECT_SOURCES));
    const classifiedButNotRead = included.filter(t => !wired.has(t));
    expect(
      classifiedButNotRead,
      `Classified dsar:included but NOT read by compileSubjectData: ${classifiedButNotRead.join(', ')}. `
      + `Either wire it in, or classify it included_not_wired with a defect reference — do not leave a `
      + `disclosure obligation that no code performs.`,
    ).toEqual([]);
  });

  it('B. a table the compiler consumes MUST be classified dsar:included', () => {
    const wired = [...new Set(Object.values(DSAR_SUBJECT_SOURCES))].sort();
    const readButNotIncluded = wired.filter(
      t => classificationFor(t)?.dsar !== DSAR_DISPOSITION.INCLUDED,
    );
    expect(
      readButNotIncluded,
      `Read by compileSubjectData but not classified dsar:included: ${readButNotIncluded.join(', ')}.`,
    ).toEqual([]);
  });

  it('every compiler source names a table that actually exists in the classification', () => {
    for (const [param, table] of Object.entries(DSAR_SUBJECT_SOURCES)) {
      expect(classificationFor(table), `${param} -> ${table} is not a classified table`).toBeTruthy();
    }
  });

  it('included_not_wired is NOT treated as included, and still owns its defect', () => {
    // team_invites is the one accepted-but-unimplemented obligation. It must
    // satisfy neither direction of the invariant above: not in the compiler,
    // and not counted as discharged.
    const meta = classificationFor('team_invites');
    expect(meta.dsar).toBe(DSAR_DISPOSITION.INCLUDED_NOT_WIRED);
    expect(meta.dsar).not.toBe(DSAR_DISPOSITION.INCLUDED);
    expect(Object.values(DSAR_SUBJECT_SOURCES)).not.toContain('team_invites');
    expect(meta.dsarDefect, 'NEW-45 must keep ownership of this gap').toBe('NEW-45');
  });

  it('the counts the audit verified by hand are now locked', () => {
    const included = Object.values(TABLE_CLASSIFICATION)
      .filter(m => m.dsar === DSAR_DISPOSITION.INCLUDED).length;
    expect(included).toBe(28);
    expect(new Set(Object.values(DSAR_SUBJECT_SOURCES)).size).toBe(28);
  });
});

// ── 1b. api/portal/_dsar-lookup.js — the second list, kept but tied down ──
//
// WHY IT IS NOT DERIVED. The lookup pre-fetches the tables the DSAR compiler
// needs but a CLIENT cannot read for a subject other than itself. That sounds
// like "the zero-policy tables", and it is not: three of its six
// (org_members, case_views, profiles) DO have policies — policies that scope a
// user to their OWN row, which is exactly why another person's row has to be
// fetched server-side with the service-role key. The criterion is "no
// client-reachable path to ANOTHER subject's row", which policy COUNT cannot
// express and which no metadata in this repository currently encodes.
//
// So the list stays, and is pinned instead: every table it fetches must be a
// genuine DSAR source, and nothing it fetches may be unclassified. That stops
// the real risk — the lookup quietly growing a table that disclosure never
// declared, or fetching one classified as withheld.
describe('NEW-44 — the portal DSAR lookup cannot drift from the classification', () => {
  const lookupTables = () => {
    const src = readFileSync('api/portal/_dsar-lookup.js', 'utf8');
    return [...new Set([...src.matchAll(/`([a-z_]+)\?/g)].map(m => m[1]))].sort();
  };

  it('fetches exactly the six tables the audit found, and no more', () => {
    expect(lookupTables()).toEqual([
      'case_views', 'employee_portal_accounts', 'employee_portal_invites',
      'org_members', 'profiles', 'signing_requests',
    ]);
  });

  it('every table it fetches is a declared DSAR source', () => {
    const sources = new Set(Object.values(DSAR_SUBJECT_SOURCES));
    const notDeclared = lookupTables().filter(t => !sources.has(t));
    expect(
      notDeclared,
      `_dsar-lookup.js fetches ${notDeclared.join(', ')}, which compileSubjectData does not declare as a `
      + `DSAR source. Either declare it or stop fetching it — do not disclose from an undeclared table.`,
    ).toEqual([]);
  });

  it('every table it fetches is classified dsar:included — never withheld', () => {
    for (const table of lookupTables()) {
      expect(classificationFor(table)?.dsar, `${table} is fetched for DSAR`).toBe(DSAR_DISPOSITION.INCLUDED);
    }
  });

  it('it does NOT fetch team_invites — NEW-45 still owns that gap', () => {
    // Guards against "fixing" NEW-45 accidentally here, which would broaden
    // disclosure scope in a slice that is explicitly not allowed to.
    expect(lookupTables()).not.toContain('team_invites');
  });

  it('the criterion genuinely is not policy count — proven, not asserted', () => {
    // Three have policies, three do not. If someone later tries to derive this
    // list from SERVICE_ROLE_ONLY_TABLES, this test says why that is wrong.
    const withPolicies = lookupTables().filter(t => RECORDED_RLS_2026_10_03[t].policies > 0);
    const without = lookupTables().filter(t => RECORDED_RLS_2026_10_03[t].policies === 0);
    expect(withPolicies.sort()).toEqual(['case_views', 'org_members', 'profiles']);
    expect(without.sort()).toEqual(['employee_portal_accounts', 'employee_portal_invites', 'signing_requests']);
  });
});

// ── 2. zero-policy / service-role-only posture ──
describe('NEW-44 — security posture is declared, not inferred', () => {
  it('every RLS-enabled table with zero policies declares service-role-only intent WITH a reason', () => {
    const undeclared = [];
    for (const [table, rls] of Object.entries(RECORDED_RLS_2026_10_03)) {
      if (!rls.rls || rls.policies > 0) continue;
      if (postureFor(table) !== SECURITY_POSTURE.SERVICE_ROLE_ONLY) { undeclared.push(table); continue; }
      const reason = serviceRoleReasonFor(table);
      if (!reason || reason.trim().length < 20) undeclared.push(table);
    }
    expect(
      undeclared,
      `RLS enabled, zero policies, no declared intent: ${undeclared.join(', ')}. `
      + `Declare it in SERVICE_ROLE_ONLY_TABLES with a reason — do NOT add a client policy to pass this test.`,
    ).toEqual([]);
  });

  it('declares exactly the ten zero-policy tables, including the four the audit found undocumented', () => {
    const zeroPolicy = Object.entries(RECORDED_RLS_2026_10_03)
      .filter(([, r]) => r.rls && r.policies === 0).map(([t]) => t).sort();
    expect(zeroPolicy).toHaveLength(10);
    expect(Object.keys(SERVICE_ROLE_ONLY_TABLES).sort()).toEqual(zeroPolicy);
    for (const table of ['customer_contracts', 'team_invites', 'platform_admins', 'graph_mail_connections']) {
      expect(serviceRoleReasonFor(table), `${table} was the point of this slice`).toBeTruthy();
    }
  });

  it('does not claim service-role-only for a table that actually has policies', () => {
    for (const table of Object.keys(SERVICE_ROLE_ONLY_TABLES)) {
      expect(RECORDED_RLS_2026_10_03[table]?.policies, `${table} declares deny-all but has policies`).toBe(0);
    }
  });

  it('platform_admins deny-all is recorded as load-bearing for platform isolation', () => {
    expect(serviceRoleReasonFor('platform_admins')).toMatch(/platform-admin isolation/i);
  });
});

// ── 3. RLS presence ──
describe('NEW-44 — customer-data tables cannot silently lose RLS', () => {
  it('every customer-data table has RLS enabled', () => {
    const without = tablesWithDataClass(DATA_CLASS.CUSTOMER)
      .filter(t => RECORDED_RLS_2026_10_03[t] && RECORDED_RLS_2026_10_03[t].rls !== true);
    expect(without, `Customer-data tables with RLS disabled: ${without.join(', ')}`).toEqual([]);
  });

  it('every classified table appears in the RLS reading — no table escapes the check', () => {
    const missing = Object.keys(TABLE_CLASSIFICATION).filter(t => !RECORDED_RLS_2026_10_03[t]);
    expect(missing, `Classified but absent from the RLS reading: ${missing.join(', ')}`).toEqual([]);
  });

  it('RLS is enabled on all 43 tables, as measured', () => {
    const enabled = Object.values(RECORDED_RLS_2026_10_03).filter(r => r.rls).length;
    expect(Object.keys(RECORDED_RLS_2026_10_03)).toHaveLength(43);
    expect(enabled).toBe(43);
  });

  it('RLS alone is not treated as sufficient — posture is a separate declaration', () => {
    // Stated as a test so the two concepts cannot be collapsed later: RLS
    // enabled with zero policies is a different fact from RLS with policies.
    expect(postureFor('signing_requests')).toBe(SECURITY_POSTURE.SERVICE_ROLE_ONLY);
    expect(postureFor('cases')).toBe(SECURITY_POSTURE.POLICIES);
    expect(RECORDED_RLS_2026_10_03.signing_requests.rls).toBe(true);
  });
});

// ── 4. structural same-org tenancy, for NEW tables ──
describe('NEW-44 — structural tenancy rule', () => {
  // The live schema shape, read 2026-10-03.
  const liveTables = [
    { name: 'cases', columns: ['id', 'org_id', 'employee_id', 'location_id'] },
    { name: 'meetings', columns: ['id', 'org_id', 'employee_id', 'case_id'] },
    { name: 'employee_activities', columns: ['id', 'org_id', 'employee_id', 'location_id'] },
    { name: 'employee_employment_events', columns: ['id', 'org_id', 'employee_id'] },
    { name: 'concern_referrals', columns: ['id', 'org_id', 'employee_id', 'linked_case_id'] },
    { name: 'dsar_requests', columns: ['id', 'org_id', 'employee_id'] },
    { name: 'wellbeing_notes', columns: ['id', 'org_id', 'employee_id'] },
    { name: 'audit_log', columns: ['id', 'org_id', 'employee_id', 'case_id'] },
    { name: 'allegations', columns: ['id', 'org_id', 'case_id'] },
    { name: 'case_signals', columns: ['id', 'org_id', 'case_id'] },
    { name: 'case_themes', columns: ['id', 'org_id', 'case_id', 'theme_id'] },
    { name: 'case_tasks', columns: ['id', 'org_id', 'case_id'] },
    { name: 'case_views', columns: ['id', 'org_id', 'case_id'] },
    { name: 'case_access', columns: ['id', 'org_id', 'case_id'] },
    { name: 'hr_review_requests', columns: ['id', 'org_id', 'case_id'] },
    { name: 'employee_records', columns: ['id', 'org_id', 'location_id'] },
  ];
  const liveFks = [
    { table: 'meetings', columns: ['employee_id', 'org_id'], parent: 'employee_records' },
    { table: 'employee_activities', columns: ['employee_id', 'org_id'], parent: 'employee_records' },
    { table: 'employee_employment_events', columns: ['employee_id', 'org_id'], parent: 'employee_records' },
    { table: 'cases', columns: ['employee_id'], parent: 'employee_records' },
    { table: 'concern_referrals', columns: ['employee_id'], parent: 'employee_records' },
    { table: 'dsar_requests', columns: ['employee_id'], parent: 'employee_records' },
    { table: 'wellbeing_notes', columns: ['employee_id'], parent: 'employee_records' },
    { table: 'audit_log', columns: ['employee_id'], parent: 'employee_records' },
    { table: 'audit_log', columns: ['case_id'], parent: 'cases' },
    { table: 'allegations', columns: ['case_id'], parent: 'cases' },
    { table: 'case_signals', columns: ['case_id'], parent: 'cases' },
    { table: 'case_themes', columns: ['case_id'], parent: 'cases' },
    { table: 'case_tasks', columns: ['case_id'], parent: 'cases' },
    { table: 'case_access', columns: ['case_id'], parent: 'cases' },
    { table: 'hr_review_requests', columns: ['case_id'], parent: 'cases' },
    { table: 'concern_referrals', columns: ['linked_case_id'], parent: 'cases' },
    { table: 'meetings', columns: ['case_id'], parent: 'cases' },
  ];

  it('the live schema has no UNACCEPTED tenancy violation', () => {
    const violations = tenancyViolations(liveTables, liveFks);
    expect(
      violations.map(v => `${v.table}.${v.column}`),
      'Unaccepted single-column tenant reference(s) found',
    ).toEqual([]);
  });

  it('recognises the three tables that already declare tenancy structurally', () => {
    for (const table of ['meetings', 'employee_activities', 'employee_employment_events']) {
      const fk = liveFks.find(f => f.table === table && f.columns.includes('employee_id'));
      expect(isSameOrgComposite(fk), `${table} should be composite`).toBe(true);
    }
  });

  it('cases.employee_id is an ACCEPTED legacy exception with its compensating control recorded', () => {
    const reason = LEGACY_SINGLE_COLUMN_REFERENCES['cases.employee_id'];
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/cases_employee_parentage_guard/);
    expect(reason).toMatch(/out of\s+NEW-44 scope/i);
    // and it is genuinely still single-column — this slice did not retrofit it
    const fk = liveFks.find(f => f.table === 'cases' && f.columns.includes('employee_id'));
    expect(isSameOrgComposite(fk)).toBe(false);
  });

  it('every accepted legacy exception states a non-empty reason', () => {
    for (const [key, reason] of Object.entries(LEGACY_SINGLE_COLUMN_REFERENCES)) {
      expect(typeof reason === 'string' && reason.trim().length > 30, `${key} has no real reason`).toBe(true);
    }
  });

  it('CATCHES a new org_id + employee_id table with only a single-column FK', () => {
    const tables = [...liveTables, { name: 'new_employee_thing', columns: ['id', 'org_id', 'employee_id'] }];
    const fks = [...liveFks, { table: 'new_employee_thing', columns: ['employee_id'], parent: 'employee_records' }];
    const v = tenancyViolations(tables, fks);
    expect(v).toHaveLength(1);
    expect(v[0].table).toBe('new_employee_thing');
    expect(v[0].why).toMatch(/cross-organisation row/);
  });

  it('CATCHES a new org_id + case_id table with only a single-column FK — the case_decisions shape', () => {
    const tables = [...liveTables, { name: 'case_decisions', columns: ['id', 'org_id', 'case_id'] }];
    const fks = [...liveFks, { table: 'case_decisions', columns: ['case_id'], parent: 'cases' }];
    const v = tenancyViolations(tables, fks);
    expect(v).toHaveLength(1);
    expect(v[0].table).toBe('case_decisions');
    expect(v[0].expectedParent).toBe('cases');
    // …and the composite form passes.
    const fixed = [...liveFks, { table: 'case_decisions', columns: ['case_id', 'org_id'], parent: 'cases' }];
    expect(tenancyViolations(tables, fixed)).toEqual([]);
  });

  it('does not apply the rule to a table with no org_id', () => {
    const tables = [...liveTables, { name: 'no_tenant_col', columns: ['id', 'case_id'] }];
    expect(tenancyViolations(tables, liveFks)).toEqual([]);
  });

  it('every tenancy parent is a real classified table', () => {
    for (const parent of Object.values(TENANCY_PARENTS)) {
      expect(classificationFor(parent), `${parent} is not classified`).toBeTruthy();
    }
  });
});

// ── 5. the fail-closed attestation ──
describe('NEW-44 — Delete all data refuses an unverified inventory', () => {
  it('the committed fingerprint matches the inventory being shipped', () => {
    expect(
      computeInventoryFingerprint(),
      'The inventory changed without the attestation being refreshed. Run the suite, then '
      + '`node scripts/inventory-fingerprint.mjs --write`.',
    ).toBe(VERIFIED_INVENTORY_FINGERPRINT);
    expect(inventoryVerified()).toBe(true);
  });

  it('the canonical form covers DELETION ORDER, not just membership', () => {
    // The ordering defect NEW-44's second pass found must invalidate the
    // attestation, so a reordered list has to produce a different fingerprint.
    const current = inventoryCanonicalForm();
    const reordered = current.replace(
      `ORDER=${ORG_SCOPED_TABLES.join(',')}`,
      `ORDER=${ORG_SCOPED_TABLES.filter(t => t !== 'meetings').concat('meetings').join(',')}`,
    );
    expect(reordered).not.toBe(current);
    expect(fingerprint(reordered)).not.toBe(fingerprint(current));
  });

  it('the canonical form covers DSAR disposition and data class', () => {
    const current = inventoryCanonicalForm();
    expect(fingerprint(current.replace('|included|', '|internal_withheld|'))).not.toBe(fingerprint(current));
    expect(fingerprint(current.replace('|customer|', '|infrastructure|'))).not.toBe(fingerprint(current));
  });

  it('the handler refuses BEFORE deleting, and only after authorisation', () => {
    const src = readFileSync('api/delete-org-data.js', 'utf8');
    const refusal = src.indexOf('if (!inventoryVerified())');
    const loop = src.indexOf('for (const table of ORG_SCOPED_TABLES)');
    const authz = src.indexOf("Only an HR Director can delete all organisation data");
    expect(refusal).toBeGreaterThan(-1);
    expect(refusal, 'the refusal must precede the deletion loop').toBeLessThan(loop);
    expect(refusal, 'the refusal must come after authorisation, so it leaks no build state').toBeGreaterThan(authz);
  });

  it('adds NO schema query to the destructive path, and no dynamic table discovery', () => {
    const src = readFileSync('api/delete-org-data.js', 'utf8');
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/information_schema|pg_class|pg_catalog/);
    expect(code).not.toMatch(/jsonb_object_keys|relkind/);
    // the loop still iterates the CLASSIFIED list and nothing else
    expect(code).toContain('for (const table of ORG_SCOPED_TABLES)');
  });

  it('existing partial-failure behaviour and audit re-seeding are untouched', () => {
    const src = readFileSync('api/delete-org-data.js', 'utf8');
    expect(src).toContain('failedTables');
    expect(src).toMatch(/Deletion PARTIALLY FAILED for/);
    expect(src).toContain("action: 'Organisation data deleted'");
    // audit_log is still cleared separately, after the loop
    expect(src.indexOf('audit_log?org_id=eq.')).toBeGreaterThan(src.indexOf('for (const table of ORG_SCOPED_TABLES)'));
  });

  it('fails CLOSED if the fingerprint cannot be computed at all', () => {
    // inventoryVerified swallows and returns false rather than throwing into
    // the handler, where an exception would surface as a generic 500 and be
    // indistinguishable from a transport failure.
    const src = readFileSync('src/lib/inventoryFingerprint.js', 'utf8');
    expect(src).toMatch(/catch\s*{\s*return false;/);
  });
});

// ── 6. Wave 0 and disclosure policy are untouched ──
describe('NEW-44 — no disclosure behaviour changed', () => {
  it('the employee-facing/internal meeting split is intact', () => {
    const src = readFileSync('src/lib/dsarCaseDisclosure.js', 'utf8');
    expect(src).toContain('MEETING_WITHHELD_INTERNAL');
    for (const field of ['riskScore', 'risk', 'prediction', 'advisorNotes', 'reviewDraft']) {
      expect(src, `${field} must still be withheld`).toContain(field);
    }
  });

  it('the compiler still fails closed on unestablished identity', () => {
    const src = readFileSync('src/lib/dsarCompile.js', 'utf8');
    expect(src).toContain('classifyIdentityByName');
    const records = readFileSync('src/lib/employeeRecords.js', 'utf8');
    expect(records).toContain('export function identityRequiresReconciliation');
    expect(records).toMatch(/IDENTITY\.AMBIGUOUS \|\| status === IDENTITY\.UNRECONCILED/);
  });

  it('the manifest added no behaviour — it is a frozen constant only', () => {
    const src = readFileSync('src/lib/dsarCompile.js', 'utf8');
    expect(src).toContain('export const DSAR_SUBJECT_SOURCES = Object.freeze({');
    // it is not consulted by the compiler itself; it describes it
    const body = src.slice(src.indexOf('export function compileSubjectData'));
    expect(body).not.toContain('DSAR_SUBJECT_SOURCES');
  });

  it('case_themes keeps the classification the audit found — unchanged pending a policy decision', () => {
    expect(classificationFor('case_themes').dsar).toBe(DSAR_DISPOSITION.INTERNAL_WITHHELD);
    expect(classificationFor('case_themes').dsarNote).toMatch(/Flagged for review/);
  });
});
