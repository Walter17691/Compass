import { describe, it, expect } from 'vitest';
import { computeInvestigatorRecommendation } from '../lib/investigatorRecommendation.js';
import { INVESTIGATION_CHECKLIST_STEPS } from '../lib/investigationChecklist.js';

const cs = { id: 'c1' };

describe('computeInvestigatorRecommendation', () => {
  it('recommends resolving an unresolved procedural guardrail first, ahead of everything else', () => {
    const caseSignals = [{ id: 's1', caseId: 'c1', type: 'process_risk', status: 'open', title: 'Appeal Manager made the original decision' }];
    const planTasks = [{ id: 'p1', caseId: 'c1', name: 'Interview Priya Shah', status: 'open' }];
    const result = computeInvestigatorRecommendation(cs, [], planTasks, caseSignals);
    expect(result).toEqual({ text: 'Resolve a flagged procedural guardrail: "Appeal Manager made the original decision"', kind: 'guardrail' });
  });

  it('ignores a resolved guardrail signal and falls through to the plan', () => {
    const caseSignals = [{ id: 's1', caseId: 'c1', type: 'process_risk', status: 'resolved', title: 'x' }];
    const planTasks = [{ id: 'p1', caseId: 'c1', name: 'Interview Priya Shah', status: 'open' }];
    const result = computeInvestigatorRecommendation(cs, [], planTasks, caseSignals);
    expect(result).toEqual({ text: 'Interview Priya Shah', kind: 'plan' });
  });

  it('ignores a guardrail signal for a different case', () => {
    const caseSignals = [{ id: 's1', caseId: 'c2', type: 'process_risk', status: 'open', title: 'x' }];
    const planTasks = [{ id: 'p1', caseId: 'c1', name: 'Interview Priya Shah', status: 'open' }];
    const result = computeInvestigatorRecommendation(cs, [], planTasks, caseSignals);
    expect(result.kind).toBe('plan');
  });

  it('recommends the next open plan item when there are no guardrails', () => {
    const planTasks = [
      { id: 'p1', caseId: 'c1', name: 'Done already', status: 'done' },
      { id: 'p2', caseId: 'c1', name: 'Obtain CCTV footage', status: 'open' },
    ];
    const result = computeInvestigatorRecommendation(cs, [], planTasks, []);
    expect(result).toEqual({ text: 'Obtain CCTV footage', kind: 'plan' });
  });

  it('falls back to the next incomplete fixed checklist step when the plan is empty or fully done', () => {
    const result = computeInvestigatorRecommendation(cs, [], [], []);
    // IR-REPORT-01a — the line the investigator READS is displayLabel where
    // one exists; the step is still identified, and its task still matched, by
    // `label` (see the next test, which marks a task done by that label).
    expect(result).toEqual({
      text: INVESTIGATION_CHECKLIST_STEPS[0].displayLabel || INVESTIGATION_CHECKLIST_STEPS[0].label,
      kind: 'checklist',
    });
    expect(result.text).toBe('Review the issue(s) under investigation');
  });

  it('recommends the first fixed step not yet marked done, in order', () => {
    // The task carries the PERSISTED label. If matching had moved to
    // displayLabel this would not be recognised as done and step 1 would be
    // recommended again.
    const checklistTasks = [{ id: 't1', name: INVESTIGATION_CHECKLIST_STEPS[0].label, status: 'done' }];
    const result = computeInvestigatorRecommendation(cs, checklistTasks, [], []);
    expect(result).toEqual({
      text: INVESTIGATION_CHECKLIST_STEPS[1].displayLabel || INVESTIGATION_CHECKLIST_STEPS[1].label,
      kind: 'checklist',
    });
  });

  it('returns null once every guardrail, plan item and checklist step is resolved', () => {
    const allDoneTasks = INVESTIGATION_CHECKLIST_STEPS.map((s, i) => ({ id: 't' + i, name: s.label, status: 'done' }));
    const planTasks = [{ id: 'p1', caseId: 'c1', name: 'x', status: 'done' }];
    const result = computeInvestigatorRecommendation(cs, allDoneTasks, planTasks, []);
    expect(result).toBeNull();
  });
});
