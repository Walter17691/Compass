-- ============================================================================
-- WAVE D4.3b — AUTHORITATIVE DECISION INSERT BOUNDARY (NEW-50) — 2026-10-03
-- ============================================================================
-- HOW TO APPLY: paste into the Supabase SQL Editor and run, as ONE unit.
--
-- No table, no column, no data change. One RLS policy replaced, one trigger
-- function redefined. NO APPLICATION CODE CHANGES — verified, not assumed: the
-- only client reference to this table is a SELECT (App.jsx loadCaseDecisions),
-- no api/* route names it, and deletion reaches it by ON DELETE CASCADE from
-- cases rather than by an enumerated DELETE. So the capability being removed is
-- one that no application path uses.
--
-- ┌─ THE DEFECT (NEW-50), FOUND BY D4.3'S OWN PRODUCTION VERIFICATION ──────┐
-- │ D4.3 closed the cases.* projection: the six outcome columns can only be  │
-- │ written inside record_case_decision(). It did NOT close the authoritative │
-- │ table itself. The D4.2 INSERT policy permits any HR member of the case's  │
-- │ organisation, or the case's disciplinary officer, to INSERT a             │
-- │ case_decisions row directly.                                             │
-- │                                                                          │
-- │ Measured live as the real `authenticated` role, not inferred:            │
-- │   directINSERT(same-org HR) = ACCEPTED                                   │
-- │   projection_outcome=''  audit_rows=0  approval_rows=0                   │
-- │   back-dated decided_at '1999-01-01' = ACCEPTED AS SUBMITTED             │
-- │                                                                          │
-- │ So an authoritative decision could exist with no compatibility            │
-- │ projection, no correlated audit event, no required approval request, and  │
-- │ a caller-chosen date. That matters more after D4.3 than before it,        │
-- │ because Current Warnings and DSAR now TRUST this table: employeeFile      │
-- │ resolves live warnings from the decision head, and compileSubjectData      │
-- │ discloses the chain to the data subject.                                 │
-- │                                                                          │
-- │ NOT a cross-tenant defect. The policy always required the actor to be a  │
-- │ member of the case's own organisation, and that held: a wrong-org HR      │
-- │ direct INSERT was refused 42501 and saw 0 rows. This is a bypass of the  │
-- │ authoritative TRANSACTION by someone entitled to decide the case — not a │
-- │ tenancy breach, and it is described that way deliberately.               │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- THE CONTRACT THIS RESTORES. For every application actor:
--   actor -> record_case_decision -> authorization -> decision INSERT
--         -> compatibility projection -> audit -> approval where required
-- with no alternative application path able to create a decision row.
--
-- PRE-MIGRATION BASELINE (production, read-only, immediately before applying):
--   case_decisions 137 · originals 137 · appeals 0 · supersessions 0 ·
--   legacy_unmapped 1 ("First written warning issued") · decided_at known on 2 ·
--   decided_by known on 0 · duration/expiry on 2 · all rows share the single
--   D4.2 backfill timestamp 2026-10-03 09:42:55.23635Z
--   decisions digest      md5(string_agg(id::text||':'||outcome, ',' order by id))
--                         = ba45de6c8fdfd76abd81f15533f7b6a2
--   outcome-cases digest  (same expression over cases where outcome <> '')
--                         = 4b80939135bbbae89770fe6e49230dca
--   policies on case_decisions 2 · triggers 1 · cases 2,960 · audit_log 16,923
-- ============================================================================


-- ── 1. RLS: no application INSERT path at all ──────────────────────────────
--
-- The permissive HR/disciplinary-officer policy is removed. With RLS enabled and
-- no permissive INSERT policy, an INSERT by `authenticated` or `anon` is denied.
--
-- WHY THE RPC IS UNAFFECTED, STRUCTURALLY RATHER THAN HOPEFULLY. Verified from
-- the catalogue before writing this: case_decisions is owned by `postgres`,
-- record_case_decision is owned by `postgres`, and relforcerowsecurity is false.
-- A SECURITY DEFINER function therefore executes as the table owner and bypasses
-- RLS entirely. Removing a policy cannot take a capability away from it.
--
-- WHY A RESTRICTIVE `false` POLICY AND NOT SIMPLY NO POLICY. Two reasons, and
-- neither is decoration. An absent policy reads like an oversight and invites
-- someone to "fix" it by adding a permissive one; a named policy states the
-- intent in the place a reviewer actually looks. And because it is RESTRICTIVE,
-- it is ANDed rather than ORed — so adding a permissive INSERT policy later
-- cannot re-open the boundary on its own. The weakening has to be deliberate.
drop policy if exists "Only HR or the case's disciplinary officer may record a decisio"
  on public.case_decisions;

create policy "Decisions are created only through record_case_decision"
  on public.case_decisions
  as restrictive for insert
  to public
  with check (false);

comment on policy "Decisions are created only through record_case_decision" on public.case_decisions is
  'Wave D4.3b (NEW-50). No application actor may INSERT a decision directly; record_case_decision() is the only operational path. RESTRICTIVE so a later permissive policy cannot re-open it by itself. record_case_decision is SECURITY DEFINER owned by the table owner and bypasses RLS, so it is unaffected; service_role holds BYPASSRLS and is likewise unaffected.';


-- ── 2. Trigger: the controlled operation must have run, and it owns the date ─
--
-- RLS alone would be enough for today's clients. This is the second, independent
-- lock, and it is the one that makes the contract true for paths RLS does not
-- see: any future SECURITY DEFINER function, or anything else executing as the
-- table owner, must now come through record_case_decision or be service_role.
-- Defence in depth here costs one GUC read.
--
-- ┌─ THE MARKER IS NOT AUTHORIZATION ───────────────────────────────────────┐
-- │ record_case_decision establishes caller, organisation, case relationship,│
-- │ HR/disciplinary-officer authority, case access including the             │
-- │ confidential boundary, outcome vocabulary, warning-duration rules and    │
-- │ optimistic concurrency BEFORE it calls set_config. This trigger only ever │
-- │ asks "did that operation run, for THIS case, in THIS transaction".       │
-- │                                                                          │
-- │ It is transaction-local (set_config third argument true), set only inside │
-- │ that one function, scoped to a single case id, and fails closed when      │
-- │ absent or mismatched. No helper that sets it is exposed: set_config lives │
-- │ in pg_catalog, so PostgREST cannot call it, and no function in `public`   │
-- │ sets this GUC except record_case_decision.                               │
-- │                                                                          │
-- │ PROVEN INDEPENDENT. With the GUC deliberately set to the correct case id  │
-- │ and a direct INSERT attempted as same-org HR, the insert was still        │
-- │ refused 42501 — the RLS layer does not consult the marker, so possessing  │
-- │ one grants nothing on its own.                                           │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- decided_at: FORCED, not merely required. D4.2's guard asked only that it be
-- present, which let a direct insert back-date a sanction to 1999. It is now
-- assigned from now() for every non-privileged insert, so the caller cannot
-- choose it even in principle. This introduces no skew with the projection:
-- now() is transaction_timestamp and is constant across the transaction, so the
-- value the trigger assigns is the same v_now the RPC writes to
-- cases.outcome_issued_at — asserted live (decided_at_eq_projection=true).
--
-- The 135 historical rows whose decided_at is genuinely unknown are NOT touched.
-- Nothing here writes an existing row, and no date is invented for them.
create or replace function public.case_decisions_append_only_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- SERVICE ROLE ONLY. Never current_user: inside a SECURITY DEFINER function
  -- current_user is always the function OWNER, which is what made this guard
  -- inert for every caller between D4.2 and D4.3 (NEW-49).
  privileged boolean := coalesce(auth.role(), '') = 'service_role';
  v_marker text;
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

  -- INSERT.
  if not privileged then
    v_marker := nullif(current_setting('compass.recording_case_decision', true), '');
    if v_marker is null or v_marker <> new.case_id::text then
      raise exception 'A case decision can only be created through record_case_decision() (case %). Direct inserts are not permitted.', new.case_id
        using errcode = '42501';
    end if;

    -- Provenance is established here, never accepted from the caller.
    new.decided_by := auth.uid();
    new.decided_at := now();

    if new.outcome = 'legacy_unmapped' then
      raise exception 'legacy_unmapped is a historical marker and cannot be chosen as a decision outcome.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.case_decisions_append_only_guard() is
  'Wave D4.2, corrected in D4.3 (NEW-49), boundary closed in D4.3b (NEW-50). Append-only decision history: no UPDATE or DELETE by an ordinary caller. On INSERT a non-privileged caller must carry record_case_decision''s transaction-local marker for this exact case id, and decided_by/decided_at are assigned server-side (decided_at forced from now(), closing the back-dating hole). legacy_unmapped is refused for application writes. Privileged test is auth.role() = service_role ONLY. The marker evidences provenance and is never authorization — the RPC establishes authority before setting it.';


-- ============================================================================
-- SERVICE / MIGRATION CAPABILITY — what remains, and why
-- ============================================================================
-- service_role keeps the ability to INSERT a decision and to supply decided_by
-- and decided_at deliberately. This is NOT a bypass preserved out of habit; it
-- was inspected before being kept:
--
--   WHY REQUIRED. The D4.2 backfill created the 137 historical rows with
--   decided_at NULL on 135 of them, precisely because those dates are unknown
--   and D4.1 forbade inventing them. Any future historical import, correction of
--   a mis-mapped legacy row, or tenant data migration needs the same ability to
--   state provenance honestly — including stating that it is unknown. A path
--   that forced now() onto an imported 2019 sanction would manufacture false
--   provenance, which is the opposite of what this wave is protecting.
--
--   WHICH CONTROLS STILL APPLY. Everything role-independent: the decision_type
--   and outcome vocabularies, legacy provenance (legacy_unmapped requires
--   outcome_source_text and vice versa), the original/appeal shape rule, the
--   warning-duration range, communication consistency, the same-org composite
--   foreign key to cases(id, org_id), and both one-head partial unique indexes.
--   A service_role insert cannot create a second original for a case, a
--   cross-organisation decision, or an out-of-vocabulary outcome.
--
--   WHY ORDINARY CALLERS CANNOT REACH IT. auth.role() is read from the JWT
--   claims GUC that PostgREST sets from the verified token. A browser client
--   cannot set it: set_config is in pg_catalog and is not exposed, and claiming
--   role=service_role requires holding the service key, which lives only in
--   server-side api/* routes. Measured: an anon caller has EXECUTE revoked on
--   the RPC and sees 0 rows, and an authenticated caller's auth.role() is
--   'authenticated' even inside a SECURITY DEFINER function.
--
-- A migration run from the SQL editor has auth.role() NULL and is therefore NOT
-- privileged. That is deliberate and is a real behaviour change from D4.2, where
-- NEW-49 made every caller privileged by accident. A migration that genuinely
-- needs to insert decision history must opt in explicitly, in its own
-- transaction, with the pattern already used in api/team/_accept-team-invite.js:
--     select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- Opting in is one visible line in a reviewed migration, which is the point.
--
-- ============================================================================
-- ROLLBACK (complete; restores the pre-D4.3b boundary)
-- ============================================================================
--   drop policy if exists "Decisions are created only through record_case_decision"
--     on public.case_decisions;
--   create policy "Only HR or the case's disciplinary officer may record a decisio"
--     on public.case_decisions for insert to public
--     with check (
--       exists (select 1 from public.cases c
--                where c.id = case_decisions.case_id and c.org_id = case_decisions.org_id)
--       and (
--         exists (select 1 from public.org_members m
--                  where m.org_id = case_decisions.org_id and m.user_id = auth.uid()
--                    and public.is_hr_role(m.role))
--         or exists (select 1 from public.case_access ca
--                     where ca.case_id = case_decisions.case_id and ca.user_id = auth.uid()
--                       and ca.role = 'disciplinary_officer')
--       ));
--   -- and restore the D4.3 trigger body (marker not required on INSERT,
--   -- decided_at required rather than forced) from
--   -- supabase/case_decision_cutover_2026-10-03.sql section 1.
--
-- Rolling back reinstates NEW-50 and the back-dating hole. No decision data is
-- read or written by this migration, so there is nothing to restore.
-- ============================================================================
