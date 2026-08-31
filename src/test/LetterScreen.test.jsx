import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LetterScreen } from '../screens/LetterScreen.jsx';
import { isLetterApproved, createLetterApproval } from '../lib/letterApproval.js';

const baseProps = {
  handleLetter: () => {}, activeLetter: 'witness-invitation', aiProcessing: false,
  letterOutput: 'Dear Sarah, you are invited to attend as a witness...',
  setEditingLetter: () => {}, editingLetter: false, setLetterOutput: () => {},
  setShowSigPad: () => {}, setSignature: () => {}, caseInfo: { employee: 'Sarah Jones', manager: 'Jo' },
  triggerWithSig: () => {}, pdfGenerating: false, saveMeetingToCase: () => {}, setScreen: () => {},
  letterApproval: null, approveLetter: () => {},
};

// Integrations & Workflow Automation (Phase 5, IP13, §7) — "Send from
// Compass" makes a real Resend API call once clicked, so (like every
// other real-external-side-effect action in this app's test suite) the
// E2E coverage stops at "the button appears and opens the send modal",
// never actually firing a real outbound email. This is where the button's
// approval gating and click wiring are actually verified.
// Phase 6.5 hardening (Batch 11) — the drawn-signature image had a bare
// alt="Sig", meaningless to a screen reader.
describe('LetterScreen — signature image alt text (Phase 6.5, Batch 11)', () => {
  it('names the actual signer in the alt text, not a generic "Sig"', () => {
    render(<LetterScreen {...baseProps} signature={{ type: 'draw', data: 'data:image/png;base64,xyz' }} />);
    expect(screen.getByAltText('Signature of Jo')).toBeInTheDocument();
  });

  it('falls back to "HR Manager" when no manager name is set', () => {
    render(<LetterScreen {...baseProps} caseInfo={{ employee: 'Sarah Jones' }} signature={{ type: 'draw', data: 'data:image/png;base64,xyz' }} />);
    expect(screen.getByAltText('Signature of HR Manager')).toBeInTheDocument();
  });
});

