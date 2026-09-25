// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — standalone meeting eligibility and row shape.
// Phase 4C.1.
//
// Answers two questions and no others:
//   1. "May a meeting of this type exist without a case?"
//   2. "How does a public.meetings row correspond to a meeting object?"
//
// It does NOT answer "what state is this meeting in?" (meetingLifecycle.js),
// "may this write proceed?" (meetingWrites.js), or "where does this meeting
// live?" (meetingStore.js). Keep those apart.
//
// THE ELIGIBLE SET IS NOT RESTATED HERE. meetingCaseRequirement.js already owns
// it (STANDALONE_INTENDED_TYPES, approved 2026-09-25) and this module delegates,
// so there is exactly one list in the codebase. The database's own CHECK
// constraint is the third copy of that fact by necessity — SQL cannot import
// JavaScript — which is why a test asserts the two agree rather than trusting
// them to.
// ─────────────────────────────────────────────────────────────────────────

import { isStandaloneIntended, caseRequirement, CASE_REQUIREMENT } from './meetingCaseRequirement.js';
import { MEETING_STATUS } from './meetingLifecycle.js';

// Why a standalone create was refused. Parallel in spirit to
// meetingWrites.js's WRITE_FAILURE: a named reason, never a bare false, so the
// caller can say something true to the user.
export const STANDALONE_REFUSAL = Object.freeze({
  // No type at all — nothing to classify.
  TYPE_REQUIRED: "type_required",
  // The type inherently belongs to a formal case: a hearing follows a process,
  // an appeal follows an outcome. Permanent, not a limitation.
  CASE_REQUIRED: "case_required",
  // Deliberately undecided (formal, grievance) or on its own legacy path (the
  // dev group, see NEW-20 FULL). Not eligible, and not claimed to be forbidden.
  NOT_YET_CLASSIFIED: "not_yet_classified",
  // Missing tenancy or creator — a standalone meeting has no case to inherit
  // either from, so both must be supplied explicitly.
  ORG_REQUIRED: "org_required",
  CREATOR_REQUIRED: "creator_required",
});

const isNonEmptyString = v => typeof v === "string" && v.trim().length > 0;

// May a meeting of this type be created with no parent case?
//
// Deliberately narrower than "is it not CASE_REQUIRED". A type Compass has not
// yet classified (formal, grievance) is not eligible either — the honest
// position, since we are not asserting anything about it in either direction.
export function isStandaloneEligible(meetingTypeId) {
  return isStandaloneIntended(meetingTypeId);
}

// The eligible set, for tests and for the one place that needs to compare
// itself against the database CHECK constraint. Frozen; derived, not retyped.
export const STANDALONE_ELIGIBLE_TYPE_IDS = Object.freeze(
  ["informal", "return", "investigation"].filter(isStandaloneIntended)
);

// Can this standalone meeting be created, and if not, why?
//
// Pure. Performs no write, touches no network, and never consults an employee
// name — parentage and tenancy arrive as explicit ids or they do not arrive.
export function planStandaloneCreate({ meetingTypeId, orgId, createdBy }) {
  if (!isNonEmptyString(meetingTypeId)) {
    return { ok: false, reason: STANDALONE_REFUSAL.TYPE_REQUIRED };
  }
  if (!isStandaloneEligible(meetingTypeId)) {
    const requirement = caseRequirement(meetingTypeId);
    return {
      ok: false,
      reason: requirement === CASE_REQUIREMENT.REQUIRED
        ? STANDALONE_REFUSAL.CASE_REQUIRED
        : STANDALONE_REFUSAL.NOT_YET_CLASSIFIED,
    };
  }
  if (!isNonEmptyString(orgId)) return { ok: false, reason: STANDALONE_REFUSAL.ORG_REQUIRED };
  if (!isNonEmptyString(createdBy)) return { ok: false, reason: STANDALONE_REFUSAL.CREATOR_REQUIRED };
  return { ok: true, meetingTypeId, orgId, createdBy };
}

