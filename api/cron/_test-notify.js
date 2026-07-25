import { supabaseRequest } from './_supabase.js';
import { postWebhook } from './_notify.js';
import { verifyCaller } from '../_auth.js';

// The client can't POST to a Slack/Teams webhook directly — those
// endpoints don't set CORS headers for browser fetch, only for
// server-to-server calls. This exists purely to let the Settings "Send
// test message" button work, routed through the server the same way the
// real daily digest does.
export async function testNotify(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId, url, type } = req.body;
  if (!orgId || !url) return res.status(400).json({ error: 'orgId and url are required' });

  try {
    // Verify the caller actually belongs to this org before using it to
    // fire an arbitrary outbound POST on the server's behalf.
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=id`);
    const members = await memberRes.json();
    if (!members.length) return res.status(403).json({ error: 'Not a member of this organisation' });

    const ok = await postWebhook(url, type, [{ employeeName: 'Compass HR', label: 'Test message — your notifications are connected', overdue: false, daysLeft: 0 }]);
    if (!ok) return res.status(502).json({ error: 'Webhook responded with an error' });
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Test notify error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
