// Organisational ER Intelligence (Phase 6, OP13, §10) — policy
// effectiveness.
//
// IMPORTANT DATA-MODEL FINDING made while building this, not assumed
// from the plan: uploaded company policies (the `policies` state in
// App.jsx) are stored in the BROWSER ONLY (see App.jsx's own Data &
// Privacy copy: "Uploaded policies... stay in this browser only") —
// there is no shared, org-wide policies table, and a policy's `id` is
// generated client-side per browser. That means re-resolving a
// case_signal's policy sourceRef by ID against whichever user's browser
// happens to be viewing this dashboard would silently return the wrong
// policy (or nothing) for every other org member. This module never
// does that: it aggregates by the sourceRef's own `label` (the policy
// NAME captured at the moment guardrails.js/App.jsx cited it), which
// IS persisted org-wide on the real, RLS-scoped case_signals table
// (case_signals_2026-08-10.sql's own `source_refs jsonb` column) —
// genuinely shared data, not a re-resolution against a local list.
//
// "HR requested clarification" is NOT invented as a new flag — it
// reuses the real, already-persisted hrReviewRequests.status ===
// "clarification_requested" value (App.jsx's respondToReview, fired
// from resolveInvestigationReview's real HR-review UI). It is shown as
// a separate, explicitly org-wide total, deliberately NOT attributed to
// any specific policy — the data has no real link between a
// clarification request and which policy prompted it, and inventing
// that link would be exactly the kind of fabricated precision this
// phase avoids elsewhere (OP8/OP9/OP12's own no-hardcoded-mapping
// discipline).
export const POLICY_MIN_SAMPLE_SIZE = 3;

export function computePolicyReferenceCounts(caseSignals) {
  const caseIdsByPolicyName = {};
  (caseSignals || []).forEach(s => {
    const policyRefs = (s.sourceRefs || []).filter(r => r.kind === "policy" && r.label);
    policyRefs.forEach(r => {
      if (!caseIdsByPolicyName[r.label]) caseIdsByPolicyName[r.label] = new Set();
      caseIdsByPolicyName[r.label].add(s.caseId);
    });
  });
  return Object.entries(caseIdsByPolicyName)
    .map(([policyName, caseIds]) => ({ policyName, caseCount: caseIds.size }))
    .sort((a, b) => b.caseCount - a.caseCount);
}

export function countClarificationRequests(hrReviewRequests) {
  return (hrReviewRequests || []).filter(r => r.status === "clarification_requested").length;
}
