import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';
import { providerAdapter, freshAccessToken } from './_providers.js';

export async function deleteEvent(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { provider, eventId } = req.body || {};
  if (!provider || !eventId) return res.status(400).json({ error: 'provider and eventId are required' });

  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${caller.id}&provider=eq.${provider}&select=*`);
    const connection = (await connRes.json())[0];
    if (!connection) return res.status(404).json({ error: `No ${provider} calendar connection for this user` });

    const adapter = providerAdapter(provider);
    const accessToken = await freshAccessToken(connection);
    const delRes = await adapter.request(accessToken, `${adapter.eventsPath}/${eventId}`, { method: 'DELETE' });
    // 404 here just means the event is already gone (e.g. the user
    // deleted it directly in their calendar app) — not a failure worth
    // surfacing, since the caller's own intent (this event should no
    // longer exist) is already satisfied either way.
    if (!delRes.ok && delRes.status !== 404) {
      console.error(`${provider} delete-event failed:`, await delRes.text());
      return res.status(502).json({ error: "Couldn't delete the calendar event" });
    }
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('delete-event error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
