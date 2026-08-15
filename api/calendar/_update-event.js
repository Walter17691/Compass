import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';
import { providerAdapter, freshAccessToken, INTEGRATION_EVENT_PROVIDER } from './_providers.js';
import { logIntegrationEvent } from '../_integration_events.js';

// Unlike createEvent (which fires on every connected calendar at once),
// update/delete act on one specific {provider, eventId} pair — the
// caller already knows which calendar the original event landed on
// (createEvent's own response tells it), so there's no ambiguity to
// resolve here.
export async function updateEvent(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { provider, eventId, title, description, startISO, endISO, attendees } = req.body || {};
  if (!provider || !eventId || !title || !startISO || !endISO) return res.status(400).json({ error: 'provider, eventId, title, startISO and endISO are required' });

  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${caller.id}&provider=eq.${provider}&select=*`);
    const connection = (await connRes.json())[0];
    if (!connection) return res.status(404).json({ error: `No ${provider} calendar connection for this user` });

    const adapter = providerAdapter(provider);
    const accessToken = await freshAccessToken(connection);
    const event = adapter.buildEvent({ title, description, startISO, endISO, attendees });
    const updateRes = await adapter.request(accessToken, `${adapter.eventsPath}/${eventId}`, { method: adapter.updateMethod, body: JSON.stringify(event) });
    if (!updateRes.ok) {
      const failureText = await updateRes.text();
      console.error(`${provider} update-event failed:`, failureText);
      await logIntegrationEvent({ orgId: connection.org_id, userId: caller.id, provider: INTEGRATION_EVENT_PROVIDER[provider], eventType: 'update_event', status: 'error', detail: failureText });
      return res.status(502).json({ error: "Couldn't update the calendar event" });
    }
    await logIntegrationEvent({ orgId: connection.org_id, userId: caller.id, provider: INTEGRATION_EVENT_PROVIDER[provider], eventType: 'update_event', status: 'success', detail: title });
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('update-event error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
