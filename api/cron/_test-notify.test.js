import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testNotify } from './_test-notify.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// Release 1.0 audit remediation — the endpoint used to trust a
// client-supplied `url`/`type` for the actual outbound POST, checking only
// that the caller belonged to *some* org, never that `url` belonged to
// that org. These tests prove the destination now comes exclusively from
// the authenticated organisation's own stored configuration, that a
// non-HR member can't trigger it, and that no external POST ever happens
// on a denied/error path.
function stubFetch({
  authOk = true,
  role = 'hr_director',
  orgWebhookUrl = 'https://hooks.slack.com/services/T00/B00/xxx',
  orgWebhookType = 'slack',
  webhookPostOk = true,
} = {}) {
  const postedUrls = [];
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return authOk
        ? Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1' }) })
        : Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }
    if (u.includes('/rest/v1/org_members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(role ? [{ id: 'm1', role }] : []) });
    }
    if (u.includes('/rest/v1/organisations')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ notification_webhook_url: orgWebhookUrl, notification_webhook_type: orgWebhookType }]),
      });
    }
    // Anything else is treated as the actual outbound webhook POST.
    postedUrls.push(u);
    return webhookPostOk
      ? Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') })
      : Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('server error') });
  });
  return postedUrls;
}

const req = (overrides = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer good' },
  body: { orgId: 'org-1', ...overrides },
});

describe('testNotify — destination is authoritative, not client-supplied', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('unauthenticated caller is denied, and no webhook POST occurs', async () => {
    const posted = stubFetch({ authOk: false });
    const res = mockRes();
    await testNotify({ ...req(), headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(posted).toHaveLength(0);
  });

  it('caller not a member of the org is denied, and no webhook POST occurs', async () => {
    const posted = stubFetch({ role: null });
    const res = mockRes();
    await testNotify(req(), res);
    expect(res.statusCode).toBe(403);
    expect(posted).toHaveLength(0);
  });

  it('non-HR member is denied even with valid org membership, and no webhook POST occurs', async () => {
    const posted = stubFetch({ role: 'line_manager' });
    const res = mockRes();
    await testNotify(req(), res);
    expect(res.statusCode).toBe(403);
    expect(posted).toHaveLength(0);
  });

  it('org with no configured webhook gets a truthful denial, and no webhook POST occurs', async () => {
    const posted = stubFetch({ orgWebhookUrl: null });
    const res = mockRes();
    await testNotify(req(), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/no notification webhook is configured/i);
    expect(posted).toHaveLength(0);
  });

  it('a client-supplied url is completely ignored — the org\'s own configured Slack URL is always used', async () => {
    const posted = stubFetch({ orgWebhookUrl: 'https://hooks.slack.com/services/REAL/ORG/URL', orgWebhookType: 'slack' });
    const res = mockRes();
    await testNotify(req({ url: 'https://hooks.slack.com/services/ATTACKER/CONTROLLED/URL', type: 'slack' }), res);
    expect(res.statusCode).toBe(200);
    expect(posted).toEqual(['https://hooks.slack.com/services/REAL/ORG/URL']);
  });

  it('a same-request cross-org url cannot be used — only the verified orgId\'s own stored webhook is ever posted to', async () => {
    const posted = stubFetch({ orgWebhookUrl: 'https://hooks.slack.com/services/ORG-1/OWN/URL', orgWebhookType: 'slack' });
    const res = mockRes();
    await testNotify(req({ url: 'https://hooks.slack.com/services/ORG-2/OTHER-TENANT/URL' }), res);
    expect(res.statusCode).toBe(200);
    expect(posted).toEqual(['https://hooks.slack.com/services/ORG-1/OWN/URL']);
  });

  it('configured Slack webhook: allowed', async () => {
    const posted = stubFetch({ orgWebhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx', orgWebhookType: 'slack' });
    const res = mockRes();
    await testNotify(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(posted).toHaveLength(1);
  });

  it('configured Teams webhook: allowed', async () => {
    const posted = stubFetch({ orgWebhookUrl: 'https://acme.webhook.office.com/webhookb2/xxx', orgWebhookType: 'teams' });
    const res = mockRes();
    await testNotify(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(posted).toHaveLength(1);
  });

  it('a malformed stored webhook URL is rejected without posting', async () => {
    const posted = stubFetch({ orgWebhookUrl: 'https://not-a-real-webhook.example.com/x', orgWebhookType: 'slack' });
    const res = mockRes();
    await testNotify(req(), res);
    expect(res.statusCode).toBe(400);
    expect(posted).toHaveLength(0);
  });

  it('a failed webhook delivery surfaces a 502, not a false success', async () => {
    stubFetch({ webhookPostOk: false });
    const res = mockRes();
    await testNotify(req(), res);
    expect(res.statusCode).toBe(502);
  });

  it('missing orgId is rejected before any auth/webhook work', async () => {
    const posted = stubFetch();
    const res = mockRes();
    await testNotify(req({ orgId: undefined }), res);
    expect(res.statusCode).toBe(400);
    expect(posted).toHaveLength(0);
  });
});
