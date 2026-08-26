-- ============================================================================
-- Phase 6.5 — Structural remediation (Prompt 14, Section 3)
-- GUARDRAIL SIGNAL LIFECYCLE — real identity + dedup + legitimate recurrence
-- ============================================================================
-- SUPERSEDES supabase/guardrail_signal_dedup_2026-08-25.sql, which is NOT
-- applied and should not be. That draft proposed UNIQUE(case_id, type,
-- title) forever — Prompt 14 explicitly flagged this as unsafe without
-- first checking whether a guardrail condition can legitimately recur
-- (resolved, then re-triggers later): a permanent per-title uniqueness
-- constraint would make that impossible to ever represent as a new,
-- separately-actionable finding — the same way the CLIENT code already
-- (accidentally) behaves today, see guardrailSyncedTitlesRef's own comment
-- in App.jsx: "never re-creates a title once any row for it has existed,
-- resolved or not". That is a real, independent bug this migration also
-- fixes, not just preserves.
--
-- LIVE DATA INSPECTION (2026-08-26, before deciding the design below):
--   48 duplicate (case_id, type, title) groups, 104 rows total, 56 excess.
--   Every single group's rows were created within 60 SECONDS of each
--   other (widest span across all 48 groups: 1 minute; zero groups over
--   1 hour). This exactly matches App.jsx's own documented root cause —
--   syncGuardrailSignals firing more than once while a case's data is
--   still streaming in from separate REST loads, each fire closing over a
--   stale caseSignals snapshot. There is no live evidence of genuine
--   historical recurrence (a resolved signal whose condition returns
--   days/weeks later) anywhere in the current data — every existing
--   duplicate is classification (A), accidental re-representation of the
--   same active finding, not (B), legitimate separate occurrences. Safe
--   to dedupe all of them outright; see PART 2.
--
-- IDENTITY MODEL: title text was never a safe identity — it's presentation
-- copy (guardrails.js's own header comment already says as much: "title
-- is deliberately stable/fixed text" purely so the OLD title-based dedup
-- wouldn't spawn duplicates on every run, a workaround for not having a
-- real identifier). Each of the 8 check functions in guardrails.js
-- already returns a stable `id` (e.g. "chair_independence",
-- "decision_reasoning_missing") that was computed but never persisted or
-- used for identity. This migration adds `rule_id` and makes it the real
-- identity for guardrail-generated signals, matching the stable rule
-- identifier this section calls for instead of introducing a new one.
--
-- LIFECYCLE: the actual invariant a guardrail check needs is "at most one
-- OPEN occurrence of this rule on this case at a time" — not "at most one
-- occurrence ever". A PARTIAL unique index scoped to status = 'open'
-- enforces exactly that: it blocks two concurrent inserts from racing to
-- open the same finding (the real, confirmed bug above), while leaving a
-- resolved row's slot free for a later, genuinely new occurrence if the
-- condition regresses again — every resolved/dismissed/accepted row for
-- that rule stays in the table as real history, never overwritten.
--
-- HOW TO APPLY: paste the whole file in one Supabase SQL Editor run. It is
-- idempotent (IF NOT EXISTS / IF EXISTS throughout) and safe to re-run,
-- except PART 2's dedup DELETE, which only ever affects rows already
-- confirmed to be same-minute duplicates by PART 2's own WHERE clause —
-- re-running it after PART 1/3 have already landed is a no-op (rule_id
-- will already be set, and there will be nothing left to dedup).
--
-- STATUS (Prompt 14, 2026-08-26): LIVE on production (npeegfsoijhdnnvuqjin).
-- Backfill covered all 601 process_risk rows except 34 "Appeal review:
-- Unauthorised absence" rows — a legacy title format no current code path
-- produces (not "Appeal ground: ..." either; a pre-rename orphan),
-- correctly left with rule_id null and confirmed to have zero internal
-- duplicates of their own, same as the current Appeal ground signals.
-- Dedup: 48 groups / 56 excess rows removed, 0 remaining afterward.
-- Adversarially verified live via direct SQL: (1) a second concurrent
-- open-status INSERT for the same (case_id, rule_id) as an existing open
-- row correctly fails 23505 on case_signals_open_rule_unique: (2) after
-- resolving that row, a fresh open INSERT for the same (case_id, rule_id)
-- succeeds (real recurrence); (3) both the resolved original and the new
-- open occurrence remain independently queryable with their own
-- timestamps/resolution reasons (history preserved, not overwritten).
-- ============================================================================


