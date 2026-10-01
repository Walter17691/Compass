import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { screen, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderCase } from './support/renderCaseView.jsx';
import {
  caseWorkspaceDestinations, hasInvestigationStage, evidenceDestinationLabel,
  destinationForLegacyTab, splitForWidth, MIN_VISIBLE_DESTINATIONS,
} from '../lib/caseWorkspace.js';
import {
  meetingRecordState, meetingSignatureState, meetingStateChips, meetingsSummary,
} from '../lib/meetingRecordState.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B.2 CORRECTIVE — the horizontal workspace, the investigation stage, and
// meeting record lifecycle.
//
// Written to the verification standard the Guardrails P0 forced: critical UI is
// not verified because its source text is correct. These RENDER the screen.
//
// Case states covered here, each a real combination the product produces:
//   active guardrail · no guardrail · scheduled · in progress · review_draft ·
//   completed · signature states · outstanding meeting steps · multiple
//   meetings · investigation-stage · disciplinary-stage · grievance (no
//   investigation stage) · horizontal navigation · overflow · View full record
// ─────────────────────────────────────────────────────────────────────────

const mtg = (over = {}) => ({ id: 'm1', type: 'Disciplinary', ...over });
const INVESTIGATION = mtg({ id: 'mi', type: 'Investigation', status: 'completed', record: 'notes', date: '2026-09-01' });
const DISCIPLINARY_LIVE = mtg({ id: 'md', type: 'Disciplinary', status: 'in_progress', startedAt: '2026-09-10T09:00:00Z' });

