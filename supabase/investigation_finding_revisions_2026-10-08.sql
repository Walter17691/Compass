-- ============================================================================
-- IR-REPORT-01b / B2 — investigation_finding_revisions
--
-- WHAT THIS IS FOR. The three investigator narrative fields on `allegations`
-- are destructively overwritten. `investigator_finding`,
-- `outstanding_uncertainty` and `witness_evidence` each hold exactly one
-- string: the current one. When an investigator rewrites an assessment, the
-- previous wording is gone with no record that it ever existed, who wrote it,
-- or when it changed. For a document that an employer may have to defend at
-- tribunal, "what did the investigator originally find, and what changed"
-- is currently unanswerable.
--
-- `log_investigation_conclusion()` (supabase/investigation_conclusion_*) is the
-- only existing database-side findings audit, and it deliberately covers only
-- the CONCLUSION, writes no narrative text, and returns null when auth.uid()
-- is null — so service-role writes go unrecorded entirely. It is not a
-- revision history and was never meant to be one.
--
-- WHAT IT IS NOT. This is not a report version store (that is B3/D2, and is
-- deliberately out of scope here), and it is not a second place where findings
-- live. `allegations` remains the single source of the CURRENT narrative. This
-- table holds only superseded values, and nothing reads it to render a finding.
--
-- ┌─ LIVE SHAPE, MEASURED BEFORE WRITING THIS (production, 2026-10-08) ──────┐
-- │ allegations                                      950 rows               │
-- │   investigator_finding populated                  55                    │
-- │   outstanding_uncertainty populated               14                    │
-- │   witness_evidence populated                       1                    │
-- │   investigation_conclusion populated               1                    │
-- │ allegations.id is TEXT (client-generated 'alg_…'), not uuid.            │
-- │ allegations has NO employee reference of any kind.                      │
-- │ allegations RLS: ONE policy, FOR ALL, delegating to public.cases.       │
-- └─────────────────────────────────────────────────────────────────────────┘
--
--
-- ╔═ WHY THIS IS NOT B1's ARCHITECTURE ═════════════════════════════════════╗
-- ║ B1 (audit_log_append_only_2026-10-08.sql) needed TWO triggers and a      ║
-- ║ content/attribution split. Neither carries over, and the reasons are     ║
-- ║ specific rather than stylistic:                                          ║
-- ║                                                                          ║
-- ║ 1. B1's SECOND trigger existed ONLY to capture `current_user` before     ║
-- ║    control entered a SECURITY DEFINER function, because inside DEFINER   ║
-- ║    `current_user` is always the function OWNER (measured: definer ->     ║
-- ║    postgres, invoker -> authenticated). B2 never needs the session role. ║
-- ║    Its attribution signal is auth.uid(), which reads the request's JWT   ║
-- ║    claims GUC — SECURITY DEFINER changes `current_user`, NOT that GUC.   ║
-- ║    So one trigger suffices. (Verified on a branch, not assumed: see the  ║
-- ║    B2 test record, probe A-01.)                                          ║
-- ║                                                                          ║
-- ║ 2. B1's hardest part — distinguishing a tampering UPDATE from a          ║
-- ║    referential one — existed solely because audit_log is the target of   ║
-- ║    SIX `ON DELETE SET NULL` foreign keys, and SET NULL is an UPDATE.     ║
-- ║    This table is the target of NONE. Nothing can ever legitimately       ║
-- ║    UPDATE a row here, so the guard refuses every UPDATE outright. The    ║
-- ║    whole-row jsonb comparison, the six per-reference blocks and the      ║
-- ║    parent-existence test for UPDATE are all unnecessary here, and        ║
-- ║    importing them would be untested complexity.                          ║
-- ║                                                                          ║
-- ║ 3. What DOES carry over, because it is a property of the problem and not ║
-- ║    of audit_log: SECURITY DEFINER is required for the DELETE guard's     ║
-- ║    parent-existence lookup, and for a load-bearing reason — see §6.      ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- ============================================================================


