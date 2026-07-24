import { describe, it, expect } from 'vitest';
import { getCurrentRisk } from '../lib/caseStage.js';

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
