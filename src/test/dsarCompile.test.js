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

// Phase 6.5 hardening (Batch 5) — a DSAR response must cover everything
// Compass holds about the named individual, not just what's embedded on
// the case object. These sources live in their own state/tables and were
// previously omitted from the export entirely.
describe('compileSubjectData — additional data sources (Phase 6.5, Batch 5)', () => {
  const extendedData = {
    ...baseData,
    wellbeingNotes: [
      { id: 'w1', employeeName: 'Ada Lovelace', content: 'Ada mentioned feeling unsupported by Grace Hopper.' },
      { id: 'w2', employeeName: 'Grace Hopper', content: 'Unrelated note about Grace.' },
    ],
    concernReferrals: [
      { id: 'r1', employeeName: 'Ada Lovelace', description: 'Concern raised about workload.', witnesses: 'Saw Grace Hopper involved too.' },
      { id: 'r2', employeeName: 'Grace Hopper', description: 'Unrelated referral.' },
    ],
    allegations: [
      { id: 'a1', caseId: 'c1', title: 'Unfair treatment', peopleInvolved: 'Grace Hopper was also present.' },
      { id: 'a2', caseId: 'c2', title: 'Unrelated allegation' },
    ],
    caseSignals: [
      { id: 'sig1', caseId: 'c1', title: 'Guardrail flag on c1' },
      { id: 'sig2', caseId: 'c2', title: 'Guardrail flag on c2' },
    ],
    hrReviewRequests: [
      { id: 'hr1', case_id: 'c1', status: 'approved' },
      { id: 'hr2', case_id: 'c2', status: 'approved' },
    ],
    auditLog: [
      { id: 'log1', caseId: 'c1', action: 'Case opened' },
      { id: 'log2', caseId: 'c2', action: 'Unrelated case action' },
      { id: 'log3', caseId: null, action: 'Org-level action, not case-linked' },
    ],
  };

  it('includes only the subject\'s own wellbeing notes', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.wellbeingNotes).toEqual([extendedData.wellbeingNotes[0]]);
  });

  it('includes only the subject\'s own concern referrals', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.concernReferrals).toEqual([extendedData.concernReferrals[0]]);
  });

  it('includes only allegations on the subject\'s own cases', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.allegations).toEqual([extendedData.allegations[0]]);
  });

  it('includes only case signals on the subject\'s own cases', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.caseSignals).toEqual([extendedData.caseSignals[0]]);
  });

  it('includes only HR review requests on the subject\'s own cases, matching the raw case_id shape', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.hrReviewRequests).toEqual([extendedData.hrReviewRequests[0]]);
  });

  it('includes only audit log entries on the subject\'s own cases, excluding org-level entries with no case link', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.auditLog).toEqual([extendedData.auditLog[0]]);
  });

  it('flags a third-party name mentioned in a wellbeing note', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.flaggedThirdPartyMentions.some(f => f.field === 'wellbeingNote.content' && f.mentionedName === 'Grace Hopper')).toBe(true);
  });

  it('flags a third-party name mentioned in a concern referral', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.flaggedThirdPartyMentions.some(f => f.field === 'concernReferral.witnesses' && f.mentionedName === 'Grace Hopper')).toBe(true);
  });

  it('flags a third-party name mentioned in an allegation field', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.flaggedThirdPartyMentions.some(f => f.field === 'allegation.peopleInvolved' && f.mentionedName === 'Grace Hopper')).toBe(true);
  });

  it('defaults every new source to an empty array when omitted, matching the original call shape', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.wellbeingNotes).toEqual([]);
    expect(result.concernReferrals).toEqual([]);
    expect(result.allegations).toEqual([]);
    expect(result.caseSignals).toEqual([]);
    expect(result.hrReviewRequests).toEqual([]);
    expect(result.auditLog).toEqual([]);
  });
});

