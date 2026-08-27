-- ============================================================================
-- Indexes for RLS-subquery columns — 2026-08-26 (closes independent audit
-- finding 9.3, "moderate confidence — needs live verification before
-- acting")
--
-- The audit's own concern: almost every RLS policy in this schema filters
-- on org_id (directly, or via my_org_ids()/EXISTS against org_members), and
-- a table with no supporting index pays for a sequential scan on every
-- request, growing worse as rows accumulate.
--
-- Verification done before writing this file (see pg_indexes /
-- pg_policies / row counts, checked directly against the live database):
--
--   - my_org_ids() (select org_id from org_members where user_id =
--     auth.uid()) has no supporting index — org_members' only relevant
--     index is (org_id, user_id), org_id-leading, which doesn't serve a
--     bare user_id lookup. BUT org_members currently has 4 rows total
--     (one row per user per org, inherently a small table). A btree
--     index over 4 rows is pure write-path overhead with no read benefit
--     — Postgres will rightly ignore it and seq-scan regardless. Not
--     added. Revisit only if org_members genuinely grows into the
--     thousands (i.e. an org with thousands of real members, not
--     expected at this product's scale).
--   - Same reasoning, same conclusion, for locations (4 rows), org_roles
--     (1), leaver_instances (107), starter_instances (105), dsar_requests
--     (140), manager_capability_insights (2), wellbeing_notes (126),
--     concern_referrals (110), case_access (200, and already has a
--     (case_id, user_id) index besides). None of these are large enough
--     yet for a missing index to cost anything real.
--   - cases (2,938 rows and climbing — this repo's own Phase 6 planning
--     doc already describes a single org past 1,000 cases) has NO index
--     beyond its primary key. Every cases policy (the base grant, the
--     confidential-case restriction, the non-oversight restriction)
--     filters on org_id, directly hit on every list/dashboard load.
--   - case_tasks (1,450 rows, same growth trajectory as cases) also has
--     no index beyond its primary key. Its own RLS EXISTS-joins through
--     cases by case_id, and the app's own loadCaseTasks queries by
--     case_id directly; the org-level-task branch (case_id IS NULL)
--     filters by org_id.
--
-- Plain (non-concurrent) CREATE INDEX is fine here — both tables are
-- small enough (low thousands of rows) that the exclusive lock this takes
-- is sub-second, not the kind of production-hours risk CONCURRENTLY
-- exists for.
-- ============================================================================

create index if not exists cases_org_id_idx on public.cases (org_id);

create index if not exists case_tasks_case_id_idx on public.case_tasks (case_id);
create index if not exists case_tasks_org_id_idx on public.case_tasks (org_id);
