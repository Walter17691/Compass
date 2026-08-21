-- ============================================================================
-- Phase 6.5 hardening, Batch 3 — concern_referrals: bind submitted_by,
-- scope the submitter-update policy to the caller's own org
-- ============================================================================
-- Two gaps in the existing concern_referrals policies
-- (concern_referrals_2026-08-12.sql, manager_enablement_security_
-- hardening_2026-08-14.sql):
--
-- 1. The INSERT policy ("Any org member can submit a concern referral")
--    only checked org_id in my_org_ids() — nothing tied submitted_by to
--    the caller's own auth.uid(). The real client (App.jsx's
--    saveConcernReferralToDB) always sets submitted_by: user?.id, so this
--    matches legitimate behaviour exactly; it only closes off a direct
--    REST-API caller forging submitted_by as a different org member,
--    which would both misattribute a concern to someone who never
--    reported it and let the forger read it back later via the
--    submitted_by = auth.uid() branch of the SELECT policy.
--
-- 2. "Submitters can update their own referral" (added in the 08-14
--    hardening pass so generateConcernTriageSummary's own upsert doesn't
--    get rejected for a non-HR submitter) checks only submitted_by =
--    auth.uid(), with no org_id bound — unlike every other org-scoped
--    policy in this schema. A user removed from org_members after
--    submitting a referral (the row itself is never deleted) could still
--    update it indefinitely, since ownership alone, not current
--    membership, gated the row. Adding the same org_id in my_org_ids()
--    check every sibling policy already uses closes that.
--
-- HOW TO APPLY: paste the whole block below into the Supabase SQL Editor
-- and run.
-- ============================================================================

DROP POLICY IF EXISTS "Any org member can submit a concern referral" ON public.concern_referrals;

CREATE POLICY "Any org member can submit a concern referral"
ON public.concern_referrals FOR INSERT
WITH CHECK (
  org_id IN (SELECT public.my_org_ids())
  AND submitted_by = auth.uid()
);

DROP POLICY IF EXISTS "Submitters can update their own referral" ON public.concern_referrals;

CREATE POLICY "Submitters can update their own referral"
ON public.concern_referrals FOR UPDATE
USING (
  submitted_by = auth.uid()
  AND org_id IN (SELECT public.my_org_ids())
);