// ═══════════════════════════════════════════════════════════════════════════
describe('B.2c — meeting record lifecycle comes from stored state only', () => {
  it('names each stored record status, and nothing else', () => {
    expect(meetingRecordState(mtg({ status: 'scheduled' })).label).toBe('Scheduled');
    expect(meetingRecordState(mtg({ status: 'in_progress' })).label).toBe('In progress');
    expect(meetingRecordState(mtg({ status: 'review_draft' })).label).toBe('Record awaiting review');
    expect(meetingRecordState(mtg({ status: 'completed' })).label).toBe('Record complete');
    expect(meetingRecordState(mtg({ status: 'cancelled' })).label).toBe('Cancelled');
  });

  it('an unrecognised status is not guessed at', () => {
    // "Held" is true of anything with a written record and claims nothing more.
    expect(meetingRecordState(mtg({ status: 'something_new', record: 'x' })).label).toBe('Held');
    expect(meetingRecordState(mtg({ status: 'something_new' }))).toBeNull();
  });

  it('signature state is separate from record state, and absent means absent', () => {
    // A completed record never sent for signature is not "awaiting" anything.
    expect(meetingSignatureState(mtg({ status: 'completed' }))).toBeNull();
    expect(meetingSignatureState(mtg({ signStatus: 'sent' })).label).toBe('Awaiting signature');
    expect(meetingSignatureState(mtg({ signStatus: 'pending' })).label).toBe('Awaiting signature');
    expect(meetingSignatureState(mtg({ signStatus: 'opened' })).label).toBe('Opened by employee');
    expect(meetingSignatureState(mtg({ signStatus: 'signed' })).label).toBe('Signed');
    expect(meetingSignatureState(mtg({ signStatus: 'declined' })).label).toBe('Declined');
  });

  it('an unknown signature value is not relabelled into something friendly', () => {
    expect(meetingSignatureState(mtg({ signStatus: 'quantum' }))).toBeNull();
  });

  it('both legs appear together when both exist', () => {
    const chips = meetingStateChips(mtg({ status: 'completed', signStatus: 'sent' }));
    expect(chips.map(c => c.label)).toEqual(['Record complete', 'Awaiting signature']);
  });

  it('a case-level summary counts only what is stored', () => {
    expect(meetingsSummary([])).toBeNull();
    expect(meetingsSummary([
      mtg({ id: 'a', status: 'completed' }),
      mtg({ id: 'b', status: 'review_draft' }),
      mtg({ id: 'c', status: 'scheduled' }),
    ])).toBe('3 meetings · 1 awaiting review · 1 scheduled');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B.2c — meeting state is visible WITHOUT opening the record', () => {
  const openMeetings = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /^Meetings/ }));
    return user;
  };

  it('review_draft: the case says the record is awaiting review', async () => {
    renderCase({ meetings: [mtg({ status: 'review_draft', record: 'x' })] });
    await openMeetings();
    expect(screen.getAllByText('Record awaiting review').length).toBeGreaterThan(0);
  });

  it('completed: the case says the record is complete', async () => {
    renderCase({ meetings: [mtg({ status: 'completed', record: 'x' })] });
    await openMeetings();
    expect(screen.getAllByText('Record complete').length).toBeGreaterThan(0);
  });

  it('scheduled and in-progress are distinguishable', async () => {
    renderCase({ meetings: [mtg({ id: 's', status: 'scheduled' }), mtg({ id: 'p', status: 'in_progress' })] });
    await openMeetings();
    expect(screen.getAllByText('Scheduled').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
  });

  it('a signature state shows alongside the record state', async () => {
    renderCase({ meetings: [mtg({ status: 'completed', record: 'x', signStatus: 'sent' })] });
    await openMeetings();
    expect(screen.getAllByText('Record complete').length).toBeGreaterThan(0);
    // The signature badge renders its label and the "— awaiting signature"
    // qualifier as separate text nodes, so match on the element's text content.
    expect(screen.getAllByText((_, el) => /awaiting signature/i.test(el?.textContent || '')).length)
      .toBeGreaterThan(0);
  });

  it('MULTIPLE meetings across stages: the case states it without clicking through', async () => {
    // The stage filter deliberately shows one stage at a time, so a case with an
    // investigation record complete AND a disciplinary awaiting review showed
    // neither fact until you clicked. The case-level summary says both at once —
    // which is exactly "understand meaningful state without opening every record".
    renderCase({ meetings: [INVESTIGATION, mtg({ id: 'm2', status: 'review_draft', record: 'y' })] });
    await openMeetings();
    expect(screen.getByText('2 meetings · 1 awaiting review')).toBeInTheDocument();
    // And the stage the eye lands on shows its own meeting's state.
    expect(screen.getAllByText('Record complete').length).toBeGreaterThan(0);
  });

  it('View notes still works — human testing proved it, so it must not regress', async () => {
    renderCase({ meetings: [mtg({ status: 'completed', record: 'the dialogue' })] });
    await openMeetings();
    expect(screen.getAllByRole('button', { name: 'View notes' }).length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B.2c — the investigation is one coherent stage', () => {
  it('a type with an investigation stage gets an Investigation destination', () => {
    expect(hasInvestigationStage('misconduct')).toBe(true);
    expect(evidenceDestinationLabel('misconduct')).toBe('Investigation');
    renderCase({ caseType: 'misconduct' });
    expect(screen.getByRole('tab', { name: /^Investigation/ })).toBeInTheDocument();
  });

  it('a type WITHOUT one is not told it has an investigation', () => {
    // A grievance has no investigation stage in its own registry. Naming the
    // destination "Investigation" would assert a procedure that does not exist.
    expect(hasInvestigationStage('grievance')).toBe(false);
    expect(evidenceDestinationLabel('grievance')).toBe('Allegations & evidence');
    renderCase({ caseType: 'grievance' });
    expect(screen.getByRole('tab', { name: /Allegations & evidence/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Investigation/ })).not.toBeInTheDocument();
  });

  it('it gathers what was scattered: allegations, evidence, meetings, findings', () => {
    renderCase({ caseType: 'misconduct', meetings: [INVESTIGATION] });
    // All on ONE surface, no further navigation.
    expect(screen.getByRole('heading', { name: 'Allegations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evidence' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Investigation meetings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Findings' })).toBeInTheDocument();
  });

  it('investigation progress comes from the checklist that already exists', () => {
    renderCase({ caseType: 'misconduct' });
    expect(screen.getByText('Investigation progress')).toBeInTheDocument();
    expect(screen.getByText(/of 7 steps/)).toBeInTheDocument();
  });

  it('only INVESTIGATION meetings appear there — it is a stage, not every meeting', () => {
    renderCase({ caseType: 'misconduct', meetings: [INVESTIGATION, DISCIPLINARY_LIVE] });
    const section = screen.getByRole('heading', { name: 'Investigation meetings' }).closest('section');
    // The investigation meeting is listed; the live disciplinary one is not.
    expect(within(section).getByText(/^Investigation ·/)).toBeInTheDocument();
    expect(within(section).queryByText(/^Disciplinary/)).not.toBeInTheDocument();
  });

  it('a case with no investigation meetings says so rather than showing nothing', () => {
    renderCase({ caseType: 'misconduct', meetings: [] });
    expect(screen.getByText('No investigation meetings held yet.')).toBeInTheDocument();
  });

  it('findings show the real report when there is one', () => {
    renderCase({ caseType: 'misconduct', investigationReport: 'Findings: the allegation is substantiated in part.' });
    expect(screen.getByText(/substantiated in part/)).toBeInTheDocument();
  });

  it('and say plainly when there is not', () => {
    renderCase({ caseType: 'misconduct' });
    expect(screen.getByText(/No investigation report yet/)).toBeInTheDocument();
  });

  it('the disciplinary stage stays legible — Meetings still separates the types', async () => {
    const user = userEvent.setup();
    renderCase({ caseType: 'misconduct', meetings: [INVESTIGATION, DISCIPLINARY_LIVE] });
    await user.click(screen.getByRole('tab', { name: /^Meetings/ }));
    expect(screen.getAllByText(/Investigation/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Disciplinary/).length).toBeGreaterThan(0);
  });

  it('creates NO second investigation system', () => {
    // Every record rendered is the existing record from the existing source.
    const src = readFileSync('src/components/caseTabs/InvestigationTab.jsx', 'utf8');
    // It takes no write capability, holds no state, and talks to no store. If it
    // ever gains one of these it has stopped being a view of the existing
    // investigation and started being a second one.
    ['supabase', 'insert(', 'update(', 'saveCases', 'createCaseTask', 'changeSignalStatus', 'useState']
      .forEach(bad => expect(src, bad).not.toContain(bad));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B.2c — horizontal navigation', () => {
  it('is a real tablist with one selected destination', () => {
    renderCase({});
    const bar = screen.getByRole('tablist', { name: 'Case workspace' });
    const selected = within(bar).getAllByRole('tab').filter(t => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
  });

  it('clicking a destination changes what is rendered, not just an attribute', async () => {
    const user = userEvent.setup();
    renderCase({});
    expect(screen.getByRole('heading', { name: 'Allegations' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Compass analysis/ }));
    expect(screen.queryByRole('heading', { name: 'Allegations' })).not.toBeInTheDocument();
    expect(screen.getByText('Suggested next step')).toBeInTheDocument();
  });

  it('the destinations are a SMALL set, not the twelve tabs again', () => {
    renderCase({});
    const bar = screen.getByRole('tablist', { name: 'Case workspace' });
    expect(within(bar).getAllByRole('tab').length).toBeLessThanOrEqual(7);
  });

  it('secondary things are reachable through the overflow, not promoted to peers', async () => {
    const user = userEvent.setup();
    renderCase({});
    expect(screen.queryByRole('tab', { name: /Themes/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More ▾' }));
    const menu = screen.getByRole('menu', { name: 'More case destinations' });
    expect(within(menu).getByRole('menuitem', { name: /Themes/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Participants & roles/ })).toBeInTheDocument();
  });

  it('an overflow destination can actually be opened', async () => {
    const user = userEvent.setup();
    renderCase({});
    await user.click(screen.getByRole('button', { name: 'More ▾' }));
    await user.click(screen.getByRole('menuitem', { name: /Participants & roles/ }));
    expect(screen.getByText(/Participants \(/)).toBeInTheDocument();
    expect(screen.getByText('Case roles')).toBeInTheDocument();
  });

  it('the overflow closes on Escape', async () => {
    const user = userEvent.setup();
    renderCase({});
    await user.click(screen.getByRole('button', { name: 'More ▾' }));
    expect(screen.getByRole('menu', { name: 'More case destinations' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'More case destinations' })).not.toBeInTheDocument();
  });

  it('Outcome appears only once the case has one', () => {
    renderCase({});
    expect(screen.queryByRole('tab', { name: /^Outcome/ })).not.toBeInTheDocument();
    renderCase({ outcome: 'First written warning' });
    expect(screen.getAllByRole('tab', { name: /^Outcome/ }).length).toBeGreaterThan(0);
  });

  it('narrowing moves destinations into the overflow, never wraps, never stacks', () => {
    const d = caseWorkspaceDestinations({ cs: { caseType: 'misconduct' }, canSeeThemes: true });
    const narrow = splitForWidth(d, 2);
    expect(narrow.visible).toHaveLength(2);
    // Order is preserved, so nothing jumps position as the window resizes.
    expect(narrow.visible.map(x => x.id)).toEqual(d.primary.slice(0, 2).map(x => x.id));
    // Everything displaced is still reachable.
    const all = [...narrow.visible, ...narrow.overflow].map(x => x.id);
    [...d.primary, ...d.secondary].forEach(x => expect(all).toContain(x.id));
  });

  it('never collapses below a usable minimum', () => {
    const d = caseWorkspaceDestinations({ cs: { caseType: 'misconduct' } });
    expect(splitForWidth(d, 0).visible.length).toBe(MIN_VISIBLE_DESTINATIONS);
  });

  it('every old section id still resolves somewhere real', () => {
    ['overview', 'timeline', 'allegations', 'evidence', 'meetings', 'people',
     'tasks', 'documents', 'communications', 'themes', 'outcome', 'ai']
      .forEach(id => expect(destinationForLegacyTab(id), id).toBeTruthy());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B.2c — View full record actually goes somewhere', () => {
  it('clicking it selects the Record destination', async () => {
    const user = userEvent.setup();
    renderCase({ meetings: [INVESTIGATION] });
    expect(screen.getByRole('tab', { name: /^Record/ })).toHaveAttribute('aria-selected', 'false');
    await user.click(screen.getByRole('button', { name: 'View full record' }));
    expect(screen.getByRole('tab', { name: /^Record/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('and brings the workspace into view rather than opening it below the fold', async () => {
    const user = userEvent.setup();
    const calls = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...a) { calls.push(this.id); return orig?.apply(this, a); };
    try {
      renderCase({ meetings: [INVESTIGATION] });
      await user.click(screen.getByRole('button', { name: 'View full record' }));
      await new Promise(r => requestAnimationFrame(() => r()));
      expect(calls).toContain('case-workspace');
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
  });

  it('the full record is a destination, not a competing primary tab', () => {
    renderCase({});
    // It is in the bar as "Record", and the case record summary above is still
    // the thing you read first.
    expect(screen.getByRole('tab', { name: /^Record/ })).toBeInTheDocument();
    expect(screen.getAllByText('Case record')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B.2c — the approved top of the case is unchanged', () => {
  const REVIEW_DRAFT_STEP = {
    label: 'Review meeting record', action: 'review_meeting_record', primary: true,
    reason: 'This meeting has been held and its record has not been confirmed yet. It does not need starting or resuming again.',
  };

  it('no purple explanatory strip, one primary action, concise state', () => {
    renderCase({ meetings: [mtg({ status: 'review_draft', record: 'x' })] }, { nextStep: REVIEW_DRAFT_STEP });
    expect(screen.queryByText(/does not need starting or resuming again/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Review meeting record/i })).toHaveLength(1);
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
  });

  it('the Owner is not duplicated into the workspace', () => {
    renderCase({ manager: 'Alex Manager' });
    expect(screen.getAllByText(/Alex Manager/).length).toBe(1);
  });

  it('an active Guardrail is still prominent ABOVE the workspace, and not inside it', async () => {
    const user = userEvent.setup();
    const guardrail = { id: 'g1', caseId: 'c1', type: 'process_risk', status: 'open',
      title: 'Same person chaired the investigation and the hearing', reasoning: 'ACAS expects separation.' };
    renderCase({}, { extraShell: { caseSignals: [guardrail] } });
    expect(screen.getByText('Procedural guardrails')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Compass analysis/ }));
    // Guardrails are deterministic process risk, not advisory analysis.
    expect(screen.getAllByText('Procedural guardrails')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B.2c §9 — outstanding per-meeting steps, RENDERED', () => {
  const withSteps = {
    meetings: [mtg({
      status: 'completed', record: 'x',
      nextSteps: [
        { step: 'Issue investigation outcome letter', done: false, deadline: '14/09/2026' },
        { step: 'Invite to disciplinary (if evidence found)', done: false },
      ],
    })],
  };

  it('they survive the removal of the permanent strip', async () => {
    const user = userEvent.setup();
    renderCase(withSteps, { nextStep: { label: 'Draft outcome letter', action: 'outcome_letter', primary: true } });
    const details = screen.getByRole('button', { name: /Details/ });
    expect(details).toBeInTheDocument();
    await user.click(details);
    expect(screen.getByText('Issue investigation outcome letter')).toBeInTheDocument();
    expect(screen.getByText('Invite to disciplinary (if evidence found)')).toBeInTheDocument();
  });

  it('the user can act on them — they are real controls, not text', async () => {
    const user = userEvent.setup();
    renderCase(withSteps, { nextStep: { label: 'Draft outcome letter', action: 'outcome_letter', primary: true } });
    await user.click(screen.getByRole('button', { name: /Details/ }));
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    expect(boxes[0]).toBeEnabled();
  });

  it('a case with NO outstanding steps regains no explanatory UI', () => {
    renderCase({ meetings: [mtg({ status: 'completed', record: 'x', nextSteps: [{ step: 'done thing', done: true }] })] },
      { nextStep: { label: 'Draft outcome letter', action: 'outcome_letter', primary: true } });
    expect(screen.queryByRole('button', { name: /Details/ })).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B.2c — specialist and organisational concepts are not process peers', () => {
  it('the tribunal estimator is NOT a horizontal destination', () => {
    renderCase({ estimatedWeeklyPay: 500 }, { stage: 'investigation' });
    expect(screen.queryByRole('tab', { name: /Tribunal exposure/ })).not.toBeInTheDocument();
  });

  it('but it is still reachable, with its data intact', async () => {
    const user = userEvent.setup();
    renderCase({ estimatedWeeklyPay: 500 }, { stage: 'investigation' });
    await user.click(screen.getByRole('button', { name: 'More ▾' }));
    await user.click(screen.getByRole('menuitem', { name: /Tribunal exposure estimate/ }));
    expect(screen.getByLabelText('Weekly pay (£, gross)')).toHaveValue(500);
  });

  it('Themes are organisational classification, so they sit behind the overflow too', async () => {
    const user = userEvent.setup();
    renderCase({});
    expect(screen.queryByRole('tab', { name: /^Themes/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More ▾' }));
    await user.click(screen.getByRole('menuitem', { name: /^Themes/ }));
    // The capability is retained in full — human confirmation stays authoritative.
    expect(screen.getByRole('button', { name: /Suggest themes/ })).toBeInTheDocument();
  });
});

describe('B.2c — the band never becomes an orphan again, even in miniature', () => {
  const stepsOnly = {
    meetings: [mtg({ status: 'completed', record: 'x',
      nextSteps: [{ step: 'Issue outcome letter', done: false }] })],
  };

  it('with only outstanding steps it is not painted as a banner', () => {
    const { container } = renderCase(stepsOnly, { nextStep: { label: 'Draft outcome letter', action: 'outcome_letter', primary: true } });
    const band = container.querySelector('#case-workspace') && screen.getByRole('button', { name: /Details/ }).closest('div[style*="border-bottom"]');
    expect(band).toBeTruthy();
    expect(band.style.background).not.toBe('rgb(245, 243, 255)');
  });

  it('but a genuine warning still gets the full treatment', () => {
    renderCase({ meetings: [mtg({ status: 'in_progress' })] }, { nextStep: {
      label: 'Resume meeting', action: 'resume_meeting', primary: true,
      reason: 'This meeting is already under way. 2 meetings on this case are marked in progress — resuming opens the most recently started.',
    }});
    const warn = screen.getByText(/2 meetings on this case are marked in progress/);
    expect(warn.closest('div[style*="rgb(245, 243, 255)"]')).toBeTruthy();
  });
});

describe('B.2c — Meetings opens on a stage that has meetings', () => {
  it('a disciplinary-only case does not open on an empty Investigation stage', async () => {
    const user = userEvent.setup();
    renderCase({ meetings: [mtg({ type: 'Disciplinary', status: 'completed', record: 'x', date: '2026-09-25' })] });
    await user.click(screen.getByRole('tab', { name: /^Meetings/ }));
    // The meeting the user came for is visible, not one unexplained click away.
    expect(screen.queryByText('No investigation meetings yet')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'View notes' }).length).toBeGreaterThan(0);
  });

  it('an explicit stage choice still wins', async () => {
    const user = userEvent.setup();
    renderCase(
      { meetings: [mtg({ type: 'Disciplinary', status: 'completed', record: 'x' })] },
      { meetingsTabOverrides: { activeCaseStage: 'investigation' } },
    );
    await user.click(screen.getByRole('tab', { name: /^Meetings/ }));
    expect(screen.getByText('No investigation meetings yet')).toBeInTheDocument();
  });

  it('App no longer hard-defaults the filter to a stage that may be empty', () => {
    expect(readFileSync('src/App.jsx', 'utf8'))
      .not.toContain('const [activeCaseStage, setActiveCaseStage] = useState("investigation")');
  });
});

describe('B.2c — the attention list does not say the same thing twice', () => {
  // Found in production UAT on UAT - Fresh Golden Path 2: "Note warning on HR
  // record · 20 days overdue" listed twice, identically.
  const dup = [
    { caseId: 'c1', overdue: true, label: 'Note warning on HR record', daysOverdue: 20 },
    { caseId: 'c1', overdue: true, label: 'Note warning on HR record', daysOverdue: 20 },
    { caseId: 'c1', overdue: true, label: 'Allow employee to review evidence', daysOverdue: 16 },
  ];

  it('identical overdue items collapse to one', () => {
    renderCase({}, { extraShell: {}, overviewOverrides: { dueSoon: dup } });
    expect(screen.getAllByText('Note warning on HR record')).toHaveLength(1);
    expect(screen.getAllByText('Allow employee to review evidence')).toHaveLength(1);
  });

  it('genuinely different items are both kept', () => {
    renderCase({}, { overviewOverrides: { dueSoon: [
      { caseId: 'c1', overdue: true, label: 'Note warning on HR record', daysOverdue: 20 },
      { caseId: 'c1', overdue: true, label: 'Note warning on HR record', daysOverdue: 3 },
    ] } });
    expect(screen.getAllByText('Note warning on HR record')).toHaveLength(2);
  });
});

describe('B.2c — a next-action signal does not paint a band it no longer renders in', () => {
  // Found in production UAT on UAT - Fresh Golden Path 2: a pale-purple banner
  // whose entire text content was "Details ▾". The signal's card moved to Compass
  // analysis in B.2; the predicate still counted it as strip content.
  const signal = { id: 'na1', caseId: 'c1', type: 'next_action', status: 'open',
    title: 'Interview the named witness', reasoning: 'Grounded in the record.' };

  it('the band is not painted when the signal is the only reason given', () => {
    const { container } = renderCase(
      { meetings: [mtg({ status: 'completed', record: 'x', nextSteps: [{ step: 'Issue outcome letter', done: false }] })] },
      { nextStep: { label: 'Draft outcome letter', action: 'outcome_letter', primary: true },
        extraShell: { caseSignals: [signal] } },
    );
    const band = screen.getByRole('button', { name: /Details/ }).parentElement;
    expect(band.style.background).not.toBe('rgb(245, 243, 255)');
    expect(container).toBeTruthy();
  });

  it('and with NOTHING else at all, there is no band of any kind', () => {
    renderCase({}, { nextStep: { label: 'Draft outcome letter', action: 'outcome_letter', primary: true },
      extraShell: { caseSignals: [signal] } });
    expect(screen.queryByRole('button', { name: /Details/ })).not.toBeInTheDocument();
  });

  it('the signal itself still renders — in Compass analysis, where it lives', async () => {
    const user = userEvent.setup();
    renderCase({}, { extraShell: { caseSignals: [signal] } });
    await user.click(screen.getByRole('tab', { name: /Compass analysis/ }));
    expect(screen.getByText('Interview the named witness')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B.2c — the nav MEASURES, not just splits (the component path)', () => {
  // splitForWidth was unit-tested from the start; the component that calls it was
  // not, so nothing proved the measurement actually ran. Production verification
  // could not settle it either — ResizeObserver callbacks are suppressed in the
  // automation context, and my own probe observer fired zero times there.
  const stubWidths = (widths, barWidth) => {
    const origBar = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const origRect = Element.prototype.getBoundingClientRect;
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() {
      return this.getAttribute?.('role') === 'tablist' ? barWidth : 0;
    }});
    let i = 0;
    Element.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute?.('data-dest')) return { width: widths[i++ % widths.length], height: 30, top: 0, left: 0, right: 0, bottom: 0 };
      return origRect.call(this);
    };
    return () => {
      if (origBar) Object.defineProperty(HTMLElement.prototype, 'clientWidth', origBar);
      Element.prototype.getBoundingClientRect = origRect;
    };
  };

  it('a narrow bar demotes the rightmost destinations into the overflow', async () => {
    // 5 destinations at ~80px each in a 330px bar, minus 96px reserved for "More",
    // leaves room for three. The real production measurement was exactly this.
    const restore = stubWidths([79, 81, 72, 47, 111], 330);
    try {
      renderCase({});
      // Drive the backstop signal the component now also listens to.
      await act(async () => { window.dispatchEvent(new Event('resize')); });
      const bar = screen.getByRole('tablist', { name: 'Case workspace' });
      const visible = within(bar).getAllByRole('tab').map(t => t.textContent.trim());
      expect(visible.length).toBeLessThan(5);
      expect(visible[0]).toMatch(/^Investigation/);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'More ▾' }));
      const menu = screen.getByRole('menu', { name: 'More case destinations' });
      const overflow = within(menu).getAllByRole('menuitem').map(i => i.textContent.trim());
      // Everything displaced is still reachable, and nothing is lost.
      expect(overflow).toEqual(expect.arrayContaining([expect.stringMatching(/Compass analysis/)]));
      expect(overflow).toEqual(expect.arrayContaining([expect.stringMatching(/Themes/)]));
    } finally { restore(); }
  });

  it('a wide bar keeps every destination visible', async () => {
    const restore = stubWidths([79, 81, 72, 47, 111], 2000);
    try {
      renderCase({});
      await act(async () => { window.dispatchEvent(new Event('resize')); });
      const bar = screen.getByRole('tablist', { name: 'Case workspace' });
      expect(within(bar).getAllByRole('tab').length).toBe(5);
    } finally { restore(); }
  });

  it('RE-measures when the window changes, not only on mount', async () => {
    // The behavioural version of the point. jsdom has no ResizeObserver, so if the
    // component relied on that alone it would measure once at mount and never
    // again — which is exactly how it behaved in the automation context where my
    // probe observer fired zero times. Mount WIDE, then narrow and resize.
    let barWidth = 2000;
    const origBar = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const origRect = Element.prototype.getBoundingClientRect;
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() {
      return this.getAttribute?.('role') === 'tablist' ? barWidth : 0;
    }});
    let i = 0;
    const widths = [79, 81, 72, 47, 111];
    Element.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute?.('data-dest')) return { width: widths[i++ % widths.length], height: 30, top: 0, left: 0, right: 0, bottom: 0 };
      return origRect.call(this);
    };
    try {
      renderCase({});
      const bar = screen.getByRole('tablist', { name: 'Case workspace' });
      expect(within(bar).getAllByRole('tab').length).toBe(5);   // wide: all visible
      barWidth = 330;                                            // the window narrows
      await act(async () => { window.dispatchEvent(new Event('resize')); });
      expect(within(bar).getAllByRole('tab').length).toBeLessThan(5);
    } finally {
      if (origBar) Object.defineProperty(HTMLElement.prototype, 'clientWidth', origBar);
      Element.prototype.getBoundingClientRect = origRect;
    }
  });
});
