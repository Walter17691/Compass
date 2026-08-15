import { supabaseRequest } from '../_supabase.js';
import { verifyCaller } from '../_auth.js';

export async function gmailStatus(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const userId = caller.id;

  try {
    const connRes = await supabaseRequest(`graph_mail_connections?user_id=eq.${userId}&provider=eq.google&select=mailbox_email`);
    const connections = await connRes.json();
    if (connections.length === 0) return res.status(200).json({ connected: false, mailbox: null });
    res.status(200).json({ connected: true, mailbox: connections[0].mailbox_email });
  } catch (e) {
    console.error('Gmail status error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
