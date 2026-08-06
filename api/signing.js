import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from './_auth.js';

// signing_requests has zero client-facing RLS policies by design (same
// pattern as employee_portal_accounts) — the signer isn't a logged-in
// Compass user, so there's no session to scope RLS against. The security
// boundary here is entirely the unguessable sign_id (crypto.randomUUID(),
// generated server-side below) plus the checks below, not RLS — this
// endpoint must use the service-role key. A previous RLS cleanup pass
// dropped this table's "Allow all" policy believing it was unused, which
// silently broke every "send for signature" action (writes/reads started
// failing with 42501) until this was reworked to bypass RLS entirely via
// the service role, the way api/portal/* already does.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { document, employeeName, managerName, managerEmail, meetingType, meetingDate, signature, signedAt } = req.body;
    const signId = req.body.signId;

    try {
      if (signature) {
        // The signer here is the external employee/manager, not a logged-in
        // Compass user — the unguessable sign_id is the auth boundary, by
        // design (see file comment). But the notification email content
        // must come from the stored request, not the anonymous POST body:
        // otherwise anyone holding one still-pending sign_id could forge
        // employeeName/managerName/meetingType and have the server email an
        // arbitrary managerEmail from Compass's own verified sending domain.
        const existingRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=*`);
        const [existing] = await existingRes.json();
        if (!existing) return res.status(404).json({ error: 'Signing request not found' });
        if (existing.status === 'signed') return res.status(409).json({ error: 'This document has already been signed' });

        // Save signature
        const r = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ signature, signed_at: signedAt, status: 'signed' })
        });
        const text = await r.text();
        if (!r.ok) return res.status(500).json({ error: text });

        // Notify manager if email provided — using the stored request's
        // fields, never the request body's.
        if (existing.manager_email) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Compass HR <notifications@mail.compasshruk.com>',
              to: [existing.manager_email],
              subject: `${existing.employee_name} has signed the meeting record`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
                <h2 style="color:#7C5CFC">Compass HR</h2>
                <p>Dear ${existing.manager_name},</p>
                <p><strong>${existing.employee_name}</strong> has signed the meeting record for the <strong>${existing.meeting_type}</strong> on <strong>${existing.meeting_date}</strong>.</p>
                <p>The signed document is now stored in the case file in Compass.</p>
                <p style="color:#666;font-size:12px">Powered by Compass HR</p>
              </div>`
            })
          });
        }

        return res.status(200).json({ success: true });
      } else {
        // Create signing request — unlike signing itself, this is always
        // initiated by a logged-in HR user (App.jsx's sendForSignature), so
        // it can and should require a real session rather than being open
        // to anyone. The sign_id is also generated here, not trusted from
        // the client, since it's the entire access-control boundary for the
        // signature step above.
        const caller = await verifyCaller(req);
        if (!caller) return res.status(401).json({ error: 'Unauthorized' });

        const newSignId = crypto.randomUUID();
        const r = await supabaseRequest('signing_requests', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ sign_id: newSignId, document, employee_name: employeeName, manager_name: managerName, manager_email: managerEmail||'', meeting_type: meetingType, meeting_date: meetingDate, status: 'pending', created_at: new Date().toISOString() })
        });
        const text = await r.text();
        if (!r.ok) return res.status(500).json({ error: text });
        return res.status(200).json({ success: true, signId: newSignId });
      }
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'GET') {
    const { signId } = req.query;
    try {
      const r = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=*`);
      const data = await r.json();
      if (!data.length) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(data[0]);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
