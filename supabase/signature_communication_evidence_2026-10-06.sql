-- ============================================================================
-- SIGNATURE COMMUNICATION EVIDENCE — 2026-10-06  (Trust Slice 2A)
-- ============================================================================
-- HOW TO APPLY: paste into the Supabase SQL Editor and run, as ONE unit.
--
-- ADDITIVE ONLY. Four nullable columns and one CHECK. NO BACKFILL, and no
-- existing value is read, rewritten or reinterpreted.
--
-- ┌─ THE DEFECT THIS CLOSES (TRUST-SIG-02) ─────────────────────────────────┐
-- │ `status` was set to 'sent' at INSERT time — before, and independently    │
-- │ of, any email. The email is a SEPARATE call (api/send-for-signature.js)   │
-- │ which persisted nothing at all: no provider response, no message id, no   │
-- │ failure record.                                                         │
-- │                                                                         │
-- │ So when Resend failed, the row still said 'sent', the client returned     │
-- │ {success:false} and bailed before attaching signId or writing an audit    │
-- │ entry — leaving an orphan that claimed to have been sent. A request that  │
-- │ was never emailed was INDISTINGUISHABLE, in the persisted record, from    │
-- │ one that was.                                                           │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ WHY THIS IS NOT A NEW STATUS VALUE ────────────────────────────────────┐
-- │ The obvious move — issued -> send_attempted -> send_accepted -> opened    │
-- │ -> signed — would force three unrelated dimensions through one column,    │
-- │ and the brief is right that this destroys representational ability. A      │
-- │ request can legitimately be, ALL AT ONCE:                                │
-- │                                                                         │
-- │   issued  +  provider accepted  +  opened  +  disputed  +  superseded    │
-- │                                                                         │
-- │ Those are four facts on three axes, and no single enum can hold them.     │
-- │ So the axes stay separate:                                              │
-- │                                                                         │
-- │   REQUEST LIFECYCLE   the row's existence = issued;                      │
-- │                       superseded_at/by/by_sign_id = currency             │
-- │   COMMUNICATION       the four columns below — INDEPENDENT FACTS, never  │
-- │                       a status value                                     │
-- │   PARTICIPANT         `status`, with its EXISTING nine values — unchanged │
-- │                                                                         │
-- │ Consequence, deliberate: this migration does NOT touch                   │
-- │ signing_requests_status_valid. The participant vocabulary is not widened, │
-- │ so no reader's status map can fall out of date, and the 27 legacy         │
-- │ 'pending' rows keep rendering exactly as they do today.                  │
-- │                                                                         │
-- │ `status = 'sent'` therefore keeps its historical NAME but is read as      │
-- │ "issued, awaiting a participant response". Whether it was COMMUNICATED is │
-- │ answered only by the columns below, and lib/communicationEvidence.js is   │
-- │ the single reader. Nothing in the UI may say "sent" without              │
-- │ send_accepted_at.                                                       │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- PRE-MIGRATION BASELINE (production, read-only, immediately before applying).
-- Digest EXPRESSIONS recorded, not just values:
--
--   signing_requests 104 across 3 orgs
--     status: signed 62 · pending 27 (legacy) · expired 15 · sent 0
--     document non-empty 104/104 · meeting_id NULL 104/104
--     employee_email empty 87/104 · signed_at present 62
--     superseded 0 · proceeded 0 · participant_comment 0
--     requires_signature=false 0 · document_type: meeting_record only
--     new columns present: 0
--
--   S1 md5(string_agg(sign_id||':'||md5(coalesce(document,'-')), ',' order by sign_id))
--      = 400f3c8c7cbb62244552b42125b2b537   <- the issued snapshots
--   S2 md5(string_agg(sign_id||':'||coalesce(status,'-')||':'||coalesce(signed_at,'-'), ',' order by sign_id))
--      = ab9da97ff37196ce4895474f21ed8aa8   <- participant response state
--   S3 md5(string_agg(sign_id||':'||coalesce(signature,'-'), ',' order by sign_id))
--      = 17620136382960bf404c55313fc134b5   <- captured signature images
--
-- S1 and S3 must be IDENTICAL afterwards. S2 must also be identical: this
-- migration writes no status and no signed_at.
--
-- NOTE ON S2: it differs from the value recorded in
-- reissue_supersession_2026-10-04.sql (72b2cd21…). That is expected and is not
-- drift — the daily expiry sweep moved the 15 then-'sent' rows to 'expired' in
-- the interval, which is exactly what that cron exists to do.
-- ============================================================================


