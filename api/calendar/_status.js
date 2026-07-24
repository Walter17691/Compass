import { supabaseRequest } from './_supabase.js';

export async function status(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

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
