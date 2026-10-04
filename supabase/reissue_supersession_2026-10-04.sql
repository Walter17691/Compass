-- ============================================================================
-- RE-ISSUE SUPERSESSION — 2026-10-04  (Pre-V1 Trust Slice 1b)
-- ============================================================================
-- HOW TO APPLY: paste into the Supabase SQL Editor and run, as ONE unit.
--
-- ADDITIVE ONLY. Four nullable columns, one partial unique index, one CHECK.
-- NO BACKFILL: not one historical row is classified, re-stated or rewritten.
--
-- ┌─ THE GAP THIS CLOSES ───────────────────────────────────────────────────┐
-- │ Re-issuing a record created a second signing request and overwrote        │
-- │ meetings[].signId with the newer one. "Newest signId wins" was the whole  │
-- │ model, and it left three holes:                                          │
-- │                                                                         │
-- │   · the earlier request stayed live and SIGNABLE. A participant holding   │
-- │     the first email could still sign it, and because the client polls     │
-- │     only meeting.signId, that signature would never appear in Compass.    │
-- │     A real participant response, invisible to the case.                  │
-- │   · the earlier snapshot became unreachable from the UI.                 │
-- │   · nothing recorded that one request replaced another, or when, or by    │
-- │     whom.                                                               │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ WHY SUPERSESSION IS NOT A STATUS ──────────────────────────────────────┐
-- │ A request that was SIGNED and later superseded is still, historically,    │
-- │ signed. Collapsing currency into `status` would overwrite that fact with  │
-- │ 'superseded' and destroy the very history this slice exists to protect.   │
-- │                                                                         │
-- │ So the two ideas are kept apart, deliberately:                           │
-- │                                                                         │
-- │   status          what the PARTICIPANT did        (never overwritten)     │
-- │   superseded_at   whether the request is CURRENT  (null = current)        │
-- │                                                                         │
-- │ "Signed, then superseded" is therefore representable, and readable.      │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- PRE-MIGRATION BASELINE (production, read-only, immediately before applying).
-- Digest EXPRESSIONS recorded, not just values:
--
--   signing_requests 104 (pending 27, sent 15, signed 62) · policies 0 ·
--   public base tables 44 · new columns present 0
--
--   S1 md5(string_agg(sign_id||':'||md5(coalesce(document,'-')), ',' order by sign_id))
--      = 400f3c8c7cbb62244552b42125b2b537      <- the issued snapshots
--   S2 md5(string_agg(sign_id||':'||coalesce(status,'-')||':'||coalesce(signed_at,'-'), ',' order by sign_id))
--      = 72b2cd21bdf598a13e6a71feb8dd1d28      <- participant response state
--   S3 md5(string_agg(sign_id||':'||coalesce(signature,'-'), ',' order by sign_id))
--      = 17620136382960bf404c55313fc134b5      <- captured signature images
--   M1 md5(string_agg(id||':'||md5(coalesce(meetings::text,'-')), ',' order by id)) ON cases
--      = 5cb0552bc1a5546849364f3d802f87c5
--   D1 md5(string_agg(id||':'||coalesce(status,'-'), ',' order by id)) ON allegations
--      = 084dedd8581418aa232532a6ee95f063
--   D8 md5(string_agg(id||':'||coalesce(outcome,'-'), ',' order by id)) ON case_decisions
--      = 57aea3348667427bafc5823a7c4317e9
--
-- S1, S2 and S3 are the ones that prove no historical signed state was touched.
-- All six must be IDENTICAL afterwards.
-- ============================================================================


-- ── 1. A request knows which document it belongs to ────────────────────────
--
-- signing_requests had NO link back to its meeting or case. The only connection
-- was meetings[].signId, pointing one way out of a jsonb blob — so the server
-- could not answer "what other requests exist for this document?", which is
-- exactly the question supersession requires.
--
-- meeting_id is TEXT because meeting ids are client-generated strings living
-- inside cases.meetings, not rows with a uuid key. No foreign key is possible
-- against a value held inside a jsonb array, which is also why the tenancy rule
-- below does not apply to it.
alter table public.signing_requests
  add column if not exists meeting_id text;

comment on column public.signing_requests.meeting_id is
  'The meeting whose record this request issued, as the client-generated id held in cases.meetings[].id. NULL on the 104 historical rows and on letter requests, which is why the currency index below is partial. Set server-side from the send payload after org membership is verified.';

