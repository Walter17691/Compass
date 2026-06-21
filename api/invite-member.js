export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, role, orgId, orgName, inviteCode, locationIds } = req.body;

  try {
    const appUrl = 'https://compass-lemon-iota.vercel.app';
    const inviteLink = `${appUrl}?invite=${inviteCode}`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Compass HR <onboarding@resend.dev>',
        to: [email],
        subject: `You've been invited to join ${orgName} on Compass HR`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px">
          <h2 style="color:#7C5CFC">Compass HR</h2>
          <p>Hi ${name},</p>
          <p>You have been invited to join <strong>${orgName}</strong> on Compass HR as <strong>${role==="hr_director"?"HR Director":role==="hr_manager"?"HR Manager":"Location Manager"}</strong>.</p>
          <p>Click below to create your account and get started:</p>
          <div style="text-align:center;margin:32px 0">
            <a href="${inviteLink}" style="background:#7C5CFC;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Accept invitation</a>
          </div>
          <p style="color:#666;font-size:12px">Or go to ${appUrl} and use invite code: <strong>${inviteCode}</strong></p>
        </div>`
      })
    });

    const emailData = await emailRes.json();
    if(!emailRes.ok) throw new Error(emailData.message||'Email failed');

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Invite error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
