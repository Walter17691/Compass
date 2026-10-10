-- ════════════════════════════════════════════════════════════════════════════
-- B3.2-1 — INVESTIGATOR REPORT DRAFT SAVING
-- Candidate migration. NOT APPLIED.
--
-- WHAT THIS ADDS, AND WHY EACH PART IS HERE
--
-- The table already enforces more than it first appears. The BEFORE INSERT
-- author guard derives org_id from the case, refuses service-role authorship
-- outright, requires HR or the assigned investigator, and forces created_by,
-- author_kind, is_current and every adoption column. The immutability guard
-- already refuses UPDATE and DELETE. Version numbering already takes
-- `select … for update` on the case before computing max(version_no) + 1.
--
-- So authority is NOT what is missing. Three things are:
--
--   1. ONE WAY IN. Today `authenticated` holds a direct INSERT grant and a
--      permissive INSERT policy, so a draft can be written straight to the
--      table, bypassing any staleness check or audit this migration adds.
--      No application code does this (verified: zero write verbs against the
--      table anywhere in src/ or api/), so closing it breaks nothing shipped.
--
--   2. A STALENESS CHECK. Two saves from the same base version both succeed
--      today, silently. The second investigator's editor never knew the first
--      had saved.
--
--   3. AUDIT PROVENANCE. A saved draft currently produces no audit row at
--      all, so there is no durable record of who authored a version or of an
--      HR member saving on a case they are not the investigator for.
--
-- The genuinely new structures are two immutable request columns:
-- `request_id`, a client-generated identifier with a database uniqueness
-- guarantee, and `request_digest`, which binds that identifier to the exact
-- request it was issued for. Together they are what makes a retry
-- distinguishable from a conflicting edit. Without them the two are
-- indistinguishable — both arrive claiming the same base version — and the
-- only alternative discriminators (matching body text and author) cannot tell
-- a retry apart from a genuine second save of identical wording.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   * does not adopt anything, touch cases.stage, write
--     cases.investigation_report, create an hr_review_request, or alter a
--     legacy report — a draft save is only an append to the version table;
--   * does not alter the author guard, the numbering trigger, or the adoption
--     RPC;
--   * does not change any SELECT grant or SELECT policy, so the case
--     workspace read and the DSAR org-wide collection are untouched;
--   * does not revoke anything from service_role (see §1 note).
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── DRIFT GUARD ───────────────────────────────────────────────────────────
-- Two existing functions are replaced below, and two more are depended upon
-- for authority and for the version lock. Assert their live bodies are the
-- ones this file was written against, INSIDE the applying transaction, so the
-- check cannot pass and then apply against something that changed in between.
do $guard$
declare
  v_audit text;
  v_immut text;
  v_author text;
  v_assign text;
begin
  select md5(prosrc) into v_audit from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'log_audit_event';
  select md5(prosrc) into v_immut from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'investigation_report_versions_immutability_guard';
  select md5(prosrc) into v_author from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'investigation_report_versions_author_guard';
  select md5(prosrc) into v_assign from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'assign_investigation_report_version_no';

  if v_audit is distinct from '5356124b433a41d6b7d9e4d09c0114eb' then
    raise exception 'DRIFT: log_audit_event is not the version this migration was written against (found %)', coalesce(v_audit, 'MISSING');
  end if;
  if v_immut is distinct from '04282636a542e6e6c255e42d4e8de657' then
    raise exception 'DRIFT: investigation_report_versions_immutability_guard has changed (found %)', coalesce(v_immut, 'MISSING');
  end if;
  if v_author is distinct from 'c25056999f07a5d789a1ec0034e9204e' then
    raise exception 'DRIFT: investigation_report_versions_author_guard has changed (found %)', coalesce(v_author, 'MISSING');
  end if;
  if v_assign is distinct from 'fc76a8f6adb17d4f40c2e988143062d0' then
    raise exception 'DRIFT: assign_investigation_report_version_no has changed (found %)', coalesce(v_assign, 'MISSING');
  end if;
