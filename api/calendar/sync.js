import { supabaseRequest } from './_supabase.js';
import { getValidAccessToken, googleCalendarRequest, deadlineToGoogleEvent } from './_google.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, deadlines } = req.body;
  if (!userId || !Array.isArray(deadlines)) {
    return res.status(400).json({ error: 'userId and deadlines[] are required' });
  }

  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${userId}&provider=eq.google&select=*`);
    const connections = await connRes.json();
    const connection = connections[0];
    if (!connection) return res.status(404).json({ error: 'No Google Calendar connection for this user' });

    const { accessToken, newExpiresAt } = await getValidAccessToken(connection);
    if (newExpiresAt) {
      await supabaseRequest(`calendar_connections?id=eq.${connection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ access_token: accessToken, expires_at: newExpiresAt, updated_at: new Date().toISOString() }),
      });
    }

    const existingRes = await supabaseRequest(`calendar_synced_events?connection_id=eq.${connection.id}&select=*`);
    const existing = await existingRes.json();
    const existingByKey = new Map(existing.map(e => [e.deadline_key, e]));
    const incomingKeys = new Set(deadlines.filter(d => d.key).map(d => d.key));

    let created = 0, updated = 0, deleted = 0;

    // Create or update every incoming deadline.
    for (const deadline of deadlines) {
      if (!deadline.key) continue; // skip anything without a stable key — nothing to diff against
      const event = deadlineToGoogleEvent(deadline);
      const existingEvent = existingByKey.get(deadline.key);

      if (existingEvent) {
        const putRes = await googleCalendarRequest(accessToken, `events/${existingEvent.calendar_event_id}`, {
          method: 'PUT',
          body: JSON.stringify(event),
        });
        if (putRes.ok) updated++;
      } else {
        const postRes = await googleCalendarRequest(accessToken, 'events', {
          method: 'POST',
          body: JSON.stringify(event),
        });
        if (postRes.ok) {
          const created_event = await postRes.json();
          await supabaseRequest('calendar_synced_events', {
            method: 'POST',
            body: JSON.stringify({
              connection_id: connection.id,
              deadline_key: deadline.key,
              calendar_event_id: created_event.id,
            }),
          });
          created++;
        }
      }
    }

    // Delete synced events for deadlines that no longer appear (resolved/closed).
    for (const e of existing) {
      if (!incomingKeys.has(e.deadline_key)) {
        await googleCalendarRequest(accessToken, `events/${e.calendar_event_id}`, { method: 'DELETE' });
        await supabaseRequest(`calendar_synced_events?id=eq.${e.id}`, { method: 'DELETE' });
        deleted++;
      }
    }

    res.status(200).json({ success: true, created, updated, deleted });
  } catch (e) {
    console.error('Calendar sync error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
