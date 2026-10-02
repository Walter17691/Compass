// ─────────────────────────────────────────────────────────────────────────
// ASK COMPASS — the conversation, as a shared contract.
//
// What the audit actually found, before any code was written:
//
//   Every Ask surface ALREADY sends the full prior conversation to the model.
//   askCompass posts `messages: newHistory`; sendCaseChat posts the prior turns
//   plus a composed final turn; sendGlobalChat posts `...updated.map(...)` for
//   its answer call (its single-question call is a CLASSIFIER, which should not
//   carry history). Multi-turn understanding was never missing.
//
//   What was broken was one line of rendering. ReviewScreen displayed
//   `askCompassHistory.slice(-2)` — the last user turn and the last reply —
//   so each new question appeared to REPLACE the previous exchange. The
//   conversation was always there; the screen showed a window of two.
//
// So this module does not add a conversation engine to a product that has one.
// It states the semantics the surfaces already rely on, in one place, so the
// next surface cannot quietly diverge:
//
//   - a question APPENDS; it never replaces
//   - a reply APPENDS beneath the question it answers
//   - a FAILED turn appends a failure in place of the reply and leaves every
//     earlier turn intact
//   - a retry replaces the failed reply rather than repeating the question
//   - a thread belongs to a context, and two contexts never share one
//
// ┌─ WHAT THIS IS NOT ──────────────────────────────────────────────────────┐
// │ No persistence. Ask conversations are component state and vanish on      │
// │ reload — established by audit, not assumed, and deliberately left that   │
// │ way: durable chat would need a schema change, which this task forbids.   │
// │                                                                          │
// │ No retrieval, no permission decisions, no context construction. Each turn │
// │ is grounded by its caller at request time from already-authorised state,  │
// │ so conversational memory can never become a way to re-reach material the  │
// │ user has since lost access to.                                            │
// │                                                                          │
// │ Nothing here is an HR record. An Ask conversation is internal advisory    │
// │ material: it is not evidence, not an allegation, not a finding, and it    │
// │ never writes to a case.                                                   │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

export const ROLE = Object.freeze({ USER: "user", ASSISTANT: "assistant" });

const isTurn = m => !!m && (m.role === ROLE.USER || m.role === ROLE.ASSISTANT);

// Only well-formed turns are ever rendered or sent. Defensive because this
// state is shared by several surfaces and one malformed entry would otherwise
// break the transcript for all of them.
export function conversationTurns(history) {
  return (Array.isArray(history) ? history : []).filter(isTurn);
}

// A question is added to the end. This is the whole of the reported defect:
// the transcript grows, it does not get replaced.
export function appendQuestion(history, text) {
  const q = typeof text === "string" ? text.trim() : "";
  if (!q) return conversationTurns(history);
  return [...conversationTurns(history), { role: ROLE.USER, content: q }];
}

// A reply lands beneath the question it answers.
export function appendReply(history, text) {
  return [...conversationTurns(history), { role: ROLE.ASSISTANT, content: typeof text === "string" ? text : "" }];
}

// A failure must never cost the user the conversation they already had. It
// appends a failed turn and marks it, so the UI can offer a retry and so the
// next request can leave it out of what it sends to the model — an error string
// is not something Compass said about the case.
export function appendFailure(history, message) {
  return [...conversationTurns(history), {
    role: ROLE.ASSISTANT,
    content: message || "Sorry, something went wrong.",
    failed: true,
  }];
}

// Retry replaces the failed reply in place. Without this the question would be
// asked twice and appear twice.
export function withoutTrailingFailure(history) {
  const turns = conversationTurns(history);
  if (turns.length && turns[turns.length - 1].failed) return turns.slice(0, -1);
  return turns;
}

// The question a retry should re-send: the last user turn, when the turn after
// it failed.
export function lastQuestion(history) {
  const turns = conversationTurns(history);
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === ROLE.USER) return turns[i].content;
  }
  return null;
}

// What is sent to the model. Failed turns are dropped: "Sorry, something went
// wrong." is an artefact of the transport, and letting it accumulate as
// assistant context degrades every later answer.
export function turnsForModel(history) {
  return conversationTurns(history).filter(m => !m.failed);
}

// ── Thread identity ──
//
// A conversation belongs to exactly one context. Review's Ask is about the
// record on screen; the global assistant's is organisation-wide; the case tab
// already keys its history by case id. Without a key, one shared array meant a
// conversation held on one surface reappeared on another — and the next turn
// would then be sent alongside a different surface's grounding.
//
// Null when there is no identifiable context: callers treat that as "no thread",
// never as a shared one.
export function askThreadKey({ meetingId = null, caseId = null, surface = "review" } = {}) {
  if (meetingId) return `${surface}:meeting:${meetingId}`;
  if (caseId) return `${surface}:case:${caseId}`;
  return null;
}

// Read one thread out of the keyed store without ever falling back to another.
export function threadFor(threads, key) {
  if (!key || !threads || typeof threads !== "object") return [];
  return conversationTurns(threads[key]);
}
