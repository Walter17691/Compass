import { supabaseRequest } from './_supabase.js';
import { getUserEmail } from '../cron/_supabase.js';
import { requireOrgMembership } from '../_auth.js';
import { escapeHtml as esc } from '../_html.js';
import { checkRateLimit } from '../_rateLimit.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

// The Employee Portal shows any meeting with a generated letter automatically
// (api/portal/_case-detail.js) — but until now nothing told the employee a
// new one had appeared. Best-effort: if this employee has no portal account,
// this is a silent no-op, not an error — most employees never get one.
//
// Deliberately any org member, not HR-only — unlike _invite.js/_accounts.js
// (real admin actions), this fires as a routine part of normal casework
// (any manager/investigator adding a document to their own case), the
// same scope send-letter.js already uses for the equivalent action.
export async function notifyDocument(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId, orgName, employeeName, documentType } = req.body || {};
  if (!orgId || !employeeName) return res.status(400).json({ error: 'orgId and employeeName are required' });

  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;

  // Phase 6.5 hardening (closes Prompt 11 audit finding 2.12, MEDIUM) —
  // same cap already applied to every other authenticated email-sending
  // endpoint (send-letter, send-for-signature, portal-invite) — caps
  // sustained abuse from one caller without limiting genuine casework.
  const withinLimit = await checkRateLimit(`portal-notify-document:${auth.caller.id}`, 20, 300);
  if (!withinLimit) return res.status(429).json({ error: 'Too many requests — please wait a moment and try again.' });

  try {
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
          <p>Hi ${esc(employeeName)},</p>
          <p>${esc(orgName) || 'Your employer'} has added a new document${documentType ? ` (${esc(documentType)})` : ''} to your case in Compass.</p>
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
