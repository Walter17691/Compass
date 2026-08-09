import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// /api/signing isn't proxied by the local vite dev server (only /api/chat
// is — see vite.config.js and the note in playwright.config.js), so this
// runs against the deployed app instead of localhost:5173.
test.use({ baseURL: 'https://compass-lemon-iota.vercel.app' });

// "Send for signature" creates a real signing_requests row and the
// employee's actual signature lands there once they sign — but nothing
// ever read that back into the case. A meeting showed "Pending
// signature" forever unless HR remembered to click the manual "Mark
// signed" button themselves, with no verification a signature had
// actually been captured. This drives the real /sign/{signId} page (the
// same page the "Review and Sign" email link points to — that route did
// not exist at all until this fix; the email link previously dead-ended
// at the login screen) and confirms the case picks up "Signed"
// automatically on next view, with no manual button ever clicked.
test('a meeting shows Signed automatically once the real signature lands, without the manual Mark signed button', async ({ page, browser }) => {
  test.setTimeout(60000);
  const employeeName = `E2E SignSync ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Start meeting' }).click();
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
  await page.getByPlaceholder('employee@company.com').fill('employee-e2e-test@example.com');
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
  await expect(page.getByText('Pending signature', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Mark signed' })).toBeVisible();

  // The employee actually signs via the real, unauthenticated /sign/{signId}
  // page — a brand-new browser context, not the HR user's logged-in `page`,
  // since that's exactly who this link goes to (an external recipient with
  // no Compass session).
  const signerContext = await browser.newContext();
  const signerPage = await signerContext.newPage();
  await signerPage.goto(`/sign/${signId}`);
  await expect(signerPage.getByText('Informal / 1-1')).toBeVisible({ timeout: 10000 });
  await signerPage.getByPlaceholder('Full name').fill(employeeName);
  await signerPage.getByRole('button', { name: 'Confirm signature' }).click();
  await expect(signerPage.getByText('Signed by', { exact: false })).toBeVisible({ timeout: 10000 });
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
});
