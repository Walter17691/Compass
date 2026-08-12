import { describe, it, expect } from 'vitest';
import { buildCaseContext, meetingsNeedingSummary, buildOverviewSourceRefs } from '../lib/caseContext';

const baseCase = { employeeName: 'Ada Lovelace', caseType: 'misconduct', dateReceived: '2026-08-01', description: 'Alleged unauthorised absence.' };

describe('buildCaseContext', () => {
  it('includes the case summary', () => {
    const ctx = buildCaseContext(baseCase, [], []);
    expect(ctx).toContain('Employee: Ada Lovelace');
    expect(ctx).toContain('Case type: misconduct');
    expect(ctx).toContain('Alleged unauthorised absence.');
  });

  it('includes allegations with status, response, and witness evidence', () => {
    const allegations = [{ id: 'a1', title: 'Left site early', period: '5 Aug', status: 'evidence_gathering', employeeResponse: 'Denies it', witnessEvidence: 'Colleague saw them leave' }];
    const ctx = buildCaseContext(baseCase, allegations, []);
    expect(ctx).toContain('Left site early (5 Aug) — status: evidence_gathering');
    expect(ctx).toContain('Employee response: Denies it');
    expect(ctx).toContain('Witness evidence: Colleague saw them leave');
  });

  it('includes evidence linked to allegations with its stance, resolving the allegation title', () => {
    const allegations = [{ id: 'a1', title: 'Left site early', status: 'unreviewed' }];
    const cs = { ...baseCase, evidence: [{ name: 'cctv.mp4', allegationId: 'a1', stance: 'supports' }, { name: 'unlinked.pdf' }] };
    const ctx = buildCaseContext(cs, allegations, []);
    expect(ctx).toContain('cctv.mp4 — supports "Left site early"');
    expect(ctx).not.toContain('unlinked.pdf');
  });

  it('includes meeting records, truncated', () => {
    const cs = { ...baseCase, meetings: [{ type: 'Investigation meeting', date: '2026-08-03', record: 'x'.repeat(600) }] };
    const ctx = buildCaseContext(cs, [], []);
    expect(ctx).toContain('Investigation meeting on 2026-08-03');
    expect(ctx.match(/x/g).length).toBeLessThanOrEqual(500);
  });

  it('includes the investigation report and outcome when present', () => {
    const cs = { ...baseCase, investigationReport: 'Findings: substantiated.', outcome: 'Final written warning', outcomeDate: '2026-08-10' };
    const ctx = buildCaseContext(cs, [], []);
    expect(ctx).toContain('Findings: substantiated.');
    expect(ctx).toContain('OUTCOME ISSUED: Final written warning on 2026-08-10');
  });

  it('includes only open tasks', () => {
    const tasks = [{ name: 'Chase statement', dueDate: '2026-08-12', status: 'open' }, { name: 'Done thing', status: 'done' }];
    const ctx = buildCaseContext(baseCase, [], tasks);
    expect(ctx).toContain('Chase statement (due 2026-08-12)');
    expect(ctx).not.toContain('Done thing');
  });

  it('omits sections with no data instead of printing empty headers', () => {
    const ctx = buildCaseContext(baseCase, [], []);
    expect(ctx).not.toContain('ALLEGATIONS:');
    expect(ctx).not.toContain('MEETINGS:');
    expect(ctx).not.toContain('OPEN TASKS:');
  });

  it('includes an allegation\'s decision reasoning and appeal outcome (Phase 21)', () => {
    const allegations = [{
      id: 'a1', title: 'Left site early', status: 'substantiated',
      decisionReasoning: 'Swipe-card records confirm it.', decidedAt: '2026-08-05',
      appealOutcome: 'not_upheld', appealReasoning: 'No new evidence raised.', appealDecidedAt: '2026-08-12',
    }];
    const ctx = buildCaseContext(baseCase, allegations, []);
    expect(ctx).toContain('Decision: Swipe-card records confirm it. (decided 2026-08-05)');
    expect(ctx).toContain('Appeal outcome: not_upheld — No new evidence raised. (decided 2026-08-12)');
  });

  it('includes a meeting\'s sent letter, with its approval note (Phase 21)', () => {
    const cs = { ...baseCase, meetings: [{ type: 'Outcome meeting', date: '2026-08-05', letterOutput: 'You are issued a final written warning.', letterApprovedAt: '2026-08-05' }] };
    const ctx = buildCaseContext(cs, [], []);
    expect(ctx).toContain('Letter sent (approved 2026-08-05): You are issued a final written warning.');
  });

  it('keeps every meeting in full detail while the total is under budget', () => {
    const meetings = Array.from({ length: 5 }, (_, i) => ({ type: 'Meeting', date: `2026-08-0${i + 1}`, record: `content-${i}` }));
    const ctx = buildCaseContext({ ...baseCase, meetings }, [], []);
    meetings.forEach((_, i) => expect(ctx).toContain(`content-${i}`));
  });

  it('compresses older meetings once the total exceeds budget, keeping the most recent ones in full', () => {
    // Newest meeting is a distinct large block; several older ones push
    // the running total over budget once walked newest-first.
    const meetings = [
      { id: 'old1', type: 'Meeting', date: '2026-01-01', record: 'x'.repeat(4000) },
      { id: 'old2', type: 'Meeting', date: '2026-02-01', record: 'y'.repeat(4000) },
      { id: 'recent', type: 'Meeting', date: '2026-08-01', record: 'RECENT-CONTENT-MARKER'.repeat(30) },
    ];
    const ctx = buildCaseContext({ ...baseCase, meetings }, [], []);
    // The most recent meeting (walked first) stays within budget, so it's
    // still present at full detail.
    expect(ctx).toContain('RECENT-CONTENT-MARKER');
    // The oldest meeting falls outside the budget and has no cached
    // summary, so it degrades to the short fallback excerpt, not its
    // full 4000-char record.
    expect((ctx.match(/x/g) || []).length).toBeLessThan(4000);
  });

  it('uses a cached meeting summary instead of the fallback excerpt once one exists', () => {
    const meetings = [
      { id: 'old1', type: 'Meeting', date: '2026-01-01', record: 'x'.repeat(4000) },
      { id: 'old2', type: 'Meeting', date: '2026-02-01', record: 'y'.repeat(4000) },
      { id: 'recent', type: 'Meeting', date: '2026-08-01', record: 'z'.repeat(3000) },
    ];
    const ctx = buildCaseContext({ ...baseCase, meetings }, [], [], { old1: 'Summary: nothing of note happened.' });
    expect(ctx).toContain('Summary: nothing of note happened.');
    expect(ctx).not.toContain('x'.repeat(200));
  });

  it('never fully drops the investigation report/outcome/tasks even with many meetings (no more blind 12000-char cutoff)', () => {
    const meetings = Array.from({ length: 10 }, (_, i) => ({ type: 'Meeting', date: '2026-08-01', record: 'filler '.repeat(400) }));
    const cs = { ...baseCase, meetings, investigationReport: 'UNIQUE-REPORT-MARKER', outcome: 'UNIQUE-OUTCOME-MARKER' };
    const ctx = buildCaseContext(cs, [], [{ name: 'UNIQUE-TASK-MARKER', status: 'open' }]);
    expect(ctx).toContain('UNIQUE-REPORT-MARKER');
    expect(ctx).toContain('UNIQUE-OUTCOME-MARKER');
    expect(ctx).toContain('UNIQUE-TASK-MARKER');
  });
});

