-- ============================================================================
-- DSAR statutory extension support — 2026-08-01
--
-- UK GDPR Art. 12(3) allows extending the 1-month DSAR response deadline by
-- a further 2 months for complex or numerous requests, provided the
-- individual is told within the original month, with reasons. Adds the
-- fields needed to record that an extension was granted, why, and when —
-- the due_date column itself is updated in place to the new date, so the
-- existing overdue banner/digest/Settings deadline list all pick it up
-- automatically with no further changes.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table dsar_requests
  add column if not exists extended boolean not null default false,
  add column if not exists extension_reason text,
  add column if not exists extended_at timestamptz;
