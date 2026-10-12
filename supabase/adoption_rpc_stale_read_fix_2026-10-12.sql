-- ════════════════════════════════════════════════════════════════════════════
-- ADOPTION RPC — RE-READ THE VERSION UNDER THE CASE LOCK
-- Candidate migration. NOT APPLIED.
--
-- Narrow correction to adopt_investigation_report_version. The B3.1 migration
-- that created investigation_report_versions is NOT touched.
--
-- ── THE DEFECT, LOCATED PRECISELY ───────────────────────────────────────────
--
-- Read from the live body by character position in prosrc:
--
--     char  601   select v.* into v_row ... where v.id = p_version_id   (NO LOCK)
--     char  883   perform 1 from public.cases ... for update            (LOCK)
--     char  898   if v_row.adopted_at is not null  -> 'already adopted'
--     char 4698   update ... set adopted_at = now() ...
--
-- The adoption test sits 15 characters AFTER the lock but evaluates a row read
-- 282 characters BEFORE it, and the row is never refreshed. Confirmed
-- mechanically: `select v.* into v_row` occurs exactly once in the body.
--
-- Under READ COMMITTED that is a stale-snapshot window. Two sessions adopting
-- the same version:
--
--   T1  reads v_row (adopted_at NULL) -> takes cases[X] -> adopts -> commits
--   T2  reads v_row (adopted_at NULL) -> BLOCKS on cases[X]
--       ... T1 commits, T2 acquires the lock ...
--       T2's v_row is still the pre-wait snapshot, so adopted_at still reads
--       NULL, the 'already adopted' check passes, and T2 proceeds to UPDATE.
--
-- ── WHAT ACTUALLY HAPPENS TODAY, AND WHY IT IS STILL A DEFECT ───────────────
--
-- DEMONSTRATED with two independent local sessions (PostgreSQL 17.11,
-- deadlock_timeout 200ms), both acquisition orders:
--
--   session A  RESULT=OK
--   session B  RESULT=refused SQLSTATE=23514
--              'An adopted investigation report cannot be un-adopted or
--               re-attributed'
--   blocking   45396<-blocked_by[45393] wait=Lock/transactionid
--   ledger     1:adoption, 2:adoption   case_seq duplicates: 0
--
-- So there is NO corruption and NO lost update: the UPDATE is caught one layer
-- later by investigation_report_versions_immutability_guard, which is doing
-- exactly its job. The defect is that the refusal comes from the wrong layer
-- and says the wrong thing. A user who lost a benign race is told their
-- adoption "cannot be un-adopted or re-attributed" -- a message about
-- tampering -- instead of being told someone else adopted it a moment ago.
-- The guard is the backstop; it should not be the primary control.
--
-- ── THE CORRECTION ──────────────────────────────────────────────────────────
--
-- The pre-lock read is reduced to the ONE fact needed to know which row to
-- lock (case_id), plus the adoption state as it looked before waiting. The
-- version row is then RE-READ under the case lock, and every
-- version-dependent decision uses that row.
--
-- Keeping the pre-lock adoption state is what lets the refusal be honest about
-- which situation it is:
--
--   already adopted when we first looked  -> the existing message, unchanged,
--                                            so nothing that depends on it
--                                            breaks
--   adopted while we waited              -> an INTENTIONAL CONFLICT naming the
--                                            concurrency
--
-- LOCK ORDER IS PRESERVED. The re-read takes `for update` on the version row
-- AFTER the case row, which is the same cases -> versions order the function
-- already uses for its own later UPDATE, and the same order
-- assign_investigation_report_version_no uses. No new lock edge is introduced,
-- so the per-case mutex protocol is unchanged.
--
-- Everything else in the body is byte-identical: the signed-in-user check, the
-- investigator/HR authority split, the HR-exception written reason, the stage
-- eligibility call to adoption_stage_block_reason, the allegation-position
-- completeness count, the supersession of the previous current version, the
-- legacy mirror to cases, and the audit insert.
--
-- ── ORDERING AGAINST THE OTHER CANDIDATES ───────────────────────────────────
--
-- hr_review_lifecycle_mutex_2026-10-12.sql pins this function at
-- fb45b6388323936ce8e405614ecc2882 in its own drift guard, so THIS migration
-- must be applied AFTER it. Applying this first would make A3c refuse. The
-- recommended order is: adoption-predicate fix, then A3c, then this.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── DRIFT GUARD ───────────────────────────────────────────────────────────
do $guard$
declare
  v_md5 text; v_args text; v_secdef boolean; v_owner name;
  v_lang name; v_vol "char"; v_cfg text; v_acl text; v_reads int;
