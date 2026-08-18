import { verifyCaller } from './_auth.js';
import { escapeHtml as esc } from './_html.js';
import { documentTypeLabel } from '../src/lib/eSignature.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { employeeEmail, employeeName, managerName, meetingType, meetingDate, documentType, requiresSignature, signId, appUrl } = req.body;
  const signingUrl = `${appUrl}/sign/${signId}`;
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
