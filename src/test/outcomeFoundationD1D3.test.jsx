import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'fs';
import { OutcomeModal } from '../screens/OutcomeModal.jsx';
import { LetterScreen } from '../screens/LetterScreen.jsx';
import {
  OUTCOME_LETTER, isIssuedLetter, findOutcomeLetter, outcomeLetterStatus, outcomeLetterNotice,
} from '../lib/outcomeLetter.js';
import {
  decisionAllegations, decisionMeeting, priorLiveWarnings, outcomeDecisionContext,
} from '../lib/outcomeDecisionContext.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE D1–D3 — the decision, and the communication of the decision.
//
// D1: "Issue outcome & generate letter" was one click that both recorded the
//     authoritative employment decision and began drafting the formal letter
//     announcing it to the employee. Two acts, one confirmation.
// D2: the decision was taken in a modal that showed a dropdown, a duration and
//     a notes box — no allegation, no hearing record, no live warning.
// D3: changing the decision left an already-drafted letter on the case still
//     reading as the current communication of an outcome that no longer existed.
// ─────────────────────────────────────────────────────────────────────────

const stripComments = t => t.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
// The source with its prose removed. Comments in this file legitimately
// DESCRIBE the coupling that was removed ("this used to call handleLetter(...)")
// and cite migration filenames containing "supabase" — asserting against raw
// source would fail on the explanation of the fix rather than the fix.
const outcomeSrc = stripComments(readFileSync('src/screens/OutcomeModal.jsx', 'utf8'));
const app = readFileSync('src/App.jsx', 'utf8');

const noop = () => {};
const CASE_ID = 'case-1';

const baseCase = {
  id: CASE_ID, employeeName: 'Sam Employee', manager: 'Alex Chair', caseType: 'disciplinary',
  meetings: [], outcome: null, outcomeIssuedAt: null,
};

const props = (over = {}) => ({
  cases: [baseCase], activeCaseId: CASE_ID, setShowOutcomeModal: noop,
  outcomeType: '', setOutcomeType: noop, outcomeNotes: '', setOutcomeNotes: noop,
  saveCases: noop, showToast: noop, requestHrReview: noop,
  allegations: [], caseSignals: [], requestOverrideReason: noop, createCaseTask: noop,
  audit: noop, completingOutcomeDetails: false, setCompletingOutcomeDetails: noop,
  currentUserId: 'user-1',
  ...over,
});

describe('D1 — recording a decision is not communicating it', () => {
  it('the primary action is Record outcome, not "Issue outcome & generate letter"', () => {
    render(<OutcomeModal {...props()} />);
    expect(screen.getByRole('button', { name: 'Record outcome' })).toBeInTheDocument();
    expect(screen.queryByText(/generate letter/i)).not.toBeInTheDocument();
  });

  it('there is exactly one primary action', () => {
    render(<OutcomeModal {...props()} />);
    const buttons = screen.getAllByRole('button').map(b => b.textContent.trim());
    expect(buttons.filter(b => /^Record outcome$/.test(b))).toHaveLength(1);
  });

  it('recording the outcome no longer drafts the letter', () => {
    // the coupling is gone structurally: the props that existed only to draft
    // a letter are no longer on the component at all
    expect(outcomeSrc).not.toContain('handleLetter(');
    expect(outcomeSrc).not.toContain('setReviewOutput');
    const i = app.indexOf('<OutcomeModal');
    const tag = app.slice(i, app.indexOf('/>', i));
    expect(tag).not.toContain('handleLetter={handleLetter}');
  });

  it('keeps the authoritative decision fields exactly as they were', () => {
    for (const field of ['outcome:outcomeType', 'outcomeIssuedAt:issuedAt.toISOString()',
      'warningDurationMonths:durationMonths', 'warningExpiresAt:expiresAt',
      'disciplinaryDecidedBy:currentUserId||null']) {
      expect(outcomeSrc).toContain(field);
    }
  });

  it('the workflow still offers the letter as the next step', () => {
    const next = readFileSync('src/lib/nextStep.js', 'utf8');
    expect(next).toContain('label:"Draft outcome letter", action:"outcome_letter"');
  });

  it('labels the notes field as the reasoning for the decision', () => {
    render(<OutcomeModal {...props()} />);
    expect(screen.getByLabelText(/Outcome reasoning/)).toBeInTheDocument();
  });

  it('does not claim sign-off holds the outcome back, because it does not', () => {
    render(<OutcomeModal {...props({ outcomeType: 'Dismissal with notice' })} />);
    expect(screen.getByText(/the outcome is recorded now and is not held pending that approval/i)).toBeInTheDocument();
  });

  // §3 — the banner must not describe RECORDING as issuing/communicating.
  // Traced: computeAppealDeadline returns null until an outcome letter is
  // saved, so recording a decision starts no window at all.
  it('does not claim that recording the decision starts the appeal window', () => {
    render(<OutcomeModal {...props()} />);
    expect(screen.queryByText(/Issuing this outcome starts/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Recording this does not notify the employee/i)).toBeInTheDocument();
    expect(screen.getByText(/once the outcome letter is issued/i)).toBeInTheDocument();
  });
});

