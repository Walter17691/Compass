import { SPEAKERS } from '../constants';

// ─────────────────────────────────────────────────────────────────────────
// ONE CAPTURE EVENT = ONE NOTE. ATTRIBUTION ENRICHES; IT NEVER PRODUCES.
//
// ┌─ THE DEFECT THIS CLOSES (Trust UAT blocker, 2026-10-04) ────────────────┐
// │ A tester typed FOUR notes into a live Investigation meeting and Compass   │
// │ showed EIGHT, with timestamps grouped 1 / 2 / 4 / 1.                     │
// │                                                                         │
// │ addUtterance appended one optimistic entry, then called Claude to         │
// │ attribute the speaker. The request carried the new utterance AND a        │
// │ `Recent:` block of the last five notes, under the instruction             │
// │ "Attribute EACH utterance … Return JSON only: [{speaker,text}]".          │
// │ The reply is an ARRAY, and the old code did:                             │
// │                                                                         │
// │     const items = parsed.map((u,i) => ({ id: i===0 ? pendingId           │
// │                                                   : newId("utt"), … }));  │
// │     setTranscript(p => [...p.filter(u=>u.id!==pendingId), ...items]);     │
// │                                                                         │
// │ So whenever the model helpfully re-emitted the context lines, every        │
// │ extra element became a NEW note with a NEW id. One capture became n.      │
// │ Because slice(-5) grows, so does n: 1, then 2, then 4. The arithmetic     │
// │ reproduces the tester's eight notes exactly.                             │
// │                                                                         │
// │ THE REAL FAULT IS NOT THE PROMPT. It is that nothing tied the reply back  │
// │ to the capture that asked for it. A fresh crypto.randomUUID() per extra   │
// │ element made every fabricated note look, to every later layer, exactly    │
// │ as legitimate as a real one.                                             │
// └─────────────────────────────────────────────────────────────────────────┘
//
// WHY THIS IS NOT TEXT DEDUPLICATION. A participant may legitimately say the
// same sentence twice in one meeting, and an HR record that silently drops the
// second occurrence is falsified just as badly as one that invents a note. So
// nothing here compares one note against another note. Every check is
// DERIVATION: does this output belong to the capture that produced it?
//
//   · identity   — every entry id is the captureId, or captureId#<index>
//   · provenance — a reply may only describe ITS OWN capture
//   · fidelity   — segment text must partition the captured text, verbatim
//   · idempotency — reconciling the same reply twice yields the same transcript
//
// Replaying an attribution is therefore a no-op rather than a second append,
// which is the property the old code lacked.
// ─────────────────────────────────────────────────────────────────────────

// Where a note came from. Recorded on the entry so a record can later say
// honestly whether a line was typed, heard, or imported.
export const CAPTURE_CHANNEL = Object.freeze({
  TYPING: 'typing',
  SPEECH_MIC: 'speech_mic',
  SPEECH_SCREEN: 'speech_screen',
  IMPORT: 'import',
  // The uncommitted composer line swept up by "End meeting", and the
  // adjourn/reconvene markers. Never attributed by AI.
  FLUSH: 'flush',
  SYSTEM: 'system',
});

// MAY one capture on this channel legitimately contain more than one speaker?
//
// Typing: NO. The composer splits on newline before calling, so one Enter is
// one line is one note — there is no ambiguity to resolve and therefore no
// licence to split. This is the channel the UAT exercised.
//
// Speech: YES. A microphone buffer flushes every ~8 words and a screen-audio
// chunk is whatever arrived; either can genuinely straddle two speakers, and
// refusing to split would merge a question and its answer into one note.
//
// Import: YES. A pasted transcript chunk is many utterances by construction.
const SEGMENTABLE = Object.freeze({
  [CAPTURE_CHANNEL.TYPING]: false,
  [CAPTURE_CHANNEL.SPEECH_MIC]: true,
  [CAPTURE_CHANNEL.SPEECH_SCREEN]: true,
  [CAPTURE_CHANNEL.IMPORT]: true,
  [CAPTURE_CHANNEL.FLUSH]: false,
  [CAPTURE_CHANNEL.SYSTEM]: false,
});

/**
 * Unknown channels are treated as ATOMIC. Fail closed: a channel nobody has
 * reasoned about does not get permission to multiply notes.
 */
export function isSegmentable(channel) {
  return SEGMENTABLE[channel] === true;
}

