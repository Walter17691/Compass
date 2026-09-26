// ─────────────────────────────────────────────────────────────────────────
// The reconciliation write, kept OUT of the App component. Phase E0.5B.
//
// Two reasons this is a module and not an inline handler:
//
// 1. It is directly testable. The previous phases' mirror tests — hand-written
//    copies of a function's logic — proved intended behaviour while the shipped
//    function diverged (that is how the NEW-45 defects shipped green). A real
//    exported function with an injected client has no mirror to drift from.
//
// 2. The React Compiler's analysis of App.jsx degrades as callees are added to
//    it. During this phase a `set-state-in-effect` error at
//    `useEffect(() => { if(org?.id) loadCasesFromDB(); })` stopped being
//    reported although the code was byte-identical — the analysis lost sight of
//    loadCasesFromDB rather than the problem being fixed. Keeping new logic out
//    of that component is the only lever that reliably helps.
//
// This module never decides WHO an employee is. It performs a write whose
// authority lives entirely in the database function it calls.
// ─────────────────────────────────────────────────────────────────────────

export const RECONCILE_RESULT = Object.freeze({
  OK: "ok",
  // Another administrator reconciled this case first. Their decision stands.
  ALREADY_RECONCILED: "already_reconciled",
  REFUSED: "refused",
  INVALID: "invalid",
});

// Postgres SQLSTATE raised by reconcile_case_employee when the conditional
// UPDATE matched no row because employee_id was already set. Chosen to read like
// an HTTP 409, and matched on BOTH the code and the message: Supabase surfaces
// codes inconsistently across transports, and losing the distinction would turn
// "somebody else already decided" into a generic failure.
export const ALREADY_RECONCILED_CODE = "PT409";

export function isAlreadyReconciled(error) {
  if (!error) return false;
  return error.code === ALREADY_RECONCILED_CODE
    || /already been reconciled/i.test(error.message || "");
}

// Assign ONE unreconciled historical case to a canonical employee.
//
// Every precondition — authenticated, HR role, case access, same organisation,
// case currently unreconciled — is checked inside the security definer RPC. This
// function deliberately re-checks NONE of them: a second, client-side copy of an
// authorisation rule is a rule that can drift out of step with the real one, and
// the weaker copy always wins the argument in someone's head.
export async function reconcileCaseEmployeeWrite({ supabase, caseId, employeeId }) {
  if (!supabase || !caseId || !employeeId) {
    return { result: RECONCILE_RESULT.INVALID };
  }
  try {
    const { error } = await supabase.rpc("reconcile_case_employee", {
      p_case_id: caseId,
      p_employee_id: employeeId,
    });
    if (!error) return { result: RECONCILE_RESULT.OK };
    if (isAlreadyReconciled(error)) {
      return { result: RECONCILE_RESULT.ALREADY_RECONCILED, error };
    }
    return { result: RECONCILE_RESULT.REFUSED, error };
  } catch (e) {
    return { result: RECONCILE_RESULT.REFUSED, error: e };
  }
}

// What to tell the user. Truthful about whose decision stands: a concurrent
// reconciliation is not an error the user caused, and must not read like one.
export function describeReconcileOutcome({ result, error }, employeeName = "") {
  switch (result) {
    case RECONCILE_RESULT.OK:
      return { tone: "success", message: `Identity reconciled — this case now belongs to ${employeeName}.` };
    case RECONCILE_RESULT.ALREADY_RECONCILED:
      return { tone: "error", message: "This case was already reconciled by someone else. Refreshed to show the current identity." };
    case RECONCILE_RESULT.INVALID:
      return { tone: "error", message: "Select a case and an employee before confirming." };
    default:
      return { tone: "error", message: "Couldn't reconcile this case — " + (error?.message || "please try again.") };
  }
}

