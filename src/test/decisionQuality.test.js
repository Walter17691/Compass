import { describe, it, expect } from 'vitest';
import { computeDecisionQualityGaps } from '../lib/decisionQuality';

const baseCase = { id: 'case1', evidence: [] };

describe('computeDecisionQualityGaps — allegation findings', () => {
  it('flags an allegation still in a procedural (non-finding) status', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'evidence_gathering' }];
    const gaps = computeDecisionQualityGaps(baseCase, allegations, []);
    expect(gaps).toContain('Allegation not yet decided: "Unauthorised absence"');
  });

  it('does not run the finding-only checks on a procedural-status allegation', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'evidence_gathering', decisionReasoning: '', employeeResponse: '' }];
    const gaps = computeDecisionQualityGaps(baseCase, allegations, []);
    expect(gaps.filter(g => g.includes('Unauthorised absence'))).toHaveLength(1);
  });
});

describe('computeDecisionQualityGaps — reasoning and employee response', () => {
  it('flags a finding with little or no reasoning', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', decisionReasoning: 'No evidence.', employeeResponse: 'I was ill.' }];
    const gaps = computeDecisionQualityGaps({ ...baseCase, evidence: [{ allegationId: 'a1' }] }, allegations, []);
    expect(gaps).toContain('Finding recorded with little or no reasoning: "Unauthorised absence"');
  });

  it('flags a finding with no employee response recorded', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', decisionReasoning: 'CCTV footage confirms the employee left the site without authorisation.', employeeResponse: '' }];
    const gaps = computeDecisionQualityGaps({ ...baseCase, evidence: [{ allegationId: 'a1' }] }, allegations, []);
    expect(gaps).toContain('No employee response or mitigation recorded before a finding: "Unauthorised absence"');
  });

  it('does not flag a finding with substantive reasoning and a recorded response', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', decisionReasoning: 'CCTV footage confirms the employee left the site without authorisation.', employeeResponse: 'I was ill and forgot to notify my manager.' }];
    const gaps = computeDecisionQualityGaps({ ...baseCase, evidence: [{ allegationId: 'a1' }] }, allegations, []);
    expect(gaps.find(g => g.includes('reasoning'))).toBeUndefined();
    expect(gaps.find(g => g.includes('employee response'))).toBeUndefined();
  });
});

describe('computeDecisionQualityGaps — evidence', () => {
  it('flags a decided allegation with no linked evidence', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', decisionReasoning: 'CCTV footage confirms the employee left the site without authorisation.', employeeResponse: 'I was ill.' }];
    const gaps = computeDecisionQualityGaps(baseCase, allegations, []);
    expect(gaps).toContain('No evidence linked to a decided allegation: "Unauthorised absence"');
  });

  it('does not flag when evidence is linked to the allegation', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', decisionReasoning: 'CCTV footage confirms the employee left the site without authorisation.', employeeResponse: 'I was ill.' }];
    const cs = { ...baseCase, evidence: [{ name: 'cctv.mp4', allegationId: 'a1' }] };
    const gaps = computeDecisionQualityGaps(cs, allegations, []);
    expect(gaps.find(g => g.includes('No evidence linked'))).toBeUndefined();
  });
});

describe('computeDecisionQualityGaps — policy identified', () => {
  const decidedAllegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', decisionReasoning: 'CCTV footage confirms the employee left the site without authorisation.', employeeResponse: 'I was ill.' }];
  const cs = { ...baseCase, evidence: [{ allegationId: 'a1' }] };

  it('flags when no case signal references a policy', () => {
    const gaps = computeDecisionQualityGaps(cs, decidedAllegations, []);
    expect(gaps).toContain("No company policy has been identified as relevant to this case's decision.");
  });

  it('does not flag when a case signal already carries a policy sourceRef', () => {
    const caseSignals = [{ id: 's1', caseId: 'case1', type: 'next_action', status: 'accepted', sourceRefs: [{ kind: 'policy', id: 'p1', label: 'Attendance Policy' }] }];
    const gaps = computeDecisionQualityGaps(cs, decidedAllegations, caseSignals);
    expect(gaps.find(g => g.includes('policy'))).toBeUndefined();
  });

  it('does not flag policy when no allegation has a finding yet', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'unreviewed' }];
    const gaps = computeDecisionQualityGaps(baseCase, allegations, []);
    expect(gaps.find(g => g.includes('policy'))).toBeUndefined();
  });
});

describe('computeDecisionQualityGaps — unresolved guardrail signals', () => {
  it('flags an open procedural guardrail signal for the case', () => {
    const caseSignals = [{ id: 's1', caseId: 'case1', type: 'process_risk', status: 'open', title: 'Same person chaired the investigation and the disciplinary hearing' }];
    const gaps = computeDecisionQualityGaps(baseCase, [], caseSignals);
    expect(gaps).toContain('Unresolved procedural guardrail: "Same person chaired the investigation and the disciplinary hearing"');
  });

  it('does not flag a resolved guardrail signal', () => {
    const caseSignals = [{ id: 's1', caseId: 'case1', type: 'process_risk', status: 'resolved', title: 'Same person chaired the investigation and the disciplinary hearing' }];
    const gaps = computeDecisionQualityGaps(baseCase, [], caseSignals);
    expect(gaps.find(g => g.includes('guardrail'))).toBeUndefined();
  });

  it('does not flag a guardrail signal from a different case', () => {
    const caseSignals = [{ id: 's1', caseId: 'other-case', type: 'process_risk', status: 'open', title: 'Some other issue' }];
    const gaps = computeDecisionQualityGaps(baseCase, [], caseSignals);
    expect(gaps.find(g => g.includes('guardrail'))).toBeUndefined();
  });
});

describe('computeDecisionQualityGaps — outcome rationale', () => {
  it('flags an outcome recorded with no notes', () => {
    const cs = { ...baseCase, outcome: 'Final written warning', outcomeNotes: '' };
    const gaps = computeDecisionQualityGaps(cs, [], []);
    expect(gaps).toContain('Outcome recorded without a documented rationale.');
  });

  it('does not flag an outcome recorded with notes', () => {
    const cs = { ...baseCase, outcome: 'Final written warning', outcomeNotes: 'Consistent with the disciplinary policy and past cases of a similar nature.' };
    const gaps = computeDecisionQualityGaps(cs, [], []);
    expect(gaps.find(g => g.includes('rationale'))).toBeUndefined();
  });

  it('does not flag when no outcome has been recorded yet', () => {
    const gaps = computeDecisionQualityGaps(baseCase, [], []);
    expect(gaps.find(g => g.includes('rationale'))).toBeUndefined();
  });
});

describe('computeDecisionQualityGaps — clean case', () => {
  it('returns no gaps for a fully documented decision', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', decisionReasoning: 'CCTV footage confirms the employee left the site at 14:32 without authorisation.', employeeResponse: 'I was ill and forgot to notify my manager.' }];
    const caseSignals = [{ id: 's1', caseId: 'case1', type: 'next_action', status: 'accepted', sourceRefs: [{ kind: 'policy', id: 'p1', label: 'Attendance Policy' }] }];
    const cs = { id: 'case1', evidence: [{ name: 'cctv.mp4', allegationId: 'a1' }], outcome: 'Final written warning', outcomeNotes: 'Consistent with policy and past cases.' };
    expect(computeDecisionQualityGaps(cs, allegations, caseSignals)).toEqual([]);
  });
});