/**
 * The neutral speaker. Used whenever attribution is unavailable, unusable or
 * names somebody who is not in the meeting.
 *
 * SPEAKERS.NOTE deliberately — it is an existing, already-rendered value (the
 * End-meeting flush has always used it), so this introduces no new vocabulary.
 * The previous fallback was `caseInfo.manager || "HR Manager"`, which on any
 * API failure attributed every line — including the employee's answers — to
 * the chair. That is the same fall-through-default-that-implies-a-claim defect
 * the confirmation-semantics map exists to prevent, in the transcript.
 */
export const UNATTRIBUTED_SPEAKER = SPEAKERS.NOTE;

const SEGMENT_SEPARATOR = '#';

/** The id of segment `index` of a capture. Derived, so a replay recomputes it. */
export function segmentId(captureId, index) {
  return index === 0 ? captureId : `${captureId}${SEGMENT_SEPARATOR}${index}`;
}

/**
 * Does this transcript entry belong to the given capture?
 *
 * The ONLY membership test in this module. Reconciliation and replay detection
 * both run through it, so there is one definition of "same write" rather than
 * two that can drift apart.
 */
export function belongsToCapture(entry, captureId) {
  if (!entry || !captureId) return false;
  const id = entry.id;
  if (typeof id !== 'string') return false;
  return id === captureId || id.startsWith(`${captureId}${SEGMENT_SEPARATOR}`);
}

/**
 * The optimistic entry written the instant something is captured, before any
 * network call. This — not the reply — is the authoritative record of the note.
 */
export function pendingCapture({ captureId, channel, text, ts }) {
  return {
    id: captureId,
    captureId,
    channel,
    speaker: '...',
    text,
    ts,
    pending: true,
  };
}

// Whitespace is not content. Everything else is.
const normalise = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/**
 * Is `segments` a faithful partition of `text`?
 *
 * Joined segment text must equal the captured text once whitespace is
 * normalised. Nothing added, nothing lost, nothing reworded.
 *
 * This single check defeats both halves of the blocker at once, and it does so
 * WITHOUT looking at any other note:
 *   · re-emitted context lines are not part of this capture's text, so the
 *     join is longer than the capture and the partition is refused;
 *   · a paraphrase does not reproduce the capture, so it is refused too —
 *     closing a quieter defect in which the model could silently rewrite what
 *     a participant said, because the old code stored `u.text` from the reply
 *     rather than the text actually captured.
 */
export function isFaithfulPartition(text, segments) {
  if (!Array.isArray(segments) || segments.length === 0) return false;
  if (segments.some((s) => !normalise(s && s.text))) return false;
  return normalise(segments.map((s) => s.text).join(' ')) === normalise(text);
}

/**
 * Which speaker name may be recorded?
 *
 * A name the model invented is not evidence that a person was present, so an
 * unrecognised speaker falls back to neutral rather than adding an attendee to
 * the record of a disciplinary meeting. Comparison is on the name only, which
 * is identity among the KNOWN participants — not similarity between notes.
 */
export function resolveSpeaker(proposed, allowedSpeakers) {
  const name = typeof proposed === 'string' ? proposed.trim() : '';
  if (!name) return UNATTRIBUTED_SPEAKER;
  const allowed = Array.isArray(allowedSpeakers) ? allowedSpeakers : [];
  const match = allowed.find(
    (a) => typeof a === 'string' && a.trim().toLowerCase() === name.toLowerCase(),
  );
  // Return the CANONICAL spelling, so "sam testcase" cannot create a second
  // apparent speaker alongside "Sam Testcase".
  return match ? match.trim() : UNATTRIBUTED_SPEAKER;
}

/**
 * WHICH element of the reply is talking about MY capture?
 *
 * Needed because a reply that echoes context does not put the new utterance
 * first — element 0 is then the echoed line, and taking its speaker attributes
 * the new note to whoever said a previous one. (Found by test, after the
 * duplication itself was fixed: four notes, four entries, two wrong names.)
 *
 * NOTE ON THE TEXT COMPARISON. This matches the reply against THE CAPTURE THAT
 * PRODUCED IT — output against its own input. It never compares one note in the
 * transcript against another, so two genuinely identical utterances remain two
 * notes with independent attribution. That distinction is the whole point.
 *
 * Fails NEUTRAL when the element cannot be identified: an unidentifiable
 * attribution is not evidence about who spoke.
 */
