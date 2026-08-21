import { requireOrgMembership } from './_auth.js';
import { checkRateLimit } from './_rateLimit.js';
import { escapeHtml as esc } from './_html.js';
import { documentTypeLabel } from '../src/lib/eSignature.js';

// Phase 6.5 hardening (P0) — two issues, both closed the same way
// send-letter.js's sibling fix does: (1) verified only that some real
// session was calling, with no org-membership check or rate limit —
// anyone with a valid Supabase token on the whole project could send an
// arbitrary email from Compass's own verified domain; (2) the signing
// link's host came straight from the request body (appUrl) and was only
// HTML-escaped, not validated, so a forged appUrl pointed the "Review
// and Sign" button at an attacker-controlled page while keeping every
// other visual/domain cue authentic. APP_URL is now fixed, matching the
// same hardcoded constant api/portal/_invite.js already uses for its own
// equivalent link — the real signing round-trip (api/signing.js) isn't
// proxied by the local dev server anyway (see signature-sync.spec.js's
// own comment), so this always pointed at the deployed app in practice.
const APP_URL = 'https://compass-lemon-iota.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { employeeEmail, employeeName, managerName, meetingType, meetingDate, documentType, requiresSignature, signId, orgId } = req.body;

  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;

  const withinLimit = await checkRateLimit(`send-for-signature:${auth.caller.id}`, 20, 300);
  if (!withinLimit) return res.status(429).json({ error: 'Too many requests — please wait a moment and try again.' });

  const signingUrl = `${APP_URL}/sign/${signId}`;
  // Integrations & Workflow Automation (Phase 5, IP27, §21) — generalised
  // from a hardcoded "meeting record" subject/body to any of the widened
  // document types (outcome letter, agreed adjustments, consultation
  // record), and the action verb reflects requires_signature — an
  // outcome letter or an adjustments record often just needs an
  // acknowledgement, not a drawn signature.
  const label = documentTypeLabel(documentType).toLowerCase();
  const action = requiresSignature === false ? 'acknowledge' : 'sign';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Compass HR <notifications@mail.compasshruk.com>',
        to: [employeeEmail],
        subject: `Please ${action} your ${label}${meetingType ? ` - ${meetingType}` : ''}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#7C5CFC">Compass HR</h2>
          <p>Dear ${esc(employeeName)},</p>
          <p>Your <strong>${esc(label)}</strong>${meetingType ? ` from <strong>${esc(meetingType)}</strong>` : ''}${meetingDate ? ` on <strong>${esc(meetingDate)}</strong>` : ''} is ready for your review${action === 'sign' ? ' and signature' : ' and acknowledgement'}.</p>
          <a href="${esc(signingUrl)}" style="display:inline-block;background:#7C5CFC;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">Review and ${action === 'sign' ? 'Sign' : 'Acknowledge'}</a>
          <p style="color:#666;font-size:12px">This link expires in 7 days. Questions? Contact ${esc(managerName)}.</p>
        </div>`
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to send');
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
