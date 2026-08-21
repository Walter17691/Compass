-- ============================================================================
-- Organisational ER Intelligence (Phase 6, OP23, §19) — Impact tracking
-- ============================================================================
-- Adds the fields improvement_initiatives (OP22,
-- improvement_initiatives_2026-08-20.sql) needs to genuinely compare a
-- metric before vs after an initiative's completion:
--
-- - completed_at: stamped once, client-side, the first time an
--   initiative's status transitions to 'completed' (App.jsx's
--   updateImprovementInitiative) — the real anchor date the before/after
--   comparison is built around. Not derived from updated_at, which
--   changes on every later edit (an outcome note added weeks after
--   completion shouldn't shift the anchor).
-- - metric_kind / metric_value: which real, already-tracked metric this
--   initiative is meant to affect — either a case type (metric_value is
--   the raw cases.case_type string, same open-string-set treatment
--   org_trend_detection()'s by_type_trend already gives case types, no
--   fixed enum) or an organisation_themes.id (OP6). No fabricated link
--   is inferred from supporting_insights' free text — HR sets this
--   explicitly, same "HR confirms, Compass never guesses precision it
--   doesn't have" discipline as the theme-suggestion flow (OP6).
--
-- No new RPC: src/lib/impactTracking.js computes p_period_days as the
-- real number of days since completed_at and calls org_trend_detection()
-- (OP7) with it — since that RPC already compares "last N days" against
-- "the N days before that" anchored on NOW, choosing N = days-since-
-- completion makes "last N days" exactly the post-completion window and
-- "the N days before that" exactly the pre-completion window, a genuine
-- reuse of OP7's existing trend engine, not a re-derivation.
--
-- HOW TO APPLY: paste the whole block below.
-- ============================================================================

alter table public.improvement_initiatives add column if not exists completed_at timestamptz;
alter table public.improvement_initiatives add column if not exists metric_kind text check (metric_kind is null or metric_kind in ('case_type', 'theme'));
alter table public.improvement_initiatives add column if not exists metric_value text;
