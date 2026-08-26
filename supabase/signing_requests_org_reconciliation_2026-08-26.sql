-- ============================================================================
-- Phase 6.5 — Structural remediation (Prompt 14, Section 4)
-- SIGNING_REQUESTS ORG RECONCILIATION — re-run against current data
-- ============================================================================
-- SUPERSEDES supabase/signing_requests_org_backfill_2026-08-25.sql (never
-- applied). That draft matched purely by employee name (81 matched, 26
-- unmatched) — Prompt 14 requires trying stronger identifiers first and
-- classifying every null-org row CONFIRMED / AMBIGUOUS / TEST-ORPHAN
-- rather than guessing. Re-run on 2026-08-26 against current data: same
-- 107 null-org rows as the prior count (81+26) — confirms no NEW null-org
-- rows have been created since api/signing.js's requireOrgMembership gate
-- started rejecting requests with no orgId (400), so this is a purely
-- historical/backward-looking cleanup, not an active leak.
--
-- signing_requests has no case_id/meeting_id/employee_record_id/created_by
-- column — the strongest available identifiers are cross-table joins, tried
-- in this order:
--   1. cases.meetings[].signId -> signing_requests.sign_id (an explicit,
--      literal link the app itself writes when a document is sent from a
--      case's meeting — the strongest possible signal, not inferred).
--      77 rows matched, all to a single unambiguous org.
--   2. cases.employee_name -> signing_requests.employee_name, but only
--      where every other route above found nothing AND the match resolves
--      to exactly one org. This is safe here specifically because the E2E
--      signature-sync suite's employee_name is a generated, effectively
--      unique string ("E2E SignSync <timestamp>"), not a generic reused
--      name — functionally an identifier, not name-matching in the risky
--      sense Prompt 14 warned about. 4 rows matched, all to one org.
--   3. org_members.name -> signing_requests.manager_name, only where it
--      resolves to exactly one org (most manager names in this table are
--      generic placeholders — "Manager", "Walter" — that correctly do NOT
--      match any real org_members.name and fall through unmatched, rather
--      than being force-matched). 9 rows matched, all to one org
--      (dbe871c5-e6fe-45d8-8bc4-201e487579be, "Compass LTD" — the real
--      account's own org; these specific rows are the account holder's own
--      manual feature testing, given the employee names are footballers
--      "Luis Figo"/"Francesco Totti" and other obvious placeholders, not
--      real HR case data — org attribution is genuinely correct, the
--      row *content* is what's synthetic).
--
-- CLASSIFICATION (90 + 1 + 16 = 107, matches the total):
--   CONFIRMED (90): backfilled below. 77 via signId, 4 via employee_name,
--     9 via manager_name — every one resolves to exactly one org, verified
--     via a HAVING count(distinct org_id)=1 guard, not assumed.
--   AMBIGUOUS (1): sign_id de4973d7-fa9c-4edb-9847-242e8c48112d
--     ("E2E SignSync 1786552344407", manager_name "Test Compass", no
--     employee_email, no matching case). "Test Compass" is the same real
--     user across BOTH E2E Test Org (7980b6a6-8575-4228-8f83-37e6dec6995b)
--     and E2E Second Org (b9b36250-271f-4340-a3cf-5a64bf49ecac) — cannot
--     be resolved without guessing. NOT backfilled. See PART 3.
--   TEST-ORPHAN (16): no identifier above resolves to any org at all —
--     placeholder/garbage names from early manual dev-testing of the
--     e-signature feature (e.g. "Employee"/"Manager", "mate not"/"jack
--     nic", "Tom hanks"/"Hun hd"), plus one self-labelled
--     "James Okafor (Appeal Window Test)". NOT auto-deleted — see PART 3
--     for the full list and why leaving them is safe.
--
-- EXPOSURE CHECK (both AMBIGUOUS and TEST-ORPHAN rows, 17 total): verified
-- these pose no active cross-tenant exposure. api/portal/_signatures.js's
-- listing query filters `org_id=eq.<account.org_id>` — a null org_id can
-- never equal any real org_id in Postgres, so these rows are invisible to
-- every portal account's pending-signature list regardless of org, and its
-- ownership check (`existing.org_id !== account.org_id`) also rejects a
-- null-org row for any caller. They are inert, not exposed — safe to leave
-- unattributed rather than guess.
--
-- CONSTRAINT: NOT NULL is NOT added — 17 rows genuinely cannot satisfy it
-- without guessing, which Prompt 14 explicitly forbids. New rows already
-- cannot be created without a valid org_id (requireOrgMembership, applied
-- in an earlier pass of this engagement) — enforced at the application
-- layer, not the DB, for exactly this reason: a DB-level NOT NULL would
-- block if a legitimate future need arose to defer org assignment, but
-- more importantly there is nothing left un-backfillable that a
-- constraint would newly protect against (see exposure check above).
--
-- HOW TO APPLY: paste the whole file in one Supabase SQL Editor run. PART 1
-- is idempotent (every UPDATE re-targets only org_id is null rows, so a
-- re-run after PART 1 already landed is a no-op).
--
-- STATUS (Prompt 14, 2026-08-26): LIVE on production (npeegfsoijhdnnvuqjin).
-- 90/107 backfilled exactly as classified above; verified remaining count
-- is 17. Real GDPR/DSAR gap closed by this backfill, not just a labelling
-- fix: signing_requests IS in ORG_SCOPED_TABLES (src/lib/dataInventory.js)
-- and IS deleted by api/delete-org-data.js's org-erasure flow, scoped by
-- `org_id=eq.<orgId>` — a null org_id made a row invisible to that filter,
-- so an org's full-erasure request would have silently skipped these rows
-- before this migration. Confirmed live: 84 of the 90 backfilled rows
-- belong to a single real org and are now genuinely reachable by that
-- org's own erasure/DSAR request. api/portal/_signatures.js's listing
-- query (`org_id=eq.<account.org_id>`) and ownership check were confirmed
-- to already treat a null-org row as inert/invisible to every portal
-- account regardless of org — the 17 remaining AMBIGUOUS/TEST-ORPHAN rows
-- carry no active cross-tenant exposure, backfilled or not.
-- ============================================================================


-- ============================================================================
-- PART 1 — backfill the 90 CONFIRMED rows
-- ============================================================================
with meeting_signs as (
  select c.id as case_id, c.org_id as case_org_id, m->>'signId' as sign_id
  from public.cases c, jsonb_array_elements(c.meetings) m
  where m->>'signId' is not null and m->>'signId' <> ''
),
by_signid as (
  select sr.sign_id, (array_agg(distinct ms.case_org_id))[1] as org_id
  from public.signing_requests sr join meeting_signs ms on ms.sign_id = sr.sign_id
  where sr.org_id is null group by sr.sign_id having count(distinct ms.case_org_id) = 1
)
update public.signing_requests sr set org_id = bs.org_id
from by_signid bs where bs.sign_id = sr.sign_id and sr.org_id is null;

with by_case_name as (
  select sr.sign_id, (array_agg(distinct c.org_id))[1] as org_id
  from public.signing_requests sr join public.cases c on c.employee_name = sr.employee_name
  where sr.org_id is null
  group by sr.sign_id having count(distinct c.org_id) = 1
)
update public.signing_requests sr set org_id = bc.org_id
from by_case_name bc where bc.sign_id = sr.sign_id and sr.org_id is null;

with by_manager_name as (
  select sr.sign_id, (array_agg(distinct om.org_id))[1] as org_id
  from public.signing_requests sr join public.org_members om on om.name = sr.manager_name
  where sr.org_id is null
  group by sr.sign_id having count(distinct om.org_id) = 1
)
update public.signing_requests sr set org_id = bm.org_id
from by_manager_name bm where bm.sign_id = sr.sign_id and sr.org_id is null;


-- ============================================================================
-- PART 2 — verify: should show exactly 17 remaining (1 ambiguous + 16 orphan)
-- ============================================================================
select count(*) as remaining_null_org from public.signing_requests where org_id is null;


-- ============================================================================
-- PART 3 — the AMBIGUOUS + TEST-ORPHAN remediation list (left untouched,
-- org_id stays null; see the exposure check above for why this is safe)
-- ============================================================================
select sign_id, employee_name, manager_name, employee_email, status, created_at
from public.signing_requests
where org_id is null
order by created_at;
