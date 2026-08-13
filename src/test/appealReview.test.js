import { describe, it, expect } from 'vitest';
import { newEvidenceSinceFinding, appealMeetingsForCase, formatAppealGroundReasoning, parseAppealGroundReasoning } from '../lib/appealReview';

describe('newEvidenceSinceFinding', () => {
  const decidedAllegation = { id: 'a1', decidedAt: '2026-08-01T00:00:00.000Z' };

  it('returns evidence dated after the finding was decided', () => {
    const evidence = [
      { name: 'New witness statement', date: '05/08/2026' },
      { name: 'Old CCTV clip', date: '20/07/2026' },
    ];
    const result = newEvidenceSinceFinding(evidence, decidedAllegation);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('New witness statement');
    expect(result[0].index).toBe(0);
  });

  it('returns an empty array when the allegation has no recorded finding yet', () => {
    const evidence = [{ name: 'x', date: '05/08/2026' }];
    expect(newEvidenceSinceFinding(evidence, { id: 'a1', decidedAt: null })).toEqual([]);
  });

  it('returns an empty array when nothing was added after the finding', () => {
    const evidence = [{ name: 'x', date: '20/07/2026' }];
    expect(newEvidenceSinceFinding(evidence, decidedAllegation)).toEqual([]);
  });

  it('handles ISO-formatted evidence dates as well as en-GB', () => {
    const evidence = [{ name: 'x', date: '2026-08-10' }];
    expect(newEvidenceSinceFinding(evidence, decidedAllegation)).toHaveLength(1);
  });
});

describe('appealMeetingsForCase', () => {
  it('finds a saved meeting whose type mentions appeal', () => {
    const cs = { meetings: [{ id: 'm1', type: 'Disciplinary Appeal', record: 'Full record text' }] };
    expect(appealMeetingsForCase(cs)).toHaveLength(1);
  });

  it('ignores an appeal meeting with no record yet', () => {
    const cs = { meetings: [{ id: 'm1', type: 'Disciplinary Appeal', record: '' }] };
    expect(appealMeetingsForCase(cs)).toHaveLength(0);
  });

  it('ignores non-appeal meetings', () => {
    const cs = { meetings: [{ id: 'm1', type: 'Disciplinary', record: 'x' }] };
    expect(appealMeetingsForCase(cs)).toHaveLength(0);
  });

  it('returns an empty array for a case with no meetings', () => {
    expect(appealMeetingsForCase({ meetings: [] })).toEqual([]);
    expect(appealMeetingsForCase({})).toEqual([]);
  });
});

describe('formatAppealGroundReasoning / parseAppealGroundReasoning (P13)', () => {
  it('round-trips all four fields', () => {
    const ground = {
      ground: 'The sanction was disproportionate to the conduct',
      employeeArgument: 'The employee argued a final written warning was excessive for a first offence.',
      compassReview: 'The original reasoning cites no prior disciplinary history, consistent with the employee\'s account.',
      potentialIssue: 'No comparison to how similar cases have been sanctioned is recorded in the original finding.',
    };
    const reasoning = formatAppealGroundReasoning(ground);
    expect(parseAppealGroundReasoning(reasoning)).toEqual(ground);
  });

  it('omits potentialIssue from the formatted text when not given, and parses back to an empty string', () => {
    const ground = { ground: 'New evidence was not considered', employeeArgument: 'A witness statement was submitted after the hearing.', compassReview: 'The original finding predates this witness statement.', potentialIssue: '' };
    const reasoning = formatAppealGroundReasoning(ground);
    expect(reasoning).not.toContain('Potential issue:');
    expect(parseAppealGroundReasoning(reasoning).potentialIssue).toBe('');
  });

  it('parses fields correctly even when their content itself contains blank lines', () => {
    const ground = {
      ground: 'Procedural unfairness',
      employeeArgument: 'The employee argued they were not given the evidence in advance.\n\nThey only saw it at the hearing itself.',
      compassReview: 'The investigation report was sent 2 working days before the hearing.',
      potentialIssue: '',
    };
    const reasoning = formatAppealGroundReasoning(ground);
    const parsed = parseAppealGroundReasoning(reasoning);
    expect(parsed.employeeArgument).toBe(ground.employeeArgument);
    expect(parsed.compassReview).toBe(ground.compassReview);
  });

  it('returns empty strings for all fields when reasoning is empty or missing', () => {
    expect(parseAppealGroundReasoning('')).toEqual({ ground: '', employeeArgument: '', compassReview: '', potentialIssue: '' });
    expect(parseAppealGroundReasoning(undefined)).toEqual({ ground: '', employeeArgument: '', compassReview: '', potentialIssue: '' });
  });
});
