-- ============================================================================
-- Phase 4C.1 — standalone meeting persistence + security foundation — 2026-09-25
-- ============================================================================
-- NOT YET APPLIED. Held for pre-deploy review per the established Compass
-- convention for schema/security changes.
--
-- WHY THIS EXISTS. Compass can only persist a meeting by mutating the parent
-- case row: every meeting today is a JSONB object inside cases.meetings, and
-- every write path is saveCases(nextCases, caseId) -> saveCaseToDB(case). So a
-- legitimate standalone meeting — an informal 1-1, a return-to-work
-- conversation, fact-finding before anyone knows what process will follow — has
-- nothing to be written onto. Phase 4B made that refusal honest and early
-- ("Compass can't save one on its own yet"); this migration supplies the
-- missing substrate.
--
-- THE ARCHITECTURAL DECISION (Phase 4C audit, approved 2026-09-25 — Approach C).
-- Parentage becomes a NULLABLE COLUMN rather than containment. That single
-- change is what makes late linking an UPDATE instead of a move:
--
--     If parentage is a column, linking is an UPDATE.
--     If parentage is containment, linking is a MOVE.
--
-- A move is a copy and a recreate however carefully it is written, and the
-- approved contract requires the same row, the same id, and untouched history
-- across a link. Hence a column.
--
-- WHAT THIS IS NOT.
--   * NOT a migration of the 884 legacy embedded meetings. They stay in
--     cases.meetings, readable, unchanged, forever.
--   * NOT a new home for case-linked meetings. Meetings BORN in a case stay
--     embedded; only meetings born standalone live here, and they stay here for
--     life — including after they are linked.
--   * NOT a second lifecycle. status uses the existing meetingLifecycle.js
--     vocabulary verbatim.
--   * NOT dual-write. Every meeting has exactly ONE authoritative home. See
--     lib/meetingStore.js, which enforces that cases.meetings can never receive
--     a table-resident meeting.
--
-- PRECEDENT, NOT INVENTION. public.case_tasks has done exactly this in
-- production since Phase 6: case_id uuid NULL, org_id uuid NOT NULL, id TEXT,
-- 1,457 rows of which 11 are caseless. The optionally-case-linked org-scoped
-- entity is an established Compass pattern. Its RLS, however, is deliberately
-- NOT copied — see the RLS section.
-- ============================================================================


-- ── 1. The fossil ───────────────────────────────────────────────────────────
-- A public.meetings table already exists and has never been used: 0 rows, and
-- zero `.from('meetings')` references in src/ or api/. baseline_schema_
-- 2026-08-06.sql:182 annotates it itself — "dead table as of this snapshot …
-- Likely an earlier normalized design that was abandoned; src/db.js (deleted in
-- this same cleanup pass) assumed this table's shape."
--
-- Its shape cannot be adopted: transcript is `text` where the live transcript is
-- an array of {speaker,text} objects, and it has no org_id, no status, no
-- review_draft, no schedule, no created_by. Its single RLS policy is provably
-- unreachable — "Own meetings" keys off cases.user_id = auth.uid(), and all
-- 2,960 production cases have user_id NULL (a vestigial column; the app scopes
-- by org_id/created_by). It matches zero rows for every user.
--
-- RENAMED, NOT DROPPED. Renaming is reversible and costs nothing on an empty
-- table; dropping buys nothing and discards the rollback.
alter table public.meetings rename to meetings_legacy_unused;
alter policy "Own meetings" on public.meetings_legacy_unused rename to "Own meetings (legacy unused table)";


