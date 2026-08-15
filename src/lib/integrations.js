// Integrations & Workflow Automation (Phase 5, IP1, §1) — Integration
// Centre. A deliberately modular catalog: every integration the spec
// names gets one row here regardless of whether Compass can actually
// connect to it yet, so the UI never has to special-case "this one
// doesn't exist" — it just reads REQUIRES_ADMIN/NOT_CONNECTED off the
// same shape as everything else. Nothing here is hard-coded to look
// live if it isn't — see computeIntegrationStatuses' own comment on
// exactly which four entries have a real backend today.
export const INTEGRATION_STATUS = {
  CONNECTED: "connected",
  NOT_CONNECTED: "not_connected",
  CONNECTION_ERROR: "connection_error",
  REQUIRES_ADMIN: "requires_admin",
};

export const INTEGRATION_CATALOG = [
  { id: "outlook_mail", label: "Microsoft Outlook", category: "Email" },
  { id: "gmail", label: "Gmail", category: "Email" },
  { id: "ms365_calendar", label: "Microsoft 365 Calendar", category: "Calendar" },
  { id: "google_calendar", label: "Google Calendar", category: "Calendar" },
  { id: "teams", label: "Microsoft Teams", category: "Notifications" },
  { id: "slack", label: "Slack", category: "Notifications" },
  { id: "hris", label: "HRIS platforms", category: "HR systems" },
  { id: "occupational_health", label: "Occupational Health providers", category: "HR systems" },
  { id: "esignature", label: "E-signature platforms", category: "Documents" },
  { id: "document_storage", label: "Cloud document storage", category: "Documents" },
];

// Five catalog entries have a real, working connection today: outlook_mail/
// gmail/google_calendar are per-user delegated OAuth (App.jsx's own
// connectOutlookMail/connectGmail/connectGoogleCalendar); slack/teams is
// the existing org-wide incoming-webhook config (NotificationsSection.jsx's
// orgWebhookUrl/orgWebhookType) — a single destination, not two independent
// connections, so connecting one always means the other reads Not
// Connected. Every other entry is a stub: Requires Administrator, with
// `notYetAvailable: true` so the UI can say so honestly rather than
// implying an admin could act on it today (per the spec's own "do not
// hard-code integrations that do not yet have working APIs").
export function computeIntegrationStatuses({ mailConnected, mailboxEmail, gmailConnected, gmailboxEmail, calendarConnected, orgWebhookUrl, orgWebhookType } = {}) {
  return INTEGRATION_CATALOG.map(entry => {
    if (entry.id === "outlook_mail") {
      return { ...entry, status: mailConnected ? INTEGRATION_STATUS.CONNECTED : INTEGRATION_STATUS.NOT_CONNECTED, detail: mailConnected ? mailboxEmail : null, lastSync: null };
    }
    if (entry.id === "gmail") {
      return { ...entry, status: gmailConnected ? INTEGRATION_STATUS.CONNECTED : INTEGRATION_STATUS.NOT_CONNECTED, detail: gmailConnected ? gmailboxEmail : null, lastSync: null };
    }
    if (entry.id === "google_calendar") {
      return { ...entry, status: calendarConnected ? INTEGRATION_STATUS.CONNECTED : INTEGRATION_STATUS.NOT_CONNECTED, detail: calendarConnected ? "Deadlines sync automatically" : null, lastSync: null };
    }
    if (entry.id === "slack" || entry.id === "teams") {
      const type = entry.id === "teams" ? "teams" : "slack";
      const connected = !!orgWebhookUrl && orgWebhookType === type;
      return { ...entry, status: connected ? INTEGRATION_STATUS.CONNECTED : INTEGRATION_STATUS.NOT_CONNECTED, detail: connected ? "Daily digest enabled" : null, lastSync: null };
    }
    return { ...entry, status: INTEGRATION_STATUS.REQUIRES_ADMIN, detail: null, lastSync: null, notYetAvailable: true };
  });
}

export function integrationStatusLabel(status) {
  if (status === INTEGRATION_STATUS.CONNECTED) return "Connected";
  if (status === INTEGRATION_STATUS.CONNECTION_ERROR) return "Connection error";
  if (status === INTEGRATION_STATUS.REQUIRES_ADMIN) return "Requires administrator";
  return "Not connected";
}
