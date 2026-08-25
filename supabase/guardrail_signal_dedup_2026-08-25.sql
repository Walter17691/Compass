-- ============================================================================
-- Phase 6.5 — Structural remediation (Prompt 12, Family 5)
-- GUARDRAIL SIGNAL LIFECYCLE — dedup + a real uniqueness constraint
-- ============================================================================
-- App.jsx's own syncGuardrailSignals dedupes case_signals by exact
-- (case_id, type, title) — "no signal, any status, with this title
-- already exists" is the invariant the code comments describe. A
-- Prompt-10 fix (guardrailSyncedTitlesRef) already closed the SAME-TAB
-- race (two fires of the sync effect in one render cycle, before the
-- first write had landed), but that's a plain in-memory React ref — it
-- protects nothing across two tabs/devices with the same case open, or
-- two overlapping requests from a slow network. Live query on
-- 2026-08-25 confirms this is not theoretical: real duplicate rows exist
-- today, e.g. one case has 4 separate "A finding was recorded with
-- little or no reasoning" signals where exactly one should exist.
--
-- This migration:
--   1. Deduplicates existing case_signals rows, keeping one canonical
--      row per (case_id, type, title): prefers a row a human has already
--      acted on (status <> 'open') over a still-open duplicate, since
--      that reflects real engagement worth preserving; ties broken by
--      earliest created_at (the original). Every other row in the group
--      is deleted.
--   2. Adds a real UNIQUE constraint on (case_id, type, title) — the
--      database-level enforcement of the exact invariant the application
--      code already assumes, closing the cross-tab/cross-request gap no
--      client-side ref can. Any future duplicate INSERT now fails
--      outright instead of silently succeeding.
--
-- This does NOT change apply-side behaviour beyond that: App.jsx's own
-- createSignal (src/lib/caseSignals.js) already checks for an existing
-- title before inserting, so a legitimate re-trigger already goes
-- through an UPDATE, not an INSERT, in the normal single-request case —
-- the constraint is a backstop for the race, not a new code path.
--
-- HOW TO APPLY: paste the whole file in one Supabase SQL Editor run.
-- Read PART 1's dedup logic before running — it permanently deletes rows
-- (the ones NOT kept), which cannot be undone.
-- ============================================================================


-- ============================================================================
-- PART 1 — dedup existing rows
-- ============================================================================
with ranked as (
  select
    id,
    row_number() over (
      partition by case_id, type, title
      order by (status <> 'open') desc, created_at asc, id asc
    ) as rn
  from public.case_signals
)
delete from public.case_signals
where id in (select id from ranked where rn > 1);


-- ============================================================================
-- PART 2 — verify (should return zero rows before proceeding to PART 3)
-- ============================================================================
select case_id, type, title, count(*)
from public.case_signals
group by case_id, type, title
having count(*) > 1;


-- ============================================================================
-- PART 3 — the real constraint
-- ============================================================================
alter table public.case_signals
  add constraint case_signals_case_type_title_unique unique (case_id, type, title);
