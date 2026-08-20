-- ============================================================================
-- Organisational ER Intelligence (Phase 6, OP19) — Weekly/Monthly/Quarterly
-- ER Review
-- ============================================================================
-- Reuses er_executive_briefs_2026-08-20.sql's table rather than a
-- second, near-identical one — both are "persisted AI narrative +
-- deterministic supporting_data snapshot, HR-only" (§15 and §16 are
-- architecturally the same shape; only the content focus and period
-- framing differ, which the client-side prompt already varies without
-- needing a schema difference). period_type distinguishes a periodic
-- review (weekly/monthly/quarterly) from OP18's own ad-hoc brief
-- (period_type is null for those, unchanged).
--
-- HOW TO APPLY: paste the whole block below.
-- ============================================================================

alter table public.er_executive_briefs
  add column if not exists period_type text check (period_type in ('weekly', 'monthly', 'quarterly'));

create index if not exists er_executive_briefs_period_type_idx on public.er_executive_briefs(org_id, period_type);
