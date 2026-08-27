import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAuthorisedFor, runDigest, digestHtml } from './_digest.js';

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

  // Phase 6.5 hardening (closes Prompt 11 audit finding 2.6, MEDIUM) —
  // dsar/redundancy used to fall through the same blanket "no case, so
  // authorised" branch as leaver, which really is org-wide (leaver_instances'
  // own SELECT RLS has no role check). dsar_requests and redundancy_cases
  // are both is_hr_role-only in their live RLS — a non-HR opted-in member
  // was receiving an email naming an employee and their DSAR due date
  // every morning, directly disclosing who had filed a subject access
  // request.
  describe('leaver deadlines with no case at all — genuinely org-wide RLS', () => {
    it('is authorised for any org member, matching leaver_instances\' own SELECT RLS', () => {
      const d = { category: 'leaver', confidential: false, caseId: null };
      expect(isAuthorisedFor(d, lineMgr, new Map())).toBe(true);
    });
  });

  describe('dsar deadlines with no case at all — is_hr_role-only RLS (Prompt 11 audit, 2.6)', () => {
    it('an hr_manager can see a DSAR deadline', () => {
      const d = { category: 'dsar', confidential: false, caseId: null };
      expect(isAuthorisedFor(d, alice, new Map())).toBe(true);
    });

    it('a line_manager cannot — dsar_requests RLS is is_hr_role only', () => {
      const d = { category: 'dsar', confidential: false, caseId: null };
      expect(isAuthorisedFor(d, lineMgr, new Map())).toBe(false);
    });

    it('a legal_reviewer/auditor cannot — is_hr_role is narrower than confidential-case oversight', () => {
      const d = { category: 'dsar', confidential: false, caseId: null };
      expect(isAuthorisedFor(d, leo, new Map())).toBe(false);
    });
  });

  describe('redundancy deadlines with no case at all — is_hr_role-only RLS (Prompt 11 audit, 2.6 sibling)', () => {
    it('an hr_manager can see a redundancy consultation deadline', () => {
      const d = { category: 'redundancy', confidential: false, caseId: null };
      expect(isAuthorisedFor(d, alice, new Map())).toBe(true);
    });

    it('a line_manager cannot — redundancy_cases RLS is is_hr_role only', () => {
      const d = { category: 'redundancy', confidential: false, caseId: null };
      expect(isAuthorisedFor(d, lineMgr, new Map())).toBe(false);
    });
  });

  describe('an unrecognised caseId-less category', () => {
    it('fails closed rather than defaulting to authorised', () => {
      const d = { category: 'some_future_category', confidential: false, caseId: null };
      expect(isAuthorisedFor(d, alice, new Map())).toBe(false);
    });
  });

  describe('defensive: a case referenced by a deadline but missing from casesById', () => {
    it('fails closed rather than guessing', () => {
      const d = { confidential: false, caseId: 'unknown-case' };
      expect(isAuthorisedFor(d, dana, new Map(), casesById)).toBe(false);
    });
  });
});

// Phase 6.5 hardening (structural remediation, Prompt 12 — Pagination /
// Complete-Data invariant). Regression for a confirmed-live bug: this
// query used to be a single unpaginated request, silently truncated at
// PostgREST's default row cap once an org's case count crossed it — the
// app's real largest org (2,715 cases) was losing 1,715 of them from
// every digest run. Proves runDigest now issues a SECOND page request
// for `cases` once the first page comes back full, instead of treating
// a full first page as "that's everything."
describe('runDigest — pagination', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('fetches a second page of cases when the first page returns a full page — proves the org is not silently truncated', async () => {
    const pageSize = 1000;
    const casesPage1 = Array.from({ length: pageSize }, (_, i) => ({ id: `c${i}`, org_id: 'org-a', stage: 'active' }));
    const casesPage2 = [{ id: 'c-last', org_id: 'org-a', stage: 'active' }];
    const casesRequests = [];

    global.fetch = vi.fn((url, options = {}) => {
      const u = String(url);
      if (u.includes('/rest/v1/organisations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'org-a', name: 'Acme', plan: 'pro', notification_webhook_url: null }]) });
      }
      if (u.includes('/rest/v1/cases')) {
        casesRequests.push(options.headers?.Range);
        const page = casesRequests.length === 1 ? casesPage1 : casesRequests.length === 2 ? casesPage2 : [];
        return Promise.resolve({ ok: true, json: () => Promise.resolve(page) });
      }
      // dsar_requests, org_members, case_access — empty is fine, this
      // test only asserts on the cases pagination itself.
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    await runDigest();

    expect(casesRequests.length).toBeGreaterThanOrEqual(2);
    expect(casesRequests[0]).toBe('0-999');
    expect(casesRequests[1]).toBe('1000-1999');
  });
});

// Phase 6.5 hardening (closes Prompt 11 audit finding 2.7, MEDIUM) —
// every other HTML email builder in this codebase imports escapeHtml;
// this one didn't. A member setting a case's employee name to include a
// tag would have had it render live inside every opted-in colleague's
// authentic, DKIM-signed Compass email the next morning.
describe('digestHtml — HTML-escapes interpolated content (Prompt 11 audit, 2.7)', () => {
  it('escapes a malicious employeeName so it renders as text, not markup', () => {
    const html = digestHtml([{ employeeName: '<a href="https://evil.example">click</a>', label: 'Deadline', overdue: false, daysLeft: 2 }]);
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain('&lt;a href=');
  });

  it('escapes a malicious deadline label the same way', () => {
    const html = digestHtml([{ employeeName: 'Sam Employee', label: '<img src=x onerror=alert(1)>', overdue: false, daysLeft: 2 }]);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('still renders ordinary names/labels unescaped-looking (no double-escaping of plain text)', () => {
    const html = digestHtml([{ employeeName: 'Ada Lovelace', label: 'Signature pending', overdue: false, daysLeft: 2 }]);
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('Signature pending');
  });
});
