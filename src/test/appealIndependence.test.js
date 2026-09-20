import { describe, it, expect } from 'vitest';
import { classifyAppealIndependence } from '../lib/appealIndependence.js';

// Appeal independence P1 (Human UAT, 2026-09-20) — exhaustive truth table
// for the client-side mirror of appoint_appeal_officer()'s own SQL rule
// (supabase/appeal_independence_decision_maker_2026-09-18.sql). The SQL
// decides whether an appointment is ALLOWED; this decides what Compass may
// then say about it in an employee-facing letter. Same inputs, same rule —
// these tests are what keep the two aligned, so they intentionally restate
// the SQL conditions rather than paraphrasing them.
const OFFICER = '522293f3-817a-4226-980a-f32abbaefef9';
const DECIDER = 'f2851899-4608-4f8c-b63e-02b2dc418876';
const THIRD = '0c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f';

describe('classifyAppealIndependence — CONFLICT (officer decided the original outcome)', () => {
  it('cases.disciplinary_decided_by matches the appeal officer', () => {
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: OFFICER }, allegations: [], appealOfficerUserId: OFFICER,
    })).toBe('conflict');
  });

  it('a single allegation decided by the appeal officer', () => {
    expect(classifyAppealIndependence({
      caseRecord: {}, allegations: [{ decidedBy: OFFICER }], appealOfficerUserId: OFFICER,
    })).toBe('conflict');
  });

  it('several allegations where only one matches — one match is enough', () => {
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: DECIDER },
      allegations: [{ decidedBy: DECIDER }, { decidedBy: THIRD }, { decidedBy: OFFICER }],
      appealOfficerUserId: OFFICER,
    })).toBe('conflict');
  });

  it('conflict wins over attribution that would otherwise read as clear', () => {
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: OFFICER },
      allegations: [{ decidedBy: DECIDER }],
      appealOfficerUserId: OFFICER,
    })).toBe('conflict');
  });

  it('accepts the raw snake_case column name too, so an unmapped row cannot fall through to unknown', () => {
    expect(classifyAppealIndependence({
      caseRecord: { disciplinary_decided_by: OFFICER }, allegations: [], appealOfficerUserId: OFFICER,
    })).toBe('conflict');
    expect(classifyAppealIndependence({
      caseRecord: {}, allegations: [{ decided_by: OFFICER }], appealOfficerUserId: OFFICER,
    })).toBe('conflict');
  });
});

describe('classifyAppealIndependence — UNKNOWN (no structured attribution to check against)', () => {
  it('no disciplinary_decided_by and no allegations at all — the live UAT case shape', () => {
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: null }, allegations: [], appealOfficerUserId: OFFICER,
    })).toBe('unknown');
  });

  it('allegations exist but none carries a decision-maker', () => {
    expect(classifyAppealIndependence({
      caseRecord: {}, allegations: [{ decidedBy: null }, { decidedBy: undefined }, {}], appealOfficerUserId: OFFICER,
    })).toBe('unknown');
  });

  it('no appointed officer at all classifies as unknown, never clear', () => {
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: DECIDER }, allegations: [{ decidedBy: DECIDER }], appealOfficerUserId: null,
    })).toBe('unknown');
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: DECIDER }, allegations: [], appealOfficerUserId: undefined,
    })).toBe('unknown');
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: DECIDER }, allegations: [], appealOfficerUserId: '',
    })).toBe('unknown');
  });
});

describe('classifyAppealIndependence — CLEAR (attribution exists and does not match)', () => {
  it('disciplinary_decided_by is someone other than the appeal officer', () => {
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: DECIDER }, allegations: [], appealOfficerUserId: OFFICER,
    })).toBe('clear');
  });

  it('every attributed allegation was decided by someone else', () => {
    expect(classifyAppealIndependence({
      caseRecord: {}, allegations: [{ decidedBy: DECIDER }, { decidedBy: THIRD }], appealOfficerUserId: OFFICER,
    })).toBe('clear');
  });

  it('a mix of attributed and unattributed allegations, none matching', () => {
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: DECIDER },
      allegations: [{ decidedBy: null }, { decidedBy: THIRD }],
      appealOfficerUserId: OFFICER,
    })).toBe('clear');
  });
});

describe('classifyAppealIndependence — null-safety and identity comparison', () => {
  it('does not throw on missing arguments and defaults to the conservative classification', () => {
    expect(() => classifyAppealIndependence()).not.toThrow();
    expect(classifyAppealIndependence()).toBe('unknown');
    expect(classifyAppealIndependence({})).toBe('unknown');
  });

  it('tolerates a non-array allegations value', () => {
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: DECIDER }, allegations: null, appealOfficerUserId: OFFICER,
    })).toBe('clear');
    expect(classifyAppealIndependence({
      caseRecord: {}, allegations: undefined, appealOfficerUserId: OFFICER,
    })).toBe('unknown');
  });

  it('tolerates null entries inside the allegations array', () => {
    expect(classifyAppealIndependence({
      caseRecord: {}, allegations: [null, undefined, { decidedBy: OFFICER }], appealOfficerUserId: OFFICER,
    })).toBe('conflict');
  });

  // A loose comparison would make two absent ids "match" and wrongly report
  // a conflict on a case with no attribution at all.
  it('two null identities never count as a match', () => {
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: null }, allegations: [{ decidedBy: null }], appealOfficerUserId: null,
    })).toBe('unknown');
  });

  it('compares identities as strings, so an id is matched by value not reference', () => {
    expect(classifyAppealIndependence({
      caseRecord: { disciplinaryDecidedBy: String(OFFICER) }, allegations: [], appealOfficerUserId: `${OFFICER}`,
    })).toBe('conflict');
  });
});
