export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (req.method === 'POST') {
    const { signId, document, employeeName, managerName, meetingType, meetingDate, signature, signedAt } = req.body;

    if (signature) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/signing_requests?sign_id=eq.${signId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ signature, signed_at: signedAt, status: 'signed' })
      });
      return res.status(r.ok ? 200 : 500).json({ success: r.ok });
    } else {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/signing_requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ sign_id: signId, document, employee_name: employeeName, manager_name: managerName, meeting_type: meetingType, meeting_date: meetingDate, status: 'pending', created_at: new Date().toISOString() })
      });
      return res.status(r.ok ? 200 : 500).json({ success: r.ok });
    }
  }

  if (req.method === 'GET') {
    const { signId } = req.query;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/signing_requests?sign_id=eq.${signId}&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await r.json();
    if (!data.length) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(data[0]);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
