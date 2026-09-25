// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — where does this meeting live? Phase 4C.1.
//
// Answers exactly one question: which store is AUTHORITATIVE for a given
// meeting. It performs no reads, no writes, and no network calls — it is the
// rule, not the mechanism.
//
// ┌─ THE ONE INVARIANT THIS MODULE EXISTS TO ENFORCE ──────────────────────┐
// │                                                                        │
// │   A meeting has exactly ONE authoritative storage home.                │
// │                                                                        │
// │   cases.meetings must NEVER contain a meeting whose authoritative home  │
// │   is public.meetings.                                                   │
// │                                                                        │
// │ No dual-write. No shadow copy. No reconciliation mechanism.            │
// └────────────────────────────────────────────────────────────────────────┘
//
// WHY THIS NEEDS A MODULE AND NOT A CONVENTION. The tempting shortcut is to
// merge table-resident meetings into the in-memory `case.meetings` array at load
// time: 44 files and 143 references would then work unchanged, for free. It is
// also the single most dangerous thing this design could do, because
// saveCases/saveCaseToDB persist the WHOLE case object including its meetings
// array (App.jsx:1538, `meetings: caseObj.meetings || []`). Any later case write
// — a stage change, a task toggle, an evidence upload — would copy the merged
// meetings straight back into the JSONB column and create genuine duplicates
// with two diverging sources of truth and no way to tell which is current.
//
// So the union NEVER produces a `case.meetings`. It produces a separate list,
// and the persistence boundary has a guard that refuses a contaminated array
// rather than trusting every future call site to remember.
//
// This is the same discipline splitMeetingRecord and stripAdvisorNotes already
// apply at the employee-facing/internal boundary: make the safe thing structural
// rather than remembered.
// ─────────────────────────────────────────────────────────────────────────

import { TABLE_HOME } from './standaloneMeetings.js';

export const MEETING_HOME = Object.freeze({
  // A JSONB object inside cases.meetings. Every historical meeting, and every
  // meeting born inside a case. Phase 4C does not migrate these, ever.
  EMBEDDED: "cases_meetings",
  // A row in public.meetings. Meetings born standalone, which stay here for
  // life — including after case_id is filled.
  TABLE: TABLE_HOME,
});

function isObject(m) {
  return !!m && typeof m === "object" && !Array.isArray(m);
}

// Which store owns this meeting?
//
// Keyed on an explicit marker written by meetingRowToObject, never inferred from
// the absence of a field. Inference was the source of the defects this whole
// redesign exists to remove: "no caseId therefore standalone" would misclassify
// every legacy embedded meeting, 884 of which predate caseId entirely.
export function meetingHome(meeting) {
  if (!isObject(meeting)) return null;
  return meeting.storageHome === TABLE_HOME ? MEETING_HOME.TABLE : MEETING_HOME.EMBEDDED;
}

export function isTableResident(meeting) {
  return meetingHome(meeting) === MEETING_HOME.TABLE;
}

// Split a mixed list by home. Returns new arrays; the input is never mutated.
export function partitionByHome(meetings) {
  const list = Array.isArray(meetings) ? meetings : [];
  return {
    embedded: list.filter(m => isObject(m) && !isTableResident(m)),
    table: list.filter(isTableResident),
  };
}

// Everything known about one case's meetings, for READING only.
//
// Returns a plain array, deliberately NOT assigned to `case.meetings` by this
// function and never to be assigned to it by a caller. Embedded meetings first,
// preserving their existing array order — several readers still depend on
// position (prevMeetings ordering, NotetakerView's "last meeting on the case"),
// and reordering them would change behaviour no one asked to change.
export function meetingsForCase(caseObj, tableMeetings = []) {
  const embedded = Array.isArray(caseObj?.meetings) ? caseObj.meetings : [];
  const caseId = caseObj?.id ?? null;
  const linked = (Array.isArray(tableMeetings) ? tableMeetings : [])
    .filter(m => isTableResident(m) && caseId !== null && m.caseId === caseId);
  return [...embedded, ...linked];
}

// Every meeting an authorised user can see, across both homes, with no case
// scoping. The read contract 4C.2's discovery surface is built on.
//
// Standalone meetings (caseId null) are included; table-resident meetings that
// are linked appear once, from the table, and never from cases.meetings —
// because the invariant guarantees they are not in there.
export function allKnownMeetings(cases = [], tableMeetings = []) {
  const embedded = (Array.isArray(cases) ? cases : []).flatMap(cs =>
    (Array.isArray(cs?.meetings) ? cs.meetings : [])
      .filter(isObject)
      .map(m => ({ ...m, caseId: m.caseId ?? cs?.id ?? null }))
  );
  const table = (Array.isArray(tableMeetings) ? tableMeetings : []).filter(isTableResident);
  return [...embedded, ...table];
}

// ── The persistence boundary ───────────────────────────────────────────────

// Thrown rather than returned. A contaminated array reaching the database is a
// data-integrity failure, not a recoverable condition, and a caller that ignored
// a boolean would persist the duplicate anyway. Loud beats quiet here.
export class TableResidentInCaseError extends Error {
  constructor(ids) {
    super(
      `cases.meetings cannot contain table-resident meeting(s): ${ids.join(", ")}. ` +
      `A meeting has one authoritative storage home; see lib/meetingStore.js.`
    );
    this.name = "TableResidentInCaseError";
    this.meetingIds = ids;
  }
}

// The guard for the write path. Call it with whatever is about to be persisted
// into cases.meetings.
export function assertNoTableResident(meetings) {
  const contaminated = (Array.isArray(meetings) ? meetings : []).filter(isTableResident);
  if (contaminated.length > 0) {
    throw new TableResidentInCaseError(contaminated.map(m => m?.id ?? "<no id>"));
  }
  return meetings;
}

// The case object as it should be written to the database.
//
// Belt and braces, in that order: it STRIPS any table-resident meeting (so a
// mistake upstream cannot corrupt the column) and the caller can additionally
// assert. Returns the identical reference when there is nothing to strip, so it
// is free to call on every write and changes no existing behaviour for a case
// that has only embedded meetings — which today is every case in production.
export function caseForPersistence(caseObj) {
  if (!isObject(caseObj)) return caseObj;
  const meetings = Array.isArray(caseObj.meetings) ? caseObj.meetings : null;
  if (!meetings || !meetings.some(isTableResident)) return caseObj;
  return { ...caseObj, meetings: meetings.filter(m => !isTableResident(m)) };
}
