-- ============================================================================
-- Phase 6.5 — Structural remediation (Prompt 12, Family 7)
-- SIGNING_REQUESTS LEGACY ORG_ID BACKFILL
-- ============================================================================
-- Live query on 2026-08-25 found 107 of signing_requests' 114 rows have
-- org_id IS NULL. api/delete-org-data.js's DELETE is always
-- `signing_requests?org_id=eq.<orgId>` — a null org_id row can never match
-- ANY org's own "Delete all data" / DSAR erasure request, no matter which
-- org runs it. These 107 rows include real signature images and document
-- text for anyone whose org has already run "Delete all data" believing
-- everything was erased.
--
-- This is legacy data, not a live bug: git history confirms
-- c133e43 (2026-08-21 15:18 BST) added the org-membership check that
-- makes api/signing.js's create path always set org_id going forward —
-- the newest orphaned row (13:41 UTC the same day) predates that commit.
-- No new orphaned rows are being created today.
--
-- Reconciliation, re-derived fresh against live data (not carried over
-- from an earlier, now-stale estimate):
--   - 81 rows: employee_name matches exactly one org's cases.employee_name
--     (case-insensitive) — unambiguous, backfilled below.
--   - 0 rows: matched more than one org (would need manual review — there
--     happen to be none right now).
--   - 26 rows: match no org's cases at all by name. Read every one of
--     them below before deciding — this migration does NOT delete them.
--     Nearly all are obviously placeholder/dev data ("Employee",
--     "mate not", "gig ghg", footballer names used as test fixtures, one
--     literal "E2E SignSync <timestamp>" row) rather than real employee
--     records, but that is a judgement call for a human, not this script.
--
-- HOW TO APPLY:
--   1. Run PART A below — backfills the 81 unambiguous rows. Safe,
--      reviewable (each row's assigned org_id comes from a real,
--      currently-existing case with that exact employee name).
--   2. Run the SELECT in PART B and read the 26 rows yourself. If you
--      agree they're pre-production test data, uncomment and run the
--      DELETE beneath it. If any look like real records, leave them —
--      they simply stay excluded from erasure until you can attribute
--      them by some other means.
--   3. Only once every signing_requests row has a real org_id (re-run
--      the verification SELECT at the bottom to confirm 0 remain), run
--      PART C to add the NOT NULL constraint so this can't recur.
-- ============================================================================


-- ============================================================================
-- PART A — backfill the 81 unambiguous rows
-- ============================================================================
update public.signing_requests sr
set org_id = matched.org_id
from (
  select distinct on (sr2.id) sr2.id, c.org_id
  from public.signing_requests sr2
  join public.cases c on lower(c.employee_name) = lower(sr2.employee_name)
  where sr2.org_id is null and sr2.employee_name is not null and sr2.employee_name <> ''
  -- distinct on (sr2.id) + this filter guarantees we only touch rows that
  -- matched exactly one org — the same "1 or 0 orgs, never ambiguous"
  -- check the investigation query used, expressed so the UPDATE itself
  -- can never silently pick an arbitrary org for a genuinely ambiguous row.
  and (select count(distinct c2.org_id) from public.cases c2 where lower(c2.employee_name) = lower(sr2.employee_name)) = 1
) matched
where sr.id = matched.id;


-- ============================================================================
-- PART B — the 26 rows with no match at all. READ before acting.
-- ============================================================================
select sign_id, employee_name, status, created_at
from public.signing_requests
where org_id is null
order by created_at;

-- Uncomment and run only after reading the list above and agreeing these
-- are pre-production test/dev fixtures, not real employee records:
--
-- delete from public.signing_requests where org_id is null;


-- ============================================================================
-- PART C — run only once the verification below returns 0
-- ============================================================================
-- select count(*) from public.signing_requests where org_id is null;
--
-- alter table public.signing_requests alter column org_id set not null;
