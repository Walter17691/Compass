-- ============================================================================
-- Phase 6.5 hardening (P0) — audit_log readable org-wide, leaking everything
-- the source tables it republishes content from correctly protect
-- ============================================================================
-- audit_log's only SELECT policy (audit_log_select_org_member, baseline
-- schema) checked org membership alone — no role, no case-access, no
-- confidentiality check. In practice this means any org member (via the
-- ActivityBell "Recent activity" feed, or a direct query) could read:
--   - who's under investigation and why, for cases their own role has no
--     access to (confidential or otherwise out-of-scope cases)
--   - "Wellbeing note added (confidential)" entries naming the employee,
--     even though wellbeing_notes itself is HR-role-only
--   - "Concern referral submitted" entries naming the referral's subject,
--     even though concern_referrals itself is submitter+HR-only
--   - HR's own investigation comments and case interventions
--
-- Two-tier replacement, matching how audit_log rows actually split:
--   1. case_id IS NOT NULL — gated by the exact same case-access-and-
--      confidentiality predicate case_signals already uses (copied, not
--      re-derived, so both stay in agreement with cases' own two SELECT
--      policies).
--   2. case_id IS NULL — gated by "your own action, or an HR role." This
--      covers the genuinely sensitive non-case actions (wellbeing notes,
--      concern referrals) correctly. It's also a deliberate, small UX
--      narrowing for otherwise-benign entries whose SOURCE table is
--      already org-wide-readable (new starter/leaver/DSAR events) — those
--      remain fully visible via their own screens either way; only their
--      appearance in a non-HR member's ActivityBell feed narrows to their
--      own actions plus HR's. Judged an acceptable trade against a real
--      per-action-type string-matching policy, which would silently stop
--      protecting the very next new audit action type added without a
--      matching RLS edit — the same "one shared source of truth, not a
--      second implementation that drifts" reasoning as Cluster 2's
--      requireOrgRole helper.
--
-- Two known-in-scope write-side bugs made this fix incomplete on its own,
-- fixed alongside it in src/App.jsx: "Meeting saved", "Investigation
-- report generated", "AI-drafted letter approved for sending", and
-- "Development meeting saved" all had a case id available in the calling
-- scope but never passed it to audit(), so 100% of those rows had
-- case_id NULL — meaning tier 2 (HR-only-ish) would have wrongly hidden
-- ordinary case activity from that case's own rightful non-HR
-- investigator/manager. Fixed at the four call sites so these rows now
-- correctly fall into tier 1 (case-access-gated) going forward. Existing
-- rows already written with case_id NULL are not backfillable (no
-- reliable link preserved at write time) and simply become HR-only/
-- own-action-only under the new policy — the conservative direction for
-- a security fix, same choice made for signing_requests' own nullable
-- org_id column in the sibling migration.
--
-- HOW TO APPLY: paste the whole block below.
-- ============================================================================

drop policy if exists "audit_log_select_org_member" on public.audit_log;

create policy "audit_log_select_scoped" on public.audit_log
for select
using (
  (
    case_id is not null
    and exists (
      select 1 from public.cases c
      where c.id = audit_log.case_id
        and (
          (c.org_id in (select my_org_ids()) and can_access_case_location(c.org_id, c.location_id))
          or c.id in (select case_access.case_id from public.case_access where case_access.user_id = auth.uid())
        )
        and (
          c.confidential = false
          or c.created_by = auth.uid()
          or exists (select 1 from public.case_access ca where ca.case_id = c.id and ca.user_id = auth.uid())
          or exists (
            select 1 from public.org_members om
            where om.org_id = c.org_id and om.user_id = auth.uid() and has_confidential_case_oversight(om.role)
          )
        )
    )
  )
  or (
    case_id is null
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.org_members om
        where om.org_id = audit_log.org_id and om.user_id = auth.uid() and is_hr_role(om.role)
      )
    )
  )
);
