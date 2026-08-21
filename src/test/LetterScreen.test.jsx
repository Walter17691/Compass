import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LetterScreen } from '../screens/LetterScreen.jsx';

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
