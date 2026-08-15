import { supabaseRequest } from '../_supabase.js';
import { verifyCaller } from '../_auth.js';

export async function gmailDisconnect(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const userId = caller.id;

  try {
    await supabaseRequest(`graph_mail_connections?user_id=eq.${userId}&provider=eq.google`, { method: 'DELETE' });
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Gmail disconnect error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
