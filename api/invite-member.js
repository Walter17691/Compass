export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, role, orgId, orgName } = req.body;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  try {
    // Invite user via Supabase admin
    const response = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        email,
        data: { name, role, org_id: orgId, org_name: orgName }
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || data.message || JSON.stringify(data));

    // Pre-create org_member record
    const memberRes = await fetch(`${SUPABASE_URL}/rest/v1/org_members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ org_id: orgId, user_id: data.id, role, name })
    });

    if (!memberRes.ok) {
      const memberErr = await memberRes.text();
      console.error('Member create error:', memberErr);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: error.message });
  }
}