begin
  select md5(p.prosrc), pg_get_function_identity_arguments(p.oid), p.prosecdef,
         pg_get_userbyid(p.proowner), l.lanname, p.provolatile,
         coalesce(array_to_string(p.proconfig, ','), ''),
         coalesce(array_to_string(p.proacl, ' | '), ''),
         (select count(*) from regexp_matches(p.prosrc, 'select v\.\* into v_row', 'g'))
    into v_md5, v_args, v_secdef, v_owner, v_lang, v_vol, v_cfg, v_acl, v_reads
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
   where n.nspname = 'public' and p.proname = 'adopt_investigation_report_version';

  if v_md5 is null then
    raise exception 'DRIFT: public.adopt_investigation_report_version does not exist.';
  end if;
  if v_md5 <> 'fb45b6388323936ce8e405614ecc2882' then
    raise exception 'DRIFT: the adoption RPC is %, expected fb45b6388323936ce8e405614ecc2882. This correction reproduces the recorded body with the version read moved under the case lock, and must not be applied on top of a different one.', v_md5;
  end if;
  if v_args <> 'p_version_id uuid, p_basis text, p_reason text' then
    raise exception 'DRIFT: signature is (%)', v_args; end if;
  if not v_secdef then
    raise exception 'DRIFT: the function is no longer SECURITY DEFINER.'; end if;
  if v_owner <> 'postgres' then
    raise exception 'DRIFT: owner is %, expected postgres.', v_owner; end if;
  if v_lang <> 'plpgsql' then
    raise exception 'DRIFT: language is %, expected plpgsql.', v_lang; end if;
  if v_vol <> 'v' then
    raise exception 'DRIFT: volatility is %, expected VOLATILE.', v_vol; end if;
  if v_cfg <> 'search_path=public' then
    raise exception 'DRIFT: proconfig is "%", expected search_path=public.', v_cfg; end if;
  if v_acl <> 'postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres' then
    raise exception 'DRIFT: ACL is "%". Note it deliberately does NOT include anon; re-review the privilege position before applying.', v_acl; end if;

  -- THE DEFECT ITSELF, asserted as a precondition. If the version is already
  -- read more than once, someone has fixed this and applying blindly would be
  -- acting on a stale audit.
  if v_reads <> 1 then
    raise exception 'DRIFT: the version row is read % time(s); this correction expects exactly the single pre-lock read it exists to replace.', v_reads;
  end if;

  -- A3c must already be in place, because it pins this function's current md5.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public'
                    and c.relname = 'investigation_report_lifecycle_events') then
    raise exception 'ORDERING: hr_review_lifecycle_mutex_2026-10-12.sql must be applied BEFORE this migration, because its drift guard pins this function at fb45b638... Applying this first makes A3c refuse.';
  end if;

  -- No organisation may be activated yet: the versioned adoption path this
  -- corrects is not reachable until activation, and activation is the last gate.
  if (select count(*) from public.organisation_report_settings) <> 0 then
    raise exception 'REFUSED: % organisation(s) are already activated. Apply this correction before activation.',
      (select count(*) from public.organisation_report_settings);
  end if;
end;
$guard$;

-- ── THE CORRECTED FUNCTION ────────────────────────────────────────────────
create or replace function public.adopt_investigation_report_version(
  p_version_id uuid,
  p_basis text,
  p_reason text default null
)
returns investigation_report_versions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_privileged boolean := coalesce(auth.role(), '') = 'service_role';
  v_actor uuid := case when v_privileged then null else auth.uid() end;
  v_row public.investigation_report_versions;
  v_prev public.investigation_report_versions;
  v_is_investigator boolean;
  v_is_hr boolean;
  v_unpositioned int;
  v_member record;
  v_case public.cases;
  v_blocking text;
  -- NEW. v_case_id is the only thing read before the lock; v_pre_adopted_at
  -- records how the adoption state looked before waiting, so a concurrent
  -- adoption can be reported as one.
  v_case_id uuid;
  v_pre_adopted_at timestamptz;
