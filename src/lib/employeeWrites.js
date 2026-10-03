// ─────────────────────────────────────────────────────────────────────────
// THE ONE manual employee-creation write.
//
// Same reasons as reconciliationWrites.js and caseDecisionWrites.js: a real
// exported function with an injected client is directly testable, and App.jsx's
// React Compiler analysis degrades as callees are added.
//
// ┌─ INSERT, NEVER UPSERT ──────────────────────────────────────────────────┐
// │ Manual creation used to run through an UPSERT with conflict target       │
// │ (org_id, name). That meant submitting a name which already existed        │
// │ silently UPDATED that person — and because the payload can carry          │
// │ location_id, it could move an existing employee between permission        │
// │ scopes with no audit row, which is precisely what                         │
// │ protect_employee_location_column exists to prevent.                       │
// │                                                                          │
// │ A matching name is not a reason to merge two people. So this INSERTs and  │
// │ lets UNIQUE(org_id, name) refuse, which is the correct answer and is      │
// │ reported to the user as a sentence rather than a constraint name.         │
// └─────────────────────────────────────────────────────────────────────────┘
//
// It re-checks NO authorisation rule. org_id is supplied by the caller from
// session context and is then verified by RLS
// (employee_records_insert_scoped: org_id IN my_org_ids() AND (is_hr_in_org
// OR is_location_manager_for(org_id, location_id))), so a forged organisation
// or a location in someone else's tenant is refused by the database, not by a
// second client-side copy of the rule that could drift.
//
// employment_status is deliberately NOT sent. The column is NOT NULL with a
// default of 'unknown' and a CHECK of active|leaver|unknown, and 'unknown' is
// the truthful value for a record a human has just typed a name into. Writing
// 'active' here would manufacture a fact nobody asserted.
//
// created_by is deliberately NOT sent either — a client-supplied actor is a
// forgeable actor. The database assigns it from auth.uid() on insert.
// ─────────────────────────────────────────────────────────────────────────

export const EMPLOYEE_CREATE_RESULT = Object.freeze({
  OK: 'ok',
  // UNIQUE(org_id, name). The person is NOT merged, updated or touched.
  DUPLICATE_NAME: 'duplicate_name',
  // RLS said no: wrong organisation, or a location this caller may not create into.
  REFUSED: 'refused',
  INVALID: 'invalid',
  ERROR: 'error',
});

// 23505 is unique_violation. Matched on the code AND the constraint name because
// Supabase surfaces codes inconsistently across transports, and losing this
// distinction would turn "that name is already taken" into a generic failure.
export function isDuplicateName(error) {
  if (!error) return false;
  return error.code === '23505'
    || /employee_records_org_id_name_key/i.test(error.message || '');
}

// 42501 is insufficient_privilege; PostgREST words an RLS refusal in prose.
export function isRefused(error) {
  if (!error) return false;
  return error.code === '42501'
    || /row-level security/i.test(error.message || '');
}

// Create ONE employee in ONE organisation.
//
// `locationId` null means "no location yet", which only HR may do — enforced by
// the INSERT policy, not here. A location manager passing null is refused by the
// database, which is the correct place for that decision.
export async function createEmployeeWrite({
  supabase, orgId, name, locationId = null, fields = {},
}) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!supabase || !orgId || !trimmed) return { result: EMPLOYEE_CREATE_RESULT.INVALID };

  // Only columns the canonical model actually has, and only when supplied. An
  // absent field is absent, never an empty string standing in for a fact.
  const optional = {};
  const map = {
    jobTitle: 'job_title', startDate: 'start_date', employeeNumber: 'employee_number',
    department: 'department', manager: 'manager', workEmail: 'work_email',
    workingPattern: 'working_pattern', probationEndDate: 'probation_end_date',
    status: 'status', endDate: 'end_date',
  };
  Object.entries(map).forEach(([from, to]) => {
    const v = fields?.[from];
    if (typeof v === 'string' ? v.trim() !== '' : v != null) optional[to] = v;
  });

  try {
    const { data, error } = await supabase.from('employee_records')
      .insert({ org_id: orgId, name: trimmed, location_id: locationId || null, ...optional })
      .select()
      .single();
    if (error) {
      if (isDuplicateName(error)) return { result: EMPLOYEE_CREATE_RESULT.DUPLICATE_NAME, error };
      if (isRefused(error)) return { result: EMPLOYEE_CREATE_RESULT.REFUSED, error };
      return { result: EMPLOYEE_CREATE_RESULT.ERROR, error };
    }
    return { result: EMPLOYEE_CREATE_RESULT.OK, row: data || null };
  } catch (err) {
    return { result: EMPLOYEE_CREATE_RESULT.ERROR, error: err };
  }
}

// What to tell the user. Kept beside the result codes so a new code cannot be
// added without someone deciding what it says.
export function describeEmployeeCreateOutcome(result, name = '') {
  const who = name ? `“${name}”` : 'that employee';
  switch (result) {
    case EMPLOYEE_CREATE_RESULT.OK: return null;
    case EMPLOYEE_CREATE_RESULT.DUPLICATE_NAME:
      // Says what Compass did NOT do, because the dangerous outcome here is a
      // silent merge and the user needs to know it did not happen.
      return `There is already an employee called ${who}. Compass won't merge two people with the same name — check whether this is the same person first.`;
    case EMPLOYEE_CREATE_RESULT.REFUSED:
      return 'You do not have authority to add an employee at that location.';
    case EMPLOYEE_CREATE_RESULT.INVALID:
      return 'An employee needs a name.';
    default:
      return "Couldn't add the employee — please try again";
  }
}
