-- ============================================================================
-- E-signature/acknowledgement expansion — 2026-08-18
-- ============================================================================
-- Integrations & Workflow Automation (Phase 5, IP27, §21) — extends the
-- existing, working signing_requests table (baseline_schema_2026-08-06.sql)
-- from meeting records only, pending/signed only, to outcome letters,
-- agreed adjustments, and consultation records, with a real status
-- lifecycle: sent -> opened -> signed/acknowledged/declined, or expired.
--
-- document_type generalises the existing meeting_type/meeting_date
-- columns (kept as-is, still populated for meeting records specifically)
-- to identify what KIND of document this is, so the signing page and any
-- future reporting can tell them apart.
--
-- requires_signature distinguishes a document that needs a drawn
-- signature (a meeting record) from one where a simple acknowledgement
-- is enough (an outcome letter, an agreed-adjustments record) — both are
-- legitimate, real confirmations, just different in kind.
--
-- opened_at/expires_at/declined_at/decline_reason back the widened
-- status vocabulary. A decline is recorded as a plain fact for HR to
-- follow up on, never treated as evidence the document's content was
-- wrong — nothing here auto-triggers off a decline besides the existing
-- manager-notification email api/signing.js already sends.
--
-- Purely additive and nullable — no existing row or query breaks.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table public.signing_requests
  add column if not exists document_type text default 'meeting_record',
  add column if not exists requires_signature boolean default true,
  add column if not exists opened_at text,
  add column if not exists expires_at text,
  add column if not exists declined_at text,
  add column if not exists decline_reason text;