describe('D2 — the record the decision is about', () => {
  const allegations = [
    { id: 'a1', caseId: CASE_ID, title: 'Unauthorised use of a company vehicle', status: 'upheld' },
    { id: 'a2', caseId: 'other-case', title: 'Belongs to a different case' },
  ];
  const hearing = {
    id: 'm1', type: 'Disciplinary', date: '2026-09-11',
    record: '## Meeting Dialogue\nAC: Thank you for attending.', transcript: [{ text: 'x' }],
  };

  it('shows only this case\'s allegations', () => {
    render(<OutcomeModal {...props({ allegations, cases: [{ ...baseCase, meetings: [hearing] }] })} />);
    expect(screen.getByText(/Unauthorised use of a company vehicle/)).toBeInTheDocument();
    expect(screen.queryByText(/different case/)).not.toBeInTheDocument();
  });

  it('reports the stored allegation status without implying a finding', () => {
    const list = decisionAllegations(allegations, CASE_ID);
    expect(list).toEqual([{ id: 'a1', title: 'Unauthorised use of a company vehicle', status: 'upheld' }]);
    expect(decisionAllegations([{ id: 'x', caseId: CASE_ID, title: 'No status' }], CASE_ID)[0].status).toBeNull();
  });

  it('offers the hearing record behind progressive disclosure, not inline', async () => {
    render(<OutcomeModal {...props({ cases: [{ ...baseCase, meetings: [hearing] }] })} />);
    expect(screen.queryByText(/Thank you for attending/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Show the disciplinary record/i }));
    expect(screen.getByText(/Thank you for attending/)).toBeInTheDocument();
  });

  it('opening the record does not lose the entered decision', async () => {
    const setOutcomeType = vi.fn();
    render(<OutcomeModal {...props({ cases: [{ ...baseCase, meetings: [hearing] }], outcomeType: 'First written warning', setOutcomeType })} />);
    await userEvent.click(screen.getByRole('button', { name: /Show the disciplinary record/i }));
    expect(screen.getByLabelText('Outcome decision')).toHaveValue('First written warning');
    expect(setOutcomeType).not.toHaveBeenCalled();
  });

  it('never offers a letter-only meeting as "the record"', () => {
    const letterOnly = { id: 'm2', type: 'Disciplinary', letterType: 'outcome', record: '', transcript: [] };
    expect(decisionMeeting({ meetings: [letterOnly] })).toBeNull();
    expect(decisionMeeting({ meetings: [letterOnly, hearing] })).toBe(hearing);
  });

  it('uses the authoritative Current Warnings derivation, excluding this case', () => {
    const live = {
      id: 'prior', outcome: 'First written warning', outcomeIssuedAt: '2026-01-01T00:00:00.000Z',
      warningExpiresAt: '2099-01-01', caseType: 'disciplinary',
    };
    const EMP = 'emp-1';
    const warnings = priorLiveWarnings({
      cases: [{ ...live, employeeId: EMP }, { ...baseCase, employeeId: EMP, outcome: 'Final written warning', outcomeIssuedAt: '2026-02-01T00:00:00.000Z', warningExpiresAt: '2099-01-01' }],
      currentCase: { ...baseCase, employeeId: EMP },
    });
    expect(warnings.map(w => w.caseId)).toEqual(['prior']);
  });

  it.each([
    ['Letter of Concern', { outcome: 'Letter of Concern' }],
    ['a management concern', { outcome: 'Management concern' }],
    ['an unissued outcome', { outcome: 'First written warning', outcomeIssuedAt: null }],
    ['an expired warning', { outcome: 'First written warning', outcomeIssuedAt: '2020-01-01T00:00:00.000Z', warningExpiresAt: '2021-01-01' }],
  ])('never shows %s as a live warning', (_label, over) => {
    const c = { id: 'p', employeeId: 'emp-1', warningExpiresAt: '2099-01-01', caseType: 'disciplinary', ...over };
    expect(priorLiveWarnings({ cases: [c], currentCase: { ...baseCase, employeeId: 'emp-1' } })).toEqual([]);
  });

  it('composes the three parts, and reports emptiness honestly', () => {
    const empty = outcomeDecisionContext({ caseObj: { id: CASE_ID, meetings: [] }, cases: [], allegations: [] });
    expect(empty.isEmpty).toBe(true);
    const full = outcomeDecisionContext({
      caseObj: { ...baseCase, meetings: [hearing] }, cases: [baseCase], allegations,
    });
    expect(full.isEmpty).toBe(false);
    expect(full.allegations).toHaveLength(1);
    expect(full.meeting).toBe(hearing);
  });

  it('says nothing at all when there is no context to show', () => {
    render(<OutcomeModal {...props()} />);
    expect(screen.queryByText(/The record you are deciding on/)).not.toBeInTheDocument();
  });

  it('performs no retrieval of its own — context comes from props', () => {
    expect(outcomeSrc).not.toContain('supabase');
    expect(outcomeSrc).not.toContain('authedFetch');
    const ctxSrc = stripComments(readFileSync('src/lib/outcomeDecisionContext.js', 'utf8'));
    expect(ctxSrc).not.toContain('supabase');
    expect(ctxSrc).not.toContain('fetch(');
  });

  it('offers no recommendation, score or suggested outcome', () => {
    const { container } = render(<OutcomeModal {...props({ allegations, cases: [{ ...baseCase, meetings: [hearing] }] })} />);
    // "ACAS-recommended 5 working days" is a procedural timescale, not a
    // recommended sanction — target the actual prohibition.
    expect(container.textContent).not.toMatch(/we recommend|recommended outcome|suggested outcome|severity|risk score|tribunal/i);
  });
});