end;
$guard$;


-- ── §1 — ONE WAY IN ───────────────────────────────────────────────────────
--
-- THREE layers, because each closes a hole the others leave open:
--
--   (a) REVOKE the direct INSERT grant. Without this, any permissive INSERT
--       policy added later re-opens the route.
--
--   (b) DROP the permissive INSERT policy. Without this, restoring the grant
--       re-opens the route — and Supabase's schema-level default privileges
--       do grant INSERT to `authenticated` at table creation, which is
--       exactly how it got there.
--
--   (c) CREATE A RESTRICTIVE DENY in its place. This is the part that makes
--       the closure durable rather than merely current, and it is the pattern
--       this codebase already uses for the identical problem on
--       case_decisions (supabase/decision_insert_boundary_2026-10-03.sql,
--       policy "Decisions are created only through record_case_decision").
--       PERMISSIVE policies are ORed, so dropping one is undone by anyone
--       adding another. RESTRICTIVE policies are ANDed: re-opening the route
--       has to be a deliberate act of dropping this policy by name.
--
-- Keeping (c) also means the recorded RLS posture for this table stays at
-- TWO policies, so RECORDED_RLS_2026_10_03 in src/lib/dataClassification.js
-- and its assertion in src/test/reportVersionsDsar.test.js remain correct and
-- are deliberately NOT edited by this release.
--
-- None of the three affects the save RPC. It is SECURITY DEFINER owned by
-- postgres, so inside it current_user is postgres — who holds the table
-- INSERT privilege and carries rolbypassrls, meaning neither the missing
-- grant nor the restrictive policy applies to it. Verified by probe, not
-- assumed.
--
-- service_role KEEPS its INSERT grant deliberately. It cannot author a
-- version regardless: the author guard sets v_actor to null for service_role
-- and raises 42501. Revoking it would add no protection and risks breaking
-- administrative tooling that this slice has no mandate to touch.
--
-- anon is revoked as well. It should never have held INSERT; it is a Supabase
-- default-privilege artefact, the same one recorded as an outstanding
-- permission-hardening follow-up on adoption_stage_block_reason.
revoke insert on public.investigation_report_versions from anon, authenticated;

drop policy if exists "HR or the assigned investigator may save a report version"
  on public.investigation_report_versions;

create policy "Report versions are created only through save_investigation_report_version"
  on public.investigation_report_versions
  as restrictive for insert
  with check (false);


-- ── §2 — THE IDEMPOTENCY TOKEN AND WHAT IT IS BOUND TO ────────────────────
--
-- request_id answers "is this the same save attempt?". request_digest answers
-- "is it the same save?" — it binds the identifier to the exact request, so
-- the same identifier can never return success for a materially different
-- one.
--
-- WHY A DIGEST RATHER THAN THE FIELDS THEMSELVES. Five of the seven fields a
-- retry must match are already on the row or derivable from it: request_id,
-- case_id, created_by, body and source are stored, and expected_base_version
-- is exactly version_no - 1 (the save only proceeds when the stated base
-- equals max(version_no), and the numbering trigger then assigns max + 1).
-- The HR exception reason is the one field with nowhere to live: it is
-- recorded in the audit trail, which is append-only and attributable, but
-- cannot be read back for a field-by-field comparison.
--
-- A digest over all six inputs is therefore the smallest change that closes
-- the gap, and it is smaller in the way that matters: it adds no new readable
-- personal data to the table, so it introduces no disclosure surface and no
-- change to the DSAR classification. The gateway selects an explicit column
-- list in both its reads, so neither new column reaches a subject access
-- response.
--
-- Both columns are nullable, because they must be addable without rewriting
-- history and because a future legitimate non-RPC path (a backfill, or a
-- system-authored generated version) should not be forced to invent one. The
-- RPC REQUIRES request_id and always writes both, so every row the
-- application can create will carry them. Compatibility with existing
-- immutable versions is total: the table holds zero rows in production, so no
-- existing row needs a value and no existing row's immutability is disturbed.
alter table public.investigation_report_versions
  add column if not exists request_id uuid;

