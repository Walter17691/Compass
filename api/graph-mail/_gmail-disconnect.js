import { supabaseRequest } from '../_supabase.js';
import { requireOrgMembership } from '../_auth.js';
import { logIntegrationEvent } from '../_integration_events.js';

// Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) — see
// _disconnect.js's sibling comment.
export async function gmailDisconnect(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId } = req.body || {};
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;
  const userId = auth.caller.id;

  try {
    const connRes = await supabaseRequest(`graph_mail_connections?user_id=eq.${userId}&org_id=eq.${orgId}&provider=eq.google&select=org_id`);
    const connections = await connRes.json();
    await supabaseRequest(`graph_mail_connections?user_id=eq.${userId}&org_id=eq.${orgId}&provider=eq.google`, { method: 'DELETE' });
    if (connections[0]) await logIntegrationEvent({ orgId: connections[0].org_id, userId, provider: 'gmail', eventType: 'disconnect', status: 'success' });
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Gmail disconnect error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