const letterProps = (over = {}) => ({
  handleLetter: noop, activeLetter: 'outcome', aiProcessing: false, letterOutput: 'Dear Sam,',
  letterSources: [], letterHistory: [], restoreLetterVersion: noop, editingLetter: false,
  setEditingLetter: noop, setLetterOutput: noop, setShowSigPad: noop, setSignature: noop,
  caseInfo: { employee: 'Sam Employee', manager: 'Alex Chair' }, pdfGenerating: false,
  saveMeetingToCase: noop, setScreen: noop, approveLetter: noop, outcomeRecorded: true,
  outcomeValue: 'First written warning', ...over,
});

// ─────────────────────────────────────────────────────────────────────────
// HUMAN UAT CORRECTIONS — found on AT - Phase 3A Final UAT in production.
// ─────────────────────────────────────────────────────────────────────────
describe('UAT correction — prior warnings belong to THIS employee only', () => {
  const EMP = 'emp-1';
  const OTHER = 'emp-2';
  const liveWarning = over => ({
    id: 'w', employeeId: EMP, outcome: 'First written warning',
    outcomeIssuedAt: '2026-01-01T00:00:00.000Z', warningExpiresAt: '2099-01-01',
    caseType: 'disciplinary', ...over,
  });

  // THE DEFECT: a fresh case with no outcome displayed two live warnings
  // belonging to two different employees, because the whole org-wide `cases`
  // prop was handed to a function documented as needing an employee-linked slice.
  it('never shows another employee\'s warning', () => {
    const warnings = priorLiveWarnings({
      cases: [liveWarning({ id: 'theirs', employeeId: OTHER })],
      currentCase: { id: 'mine', employeeId: EMP },
    });
    expect(warnings).toEqual([]);
  });

  it('shows this employee\'s own prior warning', () => {
    const warnings = priorLiveWarnings({
      cases: [liveWarning({ id: 'mine-prior' })],
      currentCase: { id: 'mine', employeeId: EMP },
    });
    expect(warnings.map(w => w.caseId)).toEqual(['mine-prior']);
  });

  // THE PRODUCTION SHAPE: every UAT fixture has employee_id NULL, so without
  // the explicit guard `null === null` matches and the leak returns intact.
  it('two identity-less cases are NOT treated as the same person', () => {
    const theirs = liveWarning({ id: 'theirs', employeeId: null });
    expect(priorLiveWarnings({
      cases: [theirs],
      currentCase: { id: 'mine', employeeId: null },
    })).toEqual([]);
  });

  it('shows NOTHING when the case has no established employee identity', () => {
    // Guessing by name is how two people who share one get merged.
    expect(priorLiveWarnings({
      cases: [liveWarning({ id: 'someone' })],
      currentCase: { id: 'mine', employeeId: null, employeeName: 'Sam Employee' },
    })).toEqual([]);
  });

  it('renders no warnings block for the production fixture shape (no employeeId)', () => {
    const other = liveWarning({ id: 'theirs', employeeId: OTHER });
    render(<OutcomeModal {...props({ cases: [baseCase, other] })} />);
    expect(screen.queryByText(/Live formal warnings/)).not.toBeInTheDocument();
  });
});

