// ─────────────────────────────────────────────────────────────────────────
// Is a tribunal exposure estimate relevant to THIS case at all?
//
// Wave B.2 — moved verbatim out of OverviewTab so the Case View's section list
// and the estimator itself share ONE definition of relevance. Not one character
// of the predicate changed: a case that showed the estimator before shows it
// now, and a case that did not, does not. What changed is where the panel it
// gates then renders — a collapsed specialist section at the very bottom of Case
// details, rather than inside a general "Checks and analysis" accordion.
// ─────────────────────────────────────────────────────────────────────────

// UAT Product Hierarchy pass, Part 2 — a capability existing in Compass
// is not sufficient reason to display it. An ordinary misconduct/
// attendance investigation showed weekly pay, age, fit note, probation,
// OH referral and suspension fields regardless of whether any of them
// had anything to do with the case in front of HR. Every predicate below
// is grounded in real, already-recorded data or an existing, deliberately
// curated signal that already lives elsewhere in the codebase — never an
// inference from "this is an employee case" alone.
//
// Re-audit (human review round 2) — re-examined against the actual
// tribunalEstimate.js data model and its own test suite, every place
// that reads/writes estimatedWeeklyPay/estimatedAgeAtDismissal, every
// supported process type and their real stage registries (processStages.js/
// caseStage.js — not stages invented for this rule), and the existing
// case-risk module. Three things the first pass got wrong, corrected here:
//
// 1. Redundancy was excluded entirely because it never reaches a
//    "disciplinary" stage — but redundancy has no disciplinary hearing
//    at all, by design, so gating on one excluded it always. Its own
//    basic-award-shaped statutory redundancy calculation overlaps
//    directly with this estimator's formula, and consultation itself
//    (not a later hearing) is the process that can end in dismissal —
//    relevant from the first day of the case, no stage gate.
//
// 2. Appeal was excluded outright — backwards. An appeal exists because
//    a decision (often a dismissal) has already been made and is being
//    challenged: the exposure is already crystallised, not speculative,
//    so it is if anything MORE clearly relevant than mid-investigation,
//    not less. No stage gate, same as redundancy.
//
// 3. Grievance was excluded entirely, which misses discrimination and
//    whistleblowing grievances specifically — tribunalEstimate.js's own
//    UNCAPPED_CASE_TYPES list (and its test suite) singles these two out
//    because they carry real, uncapped tribunal exposure independent of
//    any dismissal ACAS process, and that exposure doesn't wait for a
//    hearing either. getProcessType() normalises both case-type ids
//    ("discrimination"/"whistleblowing", selectable at intake) to
//    processTypeId "grievance", so the raw cs.caseType is checked
//    directly here, the same way tribunalEstimate.js itself already
//    does. An ordinary/other grievance still has no such standalone
//    exposure and stays excluded by default.
//
// For misconduct/capability/attendance/probation/long_term_sickness —
// gating on "a disciplinary hearing is live" was too late (exactly what
// the second review flagged), but showing it from the literal moment a
// case is created, before any fact-finding has happened at all, is the
// same prematurity the original UAT complaint was about. The one gate
// that's neither: exclude only each process type's own real "nothing
// investigated yet" starting stage (processStages.js's own stage
// registries — "intake" for the disciplinary-shaped types, and
// probation/long-term-sickness's own equivalent first stage) — once a
// case has moved past that, exposure is a live, live question for the
// rest of its life, not something that waits for a hearing to be booked.
const DISMISSAL_TRACK_TYPES_NO_STAGE_GATE = new Set(["redundancy", "appeal"]);
const DISMISSAL_TRACK_STARTING_STAGE = { misconduct:"intake", capability:"intake", attendance:"intake", probation:"probation_started", long_term_sickness:"absence_identified" };
function hasStandaloneTribunalExposure(cs, processTypeId) {
  if (processTypeId !== "grievance") return false;
  const rawType = (cs.caseType || "").toLowerCase();
  return rawType.includes("discrimination") || rawType.includes("whistleblow");
}

export function isRiskExposureRelevant(cs, caseCtx, processTypeId) {
  // Never hide a figure someone has already entered, and never hide it
  // once risk has genuinely been assessed above LOW — regardless of type.
  if (cs.estimatedWeeklyPay || cs.estimatedAgeAtDismissal) return true;
  if (caseCtx.currentRisk && caseCtx.currentRisk !== "LOW") return true;
  if (DISMISSAL_TRACK_TYPES_NO_STAGE_GATE.has(processTypeId)) return true;
  if (processTypeId in DISMISSAL_TRACK_STARTING_STAGE) {
    return caseCtx.stage !== DISMISSAL_TRACK_STARTING_STAGE[processTypeId];
  }
  return hasStandaloneTribunalExposure(cs, processTypeId);
}
