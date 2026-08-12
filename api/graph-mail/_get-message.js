import { getConnectionWithFreshToken, graphRequest } from './_outlook.js';
import { verifyCaller } from '../_auth.js';

// Formats the fetched message into the same "From/Subject/Date + body" text
// shape the manual paste box already produces, so it can be handed straight
// to the existing extractEmailDetails(rawText) pipeline in App.jsx — one
// extraction path for both a pasted email and a picked one.
function formatAsRawText(m) {
  const from = m.from?.emailAddress?.address || m.from?.emailAddress?.name || 'Unknown sender';
  const date = m.receivedDateTime ? new Date(m.receivedDateTime).toLocaleDateString('en-GB') : '';
  return [
    `From: ${from}`,
    `Subject: ${m.subject || ''}`,
    `Date: ${date}`,
    '',
    m.body?.content || '',
  ].join('\n');
}

export async function getMessage(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { messageId } = req.query;
  if (!messageId) return res.status(400).json({ error: 'messageId is required' });

  try {
    const conn = await getConnectionWithFreshToken(caller.id);
    if (!conn) return res.status(404).json({ error: 'No Outlook connection for this user' });

    const msgRes = await graphRequest(
      conn.accessToken,
      `me/messages/${encodeURIComponent(messageId)}?$select=subject,from,receivedDateTime,body`,
      { headers: { Prefer: 'outlook.body-content-type="text"' } }
    );
    if (!msgRes.ok) {
      console.error('Graph get message failed:', await msgRes.text());
      return res.status(502).json({ error: "Couldn't read that email" });
    }
    const message = await msgRes.json();
    res.status(200).json({ rawText: formatAsRawText(message) });
  } catch (e) {
    console.error('Graph mail get-message error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
