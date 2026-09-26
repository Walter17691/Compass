-- ============================================================================
-- Phase E0 — employee identity foundation — 2026-09-26
-- ============================================================================
-- APPLIED 2026-09-26. (This header states its real status; see the note at the
-- bottom of standalone_meetings_2026-09-25.sql for why that matters.)
--
-- WHY. Compass has no employee identity. Twelve tables store `employee_name` as
-- text; nothing has a foreign key to an employee; the People screen reconstructs
-- a "person" on every render by string equality
-- (PeopleScreen.jsx:17, PersonViewScreen.jsx:17); and four live database
-- functions join cases to this very table with
-- `er.name = c.employee_name`. A stable employee id is the prerequisite for the
-- approved Employee File model, where every meeting belongs to an employee and a
-- case is optional.
--
-- THE CANONICAL-TABLE DECISION: this table EVOLVES. It already has a uuid primary
-- key, an org_id foreign key, working RLS and 2,685 rows. A second `employees`
-- table would leave Compass with two permanent sources of employee truth, which
-- the approved architecture forbids — so the identity spine is added here rather
-- than beside it. Only TWO call sites structurally depend on this table's
-- UNIQUE(org_id, name): the `onConflict: 'org_id,name'` upserts at App.jsx:660
-- and App.jsx:711. Everything else merely reads by name.
--
-- ┌─ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ─────────────────────────┐
-- │ It does NOT drop UNIQUE (org_id, name).                                 │
-- │                                                                         │
-- │ That constraint is wrong for the target model — two employees in one     │
-- │ organisation must eventually be able to share a name — but it is         │
-- │ currently the ONLY thing preventing 34 name-equality identity decisions  │
-- │ from combining two different people, including 14 in the DSAR compiler   │
-- │ and four live analytics functions. It is retained until the phase that    │
-- │ migrates those consumers. Dropping it here would convert a latent design │
-- │ flaw into a live privacy incident.                                       │
-- │                                                                         │
-- │ It also does NOT change RLS, does not backfill any relationship, and     │
-- │ does not touch cases, meetings or documents.                             │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- IDENTITY PRINCIPLE, encoded in the comments below so it survives this commit:
--   employee_records.id  IS identity.
--   name / employee_number / work_email / job_title / location are LABELS and
--   ATTRIBUTES. They may help a HUMAN notice a possible duplicate. None of them
--   is ever the key, and none of them may be used to merge two records.
-- ============================================================================

-- ── 1. Identity and employment-period columns ───────────────────────────────
alter table public.employee_records
  -- A detection aid for humans, never a key. There is no email column today,
  -- which is part of why the existing duplicate-name detector is inert.
  add column if not exists work_email text,
  -- A deliberately tiny vocabulary. The existing free-text `status` column is
  -- kept untouched (14 of 2,685 rows use it, only ever the word "active") and is
  -- now superseded for anything Compass branches on.
  --
  -- 'unknown' is the honest default: Compass genuinely does not know the
  -- employment status of the 2,671 rows that never had one, and defaulting them
  -- to 'active' would invent a fact about real people.
  add column if not exists employment_status text not null default 'unknown',
  -- The end of an employment period. Text to match the existing start_date
  -- column's type rather than introduce an inconsistency inside one table;
  -- converting both to `date` is recorded type debt, not this phase's work.
  add column if not exists end_date text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid;

alter table public.employee_records
  drop constraint if exists employee_records_employment_status_valid;
alter table public.employee_records
  add constraint employee_records_employment_status_valid
  check (employment_status in ('active', 'leaver', 'unknown'));

-- ── 2. The one narrow normalisation ─────────────────────────────────────────
-- Carries forward the only real signal the free-text column holds. This is a
-- status normalisation on the employee row itself — NOT an identity backfill,
-- and it maps nothing to anything.
update public.employee_records
   set employment_status = 'active'
 where lower(btrim(coalesce(status, ''))) = 'active'
   and employment_status = 'unknown';

