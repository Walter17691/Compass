import { describe, it, expect } from 'vitest';
import { buildOhFindings, ohFindingTaskName, OH_FINDING_TYPES } from '../lib/ohReportIntelligence.js';

describe('buildOhFindings (Phase 5, IP23)', () => {
  it('keeps valid findings of each recognized type and stamps id/status', () => {
    const parsed = [
      { type: 'adjustment', description: 'Reduced hours for 4 weeks', reasoning: 'Report recommends it' },
      { type: 'restriction', description: 'No heavy lifting', reasoning: 'Physical restriction noted' },
      { type: 'further_information', description: 'Awaiting physiotherapy assessment', reasoning: 'Report flags as pending' },
      { type: 'review_date', date: '2026-10-01', reasoning: 'Report suggests a 6-week review' },
    ];
    const result = buildOhFindings(parsed);
    expect(result).toHaveLength(4);
    result.forEach(f => {
      expect(f.id).toBeTruthy();
      expect(f.status).toBe('open');
    });
    expect(OH_FINDING_TYPES).toEqual(result.map(f => f.type));
  });

  it('drops findings with an unrecognized type', () => {
    const result = buildOhFindings([{ type: 'diagnosis', description: 'Should never be produced' }]);
    expect(result).toEqual([]);
  });

  it('drops a review_date finding with no valid ISO date', () => {
    expect(buildOhFindings([{ type: 'review_date' }])).toEqual([]);
    expect(buildOhFindings([{ type: 'review_date', date: 'in about 6 weeks' }])).toEqual([]);
    expect(buildOhFindings([{ type: 'review_date', date: '2026-10-01' }])).toHaveLength(1);
  });

  it('handles non-array or empty input gracefully', () => {
    expect(buildOhFindings(null)).toEqual([]);
    expect(buildOhFindings(undefined)).toEqual([]);
    expect(buildOhFindings([])).toEqual([]);
    expect(buildOhFindings({ not: 'an array' })).toEqual([]);
  });
});

describe('ohFindingTaskName (Phase 5, IP23)', () => {
  it('builds a task name for each task-shaped finding type', () => {
    expect(ohFindingTaskName({ type: 'adjustment', description: 'Reduced hours' })).toBe('Consider adjustment: Reduced hours');
    expect(ohFindingTaskName({ type: 'restriction', description: 'No heavy lifting' })).toBe('Account for restriction: No heavy lifting');
    expect(ohFindingTaskName({ type: 'further_information', description: 'Awaiting assessment' })).toBe('Follow up with OH: Awaiting assessment');
  });

  it('returns null for review_date, which is not task-shaped', () => {
    expect(ohFindingTaskName({ type: 'review_date', date: '2026-10-01' })).toBeNull();
  });
});
