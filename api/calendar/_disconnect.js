import { supabaseRequest } from './_supabase.js';
import { getValidAccessToken, googleCalendarRequest } from './_google.js';
import { requireOrgMembership } from '../_auth.js';
import { logIntegrationEvent } from '../_integration_events.js';

// Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
// was scoped (both lookup and delete) by user_id alone: disconnecting
// while working in one org silently broke sync for every other org the
// user has separately connected. Both the lookup and the delete below
// now target this org's own connection row specifically.
export async function disconnect(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId } = req.body || {};
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;
  const userId = auth.caller.id;

  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${userId}&org_id=eq.${orgId}&provider=eq.google&select=*`);
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
