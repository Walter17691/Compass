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

describe('OccupationalHealthPanel — OH report intelligence (Phase 5, IP23)', () => {
  const analysableEvidence = { name: 'OH Report.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,AAAA', size: 1000 };

  it('omits the "let Compass suggest findings" section when the case has no analysable evidence', () => {
    const cs = makeCase({ ohProcess: { currentStep: 'hr_review', history: {} }, evidence: [] });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health" onAnalyseOhReport={()=>{}} onAcceptOhFinding={()=>{}} onDismissOhFinding={()=>{}} />);
    expect(screen.queryByText(/let Compass suggest findings/)).not.toBeInTheDocument();
  });

  it('lists analysable evidence and calls onAnalyseOhReport with the selected index', async () => {
    const user = userEvent.setup();
    const onAnalyseOhReport = vi.fn();
    const cs = makeCase({ ohProcess: { currentStep: 'hr_review', history: {} }, evidence: [analysableEvidence] });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health" onAnalyseOhReport={onAnalyseOhReport} onAcceptOhFinding={()=>{}} onDismissOhFinding={()=>{}} />);
    const analyseButton = screen.getByRole('button', { name: 'Analyse OH report' });
    expect(analyseButton).toBeDisabled();
    await user.selectOptions(screen.getByText('Select the OH report...').closest('select'), '0');
    expect(analyseButton).toBeEnabled();
    await user.click(analyseButton);
    expect(onAnalyseOhReport).toHaveBeenCalledWith(cs, 0);
  });

  it('shows an "Analysing..." disabled state while loading', async () => {
    const user = userEvent.setup();
    const cs = makeCase({ ohProcess: { currentStep: 'hr_review', history: {} }, evidence: [analysableEvidence] });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health" onAnalyseOhReport={()=>{}} onAcceptOhFinding={()=>{}} onDismissOhFinding={()=>{}} ohReportAnalysisLoading={{ 'c1::0': true }} />);
    await user.selectOptions(screen.getByText('Select the OH report...').closest('select'), '0');
    expect(screen.getByRole('button', { name: 'Analysing...' })).toBeDisabled();
  });

  it('renders open findings for the selected evidence and accepting/dismissing calls the right handler with (cs, index, finding)', async () => {
    const user = userEvent.setup();
    const onAcceptOhFinding = vi.fn();
    const onDismissOhFinding = vi.fn();
    const cs = makeCase({ ohProcess: { currentStep: 'hr_review', history: {} }, evidence: [analysableEvidence] });
    const finding = { id: 'oh_finding_1', type: 'adjustment', description: 'Reduced hours for 4 weeks', reasoning: 'Report recommends it', status: 'open' };
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health"
      onAnalyseOhReport={()=>{}} onAcceptOhFinding={onAcceptOhFinding} onDismissOhFinding={onDismissOhFinding}
      ohReportFindings={{ 'c1::0': [finding] }} />);
    await user.selectOptions(screen.getByText('Select the OH report...').closest('select'), '0');
    expect(screen.getByText('Adjustment')).toBeInTheDocument();
    expect(screen.getByText('Reduced hours for 4 weeks')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAcceptOhFinding).toHaveBeenCalledWith(cs, 0, finding);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismissOhFinding).toHaveBeenCalledWith(cs, 0, finding);
  });

  it('only shows findings scoped to the currently selected evidence item', async () => {
    const user = userEvent.setup();
    const secondEvidence = { name: 'Other Report.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,BBBB', size: 1000 };
    const cs = makeCase({ ohProcess: { currentStep: 'hr_review', history: {} }, evidence: [analysableEvidence, secondEvidence] });
    const finding = { id: 'oh_finding_1', type: 'restriction', description: 'No heavy lifting', status: 'open' };
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health"
      onAnalyseOhReport={()=>{}} onAcceptOhFinding={()=>{}} onDismissOhFinding={()=>{}}
      ohReportFindings={{ 'c1::0': [finding] }} />);
    await user.selectOptions(screen.getByText('Select the OH report...').closest('select'), '1');
    expect(screen.queryByText('No heavy lifting')).not.toBeInTheDocument();
  });
});

