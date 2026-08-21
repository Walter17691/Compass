import { describe, it, expect } from 'vitest';
import { isAuthorisedFor } from './_digest.js';

// Phase 6.5 hardening (P0) — isAuthorisedFor now mirrors all three RLS
// policies actually layered on cases.SELECT (location, non-oversight
// ownership scoping, and confidentiality), not just confidentiality
// alone. See _digest.js's own header comment for the full reasoning.
describe('isAuthorisedFor', () => {
  const alice = { user_id: 'alice', role: 'hr_manager' };
  const bob = { user_id: 'bob', role: 'hr_manager' };
  const dana = { user_id: 'dana', role: 'hr_director' };
  const leo = { user_id: 'leo', role: 'legal_reviewer' };
  const locMgr = { user_id: 'locmgr', role: 'location_manager', location_ids: ['site-a'] };
  const lineMgr = { user_id: 'linemgr', role: 'line_manager' };

  const caseC1 = { locationId: 'site-a', ownerId: null, createdBy: 'alice' };
  const casesById = new Map([['c1', caseC1]]);

  describe('confidential deadlines', () => {
    it('blocks an unrelated hr_manager', () => {
      const d = { confidential: true, caseId: 'c1' };
      expect(isAuthorisedFor(d, bob, new Map(), casesById)).toBe(false);
    });

    it('lets the case creator see their own confidential deadline', () => {
      const d = { confidential: true, caseId: 'c1' };
      expect(isAuthorisedFor(d, alice, new Map(), casesById)).toBe(true);
    });

    it('lets an hr_director see it regardless of case ownership', () => {
      const d = { confidential: true, caseId: 'c1' };
      expect(isAuthorisedFor(d, dana, new Map(), casesById)).toBe(true);
    });

    it('lets a legal_reviewer see it (confidentiality oversight is broader than plain HR)', () => {
      const d = { confidential: true, caseId: 'c1' };
      expect(isAuthorisedFor(d, leo, new Map(), casesById)).toBe(true);
    });

    it('lets a member explicitly granted case_access see it', () => {
      const d = { confidential: true, caseId: 'c1' };
      const caseAccessByCase = new Map([['c1', new Set(['bob'])]]);
      expect(isAuthorisedFor(d, bob, caseAccessByCase, casesById)).toBe(true);
    });

    it('does not leak access across unrelated cases', () => {
      const d = { confidential: true, caseId: 'c2' };
      const caseAccessByCase = new Map([['c1', new Set(['bob'])]]);
      const twoCases = new Map([['c1', caseC1], ['c2', { locationId: 'site-a', ownerId: null, createdBy: 'alice' }]]);
      expect(isAuthorisedFor(d, bob, caseAccessByCase, twoCases)).toBe(false);
    });
  });

  describe('non-confidential deadlines — ownership scoping applies regardless (real, previously-missing restriction)', () => {
    it('an hr_manager (canSeeAllOrgCases) sees any non-confidential case in the org', () => {
      const d = { confidential: false, caseId: 'c1' };
      expect(isAuthorisedFor(d, bob, new Map(), casesById)).toBe(true);
    });

    it('a line_manager who neither created, owns, nor holds case_access on the case is blocked, even though it is not confidential', () => {
      const d = { confidential: false, caseId: 'c1' };
      expect(isAuthorisedFor(d, lineMgr, new Map(), casesById)).toBe(false);
    });

    it('a line_manager who created the case can see it', () => {
      const d = { confidential: false, caseId: 'c1' };
      const linemgrAsCreator = { user_id: 'linemgr', role: 'line_manager' };
      const owned = new Map([['c1', { ...caseC1, createdBy: 'linemgr' }]]);
      expect(isAuthorisedFor(d, linemgrAsCreator, new Map(), owned)).toBe(true);
    });

    it('a line_manager who owns the case (owner_id) can see it', () => {
      const d = { confidential: false, caseId: 'c1' };
      const owned = new Map([['c1', { ...caseC1, ownerId: 'linemgr' }]]);
      expect(isAuthorisedFor(d, lineMgr, new Map(), owned)).toBe(true);
    });

    it('a line_manager with case_access can see it', () => {
      const d = { confidential: false, caseId: 'c1' };
      const caseAccessByCase = new Map([['c1', new Set(['linemgr'])]]);
      expect(isAuthorisedFor(d, lineMgr, caseAccessByCase, casesById)).toBe(true);
    });
  });

  describe('location scoping — location_manager only', () => {
    it('a location_manager assigned to the case\'s own site sees it (as creator/owner/case_access — location alone is not enough per the real RLS shape)', () => {
      const d = { confidential: false, caseId: 'c1' };
      const owned = new Map([['c1', { ...caseC1, createdBy: 'locmgr' }]]);
      expect(isAuthorisedFor(d, locMgr, new Map(), owned)).toBe(true);
    });

    it('a location_manager assigned to a DIFFERENT site is blocked even if they created the case', () => {
      const d = { confidential: false, caseId: 'c1' };
      const elsewhere = new Map([['c1', { locationId: 'site-b', ownerId: null, createdBy: 'locmgr' }]]);
      expect(isAuthorisedFor(d, locMgr, new Map(), elsewhere)).toBe(false);
    });

    it('a location_manager with no locations assigned yet is not filtered by location at all', () => {
      const d = { confidential: false, caseId: 'c1' };
      const unassigned = { user_id: 'locmgr2', role: 'location_manager', location_ids: [] };
      const owned = new Map([['c1', { ...caseC1, createdBy: 'locmgr2' }]]);
      expect(isAuthorisedFor(d, unassigned, new Map(), owned)).toBe(true);
    });
  });

  describe('wellbeing deadlines — no case, narrower is_hr_role-only RLS', () => {
    it('an hr_manager can see a wellbeing deadline', () => {
      const d = { category: 'wellbeing', confidential: true, caseId: null };
      expect(isAuthorisedFor(d, alice, new Map())).toBe(true);
    });

    it('a legal_reviewer/auditor cannot — wellbeing_notes RLS is is_hr_role only, narrower than case confidentiality oversight', () => {
      const d = { category: 'wellbeing', confidential: true, caseId: null };
      expect(isAuthorisedFor(d, leo, new Map())).toBe(false);
    });

    it('a line_manager cannot', () => {
      const d = { category: 'wellbeing', confidential: true, caseId: null };
      expect(isAuthorisedFor(d, lineMgr, new Map())).toBe(false);
    });
  });

  describe('org-wide deadlines with no case at all (DSAR, leaver, redundancy)', () => {
    it('are always authorised, matching their own genuinely org-wide RLS', () => {
      const d = { category: 'dsar', confidential: false, caseId: null };
      expect(isAuthorisedFor(d, lineMgr, new Map())).toBe(true);
    });
  });

  describe('defensive: a case referenced by a deadline but missing from casesById', () => {
    it('fails closed rather than guessing', () => {
      const d = { confidential: false, caseId: 'unknown-case' };
      expect(isAuthorisedFor(d, dana, new Map(), casesById)).toBe(false);
    });
  });
});
