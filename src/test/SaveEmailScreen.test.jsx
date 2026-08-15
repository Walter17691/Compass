import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SaveEmailScreen } from '../screens/SaveEmailScreen.jsx';

const cases = [{ id: 'c1', employeeName: 'Sarah Jones', caseType: 'misconduct' }];

// Integrations & Workflow Automation (Phase 5, IP9) — extractEmailDetails
// itself makes a real Claude call, so (like every other AI-extraction
// flow in this app) it's not exercised end-to-end here; these tests pass
// a synthetic `extraction` object directly to verify the deterministic
// parts IP9 actually changed: confidence-gated case pre-selection and
// the richer field read-out.
describe('SaveEmailScreen (Phase 5, IP9)', () => {
  it('pre-selects the suggested case on a high-confidence match', () => {
    render(<SaveEmailScreen cases={cases} extraction={{ employeeName: 'Sarah Jones', matchedCaseId: 'c1', matchConfidence: 'high' }} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} />);
    expect(screen.getByRole('combobox')).toHaveValue('c1');
    expect(screen.getByRole('button', { name: 'Save to this case' })).toBeEnabled();
  });

  it('does not pre-select on a medium-confidence match, and flags it for confirmation', () => {
    render(<SaveEmailScreen cases={cases} extraction={{ employeeName: 'Sarah', matchedCaseId: 'c1', matchConfidence: 'medium' }} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} />);
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByText(/please confirm — not an exact name match/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save to this case' })).toBeDisabled();
  });

  it('renders recipients, mentioned employees, case references, dates and attachments when present', () => {
    render(<SaveEmailScreen cases={cases} extraction={{
      sender: 'manager@company.com', recipients: ['hr@company.com'], employeeName: 'Sarah Jones',
      employeesMentioned: ['James Smith'], caseReferences: ['the grievance we discussed'],
      datesMentioned: ['12/08/2026'], attachmentsMentioned: ['rota'], matchConfidence: 'none',
    }} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} />);
    expect(screen.getByText('hr@company.com')).toBeInTheDocument();
    expect(screen.getByText('James Smith')).toBeInTheDocument();
    expect(screen.getByText('the grievance we discussed')).toBeInTheDocument();
    expect(screen.getByText('12/08/2026')).toBeInTheDocument();
    expect(screen.getByText('rota')).toBeInTheDocument();
  });

  it('renders the "worth reviewing" section only when there is something to show', () => {
    const { rerender } = render(<SaveEmailScreen cases={cases} extraction={{ employeeName: 'Sarah Jones', matchConfidence: 'none' }} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} />);
    expect(screen.queryByText('Worth reviewing once filed')).not.toBeInTheDocument();

    rerender(<SaveEmailScreen cases={cases} extraction={{ employeeName: 'Sarah Jones', matchConfidence: 'none', potentialDeadlines: ['Respond by Friday'] }} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} />);
    expect(screen.getByText('Worth reviewing once filed')).toBeInTheDocument();
    expect(screen.getByText('Deadline: Respond by Friday')).toBeInTheDocument();
  });

  it('calls onSave with the selected case id', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SaveEmailScreen cases={cases} extraction={{ employeeName: 'Sarah Jones', matchedCaseId: 'c1', matchConfidence: 'high' }} onSave={onSave} onClear={()=>{}} onExtract={()=>{}} />);
    await user.click(screen.getByRole('button', { name: 'Save to this case' }));
    expect(onSave).toHaveBeenCalledWith('c1');
  });
});

