import crypto from 'crypto';
import { signState } from './_state.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, orgId } = req.query;
  if (!userId || !orgId) return res.status(400).json({ error: 'userId and orgId are required' });

  const state = signState({
    userId,
    orgId,
    nonce: crypto.randomUUID(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  const redirectUri = `${APP_URL}/api/calendar/oauth-callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
