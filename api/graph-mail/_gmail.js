// Integrations & Workflow Automation (Phase 5, IP2) — Gmail connector.
// Reuses the same Google OAuth client as api/calendar/ (GOOGLE_CLIENT_ID/
// GOOGLE_CLIENT_SECRET) — Gmail and Calendar are different scopes on the
// SAME Google Cloud OAuth app, not two separate app registrations. Lives
// under api/graph-mail/ (not a new top-level api/gmail/ directory)
// because this project is already at Vercel's Hobby-plan 12-function cap
// (see [...action].js's own comment), and graph_mail_connections was
// designed from the start to hold a 'google' row alongside 'microsoft'
// ones — see graph_mail_connections_2026-08-12.sql's own "extend the
// check constraint when Gmail push support is added later."
//
// Read-only for now (gmail.readonly) — this phase only builds the
// connector (connect/status/disconnect), not message browsing. A later
// Track B phase extends "Add to Compass"/email intelligence to read
// Gmail messages the same way api/graph-mail/_list-messages.js already
// does for Outlook.
export const GMAIL_SCOPE = 'openid email https://www.googleapis.com/auth/gmail.readonly';

export async function getValidAccessToken(connection) {
  const expiresAt = new Date(connection.expires_at).getTime();
  if (expiresAt - Date.now() > 60 * 1000) {
    return { accessToken: connection.access_token, newExpiresAt: null };
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Failed to refresh Google access token: ' + JSON.stringify(data));
  return {
    accessToken: data.access_token,
    newExpiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}
