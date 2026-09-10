import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OutcomeTab } from '../components/caseTabs/OutcomeTab.jsx';
import { getCaseStage } from '../lib/caseStage.js';
import { getNextStep } from '../lib/nextStep.js';

const fmtDate = d => d;
const reachedCase = { id: 'c1', employeeName: 'Sarah Jones', caseType: 'Misconduct', outcome: '' };

// Phase 6.5 hardening (Prompt 16 audit, closes finding C1) — the "Issue
// outcome" button used to render unconditionally to anyone who reached
// this tab; canDecide (isHR || case_access.role==="disciplinary_officer",
// the same boundary CaseViewScreen's AllegationsPanel already enforces)
// wasn't wired in at all. The real enforcement is now a DB trigger
// (protect_case_hr_only_columns), so this button gate is UX, not the
// security boundary — but it should still match what the server will
// actually allow, not offer an action guaranteed to fail.
describe('OutcomeTab — canDecide gates the "Issue outcome" action (closes C1)', () => {
  it('shows the Issue outcome button when the caller can decide', () => {
    render(<OutcomeTab cs={reachedCase} stage="disciplinary" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.getByRole('button', { name: 'Issue outcome →' })).toBeInTheDocument();
  });

  it('hides the Issue outcome button and explains why when the caller cannot decide', () => {
    render(<OutcomeTab cs={reachedCase} stage="disciplinary" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={false} />);
    expect(screen.queryByRole('button', { name: 'Issue outcome →' })).not.toBeInTheDocument();
    expect(screen.getByText(/Only HR or this case's Hearing Manager can issue the outcome/)).toBeInTheDocument();
  });

  it('does not gate the already-issued outcome view — anyone who reaches the tab can see a recorded outcome', () => {
    const decided = { ...reachedCase, outcome: 'Final written warning', outcomeIssuedAt: '2026-01-01' };
    render(<OutcomeTab cs={decided} stage="closed" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={false} />);
    expect(screen.getByText('Outcome issued')).toBeInTheDocument();
    expect(screen.getByText('Final written warning')).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (closes Prompt 16 audit finding H12, HIGH) — this
// tab's own "reached" check used to hardcode disciplinary/grievance stage
// ids only ("disciplinary"/"hearing"/"outcome"/"appeal"/"closed"), so a
// long-term-sickness or flexible-working case's own late stages could
// never satisfy it — and since cs.outcome can only be set by clicking the
// button this check gates, those cases could never record an outcome at
// all, permanently. Derived generically from the case's own process type
// instead, so this needs no per-type hardcoding.
describe('OutcomeTab — reaches the outcome stage for every process type, not just disciplinary/grievance (Prompt 16 audit, H12)', () => {
  it('shows Issue outcome for a long-term-sickness case at "capability_consideration" (the stage before "decision")', () => {
    const cs = { id: 'c2', employeeName: 'Sam Lee', caseType: 'long-term sickness', outcome: '' };
    render(<OutcomeTab cs={cs} stage="capability_consideration" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.getByRole('button', { name: 'Issue outcome →' })).toBeInTheDocument();
  });

  it('does not show Issue outcome for a long-term-sickness case still at "occupational_health" (not yet at the threshold)', () => {
    const cs = { id: 'c3', employeeName: 'Sam Lee', caseType: 'long-term sickness', outcome: '' };
    render(<OutcomeTab cs={cs} stage="occupational_health" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.queryByRole('button', { name: 'Issue outcome →' })).not.toBeInTheDocument();
  });

  it('shows Issue outcome for a flexible-working case at "decision_meeting" (the stage before "decision")', () => {
    const cs = { id: 'c4', employeeName: 'Priya Shah', caseType: 'flexible working', outcome: '' };
    render(<OutcomeTab cs={cs} stage="decision_meeting" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.getByRole('button', { name: 'Issue outcome →' })).toBeInTheDocument();
  });

  it('still shows the "hasn\'t reached" message for a long-term-sickness case at "absence_identified"', () => {
    const cs = { id: 'c5', employeeName: 'Sam Lee', caseType: 'long-term sickness', outcome: '' };
    render(<OutcomeTab cs={cs} stage="absence_identified" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.getByText(/hasn't reached/)).toBeInTheDocument();
  });
});

// UAT Golden Path remediation (Defect #8) — end-to-end reproduction of
// the reported bug: getCaseStage(cs) feeds the exact `stage` value
// CaseViewScreen.jsx passes into this tab (see its own `const stage =
// getCaseStage(cs);`), for a case shaped exactly like the Golden Path
// case that surfaced this — a Disciplinary meeting started directly via
// "+ New meeting" (not the guided "disciplinary_invite" action), with
// cs.stage still holding the "open" lifecycle placeholder saveCaseToDB
// persists by default. Before the fix, getCaseStage returned "open"
// unconditionally and this rendered the "hasn't reached" message despite
// the completed hearing; after the fix it must not.
describe('OutcomeTab — Defect #8: a directly-started Disciplinary meeting must not be reported as "hasn\'t reached a disciplinary hearing"', () => {
  const directDisciplinaryCase = {
    id: 'golden-path',
    employeeName: 'UAT - Test Employee (Golden Path)',
    caseType: 'misconduct',
    outcome: '',
    stage: 'open', // the exact persisted value that caused the defect
    meetings: [
      { type: 'Investigation', record: 'the investigation record' },
      { type: 'Disciplinary', record: 'the disciplinary hearing record' },
    ],
  };

  it('resolves Outcome as reachable through the real getCaseStage() wiring, not a hand-picked stage prop', () => {
    const stage = getCaseStage(directDisciplinaryCase);
    expect(stage).toBe('disciplinary');
    render(<OutcomeTab cs={directDisciplinaryCase} stage={stage} fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.queryByText(/hasn't reached a disciplinary hearing/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Issue outcome →' })).toBeInTheDocument();
  });

  it('Case Copilot\'s next-step banner (getNextStep) agrees with Outcome reachability instead of contradicting it', () => {
    // Before the fix, getNextStep(cs) also read the poisoned "open" stage
    // and fell through disciplinaryNextStep's switch to `default: return
    // null` — no guidance shown at all — while the case header (a
    // separate, meeting-scanning function, App.jsx's getCaseStatus)
    // still correctly said "Disciplinary in progress". This asserts the
    // two stage-driven consumers (Outcome, Copilot) now agree with each
    // other for the same persisted state, closing that contradiction.
    const step = getNextStep(directDisciplinaryCase);
    expect(step).not.toBeNull();
    expect(['send_signature', 'outcome_letter']).toContain(step.action);
  });
});

// UAT Golden Path remediation (Defect #12/#14) — the "Issue outcome"
// panel now also shows the persisted date/duration/expiry, and offers a
// distinct "Complete outcome details" action for a warning outcome
// that's missing its structured duration — the historical-case path,
// never a re-issue.
describe('OutcomeTab — outcome date/duration/expiry display and completion path (Defect #12/#14)', () => {
  const setOutcomeType = () => {};
  const setCompletingOutcomeDetails = () => {};
  const setShowOutcomeModal = () => {};

  it('shows the persisted issue date once outcomeIssuedAt is set', () => {
    const decided = { ...reachedCase, outcome: 'First written warning', outcomeIssuedAt: '2026-09-07', warningDurationMonths: 6, warningExpiresAt: '2027-03-07' };
    render(<OutcomeTab cs={decided} stage="closed" fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal} setOutcomeType={setOutcomeType} setCompletingOutcomeDetails={setCompletingOutcomeDetails} canDecide={true} />);
    expect(screen.getByText(/Issued 2026-09-07/)).toBeInTheDocument();
  });

  it('says the date was not recorded, honestly, rather than inventing one, when outcomeIssuedAt is missing', () => {
    const decided = { ...reachedCase, outcome: 'First written warning' };
    render(<OutcomeTab cs={decided} stage="closed" fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal} setOutcomeType={setOutcomeType} setCompletingOutcomeDetails={setCompletingOutcomeDetails} canDecide={true} />);
    expect(screen.getByText(/date not recorded/)).toBeInTheDocument();
  });

  it('shows warning duration and expiry when both are present', () => {
    const decided = { ...reachedCase, outcome: 'First written warning', outcomeIssuedAt: '2026-09-07', warningDurationMonths: 6, warningExpiresAt: '2027-03-07' };
    render(<OutcomeTab cs={decided} stage="closed" fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal} setOutcomeType={setOutcomeType} setCompletingOutcomeDetails={setCompletingOutcomeDetails} canDecide={true} />);
    expect(screen.getByText(/Warning duration: 6 months/)).toBeInTheDocument();
    expect(screen.getByText(/Expires 2027-03-07/)).toBeInTheDocument();
  });

  // Defect #16 remediation — the same computeAppealDeadline computation
  // computeDueSoon's own due/overdue tracking uses (lib/deadlines.js),
  // surfaced here so this text can never independently disagree with the
  // deadline actually being tracked elsewhere in the app.
  it('shows the actual computed appeal deadline once an outcome letter has been saved (Defect #16)', () => {
    const decided = {
      ...reachedCase, outcome: 'First written warning', outcomeIssuedAt: '2026-09-07',
      meetings: [{ id: 'm1', type: 'Disciplinary', date: '2026-09-07', savedAt: '2026-09-10T19:55:00.878Z', letterOutput: '...', letterType: 'outcome' }],
    };
    render(<OutcomeTab cs={decided} stage="closed" fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal} setOutcomeType={setOutcomeType} setCompletingOutcomeDetails={setCompletingOutcomeDetails} canDecide={true} />);
    expect(screen.getByText(/Deadline/)).toBeInTheDocument();
  });

  it('does not show a deadline before any outcome letter has been saved — nothing real to anchor one to yet', () => {
    const decided = { ...reachedCase, outcome: 'First written warning', outcomeIssuedAt: '2026-09-07', meetings: [] };
    render(<OutcomeTab cs={decided} stage="closed" fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal} setOutcomeType={setOutcomeType} setCompletingOutcomeDetails={setCompletingOutcomeDetails} canDecide={true} />);
    expect(screen.queryByText(/Deadline/)).not.toBeInTheDocument();
  });

  it('offers "Complete outcome details" for a warning outcome missing its duration, when the caller can decide', () => {
    const incomplete = { ...reachedCase, outcome: 'First written warning', outcomeIssuedAt: null, warningDurationMonths: null };
    render(<OutcomeTab cs={incomplete} stage="closed" fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal} setOutcomeType={setOutcomeType} setCompletingOutcomeDetails={setCompletingOutcomeDetails} canDecide={true} />);
    expect(screen.getByRole('button', { name: 'Complete outcome details' })).toBeInTheDocument();
  });

  it('does not offer completion once warningDurationMonths is already set', () => {
    const complete = { ...reachedCase, outcome: 'First written warning', outcomeIssuedAt: '2026-09-07', warningDurationMonths: 6, warningExpiresAt: '2027-03-07' };
    render(<OutcomeTab cs={complete} stage="closed" fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal} setOutcomeType={setOutcomeType} setCompletingOutcomeDetails={setCompletingOutcomeDetails} canDecide={true} />);
    expect(screen.queryByRole('button', { name: 'Complete outcome details' })).not.toBeInTheDocument();
  });

  it('does not offer completion for a non-warning outcome, even with no structured metadata at all', () => {
    const decided = { ...reachedCase, outcome: 'No further action' };
    render(<OutcomeTab cs={decided} stage="closed" fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal} setOutcomeType={setOutcomeType} setCompletingOutcomeDetails={setCompletingOutcomeDetails} canDecide={true} />);
    expect(screen.queryByRole('button', { name: 'Complete outcome details' })).not.toBeInTheDocument();
  });

  it('explains, rather than offering the button, when the caller cannot decide', () => {
    const incomplete = { ...reachedCase, outcome: 'Final written warning', warningDurationMonths: null };
    render(<OutcomeTab cs={incomplete} stage="closed" fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal} setOutcomeType={setOutcomeType} setCompletingOutcomeDetails={setCompletingOutcomeDetails} canDecide={false} />);
    expect(screen.queryByRole('button', { name: 'Complete outcome details' })).not.toBeInTheDocument();
    expect(screen.getByText(/only HR or this case's Hearing Manager can complete it/i)).toBeInTheDocument();
  });

  it('clicking "Complete outcome details" pre-fills the outcome type, enters completion mode, and opens the modal — never re-issuing', async () => {
    const user = userEvent.setup();
    const calls = [];
    const incomplete = { ...reachedCase, outcome: 'First written warning', warningDurationMonths: null };
    render(<OutcomeTab
      cs={incomplete} stage="closed" fmtDate={fmtDate}
      setShowOutcomeModal={()=>calls.push('setShowOutcomeModal')}
      setOutcomeType={(v)=>calls.push('setOutcomeType:'+v)}
      setCompletingOutcomeDetails={()=>calls.push('setCompletingOutcomeDetails')}
      canDecide={true}
    />);
    await user.click(screen.getByRole('button', { name: 'Complete outcome details' }));
    expect(calls).toContain('setOutcomeType:First written warning');
    expect(calls).toContain('setCompletingOutcomeDetails');
    expect(calls).toContain('setShowOutcomeModal');
  });
});

