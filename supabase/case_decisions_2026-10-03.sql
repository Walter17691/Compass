-- ============================================================================
-- WAVE D4.2 — authoritative case decision history foundation — 2026-10-03
-- ============================================================================
-- HOW TO APPLY: paste into the Supabase SQL Editor and run, in this order. The
-- backfill is deliberately inside this file and deliberately BEFORE the
-- append-only guard, because the guard would otherwise refuse it (see §6).
--
-- ADDITIVE AND BEHAVIOUR-PRESERVING. Nothing reads this table yet. Current
-- Warnings, caseStage, nextStep, the appeal workflow, OutcomeModal and the
-- Employee File all still read and write cases.* exactly as before. There is NO
-- dual write and NO trigger copying one to the other — see §8 for why a
-- consistency trigger was considered and rejected.
--
-- ┌─ WHAT THIS DOES NOT DO ─────────────────────────────────────────────────┐
-- │ NO cutover. cases.outcome remains the compatibility projection.          │
-- │ NO appeal decision rows. The 37 allegation-level not_upheld records are   │
-- │   NOT decisions: not_upheld means the original stands, and no case-level  │
-- │   revised sanction exists anywhere in production to record.               │
-- │ NO invented provenance. 135 of 137 decision dates and all 137            │
-- │   decision-makers stay NULL because production does not know them.        │
-- │ NO manufactured warning expiry. 85 of 87 warnings have none; they keep    │
-- │   none.                                                                  │
-- │ NO cases.org_id NOT NULL conversion. NO identity reconciliation.          │
-- │ NO retention enforcement. NO change to Wave 0 disclosure behaviour.       │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- PRE-MIGRATION CENSUS, re-confirmed read-only against production 2026-10-03
-- immediately before this file was written:
--   cases                                  2,960
--   cases with NULL org_id                      0
--   duplicate (id, org_id) pairs                0
--   outcome-bearing cases                     137
--   outcome-bearing cases with NULL org_id      0
--   cases.employee_id populated                 0
--   public.case_decisions                  absent
--   cases constraints                      cases_pkey PRIMARY KEY (id) only —
--                                          NO unique (id, org_id)
--   outcome_issued_at populated                 2
--   warning_expires_at populated                2
--   warning_duration_months populated           2
--   outcome_notes populated                     0
--   disciplinary_decided_by populated           0
-- Outcome vocabulary live: 'Final written warning' 84, 'No further action' 31,
--   'Dismissal with notice' 18, 'First written warning' 3, and ONE stray —
--   'First written warning issued' (1).
-- ============================================================================


-- ── 1. cases composite identity ─────────────────────────────────────────────
--
-- Postgres requires a unique constraint matching a composite FK's referenced
-- column list. A PRIMARY KEY on (id) alone is NOT sufficient, and this is not a
-- guess: employee_records already carries BOTH employee_records_pkey PRIMARY KEY
-- (id) AND employee_records_id_org_key UNIQUE (id, org_id), added precisely so
-- meetings/employee_activities/employee_employment_events could declare their
-- same-org composite FKs. This is the same move for cases.
--
-- Safe by construction: id is the primary key, so (id, org_id) is unique for any
-- value of org_id. Verified anyway — 0 duplicate pairs across 2,960 rows.
--
-- ┌─ MATCH SIMPLE, STATED PLAINLY ──────────────────────────────────────────┐
-- │ cases.org_id is NULLABLE and this migration does NOT change that. Under  │
-- │ the default MATCH SIMPLE, a child row whose composite FK contains a NULL │
-- │ in ANY column is not checked at all. So a case_decisions row with a NULL │
-- │ org_id would escape the same-org guarantee entirely.                     │
-- │                                                                          │
-- │ That gap is closed on the CHILD side instead, where it can be closed     │
-- │ without touching 2,960 historical rows: case_decisions.org_id is NOT     │
-- │ NULL. A new decision therefore cannot exploit the nullable parent.        │
-- │ Production currently has 0 cases with NULL org_id, so nothing is         │
-- │ unenforced today — but the constraint is what makes that durable rather  │
-- │ than lucky.                                                              │
-- └─────────────────────────────────────────────────────────────────────────┘
alter table public.cases
  add constraint cases_id_org_key unique (id, org_id);