-- ┌─ A CASE_ID COLUMN WAS ADDED HERE AND REMOVED AGAIN ─────────────────────┐
-- │ The first version of this migration also added                            │
-- │   case_id uuid references public.cases(id) on delete set null             │
-- │ as a convenience for chain queries. The NEW-44D structural tenancy gate   │
-- │ failed it within minutes, and was right to: a SINGLE-column reference to  │
-- │ a tenant-scoped parent, on a table that carries org_id, is exactly how a  │
-- │ row ends up pointing at another tenant's case. The house pattern is the   │
-- │ composite (case_id, org_id) REFERENCES cases(id, org_id), which           │
-- │ case_decisions uses and which cases_id_org_key already supports.          │
-- │                                                                         │
-- │ The column was DROPPED rather than converted, because it was never load-  │
-- │ bearing: meeting_id plus the existing org_id answer every question        │
-- │ supersession asks. Dropped before any row used it (0 of 104). Recorded    │
-- │ here because a governance gate catching a migration is worth leaving on   │
-- │ the record, not quietly editing out.                                     │
-- └─────────────────────────────────────────────────────────────────────────┘


-- ── 2. Currency, kept separate from participant response state ─────────────
alter table public.signing_requests
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_sign_id text,
  add column if not exists superseded_by uuid references auth.users(id);

comment on column public.signing_requests.superseded_at is
  'When this request stopped being the current one for its document. NULL means current. Deliberately NOT a status value: a request that was signed and later superseded is still historically signed, and overwriting status would erase that.';
comment on column public.signing_requests.superseded_by_sign_id is
  'The sign_id of the request that replaced this one. Intentionally NOT a foreign key: the predecessor must be superseded BEFORE the successor is inserted (otherwise the partial unique index below briefly sees two current requests), so at write time the referenced row does not exist yet and a non-deferrable FK could never be satisfied across two PostgREST calls. Integrity is asserted by test instead. NEVER returned to an unauthenticated caller — it is the successor''s token.';
comment on column public.signing_requests.superseded_by is
  'Who re-issued, causing this supersession. Derived server-side from the verified session in api/signing.js; never accepted from the request body.';


-- ── 3. AT MOST ONE CURRENT REQUEST PER DOCUMENT ────────────────────────────
--
-- The invariant that makes "which request controls progression?" answerable, and
-- enforced by the database rather than by whichever code path happens to run.
--
-- PARTIAL in two ways, both load-bearing:
--   · `superseded_at is null` — superseded rows are history and may pile up.
--   · `meeting_id is not null` — the 104 historical rows carry NULL and must not
--     collide with each other, and letter requests legitimately have no meeting.
--
-- A replayed re-issue therefore cannot produce two current requests: the second
-- attempt either supersedes the first (idempotent) or is refused by this index.
create unique index if not exists signing_requests_one_current_per_meeting
  on public.signing_requests (meeting_id)
  where superseded_at is null and meeting_id is not null;


-- ── 4. A supersession is complete or absent, never half-recorded ───────────
alter table public.signing_requests
  drop constraint if exists signing_requests_supersession_complete;
alter table public.signing_requests
  add constraint signing_requests_supersession_complete
  check (
    (superseded_at is null and superseded_by_sign_id is null and superseded_by is null)
    or
    (superseded_at is not null and superseded_by_sign_id is not null and superseded_by is not null)
  );


-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================
-- * It does not infer supersession for any historical row. Several historical
--   requests reference similar content, and "similar content" is not evidence
--   that one replaced another. All 104 rows keep superseded_at NULL — meaning
--   CURRENT, which for a single-request document is the truth, and for anything
--   ambiguous is the honest unknown. Unknown stays unknown.
-- * It does not backfill meeting_id. They could be derived by
--   scanning cases.meetings for each signId, but a derived value written into a
--   provenance column is indistinguishable afterwards from one recorded at the
--   time. New requests carry them; old ones say nothing.
-- * It does not rewrite a single status. No 'superseded' status exists.
-- * It adds no policy. signing_requests remains RLS-enabled with zero policies.
-- * It adds no `delivered` anything.
--
-- ============================================================================
-- ROLLBACK (complete; no data to restore, because nothing was backfilled)
-- ============================================================================
--   drop index if exists public.signing_requests_one_current_per_meeting;
--   alter table public.signing_requests
--     drop constraint if exists signing_requests_supersession_complete;
--   alter table public.signing_requests
--     drop column if exists superseded_by,
--     drop column if exists superseded_by_sign_id,
--     drop column if exists superseded_at,
--     drop column if exists meeting_id;
--
-- Rolling back restores "newest signId wins", including the invisible-response
-- hole. Any supersession recorded after this migration is lost — export first.
-- No pre-migration value is altered either way.
-- ============================================================================
