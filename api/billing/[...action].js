import { checkout } from './_checkout.js';
import { webhook } from './_webhook.js';
import { manage } from './_manage.js';

// Same catch-all convention as calendar/portal/cron — one function slot
// for the whole billing group.
//
// bodyParser disabled for the whole dispatcher (not just the webhook
// action): Stripe's webhook signature check needs the exact raw request
// bytes, which Vercel's automatic JSON body parsing would consume before
// _webhook.js ever sees them. checkout/manage are GET requests with no
// body, so this has no effect on them.
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const path = (req.url || '').split('?')[0];
  const action = path.split('/').filter(Boolean).pop();
  switch (action) {
    case 'checkout': return checkout(req, res);
    case 'webhook': return webhook(req, res);
    case 'manage': return manage(req, res);
    default: return res.status(404).json({ error: 'Not found' });
  }
}