-- ── 3. Duplicate-DETECTION indexes — deliberately NOT unique ───────────────
-- These exist so a human can be shown "someone with this employee number
-- already exists" at the moment of creation. Making either UNIQUE would repeat
-- the mistake this whole phase is correcting: encoding an attribute as identity.
-- An organisation may legitimately have a blank or a reused employee number, and
-- Compass must not refuse the record — it must surface the possible match and
-- let a person decide.
create index if not exists employee_records_org_number_idx
  on public.employee_records (org_id, lower(employee_number))
  where employee_number is not null;

create index if not exists employee_records_org_email_idx
  on public.employee_records (org_id, lower(work_email))
  where work_email is not null;

-- ── 4. Documentation that travels with the schema ──────────────────────────
comment on table public.employee_records is
  'The canonical Employee File identity for an organisation (Phase E0). `id` IS the identity; `name` is a mutable label. UNIQUE(org_id, name) is RETAINED TEMPORARILY and is wrong for the target model — it is the only thing currently stopping 34 name-equality identity decisions (14 of them in the DSAR compiler) and 4 live analytics functions from combining two different people. It may be dropped only in the phase that migrates those consumers.';

comment on column public.employee_records.id is
  'Canonical employee identity. The only thing that may be used to decide which person an object belongs to.';
comment on column public.employee_records.name is
  'Display label. Mutable, may legitimately be shared by two employees once UNIQUE(org_id, name) is removed. Never identity.';
comment on column public.employee_records.employee_number is
  'The customer''s own reference. A duplicate-detection aid for humans. Never identity, and deliberately not unique.';
comment on column public.employee_records.work_email is
  'A duplicate-detection aid for humans. Never identity, and deliberately not unique.';
comment on column public.employee_records.employment_status is
  'active | leaver | unknown. Deliberately small. No automatic leaver logic exists: leaver_instances remains a separate offboarding CHECKLIST and does not set this, by design, until a later validated phase.';
comment on column public.employee_records.end_date is
  'End of an employment period. A rehire keeps the same `id` (identity is not the employment period) and clears this; a genuinely separate period may later warrant its own row. Historical meeting snapshots (lib/employeeHistory.js buildEmployeeSnapshot) are never rewritten by either.';

-- ── 5. RLS: deliberately UNCHANGED ─────────────────────────────────────────
-- SELECT remains any org member; INSERT/UPDATE/DELETE remain HR-only
-- (employee_records_write_hr_only / _update_hr_only / _delete_hr_only).
--
-- The approved product requirement is that an AUTHORISED user can create an
-- Employee File without first creating a meeting or case — not that every
-- manager can create anyone. Location-scoped creation CANNOT be expressed safely
-- today: org_members.location_ids is uuid[] while employee_records.location is
-- free text with no foreign key to public.locations, so there is nothing to scope
-- a Location Manager's rights against. Widening to a role that cannot be scoped
-- would be a tenant-wide write grant dressed as a feature.
--
-- So: conservative permission retained, and manager creation recorded as a later
-- product decision BLOCKED ON adding location_id to this table. E0 ships no
-- creation UI (that is E1), so nothing is worse than today.
--
-- Investigator, Legal/Compliance Reviewer and Auditor are NOT granted creation
-- rights, and must not be — they are case-scoped roles, not roster owners.

-- ============================================================================
-- ROLLBACK (complete; no pre-existing column, row, constraint, policy or
-- function is modified by this migration, so this restores the prior state
-- exactly — the only data it would discard is the normalisation in step 2,
-- which is recomputable from the untouched `status` column)
-- ============================================================================
--   drop index if exists public.employee_records_org_email_idx;
--   drop index if exists public.employee_records_org_number_idx;
--   alter table public.employee_records
--     drop constraint if exists employee_records_employment_status_valid;
--   alter table public.employee_records
--     drop column if exists created_by,
--     drop column if exists created_at,
--     drop column if exists end_date,
--     drop column if exists employment_status,
--     drop column if exists work_email;
-- ============================================================================
