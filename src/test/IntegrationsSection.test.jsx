import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntegrationsSection } from '../screens/settings/IntegrationsSection.jsx';

// Integrations & Workflow Automation (Phase 5, IP1, §1) — this screen is
// reachable by any org member (same as SaveEmailScreen's own Outlook
// connect button, which has no isHR gate), so it's covered directly here
// alongside real E2E interaction for the two live connections.
describe('IntegrationsSection', () => {
  it('renders one row per catalog entry, including the not-yet-available ones', () => {
    render(<IntegrationsSection />);
    expect(screen.getByText('Microsoft Outlook')).toBeInTheDocument();
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.getByText('HRIS platforms')).toBeInTheDocument();
    expect(screen.getAllByText('Requires administrator').length).toBeGreaterThan(0);
  });

  it('shows Outlook as connected with the mailbox, and offers Disconnect', () => {
    render(<IntegrationsSection mailConnected mailboxEmail="hr@acme.com" />);
    expect(screen.getByText('hr@acme.com')).toBeInTheDocument();
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
    expect(screen.getByText('hr@gmail.com')).toBeInTheDocument();
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
