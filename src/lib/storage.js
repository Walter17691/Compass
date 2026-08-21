export function ls(key, fallback) {
  try { const v = typeof localStorage !== 'undefined' && localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(e) { return fallback; }
}
export function lsSet(key, val) { try { if(typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} }

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
