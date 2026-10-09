-- ============================================================================
-- B3.1 — investigation_report_versions
--
-- WHAT THIS IS FOR. `cases.investigation_report` holds one string: the current
-- report. Generation overwrote it, generation also advanced the stage AND
-- requested HR review in the same action, and there was nowhere for an edit to
-- be kept — which is why editing was deliberately disabled rather than shipped
-- lossy (src/lib/investigationReportDocument.js: "Editing the report arrives in
-- IR-2, alongside adoption and versions — i.e. once the edit has somewhere to
-- be kept"). This file is that somewhere.
--
-- WHAT IT IS NOT. It is not a document-management system, it does not version
-- letters, and it does not change what the report SAYS. Report content and the
-- separation of Compass's advisory analysis from the officer's report are
-- B3.4, deliberately out of scope here.
--
-- ┌─ LIVE SHAPE, MEASURED BEFORE WRITING THIS (production, 2026-10-09) ──────┐
-- │ cases                                        2,963                       │
-- │   with investigation_report                     50  (all have a date)    │
-- │   stage inv_report                              49  (+1 at appeal)       │
-- │   stage inv_report with NO report                0  (IR-0.3 holds)       │
-- │ case_access role='investigator'                175 grants, 175 cases,    │
-- │                                                 max 1 per case           │
-- │ cases with a report AND an investigator          0                       │
-- │ cases with an investigator, all at stage      open                       │
-- │ cases.investigating_manager populated            0                       │
-- │ allegations.investigation_conclusion vocabulary already exists:          │
-- │   case_to_answer | no_case_to_answer | further_investigation_required    │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- THE TWO POPULATIONS ARE DISJOINT, and the whole design rests on it. Every
-- existing report sits on a case with no investigator grant; every case that
-- HAS an investigator is still at stage open with no report. Investigator
-- grants begin 2026-08-12 and post-date every existing report. So "the assigned
-- investigator adopts" can be the normal rule for all 175 in-flight cases
-- without a single legacy case needing the HR exception — the exception is for
-- genuinely unassigned cases, not a migration crutch.
-- ============================================================================


-- ── 1. The version store ───────────────────────────────────────────────────
--
-- EVERY SUBSTANTIVE SAVE IS A NEW ROW. There is no UPDATE path for `body` at
-- all: a saved version is immutable from the moment it exists, not merely from
-- the moment it is adopted. A browser editor buffer stays mutable until the
-- user saves; what lands here is a save, and saves are history.
--
-- That is stricter than the first design, which allowed a draft body to be
-- edited in place. In-place editing would have meant a draft could be silently
-- rewritten between being read and being adopted, and the adoption would name a
-- version whose content had changed since the reviewer looked at it.
create table public.investigation_report_versions (
  id uuid primary key default gen_random_uuid(),

  -- TENANCY KEYSTONE, same shape as investigation_finding_revisions: both NOT
  -- NULL and tied together by a composite FK, so the MATCH SIMPLE gap on the
  -- nullable parent column is closed on the child side.
  org_id  uuid not null,
  case_id uuid not null,

  -- Assigned by the database (§3), never accepted from a client.
  version_no int not null,

  body   text not null,
  source text not null,          -- 'generated' | 'edited'

  created_at  timestamptz not null default now(),
  created_by  uuid,              -- NULL only for author_kind='system'
  author_kind text not null,     -- 'user' | 'system'

  -- ── ADOPTION. Many versions may be adopted over the life of a case. ──────
  --
  -- A returned report stays adopted and stays immutable: HR returning it is a
  -- fact about the review, not an erasure of the adoption. What changes is
  -- which adopted version is CURRENT.
  adopted_at      timestamptz,
  adopted_by      uuid,
  adoption_basis  text,          -- 'assigned_investigator' | 'hr_exception'
  adoption_reason text,          -- REQUIRED when basis='hr_exception'

  -- THE CURRENT-VERSION POINTER. A uniquely-constrained flag rather than a
  -- `cases.current_report_version_id` column, for three reasons: no circular
  -- foreign key between cases and this table; a flag cannot dangle at a
  -- version that was never adopted; and "exactly one current" becomes a
  -- database invariant (§2) instead of something application code must
  -- maintain. Superseded adoptions keep is_current=false and remain readable.
  is_current boolean not null default false,
  superseded_at timestamptz,
  superseded_by_version_id uuid references public.investigation_report_versions(id),

  constraint investigation_report_versions_case_same_org_fkey
    foreign key (case_id, org_id) references public.cases(id, org_id) on delete cascade,
  constraint investigation_report_versions_org_fkey
    foreign key (org_id) references public.organisations(id) on delete cascade,

  constraint investigation_report_versions_version_unique unique (case_id, version_no),
  constraint investigation_report_versions_source_valid check (source in ('generated','edited')),
  constraint investigation_report_versions_body_present check (btrim(body) <> ''),

  -- No misleading human authorship, structurally — the same device as
  -- investigation_finding_revisions_actor_shape.
  constraint investigation_report_versions_author_shape check (
       (author_kind = 'user'   and created_by is not null)
    or (author_kind = 'system' and created_by is null)),

  -- An adoption is all-or-nothing, names a human, states its basis, and an HR
  -- exception without a written reason is unrepresentable rather than merely
  -- discouraged.
  constraint investigation_report_versions_adoption_shape check (
       (adopted_at is null and adopted_by is null and adoption_basis is null and adoption_reason is null)
    or (adopted_at is not null
        and adopted_by is not null
        and adoption_basis in ('assigned_investigator','hr_exception')
        and (adoption_basis <> 'hr_exception' or coalesce(btrim(adoption_reason),'') <> ''))),

  -- Only an adopted version can be current, or superseded.
  constraint investigation_report_versions_current_requires_adoption check (
    is_current = false or adopted_at is not null),
  constraint investigation_report_versions_supersede_shape check (
       (superseded_at is null and superseded_by_version_id is null)
    or (superseded_at is not null and adopted_at is not null)),
  -- A superseded version is by definition not the current one.
  constraint investigation_report_versions_superseded_not_current check (
    superseded_at is null or is_current = false)
);

comment on table public.investigation_report_versions is
  'B3.1. Immutable saved versions of the investigation report. Every substantive save is a new row; no row body is ever rewritten. Many versions may be adopted over a case lifetime, at most one is current (investigation_report_versions_one_current). Adoption, the current pointer, the legacy mirror and the stage change happen together in adopt_investigation_report_version(). Superseded drafts and superseded adoptions are restricted case records; retention is NOT ENFORCED and the schedule is an outstanding governance dependency.';

comment on column public.investigation_report_versions.is_current is
  'The controlled current-version pointer. Exactly one TRUE per case is enforced by a partial unique index; historically adopted versions keep FALSE and remain immutable and readable.';

comment on column public.investigation_report_versions.adoption_basis is
  '''assigned_investigator'' = adopted by the case''s assigned investigator, the normal path. ''hr_exception'' = adopted by HR, which requires a written adoption_reason and is audited. Never inferred.';


-- ── 2. Indexes, including the two invariants ───────────────────────────────
--
-- EXACTLY ONE CURRENT ADOPTED VERSION PER CASE. A partial unique index rather
-- than application logic, so a double adoption is a unique violation and not a
-- silent overwrite of whichever write arrived second.
create unique index investigation_report_versions_one_current
  on public.investigation_report_versions (case_id) where is_current;

create index investigation_report_versions_case_version_idx
  on public.investigation_report_versions (case_id, version_no desc);

create index investigation_report_versions_case_adopted_idx
  on public.investigation_report_versions (case_id, adopted_at desc) where adopted_at is not null;


-- ── 3. Version numbering, atomically ───────────────────────────────────────
--
-- max(version_no)+1 read under a lock on the PARENT CASE row, so two concurrent
-- saves on one case serialise rather than both reading the same max. The unique
-- constraint is the backstop if that lock is ever bypassed; the lock is what
-- stops the second writer failing in normal use.
--
-- The lock is on `cases`, not on this table, because there may be no rows here
-- yet for a first save — there is nothing to lock.
create or replace function public.assign_investigation_report_version_no()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lock uuid;
begin
  select id into v_lock from public.cases where id = new.case_id for update;
  if v_lock is null then
    raise exception 'This report version does not reference a real case' using errcode = '23503';
  end if;
  select coalesce(max(version_no), 0) + 1
    into new.version_no
    from public.investigation_report_versions
   where case_id = new.case_id;
  return new;
end;
$$;

revoke all on function public.assign_investigation_report_version_no() from anon, authenticated, public;

create trigger investigation_report_versions_assign_version_no_trg
  before insert on public.investigation_report_versions
  for each row
  execute function public.assign_investigation_report_version_no();


-- ── 4. Immutability ────────────────────────────────────────────────────────
--
-- A saved version is immutable in its CONTENT from creation. The only legal
-- mutations are the one-way adoption transition and the one-way supersession
-- transition, both performed by the adoption function in §6.
--
-- No service_role exception, matching investigation_finding_revisions and for
-- the same reason: this table exists so that what an investigating officer
-- adopted cannot later be made to differ, and a privileged rewrite pathway
-- would defeat it. DELETE is permitted only where the parent case or
-- organisation has already gone — the organisation branch is not optional, as
-- B2 proved when its absence blocked organisation deletion outright.
create or replace function public.investigation_report_versions_immutability_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.cases where id = old.case_id) then return old; end if;
    if not exists (select 1 from public.organisations where id = old.org_id) then return old; end if;
    raise exception
      'A saved investigation report version cannot be deleted (version % of case %). Superseded drafts are retained as restricted case records.',
      old.version_no, old.case_id using errcode = 'check_violation';
  end if;

  -- CONTENT AND IDENTITY ARE FROZEN, always.
  if new.body        is distinct from old.body
     or new.version_no  is distinct from old.version_no
     or new.case_id     is distinct from old.case_id
     or new.org_id      is distinct from old.org_id
     or new.source      is distinct from old.source
     or new.created_at  is distinct from old.created_at
     or new.created_by  is distinct from old.created_by
     or new.author_kind is distinct from old.author_kind then
    raise exception
      'A saved investigation report version cannot be changed (version % of case %). Save a new version instead.',
      old.version_no, old.case_id using errcode = 'check_violation';
  end if;

  -- ADOPTION IS ONE-WAY. An adopted report is never un-adopted and never
  -- re-attributed; HR returning it is recorded on the review, not here.
  if old.adopted_at is not null then
    if new.adopted_at     is distinct from old.adopted_at
       or new.adopted_by     is distinct from old.adopted_by
       or new.adoption_basis is distinct from old.adoption_basis
       or new.adoption_reason is distinct from old.adoption_reason then
      raise exception
        'An adopted investigation report cannot be un-adopted or re-attributed (version % of case %). Adopt a later version instead.',
        old.version_no, old.case_id using errcode = 'check_violation';
    end if;
  end if;

  -- SUPERSESSION IS ONE-WAY.
  if old.superseded_at is not null
     and (new.superseded_at is distinct from old.superseded_at
          or new.superseded_by_version_id is distinct from old.superseded_by_version_id) then
    raise exception
      'A superseded adoption cannot be altered (version % of case %).',
      old.version_no, old.case_id using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.investigation_report_versions_immutability_guard() from anon, authenticated, public;

create trigger investigation_report_versions_immutability_trg
  before update or delete on public.investigation_report_versions
  for each row
  execute function public.investigation_report_versions_immutability_guard();


-- ── 5. Draft authority, enforced at write time ─────────────────────────────
--
-- Who may SAVE a version: HR in the case's organisation, or the case's assigned
-- investigator. Mirrors mayPrepareReportDraft() in the application.
--
-- Privilege is read BEFORE the subject claim, as in B2's capture function: a
-- service_role JWT carrying a human `sub` must not be able to author a version
-- in that human's name.
create or replace function public.investigation_report_versions_author_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_privileged boolean := coalesce(auth.role(), '') = 'service_role';
  v_actor uuid := case when v_privileged then null else auth.uid() end;
  v_org   uuid;
begin
  select org_id into v_org from public.cases where id = new.case_id;
  if v_org is null then
    raise exception 'This report version does not reference a real case' using errcode = '23503';
  end if;

  -- org_id is DERIVED, never accepted, so a crafted insert cannot nominate an
  -- organisation in which the caller happens to be HR.
  new.org_id := v_org;

  if v_actor is null then
    raise exception
      'An investigation report version must be saved by a signed-in user. An automated or service-role process cannot author a report.'
      using errcode = '42501';
  end if;

  if not (
    exists (select 1 from public.org_members om
             where om.org_id = v_org and om.user_id = v_actor and public.is_hr_role(om.role))
    or exists (select 1 from public.case_access ca
             where ca.case_id = new.case_id and ca.user_id = v_actor and ca.role = 'investigator')
  ) then
    raise exception
      'Only HR or this case''s assigned investigator can save an investigation report version'
      using errcode = '42501';
  end if;

  -- Authorship is ASSIGNED, not accepted.
  new.created_by  := v_actor;
  new.author_kind := 'user';

  -- A version is never born adopted or current. Adoption is a separate act.
  new.adopted_at := null; new.adopted_by := null;
  new.adoption_basis := null; new.adoption_reason := null;
  new.is_current := false;
  new.superseded_at := null; new.superseded_by_version_id := null;

  return new;
end;
$$;

revoke all on function public.investigation_report_versions_author_guard() from anon, authenticated, public;

-- Fires AFTER the version-number assignment: 'author' sorts before 'assign'
-- alphabetically, so the trigger name is chosen to make the order explicit and
-- deterministic rather than accidental.
create trigger investigation_report_versions_b_author_trg
  before insert on public.investigation_report_versions
  for each row
  execute function public.investigation_report_versions_author_guard();


-- ── 6. Adoption: one transaction, four effects ─────────────────────────────
--
-- Adoption, the current-version pointer, the legacy mirror and the stage change
-- are ONE statement. Doing them separately is how the old flow allowed HR to be
-- told an investigation had been submitted when no report existed (IR-0.3).
--
-- Exposed as a SECURITY DEFINER function rather than as an UPDATE the client
-- composes, because the four effects must not be separable by a caller.
--
-- PRECONDITION (product decision 2): every issue under investigation on the
-- case must carry an explicit recorded position. The permitted positions are
-- the vocabulary allegations.investigation_conclusion already enforces —
-- case_to_answer, no_case_to_answer, further_investigation_required. Note what
-- this does NOT do: it does not require a definitive finding, because
-- "further investigation required" is a complete and legitimate position.
create or replace function public.adopt_investigation_report_version(
  p_version_id uuid,
  p_basis text,
  p_reason text default null
)
returns public.investigation_report_versions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_privileged boolean := coalesce(auth.role(), '') = 'service_role';
  v_actor uuid := case when v_privileged then null else auth.uid() end;
  v_row public.investigation_report_versions;
  v_prev public.investigation_report_versions;
  v_is_investigator boolean;
  v_is_hr boolean;
  v_unpositioned int;
  v_member record;
begin
  if v_actor is null then
    raise exception
      'An investigation report must be adopted by a signed-in user. An automated or service-role process cannot adopt a report.'
      using errcode = '42501';
  end if;

  -- Lock the parent case first: this serialises concurrent adoptions on one
  -- case, so the partial unique index is a backstop rather than the mechanism.
  select v.* into v_row from public.investigation_report_versions v where v.id = p_version_id;
  if v_row.id is null then
    raise exception 'That investigation report version does not exist' using errcode = '23503';
  end if;
  perform 1 from public.cases where id = v_row.case_id for update;

  if v_row.adopted_at is not null then
    raise exception 'That investigation report version is already adopted' using errcode = 'check_violation';
  end if;

  select exists (select 1 from public.case_access ca
                  where ca.case_id = v_row.case_id and ca.user_id = v_actor and ca.role = 'investigator'),
         exists (select 1 from public.org_members om
                  where om.org_id = v_row.org_id and om.user_id = v_actor and public.is_hr_role(om.role))
    into v_is_investigator, v_is_hr;

  if p_basis = 'assigned_investigator' then
    if not v_is_investigator then
      raise exception 'Only the case''s assigned investigator can adopt on that basis' using errcode = '42501';
    end if;
  elsif p_basis = 'hr_exception' then
    if not v_is_hr then
      raise exception 'Only HR can adopt under the documented exception' using errcode = '42501';
    end if;
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'Adopting as HR requires a written reason, which is recorded against the report'
        using errcode = 'check_violation';
    end if;
  else
    raise exception 'Unknown adoption basis' using errcode = 'check_violation';
  end if;

  -- Every issue must carry a position.
  select count(*) into v_unpositioned
    from public.allegations a
   where a.case_id = v_row.case_id and a.investigation_conclusion is null;
  if v_unpositioned > 0 then
    raise exception
      'Record a position on every issue before adopting the report — % issue(s) have none. Permitted positions are: a case to answer, no case to answer, or further investigation required.',
      v_unpositioned using errcode = 'check_violation';
  end if;

  -- Supersede the outgoing current adoption, if any. It stays adopted,
  -- immutable and readable; only its currency changes.
  select v.* into v_prev from public.investigation_report_versions v
   where v.case_id = v_row.case_id and v.is_current;
  if v_prev.id is not null then
    update public.investigation_report_versions
       set is_current = false,
           superseded_at = now(),
           superseded_by_version_id = v_row.id
     where id = v_prev.id;
  end if;

  update public.investigation_report_versions
     set adopted_at = now(), adopted_by = v_actor,
         adoption_basis = p_basis,
         adoption_reason = case when p_basis = 'hr_exception' then btrim(p_reason) else null end,
         is_current = true
   where id = v_row.id
   returning * into v_row;

  -- THE LEGACY MIRROR, written here so it can never drift from the adoption.
  -- Everything that reads cases.investigation_report today — getCaseStage's
  -- hasInvReport, hearingPack, dsarCompile, caseDocuments, the portal case
  -- list — keeps working with no change at all.
  update public.cases
     set investigation_report = v_row.body,
         investigation_report_date = to_char(v_row.adopted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         stage = 'inv_report'
   where id = v_row.case_id;

  -- ── THE AUDIT EVENT ──────────────────────────────────────────────────────
  --
  -- Written HERE, directly, and inside the same transaction as the adoption it
  -- records — so the event and the thing it describes cannot come apart.
  --
  -- This was missing from the first candidate, and the omission mattered: the
  -- two closest analogues in this schema, record_case_decision ('Outcome
  -- issued') and log_investigation_conclusion, both write their own audit row,
  -- and adoption is at least as consequential as either. Version metadata alone
  -- records WHAT the state now is; the audit trail is what a reader consults to
  -- see that a thing HAPPENED, and leaving the most significant transition in
  -- this lifecycle out of it would have been a real gap rather than a stylistic
  -- one.
  --
  -- NOT routed through log_audit_event(): that RPC refuses the reserved actions
  -- precisely so an authoritative act cannot be forged by a client calling the
  -- generic endpoint. The two actions below are added to its reserved list in §7a.
  select * into v_member from public.org_members
   where org_id = v_row.org_id and user_id = v_actor;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (
    v_row.org_id, v_actor, coalesce(v_member.name, 'Unknown'),
    case when p_basis = 'hr_exception'
         then 'Investigation report adopted under HR exception'
         else 'Investigation report adopted' end,
    'Version ' || v_row.version_no
      || case when v_prev.id is not null
              then ' — supersedes version ' || v_prev.version_no else '' end
      || case when p_basis = 'hr_exception'
              then ' — adopted by HR rather than the assigned investigator. Reason: ' || btrim(p_reason)
              else ' — adopted by the assigned investigator' end,
    v_row.case_id);

  return v_row;
end;
$$;

revoke all on function public.adopt_investigation_report_version(uuid, text, text) from anon, public;
grant execute on function public.adopt_investigation_report_version(uuid, text, text) to authenticated;

comment on function public.adopt_investigation_report_version(uuid, text, text) is
  'B3.1. Adopts one saved version: validates authority and that every issue carries a recorded position, supersedes the outgoing current adoption, sets the current pointer, mirrors the body into cases.investigation_report and sets stage=inv_report — all in one transaction. HR adoption requires a written reason. A service-role caller is refused: adoption is a human act.';


-- ── 6a. Reserve the two adoption actions ───────────────────────────────────
--
-- log_audit_event() refuses a list of actions that "can only be logged by its
-- own authoritative function, not the generic audit RPC" — the mechanism that
-- stops a client POSTing /rest/v1/rpc/log_audit_event and manufacturing an
-- 'Outcome issued' or 'Investigation conclusion recorded' event it never
-- performed. The two adoption actions join that list for the same reason.
--
-- Replaced rather than altered in place: the function is rewritten whole with
-- the two names added, so there is no ALTER that could partially apply. The
-- body below is the live 2026-10-09 definition with exactly that change.
create or replace function public.log_audit_event(
  p_org_id uuid, p_action text, p_detail text default ''::text,
  p_case_id uuid default null::uuid, p_ai_prepared boolean default false,
  p_approved_by text default null::text, p_data_used text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_name text;
  v_member record;
  v_case record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_action in (
    'Case deleted',
    'Appeal officer appointed',
    'Appeal officer replaced',
    'Appeal officer revoked',
    'Appeal officer appointed despite independence conflict',
    'Employee identity reconciled',
    'Employee identity corrected',
    'Employee details corrected',
    'Outcome issued',
    'Employee created',
    'Investigation conclusion recorded',
    'Investigation conclusion amended',
    -- B3.1
    'Investigation report adopted',
    'Investigation report adopted under HR exception'
  ) then
    raise exception 'This action can only be logged by its own authoritative function, not the generic audit RPC';
  end if;

  select * into v_member from public.org_members
    where org_id = p_org_id and user_id = auth.uid();
  if v_member.id is null then
    raise exception 'Not a member of this organisation';
  end if;
  v_user_name := coalesce(v_member.name, 'Unknown');

  if p_case_id is not null then
    select * into v_case from public.cases where id = p_case_id;
    if v_case.id is null or v_case.org_id <> p_org_id then
      raise exception 'You do not have access to log an event against this case' using errcode = '42501';
    end if;
    if not (
      exists (select 1 from public.org_members om
               where om.org_id = p_org_id and om.user_id = auth.uid() and om.case_access_level = 1)
      or (exists (select 1 from public.org_members om
                   where om.org_id = p_org_id and om.user_id = auth.uid() and om.case_access_level = 2)
          and v_case.created_by = auth.uid())
      or exists (select 1 from public.case_access ca
                  where ca.case_id = v_case.id and ca.user_id = auth.uid())
    ) then
      raise exception 'You do not have access to log an event against this case';
    end if;

    if p_action = 'Outcome issued' and v_case.outcome is null then
      raise exception 'Cannot log an outcome-issued event — this case has no outcome recorded';
    end if;
  end if;

  if p_action = 'Case access level changed' and not (public.is_hr_role(v_member.role) or v_member.case_access_level = 1) then
    raise exception 'You do not have authority to log a case access level change';
  end if;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id, ai_prepared, approved_by, data_used)
  values (p_org_id, auth.uid(), v_user_name, p_action, p_detail, p_case_id, p_ai_prepared, p_approved_by, p_data_used);
end;
$function$;


-- ── 7. HR review: submission and decision, separately ──────────────────────
--
-- Submission is NOT performed here and is deliberately a separate human action
-- in its own transaction (B3.2 wires it). What this file adds is the two rules
-- the database must hold whatever the client does.
alter table public.hr_review_requests
  add column if not exists report_version_id uuid
    references public.investigation_report_versions(id);

comment on column public.hr_review_requests.report_version_id is
  'B3.1. The adopted report version this review is about. NULL on the 35 pre-B3.1 inv_report rows and on every non-report review step; never backfilled.';

-- At most one OPEN inv_report review per case, so a double submission is a
-- unique violation rather than two HR queues for one report.
create unique index hr_review_requests_one_open_inv_report
  on public.hr_review_requests (case_id)
  where step = 'inv_report' and status = 'pending';

create or replace function public.hr_review_report_integrity_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_privileged boolean := coalesce(auth.role(), '') = 'service_role';
  v_actor uuid := case when v_privileged then null else auth.uid() end;
  v_ver public.investigation_report_versions;
begin
  -- (a) a report review must name an ADOPTED version
  if new.report_version_id is not null then
    select * into v_ver from public.investigation_report_versions where id = new.report_version_id;
    if v_ver.id is null then
      raise exception 'That report version does not exist' using errcode = '23503';
    end if;
    if v_ver.adopted_at is null then
      raise exception 'A report must be adopted before it can be submitted for HR review'
        using errcode = 'check_violation';
    end if;
    if v_ver.case_id is distinct from new.case_id then
      raise exception 'That report version belongs to a different case' using errcode = 'check_violation';
    end if;
  end if;

  -- (b) NO SELF-APPROVAL, and no approving what you adopted.
  --
  -- Two different people are involved in a safe review: whoever put the report
  -- forward, and whoever decides on it. Checking only requested_by would let
  -- the adopter approve their own report by having someone else submit it.
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status <> 'pending' then

    if v_actor is null then
      raise exception
        'An HR review decision must be made by a signed-in HR user. An automated or service-role process cannot decide a review.'
        using errcode = '42501';
    end if;

    if not exists (select 1 from public.org_members om
                    where om.org_id = new.org_id and om.user_id = v_actor and public.is_hr_role(om.role)) then
      raise exception 'Only HR can decide an HR review' using errcode = '42501';
    end if;

    if v_actor = old.requested_by then
      raise exception 'You cannot decide an HR review that you submitted' using errcode = '42501';
    end if;

    if new.report_version_id is not null then
      select * into v_ver from public.investigation_report_versions where id = new.report_version_id;
      if v_ver.adopted_by = v_actor then
        raise exception 'You cannot decide an HR review of a report that you adopted' using errcode = '42501';
      end if;
    end if;

    -- Decision provenance is assigned, not accepted.
    new.reviewed_by := v_actor;
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.hr_review_report_integrity_guard() from anon, authenticated, public;

create trigger hr_review_report_integrity_trg
  before insert or update on public.hr_review_requests
  for each row
  execute function public.hr_review_report_integrity_guard();


-- ── 8. Row level security ──────────────────────────────────────────────────
--
-- Reads: the same two-part test as investigation_finding_revisions — the bare
-- EXISTS on cases inherits the three-level model and cannot drift from it, and
-- the authority clause adds that seeing the case is not sufficient.
--
-- Writes: INSERT is policy-gated to the same population and then re-checked by
-- the author guard (§5). There is no UPDATE or DELETE policy at all, so the
-- only mutation path is the adoption function, which is SECURITY DEFINER.
alter table public.investigation_report_versions enable row level security;

create policy "Report versions are visible to HR and the current investigator"
  on public.investigation_report_versions
  for select
  using (
    exists (select 1 from public.cases c where c.id = investigation_report_versions.case_id)
    and (
      exists (select 1 from public.org_members m
               where m.org_id = investigation_report_versions.org_id
                 and m.user_id = auth.uid()
                 and public.is_hr_role(m.role))
      or exists (select 1 from public.case_access ca
               where ca.case_id = investigation_report_versions.case_id
                 and ca.user_id = auth.uid()
                 and ca.role = 'investigator')
    )
  );

create policy "HR or the assigned investigator may save a report version"
  on public.investigation_report_versions
  for insert
  with check (
    exists (select 1 from public.cases c where c.id = investigation_report_versions.case_id)
    and (
      exists (select 1 from public.org_members m
               where m.org_id = investigation_report_versions.org_id
                 and m.user_id = auth.uid()
                 and public.is_hr_role(m.role))
      or exists (select 1 from public.case_access ca
               where ca.case_id = investigation_report_versions.case_id
                 and ca.user_id = auth.uid()
                 and ca.role = 'investigator')
    )
  );


-- ── 9. What is NOT here, on purpose ────────────────────────────────────────
--
-- NO BACKFILL, AND NO FABRICATED ADOPTION. The 50 existing reports get no
-- version rows. All 50 carry an investigation_report_date, but that is a
-- GENERATION timestamp and relabelling it as an adoption would invent an
-- adoption event, an adopter and a basis that never existed. A legacy report is
-- derived at read time: investigation_report present AND no version row for the
-- case => legacy, no adoption record. Nothing about those 50 rows changes.
--
-- NO DELETION OF SUPERSEDED DRAFTS. Product decision 1 and 4: superseded drafts
-- may be archived or hidden from the default view by the application, but the
-- history is preserved and there is no purge. Retention remains an OUTSTANDING
-- GOVERNANCE DEPENDENCY, as for superseded narratives.
--
-- NO APPLICATION BEHAVIOUR. Nothing writes or reads this table yet. Generation
-- still advances the stage and still requests HR review through the old path
-- until B3.2 separates them — which is what makes this migration safe to apply
-- on its own, with no window in which existing submissions stop working.
--
-- NO REPORT CONTENT CHANGE. Moving Compass's advisory analysis out of the
-- adopted report, and carrying signature/dispute status into it, is B3.4.
