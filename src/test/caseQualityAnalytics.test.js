import { describe, it, expect } from 'vitest';
import { computeCaseQualityAnalytics } from '../lib/caseQualityAnalytics';

describe('computeCaseQualityAnalytics', () => {
  it('tallies a readiness gap across cases that each have it', () => {
    const cases = [{ id: 'c1' }, { id: 'c2' }];
    const allegations = [
      { id: 'a1', caseId: 'c1', title: 'Late for shift', description: 'desc' },
      { id: 'a2', caseId: 'c2', title: 'Late for shift', description: 'desc' },
    ];
    // No employeeResponse recorded on either allegation -> "employee_responded" fails for both.
    const result = computeCaseQualityAnalytics(cases, allegations, [], [], [], [], []);
    const issue = result.issues.find(i => i.id === 'employee_responded');
    expect(issue.count).toBe(2);
    expect(issue.pct).toBe(100);
  });

  it('tallies a guardrail check by its stable id, not its (sometimes pluralised) title text', () => {
    const cases = [
      { id: 'c1', meetings: [{ type: 'Investigation', record: 'x' }] },
      { id: 'c2', meetings: [{ type: 'Investigation', record: 'x' }] },
    ];
    // checkAllegationResponseOpportunity's title pluralises by count, but
    // both cases should still tally under the same "employee_response_opportunity" id.
    const allegations = [
      { id: 'a1', caseId: 'c1', title: 'X' },
      { id: 'a2', caseId: 'c2', title: 'Y' },
    ];
    const result = computeCaseQualityAnalytics(cases, allegations, [], [], [], [], []);
    const issue = result.issues.find(i => i.id === 'employee_response_opportunity');
    expect(issue.count).toBe(2);
  });

  it('skips readiness gaps for a case with no recorded allegations at all', () => {
    const cases = [{ id: 'c1' }];
    const result = computeCaseQualityAnalytics(cases, [], [], [], [], [], []);
    expect(result.issues.some(i => i.id === 'employee_responded')).toBe(false);
  });

  it('sorts issues by count, most frequent first', () => {
    const cases = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    const allegations = [
      { id: 'a1', caseId: 'c1', title: 'X', description: 'd', employeeResponse: 'resp' },
      { id: 'a2', caseId: 'c2', title: 'X', description: 'd', employeeResponse: 'resp' },
      { id: 'a3', caseId: 'c3', title: 'X', description: 'd' },
    ];
    const result = computeCaseQualityAnalytics(cases, allegations, [], [], [], [], []);
    // "evidence_linked" fires for every case (none of them link any
    // evidence to their allegation); "employee_responded" fires for only
    // 1 (c3, the only one with no employeeResponse) — it must rank last.
    const evidenceLinked = result.issues.find(i => i.id === 'evidence_linked');
    const employeeResponded = result.issues.find(i => i.id === 'employee_responded');
    expect(evidenceLinked.count).toBe(3);
    expect(employeeResponded.count).toBe(1);
    expect(result.issues.indexOf(employeeResponded)).toBe(result.issues.length - 1);
  });

  it('returns an empty issue list and totalCases 0 for no cases', () => {
    const result = computeCaseQualityAnalytics([], [], [], [], [], [], []);
    expect(result.totalCases).toBe(0);
    expect(result.issues).toEqual([]);
  });

  // Phase 6.5 hardening (Batch 8) — readiness percentages used to divide
  // by totalCases (all cases), not by the count of cases readiness was
  // actually applicable to (those with allegations recorded). With 2 of
  // 3 cases having no allegations at all, the old code understated a
  // 100%-of-applicable-cases gap as 33%.
  it('computes readiness percentages against cases readiness was applicable to, not against every case', () => {
    const cases = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    const allegations = [
      { id: 'a1', caseId: 'c1', title: 'X', description: 'd' }, // no employeeResponse -> fails
    ];
    const result = computeCaseQualityAnalytics(cases, allegations, [], [], [], [], []);
    const issue = result.issues.find(i => i.id === 'employee_responded');
    expect(issue.count).toBe(1);
    expect(issue.pct).toBe(100); // 1 of 1 applicable case, not 1 of 3 total cases
  });

  it('still computes guardrail percentages against every case, unaffected by how many had allegations', () => {
    const cases = [
      { id: 'c1', meetings: [{ type: 'Investigation', record: 'x' }] },
      { id: 'c2' }, // no allegations, no meetings -> not applicable to readiness, no guardrail issue either
      { id: 'c3' },
    ];
    const allegations = [{ id: 'a1', caseId: 'c1', title: 'X' }];
    const result = computeCaseQualityAnalytics(cases, allegations, [], [], [], [], []);
    const issue = result.issues.find(i => i.id === 'employee_response_opportunity');
    expect(issue.count).toBe(1);
    expect(issue.pct).toBe(Math.round((1 / 3) * 100)); // 1 of 3 total cases, not 1 of 1 applicable case
  });
});
