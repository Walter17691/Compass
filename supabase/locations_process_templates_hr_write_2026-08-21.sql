-- ============================================================================
-- Phase 6.5 hardening, Batch 3 — HR-only writes on locations/process_templates
-- ============================================================================
-- Both tables have always been genuinely org-config, HR-only surfaces —
-- LocationsSection.jsx returns null entirely for a non-HR user
-- (`if(!isHR) return null`), and SettingsScreen.jsx only lists the
-- "Process templates" nav section at all when isHR is true. But the RLS
-- policies backing both (locations_same_org, process_templates_same_org,
-- both FOR ALL) only ever checked org membership, not role — any
-- authenticated org member could bypass the UI gate entirely and
-- insert/update/delete either table directly via the Supabase REST API
-- with their own valid session. This is defense-in-depth the client-side
-- gate was never a substitute for.
--
-- Same HR-write / org-wide-read split already used for
-- organisation_themes (organisation_themes_2026-08-19.sql) and org_events
-- (org_events_2026-08-20.sql) — SELECT stays org-membership-only (every
-- org member legitimately needs to read the location list and process
-- templates), INSERT/UPDATE/DELETE gains the public.is_hr_role() check
-- against the caller's own org_members row.
--
-- HOW TO APPLY: paste the whole block below into the Supabase SQL Editor
-- and run.
-- ============================================================================

DROP POLICY IF EXISTS locations_same_org ON public.locations;

CREATE POLICY locations_select_same_org ON public.locations FOR SELECT
  USING (org_id IN (SELECT my_org_ids()));

CREATE POLICY locations_hr_insert ON public.locations FOR INSERT
  WITH CHECK (
    org_id IN (SELECT my_org_ids())
    AND EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = locations.org_id AND om.user_id = auth.uid() AND is_hr_role(om.role))
  );

CREATE POLICY locations_hr_update ON public.locations FOR UPDATE
  USING (
    org_id IN (SELECT my_org_ids())
    AND EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = locations.org_id AND om.user_id = auth.uid() AND is_hr_role(om.role))
  );

CREATE POLICY locations_hr_delete ON public.locations FOR DELETE
  USING (
    org_id IN (SELECT my_org_ids())
    AND EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = locations.org_id AND om.user_id = auth.uid() AND is_hr_role(om.role))
  );

DROP POLICY IF EXISTS process_templates_same_org ON public.process_templates;

CREATE POLICY process_templates_select_same_org ON public.process_templates FOR SELECT
  USING (org_id IN (SELECT my_org_ids()));

CREATE POLICY process_templates_hr_insert ON public.process_templates FOR INSERT
  WITH CHECK (
    org_id IN (SELECT my_org_ids())
    AND EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = process_templates.org_id AND om.user_id = auth.uid() AND is_hr_role(om.role))
  );

CREATE POLICY process_templates_hr_update ON public.process_templates FOR UPDATE
  USING (
    org_id IN (SELECT my_org_ids())
    AND EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = process_templates.org_id AND om.user_id = auth.uid() AND is_hr_role(om.role))
  );

CREATE POLICY process_templates_hr_delete ON public.process_templates FOR DELETE
  USING (
    org_id IN (SELECT my_org_ids())
    AND EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = process_templates.org_id AND om.user_id = auth.uid() AND is_hr_role(om.role))
  );
