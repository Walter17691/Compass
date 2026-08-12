import { describe, it, expect } from 'vitest';
import { seedInvestigationChecklist, investigationChecklistTasks, INVESTIGATION_CHECKLIST_STEPS } from '../lib/investigationChecklist';

describe('seedInvestigationChecklist', () => {
  it('adds all seven checklist steps as case_tasks for the case', () => {
    const result = seedInvestigationChecklist([], 'case1', 'Priya Shah');
    expect(result).toHaveLength(7);
    expect(result.map(t => t.name)).toEqual(INVESTIGATION_CHECKLIST_STEPS.map(s => s.label));
    expect(result.every(t => t.caseId === 'case1' && t.owner === 'Priya Shah' && t.status === 'open')).toBe(true);
  });

  it('is idempotent — does not duplicate steps that already exist on the case', () => {
    const once = seedInvestigationChecklist([], 'case1', 'Priya Shah');
    const twice = seedInvestigationChecklist(once, 'case1', 'Priya Shah');
    expect(twice).toHaveLength(7);
  });

  it('only fills in the steps missing, leaving already-present ones untouched', () => {
    const existing = [{ id: 't1', caseId: 'case1', name: 'Review the allegation(s)', status: 'done', owner: 'Priya Shah' }];
    const result = seedInvestigationChecklist(existing, 'case1', 'Priya Shah');
    expect(result).toHaveLength(7);
    expect(result.find(t => t.name === 'Review the allegation(s)').status).toBe('done');
  });

  it('does not touch checklist tasks belonging to a different case', () => {
    const existing = [{ id: 't1', caseId: 'other-case', name: 'Review the allegation(s)', status: 'open' }];
    const result = seedInvestigationChecklist(existing, 'case1', 'Priya Shah');
    expect(result.filter(t => t.caseId === 'case1')).toHaveLength(7);
    expect(result.filter(t => t.caseId === 'other-case')).toHaveLength(1);
  });

  it('gives every seeded step a unique id even when addTask\'s Date.now() ids collide', () => {
    // Regression test: seeding all seven steps in one synchronous loop can
    // call Date.now() within the same millisecond, so without the step-id
    // suffix two tasks would share an id — and toggling one via
    // toggleCaseTaskDone(id) (a plain array .map on id match) would then
    // silently toggle both together.
    const result = seedInvestigationChecklist([], 'case1', 'Priya Shah');
    const ids = result.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('investigationChecklistTasks', () => {
  it('returns only the checklist tasks for the given case, not unrelated tasks', () => {
    const seeded = seedInvestigationChecklist([], 'case1', 'Priya Shah');
    const withExtra = [...seeded, { id: 'extra', caseId: 'case1', name: 'Chase signed statement', status: 'open' }];
    const result = investigationChecklistTasks(withExtra, 'case1');
    expect(result).toHaveLength(7);
    expect(result.find(t => t.name === 'Chase signed statement')).toBeUndefined();
  });
});
