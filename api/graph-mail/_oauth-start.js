import crypto from 'crypto';
import { signState } from './_state.js';
import { GRAPH_SCOPE } from './_outlook.js';
import { supabaseRequest } from '../_supabase.js';
import { verifyCaller } from '../_auth.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

// Returns the Microsoft consent URL as JSON rather than redirecting
// directly — mirrors api/calendar/_oauth-start.js exactly, for the same
// reason: a top-level navigation can't carry the caller's Authorization
// header, so the client fetches this first and navigates to the URL itself.
export async function oauthStart(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const userId = caller.id;

  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  const missingEnvVars = ['MS_GRAPH_CLIENT_ID', 'MS_GRAPH_TENANT_ID', 'GRAPH_MAIL_STATE_SECRET'].filter(name => !process.env[name]);
  if (missingEnvVars.length) {
    console.error('Graph mail oauth-start missing env vars:', missingEnvVars.join(', '));
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
    // link, a proxy log) can't complete a connection on its own.
    const nonce = crypto.randomUUID();
    const state = signState({
      userId,
      orgId,
      nonce,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    const tenant = process.env.MS_GRAPH_TENANT_ID.trim();
    const redirectUri = `${APP_URL}/api/graph-mail/oauth-callback`;
    const params = new URLSearchParams({
      client_id: process.env.MS_GRAPH_CLIENT_ID.trim(),
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: GRAPH_SCOPE,
      prompt: 'consent',
      state,
    });

    res.setHeader('Set-Cookie', `graph_mail_oauth_nonce=${nonce}; Max-Age=600; Path=/api/graph-mail; HttpOnly; Secure; SameSite=Lax`);
    res.status(200).json({ url: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}` });
  } catch (e) {
    console.error('Graph mail oauth-start error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
