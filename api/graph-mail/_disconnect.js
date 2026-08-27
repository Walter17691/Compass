import { supabaseRequest } from '../_supabase.js';
import { requireOrgMembership } from '../_auth.js';
import { logIntegrationEvent } from '../_integration_events.js';

// Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) — the
// DELETE itself was scoped by user_id+provider alone, so disconnecting
// Outlook for one org deleted every org's connection for this user.
// Both queries now target this org's own row specifically.
export async function disconnect(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId } = req.body || {};
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;
  const userId = auth.caller.id;

  try {
    const connRes = await supabaseRequest(`graph_mail_connections?user_id=eq.${userId}&org_id=eq.${orgId}&provider=eq.microsoft&select=org_id`);
    const connections = await connRes.json();
    await supabaseRequest(`graph_mail_connections?user_id=eq.${userId}&org_id=eq.${orgId}&provider=eq.microsoft`, { method: 'DELETE' });
    if (connections[0]) await logIntegrationEvent({ orgId: connections[0].org_id, userId, provider: 'outlook_mail', eventType: 'disconnect', status: 'success' });
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Graph mail disconnect error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
