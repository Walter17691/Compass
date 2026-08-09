-- ============================================================================
-- Case structure: allegations, case tasks, case owner/manager/priority,
-- audit_log.case_id — 2026-08-09
-- ============================================================================
-- Foundational data for the ER case-management build-out (see the
-- "Compass — Vision vs. Build" audit and its approved plan). Allegations
-- and case tasks each get their own table, matching this codebase's
-- existing convention for anything that needs cross-case listing
-- (dsar_requests, starter_instances, leaver_instances, wellbeing_notes are
-- all separate tables — only things scoped to a single case, like its own
-- meetings/evidence, live nested as JSONB on cases). A case's own
-- meetings/evidence stay exactly as they are; this migration doesn't touch
-- them.
--
-- Access control: rather than re-deriving org/location/confidentiality
-- rules independently (which is how the org-scoped tables added earlier
-- this project drifted — leaver_instances/starter_instances only check
-- org membership via a LIMIT 1 subquery that doesn't handle a user
-- belonging to more than one org correctly), both new tables' policies
-- are expressed as "can this user access the parent case" — a single
-- EXISTS against cases reusing its own already-correct combination of
-- my_org_ids() + can_access_case_location() + case_access grants +
-- confidential_cases' authorised-staff check. If cases' own access rules
-- are ever tightened, allegations/case_tasks inherit the fix automatically
-- rather than needing a parallel update.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

-- ── allegations ──────────────────────────────────────────────────────────
create table if not exists public.allegations (
  id text primary key, -- client-generated, e.g. "alg_" + Date.now()
  case_id uuid not null references public.cases(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  title text not null,
  description text,
  period text, -- free text: a date or a period ("5 August 2026", "March–April 2026")
  people_involved text,
  status text not null default 'unreviewed'
    check (status in ('unreviewed','evidence_gathering','substantiated','partially_substantiated','not_substantiated','unable_to_determine')),
  employee_response text,
  witness_evidence text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.allegations enable row level security;

create policy "Users can manage allegations for cases they can access"
on public.allegations for all
using (
  exists (
    select 1 from public.cases c
    where c.id = allegations.case_id
      and (
        (c.org_id in (select my_org_ids()) and public.can_access_case_location(c.org_id, c.location_id))
        or c.id in (select case_access.case_id from public.case_access where case_access.user_id = auth.uid())
      )
      and (
        c.confidential = false
        or c.created_by = auth.uid()
        or exists (select 1 from public.case_access ca where ca.case_id = c.id and ca.user_id = auth.uid())
        or exists (select 1 from public.org_members om where om.org_id = c.org_id and om.user_id = auth.uid() and om.role = 'hr_director')
      )
  )
);

-- ── case_tasks ───────────────────────────────────────────────────────────
create table if not exists public.case_tasks (
  id text primary key, -- client-generated, e.g. "task_" + Date.now()
  case_id uuid not null references public.cases(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  owner text, -- free text (a team member's name), matching how case.manager/meetings already store people
  due_date text,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'open' check (status in ('open','done')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.case_tasks enable row level security;

create policy "Users can manage tasks for cases they can access"
on public.case_tasks for all
using (
  exists (
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
        or exists (select 1 from public.org_members om where om.org_id = c.org_id and om.user_id = auth.uid() and om.role = 'hr_director')
      )
  )
);

-- ── cases: owner / manager / priority ───────────────────────────────────
-- None of these existed before — the frontend's cs.manager today is
-- populated ad hoc per meeting, never persisted as a real case field, and
-- there was no way to set a case owner (distinct from its creator) or a
-- priority at all.
alter table public.cases
  add column if not exists manager text,
  add column if not exists owner_id uuid references auth.users(id),
  add column if not exists priority text check (priority in ('low','normal','high'));

-- ── audit_log: case_id ───────────────────────────────────────────────────
-- Nullable and on delete set null (not cascade) — deleting a case should
-- not delete its own audit history, just detach it. Existing rows are
-- unaffected; only new audit() calls that have a case in scope will start
-- populating this.
alter table public.audit_log
  add column if not exists case_id uuid references public.cases(id) on delete set null;
