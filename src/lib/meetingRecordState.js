import { isGenuineMeeting, declaredStatus, MEETING_STATUS } from './meetingLifecycle.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B.2 corrective — what state is this meeting record actually in?
//
// Human testing: "Case details → Meetings → Disciplinary correctly shows the
// meeting and a View notes action … The problem is that the Case View does not
// tell me the lifecycle/status of that meeting record."
//
// MeetingsTab already showed the SIGNATURE state. What it never showed was the
// RECORD state — whether the write-up is a draft awaiting review, finished, or
// the meeting has not happened yet. Both are stored; only one was surfaced.
//
// ┌─ EVERY STATE BELOW IS STORED, NONE IS INFERRED ─────────────────────────┐
// │ meetings[].status        scheduled | in_progress | review_draft |       │
// │                          completed | cancelled                           │
// │ meetings[].signStatus    mirrored down from signing_requests.status      │
// │ meetings[].signedAt / signerName / declineReason                         │
// │                                                                          │
// │ signing_requests also stores opened_at, declined_at, expires_at and      │
// │ requires_signature. Production currently holds only signed / pending /   │
// │ sent, so nothing here claims a state the backend does not produce.       │
// └─────────────────────────────────────────────────────────────────────────┘
//
// This module invents no status, infers nothing from UI state, and adds no
// lifecycle of its own. It is a label for state that already exists.
// ─────────────────────────────────────────────────────────────────────────

// The record's own state, in words a manager can act on. Deliberately says what
// is TRUE rather than what to do — the case's single primary action, which
// getNextStep already owns, is the thing that says what to do.
const RECORD_STATE = Object.freeze({
  [MEETING_STATUS.SCHEDULED]:   { key: "scheduled",   label: "Scheduled",            tone: "pending" },
  [MEETING_STATUS.IN_PROGRESS]: { key: "in_progress", label: "In progress",          tone: "live" },
  [MEETING_STATUS.REVIEW_DRAFT]:{ key: "review_draft",label: "Record awaiting review",tone: "attention" },
  [MEETING_STATUS.COMPLETED]:   { key: "completed",   label: "Record complete",      tone: "done" },
  [MEETING_STATUS.CANCELLED]:   { key: "cancelled",   label: "Cancelled",            tone: "muted" },
});

export function meetingRecordState(m) {
  if (!isGenuineMeeting(m)) return null;
  const declared = declaredStatus(m);
  const known = RECORD_STATE[declared];
  if (known) return known;
  // An unrecognised stored status is not guessed at. "Held" is true of any
  // meeting that has a written record and claims nothing more.
  if (m && m.record) return { key: "held", label: "Held", tone: "done" };
  return null;
}

// The signature leg, which is a property of the DOCUMENT rather than the
// meeting. Separate on purpose: a completed record that was never sent for
// signature is not "awaiting" anything, and conflating the two is how a record
// ends up looking unfinished when it is simply not a signing document.
const SIGN_STATE = Object.freeze({
  pending:      { key: "sign_pending",  label: "Awaiting signature",  tone: "pending" },
  sent:         { key: "sign_sent",     label: "Awaiting signature",  tone: "pending" },
  opened:       { key: "sign_opened",   label: "Opened by employee",  tone: "pending" },
  signed:       { key: "sign_signed",   label: "Signed",              tone: "done" },
  acknowledged: { key: "sign_ack",      label: "Acknowledged",        tone: "done" },
  declined:     { key: "sign_declined", label: "Declined",            tone: "attention" },
  expired:      { key: "sign_expired",  label: "Signature link expired", tone: "muted" },
});

export function meetingSignatureState(m) {
  const raw = m && typeof m.signStatus === "string" ? m.signStatus.trim() : "";
  if (!raw) return null;                 // never sent — not a state, an absence
  return SIGN_STATE[raw] || null;        // an unknown value is not relabelled
}

// Both legs, in the order a reader needs them: where the write-up is, then
// where the signature is. Either may be absent.
export function meetingStateChips(m) {
  return [meetingRecordState(m), meetingSignatureState(m)].filter(Boolean);
}

// One line for a whole case: "3 meetings · 1 awaiting review". Used so the
// Meetings destination can say something true before it is opened.
export function meetingsSummary(meetings = []) {
  const genuine = (meetings || []).filter(isGenuineMeeting);
  if (!genuine.length) return null;
  const counts = {};
  genuine.forEach(m => {
    const s = meetingRecordState(m);
    if (s) counts[s.key] = (counts[s.key] || 0) + 1;
  });
  const parts = [`${genuine.length} meeting${genuine.length === 1 ? "" : "s"}`];
  if (counts.in_progress) parts.push(`${counts.in_progress} in progress`);
  if (counts.review_draft) parts.push(`${counts.review_draft} awaiting review`);
  if (counts.scheduled) parts.push(`${counts.scheduled} scheduled`);
  const awaitingSig = genuine.filter(m => {
    const s = meetingSignatureState(m);
    return s && (s.key === "sign_pending" || s.key === "sign_sent" || s.key === "sign_opened");
  }).length;
  if (awaitingSig) parts.push(`${awaitingSig} awaiting signature`);
  return parts.join(" · ");
}
