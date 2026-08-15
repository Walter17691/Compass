import { describe, it, expect } from 'vitest';
import { computeIntegrationStatuses, integrationStatusLabel, INTEGRATION_CATALOG, INTEGRATION_STATUS } from '../lib/integrations.js';

describe('computeIntegrationStatuses', () => {
  it('returns one row per catalog entry', () => {
    const rows = computeIntegrationStatuses({});
    expect(rows).toHaveLength(INTEGRATION_CATALOG.length);
  });

  it('marks Outlook connected with the mailbox as detail when mailConnected is true', () => {
    const rows = computeIntegrationStatuses({ mailConnected: true, mailboxEmail: 'hr@acme.com' });
    const outlook = rows.find(r => r.id === 'outlook_mail');
    expect(outlook.status).toBe(INTEGRATION_STATUS.CONNECTED);
    expect(outlook.detail).toBe('hr@acme.com');
  });

  it('marks Outlook not connected when mailConnected is false', () => {
    const rows = computeIntegrationStatuses({ mailConnected: false });
    const outlook = rows.find(r => r.id === 'outlook_mail');
    expect(outlook.status).toBe(INTEGRATION_STATUS.NOT_CONNECTED);
    expect(outlook.detail).toBeNull();
  });

  it('marks Google Calendar connected when calendarConnected is true', () => {
    const rows = computeIntegrationStatuses({ calendarConnected: true });
    const cal = rows.find(r => r.id === 'google_calendar');
    expect(cal.status).toBe(INTEGRATION_STATUS.CONNECTED);
  });

  it('marks Gmail connected with the mailbox as detail when gmailConnected is true', () => {
    const rows = computeIntegrationStatuses({ gmailConnected: true, gmailboxEmail: 'hr@gmail.com' });
    const gmail = rows.find(r => r.id === 'gmail');
    expect(gmail.status).toBe(INTEGRATION_STATUS.CONNECTED);
    expect(gmail.detail).toBe('hr@gmail.com');
  });

  it('marks Gmail not connected when gmailConnected is false', () => {
    const rows = computeIntegrationStatuses({ gmailConnected: false });
    const gmail = rows.find(r => r.id === 'gmail');
    expect(gmail.status).toBe(INTEGRATION_STATUS.NOT_CONNECTED);
    expect(gmail.detail).toBeNull();
  });

  it('marks Slack connected only when the org webhook type is slack', () => {
    const rows = computeIntegrationStatuses({ orgWebhookUrl: 'https://hooks.slack.com/x', orgWebhookType: 'slack' });
    expect(rows.find(r => r.id === 'slack').status).toBe(INTEGRATION_STATUS.CONNECTED);
    expect(rows.find(r => r.id === 'teams').status).toBe(INTEGRATION_STATUS.NOT_CONNECTED);
  });

  it('marks Teams connected only when the org webhook type is teams', () => {
    const rows = computeIntegrationStatuses({ orgWebhookUrl: 'https://outlook.office.com/webhook/x', orgWebhookType: 'teams' });
    expect(rows.find(r => r.id === 'teams').status).toBe(INTEGRATION_STATUS.CONNECTED);
    expect(rows.find(r => r.id === 'slack').status).toBe(INTEGRATION_STATUS.NOT_CONNECTED);
  });

  it('marks both Slack and Teams not connected when no webhook is configured', () => {
    const rows = computeIntegrationStatuses({});
    expect(rows.find(r => r.id === 'slack').status).toBe(INTEGRATION_STATUS.NOT_CONNECTED);
    expect(rows.find(r => r.id === 'teams').status).toBe(INTEGRATION_STATUS.NOT_CONNECTED);
  });

  it('marks every stub integration as requires_admin and flags it not yet available', () => {
    const rows = computeIntegrationStatuses({});
    const stubIds = ['ms365_calendar', 'hris', 'occupational_health', 'esignature', 'document_storage'];
    stubIds.forEach(id => {
      const row = rows.find(r => r.id === id);
      expect(row.status).toBe(INTEGRATION_STATUS.REQUIRES_ADMIN);
      expect(row.notYetAvailable).toBe(true);
    });
  });

  it('never marks a real integration as notYetAvailable', () => {
    const rows = computeIntegrationStatuses({ mailConnected: true, gmailConnected: true, calendarConnected: true, orgWebhookUrl: 'x', orgWebhookType: 'slack' });
    ['outlook_mail', 'gmail', 'google_calendar', 'slack', 'teams'].forEach(id => {
      expect(rows.find(r => r.id === id).notYetAvailable).toBeUndefined();
    });
  });
});

describe('integrationStatusLabel', () => {
  it('labels every known status', () => {
    expect(integrationStatusLabel(INTEGRATION_STATUS.CONNECTED)).toBe('Connected');
    expect(integrationStatusLabel(INTEGRATION_STATUS.CONNECTION_ERROR)).toBe('Connection error');
    expect(integrationStatusLabel(INTEGRATION_STATUS.REQUIRES_ADMIN)).toBe('Requires administrator');
    expect(integrationStatusLabel(INTEGRATION_STATUS.NOT_CONNECTED)).toBe('Not connected');
  });

  it('falls back to "Not connected" for an unknown status', () => {
    expect(integrationStatusLabel('something_else')).toBe('Not connected');
  });
});
