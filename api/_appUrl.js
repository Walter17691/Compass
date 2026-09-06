// Canonical production application URL — single source of truth.
// Previously, 15 files each hardcoded their own identical copy of the
// old, unbranded Vercel deployment alias, including in OAuth redirect_uri
// construction, where a typo or drift between copies would silently
// break a provider's exact-match check. Same fallback-constant
// convention as api/_supabase.js's SUPABASE_URL — an env var override for
// non-production deployments, defaulting to the real production domain.
export const APP_URL = process.env.APP_URL || 'https://compasshruk.com';
