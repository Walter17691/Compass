export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { employeeEmail, employeeName, managerName, meetingType, meetingDate, signId, appUrl } = req.body;
  const signingUrl = `${appUrl}/sign/${signId}`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Compass HR <onboarding@resend.dev>',
        to: [employeeEmail],
        subject: `Please sign your meeting record - ${meetingType}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#7C5CFC">Compass HR</h2>
          <p>Dear ${employeeName},</p>
          <p>Your meeting record from <strong>${meetingType}</strong> on <strong>${meetingDate}</strong> is ready for your review and signature.</p>
          <a href="${signingUrl}" style="display:inline-block;background:#7C5CFC;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">Review and Sign</a>
          <p style="color:#666;font-size:12px">This link expires in 7 days. Questions? Contact ${managerName}.</p>
        </div>`
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to send');
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
