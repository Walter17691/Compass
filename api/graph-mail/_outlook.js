import { supabaseRequest } from '../_supabase.js';

// Microsoft Graph's mail scope needs an offline-capable refresh alongside
// Mail.Read, or the connection would silently stop working after the
// short-lived access token expires (~1 hour) with no way to renew it.
export const GRAPH_SCOPE = 'openid profile offline_access https://graph.microsoft.com/Mail.Read';

// Refreshes the access token if it's expired (or about to, within 60s),
// mirroring api/calendar/_google.js's getValidAccessToken. Microsoft
// sometimes rotates the refresh token on use — newRefreshToken is only set
// when that happens, so callers know whether to persist an update.
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
      scope: GRAPH_SCOPE,
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

// Shared by _list-messages.js and _get-message.js: loads the caller's
// connection, refreshes the access token if needed (persisting the
// refresh), and returns both. Returns null if the user has no connection.
export async function getConnectionWithFreshToken(userId) {
  const connRes = await supabaseRequest(`graph_mail_connections?user_id=eq.${userId}&provider=eq.microsoft&select=*`);
  const connections = await connRes.json();
  const connection = connections[0];
  if (!connection) return null;

  const { accessToken, newExpiresAt, newRefreshToken } = await getValidAccessToken(connection);
  if (newExpiresAt) {
    await supabaseRequest(`graph_mail_connections?id=eq.${connection.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        access_token: accessToken,
        expires_at: newExpiresAt,
        ...(newRefreshToken ? { refresh_token: newRefreshToken } : {}),
        updated_at: new Date().toISOString(),
      }),
    });
  }
  return { connection, accessToken };
}

export async function graphRequest(accessToken, path, options = {}) {
  return fetch(`https://graph.microsoft.com/v1.0/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}
