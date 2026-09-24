import { isLetterOnlyRecord, isGenuineMeetingRecord } from './caseStage.js';

// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — meeting lifecycle.
//
// Answers exactly one question: "what state is this meeting in?"
//
// It deliberately does NOT answer "what should this case do next?" (that is
// the process recipe's job, nextStep.js) or "what might the user need to
// consider?" (AI advisory). Keep those three apart.
//
// This module is case-type agnostic and must stay that way. Nothing here may
// branch on misconduct / grievance / appeal / disciplinary. The same
// lifecycle applies to an investigation meeting, a grievance meeting, a
// welfare meeting, a probation review and a consultation meeting alike.
// Where a PROCESS genuinely differs, that difference belongs in the recipe,
// never in this file.
//
// Legacy classification is NOT re-derived here. caseStage.js's
// isLetterOnlyRecord / isGenuineMeetingRecord are canonical and this module
// delegates to them, so there is exactly one implementation of "is this a
// letter artefact or a genuine meeting" in the codebase.
// ─────────────────────────────────────────────────────────────────────────

// The declared lifecycle vocabulary. Written only by structured meetings
// created from Phase 2 onward — no historical record carries any of these
// (production audit 2026-09-22: 0 of 884 stored entries had a status key).
export const MEETING_STATUS = Object.freeze({
  SCHEDULED: "scheduled",
  IN_PROGRESS: "in_progress",
  REVIEW_DRAFT: "review_draft",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

// Legacy-only pseudo-status for letter-shaped entries, which have no
// lifecycle of their own — they are documents that happen to be stored in
// the same array. Never written; only ever inferred for interpretation.
export const LETTER_STATUS = "letter";

// A stored meeting is always a plain object. Arrays are excluded explicitly:
// typeof [] === "object", and an array of meetings handed in where a single
// meeting was expected must not read as a meeting itself.
function isObject(m) {
  return !!m && typeof m === "object" && !Array.isArray(m);
}

// "Meaningful" deliberately means the same thing isLetterOnlyRecord already
// means by it — a non-empty, non-whitespace string — so the two never drift.
function hasMeaningfulRecord(m) {
  return typeof m?.record === "string" && m.record.trim().length > 0;
}

// The status a meeting actually DECLARES, with no inference of any kind.
// null means "no declared lifecycle state" — every row written before Phase
// 2.2, and the reason legacy meetings can never satisfy a lifecycle
// transition's allowed-from set by accident.
//
// Distinct from meetingStatus below, which answers the interpretive question
// and reports a legacy meeting as "completed". Lifecycle transitions must use
// this one: a historical row must not be swept into the new lifecycle merely
// because somebody opened it.
export function declaredStatus(m) {
  if (!isObject(m)) return null;
  const raw = typeof m.status === "string" ? m.status.trim() : "";
  return raw || null;
}

// "letter" | "meeting". A non-object cannot be shown to be a letter
// artefact, so it reads as "meeting" here; use isGenuineMeeting for the
// existence-safe predicate, which is false for null/undefined/garbage.
export function meetingKind(m) {
  if (!isObject(m)) return "meeting";
  return isLetterOnlyRecord(m) ? LETTER_STATUS : "meeting";
}

// Canonical genuine-meeting test. Thin delegation on purpose: consumers
// should be able to depend on the lifecycle module without needing to know
// that the classifier currently lives in caseStage.js.
//
// The isObject guard is additive, never contradictory. isGenuineMeetingRecord
// tests truthiness, so it answers "true" for a bare string, number or array —
// harmless at its five existing call sites, which only ever receive stored
// meeting objects, but this module is a platform primitive that will be
// handed whatever a caller has. For any real meeting object the two agree
// exactly; the guard only rejects values that are not meetings under any
// reading. caseStage.js stays canonical and untouched.
export function isGenuineMeeting(m) {
  return isObject(m) && isGenuineMeetingRecord(m);
}

// SEMANTIC status — what this meeting IS. Used for display and
// interpretation.
//
// Note this is deliberately NOT the same question as isMeetingComplete
// below. A legacy meeting that was saved without a record semantically
// HAPPENED (meetingStatus -> "completed") while still being treated as
// workflow-incomplete by the engine, because the historical engine required
// a generated record before it would advance. Both readings are correct;
// they are answers to different questions, and collapsing them would
// silently change the recommended next step on live cases.
export function meetingStatus(m) {
  if (!isObject(m)) return null;
  const explicit = declaredStatus(m);
  if (explicit) return explicit;
  if (isLetterOnlyRecord(m)) return LETTER_STATUS;
  return MEETING_STATUS.COMPLETED;
}

// WORKFLOW completion — the single predicate the process engine acts on.
//
// ┌─ COMPATIBILITY BOUNDARY ──────────────────────────────────────────────┐
// │                                                                       │
// │ NEW LIFECYCLE OBJECTS (explicit status present):                      │
// │   status === "completed" and nothing else. Record presence is         │
// │   irrelevant — a completed meeting whose record was never generated    │
// │   is still completed, and a review_draft holding generated content is  │
// │   still NOT completed.                                                 │
// │                                                                       │
// │ LEGACY OBJECTS (no status — every record stored before Phase 2):      │
// │   genuine meeting AND meaningful record. This is the historical        │
// │   engine's own proxy, preserved exactly, and quarantined to this one   │
// │   branch instead of being spread across five call sites in             │
// │   nextStep.js.                                                         │
// │                                                                       │
// │ This is a compatibility rule, not the future model. It exists so that  │
// │ the 99 genuine production meetings saved without a record (audited     │
// │ 2026-09-22: all carry savedAt, 49 carry a transcript, 18 are           │
// │ appeal-type) keep their current workflow behaviour rather than         │
// │ silently advancing their cases. The legacy branch goes dead for every  │
// │ meeting Phase 2 creates, without any historical row being rewritten.   │
// └───────────────────────────────────────────────────────────────────────┘
export function isMeetingComplete(m) {
  if (!isObject(m)) return false;
  const explicit = declaredStatus(m);
  if (explicit) return explicit === MEETING_STATUS.COMPLETED;
  return isGenuineMeeting(m) && hasMeaningfulRecord(m);
}

// Is this meeting currently live?
//
// Deterministic and declared-only. Resume must never be inferred from record
// absence, transcript presence, note presence, employee name or "the latest
// meeting" — every one of those was a source of the defects this redesign
// exists to remove. A legacy row (no declared status) is never resumable,
// which is what keeps historical meetings out of the new lifecycle.
export function isResumableMeeting(m) {
  return isGenuineMeeting(m) && declaredStatus(m) === MEETING_STATUS.IN_PROGRESS;
}

// Is this meeting arranged but not yet started?
//
// Declared-only, exactly like isResumableMeeting. A legacy row has no declared
// status and is never scheduled, so nothing historical is swept in.
export function isScheduledMeeting(m) {
  return isGenuineMeeting(m) && declaredStatus(m) === MEETING_STATUS.SCHEDULED;
}

// When a scheduled meeting is actually due. Returns NaN when the logistics are
// absent or unparseable, so callers can sort without inventing a time.
//
// schedule.date is authoritative. The top-level `date` field is kept in step
// with it purely so pre-lifecycle readers (MeetingsTab, caseTimeline,
// prevMeetings ordering) keep working unchanged.
export function scheduleInstant(m) {
  const s = isObject(m) && isObject(m.schedule) ? m.schedule : null;
  const date = (s && s.date) || (isObject(m) ? m.date : null);
  const time = s && s.time;
  // A missing or malformed time is UNKNOWN, never midnight. Defaulting to
  // "00:00" made a timeless meeting sort as the earliest of its day — an
  // invented fact, and exactly the kind of silent inference this redesign
  // exists to remove. Unsortable values are placed last by callers instead.
  if (!date || !/^\d{2}:\d{2}$/.test(time || "")) return NaN;
  return Date.parse(`${date}T${time}:00`);
}

// Every meeting arranged on a case, soonest first.
//
// Deliberately a list, not a single value. A case can legitimately have
// several meetings arranged at once — an investigation interview, a witness
// meeting, a disciplinary hearing, a follow-up welfare call — so no
// case-level "only one scheduled meeting" rule is implied or enforced here.
// Which one matters next is a question for the process recipe.
export function scheduledMeetingsFor(caseObj) {
  return (Array.isArray(caseObj?.meetings) ? caseObj.meetings : [])
    .filter(isScheduledMeeting)
    .map((m, index) => ({ m, index, at: scheduleInstant(m) }))
    .sort((a, b) => {
      const av = Number.isNaN(a.at) ? Infinity : a.at;   // undated sorts last
      const bv = Number.isNaN(b.at) ? Infinity : b.at;
      return av - bv || a.index - b.index;
    })
    .map(entry => entry.m);
}

// The live meeting on a case, if there is one.
//
// The UI intends exactly one, but nothing in the database enforces that, so
// this must not silently depend on array order. Where several are live the
// most recently started wins — a justified rule rather than an accident of
// position — and `ambiguous` is returned so the caller can say so out loud
// instead of quietly picking. Entries with no startedAt sort last, since an
// unstamped row cannot outrank one that recorded a real instant.
export function resumableMeetingFor(caseObj) {
  const live = (Array.isArray(caseObj?.meetings) ? caseObj.meetings : []).filter(isResumableMeeting);
  if (live.length === 0) return { meeting: null, count: 0, ambiguous: false };
  const ranked = live
    .map((m, index) => ({ m, index, at: Date.parse(m.startedAt || "") }))
    .sort((a, b) => {
      const av = Number.isNaN(a.at) ? -Infinity : a.at;
      const bv = Number.isNaN(b.at) ? -Infinity : b.at;
      return bv - av || b.index - a.index;
    });
  return { meeting: ranked[0].m, count: live.length, ambiguous: live.length > 1 };
}

// "Which genuine meeting happened last?" — letter artefacts excluded.
//
// This is NOT interchangeable with "was a letter of type X ever saved?"
// (hasLetterType). The Phase 0 audit proved the difference empirically: a
// saved appeal invitation is a real, retrievable fact about the case, and
// filtering it out of the collection hasLetterType reads made Compass offer
// to draft an invitation that already existed. Same array, different
// question — keep them apart.
//
// Returns undefined for an empty or absent list, matching the
// arr[arr.length-1] indexing it replaces.
export function lastGenuineMeeting(meetings) {
  if (!Array.isArray(meetings)) return undefined;
  const genuine = meetings.filter(isGenuineMeeting);
  return genuine[genuine.length - 1];
}
