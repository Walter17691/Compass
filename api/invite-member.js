export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, role, orgId, orgName } = req.body;

  try {
    // Use Supabase admin to invite user
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({
        email,
        data: { name, role, org_id: orgId, org_name: orgName }
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to invite user');

    // Pre-create org_member record so they land in the right org
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/org_members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        org_id: orgId,
        user_id: data.id,
        role,
        name
      })
    });

    // Send welcome email via Resend
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Compass HR <onboarding@resend.dev>',
        to: [email],
        subject: `You've been invited to ${orgName} on Compass HR`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#7C5CFC">Compass HR</h2>
            <p>Hi ${name},</p>
            <p>You've been invited to join <strong>${orgName}</strong> on Compass HR as <strong>${role==="hr_director"?"HR Director":role==="hr_manager"?"HR Manager":"Location Manager"}</strong>.</p>
            <p>Click the link in the separate email from Supabase to set your password and get started.</p>
            <p style="color:#666;font-size:12px">Powered by Compass HR</p>
          </div>
        `
      })
    });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
