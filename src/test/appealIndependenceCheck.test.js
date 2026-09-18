import { describe, it, expect } from 'vitest';

// Appeal Independence P1 (2026-09-18) — regression coverage for
// appoint_appeal_manager()'s replaced independence check in
// supabase/appeal_independence_decision_maker_2026-09-18.sql.
//
// Same approach as src/test/appealTextWriteProtection.test.js and
// src/test/outcomeMetadataWriteProtection.test.js: a pure-JS mirror of the
// live SQL, unit-tested exhaustively, defined here only — not exported,
// not added to any production file. The database function itself remains
// the single authoritative security boundary.
//
// Mirrors v_has_conflict / v_has_known_attribution / the three-way
// CONFLICT / UNKNOWN / CLEAR branching, and the surrounding HR-only +
// org-membership + mandatory-override-reason gating, exactly.

// v_has_conflict: (v_case.disciplinary_decided_by IS NOT NULL AND = p_user_id)
// OR EXISTS(allegations where decided_by = p_user_id). Deliberately uses
// `!= null` (not `=== proposedUserId` alone) to mirror the SQL's explicit
// `IS NOT NULL AND` guard against NULL-propagation.
function hasConflict({ allegationsDecidedBy = [], disciplinaryDecidedBy = null, proposedUserId }) {
  const allegationConflict = allegationsDecidedBy.some(id => id != null && id === proposedUserId);
  const outcomeConflict = disciplinaryDecidedBy != null && disciplinaryDecidedBy === proposedUserId;
  return allegationConflict || outcomeConflict;
}

// v_has_known_attribution: (disciplinary_decided_by IS NOT NULL) OR
// EXISTS(allegations where decided_by IS NOT NULL) — independent of
// whether either value matches the proposed appointee.
function hasKnownAttribution({ allegationsDecidedBy = [], disciplinaryDecidedBy = null }) {
  return disciplinaryDecidedBy != null || allegationsDecidedBy.some(id => id != null);
}

function classifyIndependence({ allegationsDecidedBy = [], disciplinaryDecidedBy = null, proposedUserId }) {
  if (hasConflict({ allegationsDecidedBy, disciplinaryDecidedBy, proposedUserId })) return 'CONFLICT';
  if (!hasKnownAttribution({ allegationsDecidedBy, disciplinaryDecidedBy })) return 'UNKNOWN';
  return 'CLEAR';
}

// Mirrors appoint_appeal_manager()'s full gate: HR-only, same-org
// appointee, then the three-way classification, then the mandatory-
// reason requirement for CONFLICT/UNKNOWN, then the resulting audit
// action string (matching log_audit_event's own reserved-action list in
// the same migration).
function attemptAppointAppealManager({ isHR, sameOrgAppointee, classification, overrideReason }) {
  if (!isHR) return { ok: false, error: 'NOT_HR' };
  if (!sameOrgAppointee) return { ok: false, error: 'APPOINTEE_NOT_MEMBER' };
  const reasonProvided = !!(overrideReason && overrideReason.trim());
  if (classification === 'CONFLICT' && !reasonProvided) return { ok: false, error: 'INDEPENDENCE_CONFLICT' };
  if (classification === 'UNKNOWN' && !reasonProvided) return { ok: false, error: 'INDEPENDENCE_UNKNOWN' };
  const auditAction =
    classification === 'CONFLICT' ? 'Appeal officer appointed despite independence conflict' :
    classification === 'UNKNOWN' ? 'Appeal officer appointed without verified independence (legacy case)' :
    'Appeal officer appointed';
  return { ok: true, auditAction, overrideReasonRecorded: reasonProvided ? overrideReason.trim() : null };
}

