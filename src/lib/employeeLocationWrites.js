// Phase E1.5 — the canonical employee-location write.
//
// Same shape as reconciliationWrites.js, and for the same reason: every
// precondition (authenticated, HR role, same organisation, the location actually
// belongs to that organisation, nothing changed underneath) is checked inside the
// security definer RPC, and this module deliberately re-checks NONE of them. A
// second, client-side copy of an authorisation rule is a rule that can drift out
// of step with the real one, and the weaker copy always wins the argument in
// someone's head.
//
// It goes through an RPC rather than a plain UPDATE because the assignment and
// its audit row have to be one transaction. audit_log has no INSERT policy at
// all, so the client cannot write that row — and an assignment whose audit trail
// might be missing is not acceptable for a field that decides who can see a
// person.

export const LOCATION_RESULT = {
  OK: "ok",
  CONFLICT: "conflict",
  UNCHANGED: "unchanged",
  REFUSED: "refused",
  INVALID: "invalid",
};

// PT409 is the project's established signal for "somebody else got there first"
// (correct_case_employee uses the same code). Matched on the code first and the
// message only as a fallback, because the message is the part that gets reworded.
function isConflict(error) {
  return error?.code === "PT409"
    || /changed while you were/i.test(error?.message || "");
}

function isUnchanged(error) {
  return /already assigned to that location/i.test(error?.message || "");
}

// Assign, change, or clear ONE employee's canonical location.
//
// `expectedUpdatedAt` is the updated_at the caller last saw. Passing it is what
// stops HR user A silently overwriting HR user B's assignment: the RPC refuses
// if the row has moved since. Passing null means "no version known", which the
// RPC treats as an unconditional write — callers holding a loaded record should
// always pass its updatedAt.
//
// locationId may be null: that returns the employee to unassigned, which NARROWS
// who can see them, and HR must be able to undo a mistake.
export async function setEmployeeLocationWrite({ supabase, employeeId, locationId, expectedUpdatedAt }) {
  if (!supabase || !employeeId) {
    return { result: LOCATION_RESULT.INVALID };
  }
  try {
    const { error } = await supabase.rpc("set_employee_location", {
      p_employee_id: employeeId,
      p_location_id: locationId || null,
      p_expected_updated_at: expectedUpdatedAt || null,
    });
    if (!error) return { result: LOCATION_RESULT.OK };
    if (isConflict(error)) return { result: LOCATION_RESULT.CONFLICT, error };
    if (isUnchanged(error)) return { result: LOCATION_RESULT.UNCHANGED, error };
    return { result: LOCATION_RESULT.REFUSED, error };
  } catch (e) {
    return { result: LOCATION_RESULT.REFUSED, error: e };
  }
}

// What to tell the user. A concurrent assignment is not a mistake the user made
// and must not read like one; a refusal says what to do next rather than
// restating a Postgres error.
export function describeLocationOutcome({ result, error }, locationName = "") {
  switch (result) {
    case LOCATION_RESULT.OK:
      return locationName
        ? { tone: "success", message: `Location set to ${locationName}.` }
        : { tone: "success", message: "Location cleared — this employee is unassigned again." };
    case LOCATION_RESULT.UNCHANGED:
      return { tone: "info", message: "That is already this employee's location." };
    case LOCATION_RESULT.CONFLICT:
      return { tone: "error", message: "Someone else updated this employee while you were choosing. Their change stands — reopen the record to see it." };
    case LOCATION_RESULT.INVALID:
      return { tone: "error", message: "Compass couldn't tell which employee to update." };
    default:
      return { tone: "error", message: error?.message || "Couldn't set the location." };
  }
}
