import { declaredStatus, isGenuineMeeting, MEETING_STATUS } from './meetingLifecycle.js';

// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — the canonical meeting write path.
//
// Release 1 Phase 2.1. Establishes authoritative parentage and the
// create-vs-patch contract every later meeting phase depends on.
//
// Case-type agnostic by construction. Nothing here branches on misconduct,
// grievance, appeal, disciplinary, probation or any other process. A meeting
// is a meeting; why it is required belongs to the process recipe, and what
// state it is in belongs to meetingLifecycle.js.
//
// PHASE 2.1 SCOPE — this module writes identity and parentage only. It does
// NOT write lifecycle status (scheduled/in_progress/review_draft/completed/
// cancelled). Those begin in later bounded phases, and planMeetingWrite
// deliberately has no opinion about them.
//
// WHY THIS EXISTS. saveMeetingToCaseImpl resolved the target case by matching
// cases.employeeName against the typed employee name, took nameMatches[0] on
// collision, and minted a brand-new case when nothing matched (NEW-20, P1).
// Two employees who share a name, or one employee with a closed prior case
// and a live one, could have a meeting filed onto the wrong record silently.
// Parentage is now an input, never an inference.
// ─────────────────────────────────────────────────────────────────────────

export const WRITE_FAILURE = Object.freeze({
  // No authoritative caseId was supplied. The meeting is unlinked: it must
  // not be guessed onto a case and must not mint one. Phase 2.1 fails closed
  // here; the explicit "link to existing case / create new case" flow is a
  // later entry-path adoption phase.
  PARENT_REQUIRED: "parent_required",
  // A caseId was supplied but no such case is present in the caller's
  // accessible set — deleted, or access revoked mid-meeting.
  NOT_FOUND: "not_found",
  // The meeting asserts one parent and the write targets another. Never
  // silently repaired, never moved: the two disagree and only a human can say
  // which is right.
  PARENTAGE_MISMATCH: "parentage_mismatch",
  // The meeting object carries no usable id.
  INVALID_MEETING: "invalid_meeting",
  // The meeting is not in a state this transition is allowed to start from —
  // a completed hearing cannot be re-started, a legacy row cannot be swept
  // into the lifecycle, and a stale client cannot force a status it has not
  // actually observed.
  STALE_STATUS: "stale_status",
});

const isNonEmptyString = v => typeof v === "string" && v.trim().length > 0;

// Creation metadata describes the creation of a meeting's IDENTITY, so it is
// immutable for the life of that identity.
//
// Found in production human UAT (2026-09-24): a scheduled meeting created at
// 20:11:55.819Z read 20:50:23.987Z after Save — exactly its savedAt — and
// createdBy had been re-stamped too. saveMeetingToCaseImpl applies
// stampNewMeeting unconditionally, including when the write turns out to be a
// patch, and the spread below let the fresh values win. The effect was to
// destroy the scheduling moment and collapse the deliberate createdAt (when the
// object was first persisted) vs startedAt (when the meeting began)
// distinction, which is precisely what scheduling made meaningful.
//
// Enforced here rather than in each caller: persistMeeting and
// transitionMeeting both route through planMeetingWrite, so one rule covers
// every write path that exists today and every one added later. A caller may
// stamp freely — on a patch the stamp simply cannot land.
//
// Three cases, all fail-safe:
//   stored value present  -> preserved, incoming ignored
//   incoming tries to set -> rejected
//   stored value absent   -> stays absent. A patch must not invent creation
//                            metadata for a legacy row that never had any; the
//                            884 pre-lifecycle production rows carry none, and
//                            an unrelated patch is no place to fabricate one.
const IMMUTABLE_ON_PATCH = ["createdAt", "createdBy"];

function patchMeeting(stored, incoming, caseId) {
  const next = { ...stored, ...incoming, id: stored.id, caseId };
  for (const key of IMMUTABLE_ON_PATCH) {
    if (key in stored) next[key] = stored[key];
    else delete next[key];
  }
  return next;
}