describe('classifyIndependence — three-way CONFLICT / UNKNOWN / CLEAR', () => {
  it('outcome-pathway conflict: proposed officer matches cases.disciplinary_decided_by', () => {
    expect(classifyIndependence({ disciplinaryDecidedBy: 'walter', proposedUserId: 'walter' })).toBe('CONFLICT');
  });

  it('allegations-pathway conflict: proposed officer matches an allegations.decided_by row', () => {
    expect(classifyIndependence({ allegationsDecidedBy: ['alex', 'walter'], proposedUserId: 'walter' })).toBe('CONFLICT');
  });

  it('both pathways populated, only one matches: still CONFLICT (OR, not AND)', () => {
    expect(classifyIndependence({ allegationsDecidedBy: ['alex'], disciplinaryDecidedBy: 'walter', proposedUserId: 'walter' })).toBe('CONFLICT');
  });

  it('known attribution exists but does not match the proposed officer: CLEAR', () => {
    expect(classifyIndependence({ disciplinaryDecidedBy: 'sam', proposedUserId: 'walter' })).toBe('CLEAR');
  });

  it('multiple allegations decided by different people, none matching: CLEAR', () => {
    expect(classifyIndependence({ allegationsDecidedBy: ['sam', 'alex'], proposedUserId: 'walter' })).toBe('CLEAR');
  });

  it('no attribution anywhere (legacy case, no allegations rows, disciplinary_decided_by null): UNKNOWN, never silently CLEAR', () => {
    expect(classifyIndependence({ allegationsDecidedBy: [], disciplinaryDecidedBy: null, proposedUserId: 'walter' })).toBe('UNKNOWN');
  });

  it('allegations rows exist but all have decided_by null (not yet decided): UNKNOWN, not CLEAR', () => {
    expect(classifyIndependence({ allegationsDecidedBy: [null, null], disciplinaryDecidedBy: null, proposedUserId: 'walter' })).toBe('UNKNOWN');
  });

  it('NULL-propagation guard: a null disciplinary_decided_by never equals a null-ish proposedUserId comparison path — CONFLICT is never falsely raised when the column is simply unset', () => {
    expect(classifyIndependence({ disciplinaryDecidedBy: null, allegationsDecidedBy: [], proposedUserId: 'walter' })).not.toBe('CONFLICT');
  });
});

describe('owner/creator are not inputs to independence classification (constraint E)', () => {
  it('proposed officer is the case owner/creator, but never decided anything: CLEAR (owner alone does not create a conflict)', () => {
    // classifyIndependence deliberately has no ownerId/createdBy parameter
    // at all — this test documents that omission by showing the result is
    // unaffected by who the case owner is, only by decided_by/
    // disciplinary_decided_by.
    const proposedUserId = 'owner-1';
    expect(classifyIndependence({ disciplinaryDecidedBy: null, allegationsDecidedBy: [], proposedUserId })).toBe('UNKNOWN');
    expect(classifyIndependence({ disciplinaryDecidedBy: 'someone-else', allegationsDecidedBy: [], proposedUserId })).toBe('CLEAR');
  });

  it('proposed officer created the case, but never decided anything: same result as any other non-decision-maker — creator alone does not create a conflict', () => {
    const proposedUserId = 'creator-1';
    expect(classifyIndependence({ disciplinaryDecidedBy: 'someone-else', allegationsDecidedBy: [], proposedUserId })).toBe('CLEAR');
  });
});

describe('disciplinary_officer_id (hand-off assignment) is a different concept and never consulted here (constraint F)', () => {
  it('classifyIndependence has no disciplinaryOfficerId parameter — a prospective hand-off assignee who never actually decided the case is not flagged', () => {
    // disciplinary_officer_id can be null even when disciplinary_decided_by
    // is populated (or vice versa on legacy data) — they are independent
    // fields by design, and this function only ever reads the latter.
    expect(classifyIndependence({ disciplinaryDecidedBy: null, allegationsDecidedBy: [], proposedUserId: 'handoff-assignee' })).toBe('UNKNOWN');
  });
});

