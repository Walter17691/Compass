-- ═══════════════════════════════════════════════════════════════════════════
-- B3.2 PRE-WORK — ADOPTION MUST NOT MOVE A CASE BACKWARDS.
--
-- NOT YET APPLIED TO PRODUCTION. Candidate only.
--
-- THE DEFECT. adopt_investigation_report_version() ends with an unconditional
-- legacy mirror:
--
--     update public.cases
--        set investigation_report = …, investigation_report_date = …,
--            stage = 'inv_report'
--      where id = v_row.case_id;
--
-- `stage` is the EXPLICIT column, and src/lib/caseStage.js's getCaseStage()
-- returns it for anything other than the 'open' placeholder:
--
--     if (cs.stage === "closed") return "closed";
--     if (cs.stage && cs.stage !== "open") return cs.stage;
--     … otherwise infer from meetings/outcome/report …
--
-- So adopting a revision on a case that has already moved on would drag the
-- case back to 'inv_report' from 'disciplinary', 'outcome' or 'appeal' — and
-- worse, from 'closed', because overwriting the value is exactly what stops
-- the first line above from ever firing again. A closed case would reopen,
-- silently, as a side effect of adopting a report.
--
-- WHY THE DERIVED STAGE IS NOT THE PROBLEM. inferDisciplinaryStage() is
-- precedence-ordered and `hasInvReport` sits BELOW appeal, outcome and
-- disciplinary:
--
--     appeal > outcome > disciplinary > inv_report > investigation > intake
--
-- A case with no explicit stage therefore cannot be dragged backwards by
-- writing investigation_report alone; the higher tiers still win. The damage
-- comes solely from writing the explicit column. This guard is written against
-- BOTH readings anyway, because a case can legitimately be at a later point
-- through either route and refusing on only one of them would leave the hole
-- half open.
--
-- WHY IN THE DATABASE. A client-side stage check is advice. PostgREST accepts
-- a direct RPC call from any authorised session, so the eligibility rule has
-- to be evaluated against the CURRENT case row inside the adoption
-- transaction — after the row lock the function already takes, so the state it
-- judges cannot change under it.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── §1 THE RULE, AS A PURE FUNCTION ──────────────────────────────────────
--
-- Extracted rather than inlined into the adoption function, for one practical
-- reason discovered while testing it: several legitimate guards already stop a
-- case being CREATED in some of the states this rule must judge — an outcome
-- can only be written through record_case_decision(), and an appeal hearing
-- must name an appointed appeal officer. Constructing those fixtures just to
-- test a boolean would mean fighting unrelated protections, and the usual
-- result of that is a test that proves the fixture rather than the rule.
--
-- As a pure, immutable function the rule can be evaluated directly over any
-- state, including states the database will not let you build. It is also the
-- same shape the rest of this codebase prefers — a decision extracted into a
-- pure function, tested on its own terms.
create or replace function public.adoption_stage_block_reason(
  p_stage text, p_outcome text, p_meetings jsonb)
