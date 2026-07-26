import { verifyCaller } from '../_auth.js';

const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseRequest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

// Emails the new case owner when a case is reassigned to them — the only
// step of a reassignment that needs a server (RESEND_API_KEY is server-only).
// The actual ownership change and case_access grant happen client-side via
// Supabase RLS, same as the existing disciplinary-officer handoff; this just
// sends the notification so the new owner doesn't have to stumble onto it.
export async function reassignNotify(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId, orgName, newOwnerEmail, newOwnerName, employeeName, caseType } = req.body || {};
  if (!orgId || !newOwnerEmail || !employeeName) return res.status(400).json({ error: 'orgId, newOwnerEmail and employeeName are required' });

  try {
    const [callerMember] = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=name`);
    if (!callerMember) return res.status(403).json({ error: 'Not a member of this organisation' });

    const [recipientMember] = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&email=eq.${encodeURIComponent(newOwnerEmail)}&select=name`);
    if (!recipientMember) return res.status(403).json({ error: 'Recipient is not a member of this organisation' });

    const appUrl = 'https://compass-lemon-iota.vercel.app';
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Compass HR <onboarding@resend.dev>',
        to: [newOwnerEmail],
        subject: `A case has been reassigned to you on Compass HR`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px">
          <h2 style="color:#7C5CFC">Compass HR</h2>
          <p>Hi ${newOwnerName || 'there'},</p>
          <p><strong>${callerMember.name}</strong> has handed you the ${caseType || 'HR'} case for <strong>${employeeName}</strong> at ${orgName || 'your organisation'}.</p>
          <p>You now have access to it in Compass.</p>
          <div style="text-align:center;margin:32px 0">
            <a href="${appUrl}" style="background:#7C5CFC;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Open Compass</a>
          </div>
        </div>`,
      }),
    });
    const emailData = await emailRes.json();
    if (!emailRes.ok) throw new Error(emailData.message || 'Email failed');

    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Reassign notify error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
