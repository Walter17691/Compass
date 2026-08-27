import { supabaseRequest } from './_supabase.js';
import { requireOrgMembership } from '../_auth.js';
import { logIntegrationEvent } from '../_integration_events.js';

// No calendar_synced_events cleanup here, unlike Google Calendar's own
// _disconnect.js — that table is only ever populated by _sync.js's
// deadline push, which is still Google-only (this phase adds the
// create/update/delete-event primitive for real meetings, not a second
// provider for the deadline sync), so no row could exist for a
// microsoft connection to clean up.
//
// Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
// the DELETE itself (not just the lookup) was scoped by user_id+provider
// alone, so disconnecting Microsoft 365 Calendar for one org deleted
// every org's connection for this user+provider. Both queries now
// target this org's own row specifically.
export async function ms365Disconnect(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId } = req.body || {};
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;
  const userId = auth.caller.id;

  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${userId}&org_id=eq.${orgId}&provider=eq.microsoft&select=org_id`);
    const connections = await connRes.json();
    await supabaseRequest(`calendar_connections?user_id=eq.${userId}&org_id=eq.${orgId}&provider=eq.microsoft`, { method: 'DELETE' });
    if (connections[0]) await logIntegrationEvent({ orgId: connections[0].org_id, userId, provider: 'ms365_calendar', eventType: 'disconnect', status: 'success' });
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('MS365 calendar disconnect error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
