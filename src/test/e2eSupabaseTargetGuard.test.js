import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  assessSupabaseTarget, assessAnonKey, assertE2ESupabaseTarget,
  projectRefFromSupabaseUrl, ALLOWED_E2E_PROJECT_REFS,
  PRODUCTION_PROJECT_REF, TARGET_RESULT,
} from '../../tests/e2e/supabaseTarget.js';

// ─────────────────────────────────────────────────────────────────────────
// E2E PREFLIGHT GUARD — the regression suite for the one check standing
// between the Playwright suite and the live customer database.
//
// The defect it closes: src/supabase.js and tests/e2e/helpers.js both
// resolved their Supabase target with `|| '<production URL>'`, so an
// unset or empty VITE_SUPABASE_URL silently aimed a suite that creates,
// mutates and deletes rows at production. One deleted CI secret was
// enough. tests/e2e/README.md had already written the risk down.
//
// These tests drive the pure assessor with injected values — no real
// environment variable is read or written, no network call is made, and
// no Playwright spec runs. Every refusal is paired with the accepting
// case for the same input shape, so a guard that refused everything
// (equally useless, and much easier to ship by accident) fails here.
// ─────────────────────────────────────────────────────────────────────────

const E2E_URL = 'https://zdbbvljbndmujywtkwfy.supabase.co';
const PROD_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
const ANON = 'any-non-empty-value';

describe('E2E preflight — the five required refusals', () => {
  it('REFUSES a missing URL', () => {
    const r = assessSupabaseTarget(undefined);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(TARGET_RESULT.MISSING);
    // Also the null case: `delete process.env.X` and an explicit null are
    // different shapes that must not diverge.
    expect(assessSupabaseTarget(null).code).toBe(TARGET_RESULT.MISSING);
  });

  it('REFUSES an empty or whitespace-only URL — the exact shape of an absent CI secret', () => {
    // GitHub Actions interpolates an undefined secret to '', so the
    // workflow writes `VITE_SUPABASE_URL=` and the variable exists but is
    // empty. `||` treated that as absent and fell back to production.
    for (const value of ['', '   ', '\t', '\n', ' \t\n ']) {
      const r = assessSupabaseTarget(value);
      expect(r.ok, `${JSON.stringify(value)} must be refused`).toBe(false);
      expect(r.code).toBe(TARGET_RESULT.EMPTY);
    }
  });

  it('REFUSES the production project explicitly, and says so', () => {
    const r = assessSupabaseTarget(PROD_URL);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(TARGET_RESULT.PRODUCTION);
    expect(r.ref).toBe(PRODUCTION_PROJECT_REF);
    expect(r.detail).toMatch(/PRODUCTION/);
  });

  it('REFUSES an unexpected third project that is neither production nor the E2E one', () => {
    // The case a production deny-list would wave through: a stale branch's
    // URL, someone's personal project, a typo'd ref that still parses.
    const r = assessSupabaseTarget('https://abcdefghijklmnopqrst.supabase.co');
    expect(r.ok).toBe(false);
    expect(r.code).toBe(TARGET_RESULT.UNEXPECTED_PROJECT);
    expect(r.ref).toBe('abcdefghijklmnopqrst');
  });

  it('REFUSES malformed URLs', () => {
    for (const value of [
      'not-a-url',
      'zdbbvljbndmujywtkwfy.supabase.co',                 // no scheme
      'http://zdbbvljbndmujywtkwfy.supabase.co',          // plaintext downgrade
      'https://zdbbvljbndmujywtkwfy.supabase.co.evil.com', // suffix attack
      'https://evil.com/zdbbvljbndmujywtkwfy.supabase.co', // path, not host
      'https://supabase.co',
      'https://short.supabase.co',                        // ref wrong length
    ]) {
      const r = assessSupabaseTarget(value);
      expect(r.ok, `${value} must be refused`).toBe(false);
      expect(r.code, `${value}`).toBe(TARGET_RESULT.MALFORMED);
    }
  });

  it('REFUSES a non-string', () => {
    expect(assessSupabaseTarget(42).code).toBe(TARGET_RESULT.MALFORMED);
    expect(assessSupabaseTarget({}).code).toBe(TARGET_RESULT.MALFORMED);
  });
});

