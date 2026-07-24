-- ============================================================================
-- Compliance nudges: daily email digest opt-in — 2026-07-24
--
-- Adds a per-member toggle for the new daily deadline-digest email (sent by
-- api/cron/digest.js). Defaults to true: for a compliance tool, silently
-- missing a statutory ACAS deadline is the exact failure mode this product
-- exists to prevent, so opt-out (not opt-in) is the safer default.
--
-- No RLS changes needed — the existing "org_members_update_same_org" policy
-- (see fix_org_members_recursion_2026-07-23.sql) already lets any
-- authenticated member of an org update rows in that org, which covers the
-- client-side Settings toggle writing this column.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table org_members
  add column if not exists email_digest_opt_in boolean not null default true;
