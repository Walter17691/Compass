export function ls(key, fallback) {
  try { const v = typeof localStorage !== 'undefined' && localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(e) { return fallback; }
}
// Phase 6.5 hardening (Prompt 14, Section 9 — closes independent audit
// finding 10.1) — was a bare try/catch swallowing every error, including
// QuotaExceededError. Live-reproduced via E2E: an org whose case data
// has grown large enough to exceed the browser's localStorage quota gets
// this write failing on every single save, completely silently — no
// console output, no user-facing signal, nothing. The cache is
// non-critical (Supabase remains the real source of truth; this only
// speeds up initial paint), so this still doesn't throw or surface a
// user-facing error for what's ultimately a soft-fail path — but a
// developer/support engineer investigating "why does this org's app
// feel slower to load than everyone else's" now has something to find.
export function lsSet(key, val) { try { if(typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.error(`lsSet: failed to write "${key}" to localStorage`, e); } }

// Phase 6.5 hardening — tenant isolation. Every org-scoped App.jsx
// localStorage key (cases, employee records, wellbeing notes, branding
// assets, the live meeting draft, ...) goes through this so two
// different orgs on the same browser can never seed one org's cached
// data from another's — see App.jsx's own orgLs/orgLsSet header comment
// for the full reasoning. "noorg" fallback matches how App.jsx already
// treats a not-yet-available org id elsewhere (never actually reachable
// in practice, since org is guaranteed truthy by the time Compass
// renders — see main.jsx's own gating — but a safe, inert fallback
// either way).
export function orgScopedKey(orgId, key) {
  return `${orgId || "noorg"}:${key}`;
}

// Phase 6.5 hardening (High, security review) — every org-scoped key
// App.jsx caches via orgLs/orgLsSet. Single source of truth for "what
// counts as sensitive ER data cached client-side," used both to wipe
// everything on sign-out and by the "Delete all data" GDPR flow — those
// two previously kept their own separate, drifted lists; deleteAllData's
// own list (App.jsx) was missing compass_wellbeing, compass_employees,
// compass_redundancy, and compass_meeting_draft entirely, so clicking
// "Delete all data" left wellbeing/health notes, employee records,
// redundancy case data, and any live meeting transcript draft sitting in
// localStorage regardless. Sign-out had NO localStorage cleanup at all
// before this — on a shared/kiosk browser, the next person to sign in
// (to the same org or a different one) would have this data sitting
// readable in localStorage the instant the app mounted, before any
// RLS-scoped fetch had a chance to overwrite it with THEIR own
// authorised data (several of these — cases, wellbeing notes, employee
// records — seed their React state straight from this cache on mount).
export const SENSITIVE_ORG_SCOPED_KEYS = [
  "compass_cases", "compass_wellbeing", "compass_employees", "compass_redundancy",
  "compass_meeting_draft", "compass_adjustments", "compass_signature", "compass_letterhead",
  "compass_word_template", "compass_starters", "compass_starter_templates",
  "compass_leavers", "compass_leaver_templates", "compass_policies",
];
// Pre-dates org-scoping entirely — nothing in the codebase writes these
// anymore (confirmed by grep), but a browser that used an older build
// before that rename could still have one sitting in storage.
const LEGACY_UNSCOPED_KEYS = ["compass_whistle", "compass_users", "compass_user", "compass_vault"];

// Clears every org's cached copy of the keys above, not just the
// current org — a browser shared across multiple orgs (an HR
// consultancy running cases for several clients from one login, per
// App.jsx's own orgLs/orgLsSet comment) must not leave a PREVIOUS org's
// data behind just because the next session happens to land on a
// different one. orgId never contains a colon (always a uuid or the
// "noorg" fallback), so splitting each real key on its first colon
// reliably recovers the original key name to check against the
// sensitive set, regardless of which org wrote it.
export function clearAllOrgScopedData() {
  try {
    if (typeof localStorage === 'undefined') return;
    const sensitive = new Set(SENSITIVE_ORG_SCOPED_KEYS);
    Object.keys(localStorage).forEach(k => {
      const idx = k.indexOf(':');
      const suffix = idx === -1 ? k : k.slice(idx + 1);
      if (sensitive.has(suffix)) localStorage.removeItem(k);
    });
    LEGACY_UNSCOPED_KEYS.forEach(k => localStorage.removeItem(k));
  } catch(e) {
    // Unlike ls/lsSet's own best-effort silence, a failure here means a
    // sign-out or "delete all data" action did NOT actually clear
    // sensitive cached data as the caller believes it did — worth a
    // console trace to investigate, not a silent no-op.
    console.error('clearAllOrgScopedData failed:', e);
  }
}
