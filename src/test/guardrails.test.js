import { describe, it, expect } from 'vitest';
import { computeGuardrailChecks, allegationPolicyClauseRef } from '../lib/guardrails';

const baseCase = { id: 'case1', meetings: [], evidence: [] };

describe('computeGuardrailChecks — chair independence', () => {
  it('flags when the same chair ran both the investigation and the disciplinary hearing', () => {
    const cs = {
      ...baseCase,
      meetings: [
        { id: 'm1', type: 'Investigation', manager: 'Sam Patel', date: '01/08/2026' },
        { id: 'm2', type: 'Disciplinary', manager: 'Sam Patel', date: '10/08/2026' },
      ],
    };
    const checks = computeGuardrailChecks(cs, []);
    const flagged = checks.find(c => c.title === 'Same person chaired the investigation and the disciplinary hearing');
    expect(flagged).toBeTruthy();
    expect(flagged.reasoning).toContain('Sam Patel');
    expect(flagged.sourceRefs).toEqual(expect.arrayContaining([{ kind: 'meeting', id: 'm1' }, { kind: 'meeting', id: 'm2' }]));
  });

  it('does not flag when the chairs are different people', () => {
    const cs = {
      ...baseCase,
      meetings: [
        { id: 'm1', type: 'Investigation', manager: 'Sam Patel', date: '01/08/2026' },
        { id: 'm2', type: 'Disciplinary', manager: 'Alex Chen', date: '10/08/2026' },
      ],
    };
    const checks = computeGuardrailChecks(cs, []);
    expect(checks.find(c => c.title.includes('chaired'))).toBeUndefined();
  });
});

describe('computeGuardrailChecks — evidence after report', () => {
  it('flags evidence dated after the investigation report was concluded', () => {
    const cs = {
      ...baseCase,
      investigationReportDate: '2026-08-01T00:00:00.000Z',
      evidence: [
        { name: 'Late CCTV clip', date: '05/08/2026' },
        { name: 'Early witness note', date: '20/07/2026' },
      ],
    };
    const checks = computeGuardrailChecks(cs, []);
    const flagged = checks.find(c => c.title === 'Evidence added after the investigation report was concluded');
    expect(flagged).toBeTruthy();
    expect(flagged.reasoning).toContain('Late CCTV clip');
    expect(flagged.reasoning).not.toContain('Early witness note');
    expect(flagged.sourceRefs).toEqual([{ kind: 'evidence', id: 0 }]);
  });

  it('does not flag when there is no investigation report yet', () => {
    const cs = { ...baseCase, evidence: [{ name: 'Doc', date: '05/08/2026' }] };
    const checks = computeGuardrailChecks(cs, []);
    expect(checks.find(c => c.title.includes('investigation report'))).toBeUndefined();
  });
});

describe('computeGuardrailChecks — appeal clause', () => {
  it('flags a disciplinary letter with no mention of appeal', () => {
    const cs = {
      ...baseCase,
      meetings: [{ id: 'm1', type: 'Disciplinary', date: '10/08/2026', letterOutput: 'You have been issued a final written warning.' }],
    };
    const checks = computeGuardrailChecks(cs, []);
    expect(checks.find(c => c.title === 'Outcome letter may be missing the right of appeal')).toBeTruthy();
  });

  it('does not flag when the letter mentions appeal', () => {
    const cs = {
      ...baseCase,
      meetings: [{ id: 'm1', type: 'Disciplinary', date: '10/08/2026', letterOutput: 'You may appeal this decision within 5 working days.' }],
    };
    const checks = computeGuardrailChecks(cs, []);
    expect(checks.find(c => c.title.includes('appeal'))).toBeUndefined();
  });

  it('ignores meeting types where an appeal clause is not expected', () => {
    const cs = {
      ...baseCase,
      meetings: [{ id: 'm1', type: 'Informal / 1-1', date: '10/08/2026', letterOutput: 'Summary of our chat.' }],
    };
    const checks = computeGuardrailChecks(cs, []);
    expect(checks.find(c => c.title.includes('appeal'))).toBeUndefined();
  });
});

