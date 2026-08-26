// Phase 6.5 hardening (Prompt 14, Section 8 — Family 4 wider sweep).
// caseStage.js, nextStep.js, processTimeline.js, and guardrails.js each
// independently re-derived "is this meeting a disciplinary hearing (not
// its own appeal)?" via a raw `.type.toLowerCase().includes("disciplinary")`
// substring check — deadlines.js already hit the real consequence of this
// duplication (a "Disciplinary Appeal" meeting silently satisfying a plain
// "disciplinary" check, fabricating a statutory deadline before a hearing
// had even happened — the original Family 4 CRITICAL finding) and fixed
// it locally with isDisciplinaryMeeting/isInvestigationMeeting. Those
// never got reused elsewhere, so the same collision risk stayed live in
// every other file doing the same substring check. One shared, tested set
// of predicates closes the whole class at once instead of one file at a
// time whenever the next instance is noticed.
export function isInvestigationMeeting(type) {
  return (type || "").toLowerCase().includes("investigation");
}

export function isDisciplinaryMeeting(type) {
  const t = (type || "").toLowerCase();
  return t.includes("disciplinary") && !t.includes("appeal");
}

export function isGrievanceMeeting(type) {
  const t = (type || "").toLowerCase();
  return t.includes("grievance") && !t.includes("appeal");
}

export function isAppealMeeting(type) {
  return (type || "").toLowerCase().includes("appeal");
}

// A "decision" meeting for natural-justice purposes (who made the
// original call an appeal might overturn) is a real disciplinary or
// grievance hearing, never the appeal hearing itself.
export function isOriginalDecisionMeeting(type) {
  return isDisciplinaryMeeting(type) || isGrievanceMeeting(type);
}
