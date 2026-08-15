import crypto from 'crypto';
import { signState } from './_state.js';
import { GRAPH_CALENDAR_SCOPE } from './_microsoft.js';
import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

// Mirrors _oauth-start.js (Google Calendar) exactly, including the
// state-signed + HttpOnly-cookie nonce binding. Reuses this project's
// own Microsoft Entra app registration (MS_GRAPH_CLIENT_ID/TENANT_ID) —
// the same one api/graph-mail/ already uses for Outlook mail — and
// CALENDAR_STATE_SECRET (already Google-Calendar-flavoured in name, but
// a plain anti-CSRF HMAC key like every other _state.js in this
// project, not tied to a specific provider).
export async function ms365OauthStart(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const userId = caller.id;

  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  const missingEnvVars = ['MS_GRAPH_CLIENT_ID', 'MS_GRAPH_TENANT_ID', 'CALENDAR_STATE_SECRET'].filter(name => !process.env[name]);
  if (missingEnvVars.length) {
    console.error('MS365 calendar oauth-start missing env vars:', missingEnvVars.join(', '));
    return res.status(500).json({ error: `Server misconfigured — missing env var(s): ${missingEnvVars.join(', ')}. Set them in Vercel project settings and redeploy.` });
  }

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(userId)}&select=id`);
    const members = await memberRes.json();
    if (!members.length) return res.status(403).json({ error: 'Not a member of this organisation' });

    const nonce = crypto.randomUUID();
    const state = signState({
      userId,
      orgId,
      nonce,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    const tenant = process.env.MS_GRAPH_TENANT_ID.trim();
    const redirectUri = `${APP_URL}/api/calendar/ms365-oauth-callback`;
    const params = new URLSearchParams({
      client_id: process.env.MS_GRAPH_CLIENT_ID.trim(),
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: GRAPH_CALENDAR_SCOPE,
      prompt: 'consent',
      state,
    });

    res.setHeader('Set-Cookie', `ms365_calendar_oauth_nonce=${nonce}; Max-Age=600; Path=/api/calendar; HttpOnly; Secure; SameSite=Lax`);
    res.status(200).json({ url: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}` });
  } catch (e) {
    console.error('MS365 calendar oauth-start error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