comment on constraint cases_id_org_key on public.cases is
  'Wave D4.2. Exists so child tables can declare same-org composite foreign keys (case_id, org_id) -> cases(id, org_id). Redundant for uniqueness (id is the PK); required by Postgres for the composite reference.';


-- ── 2. The decision history ────────────────────────────────────────────────
--
-- One row per DECISION EVENT. An appeal that varies a sanction is a new row
-- that supersedes the original; the original is never rewritten. That is the
-- whole point: cases.outcome can only ever hold the current position, which is
-- why "what was it varied FROM" is unanswerable today.
create table public.case_decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  case_id uuid not null,

  -- 'original' | 'appeal'. Only two, because only two exist: a first decision,
  -- and a decision taken on appeal. No 'revised' type — a revision IS an appeal
  -- decision, and inventing a third would make two spellings of one event.
  decision_type text not null,

  -- The sanction, from the six values OutcomeModal actually offers, plus
  -- 'legacy_unmapped' for historical rows only (see §4).
  outcome text not null,
  -- Set ONLY for legacy_unmapped: the exact historical string, preserved
  -- verbatim so nothing is reinterpreted or lost.
  outcome_source_text text,
  outcome_notes text,

  warning_duration_months integer,
  warning_expires_at date,

  -- What an appeal DID to the decision it supersedes. Deliberately separate
  -- from `outcome`: the effect and the sanction are different facts, and
  -- collapsing them is what makes "varied to what?" unanswerable.
  appeal_effect text,
  supersedes_decision_id uuid,

  -- NULL on historical rows where production does not know. Never invented.
  decided_at timestamptz,
  decided_by uuid references auth.users(id),

  -- COMMUNICATION IS NOT RECORDING. Populated only when Compass can establish a
  -- send authoritatively; NULL on every historical row. Drafting, saving,
  -- approving or downloading a letter is NOT communication.
  communicated_at timestamptz,
  communicated_via text,

  created_at timestamptz not null default now(),

  -- ── tenancy and parentage in ONE declaration (NEW-44D) ──
  -- A bare case_id -> cases(id) beside an unrelated org_id would permit a
  -- decision in org A against a case in org B. The composite form makes that
  -- unrepresentable, with no trigger and nothing to remember. NEW-44D's
  -- corpus-derived gate recognises this shape automatically.
  constraint case_decisions_case_same_org_fkey
    foreign key (case_id, org_id) references public.cases(id, org_id)
    on delete cascade,
  constraint case_decisions_org_fkey
    foreign key (org_id) references public.organisations(id) on delete cascade,

  -- Needed by the self-referential composite FK below.
  constraint case_decisions_id_org_case_key unique (id, org_id, case_id),

  -- ── supersession integrity, in the database ──
  -- The superseded decision must be in the SAME organisation AND the SAME case.
  -- A plain uuid column would have allowed a decision to supersede another
  -- case's history, or another tenant's. This makes both unrepresentable rather
  -- than merely discouraged. MATCH SIMPLE means a NULL
  -- supersedes_decision_id skips the check, which is exactly right for an
  -- original decision.
  constraint case_decisions_supersedes_same_case_fkey
    foreign key (supersedes_decision_id, org_id, case_id)
    references public.case_decisions(id, org_id, case_id)
    on delete restrict,
  constraint case_decisions_not_self_superseding
    check (supersedes_decision_id is distinct from id),

  -- ── vocabulary ──
  constraint case_decisions_type_valid
    check (decision_type in ('original', 'appeal')),

  -- The six values OutcomeModal offers, verified against
  -- src/screens/OutcomeModal.jsx's own <option> list, plus the legacy escape.
  constraint case_decisions_outcome_valid check (outcome in (
    'No further action',
    'First written warning',
    'Final written warning',
    'Demotion',
    'Dismissal with notice',
    'Summary dismissal (gross misconduct)',
    'legacy_unmapped'
  )),

  -- legacy_unmapped MUST carry its original string, and nothing else may. So a
  -- legacy row can never lose its provenance, and a normal decision can never
  -- smuggle a free-text sanction in beside a constrained one.
  constraint case_decisions_legacy_provenance check (
    (outcome = 'legacy_unmapped' and outcome_source_text is not null)
    or (outcome <> 'legacy_unmapped' and outcome_source_text is null)
  ),

  constraint case_decisions_appeal_effect_valid
    check (appeal_effect is null or appeal_effect in ('unchanged', 'varied', 'overturned')),

  -- An original decision supersedes nothing and has no appeal effect.
  constraint case_decisions_original_shape check (
    decision_type <> 'original'
    or (supersedes_decision_id is null and appeal_effect is null)
  ),
  -- An appeal decision must say what it replaced AND what it did to it.
  -- Without this an appeal row could exist that neither supersedes anything nor
  -- records an effect — a second head claiming to be an appeal.
  constraint case_decisions_appeal_shape check (
    decision_type <> 'appeal'
    or (supersedes_decision_id is not null and appeal_effect is not null)
  ),

  -- Matches cases_warning_duration_months_check exactly, so the two cannot
  -- drift on what a valid warning length is.
  constraint case_decisions_warning_duration_check check (
    warning_duration_months is null
    or (warning_duration_months > 0 and warning_duration_months <= 60)
  ),

  -- A communication has both a time and a mechanism, or neither. "Communicated,
  -- somehow" is not a fact worth storing.
  constraint case_decisions_communication_consistent check (
    (communicated_at is null and communicated_via is null)
    or (communicated_at is not null and communicated_via is not null)
  ),

  -- ┌─ ONE value, and the audit's second one was REJECTED ──────────────────┐
  -- │ The D4 audit proposed 'signature_request' and 'tracked_send'. Only the │
  -- │ first is real. api/signing.js creates signing_requests rows, so a      │
  -- │ signature request leaves durable evidence in the database.             │
  -- │                                                                        │
  -- │ 'tracked_send' would derive from meeting.letterTracking, and           │
  -- │ src/lib/dsarCaseDisclosure.js states in its own comment that           │
  -- │ "letterTracking is populated nowhere" — confirmed: the only writes are │
  -- │ `letterTracking: {}` in App.jsx. api/send-letter.js emails via Resend  │
  -- │ and persists NOTHING. integration_events is written only by calendar   │
  -- │ operations. So a tracked send is a column nobody fills, and declaring  │
  -- │ it would be declaring a capability Compass does not have.              │
  -- │                                                                        │
  -- │ Add a value when a mechanism that persists evidence exists — not       │
  -- │ before.                                                                │
  -- └───────────────────────────────────────────────────────────────────────┘
  constraint case_decisions_communicated_via_valid
    check (communicated_via is null or communicated_via in ('signature_request'))
);

