import crypto from 'crypto';
import { signState } from './_state.js';
import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// Returns the Google consent URL as JSON rather than issuing a redirect
// directly — a top-level window.location.href navigation can't carry a
// custom Authorization header, so the client fetches this (with its
// Supabase access token attached) and then navigates to the URL it gets
// back.
export async function oauthStart(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const userId = caller.id;

  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  const missingEnvVars = ['GOOGLE_CLIENT_ID', 'CALENDAR_STATE_SECRET'].filter(name => !process.env[name]);
  if (missingEnvVars.length) {
    console.error('Calendar oauth-start missing env vars:', missingEnvVars.join(', '));
    return res.status(500).json({ error: `Server misconfigured — missing env var(s): ${missingEnvVars.join(', ')}. Set them in Vercel project settings and redeploy.` });
  }

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(userId)}&select=id`);
    const members = await memberRes.json();
    if (!members.length) return res.status(403).json({ error: 'Not a member of this organisation' });

    // The nonce is embedded in the signed state AND set as an HttpOnly
    // cookie — oauth-callback requires both to match. This binds the
    // callback to the same browser that started the flow, so a state+code
    // pair leaked or replayed from elsewhere (browser history, a shared
    // link, a proxy log) can't complete a connection on its own. Mirrors
    // the identical fix in api/graph-mail/_oauth-start.js.
    const nonce = crypto.randomUUID();
    const state = signState({
      userId,
      orgId,
      nonce,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    const redirectUri = `${APP_URL}/api/calendar/oauth-callback`;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID.trim(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    res.setHeader('Set-Cookie', `calendar_oauth_nonce=${nonce}; Max-Age=600; Path=/api/calendar; HttpOnly; Secure; SameSite=Lax`);
    res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (e) {
    console.error('Calendar oauth-start error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
