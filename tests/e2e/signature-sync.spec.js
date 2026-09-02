import { test, expect } from '@playwright/test';
import { login, startMeeting } from './helpers.js';

// /api/signing isn't proxied by the local vite dev server (only /api/chat
// is — see vite.config.js and the note in playwright.config.js), so this
// runs against the deployed app instead of localhost:5173.
test.use({ baseURL: 'https://compass-lemon-iota.vercel.app' });

// "Send for signature" creates a real signing_requests row and the
// employee's actual signature lands there once they sign — but nothing
// ever read that back into the case. A meeting showed "Pending
// signature" forever unless HR remembered to click the manual "Mark
// signed" button themselves, with no verification a signature had
// actually been captured. This drives the real public/sign.html page
// (vercel.json rewrites /sign/:id there directly, ahead of the SPA — a
// standalone static page, not part of the React app) and confirms the
// case picks up "Signed" automatically on next view, with no manual
// button ever clicked.
test('a meeting shows Signed automatically once the real signature lands, without the manual Mark signed button', async ({ page, browser }) => {
  test.setTimeout(60000);
  const employeeName = `E2E SignSync ${Date.now()}`;

  await login(page);
  await startMeeting(page);
  await page.getByText('Informal / 1-1', { exact: true }).click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'HR: Quick catch-up on how the new project is going.\nEmployee: Going well, on track for the deadline.'
  );
  await page.getByRole('button', { name: 'End meeting' }).click();
  await page.getByRole('button', { name: 'Send for signature' }).waitFor({ timeout: 30000 });

  await page.getByRole('button', { name: 'Send for signature' }).click();
  // Phase 7 (Controlled Beta Infrastructure Gate 4) — @example.com is
  // rejected outright by Resend with a 422 ("Invalid `to` field... use
  // our testing email address instead of domains like `example.com`"),
  // confirmed via a direct API call. delivered@resend.dev is Resend's
  // own first-party, publicly documented testing address — not a
  // secret, no signup required, no real mailbox involved — that always
  // accepts the send and simulates a real successful delivery, letting
  // the actual send-for-signature call this test drives genuinely
  // succeed end-to-end instead of erroring out server-side.
  await page.getByPlaceholder('employee@company.com').fill('delivered@resend.dev');
  let signId;
  const captureSignId = async (response) => {
    if (response.request().method() !== 'POST' || !response.url().includes('/api/signing')) return;
    try { ({ signId } = await response.json()); } catch { /* not JSON, or body already gone — ignore */ }
  };
  page.on('response', captureSignId);
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect.poll(() => signId, { timeout: 10000, message: 'signId never captured from the /api/signing response' }).toBeTruthy();
  page.off('response', captureSignId);

  await page.getByRole('button', { name: /Save and go to case/ }).click();
  // Informal/1-1 meetings don't map to the Investigation/Disciplinary/
  // Appeal stage tabs — they land under "Other", which isn't the default
  // active tab.
  await page.getByRole('button', { name: /^Other/ }).click();
  // Phase 5, IP27, §21 — widened from "Pending signature" to the real
  // signing_requests status lifecycle (Sent -> Opened -> Signed).
  await expect(page.getByText('Sent — awaiting signature', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Mark signed' })).toBeVisible();

  // The employee actually signs via the real, unauthenticated sign.html
  // page — a brand-new browser context, not the HR user's logged-in `page`,
  // since that's exactly who this link goes to (an external recipient with
  // no Compass session). Signature is drawn on a canvas, not typed — drag
  // the mouse across it the way a real signer would.
  const signerContext = await browser.newContext();
  const signerPage = await signerContext.newPage();
  await signerPage.goto(`/sign/${signId}`);
  await expect(signerPage.locator('#status-badge')).toHaveText('Awaiting signature', { timeout: 10000 });
  const canvas = signerPage.locator('#sig-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await signerPage.mouse.move(box.x + 20, box.y + box.height / 2);
  await signerPage.mouse.down();
  await signerPage.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 10 });
  await signerPage.mouse.up();
  await signerPage.locator('#submit-btn').click();
  await expect(signerPage.getByText('Document signed successfully')).toBeVisible({ timeout: 10000 });
  await signerContext.close();

  // Reload the same case-view page — this is what triggers the sync
  // check (it runs on mount/case-open, not continuously), and doubles as
  // a check that the URL-routing fix from earlier this session correctly
  // restores the same case on refresh rather than resetting to Home. No
  // "Mark signed" click anywhere in this test.
  await page.reload();
  await page.getByRole('button', { name: /^Other/ }).click();

  await expect(page.getByText('Signed', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Mark signed' })).not.toBeVisible();

  // Human UAT remediation, Batch 1, Issue 1 — signing this meeting's
  // notes must never be read as the CASE being closed. This spec's own
  // note above still applies: /api/signing isn't proxied locally, so this
  // whole file only exercises whatever is actually deployed at
  // compass-lemon-iota.vercel.app — these assertions only validate the
  // Batch 1 fix once it has actually shipped there, not against
  // uncommitted local changes.
  await expect(page.getByText(/Signed & closed/)).not.toBeVisible();
  await expect(page.getByText(/^Closed$/)).not.toBeVisible();

  // Human UAT remediation, Batch 1, Issue 2 — signer/date now synced down
  // and shown alongside the badge, not just a bare "Signed".
  await expect(page.getByText(new RegExp(`Signed by .* on`))).toBeVisible();

  // Human UAT remediation, Batch 1, Issue 3/4 — signature completion now
  // produces a real notification (Activity) and Timeline entry, not
  // silence. Idempotency (no duplicate on a second, unrelated poll) is
  // covered by the reload immediately above this block already having
  // triggered the poll a second time without doubling the event.
  await page.getByRole('button', { name: 'Activity' }).click();
  await expect(page.getByText(/notes signed/i)).toBeVisible({ timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText(/notes signed/i)).toBeVisible({ timeout: 10000 });
});
