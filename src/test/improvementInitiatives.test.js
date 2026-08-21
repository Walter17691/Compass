import { describe, it, expect } from 'vitest';
import { addMilestone, toggleMilestone, removeMilestone, milestoneProgress, describeMilestoneProgress } from '../lib/improvementInitiatives';

describe('addMilestone', () => {
  it('adds a milestone with a trimmed label, defaulting done to false', () => {
    const result = addMilestone([], '  Draft new rota policy  ', '2026-09-01');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ label: 'Draft new rota policy', targetDate: '2026-09-01', done: false });
  });

  it('ignores a blank label', () => {
    expect(addMilestone([], '   ')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const original = [];
    addMilestone(original, 'x');
    expect(original).toEqual([]);
  });
});

describe('toggleMilestone / removeMilestone', () => {
  const base = [{ id: 'm1', label: 'x', targetDate: '', done: false }, { id: 'm2', label: 'y', targetDate: '', done: false }];

  it('toggles only the matching milestone', () => {
    const result = toggleMilestone(base, 'm1');
    expect(result[0].done).toBe(true);
    expect(result[1].done).toBe(false);
  });

  it('toggles back to not done', () => {
    const toggled = toggleMilestone(base, 'm1');
    const reverted = toggleMilestone(toggled, 'm1');
    expect(reverted[0].done).toBe(false);
  });

  it('removes only the matching milestone', () => {
    expect(removeMilestone(base, 'm1').map(m => m.id)).toEqual(['m2']);
  });
});

describe('milestoneProgress / describeMilestoneProgress', () => {
  it('counts completed vs total', () => {
    const milestones = [{ id: 'm1', done: true }, { id: 'm2', done: false }, { id: 'm3', done: true }];
    expect(milestoneProgress(milestones)).toEqual({ completed: 2, total: 3 });
    expect(describeMilestoneProgress(milestones)).toBe('2 of 3 milestones complete.');
  });

  it('handles a single milestone with correct singular wording', () => {
    expect(describeMilestoneProgress([{ id: 'm1', done: true }])).toBe('1 of 1 milestone complete.');
  });

  it('describes an empty milestone list honestly rather than 0 of 0', () => {
    expect(describeMilestoneProgress([])).toBe('No milestones set yet.');
    expect(describeMilestoneProgress(null)).toBe('No milestones set yet.');
  });
});
