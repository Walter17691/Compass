-- Organisational ER Intelligence (Phase 6, OP21, §17) — actions from
-- insights. Generalises case_tasks (previously always case-scoped, see
-- supabase/case_structure_2026-08-09.sql) to also support org-level
-- action items created directly from an Insights card (a trend, an
-- early signal, a risk-map flag) rather than a specific case. Reuses
-- the exact same table, pure caseTasks.js helpers, and Supabase
-- persistence path as every case-scoped task — not a second system.
--
-- case_id becomes nullable (an org-level action has no case) and gains
-- insight_ref: a short, honest free-text label naming which insight the
-- action came from (e.g. "Trend: Grievance cases (last 90 days)"). Free
-- text, not a foreign key, because there is no shared insight-id space
-- across the panels this spans (trend rows, risk-map flags, root-cause
-- explorations each have their own shape) — same reasoning
-- org_events.affected_locations already used for a real-world label
-- with no backing table to key against.

alter table public.case_tasks alter column case_id drop not null;
alter table public.case_tasks add column if not exists insight_ref text;

-- The existing policy's USING clause is a single EXISTS against cases
-- joined on case_tasks.case_id — with case_id nullable that EXISTS never
-- matches a null, silently hiding every org-level row from everyone,
-- including its own creator. Replaced with an OR branch: case_id IS NULL
-- rows are scoped by org_id membership alone (the same base check used
-- throughout this phase for org-wide, non-case-confidential content),
-- case_id IS NOT NULL rows keep the exact same case-access logic as
-- before, verbatim.
drop policy if exists "Users can manage tasks for cases they can access" on public.case_tasks;

create policy "Users can manage tasks for cases they can access or org-level insight actions"
on public.case_tasks for all
using (
  (case_id is null and org_id in (select my_org_ids()))
  or
  (case_id is not null and exists (
    select 1 from public.cases c
    where c.id = case_tasks.case_id
      and (
        (c.org_id in (select my_org_ids()) and public.can_access_case_location(c.org_id, c.location_id))
        or c.id in (select case_access.case_id from public.case_access where case_access.user_id = auth.uid())
      )
      and (
        c.confidential = false
        or c.created_by = auth.uid()
        or exists (select 1 from public.case_access ca where ca.case_id = c.id and ca.user_id = auth.uid())
        or exists (select 1 from public.org_members om where om.org_id = c.org_id and om.user_id = auth.uid() and public.has_confidential_case_oversight(om.role))
      )
  ))
)
with check (
  (case_id is null and org_id in (select my_org_ids()))
  or
  (case_id is not null and exists (
    select 1 from public.cases c
    where c.id = case_tasks.case_id
      and (
        (c.org_id in (select my_org_ids()) and public.can_access_case_location(c.org_id, c.location_id))
        or c.id in (select case_access.case_id from public.case_access where case_access.user_id = auth.uid())
      )
      and (
        c.confidential = false
        or c.created_by = auth.uid()
        or exists (select 1 from public.case_access ca where ca.case_id = c.id and ca.user_id = auth.uid())
        or exists (select 1 from public.org_members om where om.org_id = c.org_id and om.user_id = auth.uid() and public.has_confidential_case_oversight(om.role))
      )
  ))
);
