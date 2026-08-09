import { describe, it, expect } from 'vitest';
import { buildCaseContext } from '../lib/caseContext';

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
});
