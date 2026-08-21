import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutomationSuggestionsPanel } from '../components/AutomationSuggestionsPanel.jsx';

describe('AutomationSuggestionsPanel', () => {
  it('renders nothing when there are no suggestions', () => {
    const { container } = render(<AutomationSuggestionsPanel suggestions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when suggestions is undefined', () => {
    const { container } = render(<AutomationSuggestionsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a label, reason and category for each suggestion', () => {
    render(<AutomationSuggestionsPanel suggestions={[
      { ruleId: 'overdue_task', category: 'task', label: 'Review overdue task', reason: '"Chase witness statement" was due 2026-08-10.' },
      { ruleId: 'process_risk_open', category: 'risk', label: 'Review procedural guardrail flag', reason: 'Notice period too short' },
    ]} />);
    expect(screen.getByText('Suggested for this case')).toBeInTheDocument();
    expect(screen.getByText('Review overdue task')).toBeInTheDocument();
    expect(screen.getByText('"Chase witness statement" was due 2026-08-10.')).toBeInTheDocument();
    expect(screen.getByText('TASK')).toBeInTheDocument();
    expect(screen.getByText('Review procedural guardrail flag')).toBeInTheDocument();
    expect(screen.getByText('RISK')).toBeInTheDocument();
  });
});

// Integrations & Workflow Automation (Phase 5, IP28, §22-23) — Prepare/
// Automate execution wired specifically to unsigned_meeting_record_stale
// (the only rule in AUTOMATABLE_RULE_IDS). A non-automatable rule (e.g.
// overdue_task) must never show a Send reminder button or auto-fire,
// even if an org's config somehow names it.
describe('AutomationSuggestionsPanel — automation levels (Phase 5, IP28)', () => {
  const cs = { id: 'c1', employeeName: 'Sarah Jones' };
  const meeting = { id: 'm1', type: 'Investigation' };
  const suggestion = { ruleId: 'unsigned_meeting_record_stale', category: 'signature', label: 'Chase signature on meeting record', reason: 'Investigation record from 7 days ago is still unsigned.', meetings: [meeting] };

  it('renders no action for a Suggest-level (default) suggestion', () => {
    render(<AutomationSuggestionsPanel suggestions={[suggestion]} automationLevels={{}} cs={cs} onResendReminder={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Compass will send/)).not.toBeInTheDocument();
  });

  it('shows a "Send reminder" button at Prepare level, calling onResendReminder for each meeting when clicked', async () => {
    const user = userEvent.setup();
    const onResendReminder = vi.fn().mockResolvedValue({ success: true });
    render(<AutomationSuggestionsPanel suggestions={[suggestion]} automationLevels={{ unsigned_meeting_record_stale: 'prepare' }} cs={cs} onResendReminder={onResendReminder} />);
    const button = screen.getByRole('button', { name: 'Send reminder' });
    await user.click(button);
    await waitFor(() => expect(onResendReminder).toHaveBeenCalledWith(cs, meeting, { level: 'prepare' }));
  });

  it('auto-fires the reminder once at Automate level, with no button shown', async () => {
    const onResendReminder = vi.fn().mockResolvedValue({ success: true });
    render(<AutomationSuggestionsPanel suggestions={[suggestion]} automationLevels={{ unsigned_meeting_record_stale: 'automate' }} cs={cs} onResendReminder={onResendReminder} />);
    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();
    await waitFor(() => expect(onResendReminder).toHaveBeenCalledWith(cs, meeting, { level: 'automate' }));
    expect(onResendReminder).toHaveBeenCalledTimes(1);
  });

  it('never elevates a non-automatable rule even if the org config names it', () => {
    const nonAutomatable = { ruleId: 'overdue_task', category: 'task', label: 'Review overdue task', reason: 'Something is overdue.', meetings: [meeting] };
    const onResendReminder = vi.fn();
    render(<AutomationSuggestionsPanel suggestions={[nonAutomatable]} automationLevels={{ overdue_task: 'automate' }} cs={cs} onResendReminder={onResendReminder} />);
    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Compass will send/)).not.toBeInTheDocument();
    expect(onResendReminder).not.toHaveBeenCalled();
  });

  it('omits the action entirely when the suggestion has no meetings array (e.g. suggest-only rules)', () => {
    const noMeetings = { ruleId: 'unsigned_meeting_record_stale', category: 'signature', label: 'Chase signature on meeting record', reason: 'x' };
    render(<AutomationSuggestionsPanel suggestions={[noMeetings]} automationLevels={{ unsigned_meeting_record_stale: 'prepare' }} cs={cs} onResendReminder={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();
  });

  // Phase 6.5, Batch 4 — the auto-fire dedup guard used to live in a
  // useRef, which resets to empty on every remount (e.g. switching case
  // tabs and back). Remounting with the exact same suggestion still
  // present in props — genuinely possible in the real app, since
  // reminderSentAt takes a moment to round-trip back through the data
  // layer after the send — used to re-trigger a real duplicate
  // automated reminder to the employee. Uses its own meeting id (m2,
  // not the m1 the earlier tests in this file already fired) since the
  // dedup guard is now intentionally module-scoped, not reset per test.
  it('does not re-fire an automated reminder for the same suggestion across a remount', async () => {
    const remountMeeting = { id: 'm2', type: 'Investigation' };
    const remountSuggestion = { ruleId: 'unsigned_meeting_record_stale', category: 'signature', label: 'Chase signature on meeting record', reason: 'x', meetings: [remountMeeting] };
    const onResendReminder = vi.fn().mockResolvedValue({ success: true });
    const props = { suggestions: [remountSuggestion], automationLevels: { unsigned_meeting_record_stale: 'automate' }, cs, onResendReminder };

    const { unmount } = render(<AutomationSuggestionsPanel {...props} />);
    await waitFor(() => expect(onResendReminder).toHaveBeenCalledTimes(1));
    unmount();

    // Remount with the identical, still-not-yet-updated suggestion —
    // simulates props not having caught up to the send yet.
    render(<AutomationSuggestionsPanel {...props} />);
    await waitFor(() => expect(onResendReminder).toHaveBeenCalledTimes(1));
  });
});
