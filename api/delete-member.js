import { requireOrgRole } from './_auth.js';
import { isHrRole } from '../src/lib/roles.js';

const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseRequest(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
}

// Phase 6.5 hardening (structural remediation, Prompt 12 — Identity
// Deletion / Multi-Org Membership invariant). This endpoint used to (a)
// look up the caller's own role with no org filter — for a multi-org
// caller (an explicitly supported scenario, e.g. an HR consultant who is
// hr_director at one client and a lower role at another) this resolved
// to an arbitrary one of their org_members rows, not necessarily the one
// for the org actually being administered; (b) had no role hierarchy, so
// an hr_manager could remove an hr_director, and no guard against
// removing the org's only hr_director or removing yourself; and (c) most
// seriously, after deleting the org_members row it unconditionally
// called DELETE /auth/v1/admin/users/<id> — destroying the caller's
// entire Compass IDENTITY, not just their membership in this one org.
// Since a single auth.users row can hold memberships in several
// different organisations, "remove this person from OUR team" was
// silently also deleting their unrelated directorship at every other org
// they belong to, with no recovery path. The fix: this endpoint only
// ever removes the org_members row for the org actually named in the
// request (via requireOrgRole, the same org-scoping every other
// service-role endpoint uses); it never touches auth.users at all.
// Account-level (cross-org) deletion is a different, much bigger
// decision than "remove from one team" and does not exist as a feature
// today — it should be its own explicit, separately-confirmed flow if
// ever built, not a side effect of this one.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgMemberId, orgId } = req.body;
  if (!orgMemberId) return res.status(400).json({ error: 'orgMemberId is required' });

  const auth = await requireOrgRole(req, res, orgId, isHrRole);
  if (!auth) return;

  try {
    const targetRes = await supabaseRequest(`org_members?id=eq.${encodeURIComponent(orgMemberId)}&org_id=eq.${encodeURIComponent(orgId)}&select=org_id,user_id,role`);
    const [targetMember] = await targetRes.json();
    if (!targetMember) return res.status(404).json({ error: 'Member not found in this organisation' });

    if (targetMember.user_id === auth.caller.id) {
      return res.status(400).json({ error: "You can't remove yourself from the team this way." });
    }

    // Only an hr_director may remove another hr_director — an hr_manager
    // removing their own director would be a real privilege inversion.
    if (targetMember.role === 'hr_director' && auth.role !== 'hr_director') {
      return res.status(403).json({ error: 'Only an HR Director can remove another HR Director' });
    }

    // Never let the org be left with zero HR Directors — that's a
    // permanent lockout with no recovery path (nobody left who can grant
    // roles, manage billing-sensitive settings, etc.).
    if (targetMember.role === 'hr_director') {
      const directorsRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&role=eq.hr_director&select=id`);
      const directors = await directorsRes.json();
      if (directors.length <= 1) {
        return res.status(400).json({ error: "This organisation's only HR Director can't be removed. Assign the role to someone else first." });
      }
    }

    const delRes = await supabaseRequest(`org_members?id=eq.${encodeURIComponent(orgMemberId)}&org_id=eq.${encodeURIComponent(orgId)}`, { method: 'DELETE' });
    if (!delRes.ok) { const text = await delRes.text(); return res.status(500).json({ error: text }); }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete member error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
