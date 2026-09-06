-- ============================================================================
-- Platform Admin Foundation — 2026-09-06
-- ============================================================================
-- Implements the minimum secure foundation for a genuine Compass platform-
-- operator identity, negotiated-customer contract metadata, and a
-- provider-neutral access/entitlement gate — closing the gap found in the
-- Platform Owner / Customer Admin Portal discovery audit: Compass had no
-- system-level "operator across all tenants" concept, and the only way to
-- activate a non-Stripe (negotiated, invoiced) customer was to misrepresent
-- them as a fake Stripe subscriber (plan='pro', stripe_subscription_status=
-- 'active' set directly via SQL — the same mechanism already documented in
-- SubscribeGate.jsx's own comments for sales_approved_at).
--
-- SCOPE: foundation only. No customer-management API, no Platform Admin UI,
-- no lifecycle automation. Three additive pieces:
--   1. platform_admins — a new, org-independent operator identity table.
--   2. customer_contracts — negotiated commercial/contract metadata, kept
--      deliberately separate from organisations (not an accounting table —
--      no invoice line items, no payment transactions, no VAT accounting).
--   3. organisations.access_status — a provider-neutral entitlement flag,
--      additive alongside the existing Stripe-derived fields (not a
--      replacement — see the trigger update below and src/lib/plan.js's
--      isEntitled()).
--
-- CRITICAL SECURITY PROPERTY, verified before writing this migration by
-- re-reading every live policy on organisations/org_members/cases: platform
-- administration is achieved WITHOUT ever creating an org_members row for
-- the operator, and WITHOUT modifying any existing policy or helper
-- function (my_org_ids, can_see_all_org_cases, has_confidential_case_
-- oversight, can_access_case_location — all untouched). Every case-content
-- and case-adjacent-child-table policy is scoped exclusively through
-- org_members-derived membership; platform_admins is structurally
-- disconnected from that entirely, so a platform_admins row mathematically
-- cannot grant SELECT/UPDATE/DELETE on cases, allegations, case_tasks,
-- case_themes, case_signals, hr_review_requests, signing_requests, or any
-- other case-content table. This migration does not add a single policy
-- referencing platform_admins to any of those tables, and never will as
-- part of this foundation phase — platform-admin authorization is checked
-- exclusively by dedicated server-side routes (api/_platformAdmin.js),
-- never by RLS granting broader table access.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. platform_admins — Compass operator identity, not a customer role.
-- ----------------------------------------------------------------------------
-- RLS enabled, ZERO policies — deliberate deny-all for anon/authenticated,
-- matching the existing established pattern for other service-role-only
-- tables in this schema (employee_portal_accounts, signing_requests,
-- calendar_connections, graph_mail_connections). The only way to read or
-- write this table is a service-role connection (i.e. a dedicated
-- server-side route using SUPABASE_SERVICE_KEY) — never a client query.
-- This also prevents any authenticated user from enumerating who the
-- platform admins are.
--
-- revoked_at/revoked_by included (not just granted_at/granted_by): a single
-- nullable timestamp+actor pair, not a new state machine, and it means
-- "was this access ever revoked, by whom, when" is answerable from the
-- row's own history — no separate audit table needed for this event class
-- (see the migration's closing comment on auditability).
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id)
);

alter table public.platform_admins enable row level security;
-- No policies added, intentionally — see comment above.

