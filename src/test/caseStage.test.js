import { describe, it, expect } from 'vitest';
import { getCurrentRisk, getCaseStage, isGrievanceCase, withStageTransitionStamp } from '../lib/caseStage.js';

describe('getCaseStage', () => {
  it('an explicitly-tracked stage wins over the signed+outcome heuristic', () => {
    // This is the appeal-window bug: a disciplinary hearing gets signed,
    // then its outcome letter is saved as a separate meeting entry — the
    // guided flow already set cs.stage to "outcome" at that point, and
    // that must not be overridden to "closed" while the appeal window is
    // still legally live.
    const cs = {
      stage: 'outcome',
      meetings: [{ type: 'Disciplinary', signStatus: 'signed', letterOutput: 'the outcome letter' }],
    };
    expect(getCaseStage(cs)).toBe('outcome');
  });

  it('same protection for a tracked "appeal" stage', () => {
    const cs = {
      stage: 'appeal',
      meetings: [
        { type: 'Disciplinary', signStatus: 'signed', letterOutput: 'the outcome letter' },
        { type: 'Appeal', signStatus: 'signed', letterOutput: 'the appeal outcome' },
      ],
    };
    expect(getCaseStage(cs)).toBe('appeal');
  });

  it('an explicit cs.stage of "closed" is still respected', () => {
    expect(getCaseStage({ stage: 'closed', meetings: [] })).toBe('closed');
  });

  it('the signed+outcome heuristic still classifies untracked (no cs.stage) meeting-only data as closed', () => {
    const cs = {
      meetings: [{ type: 'Disciplinary', signStatus: 'signed', letterOutput: 'the outcome letter' }],
    };
    expect(getCaseStage(cs)).toBe('closed');
  });

  it('infers "investigation" for a case with only an investigation meeting and no tracked stage', () => {
    const cs = { meetings: [{ type: 'Investigation', record: 'notes' }] };
    expect(getCaseStage(cs)).toBe('investigation');
  });

  it('defaults to "intake" for a brand-new case with no meetings and no tracked stage', () => {
    expect(getCaseStage({ meetings: [] })).toBe('intake');
  });
});

describe('getCaseStage — grievance-shaped cases', () => {
  it('infers "hearing" (not "investigation") for a grievance case with a grievance meeting, since ACAS S6 has no separate investigation split', () => {
    const cs = { caseType: 'grievance', meetings: [{ type: 'Grievance', record: 'notes' }] };
    expect(getCaseStage(cs)).toBe('hearing');
  });

  it('is case-insensitive on caseType', () => {
    expect(isGrievanceCase({ caseType: 'Grievance' })).toBe(true);
    expect(isGrievanceCase({ caseType: 'misconduct' })).toBe(false);
  });

  it('defaults a grievance case with no meetings to "intake", not "investigation"', () => {
    expect(getCaseStage({ caseType: 'grievance', meetings: [] })).toBe('intake');
  });

  it('infers "appeal" for a grievance case with a grievance appeal meeting', () => {
    const cs = { caseType: 'grievance', meetings: [{ type: 'Grievance', letterOutput: 'x' }, { type: 'Grievance Appeal', record: 'notes' }] };
    expect(getCaseStage(cs)).toBe('appeal');
  });

  it('infers "outcome" once a grievance meeting has a letter, before any appeal', () => {
    const cs = { caseType: 'grievance', meetings: [{ type: 'Grievance', letterOutput: 'the outcome letter' }] };
    expect(getCaseStage(cs)).toBe('outcome');
  });

  it('infers "closed" once signed and outcome-lettered, same protection as disciplinary', () => {
    const cs = { caseType: 'grievance', meetings: [{ type: 'Grievance', signStatus: 'signed', letterOutput: 'the outcome letter' }] };
    expect(getCaseStage(cs)).toBe('closed');
  });

  it('an explicitly-tracked stage still wins over the grievance heuristic', () => {
    const cs = { caseType: 'grievance', stage: 'outcome', meetings: [{ type: 'Grievance', signStatus: 'signed', letterOutput: 'x' }] };
    expect(getCaseStage(cs)).toBe('outcome');
  });

  it('a non-grievance case type still uses the disciplinary-shaped heuristic', () => {
    const cs = { caseType: 'misconduct', meetings: [{ type: 'Grievance', record: 'notes' }] };
    // "Grievance" meeting type text doesn't match any disciplinary-shape
    // keyword, so this falls through to the generic "has meetings" case.
    expect(getCaseStage(cs)).toBe('investigation');
  });
});

