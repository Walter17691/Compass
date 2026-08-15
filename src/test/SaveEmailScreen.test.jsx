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