// Pure. Produces the next cases array without touching anything, so the
// decision can be asserted in tests independently of persistence.
//
// Returns { ok, reason?, mode: "create" | "patch", nextCases, meeting }.
export function planMeetingWrite({ cases, caseId, meeting }) {
  if (!isNonEmptyString(caseId)) return { ok: false, reason: WRITE_FAILURE.PARENT_REQUIRED };
  if (!meeting || typeof meeting !== "object" || Array.isArray(meeting) || !isNonEmptyString(meeting.id)) {
    return { ok: false, reason: WRITE_FAILURE.INVALID_MEETING };
  }
  // An asserted parent that disagrees with the target is a contradiction, not
  // a correction. Reject rather than pick a winner.
  if (isNonEmptyString(meeting.caseId) && meeting.caseId !== caseId) {
    return { ok: false, reason: WRITE_FAILURE.PARENTAGE_MISMATCH };
  }

  const list = Array.isArray(cases) ? cases : [];
  const target = list.find(c => c && c.id === caseId);
  if (!target) return { ok: false, reason: WRITE_FAILURE.NOT_FOUND };

  const meetings = Array.isArray(target.meetings) ? target.meetings : [];
  const index = meetings.findIndex(m => m && m.id === meeting.id);

  // A stored meeting that already claims a different parent is the same
  // contradiction seen from the other side.
  if (index >= 0 && isNonEmptyString(meetings[index].caseId) && meetings[index].caseId !== caseId) {
    return { ok: false, reason: WRITE_FAILURE.PARENTAGE_MISMATCH };
  }

  const mode = index >= 0 ? "patch" : "create";
  // id and caseId are restated from the authoritative side on every write, so
  // no patch can move a meeting between cases or change its identity.
  const nextMeetings = index >= 0
    ? meetings.map((m, i) => (i === index ? patchMeeting(m, meeting, caseId) : m))
    : [...meetings, { ...meeting, caseId }];

  return {
    ok: true,
    mode,
    meeting: nextMeetings[index >= 0 ? index : nextMeetings.length - 1],
    nextCases: list.map(c => (c && c.id === caseId ? { ...c, meetings: nextMeetings } : c)),
  };
}

// The only sanctioned way to write a meeting.
//
// saveCases is injected rather than imported so this module stays free of I/O
// and of App.jsx's state — but note the call is always saveCases(next, caseId)
// with the changed case id supplied. That is not a convention this module
// hopes callers follow; it is the only call it makes, so the sync-all branch
// (which returns nothing at all, and whose conflict semantics would silently
// swallow a rejection) is structurally unreachable from here.
//
// Always awaited, always inspected, always fails closed. On conflict the
// caller must reload and let the user decide — never replay, because the
// precondition that justified the write may no longer hold.
export async function persistMeeting({ cases, caseId, meeting, saveCases }) {
  const plan = planMeetingWrite({ cases, caseId, meeting });
  if (!plan.ok) return { ok: false, reason: plan.reason };

  const result = await saveCases(plan.nextCases, caseId);
  if (!result?.ok) {
    return { ok: false, reason: result?.reason || "error", message: result?.message, mode: plan.mode };
  }
  return { ok: true, mode: plan.mode, caseId, meetingId: meeting.id, meeting: plan.meeting };
}

// A declared lifecycle transition on an existing, already-persisted meeting.
//
// Deliberately NOT a generic setStatus. Every transition names the states it
// is allowed to start from, so the database of record — not the client's idea
// of what it last saw — decides whether the move is legal. A completed
// hearing cannot be re-started, and a legacy row (declaredStatus null) can
// never satisfy an allowed-from set that does not explicitly name null, which
// is what keeps historical meetings out of the new lifecycle.
//
// Shares planMeetingWrite's guarantees: resolves by id, never appends, never
// moves a meeting between cases, single-case persistence only, awaited,
// inspected, fails closed, and never replays after a conflict.
export async function transitionMeeting({ cases, caseId, meetingId, allowedFrom, toStatus, patch = {}, saveCases }) {
  if (!isNonEmptyString(caseId)) return { ok: false, reason: WRITE_FAILURE.PARENT_REQUIRED };
  if (!isNonEmptyString(meetingId)) return { ok: false, reason: WRITE_FAILURE.INVALID_MEETING };

  const target = (Array.isArray(cases) ? cases : []).find(c => c && c.id === caseId);
  if (!target) return { ok: false, reason: WRITE_FAILURE.NOT_FOUND };

  const meetings = Array.isArray(target.meetings) ? target.meetings : [];
  const current = meetings.find(m => m && m.id === meetingId);
  if (!current) return { ok: false, reason: WRITE_FAILURE.NOT_FOUND };
  if (isNonEmptyString(current.caseId) && current.caseId !== caseId) {
    return { ok: false, reason: WRITE_FAILURE.PARENTAGE_MISMATCH };
  }

  const from = declaredStatus(current);
  const permitted = Array.isArray(allowedFrom) ? allowedFrom : [allowedFrom];
  if (!permitted.includes(from)) {
    return { ok: false, reason: WRITE_FAILURE.STALE_STATUS, from, toStatus };
  }

  // id, caseId and the target status are restated last so no patch payload
  // can quietly change identity, parentage or the declared destination.
  const next = { ...current, ...patch, id: current.id, caseId, status: toStatus };
  return persistMeeting({ cases, caseId, meeting: next, saveCases });
}