describe('UAT correction — the decision comes before the history', () => {
  const allegations = [{ id: 'a1', caseId: CASE_ID, title: 'Unauthorised vehicle use', status: 'upheld' }];
  const hearing = { id: 'm1', type: 'Disciplinary', date: '2026-09-11', record: '## Dialogue\nAC: Noted.', transcript: [{ text: 'x' }] };
  const EMP = 'emp-1';
  const withEverything = {
    ...baseCase, employeeId: EMP, meetings: [hearing],
  };
  const prior = {
    id: 'prior', employeeId: EMP, outcome: 'First written warning',
    outcomeIssuedAt: '2026-01-01T00:00:00.000Z', warningExpiresAt: '2099-01-01', caseType: 'disciplinary',
  };

  const renderAll = () => render(<OutcomeModal {...props({
    cases: [withEverything, prior], allegations, activeCaseId: CASE_ID,
  })} />);

  it('allegations appear before previous live warnings', () => {
    const { container } = renderAll();
    const text = container.textContent;
    expect(text.indexOf('Unauthorised vehicle use')).toBeGreaterThan(-1);
    expect(text.indexOf('Live formal warnings')).toBeGreaterThan(-1);
    expect(text.indexOf('Unauthorised vehicle use')).toBeLessThan(text.indexOf('Live formal warnings'));
  });

  it('the disciplinary record appears before previous live warnings', () => {
    const { container } = renderAll();
    const text = container.textContent;
    expect(text.indexOf('Show the disciplinary record')).toBeLessThan(text.indexOf('Live formal warnings'));
  });

  it('still invents no allegation where none exists', () => {
    render(<OutcomeModal {...props({ cases: [withEverything], allegations: [] })} />);
    expect(screen.queryByText(/Allegation/)).not.toBeInTheDocument();
  });
});

