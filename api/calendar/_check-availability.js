import { supabaseRequest } from './_supabase.js';
import { requireOrgMembership } from '../_auth.js';
import { providerAdapter, freshAccessToken, availabilityPath, availabilityRequestOptions, normalizeAvailabilityEvents } from './_providers.js';

// Integrations & Workflow Automation (Phase 5, IP16, §10) — "availability
// checks where authorised": only ever the CALLER's own connected
// calendar(s), never another attendee's — nobody else has granted this
// app access to their calendar, so there's nothing else it's authorised
// to read. A user with no connected calendar gets checked:false rather
// than an error — this is an optional enhancement to scheduling, not a
// hard requirement.
export async function checkAvailability(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { startISO, endISO, orgId } = req.query;
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;
  const caller = auth.caller;

  if (!startISO || !endISO) return res.status(400).json({ error: 'startISO and endISO are required' });

  try {
    // Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
    // scoped by the calling org — see _create-event.js's sibling comment.
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${caller.id}&org_id=eq.${orgId}&select=*`);
    const connections = await connRes.json();
    if (!connections.length) return res.status(200).json({ checked: false, conflicts: [] });

    const conflicts = [];
    for (const connection of connections) {
      const adapter = providerAdapter(connection.provider);
      const accessToken = await freshAccessToken(connection);
      const path = availabilityPath(connection.provider, startISO, endISO);
      const evRes = await adapter.request(accessToken, path, availabilityRequestOptions(connection.provider));
      if (evRes.ok) {
        conflicts.push(...normalizeAvailabilityEvents(connection.provider, await evRes.json()));
      } else {
        console.error(`${connection.provider} check-availability failed:`, await evRes.text());
      }
    }
    res.status(200).json({ checked: true, conflicts });
  } catch (e) {
    console.error('check-availability error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
