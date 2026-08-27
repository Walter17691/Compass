import { supabaseRequest } from '../_supabase.js';
import { requireOrgMembership } from '../_auth.js';

// Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
// scoped by the calling org — see api/calendar/_status.js's sibling
// comment.
export async function status(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const { orgId } = req.query;
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;
  const userId = auth.caller.id;

  try {
    const connRes = await supabaseRequest(`graph_mail_connections?user_id=eq.${userId}&org_id=eq.${orgId}&provider=eq.microsoft&select=mailbox_email`);
    const connections = await connRes.json();
    if (connections.length === 0) return res.status(200).json({ connected: false, mailbox: null });
    res.status(200).json({ connected: true, mailbox: connections[0].mailbox_email });
  } catch (e) {
    console.error('Graph mail status error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
