import crypto from 'crypto';
import { verifyState } from './_state.js';
import { supabaseRequest } from '../_supabase.js';
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

function clearNonceCookie(res) {
  res.setHeader('Set-Cookie', 'gmail_oauth_nonce=; Max-Age=0; Path=/api/graph-mail; HttpOnly; Secure; SameSite=Lax');
}

export async function gmailOauthCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(302, `${APP_URL}/?gmail=error`);

  try {
    const payload = verifyState(state);
    if (!payload) return res.redirect(302, `${APP_URL}/?gmail=error`);

    const cookieNonce = readCookie(req, 'gmail_oauth_nonce');
    const cookieBuf = Buffer.from(cookieNonce || '');
    const payloadBuf = Buffer.from(payload.nonce || '');
    const nonceMatches = cookieBuf.length > 0 && cookieBuf.length === payloadBuf.length && crypto.timingSafeEqual(cookieBuf, payloadBuf);
    clearNonceCookie(res);
    if (!nonceMatches) {
      console.error('Gmail oauth-callback: nonce cookie mismatch or missing');
      return res.redirect(302, `${APP_URL}/?gmail=error`);
    }

    const redirectUri = `${APP_URL}/api/graph-mail/gmail-oauth-callback`;
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
      console.error('Gmail token exchange failed:', tokenData);
      await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'gmail', eventType: 'connect', status: 'error', detail: 'Token exchange failed' });
      return res.redirect(302, `${APP_URL}/?gmail=error`);
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Best-effort — used only to show "Connected as ..." in the UI, so a
    // failure here shouldn't block the connection itself from saving.
    let mailboxEmail = null;
    try {
      const meRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        mailboxEmail = me.email || null;
      }
    } catch (e) { console.error('Google userinfo lookup failed (non-fatal):', e.message); }

    // Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
    // one connection per (user, org, provider), not per (user, provider)
    // — see api/calendar/_oauth-callback.js's sibling comment.
    const upsertRes = await supabaseRequest('graph_mail_connections?on_conflict=user_id,org_id,provider', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: payload.userId,
        org_id: payload.orgId,
        provider: 'google',
        mailbox_email: mailboxEmail,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!upsertRes.ok) {
      console.error('graph_mail_connections (google) upsert failed:', await upsertRes.text());
      await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'gmail', eventType: 'connect', status: 'error', detail: 'Failed to save the connection' });
      return res.redirect(302, `${APP_URL}/?gmail=error`);
    }

    await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'gmail', eventType: 'connect', status: 'success', detail: mailboxEmail });
    res.redirect(302, `${APP_URL}/?gmail=connected`);
  } catch (e) {
    console.error('Gmail OAuth callback error:', e.message);
    res.redirect(302, `${APP_URL}/?gmail=error`);
  }
}
