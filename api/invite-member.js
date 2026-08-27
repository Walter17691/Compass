import { verifyCaller } from './_auth.js';
import { escapeHtml as esc } from './_html.js';
import { checkRateLimit } from './_rateLimit.js';

// Mirrors src/lib/roles.js's ROLE_LABELS — kept inline rather than
// imported since api/ functions are a separate deployment bundle from
// the frontend build and don't currently share modules with src/.
const ROLE_LABELS = {
  hr_manager: 'HR Manager', hr_director: 'HR Director', location_manager: 'Location Manager',
  line_manager: 'Line Manager', investigator: 'Investigator',
  legal_reviewer: 'Legal/Compliance Reviewer', auditor: 'Auditor',
};

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

  const { email, name, role, orgId, locationIds } = req.body;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=role`);
    const [callerMember] = await memberRes.json();
    if (!callerMember) return res.status(403).json({ error: 'Not a member of this organisation' });
    if (callerMember.role !== 'hr_director' && callerMember.role !== 'hr_manager') {
      return res.status(403).json({ error: 'Only HR Directors and HR Managers can invite team members' });
    }

    const withinLimit = await checkRateLimit(`invite-member:${caller.id}`, 20, 300);
    if (!withinLimit) return res.status(429).json({ error: 'Too many requests — please wait a moment and try again.' });

    // Phase 6.5 hardening (closes Prompt 16 audit finding H19, HIGH) —
    // orgName/inviteCode used to be trusted straight from the request
    // body with no check against orgId at all. The caller is verified as
    // real HR staff for orgId, but that only proves who's SENDING the
    // invite, not that the org name and invite code in the email are the
    // real ones — an attacker calling this endpoint directly (not
    // through the UI) could set orgName to anything and inviteCode to an
    // arbitrary string, using Compass's own verified sending domain to
    // deliver fully attacker-controlled content to any address. Both are
    // now looked up server-side from the real organisations row instead
    // of trusted from the client.
    const orgRes = await supabaseRequest(`organisations?id=eq.${encodeURIComponent(orgId)}&select=name,invite_code`);
    const [orgRow] = await orgRes.json();
    if (!orgRow) return res.status(404).json({ error: 'Organisation not found' });
    const { name: orgName, invite_code: inviteCode } = orgRow;

    const appUrl = 'https://compass-lemon-iota.vercel.app';
    const inviteLink = `${appUrl}?invite=${inviteCode}`;

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
          <h2 style="color:#7C5CFC">Compass HR</h2>
          <p>Hi ${esc(name)},</p>
          <p>You have been invited to join <strong>${esc(orgName)}</strong> on Compass HR as <strong>${esc(ROLE_LABELS[role]||"Location Manager")}</strong>.</p>
          <p>Click below to create your account and get started:</p>
          <div style="text-align:center;margin:32px 0">
            <a href="${esc(inviteLink)}" style="background:#7C5CFC;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Accept invitation</a>
          </div>
          <p style="color:#666;font-size:12px">Or go to ${esc(appUrl)} and use invite code: <strong>${esc(inviteCode)}</strong></p>
        </div>`
      })
    });

    const emailData = await emailRes.json();
    if(!emailRes.ok) throw new Error(emailData.message||'Email failed');

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Invite error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
