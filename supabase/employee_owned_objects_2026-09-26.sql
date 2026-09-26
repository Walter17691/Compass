-- ============================================================================
-- Phase E0.6 Part B — canonical parentage for employee-owned objects
-- 2026-09-26
-- ============================================================================
-- APPLIED 2026-09-26 as migration `employee_owned_objects_2026_09_26`.
--
-- THREE tables gain a nullable employee_id. Every other candidate was examined
-- and deliberately NOT given one — the reasons are recorded at the bottom,
-- because "we looked and decided no" is the part a future reader will otherwise
-- have to rediscover.
--
-- ┌─ THE NORMALISATION RULE THIS OBEYS ─────────────────────────────────────┐
-- │ ONE authoritative identity route per object, never employee_id sprinkled  │
-- │ through every table that happens to contain a name.                       │
-- │                                                                          │
-- │ An object gets employee_id ONLY if a specific employee is intrinsic to     │
-- │ its meaning AND it has no authoritative case to inherit identity from.     │
-- │ Anything owned by a case derives identity through case_id -> employee_id.  │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- NO BACKFILL. Every existing row keeps employee_id NULL. Measured before
-- writing this: of the historical rows, essentially NONE could be attributed
-- even by name — 0 of 126 wellbeing notes, 0 of 110 concern referrals and 1 of
-- 140 DSAR requests have an employee_name matching any roster entry in their own
-- organisation. There is nothing to reconcile here, and name-matching is the
-- mistake this programme exists to remove.
--
-- CRITICAL, and asserted in the tests: employee_id GRANTS NO ACCESS. Not one
-- policy below is added, removed or widened. Wellbeing notes stay HR-only,
-- DSAR stays HR-only, referrals keep submitter-or-HR visibility. Identity
-- parentage and visibility are separate concerns, and a later Employee File
-- must still query only what the viewer is independently authorised to see.
-- ============================================================================

-- ── 1. wellbeing_notes ──────────────────────────────────────────────────────
-- CLASSIFICATION A — canonical employee-owned.
--
-- A wellbeing note is about a person and needs no case to exist; it is the
-- clearest employee-owned object in the product, and the most sensitive (these
-- records routinely touch health and disability).
--
-- ON DELETE RESTRICT, as everywhere in this programme: deleting an employee must
-- never silently destroy the wellbeing record concerning them.
alter table public.wellbeing_notes
  add column if not exists employee_id uuid
  references public.employee_records(id) on delete restrict;

create index if not exists wellbeing_notes_org_employee_idx
  on public.wellbeing_notes (org_id, employee_id)
  where employee_id is not null;

comment on column public.wellbeing_notes.employee_id is
  'Canonical employee identity (Phase E0.6). NULL = a legacy, name-only note; never resolve it by name. Grants NO access: this table remains HR-only via its existing RLS policy, and gaining an employee_id does not make a note visible to anyone who could not already read it.';

-- ── 2. dsar_requests ────────────────────────────────────────────────────────
-- CLASSIFICATION A — canonical employee-owned, but deliberately NULLABLE and
-- never required.
--
-- A DSAR can legitimately be raised by, or about, someone Compass cannot
-- identify — a former employee with no roster row, or a subject whose identity
-- is exactly what is in dispute. Making this NOT NULL would block a legal
-- obligation on a data-modelling preference, so it stays optional forever.
-- Export remains fail-closed on identity; that is a separate gate and unchanged.
alter table public.dsar_requests
  add column if not exists employee_id uuid
  references public.employee_records(id) on delete restrict;

create index if not exists dsar_requests_org_employee_idx
  on public.dsar_requests (org_id, employee_id)
  where employee_id is not null;

comment on column public.dsar_requests.employee_id is
  'Canonical subject identity (Phase E0.6). Deliberately nullable and never required — a DSAR may concern someone with no employee record, and refusing to record the request would block a legal obligation. NULL = subject not canonically identified; export remains fail-closed.';

