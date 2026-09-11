import { verifyCaller } from './_auth.js';
import { escapeHtml as esc } from './_html.js';
import { checkRateLimit } from './_rateLimit.js';
import { APP_URL } from './_appUrl.js';
import { ROLE_LABELS } from '../src/lib/roles.js';
import { generateTeamInviteToken } from './_teamInviteToken.js';

const INVITE_EXPIRY_DAYS = 7;
// hr_director is deliberately absent — ordinary team invitations must
// never grant it (see supabase/team_invites_and_hr_director_boundary_
// 2026-09-11.sql's own header comment and the org_members_insert_
// founding_member policy, which already restricts hr_director creation
// to an org's own founding member).
const ASSIGNABLE_ROLES = ['hr_manager', 'location_manager', 'line_manager', 'investigator', 'legal_reviewer', 'auditor'];
const LOCATION_SCOPED_ROLES = new Set(['location_manager']);

// Phase 7 (Controlled Beta Infrastructure Gate 3) — see api/_supabase.js
// for why this is now configurable via env var with a production fallback.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseRequest(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  // NEW-8 remediation — an invitation now carries its own intended role
  // and (where the role uses it) location scope, applied atomically when
  // the invitation is accepted (see api/accept-team-invite.js). Every
  // invitee previously joined as location_manager with zero locations
  // regardless of what this endpoint claimed in the email, since
  // join_org_with_invite_code hardcoded that — this endpoint now creates
  // a real per-invitation record instead of emailing the org's shared,
  // permanent invite_code.
  const { email, name, orgId, role, locationIds } = req.body;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  if (!email || !String(email).trim()) return res.status(400).json({ error: 'email is required' });
  if (!ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'A valid access level is required' });

  const trimmedLocationIds = LOCATION_SCOPED_ROLES.has(role) ? (Array.isArray(locationIds) ? locationIds.filter(Boolean) : []) : [];
  if (LOCATION_SCOPED_ROLES.has(role) && trimmedLocationIds.length === 0) {
    return res.status(400).json({ error: 'At least one location is required for this access level' });
  }

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=role,name`);
    const [callerMember] = await memberRes.json();
    if (!callerMember) return res.status(403).json({ error: 'Not a member of this organisation' });
    if (callerMember.role !== 'hr_director' && callerMember.role !== 'hr_manager') {
      return res.status(403).json({ error: 'Only HR Directors and HR Managers can invite team members' });
    }

    const withinLimit = await checkRateLimit(`invite-member:${caller.id}`, 20, 300);
    if (!withinLimit) return res.status(429).json({ error: 'Too many requests — please wait a moment and try again.' });

    // Foreign-org locations must be rejected server-side, not just left
    // unselectable in the UI — a direct API call could otherwise stage
    // an invitation scoped to a location belonging to a different org.
    if (trimmedLocationIds.length) {
      const locRes = await supabaseRequest(`locations?org_id=eq.${encodeURIComponent(orgId)}&id=in.(${trimmedLocationIds.map(encodeURIComponent).join(',')})&select=id`);
      const validLocations = await locRes.json();
      if (!Array.isArray(validLocations) || validLocations.length !== trimmedLocationIds.length) {
        return res.status(400).json({ error: 'One or more selected locations do not belong to this organisation' });
      }
    }

    // Phase 6.5 hardening (closes Prompt 16 audit finding H19, HIGH) —
    // orgName is looked up server-side from the real organisations row
    // rather than trusted from the client (an attacker calling this
    // endpoint directly could otherwise set orgName to anything, using
    // Compass's own verified sending domain to deliver attacker-controlled
    // content to any address).
    const orgRes = await supabaseRequest(`organisations?id=eq.${encodeURIComponent(orgId)}&select=name`);
    const [orgRow] = await orgRes.json();
    if (!orgRow) return res.status(404).json({ error: 'Organisation not found' });
    const { name: orgName } = orgRow;

    // One unresolved pending invitation per email per org at a time — a
    // second invite to the same address while one is already outstanding
    // would leave two live tokens for the same person with no way for
    // acceptance to know which one was intended; revoke or let the
    // existing one resolve first.
    const existingRes = await supabaseRequest(`team_invites?org_id=eq.${encodeURIComponent(orgId)}&email=eq.${encodeURIComponent(String(email).trim().toLowerCase())}&status=eq.pending&select=id`);
    const existingInvites = await existingRes.json();
    if (Array.isArray(existingInvites) && existingInvites.length) {
      return res.status(409).json({ error: 'There is already a pending invitation for this email address. Revoke or resend it instead of sending a new one.' });
    }

    const { raw: token, hash: tokenHash } = generateTeamInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const createRes = await supabaseRequest('team_invites', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        org_id: orgId,
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        token_hash: tokenHash,
        intended_role: role,
        intended_location_ids: trimmedLocationIds,
        created_by: caller.id,
        expires_at: expiresAt,
      }),
    });
    if (!createRes.ok) {
      console.error('team_invites insert failed:', await createRes.text());
      return res.status(500).json({ error: 'Failed to create invitation' });
    }
    const [invite] = await createRes.json();

    // The raw token exists only here, in this one response's construction
    // of the link — never sent to team_invites, never logged, never
    // returned in any API response.
    const inviteLink = `${APP_URL}?teamInvite=${encodeURIComponent(token)}`;
    const roleLabel = ROLE_LABELS[role] || role;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
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
    if (!emailRes.ok) {
      // Do not leave an ambiguous active invitation with no email ever
      // delivered — remove the row so a retry creates a clean, single
      // pending invitation rather than the admin wondering whether this
      // one silently exists.
      await supabaseRequest(`team_invites?id=eq.${encodeURIComponent(invite.id)}`, { method: 'DELETE' });
      throw new Error(emailData.message || 'Email failed');
    }

    await supabaseRequest('audit_log', {
      method: 'POST',
      body: JSON.stringify({
        org_id: orgId, user_id: caller.id, user_name: callerMember.name || caller.email || 'Unknown',
        action: 'Team invitation created',
        detail: `${email} invited as ${roleLabel}`,
        created_at: new Date().toISOString(),
      }),
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Invite error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
