// Phase 13 of the reasoning-layer build-out — "What Changed Since Last
// View." Pure diff helpers only; the AI one-line impact summary (only
// generated when the diff is non-trivial, per the plan's explicit
// "avoid an AI call on every open") lives in App.jsx alongside every
// other AI call in this build-out. App.jsx owns persistence
// (supabase/case_views_2026-08-12.sql) and which case/user is active.

// The audit log (App.jsx's audit()) already captures the vast majority of
// user-driven changes on a case — tasks, status changes, meetings,
// letters, evidence, appeal outcomes — so it's the primary source here,
// same as buildCaseTimeline() already relies on it for the case
// chronology. AI-noticed things (Next Best Action, Guardrails,
// Contradiction Detection, Appeal Review) don't get an audit entry of
// their own, so open case_signals created since the last view are folded
// in as a second source rather than duplicating that write path.
export function computeChangesSinceView(lastViewedAt, { auditLog, caseSignals } = {}, caseId) {
  if (!lastViewedAt) return [];
  const since = new Date(lastViewedAt);
  if (isNaN(since)) return [];

  const auditChanges = (auditLog || [])
    .filter(e => e.caseId === caseId && e.ts && new Date(e.ts) > since)
    .map(e => ({ type: "audit", label: e.action + (e.detail ? ": " + e.detail : ""), ts: e.ts, user: e.user || null }));

  const signalChanges = (caseSignals || [])
    .filter(s => s.caseId === caseId && s.status === "open" && s.createdAt && new Date(s.createdAt) > since)
    .map(s => ({ type: "signal", label: "Compass noticed: " + s.title, ts: s.createdAt, user: null }));

  return [...auditChanges, ...signalChanges].sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

export function isNonTrivialChange(changes) {
  return (changes || []).length > 0;
}
