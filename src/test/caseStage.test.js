import { describe, it, expect } from 'vitest';
import { getCurrentRisk, getCaseStage, isGrievanceCase } from '../lib/caseStage.js';

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
