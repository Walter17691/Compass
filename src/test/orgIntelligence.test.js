import { describe, it, expect } from 'vitest';
import { extractThemeKeywords } from '../lib/orgIntelligence';

describe('extractThemeKeywords', () => {
  it('surfaces a word that recurs across multiple cases', () => {
    const cases = [
      { description: 'Unauthorised absence from the warehouse shift.' },
      { description: 'Repeated absence pattern noted by the warehouse team.' },
    ];
    const result = extractThemeKeywords(cases);
    expect(result.map(r => r.keyword)).toContain('absence');
    expect(result.map(r => r.keyword)).toContain('warehouse');
  });

  it('excludes a word that only appears in a single case', () => {
    const cases = [
      { description: 'A dispute involving a specific rare incident, zeppelin crash near the depot.' },
      { description: 'Attendance concern raised by supervisor.' },
    ];
    const result = extractThemeKeywords(cases);
    expect(result.map(r => r.keyword)).not.toContain('zeppelin');
  });

  it('counts a repeated word within one case only once towards its case count', () => {
    const cases = [
      { description: 'Bullying bullying bullying allegation from one team member.' },
      { description: 'A separate bullying concern raised in another department.' },
    ];
    const result = extractThemeKeywords(cases);
    const bullying = result.find(r => r.keyword === 'bullying');
    expect(bullying?.count).toBe(2);
  });

  it('excludes common stop words even if they recur often', () => {
    const cases = [
      { description: 'This employee was raised for this and that matter during the shift.' },
      { description: 'This other employee was also raised for this and that matter.' },
    ];
    const result = extractThemeKeywords(cases);
    expect(result.map(r => r.keyword)).not.toContain('this');
    expect(result.map(r => r.keyword)).not.toContain('that');
    expect(result.map(r => r.keyword)).not.toContain('employee');
  });

  it('also scans the case title, not just the description', () => {
    const cases = [
      { title: 'Harassment complaint', description: 'x' },
      { title: 'Second harassment complaint', description: 'y' },
    ];
    const result = extractThemeKeywords(cases);
    expect(result.map(r => r.keyword)).toContain('harassment');
  });

  it('returns an empty array for no cases', () => {
    expect(extractThemeKeywords([])).toEqual([]);
  });

  it('sorts by frequency, most common first, and respects the limit', () => {
    const cases = [
      { description: 'lateness lateness' }, { description: 'lateness' }, { description: 'lateness' },
      { description: 'harassment' }, { description: 'harassment' },
    ];
    const result = extractThemeKeywords(cases, 1);
    expect(result).toHaveLength(1);
    expect(result[0].keyword).toBe('lateness');
  });
});
