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
