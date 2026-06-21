export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, orgMemberId } = req.body;
  const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  try {
    // Remove from org_members
    const memberRes = await fetch(`${SUPABASE_URL}/rest/v1/org_members?id=eq.${orgMemberId}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    // Delete from Supabase auth
    if(userId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
