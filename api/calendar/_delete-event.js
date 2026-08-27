import { supabaseRequest } from './_supabase.js';
import { requireOrgMembership } from '../_auth.js';
import { providerAdapter, freshAccessToken, INTEGRATION_EVENT_PROVIDER } from './_providers.js';
import { logIntegrationEvent } from '../_integration_events.js';

export async function deleteEvent(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { provider, eventId, orgId } = req.body || {};
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;
  const caller = auth.caller;

  if (!provider || !eventId) return res.status(400).json({ error: 'provider and eventId are required' });

  try {
    // Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
    // scoped by the calling org, not just the caller's user_id — see
    // _create-event.js's sibling comment.
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${caller.id}&org_id=eq.${orgId}&provider=eq.${provider}&select=*`);
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
      const failureText = await delRes.text();
      console.error(`${provider} delete-event failed:`, failureText);
      await logIntegrationEvent({ orgId: connection.org_id, userId: caller.id, provider: INTEGRATION_EVENT_PROVIDER[provider], eventType: 'delete_event', status: 'error', detail: failureText });
      return res.status(502).json({ error: "Couldn't delete the calendar event" });
    }
    await logIntegrationEvent({ orgId: connection.org_id, userId: caller.id, provider: INTEGRATION_EVENT_PROVIDER[provider], eventType: 'delete_event', status: 'success' });
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('delete-event error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
