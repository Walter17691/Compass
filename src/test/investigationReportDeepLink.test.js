import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  caseWorkspaceDestinations, destinationForLegacyTab, isWorkspaceDestination,
  DEFAULT_DESTINATION,
} from '../lib/caseWorkspace.js';

// ═══════════════════════════════════════════════════════════════════════════
// B3.2 — ?tab=inv_report MUST OPEN THE INVESTIGATION REPORT DESTINATION.
//
// It did not. Production browser UAT on 2026-10-10 showed the case workspace
// opening on its default destination with the parameter ignored, and the
// cause was not in the case view at all: App.jsx read `tab` into
// `employeeTab`, the EMPLOYEE FILE's parameter, and the case view's
// initialTab only ever came from in-app actions. The alias map in
// caseWorkspace.js had been ready for the deep link since B3.2-0 and nothing
// fed it.
//
// The fix has two halves and this file tests both:
//
//   1. App.jsx reads the same parameter for the case workspace, but ONLY when
//      the URL is opening a case — so an Employee File ?tab= cannot leak.
//
//   2. CaseViewScreen VALIDATES the requested destination against the list
//      the case actually offers this user. A URL may select a destination;
//      it may not conjure one. isWorkspaceDestination has existed for this
//      since B3.2-0 and was never wired up.
//
// This is a VISIBILITY boundary, not an access one. RLS is the access
// boundary and every panel renders only data already loaded for a case the
// user may read. What this stops is a URL displaying a surface the workspace
// deliberately withholds.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Exactly the expression CaseViewScreen evaluates. Asserted against the
 * source below.
 *
 * `fromUrl` is the whole point: a URL-sourced destination is validated, an
 * in-app one is not. In-app links may open a destination that is merely
 * empty — Case information on a case with none — which is the behaviour the
 * tab smoke tests lock in and which a blanket validation would have broken.
 */
const resolveDestination = (activeTab, dests, fromUrl = true) => {
  const requested = destinationForLegacyTab(activeTab) || DEFAULT_DESTINATION;
  return (fromUrl && !isWorkspaceDestination(requested, dests)) ? DEFAULT_DESTINATION : requested;
};

const CASE_ID = 'fdf8cea1-ff2e-4e58-8877-a7797e145d39';

/** A case that IS investigating — an assigned investigator is the usual signal. */
const investigatingCase = () => caseWorkspaceDestinations({
  cs: { id: CASE_ID, stage: 'open' },
  caseAccess: [{ caseId: CASE_ID, userId: 'u1', role: 'investigator' }],
});

/** A case with no investigation signal at all. */
const plainCase = () => caseWorkspaceDestinations({
  cs: { id: 'other-case', stage: 'open' },
});

describe('B3.2 — a valid investigation report deep link opens that destination', () => {
  it('resolves ?tab=inv_report on a case that is investigating', () => {
    const dests = investigatingCase();
    expect(isWorkspaceDestination('inv_report', dests)).toBe(true);
    expect(resolveDestination('inv_report', dests)).toBe('inv_report');
  });

  it('CONTROL — the same case resolves its other destinations too', () => {
    const dests = investigatingCase();
    expect(resolveDestination('meetings', dests)).toBe('meetings');
    expect(resolveDestination('record', dests)).toBe('record');
    expect(resolveDestination('evidence', dests)).toBe('investigation');  // legacy alias
  });
});

describe('B3.2 — a URL cannot conjure a destination the case does not offer', () => {
  it('falls back when the case is not investigating', () => {
    const dests = plainCase();
    expect(isWorkspaceDestination('inv_report', dests)).toBe(false);
    expect(resolveDestination('inv_report', dests)).toBe(DEFAULT_DESTINATION);
  });

  it('falls back for a destination withheld from this viewer', () => {
    // Themes are HR-only; exposure is shown only where the estimate applies.
    const notHr = caseWorkspaceDestinations({ cs: { id: CASE_ID }, canSeeThemes: false, showExposure: false });
    expect(resolveDestination('themes', notHr)).toBe(DEFAULT_DESTINATION);
    expect(resolveDestination('exposure', notHr)).toBe(DEFAULT_DESTINATION);

    const hr = caseWorkspaceDestinations({ cs: { id: CASE_ID }, canSeeThemes: true, showExposure: true });
    expect(resolveDestination('themes', hr)).toBe('themes');
    expect(resolveDestination('exposure', hr)).toBe('exposure');
  });

  it('falls back for an invalid, unknown or hostile tab value', () => {
    const dests = investigatingCase();
    for (const bad of [
      'nonsense', 'INV_REPORT', 'inv-report', '../admin', '<script>', '',
      null, undefined, 0, 42, {}, [], true,
    ]) {
      expect(resolveDestination(bad, dests), JSON.stringify(bad)).toBe(DEFAULT_DESTINATION);
    }
  });

  it('falls back when the destination list is missing or malformed', () => {
    for (const bad of [null, undefined, {}, { primary: [] }]) {
      expect(isWorkspaceDestination('inv_report', bad)).toBe(false);
    }
  });
});

