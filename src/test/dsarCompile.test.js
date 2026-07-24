import { describe, it, expect } from 'vitest';
import { compileSubjectData } from '../lib/dsarCompile.js';

const baseData = {
  employeeRecords: [
    { name: 'Ada Lovelace', jobTitle: 'Engineer', startDate: '01/01/2020', location: 'London' },
    { name: 'Grace Hopper', jobTitle: 'Manager', startDate: '01/01/2015', location: 'London' },
  ],
  cases: [
    {
      id: 'c1',
      employeeName: 'Ada Lovelace',
      caseType: 'Grievance',
      meetings: [
        { id: 'm1', type: 'Investigation', date: '2026-01-01', record: 'Ada raised a concern about Grace Hopper being unfair.', transcript: [{ speaker: 'HR', text: 'Can you tell me more about Grace Hopper?' }] },
      ],
    },
    {
      id: 'c2',
      employeeName: 'Grace Hopper',
      caseType: 'Misconduct',
      meetings: [{ id: 'm2', type: 'Investigation', date: '2026-02-01', record: 'Unrelated to Ada.' }],
    },
  ],
  starterInstances: [{ id: 's1', name: 'Ada Lovelace', tasks: [] }],
};

describe('compileSubjectData', () => {
  it('includes only the named subject\'s own cases', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].id).toBe('c1');
  });

  it('includes the subject\'s employee record and onboarding data', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.employeeRecord.jobTitle).toBe('Engineer');
    expect(result.onboarding).toHaveLength(1);
  });

  it('returns null employeeRecord and empty arrays for an unknown person', () => {
    const result = compileSubjectData('Nobody Here', baseData);
    expect(result.employeeRecord).toBeNull();
    expect(result.cases).toHaveLength(0);
    expect(result.onboarding).toHaveLength(0);
  });

  it('flags third-party name mentions in meeting record text', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    const recordFlags = result.flaggedThirdPartyMentions.filter(f => f.field === 'record');
    expect(recordFlags).toHaveLength(1);
    expect(recordFlags[0].mentionedName).toBe('Grace Hopper');
  });

  it('flags third-party name mentions inside transcript utterances', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    const transcriptFlags = result.flaggedThirdPartyMentions.filter(f => f.field.startsWith('transcript'));
    expect(transcriptFlags).toHaveLength(1);
    expect(transcriptFlags[0].mentionedName).toBe('Grace Hopper');
  });

  it('does not flag the subject\'s own name', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.flaggedThirdPartyMentions.some(f => f.mentionedName === 'Ada Lovelace')).toBe(false);
  });
});