// Whether the caller should reload cases from the database. True on success (the
// row now carries a server-assigned employee_id) and true on a concurrent
// reconciliation (the view is stale, showing as unresolved a case that is in
// fact resolved).
//
// NOTE, measured rather than assumed: reconciliation does NOT bump
// cases.updated_at — there is no auto-update trigger on that column. So the
// optimistic-concurrency guard used by the ordinary case save
// (`.eq('updated_at', …)`) will still MATCH for a client holding a stale copy,
// and that client's payload carries `employee_id: null`.
//
// That is fail-safe, and it was proven against the real database rather than
// reasoned about: the fill-once trigger refuses the write with SQLSTATE 23514
// ("A case's employee cannot be cleared once set"), and refuses a different
// employee_id the same way. A reconciled identity therefore cannot be erased or
// moved by a stale tab. The cost is that the stale client's unrelated save fails
// with a database-level message, which is why reloading promptly matters.
export function shouldReloadAfter(result) {
  return result === RECONCILE_RESULT.OK || result === RECONCILE_RESULT.ALREADY_RECONCILED;
}

// ─────────────────────────────────────────────────────────────────────────
// CORRECTION. Phase E0.6.
//
// Reconciliation answers "who is this unattributed record about?" from nothing.
// Correction OVERRULES a colleague's recorded decision and moves a case between
// two real people's Employee Files. That is materially more sensitive, which is
// why the database requires HR DIRECTOR — not merely HR — and a stored reason.
//
// As with reconciliation, none of that authority is re-checked here. The RPC is
// the boundary; this asks it to act and reports what it said.
// ─────────────────────────────────────────────────────────────────────────

export const CORRECT_RESULT = Object.freeze({
  OK: "ok",
  // The identity changed underneath us while the form was open.
  CHANGED_UNDERNEATH: "changed_underneath",
  // Refused by the database: not an HR Director, cross-org, same employee,
  // no established identity to correct, or a reason that says nothing.
  REFUSED: "refused",
  INVALID: "invalid",
});

// Mirrors the database's own threshold. Checked here ONLY so the button can be
// disabled before a pointless round trip — the database refuses it regardless,
// and that refusal is the rule. Keeping the number identical in both places is
// deliberate; if they ever diverge, the database wins.
export const MIN_CORRECTION_REASON = 10;

export function correctionReasonIsUsable(reason) {
  return typeof reason === "string" && reason.trim().length >= MIN_CORRECTION_REASON;
}

export async function correctCaseEmployeeWrite({ supabase, caseId, employeeId, reason }) {
  if (!supabase || !caseId || !employeeId || !correctionReasonIsUsable(reason)) {
    return { result: CORRECT_RESULT.INVALID };
  }
  try {
    const { error } = await supabase.rpc("correct_case_employee", {
      p_case_id: caseId,
      p_new_employee_id: employeeId,
      p_reason: reason.trim(),
    });
    if (!error) return { result: CORRECT_RESULT.OK };
    if (isAlreadyReconciled(error) || error.code === ALREADY_RECONCILED_CODE) {
      return { result: CORRECT_RESULT.CHANGED_UNDERNEATH, error };
    }
    return { result: CORRECT_RESULT.REFUSED, error };
  } catch (e) {
    return { result: CORRECT_RESULT.REFUSED, error: e };
  }
}

export function describeCorrectionOutcome({ result, error }, employeeName = "") {
  switch (result) {
    case CORRECT_RESULT.OK:
      return { tone: "success", message: `Identity corrected — this case now belongs to ${employeeName}. Both the original decision and this correction are in the audit history.` };
    case CORRECT_RESULT.CHANGED_UNDERNEATH:
      return { tone: "error", message: "This case's identity changed while you were correcting it. Refreshed to show the current identity." };
    case CORRECT_RESULT.INVALID:
      return { tone: "error", message: "Choose a different employee and give a reason of at least 10 characters." };
    default:
      return { tone: "error", message: "Couldn't correct this case — " + (error?.message || "please try again.") };
  }
}