-- ── 2. The canonical standalone meeting ─────────────────────────────────────
create table public.meetings (
  -- TEXT, not uuid. 854 of the 890 historical embedded meeting ids are bare
  -- millisecond timestamps (e.g. "1786221627942") and only 36 are the current
  -- collision-safe meeting_<uuid4> form. A uuid primary key would permanently
  -- foreclose ever migrating a legacy meeting without reassigning its id — which
  -- would break the no-recreation principle for any future phase. case_tasks.id
  -- is text for the same reason.
  --
  -- New rows are minted by lib/ids.js newId('meeting'). Never Date.now().
  id text primary key,

  -- Tenancy. NOT NULL and enforced in EVERY RLS branch, so a caseless row can
  -- never fall outside an organisation. The fossil table had no org_id at all,
  -- which is why a case_id IS NULL row could not have been secured on it.
  org_id uuid not null references public.organisations(id),

  -- Parentage. NULL = standalone. The transition NULL -> value is a FILL and is
  -- permitted; value -> NULL and value -> other value are prohibited. Enforced
  -- by the trigger below, not by convention.
  --
  -- ON DELETE CASCADE deliberately matches what embedded meetings already do:
  -- deleting a case today erases the meetings inside it. ON DELETE SET NULL was
  -- considered and rejected — it would silently convert a case-linked meeting
  -- back into a standalone one, which is exactly the prohibited direction.
  case_id uuid references public.cases(id) on delete cascade,

  -- The stable registry id from constants.js MEETING_TYPES ("informal"), never
  -- the human label ("Informal / 1-1"). Embedded meetings store the label in
  -- m.type and readers reverse-map by label; that is a legacy shape this table
  -- deliberately does not inherit, because a CHECK constraint needs something
  -- stable to bite on and a display label is not stable.
  meeting_type_id text not null,

  -- The existing lifecycle vocabulary, verbatim from meetingLifecycle.js.
  status text not null,

  employee_name text,
  employee_email text,
  -- Free-text display name, matching the embedded `manager` field.
  manager text,
  -- The user who actually chaired. Appeal hearings can never be born here (see
  -- the type CHECK), so this carries no appeal-integrity duty — it exists so a
  -- standalone meeting can record a chair distinct from its creator, and so the
  -- creator/chair RLS branch has something to key on.
  chair_user_id uuid,

  -- Named participants are METADATA, not an access grant. Nothing in the RLS
  -- below reads this column. Being named in a meeting must never confer the
  -- ability to read it.
  participants jsonb not null default '[]'::jsonb,

  transcript jsonb not null default '[]'::jsonb,
  -- Employee-facing record only. Internal analysis stays in advisor_notes,
  -- preserving the NEW-39 boundary (lib/meetingRecordSections.js) at rest.
  record text,
  advisor_notes text,
  summary text,
  risk jsonb,
  -- The Phase 3B persisted draft, shape owned by lib/reviewDraft.js.
  review_draft jsonb,
  -- { date, time, method } — authoritative scheduling, per Phase 2.3.
  schedule jsonb,
  -- { provider, eventId, events, syncedAt } — what was actually BOOKED.
  calendar jsonb,
  -- agenda / prepQuestions.
  preparation jsonb,
  next_steps jsonb,

  -- NOTE ON INVITATION TRUTH — deliberately ABSENT.
  -- The Phase 4C audit found that the embedded `invitation` field is initialised
  -- to null at App.jsx:6651, read at CaseViewScreen.jsx:829, and NEVER WRITTEN
  -- by anything. Real invitation truth lives as a SEPARATE letter-shaped entry
  -- in cases.meetings carrying letterType:'invite', hearingDate, hearingTime,
  -- hearingLocationOrMethod (App.jsx:7945-7955), selected by
  -- appealInvitation.js:36-50. Adding a peer `invitation` jsonb column here
  -- because it would be tidier would fabricate a model the application does not
  -- have. How invitation truth attaches to a table-resident meeting is resolved
  -- in 4C.4, which owns Schedule/Prepare.

  started_at timestamptz,
  ended_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancelled_reason text,

  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Stamped by the trigger at the moment of the permitted NULL -> value fill.
  -- These are the audit of parentage, and they are why "when was this linked?"
  -- has an answer at the row level and not only in audit_log.
  linked_at timestamptz,
  linked_by uuid,

  -- APPEAL SECURITY + TYPE ELIGIBILITY, at the database.
  --
  -- Appeal-chair integrity is enforced by a trigger on public.cases that diffs
  -- new.meetings against old.meetings (appeal_hearing_chair_integrity_
  -- 2026-09-18.sql). A meeting living in THIS table is invisible to that
  -- trigger. So if an appeal hearing could ever be born here, it would be a
  -- route around a database-level security guarantee — silently, with no error.
  --
  -- The approved standalone set (informal, return, investigation) is disjoint
  -- from the appeal set, so the architecture is safe by construction. This
  -- constraint makes it safe by ENFORCEMENT, so no future code path can create
  -- an appeal meeting here. CASE_REQUIRED types (disciplinary, the three
  -- appeals, the four redundancy types) and DEFERRED types (formal, grievance)
  -- and the SPECIAL dev group are all excluded by the same allow-list.
  constraint meetings_standalone_type_only
    check (meeting_type_id in ('informal', 'return', 'investigation')),

  constraint meetings_status_valid
    check (status in ('scheduled', 'in_progress', 'review_draft', 'completed', 'cancelled')),

  -- Link stamps cannot exist without a link.
  constraint meetings_link_stamps_require_case
    check (case_id is not null or (linked_at is null and linked_by is null))
);

