-- ════════════════════════════════════════════════════════════════════════════
-- B3.2 — PERSISTENT AUTHORING MODE FOR INVESTIGATION REPORT VERSIONS
-- Candidate migration. NOT APPLIED.
--
-- An investigation report is written either as seven guided sections or as one
-- document. Which one it was is a fact about the document, and until now it was
-- not recorded anywhere: the editor re-derived it from the text every time a
-- version was opened. That inference is right for a legacy report, which can
-- only be one document, and wrong in the other direction — a single document
-- whose text happens to match the structured shape reopened as seven boxes, and
-- the author's one document silently became seven. The session fix in 0a6f359d
-- narrowed that to a browser refresh. This removes the inference entirely for
-- every version written from here on.
--
-- WHAT IS STORED AND WHAT IS NOT
--
--   * authoring_mode is NULLABLE, because 'not recorded' is a true thing to say
--     about any row written before this migration and about any future path
--     that legitimately does not know. The column does not invent history.
--
--   * …but the RPC REFUSES to write one. A new version must state its mode:
--     missing, null, blank and unrecognised are all refused, and nothing is
--     inferred server-side or defaulted to structured_sections. A version
--     created from here on either records how it was written or does not exist.
--     Those two rules are not in tension — one is about the past, the other
--     about the future.
--
-- WHY THE FUNCTION IS DROPPED AND RECREATED RATHER THAN REPLACED
--
-- CREATE OR REPLACE cannot add a parameter. Adding a defaulted seventh argument
-- creates a SECOND function, and the existing six-argument call shape then
-- raises 42725 'function … is not unique' — so a replace-in-place would break
-- every call the moment it landed. Proven on this database rather than assumed:
-- two overloads, ambiguous call, drop the old signature, call resolves again.
-- The drop and the create are in one transaction, so there is no window in
-- which only half of it is true.
--
-- The seventh parameter still carries DEFAULT NULL even though null is refused.
-- That is deliberate: it makes the old six-key call RESOLVE and then be refused
-- with a sentence about provenance, instead of failing to find the function at
-- all and being reported to the user as "Compass is finishing an update".
-- Provenance validation is not weakened to accommodate it — the call is
-- refused either way; the difference is only whether the refusal is honest.
--
-- WHAT THIS DOES NOT TOUCH. The adoption RPC, the author guard, the version
-- numbering trigger, log_audit_event, every policy, every grant on the table,
-- the DSAR read, the legacy mirror, export, and the stored report body.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── DRIFT GUARD ───────────────────────────────────────────────────────────
-- Asserted INSIDE the applying transaction, so the check cannot pass and then
-- apply against something that changed in between. Five functions: the two
-- being replaced, and three this migration depends on without touching.
do $guard$
declare
  v_save text; v_immut text; v_author text; v_assign text; v_audit text;
begin
  select md5(prosrc) into v_save from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'save_investigation_report_version';
  select md5(prosrc) into v_immut from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'investigation_report_versions_immutability_guard';
  select md5(prosrc) into v_author from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'investigation_report_versions_author_guard';
  select md5(prosrc) into v_assign from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'assign_investigation_report_version_no';
  select md5(prosrc) into v_audit from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'log_audit_event';

  if v_save is distinct from 'afc33c77086466f514513e8dee00531a' then
    raise exception 'DRIFT: save_investigation_report_version is not the version this migration was written against (found %)', coalesce(v_save, 'MISSING');
  end if;
  if v_immut is distinct from 'fcbaf3bcd9dd26469a5d141d4b2962d1' then
    raise exception 'DRIFT: investigation_report_versions_immutability_guard has changed (found %)', coalesce(v_immut, 'MISSING');
  end if;
  if v_author is distinct from 'c25056999f07a5d789a1ec0034e9204e' then
    raise exception 'DRIFT: investigation_report_versions_author_guard has changed (found %)', coalesce(v_author, 'MISSING');
  end if;
  if v_assign is distinct from 'fc76a8f6adb17d4f40c2e988143062d0' then
    raise exception 'DRIFT: assign_investigation_report_version_no has changed (found %)', coalesce(v_assign, 'MISSING');
  end if;
  if v_audit is distinct from '2a4134eda9d7049d774852e8d41f3e3e' then
    raise exception 'DRIFT: log_audit_event has changed (found %)', coalesce(v_audit, 'MISSING');
  end if;
