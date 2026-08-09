import { verifyCaller } from './_auth.js';
import { escapeHtml as esc } from './_html.js';

// Mirrors src/lib/roles.js's ROLE_LABELS — kept inline rather than
// imported since api/ functions are a separate deployment bundle from
// the frontend build and don't currently share modules with src/.
const ROLE_LABELS = {
  hr_manager: 'HR Manager', hr_director: 'HR Director', location_manager: 'Location Manager',
  line_manager: 'Line Manager', investigator: 'Investigator',
  legal_reviewer: 'Legal/Compliance Reviewer', auditor: 'Auditor',
};

const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
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

  const { email, name, role, orgId, orgName, inviteCode, locationIds } = req.body;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=role`);
    const [callerMember] = await memberRes.json();
    if (!callerMember) return res.status(403).json({ error: 'Not a member of this organisation' });
    if (callerMember.role !== 'hr_director' && callerMember.role !== 'hr_manager') {
      return res.status(403).json({ error: 'Only HR Directors and HR Managers can invite team members' });
    }

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
