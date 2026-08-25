import { describe, it, expect } from 'vitest';
import { newId } from '../lib/ids';
import { addTask } from '../lib/caseTasks';
import { addAllegation } from '../lib/allegations';
import { addConcernReferral } from '../lib/concernReferrals';

// Phase 6.5 hardening (structural remediation, Prompt 12 — Task/Entity
// Identity invariant). The bug class this closes: Date.now() has
// millisecond resolution, so any synchronous loop that mints more than
// one id in the same tick (a batch-add, seeding several checklist steps)
// used to produce IDENTICAL ids. crypto.randomUUID() has no such window.
describe('newId', () => {
  it('is unique across a tight synchronous loop, unlike Date.now()', () => {
    const ids = Array.from({ length: 500 }, () => newId('x'));
    expect(new Set(ids).size).toBe(500);
  });

  it('prefixes the id when given a prefix', () => {
    expect(newId('task')).toMatch(/^task_/);
  });

  it('returns a bare uuid with no prefix argument', () => {
    expect(newId()).not.toContain('_');
  });
});

describe('id-generating helpers never collide within one synchronous batch', () => {
  it('addTask — seeding many tasks for one case in a tight loop never collides', () => {
    let tasks = [];
    for (let i = 0; i < 50; i++) {
      tasks = addTask(tasks, 'case-1', { name: `Step ${i}` });
    }
    const ids = tasks.map(t => t.id);
    expect(new Set(ids).size).toBe(50);
  });

  it('addAllegation — batch-adding never collides', () => {
    let allegations = [];
    for (let i = 0; i < 50; i++) {
      allegations = addAllegation(allegations, 'case-1', { title: `Allegation ${i}` });
    }
    expect(new Set(allegations.map(a => a.id)).size).toBe(50);
  });

  it('addConcernReferral — batch-adding never collides', () => {
    let referrals = [];
    for (let i = 0; i < 50; i++) {
      referrals = addConcernReferral(referrals, { employeeName: `Person ${i}`, description: 'x' });
    }
    expect(new Set(referrals.map(r => r.id)).size).toBe(50);
  });
});
