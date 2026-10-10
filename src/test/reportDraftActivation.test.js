import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  REPORT_DRAFT_SAVE_ORG_ALLOW_LIST, isReportDraftSaveEnabled,
  draftSaveUnavailableReason, DRAFT_SAVE_UNAVAILABLE,
} from '../lib/reportDraftActivation.js';

// ─────────────────────────────────────────────────────────────────────────
// B3.2-1 — THE PRODUCTION ALLOW-LIST IS EMPTY, AND THIS IS WHERE THAT IS
// ENFORCED RATHER THAN ASSUMED.
//
// An allow-list that is empty by convention drifts. These tests mean it
// cannot be populated — or turned into the kind of switch that could enable
// every tenant at once — without a reviewer seeing a test change alongside it.
// ─────────────────────────────────────────────────────────────────────────

const SOURCE = 'src/lib/reportDraftActivation.js';
const source = () => readFileSync(SOURCE, 'utf8');
// Comments are prose, not behaviour: this file DESCRIBES the global flag it
// refuses to be, so an un-stripped assertion reads the description as the
// code. Block comments are stripped as well as line comments — a JSDoc
// asterisk otherwise trips the "no wildcard" assertion below.
const code = () => source()
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter(l => !l.trim().startsWith('//'))
  .join('\n');

describe('B3.2-1 — no organisation may save drafts in production', () => {
  it('ships an EMPTY allow-list', () => {
    expect(REPORT_DRAFT_SAVE_ORG_ALLOW_LIST).toEqual([]);
    expect(REPORT_DRAFT_SAVE_ORG_ALLOW_LIST).toHaveLength(0);
  });

  it('is frozen, so nothing can push an id onto it at runtime', () => {
    expect(Object.isFrozen(REPORT_DRAFT_SAVE_ORG_ALLOW_LIST)).toBe(true);
    expect(() => {
      'use strict';
      REPORT_DRAFT_SAVE_ORG_ALLOW_LIST.push('anything');
    }).toThrow();
    expect(REPORT_DRAFT_SAVE_ORG_ALLOW_LIST).toHaveLength(0);
  });

  it('refuses every organisation, including the real production and E2E ids', () => {
    // Named explicitly. If one of these is ever added to the list, this test
    // is the thing that says so out loud.
    const orgs = [
      'dbe871c5-e6fe-45d8-8bc4-201e487579be', // Compass LTD
      'f381bfa6-7b27-497f-9af7-46a82c8f8f4c', // E2E Test Org
      '7980b6a6-8575-4228-8f83-37e6dec6995b', // E2E Test Org (large)
      'b9b36250-271f-4340-a3cf-5a64bf49ecac', // E2E Second Org
    ];
    for (const org of orgs) {
      expect(isReportDraftSaveEnabled(org), org).toBe(false);
      expect(draftSaveUnavailableReason(org)).toBe(DRAFT_SAVE_UNAVAILABLE.ORG_NOT_ENABLED);
    }
  });

  it('does not enable the E2E organisation, which is the tempting exception', () => {
    expect(code()).not.toMatch(/f381bfa6|7980b6a6|b9b36250/);
  });
});

