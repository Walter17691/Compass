import { describe, it, expect } from 'vitest';
import { addWorkingDays } from '../App.jsx';

describe('addWorkingDays', () => {
  it('returns null for a 0-day deadline', () => {
    expect(addWorkingDays('2026-07-23', 0)).toBeNull();
  });

  it('skips weekends when counting forward', () => {
    // Thursday 23 July 2026 + 5 working days should land on
    // Thursday 30 July 2026, skipping the two weekends in between.
    const result = addWorkingDays('2026-07-23', 5);
    expect(result).toBe('30/07/2026');
  });

  it('does not count a starting Friday itself, only days added after it', () => {
    // Friday 24 July 2026 + 1 working day -> Monday 27 July 2026
    const result = addWorkingDays('2026-07-24', 1);
    expect(result).toBe('27/07/2026');
  });

  it('formats the result as UK dd/mm/yyyy', () => {
    const result = addWorkingDays('2026-01-01', 1);
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});