comment on table public.meetings is
  'Phase 4C canonical store for meetings BORN standalone. A row stays here for life, including after case_id is filled. Historical meetings remain embedded in cases.meetings and are never migrated here. Exactly one authoritative home per meeting — see lib/meetingStore.js.';
comment on column public.meetings.case_id is
  'NULL = standalone. NULL -> value is a permitted explicit link (4C.5); value -> NULL and value -> other value are prohibited by meetings_parentage_guard().';
comment on column public.meetings.participants is
  'Metadata only. Never read by RLS. Being named in a meeting does not grant access to it.';

create index meetings_org_status_idx on public.meetings (org_id, status);
create index meetings_case_idx on public.meetings (case_id) where case_id is not null;
create index meetings_org_creator_idx on public.meetings (org_id, created_by);
-- DSAR compiles by employee name (lib/dsarCompile.js), so that lookup needs to
-- be indexed from the start rather than after it becomes slow.
create index meetings_org_employee_idx on public.meetings (org_id, employee_name);


-- ── 3. Parentage immutability + birth-standalone, as a trigger ──────────────
-- A trigger, not an RLS policy, because RLS is not evaluated for the table
-- owner or the service role. The parentage contract is a data-integrity
-- invariant and must hold regardless of who is connected — the same reasoning
-- that put appeal-chair integrity in a trigger rather than in the client.
create or replace function public.meetings_parentage_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_org uuid;
begin
  if tg_op = 'INSERT' then
    -- Born standalone, always. A meeting that belongs to a case from the outset
    -- belongs in cases.meetings, which is where the existing Phase 2/3
    -- machinery (and the appeal-chair trigger) can see it.
    if new.case_id is not null then
      raise exception 'A meeting cannot be created already linked to a case (id %). Meetings born in a case belong in cases.meetings.', new.id
        using errcode = 'check_violation';
    end if;
    new.linked_at := null;
    new.linked_by := null;
    return new;
  end if;

  -- UPDATE from here on.

  -- Identity and tenancy are fixed for life. Without this, "same meeting id" is
  -- a convention rather than a guarantee.
  if new.id <> old.id then
    raise exception 'A meeting id cannot be changed (% -> %).', old.id, new.id using errcode = 'check_violation';
  end if;
  if new.org_id <> old.org_id then
    raise exception 'A meeting cannot move between organisations (meeting %).', old.id using errcode = 'check_violation';
  end if;
  if new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'created_by/created_at are immutable (meeting %).', old.id using errcode = 'check_violation';
  end if;

  if old.case_id is null and new.case_id is not null then
    -- THE PERMITTED FILL. Same row, same id, nothing copied.
    --
    -- Cross-organisation parentage is impossible: the target case must be in
    -- the same org as the meeting. Checked here as well as in RLS because RLS
    -- does not run for every role, and a meeting in Org A linked to a case in
    -- Org B would be a tenancy breach, not merely a bad link.
    select c.org_id into target_org from public.cases c where c.id = new.case_id;
    if target_org is null then
      raise exception 'Cannot link meeting % to a case that does not exist.', old.id using errcode = 'foreign_key_violation';
    end if;
    if target_org <> new.org_id then
      raise exception 'Cannot link meeting % (org %) to a case in a different organisation (org %).', old.id, new.org_id, target_org
        using errcode = 'check_violation';
    end if;
    new.linked_at := coalesce(new.linked_at, now());
    new.linked_by := coalesce(new.linked_by, auth.uid());

  elsif old.case_id is not null and new.case_id is null then
    -- Prohibited. Unlinking would narrow access to a record HR has already seen
    -- and may have acted on, and would remove a meeting a case's own outcome
    -- may already cite.
    raise exception 'A case-linked meeting cannot be returned to standalone (meeting %).', old.id using errcode = 'check_violation';

  elsif old.case_id is not null and new.case_id <> old.case_id then
    -- Prohibited. The record may already be cited in the current case's issued
    -- outcome. Any correction mechanism must be explicit and audited, and must
    -- leave the original link visible — it is separate work, not this UPDATE.
    raise exception 'A meeting cannot be moved between cases (meeting %, case % -> %).', old.id, old.case_id, new.case_id
      using errcode = 'check_violation';

  elsif old.case_id is not null then
    -- Unchanged parentage. Link stamps are historical fact.
    if new.linked_at is distinct from old.linked_at or new.linked_by is distinct from old.linked_by then
      raise exception 'Link provenance is immutable once set (meeting %).', old.id using errcode = 'check_violation';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger meetings_parentage_guard_trg
  before insert or update on public.meetings
  for each row execute function public.meetings_parentage_guard();