// Phase 6.5 hardening (data-lifecycle review) — caseTasks (the "tasks"
// category the wider data-inventory review names explicitly) and
// signingRequests/portalAccounts (the two categories with zero
// client-facing RLS — passed in already-fetched from
// api/portal/_dsar-lookup.js, since this module has no way to query them
// itself).
describe('compileSubjectData — tasks, signing requests and portal access (Phase 6.5)', () => {
  const extendedData = {
    ...baseData,
    caseTasks: [
      { id: 't1', caseId: 'c1', name: 'Interview Ada' },
      { id: 't2', caseId: 'c2', name: 'Unrelated task' },
    ],
    signingRequests: [
      { sign_id: 'sr1', employee_name: 'Ada Lovelace', document: 'Investigation record — mentions Grace Hopper as chair.', status: 'signed' },
      { sign_id: 'sr2', employee_name: 'Grace Hopper', document: 'Unrelated document', status: 'sent' },
    ],
    portalAccounts: [
      { id: 'pa1', employee_name: 'Ada Lovelace', employee_email: 'ada@example.com' },
      { id: 'pa2', employee_name: 'Grace Hopper', employee_email: 'grace@example.com' },
    ],
  };

  it('includes only tasks on the subject\'s own cases', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.caseTasks).toEqual([extendedData.caseTasks[0]]);
  });

  it('includes only the subject\'s own signing requests, matched by employee_name', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.signingRequests).toEqual([extendedData.signingRequests[0]]);
  });

  it('flags a third-party name mentioned inside a signing request\'s document text', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.flaggedThirdPartyMentions.some(f => f.field === 'signingRequest.document' && f.mentionedName === 'Grace Hopper')).toBe(true);
  });

  it('includes only the subject\'s own portal account', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.portalAccounts).toEqual([extendedData.portalAccounts[0]]);
  });

  it('defaults tasks/signingRequests/portalAccounts to empty arrays when omitted', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.caseTasks).toEqual([]);
    expect(result.signingRequests).toEqual([]);
    expect(result.portalAccounts).toEqual([]);
  });
});

// Phase 6.5 hardening (data-lifecycle review) — a name is not a stable
// identity. The task's own required scenario: a DSAR for Employee A must
// not include Employee B merely because they share a similar name.
describe('compileSubjectData — same-name collision detection (Phase 6.5)', () => {
  it('does not flag a collision for an ordinary, unambiguous subject', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.possibleNameCollision).toBe(false);
  });

  it('flags a collision when two employee_records rows share the exact same name', () => {
    const data = {
      ...baseData,
      employeeRecords: [
        { name: 'Sam Employee', jobTitle: 'Engineer', location: 'London' },
        { name: 'Sam Employee', jobTitle: 'Sales', location: 'Manchester' },
      ],
    };
    const result = compileSubjectData('Sam Employee', data);
    expect(result.possibleNameCollision).toBe(true);
  });

  it('flags a collision when the subject\'s own cases carry more than one distinct employee_email', () => {
    const data = {
      ...baseData,
      cases: [
        { id: 'c1', employeeName: 'Sam Employee', employeeEmail: 'sam.london@acme.com', meetings: [] },
        { id: 'c2', employeeName: 'Sam Employee', employeeEmail: 'sam.manchester@acme.com', meetings: [] },
      ],
    };
    const result = compileSubjectData('Sam Employee', data);
    expect(result.possibleNameCollision).toBe(true);
    // Both cases are still included — the flag is a warning for HR to
    // investigate before relying on the export, not a silent exclusion.
    expect(result.cases).toHaveLength(2);
  });

  it('does not flag a collision when cases share the same email, or have no email on file at all', () => {
    const data = {
      ...baseData,
      cases: [
        { id: 'c1', employeeName: 'Sam Employee', employeeEmail: 'sam@acme.com', meetings: [] },
        { id: 'c2', employeeName: 'Sam Employee', employeeEmail: 'sam@acme.com', meetings: [] },
        { id: 'c3', employeeName: 'Sam Employee', meetings: [] },
      ],
    };
    const result = compileSubjectData('Sam Employee', data);
    expect(result.possibleNameCollision).toBe(false);
  });
});
