// Integrations & Workflow Automation (Phase 5, IP3) — Microsoft 365
// Calendar. Reuses the same Microsoft Entra app registration as
// api/graph-mail/ (MS_GRAPH_CLIENT_ID/TENANT_ID/CLIENT_SECRET) — Mail
// and Calendar are different Graph scopes on one app, not two separate
// registrations, same reasoning IP2's Gmail connector already applied
// to Google's client credentials.
export const GRAPH_CALENDAR_SCOPE = 'openid profile offline_access https://graph.microsoft.com/Calendars.ReadWrite';

// Graph's event dateTime fields expect a LOCAL-looking string with no
// trailing offset — the offset is given separately via the timeZone
// property. Callers always pass a UTC ISO string ("...Z" or "+00:00"),
// so stripping the suffix and pairing it with timeZone:'UTC' (see
// buildMicrosoftEvent) is enough — no real timezone conversion needed
// since both providers store the same literal UTC instant either way.
function stripUtcSuffix(iso) {
  return iso.replace(/Z$/, '').replace(/\+00:00$/, '');
}

export function buildMicrosoftEvent({ title, description, startISO, endISO, attendees }) {
  return {
    subject: title,
    body: { contentType: 'text', content: description || '' },
    start: { dateTime: stripUtcSuffix(startISO), timeZone: 'UTC' },
    end: { dateTime: stripUtcSuffix(endISO), timeZone: 'UTC' },
    ...((attendees || []).length ? { attendees: attendees.map(a => ({ emailAddress: { address: a.email, name: a.name || a.email }, type: 'required' })) } : {}),
  };
}

// Mirrors api/graph-mail/_outlook.js's own getValidAccessToken exactly —
// same refresh shape, same "Microsoft sometimes rotates the refresh
// token on use" caveat.
export async function getValidAccessToken(connection) {
  const expiresAt = new Date(connection.expires_at).getTime();
  if (expiresAt - Date.now() > 60 * 1000) {
    return { accessToken: connection.access_token, newExpiresAt: null, newRefreshToken: null };
  }
  const tenant = process.env.MS_GRAPH_TENANT_ID.trim();
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_GRAPH_CLIENT_ID.trim(),
      client_secret: process.env.MS_GRAPH_CLIENT_SECRET.trim(),
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
      scope: GRAPH_CALENDAR_SCOPE,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Failed to refresh Microsoft access token: ' + JSON.stringify(data));
  return {
    accessToken: data.access_token,
    newExpiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    newRefreshToken: data.refresh_token || null,
  };
}

export async function graphCalendarRequest(accessToken, path, options = {}) {
  return fetch(`https://graph.microsoft.com/v1.0/me/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}