describe('D3 — a letter must not outlive the decision it states', () => {
  const decidedAt = '2026-10-02T12:00:00.000Z';
  const before = { id: 'L', letterType: 'outcome', savedAt: '2026-10-01T09:00:00.000Z' };
  const after = { id: 'L', letterType: 'outcome', savedAt: '2026-10-03T09:00:00.000Z' };

  it('is current when the letter was written after the decision', () => {
    const s = outcomeLetterStatus({ outcome: 'First written warning', outcomeIssuedAt: decidedAt, meetings: [after] });
    expect(s.state).toBe(OUTCOME_LETTER.CURRENT);
    expect(outcomeLetterNotice(s)).toBeNull();
  });

  it('is a stale draft when the decision was recorded after the letter', () => {
    const s = outcomeLetterStatus({ outcome: 'Final written warning', outcomeIssuedAt: decidedAt, meetings: [before] });
    expect(s.state).toBe(OUTCOME_LETTER.STALE_DRAFT);
    expect(outcomeLetterNotice(s)).toMatch(/written before the outcome now recorded/i);
  });

  it('an ISSUED letter is superseded, never stale — history is not rewritten', () => {
    for (const provenance of [{ letterApprovedAt: '2026-10-01T10:00:00.000Z' }, { signStatus: 'signed' }, { letterTracking: { sentAt: 'x' } }]) {
      const s = outcomeLetterStatus({ outcomeIssuedAt: decidedAt, meetings: [{ ...before, ...provenance }] });
      expect(s.state).toBe(OUTCOME_LETTER.ISSUED_SUPERSEDED);
      expect(outcomeLetterNotice(s)).toMatch(/kept as the record of what was sent/i);
      expect(outcomeLetterNotice(s)).not.toMatch(/regenerate/i);
    }
  });

  it('uses the same issuance vocabulary as DSAR', () => {
    expect(isIssuedLetter({ letterApprovedAt: 'x' })).toBe(true);
    expect(isIssuedLetter({ signStatus: 'pending' })).toBe(true);
    expect(isIssuedLetter({ letterTracking: { a: 1 } })).toBe(true);
    expect(isIssuedLetter({ letterTracking: {} })).toBe(false);
    expect(isIssuedLetter({})).toBe(false);
  });

  it('never claims staleness from an unknown timestamp', () => {
    expect(outcomeLetterStatus({ outcomeIssuedAt: decidedAt, meetings: [{ letterType: 'outcome' }] }).state).toBe(OUTCOME_LETTER.CURRENT);
    expect(outcomeLetterStatus({ meetings: [before] }).state).toBe(OUTCOME_LETTER.CURRENT);
  });

  it('reports no letter when none has been drafted', () => {
    expect(outcomeLetterStatus({ outcome: 'x', meetings: [] }).state).toBe(OUTCOME_LETTER.NONE);
    expect(findOutcomeLetter({ meetings: [{ letterType: 'invite' }] })).toBeNull();
  });

  it('takes the newest outcome letter when several exist', () => {
    expect(findOutcomeLetter({ meetings: [before, after] }).savedAt).toBe(after.savedAt);
  });

  it('App derives the status from the authoritative case', () => {
    expect(app).toContain('outcomeLetter={outcomeLetterStatus(cases.find(x=>x.id===activeCaseId))}');
  });

  // RENDERED, not asserted on source: suppressing the block with `false&&`
  // leaves the source string intact, so a source assertion cannot catch it.
  it('RENDERS the stale notice on the outcome letter', () => {
    const stale = outcomeLetterStatus({ outcomeIssuedAt: decidedAt, meetings: [before] });
    render(<LetterScreen {...letterProps({ outcomeLetter: stale })} />);
    expect(screen.getByText(/written before the outcome now recorded/i)).toBeInTheDocument();
    expect(screen.getByText('Out of date')).toBeInTheDocument();
  });

  it('RENDERS the superseded notice for an issued letter, without offering regeneration', () => {
    const superseded = outcomeLetterStatus({ outcomeIssuedAt: decidedAt, meetings: [{ ...before, signStatus: 'signed' }] });
    render(<LetterScreen {...letterProps({ outcomeLetter: superseded })} />);
    expect(screen.getByText(/kept as the record of what was sent/i)).toBeInTheDocument();
    expect(screen.getByText('Already issued')).toBeInTheDocument();
  });

  it('renders NO notice when the letter is current', () => {
    const current = outcomeLetterStatus({ outcomeIssuedAt: decidedAt, meetings: [after] });
    render(<LetterScreen {...letterProps({ outcomeLetter: current })} />);
    expect(screen.queryByText(/written before the outcome now recorded/i)).not.toBeInTheDocument();
  });

  it('renders no outcome-letter notice on a different letter type', () => {
    const stale = outcomeLetterStatus({ outcomeIssuedAt: decidedAt, meetings: [before] });
    render(<LetterScreen {...letterProps({ outcomeLetter: stale, activeLetter: 'invite' })} />);
    expect(screen.queryByText(/written before the outcome now recorded/i)).not.toBeInTheDocument();
  });
});

