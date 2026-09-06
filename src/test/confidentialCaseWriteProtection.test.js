import { describe, it, expect } from 'vitest';
import { hasConfidentialOversight } from '../lib/roles';

// Security remediation (2026-09-06) — regression coverage for the
// "HR Manager blind UPDATE/DELETE of confidential cases" finding closed by
// supabase/confidential_case_write_protection_2026-09-06.sql.
//
// Same approach as src/test/caseThemesSignalsAccess.test.js and siblings: a
// pure-JS mirror of the live SQL, unit-tested exhaustively, defined here
// only — not exported, not added to src/lib/roles.js or any production
// file. The database trigger remains the single authoritative security
// boundary; this file exists to make its intended behaviour checkable.
//
// IMPORTANT — this mirrors the TRIGGER's predicate, not `cases`' RLS
// UPDATE/DELETE policy. Those are deliberately different now: RLS still
// grants UPDATE/DELETE ownership access via can_see_all_org_cases(role) OR
// created_by OR owner_id OR case_access (unchanged — not touched by this
// remediation, per the approval's explicit "do not change the confidentiality
// SELECT policy / ownership model"). The new trigger below is what actually
// stops the blind-write class of attack; a test that only exercised the old
// RLS predicate would report the vulnerable behaviour as still "correct".

// Mirrors public.protect_confidential_case_write() exactly. Deliberately
// does NOT include owner_id: the live confidentiality SELECT policy
// ("Confidential cases restricted to authorised staff") only exempts
// created_by, case_access, and has_confidential_case_oversight(role) — never
// owner_id — and the whole point of this fix is WRITE AUTHORITY ⊆
// AUTHORITATIVE (confidentiality) VISIBILITY. Re-confirmed against live
// production pg_policies immediately before this migration was drafted.
function confidentialWriteAllowedByTrigger({ role, isCreator, hasCaseAccess, oldConfidential }) {
  if (oldConfidential !== true) return true; // trigger no-ops for ordinary rows
  if (isCreator) return true;
  if (hasCaseAccess) return true;
  return hasConfidentialOversight(role);
}

// public.block_auditor_write_cases fires independently and unconditionally
// for role === 'auditor' on INSERT/UPDATE/DELETE, regardless of
// confidentiality or any other condition. It is untouched by this
// remediation (still live, confirmed via information_schema.triggers
// immediately before drafting this migration) — modelled here only so the
// composed "effective" result below is honest about which trigger is doing
// the blocking, per the audit's own instruction not to conflate the two.
function auditorUnconditionallyBlocked(role) {
  return role === 'auditor';
}

// What actually happens on the live database once both triggers are
// installed: RLS's own ownership gate is assumed already passed (this test
// suite is only concerned with the confidentiality dimension, per the
// approved remediation's scope), then the auditor trigger runs, then the
// new confidentiality trigger runs. Either raising blocks the write.
function effectiveConfidentialWriteAllowed(actor) {
  if (auditorUnconditionallyBlocked(actor.role)) return false;
  return confidentialWriteAllowedByTrigger(actor);
}

const unrelated = { isCreator: false, hasCaseAccess: false };

