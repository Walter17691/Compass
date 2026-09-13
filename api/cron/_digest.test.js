import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAuthorisedFor, runDigest, digestHtml } from './_digest.js';

// Three-level case-access model (2026-09-13) — isAuthorisedFor's case-scoped
// branch now mirrors cases' own case_access_level-based RLS exactly (see
// _digest.js's own header comment for the DB ↔ digest parity table).
// Confidentiality and location no longer participate at all: a Level 1
// member sees a confidential case exactly like a non-confidential one, and
// location_ids is not even fetched anymore. The caseless-category branch
// (wellbeing/dsar/redundancy/leaver) is unaffected — it still gates on
// isHrRole(member.role), a capability question untouched by this migration.
describe('isAuthorisedFor', () => {
  const level1 = { user_id: 'l1', role: 'hr_manager', case_access_level: 1 };
  const level1b = { user_id: 'l1b', role: 'hr_director', case_access_level: 1 };
  const level2Creator = { user_id: 'alice', role: 'line_manager', case_access_level: 2 };
  const level2NotCreator = { user_id: 'l2', role: 'line_manager', case_access_level: 2 };
  const level3 = { user_id: 'l3', role: 'investigator', case_access_level: 3 };
  const lineMgr = { user_id: 'linemgr', role: 'line_manager', case_access_level: 2 };
  const alice = { user_id: 'alice', role: 'hr_manager' }; // caseless-category fixture, role-only
  const leo = { user_id: 'leo', role: 'legal_reviewer' }; // caseless-category fixture, role-only

  const caseC1 = { createdBy: 'alice' };
  const casesById = new Map([['c1', caseC1]]);

  describe('case-scoped deadlines, confidential or not — confidentiality no longer changes the outcome', () => {
    it('Level 1 sees any case in the org, confidential or not', () => {
      const confidential = { confidential: true, caseId: 'c1' };
      const nonConfidential = { confidential: false, caseId: 'c1' };
      expect(isAuthorisedFor(confidential, level1, new Map(), casesById)).toBe(true);
      expect(isAuthorisedFor(nonConfidential, level1, new Map(), casesById)).toBe(true);
    });

    it('a second Level 1 member (different role) sees it too — the level, not the role name, is what matters', () => {
      const d = { confidential: true, caseId: 'c1' };
      expect(isAuthorisedFor(d, level1b, new Map(), casesById)).toBe(true);
    });

    it('Level 2 sees a case they created, confidential or not', () => {
      const confidential = { confidential: true, caseId: 'c1' };
      const nonConfidential = { confidential: false, caseId: 'c1' };
      expect(isAuthorisedFor(confidential, level2Creator, new Map(), casesById)).toBe(true);
      expect(isAuthorisedFor(nonConfidential, level2Creator, new Map(), casesById)).toBe(true);
    });

    it('Level 2, NOT the creator, no case_access: blocked regardless of confidentiality', () => {
      const confidential = { confidential: true, caseId: 'c1' };
      const nonConfidential = { confidential: false, caseId: 'c1' };
      expect(isAuthorisedFor(confidential, level2NotCreator, new Map(), casesById)).toBe(false);
      expect(isAuthorisedFor(nonConfidential, level2NotCreator, new Map(), casesById)).toBe(false);
    });

    it('Level 3 with no case_access: blocked regardless of confidentiality', () => {
      const confidential = { confidential: true, caseId: 'c1' };
      const nonConfidential = { confidential: false, caseId: 'c1' };
      expect(isAuthorisedFor(confidential, level3, new Map(), casesById)).toBe(false);
      expect(isAuthorisedFor(nonConfidential, level3, new Map(), casesById)).toBe(false);
    });

    it('an explicit case_access grant overrides level entirely, including for Level 3 on a confidential case', () => {
      const d = { confidential: true, caseId: 'c1' };
      const caseAccessByCase = new Map([['c1', new Set(['l3'])]]);
      expect(isAuthorisedFor(d, level3, caseAccessByCase, casesById)).toBe(true);
    });

    it('does not leak access across unrelated cases', () => {
      const d = { confidential: true, caseId: 'c2' };
      const caseAccessByCase = new Map([['c1', new Set(['l3'])]]);
      const twoCases = new Map([['c1', caseC1], ['c2', { createdBy: 'alice' }]]);
      expect(isAuthorisedFor(d, level3, caseAccessByCase, twoCases)).toBe(false);
    });
  });

  describe('DELIBERATE BEHAVIOUR CHANGE: owner_id and location no longer participate', () => {
    it('a Level 2 member who owns the case (owner_id) but did not create it is still blocked — owner_id was excluded from the three-level model by design', () => {
      const d = { confidential: false, caseId: 'c1' };
      const owned = new Map([['c1', { createdBy: 'someone-else' }]]);
      expect(isAuthorisedFor(d, lineMgr, new Map(), owned)).toBe(false);
    });

    it('location is never consulted anymore — a Level 2 member sees their own created case regardless of any location field', () => {
      const d = { confidential: false, caseId: 'c1' };
      const created = new Map([['c1', { createdBy: 'linemgr' }]]);
      const creator = { user_id: 'linemgr', role: 'location_manager', case_access_level: 2 };
      expect(isAuthorisedFor(d, creator, new Map(), created)).toBe(true);
    });
  });

  describe('wellbeing deadlines — no case, narrower is_hr_role-only RLS (unaffected by the three-level model)', () => {
    it('an hr_manager can see a wellbeing deadline', () => {
      const d = { category: 'wellbeing', confidential: true, caseId: null };
      expect(isAuthorisedFor(d, alice, new Map())).toBe(true);
    });

    it('a legal_reviewer/auditor cannot — wellbeing_notes RLS is is_hr_role only', () => {
      const d = { category: 'wellbeing', confidential: true, caseId: null };
      expect(isAuthorisedFor(d, leo, new Map())).toBe(false);
    });

    it('a line_manager cannot', () => {
      const d = { category: 'wellbeing', confidential: true, caseId: null };
      expect(isAuthorisedFor(d, lineMgr, new Map())).toBe(false);
    });
  });

  describe('leaver deadlines with no case at all — genuinely org-wide RLS', () => {
    it('is authorised for any org member, matching leaver_instances\' own SELECT RLS', () => {
      const d = { category: 'leaver', confidential: false, caseId: null };
      expect(isAuthorisedFor(d, lineMgr, new Map())).toBe(true);
    });
  });

  describe('dsar deadlines with no case at all — is_hr_role-only RLS', () => {
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

  describe('redundancy deadlines with no case at all — is_hr_role-only RLS', () => {
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
      expect(isAuthorisedFor(d, level1, new Map(), casesById)).toBe(false);
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
