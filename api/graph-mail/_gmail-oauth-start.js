import crypto from 'crypto';
import { signState } from './_state.js';
import { GMAIL_SCOPE } from './_gmail.js';
import { supabaseRequest } from '../_supabase.js';
import { verifyCaller } from '../_auth.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

// Mirrors _oauth-start.js (Outlook) and api/calendar/_oauth-start.js
// (Google Calendar) exactly, including the state-signed + HttpOnly-cookie
// nonce binding — see either's own comment for why both are required.
// Reuses GRAPH_MAIL_STATE_SECRET rather than requiring a new env var:
// it's a plain anti-CSRF HMAC key, not tied to any specific provider.
export async function gmailOauthStart(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const userId = caller.id;

  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  const missingEnvVars = ['GOOGLE_CLIENT_ID', 'GRAPH_MAIL_STATE_SECRET'].filter(name => !process.env[name]);
  if (missingEnvVars.length) {
    console.error('Gmail oauth-start missing env vars:', missingEnvVars.join(', '));
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

    const redirectUri = `${APP_URL}/api/graph-mail/gmail-oauth-callback`;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID.trim(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    res.setHeader('Set-Cookie', `gmail_oauth_nonce=${nonce}; Max-Age=600; Path=/api/graph-mail; HttpOnly; Secure; SameSite=Lax`);
    res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (e) {
    console.error('Gmail oauth-start error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
