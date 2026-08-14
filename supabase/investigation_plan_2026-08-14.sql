-- Manager Enablement (Phase 4, MP8, §9) — Investigation Plan. Tags which
-- case_tasks came from Compass's AI-generated, case-specific plan
-- (investigationPlan.js) as opposed to the fixed generic checklist
-- (investigationChecklist.js, whose tasks are plain, untagged rows) or an
-- ad-hoc addition. Nullable and additive — every existing row is
-- unaffected.

ALTER TABLE public.case_tasks
  ADD COLUMN IF NOT EXISTS source text;