end;
$guard$;

-- ── A VERSION RECORDS HOW IT WAS WRITTEN ──────────────────────────────────
alter table public.investigation_report_versions
  add column if not exists authoring_mode text;

-- Nullable, so 'not recorded' stays sayable; constrained, so a recorded value
-- is always one of the two the product knows how to render.
alter table public.investigation_report_versions
  drop constraint if exists investigation_report_versions_authoring_mode_valid;
alter table public.investigation_report_versions
  add constraint investigation_report_versions_authoring_mode_valid
  check (authoring_mode is null
         or authoring_mode in ('structured_sections', 'single_document'));

comment on column public.investigation_report_versions.authoring_mode is
  'How this version was written: structured_sections (the seven guided fields) or single_document (one free text). NULL means not recorded — true of any version written before 2026-10-11 and never inferred after it. save_investigation_report_version refuses to create a version without one.';

-- ── THE MODE IS IMMUTABLE, LIKE EVERYTHING ELSE ABOUT A SAVED VERSION ─────
-- The guard enumerates protected columns BY NAME, so a new column is
-- unprotected on UPDATE until listed. Otherwise identical to the live function.
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
     or new.request_digest is distinct from old.request_digest
     or new.authoring_mode is distinct from old.authoring_mode then
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

-- ── THE SAVE RPC ──────────────────────────────────────────────────────────
-- Dropped and recreated, for the overload reason in the header. The ACL goes
-- with the function, so the grants are reissued below in the same transaction.
drop function if exists public.save_investigation_report_version(uuid, text, uuid, integer, text, text);

create function public.save_investigation_report_version(
  p_case_id uuid,
  p_body text,
  p_request_id uuid,
  p_expected_base_version integer,
  p_source text default 'edited',
  p_hr_reason text default null,
  p_authoring_mode text default null
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
  v_mode text := nullif(btrim(coalesce(p_authoring_mode, '')), '');
  v_prev_mode text;
  v_digest text;
begin
  -- ── 1. CHEAP REFUSALS ──────────────────────────────────────────────────
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

  if p_expected_base_version is null then
    raise exception
      'A save request must state the version it was started from, so that a save made against an out-of-date draft can be refused.'
      using errcode = '22023';
  end if;

  if p_expected_base_version < 0 then
    raise exception 'A base version cannot be negative' using errcode = '22023';
  end if;

  if coalesce(p_source, '') not in ('generated', 'edited') then
    raise exception 'Unknown report source %', coalesce(p_source, '(null)') using errcode = '22023';
  end if;

  -- EVERY NEW VERSION STATES HOW IT WAS WRITTEN. Missing, null and blank are
  -- one refusal because they are one mistake; an unrecognised value is
  -- another, because it means the caller thinks a mode exists that does not.
  -- Nothing is inferred here and nothing is defaulted: a version that cannot
  -- say how it was authored is not created. This is also what a caller using
  -- the previous six-argument shape now receives — a sentence about
  -- provenance rather than a missing function.
  if v_mode is null then
    raise exception
      'A save request must state how the report was written — as seven guided sections, or as one document. Compass does not infer it.'
      using errcode = '22023';
  end if;
  if v_mode not in ('structured_sections', 'single_document') then
    raise exception 'Unknown authoring mode %', v_mode using errcode = '22023';
  end if;

  if coalesce(btrim(coalesce(p_body, '')), '') = '' then
    raise exception 'An investigation report draft cannot be saved empty' using errcode = 'check_violation';
  end if;

  -- The request, reduced to one value. The authoring mode is PART OF THE
  -- REQUEST and therefore part of the digest: without it, two requests
  -- differing only in mode would share a digest, and the second would be
  -- answered as a replay of the first — reporting success while storing the
  -- other mode. Safe to change the formula only because no version exists yet.
  v_digest := encode(sha256(convert_to(jsonb_build_object(
      'case_id', p_case_id,
      'actor',   v_actor,
      'body',    p_body,
      'source',  p_source,
      'base',    p_expected_base_version,
      'reason',  v_reason,
      'mode',    v_mode
    )::text, 'utf8')), 'hex');

  -- ── 2. THE LOCK ────────────────────────────────────────────────────────
  select * into v_case from public.cases where id = p_case_id for update;
  if v_case.id is null then
    raise exception 'That case does not exist' using errcode = '23503';
  end if;

  -- ── 3. AUTHORITY ───────────────────────────────────────────────────────
  -- Before the stored row is read: a replay hands back a saved version, so it
  -- is a read of case data and must be authorised as one.
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
    if v_existing.authoring_mode is distinct from v_mode then
      raise exception
        'That save request identifier has already been used for a report written a different way. Start a new save.'
        using errcode = '22023';
    end if;
    if (v_existing.version_no - 1) is distinct from p_expected_base_version then
      raise exception
        'That save request identifier was issued for a draft started from version %, not version %. Reload the report and start a new save.',
        v_existing.version_no - 1, p_expected_base_version
        using errcode = '22023';
    end if;
    if v_existing.request_digest is distinct from v_digest then
      raise exception
        'That save request identifier has already been used for a materially different request. Start a new save.'
        using errcode = '22023';
    end if;
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

  -- What the previous version recorded, so a CHANGE of mode is auditable as a
  -- change rather than only as two rows a reader has to compare. Null when
  -- there is no previous version, or when it predates this column.
  select authoring_mode into v_prev_mode
    from public.investigation_report_versions
   where case_id = p_case_id and version_no = v_latest;

  -- ── 6. INSERT ──────────────────────────────────────────────────────────
  insert into public.investigation_report_versions
    (org_id, case_id, body, source, request_id, request_digest, authoring_mode)
  values
    (v_case.org_id, p_case_id, p_body, p_source, p_request_id, v_digest, v_mode)
  returning * into v_row;

  -- ── 7. AUDIT ───────────────────────────────────────────────────────────
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
              else ' — saved by HR rather than the assigned investigator. Reason: ' || v_reason end
      || ', written as '
      || case when v_mode = 'structured_sections' then 'seven guided sections' else 'one document' end
      || case when v_prev_mode is not null and v_prev_mode is distinct from v_mode
              then ' (changed from '
                   || case when v_prev_mode = 'structured_sections' then 'seven guided sections' else 'one document' end
                   || ')'
              else '' end,
    p_case_id);

  return v_row;
