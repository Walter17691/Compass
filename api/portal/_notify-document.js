import { supabaseRequest } from './_supabase.js';
import { getUserEmail } from '../cron/_supabase.js';
import { verifyCaller } from '../_auth.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

// The Employee Portal shows any meeting with a generated letter automatically
// (api/portal/_case-detail.js) — but until now nothing told the employee a
// new one had appeared. Best-effort: if this employee has no portal account,
// this is a silent no-op, not an error — most employees never get one.
export async function notifyDocument(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId, orgName, employeeName, documentType } = req.body || {};
  if (!orgId || !employeeName) return res.status(400).json({ error: 'orgId and employeeName are required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=id`);
    const members = await memberRes.json();
    if (!members.length) return res.status(403).json({ error: 'Not a member of this organisation' });

    const accountRes = await supabaseRequest(`employee_portal_accounts?org_id=eq.${encodeURIComponent(orgId)}&employee_name=eq.${encodeURIComponent(employeeName)}&select=user_id`);
    const [account] = await accountRes.json();
    if (!account) return res.status(200).json({ success: true, notified: false }); // no portal account — nothing to do

    const email = await getUserEmail(account.user_id);
    if (!email) return res.status(200).json({ success: true, notified: false });

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Compass HR <notifications@mail.compasshruk.com>',
        to: [email],
        subject: `A new document is ready in your Compass portal`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px">
          <h2 style="color:#7C5CFC">Compass HR</h2>
          <p>Hi ${employeeName},</p>
          <p>${orgName || 'Your employer'} has added a new document${documentType ? ` (${documentType})` : ''} to your case in Compass.</p>
          <div style="text-align:center;margin:32px 0">
            <a href="${APP_URL}" style="background:#7C5CFC;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">View in portal</a>
          </div>
        </div>`,
      }),
    });
    const emailData = await emailRes.json();
    if (!emailRes.ok) throw new Error(emailData.message || 'Email failed');

    res.status(200).json({ success: true, notified: true });
  } catch (e) {
    console.error('Portal notify-document error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
