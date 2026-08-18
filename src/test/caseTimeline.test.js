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

  it('IP17 — describes a recordless (scheduled but not yet held) meeting as "scheduled", and a recorded one as "held"', () => {
    const cs = {
      ...baseCase,
      meetings: [
        { id: 'm1', type: 'Investigation', date: '2026-08-03', record: null },
        { id: 'm2', type: 'Disciplinary', date: '2026-08-05', record: 'Notes taken' },
      ],
    };
    const result = buildCaseTimeline(cs, [], []);
    expect(result.find(e => e.key === 'meeting-m1').description).toBe('Investigation scheduled');
    expect(result.find(e => e.key === 'meeting-m2').description).toBe('Disciplinary held');
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

  it('gives each entry a stable key and tags allegation entries with their allegationId', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Left site early', createdAt: '2026-08-02' }];
    const result = buildCaseTimeline(baseCase, allegations, []);
    expect(result[0].key).toBe('case-opened');
    const allegationEntry = result.find(e => e.type === 'allegation');
    expect(allegationEntry.key).toBe('allegation-a1');
    expect(allegationEntry.allegationId).toBe('a1');
    expect(result.find(e => e.type === 'case').allegationId).toBeNull();
  });

  it('excludes entries whose key is in overrides.excluded', () => {
    const result = buildCaseTimeline(baseCase, [], [], { excluded: ['case-opened'] });
    expect(result).toHaveLength(0);
  });

  it('applies a description edit from overrides.edits without touching other entries', () => {
    const cs = { ...baseCase, meetings: [{ id: 'm1', type: 'Investigation meeting', date: '2026-08-03' }] };
    const result = buildCaseTimeline(cs, [], [], { edits: { 'meeting-m1': 'Rescheduled investigation meeting held' } });
    expect(result.find(e => e.key === 'meeting-m1').description).toBe('Rescheduled investigation meeting held');
    expect(result.find(e => e.key === 'case-opened').description).toBe('Case opened — misconduct');
  });

  it('attaches a cached relevance note by key, defaulting to null', () => {
    const result = buildCaseTimeline(baseCase, [], [], { relevance: { 'case-opened': 'Origin of the case.' } });
    expect(result[0].relevance).toBe('Origin of the case.');
  });

  it('is a no-op when overrides is omitted, matching the pre-Phase-8 signature', () => {
    const result = buildCaseTimeline(baseCase, [], []);
    expect(result[0].relevance).toBeNull();
  });

  it('IP11 — gives a saved email its own dedicated timeline entry linking back to the Evidence tab', () => {
    const cs = { ...baseCase, evidence: [
      { name: 'Email: Following up', date: '2026-08-03', addedBy: 'Jo', source: 'email' },
      { name: 'CCTV clip', date: '2026-08-03', addedBy: 'Jo' },
    ] };
    const result = buildCaseTimeline(cs, [], []);
    const emailEntries = result.filter(e => e.type === 'email');
    expect(emailEntries).toHaveLength(1);
    expect(emailEntries[0]).toMatchObject({ description: 'Email saved: Email: Following up', actor: 'Jo', linkTo: { kind: 'evidence', id: 0 } });
  });

  it('IP11 — excludes "Email saved to case" audit entries so a saved email never shows twice', () => {
    const cs = { ...baseCase, evidence: [{ name: 'Email: Following up', date: '2026-08-03', addedBy: 'Jo', source: 'email' }] };
    const auditLog = [{ ts: '2026-08-03', user: 'Jo', action: 'Email saved to case', detail: 'Email: Following up', caseId: 'case1' }];
    const result = buildCaseTimeline(cs, [], auditLog);
    expect(result.filter(e => e.type === 'audit')).toHaveLength(0);
    expect(result.filter(e => e.type === 'email')).toHaveLength(1);
  });

  it('IP13 — gives a sent letter its own dedicated (reused "letter" type) timeline entry linking back to the Evidence tab', () => {
    const cs = { ...baseCase, evidence: [
      { name: 'Sent: Witness invitation', date: '2026-08-03', addedBy: 'Jo', source: 'sent_letter' },
    ] };
    const result = buildCaseTimeline(cs, [], []);
    const letterEntries = result.filter(e => e.type === 'letter');
    expect(letterEntries).toHaveLength(1);
    expect(letterEntries[0]).toMatchObject({ description: 'Letter sent: Sent: Witness invitation', actor: 'Jo', linkTo: { kind: 'evidence', id: 0 } });
  });

  it('IP13 — excludes "Letter sent" audit entries so a sent letter never shows twice', () => {
    const cs = { ...baseCase, evidence: [{ name: 'Sent: Witness invitation', date: '2026-08-03', addedBy: 'Jo', source: 'sent_letter' }] };
    const auditLog = [{ ts: '2026-08-03', user: 'Jo', action: 'Letter sent', detail: 'Sent: Witness invitation', caseId: 'case1' }];
    const result = buildCaseTimeline(cs, [], auditLog);
    expect(result.filter(e => e.type === 'audit')).toHaveLength(0);
    expect(result.filter(e => e.type === 'letter')).toHaveLength(1);
  });
});
