import { verifyCaller } from '../_auth.js';
import { escapeHtml as esc } from '../_html.js';
import { checkRateLimit } from '../_rateLimit.js';
import { APP_URL } from '../_appUrl.js';
import { ROLE_LABELS } from '../../src/lib/roles.js';
import { generateTeamInviteToken } from '../_teamInviteToken.js';

const INVITE_EXPIRY_DAYS = 7;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseRequest(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
}

async function requireHr(orgId, caller) {
  const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=role,name`);
  const [callerMember] = await memberRes.json();
  if (!callerMember) return { error: { status: 403, message: 'Not a member of this organisation' } };
  if (callerMember.role !== 'hr_director' && callerMember.role !== 'hr_manager') {
    return { error: { status: 403, message: 'Only HR Directors and HR Managers can manage invitations' } };
  }
  return { callerMember };
}

async function sendInviteEmail({ email, name, orgName, roleLabel, token }) {
  const inviteLink = `${APP_URL}?teamInvite=${encodeURIComponent(token)}`;
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Compass HR <notifications@mail.compasshruk.com>',
      to: [email],
      subject: `You've been invited to join ${orgName} on Compass HR`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px">
        <h2 style="color:#7A2FD8">Compass HR</h2>
        <p>Hi ${esc(name)},</p>
        <p>You've been invited to join <strong>${esc(orgName)}</strong> on Compass HR as <strong>${esc(roleLabel)}</strong>.</p>
        <p>Use the link below to sign in or create your account and accept the invitation. This link is unique to you and expires in ${INVITE_EXPIRY_DAYS} days.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${esc(inviteLink)}" style="background:#7A2FD8;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Join ${esc(orgName)}</a>
        </div>
      </div>`
    })
  });
  const emailData = await emailRes.json();
  if (!emailRes.ok) throw new Error(emailData.message || 'Email failed');
}

// NEW-8 remediation — Team & access needs to distinguish PENDING
// invitations from ACTIVE members, which the old shared-invite_code model
// had no way to represent at all (nothing was ever recorded per
// invitation). GET lists an org's pending invitations; POST performs
// revoke or resend. Both are HR-only, mirroring api/team/_invite-member.js's
// own authorization exactly.
//
// Final security gate (2026-09-11) — moved under api/team/ (from a
// top-level api/team-invites.js) purely to stay within the Vercel
// Hobby-plan 12-serverless-function-per-deployment limit; see
// api/team/[...action].js's own header comment. No behavioural change.
export async function teamInvites(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const orgId = req.query?.orgId;
    if (!orgId) return res.status(400).json({ error: 'orgId is required' });
    const { error } = await requireHr(orgId, caller);
    if (error) return res.status(error.status).json({ error: error.message });

    try {
      const listRes = await supabaseRequest(`team_invites?org_id=eq.${encodeURIComponent(orgId)}&status=eq.pending&select=id,name,email,intended_role,intended_location_ids,created_at,expires_at&order=created_at.desc`);
      const invites = await listRes.json();
      res.status(200).json({ invites: (invites || []).map(i => ({
        id: i.id, name: i.name, email: i.email,
        role: i.intended_role, roleLabel: ROLE_LABELS[i.intended_role] || i.intended_role,
        locationIds: i.intended_location_ids || [],
        createdAt: i.created_at,
        expired: new Date(i.expires_at).getTime() < Date.now(),
      })) });
    } catch (e) {
      console.error('team-invites list error:', e.message);
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, orgId, inviteId } = req.body || {};
  if (!orgId || !inviteId) return res.status(400).json({ error: 'orgId and inviteId are required' });
  const { error, callerMember } = await requireHr(orgId, caller);
  if (error) return res.status(error.status).json({ error: error.message });

  try {
    const inviteRes = await supabaseRequest(`team_invites?id=eq.${encodeURIComponent(inviteId)}&org_id=eq.${encodeURIComponent(orgId)}&select=*`);
    const [invite] = await inviteRes.json();
    if (!invite) return res.status(404).json({ error: 'Invitation not found' });
    if (invite.status !== 'pending') return res.status(409).json({ error: 'This invitation is no longer pending' });

    if (action === 'revoke') {
      const updateRes = await supabaseRequest(`team_invites?id=eq.${encodeURIComponent(inviteId)}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'revoked' }),
      });
      if (!updateRes.ok) return res.status(500).json({ error: 'Failed to revoke invitation' });

      await supabaseRequest('audit_log', {
        method: 'POST',
        body: JSON.stringify({
          org_id: orgId, user_id: caller.id, user_name: callerMember.name || caller.email || 'Unknown',
          action: 'Team invitation revoked', detail: `${invite.email} (${ROLE_LABELS[invite.intended_role] || invite.intended_role})`,
          created_at: new Date().toISOString(),
        }),
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'resend') {
      const withinLimit = await checkRateLimit(`invite-member:${caller.id}`, 20, 300);
      if (!withinLimit) return res.status(429).json({ error: 'Too many requests — please wait a moment and try again.' });

      // Rotate rather than reuse: a resend most often happens because the
      // original email was mistyped, went to spam, or the admin simply
      // wants a fresh copy — in every case, the old link (if it was ever
      // delivered anywhere else, e.g. a mistyped address that does exist)
      // should stop working the moment a new one is issued, rather than
      // two live links to the same access existing simultaneously with no
      // way to tell which one the intended recipient actually used.
      const orgRes = await supabaseRequest(`organisations?id=eq.${encodeURIComponent(orgId)}&select=name`);
      const [org] = await orgRes.json();
      if (!org) return res.status(404).json({ error: 'Organisation not found' });

      const revokeRes = await supabaseRequest(`team_invites?id=eq.${encodeURIComponent(inviteId)}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'revoked' }),
      });
      if (!revokeRes.ok) return res.status(500).json({ error: 'Failed to rotate invitation' });

      const { raw: token, hash: tokenHash } = generateTeamInviteToken();
      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const createRes = await supabaseRequest('team_invites', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          org_id: orgId, name: invite.name, email: invite.email, token_hash: tokenHash,
          intended_role: invite.intended_role, intended_location_ids: invite.intended_location_ids,
          created_by: caller.id, expires_at: expiresAt,
        }),
      });
      if (!createRes.ok) return res.status(500).json({ error: 'Failed to rotate invitation' });
      const [newInvite] = await createRes.json();

      const roleLabel = ROLE_LABELS[invite.intended_role] || invite.intended_role;
      try {
        await sendInviteEmail({ email: invite.email, name: invite.name, orgName: org.name, roleLabel, token });
      } catch (emailErr) {
        await supabaseRequest(`team_invites?id=eq.${encodeURIComponent(newInvite.id)}`, { method: 'DELETE' });
        return res.status(500).json({ error: emailErr.message });
      }

      await supabaseRequest('audit_log', {
        method: 'POST',
        body: JSON.stringify({
          org_id: orgId, user_id: caller.id, user_name: callerMember.name || caller.email || 'Unknown',
          action: 'Team invitation resent', detail: `${invite.email} (${roleLabel})`,
          created_at: new Date().toISOString(),
        }),
      });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('team-invites error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
