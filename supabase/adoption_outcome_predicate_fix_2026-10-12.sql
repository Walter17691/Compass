-- ════════════════════════════════════════════════════════════════════════════
-- ADOPTION ELIGIBILITY — CORRECT THE OUTCOME PREDICATE
-- Candidate migration. NOT APPLIED.
--
-- ONE expression changes. Nothing else about the function moves: not its
-- signature, not its volatility, not its language, not its ownership, not its
-- SECURITY INVOKER setting, not its search_path, not its privileges, and not
-- any other branch.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────
--
-- adoption_stage_block_reason decides whether an investigation report may be
-- adopted. It is the SQL translation of inferDisciplinaryStage() in
-- src/lib/caseStage.js, and one branch was mistranslated:
--
--     JS    const hasOutcome = !!cs.outcome || hasLetterType(meetings, 'outcome');
--     SQL   when p_outcome is not null then 'an outcome has already been recorded'
--
-- `!!''` is FALSE in JavaScript -- the application treats an empty-string
-- outcome as NO outcome. `'' is not null` is TRUE in SQL. The two expressions
-- agree on every value except the one that actually occurs.
--
-- ── MEASURED IMPACT ON PRODUCTION ───────────────────────────────────────────
--
-- cases.outcome has NO column default, so the column would be NULL if left
-- alone -- but the application writes the empty string, and production holds:
--
--     outcome IS NULL           0
--     outcome = ''           2825
--     outcome genuinely set   138
--
-- So the branch fires for every row, and the function returns a block reason
-- for 2963 of 2963 cases. adopt_investigation_report_version consults it
-- before adopting, which means:
--
--     ** NO INVESTIGATION REPORT CAN BE ADOPTED ON ANY CASE IN PRODUCTION **
--
-- The entire versioned-authoring path (A1/A3a/A3b and the A3c candidate) is
-- unreachable until this is fixed. It is inert today only because no
-- organisation is activated and there are 0 report versions, so nothing has
-- tried.
--
-- With the corrected predicate, 2562 of 2963 cases become eligible, including
-- all 49 currently at stage inv_report -- which are precisely the cases that
-- would need to adopt a report. The remainder stay blocked for the right
-- reasons: 106 closed, 68 at a later explicit stage, 68 with a genuine
-- recorded outcome.
--
-- ── INTENDED SEMANTICS, STATED EXACTLY ──────────────────────────────────────
--
--   p_outcome      JS !!cs.outcome   current SQL     corrected SQL
--   NULL           no outcome        BLOCKS (wrong)  no block
--   ''             no outcome        BLOCKS (wrong)  no block
--   '   '          outcome           BLOCKS          NO BLOCK  <- see below
--   'Dismissal…'   outcome           BLOCKS          BLOCKS
--
-- The whitespace-only row is a DELIBERATE divergence from the JavaScript, not
-- an oversight. `!!'   '` is true, so the application would read three spaces
-- as a recorded outcome; btrim() reads it as no outcome. The stricter reading
-- is the right one -- whitespace is not a disciplinary outcome -- and it is the
-- semantics specified for this correction. It affects 0 live rows: production
-- holds no outcome value matching '^\s+$'.
--
-- ── EVERY OTHER BRANCH WAS RE-CHECKED AGAINST ITS JS SOURCE ─────────────────
--
--   stage = 'closed'                        matches getCaseStage
--   stage in (disciplinary/outcome/appeal)  matches the explicit-stage return
--   appeal meeting      like '%appeal%'     == isAppealMeeting
--   disciplinary meeting                    == isDisciplinaryMeeting
--                                              (includes 'disciplinary' AND NOT
--                                              'appeal' -- the collision
--                                              meetingTypeMatch.js exists for)
--   outcome letter                          see the note below
--
-- None of them creates an unintended BLOCK. One creates an unintended
-- NON-block, and it is deliberately NOT fixed here because it is out of the
-- approved scope and is latent rather than live:
--
--   JS   m.letterOutput && (m.letterType ? m.letterType === type : true)
--   SQL  coalesce(e.value->>'letterType', 'outcome') = 'outcome'
--
-- An ABSENT letterType is handled identically by both (coalesce supplies
-- 'outcome'; the JS ternary falls through to true) -- verified on the 2 live
-- entries that have no letterType key. But letterType = '' diverges: the JS
-- treats '' as falsy and MATCHES, the SQL compares '' to 'outcome' and does
-- not. Production holds 0 such entries (6 entries carry a letterOutput; their
-- letterType values are absent, 'invite' or 'outcome'), so this is recorded
-- for a separate decision rather than bundled into a one-line fix.
--
-- ── PRIVILEGES ──────────────────────────────────────────────────────────────
--
-- CREATE OR REPLACE preserves the ACL, and the post-conditions below assert
-- that it did. The current grants are:
--
--     postgres=X | anon=X | authenticated=X | service_role=X
--
-- anon holding EXECUTE is pre-existing and NOT changed here. It is worth
-- revoking -- the function is SECURITY INVOKER, IMMUTABLE and reads no table,
-- so an anonymous caller learns nothing it did not already supply, which is
-- why this is a tidiness issue rather than a disclosure one -- but changing a
-- grant inside a correctness fix would widen the blast radius of both. It
-- belongs in the separate permission-hardening step alongside the
-- already-recorded anon EXECUTE sweep.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── DRIFT GUARD ───────────────────────────────────────────────────────────
do $guard$
declare
  v_md5 text;
  v_secdef boolean;
  v_vol "char";
  v_lang name;
  v_owner name;
  v_cfg text;
  v_args text;
  v_acl text;
  v_blocked int;