-- ── 3. concern_referrals ────────────────────────────────────────────────────
-- CLASSIFICATION A — pre-case employee context.
--
-- A referral exists BEFORE any case and may never become one, so it cannot
-- inherit identity through a case. It is genuinely employee-owned.
--
-- BUT NOTE THE ASYMMETRY, which is why submission is not gated: a referral is
-- raised by any org member, commonly a line manager who has no access to the
-- employee roster at all and therefore nobody to pick from. Requiring a uuid at
-- submission would either block managers from reporting a concern, or force the
-- roster open to every member. Neither is acceptable.
--
-- So identity is captured at TRIAGE, where an HR user is present and already
-- selects the canonical employee (Phase E0.5A.1's EmployeeSelect on the referral
-- card). Until then the referral is honestly unattributed.
alter table public.concern_referrals
  add column if not exists employee_id uuid
  references public.employee_records(id) on delete restrict;

create index if not exists concern_referrals_org_employee_idx
  on public.concern_referrals (org_id, employee_id)
  where employee_id is not null;

comment on column public.concern_referrals.employee_id is
  'Canonical employee identity (Phase E0.6), captured at HR triage rather than at submission — the submitting manager has no roster access and nobody to pick from. NULL = not yet triaged, or a legacy referral. Never resolve it by name.';

-- ── 4. One guard, three tables ──────────────────────────────────────────────
--
-- Identical semantics to cases.employee_id (Phase E0.5A), because the lifecycle
-- is the same shape: an object is created unattributed, a human attributes it
-- once, and it never silently moves afterwards.
--
--   NULL  -> value   PERMITTED  (the attribution; same-org verified)
--   value -> NULL    REJECTED
--   value -> other   REJECTED
--
-- Deliberately NOT a copy of the CASES trigger: that one now carries a
-- correction exemption (Phase E0.6 Part A) scoped to `cases`, and these tables
-- have no correction operation. Giving them the exemption branch would create a
-- door with nothing authorised to open it — worse than no door, because a later
-- reader would assume one exists.
--
-- security definer + a pinned search_path so the tenancy check holds even for
-- roles RLS does not apply to.
create or replace function public.employee_owned_parentage_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  employee_org uuid;
begin
  -- Tenancy, on INSERT and UPDATE alike, never exempted for any role. A row
  -- pointing at another tenant's employee would be a tenancy breach, not merely
  -- a bad reference.
  if new.employee_id is not null
     and (tg_op = 'INSERT' or new.employee_id is distinct from old.employee_id) then
    select er.org_id into employee_org
      from public.employee_records er where er.id = new.employee_id;
    if employee_org is null then
      raise exception 'Cannot attach this % to an employee that does not exist.', tg_table_name
        using errcode = 'foreign_key_violation';
    end if;
    if employee_org <> new.org_id then
      raise exception 'Cannot attach a % in org % to an employee in org %.',
        tg_table_name, new.org_id, employee_org using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.employee_id is not null and new.employee_id is null then
      raise exception 'The employee on this % cannot be cleared once set.', tg_table_name
        using errcode = 'check_violation';
    end if;
    if old.employee_id is not null and new.employee_id is distinct from old.employee_id then
      raise exception 'This % cannot be moved between employees. An identity correction is an explicit, audited operation, not an update.', tg_table_name
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists wellbeing_notes_employee_parentage_trg on public.wellbeing_notes;
create trigger wellbeing_notes_employee_parentage_trg
  before insert or update on public.wellbeing_notes
  for each row execute function public.employee_owned_parentage_guard();

drop trigger if exists dsar_requests_employee_parentage_trg on public.dsar_requests;
create trigger dsar_requests_employee_parentage_trg
  before insert or update on public.dsar_requests
  for each row execute function public.employee_owned_parentage_guard();

drop trigger if exists concern_referrals_employee_parentage_trg on public.concern_referrals;
create trigger concern_referrals_employee_parentage_trg
  before insert or update on public.concern_referrals
  for each row execute function public.employee_owned_parentage_guard();

