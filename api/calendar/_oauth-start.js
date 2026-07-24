import crypto from 'crypto';
import { signState } from './_state.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export async function oauthStart(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, orgId } = req.query;
  if (!userId || !orgId) return res.status(400).json({ error: 'userId and orgId are required' });

  const missingEnvVars = ['GOOGLE_CLIENT_ID', 'CALENDAR_STATE_SECRET'].filter(name => !process.env[name]);
  if (missingEnvVars.length) {
    console.error('Calendar oauth-start missing env vars:', missingEnvVars.join(', '));
    return res.status(500).json({ error: `Server misconfigured — missing env var(s): ${missingEnvVars.join(', ')}. Set them in Vercel project settings and redeploy.` });
  }

  try {
    const state = signState({
      userId,
      orgId,
      nonce: crypto.randomUUID(),
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

    res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  } catch (e) {
    console.error('Calendar oauth-start error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
