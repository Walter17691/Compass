// Manager Enablement (Phase 4, MP14, §10 second half/§11) — Manager
// coaching tips. Distinct from MP13's own pre-meeting brief: this fires
// DURING a live meeting, short and contextual, only when a real trigger
// is present. Deliberately not a new AI stream — two of the three
// triggers are plain keyword detection (same deterministic, no-network
// style as concernIntakeGaps.js), and the third reads a signal
// updateMeetingIntelligence (App.jsx) already computes every live pass
// (possibleInconsistency) rather than re-deriving it. Rule-based on
// purpose: a manager mid-conversation needs an instant reminder, not
// something waiting on a fresh network round trip.
const WELLBEING_KEYWORDS = /\bstress(ed)?\b|\banxiet(y|ies)\b|\bdepress(ed|ion)\b|\bmental health\b|\bsigned off\b|\boccupational health\b|\bGP\b|\bdoctor'?s note\b|\bcounsell?ing\b|\bburn ?out\b|\bunwell\b|\bwellbeing\b/i;

// Deliberately narrow to phrasing that pre-empts a finding or sanction
// before the process has actually concluded — not every mention of the
// word "decision" (e.g. "we'll decide once we've heard from you" is
// exactly the right thing to say, and shouldn't trip this).
const OUTCOME_LANGUAGE_KEYWORDS = /\bwe'?ve (already )?decided\b|\byou'?re going to be (dismissed|sacked|let go)\b|\bthis will (end|result) in (your )?dismissal\b|\bwe'?ve concluded that you\b|\bour final decision is\b|\byou'?re getting a written warning\b/i;

export function computeCoachingTips(notes, meetingIntelligence) {
  const tips = [];
  const text = (notes || "");

  if (meetingIntelligence?.possibleInconsistency) {
    tips.push({ key: "inconsistency", text: "A possible inconsistency has come up — ask open questions before challenging with contradictory evidence, and let them explain the discrepancy in their own words first." });
  }
  if (WELLBEING_KEYWORDS.test(text)) {
    tips.push({ key: "wellbeing", text: "Health or wellbeing has been mentioned — consider whether an occupational health referral or wellbeing support would help, and note it for the record." });
  }
  if (OUTCOME_LANGUAGE_KEYWORDS.test(text)) {
    tips.push({ key: "outcome_language", text: "Avoid language that suggests the outcome is already decided — the process needs to stay genuinely open until it concludes, both for fairness and for what a tribunal would expect to see." });
  }

  return tips;
}