alter table public.investigation_report_versions
  add column if not exists request_digest text;

comment on column public.investigation_report_versions.request_id is
  'Client-generated idempotency token for save_investigation_report_version. Globally unique when present. Distinguishes a retried save from a second, conflicting edit.';

comment on column public.investigation_report_versions.request_digest is
  'SHA-256 over the whole save request (case, actor, body, source, expected base version, HR exception reason). Binds request_id to the request it was issued for, so a reused identifier carrying a materially different request is refused rather than answered as a replay.';

-- GLOBAL rather than per-case uniqueness. A client-generated uuid is unique
-- by construction, so a request_id appearing on a second case is always a
-- client defect, and a global index detects it rather than quietly permitting
-- it. Partial, so the nullable column above costs nothing for rows without
-- a token.
create unique index if not exists investigation_report_versions_request_id_unique
  on public.investigation_report_versions (request_id)
  where request_id is not null;


-- ── §3 — PROTECT THE REQUEST METADATA FROM LATER MUTATION ─────────────────
--
-- The immutability guard enumerates the columns it protects BY NAME, so a
-- newly added column is unprotected on UPDATE unless it is listed. There is
-- no UPDATE policy on the table today, so no client can reach this — but the
-- adoption RPC can, and the whole point of these two columns is that they
-- cannot be re-pointed after the fact. Listed for the same reason every other
-- column on this table is listed.
--
-- This is otherwise a byte-for-byte reproduction of the live function.
create or replace function public.investigation_report_versions_immutability_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.cases where id = old.case_id) then return old; end if;
    if not exists (select 1 from public.organisations where id = old.org_id) then return old; end if;
    raise exception
      'A saved investigation report version cannot be deleted (version % of case %). Superseded drafts are retained as restricted case records.',
      old.version_no, old.case_id using errcode = 'check_violation';
  end if;
  if new.body is distinct from old.body
     or new.version_no is distinct from old.version_no
     or new.case_id is distinct from old.case_id
     or new.org_id is distinct from old.org_id
     or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.author_kind is distinct from old.author_kind
     or new.request_id is distinct from old.request_id
     or new.request_digest is distinct from old.request_digest then
    raise exception
      'A saved investigation report version cannot be changed (version % of case %). Save a new version instead.',
      old.version_no, old.case_id using errcode = 'check_violation';
  end if;
  if old.adopted_at is not null then
    if new.adopted_at is distinct from old.adopted_at
       or new.adopted_by is distinct from old.adopted_by
       or new.adoption_basis is distinct from old.adoption_basis
       or new.adoption_reason is distinct from old.adoption_reason then
      raise exception
        'An adopted investigation report cannot be un-adopted or re-attributed (version % of case %). Adopt a later version instead.',
        old.version_no, old.case_id using errcode = 'check_violation';
    end if;
  end if;
  if old.superseded_at is not null
     and (new.superseded_at is distinct from old.superseded_at
          or new.superseded_by_version_id is distinct from old.superseded_by_version_id) then
    raise exception 'A superseded adoption cannot be altered (version % of case %).',
      old.version_no, old.case_id using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;


