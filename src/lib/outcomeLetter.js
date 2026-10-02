// ─────────────────────────────────────────────────────────────────────────
// WAVE D3 — an outcome letter must not outlive the decision it states.
//
// The decision and its communication are two objects: `cases.outcome` /
// `outcomeIssuedAt` is the authoritative employment decision, and a letter
// saved onto a meeting (letterType "outcome") is how it was communicated.
// Nothing connected them, so changing the decision left a letter on the case
// still reading as the current communication of an outcome that no longer
// existed.
//
// ┌─ DERIVED, NOT STORED ───────────────────────────────────────────────────┐
// │ No new field, no migration. Both timestamps already exist:              │
// │ `outcomeIssuedAt` is restamped every time an outcome is recorded, and   │
// │ the letter's meeting carries `savedAt`. A letter written BEFORE the     │
// │ decision it purports to state was recorded is, by definition, stating a │
// │ different decision.                                                      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─ AN ISSUED LETTER IS HISTORY ───────────────────────────────────────────┐
// │ Issuance provenance is the existing DSAR vocabulary and is NOT          │
// │ reinvented here: letterApprovedAt, signStatus, or tracked send. Where a │
// │ letter has been issued, a later decision change does NOT make it        │
// │ "stale" to be regenerated — it makes it a correct record of what was    │
// │ actually sent, now superseded. It is never rewritten, never hidden, and │
// │ never silently treated as current. The user is told a further           │
// │ communication is needed; Compass does not send one.                      │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

export const OUTCOME_LETTER = Object.freeze({
  NONE: "none",                      // no outcome letter drafted yet
  CURRENT: "current",                // written for the decision now recorded
  STALE_DRAFT: "stale_draft",        // draft predating the recorded decision
  ISSUED_SUPERSEDED: "issued_superseded", // already communicated, decision has since changed
});

const t = v => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d.getTime() : null;
};

// Mirrors dsarCaseDisclosure.js's letterState vocabulary deliberately: one
// definition of "issued" for the whole product, so a letter cannot be history
// for DSAR and a regenerable draft here.
export function isIssuedLetter(meeting) {
  if (!meeting) return false;
  const txt = v => typeof v === "string" && v.trim() !== "";
  return txt(meeting.letterApprovedAt)
    || txt(meeting.signStatus)
    || !!(meeting.letterTracking && Object.keys(meeting.letterTracking).length > 0);
}

// The outcome letter on a case, newest first. Letter identity is letterType,
// never the meeting's prose — the same field caseStage.js and nextStep.js use.
export function findOutcomeLetter(caseObj) {
  const meetings = Array.isArray(caseObj?.meetings) ? caseObj.meetings : [];
  return meetings
    .filter(m => m && m.letterType === "outcome")
    .sort((a, b) => (t(b.savedAt) || 0) - (t(a.savedAt) || 0))[0] || null;
}

export function outcomeLetterStatus(caseObj) {
  const letter = findOutcomeLetter(caseObj);
  if (!letter) return { state: OUTCOME_LETTER.NONE, letter: null, outcome: caseObj?.outcome || null };

  const decidedAt = t(caseObj?.outcomeIssuedAt);
  const writtenAt = t(letter.savedAt);
  const issued = isIssuedLetter(letter);

  // Unknown timestamps are never read as staleness. Asserting that a letter is
  // out of date is itself a claim, and a false one would push someone to
  // regenerate a perfectly good communication.
  const predatesDecision = decidedAt !== null && writtenAt !== null && writtenAt < decidedAt;

  if (!predatesDecision) {
    return { state: OUTCOME_LETTER.CURRENT, letter, issued, outcome: caseObj?.outcome || null };
  }
  return {
    state: issued ? OUTCOME_LETTER.ISSUED_SUPERSEDED : OUTCOME_LETTER.STALE_DRAFT,
    letter,
    issued,
    outcome: caseObj?.outcome || null,
  };
}

// What the user is told. Deliberately plain: one sentence of fact, one of
// consequence. No action is taken on their behalf in either case.
export function outcomeLetterNotice(status) {
  if (status?.state === OUTCOME_LETTER.STALE_DRAFT) {
    return "This draft was written before the outcome now recorded on this case. Regenerate it so it states the current outcome.";
  }
  if (status?.state === OUTCOME_LETTER.ISSUED_SUPERSEDED) {
    return "This letter was already issued, and the outcome recorded on this case has changed since. The issued letter is kept as the record of what was sent — a further communication may be needed.";
  }
  return null;
}
