// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — writing table-resident meetings. Phase 4C.3.
//
// The public.meetings counterpart of meetingWrites.js. Same decision semantics,
// different substrate: where meetingWrites resolves a meeting by finding its case
// and indexing into cases.meetings, this one addresses a row by its stable id.
//
// It deliberately does NOT reimplement the lifecycle. The allowed-from / to-status
// contract is the same one transitionMeeting uses, with the same vocabulary from
// meetingLifecycle.js, because there is ONE meeting lifecycle and two storage
// homes — not two lifecycles.
//
// ┌─ IDEMPOTENCY IS STRUCTURAL, NOT HOPEFUL ───────────────────────────────┐
// │ Start mints its id ONCE (the caller holds it across retries) and lets    │
// │ the primary key reject a duplicate: a unique violation means "this       │
// │ meeting already exists", which is success, not failure. A transition     │
// │ filters on the statuses it is allowed to move FROM, so a second End      │
// │ matches zero rows and is reported as already-ended rather than           │
// │ restamping ended_at.                                                     │
// │                                                                          │
// │ That is what makes a double-click, a retried network call and a refresh  │
// │ mid-flight all safe without a lock or a client-side "submitting" flag.   │
// └────────────────────────────────────────────────────────────────────────┘
//
// RLS is the access boundary. Nothing here checks who the caller is; a rejected
// write comes back as DENIED and is reported without revealing whether the row
// exists, so a failed write cannot be used to probe another tenant.
// ─────────────────────────────────────────────────────────────────────────

import { MEETINGS_TABLE } from './meetingTableGateway.js';
import { meetingRowToObject, newStandaloneMeetingRow, meetingPatchToRow, planStandaloneCreate } from './standaloneMeetings.js';
import { MEETING_STATUS } from './meetingLifecycle.js';

export const STANDALONE_WRITE = Object.freeze({
  OK: "ok",
  // The meeting already existed with this id — the retry case, and a success.
  ALREADY_EXISTS: "already_exists",
  // The transition was a no-op because the meeting is already in the target
  // state. Writes nothing, reports success, never restamps a timestamp.
  ALREADY_IN_STATE: "already_in_state",
});

export const STANDALONE_FAILURE = Object.freeze({
  NOT_ELIGIBLE: "not_eligible",
  ORG_REQUIRED: "org_required",
  CREATOR_REQUIRED: "creator_required",
  ID_REQUIRED: "id_required",
  NO_CLIENT: "no_client",
  // RLS refused, or the row is not visible to this caller. Deliberately the same
  // answer either way.
  DENIED: "denied",
  NOT_FOUND: "not_found",
  // The meeting exists and is visible but is not in a state this transition may
  // move from — the equivalent of meetingWrites' STALE_STATUS.
  STALE_STATUS: "stale_status",
  ERROR: "error",
});

// Every column, for the paths that genuinely need content (Resume, Review).
// Discovery uses the narrower DISCOVERY_COLUMNS in meetingTableGateway.js.
export const FULL_COLUMNS = "*";

const PG_UNIQUE_VIOLATION = "23505";
const PG_RLS_VIOLATION = "42501";
const isNonEmptyString = v => typeof v === "string" && v.trim().length > 0;

function classifyError(error) {
  if (!error) return STANDALONE_FAILURE.ERROR;
  if (error.code === PG_RLS_VIOLATION) return STANDALONE_FAILURE.DENIED;
  return STANDALONE_FAILURE.ERROR;
}