describe('LetterScreen — Send from Compass (Phase 5, IP13)', () => {
  it('renders "Send from Compass" disabled until the letter is approved', () => {
    render(<LetterScreen {...baseProps} letterIsApproved={false} onSendFromCompass={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Send from Compass' })).toBeDisabled();
  });

  it('enables it once approved, and calls onSendFromCompass when clicked', async () => {
    const user = userEvent.setup();
    const onSendFromCompass = vi.fn();
    const letterApproval = { by: 'Jo', at: new Date().toISOString() };
    render(<LetterScreen {...baseProps} letterIsApproved letterApproval={letterApproval} onSendFromCompass={onSendFromCompass} />);
    const button = screen.getByRole('button', { name: 'Send from Compass' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onSendFromCompass).toHaveBeenCalledTimes(1);
  });

  it('omits the button entirely when no handler is given', () => {
    const letterApproval = { by: 'Jo', at: new Date().toISOString() };
    render(<LetterScreen {...baseProps} letterIsApproved letterApproval={letterApproval} />);
    expect(screen.queryByRole('button', { name: 'Send from Compass' })).not.toBeInTheDocument();
  });
});

// Integrations & Workflow Automation (Phase 5, IP27, §21) — a second,
// independent send path for outcome letters specifically (App.jsx only
// ever passes onSendForAcknowledgement when activeLetter==="outcome"),
// tracked through the signing_requests lifecycle instead of a plain
// Resend email — same "button appears and opens the send modal" E2E
// boundary as Send from Compass above, real coverage here.
describe('LetterScreen — Send for acknowledgement (Phase 5, IP27)', () => {
  it('renders "Send for acknowledgement" disabled until the letter is approved', () => {
    render(<LetterScreen {...baseProps} letterIsApproved={false} onSendForAcknowledgement={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Send for acknowledgement' })).toBeDisabled();
  });

  it('enables it once approved, and calls onSendForAcknowledgement when clicked', async () => {
    const user = userEvent.setup();
    const onSendForAcknowledgement = vi.fn();
    const letterApproval = { by: 'Jo', at: new Date().toISOString() };
    render(<LetterScreen {...baseProps} letterIsApproved letterApproval={letterApproval} onSendForAcknowledgement={onSendForAcknowledgement} />);
    const button = screen.getByRole('button', { name: 'Send for acknowledgement' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onSendForAcknowledgement).toHaveBeenCalledTimes(1);
  });

  it('omits the button entirely when no handler is given (e.g. any letter type other than "outcome")', () => {
    const letterApproval = { by: 'Jo', at: new Date().toISOString() };
    render(<LetterScreen {...baseProps} letterIsApproved letterApproval={letterApproval} />);
    expect(screen.queryByRole('button', { name: 'Send for acknowledgement' })).not.toBeInTheDocument();
  });

  it('can coexist with Send from Compass when both handlers are given', () => {
    const letterApproval = { by: 'Jo', at: new Date().toISOString() };
    render(<LetterScreen {...baseProps} letterIsApproved letterApproval={letterApproval} onSendFromCompass={()=>{}} onSendForAcknowledgement={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Send from Compass' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send for acknowledgement' })).toBeInTheDocument();
  });
});

// Human UAT remediation, Batch 1, Issue 5 — UAT reported that clicking
// "Approve for sending" appeared to do nothing, and the flow seemed to
// ask for confirmation twice. Reproduced here with the REAL
// letterApproval.js functions wired exactly as App.jsx wires them
// (letterIsApproved derived fresh each render from letterOutput+
// letterApproval, approveLetter calling the real createLetterApproval),
// not mocked — a mock approveLetter would hide exactly the kind of bug
// this is checking for. Root cause found: none in this wiring itself —
// clicking Approve DOES immediately flip the banner and unlock
// send/download. The reported "asks for confirmation again" was the
// still-clickable "Re-confirm approval" button label that replaces
// "Approve for sending" once approved (existing, deliberate design: any
// further edit/regenerate silently invalidates approval by changing the
// snapshot, so the button must stay clickable) — worded so it reads as
// if the first click hadn't registered. Copy fixed below to make clear
// approval already succeeded.
describe('LetterScreen — approval flow actually updates the UI (Human UAT remediation, Batch 1, Issue 5)', () => {
  function ApprovalHarness(props) {
    const [letterApproval, setLetterApproval] = useState(null);
    const letterIsApproved = isLetterApproved(props.letterOutput, letterApproval);
    const approveLetter = () => setLetterApproval(createLetterApproval(props.letterOutput, { by: 'Jo', type: props.activeLetter }));
    return <LetterScreen {...props} letterApproval={letterApproval} letterIsApproved={letterIsApproved} approveLetter={approveLetter} />;
  }

  it('flips the banner and unlocks Download/Send the moment Approve is clicked — no second click needed', async () => {
    const user = userEvent.setup();
    const { container } = render(<ApprovalHarness {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(screen.getByText(/drafted by AI\. Review it above/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve for sending' }));

    expect(container.textContent).toMatch(/Approved for sending by\s*Jo/);
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  });

  it('labels the post-approval button so it reads as already-done, not as a pending second confirmation', async () => {
    const user = userEvent.setup();
    render(<ApprovalHarness {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'Approve for sending' }));
    expect(screen.queryByRole('button', { name: 'Re-confirm approval' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /already approved/i })).toBeInTheDocument();
  });

  it('does invalidate approval, honestly, once the letter text actually changes (edit/regenerate) — not a UI glitch', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ApprovalHarness {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'Approve for sending' }));
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
    rerender(<ApprovalHarness {...baseProps} letterOutput="A regenerated, different letter body." />);
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve for sending' })).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (Prompt 16 audit, closes finding H10, HIGH) —
// activeLetter==="outcome" can be reached before any real outcome
// decision exists (CaseViewScreen's Copilot "Draft outcome letter"
// action, or just clicking this screen's own Outcome letter tab).
// outcomeRecorded (App.jsx: whether the active case's own cases.outcome
// is set) gates every issue/send/download/print/copy action the same
// way letterIsApproved already does — the real boundary is server-side
// (api/_auth.js's verifyOutcomeApproved), this is the UX half so the
// block reads as an explained rule rather than a surprise error.
describe('LetterScreen — outcome-not-yet-decided gate (closes H10)', () => {
  const outcomeProps = { ...baseProps, activeLetter: 'outcome', letterIsApproved: true, letterApproval: { by: 'Jo', at: new Date().toISOString() } };

  it('blocks every issue/send action when activeLetter is "outcome" and no outcome has been recorded, even though the letter is approved', () => {
    render(<LetterScreen {...outcomeProps} outcomeRecorded={false} onSendFromCompass={()=>{}} onSendForAcknowledgement={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send via Gmail' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send via Outlook' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send from Compass' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send for acknowledgement' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy text' })).toBeDisabled();
    expect(screen.getByText(/no recorded outcome yet.*preparatory draft only/i)).toBeInTheDocument();
  });

  it('still allows Save to case — an internal draft save is not "issuing" the letter externally', () => {
    render(<LetterScreen {...outcomeProps} outcomeRecorded={false} />);
    expect(screen.getByRole('button', { name: 'Save to case' })).toBeEnabled();
  });

  it('allows every action once a real outcome is recorded (and the letter is approved)', () => {
    render(<LetterScreen {...outcomeProps} outcomeRecorded={true} onSendFromCompass={()=>{}} onSendForAcknowledgement={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send from Compass' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send for acknowledgement' })).toBeEnabled();
    expect(screen.queryByText(/no recorded outcome yet/i)).not.toBeInTheDocument();
  });

  it('does not apply this gate to any other letter type — an invite letter is unaffected by outcomeRecorded', () => {
    render(<LetterScreen {...baseProps} activeLetter="invite" letterIsApproved={true} letterApproval={{ by: 'Jo', at: new Date().toISOString() }} outcomeRecorded={false} />);
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
    expect(screen.queryByText(/no recorded outcome yet/i)).not.toBeInTheDocument();
  });

  it('defaults outcomeRecorded to true when the prop is omitted, so existing callers/tests are unaffected', () => {
    render(<LetterScreen {...outcomeProps} onSendFromCompass={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Send from Compass' })).toBeEnabled();
  });
});

// Phase 6.5 hardening (Batch 13) — the letter-editing textarea had no
// accessible name at all.
describe('LetterScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the letter text field while editing', () => {
    render(<LetterScreen {...baseProps} editingLetter={true} />);
    expect(screen.getByLabelText('Letter text')).toBeInTheDocument();
  });
});

// UAT Product Hierarchy pass, Part 3 — this screen was the brief's own bad
// example: no page title, no case identity, only a buried "← Back". Now a
// PageHeader names the letter type and the employee, and a single
// "← Back to case" action replaces the old bottom-row duplicate.
describe('LetterScreen — page identity (UAT Product Hierarchy pass, Part 3)', () => {
  it('shows the letter type as the page title and the employee as context', () => {
    render(<LetterScreen {...baseProps} activeLetter="outcome" />);
    expect(screen.getByRole('heading', { name: 'Outcome letter' })).toBeInTheDocument();
    expect(screen.getByText(/Sarah Jones/)).toBeInTheDocument();
  });

  it('provides one "Back to case" action, not a second buried one at the bottom', () => {
    render(<LetterScreen {...baseProps} activeLetter="invite" />);
    expect(screen.getByRole('button', { name: '← Back to case' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '← Back' })).not.toBeInTheDocument();
  });

  it('names the letter type and the employee while a draft is generating, and reassures the user they can navigate away', () => {
    const { container } = render(<LetterScreen {...baseProps} activeLetter="appeal" aiProcessing={true} letterOutput="" />);
    expect(container.textContent).toMatch(/Drafting your appeal outcome/i);
    expect(screen.getByText(/For Sarah Jones/)).toBeInTheDocument();
    expect(screen.getByText(/navigate elsewhere/i)).toBeInTheDocument();
  });
});
