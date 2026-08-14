import { describe, it, expect } from 'vitest';
import { buildEscalationContext } from '../lib/escalation.js';

describe('buildEscalationContext', () => {
  it('builds a full context snapshot with every field present', () => {
    const result = buildEscalationContext({
      employeeName: 'Sam Employee', caseType: 'misconduct', stageLabel: 'Investigation',
      lastMeeting: { type: 'Investigation', date: '14/08/2026' },
      allegationsCount: 2, evidenceCount: 3, openQuestionsCount: 1, note: 'Employee is getting agitated in meetings.',
    });
    expect(result).toBe(
      'Case: Sam Employee (misconduct)\n' +
      'Stage: Investigation\n' +
      'Most recent meeting: Investigation on 14/08/2026\n' +
      'Allegations on file: 2\n' +
      'Evidence on file: 3\n' +
      'Outstanding questions: 1\n' +
      '\n' +
      'Note from the manager:\n' +
      'Employee is getting agitated in meetings.'
    );
  });

  it('omits the stage line when no stage label is given', () => {
    const result = buildEscalationContext({ employeeName: 'Sam Employee' });
    expect(result).not.toContain('Stage:');
  });

  it('reports no meetings recorded yet when there is no last meeting', () => {
    const result = buildEscalationContext({ employeeName: 'Sam Employee' });
    expect(result).toContain('No meetings recorded yet.');
  });

  it('omits the outstanding questions line when there are none', () => {
    const result = buildEscalationContext({ employeeName: 'Sam Employee', openQuestionsCount: 0 });
    expect(result).not.toContain('Outstanding questions');
  });

  it('omits the manager note section entirely when no note is given', () => {
    const result = buildEscalationContext({ employeeName: 'Sam Employee' });
    expect(result).not.toContain('Note from the manager');
  });

  it('omits the manager note section for a whitespace-only note', () => {
    const result = buildEscalationContext({ employeeName: 'Sam Employee', note: '   ' });
    expect(result).not.toContain('Note from the manager');
  });

  it('defaults counts to zero when not provided', () => {
    const result = buildEscalationContext({ employeeName: 'Sam Employee' });
    expect(result).toContain('Allegations on file: 0');
    expect(result).toContain('Evidence on file: 0');
  });
});
