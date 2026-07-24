import { verifyState } from './_state.js';
import { supabaseRequest } from './_supabase.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(302, `${APP_URL}/?calendar=error`);

  try {
    const payload = verifyState(state);
    if (!payload) return res.redirect(302, `${APP_URL}/?calendar=error`);

    const redirectUri = `${APP_URL}/api/calendar/oauth-callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.error('Google token exchange failed:', tokenData);
      return res.redirect(302, `${APP_URL}/?calendar=error`);
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    const upsertRes = await supabaseRequest('calendar_connections?on_conflict=user_id,provider', {
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
      return res.redirect(302, `${APP_URL}/?calendar=error`);
    }

    res.redirect(302, `${APP_URL}/?calendar=connected`);
  } catch (e) {
    console.error('Calendar OAuth callback error:', e.message);
    res.redirect(302, `${APP_URL}/?calendar=error`);
  }
}