// ─────────────────────────────────────────────────────────────────────────
// Which Start is this?
//
// Release 1 Phase 2.3 continuity fix. Found by human UAT on 2026-09-25:
// Schedule persisted meeting_6a8bdb7c (scheduled, 2026-10-02 10:00, Teams),
// Prepare correctly carried that id into caseInfo.meetingId, and then Start
// from the prep pack called beginMeeting(), which minted meeting_352722cc and
// appended it. One hearing became two objects — a live one with no schedule and
// a stranded scheduled one that could still be "started" a second time.
//
// This decides, and only decides, WHICH existing machinery should run. It
// performs no write and duplicates no transition logic: a TRANSITION is then
// executed by transitionMeeting exactly as the Case View banner already does.
//
// Deliberately pure so the fail-closed rule is provable without a browser.
//
// CREATE IS NOT A FALLBACK. If a caller names a meeting and that meeting turns
// out to be missing, foreign, cancelled, completed or a letter artefact, this
// REJECTS. Falling back to "create a fresh one" is precisely the duplicate this
// fix exists to remove.
// ─────────────────────────────────────────────────────────────────────────

export const START_DECISION = Object.freeze({
  // scheduled → in_progress, via transitionMeeting on the SAME id.
  TRANSITION: "transition",
  // Already in_progress — a retry, a double click, or a navigation race.
  // Reopen the live meeting; write nothing and mint nothing.
  RESUME: "resume",
  REJECT: "reject",
});

export function planIdentifiedStart({ cases, caseId, meetingId }) {
  if (!isNonEmptyString(caseId)) {
    return { decision: START_DECISION.REJECT, reason: WRITE_FAILURE.PARENT_REQUIRED };
  }
  if (!isNonEmptyString(meetingId)) {
    return { decision: START_DECISION.REJECT, reason: WRITE_FAILURE.INVALID_MEETING };
  }

  const target = (Array.isArray(cases) ? cases : []).find(c => c && c.id === caseId);
  if (!target) return { decision: START_DECISION.REJECT, reason: WRITE_FAILURE.NOT_FOUND };

  const meetings = Array.isArray(target.meetings) ? target.meetings : [];
  const meeting = meetings.find(m => m && m.id === meetingId);
  // Covers the wrong-case id too: a meeting belonging to another case is simply
  // not on this one, and is never searched for elsewhere.
  if (!meeting) return { decision: START_DECISION.REJECT, reason: WRITE_FAILURE.NOT_FOUND };

  if (isNonEmptyString(meeting.caseId) && meeting.caseId !== caseId) {
    return { decision: START_DECISION.REJECT, reason: WRITE_FAILURE.PARENTAGE_MISMATCH };
  }
  // A letter artefact is not a meeting and can never be started as one.
  if (!isGenuineMeeting(meeting)) {
    return { decision: START_DECISION.REJECT, reason: WRITE_FAILURE.INVALID_MEETING };
  }

  const from = declaredStatus(meeting);
  if (from === MEETING_STATUS.SCHEDULED) return { decision: START_DECISION.TRANSITION, meeting, from };
  if (from === MEETING_STATUS.IN_PROGRESS) return { decision: START_DECISION.RESUME, meeting, from };
  // completed, cancelled, review_draft, and legacy rows (declaredStatus null,
  // which no allowed-from set names) all land here.
  return { decision: START_DECISION.REJECT, reason: WRITE_FAILURE.STALE_STATUS, meeting, from };
}

