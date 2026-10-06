-- ============================================================================
-- EMPLOYEE RESPONSE CLASSIFICATION & CONTROLLED CORRECTION — 2026-10-07
-- Trust Slice TRUST-SIG-03
-- ============================================================================
-- HOW TO APPLY: paste into the Supabase SQL Editor and run, as ONE unit.
--
-- ADDITIVE ONLY. Seven nullable columns, three CHECKs, one partial index.
-- NO BACKFILL. Not one existing value is read, rewritten or reinterpreted.
--
-- ┌─ THE GAP THIS CLOSES ───────────────────────────────────────────────────┐
-- │ `status` conflated two different questions, and 'disputed' writes NO      │
-- │ signature at all — api/signing.js builds `{ status: 'disputed' }` and     │
-- │ deliberately omits signature and signed_at because "nothing was agreed".  │
-- │                                                                         │
-- │ So this was NOT REPRESENTABLE:                                          │
-- │                                                                         │
-- │   "I confirm I received and read this record,                            │
-- │    AND I believe paragraph three is wrong."                              │
-- │                                                                         │
-- │ Signing and disputing were mutually exclusive, which forces a meeting     │
-- │ record into a false binary: SIGNED = AGREED, or COMMENT = DISPUTED.      │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ A THIRD AXIS, NOT A NEW STATUS ────────────────────────────────────────┐
-- │ Same discipline as the communication-evidence slice. `status` keeps       │
-- │ meaning ONE thing — what the participant did about SIGNING — and accuracy │
-- │ becomes its own orthogonal fact:                                        │
-- │                                                                         │
-- │   COMMUNICATION   send_attempted_at / send_accepted_at / …   (2026-10-06) │
-- │   PARTICIPANT     status, nine existing values                           │
-- │   ACCURACY        response_type: accurate | comment | disputed   ← NEW    │
-- │   RESOLUTION      response_resolution + reason + actor + time    ← NEW    │
-- │                                                                         │
-- │ status='signed' + response_type='disputed' now says exactly what the      │
-- │ employee meant. signing_requests_status_valid is therefore NOT TOUCHED,   │
-- │ no reader's status map can fall out of date, and the standalone           │
-- │ 'disputed' STATUS stays valid for a participant who responds without      │
-- │ signing.                                                                │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ WHY AN ADDENDUM AND NOT A VERSION 2 ───────────────────────────────────┐
-- │ `document` is the immutable issued snapshot and nothing may rewrite it.    │
-- │ A corrected reading is therefore recorded as employer-authored text       │
-- │ ALONGSIDE it, never merged into it. The full chain is reconstructable      │
-- │ from one row:                                                            │
-- │                                                                         │
-- │   document              what the notes said when issued                  │
-- │   participant_comment   what the employee challenged                     │
-- │   proposed_correction   what they said it should say                     │
-- │   response_resolution   what the employer concluded                      │
-- │   …_reason / …_by / …_at  why, who, when                                 │
-- │   response_addendum     the resulting authoritative addition             │
-- │                                                                         │
-- │ A manager who wants a clean re-issue already has one: the existing        │
-- │ supersession machinery issues a corrected record as a NEW request while    │
-- │ superseded_at preserves the original. No document-versioning subsystem is  │
-- │ built, because none is needed for either case.                            │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- PRE-MIGRATION BASELINE (production, read-only, immediately before applying).
-- Digest EXPRESSIONS recorded, not just values:
--
--   signing_requests 105 · columns 34 · new columns present 0
--     status: signed 63 · pending 27 (legacy) · expired 15 · sent 0
--
--   S1 md5(string_agg(sign_id||':'||md5(coalesce(document,'-')), ',' order by sign_id))
--      = 9ae9be3f6e948aa6a35cb6f1fa9a31c8    <- the issued snapshots
--   S2 md5(string_agg(sign_id||':'||coalesce(status,'-')||':'||coalesce(signed_at,'-'), ',' order by sign_id))
--      = 309bda068be17c76df1804ac22f944cc    <- participant response state
--   S3 md5(string_agg(sign_id||':'||coalesce(signature,'-')||':'||coalesce(participant_comment,'-'), ',' order by sign_id))
--      = 1ca187ac3ccd7573cf8f8ebbe13d4938    <- signatures AND employee words
--
-- All three must be IDENTICAL afterwards. Row counts differ from the
-- 2026-10-06 migration's baseline (104 -> 105) because human UAT signed a real
-- record in between; that is the tester's own action, not drift.
-- ============================================================================


-- ── 1. WHAT THE EMPLOYEE SAID ABOUT ACCURACY ───────────────────────────────
alter table public.signing_requests
  add column if not exists response_type       text,
  add column if not exists proposed_correction text;

comment on column public.signing_requests.response_type is
  'What the employee said about the ACCURACY of the record: accurate | comment | disputed. Orthogonal to `status`, which says what they did about SIGNING — so status=''signed'' with response_type=''disputed'' means "I received and read this, and I think it is wrong". NULL means UNCLASSIFIED and is the honest value for every pre-2026-10-07 row. It is NEVER inferred from the text of participant_comment.';

