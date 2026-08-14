-- Manager Enablement (Phase 4, MP19, §15) — HR Intervention actions.
-- "Pause" is deliberately scoped narrow: a boolean + audit entry (App.jsx's
-- own audit() call, not a new table), not a new status state machine.
-- MP17's computeDueSoon and MP18's computeDelegatedWork both respect it
-- by excluding/flagging paused cases — nothing more.

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS investigation_paused boolean NOT NULL DEFAULT false;
