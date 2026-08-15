import { oauthStart } from './_oauth-start.js';
import { oauthCallback } from './_oauth-callback.js';
import { sync } from './_sync.js';
import { disconnect } from './_disconnect.js';
import { status } from './_status.js';
import { ms365OauthStart } from './_ms365-oauth-start.js';
import { ms365OauthCallback } from './_ms365-oauth-callback.js';
import { ms365Status } from './_ms365-status.js';
import { ms365Disconnect } from './_ms365-disconnect.js';
import { createEvent } from './_create-event.js';
import { updateEvent } from './_update-event.js';
import { deleteEvent } from './_delete-event.js';
import { checkAvailability } from './_check-availability.js';

// Single catch-all route for every /api/calendar/* endpoint. Vercel's
// Hobby plan caps a deployment at 12 serverless functions total; with
// Calendar (5 routes) and Portal (7 routes) as separate files each, the
// project blew past that. Consolidating each group behind one dynamic
// route file is the standard fix — the actual handler logic is unchanged
// (moved into the underscore-prefixed files below, which Vercel never
// treats as routes on their own), and every existing URL
// (/api/calendar/oauth-start, /api/calendar/sync, etc.) keeps working
// exactly as before, so nothing else in the app needed to change.
//
// Parses the action from req.url directly rather than req.query.action —
// relying on Vercel populating a catch-all route param into req.query
// turned out to be unreliable for a plain (non-Next.js) Serverless
// Function, and req.url is always accurate regardless of routing quirks.
export default async function handler(req, res) {
  const path = (req.url || '').split('?')[0];
  const action = path.split('/').filter(Boolean).pop();
  switch (action) {
    case 'oauth-start': return oauthStart(req, res);
    case 'oauth-callback': return oauthCallback(req, res);
    case 'sync': return sync(req, res);
    case 'disconnect': return disconnect(req, res);
    case 'status': return status(req, res);
    // Integrations & Workflow Automation (Phase 5, IP3) — Microsoft 365
    // Calendar connector and the real create/update/delete-event
    // primitive, folded into this same router for the same Vercel
    // function-budget reason as this file's own header comment.
    case 'ms365-oauth-start': return ms365OauthStart(req, res);
    case 'ms365-oauth-callback': return ms365OauthCallback(req, res);
    case 'ms365-status': return ms365Status(req, res);
    case 'ms365-disconnect': return ms365Disconnect(req, res);
    case 'create-event': return createEvent(req, res);
    case 'update-event': return updateEvent(req, res);
    case 'delete-event': return deleteEvent(req, res);
    // IP16, §10 — availability checks (see _check-availability.js's own
    // "where authorised" comment on why this only ever reads the
    // caller's own calendar).
    case 'check-availability': return checkAvailability(req, res);
    default: return res.status(404).json({ error: 'Not found' });
  }
}