-- ── §4 — THE SAVE RPC ─────────────────────────────────────────────────────
--
-- ORDER OF OPERATIONS IS THE WHOLE DESIGN, and two orderings are load-bearing
-- in OPPOSITE directions:
--
--   * AUTHORITY MUST PRECEDE REPLAY. A replay returns a stored row, so it is
--     a READ, and it has to be authorised like one. An earlier draft of this
--     function checked the request before checking the caller, and a probe
--     showed exactly what that costs: an investigator whose case access had
--     been REVOKED could replay their old request_id — needing nothing but
--     the draft text they wrote themselves — and receive the stored row back,
--     including adopted_at, adopted_by, adoption_basis and the HR-authored
--     adoption_reason. Both other routes to that row correctly refused them
--     (a new save raised 42501, and SELECT returned zero rows under RLS), so
--     the replay path was the only way in and it bypassed both. Authority is
--     therefore established BEFORE the stored row is looked at, and a replay
--     by someone who no longer has access is refused rather than answered.
--
--   * REPLAY MUST PRECEDE STALENESS. A genuine retry always looks stale,
--     because the save it is retrying already moved the latest version to
--     base + 1. Checking staleness first would reject every retry as a
--     conflict.
--
--   1. authenticated human, non-null base, valid source   — cheap refusals
--   2. lock the case                                      — serialise rivals
--   3. authority                                           — investigator, or
--                                                            HR with a reason.
--                                                            Gates the replay
--                                                            read as well as
--                                                            the write.
--   4. replay?  same request_id already stored → compare the WHOLE request,
--               then return the stored row; no new version, no new audit
--   5. stale?   latest <> expected base        → raise, no insert, no audit
--   6. insert                                              — triggers enforce
--   7. audit                                               — reserved action
create or replace function public.save_investigation_report_version(
  p_case_id uuid,
  p_body text,
  p_request_id uuid,
  p_expected_base_version integer,
  p_source text default 'edited',
  p_hr_reason text default null
)
returns public.investigation_report_versions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_privileged boolean := coalesce(auth.role(), '') = 'service_role';
  v_actor uuid := case when v_privileged then null else auth.uid() end;
  v_case public.cases;
  v_existing public.investigation_report_versions;
  v_row public.investigation_report_versions;
  v_latest integer;
  v_is_investigator boolean;
  v_is_hr boolean;
  v_member record;
  v_reason text := nullif(btrim(coalesce(p_hr_reason, '')), '');
  v_digest text;
