// ─────────────────────────────────────────────────────────────────────────
// WHO MAY EXPORT WHOLE-ORGANISATION DATA.
//
// Settings → "Export all data" emitted 25 collections — every case with its
// meetings, transcripts and HR advisor notes, raw allegations through all nine
// free-text fields, wellbeing notes, concern referrals, employee records, the
// audit trail, every DSAR row — from a button with NO permission check at all.
//
// ┌─ HOW THAT HAPPENED, AND WHY IT WAS EASY TO MISS ────────────────────────┐
// │ src/screens/settings/DataPrivacySection.jsx closes three `{isHR && (`   │
// │ wrappers at lines 19, 35 and 47, then opens a bare <Card> at line 50.   │
// │ "Export all data" sits inside that fourth card. The two export buttons  │
// │ immediately above it — Export CSV and Export PDF — ARE HR-gated, so the │
// │ section reads as gated at a glance while the broadest export in the     │
// │ product is not.                                                         │
// │                                                                         │
// │ "Delete all data" sits in the same ungated card and is SAFE, because it │
// │ is enforced server-side: api/delete-org-data.js:89 refuses anyone who   │
// │ is not hr_director. That asymmetry is the whole finding — the           │
// │ destructive twin was enforced at the boundary and the disclosing twin   │
// │ was not enforced anywhere.                                              │
// └─────────────────────────────────────────────────────────────────────────┘
//
// THE ROLE. hr_director, matching api/delete-org-data.js — the org-wide export
// is the exact counterpart of the org-wide delete, over the same data, and
// there is no reading on which exporting every record is less sensitive than
// erasing them. It is deliberately NARROWER than the isHR gate on Export
// CSV/PDF, because those emit truncated extracts (200/300 characters of each
// meeting record) while this emits everything raw and unredacted.
//
// Stated as one constant so changing the decision is one edit, not a hunt.
//
// ┌─ WHERE THIS IS, AND IS NOT, A BOUNDARY ─────────────────────────────────┐
// │ Honest about its own limits, because overstating them is how the next   │
// │ gap gets missed:                                                        │
// │                                                                         │
// │ 1. The blob is assembled in the browser from React state. There is no   │
// │    server route that builds this export, so no server can refuse it.    │
// │    This predicate is the operative check on WHO MAY ASSEMBLE AND EMIT   │
// │    the aggregate, and it is enforced inside exportAllData itself — not  │
// │    only in the JSX — so hiding or un-hiding a button changes nothing.   │
// │                                                                         │
// │ 2. RLS already bounds WHAT any member holds in state. Measured on       │
// │    production 2026-10-08: 0 non-HR members have case_access_level = 1,  │
// │    so a non-HR member's client state today contains only their own      │
// │    assigned cases, not the organisation's. RLS is the real data         │
// │    boundary and it was never breached; what was missing was any rule    │
// │    about aggregating and exfiltrating the lot.                          │
// │                                                                         │
// │ 3. The one server call inside the export — /api/portal/dsar-lookup —    │
// │    is already gated (requireOrgRole(..., isHrRole), _dsar-lookup.js:48) │
// │    and returns 403 to a non-HR caller. It is deliberately NOT narrowed  │
// │    to hr_director here: the legitimate DSAR compile shares that         │
// │    endpoint and must stay available to any HR user.                     │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

/** The single role permitted to export whole-organisation data. */
export const ORG_EXPORT_ROLE = 'hr_director';

/**
 * May this member export every record in the organisation?
 *
 * Pure and total: anything that is not exactly the authorised role is refused,
 * including undefined, null, '' and any future role added to ROLES.
 */
export function mayExportOrganisationData({ role = null } = {}) {
  return role === ORG_EXPORT_ROLE;
}

/**
 * The refusal a blocked user should see. Names the role, so the message tells
 * them who to ask rather than only that they failed.
 */
export const ORG_EXPORT_REFUSAL =
  'Only an HR Director can export all organisation data.';