-- ----------------------------------------------------------------------------
-- 2. customer_contracts — negotiated commercial/contract metadata.
-- ----------------------------------------------------------------------------
-- One row per organisation (org_id UNIQUE) representing the CURRENT
-- contract only — historical contract/renewal versioning is explicitly out
-- of scope for this foundation phase (documented simplification, not an
-- oversight). Deliberately excludes anything that belongs in an accounting
-- system: no invoice line items, no invoice PDFs, no payment transactions,
-- no bank details, no VAT/ledger data. agreed_fee/billing_frequency/
-- currency are commercial reference fields for Compass's own record, not a
-- billing engine.
create table if not exists public.customer_contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organisations(id) on delete cascade,

  legal_name text not null,
  trading_name text,
  primary_contact_name text,
  primary_contact_email text,

  contract_start_date date,
  initial_term_months integer,
  renewal_date date,
  notice_date date,
  order_form_reference text,
  signed_agreement_status text not null default 'draft'
    check (signed_agreement_status in ('draft', 'sent', 'signed')),
  dpa_status text not null default 'not_sent'
    check (dpa_status in ('not_sent', 'sent', 'signed')),

  agreed_fee numeric,
  billing_frequency text
    check (billing_frequency is null or billing_frequency in ('monthly', 'quarterly', 'annually')),
  currency text not null default 'GBP',

  onboarding_status text not null default 'onboarding'
    check (onboarding_status in ('onboarding', 'live')),
  go_live_date date,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.customer_contracts enable row level security;
-- No policies added, intentionally — same deny-all pattern as
-- platform_admins. Cross-tenant customer users (any org_members role,
-- including hr_director) have no path to this table at all; it is
-- readable/writable only via a service-role platform-admin route.

-- ----------------------------------------------------------------------------
-- 3. organisations.access_status — provider-neutral entitlement flag.
-- ----------------------------------------------------------------------------
-- Additive alongside the existing plan/stripe_* columns, not a replacement
-- for them — see src/lib/plan.js's isEntitled() for how the two compose.
-- Defaults to 'pending' so a brand-new organisation (which today already
-- starts with plan='free', itself already fail-closed against the old
-- isSubscribed() gate) is equally fail-closed against the new gate before
-- anyone explicitly activates it. Minimum three-state model per the
-- foundation's own scope decision — not the fuller five-state lifecycle,
-- which remains a deferred, separately-justified decision.
alter table public.organisations
  add column if not exists access_status text not null default 'pending'
    check (access_status in ('pending', 'active', 'suspended'));

-- Extend the existing billing-column protection trigger to also guard the
-- new column, using the exact same service-role-only bypass already
-- proven safe for plan/stripe_*/sales_approved_at. This is the one
-- necessary modification to an existing object in this migration — without
-- it, any org member with the standing organisations_update_member UPDATE
-- policy (unchanged, still permissive-by-org-membership) could set their
-- own organisation's access_status to 'active' merely by having ordinary
-- update rights, which would be exactly the kind of self-service
-- entitlement bypass this foundation exists to prevent on the other side.
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if new.plan is distinct from old.plan
      or new.stripe_customer_id is distinct from old.stripe_customer_id
      or new.stripe_subscription_id is distinct from old.stripe_subscription_id
      or new.stripe_subscription_status is distinct from old.stripe_subscription_status
      or new.sales_approved_at is distinct from old.sales_approved_at
      or new.access_status is distinct from old.access_status
    then
      raise exception 'Billing fields can only be changed by the billing system';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================================
-- AUDITABILITY DECISION (documented, not a further schema change):
-- audit_log.org_id is NOT NULL, so platform-level events with no natural
-- organisation (granting/revoking a platform admin) cannot be represented
-- there without distorting its meaning. Rather than force-fitting them in,
-- or building a separate platform_audit_log table this phase doesn't yet
-- need, platform_admins' own granted_at/granted_by/revoked_at/revoked_by
-- columns ARE the audit trail for that event class — the row is never hard-
-- deleted, only revoked, so its own history answers "who granted/revoked
-- platform-admin access, and when" without new infrastructure. Contract-
-- metadata edits are similarly out of scope for a dedicated audit event in
-- this foundation phase (no write path is being exposed yet — see Stage 9's
-- own scope limit to the authorization helper only, no customer-management
-- API). Revisit once a real write-facing Platform Admin UI exists.
-- ============================================================================
