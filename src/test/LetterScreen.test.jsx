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
