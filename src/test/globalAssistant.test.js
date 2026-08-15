import { describe, it, expect } from 'vitest';
import { matchCaseByEmployeeName, matchCaseByEmployeeNameWithConfidence } from '../lib/globalAssistant';

describe('matchCaseByEmployeeName', () => {
  const cases = [
    { id: 'c1', employeeName: 'Sarah Jones' },
    { id: 'c2', employeeName: 'Ryan Osei' },
    { id: 'c3', employeeName: 'sarah jones-Smith' },
  ];

  it('returns null when no employee name is given', () => {
    expect(matchCaseByEmployeeName(cases, null)).toBeNull();
    expect(matchCaseByEmployeeName(cases, '  ')).toBeNull();
  });

  it('returns null when no case is loaded (never widens beyond what the caller can already see)', () => {
    expect(matchCaseByEmployeeName([], 'Sarah Jones')).toBeNull();
    expect(matchCaseByEmployeeName(undefined, 'Sarah Jones')).toBeNull();
  });

  it('matches an exact name case-insensitively', () => {
    expect(matchCaseByEmployeeName(cases, 'ryan osei').id).toBe('c2');
  });

  it('prefers an exact match over a partial one', () => {
    expect(matchCaseByEmployeeName(cases, 'Sarah Jones').id).toBe('c1');
  });

  it('falls back to a partial/substring match when no exact match exists', () => {
    expect(matchCaseByEmployeeName(cases, 'Osei').id).toBe('c2');
  });

  it('returns null when nothing matches at all', () => {
    expect(matchCaseByEmployeeName(cases, 'Nonexistent Person')).toBeNull();
  });
});

describe('matchCaseByEmployeeNameWithConfidence (Phase 5, IP9)', () => {
  const cases = [
    { id: 'c1', employeeName: 'Sarah Jones' },
    { id: 'c2', employeeName: 'Ryan Osei' },
  ];

  it('reports high confidence for an exact match', () => {
    expect(matchCaseByEmployeeNameWithConfidence(cases, 'sarah jones')).toEqual({ case: cases[0], confidence: 'high' });
  });

  it('reports medium confidence for a substring match', () => {
    expect(matchCaseByEmployeeNameWithConfidence(cases, 'Osei')).toEqual({ case: cases[1], confidence: 'medium' });
  });

  it('reports none confidence with a null case when nothing matches', () => {
    expect(matchCaseByEmployeeNameWithConfidence(cases, 'Nonexistent Person')).toEqual({ case: null, confidence: 'none' });
  });

  it('reports none confidence for an empty/missing name without throwing', () => {
    expect(matchCaseByEmployeeNameWithConfidence(cases, '')).toEqual({ case: null, confidence: 'none' });
    expect(matchCaseByEmployeeNameWithConfidence(cases, null)).toEqual({ case: null, confidence: 'none' });
  });
});