-- ============================================================================
-- PART 1 — add rule_id, backfill it for existing guardrail-check rows
-- ============================================================================
alter table public.case_signals add column if not exists rule_id text;

-- One-to-one with guardrails.js's own check ids — kept in sync by
-- src/test/guardrails.test.js's existing title/id drift test.
update public.case_signals set rule_id = 'chair_independence'
  where type = 'process_risk' and rule_id is null
  and title = 'Same person chaired the investigation and the disciplinary hearing';
update public.case_signals set rule_id = 'evidence_after_report'
  where type = 'process_risk' and rule_id is null
  and title = 'Evidence added after the investigation report was concluded';
update public.case_signals set rule_id = 'appeal_clause_missing'
  where type = 'process_risk' and rule_id is null
  and title = 'Outcome letter may be missing the right of appeal';
update public.case_signals set rule_id = 'employee_response_opportunity'
  where type = 'process_risk' and rule_id is null
  and title = 'Allegations have no recorded employee response';
update public.case_signals set rule_id = 'witness_evidence_gap'
  where type = 'process_risk' and rule_id is null
  and title = 'Witness evidence referenced but no witness statement is on file';
update public.case_signals set rule_id = 'decision_reasoning_missing'
  where type = 'process_risk' and rule_id is null
  and title = 'A finding was recorded with little or no reasoning';
update public.case_signals set rule_id = 'reasoning_ignores_response'
  where type = 'process_risk' and rule_id is null
  and title = 'A finding''s reasoning may not address the employee''s response';
update public.case_signals set rule_id = 'appeal_manager_conflict'
  where type = 'process_risk' and rule_id is null
  and title = 'The Appeal Manager made the original decision';

-- Pre-Prompt-12 titles (embedded a variable count, e.g. "3 allegations
-- have no recorded employee response" / "An allegation has no recorded
-- employee response") map to the same rule as today's stable title —
-- confirmed present in the live duplicate-group scan above.
update public.case_signals set rule_id = 'employee_response_opportunity'
  where type = 'process_risk' and rule_id is null
  and (title like '% allegation% no recorded employee response' or title = 'An allegation has no recorded employee response');

-- "Appeal ground: ..." rows (generateAppealReview, App.jsx) are a
-- deliberately different, AI-generated signal source that happens to
-- share type = 'process_risk' — rule_id stays null for these, same as
-- any other non-guardrail signal type.


-- ============================================================================
-- PART 2 — dedup: for guardrail-owned rows only (rule_id is not null),
-- keep exactly one row per (case_id, rule_id) — every live duplicate
-- group is same-minute, confirmed accidental (see header). Prefers a row
-- a human has already acted on over a still-open duplicate; ties broken
-- by earliest created_at (the original occurrence).
-- ============================================================================
with ranked as (
  select
    id,
    row_number() over (
      partition by case_id, rule_id
      order by (status <> 'open') desc, created_at asc, id asc
    ) as rn
  from public.case_signals
  where rule_id is not null
)
delete from public.case_signals
where id in (select id from ranked where rn > 1);

-- Verify — should return zero rows before PART 3.
select case_id, rule_id, count(*)
from public.case_signals
where rule_id is not null
group by case_id, rule_id
having count(*) > 1;


-- ============================================================================
-- PART 3 — the real constraint: at most one OPEN occurrence per
-- (case_id, rule_id) at a time. Resolved rows are exempt, so a genuinely
-- new occurrence after resolution is a normal INSERT, not blocked.
-- ============================================================================
create unique index if not exists case_signals_open_rule_unique
  on public.case_signals (case_id, rule_id)
  where status = 'open' and rule_id is not null;
