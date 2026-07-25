import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

export async function status(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const userId = caller.id;

  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${userId}&select=provider`);
    const connections = await connRes.json();
    if (connections.length === 0) return res.status(200).json({ connected: false, provider: null });
    res.status(200).json({ connected: true, provider: connections[0].provider });
  } catch (e) {
    console.error('Calendar status error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
