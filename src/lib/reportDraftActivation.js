// ─────────────────────────────────────────────────────────────────────────
// B3.2-1 — WHO MAY SAVE AN INVESTIGATION REPORT DRAFT.
//
// The editor ships in the production bundle. The ABILITY TO WRITE does not.
// This module is the only thing that decides whether the save action is
// reachable, and it is deliberately the dullest file in the slice.
//
// THREE PROPERTIES, EACH CHOSEN AGAINST A SPECIFIC WAY THIS GOES WRONG:
//
//   1. AN EXPLICIT LIST OF ORGANISATION IDS, NOT A BOOLEAN. A global flag has
//      one setting that enables every tenant at once, and the whole point of
//      a staged activation is that there is no such setting. There is no
//      `enabled: true` to find and flip here, so enabling one organisation
//      cannot enable another by accident.
//
//   2. NO ENVIRONMENT VARIABLE. import.meta.env is read at build time by a
//      bundler that inlines whatever it finds, which means activation would
//      be decided by Vercel project configuration rather than by a reviewed
//      commit, and a mistyped variable name would read as undefined and be
//      indistinguishable from "off" until someone needed it to be on. The
//      list is source, so turning it on is a diff.
//
//   3. THE EMPTY LIST IS THE SHIPPED STATE, AND A TEST SAYS SO. An allow-list
//      that is empty by convention drifts; one that is empty by assertion
//      cannot be populated without a reviewer seeing the test change too.
//
// THIS IS NOT A SECURITY BOUNDARY AND MUST NEVER BE TREATED AS ONE. Authority
// lives in the database: save_investigation_report_version checks the
// authenticated actor, the investigator grant, the HR exception and its
// written reason, and the table's restrictive INSERT policy means there is no
// second route. A client that bypassed this list entirely would still be
// refused 42501 by Postgres. The list exists to stage a ROLLOUT, not to
// defend data — which is exactly why it is safe for it to live in the client.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Organisations permitted to save investigation report drafts.
 *
 * EMPTY IN PRODUCTION, DELIBERATELY. B3.2-1 ships the editor read-only for
 * every tenant. The E2E organisation is NOT listed: activating it here would
 * activate it in the production build, since this file has no notion of
 * environment, and "it is only the test org" is how a staged rollout stops
 * being staged.
 *
 * Adding an id is a reviewed, approved change to this line and nothing else.
 */
export const REPORT_DRAFT_SAVE_ORG_ALLOW_LIST = Object.freeze([]);

/** Why saving is unavailable. Named so the UI can say something true. */
export const DRAFT_SAVE_UNAVAILABLE = Object.freeze({
  NO_ORG: 'no_org',
  ORG_NOT_ENABLED: 'org_not_enabled',
});

/**
 * May this organisation save report drafts?
 *
 * Total and defensive: a missing, blank or non-string org id is NOT enabled,
 * because the one thing this function must never do is answer "yes" when it
 * does not know who is asking. Trimmed and compared exactly — no prefix
 * matching, no wildcards, nothing that could widen by accident.
 */
export function isReportDraftSaveEnabled(orgId) {
  if (typeof orgId !== 'string') return false;
  const id = orgId.trim();
  if (id === '') return false;
  return REPORT_DRAFT_SAVE_ORG_ALLOW_LIST.includes(id);
}

/**
 * The reason saving is unavailable for this organisation, or null if it is
 * available. Separate from the predicate so the UI never has to infer a
 * reason from a false.
 */
export function draftSaveUnavailableReason(orgId) {
  if (typeof orgId !== 'string' || orgId.trim() === '') return DRAFT_SAVE_UNAVAILABLE.NO_ORG;
  if (!isReportDraftSaveEnabled(orgId)) return DRAFT_SAVE_UNAVAILABLE.ORG_NOT_ENABLED;
  return null;
}