returns text
language sql
immutable
set search_path to 'public'
as $pf$
  select case
    -- Ordered to mirror getCaseStage + inferDisciplinaryStage precedence:
    -- closed, then the explicit later stages, then appeal > outcome >
    -- disciplinary. The FIRST matching reason is the one reported.
    when coalesce(p_stage, '') = 'closed'
      then 'the case is closed'
    when coalesce(p_stage, '') in ('disciplinary', 'outcome', 'appeal')
      then 'the case has already reached the ' || p_stage || ' stage'
    -- isAppealMeeting: contains 'appeal'. Tested BEFORE the disciplinary rule
    -- so that a "Disciplinary Appeal" is recognised as an appeal and not as a
    -- disciplinary hearing — the exact collision src/lib/meetingTypeMatch.js
    -- was created to stop, after it once fabricated a statutory deadline.
    when exists (
      select 1 from jsonb_array_elements(coalesce(p_meetings, '[]'::jsonb)) m
       where lower(coalesce(m.value->>'type', '')) like '%appeal%')
      then 'an appeal meeting has already been held on this case'
    when p_outcome is not null
      then 'an outcome has already been recorded on this case'
    -- hasLetterType(meetings,'outcome'): a saved outcome letter. The
    -- coalesce default mirrors the JS, which treats a letter with output but
    -- no recorded type as matching.
    when exists (
      select 1 from jsonb_array_elements(coalesce(p_meetings, '[]'::jsonb)) m
       where coalesce(m.value->>'letterOutput', '') <> ''
         and coalesce(m.value->>'letterType', 'outcome') = 'outcome')
      then 'an outcome letter has already been issued on this case'
    -- isDisciplinaryMeeting: contains 'disciplinary' AND NOT 'appeal'.
    when exists (
      select 1 from jsonb_array_elements(coalesce(p_meetings, '[]'::jsonb)) m
       where lower(coalesce(m.value->>'type', '')) like '%disciplinary%'
         and lower(coalesce(m.value->>'type', '')) not like '%appeal%')
      then 'a disciplinary hearing has already been held on this case'
    else null
  end;
$pf$;

revoke all on function public.adoption_stage_block_reason(text, text, jsonb) from public;
grant execute on function public.adoption_stage_block_reason(text, text, jsonb) to authenticated, service_role;

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
  v_case public.cases;
  v_blocking text;
begin
  if v_actor is null then
    raise exception
      'An investigation report must be adopted by a signed-in user. An automated or service-role process cannot adopt a report.'
      using errcode = '42501';
  end if;

  select v.* into v_row from public.investigation_report_versions v where v.id = p_version_id;
  if v_row.id is null then
    raise exception 'That investigation report version does not exist' using errcode = '23503';
  end if;

  perform 1 from public.cases where id = v_row.case_id for update;

  if v_row.adopted_at is not null then
    raise exception 'That investigation report version is already adopted' using errcode = 'check_violation';
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

  -- ── §NEW — STAGE ELIGIBILITY, EVALUATED AGAINST THE LOCKED CASE ──────────
  --
  -- Read AFTER the `for update` above, so this is the state the mirror below
  -- will actually overwrite, not a state that could change in between.
  --
  -- The four conditions mirror, in order, every precedence tier that sits
  -- ABOVE inv_report in inferDisciplinaryStage(), plus the explicit column:
  --
  --   explicit stage      getCaseStage returns cs.stage directly
  --   appeal meeting      isAppealMeeting:       type contains 'appeal'
  --   outcome recorded    hasOutcome:            cs.outcome, or a saved
  --                                              outcome letter on a meeting
  --   disciplinary meeting isDisciplinaryMeeting: contains 'disciplinary'
  --                                              AND NOT 'appeal'
  --
  -- The 'appeal' exclusion on the disciplinary test is not cosmetic: a
  -- "Disciplinary Appeal" meeting satisfying a bare 'disciplinary' substring
  -- check is a real defect this codebase has already had once, which is why
  -- src/lib/meetingTypeMatch.js exists. The SQL matches those predicates
  -- rather than inventing its own.
  --
  -- v_blocking names the FIRST reason found, so the refusal tells the caller
  -- which fact blocked it rather than making them guess.
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

  -- THE LEGACY MIRROR. The stage write is now CONDITIONAL as well as guarded.
  -- With the eligibility check above, no blocked stage can reach this line, so
  -- the case expression is unreachable by construction — it is here as defence
  -- in depth, so that if the blocking list is ever narrowed the mirror still
  -- cannot overwrite a later stage. The report itself is always mirrored.
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
$$;

-- CREATE OR REPLACE preserves the existing ACL, so the EXECUTE grants to
-- authenticated and service_role are untouched. Asserted after application
-- rather than assumed.

commit;
