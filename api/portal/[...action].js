import { invite } from './_invite.js';
import { acceptInvite } from './_accept-invite.js';
import { caseList } from './_case-list.js';
import { caseDetail } from './_case-detail.js';
import { signatures } from './_signatures.js';
import { onboarding } from './_onboarding.js';
import { status } from './_status.js';

// Single catch-all route for every /api/portal/* endpoint — see
// api/calendar/[...action].js for why (Vercel Hobby plan's 12-function
// deployment cap). Every existing URL (/api/portal/invite,
// /api/portal/case-list, etc.) keeps working exactly as before.
export default async function handler(req, res) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  switch (action) {
    case 'invite': return invite(req, res);
    case 'accept-invite': return acceptInvite(req, res);
    case 'case-list': return caseList(req, res);
    case 'case-detail': return caseDetail(req, res);
    case 'signatures': return signatures(req, res);
    case 'onboarding': return onboarding(req, res);
    case 'status': return status(req, res);
    default: return res.status(404).json({ error: 'Not found' });
  }
}