describe('OccupationalHealthPanel — due-date preview on task-shaped findings (Phase 5, IP24)', () => {
  const analysableEvidence = { name: 'OH Report.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,AAAA', size: 1000 };

  it('shows a parsed due date next to an adjustment/restriction/further_information finding with a commitment', async () => {
    const user = userEvent.setup();
    const cs = makeCase({ ohProcess: { currentStep: 'hr_review', history: {} }, evidence: [analysableEvidence] });
    const finding = { id: 'f1', type: 'adjustment', description: 'Provide a standing desk within 2 weeks', status: 'open' };
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health"
      onAnalyseOhReport={()=>{}} onAcceptOhFinding={()=>{}} onDismissOhFinding={()=>{}}
      ohReportFindings={{ 'c1::0': [finding] }} />);
    await user.selectOptions(screen.getByText('Select the OH report...').closest('select'), '0');
    expect(screen.getByText(/^Due \d{4}-\d{2}-\d{2}$/)).toBeInTheDocument();
  });

  it('omits the due-date preview when the description has no parseable commitment', async () => {
    const user = userEvent.setup();
    const cs = makeCase({ ohProcess: { currentStep: 'hr_review', history: {} }, evidence: [analysableEvidence] });
    const finding = { id: 'f1', type: 'restriction', description: 'No heavy lifting', status: 'open' };
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health"
      onAnalyseOhReport={()=>{}} onAcceptOhFinding={()=>{}} onDismissOhFinding={()=>{}}
      ohReportFindings={{ 'c1::0': [finding] }} />);
    await user.selectOptions(screen.getByText('Select the OH report...').closest('select'), '0');
    expect(screen.queryByText(/^Due \d{4}-\d{2}-\d{2}$/)).not.toBeInTheDocument();
  });

  it('never shows a due-date preview for a review_date finding, which has no description', async () => {
    const user = userEvent.setup();
    const cs = makeCase({ ohProcess: { currentStep: 'hr_review', history: {} }, evidence: [analysableEvidence] });
    const finding = { id: 'f1', type: 'review_date', date: '2026-10-01', status: 'open' };
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health"
      onAnalyseOhReport={()=>{}} onAcceptOhFinding={()=>{}} onDismissOhFinding={()=>{}}
      ohReportFindings={{ 'c1::0': [finding] }} />);
    await user.selectOptions(screen.getByText('Select the OH report...').closest('select'), '0');
    expect(screen.queryByText(/^Due \d{4}-\d{2}-\d{2}$/)).not.toBeInTheDocument();
  });
});

describe('OccupationalHealthPanel — send agreed adjustments for signature (Phase 5, IP27)', () => {
  it('offers the send-for-signature option only once recommendations have been recorded', () => {
    const cs = makeCase({ ohProcess: { currentStep: 'adjustments_considered', history: {}, recommendations: '' } });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health" onSendForSignature={()=>{}} />);
    expect(screen.queryByText(/send the agreed adjustments/)).not.toBeInTheDocument();
  });

  it('shows the send-for-signature form once recommendations exist and a handler is given', () => {
    const cs = makeCase({ ohProcess: { currentStep: 'adjustments_considered', history: {}, recommendations: 'Standing desk for 4 weeks.' } });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health" onSendForSignature={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Send for signature' })).toBeDisabled();
  });

  it('calls onSendForSignature with the recommendations text and acknowledgement (not signature) once an email is entered', async () => {
    const user = userEvent.setup();
    const onSendForSignature = vi.fn().mockResolvedValue({ success: true });
    const cs = makeCase({ id: 'c1', employeeName: 'Sarah Jones', manager: 'Jo Smith', ohProcess: { currentStep: 'adjustments_considered', history: {}, recommendations: 'Standing desk for 4 weeks.' } });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health" onSendForSignature={onSendForSignature} />);
    await user.type(screen.getByPlaceholderText('employee@company.com'), 'sarah@example.com');
    await user.click(screen.getByRole('button', { name: 'Send for signature' }));
    expect(onSendForSignature).toHaveBeenCalledWith(expect.objectContaining({
      document: 'Standing desk for 4 weeks.',
      employeeEmail: 'sarah@example.com',
      employeeName: 'Sarah Jones',
      managerName: 'Jo Smith',
      documentType: 'adjustment_record',
      requiresSignature: false,
    }));
  });

  it('does not render the option at all when adjustments_considered is not the current step', () => {
    const cs = makeCase({ ohProcess: { currentStep: 'hr_review', history: {}, recommendations: 'Standing desk for 4 weeks.' } });
    render(<OccupationalHealthPanel cs={cs} cases={[cs]} saveCases={()=>{}} stage="occupational_health" onSendForSignature={()=>{}} />);
    expect(screen.queryByText(/send the agreed adjustments/)).not.toBeInTheDocument();
  });
});
