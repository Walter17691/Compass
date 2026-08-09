import { describe, it, expect } from 'vitest';
import { isAuthorisedFor } from './_digest.js';

// A confidential case is restricted to its creator, anyone granted
// case_access, and hr_directors (confidential_cases_2026-07-26.sql) — the
// digest cron runs with the service-role key, bypassing RLS entirely, so
// this is the only thing standing between a confidential deadline and
// every opted-in org member's inbox.
describe('isAuthorisedFor', () => {
  const alice = { user_id: 'alice', role: 'hr_manager' };
  const bob = { user_id: 'bob', role: 'hr_manager' };
  const dana = { user_id: 'dana', role: 'hr_director' };

  it('lets anyone see a non-confidential deadline', () => {
    const d = { confidential: false, caseId: 'c1', createdBy: 'alice' };
    expect(isAuthorisedFor(d, bob, new Map())).toBe(true);
  });

  it('blocks an unrelated hr_manager from a confidential deadline', () => {
    const d = { confidential: true, caseId: 'c1', createdBy: 'alice' };
    expect(isAuthorisedFor(d, bob, new Map())).toBe(false);
  });

  it('lets the case creator see their own confidential deadline', () => {
    const d = { confidential: true, caseId: 'c1', createdBy: 'alice' };
    expect(isAuthorisedFor(d, alice, new Map())).toBe(true);
  });

  it('lets an hr_director see a confidential deadline regardless of case ownership', () => {
    const d = { confidential: true, caseId: 'c1', createdBy: 'alice' };
    expect(isAuthorisedFor(d, dana, new Map())).toBe(true);
  });

  it('lets a member explicitly granted case_access see it', () => {
    const d = { confidential: true, caseId: 'c1', createdBy: 'alice' };
    const caseAccessByCase = new Map([['c1', new Set(['bob'])]]);
    expect(isAuthorisedFor(d, bob, caseAccessByCase)).toBe(true);
  });

  it('does not leak access across unrelated cases', () => {
    const d = { confidential: true, caseId: 'c2', createdBy: 'alice' };
    const caseAccessByCase = new Map([['c1', new Set(['bob'])]]);
    expect(isAuthorisedFor(d, bob, caseAccessByCase)).toBe(false);
  });

  it('DSAR deadlines (no caseId/createdBy) are never confidential, so always authorised', () => {
    const d = { confidential: false, caseId: null, createdBy: null };
    expect(isAuthorisedFor(d, bob, new Map())).toBe(true);
  });
});