-- ── 3. ONE current head per case, enforced by the database ──────────────────
--
-- The architecture says "latest non-superseded decision = current authoritative
-- position". Two indexes make a second head unrepresentable, with no trigger
-- and no reliance on UI behaviour:
--
--   (a) at most ONE successor per decision
--   (b) at most ONE original per case
--
-- Why that is sufficient. Every appeal supersedes exactly one decision
-- (case_decisions_appeal_shape). By (a) every decision has at most one
-- successor. By (b) exactly one decision per case supersedes nothing. So the
-- decisions for a case form a single path, and a path has exactly one node that
-- nobody supersedes — the head.
--
-- THE RACE THIS KILLS, which is the one the brief names:
--   original A exists
--   User 1: insert appeal B superseding A
--   User 2: insert appeal C superseding A, concurrently
-- The second insert violates (a) and fails with 23505. It is decided by the
-- database at commit time, not by whoever rendered a screen last, and the loser
-- gets a unique-violation rather than silently creating a rival head.
create unique index case_decisions_one_successor_idx
  on public.case_decisions (supersedes_decision_id)
  where supersedes_decision_id is not null;

create unique index case_decisions_one_original_per_case_idx
  on public.case_decisions (case_id)
  where decision_type = 'original';

-- Reading the history of one case, newest first.
create index case_decisions_case_idx
  on public.case_decisions (case_id, created_at desc);
-- Finding the head without scanning: the rows nobody supersedes.
create index case_decisions_org_case_type_idx
  on public.case_decisions (org_id, case_id, decision_type);

comment on table public.case_decisions is
  'Wave D4.2. Authoritative decision-history events for a case. APPEND-ONLY: an appeal that varies a sanction is a NEW row superseding the original, never an edit. cases.outcome remains the compatibility projection and nothing reads this table yet. decided_at/decided_by are NULL on historical rows where production does not know them, and are never inferred.';