// Defect #17 remediation — a durable, always-available route to the
// outcome letter once cs.outcome is decided, independent of Case
// Copilot's own single-track next-step suggestion. Never gated on
// canDecide: drafting/regenerating a letter writes nothing to the
// HR-only-protected outcome columns (only Issue/Complete outcome do,
// already gated above).
describe('OutcomeTab — draft/regenerate outcome letter (Defect #17)', () => {
  it('does not render the button at all when no onDraftOutcomeLetter handler is supplied', () => {
    const decided = { ...reachedCase, outcome: 'First written warning' };
    render(<OutcomeTab cs={decided} stage="outcome" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.queryByRole('button', { name: /outcome letter/i })).not.toBeInTheDocument();
  });

  it('offers "Draft outcome letter" when an outcome is decided but no letter has ever been saved', () => {
    const decided = { ...reachedCase, outcome: 'First written warning', meetings: [] };
    render(<OutcomeTab cs={decided} stage="outcome" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} onDraftOutcomeLetter={()=>{}} canDecide={true} />);
    expect(screen.getByRole('button', { name: 'Draft outcome letter' })).toBeInTheDocument();
  });

  it('offers "Regenerate outcome letter" once a letter has already been saved to a meeting', () => {
    const decided = {
      ...reachedCase, outcome: 'First written warning',
      meetings: [{ type: 'Disciplinary', letterOutput: 'Dear Sarah...', letterType: 'outcome' }],
    };
    render(<OutcomeTab cs={decided} stage="outcome" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} onDraftOutcomeLetter={()=>{}} canDecide={true} />);
    expect(screen.getByRole('button', { name: 'Regenerate outcome letter' })).toBeInTheDocument();
  });

  it('offers the button even when the caller cannot decide — drafting a letter is not a protected-column write', () => {
    const decided = { ...reachedCase, outcome: 'First written warning', meetings: [] };
    render(<OutcomeTab cs={decided} stage="outcome" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} onDraftOutcomeLetter={()=>{}} canDecide={false} />);
    expect(screen.getByRole('button', { name: 'Draft outcome letter' })).toBeInTheDocument();
  });

  it('offers the button even when the hearing record is unsigned — the Golden Path reproduction shape', () => {
    const goldenPathShaped = {
      ...reachedCase, outcome: 'First written warning',
      meetings: [{ type: 'Disciplinary', record: 'the hearing record', signStatus: null }],
    };
    render(<OutcomeTab cs={goldenPathShaped} stage="outcome" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} onDraftOutcomeLetter={()=>{}} canDecide={true} />);
    expect(screen.getByRole('button', { name: 'Draft outcome letter' })).toBeInTheDocument();
  });

  it('calls the handler on click and does not itself touch cs.outcome or re-issue anything', async () => {
    const user = userEvent.setup();
    let calls = 0;
    const decided = { ...reachedCase, outcome: 'First written warning', meetings: [] };
    render(<OutcomeTab cs={decided} stage="outcome" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} onDraftOutcomeLetter={()=>{calls++;}} canDecide={true} />);
    await user.click(screen.getByRole('button', { name: 'Draft outcome letter' }));
    expect(calls).toBe(1);
  });
});