describe('protect_confidential_case_write — UPDATE/DELETE on a confidential row', () => {
  it('HR Manager, unrelated confidential case: DENY', () => {
    expect(confidentialWriteAllowedByTrigger({ role: 'hr_manager', oldConfidential: true, ...unrelated })).toBe(false);
  });

  it('HR Manager, owner_id ONLY (no created_by/case_access): DENY — owner_id is not a confidentiality exemption', () => {
    // Modelled as "unrelated" from the trigger's point of view on purpose:
    // owner_id has no term in the trigger at all, mirroring the live
    // confidentiality SELECT policy exactly. An owner-only hr_manager is
    // indistinguishable from a fully unrelated one for this specific check.
    expect(confidentialWriteAllowedByTrigger({ role: 'hr_manager', oldConfidential: true, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('HR Manager, creator: ALLOW', () => {
    expect(confidentialWriteAllowedByTrigger({ role: 'hr_manager', oldConfidential: true, isCreator: true, hasCaseAccess: false })).toBe(true);
  });

  it('HR Manager, explicit case_access: ALLOW', () => {
    expect(confidentialWriteAllowedByTrigger({ role: 'hr_manager', oldConfidential: true, isCreator: false, hasCaseAccess: true })).toBe(true);
  });

  it('HR Director, unrelated confidential case: ALLOW (confidential-case oversight)', () => {
    expect(confidentialWriteAllowedByTrigger({ role: 'hr_director', oldConfidential: true, ...unrelated })).toBe(true);
  });

  it('Legal Reviewer, unrelated confidential case: ALLOW (confidential-case oversight)', () => {
    expect(confidentialWriteAllowedByTrigger({ role: 'legal_reviewer', oldConfidential: true, ...unrelated })).toBe(true);
  });

  it('Auditor: the confidentiality trigger alone would ALLOW (has_confidential_case_oversight includes auditor)...', () => {
    expect(confidentialWriteAllowedByTrigger({ role: 'auditor', oldConfidential: true, ...unrelated })).toBe(true);
  });

  it('...but the PRE-EXISTING, untouched auditor trigger blocks it regardless — effective result: DENY', () => {
    expect(effectiveConfidentialWriteAllowed({ role: 'auditor', oldConfidential: true, ...unrelated })).toBe(false);
  });

  it('ordinary (non-confidential) row: the new trigger never engages, for any role', () => {
    ['hr_manager', 'line_manager', 'location_manager', 'investigator'].forEach(role => {
      expect(confidentialWriteAllowedByTrigger({ role, oldConfidential: false, ...unrelated })).toBe(true);
    });
  });
});

describe('confidentiality transitions (OLD-row confidentiality is what gates the write, not NEW)', () => {
  it('ordinary -> ordinary: unaffected (trigger no-ops)', () => {
    expect(confidentialWriteAllowedByTrigger({ role: 'hr_manager', oldConfidential: false, ...unrelated })).toBe(true);
  });

  it('confidential -> confidential, unrelated HR Manager: DENY (cannot edit a confidential row it cannot see)', () => {
    expect(confidentialWriteAllowedByTrigger({ role: 'hr_manager', oldConfidential: true, ...unrelated })).toBe(false);
  });

  it('confidential -> ordinary, unrelated HR Manager: DENY (cannot blind-declassify a case it cannot see)', () => {
    // NEW.confidential is irrelevant to this trigger by design — only OLD
    // matters, so flipping confidential=false does not bypass the gate.
    expect(confidentialWriteAllowedByTrigger({ role: 'hr_manager', oldConfidential: true, ...unrelated })).toBe(false);
  });

  it('confidential -> ordinary, owner-only HR Manager: DENY (owner_id absent from the live SELECT confidentiality policy)', () => {
    expect(confidentialWriteAllowedByTrigger({ role: 'hr_manager', oldConfidential: true, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('confidential -> ordinary, creator HR Manager: ALLOW', () => {
    expect(confidentialWriteAllowedByTrigger({ role: 'hr_manager', oldConfidential: true, isCreator: true, hasCaseAccess: false })).toBe(true);
  });

  it('ordinary -> confidential is not this trigger\'s concern (unaffected — remains gated by the pre-existing protect_cases_hr_columns_trigger, untouched by this migration)', () => {
    // Documented, not asserted numerically here: this trigger only reads
    // OLD.confidential, so it imposes zero new restriction on who may mark
    // an already-fully-editable ordinary case confidential. That column is,
    // and remains, gated by is_hr_role via protect_cases_hr_columns_trigger.
    expect(confidentialWriteAllowedByTrigger({ role: 'hr_manager', oldConfidential: false, ...unrelated })).toBe(true);
  });
});

describe('cross-org and removed-member actors', () => {
  // Modelled by has_confidential_case_oversight() returning false for a
  // role string that does not resolve at all (no matching org_members row
  // — auth.uid() finds nothing for a cross-org or removed caller, so
  // `select role into v_role ... limit 1` leaves v_role NULL, and
  // has_confidential_case_oversight(NULL) is false).
  it('cross-org actor (no org_members row -> v_role is null): DENY', () => {
    expect(confidentialWriteAllowedByTrigger({ role: null, oldConfidential: true, ...unrelated })).toBe(false);
  });

  it('removed former member (no org_members row -> v_role is null): DENY', () => {
    expect(confidentialWriteAllowedByTrigger({ role: null, oldConfidential: true, ...unrelated })).toBe(false);
  });
});

describe('ordinary-case regression — this migration must not change ordinary-case behaviour', () => {
  it('every role continues to write ordinary (non-confidential) cases exactly as RLS ownership already allowed, unaffected by the new trigger', () => {
    ['hr_manager', 'hr_director', 'legal_reviewer', 'line_manager', 'location_manager', 'investigator'].forEach(role => {
      expect(confidentialWriteAllowedByTrigger({ role, oldConfidential: false, ...unrelated })).toBe(true);
    });
  });
});
