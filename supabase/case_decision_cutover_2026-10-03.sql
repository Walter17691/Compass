-- ============================================================================
-- WAVE D4.3 — authoritative case decision cutover — 2026-10-03
-- ============================================================================
-- HOW TO APPLY: paste into the Supabase SQL Editor and run, as ONE unit.
--
-- This is a single coherent transition. Sections 1-5 must land together: after
-- it, `record_case_decision` is the ONLY way an application caller can put
-- outcome state on a case, and the direct HR/disciplinary-officer UPDATE
-- allowance for the six protected columns is gone.
--
-- ┌─ DEPLOYMENT ORDER, AND WHY ─────────────────────────────────────────────┐
-- │ A client bundle and a database constraint cannot be swapped atomically,  │
-- │ so some window is unavoidable. The order chosen is:                      │
-- │                                                                          │
-- │   1. push the application commit (Vercel builds, ~90s). The OLD bundle    │
-- │      is still live and still writes direct UPDATE — the status quo, no    │
-- │      new risk.                                                           │
-- │   2. the moment the deployment reports READY, apply THIS migration.      │
-- │                                                                          │
-- │ The exposure is therefore a few seconds in which the new bundle is live   │
-- │ and the RPC does not yet exist, rather than ~90 seconds in which a live   │
-- │ HR user's loaded bundle cannot record an outcome. There IS a real user    │
-- │ active in production (audit_log shows a Compass LTD session today), which │
-- │ is why the shorter window was preferred.                                 │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- PRE-MIGRATION BASELINE (production, read-only, immediately before applying):
--   cases 2,960 · outcome-bearing 137 · case_decisions 137 (137 heads, 0
--   multiple) · legacy_unmapped 1 · tables 44 · triggers on cases 9 · triggers
--   on case_decisions 1 · policies on case_decisions 2 · hr_review_requests 138
--   audit_log 16,923 · record_case_decision absent · audit_log.case_decision_id
--   absent · decided_at populated on 2 of 137 · cases.outcome_issued_at 2 ·
--   cases.disciplinary_decided_by 0 · all 137 decisions carry the single D4.2
--   backfill timestamp 2026-10-03 09:42:55Z
--
--   THE DIGEST EXPRESSION IS RECORDED WITH THE DIGEST, deliberately. An earlier
--   capture in this wave recorded 7efa20a4283a95b72a7f17e1103dec40 /
--   60e4971bd6f6e0d717e9375c2ea566f2 with the expression unstated, and
--   recomputing later produced different values with every count identical —
--   which cost real time to resolve and could have been read as drift. It was
--   not drift: no decision row had been created or modified and no
--   outcome-bearing case had been touched since 24 September. A digest without
--   its expression is not evidence, so:
--     decisions     md5(string_agg(id::text||':'||outcome, ',' order by id))
--                     from public.case_decisions
--                   = ba45de6c8fdfd76abd81f15533f7b6a2
--     outcome-cases md5(string_agg(id::text||':'||outcome, ',' order by id))
--                     from public.cases where outcome is not null and outcome <> ''
--                   = 4b80939135bbbae89770fe6e49230dca
-- ============================================================================