// ── Row ↔ object mapping ───────────────────────────────────────────────────
//
// The app speaks camelCase meeting objects; the table speaks snake_case columns.
// One mapping, both directions, so no call site invents its own.
//
// Note what is NOT mapped: there is no `invitation` field. The audit established
// that the embedded `invitation` key is initialised to null and never written by
// anything, and that real invitation truth is a separate letter-shaped entry
// carrying letterType:'invite'. Inventing a peer column here because it would be
// tidier would fabricate a model the application does not have. 4C.4 owns how
// invitation truth attaches to a table-resident meeting.

// Marks a meeting object as table-resident. meetingStore.js reads this to keep
// it out of cases.meetings; nothing else should branch on it.
export const TABLE_HOME = "meetings_table";

export function meetingRowToObject(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id,
    // caseId is the authoritative parentage field, exactly as meetingWrites.js
    // restates it on every embedded write. null means standalone.
    caseId: row.case_id ?? null,
    orgId: row.org_id ?? null,
    storageHome: TABLE_HOME,
    meetingTypeId: row.meeting_type_id ?? null,
    status: row.status ?? null,
    employeeName: row.employee_name ?? null,
    employeeEmail: row.employee_email ?? null,
    manager: row.manager ?? null,
    chairUserId: row.chair_user_id ?? null,
    participants: Array.isArray(row.participants) ? row.participants : [],
    transcript: Array.isArray(row.transcript) ? row.transcript : [],
    record: row.record ?? null,
    advisorNotes: row.advisor_notes ?? null,
    summary: row.summary ?? null,
    risk: row.risk ?? null,
    reviewDraft: row.review_draft ?? null,
    schedule: row.schedule ?? null,
    calendar: row.calendar ?? null,
    preparation: row.preparation ?? null,
    nextSteps: Array.isArray(row.next_steps) ? row.next_steps : [],
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancelledBy: row.cancelled_by ?? null,
    cancelledReason: row.cancelled_reason ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    linkedAt: row.linked_at ?? null,
    linkedBy: row.linked_by ?? null,
  };
}

// The insertable column set for a NEW standalone meeting.
//
// case_id, linked_at and linked_by are absent by construction, not filtered out:
// a meeting is born standalone (the database trigger rejects an insert carrying
// a case_id), and link provenance is stamped only by the permitted fill. Omitting
// them here means no caller can accidentally supply one.
export function newStandaloneMeetingRow({
  id, orgId, createdBy, meetingTypeId,
  status = MEETING_STATUS.SCHEDULED,
  employeeName = null, employeeEmail = null, manager = null, chairUserId = null,
  participants = [], schedule = null, preparation = null, startedAt = null,
}) {
  return {
    id,
    org_id: orgId,
    meeting_type_id: meetingTypeId,
    status,
    employee_name: employeeName,
    employee_email: employeeEmail,
    manager,
    chair_user_id: chairUserId,
    participants,
    transcript: [],
    schedule,
    preparation,
    started_at: startedAt,
    created_by: createdBy,
  };
}

// The patchable column set. Deliberately an allow-list rather than a
// camel-to-snake transform of whatever the caller passed: id, org_id, case_id,
// created_by, created_at, linked_at and linked_by are all immutable or
// trigger-owned, and an allow-list cannot be tricked into offering them.
const PATCHABLE = Object.freeze({
  status: "status",
  employeeName: "employee_name",
  employeeEmail: "employee_email",
  manager: "manager",
  chairUserId: "chair_user_id",
  participants: "participants",
  transcript: "transcript",
  record: "record",
  advisorNotes: "advisor_notes",
  summary: "summary",
  risk: "risk",
  reviewDraft: "review_draft",
  schedule: "schedule",
  calendar: "calendar",
  preparation: "preparation",
  nextSteps: "next_steps",
  startedAt: "started_at",
  endedAt: "ended_at",
  cancelledAt: "cancelled_at",
  cancelledBy: "cancelled_by",
  cancelledReason: "cancelled_reason",
});

export function meetingPatchToRow(patch) {
  const source = patch && typeof patch === "object" ? patch : {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => Object.hasOwn(PATCHABLE, key))
      .map(([key, value]) => [PATCHABLE[key], value])
  );
}

// The only field a link may change, plus its provenance. Exposed as its own
// builder so 4C.5 cannot express a link as a general patch — the shape of the
// operation is the guarantee that nothing else travels with it.
export function linkToCaseRow(caseId) {
  return { case_id: caseId };
}
