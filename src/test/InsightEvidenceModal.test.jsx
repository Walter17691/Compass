import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InsightEvidenceModal } from '../components/InsightEvidenceModal.jsx';

// Organisational ER Intelligence (Phase 6, OP17, §23)
describe('InsightEvidenceModal', () => {
  it('renders the title, metrics, period, and comparison period', () => {
    render(
      <InsightEvidenceModal
        title="Grievance cases increased 30%"
        metrics={[{ label: 'Current count', value: 13 }, { label: 'Previous count', value: 10 }]}
        period="last 90 days"
        comparisonPeriod="previous 90 days"
        onClose={()=>{}}
      />
    );
    expect(screen.getByText('Grievance cases increased 30%')).toBeInTheDocument();
    expect(screen.getByText('Current count')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText(/last 90 days/)).toBeInTheDocument();
    expect(screen.getByText(/previous 90 days/)).toBeInTheDocument();
  });

  it('renders themes used as chips', () => {
    render(<InsightEvidenceModal title="X" themesUsed={['Rota changes', 'Bullying']} onClose={()=>{}}/>);
    expect(screen.getByText('Rota changes')).toBeInTheDocument();
    expect(screen.getByText('Bullying')).toBeInTheDocument();
  });

  it('renders a confidence/limitation note when provided', () => {
    render(<InsightEvidenceModal title="X" confidenceNote="Based on a small sample — interpret cautiously." onClose={()=>{}}/>);
    expect(screen.getByText('Based on a small sample — interpret cautiously.')).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<InsightEvidenceModal title="X" onClose={onClose}/>);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape once focus is inside the dialog', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<InsightEvidenceModal title="X" onClose={onClose}/>);
    screen.getByRole('button', { name: 'Close' }).focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('omits sections with no data', () => {
    render(<InsightEvidenceModal title="X" onClose={()=>{}}/>);
    expect(screen.queryByText('Themes used')).not.toBeInTheDocument();
  });
});
