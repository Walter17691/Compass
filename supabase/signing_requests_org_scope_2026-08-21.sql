-- ============================================================================
-- Phase 6.5 hardening (P0) — close the signing_requests cross-tenant leak
-- ============================================================================
-- signing_requests intentionally has zero client-facing RLS policies
-- (baseline_schema_2026-08-06.sql's own comment: the signer isn't a
-- logged-in Compass user, so there's no session to scope RLS against —
-- api/signing.js and api/portal/_signatures.js are the only access
-- paths, both using the service-role key, which bypasses RLS entirely).
-- That makes application-level scoping the ENTIRE security boundary for
-- this table, and it was missing one: matching was done by employee_name
-- alone, with no org_id column to scope against at all — a portal user
-- at one org could read (and, on the write path, attach their own
-- forged signature to) another org's pending documents purely by
-- sharing a first+last name with someone at a different company.
--
-- org_id is nullable because there's no reliable join path to backfill
-- existing rows from (no case_id/employee-record link ever existed on
-- this table) — pre-existing rows simply won't match under the new
-- org-scoped queries api/signing.js and api/portal/_signatures.js now
-- use, which is the conservative, safe direction for a security fix
-- (a stale unscoped row becomes unreachable rather than staying openly
-- cross-tenant matchable).
--
-- HOW TO APPLY: paste the whole block below.
-- ============================================================================

alter table public.signing_requests add column if not exists org_id uuid references public.organisations(id) on delete cascade;
create index if not exists signing_requests_org_id_idx on public.signing_requests(org_id);
