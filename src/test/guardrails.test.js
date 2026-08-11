import { describe, it, expect } from 'vitest';
import { computeGuardrailChecks } from '../lib/guardrails';

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

describe('computeGuardrailChecks — clean case', () => {
  it('returns no checks for a case with nothing to flag', () => {
    expect(computeGuardrailChecks(baseCase, [])).toEqual([]);
  });
});
