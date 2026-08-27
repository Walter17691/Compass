import { supabaseRequest } from './_supabase.js';
import { requireOrgMembership } from '../_auth.js';

// Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
// scoped by the calling org — see _status.js's sibling comment.
export async function ms365Status(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const { orgId } = req.query;
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;
  const userId = auth.caller.id;

  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${userId}&org_id=eq.${orgId}&provider=eq.microsoft&select=provider`);
    const connections = await connRes.json();
    res.status(200).json({ connected: connections.length > 0 });
  } catch (e) {
    console.error('MS365 calendar status error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
