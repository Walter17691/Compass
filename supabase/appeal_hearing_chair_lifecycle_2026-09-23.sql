-- ============================================================================
-- Appeal hearing chair integrity — meeting lifecycle compatibility — 2026-09-23
-- Release 1, Appeal Meeting Lifecycle Security (Phase 2A item "2.4")
-- ============================================================================
-- Replaces protect_appeal_hearing_chair_integrity() from
-- appeal_hearing_chair_integrity_2026-09-18.sql. That version is otherwise
-- unchanged and remains the authority for everything not described below.
--
-- WHY THIS IS NEEDED BEFORE ANY LIFECYCLE WRITER SHIPS
--
-- The 2026-09-18 design validates the chair when a meeting ENTRY IS CREATED.
-- That was a complete rule while creation and completion were the same event:
-- a meeting could not be persisted until it had been held, so "validated at
-- creation" and "validated when the hearing happened" were the same instant.
--
-- The Release 1 meeting lifecycle separates them. From Phase 2.2/2.3 onward a
-- meeting row can exist days before the hearing, as status 'scheduled', and
-- only later transition to 'in_progress'. Under the old rule the chair would
-- be checked at scheduling and never again, so:
--
--     Mon  appeal hearing scheduled, chair = Officer A (validated)
--     Tue  Officer A replaced by Officer B
--     Fri  hearing started and completed, still recorded as chaired by A
--
-- would pass, because every write after creation is an existing-entry patch
-- and the old rule only asserts immutability there. That is a real regression
-- introduced by persisting meetings earlier, and it is closed here BEFORE the
-- first writer exists rather than after.
--
-- THE RULE
--
--   chairUserId must equal the CURRENTLY appointed appeal_manager at the two
--   moments the hearing becomes real, and at no other moment:
--
--     CREATE  (an appeal hearing entry appears where none existed) — covers a
--             scheduled hearing AND a hearing created directly as
--             'in_progress' by Start-now, since both are new entries.
--     START   (an existing entry transitions INTO status 'in_progress')
--
--   After that, chairUserId is HISTORICAL TRUTH. It records who actually
--   chaired, not who currently holds the appointment.
--
--     in_progress -> review_draft   no chair revalidation
--     review_draft -> completed     no chair revalidation
--     any other patch               no chair revalidation
--
-- This asymmetry is deliberate and is the correction to an earlier design
-- proposal that would have revalidated at completion. Consider the ordinary
-- sequence: the hearing is held Monday by the properly appointed Officer A,
-- A leaves the business on Tuesday, B is appointed, and HR saves the record on
-- Wednesday. Revalidating at completion would BLOCK a truthful record of a
-- hearing that properly happened, and cancelling a review_draft hearing would
-- assert that a hearing which demonstrably occurred did not. Historical truth
-- is never sacrificed to simplify the trigger.
--
-- OFFICER REPLACEMENT is deliberately NOT given new behaviour here.
-- appoint_appeal_manager() has no concept of scheduled meetings and is not
-- expanded. A scheduled hearing whose officer has since been replaced simply
-- cannot Start: the START check fails closed with APPEAL_CHAIR_STALE_AT_START,
-- and the row remains readable so the UI can offer an actionable "appeal
-- officer changed — reschedule required" state. Nothing is silently
-- rewritten, silently cancelled, or silently started under the new officer.
--
-- INSERT COVERAGE (newly closed gap). The 2026-09-18 trigger was BEFORE
-- UPDATE only, but saveCaseToDB writes a brand-new case with
-- supabase.from('cases').upsert(payload) — an INSERT. A case created with an
-- appeal-type hearing already inside cases.meetings therefore bypassed chair
-- validation entirely. No UI flow does this (a new case is created empty or
-- with one "Informal / 1-1" meeting from a concern referral), but the control
-- exists precisely to be independent of the UI. The trigger now fires on
-- INSERT as well, where every entry is by definition new. A case cannot be
-- created carrying a validly-chaired appeal hearing anyway, since its
-- case_access rows do not exist yet — which is the correct answer.
--
-- NULL letterType BYPASS — a pre-existing defect found by rolled-back
-- empirical testing of this very change, NOT introduced by it.
--
-- The 2026-09-18 classifier reads:
--
--     is_letter_only := entry_letter_type in ('invite','appeal')
--                       and entry_record = '' and entry_transcript_len = 0;
--
-- entry_letter_type is NULL on every entry that is not a letter, and in
-- SQL `NULL in (...)` is NULL, not false. For an entry with no letterType,
-- no record and no transcript the conjunction is NULL, requires_chair
-- becomes `true and not NULL` = NULL, and `if requires_chair and ...` is
-- not true — so the chair block is skipped and NO CHAIR IS REQUIRED OR
-- CHECKED AT ALL.
--
-- Verified directly against the deployed function: a scheduled appeal
-- hearing carrying a fabricated chairUserId was ACCEPTED, as was one
-- created directly as in_progress, as was starting a stale hearing after
-- the officer had been replaced.
--
-- It has been latent because an appeal hearing WITH content evaluates
-- `NULL and false` = false, so every historically persisted hearing was
-- correctly validated. A contentless appeal meeting could not previously
-- be persisted at all. A scheduled hearing is precisely that shape, so the
-- hole opens the moment lifecycle writers ship. Fixed here with coalesce.
--
-- Note this could not have been caught by the JS mirror in
-- src/test/appealHearingChairIntegrity.test.js: JavaScript's
-- ['invite','appeal'].includes(undefined) is false, not null, so the mirror
-- was accidentally correct while the SQL was not. Only executing the real
-- trigger found it.
--
-- CANCELLATION needs no change. A scheduled hearing that is cancelled is an
-- existing entry whose chairUserId does not move, so only the immutability
-- rule applies and it passes. An entry created directly as 'cancelled' still
-- requires a valid chair, which is the safe direction and is unreachable from
-- the UI; it can never become a hearing without passing the START check. The
-- is_letter_only heuristic is therefore deliberately left exactly as it was —
-- an earlier design note suggesting it be widened for cancelled rows proved
-- unnecessary on inspection.
--
-- LEGACY ROWS are untouched and require no backfill. Entries with no status
-- key never satisfy the START condition (entry_status is null, which is not
-- 'in_progress'), so they keep precisely their 2026-09-18 behaviour:
-- validated if newly created, immutability-only if patched, and no new
-- requirement imposed on a chairless legacy hearing.
--
-- Does not change: appeal_manager appointment authority (HR-only,
-- appoint_appeal_manager / revoke_appeal_manager — both untouched), final
-- appeal-decision authority, ordinary case-write RLS, case_access_level
-- scoping, Level 1/2/3 visibility, the is_letter_only classifier, the
-- immutability rule, or savedBy. No historical data is read or written.
-- ============================================================================

