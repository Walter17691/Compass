import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppSidebar } from '../components/AppSidebar';
import { SCREENS } from '../constants';
import { caseDetailSections } from '../lib/caseViewSummary.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B.1 — People is the parent; a case is not said three times.
//
// Two findings from Walter's production review:
//
//   1. Cases sat ABOVE People in the rail, reading as an alternative way into
//      the product rather than a cross-employee view of the same people's
//      formal processes.
//   2. A review_draft case showed "Review meeting record" three times — header
//      button, suggested-next-step banner (with its own button), and the state
//      sentence.
//
// The hierarchy is navigation only. It changes nothing about authorisation.
// ─────────────────────────────────────────────────────────────────────────

const read = f => readFileSync(f, 'utf8');
const stripJs = src => src.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

const sidebarSrc = stripJs(read('src/components/AppSidebar.jsx'));
const casesSrc = read('src/screens/CasesScreen.jsx');
const caseViewSrc = read('src/screens/CaseViewScreen.jsx');
const caseViewCode = stripJs(caseViewSrc);
const employeeFileSrc = stripJs(read('src/lib/employeeFile.js'));

const sidebarProps = (over = {}) => ({
  screen: SCREENS.HOME, setScreen: vi.fn(), isMobile: false,
  showMobileNav: false, setShowMobileNav: vi.fn(),
  org: { id: 'o1', name: 'Acme' }, availableOrgs: [], switchOrg: vi.fn(),
  currentUser: { name: 'A. Rivera' }, auditLog: [], onSignOut: vi.fn(),
  isHR: true, createMenuProps: {}, ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.1 — People is the visual parent', () => {
  it('People, Cases and Archive are all still navigable', () => {
    const setScreen = vi.fn();
    render(<AppSidebar {...sidebarProps({ setScreen })} />);
    ['People', 'Cases', 'Archive'].forEach(label => {
      const btn = screen.getByRole('button', { name: label });
      expect(btn, label).toBeInTheDocument();
      fireEvent.click(btn);
    });
    expect(setScreen).toHaveBeenCalledWith(SCREENS.PEOPLE);
    expect(setScreen).toHaveBeenCalledWith(SCREENS.CASES);
    expect(setScreen).toHaveBeenCalledWith(SCREENS.ARCHIVE);
  });

  it('Cases and Archive are SUBORDINATE, and People is not', () => {
    // Expressed with the `indent` treatment the collapsible groups already use —
    // smaller icon, inset, shorter row — so no new component or tree graphic.
    const nav = sidebarSrc.slice(sidebarSrc.indexOf('const primaryItemsAfterAsk'),
                                 sidebarSrc.indexOf('const groupLabelForScreen'));
    expect(nav).toMatch(/SCREENS\.CASES[^}]*indent:true/);
    expect(nav).toMatch(/SCREENS\.ARCHIVE[^}]*indent:true/);
    // People itself must NOT be indented.
    expect(nav).not.toMatch(/SCREENS\.PEOPLE[^}]*indent:true/);
  });

  it('Cases no longer sits above People as a top-level peer', () => {
    const top = sidebarSrc.slice(sidebarSrc.indexOf('const primaryItems = ['),
                                 sidebarSrc.indexOf('const primaryItemsAfterAsk'));
    expect(top).toContain('SCREENS.HOME');
    expect(top).not.toContain('SCREENS.CASES');
  });

  it('People is rendered before its subordinate views', () => {
    render(<AppSidebar {...sidebarProps()} />);
    const labels = screen.getAllByRole('button').map(b => b.textContent);
    const iPeople = labels.findIndex(l => l === 'People');
    const iCases = labels.findIndex(l => l === 'Cases');
    const iArchive = labels.findIndex(l => l === 'Archive');
    expect(iPeople).toBeGreaterThan(-1);
    expect(iCases).toBeGreaterThan(iPeople);
    expect(iArchive).toBeGreaterThan(iPeople);
  });

  it('no noisy new group heading was added to say what the layout says', () => {
    expect(sidebarSrc).not.toMatch(/label:"Employees"/);
    expect(sidebarSrc).not.toMatch(/label:"People"\s*,\s*items/);
  });

  it('the hierarchy does NOT make Cases HR-only', () => {
    // It communicates ownership, not permission. Existing case-access rules remain
    // the authority.
    render(<AppSidebar {...sidebarProps({ isHR: false })} />);
    expect(screen.getByRole('button', { name: 'Cases' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'People' })).toBeInTheDocument();
    const nav = sidebarSrc.slice(sidebarSrc.indexOf('const primaryItemsAfterAsk'),
                                 sidebarSrc.indexOf('const groupLabelForScreen'));
    expect(nav).not.toMatch(/isHR[^}]*SCREENS\.CASES/);
  });

  it('nothing in the rail hard-codes an employee parent for every process', () => {
    // AD-001 still stands: some future processes are organisation-level. The
    // navigation must not make that architecture impossible.
    expect(sidebarSrc).not.toMatch(/employeeId/);
    expect(sidebarSrc).not.toMatch(/employee_id/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.1 — the Cases page says what it is', () => {
  it('reads as HR Processes across employees', () => {
    expect(casesSrc).toContain('title="HR Processes"');
    expect(casesSrc).toContain('Formal HR processes across your employees');
  });

  it('keeps its counts, and adds no long explanatory prose', () => {
    expect(casesSrc).toMatch(/active · \$\{cases\.filter/);
    const subtitle = casesSrc.slice(casesSrc.indexOf('subtitle='), casesSrc.indexOf('subtitle=') + 260);
    expect(subtitle.length).toBeLessThan(300);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.1 — ONE case object, two routes', () => {
  it('the Employee File reaches cases through the same authorised collection', () => {
    // Both routes read public.cases. The Employee File narrows the same rows by
    // employee; the global view does not narrow them at all.
    expect(employeeFileSrc).toContain('getEmployeeContext(employeeId, authorisedData)');
    // No second case store anywhere.
    ['employee_cases', 'case_queue', 'cases_v2', 'employeeCases']
      .forEach(t => expect(employeeFileSrc, t).not.toContain(t));
    expect(caseViewCode).not.toMatch(/from\('(employee_cases|case_queue|cases_v2)'\)/);
  });

  it('the case id is the case id, by either route', () => {
    // Employee File → HR Processes passes the SAME id the global list does; the
    // screen resolves the case from `cases` by `activeCaseId` and nothing else.
    expect(caseViewCode).toMatch(/cases\.find\(.*activeCaseId/);
    expect(read('src/screens/EmployeeFileScreen.jsx')).toContain('setActiveCaseId(caseId)');
  });

  it('a direct Case View route needs no journey through People', () => {
    // The screen renders from activeCaseId alone — People is the conceptual parent,
    // not a routing prerequisite.
    expect(caseViewCode).not.toMatch(/SCREENS\.PEOPLE.*required/i);
    expect(caseViewCode).toContain('casesLoading');
  });

  it('the employee name links back to the Employee File', () => {
    expect(caseViewSrc).toContain('setActiveEmployeeId(cs.employeeId); setScreen(SCREENS.EMPLOYEE_FILE)');
    // Falls back to plain text when there is no canonical employee to link to.
    expect(caseViewSrc).toContain('cs.employeeId && setActiveEmployeeId ?');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.1 — the same instruction is not given three times', () => {
  it('the duplicate next-step banner is gone', () => {
    expect(caseViewCode).not.toMatch(/>\s*Suggested next step:/);
    // Its label and its second copy of the primary button, both removed.
    expect(caseViewCode).not.toMatch(/nextStep\.label\+" →"/);
  });

  it('the engine and its explanation data are untouched', () => {
    // Removing a surface must not remove the authority behind it.
    expect(caseViewCode).toContain('getNextStep(cs, {hasAppealManager: !!currentAppealManagerAccess, isHR, conclusionRollup})');
    expect(caseViewCode).toContain('handleNextStepAction');
    // Wave B.2 — the screen no longer renders the reason on sight, so this asserts
    // the INVARIANT rather than the old call shape: the engine still produces the
    // explanation data, and it is still read, now through the classifier.
    expect(read('src/lib/nextStep.js')).toMatch(/reason:/);
    expect(caseViewCode).toContain('reasonForDefaultSurface(nextStep)');
  });

  it('the explanation appears ONCE, not under both surfaces', () => {
    // Wave B.2 — it now appears ZERO times unrestricted: only a classified class B
    // reason reaches the surface, and then once.
    expect((caseViewCode.match(/>\{nextStep\.reason\}</g) || []).length).toBe(0);
    expect((caseViewCode.match(/>\{exceptionReason\}</g) || []).length).toBe(1);
  });

  it('the genuinely different SECONDARY action survives', () => {
    // "No case to answer — close" is an alternative, not a duplicate.
    expect(caseViewCode).toContain('nextStep.secondary');
    expect(caseViewCode).toContain('close_no_case');
  });

  it('attention EXCLUDES whatever the primary action already does', () => {
    const attention = caseViewCode.slice(caseViewCode.indexOf('const caseAttention'),
                                         caseViewCode.indexOf('const openGuardrails'));
    expect(attention).toMatch(/!== nextStep\.label\.trim\(\)\.toLowerCase\(\)/);
  });

  it('exactly one primary action renders in the header', () => {
    expect(caseViewCode).toContain('{primary && <button onClick={primary.onClick}');
    expect((caseViewCode.match(/\{primary && <button/g) || []).length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.1 — guardrails are conditionally prominent', () => {
  it('the gate uses the REAL signal shape', () => {
    // Wave B filtered on `sig.kind`, which case_signals does not have — the field is
    // `type` — so the gate never matched and the block never rendered at all. It now
    // uses the same helper the Overview panel uses.
    expect(caseViewCode).toContain('openSignalsForCase(caseSignals, cs.id, "process_risk")');
    expect(caseViewCode).not.toMatch(/sig\.kind === "process_risk"/);
  });

  it('no active guardrail means no prominent block', () => {
    expect(caseViewCode).toContain('{openGuardrails.length > 0 && (');
    expect(caseViewCode).not.toMatch(/false && openGuardrails/);
  });

  it('the panel receives the FILTERED signals, not the raw list', () => {
    expect(caseViewCode).toContain('<GuardrailsPanel cs={cs} signals={openGuardrails}');
  });

  it('deterministic logic, citations and deviation recording are preserved', () => {
    expect(caseViewCode).toContain('requestPolicyDeviationReason');
    expect(caseViewCode).toContain('changeSignalStatus');
    expect(read('src/components/GuardrailsPanel.jsx')).toContain('PolicyCitation');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.1 — the rest of Wave B is preserved', () => {
  it('the chronology is still first-class — now as the Record destination', () => {
    // Wave B.2 final cleanup — the compact summary that used to sit above the
    // workspace is gone BECAUSE Record owns this job outright. The engine behind
    // it is untouched; see caseWorkspaceCorrective.test.jsx for the rendered
    // assertions that Record exists and renders the timeline.
    expect(read('src/lib/caseViewSummary.js')).toContain('export function caseRecordEntries');
    expect(read('src/lib/caseWorkspace.js')).toContain('id: "record"');
  });

  it('no twelve-tab return', () => {
    ['const TABS = [', 'PRIMARY_TAB_IDS', 'MORE_GROUPS']
      .forEach(t => expect(caseViewCode, t).not.toContain(t));
  });

  it('the repeated Show/Hide words never came back', () => {
    // Wave B.2 corrective — the accordion they belonged to is gone entirely,
    // replaced by a horizontal workspace. The accessible-state guarantee moved
    // with it and is asserted on the RENDERED tablist in
    // caseSurfaceRefinement.test.jsx, not on source text here.
    expect(caseViewCode).not.toMatch(/\{open\?"Hide":"Show"\}/);
  });

  it('Delete case moved to the header menu and is never primary', () => {
    expect(caseViewCode).toMatch(/isHR && \{ label: "Delete case"/);
    expect(caseViewCode).toContain('danger:true');
    // Not the primary action, and gone from the analysis panels.
    expect(caseViewCode).not.toMatch(/primary[^\n]*Delete case/);
    // Wave B.2 — the analysis bucket that used to host it does not exist any more,
    // which is a stronger guarantee than it not containing the button.
    expect(existsSync('src/components/caseTabs/OverviewTab.jsx')).toBe(false);
  });

  it('sections still only appear when they apply', () => {
    expect(caseDetailSections({}).map(s => s.id)).not.toContain('people');
  });
});
