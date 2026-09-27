import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync, existsSync } from 'node:fs';
import { EmployeeFileScreen } from '../screens/EmployeeFileScreen.jsx';
import { buildEmployeeFile, employeeFileViewer, buildAttention, processLabel, EMPLOYEE_FILE_TABS,
         deriveCurrentWarnings, isWarningLive, appealEffectOnCase } from '../lib/employeeFile.js';

// Phase E1 — the Employee File.
//
// A case is NOT the Employee File. An employee may have several separate open
// processes, and nothing here may merge them. The file is a COMPOSITION surface:
// "I can open John Smith" must never imply "I can see everything about him".

const app = readFileSync('src/App.jsx', 'utf8');
const appCode = app.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const shell = readFileSync('src/screens/EmployeeFileScreen.jsx', 'utf8');
const overview = readFileSync('src/screens/employeeFile/EmployeeFileOverview.jsx', 'utf8');
const tabs = readFileSync('src/screens/employeeFile/EmployeeFileTabs.jsx', 'utf8');
const header = readFileSync('src/screens/employeeFile/EmployeeFileHeader.jsx', 'utf8');
// Prohibition assertions run against comment-stripped source: a rationale
// comment legitimately names the thing the code must not do, so asserting
// against raw source makes the explanation itself fail the test.
// Strips BOTH `//` lines and `/* … */` blocks. A JSX rationale comment spans
// several lines without a `//` prefix on each, so a line filter alone leaves its
// continuation lines behind — which is how this assertion first failed against
// the very sentence explaining the rule.
const strip = t => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const shellCodeStripped = strip(shell);
const overviewCode = strip(overview);
const tabsCode = strip(tabs);
const activityCode = readFileSync('src/lib/employeeActivities.js', 'utf8');
const headerCode = strip(header);
const lib = readFileSync('src/lib/employeeFile.js', 'utf8');
const libCode = lib.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const people = readFileSync('src/screens/PeopleScreen.jsx', 'utf8');

const JOHN_A = { id: 'u-a', name: 'John Smith', jobTitle: 'Sales Manager', location: 'Manchester', employeeNumber: '1042', employmentStatus: 'active' };
const JOHN_B = { id: 'u-b', name: 'John Smith', jobTitle: 'Team Leader', location: 'Leeds', employeeNumber: '2841', employmentStatus: 'active' };
const DANA = { id: 'u-d', name: 'Dana Keys' };

const caseFor = (id, employeeId, over = {}) => ({
  id, employeeId, employeeName: 'John Smith', caseType: 'misconduct',
  stage: 'investigation', createdAt: '2026-03-01T00:00:00Z', meetings: [], evidence: [], ...over,
});

const DATA = {
  employeeRecords: [JOHN_A, JOHN_B, DANA],
  cases: [
    caseFor('c-a1', 'u-a'),
    caseFor('c-a2', 'u-a', { caseType: 'flexible_working', createdAt: '2026-06-01T00:00:00Z' }),
    caseFor('c-a-closed', 'u-a', { stage: 'closed', createdAt: '2025-01-01T00:00:00Z' }),
    caseFor('c-b', 'u-b', { caseType: 'grievance' }),
    caseFor('c-legacy', null),
  ],
  wellbeingNotes: [{ id: 'w1', employeeId: 'u-a', employeeName: 'John Smith', type: 'chat', createdAt: '2026-05-01' }],
  concernReferrals: [{ id: 'r1', employeeId: 'u-a', createdAt: '2026-04-01' }],
  dsarRequests: [{ id: 'd1', employeeId: 'u-a', receivedDate: '2026-02-01' }],
  dueSoon: [],
};

const baseProps = {
  ...DATA,
  employeeId: 'u-a',
  isHR: true,
  activeTab: 'overview',
  setActiveTab: () => {},
  setScreen: () => {},
  setActiveCaseId: () => {},
  setActiveCaseStage: () => {},
  fmtDate: d => String(d).slice(0, 10),
};

