import { verifyCaller } from '../_auth.js';
import { escapeHtml as esc } from '../_html.js';
import { supabaseRequest, getUserEmail } from './_supabase.js';
import { checkRateLimit } from '../_rateLimit.js';

// Emails the new case owner when a case is reassigned to them — the only
// step of a reassignment that needs a server (RESEND_API_KEY is server-only).
// The actual ownership change and case_access grant happen client-side via
// Supabase RLS, same as the existing disciplinary-officer handoff; this just
// sends the notification so the new owner doesn't have to stumble onto it.
//
// Takes newOwnerId (org_members.user_id), not an email — org_members has no
// email column at all, so the caller (ReassignCaseModal.jsx) could never
// have had one to send: its `if(sel.email)` guard was always false, and
// this endpoint was never actually reachable in practice. The email itself
// is resolved server-side via the Admin API, same as the digest cron
// already does for the same reason.
export async function reassignNotify(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId, orgName, newOwnerId, newOwnerName, employeeName, caseType } = req.body || {};
  if (!orgId || !newOwnerId || !employeeName) return res.status(400).json({ error: 'orgId, newOwnerId and employeeName are required' });

  // Phase 6.5 hardening (closes Prompt 11 audit finding 2.12, MEDIUM) —
  // same cap already applied to every other authenticated email-sending
  // endpoint (send-letter, send-for-signature, portal-invite).
  const withinLimit = await checkRateLimit(`reassign-notify:${caller.id}`, 20, 300);
  if (!withinLimit) return res.status(429).json({ error: 'Too many requests — please wait a moment and try again.' });

  try {
    const callerMemberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=name`);
    const [callerMember] = await callerMemberRes.json();
    if (!callerMember) return res.status(403).json({ error: 'Not a member of this organisation' });

    const recipientMemberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(newOwnerId)}&select=name`);
    const [recipientMember] = await recipientMemberRes.json();
    if (!recipientMember) return res.status(403).json({ error: 'Recipient is not a member of this organisation' });

    const newOwnerEmail = await getUserEmail(newOwnerId);
    if (!newOwnerEmail) return res.status(404).json({ error: 'Could not resolve an email address for the new owner' });

    const appUrl = 'https://compass-lemon-iota.vercel.app';
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Compass HR <notifications@mail.compasshruk.com>',
        to: [newOwnerEmail],
        subject: `A case has been reassigned to you on Compass HR`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px">
          <h2 style="color:#7C5CFC">Compass HR</h2>
          <p>Hi ${esc(newOwnerName) || 'there'},</p>
          <p><strong>${esc(callerMember.name)}</strong> has handed you the ${esc(caseType) || 'HR'} case for <strong>${esc(employeeName)}</strong> at ${esc(orgName) || 'your organisation'}.</p>
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