// ── Start ──────────────────────────────────────────────────────────────────
//
// Creates the authoritative row. The id is supplied by the caller — minted once
// with newId('meeting') and held across retries — so this function can be called
// twice with the same id and produce one meeting.
//
// case_id is not a parameter. A meeting born here is standalone by definition,
// and the database trigger rejects an insert that carries a case.
export async function startStandaloneMeeting(client, {
  id, orgId, createdBy, meetingTypeId,
  employeeName = null, employeeEmail = null, manager = null, chairUserId = null,
  participants = [], startedAt,
} = {}) {
  if (!client) return { ok: false, reason: STANDALONE_FAILURE.NO_CLIENT };
  if (!isNonEmptyString(id)) return { ok: false, reason: STANDALONE_FAILURE.ID_REQUIRED };

  // The single eligibility gate, shared with the UI so the two cannot disagree.
  const plan = planStandaloneCreate({ meetingTypeId, orgId, createdBy });
  if (!plan.ok) {
    return {
      ok: false,
      reason: plan.reason === "org_required" ? STANDALONE_FAILURE.ORG_REQUIRED
        : plan.reason === "creator_required" ? STANDALONE_FAILURE.CREATOR_REQUIRED
        : STANDALONE_FAILURE.NOT_ELIGIBLE,
    };
  }

  const row = newStandaloneMeetingRow({
    id, orgId, createdBy, meetingTypeId,
    status: MEETING_STATUS.IN_PROGRESS,
    employeeName, employeeEmail, manager, chairUserId, participants,
    startedAt: startedAt || new Date().toISOString(),
  });

  try {
    const { data, error } = await client.from(MEETINGS_TABLE).insert(row).select(FULL_COLUMNS).single();
    if (error) {
      if (error.code === PG_UNIQUE_VIOLATION) {
        // The retry case. Whatever is already stored is authoritative — in
        // particular its started_at, which must not be recomputed.
        const existing = await fetchStandaloneMeeting(client, id);
        return existing.ok
          ? { ok: true, outcome: STANDALONE_WRITE.ALREADY_EXISTS, meeting: existing.meeting }
          : existing;
      }
      console.error('Could not start standalone meeting:', error.message);
      return { ok: false, reason: classifyError(error) };
    }
    return { ok: true, outcome: STANDALONE_WRITE.OK, meeting: meetingRowToObject(data) };
  } catch (e) {
    console.error('Could not start standalone meeting:', e?.message || e);
    return { ok: false, reason: STANDALONE_FAILURE.ERROR };
  }
}

// ── Read ───────────────────────────────────────────────────────────────────
//
// NOT_FOUND is returned both for a row that does not exist and for one RLS
// hides, on purpose: a caller must not be able to tell the difference.
export async function fetchStandaloneMeeting(client, id) {
  if (!client) return { ok: false, reason: STANDALONE_FAILURE.NO_CLIENT };
  if (!isNonEmptyString(id)) return { ok: false, reason: STANDALONE_FAILURE.ID_REQUIRED };
  try {
    const { data, error } = await client.from(MEETINGS_TABLE).select(FULL_COLUMNS).eq("id", id).maybeSingle();
    if (error) {
      console.error('Could not load standalone meeting:', error.message);
      return { ok: false, reason: classifyError(error) };
    }
    if (!data) return { ok: false, reason: STANDALONE_FAILURE.NOT_FOUND };
    return { ok: true, meeting: meetingRowToObject(data) };
  } catch (e) {
    console.error('Could not load standalone meeting:', e?.message || e);
    return { ok: false, reason: STANDALONE_FAILURE.ERROR };
  }
}

// ── Transition ─────────────────────────────────────────────────────────────
//
// The conditional UPDATE is the whole mechanism: filtering on `status IN
// (allowedFrom)` means a meeting that has already moved on matches zero rows, so
// a duplicate End cannot rewrite ended_at and a stale client cannot drag a
// completed meeting backwards.
//
// Zero rows is then disambiguated by reading the row back — already in the
// target state is idempotent success; anything else is STALE_STATUS; invisible
// is NOT_FOUND.
export async function transitionStandaloneMeeting(client, { id, allowedFrom, toStatus, patch = {} } = {}) {
  if (!client) return { ok: false, reason: STANDALONE_FAILURE.NO_CLIENT };
  if (!isNonEmptyString(id)) return { ok: false, reason: STANDALONE_FAILURE.ID_REQUIRED };
  const from = Array.isArray(allowedFrom) ? allowedFrom : [allowedFrom];

  try {
    const { data, error } = await client
      .from(MEETINGS_TABLE)
      // status is restated last so a patch payload can never set it to something
      // other than the transition's declared target.
      .update({ ...meetingPatchToRow(patch), status: toStatus })
      .eq("id", id)
      .in("status", from)
      .select(FULL_COLUMNS);
    if (error) {
      console.error('Could not transition standalone meeting:', error.message);
      return { ok: false, reason: classifyError(error) };
    }
    if (Array.isArray(data) && data.length === 1) {
      return { ok: true, outcome: STANDALONE_WRITE.OK, meeting: meetingRowToObject(data[0]) };
    }
    // Zero rows: either already there, or not in an allowed state, or not ours.
    const current = await fetchStandaloneMeeting(client, id);
    if (!current.ok) return current;
    if (current.meeting.status === toStatus) {
      return { ok: true, outcome: STANDALONE_WRITE.ALREADY_IN_STATE, meeting: current.meeting };
    }
    return { ok: false, reason: STANDALONE_FAILURE.STALE_STATUS, meeting: current.meeting };
  } catch (e) {
    console.error('Could not transition standalone meeting:', e?.message || e);
    return { ok: false, reason: STANDALONE_FAILURE.ERROR };
  }
}

