-- ============================================================================
-- Audit trail — automation provenance fields — 2026-08-19
-- ============================================================================
-- Integrations & Workflow Automation (Phase 5, IP30, §29) — extends the
-- existing audit_log table (audit_log_cloud_sync_2026-07-25.sql,
-- case_structure_2026-08-09.sql's later case_id addition) with the
-- fields the spec specifically asks for that today's generic
-- action/detail/user/timestamp log doesn't carry: whether AI prepared
-- the action, who approved it, what data was used, and whether it was
-- later changed.
--
-- Needs IP28/IP29's actions actually running to have something real to
-- log in this shape — App.jsx's resendSignatureReminder (the one real
-- Prepare/Automate action so far) is the first real caller.
--
-- Purely additive and nullable — no existing row or query breaks.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table public.audit_log
  add column if not exists ai_prepared boolean default false,
  add column if not exists approved_by text,
  add column if not exists data_used text,
  add column if not exists changed_after boolean default false;
