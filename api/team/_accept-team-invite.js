import { verifyCaller } from '../_auth.js';
import { ROLE_LABELS } from '../../src/lib/roles.js';
import { hashTeamInviteToken } from '../_teamInviteToken.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseRequest(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
}

async function supabaseRpc(fn, args) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
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
export async function acceptTeamInvite(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const token = req.method === 'GET' ? req.query?.token : req.body?.token;
  if (!token) return res.status(400).json({ error: 'token is required' });
  const tokenHash = hashTeamInviteToken(token);

  if (req.method === 'GET') {
    try {
      const inviteRes = await supabaseRequest(`team_invites?token_hash=eq.${encodeURIComponent(tokenHash)}&select=email,intended_role,status,expires_at,org_id`);
      const [invite] = await inviteRes.json();
      if (!invite) return res.status(404).json({ error: 'Invitation not found' });

      const orgRes = await supabaseRequest(`organisations?id=eq.${encodeURIComponent(invite.org_id)}&select=name`);
      const [org] = await orgRes.json();

      const expired = invite.status === 'pending' && new Date(invite.expires_at).getTime() < Date.now();
      return res.status(200).json({
        orgName: org?.name || null,
        invitedEmail: invite.email,
        roleLabel: ROLE_LABELS[invite.intended_role] || invite.intended_role,
        status: expired ? 'expired' : invite.status,
      });
    } catch (e) {
      console.error('accept-team-invite status error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const rpcRes = await supabaseRpc('accept_team_invite', { p_token_hash: tokenHash });
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