describe('regression — frozen architecture untouched', () => {
  it('appeal outcome recording is unchanged (D4 remains the known blocker)', () => {
    expect(app).toContain('const recordAppealOutcome = (allegationId, outcome, reasoning) => {');
    const i = app.indexOf('const recordAppealOutcome');
    const body = app.slice(i, i + 500);
    expect(body).not.toContain('outcome:'); // still writes no case-level outcome
    expect(body).not.toContain('warningExpiresAt');
  });

  it('appeal authority and chair integrity migrations are untouched', () => {
    const indep = readFileSync('supabase/appeal_independence_decision_maker_2026-09-18.sql', 'utf8');
    expect(indep).toContain('Only an HR Director or HR Manager can appoint, replace, or revoke an appeal officer');
    expect(indep).toContain('INDEPENDENCE_CONFLICT');
    const chair = readFileSync('supabase/appeal_hearing_chair_integrity_2026-09-18.sql', 'utf8');
    expect(chair).toContain('APPEAL_HEARING_CHAIR_IMMUTABLE');
  });

  it('closure remains HR-only and readiness-gated', () => {
    const cv = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
    expect(cv).toContain('if (!isHR) { showToast("Only HR can close a case.", "error"); return; }');
    expect(cv).toContain('nextStep?.action === "close_case"');
  });

  it('Current Warnings derivation is unchanged', () => {
    const ef = readFileSync('src/lib/employeeFile.js', 'utf8');
    expect(ef).toContain('.filter(cs => cs && isWarningOutcome(cs.outcome))');
    expect(ef).toContain('.filter(cs => !!cs.outcomeIssuedAt)');
    expect(ef).toContain('isWarningLive(cs.warningExpiresAt, now)');
  });

  it('No further action remains a first-class outcome', () => {
    render(<OutcomeModal {...props()} />);
    expect(screen.getByRole('option', { name: 'No further action' })).toBeInTheDocument();
  });

  it('warning expiry stays calculated, not entered', () => {
    expect(outcomeSrc).toContain('(calculated, not editable)');
    expect(outcomeSrc).toContain('addCalendarMonths(issuedAt, durationMonths)');
  });

  it('the outcome surface carries no legacy cream or serif styling', () => {
    for (const legacy of ['#FDFAF5', '#E8E0D0', 'DM Serif', '#1C1820', '#9B9098']) {
      expect(outcomeSrc).not.toContain(legacy);
    }
  });
});
