import { defineConfig, devices } from '@playwright/test';

// E2E tests run against the local dev server, same as the app itself in
// dev — this covers everything except /api/calendar, /api/portal and
// /api/signing, which vite.config.js only proxies /api/chat for (see that
// file's server.proxy block). signature-sync.spec.js overrides baseURL to
// the deployed URL for that reason; /api/calendar and /api/portal stay
// manually verified against the deployed URL, same limitation noted when
// they were built.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // tests share one Supabase test-org account; serialize to avoid cross-test data races
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
