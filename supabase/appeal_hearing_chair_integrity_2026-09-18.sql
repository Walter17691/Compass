-- ============================================================================
-- Appeal Hearing Control Remediation — chair/appeal_manager integrity — 2026-09-18
-- ============================================================================
-- Confirmed P1 control defect (Appeal Hearing UX discovery, read-only): the
-- structured "Start appeal hearing" entry point prefilled "Your name
-- (chair)" from cases.manager — a generic, unrelated field (on the
-- discovery case, it happened to name the ORIGINAL disciplinary decision-
-- maker) — never from the authoritative case_access.role='appeal_manager'
-- relationship. The chair field was freely editable and its value was
-- persisted straight into the saved meeting record with no backend check
-- at all.
--
-- REVISION (same day, before this migration was ever applied to
-- production): the first version of this fix added a case-level scalar,
-- cases.appeal_hearing_chair_id, verified by a trigger that only fired
-- when THAT column's own value changed. A follow-up invariant review
-- proved this enforced the wrong, weaker guarantee — "IF a chair id is
-- supplied, it must match" rather than "WHENEVER an appeal hearing is
-- persisted, a verified chair must exist" — and, independently, that a
-- single case-level value cannot correctly represent hearing-level
-- history once an officer is reassigned or a case has more than one
-- appeal hearing. Ten rolled-back disposable tests confirmed both: an
-- appeal-type meeting could be appended to cases.meetings while the
-- column stayed null/unchanged (via the ordinary React app's own generic
-- "Start meeting" entry, not just a hostile client), and reassigning the
-- officer silently overwrote the one column, destroying the record of who
-- chaired the first hearing.
--
-- This version replaces that design entirely:
--
--   THE CHAIR IS AN ATTRIBUTE OF THE PARTICULAR APPEAL HEARING, not of the
--   case. case_access.role='appeal_manager' represents who is CURRENTLY
--   appointed to hear/decide the appeal — a live, replaceable fact. Each
--   saved hearing's own chairUserId represents who ACTUALLY chaired THAT
--   hearing — a historical fact, fixed the moment it's saved. No new
--   column, no new table: meetings already live as a jsonb array inside
--   cases.meetings (see App.jsx's saveMeetingToCaseImpl), so chairUserId
--   is a new field on the individual meeting object itself (manager stays
--   as the existing free-text display name, unchanged, for presentation
--   compatibility).
--
--   Enforcement now runs on ANY change to cases.meetings, not on a
--   dedicated column changing, by diffing new.meetings against old.meetings
--   (matched by each meeting's own stable `id`, since meetings are
--   patched in place by id for signatures/reminders/checklist-toggling
--   elsewhere in the app — never assume "last element = newest"):
--
--     - A meeting id with NO counterpart in old.meetings is newly created.
--       If it is an appeal HEARING (its type matches the existing
--       "appeal" substring convention, and it is not merely an appeal
--       invitation/outcome LETTER draft — see the classifier below), its
--       chairUserId must be present, a syntactically valid uuid, and must
--       equal the case's CURRENT case_access.role='appeal_manager'. No
--       appeal_manager appointed at all -> the check can never pass ->
--       creation fails, matching "do not silently treat unknown as safe."
--
--     - A meeting id that already existed is being patched (signature
--       status, reminder timestamps, checklist toggles — none of which
--       ever touch chairUserId in the app). If its old chairUserId was
--       already set, the new value must be IDENTICAL — immutable once
--       recorded, with no correction mechanism introduced here (matching
--       "prefer immutable chairUserId for R1" absent an audited
--       alternative). A hearing with no chairUserId at all (legacy data,
--       predating this migration) imposes no new retroactive requirement —
--       an unrelated patch to that same meeting (e.g. a signature update)
--       must keep succeeding.
--
--   This closes the exact three empirically-confirmed gaps: an appeal
--   hearing can no longer be persisted with a missing/wrong chair via any
--   entry point that touches cases.meetings directly (not just the
--   structured UI flow), a hearing's chair can no longer be silently
--   edited or cleared after the fact, and reassigning the appeal officer
--   can never retroactively alter which UUID an earlier hearing recorded.
--
-- Does not change: appeal_manager appointment authority (HR-only,
-- appoint_appeal_manager()), final appeal-decision authority (HR or
-- current appeal_manager, protect_allegations_appeal_decision_columns()),
-- ordinary case-write RLS (case_access_level scoping), or Level 1/2/3
-- visibility. Grants appeal_manager no broader case access than the role
-- already has. savedBy (the meeting's own free-text "who operated
-- Compass" snapshot) remains completely separate and untouched — an
-- authorised HR colleague may operate Compass and save the record on the
-- appointed officer's behalf, provided the asserted chairUserId is still
-- the real officer.
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
  is_appeal_type boolean;
  is_letter_only boolean;
  requires_chair boolean;
begin
  -- Nothing to check unless meetings itself is changing in this statement.
  if new.meetings is not distinct from old.meetings then
    return new;
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  new_meetings := coalesce(new.meetings, '[]'::jsonb);
  old_meetings := coalesce(old.meetings, '[]'::jsonb);

  for entry in select value from jsonb_array_elements(new_meetings) as t(value)
  loop
    entry_id := entry->>'id';
    entry_type := lower(coalesce(entry->>'type', ''));
    entry_letter_type := entry->>'letterType';
    entry_record := coalesce(entry->>'record', '');
    entry_transcript_len := coalesce(jsonb_array_length(entry->'transcript'), 0);
    entry_chair_text := entry->>'chairUserId';

    -- Matches the established case-insensitive "appeal" substring
    -- convention (isAppealMeeting, meetingTypeMatch.js) — never re-derived
    -- differently here.
    is_appeal_type := entry_type like '%appeal%';

    -- An appeal-type meeting entry whose ONLY content is a drafted
    -- invitation or outcome letter (letterType 'invite'/'appeal', see
    -- saveMeetingToCaseImpl's own letterType stamping) and which carries
    -- no actual hearing content (no record text, no transcript) is a
    -- letter-shaped record, not a hearing — it never requires a chair.
    -- Any entry with real record/transcript content is treated as a
    -- hearing regardless of whether a letter also happens to be attached,
    -- since under-enforcing here is the unsafe direction.
    is_letter_only := entry_letter_type in ('invite', 'appeal') and entry_record = '' and entry_transcript_len = 0;

    requires_chair := is_appeal_type and not is_letter_only;

    select value into old_entry from jsonb_array_elements(old_meetings) as t(value) where value->>'id' = entry_id limit 1;

    if old_entry is null then
      -- Newly created meeting entry.
      if requires_chair then
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
          raise exception 'APPEAL_CHAIR_MISMATCH: the recorded appeal hearing chair must be the currently appointed appeal officer for this case' using errcode = '42501';
        end if;
      end if;
    else
      -- Existing meeting entry being patched (signature status, reminder
      -- timestamps, checklist toggles, etc.) — chairUserId, once recorded,
      -- is immutable. A hearing that never had one (legacy data) imposes
      -- no new requirement on unrelated patches to that same entry.
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
before update on public.cases
for each row execute function public.protect_appeal_hearing_chair_integrity();
