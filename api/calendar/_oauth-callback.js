import crypto from 'crypto';
import { verifyState } from './_state.js';
import { supabaseRequest } from './_supabase.js';
import { logIntegrationEvent } from '../_integration_events.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

// Clears the one-time nonce cookie regardless of outcome, so a stale value
// can never be reused for a second callback attempt.
function clearNonceCookie(res) {
  res.setHeader('Set-Cookie', 'calendar_oauth_nonce=; Max-Age=0; Path=/api/calendar; HttpOnly; Secure; SameSite=Lax');
}

export async function oauthCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(302, `${APP_URL}/?calendar=error`);

  try {
    const payload = verifyState(state);
    if (!payload) return res.redirect(302, `${APP_URL}/?calendar=error`);

    // Requires the SAME browser that started the flow (via _oauth-start.js's
    // HttpOnly cookie) to be the one completing it — verifyState alone only
    // proves the state wasn't tampered with, not that this request came
    // from the session that requested it.
    const cookieNonce = readCookie(req, 'calendar_oauth_nonce');
    const cookieBuf = Buffer.from(cookieNonce || '');
    const payloadBuf = Buffer.from(payload.nonce || '');
    const nonceMatches = cookieBuf.length > 0 && cookieBuf.length === payloadBuf.length && crypto.timingSafeEqual(cookieBuf, payloadBuf);
    clearNonceCookie(res);
    if (!nonceMatches) {
      console.error('Calendar oauth-callback: nonce cookie mismatch or missing');
      return res.redirect(302, `${APP_URL}/?calendar=error`);
    }

    const redirectUri = `${APP_URL}/api/calendar/oauth-callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET.trim(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.error('Google token exchange failed:', tokenData);
      await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'google_calendar', eventType: 'connect', status: 'error', detail: 'Token exchange failed' });
      return res.redirect(302, `${APP_URL}/?calendar=error`);
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
    // was on_conflict=user_id,provider: a user connected in Org A who
    // then connects again while active in Org B silently overwrote Org
    // A's row (org_id and tokens both) instead of creating a second one.
    // One connection per (user, org, provider) is the real invariant — a
    // user can legitimately have Google Calendar connected separately
    // for two different orgs.
    const upsertRes = await supabaseRequest('calendar_connections?on_conflict=user_id,org_id,provider', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: payload.userId,
        org_id: payload.orgId,
        provider: 'google',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!upsertRes.ok) {
      console.error('calendar_connections upsert failed:', await upsertRes.text());
      await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'google_calendar', eventType: 'connect', status: 'error', detail: 'Failed to save the connection' });
      return res.redirect(302, `${APP_URL}/?calendar=error`);
    }

    await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'google_calendar', eventType: 'connect', status: 'success' });
    res.redirect(302, `${APP_URL}/?calendar=connected`);
  } catch (e) {
    console.error('Calendar OAuth callback error:', e.message);
    res.redirect(302, `${APP_URL}/?calendar=error`);
  }
}
