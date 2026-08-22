import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EscalateToHrModal } from '../screens/EscalateToHrModal.jsx';

// Manager Enablement (Phase 4, MP12, §13) — real rendering/interaction,
// same tool as every other modal test in this suite. HR is E2E-reachable
// too, but this modal's own note-collection/cancel logic is proven
// directly rather than re-derived from a slower full-flow E2E test.
describe('EscalateToHrModal', () => {
  it('shows the case name in the description when given', () => {
    render(<EscalateToHrModal caseName="Sam Employee" setShowEscalateModal={() => {}} escalateToHr={() => {}} />);
    expect(screen.getByText(/About Sam Employee\./)).toBeInTheDocument();
  });

  it('sends the typed note to escalateToHr and closes the modal', async () => {
    const user = userEvent.setup();
    const escalateToHr = vi.fn();
    const setShowEscalateModal = vi.fn();
    render(<EscalateToHrModal caseName="Sam Employee" setShowEscalateModal={setShowEscalateModal} escalateToHr={escalateToHr} />);

    await user.type(screen.getByPlaceholderText(/The employee is disputing/), 'Not sure how to handle the disputed evidence.');
    await user.click(screen.getByRole('button', { name: 'Send to HR' }));

    expect(escalateToHr).toHaveBeenCalledWith('Not sure how to handle the disputed evidence.');
    expect(setShowEscalateModal).toHaveBeenCalledWith(false);
  });

  it('allows sending with no note at all', async () => {
    const user = userEvent.setup();
    const escalateToHr = vi.fn();
    render(<EscalateToHrModal caseName="Sam Employee" setShowEscalateModal={() => {}} escalateToHr={escalateToHr} />);
    await user.click(screen.getByRole('button', { name: 'Send to HR' }));
    expect(escalateToHr).toHaveBeenCalledWith('');
  });

  it('cancelling closes without calling escalateToHr', async () => {
    const user = userEvent.setup();
    const escalateToHr = vi.fn();
    const setShowEscalateModal = vi.fn();
    render(<EscalateToHrModal caseName="Sam Employee" setShowEscalateModal={setShowEscalateModal} escalateToHr={escalateToHr} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(escalateToHr).not.toHaveBeenCalled();
    expect(setShowEscalateModal).toHaveBeenCalledWith(false);
  });

  // Phase 6.5 hardening (Batch 13) — the note field had a visual label
  // with no htmlFor/id association.
  it('labels the note field', () => {
    render(<EscalateToHrModal caseName="Sam Employee" setShowEscalateModal={() => {}} escalateToHr={() => {}} />);
    expect(screen.getByLabelText(/What do you need help with/)).toBeInTheDocument();
  });
});
