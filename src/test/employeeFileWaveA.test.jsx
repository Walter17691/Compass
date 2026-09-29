import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmployeeFileScreen } from '../screens/EmployeeFileScreen';
import { buildEmployeeFile } from '../lib/employeeFile.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE A — Overview hierarchy, ONE history, and the conversation entry.
//
// The resolver has its own suite; this one is about what the SCREEN shows: that
// the two chronologies became one, that the dead control is gone, that Coming up
// only ever shows real future changes, and that nothing hidden leaks through any
// of it.
// ─────────────────────────────────────────────────────────────────────────

const read = f => readFileSync(f, 'utf8');
const stripJs = src => src.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

const overviewSrc = stripJs(read('src/screens/employeeFile/EmployeeFileOverview.jsx'));
const libSrc = stripJs(read('src/lib/employeeFile.js'));
const panelSrc = stripJs(read('src/screens/employeeFile/EmployeeActivityPanel.jsx'));
const peopleSrc = stripJs(read('src/screens/PeopleScreen.jsx'));

const NOW = new Date('2026-09-29T09:00:00Z');
const EMP = 'u-a';
const iso = d => new Date(d).toISOString();

const employee = (over = {}) => ({
  id: EMP, orgId: 'org-1', name: 'John Smith', jobTitle: 'Operative',
  employmentStatus: 'active', ...over,
});

const data = (over = {}) => ({
  employeeRecords: [employee()],
  cases: [], wellbeingNotes: [], concernReferrals: [], dsarRequests: [],
  dueSoon: [], allegations: [],
  employeeActivities: [], employeeActivityRecords: [], employmentEvents: [],
  now: NOW, ...over,
});

const baseProps = (over = {}) => ({
  employeeId: EMP, activeTab: 'overview', setActiveTab: vi.fn(),
  setScreen: vi.fn(), setActiveCaseId: vi.fn(), setActiveCaseStage: vi.fn(),
  fmtDate: d => d, isHR: true, locations: [],
  ...data(), ...over,
});

const file = (over = {}, viewer = { isHR: true }) => buildEmployeeFile(EMP, data(over), viewer);

