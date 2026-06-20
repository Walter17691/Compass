export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZWVnZnNvaWpoZG5udnVxamluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NTU2MjYsImV4cCI6MjA5NzAzMTYyNn0.IPdANRIK94XdCWy7aK1MOiIVqYgPKmvN8_ZJ6LCENBI';

  if (req.method === 'POST') {
    const { signId, document, employeeName, managerName, managerEmail, meetingType, meetingDate, signature, signedAt } = req.body;

    try {
      if (signature) {
        // Save signature
        const r = await fetch(`${SUPABASE_URL}/rest/v1/signing_requests?sign_id=eq.${signId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
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
              from: 'Compass HR <onboarding@resend.dev>',
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
        const r = await fetch(`${SUPABASE_URL}/rest/v1/signing_requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
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
      const r = await fetch(`${SUPABASE_URL}/rest/v1/signing_requests?sign_id=eq.${signId}&select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      const data = await r.json();
      if (!data.length) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(data[0]);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
