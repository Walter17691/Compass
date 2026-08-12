import { getConnectionWithFreshToken, graphRequest } from './_outlook.js';
import { verifyCaller } from '../_auth.js';

export async function listMessages(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // Per-caller inbox contents must never be cached — a stale/shared cache
  // entry here means one user's response gets replayed to a later request,
  // exactly what happened when a 304 kept serving the very first (mostly
  // empty) inbox snapshot back on every subsequent load.
  res.setHeader('Cache-Control', 'no-store');

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const conn = await getConnectionWithFreshToken(caller.id);
    if (!conn) return res.status(404).json({ error: 'No Outlook connection for this user' });

    const listRes = await graphRequest(
      conn.accessToken,
      "me/mailFolders('Inbox')/messages?$top=15&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,bodyPreview"
    );
    if (!listRes.ok) {
      console.error('Graph list messages failed:', await listRes.text());
      return res.status(502).json({ error: "Couldn't read your Outlook inbox" });
    }
    const data = await listRes.json();
    const messages = (data.value || []).map(m => ({
      id: m.id,
      subject: m.subject || '(no subject)',
      from: m.from?.emailAddress?.address || m.from?.emailAddress?.name || 'Unknown sender',
      receivedAt: m.receivedDateTime,
      preview: m.bodyPreview || '',
    }));
    res.status(200).json({ messages });
  } catch (e) {
    console.error('Graph mail list-messages error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
