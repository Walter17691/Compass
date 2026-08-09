import { test, expect } from '@playwright/test';

// /api/portal/* isn't proxied by the local vite dev server (only /api/chat
// is — see vite.config.js and the note in playwright.config.js).
test.use({ baseURL: 'https://compass-lemon-iota.vercel.app' });

// Onboarding checklist tasks are only ever owned by HR/Line Manager/IT/
// Facilities/Payroll (see OWNERS in TemplatesSection.jsx) — never the
// employee. The portal previously let a logged-in employee POST
// /api/portal/onboarding to toggle any task, including ones like
// "Payroll: add to payroll system" that aren't theirs to mark done,
// corrupting the tracking staff actually rely on. The fix makes the
// endpoint GET-only; the method check happens before the auth check, so
// this is provable without a real portal session — any POST must be
// rejected regardless of who's asking.
test('the onboarding checklist endpoint rejects writes entirely, even before checking who is asking', async ({ request }) => {
  const res = await request.post('/api/portal/onboarding', {
    data: { taskId: 'whatever', done: true },
  });
  expect(res.status()).toBe(405);
});