-- ── 1. NEW-49 — the D4.2 append-only guard never fired ─────────────────────
--
-- Its privileged test was:
--     coalesce(auth.role(),'') = 'service_role'
--       or current_user in ('postgres','supabase_admin')
--
-- Inside a SECURITY DEFINER function current_user is ALWAYS the function owner,
-- so that second clause is unconditionally true and the guard was inert for
-- every caller. Proven against production: with the session role switched to
-- `authenticated`, a SECURITY DEFINER function still reported
-- current_user=postgres while a SECURITY INVOKER one reported authenticated.
--
-- No live breach resulted, because RLS was carrying the load: case_decisions has
-- only SELECT and INSERT policies, and an unauthorised client was measured
-- seeing 0 rows. What was inert were the INSERT-side protections, which an
-- AUTHORISED HR user could have sidestepped — supplying someone else's
-- decided_by, omitting decided_at, or passing legacy_unmapped.
--
-- ┌─ THE DIVISION OF LABOUR, STATED SO IT IS NOT RE-CONFLATED ──────────────┐
-- │ CHECK constraints and foreign keys are role-independent and were never   │
-- │ affected: decision_type vocabulary, outcome vocabulary, legacy           │
-- │ provenance, original/appeal shape, warning duration range, communication │
-- │ consistency, same-org case parentage and supersession integrity all      │
-- │ applied throughout and were proven live in D4.2.                         │
-- │                                                                          │
-- │ This TRIGGER's own contribution is exactly three things: append-only     │
-- │ (no UPDATE, no DELETE), forced decided_by provenance, and the            │
-- │ legacy_unmapped prohibition for new decisions. Those are what NEW-49     │
-- │ disabled, and what this restores.                                        │
-- │                                                                          │
-- │ RLS and the trigger now each contribute independently. Neither is        │
-- │ justification for the other being broken.                                │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- auth.role() is NOT rewritten by SECURITY DEFINER, so record_case_decision's
-- own insert is subject to this guard too — an HR caller's auth.role() is
-- 'authenticated' inside it. That is deliberate: the RPC does not get to opt out
-- of provenance forcing, so the trigger is a genuine second lock rather than a
-- formality. The service role remains exempt, matching
-- protect_case_hr_only_columns and protect_case_closure.
create or replace function public.case_decisions_append_only_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- SERVICE ROLE ONLY. Never current_user — see above.
  privileged boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'DELETE' then
    if not privileged then
      raise exception 'Decision history cannot be deleted (decision %). A revised position is recorded as a new decision.', old.id
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if not privileged then
      raise exception 'A recorded decision cannot be changed (decision %). Record an appeal decision that supersedes it instead.', old.id
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- INSERT. Provenance is established here, not accepted from the caller.
  if not privileged then
    new.decided_by := auth.uid();
    if new.decided_at is null then
      raise exception 'A new decision must record when it was decided.'
        using errcode = 'not_null_violation';
    end if;
    if new.outcome = 'legacy_unmapped' then
      raise exception 'legacy_unmapped is a historical marker and cannot be chosen as a decision outcome.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.case_decisions_append_only_guard() is
  'Wave D4.2, corrected in D4.3 (NEW-49). Append-only decision history: no UPDATE or DELETE by an ordinary caller, decided_by forced to auth.uid() on insert, decided_at required, legacy_unmapped refused for application writes. Privileged test is auth.role() = service_role ONLY — current_user is always the owner inside a SECURITY DEFINER function and made the guard inert.';


-- ── 2. Correlate an audit event with its decision ──────────────────────────
--
-- audit_log already carries one nullable FK per domain object — case_id,
-- employee_id, employee_activity_id, employment_event_id. This follows that
-- established pattern rather than parsing an id out of `detail`.
alter table public.audit_log
  add column if not exists case_decision_id uuid
    references public.case_decisions(id) on delete set null;

comment on column public.audit_log.case_decision_id is
  'Wave D4.3. The authoritative decision this event records, where applicable. ON DELETE SET NULL so an audit row outlives its subject, matching case_id and employee_id. audit_log is NOT decision storage — case_decisions is.';


