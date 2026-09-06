import { supabaseRequest } from './_supabase.js';
import { postTestWebhook } from './_notify.js';
import { isAllowedWebhookUrl } from './_webhookGuard.js';
import { requireOrgRole } from '../_auth.js';
import { isHrRole } from '../../src/lib/roles.js';

// The client can't POST to a Slack/Teams webhook directly — those
// endpoints don't set CORS headers for browser fetch, only for
// server-to-server calls. This exists purely to let the Settings "Send
// test message" button work, routed through the server the same way the
// real daily digest does.
//
// Release 1.0 audit remediation — this used to trust a client-supplied
// `url`/`type` directly for the outbound POST, checking only that the
// caller belonged to *some* org matching the supplied `orgId`, never that
// `url` actually belonged to that org. Any authenticated member of any
// org (including one they'd just self-registered) could supply a third
// party's real Slack/Teams webhook URL and have Compass's server relay a
// fixed test message to it. Fixed by removing the client's authority over
// the destination entirely — `url`/`type` are no longer read from the
// request body at all. The org's own notification_webhook_url/
// notification_webhook_type (the exact columns saveOrgWebhook already
// writes on blur, before this button is even clickable in the real UI)
// are looked up server-side from the verified orgId, so there is nothing
// left to redirect. Authorization is also tightened from "any org member"
// to the same HR-only bar that already gates saving this setting in the
// first place (protect_organisations_config_columns_trigger).
export async function testNotify(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orgId } = req.body || {};
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  const auth = await requireOrgRole(req, res, orgId, isHrRole);
  if (!auth) return;

  try {
    const orgRes = await supabaseRequest(`organisations?id=eq.${encodeURIComponent(orgId)}&select=notification_webhook_url,notification_webhook_type`);
    const [org] = await orgRes.json();
    const url = org?.notification_webhook_url;
    const type = org?.notification_webhook_type;
    if (!url) return res.status(400).json({ error: 'No notification webhook is configured for this organisation yet.' });
    if (!isAllowedWebhookUrl(url, type)) {
      return res.status(400).json({ error: `That doesn't look like a valid ${type === 'teams' ? 'Teams' : 'Slack'} webhook URL` });
    }

    const ok = await postTestWebhook(url, type);
    if (!ok) return res.status(502).json({ error: 'Webhook responded with an error' });
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Test notify error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
