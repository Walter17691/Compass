// Phase E1.6 — writing Employee Activities.
//
// Plain inserts and conditional updates, not RPCs. Everything an RPC would have
// been needed for is already handled by the database:
//   * authorisation — RLS inherits the employee boundary;
//   * tenancy and parentage — composite foreign keys;
//   * audit — an AFTER trigger writes audit_log, so no code path can forget to;
//   * updated_at — a BEFORE trigger sets it server-side.
//
// So this module carries no authorisation logic of its own. A second, client-side
// copy of an access rule is a rule that can drift, and the weaker copy is the one
// people end up trusting.

import { conditionalUpdate } from './optimisticSave.js';

export const ACTIVITY_RESULT = {
  OK: "ok",
  CONFLICT: "conflict",
  REFUSED: "refused",
  INVALID: "invalid",
};

// PostgREST surfaces an RLS refusal on INSERT as 42501, and a CHECK violation as
// 23514 — for example a 1:1 submitted as "resolved", which the database refuses
// to store at all.
function classify(error) {
  if (!error) return ACTIVITY_RESULT.OK;
  return ACTIVITY_RESULT.REFUSED;
}

// Create one activity.
//
// `occurredAt` is when it HAPPENED and may be in the past — that is the whole
// point of recording a conversation from last week. created_at is set by the
// database and is never back-dated to simulate history.
//
// The caller supplies exactly one of lifecycleState / concernState, matching the
// type. Passing the wrong one is refused by the database, not smoothed over here.
export async function createEmployeeActivity({
  supabase, orgId, employeeId, activityType, title,
  lifecycleState = null, concernState = null,
  occurredAt, locationId = null, managerName = null, followUpDate = null, recordedBy,
}) {
  if (!supabase || !orgId || !employeeId || !activityType || !occurredAt || !recordedBy) {
    return { result: ACTIVITY_RESULT.INVALID };
  }
  try {
    const { data, error } = await supabase.from('employee_activities').insert({
      org_id: orgId,
      employee_id: employeeId,
      activity_type: activityType,
      title: title || null,
      lifecycle_state: lifecycleState,
      concern_state: concernState,
      occurred_at: occurredAt,
      location_id: locationId || null,
      manager_name: managerName || null,
      follow_up_date: followUpDate || null,
      recorded_by: recordedBy,
    }).select().single();
    if (error) return { result: classify(error), error };
    return { result: ACTIVITY_RESULT.OK, activity: data };
  } catch (e) {
    return { result: ACTIVITY_RESULT.REFUSED, error: e };
  }
}

// Add one entry to an activity's chronology. org_id and employee_id are carried
// so the database's composite foreign key can verify they match the parent — a
// record cannot belong to one employee while its activity belongs to another.
export async function addActivityRecord({
  supabase, activityId, orgId, employeeId, recordType, occurredAt, body, recordedBy,
}) {
  if (!supabase || !activityId || !orgId || !employeeId || !recordType || !occurredAt || !recordedBy) {
    return { result: ACTIVITY_RESULT.INVALID };
  }
  try {
    const { data, error } = await supabase.from('employee_activity_records').insert({
      activity_id: activityId,
      org_id: orgId,
      employee_id: employeeId,
      record_type: recordType,
      occurred_at: occurredAt,
      body: body || null,
      recorded_by: recordedBy,
    }).select().single();
    if (error) return { result: classify(error), error };
    return { result: ACTIVITY_RESULT.OK, record: data };
  } catch (e) {
    return { result: ACTIVITY_RESULT.REFUSED, error: e };
  }
}

// Update an activity, conditional on the version the caller last read.
//
// Two managers editing the same employment-history record must not silently
// overwrite each other, and the loser must be told. Uses the project's existing
// conditionalUpdate rather than a second implementation.
export async function updateEmployeeActivity({ supabase, activityId, updatedAt, patch }) {
  if (!supabase || !activityId || !patch) return { result: ACTIVITY_RESULT.INVALID };
  const { error, conflict } = await conditionalUpdate(
    supabase, 'employee_activities', activityId, updatedAt, patch);
  if (conflict) return { result: ACTIVITY_RESULT.CONFLICT };
  if (error) return { result: ACTIVITY_RESULT.REFUSED, error };
  return { result: ACTIVITY_RESULT.OK };
}

// Resolve a management concern.
//
// resolved_at is set in the same statement because the database refuses a
// resolved concern without one — resolution and its timestamp are one fact.
// History is NOT deleted: the chronology stays exactly as it was.
export async function resolveManagementConcern({ supabase, activityId, updatedAt, resolvedBy, now }) {
  if (!supabase || !activityId || !resolvedBy) return { result: ACTIVITY_RESULT.INVALID };
  return updateEmployeeActivity({
    supabase, activityId, updatedAt,
    patch: {
      concern_state: 'resolved',
      resolved_at: (now || new Date()).toISOString(),
      resolved_by: resolvedBy,
    },
  });
}

export async function setActivityFollowUp({ supabase, activityId, updatedAt, followUpDate }) {
  return updateEmployeeActivity({
    supabase, activityId, updatedAt,
    patch: { follow_up_date: followUpDate || null },
  });
}

// What to tell the user. A lost race is not a mistake they made.
export function describeActivityOutcome({ result, error }) {
  switch (result) {
    case ACTIVITY_RESULT.OK:
      return { tone: "success", message: "Recorded." };
    case ACTIVITY_RESULT.CONFLICT:
      return { tone: "error", message: "Someone else updated this record while you were editing. Their change stands — reopen it to see the current version." };
    case ACTIVITY_RESULT.INVALID:
      return { tone: "error", message: "Compass couldn't tell what to record." };
    default:
      return { tone: "error", message: error?.message || "Couldn't save this record." };
  }
}

// Row → camelCase. Kept beside the writes so the two never disagree about shape.
export function mapActivityRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    employeeId: row.employee_id,
    activityType: row.activity_type,
    title: row.title || "",
    lifecycleState: row.lifecycle_state || null,
    concernState: row.concern_state || null,
    occurredAt: row.occurred_at || null,
    locationId: row.location_id || null,
    recordedBy: row.recorded_by || null,
    managerName: row.manager_name || "",
    followUpDate: row.follow_up_date || null,
    resolvedAt: row.resolved_at || null,
    resolvedBy: row.resolved_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function mapActivityRecordRow(row) {
  return {
    id: row.id,
    activityId: row.activity_id,
    orgId: row.org_id,
    employeeId: row.employee_id,
    recordType: row.record_type,
    occurredAt: row.occurred_at || null,
    body: row.body || "",
    recordedBy: row.recorded_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}