describe('meetingsNeedingSummary', () => {
  const manyMeetings = [
    { id: 'old1', type: 'Meeting', date: '2026-01-01', record: 'x'.repeat(4000) },
    { id: 'old2', type: 'Meeting', date: '2026-02-01', record: 'y'.repeat(4000) },
    { id: 'recent', type: 'Meeting', date: '2026-08-01', record: 'z'.repeat(500) },
  ];

  it('returns nothing when the case has few/short meetings', () => {
    expect(meetingsNeedingSummary({ ...baseCase, meetings: [{ id: 'm1', record: 'short' }] })).toEqual([]);
  });

  it('returns only the older meetings that fall outside budget', () => {
    const result = meetingsNeedingSummary({ ...baseCase, meetings: manyMeetings });
    expect(result.map(m => m.id)).toContain('old1');
    expect(result.map(m => m.id)).not.toContain('recent');
  });

  it('excludes a meeting that already has a cached summary', () => {
    const result = meetingsNeedingSummary({ ...baseCase, meetings: manyMeetings }, { old1: 'Already summarised.' });
    expect(result.map(m => m.id)).not.toContain('old1');
  });
});

describe('buildOverviewSourceRefs (Phase 23)', () => {
  it('produces a sourceRef per allegation and per meeting, in WhySourcesModal shape', () => {
    const allegations = [{ id: 'a1', title: 'Left site early' }];
    const meetings = [{ id: 'm1', type: 'Investigation meeting' }];
    expect(buildOverviewSourceRefs(allegations, meetings)).toEqual([
      { kind: 'allegation', id: 'a1', label: 'Left site early' },
      { kind: 'meeting', id: 'm1', label: 'Investigation meeting' },
    ]);
  });

  it('falls back to a generic label for a meeting with no type', () => {
    expect(buildOverviewSourceRefs([], [{ id: 'm1' }])).toEqual([{ kind: 'meeting', id: 'm1', label: 'Meeting' }]);
  });

  it('returns an empty array for a case with no allegations or meetings', () => {
    expect(buildOverviewSourceRefs([], [])).toEqual([]);
    expect(buildOverviewSourceRefs()).toEqual([]);
  });
});