describe('E2E preflight — the accepting case, so the guard is not merely a wall', () => {
  it('ACCEPTS the dedicated E2E project', () => {
    const r = assessSupabaseTarget(E2E_URL);
    expect(r.ok).toBe(true);
    expect(r.code).toBe(TARGET_RESULT.OK);
    expect(r.ref).toBe('zdbbvljbndmujywtkwfy');
    expect(r.url).toBe(E2E_URL);
  });

  it('ACCEPTS it with surrounding whitespace, which a shell-written .env can introduce', () => {
    expect(assessSupabaseTarget(`  ${E2E_URL}  `).ok).toBe(true);
    expect(assessSupabaseTarget(`${E2E_URL}/`).ok).toBe(true);
  });

  it('ACCEPTS an uppercase host, because that is the same project', () => {
    // Caught by this suite as a refusal I had expected and was wrong to:
    // new URL() lowercases the host per the WHATWG URL spec, and DNS is
    // case-insensitive, so this resolves to the identical project. Refusing
    // it would reject a legitimately-equivalent URL rather than close any
    // hole — the host comparison is deliberately case-insensitive and the
    // case-sensitive-looking regex only ever sees normalised output.
    const r = assessSupabaseTarget('https://ZDBBVLJBNDMUJYWTKWFY.supabase.co');
    expect(r.ok).toBe(true);
    expect(r.ref).toBe('zdbbvljbndmujywtkwfy');
    // The same normalisation must NOT launder production into acceptance.
    expect(assessSupabaseTarget('https://NPEEGFSOIJHDNNVUQJIN.supabase.co').code)
      .toBe(TARGET_RESULT.PRODUCTION);
  });

  it('is an allow-list of exactly one project, and production is not in it', () => {
    expect(ALLOWED_E2E_PROJECT_REFS).toEqual(['zdbbvljbndmujywtkwfy']);
    expect(ALLOWED_E2E_PROJECT_REFS).not.toContain(PRODUCTION_PROJECT_REF);
    expect(Object.isFrozen(ALLOWED_E2E_PROJECT_REFS)).toBe(true);
  });

  it('extracts the project ref only from the host, never from elsewhere in the URL', () => {
    expect(projectRefFromSupabaseUrl(E2E_URL)).toBe('zdbbvljbndmujywtkwfy');
    expect(projectRefFromSupabaseUrl('https://evil.com/?x=zdbbvljbndmujywtkwfy.supabase.co')).toBeNull();
  });
});