comment on column public.signing_requests.proposed_correction is
  'What the employee says the record should say instead. Only ever present on a disputed response (enforced by signing_requests_proposed_correction_scope). Their words; no employer process may edit it.';


-- ── 2. WHAT THE EMPLOYER CONCLUDED ─────────────────────────────────────────
alter table public.signing_requests
  add column if not exists response_resolution        text,
  add column if not exists response_resolution_reason text,
  add column if not exists response_resolved_by       uuid references auth.users(id),
  add column if not exists response_resolved_at       timestamptz,
  add column if not exists response_addendum          text;

comment on column public.signing_requests.response_resolution is
  'How the employer resolved a challenge to accuracy: correction_accepted | partially_accepted | original_retained | addendum_added. A THIRD artefact recorded alongside the record and the response — never an edit to either. NULL means not yet reviewed.';

comment on column public.signing_requests.response_resolution_reason is
  'Why the employer reached that conclusion. Required for every resolution EXCEPT correction_accepted, where the employee already said what was wrong and the employer simply agreed.';

comment on column public.signing_requests.response_resolved_by is
  'Who reviewed the response. Derived server-side from the verified session in api/signing.js; never accepted from a request body, and never exposed to the employee.';

comment on column public.signing_requests.response_addendum is
  'Employer-authored text attached to the issued record as a correction or clarification. APPEND-ONLY and kept SEPARATE: `document` remains the immutable snapshot that was actually signed, and employee wording is never merged into employer-authored notes.';


-- ── 3. SHAPE RULES THE DATABASE ENFORCES ───────────────────────────────────
alter table public.signing_requests
  drop constraint if exists signing_requests_response_type_valid;
alter table public.signing_requests
  add constraint signing_requests_response_type_valid
  check (response_type is null or response_type in ('accurate','comment','disputed'));

-- A proposed correction only makes sense against a challenge.
alter table public.signing_requests
  drop constraint if exists signing_requests_proposed_correction_scope;
alter table public.signing_requests
  add constraint signing_requests_proposed_correction_scope
  check (proposed_correction is null or response_type = 'disputed');

-- A resolution is complete or absent — never half-recorded, which is how a
-- change to the authoritative reading of a record ends up unattributable.
alter table public.signing_requests
  drop constraint if exists signing_requests_resolution_complete;
alter table public.signing_requests
  add constraint signing_requests_resolution_complete
  check (
    (response_resolution is null and response_resolution_reason is null
       and response_resolved_by is null and response_resolved_at is null
       and response_addendum is null)
    or (
      response_resolution in ('correction_accepted','partially_accepted','original_retained','addendum_added')
      and response_resolved_by is not null and response_resolved_at is not null
      and (response_resolution = 'correction_accepted'
           or coalesce(btrim(response_resolution_reason),'') <> '')
      and (response_resolution <> 'addendum_added'
           or coalesce(btrim(response_addendum),'') <> '')
    )
  );


-- ── 4. FINDING CHALLENGES THAT STILL NEED A HUMAN ──────────────────────────
-- The one question process guidance asks. Partial, so it indexes only
-- outstanding work rather than every row that ever carried a response.
create index if not exists signing_requests_awaiting_response_review
  on public.signing_requests (org_id)
  where response_type = 'disputed' and response_resolution is null and superseded_at is null;


-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================
-- * It does not add, remove or widen a single `status` value, and does not touch
--   signing_requests_status_valid. Accuracy is a separate axis.
-- * It does NOT classify one historical row. All 105 keep response_type NULL,
--   including the Sam Testcase record, which continues to read "Signed with
--   comments" because that is all its data supports. Reading comment TEXT to
--   guess at intent would manufacture evidence, and afterwards it would be
--   indistinguishable from a classification the employee actually made.
-- * It does not alter `document`, `participant_comment`, `signature` or any
--   timestamp. The issued snapshot and the employee's words stay untouchable.
-- * It creates no second signature system and no document-versioning subsystem.
-- * It adds no policy. signing_requests stays RLS-enabled with zero policies —
--   service-role only, so a browser can neither read nor write it.
-- * It adds no trigger and no SECURITY DEFINER function.
-- * It does not make an unresolved challenge a database-level block on anything.
--
-- ============================================================================
-- ROLLBACK (complete; no data to restore, because nothing was backfilled)
-- ============================================================================
--   drop index if exists public.signing_requests_awaiting_response_review;
--   alter table public.signing_requests
--     drop constraint if exists signing_requests_resolution_complete,
--     drop constraint if exists signing_requests_proposed_correction_scope,
--     drop constraint if exists signing_requests_response_type_valid;
--   alter table public.signing_requests
--     drop column if exists response_addendum,
--     drop column if exists response_resolved_at,
--     drop column if exists response_resolved_by,
--     drop column if exists response_resolution_reason,
--     drop column if exists response_resolution,
--     drop column if exists proposed_correction,
--     drop column if exists response_type;
--
-- Rolling back restores the false binary: signing and disputing become mutually
-- exclusive again. Any classification or resolution recorded after this
-- migration is lost — export first. No pre-migration value is altered either way.
-- ============================================================================
