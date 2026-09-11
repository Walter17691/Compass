import { inviteMember } from './_invite-member.js';
import { teamInvites } from './_team-invites.js';
import { acceptTeamInvite } from './_accept-team-invite.js';

// Same catch-all convention as billing/calendar/portal/cron — one function
// slot for the whole team-invitation group.
//
// Final security gate (2026-09-11) — the invitation remediation (NEW-6/7/
// 8/9) added two new top-level endpoints (accept-team-invite.js,
// team-invites.js) alongside the existing invite-member.js, which took the
// project's serverless function count from 12 to 14 and made the
// production deployment fail outright (Vercel Hobby plan caps a
// deployment at 12 functions). All three were previously independent
// top-level files with no shared routing; consolidating them here (net
// -2 functions) restores the deployment without changing any request URL,
// request/response shape, or authorization behaviour — every underlying
// handler (_invite-member.js, _team-invites.js, _accept-team-invite.js)
// is untouched except for its relative import paths and its export
// becoming a named function instead of a default export.
export default async function handler(req, res) {
  const path = (req.url || '').split('?')[0];
  const action = path.split('/').filter(Boolean).pop();
  switch (action) {
    case 'invite-member': return inviteMember(req, res);
    case 'team-invites': return teamInvites(req, res);
    case 'accept-team-invite': return acceptTeamInvite(req, res);
    default: return res.status(404).json({ error: 'Not found' });
  }
}
