-- ============================================================================
-- RECORD INTEGRITY & SIGNATURE LIFECYCLE — 2026-10-04  (Pre-V1 Trust Slice)
-- ============================================================================
-- HOW TO APPLY: paste into the Supabase SQL Editor and run, as ONE unit.
--
-- ADDITIVE ONLY. Six new nullable columns on signing_requests, one CHECK that
-- admits every value already present, one partial index. No existing column is
-- altered, renamed or dropped. NOT ONE HISTORICAL SIGNED DOCUMENT IS REWRITTEN.
--
-- ┌─ WHAT THIS IS FOR ──────────────────────────────────────────────────────┐
-- │ signing_requests.document is already the immutable snapshot of what a    │
-- │ participant was actually shown — written once at creation, never patched │
-- │ by any code path. That part of the architecture was right.               │
-- │                                                                         │
-- │ What was missing sat either side of it:                                 │
-- │   · the participant could only SIGN, ACKNOWLEDGE or DECLINE. There was   │
-- │     no way to say "I received these notes and I disagree with part of    │
-- │     them", so disagreement had nowhere to live except a decline.         │
-- │   · the organisation could proceed over silence or refusal, but the      │
-- │     product recorded no decision to do so and no reason. The most        │
-- │     challengeable step in the process was the one the record was silent  │
-- │     about.                                                              │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ WHY THE TRUST BOUNDARY HERE IS THE API, NOT A TRIGGER ──────────────────┐
-- │ signing_requests has RLS ENABLED and ZERO POLICIES: `authenticated` is   │
-- │ denied outright and every access goes through api/signing.js under the   │
-- │ service role. auth.uid() is therefore NULL for every write to this       │
-- │ table, so a BEFORE trigger of the kind used on allegations CANNOT derive │
-- │ an actor here — it would record NULL for everyone.                      │
-- │                                                                         │
-- │ Provenance is consequently derived in the handler from the verified      │
-- │ session (requireOrgMembership -> auth.caller.id), and the request body   │
-- │ is never trusted for proceeded_by or proceeded_at. The columns below are │
-- │ deliberately NOT given defaults: a value must be written by the one code │
-- │ path entitled to write it, so an absent value is visibly absent rather   │
-- │ than silently now().                                                    │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- PRE-MIGRATION BASELINE (production, read-only, immediately before applying).
-- Digest EXPRESSIONS are recorded, not only values:
--
--   signing_requests 104 (pending 27, sent 15, signed 62) · policies 0 ·
--   cases 2,961 · allegations 949 · case_decisions 138 · audit_log 16,938 ·
--   public base tables 44 · new columns present 0
--
--   S1 md5(string_agg(sign_id||':'||md5(coalesce(document,'-')), ',' order by sign_id))
--      = 400f3c8c7cbb62244552b42125b2b537      <- the signed snapshots
--   S2 md5(string_agg(sign_id||':'||coalesce(status,'-')||':'||coalesce(signed_at,'-'), ',' order by sign_id))
--      = 72b2cd21bdf598a13e6a71feb8dd1d28
--   S3 md5(string_agg(sign_id||':'||coalesce(signature,'-'), ',' order by sign_id))
--      = 17620136382960bf404c55313fc134b5      <- the captured signature images
--   D1 md5(string_agg(id||':'||coalesce(status,'-'), ',' order by id)) ON allegations
--      = 084dedd8581418aa232532a6ee95f063
--   D9 md5(string_agg(id||':'||coalesce(stage,'-')||':'||coalesce(outcome,'-'), ',' order by id)) ON cases
--      = e95c43cdeba53d37d136272e55f3d250
--   M1 md5(string_agg(id||':'||md5(coalesce(meetings::text,'-')), ',' order by id)) ON cases
--      = 5cb0552bc1a5546849364f3d802f87c5      <- every stored meeting record
--
-- S1, S3 and M1 are the integrity-critical ones: if this migration altered a
-- single signed document, a captured signature, or any meeting record, one of
-- those three would move. All six must be IDENTICAL afterwards.
-- ============================================================================


-- ── 1. The participant can disagree without being forced to refuse ─────────
--
-- Text, not timestamptz, for participant_comment_at — every other timestamp on
-- this table (created_at, signed_at, opened_at, expires_at, declined_at) is
-- text holding an ISO string, and a single timestamptz column here would mean
-- half the row needs casting and the other half does not. Recorded as inherited
-- debt, deliberately not "fixed" in a trust slice whose whole point is to change
-- as little as possible about this table.
alter table public.signing_requests
  add column if not exists participant_comment text,
  add column if not exists participant_comment_at text;

comment on column public.signing_requests.participant_comment is
  'The participant''s own words about this document: a correction, a disagreement, or context. Written only by the participant through the public signing endpoint, alongside whichever outcome they chose. NEVER modifies the manager''s record — the two coexist, and a reviewer sees both.';
comment on column public.signing_requests.participant_comment_at is
  'When the participant submitted their comment (ISO string, matching this table''s existing timestamp convention).';


-- ── 2. Proceeding becomes an explicit, reasoned, attributed decision ───────
--
-- NOT a computed state. Compass may display how long a request has been
-- outstanding; it must never conclude on its own that the opportunity given was
-- reasonable. These columns are written only when a named human decides to
-- proceed and says why.
--
-- proceeded_from_status preserves what the request was at the moment of the
-- decision, because that is the fact a reader needs later: proceeding over
-- SILENCE and proceeding over a REFUSAL are different decisions, and the
-- current status alone would no longer distinguish them.
alter table public.signing_requests
  add column if not exists proceeded_at timestamptz,
  add column if not exists proceeded_by uuid references auth.users(id),
  add column if not exists proceed_reason text,
  add column if not exists proceeded_from_status text;