-- ── 3. The authoritative operation ─────────────────────────────────────────
--
-- One transaction: authorize, check concurrency, insert exactly one decision,
-- project to the legacy cases.* fields, write the audit event, and open the HR
-- approval request where the existing rules require one. All of it commits or
-- none of it does.
--
-- ┌─ WHY AN RPC, AND WHY NOT A DUAL WRITE ──────────────────────────────────┐
-- │ saveCaseToDB is a direct client write. Two client calls are two          │
-- │ transactions, so any application-level ordering would be exactly the     │
-- │ dual write this wave forbids: a decision could exist without its         │
-- │ compatibility projection, or the reverse. A SECURITY DEFINER function is │
-- │ the established Compass answer (reconcile_case_employee,                 │
-- │ correct_case_employee, appoint_appeal_manager, delete_case) and costs no  │
-- │ Vercel function, which matters at 12/12.                                 │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- THE MARKER IS NOT AUTHORIZATION. Every check below runs BEFORE the marker is
-- set, from live database state, and none of them consults it. The marker exists
-- only so section 4's guard can tell "this write came from here" from "a client
-- wrote this column directly", and it is bound to one case id so it cannot
-- authorize an unrelated protected write.
create or replace function public.record_case_decision(
  p_case_id uuid,
  p_outcome text,
  p_outcome_notes text default null,
  p_warning_duration_months integer default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_case record;
  v_member record;
  v_decision_id uuid;
  v_now timestamptz := now();
  v_expires date;
  v_step text;
  v_is_warning boolean;
  v_updated_at timestamptz;
begin
  -- (1) authenticated
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- (2) the case exists. (3) org_id is read FROM THE ROW — a caller-supplied
  -- organisation would be a parameter the caller could lie about.
  select * into v_case from public.cases where id = p_case_id;
  if v_case.id is null then
    raise exception 'Case not found' using errcode = 'no_data_found';
  end if;
  if v_case.org_id is null then
    raise exception 'This case has no organisation and cannot carry a decision (case %).', p_case_id
      using errcode = 'check_violation';
  end if;

  -- (4) EXACTLY the authority protect_case_hr_only_columns required before this
  -- wave, read from that function rather than reinvented: HR in this case's
  -- organisation, OR this case's disciplinary officer. Nothing broader.
  select * into v_member from public.org_members
    where org_id = v_case.org_id and user_id = auth.uid();
  if v_member.id is null then
    raise exception 'Not a member of this organisation' using errcode = '42501';
  end if;
  if not (
    public.is_hr_role(v_member.role)
    or exists (
      select 1 from public.case_access ca
      where ca.case_id = v_case.id and ca.user_id = auth.uid()
        and ca.role = 'disciplinary_officer'
    )
  ) then
    raise exception 'Only HR or this case''s disciplinary officer can record a decision'
      using errcode = '42501';
  end if;

  -- Case access, including the confidential-case boundary. A SECURITY DEFINER
  -- function does not get cases' RLS for free, so the same test the rest of the
  -- product applies is made explicitly here: full org access, own-cases access
  -- on a case they created, or an explicit grant. Mirrors
  -- reconcile_case_employee's own check.
  if not (
    exists (select 1 from public.org_members om
             where om.org_id = v_case.org_id and om.user_id = auth.uid() and om.case_access_level = 1)
    or (exists (select 1 from public.org_members om
                 where om.org_id = v_case.org_id and om.user_id = auth.uid() and om.case_access_level = 2)
        and v_case.created_by = auth.uid())
    or exists (select 1 from public.case_access ca
                where ca.case_id = v_case.id and ca.user_id = auth.uid())
  ) then
    raise exception 'You do not have access to this case' using errcode = '42501';
  end if;

  -- (5)(6) a permitted operational outcome, and never the historical marker.
  -- The CHECK on case_decisions would catch legacy_unmapped too; refusing it
  -- here as well means the caller gets a sentence rather than a constraint name.
  if p_outcome = 'legacy_unmapped' then
    raise exception 'legacy_unmapped is a historical marker and cannot be issued as a decision.'
      using errcode = 'check_violation';
  end if;
  if p_outcome is null or p_outcome not in (
    'No further action', 'First written warning', 'Final written warning',
    'Demotion', 'Dismissal with notice', 'Summary dismissal (gross misconduct)'
  ) then
    raise exception 'Not a recognised outcome: %', coalesce(p_outcome, '(none)')
      using errcode = 'check_violation';
  end if;

  -- (7) existing business rule: a warning outcome requires a duration in range,
  -- and a non-warning outcome must not carry one. Mirrors
  -- isWarningOutcome/isValidWarningDurationMonths and the cases CHECK.
  v_is_warning := p_outcome in ('First written warning', 'Final written warning');
  if v_is_warning then
    if p_warning_duration_months is null
       or p_warning_duration_months <= 0 or p_warning_duration_months > 60 then
      raise exception 'A warning outcome needs a duration between 1 and 60 months.'
        using errcode = 'check_violation';
    end if;
    -- Expiry is DERIVED server-side, never accepted from the caller. Calendar
    -- month addition, matching addCalendarMonths().
    v_expires := (v_now::date + make_interval(months => p_warning_duration_months))::date;
  else
    if p_warning_duration_months is not null then
      raise exception 'Only a warning outcome carries a duration.' using errcode = 'check_violation';
    end if;
  end if;

  -- (8) the existing optimistic-concurrency contract. Conditional when the
  -- caller supplies the version it read, unconditional otherwise — exactly
  -- saveCaseToDB's two branches, so the UX contract is unchanged.
  if p_expected_updated_at is not null
     and v_case.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  -- ── the marker: set ONLY now, after every check above ──
  -- Transaction-local (third argument true) and bound to this case id, so it
  -- cannot license a protected write to any other row.
  perform set_config('compass.recording_case_decision', p_case_id::text, true);

  -- (a) the authoritative event. One row. The partial unique index
  -- case_decisions_one_original_per_case_idx is what makes a replay impossible:
  -- a second original for the same case raises 23505.
  insert into public.case_decisions (
    org_id, case_id, decision_type, outcome, outcome_notes,
    warning_duration_months, warning_expires_at, decided_at, decided_by
  ) values (
    v_case.org_id, v_case.id, 'original', p_outcome, nullif(trim(coalesce(p_outcome_notes, '')), ''),
    p_warning_duration_months, v_expires, v_now, auth.uid()
  )
  returning id into v_decision_id;

  -- (b) the compatibility projection, in the SAME transaction. Not a second
  -- truth: the same values, derived from the same authoritative operation.
  update public.cases set
    outcome = p_outcome,
    outcome_issued_at = v_now,
    outcome_notes = nullif(trim(coalesce(p_outcome_notes, '')), ''),
    warning_duration_months = p_warning_duration_months,
    warning_expires_at = v_expires,
    disciplinary_decided_by = auth.uid(),
    updated_at = v_now
  where id = v_case.id
  returning updated_at into v_updated_at;

  -- (c) the audit event, correlated to the decision. Inserted directly, as
  -- reconcile_case_employee does, because section 5 reserves 'Outcome issued'
  -- so the generic audit RPC can no longer produce it.
  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id, case_decision_id)
  values (
    v_case.org_id, auth.uid(), coalesce(v_member.name, 'Unknown'),
    'Outcome issued',
    p_outcome
      || ' — issued ' || to_char(v_now, 'DD/MM/YYYY')
      || case when p_warning_duration_months is not null
              then ' — duration: ' || p_warning_duration_months || ' month'
                   || case when p_warning_duration_months = 1 then '' else 's' end
              else '' end
      || case when v_expires is not null
              then ' — expires ' || to_char(v_expires, 'DD/MM/YYYY') else '' end,
    v_case.id, v_decision_id
  );

  -- (d) the HR approval request, where the existing rules require one.
  --
  -- WHY THIS JOINS THE TRANSACTION. Today requestHrReview is a separate client
  -- insert fired AFTER the case write, so "outcome recorded, approval request
  -- failed" is already reachable and leaves a dismissal-grade decision with no
  -- approval request. Bringing it in removes that window rather than preserving
  -- it. The fields are all derivable from authoritative state — the one the
  -- client used to supply, meeting_type, is incidental UI state for this path
  -- and is already NULL on some production outcome approvals, so it is left
  -- NULL rather than filled with whatever meeting type a screen last had
  -- selected. meeting_id is NULL on all 138 existing rows.
  --
  -- The consequence, stated rather than discovered: a failure to open the
  -- approval request now blocks the decision. That is the intended direction —
  -- a sanction that requires sign-off should not be recordable while its
  -- sign-off request silently fails.
  v_step := case
    when p_outcome = 'Final written warning' then 'final_written_warning'
    when p_outcome in ('Dismissal with notice', 'Summary dismissal (gross misconduct)') then 'dismissal'
    else null end;
  if v_step is not null then
    insert into public.hr_review_requests (
      org_id, case_id, meeting_id, step, requested_by, requested_by_name,
      case_employee_name, meeting_type, record_snapshot, status, requested_at
    ) values (
      v_case.org_id, v_case.id, null, v_step, auth.uid(),
      coalesce(v_member.name, 'Unknown'), v_case.employee_name, null,
      p_outcome || coalesce(' — ' || nullif(trim(coalesce(p_outcome_notes, '')), ''), ''),
      'pending', v_now
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'decision_id', v_decision_id,
    'updated_at', v_updated_at,
    'approval_requested', v_step is not null,
    'warning_expires_at', v_expires
  );
