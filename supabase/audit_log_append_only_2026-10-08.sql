-- ============================================================================
-- THE AUDIT TRAIL CANNOT BE EDITED, ERASED OR DETACHED
-- IR-REPORT-01b / B1                                                2026-10-08
-- ============================================================================
-- HOW TO APPLY: paste into the Supabase SQL Editor and run, as ONE unit.
--
-- ADDITIVE ONLY. Two functions, two triggers, one partial index. No column, no
-- policy, no RLS change, no backfill, no GRANT to any application role, and
-- not one existing row is read, rewritten or reinterpreted.
--
-- Every claim below was proved on isolated Supabase branches with synthetic
-- data only. No production data was used. The branches were deleted.
--
-- ┌─ THE DEFECT THIS CLOSES ────────────────────────────────────────────────┐
-- │ audit_log is append-only TODAY only because no policy permits anything  │
-- │ else. It has exactly ONE policy — audit_log_select_scoped. There is no   │
-- │ INSERT policy (dropped deliberately so writes go through                 │
-- │ log_audit_event), and no UPDATE or DELETE policy has ever existed.       │
-- │                                                                         │
-- │ That is ONE HALF of append-only. PROVED: adding a single permissive      │
-- │ policy let an ordinary `authenticated` caller rewrite an audit row to    │
-- │ 'TAMPERED BY ORDINARY USER' — one line, no error, no trace. The grants   │
-- │ are already there: anon and authenticated both hold SELECT, INSERT,      │
-- │ UPDATE and DELETE on this table. RLS is the only gate.                   │
-- │                                                                         │
-- │ case_decisions carries both halves and says why                          │
-- │ (case_decisions_2026-10-03.sql:398-403): the trigger exists "BECAUSE A   │
-- │ FUTURE MIGRATION COULD ADD AN UPDATE POLICY WITHOUT ANYONE NOTICING".    │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ THE THREE RULES ───────────────────────────────────────────────────────┐
-- │ 1. CONTENT is immutable — every column except the six back-references,   │
-- │    compared as a whole row so a column added by a FUTURE migration is    │
-- │    covered automatically. See "fail closed" below.                       │
-- │ 2. ATTRIBUTION is immutable while its subject exists. case_id,           │
-- │    allegation_id, case_decision_id, employee_id, employee_activity_id    │
-- │    and employment_event_id may change ONLY by being cleared to NULL, and │
-- │    ONLY once the referenced row has actually gone.                       │
-- │ 3. No row may be deleted.                                                │
-- │                                                                         │
-- │ Rule 2 is what keeps the six ON DELETE SET NULL foreign keys working. A  │
-- │ SET NULL referential action IS an UPDATE on audit_log, so a blanket      │
-- │ refusal breaks deletion of any referenced object. PROVED: with a blanket │
-- │ refusal, delete_case() failed with 23514 and the case was NOT deleted.   │
-- │ The six FKs are NOT DEFERRABLE, so the SET NULL fires as an AFTER DELETE │
-- │ action and the parent is ALREADY GONE when this BEFORE UPDATE trigger    │
-- │ runs. "Has the subject gone?" therefore separates a genuine cascade from │
-- │ a user stripping attribution — from the DATA, not from how the statement │
-- │ was reached.                                                             │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ FAIL CLOSED ON FUTURE COLUMNS ─────────────────────────────────────────┐
-- │ An earlier draft enumerated the content columns by name. PROVED that     │
-- │ this fails open: after `alter table audit_log add column future_note`,   │
-- │ an ordinary caller could change that column freely, because no           │
-- │ comparison mentioned it.                                                 │
-- │                                                                         │
-- │ The rule is now a whole-row comparison with the six references excluded: │
-- │                                                                         │
-- │     (to_jsonb(new) - ref_cols) is distinct from (to_jsonb(old) - ref_cols)│
-- │                                                                         │
-- │ Anything added later is inside to_jsonb() and outside the exclusion      │
-- │ list, so it is protected the moment it exists. A seventh FK added later  │
-- │ fails CLOSED — its cascade would be refused, loudly — which is the right │
-- │ direction for a guard to fail. PROVED: the future column is refused.     │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ WHY TWO TRIGGERS, AND WHY NO HELPER FUNCTION ──────────────────────────┐
-- │ The guard needs two things with opposite privilege requirements:         │
-- │   (a) the REAL calling role — only visible under SECURITY INVOKER,       │
-- │       because inside SECURITY DEFINER current_user is always the owner   │
-- │       (MEASURED: definer -> postgres, invoker -> authenticated). That is │
-- │       the defect that made the case_decisions guard inert for every      │
-- │       caller between D4.2 and D4.3 (NEW-49).                             │
-- │   (b) whether the referenced row exists, IGNORING the caller's RLS —     │
-- │       only available with owner privileges. MEASURED: with the parent    │
-- │       hidden by RLS but still present, a definer check returned true and │
-- │       an invoker check returned false, so an invoker check would read    │
-- │       "hidden" as "deleted" and permit the strip.                        │
-- │                                                                          │
-- │ An earlier draft kept the guard INVOKER and called a SECURITY DEFINER    │
-- │ helper, which required `grant execute ... to authenticated`. PROVED that │
-- │ this is a CROSS-TENANT EXISTENCE ORACLE: PostgREST exposes any granted   │
-- │ function at /rest/v1/rpc/, and an authenticated caller probing another   │
-- │ organisation's case id got true, versus false for a non-existent id.     │
-- │ Not acceptable, and not excusable by UUIDs being hard to guess.          │
-- │                                                                          │
-- │ Inverting the split removes the grant entirely:                          │
-- │   audit_log_capture_role      SECURITY INVOKER — records the real role   │
-- │   audit_log_append_only_guard SECURITY DEFINER — enforces, owner rights  │
-- │                                                                          │
-- │ Trigger functions fire WITHOUT any EXECUTE grant (PROVED: a trigger with │
-- │ EXECUTE revoked from anon, authenticated and public still fired). So     │
-- │ both functions are revoked from every application role and NEITHER is    │
-- │ reachable over RPC. The existence checks are inlined in the DEFINER      │
-- │ function, so there is no helper to expose. VERIFIED after install:       │
-- │ has_function_privilege EXECUTE = false for anon and authenticated on     │
-- │ both functions.                                                          │
-- │                                                                          │
-- │ The handoff is a transaction-local GUC, compass.audit_actor. Trigger (A) │
-- │ is named to sort before (B), so it always overwrites any value a caller  │
-- │ pre-set. PROVED: forging both the JWT claim and the GUC is refused.      │
-- │ The design depends on (A) firing; dropping it defeats the privilege test │
-- │ (mutation MV-A), and dropping a trigger requires superuser, who could    │
-- │ equally drop (B).                                                        │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ THE PRIVILEGED EXCEPTION ──────────────────────────────────────────────┐
-- │ service_role only, required BOTH as the verified JWT claim AND as the    │
-- │ real session role captured by trigger (A). One expression, declared once.│
-- │                                                                          │
-- │ The one legitimate privileged path is api/delete-org-data.js, the GDPR   │
-- │ "Delete all data" endpoint, which runs under SUPABASE_SERVICE_KEY so     │
-- │ PostgREST sets both. PROVED intact: all rows for the organisation        │
-- │ deleted, surviving 'Organisation data deleted' event written.            │
-- │                                                                          │
-- │ Nothing else deletes or edits audit rows: no pg_cron, no retention job,  │
-- │ no purge function; vercel.json's two crons never reference audit_log;    │
-- │ organisations.data_retention_years is documentation-only by explicit     │
-- │ earlier decision.                                                        │
-- │                                                                          │
-- │ KNOWN, ACCEPTED CONSEQUENCE: a hand-correction in the Supabase SQL       │
-- │ Editor is refused — that session is service_role by neither claim nor    │
-- │ role. That is the point. ALTER TABLE ... DISABLE TRIGGER remains for a   │
-- │ genuine emergency and is a deliberate, conspicuous act.                  │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- INSERT IS DELIBERATELY NOT GUARDED. Both triggers are BEFORE UPDATE OR
-- DELETE. Every existing writer keeps working: log_audit_event, the five
-- trigger writers, the RPCs that write their own unforgeable row, the four
-- service-role writers in api/, and stamp_audit_log_user_name, which still
-- runs BEFORE INSERT (PROVED: an insert sending user_name 'FORGED NAME' still
-- stored the caller's real org_members.name). Guarding INSERT would duplicate
-- authority that already lives in log_audit_event.
--
-- PRE-MIGRATION BASELINE (production, read-only, immediately before applying):
--   audit_log  17,011 rows · 5,848 kB · RLS enabled, relforcerowsecurity false
--     policies: 1 (audit_log_select_scoped, SELECT only)
--     triggers: 1 (stamp_audit_log_user_name_trigger, BEFORE INSERT)
--     indexes:  5 — pkey, (org_id, created_at desc) and three partial ones on
--               employee_id / employee_activity_id / employment_event_id.
--               NONE on case_id.
--     case_id present on 2,628 rows (15.4%) across 1,439 distinct cases
--     grants:   anon, authenticated and service_role each hold
--               SELECT, INSERT, UPDATE, DELETE — RLS is the only gate
--     the six SET NULL foreign keys are all NOT DEFERRABLE
-- This migration writes no row, so those counts cannot change.
-- ============================================================================


-- ── 1. (A) RECORD THE REAL CALLING ROLE ────────────────────────────────────
-- SECURITY INVOKER: this is the only context in which current_user is the
-- caller rather than the owner. It does nothing else.
create or replace function public.audit_log_capture_role()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  perform set_config('compass.audit_actor', current_user, true);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.audit_log_capture_role() is
  'IR-REPORT-01b / B1. Records into the transaction-local GUC compass.audit_actor the role IN EFFECT AT THE POINT OF THE WRITE, which audit_log_append_only_guard then tests. NOTE the precise semantics: this is NOT always the end user. For a direct PostgREST statement it is the request role (authenticated / service_role), but for a write issued inside a SECURITY DEFINER function it is that function''s OWNER. Both measured. That is safe, because the guard demands exactly service_role and neither authenticated nor the owner matches it, but it is also why a privileged write must not be routed through a SECURITY DEFINER function owned by another role - see the note on the guard. Runs as a trigger with no EXECUTE grant to any application role, and is named to fire before the guard so it always overwrites a caller-supplied value.';

revoke all on function public.audit_log_capture_role() from anon, authenticated, public;


-- ── 2. (B) ENFORCE ─────────────────────────────────────────────────────────
-- SECURITY DEFINER: the existence checks must not be blinded by the caller's
-- RLS. Inlined rather than delegated, so no function needs an EXECUTE grant
-- and nothing is reachable over PostgREST RPC.
create or replace function public.audit_log_append_only_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  privileged boolean :=
        coalesce(auth.role(), '') = 'service_role'
    and coalesce(nullif(current_setting('compass.audit_actor', true), ''), '') = 'service_role';
  ref_cols text[] := array['case_id','allegation_id','case_decision_id',
                           'employee_id','employee_activity_id','employment_event_id'];
begin
  if tg_op = 'DELETE' then
    if not privileged then
      raise exception
        'The audit trail cannot be deleted (entry %). Audit entries are permanent; a correction is recorded as a new entry.',
        old.id using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if privileged then
    return new;
  end if;

  -- (1) CONTENT — whole-row, so future columns are covered automatically.
  if (to_jsonb(new) - ref_cols) is distinct from (to_jsonb(old) - ref_cols) then
    raise exception
      'A recorded audit entry cannot be changed (entry %). Audit entries are permanent; a correction is recorded as a new entry.',
      old.id using errcode = 'check_violation';
  end if;

  -- (2) ATTRIBUTION — clearing only, and only once the subject has gone.
  if new.case_id is distinct from old.case_id then
    if new.case_id is not null
       or exists (select 1 from public.cases where id = old.case_id) then
      raise exception
        'The case attribution of an audit entry cannot be changed (entry %). It is cleared only when the case itself is deleted.',
        old.id using errcode = 'check_violation';
    end if;
  end if;

  if new.allegation_id is distinct from old.allegation_id then
    if new.allegation_id is not null
       or exists (select 1 from public.allegations where id = old.allegation_id) then
      raise exception
        'The allegation attribution of an audit entry cannot be changed (entry %). It is cleared only when the allegation itself is deleted.',
        old.id using errcode = 'check_violation';
    end if;
  end if;

  if new.case_decision_id is distinct from old.case_decision_id then
    if new.case_decision_id is not null
       or exists (select 1 from public.case_decisions where id = old.case_decision_id) then
      raise exception
        'The decision attribution of an audit entry cannot be changed (entry %). It is cleared only when the decision itself is deleted.',
        old.id using errcode = 'check_violation';
    end if;
  end if;

  if new.employee_id is distinct from old.employee_id then
    if new.employee_id is not null
       or exists (select 1 from public.employee_records where id = old.employee_id) then
      raise exception
        'The employee attribution of an audit entry cannot be changed (entry %). It is cleared only when the employee record itself is deleted.',
        old.id using errcode = 'check_violation';
    end if;
  end if;

  if new.employee_activity_id is distinct from old.employee_activity_id then
    if new.employee_activity_id is not null
       or exists (select 1 from public.employee_activities where id = old.employee_activity_id) then
      raise exception
        'The activity attribution of an audit entry cannot be changed (entry %). It is cleared only when the activity itself is deleted.',
        old.id using errcode = 'check_violation';
    end if;
  end if;

  if new.employment_event_id is distinct from old.employment_event_id then
    if new.employment_event_id is not null
       or exists (select 1 from public.employee_employment_events where id = old.employment_event_id) then
      raise exception
        'The employment-event attribution of an audit entry cannot be changed (entry %). It is cleared only when the event itself is deleted.',
        old.id using errcode = 'check_violation';
    end if;
  end if;

  return new;   -- a referential SET NULL clearing a now-dangling reference
end;
$$;

comment on function public.audit_log_append_only_guard() is
  'IR-REPORT-01b / B1. Content can never change (whole-row jsonb comparison, so columns added by future migrations are covered), no row can be deleted, and the six back-references may only be cleared once their subject has actually gone — which is precisely an ON DELETE SET NULL. INSERT is deliberately not guarded. Privileged exception is service_role, required both as auth.role() and as the real role captured by audit_log_capture_role. SECURITY DEFINER so the existence checks are not blinded by the caller''s RLS; the checks are inlined rather than delegated to a granted helper, because a granted helper is exposed by PostgREST as a cross-tenant existence oracle. pg_trigger_depth() was evaluated and rejected: a trigger on another table updating audit_log also runs at depth 2, so depth would permit it.';

revoke all on function public.audit_log_append_only_guard() from anon, authenticated, public;


-- ┌─ A CONSTRAINT THIS CREATES, STATED SO IT IS NOT LATENT ─────────────────┐
-- │ compass.audit_actor holds the role in effect where the write is issued,  │
-- │ not the end user. MEASURED on an isolated branch:                        │
-- │                                                                         │
-- │   authenticated, direct UPDATE .................. captured=authenticated │
-- │   authenticated -> SECURITY DEFINER RPC ......... captured=postgres      │
-- │   service_role, direct UPDATE ................... captured=service_role  │
-- │   FK cascade inside a DEFINER delete function ... captured=postgres      │
-- │                                                                         │
-- │ Security is unaffected: the guard demands exactly 'service_role', and    │
-- │ neither 'authenticated' nor the owner matches, so an ordinary caller is  │
-- │ refused whether they write directly or through a DEFINER RPC (PROVED).   │
-- │ Cascades are unaffected either way, because they are permitted by the    │
-- │ attribution rule, not by privilege.                                      │
-- │                                                                          │
-- │ THE CONSTRAINT: a genuine service_role write routed through a SECURITY   │
-- │ DEFINER function owned by another role captures that owner and is        │
-- │ therefore REFUSED. PROVED: a service_role call into a postgres-owned     │
-- │ DEFINER function updating audit_log content was refused.                 │
-- │                                                                          │
-- │ No such path exists today. api/delete-org-data.js issues its DELETE and  │
-- │ its surviving INSERT directly under the service key (captured =          │
-- │ service_role, PROVED working), and delete_case()'s cascade is permitted  │
-- │ by the attribution rule. But if a future privileged maintenance path     │
-- │ needs to UPDATE or DELETE audit_log, it must do so DIRECTLY under the    │
-- │ service key, not from inside a SECURITY DEFINER function. The failure    │
-- │ mode is a loud 23514 refusal, never a silent bypass.                     │
-- └─────────────────────────────────────────────────────────────────────────┘


-- ── 3. TRIGGERS — (A) MUST FIRE BEFORE (B) ─────────────────────────────────
-- PostgreSQL fires BEFORE triggers in alphabetical order by trigger name;
-- the a_/b_ prefixes make that ordering explicit rather than incidental.
drop trigger if exists audit_log_append_only_trg    on public.audit_log;
drop trigger if exists audit_log_a_capture_role_trg on public.audit_log;
drop trigger if exists audit_log_b_append_only_trg  on public.audit_log;

create trigger audit_log_a_capture_role_trg
  before update or delete on public.audit_log
  for each row execute function public.audit_log_capture_role();

create trigger audit_log_b_append_only_trg
  before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only_guard();


-- ── 4. THE INDEX THE SELECT POLICY HAS ALWAYS NEEDED ───────────────────────
-- audit_log_select_scoped's hot branch is keyed on case_id, and
-- src/lib/caseTimeline.js filters the same way; there has never been an index
-- on it. PARTIAL, matching the three sibling indexes for employee_id,
-- employee_activity_id and employment_event_id.
--
-- NOT CONCURRENTLY, deliberately: CREATE INDEX CONCURRENTLY cannot run inside
-- a transaction block, which would split this migration into two units that
-- could half-apply. A plain CREATE INDEX takes a SHARE lock — it blocks
-- writes, not reads. MEASURED at production scale (17,010 rows, 2,628
-- indexed): 7.5 ms, producing a 120 kB index, after which an EXPLAIN ANALYZE
-- of a case-scoped read used it: Index Scan, 0.110 ms.
create index if not exists audit_log_case_id_created_at_idx
  on public.audit_log (case_id, created_at desc)
  where case_id is not null;


-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================
-- * It does not guard INSERT. That authority belongs to log_audit_event().
-- * It does not GRANT EXECUTE on anything. Both functions are revoked from
--   anon, authenticated and public; triggers fire without a grant.
-- * It does not add, drop or alter any RLS policy. The single SELECT policy is
--   untouched and the absent INSERT/UPDATE/DELETE policies stay absent.
-- * It does not set FORCE ROW LEVEL SECURITY, which would break every
--   SECURITY DEFINER writer that relies on owner bypass.
-- * It does not use pg_trigger_depth() to spot referential actions. It does
--   separate them cleanly today (MEASURED: direct UPDATE = depth 1, FK
--   cascade = depth 2), but depth describes HOW a statement was reached, not
--   whether it is legitimate: PROVED that a trigger on an unrelated table
--   issuing `update audit_log set case_id = null` also runs at depth 2 and
--   would be wrongly permitted, so any future trigger touching audit_log
--   would silently become an attribution-stripping bypass. The
--   parent-existence rule in section 2 refused that same attack.
-- * It does not touch audit_log.changed_after, a dead column.
-- * It adds no retention or purge mechanism. There is deliberately none.
-- * It does not alter api/delete-org-data.js, which keeps working unchanged.
-- * It does not fix the equivalent claim-only weakness in
--   case_decisions_append_only_guard(). Reported separately.
--
-- ============================================================================
-- ROLLBACK (complete; no data to restore, because nothing was written)
-- ============================================================================
--   drop trigger if exists audit_log_b_append_only_trg  on public.audit_log;
--   drop trigger if exists audit_log_a_capture_role_trg on public.audit_log;
--   drop function if exists public.audit_log_append_only_guard();
--   drop function if exists public.audit_log_capture_role();
--   drop index    if exists public.audit_log_case_id_created_at_idx;
--
-- Triggers must go before their functions. Rolling back restores "an UPDATE
-- policy added later silently unlocks the audit trail" and returns
-- case-scoped audit reads to a sequential scan. No row is altered either way,
-- and nothing in the application reads the index or calls either function.
-- ============================================================================
