import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OccupationalHealthPanel } from '../components/OccupationalHealthPanel.jsx';

function makeCase(overrides={}) {
  return { id: 'c1', ohProcess: null, ohReferralDate: null, ohReportReceivedDate: null, ...overrides };
}

describe('OccupationalHealthPanel (Phase 5, IP22)', () => {
  it('renders every step, with the first one current and actionable when nothing has started', () => {
    render(<OccupationalHealthPanel cs={makeCase()} cases={[makeCase()]} saveCases={()=>{}} stage="occupational_health" />);
    expect(screen.getByText('Concern identified')).toBeInTheDocument();
    expect(screen.getByText('Review date set')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark done' })).toBeInTheDocument();
  });

  it('renders nothing for a closed case with no OH process ever started', () => {
    const { container } = render(<OccupationalHealthPanel cs={makeCase()} cases={[makeCase()]} saveCases={()=>{}} stage="closed" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('still renders a closed case that has an in-progress OH process, so history is never hidden', () => {
    const cs = makeCase({ ohProcess: { currentStep: 'hr_review', history: { concern_identified: '2026-01-01T00:00:00.000Z' } } });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="closed" />);
    expect(screen.getByText('Occupational health process')).toBeInTheDocument();
  });

  it('"Mark done" on the current step advances to the next step and calls saveCases', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    const cs = makeCase();
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={saveCases} stage="occupational_health" />);
    await user.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(saveCases).toHaveBeenCalledTimes(1);
    const [savedCases, changedId] = saveCases.mock.calls[0];
    expect(changedId).toBe('c1');
    expect(savedCases[0].ohProcess.currentStep).toBe('consider_referral');
    expect(savedCases[0].ohProcess.history.consider_referral).toBeTruthy();
  });

  it('checking the consent box then confirming advances to consent and records consentObtained', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    const cs = makeCase({ ohProcess: { currentStep: 'consider_referral', history: {} } });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={saveCases} stage="occupational_health" />);
    const confirmButton = screen.getByRole('button', { name: 'Confirm consent' });
    expect(confirmButton).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Employee has given consent/ }));
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);
    const [savedCases] = saveCases.mock.calls[0];
    expect(savedCases[0].ohProcess.currentStep).toBe('consent');
    expect(savedCases[0].ohProcess.consentObtained).toBe(true);
  });

  it('the "submit" step mirrors into the legacy ohReferralDate field', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    const cs = makeCase({ ohProcess: { currentStep: 'prepare', history: {} } });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={saveCases} stage="occupational_health" />);
    await user.click(screen.getByRole('button', { name: 'Mark done' }));
    const [savedCases] = saveCases.mock.calls[0];
    expect(savedCases[0].ohProcess.currentStep).toBe('submit');
    expect(savedCases[0].ohReferralDate).toBeTruthy();
  });

  it('typing recommendations and saving on the hr_review step advances to recommendations', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    const cs = makeCase({ ohProcess: { currentStep: 'hr_review', history: {} } });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={saveCases} stage="occupational_health" />);
    const saveButton = screen.getByRole('button', { name: 'Save recommendations' });
    expect(saveButton).toBeDisabled();
    await user.type(screen.getByPlaceholderText('What did the OH report recommend?'), 'Phased return over 4 weeks.');
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);
    const [savedCases] = saveCases.mock.calls[0];
    expect(savedCases[0].ohProcess.currentStep).toBe('recommendations');
    expect(savedCases[0].ohProcess.recommendations).toBe('Phased return over 4 weeks.');
  });

  it('confirming a review date on the review_date step saves it without requiring a further step', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    const cs = makeCase({ ohProcess: { currentStep: 'review_date', history: {} } });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={saveCases} stage="occupational_health" />);
    const confirmButton = screen.getByRole('button', { name: 'Confirm review date' });
    expect(confirmButton).toBeDisabled();
    const dateInput = screen.getByDisplayValue('');
    await user.type(dateInput, '2026-03-01');
    await user.click(screen.getByRole('button', { name: 'Confirm review date' }));
    const [savedCases] = saveCases.mock.calls[0];
    expect(savedCases[0].ohProcess.reviewDate).toBe('2026-03-01');
    expect(savedCases[0].ohProcess.currentStep).toBe('review_date');
  });
});
