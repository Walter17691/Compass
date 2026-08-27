import crypto from 'crypto';
import { verifyState } from './_state.js';
import { supabaseRequest } from './_supabase.js';
import { logIntegrationEvent } from '../_integration_events.js';
import { redactTokenResponse } from '../_oauthLog.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function clearNonceCookie(res) {
  res.setHeader('Set-Cookie', 'ms365_calendar_oauth_nonce=; Max-Age=0; Path=/api/calendar; HttpOnly; Secure; SameSite=Lax');
}

export async function ms365OauthCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(302, `${APP_URL}/?ms365calendar=error`);

  try {
    const payload = verifyState(state);
    if (!payload) return res.redirect(302, `${APP_URL}/?ms365calendar=error`);

    const cookieNonce = readCookie(req, 'ms365_calendar_oauth_nonce');
    const cookieBuf = Buffer.from(cookieNonce || '');
    const payloadBuf = Buffer.from(payload.nonce || '');
    const nonceMatches = cookieBuf.length > 0 && cookieBuf.length === payloadBuf.length && crypto.timingSafeEqual(cookieBuf, payloadBuf);
    clearNonceCookie(res);
    if (!nonceMatches) {
      console.error('MS365 calendar oauth-callback: nonce cookie mismatch or missing');
      return res.redirect(302, `${APP_URL}/?ms365calendar=error`);
    }

    const tenant = process.env.MS_GRAPH_TENANT_ID.trim();
    const redirectUri = `${APP_URL}/api/calendar/ms365-oauth-callback`;
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.MS_GRAPH_CLIENT_ID.trim(),
        client_secret: process.env.MS_GRAPH_CLIENT_SECRET.trim(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.error('MS365 calendar token exchange failed:', redactTokenResponse(tokenData));
      await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'ms365_calendar', eventType: 'connect', status: 'error', detail: 'Token exchange failed' });
      return res.redirect(302, `${APP_URL}/?ms365calendar=error`);
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
    // see _oauth-callback.js's sibling comment; one connection per
    // (user, org, provider), not per (user, provider).
    const upsertRes = await supabaseRequest('calendar_connections?on_conflict=user_id,org_id,provider', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: payload.userId,
        org_id: payload.orgId,
        provider: 'microsoft',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!upsertRes.ok) {
      console.error('calendar_connections (microsoft) upsert failed:', await upsertRes.text());
      await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'ms365_calendar', eventType: 'connect', status: 'error', detail: 'Failed to save the connection' });
      return res.redirect(302, `${APP_URL}/?ms365calendar=error`);
    }

    await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'ms365_calendar', eventType: 'connect', status: 'success' });
    res.redirect(302, `${APP_URL}/?ms365calendar=connected`);
  } catch (e) {
    console.error('MS365 calendar OAuth callback error:', e.message);
    res.redirect(302, `${APP_URL}/?ms365calendar=error`);
  }
}
