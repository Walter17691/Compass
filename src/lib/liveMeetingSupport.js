// ─────────────────────────────────────────────────────────────────────────
// WAVE C3 — one support model for the live meeting.
//
// The rail carried NINE independent always-visible surfaces during an employee
// conversation: a rolling AI summary, coaching reminders, a clarification nudge,
// a suggested follow-up, prep questions, evidence suggestions, action
// suggestions, AI issue lists, and a chat that took every remaining pixel.
//
// Nothing here deletes any of them. It groups them by the JOB each one does, so
// one category is visible at a time and the rest announce themselves quietly:
//
//   Questions   what I might ask next, and what I marked as essential
//   Guidance    what Compass has noticed — advisory, and dismissible
//   Context     Compass's rolling read, and asking it something directly
//
// ┌─ WHAT THIS MODULE IS NOT ───────────────────────────────────────────────┐
// │ It is not an engine. It counts and groups what the screen was already    │
// │ given. No AI call, no persistence, no lifecycle, no decision. It never   │
// │ marks a question answered, accepts a suggestion, or creates a witness,   │
// │ an allegation or evidence — every one of those stays an explicit human   │
// │ act on the existing handler.                                             │
// │                                                                          │
// │ It also does not rank or hide. A category with nothing in it still       │
// │ exists; it simply says so.                                               │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

export const SUPPORT_CATEGORY = Object.freeze({
  QUESTIONS: "questions",
  GUIDANCE: "guidance",
  CONTEXT: "context",
});

export const SUPPORT_LABEL = Object.freeze({
  [SUPPORT_CATEGORY.QUESTIONS]: "Questions",
  [SUPPORT_CATEGORY.GUIDANCE]: "Guidance",
  [SUPPORT_CATEGORY.CONTEXT]: "Context",
});

const pending = list => (list || []).filter(s => s && s.status === "pending");

// How many things are waiting in each category. A count is a quiet indicator —
// it is NOT a score, a completion percentage or a target. Nothing is "due".
export function supportCounts({
  prepQuestions = [],
  coachingTips = [],
  showNudge = false,
  showFollowUp = false,
  evidenceSuggestions = [],
  actionSuggestions = [],
  meetingIntelligence = null,
} = {}) {
  // "Not asked" is the real stored status (prepQuestions.js QUESTION_STATUSES);
  // an unset status means the same thing. Everything else — asked, answered,
  // partially answered, no longer relevant — has been dealt with.
  const unasked = prepQuestions.filter(q => q && (!q.status || q.status === "not_asked")).length;
  const guidance =
    coachingTips.length +
    (showNudge ? 1 : 0) +
    (showFollowUp ? 1 : 0) +
    pending(evidenceSuggestions).length +
    pending(actionSuggestions).length +
    (meetingIntelligence?.newIssues?.length || 0);

  return {
    [SUPPORT_CATEGORY.QUESTIONS]: unasked,
    [SUPPORT_CATEGORY.GUIDANCE]: guidance,
    [SUPPORT_CATEGORY.CONTEXT]: 0,   // context is always available, never "waiting"
  };
}

// Which category should be showing when the rail opens. Questions if the
// manager actually prepared some — that is the thing they asked for. Otherwise
// Guidance only if Compass has genuinely noticed something; otherwise Context.
// Never chosen to maximise what is on screen.
export function defaultSupportCategory(counts = {}) {
  if ((counts[SUPPORT_CATEGORY.QUESTIONS] || 0) > 0) return SUPPORT_CATEGORY.QUESTIONS;
  if ((counts[SUPPORT_CATEGORY.GUIDANCE] || 0) > 0) return SUPPORT_CATEGORY.GUIDANCE;
  return SUPPORT_CATEGORY.CONTEXT;
}

// ── Elapsed time ────────────────────────────────────────────────────────────
//
// The screen showed "Started 09:53" and nothing else, so a chair had to do the
// arithmetic themselves. This is the duration, formatted plainly. It is not a
// countdown, there is no target length, and nothing turns amber.
export function elapsedSince(startIso, now = new Date()) {
  if (!startIso) return null;
  const started = new Date(startIso);
  if (isNaN(started.getTime())) return null;
  const ms = now.getTime() - started.getTime();
  if (ms < 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Capture state ───────────────────────────────────────────────────────────
//
// "A manager should never wonder whether Compass is actually recording/saving."
// Returns what is TRUE, in words, never a colour alone. `saved` reflects the
// existing autosave having something to hold, not a promise about the server.
export function captureState({ isListening = false, transcriptLength = 0, hasDraftText = false } = {}) {
  if (isListening) {
    return { key: "listening", label: "Listening", detail: "Compass is capturing what is said." };
  }
  if (transcriptLength > 0) {
    return {
      key: "saved",
      label: `${transcriptLength} note${transcriptLength === 1 ? "" : "s"} captured`,
      detail: "Saved on this device as you go.",
    };
  }
  if (hasDraftText) {
    return { key: "typing", label: "Not captured yet", detail: "Press Enter to capture this line." };
  }
  return { key: "empty", label: "Nothing captured yet", detail: "Type a note, or turn the microphone on." };
}
