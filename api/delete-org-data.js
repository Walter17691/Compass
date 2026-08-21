import { verifyCaller } from './_auth.js';

const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseRequest(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
}

// The "Delete all data" button in Settings has always been scoped to case
// and employee working data, not the org/team structure itself — deleting
// the organisation or removing teammates is a different, much bigger
// action than what this button has ever promised. This deletes every
// table that holds case/employee content; it deliberately leaves
// organisations, org_members, locations and calendar/portal connections
// alone.
//
// Phase 6.5 hardening (Batch 5) — added wellbeing_notes, concern_referrals,
// leaver_instances and case_tasks. Verified against the live schema's real
// FK cascade rules before changing anything: allegations, case_signals and
// case_themes all have a NOT NULL case_id with ON DELETE CASCADE from
// cases, so they're already fully erased for free the moment this
// handler's own `cases` delete runs — adding them here would be inert.
// case_tasks is the one exception: case_id is nullable (org-level actions
// with no linked case, added by OP21), so an org-level task would have
// silently survived the cases cascade with no case row left to trigger
// it. wellbeing_notes and leaver_instances have no case_id at all, and
// concern_referrals.linked_case_id is ON DELETE SET NULL, not CASCADE —
// none of the three were reachable through any other table's cascade.
const ORG_SCOPED_TABLES = ['cases', 'starter_instances', 'dsar_requests', 'hr_review_requests', 'audit_log', 'wellbeing_notes', 'concern_referrals', 'leaver_instances', 'case_tasks'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId } = req.body;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=role`);
    const [callerMember] = await memberRes.json();
    if (!callerMember) return res.status(403).json({ error: 'Not a member of this organisation' });
    if (callerMember.role !== 'hr_director') {
      return res.status(403).json({ error: 'Only an HR Director can delete all organisation data' });
    }

    for (const table of ORG_SCOPED_TABLES) {
      const r = await supabaseRequest(`${table}?org_id=eq.${encodeURIComponent(orgId)}`, { method: 'DELETE' });
      if (!r.ok) console.error(`delete-org-data: failed to clear ${table}:`, await r.text());
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete org data error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
