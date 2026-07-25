import crypto from 'crypto';
import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

export async function invite(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId, orgName, employeeName, email } = req.body;
  if (!orgId || !employeeName || !email) {
    return res.status(400).json({ error: 'orgId, employeeName and email are required' });
  }

  try {
    // The caller must actually be HR staff in this org — otherwise anyone
    // could invite any email into any org's employee portal.
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=id`);
    const members = await memberRes.json();
    if (!members.length) return res.status(403).json({ error: 'Not a member of this organisation' });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const insertRes = await supabaseRequest('employee_portal_invites', {
      method: 'POST',
      body: JSON.stringify({
        org_id: orgId,
        employee_name: employeeName,
        email,
        token,
        created_by: caller.id,
        expires_at: expiresAt,
      }),
    });
    if (!insertRes.ok) {
      console.error('employee_portal_invites insert failed:', await insertRes.text());
      return res.status(500).json({ error: 'Failed to create invite' });
    }

    const inviteLink = `${APP_URL}/?portalInvite=${token}`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Compass HR <onboarding@resend.dev>',
        to: [email],
        subject: `${orgName || 'Your employer'} has invited you to Compass HR`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px">
          <h2 style="color:#7C5CFC">Compass HR</h2>
          <p>Hi ${employeeName},</p>
          <p>${orgName || 'Your employer'} has invited you to a secure portal where you can view your case status, sign documents, and complete onboarding tasks.</p>
          <div style="text-align:center;margin:32px 0">
            <a href="${inviteLink}" style="background:#7C5CFC;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Set up my account</a>
          </div>
          <p style="color:#666;font-size:12px">This link expires in 7 days. If you weren't expecting this invite, you can ignore this email.</p>
        </div>`,
      }),
    });
    const emailData = await emailRes.json();
    if (!emailRes.ok) {
      console.error('Resend send failed:', emailData);
      return res.status(500).json({ error: 'Invite created but email failed to send: ' + (emailData.message || 'unknown error') });
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Portal invite error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