export function speakerForCapture(capture, reply, allowedSpeakers) {
  const want = normalise(capture?.text);
  const exact = reply.filter((u) => normalise(u.text) === want);
  if (exact.length === 1) return resolveSpeaker(exact[0].speaker, allowedSpeakers);
  // The model complied and returned a single element. Trust its speaker even if
  // it reworded the text — the text itself is discarded either way.
  if (exact.length === 0 && reply.length === 1) return resolveSpeaker(reply[0].speaker, allowedSpeakers);
  return UNATTRIBUTED_SPEAKER;
}

/**
 * Turn an attribution reply into the entries for ONE capture.
 *
 * Guarantees, for every input including malformed and hostile ones:
 *   · returns at least one entry — a captured note is never deleted, which the
 *     old code did silently whenever the model replied with `[]`;
 *   · returns exactly one entry for an atomic channel, however many the model
 *     offered;
 *   · returns entries whose ids are all derived from captureId;
 *   · never returns text that is not the captured text (or a faithful
 *     partition of it).
 */
export function attributeCapture(capture, parsed, { allowedSpeakers = [] } = {}) {
  const captureId = capture?.captureId || capture?.id;
  const base = {
    captureId,
    channel: capture?.channel,
    ts: capture?.ts,
    pending: false,
  };
  const one = (speaker, aiAttributed) => [
    { ...base, id: segmentId(captureId, 0), speaker, text: capture?.text, aiAttributed },
  ];

  const reply = Array.isArray(parsed) ? parsed.filter((u) => u && typeof u === 'object') : [];
  if (reply.length === 0) return one(UNATTRIBUTED_SPEAKER, false);

  // Atomic: take the speaker of the element describing THIS capture, ignore any
  // others, keep the captured text.
  if (!isSegmentable(capture?.channel)) {
    return one(speakerForCapture(capture, reply, allowedSpeakers), true);
  }

  // Segmentable: splitting is allowed only if the split is faithful. Otherwise
  // the capture is kept whole, attributed by the same derivation rule.
  if (reply.length === 1 || !isFaithfulPartition(capture?.text, reply)) {
    return one(speakerForCapture(capture, reply, allowedSpeakers), true);
  }
  return reply.map((u, i) => ({
    ...base,
    id: segmentId(captureId, i),
    speaker: resolveSpeaker(u.speaker, allowedSpeakers),
    text: u.text,
    aiAttributed: true,
  }));
}

/**
 * Write attributed entries back into the transcript.
 *
 * REPLACE-IN-PLACE, BY CAPTURE IDENTITY. Two properties the old filter-then-
 * append did not have:
 *
 *   · IDEMPOTENT. Applying the same reply twice is a no-op, because everything
 *     belonging to the capture is removed before the new entries go in and the
 *     new entries' ids are derived from the captureId. A retried or replayed
 *     attribution cannot add a note.
 *   · ORDER-PRESERVING. The entries land where the capture was, not at the end.
 *     The old code moved them to the end, so two overlapping speech captures —
 *     routine, the mic flushes every ~8 words — could silently reorder a
 *     meeting record if the second reply arrived first.
 *
 * A capture that is no longer present (the meeting was discarded, or the
 * transcript was replaced by a resume) is NOT re-added: a late reply must not
 * resurrect a note from an abandoned session.
 */
export function reconcileCapture(transcript, captureId, entries) {
  const list = Array.isArray(transcript) ? transcript : [];
  const at = list.findIndex((u) => belongsToCapture(u, captureId));
  if (at === -1) return list;
  const before = list.slice(0, at).filter((u) => !belongsToCapture(u, captureId));
  const after = list.slice(at + 1).filter((u) => !belongsToCapture(u, captureId));
  return [...before, ...(Array.isArray(entries) ? entries : []), ...after];
}

/**
 * How many distinct capture events does this transcript represent?
 *
 * The invariant a meeting record must satisfy: one Enter, one capture. Exposed
 * so tests and any future integrity check can assert on write identity rather
 * than on note text.
 */
export function captureCount(transcript) {
  const seen = new Set();
  for (const u of Array.isArray(transcript) ? transcript : []) {
    const id = u && (u.captureId || u.id);
    if (typeof id === 'string' && id) seen.add(id.split(SEGMENT_SEPARATOR)[0]);
  }
  return seen.size;
}