end;
$$;

grant execute on function public.record_case_decision(uuid, text, text, integer, timestamptz) to authenticated;
revoke all on function public.record_case_decision(uuid, text, text, integer, timestamptz) from anon, public;

comment on function public.record_case_decision(uuid, text, text, integer, timestamptz) is
  'Wave D4.3. The ONLY way an application caller may put outcome state on a case. One transaction: authorize (HR in the case org or its disciplinary officer, plus case access), optimistic-concurrency check, insert exactly one authoritative case_decisions event, project transactionally to the legacy cases.* fields, write the Outcome issued audit event, and open the HR approval request where required. Provenance is derived server-side: decided_by = auth.uid(), decided_at = now(), expiry computed from the duration. Never trusts client org_id, decided_by, decided_at or expiry.';


-- ── 4. The protected UPDATE boundary ───────────────────────────────────────
--
-- Replaces the direct HR/disciplinary-officer allowance with the marker. Only
-- record_case_decision sets it, only transaction-locally, and only for the case
-- it is operating on.
--
-- FAILS CLOSED: an absent marker is NULL, a malformed one will not equal the
-- row's id, and either way the write is refused. The marker is checked against
-- OLD.id, so a transaction authorised for case A cannot carry a protected write
-- to case B.
--
-- NOT CLIENT-SETTABLE: set_config lives in pg_catalog and PostgREST exposes only
-- functions in the exposed schema, so a client cannot call it; and no function
-- in public sets this GUC except record_case_decision.
--
-- The investigation_paused branch is carried over UNCHANGED — it is a different
-- control with a different authority test and this wave has no business
-- touching it.
create or replace function public.protect_case_hr_only_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_marker text;
begin
  if (new.investigation_paused is distinct from old.investigation_paused) then
    if auth.role() <> 'service_role' and not exists (
      select 1 from public.org_members
      where org_id = old.org_id and user_id = auth.uid() and public.can_see_all_org_cases(role)
    ) then
      raise exception 'Only HR can pause or resume an investigation';
    end if;
  end if;

  if (
    new.outcome is distinct from old.outcome
    or new.outcome_issued_at is distinct from old.outcome_issued_at
    or new.outcome_notes is distinct from old.outcome_notes
    or new.warning_duration_months is distinct from old.warning_duration_months
    or new.warning_expires_at is distinct from old.warning_expires_at
    or new.disciplinary_decided_by is distinct from old.disciplinary_decided_by
  ) then
    -- Service role stays deliberately exempt, as before: api/* routes hold the
    -- service key server-side, and a migration needs the same room.
    if coalesce(auth.role(), '') <> 'service_role' then
      v_marker := nullif(current_setting('compass.recording_case_decision', true), '');
      if v_marker is null or v_marker <> old.id::text then
        raise exception 'A case outcome can only be recorded through record_case_decision() (case %). Direct updates to outcome columns are not permitted.', old.id
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.protect_case_hr_only_columns() is
  'Wave D4.3. The six outcome columns may be written ONLY inside record_case_decision(), evidenced by a transaction-local marker bound to this case id; the direct HR/disciplinary-officer allowance was removed when that RPC took over issuance. The marker is evidence of provenance, NEVER authorization — record_case_decision establishes authority itself before setting it. Fails closed when the marker is absent or does not match. The investigation_paused branch is unchanged.';


-- ── 5. 'Outcome issued' becomes unforgeable ────────────────────────────────
--
-- Added to log_audit_event's reserved list, exactly as 'Case deleted',
-- 'Employee identity reconciled' and the appeal-officer actions already are, so
-- the action can only be written by the function that actually performed the
-- decision. Every other line of this function is the deployed definition.
--
-- The previous `p_action = 'Outcome issued' and v_case.outcome is null` check
-- becomes unreachable for this action and is left in place: it costs nothing and
-- removing it would be an unrelated edit to a security-critical function.
create or replace function public.log_audit_event(
  p_org_id uuid,
  p_action text,
  p_detail text default ''::text,
  p_case_id uuid default null::uuid,
  p_ai_prepared boolean default false,
  p_approved_by text default null::text,
  p_data_used text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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
    'Outcome issued'
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
$$;


-- ============================================================================
-- ROLLBACK (complete; restores the pre-D4.3 boundary)
-- ============================================================================
--   -- 1. restore the direct HR/disciplinary-officer UPDATE allowance
--   --    (paste the pre-D4.3 body of protect_case_hr_only_columns, which tested
--   --     org_members HR role OR case_access disciplinary_officer)
--   -- 2. remove 'Outcome issued' from log_audit_event's reserved list
--   drop function if exists public.record_case_decision(uuid, text, text, integer, timestamptz);
--   alter table public.audit_log drop column if exists case_decision_id;
--   -- NEW-49's correction is deliberately NOT rolled back: reinstating a guard
--   -- known to be inert would be a regression, not a restoration.
--
-- Rolling back discards no decision data. Any decision rows created through the
-- RPC remain valid and their compatibility projection remains on the case.
-- ============================================================================