describe('attemptAppointAppealManager — HR-only gate, org membership, and mandatory-reason enforcement', () => {
  it('non-HR caller is blocked before independence is even considered', () => {
    expect(attemptAppointAppealManager({ isHR: false, sameOrgAppointee: true, classification: 'CLEAR' })).toEqual({ ok: false, error: 'NOT_HR' });
  });

  it('Auditor cannot exploit the new field/path — Auditor is never an HR role, so is_hr_role() blocks it exactly as before, regardless of classification', () => {
    expect(attemptAppointAppealManager({ isHR: false, sameOrgAppointee: true, classification: 'UNKNOWN' })).toEqual({ ok: false, error: 'NOT_HR' });
    expect(attemptAppointAppealManager({ isHR: false, sameOrgAppointee: true, classification: 'CONFLICT', overrideReason: 'i am auditor trying anyway' })).toEqual({ ok: false, error: 'NOT_HR' });
  });

  it('cross-org: proposed appointee has no org_members row in this case\'s org — denied regardless of HR status or classification', () => {
    expect(attemptAppointAppealManager({ isHR: true, sameOrgAppointee: false, classification: 'CLEAR' })).toEqual({ ok: false, error: 'APPOINTEE_NOT_MEMBER' });
  });

  it('unauthorized role cannot manipulate decision-maker identity via this RPC — a non-HR caller supplying any override reason is still blocked at the HR gate, the reason is never even inspected', () => {
    expect(attemptAppointAppealManager({ isHR: false, sameOrgAppointee: true, classification: 'CONFLICT', overrideReason: 'trust me' })).toEqual({ ok: false, error: 'NOT_HR' });
  });

  it('CLEAR: HR proceeds normally with no reason required, audited as plain "Appeal officer appointed"', () => {
    expect(attemptAppointAppealManager({ isHR: true, sameOrgAppointee: true, classification: 'CLEAR' })).toEqual({ ok: true, auditAction: 'Appeal officer appointed', overrideReasonRecorded: null });
  });

  it('CONFLICT without a reason: blocked with INDEPENDENCE_CONFLICT', () => {
    expect(attemptAppointAppealManager({ isHR: true, sameOrgAppointee: true, classification: 'CONFLICT' })).toEqual({ ok: false, error: 'INDEPENDENCE_CONFLICT' });
  });

  it('CONFLICT with a blank/whitespace-only reason: still blocked (trim() must be non-empty)', () => {
    expect(attemptAppointAppealManager({ isHR: true, sameOrgAppointee: true, classification: 'CONFLICT', overrideReason: '   ' })).toEqual({ ok: false, error: 'INDEPENDENCE_CONFLICT' });
  });

  it('CONFLICT with a real reason: HR may proceed exceptionally, and the audit action distinguishes this from a normal appointment', () => {
    const result = attemptAppointAppealManager({ isHR: true, sameOrgAppointee: true, classification: 'CONFLICT', overrideReason: 'No other senior manager is available in this small site.' });
    expect(result.ok).toBe(true);
    expect(result.auditAction).toBe('Appeal officer appointed despite independence conflict');
  });

  it('the override reason itself is preserved for the audit trail, not discarded once accepted', () => {
    const reason = 'HR Director confirmed no other independent manager exists at this location.';
    const result = attemptAppointAppealManager({ isHR: true, sameOrgAppointee: true, classification: 'CONFLICT', overrideReason: reason });
    expect(result.overrideReasonRecorded).toBe(reason);
  });

  it('UNKNOWN (legacy case) without a reason: blocked with INDEPENDENCE_UNKNOWN, never silently treated as CLEAR', () => {
    expect(attemptAppointAppealManager({ isHR: true, sameOrgAppointee: true, classification: 'UNKNOWN' })).toEqual({ ok: false, error: 'INDEPENDENCE_UNKNOWN' });
  });

  it('UNKNOWN with an HR confirmation reason: proceeds, audited with its own distinct action string (never reused from the CONFLICT branch)', () => {
    const result = attemptAppointAppealManager({ isHR: true, sameOrgAppointee: true, classification: 'UNKNOWN', overrideReason: 'Confirmed via the paper file this predates the system — no conflict.' });
    expect(result.ok).toBe(true);
    expect(result.auditAction).toBe('Appeal officer appointed without verified independence (legacy case)');
    expect(result.auditAction).not.toBe('Appeal officer appointed despite independence conflict');
  });
});

describe('allegations.decided_by remains independently authoritative (constraint D) — not superseded by disciplinary_decided_by', () => {
  it('a case decided solely via the Allegations tab (disciplinary_decided_by null) still produces CONFLICT when the proposed officer matches an allegation\'s decided_by', () => {
    expect(classifyIndependence({ allegationsDecidedBy: ['walter'], disciplinaryDecidedBy: null, proposedUserId: 'walter' })).toBe('CONFLICT');
  });

  it('a case decided solely via the outcome/letter pathway (no allegations rows at all) still produces CONFLICT when the proposed officer matches disciplinary_decided_by — this is the exact defect case (Golden Path 2) this migration fixes', () => {
    expect(classifyIndependence({ allegationsDecidedBy: [], disciplinaryDecidedBy: 'walter', proposedUserId: 'walter' })).toBe('CONFLICT');
  });
});