// ═══════════════════════════════════════════════════════════════════════════
describe('3/5/6/7/8. processes stay separate, and identity is canonical', () => {
  it('5/6. cases come from employee_id — a legacy same-name case is not absorbed', () => {
    const file = buildEmployeeFile('u-a', DATA, { isHR: true });
    expect(file.processes.map(p => p.caseId).sort()).toEqual(['c-a-closed', 'c-a1', 'c-a2']);
    expect(file.processes.map(p => p.caseId)).not.toContain('c-legacy');
    expect(file.processes.map(p => p.caseId)).not.toContain('c-b');
  });

  it('3. two same-named employees open entirely distinct files', () => {
    const a = buildEmployeeFile('u-a', DATA, { isHR: true });
    const b = buildEmployeeFile('u-b', DATA, { isHR: true });
    expect(a.processes.map(p => p.caseId)).not.toContain('c-b');
    expect(b.processes.map(p => p.caseId)).toEqual(['c-b']);
    // Distinguishable in the header too, not just internally.
    expect(a.employee.employeeNumber).toBe('1042');
    expect(b.employee.employeeNumber).toBe('2841');
  });

  it('7. multiple open processes remain SEPARATE, never merged', () => {
    const file = buildEmployeeFile('u-a', DATA, { isHR: true });
    expect(file.openProcesses).toHaveLength(2);
    expect(file.hasMultipleOpen).toBe(true);
    // No single "current" process is invented when there are two.
    expect(file.currentProcess).toBeNull();
    // Each keeps its own identity and human label.
    expect(file.openProcesses.map(p => p.label).sort()).toEqual(['Disciplinary', 'Flexible working']);
    expect(new Set(file.openProcesses.map(p => p.caseId)).size).toBe(2);
  });

  it('8. a closed case is kept apart from the open processes', () => {
    const file = buildEmployeeFile('u-a', DATA, { isHR: true });
    expect(file.closedProcesses.map(p => p.caseId)).toEqual(['c-a-closed']);
    expect(file.openProcesses.map(p => p.caseId)).not.toContain('c-a-closed');
  });

  it('one open process becomes the "what is happening" summary', () => {
    const single = { ...DATA, cases: [caseFor('only', 'u-a')] };
    const file = buildEmployeeFile('u-a', single, { isHR: true });
    expect(file.currentProcess.caseId).toBe('only');
    expect(file.hasMultipleOpen).toBe(false);
  });

  it('process labels are human words, not database values', () => {
    expect(processLabel('flexible_working')).toBe('Flexible working');
    expect(processLabel('misconduct')).toBe('Disciplinary');
    expect(processLabel('long_term_sickness')).toBe('Long-term sickness');
    // An unknown type is title-cased rather than shown raw or as "undefined".
    expect(processLabel(null)).toBe('HR process');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('1/2. navigation and routing are by UUID', () => {
  it('1. People navigates to the Employee File by uuid', () => {
    expect(people).toContain('setActiveEmployeeId(p.id)');
    expect(people).toContain('SCREENS.EMPLOYEE_FILE');
    expect(people).not.toContain('setActivePerson');
  });

  it('2. the route carries the uuid and the tab, and refresh resolves both', () => {
    expect(appCode).toContain("if (screen === SCREENS.EMPLOYEE_FILE && activeEmployeeId) {");
    expect(appCode).toContain("params.set('employee', activeEmployeeId);");
    expect(appCode).toContain("params.set('tab', employeeFileTab)");
    // Initialised from the URL, so a cold load lands on the right person AND tab.
    expect(appCode).toContain('useState(() => readNavFromUrl().employeeId)');
    expect(appCode).toContain('readNavFromUrl().employeeTab');
  });

  it('there is ONE employee detail surface — Person View is gone', () => {
    expect(existsSync('src/screens/PersonViewScreen.jsx')).toBe(false);
    expect(appCode).not.toContain('PersonViewScreen');
    expect(appCode).not.toContain('PERSON_VIEW');
    expect(readFileSync('src/constants.js', 'utf8')).not.toContain('PERSON_VIEW');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('4/12/13/14/15. rendering, permissions and confidentiality', () => {
  it('4. the header uses the canonical roster record', async () => {
    render(<EmployeeFileScreen {...baseProps} />);
    expect(screen.getByRole('heading', { level: 1, name: 'John Smith' })).toBeInTheDocument();
    // Job title, location and number come from the roster row, not from a case.
    expect(screen.getByText(/Sales Manager · Manchester · #1042/)).toBeInTheDocument();
  });

  it('4. a stale uuid that resolves to nobody explains itself', () => {
    render(<EmployeeFileScreen {...baseProps} employeeId="u-nope" />);
    expect(screen.getByText(/no longer available/)).toBeInTheDocument();
  });

  it('12. an empty file renders truthfully, with no invented activity', () => {
    render(<EmployeeFileScreen {...baseProps} employeeId="u-d" />);
    expect(screen.getByText('No recorded activity yet.')).toBeInTheDocument();
    expect(screen.getByText(/does not currently have any cases/)).toBeInTheDocument();
    // No zero-count KPI tiles.
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('13. wellbeing reaches the file only for an authorised HR viewer', () => {
    const hr = buildEmployeeFile('u-a', DATA, { isHR: true });
    expect(hr.recentActivity.some(e => e.label === 'Wellbeing note recorded')).toBe(true);
    const notHr = buildEmployeeFile('u-a', DATA, { isHR: false, role: 'location_manager' });
    expect(notHr.recentActivity.some(e => e.label === 'Wellbeing note recorded')).toBe(false);
  });

  it('14/15. existence is not leaked — the section is OMITTED, never disabled', () => {
    render(<EmployeeFileScreen {...baseProps} isHR={false} role="location_manager" />);
    // No header, no count, no "hidden"/"no access" placeholder.
    ['Wellbeing', 'wellbeing', 'Subject access', 'DSAR', 'no access', 'restricted', 'hidden']
      .forEach(t => expect(screen.queryByText(new RegExp(t))).not.toBeInTheDocument());
    // Structurally too: nothing renders a locked state.
    expect(overviewCode).not.toContain('You do not have access');
    expect(tabsCode).not.toContain('You do not have access');
  });

  it('8. employment details omit unrecorded fields rather than showing blanks', async () => {
    const user = userEvent.setup();
    // DANA has a name and nothing else; JOHN_A has several fields.
    render(<EmployeeFileScreen {...baseProps} employeeId="u-a" />);
    await user.click(screen.getByRole('button', { name: /Employment details/ }));
    expect(screen.getByText('Job title')).toBeInTheDocument();
    // Fields with no recorded value are ABSENT — not rendered as a dash, which
    // makes a sparse record look broken.
    expect(screen.queryByText('Work email')).not.toBeInTheDocument();
    expect(screen.queryByText('Manager')).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('8. an employee with no recorded details shows no details section at all', () => {
    render(<EmployeeFileScreen {...baseProps} employeeId="u-d" />);
    expect(screen.queryByRole('button', { name: /Employment details/ })).not.toBeInTheDocument();
  });

  it('13/14. the capability gate is explicit, not "the array happened to be empty"', () => {
    expect(libCode).toContain('canSeeWellbeing: !!isHR');
    expect(libCode).toContain('canSeeDsar: !!isHR');
    expect(libCode).toContain('if (viewer.canSeeWellbeing)');
    const v = employeeFileViewer({ isHR: false, role: 'investigator' });
    expect(v.canSeeWellbeing).toBe(false);
    expect(v.canSeeDsar).toBe(false);
    expect(v.canCreateCase).toBe(false);
  });

  it('17-22. no role gains history: the file only narrows what it was given', () => {
    // The screen fetches nothing. Every collection is a prop, already
    // RLS-filtered, so a Location Manager/Line Manager/Investigator/Legal
    // reviewer/Auditor sees exactly the cases they were already able to see —
    // and a Platform Admin, who has no org_members row, is handed nothing.
    expect(shellCodeStripped).not.toContain('supabase');
    expect(shellCodeStripped).not.toContain('authedFetch');
    expect(shellCodeStripped).not.toContain('fetch(');
    expect(libCode).not.toContain('supabase');
    expect(libCode).not.toContain('fetch');
    // 27. no service-role employee endpoint was added.
    expect(shellCodeStripped).not.toContain('service');
    // Proven behaviourally: an investigator given only their own case sees only it.
    const onlyMine = { ...DATA, cases: [caseFor('mine', 'u-a')] };
    const inv = buildEmployeeFile('u-a', onlyMine, { isHR: false, role: 'investigator' });
    expect(inv.processes.map(p => p.caseId)).toEqual(['mine']);
    expect(inv.recentActivity.some(e => e.quiet)).toBe(false);
  });

  it('16. a confidential case the viewer cannot read never arrives, so never shows', () => {
    // Confidential-case access is decided by RLS before this screen exists. The
    // file cannot re-admit a case it was not given.
    const withoutConfidential = { ...DATA, cases: [caseFor('ordinary', 'u-a')] };
    const file = buildEmployeeFile('u-a', withoutConfidential, { isHR: false, role: 'line_manager' });
    expect(file.processes.map(p => p.caseId)).toEqual(['ordinary']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('6. attention comes from existing state, and is never manufactured', () => {
  it('an overdue deadline is matched by caseId, never by the name stamped on it', () => {
    const items = buildAttention({
      processes: [],
      caseIds: new Set(['c-a1']),
      dueSoon: [
        { caseId: 'c-a1', label: 'Outcome letter due', overdue: true, daysOverdue: 3, key: 'k1', employeeName: 'Someone Else' },
        { caseId: 'other', label: 'Not this employee', overdue: true, key: 'k2' },
        { caseId: 'c-a1', label: 'Due next week', overdue: false, key: 'k3' },
      ],
    });
    expect(items.map(i => i.label)).toEqual(['Outcome letter due']);
    expect(items[0].context).toBe('3 days overdue');
  });

  it('nothing to do means an EMPTY list, not an empty warning panel', () => {
    expect(buildAttention({ processes: [], dueSoon: [], caseIds: new Set() })).toEqual([]);
    // And the section only renders when there is something in it.
    expect(overview).toContain('{attention.length > 0 && (');
  });

  it('the next step comes from the shared deterministic engine, not a second opinion', () => {
    expect(lib).toContain("import { getNextStep } from './nextStep.js'");
    expect(libCode).toContain('getNextStep(cs, { isHR: !!viewer.isHR })');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('9/10/11. opening and creating cases', () => {
  it('9. opening a case enters the existing Case View', async () => {
    const user = userEvent.setup();
    const setScreen = vi.fn();
    const setActiveCaseId = vi.fn();
    const single = { ...DATA, cases: [caseFor('only', 'u-a')] };
    render(<EmployeeFileScreen {...baseProps} {...single} setScreen={setScreen} setActiveCaseId={setActiveCaseId} />);
    await user.click(screen.getAllByRole('button', { name: 'Open case' })[0]);
    expect(setActiveCaseId).toHaveBeenCalledWith('only');
    expect(setScreen).toHaveBeenCalledWith('case_view');
  });

  it('10. New case preselects the employee UUID', async () => {
    const user = userEvent.setup();
    const onNewCase = vi.fn();
    render(<EmployeeFileScreen {...baseProps} onNewCase={onNewCase} />);
    await user.click(screen.getByRole('button', { name: 'New case' }));
    expect(onNewCase).toHaveBeenCalledWith('u-a');
    // It opens the EXISTING modal with the employee already chosen.
    expect(appCode).toContain('onNewCase={(id)=>{ setCasePromptEmployeeId(id); setShowCasePrompt(true); }}');
  });

  it('11. the Employee File never creates a case itself', () => {
    [shellCodeStripped, overview, tabs, libCode].forEach(src => {
      expect(src).not.toContain('saveCases');
      expect(src).not.toContain('crypto.randomUUID');
      expect(src).not.toContain('supabase');
    });
    // The modal still enforces its own required fields.
    expect(appCode).toContain('disabled={!casePromptEmployeeId}');
  });

  it('New case is offered only to a viewer who may create one', () => {
    render(<EmployeeFileScreen {...baseProps} isHR={false} role="line_manager" onNewCase={() => {}} />);
    expect(screen.queryByRole('button', { name: 'New case' })).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('23/24/25/26. deferred tabs are honest, and no AI was added', () => {
  // Phase E1.6 replaced the five tabs with the approved four. Timeline and
  // Meetings were both chronological views of the same history and are now one
  // Activity tab; "Cases & processes" became "HR Processes".
  it('the four tabs exist as a real tablist', () => {
    render(<EmployeeFileScreen {...baseProps} />);
    expect(EMPLOYEE_FILE_TABS.map(t => t.label))
      .toEqual(['Overview', 'Activity', 'HR Processes', 'Documents']);
    expect(screen.getByRole('tablist', { name: 'Employee file sections' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('23/24. Activity replaces Timeline and Meetings, and name-matches nothing', () => {
    render(<EmployeeFileScreen {...baseProps} activeTab="activity" />);
    // The chronology explains what it is rather than promising a future feature.
    expect(screen.getByText(/authorised record of management activity/)).toBeInTheDocument();
    // The claim the old Timeline shell existed to protect, kept: nothing here
    // resolves an employee by name.
    expect(tabsCode).not.toContain('employeeName ===');
    expect(tabsCode).not.toContain('employeeName===');
    expect(activityCode).not.toContain('employeeName');
  });

  it('24. Activity lists ONLY meetings from this employee\'s canonical cases', () => {
    // Behavioural, not a source check, and unchanged in substance by the move from
    // the Meetings tab into Activity: a legacy same-name case's meeting must not
    // appear, and neither must a same-named colleague's.
    const data = {
      ...DATA,
      cases: [
        caseFor('mine', 'u-a', { meetings: [{ id: 'm-mine', type: 'Investigation meeting', date: '2026-03-02' }] }),
        caseFor('legacy', null, { meetings: [{ id: 'm-legacy', type: 'Legacy meeting', date: '2026-03-03' }] }),
        caseFor('colleague', 'u-b', { meetings: [{ id: 'm-colleague', type: 'Colleague meeting', date: '2026-03-04' }] }),
      ],
    };
    render(<EmployeeFileScreen {...baseProps} {...data} activeTab="activity" />);
    // Substring matchers: an Activity row reads "<meeting type> — <process>", so
    // the meeting name shares its text node with the process it belongs to.
    expect(screen.getByText(/Investigation meeting/)).toBeInTheDocument();
    expect(screen.queryByText(/Legacy meeting/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Colleague meeting/)).not.toBeInTheDocument();
  });

  it('24. a meeting held outside a case is still absent, because it has no employee', () => {
    // public.meetings has no employee_id; attributing one by name is the inference
    // this programme removed. The Activity projection therefore only reaches
    // meetings through an authorised case.
    expect(activityCode).toContain('(c.meetings || [])');
    expect(activityCode).not.toContain('standaloneMeetings');
  });

  it('25. the Documents tab lists only documents from canonical cases', () => {
    const data = {
      ...DATA,
      cases: [
        caseFor('mine', 'u-a', { evidence: [{ id: 'e1', name: 'Mine.pdf', type: 'Document' }] }),
        caseFor('legacy', null, { evidence: [{ id: 'e2', name: 'Legacy.pdf', type: 'Document' }] }),
      ],
    };
    render(<EmployeeFileScreen {...baseProps} {...data} activeTab="documents" />);
    expect(screen.getByText('Mine.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Legacy.pdf')).not.toBeInTheDocument();
  });

  it('25. Documents points at case documents and stores nothing', () => {
    render(<EmployeeFileScreen {...baseProps} activeTab="documents" />);
    expect(screen.getByText(/documents belong to the case they were produced in|Evidence and letters saved/)).toBeInTheDocument();
    ['upload', 'storage', 'createBucket', 'dataUrl', 'FormData'].forEach(t => expect(tabsCode).not.toContain(t));
  });

  it('26. no employee-wide AI profiling anywhere in the Employee File', () => {
    [shellCodeStripped, overviewCode, tabsCode, headerCode, libCode].forEach(src => {
      ['/api/chat', 'Pattern Analysis', 'Risk Assessment', 'Employee Summary',
       'employmentProfile', 'prompt'].forEach(t => expect(src).not.toContain(t));
    });
    // And the dead state went with the removed feature.
    expect(appCode).not.toContain('employmentProfile');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('17. legacy history is never presented as this person\'s', () => {
  it('the notice is organisation-level, and says so', () => {
    render(<EmployeeFileScreen {...baseProps} employeeId="u-d" />);
    // "Some older ORGANISATION records" — never "John has older records".
    expect(screen.getByText(/Some older organisation records have not yet been linked/)).toBeInTheDocument();
    expect(overviewCode).not.toMatch(/has older records/);
  });

  it('it is shown only to HR, who can act on it', () => {
    const notHr = buildEmployeeFile('u-d', DATA, { isHR: false, role: 'line_manager' });
    expect(notHr.showUnattributedNotice).toBe(false);
    const hr = buildEmployeeFile('u-d', DATA, { isHR: true });
    expect(hr.showUnattributedNotice).toBe(true);
  });

  it('recent activity contains no legacy record', () => {
    const file = buildEmployeeFile('u-a', DATA, { isHR: true });
    expect(file.recentActivity.every(e => !e.id.includes('c-legacy'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('14. actions, restraint and the deferred meeting action', () => {
  it('no "Start meeting" action exists — it would create identity debt', () => {
    // E2 owns meeting → employee. Until then a button here could only produce a
    // name-only or wrongly-parented meeting.
    [shellCodeStripped, overviewCode, tabsCode, headerCode].forEach(src => {
      expect(src).not.toContain('New meeting');
      expect(src).not.toContain('Start meeting');
      expect(src).not.toContain('setMeetingSetup');
    });
  });

  it('one primary action, secondary actions kept quiet', () => {
    render(<EmployeeFileScreen {...baseProps} onNewCase={() => {}} setEditing={() => {}} />);
    const primary = screen.getByRole('button', { name: 'New case' });
    expect(primary).toBeInTheDocument();
    // Editing is offered, but as a secondary action and not as a form on Overview.
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Job title')).not.toBeInTheDocument();
  });

  it('the edit flow survived the Person View removal, and writes by id', () => {
    render(<EmployeeFileScreen {...baseProps} editing={true} setEditing={() => {}}
      editJobTitle="Sales Manager" editStartDate="" editLocation="" locations={[]} />);
    expect(screen.getByLabelText('Job title')).toBeInTheDocument();
    expect(appCode).toContain('employeeId: employee.id');
    expect(appCode).toContain('deleteEmployeeRecord(employee.id)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('design, responsiveness and accessibility', () => {
  it('uses the Archivo token system, never hardcoded off-brand surfaces', () => {
    [shellCodeStripped, overviewCode, tabsCode, headerCode].forEach(src => {
      // The shell sits one level above its parts, hence two accepted paths.
      expect(src).toMatch(/from '\.\.\/(\.\.\/)?styles\/tokens'/);
      // The beige paper and DM Sans of the old surface are gone.
      expect(src).not.toContain('#FDFAF5');
      expect(src).not.toContain('DM Sans');
      expect(src).not.toContain('DM Serif');
      expect(src).not.toContain('#7C5CFC');
      expect(src).not.toContain('linear-gradient');
    });
  });

  it('attention items are visually distinct, and not by colour alone', () => {
    // Regression guard for a defect visual verification caught: the amber tint
    // was used as a 1px border and was invisible, so attention looked identical
    // to ordinary content.
    expect(overviewCode).toContain('borderLeft: attention ?');
    expect(overviewCode).toContain('background: attention ? COLOR.amberTint');
    // The meaning is carried in words as well as colour.
    expect(overviewCode).toContain('Needs your attention');
  });

  it('nothing encodes status by colour alone', () => {
    // Employment status is words; tab selection is weight + underline.
    expect(header).toContain('Left the organisation');
    expect(header).toContain('fontWeight: selected ? 700 : 500');
  });

  it('long values wrap instead of overflowing, and tabs scroll', () => {
    expect(header).toContain('overflowWrap: "anywhere"');
    expect(header).toContain('overflowX: "auto"');
    expect(header).toContain('whiteSpace: "nowrap"');
    // Flex wrapping is how the header collapses on a narrow viewport.
    expect(header).toContain('flexWrap: "wrap"');
  });

  it('the tablist is a real ARIA tablist with keyboard support', async () => {
    const user = userEvent.setup();
    const setActiveTab = vi.fn();
    render(<EmployeeFileScreen {...baseProps} setActiveTab={setActiveTab} />);
    const selected = screen.getByRole('tab', { name: 'Overview' });
    expect(selected).toHaveAttribute('aria-controls', 'emp-panel-overview');
    selected.focus();
    await user.keyboard('{ArrowRight}');
    expect(setActiveTab).toHaveBeenCalledWith('activity');
    // The panel is labelled by its tab and focusable for screen-reader flow.
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'emp-tab-overview');
  });

  it('touch targets on the tabs are real', () => {
    expect(header).toContain('minHeight: 44');
  });

  it('headings are semantic and ordered', () => {
    render(<EmployeeFileScreen {...baseProps} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('John Smith');
    // Section headings are h2s beneath it, not styled divs.
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase E1.1 — current formal warnings.
//
// Derived from structured outcome metadata only. Never from the case type,
// never from the word "warning" in a letter, never from a model.
describe('E1.1 — current formal warnings', () => {
  const NOW = new Date('2026-10-01T12:00:00Z');
  const warned = (id, over = {}) => caseFor(id, 'u-a', {
    outcome: 'First written warning',
    outcomeIssuedAt: '2026-09-11T00:00:00Z',
    warningDurationMonths: 6,
    warningExpiresAt: '2027-03-11',
    stage: 'closed',
    ...over,
  });
  const build = (cases, allegations = [], now = NOW, viewer = { isHR: true }) =>
    buildEmployeeFile('u-a', { ...DATA, cases, allegations, now }, viewer);

  it('1/3/4. a live first written warning appears with its issue and recorded expiry', () => {
    const w = build([warned('c1')]).currentWarnings;
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({
      caseId: 'c1', type: 'First written warning',
      issuedAt: '2026-09-11T00:00:00Z', expiresAt: '2027-03-11',
    });
  });

  it('2. a final written warning appears too', () => {
    const w = build([warned('c1', { outcome: 'Final written warning' })]).currentWarnings;
    expect(w[0].type).toBe('Final written warning');
  });

  it('4. the RECORDED expiry is authoritative, never recomputed from the duration', () => {
    // issue + 6 months would be 11 Mar 2027; the stored expiry disagrees and
    // wins, because it is what the outcome letter told the employee.
    const w = build([warned('c1', { warningExpiresAt: '2027-08-01' })]).currentWarnings;
    expect(w[0].expiresAt).toBe('2027-08-01');
    expect(libCode).not.toContain('addCalendarMonths');
  });

  it('5. an expired warning does not appear', () => {
    // NOW is 1 Oct 2026; an expiry of 30 Sep is the day before, so it is spent.
    expect(build([warned('c1', { warningExpiresAt: '2026-09-30' })]).currentWarnings).toEqual([]);
    // And the inclusive boundary: expiring TODAY is still current.
    expect(build([warned('c1', { warningExpiresAt: '2026-10-01' })]).currentWarnings).toHaveLength(1);
  });

  it('the expiry boundary is INCLUSIVE, deterministic and clock-independent', () => {
    // "Expires 11 Mar 2027" means the warning still stands ON 11 March and is
    // gone on the 12th — the plain reading of the letter, and the clearer
    // reading of ACAS (disregarded AFTER the period, not on its last day).
    const at = d => deriveCurrentWarnings([warned('c1', { warningExpiresAt: '2027-03-11' })], [], new Date(d)).length;
    expect(at('2027-03-10T23:00:00Z')).toBe(1);  // day before expiry → CURRENT
    expect(at('2027-03-11T00:00:00Z')).toBe(1);  // ON expiry         → CURRENT
    expect(at('2027-03-12T00:00:00Z')).toBe(0);  // day after expiry  → EXPIRED
    // Calendar dates only — the hour of day never changes the answer, so the
    // last moment of the expiry date is still current and the first moment of
    // the next day is not.
    expect(isWarningLive('2027-03-11', new Date('2027-03-11T00:00:00Z'))).toBe(true);
    expect(isWarningLive('2027-03-11', new Date('2027-03-11T23:59:59Z'))).toBe(true);
    expect(isWarningLive('2027-03-11', new Date('2027-03-12T00:00:01Z'))).toBe(false);
  });

  it('6/15. a CLOSED case with a live warning still appears', () => {
    const file = build([warned('c1', { stage: 'closed' })]);
    expect(file.openProcesses).toHaveLength(0);
    expect(file.currentWarnings).toHaveLength(1);
    // And the warning stays associated with its case, which remains reachable.
    expect(file.closedProcesses.map(p => p.caseId)).toContain('c1');
  });

  it('16. an open disciplinary case with no issued outcome contributes nothing', () => {
    const file = build([caseFor('c1', 'u-a', { stage: 'investigation' })]);
    expect(file.currentWarnings).toEqual([]);
    expect(file.openProcesses).toHaveLength(1);
  });

  it('17. a draft outcome — recorded but never issued — is not a warning', () => {
    const w = build([warned('c1', { outcomeIssuedAt: null })]).currentWarnings;
    expect(w).toEqual([]);
  });

  it('a non-warning outcome is not a warning', () => {
    ['Dismissal', 'No further action', 'Informal advice', ''].forEach(outcome => {
      expect(build([warned('c1', { outcome })]).currentWarnings).toEqual([]);
    });
  });

  it('7. no live warnings means no section at all', () => {
    const file = build([warned('c1', { warningExpiresAt: '2020-01-01' })]);
    expect(file.currentWarnings).toEqual([]);
    render(<EmployeeFileScreen {...baseProps} cases={[warned('c1', { warningExpiresAt: '2020-01-01' })]} allegations={[]} />);
    expect(screen.queryByText(/Current warning/)).not.toBeInTheDocument();
    ['No warnings', '0 active warnings', 'Clean record'].forEach(t =>
      expect(screen.queryByText(t)).not.toBeInTheDocument());
  });

  it('8. two live warnings stay separate and identifiable', () => {
    const w = build([
      warned('c1'),
      warned('c2', { outcome: 'Final written warning', warningExpiresAt: '2027-01-15' }),
    ]).currentWarnings;
    expect(w).toHaveLength(2);
    // Soonest expiry first, and each keeps its own case.
    expect(w.map(x => x.type)).toEqual(['Final written warning', 'First written warning']);
    expect(new Set(w.map(x => x.caseId)).size).toBe(2);
  });

  it('9/10/22/23. only employee_id-linked cases contribute — no name fallback', () => {
    const w = build([
      warned('mine'),
      { ...warned('colleague'), employeeId: 'u-b' },     // same NAME, different person
      { ...warned('legacy'), employeeId: null },          // legacy name-only
    ]).currentWarnings;
    expect(w.map(x => x.caseId)).toEqual(['mine']);
    // Structurally: the derivation never looks at a name.
    const fn = libCode.slice(libCode.indexOf('export function deriveCurrentWarnings'),
                             libCode.indexOf('// ── Employment details'));
    expect(fn.length).toBeGreaterThan(100);
    expect(fn).not.toContain('employeeName');
    expect(fn).not.toContain('.name');
  });

  it('11/12/13/14. an inaccessible case cannot leak a warning', () => {
    // The derivation is handed the authorised slice and performs no permission
    // logic of its own, so a case the viewer cannot see never arrives. A
    // Location Manager, Investigator or Platform Admin given nothing gets nothing.
    ['location_manager', 'line_manager', 'investigator', 'legal_reviewer', 'auditor'].forEach(role => {
      expect(build([], [], NOW, { isHR: false, role }).currentWarnings).toEqual([]);
    });
    // And nothing announces a hidden warning.
    render(<EmployeeFileScreen {...baseProps} cases={[]} allegations={[]} isHR={false} role="location_manager" />);
    ['warning hidden', 'Current warning', '1 warning'].forEach(t =>
      expect(screen.queryByText(new RegExp(t))).not.toBeInTheDocument());
  });

  it('18. a warning overturned on appeal is NOT current', () => {
    const alls = [{ id: 'a1', caseId: 'c1', appealOutcome: 'upheld' }];
    expect(build([warned('c1')], alls).currentWarnings).toEqual([]);
  });

  it('19/20. varied is withheld; not-upheld and pending follow existing semantics', () => {
    // "Partially upheld" varies the original decision, but Compass records no
    // case-level result of that variation — so the operative warning cannot be
    // established and is withheld rather than guessed.
    expect(build([warned('c1')], [{ id: 'a1', caseId: 'c1', appealOutcome: 'partially_upheld' }]).currentWarnings).toEqual([]);
    // Not upheld → the decision stands.
    expect(build([warned('c1')], [{ id: 'a1', caseId: 'c1', appealOutcome: 'not_upheld' }]).currentWarnings).toHaveLength(1);
    // 20. Pending appeal: nothing in Compass suspends an outcome, so it stands.
    expect(build([warned('c1')], [{ id: 'a1', caseId: 'c1', appealOutcome: null }]).currentWarnings).toHaveLength(1);
    expect(build([warned('c1')], [{ id: 'a1', caseId: 'c1', appealOutcome: 'further_investigation_required' }]).currentWarnings).toHaveLength(1);
    // Another case's appeal never affects this one.
    expect(build([warned('c1')], [{ id: 'a1', caseId: 'other', appealOutcome: 'upheld' }]).currentWarnings).toHaveLength(1);
  });

  it('the appeal effect composes the EXISTING allegation model', () => {
    expect(appealEffectOnCase('c1', [{ id: 'a1', caseId: 'c1', appealOutcome: 'upheld' }])).toBe('overturned');
    expect(appealEffectOnCase('c1', [{ id: 'a1', caseId: 'c1', appealOutcome: 'not_upheld' }])).toBe('unchanged');
    expect(appealEffectOnCase('c1', [])).toBe('none');
    // Overturned wins over a varied sibling — the harsher-to-the-employer
    // reading, and the one that cannot overstate a record.
    expect(appealEffectOnCase('c1', [
      { id: 'a1', caseId: 'c1', appealOutcome: 'partially_upheld' },
      { id: 'a2', caseId: 'c1', appealOutcome: 'upheld' },
    ])).toBe('overturned');
    expect(lib).toContain("from './allegations.js'");
    expect(lib).toContain("from './outcomeTypes.js'");
  });

  it('24. no AI and no text inference anywhere in the derivation', () => {
    const fn = libCode.slice(libCode.indexOf('export function deriveCurrentWarnings'),
                             libCode.indexOf('// ── Employment details'));
    ['includes("warning")', 'toLowerCase', 'outcomeNotes', 'letterOutput', 'description', '/api/chat']
      .forEach(t => expect(fn).not.toContain(t));
    // Warning-ness comes from the shared list, not from the case type.
    expect(libCode).toContain('isWarningOutcome(cs.outcome)');
    expect(fn).not.toContain('caseType ===');
  });

  it('renders calmly: no alarm language, no red banner', () => {
    render(<EmployeeFileScreen {...baseProps} cases={[warned('c1')]} allegations={[]} />);
    expect(screen.getByText('First written warning')).toBeInTheDocument();
    // en-GB abbreviates September as "Sept", not "Sep" — asserted against what
    // the locale actually produces rather than what I assumed it would.
    expect(screen.getByText('Issued 11 Sept 2026 · Expires 11 Mar 2027')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View case' })).toBeInTheDocument();
    ['risk', 'Risk', 'URGENT', 'Alert', 'Danger'].forEach(t =>
      expect(screen.queryByText(new RegExp(t))).not.toBeInTheDocument());
    // No red, and no invented "expiring soon" threshold.
    expect(overviewCode).not.toContain('COLOR.red');
    [' 30 ', ' 14 ', 'expiringSoon', 'EXPIRING'].forEach(t => expect(libCode).not.toContain(t));
  });

  it('View case opens the existing Case View — no warning-detail screen', async () => {
    const user = userEvent.setup();
    const setScreen = vi.fn();
    const setActiveCaseId = vi.fn();
    render(<EmployeeFileScreen {...baseProps} cases={[warned('c1')]} allegations={[]}
      setScreen={setScreen} setActiveCaseId={setActiveCaseId} />);
    await user.click(screen.getByRole('button', { name: 'View case' }));
    expect(setActiveCaseId).toHaveBeenCalledWith('c1');
    expect(setScreen).toHaveBeenCalledWith('case_view');
  });
});