-- ── 1. The revision store ──────────────────────────────────────────────────
--
-- One row per FIELD per CHANGE. A single UPDATE that rewrites two narrative
-- fields produces two rows, because "what changed in the assessment" and "what
-- changed in the uncertainties" are different facts and collapsing them into
-- one row would make either unanswerable without parsing.
create table public.investigation_finding_revisions (
  id uuid primary key default gen_random_uuid(),

  -- TENANCY KEYSTONE. Both NOT NULL, and tied together by the composite FK
  -- below so that (case_id, org_id) must name a real same-org case. cases.org_id
  -- is nullable and this migration does not change that; as in
  -- case_decisions_2026-10-03.sql §1, the MATCH SIMPLE gap is closed on the
  -- CHILD side by NOT NULL, so a new revision cannot exploit the nullable
  -- parent to escape the same-org check.
  org_id uuid not null,
  case_id uuid not null,

  -- TEXT, matching allegations.id (client-generated 'alg_…'), NOT uuid.
  -- Deliberately NOT a foreign key — see §2.
  allegation_id text not null,

  -- Which narrative was rewritten.
  field text not null,

  -- The superseded wording and the wording that replaced it. Both nullable
  -- because either end of a change can legitimately be NULL: first authoring
  -- (null -> text) and clearing (text -> null) are both real revisions and both
  -- must be recorded.
  previous_value text,
  new_value text,

  -- ATTRIBUTION. changed_by is the authenticated human, or NULL when there was
  -- no authenticated human. actor_kind says which, so a NULL is never
  -- ambiguous between "a person we failed to record" and "not a person".
  changed_by uuid,
  actor_kind text not null,

  changed_at timestamptz not null default now(),

  -- MONOTONIC ORDER, because changed_at alone cannot provide it. now() is
  -- transaction_timestamp(), so two successive narrative UPDATEs inside ONE
  -- transaction receive an IDENTICAL changed_at — measured, not assumed: on the
  -- B2 branch, two writes in separate transactions (distinct txids 1239/1240)
  -- produced 1 distinct now() and 2 distinct clock_timestamp() values. With a
  -- random-uuid primary key there would then be no tiebreaker at all, and
  -- "which wording came first" is exactly the question this table exists to
  -- answer. In normal app use each save is its own request and transaction, so
  -- this is a narrow case — but an append-only history with an unresolvable
  -- order is a defect, and the fix is one column.
  --
  -- Honest about what it does and does not guarantee: it orders ASSIGNMENT, not
  -- commit, and identity sequences may leave gaps on rollback. Neither
  -- undermines its purpose here — a gap is not a missing revision (the
  -- revision rolled back with its narrative update), and concurrent edits to
  -- the SAME field are serialised by the row lock the UPDATE already holds.
  seq bigint generated always as identity,

  -- Same-org composite FK. Relies on cases_id_org_key, added by
  -- case_decisions_2026-10-03.sql §1. CASCADE: see §2 for why this is the only
  -- cascade path into this table.
  constraint investigation_finding_revisions_case_same_org_fkey
    foreign key (case_id, org_id) references public.cases(id, org_id)
    on delete cascade,

  constraint investigation_finding_revisions_org_fkey
    foreign key (org_id) references public.organisations(id) on delete cascade,

  -- The three fields this slice covers, named explicitly. A fourth narrative
  -- field added later must extend BOTH this constraint and the capture trigger,
  -- and failing to extend this one is a loud 23514 rather than silent
  -- non-capture.
  constraint investigation_finding_revisions_field_valid
    check (field in ('investigator_finding', 'outstanding_uncertainty', 'witness_evidence')),

  -- NO FALSE REVISIONS, STRUCTURALLY. The capture trigger already compares with
  -- `is distinct from`, but this makes a no-op revision unrepresentable rather
  -- than merely unwritten — so a future second writer, or a hand-written INSERT,
  -- cannot manufacture a change that did not happen.
  constraint investigation_finding_revisions_meaningful
    check (previous_value is distinct from new_value),

  -- NO MISLEADING HUMAN ATTRIBUTION, STRUCTURALLY. A row claiming a human actor
  -- must name one; a row classified as a system action must not name one. This
  -- is what makes "service-role operations cannot create misleading human
  -- attribution" a constraint rather than a convention.
  constraint investigation_finding_revisions_actor_shape
    check (
      (actor_kind = 'user'   and changed_by is not null)
      or (actor_kind = 'system' and changed_by is null)
    )
);

