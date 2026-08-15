import { supabaseRequest } from './_supabase.js';
import { getValidAccessToken, googleCalendarRequest } from './_google.js';
import { verifyCaller } from '../_auth.js';
import { logIntegrationEvent } from '../_integration_events.js';

export async function disconnect(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const userId = caller.id;

  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${userId}&provider=eq.google&select=*`);
    const connections = await connRes.json();
    const connection = connections[0];
    if (!connection) return res.status(200).json({ success: true }); // already disconnected

    // Best-effort cleanup of events Compass created — a failed delete here
    // shouldn't block the user from disconnecting.
    try {
      const { accessToken } = await getValidAccessToken(connection);
      const existingRes = await supabaseRequest(`calendar_synced_events?connection_id=eq.${connection.id}&select=*`);
      const existing = await existingRes.json();
      for (const e of existing) {
        await googleCalendarRequest(accessToken, `events/${e.calendar_event_id}`, { method: 'DELETE' });
      }
    } catch (cleanupErr) {
      console.error('Calendar disconnect cleanup failed (continuing):', cleanupErr.message);
    }

    await supabaseRequest(`calendar_connections?id=eq.${connection.id}`, { method: 'DELETE' });
    // calendar_synced_events rows cascade-delete via the FK constraint.

    await logIntegrationEvent({ orgId: connection.org_id, userId, provider: 'google_calendar', eventType: 'disconnect', status: 'success' });
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Calendar disconnect error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