describe('SaveEmailScreen — Create New Concern / Ignore (Phase 5, IP10)', () => {
  it('renders Create New Concern and Ignore alongside Save to this case, once extraction has run', () => {
    render(<SaveEmailScreen cases={cases} extraction={{ employeeName: 'Sarah Jones', matchConfidence: 'none' }} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} onCreateConcern={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Save to this case' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create New Concern' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignore' })).toBeInTheDocument();
  });

  it('calls onCreateConcern when clicked', async () => {
    const user = userEvent.setup();
    const onCreateConcern = vi.fn();
    render(<SaveEmailScreen cases={cases} extraction={{ employeeName: 'Sarah Jones', matchConfidence: 'none' }} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} onCreateConcern={onCreateConcern} />);
    await user.click(screen.getByRole('button', { name: 'Create New Concern' }));
    expect(onCreateConcern).toHaveBeenCalledTimes(1);
  });

  it('omits the Create New Concern button when no handler is given', () => {
    render(<SaveEmailScreen cases={cases} extraction={{ employeeName: 'Sarah Jones', matchConfidence: 'none' }} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} />);
    expect(screen.queryByRole('button', { name: 'Create New Concern' })).not.toBeInTheDocument();
  });

  it('clears the extraction when Ignore is clicked', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<SaveEmailScreen cases={cases} extraction={{ employeeName: 'Sarah Jones', matchConfidence: 'none' }} onSave={()=>{}} onClear={onClear} onExtract={()=>{}} />);
    await user.click(screen.getByRole('button', { name: 'Ignore' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('SaveEmailScreen — reply capture (Phase 5, IP14)', () => {
  const replyMatch = { caseId: 'c1', name: 'Sent: Witness invitation', subject: 'Witness invitation - Sarah Jones', recipient: 'sarah@company.com', rawText: 'Reply text' };

  it('shows the reply-detected banner naming the matched case and letter, instead of the normal extraction flow', () => {
    render(<SaveEmailScreen cases={cases} replyMatch={replyMatch} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} />);
    expect(screen.getByText('Reply detected')).toBeInTheDocument();
    expect(screen.getByText(/Sarah Jones/)).toBeInTheDocument();
    expect(screen.getByText(/Witness invitation/)).toBeInTheDocument();
    expect(screen.queryByText('Paste the email')).not.toBeInTheDocument();
  });

  it('renders all four actions and calls the right handler for each', async () => {
    const user = userEvent.setup();
    const onSaveReplyToCase = vi.fn();
    const onAnalyseReply = vi.fn();
    const onOpenReplyCaseMeetings = vi.fn();
    const onCreateReplyAction = vi.fn();
    const onClearReplyMatch = vi.fn();
    render(<SaveEmailScreen cases={cases} replyMatch={replyMatch} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}}
      onSaveReplyToCase={onSaveReplyToCase} onAnalyseReply={onAnalyseReply} onOpenReplyCaseMeetings={onOpenReplyCaseMeetings}
      onCreateReplyAction={onCreateReplyAction} onClearReplyMatch={onClearReplyMatch} />);

    await user.click(screen.getByRole('button', { name: 'Add to Case' }));
    expect(onSaveReplyToCase).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Analyse Response' }));
    expect(onAnalyseReply).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Update Meeting' }));
    expect(onOpenReplyCaseMeetings).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Create Action' }));
    expect(onCreateReplyAction).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Ignore' }));
    expect(onClearReplyMatch).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state while analysing, and the result once it lands', () => {
    const { rerender } = render(<SaveEmailScreen cases={cases} replyMatch={replyMatch} replyAnalysisLoading onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} onAnalyseReply={()=>{}} />);
    expect(screen.getByText('Analysing the reply…')).toBeInTheDocument();

    rerender(<SaveEmailScreen cases={cases} replyMatch={replyMatch} replyAnalysis={{ isPostponementRequest: true, isNewIssue: false, summary: 'Asks to move the meeting.' }} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} onAnalyseReply={()=>{}} />);
    expect(screen.getByText('Asks to move the meeting.')).toBeInTheDocument();
    expect(screen.getByText(/Needs HR review/)).toBeInTheDocument();
    expect(screen.getByText(/postponement requested/)).toBeInTheDocument();
  });

  it('does not flag "Needs HR review" when neither flag is set', () => {
    render(<SaveEmailScreen cases={cases} replyMatch={replyMatch} replyAnalysis={{ isPostponementRequest: false, isNewIssue: false, summary: 'Just confirms receipt.' }} onSave={()=>{}} onClear={()=>{}} onExtract={()=>{}} onAnalyseReply={()=>{}} />);
    expect(screen.getByText('Just confirms receipt.')).toBeInTheDocument();
    expect(screen.queryByText(/Needs HR review/)).not.toBeInTheDocument();
  });
});
