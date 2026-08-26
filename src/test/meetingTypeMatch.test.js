import { describe, it, expect } from 'vitest';
import { isInvestigationMeeting, isDisciplinaryMeeting, isGrievanceMeeting, isAppealMeeting, isOriginalDecisionMeeting } from '../lib/meetingTypeMatch';

// Phase 6.5 hardening (Prompt 14, Section 8 — Family 4 wider sweep). The
// one invariant every predicate here exists to protect: an appeal meeting
// ("Appeal - Disciplinary"/"Appeal - Grievance") must never satisfy the
// original-hearing check it's a substring collision away from — the exact
// bug deadlines.js's own Family 4 fix closed for statutory deadlines,
// now shared so caseStage.js/nextStep.js/processTimeline.js/guardrails.js
// can't independently regress it.
describe('meetingTypeMatch', () => {
  it('isInvestigationMeeting matches investigation-labelled types', () => {
    expect(isInvestigationMeeting('Investigation')).toBe(true);
    expect(isInvestigationMeeting('Investigation Meeting')).toBe(true);
    expect(isInvestigationMeeting('Disciplinary')).toBe(false);
    expect(isInvestigationMeeting(undefined)).toBe(false);
  });

  it('isDisciplinaryMeeting matches a real disciplinary hearing but not its appeal', () => {
    expect(isDisciplinaryMeeting('Disciplinary')).toBe(true);
    expect(isDisciplinaryMeeting('Disciplinary hearing')).toBe(true);
    expect(isDisciplinaryMeeting('Appeal - Disciplinary')).toBe(false);
    expect(isDisciplinaryMeeting('appeal-disciplinary')).toBe(false);
  });

  it('isGrievanceMeeting matches a real grievance hearing but not its appeal', () => {
    expect(isGrievanceMeeting('Grievance')).toBe(true);
    expect(isGrievanceMeeting('Appeal - Grievance')).toBe(false);
  });

  it('isAppealMeeting matches any appeal type, disciplinary or grievance', () => {
    expect(isAppealMeeting('Appeal - Disciplinary')).toBe(true);
    expect(isAppealMeeting('Appeal - Grievance')).toBe(true);
    expect(isAppealMeeting('appeal-grievance')).toBe(true);
    expect(isAppealMeeting('Disciplinary')).toBe(false);
  });

  it('isOriginalDecisionMeeting matches a real disciplinary or grievance hearing, never an appeal', () => {
    expect(isOriginalDecisionMeeting('Disciplinary')).toBe(true);
    expect(isOriginalDecisionMeeting('Grievance')).toBe(true);
    expect(isOriginalDecisionMeeting('Appeal - Disciplinary')).toBe(false);
    expect(isOriginalDecisionMeeting('Appeal - Grievance')).toBe(false);
    expect(isOriginalDecisionMeeting('Investigation')).toBe(false);
  });
});
