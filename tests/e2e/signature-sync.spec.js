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
// actually been captured. This simulates the employee's side (a raw
// POST to /api/signing, the same call the portal's sign page makes)
// and confirms the case picks up "Signed" automatically on next view,
// with no manual button ever clicked.
test('a meeting shows Signed automatically once the real signature lands, without the manual Mark signed button', async ({ page }) => {
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
  await expect(page.getByText('Pending signature', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Mark signed' })).toBeVisible();

  // Simulate the employee actually signing — the same call the portal's
  // sign page makes, bypassing the UI since that flow needs a separate
  // portal-account login this test doesn't set up.
  const signResult = await page.request.post('/api/signing', {
    data: { signId, signature: 'data:image/png;base64,fakeSignatureDataForE2ETest', signedAt: new Date().toISOString() },
  });
  expect(signResult.ok()).toBeTruthy();

  // Leave and come back to the case — this is what triggers the sync
  // check. No "Mark signed" click anywhere in this test.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByText(employeeName).first().click().catch(() => {});
  if (!(await page.getByText('Signed', { exact: true }).isVisible({ timeout: 2000 }).catch(() => false))) {
    // Fall back to Cases if the Home dashboard doesn't surface this case directly.
    await page.getByRole('button', { name: 'Cases', exact: false }).first().click();
    await page.getByText(employeeName).first().click();
  }

  await expect(page.getByText('Signed', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Mark signed' })).not.toBeVisible();
});
