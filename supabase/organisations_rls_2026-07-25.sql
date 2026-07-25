-- ============================================================================
-- Lock down organisations SELECT/UPDATE — 2026-07-25
--
-- organisations_select_authenticated (rls_fixes_2026-07-23.sql) used
-- `using (true)` — any logged-in Compass user, from any org, could read
-- every other org's row, including plan, stripe_customer_id,
-- stripe_subscription_id, stripe_subscription_status and
-- notification_webhook_url/type (columns added by later migrations that
-- never revisited this policy). Fix: scope SELECT to actual members, plus
-- the creator (so a brand-new org is still visible before its founding
-- org_members row exists — see join_org_by_code_2026-07-23.sql).
--
-- There was also no UPDATE policy at all on this table, meaning the
-- "Team chat notifications" feature's saveOrgWebhook
-- (App.jsx: supabase.from('organisations').update({notification_webhook_url...}))
-- has been silently failing in production. Adding a naive
-- `using (id in my_org_ids())` UPDATE policy would fix that but also open a
-- NEW critical hole: any authenticated org member could
-- `.update({plan:'pro'})` themselves a free upgrade via the client. So the
-- UPDATE policy is paired with a trigger that blocks writes to the billing
-- columns from anything but the service role (the Stripe webhook, which
-- already writes with SUPABASE_SERVICE_KEY and bypasses RLS).
--
-- The client-side join-by-invite-code flow was moved into a SECURITY
-- DEFINER function (join_org_with_invite_code) that no longer needs a
-- direct SELECT against organisations, so restricting SELECT here does not
-- break that flow — confirmed by reading OrgSetup.jsx, which only calls
-- supabase.rpc('join_org_with_invite_code', ...).
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

drop policy if exists "organisations_select_authenticated" on public.organisations;

create policy "organisations_select_member_or_creator"
  on public.organisations for select
  to authenticated
  using (
    id in (select public.my_org_ids())
    or created_by = auth.uid()
  );

create policy "organisations_update_member"
  on public.organisations for update
  to authenticated
  using (id in (select public.my_org_ids()))
  with check (id in (select public.my_org_ids()));

-- Block any non-service-role write to the billing columns. The Stripe
-- webhook (api/billing/_webhook.js) writes with SUPABASE_SERVICE_KEY, which
-- authenticates as auth.role() = 'service_role' and bypasses RLS/triggers
-- run under `security definer`... except triggers still fire for
-- service-role writes too, so this trigger explicitly allows that role
-- through and blocks everyone else.
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
    then
      raise exception 'Billing fields can only be changed by the billing system';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_billing_columns_trigger on public.organisations;

create trigger protect_billing_columns_trigger
  before update on public.organisations
  for each row
  execute function public.protect_billing_columns();