end;
$function$;

-- The ACL does not survive the drop, so it is reissued here. Same grants as
-- before: authenticated only, never anon, never service_role.
revoke all on function public.save_investigation_report_version(uuid, text, uuid, integer, text, text, text) from public;
revoke all on function public.save_investigation_report_version(uuid, text, uuid, integer, text, text, text) from anon;
grant execute on function public.save_investigation_report_version(uuid, text, uuid, integer, text, text, text) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — VALID ONLY WHILE investigation_report_versions IS EMPTY
--
-- Proven by probe, including the part that is easy to get wrong: dropping the
-- column and the constraint is clean, but the two REPLACED FUNCTION BODIES do
-- not come back on their own. A rollback that forgets them leaves the function
-- count at 83 with no save RPC at all, and an immutability guard still naming
-- a column that no longer exists.
--
-- So a rollback is four steps, in this order, in one transaction:
--
--   1. drop function public.save_investigation_report_version
--        (uuid, text, uuid, integer, text, text, text);
--   2. alter table public.investigation_report_versions
--        drop constraint investigation_report_versions_authoring_mode_valid;
--   3. alter table public.investigation_report_versions drop column authoring_mode;
--   4. re-run the PRE-MIGRATION definitions of
--        investigation_report_versions_immutability_guard  -> md5 fcbaf3bcd9dd26469a5d141d4b2962d1
--        save_investigation_report_version (6 arguments)   -> md5 afc33c77086466f514513e8dee00531a
--      and reissue that function's grants, since the drop took its ACL.
--      Both bodies are recorded verbatim in
--      supabase/investigation_report_draft_saving_2026-10-10.sql as applied,
--      plus the request_digest line added since; verify by md5 after.
--
-- ONCE ANY VERSION RECORDS A MODE, ROLLBACK DESTROYS PROVENANCE and the only
-- safe direction is forward. Production holds 0 versions today, which is
-- exactly why this migration belongs BEFORE any organisation is activated —
-- after activation the first real versions would be the ones unable to say
-- how they were written, which is the problem this migration exists to end.
-- ════════════════════════════════════════════════════════════════════════════