create or replace function public.protect_appeal_hearing_chair_integrity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_meetings jsonb;
  old_meetings jsonb;
  entry jsonb;
  old_entry jsonb;
  entry_id text;
  entry_type text;
  entry_letter_type text;
  entry_record text;
  entry_transcript_len int;
  entry_chair_text text;
  entry_chair_uuid uuid;
  entry_status text;
  old_status text;
  is_appeal_type boolean;
  is_letter_only boolean;
  requires_chair boolean;
  is_new_entry boolean;
  becomes_started boolean;
begin
  -- Nothing to check unless meetings itself is changing. On INSERT there is
  -- no OLD row to compare against, so this short-circuit is UPDATE-only.
  if tg_op = 'UPDATE' and new.meetings is not distinct from old.meetings then
    return new;
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  new_meetings := coalesce(new.meetings, '[]'::jsonb);
  -- On INSERT every entry is new by definition.
  old_meetings := case when tg_op = 'UPDATE' then coalesce(old.meetings, '[]'::jsonb) else '[]'::jsonb end;

  for entry in select value from jsonb_array_elements(new_meetings) as t(value)
  loop
    entry_id := entry->>'id';
    entry_type := lower(coalesce(entry->>'type', ''));
    entry_letter_type := entry->>'letterType';
    entry_record := coalesce(entry->>'record', '');
    entry_transcript_len := coalesce(jsonb_array_length(entry->'transcript'), 0);
    entry_chair_text := entry->>'chairUserId';
    -- Absent, null or whitespace-only status all mean "no declared lifecycle
    -- state" — i.e. every row written before Phase 2.2.
    entry_status := nullif(btrim(coalesce(entry->>'status', '')), '');

    -- Unchanged from 2026-09-18: the case-insensitive "appeal" substring
    -- convention (isAppealMeeting, meetingTypeMatch.js).
    is_appeal_type := entry_type like '%appeal%';

    -- SECURITY FIX (see header, "NULL letterType bypass"). The coalesce is
    -- the fix. Previously this read:
    --
    --     entry_letter_type in ('invite', 'appeal') and ...
    --
    -- and entry_letter_type is NULL on every meeting that is not a letter.
    -- NULL in (...) is NULL, not false, so for an entry with no letterType,
    -- no record and no transcript the whole conjunction evaluated to NULL,
    -- requires_chair became `true and not NULL` = NULL, and the guarded
    -- block below was skipped entirely — no chair required, no chair
    -- checked. An appeal hearing WITH content was unaffected, because
    -- `NULL and false` is false, which is why every historical hearing was
    -- correctly validated and the hole stayed latent.
    --
    -- A scheduled appeal hearing is exactly the unaffected-until-now shape:
    -- no letterType, no record, no transcript. Without this line the very
    -- rows the lifecycle is about to start creating would bypass the control.
    is_letter_only := coalesce(entry_letter_type, '') in ('invite', 'appeal') and entry_record = '' and entry_transcript_len = 0;
    requires_chair := is_appeal_type and not is_letter_only;

    select value into old_entry from jsonb_array_elements(old_meetings) as t(value) where value->>'id' = entry_id limit 1;
    old_status := nullif(btrim(coalesce(old_entry->>'status', '')), '');

    is_new_entry := old_entry is null;
    -- The transition INTO the started state, and only that transition. An
    -- entry already in_progress being patched again is not becoming started,
    -- so an ordinary mid-hearing write never revalidates.
    becomes_started := (not is_new_entry)
                        and entry_status = 'in_progress'
                        and old_status is distinct from 'in_progress';

    if requires_chair and (is_new_entry or becomes_started) then
      entry_chair_uuid := null;
      begin
        entry_chair_uuid := entry_chair_text::uuid;
      exception when invalid_text_representation then
        raise exception 'APPEAL_HEARING_CHAIR_MISSING: chairUserId must be a valid UUID' using errcode = '42501';
      end;

      if entry_chair_uuid is null then
        raise exception 'APPEAL_HEARING_CHAIR_MISSING: a newly created appeal hearing record must specify chairUserId' using errcode = '42501';
      end if;

      if not exists (
        select 1 from public.case_access
        where case_id = new.id and role = 'appeal_manager' and user_id = entry_chair_uuid
      ) then
        if becomes_started then
          -- Distinct code: the chair was valid when this hearing was created,
          -- and the appointment has changed since. The hearing has not
          -- started, so nothing historical is at stake — it must be
          -- rescheduled under the current officer.
          raise exception 'APPEAL_CHAIR_STALE_AT_START: the appeal officer has changed since this hearing was arranged — it cannot start under the previous officer' using errcode = '42501';
        else
          raise exception 'APPEAL_CHAIR_MISMATCH: the recorded appeal hearing chair must be the currently appointed appeal officer for this case' using errcode = '42501';
        end if;
      end if;
    end if;

    if not is_new_entry then
      -- Unchanged from 2026-09-18. chairUserId, once recorded, is immutable —
      -- including across a Start transition, so a stale scheduled hearing can
      -- never be quietly re-pointed at the new officer instead of rescheduled.
      -- A hearing that never had one (legacy data) imposes no new requirement
      -- on unrelated patches to that same entry.
      if (old_entry->>'chairUserId') is not null and (old_entry->>'chairUserId') is distinct from entry_chair_text then
        raise exception 'APPEAL_HEARING_CHAIR_IMMUTABLE: an appeal hearing''s recorded chair cannot be changed or removed after it is saved' using errcode = '42501';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists protect_appeal_hearing_chair_integrity_trigger on public.cases;
create trigger protect_appeal_hearing_chair_integrity_trigger
before insert or update on public.cases
for each row execute function public.protect_appeal_hearing_chair_integrity();

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Re-apply supabase/appeal_hearing_chair_integrity_2026-09-18.sql verbatim.
-- It ends with its own drop-and-create of the same trigger name, restoring
-- BEFORE UPDATE only. No data is touched by either direction, so rollback is
-- a pure function/trigger replacement and is safe at any time.
--
-- Rolling back while status-bearing appeal hearings exist reverts to
-- create-time-only validation; it cannot corrupt or lose any row, and the
-- immutability rule continues to hold. Re-applying this migration restores
-- START enforcement.
-- ============================================================================
