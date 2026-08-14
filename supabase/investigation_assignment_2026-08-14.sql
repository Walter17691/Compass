-- Manager Enablement (Phase 4, MP7, §7) — Investigation assignment gains
-- scope: which specific allegations the investigator should look at (a
-- subset, not implicitly "all" — the only thing assignInvestigator wrote
-- before this was the bare case_access grant), a target completion date
-- (feeds MP17's deadline grouping and MP20's average-completion-time
-- metric), and a short free-text scope note. Nullable and additive on the
-- existing case_access row rather than a new table — these three fields
-- only ever get written by assignInvestigator's own upsert (role
-- "investigator"); every other case_access role leaves them null.
-- scope_allegation_ids is text[] not uuid[]: allegation ids are
-- client-generated strings ("alg_" + Date.now(), see src/lib/allegations.js),
-- not real uuids.

ALTER TABLE public.case_access
  ADD COLUMN IF NOT EXISTS scope_allegation_ids text[],
  ADD COLUMN IF NOT EXISTS target_completion_date date,
  ADD COLUMN IF NOT EXISTS scope_note text;
