import { describe, it, expect } from 'vitest';
import { computeSelectionScore } from '../lib/redundancyScoring.js';

const DEFAULT_CRITERIA = [
  { id: 'sc1', criterion: 'Skills and qualifications', weight: 30 },
  { id: 'sc2', criterion: 'Performance', weight: 25 },
  { id: 'sc3', criterion: 'Attendance', weight: 20 },
  { id: 'sc4', criterion: 'Flexibility', weight: 15 },
  { id: 'sc5', criterion: 'Length of service', weight: 10 },
];

describe('computeSelectionScore', () => {
  it('the default template weights sum to 100, so scores read on a 0-5 scale', () => {
    const total = DEFAULT_CRITERIA.reduce((t, c) => t + c.weight, 0);
    expect(total).toBe(100);
  });

  it('scores every criterion at the max gives a total of 5.0', () => {
    let scores = {};
    let totalScore;
    for (const c of DEFAULT_CRITERIA) {
      ({ scores, totalScore } = computeSelectionScore(scores, c.id, 5, DEFAULT_CRITERIA));
    }
    expect(totalScore).toBe('5.0');
  });

  it('treats unscored criteria as zero', () => {
    const { totalScore } = computeSelectionScore({}, 'sc1', 5, DEFAULT_CRITERIA);
    // only sc1 (weight 30) scored: 5 * 30/100 = 1.5, everything else 0
    expect(totalScore).toBe('1.5');
  });

  it('computes a correct weighted sum across a mix of scored criteria', () => {
    const scores = { sc1: 4, sc2: 3 };
    const { totalScore } = computeSelectionScore(scores, 'sc3', 2, DEFAULT_CRITERIA);
    // sc1: 4*0.30=1.2, sc2: 3*0.25=0.75, sc3: 2*0.20=0.4 -> 2.35, rounds to 2.4
    expect(totalScore).toBe('2.4');
  });

  it('preserves previously-set scores for other criteria when updating one', () => {
    const { scores } = computeSelectionScore({ sc1: 4 }, 'sc2', 3, DEFAULT_CRITERIA);
    expect(scores).toEqual({ sc1: 4, sc2: 3 });
  });

  it('overwrites the score for the criterion being updated', () => {
    const { scores } = computeSelectionScore({ sc1: 2 }, 'sc1', 5, DEFAULT_CRITERIA);
    expect(scores.sc1).toBe(5);
  });

  it('does not mutate the existingScores object passed in', () => {
    const existing = { sc1: 2 };
    computeSelectionScore(existing, 'sc1', 5, DEFAULT_CRITERIA);
    expect(existing.sc1).toBe(2);
  });

  it('rounds an exact .x5 result correctly despite binary floating-point representation (regression)', () => {
    // 4*0.30 + 3*0.25 = 1.95 exactly in decimal, but 1.95 has no exact
    // binary representation — naively summing per-criterion divisions
    // gives 1.9499999999999997, which .toFixed(1) rounds down to "1.9"
    // instead of "2.0". Caught live in the browser, not just in theory.
    const scores = { sc1: 4 };
    const { totalScore } = computeSelectionScore(scores, 'sc2', 3, DEFAULT_CRITERIA);
    expect(totalScore).toBe('2.0');
  });
});
