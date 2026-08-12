import { verifyState } from './_state.js';
import { GRAPH_SCOPE } from './_outlook.js';
import { supabaseRequest } from '../_supabase.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

export async function oauthCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(302, `${APP_URL}/?mail=error`);

  try {
    const payload = verifyState(state);
    if (!payload) return res.redirect(302, `${APP_URL}/?mail=error`);

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

    const upsertRes = await supabaseRequest('graph_mail_connections?on_conflict=user_id,provider', {
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
      return res.redirect(302, `${APP_URL}/?mail=error`);
    }

    res.redirect(302, `${APP_URL}/?mail=connected`);
  } catch (e) {
    console.error('Graph mail OAuth callback error:', e.message);
    res.redirect(302, `${APP_URL}/?mail=error`);
  }
}
