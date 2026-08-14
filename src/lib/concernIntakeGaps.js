// Manager Enablement (Phase 4, MP4, §4) — deterministic, pre-submit gap
// detection on a concern intake form. Same pure-function, flat-array-of-
// strings shape as guardrails.js's own checks — no AI call, since this
// only needs to notice a few obvious keyword patterns, and a manager
// filling in a simple form shouldn't be waiting on a network round trip
// before they can even see a hint. Purely advisory (never blocks
// submission) — the point is reducing how often HR has to go back to the
// manager for something they'd have mentioned unprompted if the form had
// just asked, not gatekeeping the referral itself.
const EVIDENCE_KEYWORDS = /\bcctv\b|\bcamera\b|\bemail\b|\be-mail\b|\bmessage\b|\bwhatsapp\b|\btext(s)?\b|\brecording\b|\bscreenshot\b|\bfootage\b|\bvoicemail\b/i;
const WITNESS_KEYWORDS = /\bwitness(ed)?\b|\bcolleague(s)?\b|\bsaw\b|\bpresent\b|\boverheard\b|\bheard\b/i;
const MIN_DESCRIPTION_LENGTH = 40;

export function computeConcernIntakeGaps(form) {
  const description = (form?.description || "").trim();
  const gaps = [];
  if (!description) return gaps;

  if (EVIDENCE_KEYWORDS.test(description) && !(form?.evidenceDescription || "").trim() && !(form?.evidenceFiles || []).length) {
    gaps.push("You mentioned evidence in what happened — what kind is it, and where can HR find it?");
  }
  if (WITNESS_KEYWORDS.test(description) && !(form?.witnesses || "").trim()) {
    gaps.push("You mentioned someone else may have seen or heard this — who, so HR knows who else to ask?");
  }
  if (description.length < MIN_DESCRIPTION_LENGTH) {
    gaps.push("A little more detail would help HR review this — when did it happen, and what exactly was said or done?");
  }

  return gaps;
}
