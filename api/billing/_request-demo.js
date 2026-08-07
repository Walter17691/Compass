import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

// Comparable UK HR/compliance software (BrightHR, Citation, Peninsula) is
// sold through a sales conversation and a signed contract, not self-serve
// card checkout — at Compass's price point that's the right model too, so
// SubscribeGate captures a lead here instead of taking a card directly.
// This dispatcher has bodyParser disabled group-wide (the Stripe webhook
// needs raw bytes for signature verification), so the JSON body has to be
// read and parsed by hand rather than via req.body.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// phone/preferredTime/notes are free text from an authenticated org member
// — not sanitised anywhere upstream — and org/member names are themselves
// user-editable. All of it lands in an HTML email, so it needs escaping
// same as it would in a browser: unescaped, this is a stored-injection
// vector into whatever renders this email (most mail clients render HTML).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function requestDemo(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  let body;
  try {
    body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
  } catch (e) {
    console.error('Billing request-demo body parse error:', e.message);
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { orgId, phone, preferredTime, notes } = body;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=name`);
    const [member] = await memberRes.json();
    if (!member) return res.status(403).json({ error: 'Not a member of this organisation' });

    const orgRes = await supabaseRequest(`organisations?id=eq.${encodeURIComponent(orgId)}&select=name`);
    const [org] = await orgRes.json();

    const locationsRes = await supabaseRequest(`locations?org_id=eq.${encodeURIComponent(orgId)}&select=id`);
    const locations = await locationsRes.json();

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Compass HR <notifications@mail.compasshruk.com>',
        to: ['hello@compasshruk.com'],
        reply_to: caller.email,
        subject: `New demo request — ${esc(org?.name) || 'Unknown org'}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#7C5CFC">New Compass demo request</h2>
            <p><strong>Organisation:</strong> ${esc(org?.name) || '—'} (org_id: ${esc(orgId)})</p>
            <p><strong>Contact:</strong> ${esc(member.name) || '—'} — ${esc(caller.email)}</p>
            <p><strong>Locations recorded:</strong> ${locations.length || 'None yet'}</p>
            <p><strong>Phone:</strong> ${esc(phone) || 'Not given'}</p>
            <p><strong>Preferred time to call:</strong> ${esc(preferredTime) || 'Not given'}</p>
            <p><strong>Notes:</strong> ${esc(notes) || '—'}</p>
          </div>
        `,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to send');

    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Billing request-demo error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
