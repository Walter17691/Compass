import { describe, it, expect } from 'vitest';
import { computeCaseReadiness, readinessStatusForScore, READINESS_STATUSES } from '../lib/caseReadiness';

const cs = { id: 'case1', evidence: [] };

describe('readinessStatusForScore', () => {
  it('maps score boundaries to the right status', () => {
    expect(readinessStatusForScore(0).id).toBe('not_ready');
    expect(readinessStatusForScore(39).id).toBe('not_ready');
    expect(readinessStatusForScore(40).id).toBe('needs_review');
    expect(readinessStatusForScore(69).id).toBe('needs_review');
    expect(readinessStatusForScore(70).id).toBe('mostly_ready');
    expect(readinessStatusForScore(99).id).toBe('mostly_ready');
    expect(readinessStatusForScore(100).id).toBe('ready');
  });
});

describe('computeCaseReadiness', () => {
  it('is not applicable when the case has no allegations', () => {
    const result = computeCaseReadiness(cs, [], [], []);
    expect(result.applicable).toBe(false);
  });

  it('scores 100 and has no gaps when every check is met', () => {
    const allegations = [
      { id: 'a1', caseId: 'case1', title: 'Unauthorised absence', description: 'Left shift early on 5 Aug', employeeResponse: 'Employee says they had permission.' },
    ];
    const caseWithEvidence = { ...cs, evidence: [{ name: 'CCTV notes', allegationId: 'a1', stance: 'supports' }] };
    const result = computeCaseReadiness(caseWithEvidence, allegations, [], []);
    expect(result.applicable).toBe(true);
    expect(result.score).toBe(100);
    expect(result.status.id).toBe('ready');
    expect(result.gaps).toHaveLength(0);
  });

  it('flags gaps for missing employee response, unlinked evidence, open questions, and open tasks', () => {
    const allegations = [
      { id: 'a1', caseId: 'case1', title: 'Unauthorised absence', description: 'Left shift early on 5 Aug', employeeResponse: '' },
    ];
    const caseSignals = [
      { id: 's1', caseId: 'case1', type: 'unanswered_question', status: 'open' },
    ];
    const caseTasks = [
      { id: 't1', caseId: 'case1', status: 'open' },
    ];
    const result = computeCaseReadiness(cs, allegations, caseSignals, caseTasks);
    expect(result.applicable).toBe(true);
    const gapIds = result.gaps.map(g => g.id);
    expect(gapIds).toEqual(expect.arrayContaining(['employee_responded', 'evidence_linked', 'no_open_questions', 'no_open_tasks']));
    expect(gapIds).not.toContain('allegations_recorded');
    expect(result.score).toBe(20); // 1 of 5 checks met
    expect(result.status.id).toBe('not_ready');
  });

  it('ignores questions/tasks belonging to a different case', () => {
    const allegations = [
      { id: 'a1', caseId: 'case1', title: 'Issue', description: 'Details', employeeResponse: 'Response given' },
    ];
    const caseWithEvidence = { ...cs, evidence: [{ name: 'Doc', allegationId: 'a1', stance: 'neutral' }] };
    const caseSignals = [{ id: 's1', caseId: 'other-case', type: 'unanswered_question', status: 'open' }];
    const caseTasks = [{ id: 't1', caseId: 'other-case', status: 'open' }];
    const result = computeCaseReadiness(caseWithEvidence, allegations, caseSignals, caseTasks);
    expect(result.score).toBe(100);
  });

  it('exposes exactly the four documented statuses in ascending min order', () => {
    expect(READINESS_STATUSES.map(s => s.min)).toEqual([0, 40, 70, 100]);
  });
});