// ── End ────────────────────────────────────────────────────────────────────
//
// in_progress -> review_draft, stamping ended_at and the transcript.
//
// NEW-29 semantics are preserved structurally rather than by convention:
// started_at is not in the patch allow-list at all, so no End, Resume or retry
// can restamp it; and because the transition only matches an in_progress row, a
// second End writes nothing and reports ALREADY_IN_STATE rather than moving
// ended_at.
export async function endStandaloneMeeting(client, { id, endedAt, transcript } = {}) {
  return transitionStandaloneMeeting(client, {
    id,
    allowedFrom: [MEETING_STATUS.IN_PROGRESS],
    toStatus: MEETING_STATUS.REVIEW_DRAFT,
    patch: {
      endedAt: endedAt || new Date().toISOString(),
      ...(Array.isArray(transcript) ? { transcript } : {}),
    },
  });
}

// ── Live notes ─────────────────────────────────────────────────────────────
//
// in_progress -> in_progress, carrying the transcript so far.
//
// WHY THIS EXISTS. Until Phase 4C.3's refresh defect, live notes were held in
// React state and mirrored to a localStorage draft, and only reached the database
// at End. For an embedded meeting that was survivable because the crash-recovery
// draft could be matched against the case. For a table-resident meeting it meant
// localStorage was the SOLE store for the conversation until End — and human UAT
// proved the consequence: a reload lost two typed notes outright.
//
// A self-transition, so it shares the property that matters: it can never move
// the meeting's state. If the meeting has already ended, the allowed-from filter
// matches nothing and the late write is refused rather than resurrecting it.
export async function persistStandaloneTranscript(client, { id, transcript } = {}) {
  return transitionStandaloneMeeting(client, {
    id,
    allowedFrom: [MEETING_STATUS.IN_PROGRESS],
    toStatus: MEETING_STATUS.IN_PROGRESS,
    patch: { transcript: Array.isArray(transcript) ? transcript : [] },
  });
}

// ── Review draft ───────────────────────────────────────────────────────────
//
// review_draft -> review_draft. Same shape as the embedded path's
// persistReviewDraft: a self-transition, so a draft can never be autosaved onto
// a meeting that has already left review, and autosave can never complete a
// meeting as a side effect.
export async function persistStandaloneReviewDraft(client, { id, reviewDraft } = {}) {
  return transitionStandaloneMeeting(client, {
    id,
    allowedFrom: [MEETING_STATUS.REVIEW_DRAFT],
    toStatus: MEETING_STATUS.REVIEW_DRAFT,
    patch: { reviewDraft },
  });
}

// User-facing copy. Never names a table, a column, a policy, or whether a
// meeting exists.
export function describeStandaloneFailure(reason) {
  switch (reason) {
    case STANDALONE_FAILURE.NOT_ELIGIBLE:
      return "This kind of meeting has to be part of a case. Link it to a case first.";
    case STANDALONE_FAILURE.ORG_REQUIRED:
      return "Select an organisation before starting a meeting.";
    case STANDALONE_FAILURE.CREATOR_REQUIRED:
      return "Sign in again before starting a meeting — Compass couldn't confirm who you are.";
    case STANDALONE_FAILURE.STALE_STATUS:
      return "This meeting has already moved on. Open it again to see where it is now.";
    case STANDALONE_FAILURE.DENIED:
    case STANDALONE_FAILURE.NOT_FOUND:
      return "That meeting isn't available to you.";
    case STANDALONE_FAILURE.ID_REQUIRED:
    case STANDALONE_FAILURE.NO_CLIENT:
    case STANDALONE_FAILURE.ERROR:
    default:
      return "Couldn't save the meeting just now. Your notes have been kept — try again in a moment.";
  }
}
