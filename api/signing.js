import { supabaseRequest } from './_supabase.js';

// signing_requests has zero client-facing RLS policies by design (same
// pattern as employee_portal_accounts) — the signer isn't a logged-in
// Compass user, so there's no session to scope RLS against. The security
// boundary here is entirely the unguessable sign_id (crypto.randomUUID(),
// set in App.jsx's sendForSignature) plus the checks below, not RLS —
// this endpoint must use the service-role key. A previous RLS cleanup
// pass dropped this table's "Allow all" policy believing it was unused,
// which silently broke every "send for signature" action (writes/reads
// started failing with 42501) until this was reworked to bypass RLS
// entirely via the service role, the way api/portal/* already does.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { signId, document, employeeName, managerName, managerEmail, meetingType, meetingDate, signature, signedAt } = req.body;

    try {
      if (signature) {
        // Refuse to overwrite an already-signed record — without this, a
        // leaked or reused sign_id could silently replace a genuine
        // signature with a different one.
        const existingRes = await supabaseRequest(`signing_requests?sign_id=eq.${encodeURIComponent(signId)}&select=status`);
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

        // Notify manager if email provided
        if (managerEmail) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Compass HR <notifications@mail.compasshruk.com>',
              to: [managerEmail],
              subject: `${employeeName} has signed the meeting record`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
                <h2 style="color:#7C5CFC">Compass HR</h2>
                <p>Dear ${managerName},</p>
                <p><strong>${employeeName}</strong> has signed the meeting record for the <strong>${meetingType}</strong> on <strong>${meetingDate}</strong>.</p>
                <p>The signed document is now stored in the case file in Compass.</p>
                <p style="color:#666;font-size:12px">Powered by Compass HR</p>
              </div>`
            })
          });
        }

        return res.status(200).json({ success: true });
      } else {
        // Create signing request
        const r = await supabaseRequest('signing_requests', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ sign_id: signId, document, employee_name: employeeName, manager_name: managerName, manager_email: managerEmail||'', meeting_type: meetingType, meeting_date: meetingDate, status: 'pending', created_at: new Date().toISOString() })
        });
        const text = await r.text();
        if (!r.ok) return res.status(500).json({ error: text });
        return res.status(200).json({ success: true });
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