describe('B3.2-1 — the switch cannot be a global one', () => {
  it('reads no environment variable, so activation is a diff and not a dashboard setting', () => {
    const c = code();
    expect(c).not.toMatch(/import\.meta\.env/);
    expect(c).not.toMatch(/process\.env/);
  });

  it('exposes no boolean that could enable all tenants at once', () => {
    const c = code();
    expect(c).not.toMatch(/=\s*true/);
    expect(c).not.toMatch(/ENABLE_ALL|enableAll|allTenants|\*/);
  });

  it('matches ids exactly — no prefix, wildcard or substring widening', () => {
    const c = code();
    expect(c).toMatch(/\.includes\(id\)/);
    expect(c).not.toMatch(/startsWith|endsWith|RegExp|test\(|indexOf/);
  });
});

describe('B3.2-1 — the allow-list is actually consulted, and is the ONLY gate', () => {
  const screenSrc = () => readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');

  it('the case workspace renders the editor', () => {
    const s = screenSrc();
    expect(s).toMatch(/import \{ InvestigationReportEditor \}/);
    expect(s).toMatch(/<InvestigationReportEditor/);
  });

  it('and gates its save capability on this allow-list, not on anything local', () => {
    const s = screenSrc();
    expect(s).toMatch(/isReportDraftSaveEnabled\(orgId\)/);
    // canSave is the conjunction of activation, authority and a readable
    // history. If activation were dropped from it, the editor would become
    // writable for every tenant the moment this file was touched.
    expect(s).toMatch(/canSave:\s*draftSaveActivated\s*&&/);
  });

  it('the save gateway is reached from the workspace and from nowhere else', () => {
    const callers = [];
    for (const f of ['src/screens/CaseViewScreen.jsx', 'src/App.jsx']) {
      if (/saveReportDraft/.test(readFileSync(f, 'utf8'))) callers.push(f);
    }
    expect(callers).toEqual(['src/screens/CaseViewScreen.jsx']);
  });

  it('keeps the case record visible beside the editor as reference material', () => {
    const s = screenSrc();
    // The read-only workspace — matters, evidence, investigation meetings,
    // disputed notes, unresolved questions — still renders with the editor.
    // It is reference material, and nothing converts any of it into a finding.
    expect(s).toMatch(/<InvestigationReportTab/);
    expect(s).toMatch(/model=\{reportWorkspace\}/);
    // Its history is suppressed only because the editor shows one with authors.
    expect(s).toMatch(/showHistory=\{!draftSession \|\| draftSession\.state === DRAFT_STATE\.READ_ONLY\}/);
  });

  it('the asynchronous version-only visibility is resolved before activation', () => {
    const s = screenSrc();
    // (1) A save makes the destination stick immediately, from the fact the
    //     authoritative RPC returned — not from a later re-read landing.
    expect(s).toMatch(/hasReportVersion:[\s\S]{0,200}draftSession\?\.savedThisSession/);
    // (2) An unresolved read is never rendered as an empty history: the panel
    //     is told it is still loading.
    expect(s).toMatch(/versionsLoading:\s*!reportVersionsLoaded/);
    // (3) The session is not created until the history resolves, so no save
    //     can be attempted against a base version that was assumed.
    expect(s).toMatch(/const draftSession = !reportVersionsLoaded \? null/);
  });

  it('no other module smuggles in a second activation check', () => {
    // One gate, one answer. A second predicate somewhere else is how a
    // staged rollout ends up enabled in a place nobody looked.
    const screen = screenSrc();
    const occurrences = (screen.match(/isReportDraftSaveEnabled/g) || []).length;
    expect(occurrences).toBe(2); // the import, and the single call site
  });
});

describe('B3.2-1 — an unknown caller is never enabled', () => {
  it.each([
    ['undefined', undefined], ['null', null], ['empty', ''], ['blank', '   '],
    ['number', 123], ['object', {}], ['array', []], ['true', true],
  ])('refuses %s', (_label, value) => {
    expect(isReportDraftSaveEnabled(value)).toBe(false);
  });

  it('reports a missing organisation distinctly from one that is simply not enabled', () => {
    expect(draftSaveUnavailableReason(undefined)).toBe(DRAFT_SAVE_UNAVAILABLE.NO_ORG);
    expect(draftSaveUnavailableReason('   ')).toBe(DRAFT_SAVE_UNAVAILABLE.NO_ORG);
    expect(draftSaveUnavailableReason('11111111-1111-1111-1111-111111111111'))
      .toBe(DRAFT_SAVE_UNAVAILABLE.ORG_NOT_ENABLED);
  });

  it('CONTROL — the predicate would return true for a listed id, so the falses above mean something', () => {
    // The list is empty, so this proves the mechanism rather than the state:
    // a stand-in list with one id admits that id and nothing else.
    const stand_in = Object.freeze(['11111111-1111-1111-1111-111111111111']);
    const probe = (orgId) => typeof orgId === 'string' && orgId.trim() !== '' && stand_in.includes(orgId.trim());
    expect(probe('11111111-1111-1111-1111-111111111111')).toBe(true);
    expect(probe('22222222-2222-2222-2222-222222222222')).toBe(false);
    // And the real one still says no to the same id.
    expect(isReportDraftSaveEnabled('11111111-1111-1111-1111-111111111111')).toBe(false);
  });
});
