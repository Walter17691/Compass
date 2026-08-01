import { isAllowedWebhookUrl } from './_webhookGuard.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

function slackPayload(urgent) {
  const lines = urgent.map(d => `• *${d.employeeName}* — ${d.label} (${d.overdue ? `${d.daysOverdue}d overdue` : `${d.daysLeft}d left`})`);
  return {
    text: `Compass HR: ${urgent.length} compliance deadline${urgent.length === 1 ? '' : 's'} need${urgent.length === 1 ? 's' : ''} attention`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${urgent.length} compliance deadline${urgent.length === 1 ? '' : 's'} need${urgent.length === 1 ? 's' : ''} attention*\n${lines.join('\n')}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `<${APP_URL}|Open Compass>` }] },
    ],
  };
}

function teamsPayload(urgent) {
  const lines = urgent.map(d => `- **${d.employeeName}** — ${d.label} (${d.overdue ? `${d.daysOverdue}d overdue` : `${d.daysLeft}d left`})`).join('\n\n');
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    summary: 'Compass HR deadline digest',
    title: `${urgent.length} compliance deadline${urgent.length === 1 ? '' : 's'} need${urgent.length === 1 ? 's' : ''} attention`,
    text: lines,
    potentialAction: [{ '@type': 'OpenUri', name: 'Open Compass', targets: [{ os: 'default', uri: APP_URL }] }],
  };
}

export function payloadFor(type, urgent) {
  return type === 'teams' ? teamsPayload(urgent) : slackPayload(urgent);
}

export async function postWebhook(url, type, urgent) {
  if (!isAllowedWebhookUrl(url, type)) {
    console.error('Webhook notify blocked — URL is not an allowed Slack/Teams host:', url);
    return false;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadFor(type, urgent)),
  });
  if (!res.ok) console.error('Webhook notify failed:', url, res.status, await res.text());
  return res.ok;
}
