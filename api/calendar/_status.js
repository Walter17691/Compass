import { supabaseRequest } from './_supabase.js';
import { requireOrgMembership } from '../_auth.js';

// Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
// was scoped by user_id alone, so a multi-org user saw "connected"
// (and, worse, whichever provider happened to be connected for a
// DIFFERENT org) while working in an org that has no connection of its
// own at all.
export async function status(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId } = req.query;
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;
  const userId = auth.caller.id;

  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${userId}&org_id=eq.${orgId}&select=provider`);
    const connections = await connRes.json();
    if (connections.length === 0) return res.status(200).json({ connected: false, provider: null });
    res.status(200).json({ connected: true, provider: connections[0].provider });
  } catch (e) {
    console.error('Calendar status error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