describe('computeGuardrailChecks — appeal clause, policy citation (P6)', () => {
  const cs = {
    ...baseCase,
    meetings: [{ id: 'm1', type: 'Disciplinary', date: '10/08/2026', letterOutput: 'You have been issued a final written warning.' }],
  };

  it('attaches a policy clause citation when an indexed clause mentions appeal', () => {
    const policies = [{ id: 'p1', name: 'Disciplinary Policy', clauses: [{ heading: 'Right of appeal', text: 'Employees may appeal within 5 working days.' }] }];
    const checks = computeGuardrailChecks(cs, [], policies);
    const flagged = checks.find(c => c.title === 'Outcome letter may be missing the right of appeal');
    expect(flagged.sourceRefs).toEqual(expect.arrayContaining([
      { kind: 'meeting', id: 'm1' },
      { kind: 'policy', id: 'p1', label: 'Disciplinary Policy', clauseHeading: 'Right of appeal', clauseText: 'Employees may appeal within 5 working days.' },
    ]));
  });

  it('has no policy sourceRef when no policy is uploaded', () => {
    const checks = computeGuardrailChecks(cs, [], []);
    const flagged = checks.find(c => c.title === 'Outcome letter may be missing the right of appeal');
    expect(flagged.sourceRefs).toEqual([{ kind: 'meeting', id: 'm1' }]);
  });

  it('has no policy sourceRef when no indexed clause mentions appeal', () => {
    const policies = [{ id: 'p1', name: 'Attendance Policy', clauses: [{ heading: 'Notice period', text: 'Give 48 hours notice.' }] }];
    const checks = computeGuardrailChecks(cs, [], policies);
    const flagged = checks.find(c => c.title === 'Outcome letter may be missing the right of appeal');
    expect(flagged.sourceRefs).toEqual([{ kind: 'meeting', id: 'm1' }]);
  });
});

describe('computeGuardrailChecks — allegation response opportunity (P6)', () => {
  it('flags an allegation with no recorded employee response, once an investigation meeting has actually been held', () => {
    const cs = { ...baseCase, meetings: [{ id: 'm1', type: 'Investigation', record: 'notes', date: '01/08/2026' }] };
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', employeeResponse: '' }];
    const checks = computeGuardrailChecks(cs, allegations);
    const flagged = checks.find(c => c.title === 'An allegation has no recorded employee response');
    expect(flagged).toBeTruthy();
    expect(flagged.sourceRefs).toEqual([{ kind: 'allegation', id: 'a1', label: 'Unauthorised absence' }]);
  });

  it('pluralises the title for more than one unaddressed allegation', () => {
    const cs = { ...baseCase, meetings: [{ id: 'm1', type: 'Investigation', record: 'notes', date: '01/08/2026' }] };
    const allegations = [
      { id: 'a1', caseId: 'case1', title: 'Unauthorised absence', employeeResponse: '' },
      { id: 'a2', caseId: 'case1', title: 'Late timesheets', employeeResponse: '' },
    ];
    const checks = computeGuardrailChecks(cs, allegations);
    expect(checks.find(c => c.title === '2 allegations have no recorded employee response')).toBeTruthy();
  });

  it('does not flag a brand-new case with no investigation/disciplinary meeting held yet — nothing has failed to happen', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', employeeResponse: '' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    expect(checks.find(c => c.title.includes('employee response'))).toBeUndefined();
  });

  it('does not flag once the employee response has been recorded', () => {
    const cs = { ...baseCase, meetings: [{ id: 'm1', type: 'Investigation', record: 'notes', date: '01/08/2026' }] };
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', employeeResponse: 'The employee said they had a medical appointment.' }];
    const checks = computeGuardrailChecks(cs, allegations);
    expect(checks.find(c => c.title.includes('employee response'))).toBeUndefined();
  });

  it('a meeting with no record yet does not count as an opportunity already given', () => {
    const cs = { ...baseCase, meetings: [{ id: 'm1', type: 'Investigation', date: '01/08/2026' }] };
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', employeeResponse: '' }];
    const checks = computeGuardrailChecks(cs, allegations);
    expect(checks.find(c => c.title.includes('employee response'))).toBeUndefined();
  });

  it('attaches a policy clause citation when an indexed clause mentions responding to allegations', () => {
    const cs = { ...baseCase, meetings: [{ id: 'm1', type: 'Investigation', record: 'notes', date: '01/08/2026' }] };
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', employeeResponse: '' }];
    const policies = [{ id: 'p1', name: 'Disciplinary Policy', clauses: [{ heading: 'Right to respond', text: 'Employees must be given a fair opportunity to respond to allegations.' }] }];
    const checks = computeGuardrailChecks(cs, allegations, policies);
    const flagged = checks.find(c => c.title.includes('employee response'));
    expect(flagged.sourceRefs).toEqual(expect.arrayContaining([
      { kind: 'policy', id: 'p1', label: 'Disciplinary Policy', clauseHeading: 'Right to respond', clauseText: 'Employees must be given a fair opportunity to respond to allegations.' },
    ]));
  });
});

