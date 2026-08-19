-- ============================================================================
-- Organisational ER Intelligence (Phase 6, OP6) — theme taxonomy
-- ============================================================================
-- The first genuinely new entity this phase adds (OP1-OP5 were all
-- read-only over existing tables). Replaces orgIntelligence.js's raw
-- keyword-frequency extraction as the system of record for "theme"
-- everywhere else in this plan (OP7 trend detection, OP8 root-cause,
-- OP9 early signals, OP16 risk map all read case_themes from here on,
-- not extractThemeKeywords' output).
--
-- Two tables:
--   organisation_themes — the HR-editable taxonomy itself (name,
--     description, active/inactive). Any org member can SELECT it (a
--     case-accessible user needs to see the list to assign one); only
--     HR can INSERT/UPDATE, via the existing public.is_hr_role() helper
--     (role_expansion_2026-08-09.sql) — matches the spec's own "Compass
--     should allow HR to create and edit its own taxonomy of themes."
--   case_themes — the join. Readable/writable by anyone who can already
--     access the case (exact same policy shape as case_signals'
--     "Users can manage signals for cases they can access" —
--     case_signals_2026-08-10.sql — copied verbatim, not re-derived),
--     matching the spec's "AI may suggest themes, but users should be
--     able to confirm or change them": theme CURATION (the taxonomy) is
--     HR-only, theme APPLICATION (tagging a case) is whoever can already
--     work that case.
--
-- No "pending AI suggestion" row/status exists in case_themes — mirrors
-- the AI-finding/HR-approval shape used throughout this app
-- (analyseEvidenceDocument/acceptDocumentFinding, App.jsx): an AI
-- suggestion is ephemeral client-side state until confirmed, at which
-- point it's inserted already-confirmed. suggested_by records HOW a row
-- was created (AI-suggested-then-confirmed vs directly added), not a
-- workflow state.
--
-- HOW TO APPLY: paste the whole block below.
-- ============================================================================

create table if not exists public.organisation_themes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(org_id, name)
);

create table if not exists public.case_themes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  theme_id uuid not null references public.organisation_themes(id) on delete cascade,
  suggested_by text not null default 'user' check (suggested_by in ('ai','user')),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz not null default now(),
  unique(case_id, theme_id)
);

alter table public.organisation_themes enable row level security;
alter table public.case_themes enable row level security;

create policy "org members can view organisation_themes"
on public.organisation_themes for select
using (org_id in (select my_org_ids()));

create policy "hr can manage organisation_themes"
on public.organisation_themes for insert
with check (
  org_id in (select my_org_ids())
  and exists (select 1 from public.org_members om where om.org_id = organisation_themes.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role))
);

create policy "hr can update organisation_themes"
on public.organisation_themes for update
using (
  org_id in (select my_org_ids())
  and exists (select 1 from public.org_members om where om.org_id = organisation_themes.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role))
);

-- Exact same access shape as case_signals' own "for cases they can
-- access" policy (case_signals_2026-08-10.sql) — copied, not re-derived.
create policy "Users can manage themes for cases they can access"
on public.case_themes for all
using (
  exists (
    select 1 from public.cases c
    where c.id = case_themes.case_id
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
  )
);

create index if not exists organisation_themes_org_id_idx on public.organisation_themes(org_id);
create index if not exists case_themes_case_id_idx on public.case_themes(case_id);
create index if not exists case_themes_theme_id_idx on public.case_themes(theme_id);
