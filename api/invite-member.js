export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, role, orgId, orgName, inviteCode, locationIds } = req.body;

  try {
    const appUrl = 'https://compass-lemon-iota.vercel.app';
    const inviteLink = `${appUrl}?invite=${inviteCode}`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Compass HR <onboarding@resend.dev>',
        to: [email],
        subject: `You've been invited to join ${orgName} on Compass HR`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px">
            <h2 style="color:#7C5CFC">Compass HR</h2>
            <p>Hi ${name},</p>
            <p>You've been invited to join <strong>${orgName}</strong> on Compass HR as <strong>${role==="hr_director"?"HR Director":role==="hr_manager"?"HR Manager":"Location Manager"}</strong>.</p>
            <p>Click the button below to create your account:</p>
            <div style="text-align:center;margin:32px 0">
              <a href="${inviteLink}" style="background:#7C5CFC;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Accept invitation</a>
            </div>
            <p style="color:#666;font-size:12px">Or use invite code: <strong>${inviteCode}</strong> at ${appUrl}</p>
          </div>
        `
      })
    });

    // Pre-create org_member with locationIds
    const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    // Try to find existing user by email
    const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const usersData = await usersRes.json();
    const existingUser = usersData?.users?.[0];

    if(existingUser) {
      // Update existing org_member or create new one
      await fetch(`${SUPABASE_URL}/rest/v1/org_members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({ org_id: orgId, user_id: existingUser.id, role, name, location_ids: locationIds||[] })
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Invite error:', error.message);
cat > ~/compass/api/invite-member.js << 'EOF'
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, role, orgId, orgName, inviteCode, locationIds } = req.body;

  try {
    const appUrl = 'https://compass-lemon-iota.vercel.app';
    const inviteLink = `${appUrl}?invite=${inviteCode}`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Compass HR <onboarding@resend.dev>',
        to: [email],
        subject: `You've been invited to join ${orgName} on Compass HR`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px">
            <h2 style="color:#7C5CFC">Compass HR</h2>
            <p>Hi ${name},</p>
            <p>You've been invited to join <strong>${orgName}</strong> on Compass HR as <strong>${role==="hr_director"?"HR Director":role==="hr_manager"?"HR Manager":"Location Manager"}</strong>.</p>
            <p>Click the button below to create your account:</p>
            <div style="text-align:center;margin:32px 0">
              <a href="${inviteLink}" style="background:#7C5CFC;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Accept invitation</a>
            </div>
            <p style="color:#666;font-size:12px">Or use invite code: <strong>${inviteCode}</strong> at ${appUrl}</p>
          </div>
        `
      })
    });

    // Pre-create org_member with locationIds
    const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    // Try to find existing user by email
    const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const usersData = await usersRes.json();
    const existingUser = usersData?.users?.[0];

    if(existingUser) {
      // Update existing org_member or create new one
      await fetch(`${SUPABASE_URL}/rest/v1/org_members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({ org_id: orgId, user_id: existingUser.id, role, name, location_ids: locationIds||[] })
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Invite error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
