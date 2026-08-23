import { invite } from './_invite.js';
import { acceptInvite } from './_accept-invite.js';
import { caseList } from './_case-list.js';
import { caseDetail } from './_case-detail.js';
import { signatures } from './_signatures.js';
import { onboarding } from './_onboarding.js';
import { status } from './_status.js';
import { notifyDocument } from './_notify-document.js';
import { listAccounts } from './_accounts.js';
import { revokeAccess } from './_revoke-access.js';
import { dsarLookup } from './_dsar-lookup.js';

// Single catch-all route for every /api/portal/* endpoint — see
// api/calendar/[...action].js for why (Vercel Hobby plan's 12-function
// deployment cap). Every existing URL (/api/portal/invite,
// /api/portal/case-list, etc.) keeps working exactly as before.
//
// Parses the action from req.url directly rather than req.query.action —
// relying on Vercel populating a catch-all route param into req.query
// turned out to be unreliable for a plain (non-Next.js) Serverless
// Function, and req.url is always accurate regardless of routing quirks.
export default async function handler(req, res) {
  const path = (req.url || '').split('?')[0];
  const action = path.split('/').filter(Boolean).pop();
  switch (action) {
    case 'invite': return invite(req, res);
    case 'accept-invite': return acceptInvite(req, res);
    case 'case-list': return caseList(req, res);
    case 'case-detail': return caseDetail(req, res);
    case 'signatures': return signatures(req, res);
    case 'onboarding': return onboarding(req, res);
    case 'status': return status(req, res);
    case 'notify-document': return notifyDocument(req, res);
    case 'accounts': return listAccounts(req, res);
    case 'revoke-access': return revokeAccess(req, res);
    case 'dsar-lookup': return dsarLookup(req, res);
    default: return res.status(404).json({ error: 'Not found' });
  }
}