describe('getCaseStage — probation-shaped cases (regular case flow, not DevelopScreen)', () => {
  it('defaults to "probation_started" for a brand-new case with no meetings', () => {
    expect(getCaseStage({ caseType: 'probation', meetings: [] })).toBe('probation_started');
  });

  it('infers "check_in" once one meeting has been held', () => {
    expect(getCaseStage({ caseType: 'probation', meetings: [{ type: 'Formal Meeting' }] })).toBe('check_in');
  });

  it('infers "concerns_raised" once more than one meeting has been held', () => {
    const cs = { caseType: 'probation', meetings: [{ type: 'Formal Meeting' }, { type: 'Formal Meeting' }] };
    expect(getCaseStage(cs)).toBe('concerns_raised');
  });

  it('infers "outcome" once cs.outcome is set', () => {
    expect(getCaseStage({ caseType: 'probation', outcome: 'Pass', meetings: [] })).toBe('outcome');
  });

  it('an explicitly-tracked stage still wins over the probation heuristic', () => {
    expect(getCaseStage({ caseType: 'probation', stage: 'closed', meetings: [] })).toBe('closed');
  });
});

describe('getCaseStage — flexible working-shaped cases', () => {
  it('defaults to "request_received" for a brand-new case with no meetings', () => {
    expect(getCaseStage({ caseType: 'flexible working', meetings: [] })).toBe('request_received');
  });

  it('is not sensitive to the underscore-vs-space spelling', () => {
    expect(getCaseStage({ caseType: 'flexible_working', meetings: [] })).toBe('request_received');
  });

  it('infers "decision_meeting" once a meeting has been held', () => {
    expect(getCaseStage({ caseType: 'flexible working', meetings: [{ type: 'Formal Meeting' }] })).toBe('decision_meeting');
  });

  it('infers "decision" once cs.outcome is set', () => {
    expect(getCaseStage({ caseType: 'flexible working', outcome: 'Approved', meetings: [] })).toBe('decision');
  });

  it('infers "appeal" when an appeal meeting exists, even without cs.outcome', () => {
    const cs = { caseType: 'flexible working', meetings: [{ type: 'Appeal' }] };
    expect(getCaseStage(cs)).toBe('appeal');
  });
});

describe('getCaseStage — long-term sickness-shaped cases', () => {
  it('defaults to "absence_identified" for a brand-new case with no meetings', () => {
    expect(getCaseStage({ caseType: 'long-term sickness', meetings: [] })).toBe('absence_identified');
  });

  it('is not sensitive to the hyphen-vs-space spelling', () => {
    expect(getCaseStage({ caseType: 'long term sickness', meetings: [] })).toBe('absence_identified');
  });

  it('infers "contact_welfare" once a meeting has been held', () => {
    expect(getCaseStage({ caseType: 'long-term sickness', meetings: [{ type: 'Return to Work' }] })).toBe('contact_welfare');
  });

  it('infers "capability_consideration" once a capability-type meeting exists', () => {
    const cs = { caseType: 'long-term sickness', meetings: [{ type: 'Capability Review' }] };
    expect(getCaseStage(cs)).toBe('capability_consideration');
  });

  it('infers "decision" once cs.outcome is set', () => {
    expect(getCaseStage({ caseType: 'long-term sickness', outcome: 'Return to work agreed', meetings: [] })).toBe('decision');
  });
});

// Phase 6.5 hardening (closes Prompt 16 audit finding H12, HIGH) — the
// old heuristic only ever checked meeting.type for "occupational health"/
// "capability", neither of which is a real, selectable MEETING_TYPES
// option — a real case could never progress past "contact_welfare" no
// matter how far it had actually come. The real, already-populated dated
// fields (ohReferralDate/ohReportReceivedDate, editable on OverviewTab)
// are now the primary signal.
describe('getCaseStage — long-term sickness stage from the real OH dated fields (Prompt 16 audit, H12)', () => {
  it('infers "occupational_health" once ohReferralDate is set, with no matching meeting type needed', () => {
    const cs = { caseType: 'long-term sickness', ohReferralDate: '2026-01-10', meetings: [{ type: 'Formal Meeting' }] };
    expect(getCaseStage(cs)).toBe('occupational_health');
  });

  it('infers "adjustments_considered" once the OH report has actually been received', () => {
    const cs = { caseType: 'long-term sickness', ohReferralDate: '2026-01-10', ohReportReceivedDate: '2026-01-25', meetings: [] };
    expect(getCaseStage(cs)).toBe('adjustments_considered');
  });

  it('does not get stuck at "contact_welfare" once real progress has been recorded, even with no meetings logged', () => {
    const cs = { caseType: 'long-term sickness', ohReferralDate: '2026-01-10', meetings: [] };
    expect(getCaseStage(cs)).not.toBe('contact_welfare');
  });

  it('a capability-type meeting still wins over an OH report date, since it is the later real stage', () => {
    const cs = { caseType: 'long-term sickness', ohReferralDate: '2026-01-10', ohReportReceivedDate: '2026-01-25', meetings: [{ type: 'Capability Review' }] };
    expect(getCaseStage(cs)).toBe('capability_consideration');
  });
});