-- ── 4. RLS ──────────────────────────────────────────────────────────────────
-- RLS is the enforcement boundary. There is no API route for meeting content —
-- api/ is at its 12-function deployment ceiling, and a policy cannot be
-- bypassed by a forgotten call site the way a route can.
alter table public.meetings enable row level security;

-- PRODUCT DECISION, approved 2026-09-25:
--   STANDALONE means "not linked to a formal case".
--   It does NOT mean "private from the organisation's authorised HR function".
--
-- So: HR Director and HR Manager see standalone meetings and their content
-- across their own organisation. Creator and chair see their own. Nobody else
-- gets org-wide reach, and being NAMED as employee, participant, representative,
-- notetaker or manager grants nothing at all.
--
-- The caseless branch of case_tasks' policy is deliberately NOT copied. It reads
-- `case_id IS NULL AND org_id IN (SELECT my_org_ids())` — any org member may
-- read any caseless row. Defensible for a task; for a meeting it would make a
-- welfare 1-1 transcript readable by every colleague in the organisation, which
-- is the "accidentally becomes an organisation-wide HR record" failure this
-- design exists to avoid.
--
-- Every branch requires org membership, so tenancy is enforced independently of
-- the access reason.
create or replace function public.can_access_standalone_meeting(
  p_org_id uuid, p_created_by uuid, p_chair_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.org_members om
    where om.org_id = p_org_id
      and om.user_id = auth.uid()
      and (
        public.is_hr_role(om.role)            -- hr_director / hr_manager, org-wide
        or auth.uid() = p_created_by          -- the manager who held it
        or auth.uid() = p_chair_user_id       -- the person who chaired it
      )
  )
$$;

-- Explicit per-command policies. No FOR ALL: the fossil table's single
-- catch-all is precisely how it ended up with one unreachable rule governing
-- every operation.

-- SELECT, standalone branch.
create policy "Standalone meetings visible to HR, creator or chair"
  on public.meetings for select
  using (
    case_id is null
    and public.can_access_standalone_meeting(org_id, created_by, chair_user_id)
  );

