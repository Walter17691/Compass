import { describe, it, expect } from 'vitest';
import { getCurrentRisk, getCaseStage } from '../lib/caseStage.js';

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
