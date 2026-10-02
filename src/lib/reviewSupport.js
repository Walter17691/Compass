// ─────────────────────────────────────────────────────────────────────────
// WAVE C4 — one support model for Review.
//
// Review carried TEN surfaces at once, and an AI prompt box sat ABOVE the
// record: the Ask/edit bar, the record card, a gaps card, an internal-analysis
// card, a signature strip, a meeting-summary card, a second "Compass HR
// Advisor" card, an Ask Compass transcript, a risk rating in the sticky rail,
// and a proposed-updates panel. Reviewing a meeting record meant operating an
// evidence console around it.
//
// Nothing here deletes any of them. It groups the ADVISORY ones by the job each
// does, so one is visible at a time and the record is the screen:
//
//   Summary   the short triage read — what matters, in seconds
//   Advice    Compass's internal commentary, what is worth checking before an
//             outcome, and the risk rating. Never part of the employee record.
//   Ask       asking Compass something about this record
//
// ┌─ WHAT IS DELIBERATELY *NOT* IN A TAB ───────────────────────────────────┐
// │ Proposed updates. Everything above is advisory — reading it changes      │
// │ nothing. Approving a proposed update CREATES evidence, a witness or a    │
// │ task on the real case. A pending human decision must not be filed behind │
// │ a tab the user may never open, so it stays its own surface and appears   │
// │ only when something is actually pending.                                 │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─ WHAT THIS MODULE IS NOT ───────────────────────────────────────────────┐
// │ No AI call, no persistence, no lifecycle, no decision, and nothing that  │
// │ touches the employee-facing/internal boundary — that is                  │
// │ meetingRecordSections.js's job and it stays the single matcher. This     │
// │ counts and groups what the screen was already given.                     │
// │                                                                          │
// │ No score, no completion percentage, no readiness rating. The risk rating │
// │ reported here is the EXISTING one; nothing new is computed.              │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

export const REVIEW_SUPPORT = Object.freeze({
  SUMMARY: "summary",
  ADVICE: "advice",
  ASK: "ask",
});

export const REVIEW_SUPPORT_LABEL = Object.freeze({
  [REVIEW_SUPPORT.SUMMARY]: "Summary",
  [REVIEW_SUPPORT.ADVICE]: "Advice",
  [REVIEW_SUPPORT.ASK]: "Ask",
});

// What each category actually has in it. A count is a quiet indicator of
// availability — not a target, not something "due", and never a score.
export function reviewSupportCounts({
  meetingSummary = "",
  advisorNotes = "",
  reviewGaps = [],
  riskScore = null,
  askCompassHistory = [],
} = {}) {
  const advice =
    (advisorNotes && advisorNotes.trim() ? 1 : 0) +
    (Array.isArray(reviewGaps) ? reviewGaps.length : 0) +
    (riskScore ? 1 : 0);
  return {
    [REVIEW_SUPPORT.SUMMARY]: meetingSummary && meetingSummary.trim() ? 1 : 0,
    [REVIEW_SUPPORT.ADVICE]: advice,
    // Ask is always available and never "waiting" — the count reflects the
    // conversation that exists, not work outstanding.
    [REVIEW_SUPPORT.ASK]: Array.isArray(askCompassHistory)
      ? askCompassHistory.filter(m => m && m.role === "user").length
      : 0,
  };
}

// Which category is showing when the rail opens. Summary first when there is
// one, because that is the thing a reviewer reads to orient; then Advice if
// Compass actually has something; otherwise Ask. Never chosen to maximise what
// is on screen, and never chosen to put a risk rating in front of someone who
// has not asked for it.
export function defaultReviewSupport(counts = {}) {
  if ((counts[REVIEW_SUPPORT.SUMMARY] || 0) > 0) return REVIEW_SUPPORT.SUMMARY;
  if ((counts[REVIEW_SUPPORT.ADVICE] || 0) > 0) return REVIEW_SUPPORT.ADVICE;
  return REVIEW_SUPPORT.ASK;
}

// Proposed updates, split by what the user still has to decide. Pure
// reclassification of what App.jsx already computed — the same three buckets
// the previous panel derived inline.
export function proposedUpdates({ evidenceSuggestions = [], actionSuggestions = [] } = {}) {
  const pend = list => (Array.isArray(list) ? list : []).filter(s => s && s.status === "pending");
  const unapplied = list =>
    (Array.isArray(list) ? list : []).filter(s => s && s.status === "accepted" && !s.applied);
  const pendingEvidence = pend(evidenceSuggestions);
  const pendingActions = pend(actionSuggestions);
  const decided = [...unapplied(evidenceSuggestions), ...unapplied(actionSuggestions)];
  return {
    pendingEvidence,
    pendingActions,
    decided,
    // Only a PENDING item is a decision the user owes. `decided` items are
    // informational (accepted when no case existed yet), so they must not make
    // the surface look like it is asking for something.
    awaitingDecision: pendingEvidence.length + pendingActions.length,
    total: pendingEvidence.length + pendingActions.length + decided.length,
  };
}
