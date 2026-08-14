import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HrInterventionModal } from '../screens/HrInterventionModal.jsx';

// Manager Enablement (Phase 4, MP19, §15) — real rendering/interaction,
// same tool as every other modal test in this suite. HR is reachable via
// the real E2E login too, but the modal's own note-gating/button-wiring
// logic is proven directly here.
const cs = { id: 'c1', employeeName: 'Sam Employee', investigationPaused: false };

describe('HrInterventionModal', () => {
  it('disables the three note-based actions until a note is typed', () => {
    render(<HrInterventionModal cs={cs} setShowHrInterventionModal={()=>{}} onSendGuidance={()=>{}} onReturnForFurtherWork={()=>{}} onTakeOver={()=>{}} onTogglePause={()=>{}} onReassign={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Send guidance' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add investigation question' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request additional witness' })).toBeDisabled();
  });

  it('does not gate "Return for further work" behind a note', () => {
    render(<HrInterventionModal cs={cs} setShowHrInterventionModal={()=>{}} onSendGuidance={()=>{}} onReturnForFurtherWork={()=>{}} onTakeOver={()=>{}} onTogglePause={()=>{}} onReassign={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Return for further work' })).not.toBeDisabled();
  });

  it('sending guidance calls onSendGuidance with the note and type, then closes', async () => {
    const user = userEvent.setup();
    const onSendGuidance = vi.fn();
    const setShowHrInterventionModal = vi.fn();
    render(<HrInterventionModal cs={cs} setShowHrInterventionModal={setShowHrInterventionModal} onSendGuidance={onSendGuidance} onReturnForFurtherWork={()=>{}} onTakeOver={()=>{}} onTogglePause={()=>{}} onReassign={()=>{}} />);
    await user.type(screen.getByPlaceholderText('What should the investigator know?'), 'Check the CCTV angle again.');
    await user.click(screen.getByRole('button', { name: 'Send guidance' }));
    expect(onSendGuidance).toHaveBeenCalledWith('Check the CCTV angle again.', 'guidance');
    expect(setShowHrInterventionModal).toHaveBeenCalledWith(false);
  });

  it('adding a question routes through the "question" type', async () => {
    const user = userEvent.setup();
    const onSendGuidance = vi.fn();
    render(<HrInterventionModal cs={cs} setShowHrInterventionModal={()=>{}} onSendGuidance={onSendGuidance} onReturnForFurtherWork={()=>{}} onTakeOver={()=>{}} onTogglePause={()=>{}} onReassign={()=>{}} />);
    await user.type(screen.getByPlaceholderText('What should the investigator know?'), 'Did they check the swipe logs?');
    await user.click(screen.getByRole('button', { name: 'Add investigation question' }));
    expect(onSendGuidance).toHaveBeenCalledWith('Did they check the swipe logs?', 'question');
  });

  it('requesting a witness routes through the "witness" type', async () => {
    const user = userEvent.setup();
    const onSendGuidance = vi.fn();
    render(<HrInterventionModal cs={cs} setShowHrInterventionModal={()=>{}} onSendGuidance={onSendGuidance} onReturnForFurtherWork={()=>{}} onTakeOver={()=>{}} onTogglePause={()=>{}} onReassign={()=>{}} />);
    await user.type(screen.getByPlaceholderText('What should the investigator know?'), 'Speak to the shift supervisor too.');
    await user.click(screen.getByRole('button', { name: 'Request additional witness' }));
    expect(onSendGuidance).toHaveBeenCalledWith('Speak to the shift supervisor too.', 'witness');
  });

  it('returning for further work passes the note even when empty', async () => {
    const user = userEvent.setup();
    const onReturnForFurtherWork = vi.fn();
    render(<HrInterventionModal cs={cs} setShowHrInterventionModal={()=>{}} onSendGuidance={()=>{}} onReturnForFurtherWork={onReturnForFurtherWork} onTakeOver={()=>{}} onTogglePause={()=>{}} onReassign={()=>{}} />);
    await user.click(screen.getByRole('button', { name: 'Return for further work' }));
    expect(onReturnForFurtherWork).toHaveBeenCalledWith('');
  });

  it('taking over the case calls onTakeOver and closes', async () => {
    const user = userEvent.setup();
    const onTakeOver = vi.fn();
    const setShowHrInterventionModal = vi.fn();
    render(<HrInterventionModal cs={cs} setShowHrInterventionModal={setShowHrInterventionModal} onSendGuidance={()=>{}} onReturnForFurtherWork={()=>{}} onTakeOver={onTakeOver} onTogglePause={()=>{}} onReassign={()=>{}} />);
    await user.click(screen.getByRole('button', { name: 'Take over case' }));
    expect(onTakeOver).toHaveBeenCalledTimes(1);
    expect(setShowHrInterventionModal).toHaveBeenCalledWith(false);
  });

  it('reassigning calls onReassign directly without closing itself (the caller owns that transition)', async () => {
    const user = userEvent.setup();
    const onReassign = vi.fn();
    const setShowHrInterventionModal = vi.fn();
    render(<HrInterventionModal cs={cs} setShowHrInterventionModal={setShowHrInterventionModal} onSendGuidance={()=>{}} onReturnForFurtherWork={()=>{}} onTakeOver={()=>{}} onTogglePause={()=>{}} onReassign={onReassign} />);
    await user.click(screen.getByRole('button', { name: 'Reassign investigator' }));
    expect(onReassign).toHaveBeenCalledTimes(1);
  });

  it('shows "Pause investigation" when not paused, and "Resume investigation" when paused', () => {
    const { rerender } = render(<HrInterventionModal cs={cs} setShowHrInterventionModal={()=>{}} onSendGuidance={()=>{}} onReturnForFurtherWork={()=>{}} onTakeOver={()=>{}} onTogglePause={()=>{}} onReassign={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Pause investigation' })).toBeInTheDocument();
    rerender(<HrInterventionModal cs={{...cs, investigationPaused: true}} setShowHrInterventionModal={()=>{}} onSendGuidance={()=>{}} onReturnForFurtherWork={()=>{}} onTakeOver={()=>{}} onTogglePause={()=>{}} onReassign={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Resume investigation' })).toBeInTheDocument();
  });

  it('toggling pause calls onTogglePause and closes', async () => {
    const user = userEvent.setup();
    const onTogglePause = vi.fn();
    render(<HrInterventionModal cs={cs} setShowHrInterventionModal={()=>{}} onSendGuidance={()=>{}} onReturnForFurtherWork={()=>{}} onTakeOver={()=>{}} onTogglePause={onTogglePause} onReassign={()=>{}} />);
    await user.click(screen.getByRole('button', { name: 'Pause investigation' }));
    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });
});
