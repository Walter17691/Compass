import { describe, it, expect, beforeEach } from 'vitest';
import { ls, lsSet } from '../App.jsx';

describe('ls / lsSet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the fallback when nothing is stored', () => {
    expect(ls('missing-key', 'fallback')).toBe('fallback');
  });

  it('round-trips an object through lsSet/ls', () => {
    lsSet('compass_test', { a: 1, b: [1, 2, 3] });
    expect(ls('compass_test', null)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('falls back gracefully on corrupted JSON instead of throwing', () => {
    localStorage.setItem('compass_test', '{not valid json');
    expect(ls('compass_test', 'fallback')).toBe('fallback');
  });
});