// ─────────────────────────────────────────────────────────────────────────
// Which End is this?
//
// Release 1 Phase 3A. Before this, End (handleReview) persisted NOTHING — no
// status, no endedAt — and cleared the localStorage crash-recovery draft on the
// way out, so between End and Save nothing existed anywhere. review_draft was a
// declared state with no writer and zero production rows.
//
// Same shape and the same reasoning as planIdentifiedStart: this decides WHICH
// existing machinery runs and writes nothing itself. A TRANSITION is executed by
// transitionMeeting with allowedFrom [in_progress], so the database of record —
// not the client's idea of what it last saw — decides whether the move is legal.
//
// ALREADY_ENDED is the replay answer, and it is deliberately NOT a rejection.
// End is reachable twice by ordinary means: a double click, a re-entry into
// Review from Case View, or a retry after a failed generation. Each must resolve
// to the SAME review_draft meeting and must never write a second endedAt. So
// this reports "already there" and the caller routes to Review without touching
// timing. NEW-29's authoritative-instant rule is preserved by not writing, not
// by recomputing.
// ─────────────────────────────────────────────────────────────────────────

export const END_DECISION = Object.freeze({
  // in_progress → review_draft, via transitionMeeting on the SAME id.
  TRANSITION: "transition",
  // Already review_draft. Idempotent: write nothing, keep endedAt as it stands.
  ALREADY_ENDED: "already_ended",
  REJECT: "reject",
});

export function planMeetingEnd({ cases, caseId, meetingId }) {
  if (!isNonEmptyString(caseId)) {
    return { decision: END_DECISION.REJECT, reason: WRITE_FAILURE.PARENT_REQUIRED };
  }
  if (!isNonEmptyString(meetingId)) {
    return { decision: END_DECISION.REJECT, reason: WRITE_FAILURE.INVALID_MEETING };
  }

  const target = (Array.isArray(cases) ? cases : []).find(c => c && c.id === caseId);
  if (!target) return { decision: END_DECISION.REJECT, reason: WRITE_FAILURE.NOT_FOUND };

  const meetings = Array.isArray(target.meetings) ? target.meetings : [];
  const meeting = meetings.find(m => m && m.id === meetingId);
  // A meeting belonging to another case is simply not on this one, and is never
  // searched for elsewhere — no name matching, no latest-meeting guessing.
  if (!meeting) return { decision: END_DECISION.REJECT, reason: WRITE_FAILURE.NOT_FOUND };

  if (isNonEmptyString(meeting.caseId) && meeting.caseId !== caseId) {
    return { decision: END_DECISION.REJECT, reason: WRITE_FAILURE.PARENTAGE_MISMATCH };
  }
  if (!isGenuineMeeting(meeting)) {
    return { decision: END_DECISION.REJECT, reason: WRITE_FAILURE.INVALID_MEETING };
  }

  const from = declaredStatus(meeting);
  if (from === MEETING_STATUS.IN_PROGRESS) return { decision: END_DECISION.TRANSITION, meeting, from };
  if (from === MEETING_STATUS.REVIEW_DRAFT) return { decision: END_DECISION.ALREADY_ENDED, meeting, from };
  // scheduled (never started), completed, cancelled, and legacy rows
  // (declaredStatus null) all land here. A legacy meeting is never swept into
  // the lifecycle by ending it.
  return { decision: END_DECISION.REJECT, reason: WRITE_FAILURE.STALE_STATUS, meeting, from };
}

// Identity and provenance stamped once, at creation. Separate from
// planMeetingWrite so that a patch can never re-stamp them.
export function stampNewMeeting(meeting, { caseId, now = new Date().toISOString(), by }) {
  return { ...meeting, caseId: caseId || null, createdAt: now, createdBy: by || null };
}

// Human-readable copy for the one failure this phase newly introduces.
// Deliberately actionable: the user's notes are intact and the fix is a
// single step they can take themselves.
export function describeMeetingWriteFailure(reason) {
  switch (reason) {
    case WRITE_FAILURE.PARENT_REQUIRED:
      return "This meeting isn't linked to a case yet, so it can't be saved. Open the case and start the meeting from there, or link it to a case first. Your notes have been kept.";
    case WRITE_FAILURE.NOT_FOUND:
      return "This meeting belongs to a case you can no longer open. Your notes have been kept — check with an administrator before trying again.";
    case WRITE_FAILURE.PARENTAGE_MISMATCH:
      return "This meeting is already recorded against a different case, so it wasn't saved. Your notes have been kept.";
    case WRITE_FAILURE.INVALID_MEETING:
      return "This meeting couldn't be saved because its record is incomplete. Your notes have been kept.";
    case WRITE_FAILURE.STALE_STATUS:
      return "This meeting has moved on since this screen was opened — it may already have been saved or cancelled elsewhere. Reopen the case to see where it is now. Your notes have been kept.";
    default:
      return null;
  }
}