-- ============================================================================
-- EXAMINED AND DELIBERATELY NOT GIVEN employee_id
-- ============================================================================
--
-- hr_review_requests — CLASSIFICATION C, CASE-OWNED. It already has a real
--   case_id FK with ON DELETE CASCADE, an immutability trigger on case_id, and
--   RLS that is case visibility by construction. Identity derives
--   hr_review_requests -> case -> employee_id. Adding employee_id would create a
--   second, independently mutable truth for no gain. case_employee_name stays as
--   the display snapshot it already is.
--
-- signing_requests — CLASSIFICATION C by intent, BLOCKED ON E2 in practice.
--   The real gap is not an employee id: this table has NO case_id and NO
--   meeting_id at all. Association exists only in the opposite direction — the
--   signId is written into the meeting object inside cases.meetings JSONB — which
--   is why api/signing.js cannot audit against a case and why the employee portal
--   falls back to matching on email. The correct fix is case_id + meeting_id,
--   server-set from the already-authorised path. That is MEETING parentage, and
--   meetings are hard-deferred to E2, so doing it here would pre-empt the
--   migration E2 is meant to perform coherently. Adding employee_id instead
--   would create two truths and still leave the artefact unreachable from its
--   own case.
--
-- starter_instances / leaver_instances — CLASSIFICATION E, LEGACY READ-ONLY.
--   Neither table has ANY write path: the writers were deleted in Phase 7.5C
--   with NewStarterScreen, and only the loaders remain so DSAR can still read
--   real historical records. A foreign key on a table nothing writes buys
--   nothing. If the onboarding/offboarding surface returns, it should be built
--   employee-first from the start rather than retrofitted now. Note also the
--   standing rule this phase does not touch: a leaver_instance is NOT the same
--   fact as employment_status = 'leaver', and no automatic transition exists.
--
-- employee_portal_accounts / employee_portal_invites — CLASSIFICATION D,
--   AUTH IDENTITY. An employee portal login is an auth identity; an Employee
--   File is an HR identity. They are related, not the same concept, and this
--   phase does not merge them.
--   Audited finding, reported rather than silently fixed: acceptance is bridged
--   by EMAIL — api/portal/_accept-invite.js verifies auth.users.email equals
--   invite.email via the admin API, and copies employee_name verbatim. So the
--   chain is token + email match + a name HR typed by hand. A mistyped address
--   produces a fully "verified" account bound to the wrong person. The right
--   remedy is an explicit employee_id FK captured when HR issues the invite
--   (PersonViewScreen already has the roster in scope), propagated at
--   acceptance — NOT an email join, and NOT a silent backfill of existing
--   accounts. Deferred deliberately: it changes the portal's identity bridge and
--   needs its own security proof and UAT. Production holds 0 accounts and 1
--   invite, so nothing is at risk while it waits.
--
-- redundancy_cases — CLASSIFICATION B, and structurally incapable of taking a
--   scalar employee_id: the subjects are an N-element at_risk_employees jsonb
--   array whose entries carry id: Date.now().toString(). The correct shape is a
--   child table redundancy_case_employees(redundancy_case_id, employee_id, …),
--   which is a larger piece of work than a column. 0 rows in production.
--
-- allegations / case_tasks / case_signals / case_views / case_access /
-- case_themes — CLASSIFICATION C, all already case_id-parented. Identity derives
--   through the case. No change.
--
-- public.meetings and embedded cases.meetings — CLASSIFICATION F, HARD DEFER
--   to E2, which will handle meeting -> employee and optional meeting -> case as
--   ONE coherent migration. Nothing in this migration touches either.
-- ============================================================================

-- ============================================================================
-- ROLLBACK (complete; no existing row, policy or index is modified)
-- ============================================================================
--   drop trigger if exists wellbeing_notes_employee_parentage_trg on public.wellbeing_notes;
--   drop trigger if exists dsar_requests_employee_parentage_trg on public.dsar_requests;
--   drop trigger if exists concern_referrals_employee_parentage_trg on public.concern_referrals;
--   drop function if exists public.employee_owned_parentage_guard();
--   drop index if exists public.wellbeing_notes_org_employee_idx;
--   drop index if exists public.dsar_requests_org_employee_idx;
--   drop index if exists public.concern_referrals_org_employee_idx;
--   alter table public.wellbeing_notes   drop column if exists employee_id;
--   alter table public.dsar_requests     drop column if exists employee_id;
--   alter table public.concern_referrals drop column if exists employee_id;
-- ============================================================================
