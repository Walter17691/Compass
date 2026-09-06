import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HrReviewIntelligencePanel } from '../components/HrReviewIntelligencePanel.jsx';

const NOW_ISO = '2026-08-01T00:00:00.000Z';
function pad(n) {
  return Array.from({ length: n }, (_, i) => ({ case_id: `pad${i}`, step: 'inv_report', status: 'approved', requested_at: NOW_ISO }));
}

// Insights Phase 5 (Process Quality + HR Review Intelligence)
describe('HrReviewIntelligencePanel', () => {
  it('shows the correct empty state when nothing is pending', () => {
    render(<HrReviewIntelligencePanel hrReviewRequests={[]}/>);
    expect(screen.getByText('No cases are currently awaiting HR review of their investigation.')).toBeInTheDocument();
  });

  it('uses singular wording for exactly one pending case', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-07-26T00:00:00.000Z' }];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows}/>);
    expect(screen.getByText('1 case is awaiting HR review of its investigation.')).toBeInTheDocument();
  });

  it('uses plural wording for multiple pending cases', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-07-26T00:00:00.000Z' },
      { case_id: 'c2', step: 'inv_report', status: 'pending', requested_at: '2026-07-28T00:00:00.000Z' },
    ];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows}/>);
    expect(screen.getByText('2 cases are awaiting HR review of their investigation.')).toBeInTheDocument();
  });

  it('shows oldest-waiting age only when a valid requested_at exists', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: 'not-a-date' }];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows}/>);
    expect(screen.queryByText(/Oldest waiting/)).not.toBeInTheDocument();
  });

  it('calls onViewCases with the pending caseIds', async () => {
    const user = userEvent.setup();
    const onViewCases = vi.fn();
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-07-26T00:00:00.000Z' }];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows} onViewCases={onViewCases}/>);
    await user.click(screen.getByRole('button', { name: 'View cases →' }));
    expect(onViewCases).toHaveBeenCalledWith({ caseIds: ['c1'] });
  });

  it('never shows a pending "View cases" button when onViewCases is not provided', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-07-26T00:00:00.000Z' }];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows}/>);
    expect(screen.queryByRole('button', { name: 'View cases →' })).not.toBeInTheDocument();
  });

  it('a single pending case still gets a drill-down (no 3-case privacy floor on the operational queue)', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-07-26T00:00:00.000Z' }];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows} onViewCases={vi.fn()}/>);
    expect(screen.getByRole('button', { name: 'View cases →' })).toBeInTheDocument();
  });

  it('shows a DataQualityCaveat when there are not enough resolved reviews for a meaningful first-pass rate', () => {
    render(<HrReviewIntelligencePanel hrReviewRequests={[]}/>);
    expect(screen.getByText('Limited data')).toBeInTheDocument();
  });

  it('shows the first-pass rate once the sample floor is met, with no unsupported quality language', () => {
    render(<HrReviewIntelligencePanel hrReviewRequests={pad(3)}/>);
    expect(screen.getByText('100% of investigation submissions were approved without being returned for further work.')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 reviewed cases')).toBeInTheDocument();
    expect(screen.queryByText(/quality score|manager quality|performance/i)).not.toBeInTheDocument();
  });

  it('shows a "View cases returned for further work" drill-down only when rework cases exist', async () => {
    const user = userEvent.setup();
    const onViewCases = vi.fn();
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: NOW_ISO },
      { case_id: 'c2', step: 'inv_report', status: 'returned', requested_at: NOW_ISO },
      { case_id: 'c3', step: 'inv_report', status: 'returned', requested_at: NOW_ISO },
    ];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows} onViewCases={onViewCases}/>);
    await user.click(screen.getByRole('button', { name: 'View cases returned for further work →' }));
    expect(onViewCases).toHaveBeenCalledWith({ caseIds: expect.arrayContaining(['c2', 'c3']) });
  });

  it('does not show the rework drill-down when nothing was returned', () => {
    render(<HrReviewIntelligencePanel hrReviewRequests={pad(3)} onViewCases={vi.fn()}/>);
    expect(screen.queryByRole('button', { name: 'View cases returned for further work →' })).not.toBeInTheDocument();
  });

  it('never renders review comments or record_snapshot content', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: NOW_ISO, comments: 'SUPER SECRET REASON', record_snapshot: 'SUPER SECRET SNAPSHOT' }];
    render(<HrReviewIntelligencePanel hrReviewRequests={[...rows, ...pad(2)]} onViewCases={vi.fn()}/>);
    expect(screen.queryByText(/SUPER SECRET/)).not.toBeInTheDocument();
  });
});

