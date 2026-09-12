import { verifyCaller } from '../_auth.js';
import { ROLE_LABELS } from '../../src/lib/roles.js';
import { hashTeamInviteToken } from '../_teamInviteToken.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
// Public anon key — safe to duplicate here (already shipped in the client
// bundle, see api/_auth.js's own copy of the same value). Used only to
// forward the CALLER's own bearer token below, never as a credential by
// itself.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZWVnZnNvaWpoZG5udnVxamluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NTU2MjYsImV4cCI6MjA5NzAzMTYyNn0.IPdANRIK94XdCWy7aK1MOiIVqYgPKmvN8_ZJ6LCENBI';

async function supabaseRequest(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
}

// P1 fix (2026-09-12) — this previously authenticated the RPC call as the
// SERVICE ROLE (apikey+Authorization both SUPABASE_KEY), which meant
// auth.uid()/auth.jwt() inside accept_team_invite() always saw a
// service-role JWT with no 'sub' claim — auth.uid() IS NULL for every
// service-role-authenticated request, confirmed directly against this
// project (`set local request.jwt.claims to '{"role":"service_role"}';
// select auth.uid()` returns null). accept_team_invite's own first check
// (`if auth.uid() is null then raise exception 'Not authenticated'`) was
// therefore unconditionally true, regardless of which real user called
// this endpoint — the acceptance RPC could never succeed, for anyone,
// ever. This is the exact "Not authenticated" error a real invited user
// hit in production. Fixed by forwarding the CALLER's own bearer token
// (already verified once by verifyCaller) as Authorization, with apikey
// as the public anon key — the same pattern api/_auth.js's own
// callerCaseVisible() already uses correctly elsewhere in this codebase.
// auth.uid()/auth.jwt() now correctly resolve to the real calling user,
// exactly as accept_team_invite's own SECURITY DEFINER design assumes.
async function supabaseRpc(fn, args, callerAccessToken) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${callerAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

// NEW-6/NEW-8 remediation — GET returns the minimum context needed for the
// acceptance screen (org name, intended role, invited email, status) so
// TeamInviteAccept.jsx can show who invited the caller and to what access
// level before they commit to accepting; POST performs the actual atomic
// acceptance via accept_team_invite() (see the team_invites migration).
//
// Final security gate — this no longer looks up the caller's verified
// email via the Supabase auth admin API before calling the RPC: the SQL
// function itself now derives that email from the session's own verified
// JWT (auth.jwt()->>'email'), so re-deriving and comparing it here too
// would just be a second, separately-maintained copy of a check the
// database already makes authoritatively — the exact "requireCaseAccess"
// class of duplication this codebase has already moved away from
// elsewhere. Both endpoints only ever handle the token in its hashed
// form past this point; the raw value from the URL is hashed immediately
// and never stored, logged, or echoed back.
//
// Also moved under api/team/ (from a top-level api/accept-team-invite.js)
// purely to stay within the Vercel Hobby-plan 12-serverless-function-per-
// deployment limit; see api/team/[...action].js's own header comment. No
// behavioural change.
//
// NEW-11 remediation (2026-09-11) — GET no longer requires an
// authenticated caller. It used to, which meant a brand-new invitee (no
// Compass account yet) could never learn who invited them, which org, or
// what role BEFORE creating an account — TeamInviteAccept.jsx's own
// logged-out branch skipped the fetch entirely for exactly that reason.
// The information this now discloses to an anonymous caller (org name,
// role label, the invited email, expiry/status) is not new exposure: an
// anonymous caller can only reach this by already holding the raw,
// single-use, 256-bit invitation token — the actual security boundary —
// which in practice means they already received the email addressed to
// that exact recipient. POST (the actual membership-granting action)
// still requires a real, verified session — this split is the only
// change; every other property (hashed lookup, atomic acceptance,
// server-derived identity) is untouched.
export async function acceptTeamInvite(req, res) {
  const token = req.method === 'GET' ? req.query?.token : req.body?.token;
  if (!token) return res.status(400).json({ error: 'token is required' });
  const tokenHash = hashTeamInviteToken(token);

  if (req.method === 'GET') {
    try {
      const inviteRes = await supabaseRequest(`team_invites?token_hash=eq.${encodeURIComponent(tokenHash)}&select=name,email,intended_role,status,expires_at,org_id,created_by`);
      const [invite] = await inviteRes.json();
      if (!invite) return res.status(404).json({ error: 'Invitation not found' });

      const orgRes = await supabaseRequest(`organisations?id=eq.${encodeURIComponent(invite.org_id)}&select=name`);
      const [org] = await orgRes.json();

      // Best-effort only — if the inviter's own membership is gone (they
      // left, or this is old data), the screen just omits their name
      // rather than failing the whole preview over a "nice to have".
      let inviterName = null;
      if (invite.created_by) {
        const inviterRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(invite.org_id)}&user_id=eq.${encodeURIComponent(invite.created_by)}&select=name`);
        const [inviter] = await inviterRes.json();
        inviterName = inviter?.name || null;
      }

      const expired = invite.status === 'pending' && new Date(invite.expires_at).getTime() < Date.now();
      return res.status(200).json({
        orgName: org?.name || null,
        invitedName: invite.name,
        invitedEmail: invite.email,
        inviterName,
        roleLabel: ROLE_LABELS[invite.intended_role] || invite.intended_role,
        status: expired ? 'expired' : invite.status,
        expiresAt: invite.expires_at,
      });
    } catch (e) {
      console.error('accept-team-invite status error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const callerAccessToken = (req.headers.authorization || '').replace(/^Bearer /, '');

  try {
    const rpcRes = await supabaseRpc('accept_team_invite', { p_token_hash: tokenHash }, callerAccessToken);
    const rpcData = await rpcRes.json();
    if (!rpcRes.ok) {
      const message = rpcData?.message || 'Could not accept this invitation';
      // accept_team_invite's own RAISE EXCEPTION messages are already
      // safe, specific, user-facing text (see the migration) — no raw
      // provider/DB error is ever surfaced past this point.
      const knownDenials = ['not found', 'revoked', 'already been used', 'expired', 'different email address', 'already a member', 'Too many attempts', 'verify your account email'];
      const status = knownDenials.some(s => message.includes(s)) ? 409 : 500;
      return res.status(status).json({ error: message });
    }
    const [result] = rpcData;

    await supabaseRequest('audit_log', {
      method: 'POST',
      body: JSON.stringify({
        org_id: result.org_id, user_id: caller.id, user_name: caller.email || 'Unknown',
        action: 'Team invitation accepted',
        detail: `Joined as ${ROLE_LABELS[result.role] || result.role}`,
        created_at: new Date().toISOString(),
      }),
    });

    res.status(200).json({ success: true, orgId: result.org_id, orgName: result.org_name, role: result.role });
  } catch (e) {
    console.error('accept-team-invite error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