-- ── 1. WHAT COMPASS ACTUALLY KNOWS ABOUT COMMUNICATION ─────────────────────
--
-- timestamptz, not text. The existing participant timestamps are text for
-- historical reasons; new evidential columns should not inherit that, and these
-- are written only by the server.
alter table public.signing_requests
  add column if not exists send_attempted_at   timestamptz,
  add column if not exists send_accepted_at    timestamptz,
  add column if not exists send_error          text,
  add column if not exists provider_message_id text;

comment on column public.signing_requests.send_attempted_at is
  'When Compass actually called the email provider for this request. NULL means no send has been attempted — which for every one of the 104 pre-migration rows is the honest answer, because that fact was never recorded. NULL must never be read as "not sent"; it means UNKNOWN for historical rows and "not attempted" for rows created after this migration.';

comment on column public.signing_requests.send_accepted_at is
  'When the email provider ACCEPTED the message (a 2xx from Resend). This is the strongest communication claim Compass is entitled to make. It is NOT delivery and NOT receipt: Resend accepting a message says nothing about the recipient''s mail server. There is deliberately no delivered_at column, because there is no delivery evidence to put in it.';

comment on column public.signing_requests.send_error is
  'The provider or transport failure for the most recent send attempt, if it failed. Cleared when a later attempt is accepted, so it always describes the CURRENT communication state rather than accumulating history. Never shown to the participant.';

comment on column public.signing_requests.provider_message_id is
  'The provider''s own id for the accepted message, where it supplies one. Lets a human reconcile Compass''s claim against the provider''s logs — which is the only way an acceptance claim can be independently checked.';


-- ── 2. COMMUNICATION EVIDENCE IS COMPLETE OR ABSENT ────────────────────────
--
-- Four rules, each closing a way the row could tell a half-truth:
--   · acceptance without an attempt is incoherent;
--   · a failure without an attempt is incoherent;
--   · accepted AND failed at once is two contradictory claims — a retry that
--     succeeds must CLEAR the error, so these columns always describe one
--     current state rather than a pile of attempts;
--   · a provider message id without acceptance would be an id for a message
--     the provider never took.
--
-- All 104 existing rows have all four NULL and therefore satisfy this.
alter table public.signing_requests
  drop constraint if exists signing_requests_send_evidence_complete;
alter table public.signing_requests
  add constraint signing_requests_send_evidence_complete
  check (
    (send_accepted_at is null or send_attempted_at is not null)
    and (send_error is null or send_attempted_at is not null)
    and not (send_accepted_at is not null and send_error is not null)
    and (provider_message_id is null or send_accepted_at is not null)
  );


-- ── 3. FINDING REQUESTS THAT WERE PREPARED BUT NEVER GOT OUT ───────────────
--
-- The orphan shape this slice exists to make visible: a current, unanswered
-- request with no accepted send. Partial so it indexes only the rows anyone
-- would ever chase.
create index if not exists signing_requests_unsent_open
  on public.signing_requests (created_at)
  where send_accepted_at is null
    and superseded_at is null
    and status in ('pending','sent','opened');


-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================
-- * It does not add, remove or widen a single `status` value, and does not
--   touch signing_requests_status_valid. Communication is a separate axis.
-- * It does not add `delivered_at`. Compass has no delivery evidence, and a
--   column invites someone to fill it from something weaker.
-- * It does NOT backfill send_attempted_at / send_accepted_at for the 62 signed
--   rows, even though a signature is strong circumstantial proof the email
--   arrived. Inferring provider acceptance from participant behaviour would be
--   manufacturing evidence, and after the fact it would be indistinguishable
--   from evidence recorded at the time. Unknown stays unknown.
-- * It does not retroactively server-attest signed_at on the 62 historical
--   signatures. Those values were client-supplied and remain so; only NEW
--   responses are server-timed.
-- * It does not manufacture recipient provenance for the 87 rows with no
--   employee_email.
-- * It adds no policy. signing_requests stays RLS-enabled with zero policies —
--   service-role only (runtime-verified: as `authenticated`, SELECT returns 0
--   rows and UPDATE matches 0 rows).
-- * It adds no trigger. Immutability of `document` is enforced by the handler
--   allow-lists plus the zero-policy RLS posture, as before.
--
-- ============================================================================
-- ROLLBACK (complete; no data to restore, because nothing was backfilled)
-- ============================================================================
--   drop index if exists public.signing_requests_unsent_open;
--   alter table public.signing_requests
--     drop constraint if exists signing_requests_send_evidence_complete;
--   alter table public.signing_requests
--     drop column if exists provider_message_id,
--     drop column if exists send_error,
--     drop column if exists send_accepted_at,
--     drop column if exists send_attempted_at;
--
-- Rolling back restores "a row that says sent whether or not anything was
-- sent". Any communication evidence recorded after this migration is lost —
-- export first. No pre-migration value is altered either way.
-- ============================================================================