begin
  select md5(p.prosrc), p.prosecdef, p.provolatile, l.lanname,
         pg_get_userbyid(p.proowner), coalesce(array_to_string(p.proconfig, ','), ''),
         pg_get_function_identity_arguments(p.oid),
         coalesce(array_to_string(p.proacl, ' | '), '')
    into v_md5, v_secdef, v_vol, v_lang, v_owner, v_cfg, v_args, v_acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
   where n.nspname = 'public' and p.proname = 'adoption_stage_block_reason';

  if v_md5 is null then
    raise exception 'DRIFT: public.adoption_stage_block_reason does not exist.';
  end if;
  if v_md5 <> '4838cfcd75defffeae0676d314c46556' then
    raise exception 'DRIFT: adoption_stage_block_reason is % , expected 4838cfcd75defffeae0676d314c46556. This correction reproduces the recorded body with one predicate changed and must not be applied on top of a different one.', v_md5;
  end if;
  if v_args <> 'p_stage text, p_outcome text, p_meetings jsonb' then
    raise exception 'DRIFT: signature is (%)', v_args;
  end if;
  if v_secdef then
    raise exception 'DRIFT: the function is SECURITY DEFINER; the recorded body is SECURITY INVOKER.';
  end if;
  if v_vol <> 'i' then
    raise exception 'DRIFT: volatility is %, expected IMMUTABLE.', v_vol;
  end if;
  if v_lang <> 'sql' then
    raise exception 'DRIFT: language is %, expected sql.', v_lang;
  end if;
  if v_owner <> 'postgres' then
    raise exception 'DRIFT: owner is %, expected postgres.', v_owner;
  end if;
  if v_cfg <> 'search_path=public' then
    raise exception 'DRIFT: proconfig is "%", expected search_path=public.', v_cfg;
  end if;
  if v_acl <> 'postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres' then
    raise exception 'DRIFT: ACL is "%" -- re-review the privilege section of this migration before applying.', v_acl;
  end if;

  -- The defect itself, asserted as a precondition. If this is already 0, the
  -- fix has been applied or the data has changed, and applying blindly would
  -- be acting on a stale audit.
  select count(*) into v_blocked from public.cases c
   where public.adoption_stage_block_reason(c.stage, c.outcome, c.meetings) is not null;
  if v_blocked <> 2963 then
    raise exception 'DRIFT: the function currently blocks % of 2963 cases, not all of them. The measured impact behind this correction no longer holds; re-audit first.', v_blocked;
  end if;

  -- The only caller, so the blast radius is known.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosrc ~ 'adoption_stage_block_reason'
         and p.proname <> 'adoption_stage_block_reason') <> 1 then
    raise exception 'DRIFT: the set of callers has changed; re-review which of them depend on the current (incorrect) blocking behaviour.';
  end if;
