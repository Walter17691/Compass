-- ============================================================================
-- Rate limit api/chat.js — 2026-07-25
--
-- api/chat.js requires a verified caller (organisations_rls_2026-07-25.sql /
-- the earlier auth pass), but nothing caps how many requests one caller can
-- fire — a compromised or malicious account could still hammer it as a
-- free proxy to the Anthropic API. Vercel serverless functions don't share
-- memory across invocations (each cold start is a blank slate), so an
-- in-process counter wouldn't actually limit anything — the counter has to
-- live somewhere persistent. Using Postgres here, same as everything else
-- in this app.
--
-- check_rate_limit is a single atomic UPSERT: it increments the caller's
-- counter and resets it if the window has expired, all in one statement,
-- so concurrent requests from the same caller can't race past the limit.
-- Called server-side only (via SUPABASE_SERVICE_KEY, api/_rateLimit.js),
-- never directly by the client — hence execute is granted to service_role
-- only, not authenticated.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

create table if not exists public.api_rate_limits (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  request_count int not null default 0
);

alter table public.api_rate_limits enable row level security;
-- No policies granted — the table is only ever touched through the
-- SECURITY DEFINER function below, which bypasses RLS as its owner.
-- This blocks any direct client read/write even if someone finds the
-- table name.

create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.api_rate_limits (rate_key, window_start, request_count)
  values (p_key, now(), 1)
  on conflict (rate_key) do update
    set request_count = case
          when public.api_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
            then 1
          else public.api_rate_limits.request_count + 1
        end,
        window_start = case
          when public.api_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
            then now()
          else public.api_rate_limits.window_start
        end
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