comment on column public.signing_requests.proceeded_at is
  'When an authorised human decided to proceed without participant confirmation. timestamptz rather than text: these columns are new, so there are no legacy string values to stay compatible with, and there was no reason to inherit the debt. Server-derived in api/signing.js; never accepted from the request body.';
comment on column public.signing_requests.proceeded_by is
  'Who decided to proceed. Derived from the verified session in api/signing.js, because this table is service-role-only and a database trigger would see auth.uid() as NULL.';
comment on column public.signing_requests.proceed_reason is
  'Why they decided to proceed. Required by the handler — there is no path that records a proceed decision without one.';
comment on column public.signing_requests.proceeded_from_status is
  'The request status immediately before the proceed decision, so the record distinguishes proceeding over silence from proceeding over a refusal or a dispute.';


-- ── 3. The vocabulary becomes enforced, admitting everything already here ──
--
-- There was no CHECK on this column at all, so the state machine lived entirely
-- in JavaScript. Two new states join it:
--
--   'disputed'   the participant responded and disagrees. TERMINAL — they have
--                engaged, so the process is not blocked — but it is emphatically
--                NOT agreement, and no consumer may treat it as one.
--   'proceeded'  the organisation moved on without confirmation, by an explicit
--                recorded human decision.
--
-- 'pending' is included because 27 production rows hold it. It predates
-- ESIGNATURE_STATUS and is not in that map; section 7 of the brief forbids
-- casually renaming historical states, so it is admitted as legacy rather than
-- migrated. Nothing new writes it.
alter table public.signing_requests
  drop constraint if exists signing_requests_status_valid;
alter table public.signing_requests
  add constraint signing_requests_status_valid
  check (status is null or status in (
    'pending',      -- legacy, 27 rows, never written by new code
    'sent', 'opened',
    'signed', 'acknowledged', 'declined', 'expired',
    'disputed',     -- new: responded, and disagrees
    'proceeded'     -- new: proceeded after reasonable opportunity, by decision
  ));

-- A proceed decision always carries its actor, its time and its reason. The
-- three are meaningless apart, so the constraint keeps them together rather
-- than trusting four call sites to remember.
alter table public.signing_requests
  drop constraint if exists signing_requests_proceed_complete;
alter table public.signing_requests
  add constraint signing_requests_proceed_complete
  check (
    (proceeded_at is null and proceeded_by is null
      and proceed_reason is null and proceeded_from_status is null)
    or
    (proceeded_at is not null and proceeded_by is not null
      and coalesce(btrim(proceed_reason), '') <> ''
      and proceeded_from_status is not null)
  );

-- A comment always carries its timestamp, for the same reason.
alter table public.signing_requests
  drop constraint if exists signing_requests_comment_complete;
alter table public.signing_requests
  add constraint signing_requests_comment_complete
  check (
    (participant_comment is null and participant_comment_at is null)
    or (coalesce(btrim(participant_comment), '') <> '' and participant_comment_at is not null)
  );


-- ── 4. The expiry sweep needs to find stale requests cheaply ───────────────
--
-- Partial, because the sweep only ever asks for the two non-terminal states,
-- and those are a shrinking minority of a growing table.
--
-- expires_at is text holding an ISO string, so the sweep casts it rather than
-- altering the column — an ALTER TYPE on a live column carrying 104 values
-- would be a destructive change in a slice that promised not to make one.
create index if not exists signing_requests_open_by_expiry
  on public.signing_requests (expires_at)
  where status in ('sent', 'opened');


-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================
-- * It does not touch `document`, `signature`, `signed_at` or any other
--   existing column on any of the 104 rows. S1, S3 and M1 prove it.
-- * It does not add a policy to signing_requests. The table is service-role-
--   only by design and that is the correct posture for a row reachable by an
--   unauthenticated signer holding a token.
-- * It does not migrate the 27 'pending' rows to 'sent'. Their meaning is not
--   certain enough to rewrite, and the brief forbids casual renaming.
-- * It does not convert this table's text timestamps to timestamptz.
-- * It adds NO notion of `delivered`. There is still no provider evidence for
--   it, and inventing the column would invite someone to populate it.
-- * It does not store superseded meeting-record text. See the wave report:
--   the signed snapshot already preserves the version that matters, and the
--   amendment TRACE is carried by a dedicated audit action rather than by a
--   second copy of the record in a new table.
--
-- ============================================================================
-- ROLLBACK (complete; no data to restore, because nothing was backfilled)
-- ============================================================================
--   drop index if exists public.signing_requests_open_by_expiry;
--   alter table public.signing_requests
--     drop constraint if exists signing_requests_comment_complete,
--     drop constraint if exists signing_requests_proceed_complete,
--     drop constraint if exists signing_requests_status_valid;
--   alter table public.signing_requests
--     drop column if exists proceeded_from_status,
--     drop column if exists proceed_reason,
--     drop column if exists proceeded_by,
--     drop column if exists proceeded_at,
--     drop column if exists participant_comment_at,
--     drop column if exists participant_comment;
--
-- Dropping the columns discards any participant comment and any proceed
-- decision recorded after this migration — real evidence about real people.
-- Export before rolling back. No pre-migration value is altered either way.
-- ============================================================================