end;
$guard$;

-- ── THE CORRECTION ────────────────────────────────────────────────────────
-- Byte-for-byte the recorded body, with `p_outcome is not null` replaced and a
-- note added at the changed branch. Every comment is preserved: they record
-- why each branch is ordered as it is, and that reasoning is unchanged.
create or replace function public.adoption_stage_block_reason(
  p_stage text,
  p_outcome text,
  p_meetings jsonb
)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  -- p_meetings is read through a local guard rather than used directly.
  -- jsonb_array_elements RAISES 22023 ("cannot extract elements from an
  -- object") on any jsonb value that is not an array, and coalesce only
  -- defends against SQL NULL. cases.meetings is jsonb with no CHECK
  -- constraint behind it — all 2963 production rows are arrays today, but
  -- nothing enforces that, and a function whose job is to decide eligibility
  -- must not be able to abort the adoption with an opaque type error instead
  -- of answering. Found by probing the matrix, not by reading the code.
  with m as (
    select case when jsonb_typeof(p_meetings) = 'array' then p_meetings else '[]'::jsonb end as arr
  )
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
      select 1 from m, jsonb_array_elements(m.arr) e
       where lower(coalesce(e.value->>'type', '')) like '%appeal%')
      then 'an appeal meeting has already been held on this case'
    -- hasOutcome: !!cs.outcome in the JS, which is FALSE for the empty string.
    -- This branch used to read `p_outcome is not null`, and because the
    -- application writes '' rather than NULL (2825 of 2963 rows), it fired for
    -- every case and made adoption impossible everywhere. btrim() additionally
    -- treats a whitespace-only value as no outcome, which is stricter than the
    -- JS and deliberate: whitespace is not a disciplinary outcome.
    when coalesce(btrim(p_outcome), '') <> ''
      then 'an outcome has already been recorded on this case'
    -- hasLetterType(meetings,'outcome'): a saved outcome letter. The
    -- coalesce default mirrors the JS, which treats a letter with output but
    -- no recorded type as matching.
    when exists (
      select 1 from m, jsonb_array_elements(m.arr) e
       where coalesce(e.value->>'letterOutput', '') <> ''
         and coalesce(e.value->>'letterType', 'outcome') = 'outcome')
      then 'an outcome letter has already been issued on this case'
    -- isDisciplinaryMeeting: contains 'disciplinary' AND NOT 'appeal'.
    when exists (
      select 1 from m, jsonb_array_elements(m.arr) e
       where lower(coalesce(e.value->>'type', '')) like '%disciplinary%'
         and lower(coalesce(e.value->>'type', '')) not like '%appeal%')
      then 'a disciplinary hearing has already been held on this case'
    else null
  end;
$function$;

-- ── POST-CONDITIONS ──────────────────────────────────────────────────────
do $verify$
declare
  v_secdef boolean; v_vol "char"; v_lang name; v_owner name; v_cfg text;
  v_args text; v_acl text; v_permitted int; v_invrep int;