// Insights Phase 6 (Actionability) — Create Action for the pending queue
// and the rework signal, each independently gated by adding real value
// (a nonzero count/rework list), never rendered unconditionally.
describe('HrReviewIntelligencePanel — Create Action (Insights Phase 6)', () => {
  it('shows a pending-queue Create action when cases are awaiting review', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-07-26T00:00:00.000Z' }];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows} createCaseTask={vi.fn()}/>);
    expect(screen.getAllByRole('button', { name: 'Create action' }).length).toBeGreaterThanOrEqual(1);
  });

  it('does not show a pending-queue Create action when the queue is empty (zero-count suppression)', () => {
    render(<HrReviewIntelligencePanel hrReviewRequests={[]} createCaseTask={vi.fn()}/>);
    expect(screen.queryByRole('button', { name: 'Create action' })).not.toBeInTheDocument();
  });

  it('never shows Create action when createCaseTask is not provided, even with a real pending queue', () => {
    const rows = [{ case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-07-26T00:00:00.000Z' }];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows}/>);
    expect(screen.queryByRole('button', { name: 'Create action' })).not.toBeInTheDocument();
  });

  it('creates a pending-queue action with a factual, aggregate insightRef', async () => {
    const user = userEvent.setup();
    const createCaseTask = vi.fn();
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'pending', requested_at: '2026-07-26T00:00:00.000Z' },
      { case_id: 'c2', step: 'inv_report', status: 'pending', requested_at: '2026-07-28T00:00:00.000Z' },
    ];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows} createCaseTask={createCaseTask}/>);
    await user.click(screen.getAllByRole('button', { name: 'Create action' })[0]);
    await user.type(screen.getByPlaceholderText('Action to take…'), 'Review pending investigation submissions');
    await user.click(screen.getByRole('button', { name: 'Save action' }));
    const [caseId, fields] = createCaseTask.mock.calls[0];
    expect(caseId).toBeNull();
    expect(fields.insightRef).toBe('HR review: 2 cases awaiting investigation review');
    expect(fields.insightRef).not.toContain('c1');
    expect(fields.insightRef).not.toContain('c2');
  });

  it('shows a rework Create action only when cases were actually returned for further work, with the exact factual insightRef', async () => {
    const user = userEvent.setup();
    const createCaseTask = vi.fn();
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'approved', requested_at: NOW_ISO },
      { case_id: 'c2', step: 'inv_report', status: 'returned', requested_at: NOW_ISO },
      { case_id: 'c3', step: 'inv_report', status: 'returned', requested_at: NOW_ISO },
    ];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows} createCaseTask={createCaseTask}/>);
    const buttons = screen.getAllByRole('button', { name: 'Create action' });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    await user.click(buttons[buttons.length - 1]); // the rework action is the last Create Action control on the page
    await user.type(screen.getByPlaceholderText('Action to take…'), 'Review recent rework');
    await user.click(screen.getByRole('button', { name: 'Save action' }));
    const [, fields] = createCaseTask.mock.calls[0];
    expect(fields.insightRef).toBe('Investigation submissions returned for further work');
    expect(fields.insightRef).not.toMatch(/poor|weak|performance/i);
  });

  it('does not show a rework Create action when nothing was returned', () => {
    render(<HrReviewIntelligencePanel hrReviewRequests={pad(3)} createCaseTask={vi.fn()}/>);
    // pad(3) is all-approved: only the pending-queue button could ever
    // exist, and the queue itself is empty (all rows are inv_report,
    // not pending) — so no Create Action button should exist at all.
    expect(screen.queryByRole('button', { name: 'Create action' })).not.toBeInTheDocument();
  });

  it('the rework action never exposes review comments or record_snapshot content', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: NOW_ISO, comments: 'SUPER SECRET REASON', record_snapshot: 'SUPER SECRET SNAPSHOT' },
      ...pad(2),
    ];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows} createCaseTask={vi.fn()}/>);
    expect(screen.queryByText(/SUPER SECRET/)).not.toBeInTheDocument();
  });

  it('never labels the rework action as a performance judgement', () => {
    const rows = [
      { case_id: 'c1', step: 'inv_report', status: 'returned', requested_at: NOW_ISO },
      ...pad(2),
    ];
    render(<HrReviewIntelligencePanel hrReviewRequests={rows} createCaseTask={vi.fn()}/>);
    expect(screen.queryByText(/poor investigation|weak manager|performance issue/i)).not.toBeInTheDocument();
  });
});