describe('computeGuardrailChecks — witness evidence gap', () => {
  it('flags an allegation referencing witness evidence with no witness statement on file', () => {
    const cs = { ...baseCase, evidence: [] };
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Bullying complaint', witnessEvidence: 'Jamie saw the incident.' }];
    const checks = computeGuardrailChecks(cs, allegations);
    const flagged = checks.find(c => c.title === 'Witness evidence referenced but no witness statement is on file');
    expect(flagged).toBeTruthy();
    expect(flagged.sourceRefs).toEqual([{ kind: 'allegation', id: 'a1', label: 'Bullying complaint' }]);
  });

  it('does not flag when a witness statement already exists on the case', () => {
    const cs = { ...baseCase, evidence: [{ name: 'Witness: Jamie Lee (05/08/2026)', type: 'Witness statement', date: '05/08/2026' }] };
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Bullying complaint', witnessEvidence: 'Jamie saw the incident.' }];
    const checks = computeGuardrailChecks(cs, allegations);
    expect(checks.find(c => c.title.includes('witness statement'))).toBeUndefined();
  });

  it('does not flag when no allegation mentions witness evidence', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Late arrival', witnessEvidence: '' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    expect(checks.find(c => c.title.includes('witness statement'))).toBeUndefined();
  });

  it('ignores allegations belonging to a different case', () => {
    const allegations = [{ id: 'a1', caseId: 'other-case', title: 'Issue', witnessEvidence: 'Someone saw it.' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    expect(checks.find(c => c.title.includes('witness statement'))).toBeUndefined();
  });
});

describe('computeGuardrailChecks — decision reasoning missing (Phase 16)', () => {
  it('flags a finding recorded with little or no reasoning', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', decisionReasoning: '' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    const flagged = checks.find(c => c.title === 'A finding was recorded with little or no reasoning');
    expect(flagged).toBeTruthy();
    expect(flagged.sourceRefs).toEqual([{ kind: 'allegation', id: 'a1', label: 'Unauthorised absence' }]);
  });

  it('flags a finding whose reasoning is present but too short to be meaningful', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'not_substantiated', decisionReasoning: 'No evidence.' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    expect(checks.find(c => c.title.includes('little or no reasoning'))).toBeTruthy();
  });

  it('does not flag a finding with substantive reasoning recorded', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', decisionReasoning: 'CCTV footage confirms the employee left the site at 14:32 without authorisation, corroborated by two witness statements.' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    expect(checks.find(c => c.title.includes('little or no reasoning'))).toBeUndefined();
  });

  it('does not flag an allegation still in a procedural (non-finding) status', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'evidence_gathering', decisionReasoning: '' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    expect(checks.find(c => c.title.includes('little or no reasoning'))).toBeUndefined();
  });
});

describe('computeGuardrailChecks — reasoning ignores employee response (P10)', () => {
  it('flags a finding whose reasoning shows no sign of addressing the employee response', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', employeeResponse: 'I was attending a medical appointment and forgot to notify my manager beforehand.', decisionReasoning: 'CCTV footage confirms the employee left the site at 14:32 without authorisation.' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    const flagged = checks.find(c => c.title === "A finding's reasoning may not address the employee's response");
    expect(flagged).toBeTruthy();
    expect(flagged.sourceRefs).toEqual([{ kind: 'allegation', id: 'a1', label: 'Unauthorised absence' }]);
  });

  it('does not flag when the reasoning references words from the employee response', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'not_substantiated', employeeResponse: 'I was attending a medical appointment and forgot to notify my manager beforehand.', decisionReasoning: 'The employee explained they were at a medical appointment; this is corroborated by a GP letter, so the allegation is not substantiated.' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    expect(checks.find(c => c.title.includes("may not address"))).toBeUndefined();
  });

  it('does not flag when there is no employee response recorded (a different check covers that gap)', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', employeeResponse: '', decisionReasoning: 'CCTV footage confirms the employee left the site at 14:32 without authorisation.' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    expect(checks.find(c => c.title.includes("may not address"))).toBeUndefined();
  });

  it('does not flag when the reasoning is too thin (a different check covers that gap)', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', employeeResponse: 'I was attending a medical appointment.', decisionReasoning: 'No evidence.' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    expect(checks.find(c => c.title.includes("may not address"))).toBeUndefined();
  });

  it('does not flag an allegation still in a procedural (non-finding) status', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'evidence_gathering', employeeResponse: 'I was attending a medical appointment.', decisionReasoning: 'CCTV footage confirms the employee left the site without authorisation.' }];
    const checks = computeGuardrailChecks(baseCase, allegations);
    expect(checks.find(c => c.title.includes("may not address"))).toBeUndefined();
  });
});