const oneToOne = (over = {}) => ({
  id: 'act-1to1', employeeId: EMP, activityType: 'one_to_one', title: 'Monthly catch-up',
  occurredAt: iso('2026-09-20'), createdAt: iso('2026-09-20'), lifecycleState: 'completed', ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave A — ONE authoritative history', () => {
  it('the Overview preview is a SLICE of the same projection the tab renders', () => {
    // Structural, not incidental: the preview must not be assembled separately.
    expect(libSrc).toContain('recentActivity: activityEntries.slice(0, 5)');
    expect(libSrc).not.toContain('buildRecentActivity(ctx');
    // And the builder is gone, not merely unused — an unused chronology builder is
    // what the next person reaches for.
    expect(libSrc).not.toContain('export function buildRecentActivity');
  });

  it('a 1:1 and an employment change BOTH appear in the preview', () => {
    // Under the old builder neither did: it knew about cases and meetings only.
    const f = file({
      employeeActivities: [oneToOne()],
      employmentEvents: [{
        id: 'ev-1', employeeId: EMP, eventType: 'job_title_changed',
        effectiveDate: '2026-09-22', oldText: 'Operative', newText: 'Senior Operative',
        documentationStatus: 'sent', createdAt: iso('2026-09-22'),
      }],
    });
    const kinds = f.recentActivity.map(e => e.kind);
    expect(kinds).toContain('activity');
    expect(kinds).toContain('employment_event');
    // Every preview entry is present in the full history, by id.
    const fullIds = new Set(f.activityEntries.map(e => e.id));
    f.recentActivity.forEach(e => expect(fullIds.has(e.id)).toBe(true));
  });

  it('the preview is bounded, and the full history is not', () => {
    const many = Array.from({ length: 9 }, (_, i) => oneToOne({
      id: `a${i}`, title: `Conversation ${i}`, occurredAt: iso(`2026-0${(i % 8) + 1}-05`),
    }));
    const f = file({ employeeActivities: many });
    expect(f.recentActivity).toHaveLength(5);
    expect(f.activityEntries.length).toBeGreaterThan(5);
  });

  it('the DEAD "View timeline" control is gone', () => {
    // It targeted the tab id "timeline", which has not existed since E1.6: it set
    // an invalid tab, fell back to Overview, and did nothing at all.
    expect(overviewSrc).not.toContain('onGoToTab("timeline")');
    expect(overviewSrc).not.toContain('View timeline');
    expect(overviewSrc).toContain('onGoToTab("activity")');
    expect(overviewSrc).toContain('View full history');
  });

  it('the repaired link navigates to the real History tab', () => {
    const setActiveTab = vi.fn();
    render(<EmployeeFileScreen {...baseProps({
      employeeActivities: [oneToOne()], setActiveTab,
    })} />);
    fireEvent.click(screen.getByRole('button', { name: 'View full history' }));
    expect(setActiveTab).toHaveBeenCalledWith('activity');
  });

  it('a Letter of concern appears in history and is NOT a warning', () => {
    const f = file({
      employeeActivities: [oneToOne({ id: 'act-c', activityType: 'management_concern', concernState: 'open' })],
      employeeActivityRecords: [{
        id: 'rec-1', activityId: 'act-c', employeeId: EMP, recordType: 'letter_of_concern',
        occurredAt: iso('2026-09-21'), createdAt: iso('2026-09-21'), summary: 'Letter of concern issued',
      }],
    });
    const entry = f.activityEntries.find(e => e.id === 'act-c');
    expect(entry.hasLetterOfConcern).toBe(true);
    // E1.1 is untouched: it is not, and cannot be, a current warning.
    expect(f.currentWarnings).toEqual([]);
  });

  it('an inaccessible process contributes NOTHING and leaves no placeholder', () => {
    // The viewer is simply not given the case. No "restricted event" row, because
    // existence itself can be confidential.
    const f = file({ cases: [] });
    expect(JSON.stringify(f.activityEntries)).not.toMatch(/restricted|hidden|no access/i);
    expect(JSON.stringify(f.recentActivity)).not.toMatch(/restricted|hidden|no access/i);
  });

  it('history is filtered upstream, never hidden in React', () => {
    // No component-level permission filtering: the projection composes authorised
    // data, and the Overview renders what it is given.
    expect(overviewSrc).not.toMatch(/isHR\s*\?/);
    expect(overviewSrc).not.toContain('canSee');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave A — the empty state stops lying', () => {
  it('a file whose only history is a conversation is NOT empty', () => {
    // ctx.isEmpty counts the E1-era collections only, so this rendered
    // "No recorded activity yet." and hid the employee's real history.
    const f = file({ employeeActivities: [oneToOne()] });
    expect(f.isEmpty).toBe(false);
    render(<EmployeeFileScreen {...baseProps({ employeeActivities: [oneToOne()] })} />);
    expect(screen.queryByText(/No recorded activity yet/)).toBeNull();
    expect(screen.getByText('Recent history')).toBeInTheDocument();
  });

  it('a file whose only history is a future employment change is NOT empty', () => {
    const ev = [{
      id: 'ev-f', employeeId: EMP, eventType: 'job_title_changed',
      effectiveDate: '2026-12-01', newText: 'Senior Operative',
      documentationStatus: 'not_required', createdAt: iso('2026-09-20'),
    }];
    expect(file({ employmentEvents: ev }).isEmpty).toBe(false);
    render(<EmployeeFileScreen {...baseProps({ employmentEvents: ev })} />);
    expect(screen.queryByText(/No recorded activity yet/)).toBeNull();
    expect(screen.getByText('Coming up')).toBeInTheDocument();
  });

  it('a genuinely empty file still says so', () => {
    expect(file().isEmpty).toBe(true);
    render(<EmployeeFileScreen {...baseProps()} />);
    expect(screen.getByText(/No recorded activity yet/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave A — Coming up', () => {
  const pending = {
    id: 'ev-future', employeeId: EMP, eventType: 'job_title_changed',
    effectiveDate: '2026-12-01', newText: 'Senior Operative',
    documentationStatus: 'not_required', createdAt: iso('2026-09-20'),
  };

  it('a real future change appears', () => {
    render(<EmployeeFileScreen {...baseProps({ employmentEvents: [pending] })} />);
    expect(screen.getByText('Coming up')).toBeInTheDocument();
    expect(screen.getByText(/Senior Operative/)).toBeInTheDocument();
  });

  it('a CANCELLED future change does not', () => {
    render(<EmployeeFileScreen {...baseProps({
      employmentEvents: [{ ...pending, cancelledAt: iso('2026-09-25'), cancelledBy: 'u-hr' }],
    })} />);
    expect(screen.queryByText('Coming up')).toBeNull();
  });

  it('an ALREADY EFFECTIVE change is history, not Coming up', () => {
    render(<EmployeeFileScreen {...baseProps({
      employmentEvents: [{ ...pending, effectiveDate: '2026-09-01' }],
    })} />);
    expect(screen.queryByText('Coming up')).toBeNull();
  });

  it('nothing coming renders no section at all', () => {
    render(<EmployeeFileScreen {...baseProps()} />);
    expect(screen.queryByText('Coming up')).toBeNull();
  });

  it('a future change does not take effect early', () => {
    const f = file({ employmentEvents: [pending] });
    expect(f.effectiveEmployee.jobTitle).toBe('Operative');
    expect(f.pendingChanges).toHaveLength(1);
  });

  it('a future LEAVER shows the date and stays a current employee', () => {
    const f = file({
      employmentEvents: [{
        id: 'ev-end', employeeId: EMP, eventType: 'employment_ended',
        effectiveDate: '2026-12-31', documentationStatus: 'not_required', createdAt: iso('2026-09-20'),
      }],
    });
    expect(f.isCurrentEmployee).toBe(true);
    expect(f.leavingDate).toBe('2026-12-31');
    expect(f.pendingChanges).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave A — Overview hierarchy', () => {
  it('sections render in the intended order, and empty ones not at all', () => {
    render(<EmployeeFileScreen {...baseProps()} />);
    // A calm screen: nothing to say means nothing rendered.
    ['What is happening', 'Needs your attention', 'Coming up', 'Recent history']
      .forEach(t => expect(screen.queryByText(t)).toBeNull());
  });

  it('a RESOLVED concern leaves the active section', () => {
    const f = file({
      employeeActivities: [oneToOne({
        id: 'act-done', activityType: 'management_concern',
        concernState: 'resolved', resolvedAt: iso('2026-09-10'),
      })],
    });
    expect(f.openConcerns).toEqual([]);
    // ...but it is still in the history.
    expect(f.activityEntries.some(e => e.id === 'act-done')).toBe(true);
  });

  it('a CLOSED case is demoted out of "What is happening"', () => {
    const f = file({
      cases: [{ id: 'c-closed', employeeId: EMP, employeeName: 'John Smith',
                caseType: 'misconduct', stage: 'closed', createdAt: '2026-08-01', meetings: [] }],
    });
    expect(f.currentProcess).toBeNull();
    expect(f.openProcesses).toEqual([]);
    expect(f.closedProcesses).toHaveLength(1);
  });

  it('Current Warnings semantics are untouched by Wave A', () => {
    // E1.1 derivation is not re-implemented here, and Wave A must not have
    // changed what counts as live.
    expect(libSrc).toContain('deriveCurrentWarnings(ctx.cases, authorisedData.allegations, authorisedData.now)');
    expect(libSrc).toContain('isWarningOutcome');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave A — the conversation entry', () => {
  it('Start conversation opens the chooser, not just the tab', () => {
    // Routing to the tab and leaving a second button to find would have left the
    // everyday action two clicks deep.
    expect(read('src/screens/EmployeeFileScreen.jsx')).toContain('openActivityTab({ chooser: true })');
    expect(panelSrc).toContain('const [starting, setStarting] = useState(!!startOpen);');
  });

  it('the chooser offers intentions, and the retrospective path', () => {
    expect(panelSrc).toContain('It already happened');
    expect(panelSrc).toContain('It is happening now or next');
    expect(panelSrc).toContain('What kind of conversation');
    expect(panelSrc).not.toContain('What kind of activity');
  });

  it('the retrospective default is "already happened", and it cannot silently flip', () => {
    // Writing up yesterday's conversation is the common case and must stay the
    // lightweight default. A silent flip to "start" would quietly push every
    // retrospective record through the live path.
    expect(panelSrc).toContain('const [mode, setMode] = useState("record");');
  });

  it('starting an ordinary conversation creates NO case', () => {
    // The create payload is exactly what the form collected. Nothing adds a case,
    // a meeting, or a process to it on the way out.
    const form = panelSrc.slice(panelSrc.indexOf('export function StartActivityForm'),
                                panelSrc.indexOf('export function EmployeeActivityPanel'));
    ['createCase', 'caseType', 'saveCases', 'newCase'].forEach(t =>
      expect(form, t).not.toContain(t));
    // And the panel hands the form's own input straight through, unembellished.
    expect(panelSrc).toContain('onCreateActivity?.(input)');
    expect(panelSrc).not.toMatch(/onCreateActivity\?\.\(\{\s*\.\.\.input/);
  });

  it('the retrospective path needs no meeting, schedule, review or signature', () => {
    // Bounded to the form itself — the panel below it legitimately mentions cases.
    const form = panelSrc.slice(panelSrc.indexOf('export function StartActivityForm'),
                                panelSrc.indexOf('export function EmployeeActivityPanel'));
    ['startStandaloneMeeting', 'schedule', 'reviewDraft', 'signature', 'signStatus', 'caseId']
      .forEach(t => expect(form, t).not.toContain(t));
  });

  it('there is exactly ONE intent experience in the product', () => {
    const uses = ['src/App.jsx', 'src/screens/PeopleScreen.jsx', 'src/screens/HomeScreen.jsx',
                  'src/screens/employeeFile/EmployeeActivityPanel.jsx']
      .map(read).join('\n');
    expect((uses.match(/StartActivityForm/g) || []).length).toBe(2); // its definition + its one use
  });

  it('the global way in selects the employee canonically first', () => {
    expect(peopleSrc).toContain('setActiveEmployeeId(p.id)');
    expect(peopleSrc).toContain('+ Start conversation');
    expect(peopleSrc).not.toContain('+ Record activity');
  });

  it('the People-row meeting button now carries the canonical id', () => {
    // It carried the NAME only, so after E2 it led to a form that could not
    // complete — the person had been chosen on that very row.
    expect(peopleSrc).toContain('employee:p.name,employeeId:p.id');
    expect(peopleSrc).not.toMatch(/setMeetingSetup\(s=>\(\{\.\.\.s,employee:p\.name\}\)\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave A — terminology, in the Employee File only', () => {
  it('the tab reads History while its route id stays "activity"', () => {
    expect(libSrc).toContain('{ id: "activity", label: "History" }');
  });

  it('"activity" is no longer the manager\'s word on this surface', () => {
    expect(panelSrc).not.toContain('Record an activity');
    expect(panelSrc).not.toContain('Start an activity');
    expect(overviewSrc).not.toContain('Recent activity');
  });

  it('no AI or recommendation reaches the Employee File', () => {
    [overviewSrc, stripJs(read('src/screens/EmployeeFileScreen.jsx'))].forEach(src => {
      ['askCompass', 'streamClaude', 'Compass recommends', 'suggest'].forEach(t =>
        expect(src, t).not.toContain(t));
    });
  });
});
