import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';
import { providerAdapter, freshAccessToken, INTEGRATION_EVENT_PROVIDER } from './_providers.js';
import { logIntegrationEvent } from '../_integration_events.js';

// Integrations & Workflow Automation (Phase 5, IP3) — the real
// create-a-timed-event primitive Track C's meeting-scheduling phase
// (IP15+) calls into, distinct from _sync.js's own deadline-specific
// batch diff. Creates the event on EVERY calendar the calling user has
// connected (a user could have both Google and Microsoft 365 connected
// at once) rather than picking one — which calendar(s) to target, and
// what to do with the returned {provider, eventId} pairs, is a decision
// for whichever later phase actually calls this; this endpoint just
// makes creation possible.
export async function createEvent(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { title, description, startISO, endISO, attendees } = req.body || {};
  if (!title || !startISO || !endISO) return res.status(400).json({ error: 'title, startISO and endISO are required' });

  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${caller.id}&select=*`);
    const connections = await connRes.json();
    if (!connections.length) return res.status(404).json({ error: 'No connected calendar for this user' });

    const results = [];
    for (const connection of connections) {
      const adapter = providerAdapter(connection.provider);
      const accessToken = await freshAccessToken(connection);
      const event = adapter.buildEvent({ title, description, startISO, endISO, attendees });
      const postRes = await adapter.request(accessToken, adapter.eventsPath, { method: 'POST', body: JSON.stringify(event) });
      if (postRes.ok) {
        const created = await postRes.json();
        results.push({ provider: connection.provider, eventId: created.id });
        await logIntegrationEvent({ orgId: connection.org_id, userId: caller.id, provider: INTEGRATION_EVENT_PROVIDER[connection.provider], eventType: 'create_event', status: 'success', detail: title });
      } else {
        const failureText = await postRes.text();
        console.error(`${connection.provider} create-event failed:`, failureText);
        await logIntegrationEvent({ orgId: connection.org_id, userId: caller.id, provider: INTEGRATION_EVENT_PROVIDER[connection.provider], eventType: 'create_event', status: 'error', detail: failureText });
      }
    }

    if (!results.length) return res.status(502).json({ error: "Couldn't create the event on any connected calendar" });
    res.status(200).json({ success: true, events: results });
  } catch (e) {
    console.error('create-event error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
