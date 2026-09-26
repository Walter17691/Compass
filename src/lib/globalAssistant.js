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
// Phase E0.7 — AMBIGUITY NOW FAILS CLOSED.
//
// Both tiers used `.find()`, which returns the FIRST match and discards the fact
// that there were others. So "Sarah" resolved to whichever Sarah came first in
// the array, and — worse — an EXACT match did the same whenever two colleagues
// share a display name. This resolver's result reaches createCaseTask via the
// command bar, so "the first one" was writing a task onto a case picked at
// random from the matches.
//
// The input here is a name a human (or an LLM reading an email) supplied, so
// matching on a name is legitimate: this is a search, not an identity claim. What
// is not legitimate is resolving a tie silently. More than one match now returns
// `confidence: "ambiguous"` with NO case, and callers must ask.
export function matchCaseByEmployeeNameWithConfidence(cases, employeeName) {
  const needle = (employeeName || "").trim().toLowerCase();
  if (!needle) return { case: null, confidence: "none" };
  const list = cases || [];

  const exact = list.filter(c => c.employeeName?.trim().toLowerCase() === needle);
  if (exact.length === 1) return { case: exact[0], confidence: "high" };
  if (exact.length > 1) return { case: null, confidence: "ambiguous", matches: exact };

  const partial = list.filter(c => c.employeeName?.toLowerCase().includes(needle));
  if (partial.length === 1) return { case: partial[0], confidence: "medium" };
  if (partial.length > 1) return { case: null, confidence: "ambiguous", matches: partial };

  return { case: null, confidence: "none" };
}

export function matchCaseByEmployeeName(cases, employeeName) {
  return matchCaseByEmployeeNameWithConfidence(cases, employeeName).case;
}
