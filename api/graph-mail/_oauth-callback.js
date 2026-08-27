import crypto from 'crypto';
import { verifyState } from './_state.js';
import { GRAPH_SCOPE } from './_outlook.js';
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

// Clears the one-time nonce cookie regardless of outcome, so a stale value
// can never be reused for a second callback attempt.
function clearNonceCookie(res) {
  res.setHeader('Set-Cookie', 'graph_mail_oauth_nonce=; Max-Age=0; Path=/api/graph-mail; HttpOnly; Secure; SameSite=Lax');
}

export async function oauthCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(302, `${APP_URL}/?mail=error`);

  try {
    const payload = verifyState(state);
    if (!payload) return res.redirect(302, `${APP_URL}/?mail=error`);

    // Requires the SAME browser that started the flow (via _oauth-start.js's
    // HttpOnly cookie) to be the one completing it — verifyState alone only
    // proves the state wasn't tampered with, not that this request came
    // from the session that requested it. See the HIGH-severity finding
    // this closes: OAuth state must be bound to the initiating session, not
    // just cryptographically signed.
    const cookieNonce = readCookie(req, 'graph_mail_oauth_nonce');
    const cookieBuf = Buffer.from(cookieNonce || '');
    const payloadBuf = Buffer.from(payload.nonce || '');
    const nonceMatches = cookieBuf.length > 0 && cookieBuf.length === payloadBuf.length && crypto.timingSafeEqual(cookieBuf, payloadBuf);
    clearNonceCookie(res);
    if (!nonceMatches) {
      console.error('Graph mail oauth-callback: nonce cookie mismatch or missing');
      return res.redirect(302, `${APP_URL}/?mail=error`);
    }

    const tenant = process.env.MS_GRAPH_TENANT_ID.trim();
    const redirectUri = `${APP_URL}/api/graph-mail/oauth-callback`;
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.MS_GRAPH_CLIENT_ID.trim(),
        client_secret: process.env.MS_GRAPH_CLIENT_SECRET.trim(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: GRAPH_SCOPE,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.error('Microsoft token exchange failed:', tokenData);
      await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'outlook_mail', eventType: 'connect', status: 'error', detail: 'Token exchange failed' });
      return res.redirect(302, `${APP_URL}/?mail=error`);
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Best-effort — used only to show "Connected as hr@..." in the UI, so a
    // failure here shouldn't block the connection itself from saving.
    let mailboxEmail = null;
    try {
      const meRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        mailboxEmail = me.mail || me.userPrincipalName || null;
      }
    } catch (e) { console.error('Graph /me lookup failed (non-fatal):', e.message); }

    // Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
    // one connection per (user, org, provider), not per (user, provider)
    // — see api/calendar/_oauth-callback.js's sibling comment.
    const upsertRes = await supabaseRequest('graph_mail_connections?on_conflict=user_id,org_id,provider', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: payload.userId,
        org_id: payload.orgId,
        provider: 'microsoft',
        mailbox_email: mailboxEmail,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!upsertRes.ok) {
      console.error('graph_mail_connections upsert failed:', await upsertRes.text());
      await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'outlook_mail', eventType: 'connect', status: 'error', detail: 'Failed to save the connection' });
      return res.redirect(302, `${APP_URL}/?mail=error`);
    }

    await logIntegrationEvent({ orgId: payload.orgId, userId: payload.userId, provider: 'outlook_mail', eventType: 'connect', status: 'success', detail: mailboxEmail });
    res.redirect(302, `${APP_URL}/?mail=connected`);
  } catch (e) {
    console.error('Graph mail OAuth callback error:', e.message);
    res.redirect(302, `${APP_URL}/?mail=error`);
  }
}
