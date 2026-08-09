import { describe, it, expect } from 'vitest';
import { buildCaseTimeline } from '../lib/caseTimeline';

const baseCase = {
  id: 'case1',
  dateReceived: '2026-08-01',
  caseType: 'misconduct',
  meetings: [],
};

describe('buildCaseTimeline', () => {
  it('includes a case-opened entry from dateReceived', () => {
    const result = buildCaseTimeline(baseCase, [], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'case', description: 'Case opened — misconduct' });
  });

  it('includes one entry per meeting, plus a letter entry when the meeting has letterOutput', () => {
    const cs = {
      ...baseCase,
      meetings: [
        { id: 'm1', type: 'Investigation meeting', date: '2026-08-03', manager: 'Jo', savedAt: '2026-08-03' },
        { id: 'm2', type: 'Disciplinary hearing', date: '2026-08-05', savedBy: 'Sam', letterOutput: 'Dear...', savedAt: '2026-08-05' },
      ],
    };
    const result = buildCaseTimeline(cs, [], []);
    const meetingEntries = result.filter(e => e.type === 'meeting');
    const letterEntries = result.filter(e => e.type === 'letter');
    expect(meetingEntries).toHaveLength(2);
    expect(letterEntries).toHaveLength(1);
    expect(letterEntries[0].linkTo).toEqual({ kind: 'meeting', id: 'm2' });
  });

  it('includes an investigation report entry and an outcome entry when present', () => {
    const cs = { ...baseCase, investigationReport: 'text', investigationReportDate: '2026-08-04', outcome: 'Final written warning', outcomeDate: '2026-08-06' };
    const result = buildCaseTimeline(cs, [], []);
    expect(result.find(e => e.type === 'report')).toMatchObject({ description: 'Investigation report generated' });
    expect(result.find(e => e.type === 'outcome')).toMatchObject({ description: 'Outcome issued: Final written warning' });
  });

  it('includes one entry per allegation scoped to this case only', () => {
    const allegations = [
      { id: 'a1', caseId: 'case1', title: 'Left site early', createdAt: '2026-08-02' },
      { id: 'a2', caseId: 'other-case', title: 'Unrelated', createdAt: '2026-08-02' },
    ];
    const result = buildCaseTimeline(baseCase, allegations, []);
    const allegationEntries = result.filter(e => e.type === 'allegation');
    expect(allegationEntries).toHaveLength(1);
    expect(allegationEntries[0].description).toBe('Allegation added: Left site early');
  });

  it('includes case-scoped audit_log entries, excluding Allegation-prefixed ones (already shown via the allegations source)', () => {
    const auditLog = [
      { ts: '2026-08-03', user: 'Jo', action: 'Case marked confidential', detail: '', caseId: 'case1' },
      { ts: '2026-08-02', user: 'Jo', action: 'Allegation added', detail: 'Left site early', caseId: 'case1' },
      { ts: '2026-08-02', user: 'Jo', action: 'Case marked confidential', detail: '', caseId: 'other-case' },
    ];
    const result = buildCaseTimeline(baseCase, [], auditLog);
    const auditEntries = result.filter(e => e.type === 'audit');
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].description).toBe('Case marked confidential');
  });

  it('sorts all entries chronologically ascending regardless of source order', () => {
    const cs = {
      ...baseCase,
      dateReceived: '2026-08-05',
      meetings: [{ id: 'm1', type: 'Investigation meeting', date: '2026-08-01' }],
      outcome: 'Dismissal', outcomeDate: '2026-08-10',
    };
    const result = buildCaseTimeline(cs, [], []);
    const dates = result.map(e => e.date);
    expect(dates).toEqual(['2026-08-01', '2026-08-05', '2026-08-10']);
  });

  it('treats an unparseable date as earliest rather than throwing', () => {
    const cs = { ...baseCase, dateReceived: 'not-a-date' };
    expect(() => buildCaseTimeline(cs, [], [])).not.toThrow();
  });
});