describe('B3.2 — the version-only destination', () => {
  it('resolves for a case whose ONLY signal is a saved report version', () => {
    const dests = caseWorkspaceDestinations({
      cs: { id: CASE_ID, stage: 'open' },   // no stage, grant, findings or meeting
      hasReportVersion: true,
    });
    expect(isWorkspaceDestination('inv_report', dests)).toBe(true);
    expect(resolveDestination('inv_report', dests)).toBe('inv_report');
  });

  it('does NOT resolve while that fact is still unknown — and the panel says loading, not none', () => {
    // hasReportVersion is false until the async read lands. The destination is
    // withheld rather than guessed; the editor's own loading state is what
    // stops this reading as "there are none".
    const unknownYet = caseWorkspaceDestinations({ cs: { id: CASE_ID, stage: 'open' }, hasReportVersion: false });
    expect(resolveDestination('inv_report', unknownYet)).toBe(DEFAULT_DESTINATION);
  });
});

describe('B3.2 — switching between cases re-resolves per case', () => {
  it('the same tab resolves on one case and falls back on another', () => {
    const investigating = investigatingCase();
    const plain = plainCase();
    expect(resolveDestination('inv_report', investigating)).toBe('inv_report');
    expect(resolveDestination('inv_report', plain)).toBe(DEFAULT_DESTINATION);
  });

  it('is a pure function of (tab, destinations) — so a refresh gives the same answer', () => {
    const dests = investigatingCase();
    const once = resolveDestination('inv_report', dests);
    const again = resolveDestination('inv_report', caseWorkspaceDestinations({
      cs: { id: CASE_ID, stage: 'open' },
      caseAccess: [{ caseId: CASE_ID, userId: 'u1', role: 'investigator' }],
    }));
    expect(once).toBe('inv_report');
    expect(again).toBe(once);
  });
});

describe('B3.2 — the wiring, asserted against the source', () => {
  const app = () => readFileSync('src/App.jsx', 'utf8');
  const view = () => readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');

  it('App.jsx reads the tab parameter for the case workspace', () => {
    expect(app()).toMatch(/caseTab:\s*params\.get\('tab'\)\s*\|\|\s*null/);
  });

  it('…but only when the URL is actually opening a case', () => {
    // Otherwise an Employee File ?tab=overview would seed the case workspace.
    expect(app()).toMatch(/nav\.screen === SCREENS\.CASE_VIEW && nav\.caseId \? nav\.caseTab : null/);
  });

  it('…and passes it as a SEPARATE prop from the in-app initialTab', () => {
    const a = app();
    expect(a).toMatch(/const \[caseUrlTab\] = useState/);
    expect(a).toMatch(/urlTab=\{caseUrlTab\}/);
    // The in-app state is still its own thing, still starting empty.
    expect(a).toMatch(/const \[caseViewInitialTab, setCaseViewInitialTab\] = useState\(null\)/);
  });

  it('…and the Employee File keeps its own reading, unchanged', () => {
    const a = app();
    expect(a).toMatch(/employeeTab:\s*params\.get\('tab'\)\s*\|\|\s*null/);
    expect(a).toMatch(/useState\(\(\) => readNavFromUrl\(\)\.employeeTab \|\| "overview"\)/);
  });

  it('CaseViewScreen validates a URL-sourced destination before using it', () => {
    const v = view();
    expect(v).toMatch(/import \{[^}]*isWorkspaceDestination[^}]*\} from '\.\.\/lib\/caseWorkspace'/);
    expect(v).toMatch(/const requestedDestination = destinationForLegacyTab\(activeTab\) \|\| DEFAULT_DESTINATION;/);
    expect(v).toMatch(/tabFromUrl && !isWorkspaceDestination\(requestedDestination, workspaceDestinations\)/);
  });

  it('…and tracks where the current destination came from', () => {
    const v = view();
    // Seeded from the URL at mount, so there is no effect and no flash.
    expect(v).toMatch(/useState\(\(\) => destinationForLegacyTab\(urlTab\) \|\| DEFAULT_DESTINATION\)/);
    expect(v).toMatch(/useState\(\(\) => !!destinationForLegacyTab\(urlTab\)\)/);
    // Any in-app navigation drops the URL provenance, restoring the old latitude.
    expect(v).toMatch(/setActiveTab\(id\);\s*\n\s*setTabFromUrl\(false\);/);
    expect(v).toMatch(/setTabFromUrl\(false\); clearInitialTab/);
  });

  it('IN-APP navigation keeps its right to open a merely-empty destination', () => {
    // The behaviour the tab smoke tests lock in: a case with no case
    // information, and no outcome, still opens those panels when the product
    // asks for them. Only a URL is refused.
    const bare = caseWorkspaceDestinations({ cs: { id: CASE_ID }, hasCaseInformation: false, hasOutcome: false, outcomeReachable: false });
    expect(isWorkspaceDestination('information', bare)).toBe(false);
    expect(resolveDestination('information', bare, false)).toBe('information');
    expect(resolveDestination('outcome', bare, false)).toBe('outcome');
    // …and the same request from a URL is refused.
    expect(resolveDestination('information', bare, true)).toBe(DEFAULT_DESTINATION);
    expect(resolveDestination('outcome', bare, true)).toBe(DEFAULT_DESTINATION);
  });

  it('the destinations are computed before the active one is chosen', () => {
    const v = view();
    expect(v.indexOf('const workspaceDestinations ='))
      .toBeLessThan(v.indexOf('const activeDestination ='));
  });
});

describe('B3.2 — opening a saved version preserves the editing mode', () => {
  const view = () => readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');

  it('“Continue from this version” carries the current mode forward', () => {
    // Without this the investigator could be moved from one document into
    // seven boxes by opening a version whose text happened to match the
    // structured shape. reportDraftSession.test.js covers the behaviour; this
    // asserts the screen actually passes the hint.
    expect(view()).toMatch(/preferRaw: prev\.rawMode/);
  });
});
