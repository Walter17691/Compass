// ─────────────────────────────────────────────────────────────────────────
// E2E PREFLIGHT — which Supabase project an E2E run is allowed to touch.
//
// Why this exists. src/supabase.js and tests/e2e/helpers.js both resolved
// their target as:
//
//     import.meta.env.VITE_SUPABASE_URL || 'https://npeegfsoijhdnnvuqjin…'
//
// — a SILENT FALLBACK TO PRODUCTION. For the app that default is correct:
// a production build with no env override should talk to production. For a
// test run it is the opposite of correct, because this suite creates,
// mutates and deletes real rows. Deleting, renaming or emptying one GitHub
// secret was enough to aim the whole suite at the live database, and
// nothing anywhere failed closed. tests/e2e/README.md already conceded it:
// "a .env that doesn't set these still points at production by accident."
//
// This module does not remove that fallback from the app — it makes the
// fallback unreachable during a test run by refusing to start one unless
// the target is explicitly, exactly the dedicated E2E project. The check
// reads the RAW environment variable, never a defaulted value, which is
// the whole point: a missing variable is a refusal, not a silent
// production run.
//
// Deliberately an allow-list of one, not a deny-list of production. A
// deny-list answers "is this production?"; the question that matters is
// "is this the project this suite is allowed to write to?", and only an
// allow-list can refuse a third project nobody has vetted — a stale
// branch's URL, a colleague's personal project, a typo'd ref that happens
// to resolve.
//
// Pure, dependency-free and env-injectable so the regression suite can
// exercise every refusal without setting real environment variables:
// see src/test/e2eSupabaseTargetGuard.test.js.
// ─────────────────────────────────────────────────────────────────────────

// The dedicated, non-production project (compass-e2e-test). The ONLY
// project this suite may run against. Adding a second entry here is a
// deliberate act that should come with its own reason in review.
export const ALLOWED_E2E_PROJECT_REFS = Object.freeze(['zdbbvljbndmujywtkwfy']);

// Named so a refusal can say "that's production" rather than the vaguer
// "that's not the E2E project". Not used as a deny-list — see the header.
export const PRODUCTION_PROJECT_REF = 'npeegfsoijhdnnvuqjin';

export const TARGET_RESULT = Object.freeze({
  OK: 'ok',
  MISSING: 'missing',
  EMPTY: 'empty',
  MALFORMED: 'malformed',
  PRODUCTION: 'production',
  UNEXPECTED_PROJECT: 'unexpected_project',
});

// Supabase project refs are 20 lowercase alphanumerics on *.supabase.co.
// Strict by design: anything else is MALFORMED rather than quietly
// accepted, because a hostname this check cannot parse is a hostname it
// cannot vouch for.
const SUPABASE_HOST = /^([a-z0-9]{20})\.supabase\.co$/;

export function projectRefFromSupabaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // https only. An http:// URL to a real project would downgrade the
  // session's transport, and is not something to accept silently.
  if (url.protocol !== 'https:') return null;
  const match = SUPABASE_HOST.exec(url.hostname);
  return match ? match[1] : null;
}

// Returns a verdict rather than throwing, so tests can assert on each
// distinct refusal reason and the thrower below has one place to format.
export function assessSupabaseTarget(raw) {
  if (raw === undefined || raw === null) {
    return { ok: false, code: TARGET_RESULT.MISSING, ref: null,
      detail: 'VITE_SUPABASE_URL is not set at all.' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, code: TARGET_RESULT.MALFORMED, ref: null,
      detail: `VITE_SUPABASE_URL is a ${typeof raw}, not a string.` };
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    // The exact shape a missing GitHub Actions secret produces: the
    // workflow writes `VITE_SUPABASE_URL=` and the variable exists but
    // is empty, which `||` treats as absent and falls back on.
    return { ok: false, code: TARGET_RESULT.EMPTY, ref: null,
      detail: 'VITE_SUPABASE_URL is set but empty (this is what a missing CI secret produces).' };
  }
  const ref = projectRefFromSupabaseUrl(trimmed);
  if (ref === null) {
    return { ok: false, code: TARGET_RESULT.MALFORMED, ref: null,
      detail: `VITE_SUPABASE_URL is not a recognisable https://<ref>.supabase.co URL: ${trimmed}` };
  }
  if (ref === PRODUCTION_PROJECT_REF) {
    return { ok: false, code: TARGET_RESULT.PRODUCTION, ref,
      detail: `VITE_SUPABASE_URL points at the PRODUCTION project (${ref}).` };
  }
  if (!ALLOWED_E2E_PROJECT_REFS.includes(ref)) {
    return { ok: false, code: TARGET_RESULT.UNEXPECTED_PROJECT, ref,
      detail: `VITE_SUPABASE_URL points at project ${ref}, which is not an approved E2E target.` };
  }
  return { ok: true, code: TARGET_RESULT.OK, ref, url: trimmed, detail: null };
}

// The anon key is required too. Not a second security boundary — a
// mismatched key against the right project simply 401s — but without it
// the run dies deep inside a login helper instead of here, with a message
// that says nothing. Checked for presence only; the value is never read,
// logged or included in any error.
export function assessAnonKey(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, detail: 'VITE_SUPABASE_ANON_KEY is missing or empty.' };
  }
  return { ok: true, detail: null };
}

function refusal(detail) {
  return new Error(
    'E2E PREFLIGHT REFUSED — not starting the dev server or any test.\n\n' +
    `  ${detail}\n\n` +
    '  This suite creates, modifies and deletes real rows, so it may only run\n' +
    `  against the dedicated E2E project (${ALLOWED_E2E_PROJECT_REFS.join(', ')}).\n` +
    '  It must NEVER run against production.\n\n' +
    '  Local: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env —\n' +
    '         see tests/e2e/README.md, "Which Supabase project".\n' +
    '  CI:    both come from repository secrets in the E2E job of\n' +
    '         .github/workflows/ci.yml. An absent secret arrives as an empty\n' +
    '         string, which is why empty is refused here and not defaulted.\n\n' +
    '  This failure is deliberate and must not be worked around by removing\n' +
    '  the check or by widening ALLOWED_E2E_PROJECT_REFS to include production.'
  );
}

// Throws unless the environment names an approved E2E project. Returns the
// validated URL so callers can use it INSTEAD of a `||` default — that is
// what stops the production fallback being reachable from test code.
export function assertE2ESupabaseTarget(env = process.env) {
  const target = assessSupabaseTarget(env.VITE_SUPABASE_URL);
  if (!target.ok) throw refusal(target.detail);
  const key = assessAnonKey(env.VITE_SUPABASE_ANON_KEY);
  if (!key.ok) throw refusal(key.detail);
  return target.url;
}
