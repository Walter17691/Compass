import { oauthStart } from './_oauth-start.js';
import { oauthCallback } from './_oauth-callback.js';
import { status } from './_status.js';
import { disconnect } from './_disconnect.js';
import { listMessages } from './_list-messages.js';
import { getMessage } from './_get-message.js';
import { gmailOauthStart } from './_gmail-oauth-start.js';
import { gmailOauthCallback } from './_gmail-oauth-callback.js';
import { gmailStatus } from './_gmail-status.js';
import { gmailDisconnect } from './_gmail-disconnect.js';

// Single catch-all route for every /api/graph-mail/* endpoint — same
// consolidation as api/calendar/[...action].js, api/portal/[...action].js
// and api/billing/[...action].js, all done for the same reason: Vercel's
// Hobby plan caps a deployment at 12 serverless functions, and this project
// was already at 11 route-eligible files before this feature.
export default async function handler(req, res) {
  const path = (req.url || '').split('?')[0];
  const action = path.split('/').filter(Boolean).pop();
  switch (action) {
    case 'oauth-start': return oauthStart(req, res);
    case 'oauth-callback': return oauthCallback(req, res);
    case 'status': return status(req, res);
    case 'disconnect': return disconnect(req, res);
    case 'list-messages': return listMessages(req, res);
    case 'get-message': return getMessage(req, res);
    // Integrations & Workflow Automation (Phase 5, IP2) — Gmail connector,
    // same Vercel-function-budget reasoning as this file's own header
    // comment: a new api/gmail/ directory would be a 13th route-eligible
    // file, so Gmail's routes live here instead.
    case 'gmail-oauth-start': return gmailOauthStart(req, res);
    case 'gmail-oauth-callback': return gmailOauthCallback(req, res);
    case 'gmail-status': return gmailStatus(req, res);
    case 'gmail-disconnect': return gmailDisconnect(req, res);
    default: return res.status(404).json({ error: 'Not found' });
  }
}