describe('allegationPolicyClauseRef (P10)', () => {
  it('finds a policy clause matching a significant word from the allegation title', () => {
    const allegation = { title: 'Unauthorised absence on 5 August', description: '' };
    const policies = [{ id: 'p1', name: 'Attendance Policy', clauses: [{ heading: 'Unauthorised absence', text: 'Employees must notify their manager of any absence.' }] }];
    const ref = allegationPolicyClauseRef(allegation, policies);
    expect(ref).toEqual({ kind: 'policy', id: 'p1', label: 'Attendance Policy', clauseHeading: 'Unauthorised absence', clauseText: 'Employees must notify their manager of any absence.' });
  });

  it('returns null when no clause matches', () => {
    const allegation = { title: 'Unauthorised absence', description: '' };
    const policies = [{ id: 'p1', name: 'Expenses Policy', clauses: [{ heading: 'Travel claims', text: 'Submit receipts within 30 days.' }] }];
    expect(allegationPolicyClauseRef(allegation, policies)).toBeNull();
  });

  it('returns null when there are no policies', () => {
    expect(allegationPolicyClauseRef({ title: 'Unauthorised absence', description: '' }, [])).toBeNull();
  });
});

describe('computeGuardrailChecks — appeal manager conflict (P8)', () => {
  const orgMembers = [
    { id: 'm1', user_id: 'u1', name: 'Priya Shah' },
    { id: 'm2', user_id: 'u2', name: 'Tom Norton' },
  ];

  it('flags when the assigned Appeal Manager also made the original decision (via cs.disciplinaryOfficer)', () => {
    const cs = { ...baseCase, disciplinaryOfficer: 'Priya Shah' };
    const caseAccess = [{ caseId: 'case1', userId: 'u1', role: 'appeal_manager' }];
    const checks = computeGuardrailChecks(cs, [], [], caseAccess, orgMembers);
    const flagged = checks.find(c => c.title === 'The Appeal Manager made the original decision');
    expect(flagged).toBeTruthy();
    expect(flagged.reasoning).toContain('Priya Shah');
  });

  it('falls back to the most recent disciplinary/grievance meeting chair when cs.disciplinaryOfficer is not set', () => {
    const cs = { ...baseCase, meetings: [{ id: 'm1', type: 'Disciplinary', manager: 'Priya Shah', date: '10/08/2026' }] };
    const caseAccess = [{ caseId: 'case1', userId: 'u1', role: 'appeal_manager' }];
    const checks = computeGuardrailChecks(cs, [], [], caseAccess, orgMembers);
    expect(checks.find(c => c.title === 'The Appeal Manager made the original decision')).toBeTruthy();
  });

  it('does not flag when the Appeal Manager is a different person', () => {
    const cs = { ...baseCase, disciplinaryOfficer: 'Priya Shah' };
    const caseAccess = [{ caseId: 'case1', userId: 'u2', role: 'appeal_manager' }];
    const checks = computeGuardrailChecks(cs, [], [], caseAccess, orgMembers);
    expect(checks.find(c => c.title === 'The Appeal Manager made the original decision')).toBeUndefined();
  });

  it('does not flag when no Appeal Manager is assigned', () => {
    const cs = { ...baseCase, disciplinaryOfficer: 'Priya Shah' };
    const checks = computeGuardrailChecks(cs, [], [], [], orgMembers);
    expect(checks.find(c => c.title === 'The Appeal Manager made the original decision')).toBeUndefined();
  });

  it('does not flag when there is no original decision maker on record at all', () => {
    const caseAccess = [{ caseId: 'case1', userId: 'u1', role: 'appeal_manager' }];
    const checks = computeGuardrailChecks(baseCase, [], [], caseAccess, orgMembers);
    expect(checks.find(c => c.title === 'The Appeal Manager made the original decision')).toBeUndefined();
  });

  it('ignores an appeal manager assignment on a different case', () => {
    const cs = { ...baseCase, disciplinaryOfficer: 'Priya Shah' };
    const caseAccess = [{ caseId: 'other-case', userId: 'u1', role: 'appeal_manager' }];
    const checks = computeGuardrailChecks(cs, [], [], caseAccess, orgMembers);
    expect(checks.find(c => c.title === 'The Appeal Manager made the original decision')).toBeUndefined();
  });
});

describe('computeGuardrailChecks — clean case', () => {
  it('returns no checks for a case with nothing to flag', () => {
    expect(computeGuardrailChecks(baseCase, [])).toEqual([]);
  });
});
