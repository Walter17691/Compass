import { describe, it, expect } from 'vitest';
import { appealLinkCandidates } from '../lib/appealLink';

const cases = [
  { id: 'c1', employeeName: 'Ada Lovelace' },
  { id: 'c2', employeeName: 'Ada Lovelace' },
  { id: 'c3', employeeName: 'Grace Hopper' },
];

describe('appealLinkCandidates', () => {
  it('returns only cases for the same employee', () => {
    const result = appealLinkCandidates(cases, 'Ada Lovelace');
    expect(result.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const result = appealLinkCandidates(cases, '  ada lovelace  ');
    expect(result.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('returns all cases when no employee name is known', () => {
    expect(appealLinkCandidates(cases, '')).toEqual(cases);
    expect(appealLinkCandidates(cases, undefined)).toEqual(cases);
  });

  it('returns an empty list when no case matches the employee', () => {
    expect(appealLinkCandidates(cases, 'Someone Else')).toEqual([]);
  });
});
