import { runDigest } from './_digest.js';

// Vercel attaches Authorization: Bearer $CRON_SECRET automatically when the
// CRON_SECRET env var is set and the request comes from Vercel Cron — this
// endpoint sends real email to real people, so it must reject anyone else.
export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await runDigest();
    res.status(200).json(result);
  } catch (e) {
    console.error('Digest cron error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