begin
  -- ── 1. CHEAP REFUSALS ──────────────────────────────────────────────────
  -- Mirrors the adoption RPC's wording. A service-role process cannot author
  -- a report, and the author guard would refuse it anyway; refusing here too
  -- means the caller gets the reason rather than a trigger's message.
  if v_actor is null then
    raise exception
      'An investigation report draft must be saved by a signed-in user. An automated or service-role process cannot author a report.'
      using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception
      'A save request must carry a request identifier, so that a retry can be told apart from a second edit.'
      using errcode = '22023';
  end if;

  -- Nullable would mean a caller could omit it and silently get
  -- last-write-wins, which is the defect this function exists to close.
  if p_expected_base_version is null then
    raise exception
      'A save request must state the version it was started from, so that a save made against an out-of-date draft can be refused.'
      using errcode = '22023';
  end if;

  if p_expected_base_version < 0 then
    raise exception 'A base version cannot be negative' using errcode = '22023';
  end if;

  -- An OMITTED source defaults to 'edited' (the parameter default above). An
  -- EXPLICIT null is a different thing — a caller stating a source it does
  -- not know — and is refused here rather than quietly coerced. Because this
  -- guard rejects null, p_source is non-null and valid from here on, and the
  -- insert below uses it directly: there is no reachable null left to
  -- coalesce away.
  if coalesce(p_source, '') not in ('generated', 'edited') then
    raise exception 'Unknown report source %', coalesce(p_source, '(null)') using errcode = '22023';
  end if;

  if coalesce(btrim(coalesce(p_body, '')), '') = '' then
    raise exception 'An investigation report draft cannot be saved empty' using errcode = 'check_violation';
  end if;

  -- The request, reduced to one value. jsonb orders its keys canonically, so
  -- the same request always produces the same digest. Computed from the
  -- NORMALISED inputs actually used below (validated source, trimmed-or-null
  -- reason), so the digest describes what was saved rather than how it was
  -- typed. The reason is included whether or not it turns out to be needed:
  -- the digest covers the request as submitted, so changing any submitted
  -- field makes it a different request.
  v_digest := encode(sha256(convert_to(jsonb_build_object(
      'case_id', p_case_id,
      'actor',   v_actor,
      'body',    p_body,
      'source',  p_source,
      'base',    p_expected_base_version,
      'reason',  v_reason
    )::text, 'utf8')), 'hex');

  -- ── 2. THE LOCK ────────────────────────────────────────────────────────
  -- The same row lock the numbering trigger takes. Taking it here first means
  -- the trigger's own `for update` is a no-op re-lock on a row this
  -- transaction already holds, so the two cooperate rather than compete, and
  -- the max(version_no) read below cannot be overtaken between read and
  -- insert.
  select * into v_case from public.cases where id = p_case_id for update;
  if v_case.id is null then
    raise exception 'That case does not exist' using errcode = '23503';
  end if;

  -- ── 3. AUTHORITY ───────────────────────────────────────────────────────
  -- ESTABLISHED BEFORE THE STORED ROW IS READ. See the header: a replay hands
  -- back a saved version, so it is a read of case data and must be authorised
  -- as one. Checking the request before the caller let a revoked investigator
  -- retrieve an adopted report's provenance by replaying their own old
  -- request_id.
  --
  -- The author guard enforces investigator-or-HR independently on INSERT.
  -- This adds the part a trigger cannot: that HR acting on a case they are not
  -- the investigator for must say why, recorded permanently in the audit
  -- trail. Deliberately mirrors the adoption RPC's 'hr_exception' concept.
  select exists (
      select 1 from public.case_access ca
       where ca.case_id = p_case_id and ca.user_id = v_actor and ca.role = 'investigator'),
    exists (
      select 1 from public.org_members om
       where om.org_id = v_case.org_id and om.user_id = v_actor and public.is_hr_role(om.role))
    into v_is_investigator, v_is_hr;

  if not v_is_investigator then
    if not v_is_hr then
      raise exception
        'Only this case''s assigned investigator, or HR under a documented exception, can save an investigation report draft'
        using errcode = '42501';
    end if;
    if v_reason is null then
      raise exception
        'Saving a report draft as HR rather than the assigned investigator requires a written reason, which is recorded in the case audit trail'
        using errcode = 'check_violation';
    end if;
  end if;

  -- ── 4. REPLAY ──────────────────────────────────────────────────────────
  -- After authority, before staleness, for the two reasons in the header.
  --
  -- THE COMPARISON IS THE WHOLE REQUEST, NOT PART OF IT. request_digest
  -- covers all six inputs at once, including the HR exception reason, and is
  -- the authoritative test. The named comparisons that precede it are a
  -- subset of the same thing, kept because they can say WHICH field differs —
  -- a reused identifier is a client defect, and a precise message is how it
  -- gets found. expected_base_version is compared as version_no - 1, which is
  -- exactly the base the stored version was saved from.
  select * into v_existing
    from public.investigation_report_versions
   where request_id = p_request_id;

  if v_existing.id is not null then
    if v_existing.case_id is distinct from p_case_id then
      raise exception
        'That save request identifier has already been used for a different case. Start a new save.'
        using errcode = '22023';
    end if;
    if v_existing.created_by is distinct from v_actor then
      raise exception
        'That save request identifier has already been used by a different author. Start a new save.'
        using errcode = '22023';
    end if;
    if v_existing.body is distinct from p_body then
      raise exception
        'That save request identifier has already been used for different report text. Start a new save, or reload the report to see what was stored.'
        using errcode = '22023';
    end if;
    if v_existing.source is distinct from p_source then
      raise exception
        'That save request identifier has already been used for a differently sourced report. Start a new save.'
        using errcode = '22023';
    end if;
    if (v_existing.version_no - 1) is distinct from p_expected_base_version then
      raise exception
        'That save request identifier was issued for a draft started from version %, not version %. Reload the report and start a new save.',
        v_existing.version_no - 1, p_expected_base_version
        using errcode = '22023';
    end if;
    -- Catches anything the named checks cannot see — today, the HR exception
    -- reason. A replay must be the same request in every respect.
    if v_existing.request_digest is distinct from v_digest then
      raise exception
        'That save request identifier has already been used for a materially different request. Start a new save.'
        using errcode = '22023';
    end if;
    -- A true replay: the first attempt committed and the response was lost.
    -- Return what was stored. No new version, and deliberately no second
    -- audit row — the save happened once and is recorded once.
    return v_existing;
  end if;

  -- ── 5. STALENESS ───────────────────────────────────────────────────────
  select coalesce(max(version_no), 0) into v_latest
    from public.investigation_report_versions
   where case_id = p_case_id;

  if p_expected_base_version <> v_latest then
    raise exception
      'STALE_EDITOR: this case is now at version %, but this draft was started from version %. Reload the report before saving, so the other author''s version is not lost.',
      v_latest, p_expected_base_version
      using errcode = '40001';
  end if;

  -- ── 6. INSERT ──────────────────────────────────────────────────────────
  -- version_no is assigned by the numbering trigger under the lock held
  -- above. org_id is supplied for clarity; the author guard derives and
  -- overwrites it with the same value from the case. created_by, author_kind,
  -- is_current and every adoption column are set by the author guard and are
  -- deliberately not supplied here.
  insert into public.investigation_report_versions
    (org_id, case_id, body, source, request_id, request_digest)
  values
    (v_case.org_id, p_case_id, p_body, p_source, p_request_id, v_digest)
  returning * into v_row;

  -- ── 7. AUDIT ───────────────────────────────────────────────────────────
  -- Written directly, exactly as the adoption RPC does, because the action is
  -- reserved: log_audit_event refuses it, so it cannot be forged through the
  -- generic audit RPC. audit_log is append-only by trigger, which is what
  -- makes the HR reason a permanent record rather than an editable note, and
  -- user_id carries the authenticated actor the author guard independently
  -- stamped onto the version row.
  select * into v_member from public.org_members
   where org_id = v_case.org_id and user_id = v_actor;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (
    v_case.org_id, v_actor, coalesce(v_member.name, 'Unknown'),
    case when v_is_investigator
         then 'Investigation report draft saved'
         else 'Investigation report draft saved under HR exception' end,
    'Version ' || v_row.version_no
      || case when v_is_investigator
              then ' — saved by the assigned investigator'
              else ' — saved by HR rather than the assigned investigator. Reason: ' || v_reason end,
    p_case_id);

  return v_row;
end;
$function$;

revoke all on function public.save_investigation_report_version(uuid, text, uuid, integer, text, text) from public;
revoke all on function public.save_investigation_report_version(uuid, text, uuid, integer, text, text) from anon;
grant execute on function public.save_investigation_report_version(uuid, text, uuid, integer, text, text) to authenticated;


-- ── §5 — RESERVE THE NEW AUDIT ACTIONS ────────────────────────────────────
--
-- Otherwise the two new actions could be written by any org member through
-- the generic audit RPC, and a forged "draft saved" entry would be
-- indistinguishable from one this function wrote. Identical to the live
-- function except for the two added list entries.
create or replace function public.log_audit_event(
  p_org_id uuid, p_action text, p_detail text default ''::text, p_case_id uuid default null::uuid,
  p_ai_prepared boolean default false, p_approved_by text default null::text, p_data_used text default null::text)
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
    'Investigation report adopted',
    'Investigation report adopted under HR exception',
    'Investigation report draft saved',
    'Investigation report draft saved under HR exception'
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

commit;
