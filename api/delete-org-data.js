import { verifyCaller } from './_auth.js';
import { ORG_SCOPED_TABLES } from '../src/lib/dataInventory.js';

// Phase 7 (Controlled Beta Infrastructure Gate 3) — see api/_supabase.js
// for why this is now configurable via env var with a production fallback.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin.supabase.co';
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
// organisations, org_members, locations, process_templates, org_roles and
// calendar/mail connections alone (account/org-structure config, not case
// or employee content).
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
//
// Phase 6.5 hardening (data-lifecycle review) — a full data-inventory
// pass against the live schema found ten more org-scoped tables this list
// had simply never covered, none reachable via any other table's cascade
// (verified live against information_schema — every one of these has its
// own direct org_id column, no case_id at all):
//   - signing_requests: holds the actual signature and document text
//     sent for signature — real, sensitive personal data, previously left
//     behind entirely by this button.
//   - employee_records: the core PII record (job title, department,
//     manager, employee number) — the single biggest miss; matched to
//     cases only by employee_name string, so nothing else's cascade ever
//     reached it.
//   - employee_portal_accounts / employee_portal_invites: an employee's
//     own access to view their case data — leaving these behind after
//     "delete everything" would leave a live login path into records
//     that (elsewhere in this same delete) no longer exist.
//   - case_views: no FK at all (confirmed via information_schema — plain
//     uuid columns), so nothing was ever going to clean these up.
//   - improvement_initiatives, manager_capability_insights,
//     er_executive_briefs, org_events, integration_events: AI-generated
//     or activity-log content the DSAR/inventory review's own "AI-
//     generated case information" and "audit records" categories cover.
//
// Phase 6.5 hardening (structural remediation, Prompt 12 — GDPR
// Ownership / DSAR / Erasure Completeness invariant) — an independent
// audit found this hand-maintained list had drifted again:
// organisation_themes (AI-derived org-wide theme taxonomy content) had
// no FK to anything and was never covered. case_access was also flagged,
// but live verification found it now carries a NOT NULL, ON DELETE
// CASCADE FK to cases — already fully erased for free; adding it here
// would be redundant, not a fix (see src/lib/dataInventory.js for the
// full, currently-verified breakdown of every org-scoped table, cascade-
// covered or otherwise). The list itself now lives in that one shared
// module instead of being redefined here, so there's only one place to
// keep current, and a completeness test can check it independently of
// this handler.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId } = req.body;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=role,name`);
    const [callerMember] = await memberRes.json();
    if (!callerMember) return res.status(403).json({ error: 'Not a member of this organisation' });
    if (callerMember.role !== 'hr_director') {
      return res.status(403).json({ error: 'Only an HR Director can delete all organisation data' });
    }

    // Phase 6.5 hardening (structural remediation, Prompt 12 — GDPR
    // completeness invariant) — this used to console.error a failed
    // table delete and continue, then unconditionally return
    // {success:true} regardless — a GDPR Art. 17 erasure request that
    // reports success while real personal data silently remains in one
    // or more tables. Every table's own result is now collected and
    // returned; a single failed table makes the whole response an honest
    // failure, since a partial erasure is not the "all data deleted"
    // guarantee this endpoint exists to make.
    const failedTables = [];
    for (const table of ORG_SCOPED_TABLES) {
      const r = await supabaseRequest(`${table}?org_id=eq.${encodeURIComponent(orgId)}`, { method: 'DELETE' });
      if (!r.ok) { failedTables.push(table); console.error(`delete-org-data: failed to clear ${table}:`, await r.text()); }
    }

    // audit_log is cleared last, separately from the loop above, so this
    // deletion event itself can be recorded as the one surviving row —
    // the standard compliance expectation ("who deleted this org's data,
    // and when") shouldn't itself be a casualty of the very action it's
    // recording. No case/employee specifics in the detail — just the
    // fact that this happened, matching the "no unnecessary sensitive
    // detail in the audit log" principle applied everywhere else in this
    // table.
    const auditRes = await supabaseRequest(`audit_log?org_id=eq.${encodeURIComponent(orgId)}`, { method: 'DELETE' });
    if (!auditRes.ok) { failedTables.push('audit_log'); console.error('delete-org-data: failed to clear audit_log:', await auditRes.text()); }
    const recordRes = await supabaseRequest('audit_log', {
      method: 'POST',
      body: JSON.stringify({
        org_id: orgId, user_id: caller.id, user_name: callerMember.name || caller.email || 'Unknown',
        action: 'Organisation data deleted',
        detail: failedTables.length
          ? `Deletion PARTIALLY FAILED for: ${failedTables.join(', ')}. All other case, employee, wellbeing, concern-referral, signing and portal-access records for this organisation were permanently deleted (GDPR "Delete all data").`
          : 'All case, employee, wellbeing, concern-referral, signing and portal-access records for this organisation were permanently deleted (GDPR "Delete all data").',
        created_at: new Date().toISOString(),
      }),
    });
    if (!recordRes.ok) console.error('delete-org-data: failed to record the deletion event itself:', await recordRes.text());

    if (failedTables.length) {
      return res.status(500).json({ success: false, error: `Deletion failed for: ${failedTables.join(', ')}. Please contact support — some data was not erased.`, failedTables });
    }
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete org data error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
