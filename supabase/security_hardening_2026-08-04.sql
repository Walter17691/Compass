-- ============================================================================
-- Minor security hardening — 2026-08-04
--
-- Two low-risk items from Supabase's security advisor, found during the
-- same audit that caught the signing_requests and org_members issues.
-- Neither is exploitable today, both are cheap to close.
-- ============================================================================

-- 1. handle_new_user (the auth trigger that creates a profiles row on
--    signup) had no fixed search_path — a SECURITY DEFINER function
--    without one can be tricked by a malicious schema/object shadowing
--    something it references. Pin it, matching the other functions
--    already written with `set search_path = public`.
alter function public.handle_new_user() set search_path = public;

-- 2. protect_org_member_privilege_columns and protect_billing_columns
--    are trigger-only guards (raise an exception if a privileged column
--    changes without authorization) — they're never meant to be called
--    directly, only invoked by the trigger mechanism on UPDATE, which
--    doesn't require the calling session to hold EXECUTE on the
--    function itself. Revoking direct EXECUTE just closes the
--    unnecessary /rest/v1/rpc/<fn> exposure the advisor flagged;
--    calling either directly outside a real trigger context already
--    fails (they reference OLD/NEW, which only exist inside a trigger),
--    so this is a cleanliness fix, not a real vulnerability close.
-- Revoking from anon/authenticated alone isn't enough — CREATE FUNCTION
-- grants EXECUTE to PUBLIC by default, and a standing PUBLIC grant isn't
-- overridden by revoking from named roles. Confirmed this the hard way:
-- the advisor still flagged both functions after the first revoke, until
-- PUBLIC itself was revoked too.
revoke execute on function public.protect_org_member_privilege_columns() from anon, authenticated, public;
revoke execute on function public.protect_billing_columns() from anon, authenticated, public;
