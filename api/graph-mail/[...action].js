import { oauthStart } from './_oauth-start.js';
import { oauthCallback } from './_oauth-callback.js';
import { status } from './_status.js';
import { disconnect } from './_disconnect.js';
import { listMessages } from './_list-messages.js';
import { getMessage } from './_get-message.js';

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
    default: return res.status(404).json({ error: 'Not found' });
  }
}
