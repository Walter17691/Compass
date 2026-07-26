import { runDigest } from './_digest.js';
import { testNotify } from './_test-notify.js';
import { reassignNotify } from './_reassign-notify.js';

// Single catch-all route for /api/cron/* — same convention as
// api/calendar/[...action].js and api/portal/[...action].js, keeping the
// per-deployment function count under Vercel Hobby's 12-function cap.
// vercel.json's cron schedule still points at /api/cron/digest — that
// resolves through this dispatcher exactly like every other route here.
export default async function handler(req, res) {
  const path = (req.url || '').split('?')[0];
  const action = path.split('/').filter(Boolean).pop();
  switch (action) {
    case 'digest': {
      // Vercel attaches Authorization: Bearer $CRON_SECRET automatically
      // when the env var is set and the request comes from Vercel Cron —
      // this sends real email/webhook posts, so it must reject anyone else.
      const auth = req.headers.authorization || '';
      if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      try {
        const result = await runDigest();
        return res.status(200).json(result);
      } catch (e) {
        console.error('Digest cron error:', e.message);
        return res.status(500).json({ error: e.message });
      }
    }
    case 'test-notify':
      return testNotify(req, res);
    case 'reassign-notify':
      return reassignNotify(req, res);
    default:
      return res.status(404).json({ error: 'Not found' });
  }
}
