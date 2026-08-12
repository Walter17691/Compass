// Phase 22 of the reasoning-layer build-out — Global Compass AI. Pure
// helpers only; the actual intent-classification and answer-generation AI
// calls live in App.jsx (sendGlobalChat) alongside every other AI call in
// this build-out, and the org-wide aggregate query is a Supabase RPC
// (supabase/global_ai_stats_2026-08-12.sql), not client-side counting.
//
// matchCaseByEmployeeName operates over whatever `cases` array the caller
// already has loaded — for App.jsx that's always the RLS-scoped result of
// loadCasesFromDB(), so a case this org's confidentiality rules already
// hid from the current user was never in that array to begin with. This
// function adds no new visibility of its own; it can only ever narrow
// down within data the caller could already see.
export function matchCaseByEmployeeName(cases, employeeName) {
  if (!employeeName) return null;
  const needle = employeeName.trim().toLowerCase();
  if (!needle) return null;
  const list = cases || [];
  return list.find(c => c.employeeName?.trim().toLowerCase() === needle)
    || list.find(c => c.employeeName?.toLowerCase().includes(needle))
    || null;
}