-- SELECT, case-linked branch. Once linked, the CASE governs — which is the
-- point of linking, and why linking can widen who can read the transcript. The
-- inner select runs under the caller's own RLS on public.cases, so "a case that
-- exists" means "a case I can actually see". org_id is still required on this
-- branch, and the meeting's org must match the case's, so the composition
-- cannot be used to reach across tenants.
create policy "Case-linked meetings follow case access"
  on public.meetings for select
  using (
    case_id is not null
    and org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.cases c
      where c.id = meetings.case_id and c.org_id = meetings.org_id
    )
  );

-- INSERT. Standalone only, for yourself, in your own org, and only a
-- standalone-eligible type. created_by = auth.uid() mirrors the cases policy
-- "New cases must record the real inserting user as creator".
create policy "Only standalone meetings may be created, by their own creator"
  on public.meetings for insert
  with check (
    case_id is null
    and linked_at is null
    and linked_by is null
    and created_by = auth.uid()
    and org_id in (select public.my_org_ids())
    and meeting_type_id in ('informal', 'return', 'investigation')
  );

-- UPDATE, standalone branch: conducting the meeting, and the link itself.
-- USING sees the OLD row (still standalone); WITH CHECK sees the NEW row. When
-- the new row carries a case_id, the case-linked WITH CHECK below must also be
-- satisfiable — which is what makes "you may only link to a case you can
-- access" true at the database rather than in the UI.
create policy "Standalone meetings writable by HR, creator or chair"
  on public.meetings for update
  using (
    case_id is null
    and public.can_access_standalone_meeting(org_id, created_by, chair_user_id)
  )
  with check (
    public.can_access_standalone_meeting(org_id, created_by, chair_user_id)
    and (
      case_id is null
      or exists (
        select 1 from public.cases c
        where c.id = meetings.case_id and c.org_id = meetings.org_id
      )
    )
  );

-- UPDATE, case-linked branch: an already-linked meeting is governed by its case.
create policy "Case-linked meetings writable through case access"
  on public.meetings for update
  using (
    case_id is not null
    and org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.cases c
      where c.id = meetings.case_id and c.org_id = meetings.org_id
    )
  )
  with check (
    case_id is not null
    and org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.cases c
      where c.id = meetings.case_id and c.org_id = meetings.org_id
    )
  );

-- DELETE. HR only, matching "Only HR can delete a case". A manager may not
-- erase the record of a conversation they held.
create policy "Only HR can delete a meeting"
  on public.meetings for delete
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = meetings.org_id
        and om.user_id = auth.uid()
        and public.is_hr_role(om.role)
    )
  );


-- ── 5. Platform-admin isolation ─────────────────────────────────────────────
-- platform_admins administers organisation/contract metadata only and must
-- never reach case content (see platform_admin_foundation_2026-09-06.sql and
-- api/_platformAdmin.js). A standalone meeting transcript is case content by any
-- reasonable reading. No policy above grants platform admins anything: every
-- branch requires an org_members row for auth.uid(), and platform admin status
-- is deliberately independent of org_members. There is nothing to add here —
-- this note records that the absence is intentional and tested
-- (src/test/standaloneMeetingFoundation.test.js, api/_platformAdmin.test.js).


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Complete and safe at any point before the first standalone meeting is
-- created. After 4C.3 activation it would discard standalone meetings, so it is
-- a 4C.1-window rollback only.
--
--   drop trigger if exists meetings_parentage_guard_trg on public.meetings;
--   drop table if exists public.meetings;                  -- drops its policies and indexes
--   drop function if exists public.meetings_parentage_guard();
--   drop function if exists public.can_access_standalone_meeting(uuid, uuid, uuid);
--   alter table public.meetings_legacy_unused rename to meetings;
--   alter policy "Own meetings (legacy unused table)" on public.meetings rename to "Own meetings";
--
-- Application-side rollback is independent: reverting the commit removes the
-- store abstraction and the DSAR reader. Nothing in Phase 2/3 reads this table,
-- and no existing behaviour changes if it is absent — cases.meetings is
-- untouched by this migration.
-- ============================================================================