describe('getCurrentRisk', () => {
  it('returns null when no meeting has a rating', () => {
    expect(getCurrentRisk({ meetings: [{ date: '2026-01-01' }] })).toBeNull();
  });

  it('ignores UNKNOWN ratings', () => {
    expect(getCurrentRisk({ meetings: [{ date: '2026-01-01', riskScore: { rating: 'UNKNOWN' } }] })).toBeNull();
  });

  it('returns the rating from the most recent dated meeting, not the first in array order', () => {
    const cs = {
      meetings: [
        { date: '2026-01-01', riskScore: { rating: 'HIGH' } },
        { date: '2026-03-01', riskScore: { rating: 'LOW' } },
      ],
    };
    expect(getCurrentRisk(cs)).toBe('LOW');
  });

  it('skips unrated meetings even if they are the most recent', () => {
    const cs = {
      meetings: [
        { date: '2026-01-01', riskScore: { rating: 'HIGH' } },
        { date: '2026-03-01' },
      ],
    };
    expect(getCurrentRisk(cs)).toBe('HIGH');
  });
});

describe('withStageTransitionStamp (P17)', () => {
  it('stamps the new stage with a timestamp when the computed stage changes', () => {
    const prev = { id: 'c1', stage: 'investigation', meetings: [] };
    const next = { id: 'c1', stage: 'disciplinary', meetings: [] };
    const result = withStageTransitionStamp(next, prev);
    expect(result.timelineOverrides.stageEnteredAt.disciplinary).toBeTruthy();
    expect(new Date(result.timelineOverrides.stageEnteredAt.disciplinary).toString()).not.toBe('Invalid Date');
  });

  it('returns the same object reference when the computed stage has not changed', () => {
    const prev = { id: 'c1', stage: 'investigation', meetings: [] };
    const next = { id: 'c1', stage: 'investigation', meetings: [], description: 'updated' };
    expect(withStageTransitionStamp(next, prev)).toBe(next);
  });

  it('treats a heuristically-inferred stage change as a real transition, not just an explicit cs.stage change', () => {
    const prev = { id: 'c1', caseType: 'misconduct', meetings: [] }; // no explicit stage -> inferred "intake" style
    const next = { id: 'c1', caseType: 'misconduct', meetings: [{ type: 'Investigation', date: '01/08/2026' }] }; // now infers "investigation"
    const result = withStageTransitionStamp(next, prev);
    expect(result.timelineOverrides.stageEnteredAt.investigation).toBeTruthy();
  });

  it('preserves existing timelineOverrides content and existing stageEnteredAt entries', () => {
    const prev = { id: 'c1', stage: 'investigation', meetings: [], timelineOverrides: { excluded: ['x'], stageEnteredAt: { investigation: '2026-08-01T00:00:00.000Z' } } };
    const next = { id: 'c1', stage: 'disciplinary', meetings: [], timelineOverrides: { excluded: ['x'], stageEnteredAt: { investigation: '2026-08-01T00:00:00.000Z' } } };
    const result = withStageTransitionStamp(next, prev);
    expect(result.timelineOverrides.excluded).toEqual(['x']);
    expect(result.timelineOverrides.stageEnteredAt.investigation).toBe('2026-08-01T00:00:00.000Z');
    expect(result.timelineOverrides.stageEnteredAt.disciplinary).toBeTruthy();
  });

  it('treats a brand-new case (no prevCs) as a transition into its initial stage', () => {
    const next = { id: 'c1', stage: 'investigation', meetings: [] };
    const result = withStageTransitionStamp(next, null);
    expect(result.timelineOverrides.stageEnteredAt.investigation).toBeTruthy();
  });

  it('treats moving into "closed" as a stamped transition like any other stage', () => {
    const prev = { id: 'c1', stage: 'outcome', meetings: [] };
    const next = { id: 'c1', stage: 'closed', meetings: [] };
    const result = withStageTransitionStamp(next, prev);
    expect(result.timelineOverrides.stageEnteredAt.closed).toBeTruthy();
  });
});
