import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('APP_URL', () => {
  const ORIGINAL_ENV = process.env.APP_URL;
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = ORIGINAL_ENV;
    vi.resetModules();
  });

  it('defaults to the canonical production domain when APP_URL is not set', async () => {
    delete process.env.APP_URL;
    vi.resetModules();
    const { APP_URL } = await import('./_appUrl.js');
    expect(APP_URL).toBe('https://compasshruk.com');
  });

  it('respects an APP_URL environment override', async () => {
    process.env.APP_URL = 'https://compass-e2e-test.example.com';
    vi.resetModules();
    const { APP_URL } = await import('./_appUrl.js');
    expect(APP_URL).toBe('https://compass-e2e-test.example.com');
  });
});

// Release 1.0 audit remediation — the old, unbranded Vercel deployment
// alias was independently hardcoded in 15 separate files, none aware of
// the others, which is exactly how it silently drifted (only one of the
// three files that then referenced it, api/invite-member.js, had ever
// been fixed to the canonical domain). This structural test fails the
// suite outright if the old hostname reappears in any production api/
// source file — a permanent regression guard, not a one-time cleanup.
describe('no stale compass-lemon-iota.vercel.app references in production api/ source', () => {
  const STALE_DOMAIN = 'compass-lemon-iota.vercel.app';
  const apiDir = join(__dirname);

  // Deliberately exempt: *.test.js (this exact regression class needs the
  // string in its own description/fixtures), and any file under a
  // directory explicitly documented as intentionally historical.
  function collectJsFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) { out.push(...collectJsFiles(full)); continue; }
      if (entry.endsWith('.js') && !entry.endsWith('.test.js')) out.push(full);
    }
    return out;
  }

  it('contains zero occurrences outside test files', () => {
    const offenders = [];
    for (const file of collectJsFiles(apiDir)) {
      const content = readFileSync(file, 'utf8');
      if (content.includes(STALE_DOMAIN)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
