import { isAllowedWebhookUrl } from './_webhookGuard.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

// Integrations & Workflow Automation (Phase 5, IP26, §16) — genuine
// redesign, not an extension. Slack/Teams webhooks are one shared,
// org-wide destination with no per-recipient authorisation check (see
// _digest.js's own comment on why confidential deadlines are filtered
// out before reaching this file at all) — unlike the per-member email
// digest (_digest.js's digestHtml, sent only to someone already
// authorised to see that specific deadline), a channel can be read by
// anyone with access to it, including people with no right to know who's
// under investigation or why. This used to spell out employee names and
// specific deadline labels directly in the message; now it only ever
// says how many actions need attention, sending everyone to Compass
// itself — where the real, permission-scoped detail already lives — to
// find out what and who. isAllowedWebhookUrl's SSRF-safe delivery below
// is unchanged; only the message content is.
function slackPayload(count) {
  return {
    text: `Compass HR: ${count} action${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} attention`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${count} action${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} attention.*\nOpen Compass to see what's due — case and employee details stay in the app, never in this channel.` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `<${APP_URL}|Open Compass>` }] },
    ],
  };
}

function teamsPayload(count) {
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    summary: 'Compass HR notification',
    title: `${count} action${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} attention`,
    text: "Open Compass to see what's due — case and employee details stay in the app, never in this channel.",
    potentialAction: [{ '@type': 'OpenUri', name: 'Open Compass', targets: [{ os: 'default', uri: APP_URL }] }],
  };
}

export function payloadFor(type, count) {
  return type === 'teams' ? teamsPayload(count) : slackPayload(count);
}

export async function postWebhook(url, type, count) {
  if (!isAllowedWebhookUrl(url, type)) {
    console.error('Webhook notify blocked — URL is not an allowed Slack/Teams host:', url);
    return false;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadFor(type, count)),
  });
  if (!res.ok) console.error('Webhook notify failed:', url, res.status, await res.text());
  return res.ok;
}

// The Settings "Send test message" button (api/cron/_test-notify.js) has
// no real deadlines to count — a distinct, clearly-labelled test message
// rather than forcing a fake "1 action needs attention" through the real
// payload shape above.
function slackTestPayload() {
  return {
    text: 'Compass HR: Test message — your notifications are connected',
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: "*Test message — your notifications are connected.*\nYou'll see a message like this here whenever there are actions needing attention in Compass." } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `<${APP_URL}|Open Compass>` }] },
    ],
  };
}

function teamsTestPayload() {
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    summary: 'Compass HR notification',
    title: 'Test message — your notifications are connected',
    text: "You'll see a message like this here whenever there are actions needing attention in Compass.",
    potentialAction: [{ '@type': 'OpenUri', name: 'Open Compass', targets: [{ os: 'default', uri: APP_URL }] }],
  };
}

export function testPayloadFor(type) {
  return type === 'teams' ? teamsTestPayload() : slackTestPayload();
}

export async function postTestWebhook(url, type) {
  if (!isAllowedWebhookUrl(url, type)) {
    console.error('Webhook notify blocked — URL is not an allowed Slack/Teams host:', url);
    return false;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayloadFor(type)),
  });
  if (!res.ok) console.error('Webhook test notify failed:', url, res.status, await res.text());
  return res.ok;
}
