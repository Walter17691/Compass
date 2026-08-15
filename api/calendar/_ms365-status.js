import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

export async function ms365Status(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const userId = caller.id;

  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${userId}&provider=eq.microsoft&select=provider`);
    const connections = await connRes.json();
    res.status(200).json({ connected: connections.length > 0 });
  } catch (e) {
    console.error('MS365 calendar status error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