begin
  select p.prosecdef, p.provolatile, l.lanname, pg_get_userbyid(p.proowner),
         coalesce(array_to_string(p.proconfig, ','), ''),
         pg_get_function_identity_arguments(p.oid),
         coalesce(array_to_string(p.proacl, ' | '), '')
    into v_secdef, v_vol, v_lang, v_owner, v_cfg, v_args, v_acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
   where n.nspname = 'public' and p.proname = 'adoption_stage_block_reason';

  -- IDENTITY PRESERVED. Each of these is a way the replacement could have
  -- silently changed the function's security or performance character.
  if v_args <> 'p_stage text, p_outcome text, p_meetings jsonb' then
    raise exception 'FAILED: signature changed to (%)', v_args; end if;
  if v_secdef then raise exception 'FAILED: became SECURITY DEFINER'; end if;
  if v_vol <> 'i' then raise exception 'FAILED: volatility is no longer IMMUTABLE'; end if;
  if v_lang <> 'sql' then raise exception 'FAILED: language changed to %', v_lang; end if;
  if v_owner <> 'postgres' then raise exception 'FAILED: owner changed to %', v_owner; end if;
  if v_cfg <> 'search_path=public' then raise exception 'FAILED: search_path is now "%"', v_cfg; end if;
  if v_acl <> 'postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres' then
    raise exception 'FAILED: privileges changed to "%" -- CREATE OR REPLACE should have preserved them', v_acl; end if;

  -- BEHAVIOUR CORRECTED, on the live data.
  select count(*) into v_permitted from public.cases c
   where public.adoption_stage_block_reason(c.stage, c.outcome, c.meetings) is null;
  if v_permitted <> 2562 then
    raise exception 'FAILED: expected 2562 cases to become eligible, got %', v_permitted; end if;

  select count(*) into v_invrep from public.cases c
   where c.stage = 'inv_report'
     and public.adoption_stage_block_reason(c.stage, c.outcome, c.meetings) is null;
  if v_invrep <> 49 then
    raise exception 'FAILED: expected all 49 inv_report cases eligible, got %', v_invrep; end if;

  -- THE FOUR SEMANTIC CASES, asserted directly rather than inferred.
  if public.adoption_stage_block_reason('open', null, '[]'::jsonb) is not null then
    raise exception 'FAILED: NULL outcome should not block'; end if;
  if public.adoption_stage_block_reason('open', '', '[]'::jsonb) is not null then
    raise exception 'FAILED: empty outcome should not block'; end if;
  if public.adoption_stage_block_reason('open', '   ', '[]'::jsonb) is not null then
    raise exception 'FAILED: whitespace-only outcome should not block'; end if;
  if public.adoption_stage_block_reason('open', 'Dismissal with notice', '[]'::jsonb)
     <> 'an outcome has already been recorded on this case' then
    raise exception 'FAILED: a genuine outcome must still block'; end if;

  -- AND THE BRANCHES THIS MIGRATION DOES NOT TOUCH.
  if public.adoption_stage_block_reason('closed', '', '[]'::jsonb) <> 'the case is closed' then
    raise exception 'FAILED: closed-stage branch regressed'; end if;
  if public.adoption_stage_block_reason('appeal', '', '[]'::jsonb)
     <> 'the case has already reached the appeal stage' then
    raise exception 'FAILED: later-stage branch regressed'; end if;
  if public.adoption_stage_block_reason('open', '', '[{"type":"Disciplinary Appeal"}]'::jsonb)
     <> 'an appeal meeting has already been held on this case' then
    raise exception 'FAILED: appeal branch regressed, or lost to the disciplinary branch'; end if;
  if public.adoption_stage_block_reason('open', '', '[{"type":"Disciplinary hearing"}]'::jsonb)
     <> 'a disciplinary hearing has already been held on this case' then
    raise exception 'FAILED: disciplinary branch regressed'; end if;
  if public.adoption_stage_block_reason('open', '', '[{"letterOutput":"x"}]'::jsonb)
     <> 'an outcome letter has already been issued on this case' then
    raise exception 'FAILED: outcome-letter branch regressed on an absent letterType'; end if;
  if public.adoption_stage_block_reason('open', '', '{"not":"an array"}'::jsonb) is not null then
    raise exception 'FAILED: the non-array jsonb guard regressed'; end if;

  raise notice 'adoption_stage_block_reason corrected: 0 -> 2562 eligible cases, 49 of 49 inv_report, identity and privileges unchanged, every other branch intact.';
end;
$verify$;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- NOT CHANGED HERE, RECORDED FOR SEPARATE DECISIONS
--
-- 1. anon EXECUTE on this function. Pre-existing; belongs with the broader
--    anon-privilege hardening, not with a correctness fix.
-- 2. letterType = '' diverges from the JS in the permissive direction.
--    0 live occurrences. Separate decision.
-- 3. cases.outcome has no column default while the application writes ''.
--    Making the column NOT NULL DEFAULT '' or normalising '' to NULL would
--    remove the class of defect rather than this instance, but it is a data
--    migration over 2963 rows and is out of scope here.
--
-- ROLLBACK
--
--   Re-apply the recorded body with `when p_outcome is not null`, restoring
--   md5 4838cfcd75defffeae0676d314c46556. Note what that means: adoption
--   becomes impossible on every case again. Roll back only if a caller is
--   found that depends on the incorrect blocking.
-- ════════════════════════════════════════════════════════════════════════════
