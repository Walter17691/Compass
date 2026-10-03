// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.0C — a new employee-owned process carries canonical identity.
//
// Every interactive creation path already does this, verified before any code
// was written:
//
//   global "New case"   employeeId: casePromptEmployeeId, button disabled
//                       without it, and findEmployeeById re-checked on submit
//   Intake              `if(!intake.employeeId) return;`
//   concern referral    findEmployeeById(opts.employeeId) or refuse
//   meeting save        referralCaseIntent requires _linkedReferralEmployeeId
//                       and otherwise fails closed with PARENT_REQUIRED
//
// ONE path did not: the case-history CSV import. It built cases from an
// 'employee name' column alone — name-only identity, created now, indefinitely,
// and reachable from Settings by any HR user. That is precisely "create an
// employee-owned formal process and plan to reconcile it later".
//
// ┌─ NAME IS NEVER IDENTITY ────────────────────────────────────────────────┐
// │ Not even as a fallback, and not even when it happens to be unique. The  │
// │ production roster currently has zero duplicate names, which makes name  │
// │ matching look safe; that is a property of today's data, not of the      │
// │ model, and the first duplicate hire silently attaches a disciplinary    │
// │ record to the wrong person.                                             │
// │                                                                          │
// │ A row that cannot be resolved deterministically is SKIPPED and counted, │
// │ never imported as a name-only case to be reconciled later.               │
// └─────────────────────────────────────────────────────────────────────────┘
//
// The signals below mirror handleEmployeeCsvImport's own precedent: an explicit
// canonical id when the customer's export carries one, "the only unambiguous
// identity signal available". Employee number is accepted on the same terms —
// deterministic only while it is unique within the organisation.
// ─────────────────────────────────────────────────────────────────────────

const norm = v => (typeof v === "string" ? v.trim() : "");
const lower = v => norm(v).toLowerCase();

export const IMPORT_IDENTITY = Object.freeze({
  BY_ID: "by_employee_id",
  BY_NUMBER: "by_employee_number",
  NO_SIGNAL: "no_identity_signal",      // the row offers nothing but a name
  UNKNOWN_ID: "employee_id_not_found",  // an id was given; no such employee here
  AMBIGUOUS_NUMBER: "employee_number_not_unique",
});

// Read the identity columns a case-history export might carry. Deliberately
// tolerant of header spelling, exactly as the employee import is.
export function readIdentityColumns(row = {}) {
  const get = (...keys) => {
    for (const k of keys) {
      const v = row[k];
      if (norm(v)) return norm(v);
    }
    return "";
  };
  return {
    employeeId: get("compass employee id", "compassemployeeid", "employee id", "employeeid"),
    employeeNumber: get("employee number", "employeenumber", "emp no", "empno", "payroll number"),
  };
}

// Resolve ONE row to a canonical employee, within one organisation.
//
// `employees` must already be the organisation's own roster — this performs no
// org filtering of its own and no fetching, so a record from another
// organisation cannot be reached from here. Callers pass the roster they are
// already authorised to hold.
//
// Returns { employeeId, via } on success, or { employeeId: null, reason } so the
// caller can report precisely why a row was skipped.
export function resolveImportedEmployee(row, employees = [], { orgId = null } = {}) {
  const roster = (Array.isArray(employees) ? employees : [])
    .filter(e => e && e.id && (!orgId || !e.orgId || e.orgId === orgId));
  const { employeeId, employeeNumber } = readIdentityColumns(row);

  if (employeeId) {
    const hit = roster.find(e => e.id === employeeId);
    // An id that names nobody on this roster is an error, never a reason to
    // fall back to the name on the same row.
    return hit ? { employeeId: hit.id, via: IMPORT_IDENTITY.BY_ID }
               : { employeeId: null, reason: IMPORT_IDENTITY.UNKNOWN_ID };
  }

  if (employeeNumber) {
    const matches = roster.filter(e => lower(e.employeeNumber) === lower(employeeNumber));
    if (matches.length === 1) return { employeeId: matches[0].id, via: IMPORT_IDENTITY.BY_NUMBER };
    // Zero matches, or several people carrying the same number, are both
    // unresolvable. Picking one would be a guess.
    return { employeeId: null, reason: IMPORT_IDENTITY.AMBIGUOUS_NUMBER };
  }

  return { employeeId: null, reason: IMPORT_IDENTITY.NO_SIGNAL };
}

// Split an import into what can be created and what cannot, with counts the UI
// can report honestly. Nothing is "imported pending reconciliation".
export function partitionImportRows(rows = [], employees = [], opts = {}) {
  const accepted = [];
  const skipped = [];
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const resolved = resolveImportedEmployee(row, employees, opts);
    if (resolved.employeeId) accepted.push({ row, employeeId: resolved.employeeId, via: resolved.via });
    else skipped.push({ row, reason: resolved.reason });
  }
  return { accepted, skipped };
}

// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.2b — the historical importer does not issue decisions (NEW-48).
//
// The case-history importer wrote `outcome: o['outcome'] || ""` straight into
// cases.outcome. That meant a CSV could manufacture an operational case outcome
// while bypassing every control the product puts around a decision:
//
//   approvalActionForOutcome / requestHrReview   never called, so an imported
//                                                "Dismissal with notice" never
//                                                hit the HR sign-off gate
//   computeDecisionQualityGaps                   never called
//   log_audit_event's 'Outcome issued' check     never applies (it audits
//                                                "Case history imported")
//   protect_case_hr_only_columns                 BEFORE UPDATE only, so an
//                                                INSERT carrying an outcome was
//                                                unchecked at database level
//
// It is also the only production route that manufactures a warning with no
// duration — the shape that made the "Complete outcome details" path exist.
//
// So the importer now imports case HISTORY and refuses to issue decisions. The
// outcome column is read only to COUNT it, so the user is told plainly rather
// than the value vanishing silently.
// ─────────────────────────────────────────────────────────────────────────

// How many rows carried an outcome value we are declining to import. Counted
// from the rows that were actually accepted, because a row skipped for identity
// reasons is already reported by describeSkippedImport and must not be counted
// twice.
export function countImportedOutcomes(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => norm(row?.outcome) || norm(row?.Outcome) || norm(row?.["outcome"]))
    .length;
}

// FIELD skipped, not ROW skipped — and the wording has to carry that
// distinction, because "4 skipped" next to a successful import reads as four
// lost cases. The case history imported; the decision did not.
export function describeSkippedOutcomes(count = 0) {
  if (!count) return null;
  const n = count;
  return `${n} imported case${n === 1 ? "" : "s"} had an outcome value in the file — `
    + `the case${n === 1 ? " was" : "s were"} imported, but the outcome ${n === 1 ? "was" : "were"} not. `
    + `A case decision has to be recorded through Compass's own decision process so it carries `
    + `authority, sign-off where required, and a dated decision record. Record ${n === 1 ? "it" : "them"} `
    + `on the case when you are ready.`;
}

// What to tell the user about the rows that were not imported. One line, plain,
// and it says what to do about it.
export function describeSkippedImport(skipped = []) {
  if (!skipped.length) return null;
  const n = skipped.length;
  return `${n} row${n === 1 ? "" : "s"} skipped — no employee could be identified. `
    + `Add a "Employee ID" or "Employee Number" column that matches your employee records. `
    + `A name on its own cannot identify someone, so those rows were not imported.`;
}
