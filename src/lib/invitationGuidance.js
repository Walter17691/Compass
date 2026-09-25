// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — invitation guidance, Phase 4A.
//
// WHAT WAS WRONG. HomeMeetingScreen hard-coded, under a heading reading
// "Formal invitation required":
//
//   "The employee MUST receive a written invitation at least 48 HOURS before the
//    hearing, including the allegations, evidence, and right to be accompanied
//    (ERA 1999 s.10)."
//
// ERA 1999 s.10 is the right to be ACCOMPANIED. It does not impose a written
// notice period, so the citation did not support the proposition attached to it.
// The ACAS Code asks for notification in writing with enough information and
// REASONABLE time to prepare — it sets no universal figure. The 48 hours came
// from nowhere: no statute, no Code, no configured policy, no retrieval. It was a
// string.
//
// Compass already held the right doctrine in two other places and contradicted
// itself here:
//   * lib/meetingScheduling.js reads a notice period from the ORGANISATION'S OWN
//     policy via NOTICE_PATTERN, and "A clause that doesn't match this pattern is
//     silently skipped — never a guessed number."
//   * App.jsx's invite-letter prompt instructs the model to "use a placeholder
//     such as [X working days] rather than a specific number — ACAS does not
//     mandate a fixed notice period for this letter type, so any specific
//     day-count you're not given below would be invented, not real guidance."
//
// THE RULE THIS MODULE ENFORCES. Compass states a notice period only when it can
// attribute it to a source. Absent a configured policy, it gives neutral process
// guidance and says "reasonable notice" — which is what the guidance actually
// says — rather than inventing a number to sound precise.
//
// And it does not replace one invented absolute with another: no hours, no days,
// no "must" for anything Compass cannot establish, and no citation attached to a
// proposition the citation does not support.
// ─────────────────────────────────────────────────────────────────────────

// Neutral, source-free process guidance per meeting type.
//
// Every entry is phrased as what good practice looks like, not as a legal
// requirement, because Compass cannot establish a requirement from nothing. The
// right to be accompanied IS retained where it applies — that part was always
// correct, and ERA 1999 s.10 is cited only for that, which is what it governs.
const GUIDANCE = {
  disciplinary:
    "Give the employee reasonable notice of the hearing and enough information to prepare — the matters to be considered, the evidence you intend to rely on, and their right to be accompanied (ERA 1999 s.10).",
  grievance:
    "Confirm the date, time and location in writing, and set out the employee's right to be accompanied (ERA 1999 s.10).",
  "redundancy-atrisk":
    "Confirm in writing that the employee is at risk, and give them a genuine opportunity to discuss the position and any alternatives.",
  "appeal-disciplinary":
    "Confirm the grounds of appeal being considered and the employee's right to be accompanied (ERA 1999 s.10).",
  "pip-review":
    "Send the agenda and any supporting documents far enough in advance for the employee to prepare.",
};

// A notice period Compass is willing to state, or null.
//
// `policyNotice` is a clause already extracted from the organisation's OWN
// configured policy — the mechanism lib/meetingScheduling.js's NOTICE_PATTERN
// provides. When one exists it is surfaced WITH ATTRIBUTION, so the user can see
// it is their policy speaking and not Compass inventing a rule. When it does not,
// this returns null and no period is stated at all.
//
// Nothing here ever synthesises a figure.
export function noticeRequirement(policyNotice) {
  const text = typeof policyNotice === "string" ? policyNotice.trim() : "";
  if (!text) return null;
  return `Your organisation's policy states: ${text}`;
}

// The guidance block for a meeting type. Returns null when there is nothing
// useful and non-invented to say.
export function invitationGuidance(meetingTypeId, { policyNotice = null } = {}) {
  const body = GUIDANCE[meetingTypeId];
  if (!body) return null;
  return {
    // "Formal invitation", not "Formal invitation required" — Compass is not in a
    // position to assert a universal requirement, and the old heading did.
    heading: "Formal invitation",
    body,
    // Shown beneath the guidance only when the organisation has actually
    // configured a notice period.
    policyNotice: noticeRequirement(policyNotice),
  };
}