describe('E2E preflight — the thrower, which is what playwright.config.js calls', () => {
  it('throws for every refusal, with the reason and no credential in the message', () => {
    for (const env of [
      {},
      { VITE_SUPABASE_URL: '' },
      { VITE_SUPABASE_URL: PROD_URL },
      { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' },
      { VITE_SUPABASE_URL: 'not-a-url' },
    ]) {
      const call = () => assertE2ESupabaseTarget({ ...env, VITE_SUPABASE_ANON_KEY: ANON });
      expect(call).toThrow(/E2E PREFLIGHT REFUSED/);
      // The message must never carry the key it was handed.
      let message = '';
      try { call(); } catch (e) { message = e.message; }
      expect(message).not.toContain(ANON);
    }
  });

  it('returns the validated URL on success, so callers need no `||` default', () => {
    const url = assertE2ESupabaseTarget({ VITE_SUPABASE_URL: E2E_URL, VITE_SUPABASE_ANON_KEY: ANON });
    expect(url).toBe(E2E_URL);
  });

  it('requires the anon key too, and never echoes it', () => {
    expect(assessAnonKey(undefined).ok).toBe(false);
    expect(assessAnonKey('').ok).toBe(false);
    expect(assessAnonKey('   ').ok).toBe(false);
    expect(assessAnonKey(ANON).ok).toBe(true);
    let message = '';
    try { assertE2ESupabaseTarget({ VITE_SUPABASE_URL: E2E_URL }); } catch (e) { message = e.message; }
    expect(message).toMatch(/ANON_KEY is missing or empty/);
  });

  it('has no CI-only branch and no opt-out — the same refusal in both environments', () => {
    // A guard that softened anywhere would soften exactly where it is
    // needed. Asserted against the source because there is no way to
    // observe the absence of a branch from the outside.
    const src = readFileSync('tests/e2e/supabaseTarget.js', 'utf8');
    expect(src).not.toMatch(/process\.env\.CI/);
    expect(src).not.toMatch(/SKIP|BYPASS|FORCE|ALLOW_PRODUCTION/i);
  });
});

describe('E2E preflight — the fallback it exists to make unreachable', () => {
  it('no longer lets tests/e2e/helpers.js resolve to production', () => {
    const src = readFileSync('tests/e2e/helpers.js', 'utf8');
    // The two defaults that were the bypass.
    expect(src).not.toMatch(/\|\|\s*'https:\/\/npeegfsoijhdnnvuqjin/);
    expect(src).not.toContain(PRODUCTION_PROJECT_REF);
    // And it takes its value from the validated source instead.
    expect(src).toMatch(/SUPABASE_URL = assertE2ESupabaseTarget\(\)/);
  });

  it('runs the guard before the dev server is started', () => {
    // playwright.config.js's webServer runs `npm run dev`. The guard must
    // be invoked at config load, above that block — if it moved below or
    // into a hook, the app would already have booted against the wrong
    // project before anything refused.
    const src = readFileSync('playwright.config.js', 'utf8');
    // Anchored on the real config key, not the bare word — which also
    // appears in the explanatory comment above the guard, and matching
    // that instead made this assertion fail for the wrong reason.
    const guardAt = src.indexOf('\nassertE2ESupabaseTarget();');
    const serverAt = src.indexOf('webServer: {');
    expect(guardAt, 'guard call not found at statement position').toBeGreaterThan(-1);
    expect(serverAt, 'webServer config block not found').toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(serverAt);
    // And it must be a top-level statement, not inside a function or hook
    // that only runs after the server is already up.
    expect(src).toMatch(/^assertE2ESupabaseTarget\(\);$/m);
  });

  it('leaves the application\'s own production default alone', () => {
    // src/supabase.js SHOULD fall back to production — a production build
    // with no env override must talk to production. The guard's job is to
    // stop a TEST RUN reaching that path, not to change app behaviour.
    const src = readFileSync('src/supabase.js', 'utf8');
    expect(src).toContain(PRODUCTION_PROJECT_REF);
  });

  it('CI still supplies the E2E URL to both the app and the tests', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    // Mapped from a secret into the step env, and written into the .env
    // that `node --env-file=.env` loads before Playwright starts.
    expect(ci).toMatch(/VITE_SUPABASE_URL:\s*\$\{\{\s*secrets\.VITE_SUPABASE_URL\s*\}\}/);
    expect(ci).toMatch(/echo "VITE_SUPABASE_URL=\$VITE_SUPABASE_URL" >> \.env/);
    expect(ci).toMatch(/VITE_SUPABASE_ANON_KEY:\s*\$\{\{\s*secrets\.VITE_SUPABASE_ANON_KEY\s*\}\}/);
    expect(ci).toMatch(/echo "VITE_SUPABASE_ANON_KEY=\$VITE_SUPABASE_ANON_KEY" >> \.env/);
    // And the second-tenant secrets this guard sits alongside are still
    // wired — the tenant-isolation spec must not be weakened by this work.
    expect(ci).toMatch(/E2E_TEST_EMAIL_2:\s*\$\{\{\s*secrets\.E2E_TEST_EMAIL_2\s*\}\}/);
    expect(ci).toMatch(/E2E_TEST_PASSWORD_2:\s*\$\{\{\s*secrets\.E2E_TEST_PASSWORD_2\s*\}\}/);
  });
});
