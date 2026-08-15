// Phase 22 of the reasoning-layer build-out — Global Compass AI. Pure
// helpers only; the actual intent-classification and answer-generation AI
// calls live in App.jsx (sendGlobalChat) alongside every other AI call in
// this build-out, and the org-wide aggregate query is a Supabase RPC
// (supabase/global_ai_stats_2026-08-12.sql), not client-side counting.
//
// matchCaseByEmployeeNameWithConfidence operates over whatever `cases`
// array the caller already has loaded — for App.jsx that's always the
// RLS-scoped result of loadCasesFromDB(), so a case this org's
// confidentiality rules already hid from the current user was never in
// that array to begin with. This function adds no new visibility of its
// own; it can only ever narrow down within data the caller could already
// see.
//
// Integrations & Workflow Automation (Phase 5, IP9) — the confidence tier
// is which of the two match attempts actually hit, not a separate AI
// judgement call: an exact (case-insensitive, whitespace-trimmed) name
// match is "high" confidence, a substring match (e.g. "Sarah" matching
// "Sarah Jones") is "medium" — genuinely weaker evidence, since it can
// also match the wrong Sarah — and no match at all is "none". Callers
// that only want the case, not the confidence (matchCaseByEmployeeName,
// kept as the stable existing contract every pre-IP9 call site already
// uses) just unwrap `.case`.
export function matchCaseByEmployeeNameWithConfidence(cases, employeeName) {
  const needle = (employeeName || "").trim().toLowerCase();
  if (!needle) return { case: null, confidence: "none" };
  const list = cases || [];
  const exact = list.find(c => c.employeeName?.trim().toLowerCase() === needle);
  if (exact) return { case: exact, confidence: "high" };
  const partial = list.find(c => c.employeeName?.toLowerCase().includes(needle));
  if (partial) return { case: partial, confidence: "medium" };
  return { case: null, confidence: "none" };
}

export function matchCaseByEmployeeName(cases, employeeName) {
  return matchCaseByEmployeeNameWithConfidence(cases, employeeName).case;
}
