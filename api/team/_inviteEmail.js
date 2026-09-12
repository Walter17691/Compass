import { escapeHtml as esc } from '../_html.js';

// NEW-11 remediation — shared by _invite-member.js's initial send and
// _team-invites.js's resend, which previously each hand-maintained a
// near-identical template. The copy now tells the recipient who invited
// them (when known), what Compass actually does, and — critically —
// that they'll set their OWN password during setup: the admin never
// creates, sees, or transmits one. No invite_code, token, or other
// technical detail ever appears here; only the constructed link.
export function buildInviteEmailHtml({ inviterName, orgName, roleLabel, inviteLink, expiresAt }) {
  const expiryDate = new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const invitedBy = inviterName ? `<strong>${esc(inviterName)}</strong> has invited you` : 'You\'ve been invited';
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px">
    <h2 style="color:#7A2FD8">Compass HR</h2>
    <p>${invitedBy} to join <strong>${esc(orgName)}</strong> on Compass HR as <strong>${esc(roleLabel)}</strong>.</p>
    <p style="color:#4A4E63;font-size:14px">Compass helps your organisation manage HR cases and people processes securely.</p>
    <p>To get started, use the secure link below.</p>
    <p style="color:#4A4E63;font-size:14px">If you're new to Compass, you'll create your password during setup. If you already have an account, simply sign in.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${esc(inviteLink)}" style="background:#7A2FD8;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Set up my Compass account</a>
    </div>
    <p style="color:#8a8fa3;font-size:12px">This invitation expires on ${expiryDate}. If you weren't expecting this invitation, you can ignore this email.</p>
  </div>`;
}

export async function sendTeamInviteEmail({ email, inviterName, orgName, roleLabel, inviteLink, expiresAt }) {
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Compass HR <notifications@mail.compasshruk.com>',
      to: [email],
      subject: `You've been invited to join ${orgName} on Compass HR`,
      html: buildInviteEmailHtml({ inviterName, orgName, roleLabel, inviteLink, expiresAt }),
    }),
  });
  const emailData = await emailRes.json();
  if (!emailRes.ok) throw new Error(emailData.message || 'Email failed');
}