begin
  if v_actor is null then
    raise exception
      'An investigation report must be adopted by a signed-in user. An automated or service-role process cannot adopt a report.'
      using errcode = '42501';
  end if;

  -- PRE-LOCK: only what is needed to know which case row to lock, plus the
  -- adoption state as it looked before waiting. NO decision is made on this.
  select v.case_id, v.adopted_at into v_case_id, v_pre_adopted_at
    from public.investigation_report_versions v where v.id = p_version_id;
  if v_case_id is null then
    raise exception 'That investigation report version does not exist' using errcode = '23503';
  end if;

  perform 1 from public.cases where id = v_case_id for update;

  -- RE-READ UNDER THE LOCK. Everything below uses THIS row, not the pre-lock
  -- snapshot. `for update` keeps the cases -> versions order the function
  -- already uses for its own later UPDATE, so no new lock edge is introduced.
  select v.* into v_row from public.investigation_report_versions v
   where v.id = p_version_id for update;
  if v_row.id is null then
    raise exception 'That investigation report version does not exist' using errcode = '23503';
  end if;

  if v_row.adopted_at is not null then
    if v_pre_adopted_at is not null then
      -- Already adopted before we looked. The original message, unchanged.
      raise exception 'That investigation report version is already adopted' using errcode = 'check_violation';
    end if;
    -- Adopted while we were waiting on the case lock. An INTENTIONAL CONFLICT,
    -- reported here rather than being allowed to fall through to the
    -- immutability guard, whose message is about tampering and would be
    -- misleading to someone who simply lost a race.
    raise exception
      'That investigation report version was adopted by someone else a moment ago. Refresh the case and review the current adopted report before adopting another version.'
      using errcode = 'check_violation';
  end if;

  select exists (
      select 1 from public.case_access ca
       where ca.case_id = v_row.case_id and ca.user_id = v_actor and ca.role = 'investigator'),
    exists (
      select 1 from public.org_members om
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

  -- Stage eligibility, evaluated against the LOCKED case, exactly as before.
  select * into v_case from public.cases where id = v_row.case_id;
  v_blocking := public.adoption_stage_block_reason(v_case.stage, v_case.outcome, v_case.meetings);

  if v_blocking is not null then
    raise exception
      'This investigation report cannot be adopted because %. Adopting it would move the case back to the investigation report stage. Record the further findings on the case instead.',
      v_blocking
      using errcode = 'check_violation';
  end if;

  select count(*) into v_unpositioned
    from public.allegations a
   where a.case_id = v_row.case_id and a.investigation_conclusion is null;
  if v_unpositioned > 0 then
    raise exception
      'Record a position on every issue before adopting the report — % issue(s) have none. Permitted positions are: a case to answer, no case to answer, or further investigation required.',
      v_unpositioned
      using errcode = 'check_violation';
  end if;

  select v.* into v_prev from public.investigation_report_versions v
   where v.case_id = v_row.case_id and v.is_current;
  if v_prev.id is not null then
    update public.investigation_report_versions
       set is_current = false, superseded_at = now(), superseded_by_version_id = v_row.id
     where id = v_prev.id;
  end if;

  update public.investigation_report_versions
     set adopted_at = now(),
         adopted_by = v_actor,
         adoption_basis = p_basis,
         adoption_reason = case when p_basis = 'hr_exception' then btrim(p_reason) else null end,
         is_current = true
   where id = v_row.id
  returning * into v_row;

  update public.cases
     set investigation_report = v_row.body,
         investigation_report_date = to_char(v_row.adopted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         stage = case
                   when coalesce(stage, '') in ('', 'open', 'intake', 'investigation', 'inv_report')
                     then 'inv_report'
                   else stage
                 end
   where id = v_row.case_id;

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
$function$;

-- ── POST-CONDITIONS ──────────────────────────────────────────────────────
do $verify$
declare
  v_md5 text; v_args text; v_secdef boolean; v_owner name; v_lang name;
  v_vol "char"; v_cfg text; v_acl text; v_reads int; v_src text;
begin
  select md5(p.prosrc), pg_get_function_identity_arguments(p.oid), p.prosecdef,
         pg_get_userbyid(p.proowner), l.lanname, p.provolatile,
         coalesce(array_to_string(p.proconfig, ','), ''),
         coalesce(array_to_string(p.proacl, ' | '), ''),
         (select count(*) from regexp_matches(p.prosrc, 'select v\.\* into v_row', 'g')),
         p.prosrc
    into v_md5, v_args, v_secdef, v_owner, v_lang, v_vol, v_cfg, v_acl, v_reads, v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
   where n.nspname = 'public' and p.proname = 'adopt_investigation_report_version';

  -- IDENTITY AND PRIVILEGES PRESERVED.
  if v_args <> 'p_version_id uuid, p_basis text, p_reason text' then
    raise exception 'FAILED: signature changed to (%)', v_args; end if;
  if not v_secdef then raise exception 'FAILED: no longer SECURITY DEFINER'; end if;
  if v_owner <> 'postgres' then raise exception 'FAILED: owner changed to %', v_owner; end if;
  if v_lang <> 'plpgsql' then raise exception 'FAILED: language changed to %', v_lang; end if;
  if v_vol <> 'v' then raise exception 'FAILED: volatility changed'; end if;
  if v_cfg <> 'search_path=public' then raise exception 'FAILED: search_path is now "%"', v_cfg; end if;
  if v_acl <> 'postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres' then
    raise exception 'FAILED: privileges changed to "%"', v_acl; end if;

  -- THE CORRECTION IS PRESENT.
  if v_md5 = 'fb45b6388323936ce8e405614ecc2882' then
    raise exception 'FAILED: the body is unchanged'; end if;
  if v_reads <> 1 then
    raise exception 'FAILED: expected exactly one `select v.* into v_row`, the one under the lock; found %', v_reads; end if;
  if position('perform 1 from public.cases where id = v_case_id for update' in v_src) = 0 then
    raise exception 'FAILED: the case row is no longer locked on the pre-lock case_id'; end if;
  if position('where v.id = p_version_id for update' in v_src) = 0 then
    raise exception 'FAILED: the version row is not re-read FOR UPDATE under the lock'; end if;
  -- the re-read must come AFTER the case lock
  if position('where v.id = p_version_id for update' in v_src)
     < position('perform 1 from public.cases where id = v_case_id for update' in v_src) then
    raise exception 'FAILED: the version re-read precedes the case lock, which is the defect this corrects'; end if;
  -- and the adoption test must come after the re-read
  if position('if v_row.adopted_at is not null' in v_src)
     < position('where v.id = p_version_id for update' in v_src) then
    raise exception 'FAILED: the adoption test still precedes the re-read'; end if;

  -- BOTH refusal paths exist, so a concurrent adoption is reported as one.
  if position('is already adopted' in v_src) = 0 then
    raise exception 'FAILED: the original already-adopted message was lost'; end if;
  if position('adopted by someone else a moment ago' in v_src) = 0 then
    raise exception 'FAILED: the intentional concurrent-adoption conflict is missing'; end if;

  -- EVERY PRE-EXISTING REQUIREMENT STILL REFERENCED.
  if position('adoption_stage_block_reason' in v_src) = 0 then
    raise exception 'FAILED: stage eligibility lost'; end if;
  if position('investigation_conclusion is null' in v_src) = 0 then
    raise exception 'FAILED: allegation-position completeness lost'; end if;
  if position('superseded_by_version_id = v_row.id' in v_src) = 0 then
    raise exception 'FAILED: supersession lost'; end if;
  if position('insert into public.audit_log' in v_src) = 0 then
    raise exception 'FAILED: the audit insert was lost'; end if;
  if position('investigation_report = v_row.body' in v_src) = 0 then
    raise exception 'FAILED: the legacy mirror was lost'; end if;
  if position('Only the case''''s assigned investigator can adopt on that basis' in v_src) = 0
     and position('assigned investigator can adopt on that basis' in v_src) = 0 then
    raise exception 'FAILED: the investigator authority check was lost'; end if;
  if position('Only HR can adopt under the documented exception' in v_src) = 0 then
    raise exception 'FAILED: the HR-exception authority check was lost'; end if;

  -- Nothing else moved.
  if (select md5(prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='investigation_report_versions_immutability_guard')
     is distinct from 'd72e56ce2bf9eb945f3977a6b1892503' then
    raise exception 'FAILED: the immutability guard changed'; end if;
  if (select md5(prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='protect_adopted_investigation_report')
     is distinct from '85ba380f71d56ecf66daa2441d97dbdf' then
    raise exception 'FAILED: A1 changed'; end if;

  raise notice 'Adoption RPC corrected: version re-read under the case lock, concurrent adoption now an intentional conflict, identity and privileges unchanged, every pre-existing requirement intact.';
end;
$verify$;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
--
--   Re-apply the recorded body, restoring md5 fb45b6388323936ce8e405614ecc2882.
--   Note what that restores: the stale-snapshot window, in which a concurrent
--   adoption is refused by the immutability guard with a message about
--   tampering. No data is at risk either way -- the guard remains the backstop
--   in both versions -- so a rollback is safe, merely worse.
--
-- NOT CHANGED HERE
--
--   * B3.1 (investigation_report_versions) and its own migration file.
--   * investigation_report_versions_immutability_guard, which stays as the
--     backstop and is asserted unchanged above.
--   * A1, A3a, A3b, the save RPC, and every A3c object.
--   * The anon EXECUTE position: this function never granted it, and this
--     migration does not change that.
-- ════════════════════════════════════════════════════════════════════════════