comment on table public.investigation_finding_revisions is
  'IR-REPORT-01b/B2. Append-only history of superseded investigator narratives on allegations (investigator_finding, outstanding_uncertainty, witness_evidence). Written ONLY by capture_investigation_finding_revision(); no client may INSERT, UPDATE or DELETE. Contains personal data and is in DSAR scope (dsar: included, human-reviewed before release). Retention: NOT ENFORCED — see the B2 retention note.';

comment on column public.investigation_finding_revisions.actor_kind is
  '''user'' = an authenticated person (changed_by names them). ''system'' = no authenticated principal, which in practice means a service-role or direct-SQL write. Never inferred from caller-supplied input; assigned by the capture trigger from auth.uid().';

comment on column public.investigation_finding_revisions.allegation_id is
  'Deliberately NOT a foreign key. A revision must outlive the allegation it describes — see the migration header §2.';


-- ── 2. WHY allegation_id IS NOT A FOREIGN KEY ──────────────────────────────
--
-- This is the one genuinely contestable decision in B2, so it is argued rather
-- than asserted.
--
-- `allegations` carries a single RLS policy, FOR ALL, delegating to
-- public.cases. DELETE is therefore available to every user who can write to
-- the case — an investigator or line manager with case_access, not only HR.
-- (block_auditor_write_allegations removes auditors; nothing else narrows it.)
--
-- If this table cascaded from `allegations`, the revision history would be
-- destroyable by exactly the person it exists to hold to account: rewrite the
-- finding, then delete the allegation, and the record of the rewrite goes with
-- it. An append-only store that an ordinary user can erase through its parent
-- is not append-only in any sense that matters.
--
-- So the only cascade into this table is from `cases`. Deleting a case is a
-- separately authorised, audited, HR-level act (delete_case), and erasing an
-- entire case's data is a decision Compass already recognises as such.
--
-- The cost, stated plainly rather than discovered later:
--   * A revision can outlive its allegation, and will then reference an
--     allegation_id that no longer resolves. That is intended — it is a
--     historical fact about a document that existed.
--   * Referential integrity for allegation_id comes from the capture trigger
--     being the ONLY writer (it writes new.id), not from the database.
--
-- DELETION IMPLICATIONS, for the A3 retention record:
--   * delete the ALLEGATION  -> revisions SURVIVE (audit integrity)
--   * delete the CASE        -> revisions are destroyed (cascade)
--   * delete the ORGANISATION-> revisions are destroyed (cascade)
--   * "Delete all data"      -> covered transitively; this table is classified
--     cascade_covered, like case_decisions, so api/delete-org-data.js does not
--     name it and does not need to.
--
-- WHY changed_by IS ALSO NOT A FOREIGN KEY. `references auth.users(id) on
-- delete set null` would be the reflex, and it is a trap this codebase has
-- already paid for once: B1 established that ON DELETE SET NULL is an UPDATE,
-- which here would collide head-on with
-- investigation_finding_revisions_actor_shape (actor_kind='user' requires
-- changed_by NOT NULL) and raise 23514 from inside a user deletion. Beyond the
-- mechanics, rewriting attribution when an account is removed is the wrong
-- behaviour for a historical record: who wrote something does not become
-- unknown because they later left.


-- ── 3. Indexes ─────────────────────────────────────────────────────────────
--
-- Two access paths exist and no others: "this allegation's history of this
-- field" (the UI) and "this case's revision activity" (DSAR compilation and
-- review).
-- Ordered by seq, not changed_at: seq is the authoritative order (see §1), and
-- an index on an ambiguous key would hand back ties in an arbitrary order.
create index investigation_finding_revisions_allegation_field_idx
  on public.investigation_finding_revisions (allegation_id, field, seq desc);

create index investigation_finding_revisions_case_idx
  on public.investigation_finding_revisions (case_id, changed_at desc);


-- ── 4. Capture, at the database level ──────────────────────────────────────
--
-- The requirement is that application code cannot silently bypass revision
-- recording. That rules out recording in the client (src/App.jsx's
-- saveAllegationToDB) or in an API route: PostgREST accepts a direct PATCH on
-- /rest/v1/allegations from any authorised session, and a service-role caller
-- bypasses both. A trigger on the table is the only point every UPDATE must
-- pass through, whatever its origin.
--
-- AFTER, not BEFORE, and the reason is org_id rather than refusals.
--
-- The tempting argument — "a BEFORE capture would record revisions for updates
-- that a later BEFORE guard then refuses" — was TESTED AND IS FALSE (probe
-- M-06). A refusal aborts the statement, which rolls the capture INSERT back
-- with everything else, so a BEFORE capture records nothing for a refused
-- update either. That mutant survived, and the reasoning is not retained.
--
-- The real reason is trigger ORDER. Triggers fire alphabetically within BEFORE
-- UPDATE, and sync_allegations_org_id_trigger sorts LAST — measured on the
-- branch:
--   block_auditor_write_allegations
--   -> protect_allegations_appeal_decision_columns_trigger
--   -> protect_allegations_case_attribution_trg
--   -> protect_allegations_finding_columns_trigger
--   -> protect_allegations_investigation_conclusion_trigger
--   -> sync_allegations_org_id_trigger          <-- makes org_id authoritative
--
-- sync_case_child_org_id() is what re-derives new.org_id from the parent case.
-- Until it has run, new.org_id is still whatever the CALLER sent. A capture
-- trigger placed BEFORE would therefore read a caller-controlled org_id.
--
-- Measured (probe M-07): a legitimate narrative edit submitted with a forged
-- `org_id` of another tenant FAILS under BEFORE capture with 23503, because the
-- composite FK correctly rejects the caller's org_id — the tenancy constraint
-- holds, but the honest edit is destroyed. Under AFTER capture the identical
-- request succeeds, the revision records the case-derived
-- org_id, and the forged value is corrected away on the allegation too.
--
-- So AFTER is not stylistic: it is what guarantees `new` is final, and in
-- particular that org_id is the parent case's and cannot be caller-supplied.
--
-- ROLLBACK COUPLING. An exception raised here aborts the statement, so the
-- narrative UPDATE on allegations rolls back with it. Revision capture and the
-- change it records either both happen or neither does; there is no path that
-- updates the narrative while failing to record it. (Tested — see probe R-01.)
create or replace function public.capture_investigation_finding_revision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- ┌─ PRIVILEGE OUTRANKS THE SUBJECT CLAIM, AND THAT IS A CORRECTION ───────┐
  -- │ The first version of this function read auth.uid() and called the write │
  -- │ a 'user' action whenever it was non-null. Probe AT-03 showed that is    │
  -- │ wrong: a service_role JWT that ALSO carries a `sub` produced            │
  -- │ actor_kind='user' naming a real investigator — a privileged write       │
  -- │ misattributed to a human. Supabase's own service key carries no `sub`,  │
  -- │ so the default shape was safe, but any custom or proxied token could    │
  -- │ manufacture a human author.                                             │
  -- │                                                                         │
  -- │ So the ROLE is tested first and wins. A privileged write is a system    │
  -- │ action, and changed_by is forced to NULL rather than merely ignored —    │
  -- │ the actor_shape constraint then makes 'system' + a named human          │
  -- │ unrepresentable, so the two cannot drift apart.                          │
  -- │                                                                         │
  -- │ The cost, stated: a service-role call made on behalf of a signed-in     │
  -- │ person is recorded as 'system', not as that person. That is deliberate  │
  -- │ and is the safe direction — this trigger cannot verify a human's        │
  -- │ involvement in a privileged request, and claiming an author who may not  │
  -- │ have written the words is the worse error. An API route that needs      │
  -- │ human attribution must record it itself.                                │
  -- └─────────────────────────────────────────────────────────────────────────┘
  v_privileged boolean := coalesce(auth.role(), '') = 'service_role';

  -- auth.uid() is read from the request's JWT claims. Unlike current_user it is
  -- NOT rewritten by SECURITY DEFINER, which is why this function needs no
  -- companion capture trigger (header, point 1). Measured: probe AT-04, a human
  -- calling through a postgres-owned DEFINER function, is still attributed to
  -- that human and not to the owner.
  v_actor uuid := case when v_privileged then null else auth.uid() end;

  -- 'system' covers every write with no verified human behind it: service_role,
  -- cron, direct SQL. It claims no more than it knows.
  v_kind  text := case when v_privileged or auth.uid() is null then 'system' else 'user' end;
begin
  if new.investigator_finding is distinct from old.investigator_finding then
    insert into public.investigation_finding_revisions
      (org_id, case_id, allegation_id, field, previous_value, new_value, changed_by, actor_kind)
    values
      (new.org_id, new.case_id, new.id, 'investigator_finding',
       old.investigator_finding, new.investigator_finding, v_actor, v_kind);
  end if;

  if new.outstanding_uncertainty is distinct from old.outstanding_uncertainty then
    insert into public.investigation_finding_revisions
      (org_id, case_id, allegation_id, field, previous_value, new_value, changed_by, actor_kind)
    values
      (new.org_id, new.case_id, new.id, 'outstanding_uncertainty',
       old.outstanding_uncertainty, new.outstanding_uncertainty, v_actor, v_kind);
  end if;

  if new.witness_evidence is distinct from old.witness_evidence then
    insert into public.investigation_finding_revisions
      (org_id, case_id, allegation_id, field, previous_value, new_value, changed_by, actor_kind)
    values
      (new.org_id, new.case_id, new.id, 'witness_evidence',
       old.witness_evidence, new.witness_evidence, v_actor, v_kind);
  end if;

  return null;  -- AFTER trigger; the return value is ignored
end;
$$;

-- No API surface. A function granted to `authenticated` is published at
-- /rest/v1/rpc/<name>, which B1 established can be turned into a cross-tenant
-- existence oracle. A trigger function does not need EXECUTE granted to the
-- invoking role to fire, so it is revoked.
revoke all on function public.capture_investigation_finding_revision() from anon, authenticated, public;

create trigger capture_investigation_finding_revision_trg
  after update on public.allegations
  for each row
  execute function public.capture_investigation_finding_revision();


-- ── 5. Row level security — read access ────────────────────────────────────
--
-- The authority model, per the B2 product decision (A2):
--
--   HR in the case's organisation ............ MAY read
--   the CURRENTLY assigned investigator ...... MAY read
--   a PREVIOUS investigator / past author .... MAY NOT read
--   disciplinary officer ..................... MAY NOT read
--   auditor .................................. MAY NOT read
--   anyone in another organisation ........... MAY NOT read
--
-- TWO conditions, both required, doing different jobs:
--
-- (a) The bare `EXISTS (select 1 from public.cases c where c.id = …case_id)`.
--     This subquery is itself subject to cases' own seven policies, so the
--     case boundary — L1/L2/L3, explicit case_access grants and revocation —
--     is INHERITED and cannot drift from the parent. It is deliberately not
--     rewritten here, and deliberately not `org_id in (select my_org_ids())`,
--     which would hand every org member every revision and destroy all of the
--     above in one line.
--
--     CONFIDENTIAL CASES, STATED ACCURATELY. There is no longer a
--     confidentiality SELECT policy on `cases` to inherit, and that is by
--     design rather than by omission: three_level_case_access_2026-09-13.sql
--     §PART 4 DROPPED "Confidential cases restricted to authorised staff"
--     deliberately, because under the approved three-level model Level 1 sees
--     confidential cases under the same unconditional rule as every other
--     case, and Level 2/3's confidential rule is identical to their ordinary
--     one. Verified live on 2026-10-08: `cases` carries 7 policies, none
--     referencing `confidential`, and 0 of 2,963 cases are flagged
--     confidential. So confidentiality of READS *is* the three-level model,
--     and inheriting that model is exactly what (a) does. If a separate
--     confidentiality gate is ever reinstated on `cases`, this table picks it
--     up with no change here — which is the point of not restating it.
--
--     The confidential WRITE boundary (protect_confidential_case_write(), a
--     trigger that fires only on `cases`) needs no re-checking here for the
--     one reason that makes this table unusual: there are NO client writes to
--     re-check (§6). The only writer is the capture trigger, and the write it
--     records has already passed every guard on `allegations`.
--
-- (b) The authority test. Case visibility alone is NOT sufficient: a
--     disciplinary officer and an auditor can both see a case, and neither is
--     authorised to read superseded investigator drafts. So on top of (a) the
--     reader must be HR in the case's org, or hold a CURRENT case_access row
--     with role='investigator'.
--
-- WHAT IS DELIBERATELY ABSENT: there is no `changed_by = auth.uid()` clause.
-- Authoring a revision confers no standing to read it later. A revoked
-- investigator's case_access row is gone, so (b) fails for them even though
-- their name is on the rows — which is precisely the A2 decision.
--
-- RECURSION: cases' policies reference org_members, case_access and the
-- SECURITY DEFINER helpers, never this table. One-directional, no cycle.
alter table public.investigation_finding_revisions enable row level security;

create policy "Revision history is visible to HR and the current investigator"
  on public.investigation_finding_revisions
  for select
  using (
    exists (
      select 1 from public.cases c
      where c.id = investigation_finding_revisions.case_id
    )
    and (
      exists (
        select 1 from public.org_members m
        where m.org_id = investigation_finding_revisions.org_id
          and m.user_id = auth.uid()
          and public.is_hr_role(m.role)
      )
      or exists (
        select 1 from public.case_access ca
        where ca.case_id = investigation_finding_revisions.case_id
          and ca.user_id = auth.uid()
          and ca.role = 'investigator'
      )
    )
  );


-- ── 6. Write authority — there is none, for anyone ─────────────────────────
--
-- No permissive INSERT, UPDATE or DELETE policy exists, which under RLS already
-- denies all three to every non-bypass role. The RESTRICTIVE insert policy
-- below adds something a missing policy cannot: it states the intent in the
-- schema, and it keeps holding if someone later adds a permissive INSERT policy
-- for a plausible-looking reason. RESTRICTIVE policies are ANDed, so
-- `with check (false)` can only ever be satisfied by a role that bypasses RLS
-- entirely — which is the capture trigger (SECURITY DEFINER, owned by postgres)
-- and service_role, and nothing else.
create policy "No client may write revision history directly"
  on public.investigation_finding_revisions
  as restrictive for insert
  with check (false);

-- The other half of append-only. A policy-based denial is invisible: an UPDATE
-- or DELETE that matches no visible row succeeds with zero rows affected, which
-- is indistinguishable from a refusal unless you count rows. The trigger makes
-- the refusal LOUD, and — more importantly — it is the only thing standing in
-- front of a caller that bypasses RLS.
--
-- WHY SECURITY DEFINER, AND WHY IT IS LOAD-BEARING. The DELETE branch must
-- permit the `cases` cascade, which it recognises by the parent case having
-- already gone. That lookup MUST be RLS-blind: under SECURITY INVOKER, a case
-- the caller merely cannot SEE would read as deleted, and the guard would
-- FAIL OPEN and permit the delete. DEFINER (owner postgres, which has
-- BYPASSRLS) is what makes "has the parent gone?" a question about the data
-- rather than about the caller.
--
-- The privileged test is auth.role(), NOT current_user: inside SECURITY DEFINER
-- current_user is always the owner (postgres), so a current_user test would be
-- inert for every caller. B1 shipped exactly that bug (NEW-49) and it is not
-- repeated here.
create or replace function public.investigation_finding_revisions_append_only_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' then
    -- Unconditional. Nothing legitimately updates a row in this table: it is
    -- the target of no ON DELETE SET NULL foreign key, and it has no mutable
    -- column by design.
    raise exception
      'A recorded narrative revision cannot be changed (revision %). The history is append-only; a later change is a new revision.',
      old.id using errcode = 'check_violation';
  end if;

  -- DELETE from here down.

  -- The cases/organisations cascade. The parent row is already gone by the time
  -- the referential action fires the child delete, so its absence identifies a
  -- cascade from the data, without inspecting execution context.
  -- pg_trigger_depth() was considered and rejected in B1: a trigger on an
  -- unrelated table deleting from here also runs at depth 2, and would be
  -- wrongly permitted.
  if not exists (select 1 from public.cases where id = old.case_id) then
    return old;
  end if;

  -- The ORGANISATION cascade, recognised the same way. organisations is the
  -- other ON DELETE CASCADE parent, and PostgreSQL deletes the parent row
  -- BEFORE firing referential actions, so during an org erasure this row's org
  -- has already gone. Without this the two cascades would race: whichever of
  -- cases/investigation_finding_revisions Postgres processes first decides
  -- whether the case row still exists, and if the revisions go first the guard
  -- would refuse and abort the whole organisation delete.
  if not exists (select 1 from public.organisations where id = old.org_id) then
    return old;
  end if;

  -- NO SERVICE-ROLE ESCAPE HATCH.
  --
  -- The rest of the schema exempts service_role (protect_immutable_columns and
  -- friends) and the first cut of this guard copied that convention. It is
  -- wrong HERE, and the difference is what this table is for: every other
  -- guarded table holds current state that an operator may legitimately need to
  -- correct, whereas this one exists solely so that a change to an investigator's
  -- assessment cannot be made to disappear. A privileged pathway that silently
  -- erases it defeats the entire control, and "the platform key can do it" is
  -- precisely the threat an append-only history is supposed to answer.
  --
  -- Nothing legitimate is lost. "Delete all data" does NOT delete from this
  -- table: it is classified cascade_covered in src/lib/dataInventory.js and is
  -- absent from ORG_SCOPED_TABLES, so api/delete-org-data.js deletes `cases` and
  -- the composite FK removes the revisions through the cascade branch above.
  -- (Proven on an isolated branch, probe C9b.)
  --
  -- The consequence, stated: there is now NO pathway that removes a revision
  -- while its case survives — not for a client, not for service_role, not for
  -- postgres over a direct connection. Erasure requires removing the case or the
  -- organisation, which are separately authorised and audited acts. If a lawful
  -- erasure obligation ever requires finer granularity, that needs its own
  -- reviewed migration rather than a standing back door.
  raise exception
    'Narrative revision history cannot be deleted (revision %). The history is append-only and is removed only with the case or organisation it belongs to.',
    old.id using errcode = 'check_violation';
end;
$$;

revoke all on function public.investigation_finding_revisions_append_only_guard() from anon, authenticated, public;

create trigger investigation_finding_revisions_append_only_trg
  before update or delete on public.investigation_finding_revisions
  for each row
  execute function public.investigation_finding_revisions_append_only_guard();


-- ── 6a. Table privileges: inherited, and deliberately not restated ────────
--
-- There is NO `grant` in this file, and that is correct rather than an
-- omission. Production carries ALTER DEFAULT PRIVILEGES in schema public for
-- both postgres and supabase_admin, granting arwdDxtm on new TABLES to anon,
-- authenticated and service_role. Measured on production 2026-10-08:
--   pg_default_acl (public, relkind r) -> anon=arwdDxtm, authenticated=arwdDxtm,
--                                        service_role=arwdDxtm
--   case_decisions relacl             -> exactly that, granted by nobody
-- So this table is granted the same way every other table in this schema was,
-- and adding a hand-written grant would only create a second, divergent story.
--
-- THE CONSEQUENCE, STATED BECAUSE IT IS INVISIBLE: `anon` receives DML
-- privileges on this table, so RLS is the ONLY barrier in front of an
-- unauthenticated caller. That is the standing posture of every table here, not
-- something B2 introduces — but it is why the policies in §5/§6 are written to
-- fail closed for a NULL auth.uid() rather than to assume a logged-in caller.
-- Tested against a branch whose ACL was first made identical to production's
-- (probes AN-01..AN-08): anon holds the privilege and still reads 0 rows,
-- its INSERT is refused 42501 by the restrictive policy, its UPDATE and DELETE
-- match 0 rows, and neither trigger function is executable by anon OR
-- authenticated — so no /rest/v1/rpc/ surface is created (the cross-tenant
-- existence oracle B1 had to eliminate is not reintroduced here).
--
-- The function-level `revoke` statements above ARE restated rather than
-- inherited, because the default privileges grant EXECUTE on new FUNCTIONS to
-- anon and authenticated, and for these two functions that default is wrong.


-- ── 7. Re-parenting: freeze allegations.case_id ────────────────────────────
--
-- The requirement is that revision records preserve their original case and
-- organisation attribution, and that reassignment across cases or tenants is
-- prevented — but only after establishing whether a legitimate reassignment
-- workflow exists. It does not, and that was checked rather than assumed:
--
--   * `patchAllegation` (src/App.jsx) is the only mutation path, and every one
--     of its call sites passes exactly one of five fields —
--     {decisionReasoning}, {employeeResponse}, {investigatorFinding},
--     {outstandingUncertainty}, {witnessEvidence}. None passes caseId.
--   * `addAllegation` (src/lib/allegations.js) sets caseId once, at creation.
--   * `saveAllegationToDB` upserts `case_id: allegation.caseId` — always the
--     unchanged value, so freezing it changes nothing for the live app.
--   * No UI, API route or script moves an allegation between cases.
--
-- Meanwhile `allegations.case_id` is currently mutable, and
-- sync_allegations_org_id_trigger would obligingly rewrite org_id to follow it.
-- RLS confines that to cases the caller can already see (the FOR ALL policy's
-- USING tests the old case and WITH CHECK the new one), so this is not a
-- cross-tenant hole today — but within one tenant an allegation, and with it
-- the revision history attached to its id, can be relocated to a different
-- case.
--
-- protect_immutable_columns() is the established helper for exactly this
-- (privilege_tenant_ownership_invariant_2026-08-25.sql; already applied to
-- hr_review_requests for 'requested_by', 'org_id', 'case_id'). It compares with
-- `is distinct from`, so the unchanged value a full-row upsert sends is a no-op,
-- and it exempts service_role, matching the rest of the schema.
--
-- Revision rows are independently protected regardless: their own case_id and
-- org_id are captured at write time and are immutable under §6, so already
-- recorded history cannot be relocated even if an allegation could be.
create trigger protect_allegations_case_attribution_trg
  before update on public.allegations
  for each row
  execute function public.protect_immutable_columns('case_id');


-- ── 8. What is NOT here, on purpose ────────────────────────────────────────
--
-- NO RETENTION RULE AND NO PURGE. Per the B2 decision (A3), no arbitrary
-- retention period is introduced and nothing automatically deletes from this
-- table. retention is recorded as NOT_ENFORCED in
-- src/lib/dataClassification.js, which is the truthful value for every table in
-- this schema (nothing anywhere reads organisations.data_retention_years).
--
-- ┌─ THE RETENTION POSITION, AS DECIDED (Stage 4 approval, 2026-10-09) ──────┐
-- │ Superseded investigation narratives are preserved as RESTRICTED CASE     │
-- │ RECORDS. Three things follow, and the third is the one that is easy to   │
-- │ lose:                                                                     │
-- │                                                                           │
-- │ 1. NO AUTOMATIC DELETION. Nothing in this migration, and nothing in the   │
-- │    application, removes a revision on a timer. Erasure happens only with  │
-- │    the parent case or organisation.                                       │
-- │                                                                           │
-- │ 2. INDEFINITE RETENTION IS NOT THE SETTLED POLICY. What ships here is the │
-- │    absence of a schedule, which is NOT the same as a decision to keep     │
-- │    this data forever, and must not be cited as one. The retention         │
-- │    SCHEDULE for this category remains an OUTSTANDING GOVERNANCE           │
-- │    DEPENDENCY, owned outside this migration.                              │
-- │                                                                           │
-- │ 3. EXISTING OBLIGATIONS CONTINUE TO APPLY UNCHANGED — legal hold, the     │
-- │    access-control boundary in §5, and DSAR human-review before any        │
-- │    superseded wording is released (src/lib/dsarCompile.js emits metadata  │
-- │    and review flags, never the text). This table does not create an       │
-- │    exception to any of them, and a future retention schedule must be      │
-- │    written to respect legal hold rather than to override it.              │
-- │                                                                           │
-- │ Deleting this data is deliberately HARD, not merely undone: see §6, where │
-- │ the service-role escape hatch was removed. Any future purge mechanism is  │
-- │ therefore a reviewed migration, not a configuration change.               │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- NO UI. Nothing reads this table yet. Capture is independent of presentation,
-- and a history nobody can read is still a history that exists — exposing it is
-- a later, separately reviewed change.
--
-- NO BACKFILL. The 55/14/1 populated narratives have no recorded previous
-- state, and inventing one would fabricate history. Revision capture begins at
-- deployment, and the absence of rows before that date means "not recorded",
-- not "never changed".
