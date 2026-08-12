import { describe, it, expect } from 'vitest';
import { computeChangesSinceView, isNonTrivialChange } from '../lib/caseViews';

describe('computeChangesSinceView', () => {
  const auditLog = [
    { id: 'a1', caseId: 'case1', action: 'Task added', detail: 'Chase evidence', ts: '2026-08-10T09:00:00Z', user: 'Test HR' },
    { id: 'a2', caseId: 'case1', action: 'Status changed', detail: 'Investigation', ts: '2026-08-05T09:00:00Z', user: 'Test HR' },
    { id: 'a3', caseId: 'case2', action: 'Task added', detail: 'Different case', ts: '2026-08-11T09:00:00Z', user: 'Test HR' },
  ];
  const caseSignals = [
    { id: 's1', caseId: 'case1', type: 'next_action', status: 'open', title: 'Interview Sarah', createdAt: '2026-08-10T10:00:00Z' },
    { id: 's2', caseId: 'case1', type: 'process_risk', status: 'resolved', title: 'Already resolved', createdAt: '2026-08-10T11:00:00Z' },
    { id: 's3', caseId: 'case1', type: 'process_risk', status: 'open', title: 'Old signal', createdAt: '2026-08-01T00:00:00Z' },
  ];

  it('returns nothing when never viewed before (no lastViewedAt)', () => {
    expect(computeChangesSinceView(null, { auditLog, caseSignals }, 'case1')).toEqual([]);
  });

  it('only includes audit entries and open signals for the given case, after the given timestamp', () => {
    const result = computeChangesSinceView('2026-08-06T00:00:00Z', { auditLog, caseSignals }, 'case1');
    expect(result.map(c => c.label)).toEqual(['Task added: Chase evidence', 'Compass noticed: Interview Sarah']);
  });

  it('excludes changes from a different case', () => {
    const result = computeChangesSinceView('2026-08-01T00:00:00Z', { auditLog, caseSignals }, 'case2');
    expect(result.map(c => c.label)).toEqual(['Task added: Different case']);
  });

  it('excludes signals that are no longer open', () => {
    const result = computeChangesSinceView('2026-08-06T00:00:00Z', { auditLog, caseSignals }, 'case1');
    expect(result.find(c => c.label.includes('Already resolved'))).toBeUndefined();
  });

  it('excludes changes at or before the last viewed time', () => {
    const result = computeChangesSinceView('2026-08-10T09:00:00Z', { auditLog, caseSignals }, 'case1');
    expect(result.map(c => c.label)).not.toContain('Task added: Chase evidence');
  });

  it('sorts merged results chronologically', () => {
    const result = computeChangesSinceView('2026-08-01T00:00:00Z', { auditLog, caseSignals }, 'case1');
    const timestamps = result.map(c => new Date(c.ts).getTime());
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it('treats an invalid lastViewedAt as never-viewed', () => {
    expect(computeChangesSinceView('not-a-date', { auditLog, caseSignals }, 'case1')).toEqual([]);
  });
});

describe('isNonTrivialChange', () => {
  it('is false for an empty or missing change list', () => {
    expect(isNonTrivialChange([])).toBe(false);
    expect(isNonTrivialChange(undefined)).toBe(false);
  });

  it('is true once there is at least one change', () => {
    expect(isNonTrivialChange([{ label: 'x' }])).toBe(true);
  });
});
