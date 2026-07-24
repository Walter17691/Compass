import { oauthStart } from './_oauth-start.js';
import { oauthCallback } from './_oauth-callback.js';
import { sync } from './_sync.js';
import { disconnect } from './_disconnect.js';
import { status } from './_status.js';

// Single catch-all route for every /api/calendar/* endpoint. Vercel's
// Hobby plan caps a deployment at 12 serverless functions total; with
// Calendar (5 routes) and Portal (7 routes) as separate files each, the
// project blew past that. Consolidating each group behind one dynamic
// route file is the standard fix — the actual handler logic is unchanged
// (moved into the underscore-prefixed files below, which Vercel never
// treats as routes on their own), and every existing URL
// (/api/calendar/oauth-start, /api/calendar/sync, etc.) keeps working
// exactly as before, so nothing else in the app needed to change.
export default async function handler(req, res) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  switch (action) {
    case 'oauth-start': return oauthStart(req, res);
    case 'oauth-callback': return oauthCallback(req, res);
    case 'sync': return sync(req, res);
    case 'disconnect': return disconnect(req, res);
    case 'status': return status(req, res);
    default: return res.status(404).json({ error: 'Not found' });
  }
}
