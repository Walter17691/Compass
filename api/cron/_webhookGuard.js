// The Slack/Teams webhook URL is stored on organisations and settable by
// any hr_director/hr_manager — and now that organisations has an UPDATE
// policy (organisations_rls_2026-07-25.sql), a member could also write it
// directly via supabase-js, bypassing any client-side validation. So this
// has to be enforced at the point the server actually fires the outbound
// request, not just in the Settings form.
const SLACK_HOST = 'hooks.slack.com';
const TEAMS_HOST_SUFFIX = '.webhook.office.com';
const TEAMS_LEGACY_HOST = 'outlook.office.com';

export function isAllowedWebhookUrl(url, type) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  if (type === 'teams') {
    return host === TEAMS_LEGACY_HOST || host.endsWith(TEAMS_HOST_SUFFIX);
  }
  return host === SLACK_HOST;
}
