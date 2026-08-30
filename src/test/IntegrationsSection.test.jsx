import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntegrationsSection } from '../screens/settings/IntegrationsSection.jsx';

// Integrations & Workflow Automation (Phase 5, IP1, §1) — this screen is
// reachable by any org member (same as SaveEmailScreen's own Outlook
// connect button, which has no isHR gate), so it's covered directly here
// alongside real E2E interaction for the two live connections.
describe('IntegrationsSection', () => {
  // Client IA cleanup, §4 — roadmap/unsupported integrations no longer sit
  // in the primary list badged "Requires administrator" (which implied an
  // admin could connect them today — they can't, nothing behind that
  // badge is built). They now live in a visually subordinate "Coming
  // soon" list with no status badge or action.
  it('renders real integrations in the primary list and roadmap ones in a separate, honestly-labelled "Coming soon" list', () => {
    render(<IntegrationsSection />);
    expect(screen.getByText('Microsoft Outlook')).toBeInTheDocument();
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByText('HRIS platforms')).toBeInTheDocument();
    expect(screen.getByText('Occupational Health providers')).toBeInTheDocument();
    expect(screen.getByText('E-signature platforms')).toBeInTheDocument();
    expect(screen.getByText('Cloud document storage')).toBeInTheDocument();
    // Never imply an admin could unlock these — they can't.
    expect(screen.queryByText('Requires administrator')).not.toBeInTheDocument();
    // Real, not-yet-connected rows still offer a genuine Connect action.
    expect(screen.getAllByRole('button', { name: 'Connect' }).length).toBeGreaterThan(0);
  });

  it('shows what Compass actually uses each real integration for', () => {
    render(<IntegrationsSection />);
    expect(screen.getAllByText('Save relevant emails to Compass').length).toBe(2); // Outlook + Gmail
    expect(screen.getAllByText('Sync case deadlines to your calendar').length).toBe(2); // Google + MS365 Calendar
    expect(screen.getAllByText('Daily digest of overdue actions').length).toBe(2); // Slack + Teams
  });

  it('shows Outlook as connected with the mailbox, and offers Disconnect', () => {
    render(<IntegrationsSection mailConnected mailboxEmail="hr@acme.com" />);
    expect(screen.getByText(/hr@acme\.com/)).toBeInTheDocument();
    const outlookRow = screen.getByText('Microsoft Outlook').closest('div').parentElement.parentElement;
    expect(outlookRow).toHaveTextContent('Connected');
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('offers Connect for Outlook when not connected, and calls onConnectMail', async () => {
    const user = userEvent.setup();
    const onConnectMail = vi.fn();
    render(<IntegrationsSection onConnectMail={onConnectMail} />);
    const outlookRow = screen.getByText('Microsoft Outlook').closest('div').parentElement.parentElement;
    await user.click(within(outlookRow).getByRole('button', { name: 'Connect' }));
    expect(onConnectMail).toHaveBeenCalledTimes(1);
  });

  it('shows Gmail as connected with the mailbox, and calls disconnectGmail', async () => {
    const user = userEvent.setup();
    const disconnectGmail = vi.fn();
    render(<IntegrationsSection gmailConnected gmailboxEmail="hr@gmail.com" disconnectGmail={disconnectGmail} />);
    expect(screen.getByText(/hr@gmail\.com/)).toBeInTheDocument();
    const gmailRow = screen.getByText('Gmail').closest('div').parentElement.parentElement;
    expect(gmailRow).toHaveTextContent('Connected');
    await user.click(within(gmailRow).getByRole('button', { name: 'Disconnect' }));
    expect(disconnectGmail).toHaveBeenCalledTimes(1);
  });

  it('offers Connect for Gmail when not connected, and calls connectGmail', async () => {
    const user = userEvent.setup();
    const connectGmail = vi.fn();
    render(<IntegrationsSection connectGmail={connectGmail} />);
    const gmailRow = screen.getByText('Gmail').closest('div').parentElement.parentElement;
    await user.click(within(gmailRow).getByRole('button', { name: 'Connect' }));
    expect(connectGmail).toHaveBeenCalledTimes(1);
  });

  it('shows Google Calendar as connected and calls disconnectGoogleCalendar', async () => {
    const user = userEvent.setup();
    const disconnectGoogleCalendar = vi.fn();
    render(<IntegrationsSection calendarConnected disconnectGoogleCalendar={disconnectGoogleCalendar} />);
    const calendarRow = screen.getByText('Google Calendar').closest('div').parentElement.parentElement;
    expect(calendarRow).toHaveTextContent('Connected');
    const disconnectButtons = screen.getAllByRole('button', { name: 'Disconnect' });
    await user.click(disconnectButtons[disconnectButtons.length - 1]);
    expect(disconnectGoogleCalendar).toHaveBeenCalledTimes(1);
  });

  it('shows Microsoft 365 Calendar as connected and calls disconnectMs365Calendar', async () => {
    const user = userEvent.setup();
    const disconnectMs365Calendar = vi.fn();
    render(<IntegrationsSection ms365CalendarConnected disconnectMs365Calendar={disconnectMs365Calendar} />);
    const ms365Row = screen.getByText('Microsoft 365 Calendar').closest('div').parentElement.parentElement;
    expect(ms365Row).toHaveTextContent('Connected');
    await user.click(within(ms365Row).getByRole('button', { name: 'Disconnect' }));
    expect(disconnectMs365Calendar).toHaveBeenCalledTimes(1);
  });

  it('offers Connect for Microsoft 365 Calendar when not connected, and calls connectMs365Calendar', async () => {
    const user = userEvent.setup();
    const connectMs365Calendar = vi.fn();
    render(<IntegrationsSection connectMs365Calendar={connectMs365Calendar} />);
    const ms365Row = screen.getByText('Microsoft 365 Calendar').closest('div').parentElement.parentElement;
    await user.click(within(ms365Row).getByRole('button', { name: 'Connect' }));
    expect(connectMs365Calendar).toHaveBeenCalledTimes(1);
  });

  it('routes to Notifications for Slack/Teams setup via onManageNotifications', async () => {
    const user = userEvent.setup();
    const onManageNotifications = vi.fn();
    render(<IntegrationsSection onManageNotifications={onManageNotifications} />);
    const setUpButtons = screen.getAllByRole('button', { name: 'Set up' });
    expect(setUpButtons).toHaveLength(2); // Slack + Teams
    await user.click(setUpButtons[0]);
    expect(onManageNotifications).toHaveBeenCalledTimes(1);
  });

  it('labels Slack "Manage" once connected, not "Set up"', () => {
    render(<IntegrationsSection orgWebhookUrl="https://hooks.slack.com/x" orgWebhookType="slack" onManageNotifications={()=>{}} />);
    const slackRow = screen.getByText('Slack').closest('div').parentElement.parentElement;
    expect(slackRow).toHaveTextContent('Connected');
    expect(screen.getAllByRole('button', { name: 'Set up' })).toHaveLength(1); // just Teams now
    expect(screen.getAllByRole('button', { name: 'Manage' })).toHaveLength(1); // Slack
  });
});

// Client IA cleanup, §3 — Integration health folded in here instead of
// staying a separate Settings destination: same summarizeIntegrationHealth
// data, shown contextually against each connected OAuth integration.
describe('IntegrationsSection — integration health (Client IA cleanup, §3)', () => {
  it('shows a Healthy badge for a connected integration with a successful sync and no recent failures', () => {
    const integrationEvents = [{ provider: 'outlook_mail', status: 'success', created_at: '2026-01-01T00:00:00Z' }];
    render(<IntegrationsSection isHR mailConnected mailboxEmail="hr@acme.com" integrationEvents={integrationEvents} />);
    const outlookRow = screen.getByText('Microsoft Outlook').closest('div').parentElement.parentElement;
    expect(within(outlookRow).getByText('Healthy')).toBeInTheDocument();
  });

  it('shows a recent-failures badge for a connected integration with errors', () => {
    const integrationEvents = [
      { provider: 'gmail', status: 'error', created_at: '2026-01-02T00:00:00Z', detail: 'token expired' },
    ];
    render(<IntegrationsSection isHR gmailConnected gmailboxEmail="hr@gmail.com" integrationEvents={integrationEvents} />);
    const gmailRow = screen.getByText('Gmail').closest('div').parentElement.parentElement;
    expect(within(gmailRow).getByText('1 recent failure')).toBeInTheDocument();
  });

  it('shows no health badge for a connected integration with no sync history yet', () => {
    render(<IntegrationsSection isHR mailConnected mailboxEmail="hr@acme.com" integrationEvents={[]} />);
    const outlookRow = screen.getByText('Microsoft Outlook').closest('div').parentElement.parentElement;
    expect(within(outlookRow).queryByText('Healthy')).not.toBeInTheDocument();
    expect(within(outlookRow).queryByText(/recent failure/)).not.toBeInTheDocument();
  });

  it('never shows a health badge for Slack/Teams or the roadmap rows (no sync history concept for them)', () => {
    const integrationEvents = [{ provider: 'outlook_mail', status: 'success', created_at: '2026-01-01T00:00:00Z' }];
    render(<IntegrationsSection isHR orgWebhookUrl="https://hooks.slack.com/x" orgWebhookType="slack" integrationEvents={integrationEvents} onManageNotifications={()=>{}} />);
    const slackRow = screen.getByText('Slack').closest('div').parentElement.parentElement;
    expect(within(slackRow).queryByText('Healthy')).not.toBeInTheDocument();
  });

  // Client IA cleanup, §7 — "Integration health" was its own isHR-gated
  // Settings section before this merge; Integrations itself has never
  // been isHR-gated (any org member can connect their own mailbox).
  // Folding health data into an ungated screen must not silently hand
  // every org member information that used to require isHR.
  it('hides the health badge from a non-HR user even when the same data would show it for HR', () => {
    const integrationEvents = [{ provider: 'outlook_mail', status: 'success', created_at: '2026-01-01T00:00:00Z' }];
    render(<IntegrationsSection isHR={false} mailConnected mailboxEmail="hr@acme.com" integrationEvents={integrationEvents} />);
    const outlookRow = screen.getByText('Microsoft Outlook').closest('div').parentElement.parentElement;
    expect(within(outlookRow).queryByText('Healthy')).not.toBeInTheDocument();
    expect(outlookRow).toHaveTextContent('Connected'); // connection status itself is unaffected — only health is gated
  });
});
