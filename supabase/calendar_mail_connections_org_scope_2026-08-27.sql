-- ============================================================================
-- Scope calendar/mail OAuth connections by org, not just user — 2026-08-27
-- (closes Prompt 16 audit finding C3, CRITICAL)
--
-- calendar_connections and graph_mail_connections both already carry a
-- real, NOT NULL org_id column (it's used for logging integration events
-- and for the org-scoped connect flow), but neither table's UNIQUE
-- constraint included it — both were UNIQUE(user_id, provider) only.
--
-- org_members supports one user_id belonging to multiple orgs (org
-- switching is a first-class, real feature — an HR consultant running
-- cases for several client orgs from one login). Confirmed live: a real
-- multi-org test account exists in this exact database. For that user,
-- connecting Google Calendar while active in Org A, then connecting
-- again while active in Org B, upserts on (user_id, provider) — the
-- second connect silently overwrites the FIRST org's row: its org_id
-- flips to B and its tokens are replaced. Every calendar/mail endpoint
-- (_sync, _create-event, _update-event, _delete-event,
-- _check-availability, _status, _disconnect, and their ms365/gmail/
-- outlook equivalents) then looked the connection up by user_id alone —
-- so working in Org A after this could push Org A's confidential
-- meeting/deadline titles onto Org B's calendar, logged under Org B's
-- own org_id, and disconnecting for one org silently broke sync for
-- every other org the user belongs to.
--
-- Fix: the real invariant is one connection per (user, org, provider),
-- not per (user, provider) — a user can legitimately have Google
-- Calendar connected separately for two different orgs. Corresponding
-- application-code changes (this file has no code in it) thread org_id
-- through every read/write site.
-- ============================================================================

alter table public.calendar_connections
  drop constraint if exists calendar_connections_user_id_provider_key;
alter table public.calendar_connections
  add constraint calendar_connections_user_id_org_id_provider_key unique (user_id, org_id, provider);

alter table public.graph_mail_connections
  drop constraint if exists graph_mail_connections_user_id_provider_key;
alter table public.graph_mail_connections
  add constraint graph_mail_connections_user_id_org_id_provider_key unique (user_id, org_id, provider);
