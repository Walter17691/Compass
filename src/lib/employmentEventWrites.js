// Phase E1.7 — writing Employment Events.
//
// Plain inserts and conditional updates. Authorisation, tenancy, parentage, the
// old/new value rules, the "already effective cannot be rewritten" rule and audit
// are all enforced by the database, so this module re-checks none of them: a
// second client-side copy of a rule is the copy that drifts.
//
// One thing it does NOT do: write the new value into employee_records. That is
// the whole architecture. Current state is resolved from the base record plus
// effective events, so a future change must never be applied early — and applying
// it "now" for a same-day change would just be the same mutation with a shorter
// fuse.

import { conditionalUpdate } from './optimisticSave.js';

export const EVENT_RESULT = {
  OK: "ok",
  CONFLICT: "conflict",
  REFUSED: "refused",
  INVALID: "invalid",
};

// Record one employment change.
//
// oldText/oldLocationId are captured by the CALLER from the employee's current
// effective state, so the event says what it actually changed from rather than
// what the record happened to hold when someone later read it.
export async function recordEmploymentEvent({
  supabase, orgId, employeeId, eventType, effectiveDate,
  oldText = null, newText = null, oldLocationId = null, newLocationId = null,
  note = null, documentationStatus = 'not_required', recordedBy,
}) {
  if (!supabase || !orgId || !employeeId || !eventType || !effectiveDate || !recordedBy) {
    return { result: EVENT_RESULT.INVALID };
  }
  try {
    const { data, error } = await supabase.from('employee_employment_events').insert({
      org_id: orgId,
      employee_id: employeeId,
      event_type: eventType,
      // A plain YYYY-MM-DD string into a DATE column: no instant, no timezone.
      effective_date: effectiveDate,
      old_text: oldText || null,
      new_text: newText || null,
      old_location_id: oldLocationId || null,
      new_location_id: newLocationId || null,
      note: note || null,
      documentation_status: documentationStatus,
      recorded_by: recordedBy,
    }).select().single();
    if (error) return { result: EVENT_RESULT.REFUSED, error };
    return { result: EVENT_RESULT.OK, event: data };
  } catch (e) {
    return { result: EVENT_RESULT.REFUSED, error: e };
  }
}

// Mark an employee as a leaver. An effective-dated employment-ending event and
// nothing else: no row is moved, nothing is copied, nothing is deleted, and the
// employee stays current until the date arrives.
export async function markEmployeeAsLeaver({
  supabase, orgId, employeeId, leavingDate, note = null,
  documentationStatus = 'not_required', recordedBy,
}) {
  return recordEmploymentEvent({
    supabase, orgId, employeeId,
    eventType: 'employment_ended',
    effectiveDate: leavingDate,
    note, documentationStatus, recordedBy,
  });
}

// Correct a FUTURE event. The database refuses this once the event has taken
// effect, so there is no client-side date check to get wrong.
export async function correctEmploymentEvent({ supabase, eventId, updatedAt, patch }) {
  if (!supabase || !eventId || !patch) return { result: EVENT_RESULT.INVALID };
  const { error, conflict } = await conditionalUpdate(
    supabase, 'employee_employment_events', eventId, updatedAt, patch);
  if (conflict) return { result: EVENT_RESULT.CONFLICT };
  if (error) return { result: EVENT_RESULT.REFUSED, error };
  return { result: EVENT_RESULT.OK };
}

// Cancel an event recorded in error. NOT a delete: the row stays, says it was
// cancelled, carries who cancelled it and why, and stops counting toward current
// state. Reinstating is refused by the database, because un-cancelling would make
// the audit trail a lie.
export async function cancelEmploymentEvent({ supabase, eventId, updatedAt, cancelledBy, reason, now }) {
  if (!supabase || !eventId || !cancelledBy) return { result: EVENT_RESULT.INVALID };
  return correctEmploymentEvent({
    supabase, eventId, updatedAt,
    patch: {
      cancelled_at: (now || new Date()).toISOString(),
      cancelled_by: cancelledBy,
      cancellation_reason: reason || null,
    },
  });
}

export async function setDocumentationStatus({ supabase, eventId, updatedAt, documentationStatus }) {
  return correctEmploymentEvent({
    supabase, eventId, updatedAt,
    patch: { documentation_status: documentationStatus },
  });
}

export function describeEventOutcome({ result, error }) {
  switch (result) {
    case EVENT_RESULT.OK:
      return { tone: "success", message: "Recorded." };
    case EVENT_RESULT.CONFLICT:
      return { tone: "error", message: "Someone else updated this record while you were editing. Their change stands — reopen it to see the current version." };
    case EVENT_RESULT.INVALID:
      return { tone: "error", message: "Compass couldn't tell what to record." };
    default:
      return { tone: "error", message: error?.message || "Couldn't record this employment change." };
  }
}