comment on column public.case_decisions.decision_type is
  'original | appeal. Exactly one original per case (enforced by a partial unique index); an appeal must supersede exactly one decision and record its effect.';
comment on column public.case_decisions.outcome is
  'One of OutcomeModal''s six values, or legacy_unmapped for historical rows whose stored string was outside that vocabulary. legacy_unmapped MUST carry outcome_source_text and is refused for application writes at the domain boundary (src/lib/caseDecisions.js).';
comment on column public.case_decisions.outcome_source_text is
  'The exact historical outcome string, preserved verbatim, for legacy_unmapped rows only. Production holds one: "First written warning issued", a CSV-template artefact (see NEW-44/D4.1).';
comment on column public.case_decisions.appeal_effect is
  'unchanged | varied | overturned, or NULL where not applicable. Deliberately separate from outcome: the effect of an appeal and the sanction it leaves in place are different facts.';
comment on column public.case_decisions.communicated_at is
  'When the decision was authoritatively communicated to the employee. NULL on every historical row. Drafting, saving, approving or downloading a letter is NOT communication.';
comment on column public.case_decisions.communicated_via is
  'signature_request only. tracked_send was rejected: letterTracking is populated nowhere in the product, and api/send-letter.js persists no evidence of a send.';


-- ── 4. BACKFILL — one original decision per outcome-bearing case ────────────
--
-- Runs BEFORE the append-only guard below, which would otherwise refuse it.
-- That ordering is deliberate and is the whole reason this is one file.
--
-- Deterministic and total: every value is copied or left NULL. Nothing is
-- derived, inferred, defaulted to "now", or normalised.
--
--   outcome                 exact value where it is one of the six; otherwise
--                           'legacy_unmapped' with the original string kept in
--                           outcome_source_text
--   outcome_notes           copied (0 populated in production)
--   warning_duration_months copied (2)
--   warning_expires_at      copied (2)
--   decided_at              outcome_issued_at ONLY where present (2); else NULL
--   decided_by              disciplinary_decided_by ONLY where present (0);
--                           else NULL
--   communicated_at/via     NULL, always
--   appeal_effect           NULL — an original decision has no appeal effect
--   supersedes_decision_id  NULL — it supersedes nothing
insert into public.case_decisions (
  org_id, case_id, decision_type, outcome, outcome_source_text, outcome_notes,
  warning_duration_months, warning_expires_at, appeal_effect,
  supersedes_decision_id, decided_at, decided_by, communicated_at, communicated_via
)
select
  c.org_id,
  c.id,
  'original',
  case when c.outcome in (
    'No further action', 'First written warning', 'Final written warning',
    'Demotion', 'Dismissal with notice', 'Summary dismissal (gross misconduct)'
  ) then c.outcome else 'legacy_unmapped' end,
  case when c.outcome in (
    'No further action', 'First written warning', 'Final written warning',
    'Demotion', 'Dismissal with notice', 'Summary dismissal (gross misconduct)'
  ) then null else c.outcome end,
  nullif(trim(c.outcome_notes), ''),
  c.warning_duration_months,
  c.warning_expires_at,
  null,
  null,
  c.outcome_issued_at,
  c.disciplinary_decided_by,
  null,
  null
from public.cases c
where nullif(trim(c.outcome), '') is not null
  and c.org_id is not null;


-- ── 5. Row level security — INHERITED from the case, never from org alone ──
--
-- A bare `org_id in (select my_org_ids())` would hand every org member every
-- decision, destroying L1/L2/L3, case_access grants and confidential-case
-- protection in one line. Instead this uses the pattern
-- allegations_case_tasks_authoritative_case_access_2026-09-05.sql established
-- and that the three-level access model's security review confirmed live: a
-- bare EXISTS against public.cases.
--
-- The subquery is itself subject to cases' OWN seven policies, so a decision is
-- visible exactly when its case is visible — L1, L2-as-creator, explicit
-- case_access grant, confidential-case rules and revocation all come for free
-- and cannot drift from the parent.
--
-- RECURSION: checked, as that migration's header instructs. cases' own policies
-- reference org_members, case_access and the SECURITY DEFINER helpers — never
-- case_decisions. One-directional, no cycle.
alter table public.case_decisions enable row level security;

