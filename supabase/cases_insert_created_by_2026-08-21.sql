-- ============================================================================
-- Phase 6.5 hardening, Batch 3 — bind cases.created_by to the real caller
-- on INSERT
-- ============================================================================
-- Verified live (pg_policies on public.cases) before writing this: UPDATE
-- and DELETE already carry a real RESTRICTIVE policy scoping non-oversight
-- members to their own assigned cases — that part of the schema is
-- already correct and isn't touched here. INSERT has no RESTRICTIVE
-- policy at all; it falls through to the permissive "Users can access
-- cases in their org or assigned to them" ALL policy, which (having no
-- explicit WITH CHECK) reuses its USING clause — org_id + location
-- scoping only. Nothing ties created_by to the inserting user.
--
-- App.jsx's saveCaseToDB always sets created_by: caseObj.createdBy ||
-- user?.id — for every real insert path (the intake form, CSV import)
-- caseObj.createdBy is never pre-populated, so this is always the
-- current user's own id; created_by is only ever preserved as someone
-- else's id on a later UPDATE of an existing case (deliberately, per
-- saveCaseToDB's own comment — "preserve the original creator across
-- edits by other staff", since the confidential-case RLS SELECT policy
-- grants access by this field). A RESTRICTIVE INSERT-only check matches
-- every legitimate call site and closes off a direct REST-API caller
-- forging created_by as a different org member on a brand new row —
-- which would falsely attribute a fabricated case to someone who never
-- created it, and grant that forged creator confidential-case access to
-- it via the existing SELECT policy's `created_by = auth.uid()` branch.
--
-- owner_id is deliberately left unconstrained here — App.jsx's own
-- new-case flow (newCaseOwnerId || user?.id) legitimately lets the
-- creator assign a different org member as the case owner right from
-- creation, unlike created_by.
--
-- HOW TO APPLY: paste the whole block below into the Supabase SQL Editor
-- and run.
-- ============================================================================

CREATE POLICY "New cases must record the real inserting user as creator"
ON public.cases AS RESTRICTIVE FOR INSERT
WITH CHECK (created_by = auth.uid());