create policy "Decisions are visible with the case they belong to"
  on public.case_decisions
  for select
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_decisions.case_id
    )
  );

-- ── 6. Write authority — the same test as setting the case outcome ─────────
--
-- Mirrors protect_case_hr_only_columns() exactly, read from the live function
-- rather than reinvented: HR in THIS case's organisation, or THIS case's
-- disciplinary officer. A general case reader — Investigator, Line Manager,
-- Location Manager, Legal/Compliance Reviewer, Auditor — can SELECT a decision
-- and cannot create one. Being able to read a decision is not authority to make
-- one.
--
-- The case must also be visible to the caller: the EXISTS on cases is evaluated
-- under cases' own RLS, so an authorised HR user still cannot insert a decision
-- against a case they cannot access.
create policy "Only HR or the case's disciplinary officer may record a decision"
  on public.case_decisions
  for insert
  with check (
    exists (
      select 1 from public.cases c
      where c.id = case_decisions.case_id
        and c.org_id = case_decisions.org_id
    )
    and (
      exists (
        select 1 from public.org_members m
        where m.org_id = case_decisions.org_id
          and m.user_id = auth.uid()
          and public.is_hr_role(m.role)
      )
      or exists (
        select 1 from public.case_access ca
        where ca.case_id = case_decisions.case_id
          and ca.user_id = auth.uid()
          and ca.role = 'disciplinary_officer'
      )
    )
  );

-- NO update policy and NO delete policy, deliberately. With RLS enabled and no
-- permissive policy for a command, that command is denied for every non-bypass
-- role. This is half of append-only; the trigger below is the other half,
-- because a future migration could add an UPDATE policy without anyone noticing
-- that it had unlocked decision history.


-- ── 7. Append-only, and provenance that cannot be forged ───────────────────
--
-- Two guarantees in one trigger function, both at the database boundary:
--
--   APPEND-ONLY  no UPDATE and no DELETE of a decision event by any ordinary
--                caller. A revised position is another row.
--   PROVENANCE   decided_by is FORCED to auth.uid() on insert, so a client
--                cannot attribute a decision to someone else, and decided_at
--                is REQUIRED, so a new decision cannot be undated.
--
-- WHY A TRIGGER AS WELL AS RLS. RLS already denies UPDATE/DELETE. The trigger
-- survives someone adding a policy later, and it is where provenance is
-- actually enforced — a WITH CHECK can test a value but cannot replace it.
--
-- THE PRIVILEGED PATH, kept open on purpose. Backfill, rollback and service
-- maintenance must remain possible, so the service role and the migration
-- superuser are exempt. Everything else is not.
create or replace function public.case_decisions_append_only_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  privileged boolean := coalesce(auth.role(), '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin');
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
    -- Historical provenance belongs to the backfill alone.
    if new.outcome = 'legacy_unmapped' then
      raise exception 'legacy_unmapped is a historical marker and cannot be chosen as a decision outcome.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger case_decisions_append_only_trg
  before insert or update or delete on public.case_decisions
  for each row execute function public.case_decisions_append_only_guard();

comment on function public.case_decisions_append_only_guard() is
  'Wave D4.2. Append-only decision history: no UPDATE or DELETE by an ordinary caller, decided_by forced to auth.uid() on insert, decided_at required for new decisions, and legacy_unmapped refused for application writes. The service role and the migration superuser are exempt so backfill and rollback remain possible.';


-- ============================================================================
-- ROLLBACK (complete, and low-risk because no reader depends on this table)
-- ============================================================================
--   drop trigger if exists case_decisions_append_only_trg on public.case_decisions;
--   drop function if exists public.case_decisions_append_only_guard();
--   drop table if exists public.case_decisions;          -- drops its policies,
--                                                        -- indexes and constraints
--   alter table public.cases drop constraint if exists cases_id_org_key;
--
-- Nothing in cases is altered by this migration beyond ADDING that one unique
-- constraint, so rollback cannot touch outcome data. Dropping the table discards
-- the 137 backfilled rows, which are a derived projection of cases.outcome and
-- can be recreated by re-running section 4.
-- ============================================================================
