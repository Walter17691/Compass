// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — employee identity. Phase E0.
//
// ┌─ THE IDENTITY PRINCIPLE ────────────────────────────────────────────────┐
// │   employee.id            IS identity.                                    │
// │   name / employee_number / work_email / job_title / location             │
// │                          are LABELS and ATTRIBUTES.                      │
// │                                                                          │
// │ A label may help a HUMAN notice a possible duplicate. None of them is    │
// │ ever the key, and none of them may merge two records.                    │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Two employees in one organisation must eventually be able to share a name:
//
//   John Smith — 1042 — Manchester
//   John Smith — 2841 — Leeds
//
// They must coexist, and Compass must never silently combine them. Today the
// database still enforces UNIQUE(org_id, name), so that situation cannot yet
// arise — which is deliberate: 34 name-equality identity decisions and four live
// analytics functions would combine them if it could. These primitives exist so
// the phase that removes the constraint has somewhere to stand.
// ─────────────────────────────────────────────────────────────────────────

// The whole employment-status vocabulary. Deliberately three values: Compass
// genuinely does not know the status of most existing records, and 'unknown' is
// the honest answer rather than assuming 'active' about a real person. No
// automatic leaver logic exists — leaver_instances remains a separate
// offboarding checklist and does not set this.
//
// Asserted against the database CHECK constraint by test, because SQL cannot
// import JavaScript and a silently diverging vocabulary would let an invalid
// value reach a NOT NULL column.
export const EMPLOYMENT_STATUSES = Object.freeze(["active", "leaver", "unknown"]);

const norm = v => (typeof v === "string" ? v.trim().toLowerCase() : "");

// ── Identity ───────────────────────────────────────────────────────────────

// THE canonical lookup. The only function in this module that resolves identity.
export function findEmployeeById(records, id) {
  if (typeof id !== "string" || id.trim() === "") return null;
  return (records || []).find(e => e && e.id === id) || null;
}

// ── Legacy compatibility ───────────────────────────────────────────────────

// LEGACY. Resolves an employee by display name.
//
// Retained because ~15 call sites still pass a name (getEmployeeRecord, the
// People/PersonView screens, the DSAR compiler, CaseView's job-title lookup) and
// migrating them is later work. It is NOT an identity function and must not be
// treated as one: the moment two employees can share a name it returns whichever
// happens to be first.
//
// The blank-name guard is original and stays: a stray record saved mid-entry with
// an empty name must not silently supply its data whenever the name field happens
// to be empty.
export function findEmployeeByName(records, name) {
  if(!name) return null;
  return (records||[]).find(e=>e.name===name) || null;
}

// How many employees answer to this display name. Anything above 1 means a
// name-based lookup is guessing.
export function employeesSharingDisplayName(records, name) {
  const target = norm(name);
  if (!target) return [];
  return (records || []).filter(e => e && norm(e.name) === target);
}

// ── Duplicate detection — for HUMANS, never for merging ────────────────────

// Possible matches to show someone at the moment they create an employee.
//
// Returns candidates with the REASON each was matched, so the UI can say "an
// employee with this number already exists" rather than presenting an opaque
// list. It never picks, never merges, never links, and never returns a decision —
// ranking is only about which candidate a person should look at first.
//
// Order of strength: employee number, then work email, then exact display name.
// An exact name match is still only a suggestion.
export function findPossibleDuplicates(records, { name, employeeNumber, workEmail, excludeId = null } = {}) {
  const wantNumber = norm(employeeNumber);
  const wantEmail = norm(workEmail);
  const wantName = norm(name);
  const seen = new Set();
  const out = [];
  const add = (employee, reason) => {
    if (!employee || employee.id === excludeId) return;
    // A candidate matched on a stronger signal keeps that signal as its reason.
    if (employee.id && seen.has(employee.id)) return;
    if (employee.id) seen.add(employee.id);
    out.push({ employee, reason });
  };
  (records || []).forEach(e => { if (wantNumber && norm(e?.employeeNumber) === wantNumber) add(e, "employee_number"); });
  (records || []).forEach(e => { if (wantEmail && norm(e?.workEmail) === wantEmail) add(e, "work_email"); });
  (records || []).forEach(e => { if (wantName && norm(e?.name) === wantName) add(e, "display_name"); });
  return out;
}

// ── The identity gate ──────────────────────────────────────────────────────

export const IDENTITY = Object.freeze({
  // Exactly one canonical employee answers to this name.
  RESOLVED: "resolved",
  // Several do. Any name-based lookup would be guessing between real people.
  AMBIGUOUS: "ambiguous",
  // No canonical employee at all — a legacy name-only subject. In production
  // today that is 650 of 2,939 case employee names, plus every wellbeing note
  // and concern referral. Not an error, but not identity either.
  UNRECONCILED: "unreconciled",
});

// Can a name alone be trusted to mean one person?
//
// This is the function that must be consulted before anything irreversible or
// disclosing happens on the strength of a name — a DSAR export above all.
// `emailEvidence` lets a caller add whatever independent signal it has (the DSAR
// compiler passes the distinct employee emails found across the subject's cases),
// so conflicting evidence reads as ambiguous even where only one record exists.
export function classifyIdentityByName(records, name, { emailEvidence = [] } = {}) {
  const matches = employeesSharingDisplayName(records, name);
  const distinctEmails = new Set((emailEvidence || []).map(norm).filter(Boolean));
  if (matches.length > 1) return IDENTITY.AMBIGUOUS;
  if (distinctEmails.size > 1) return IDENTITY.AMBIGUOUS;
  if (matches.length === 1) return IDENTITY.RESOLVED;
  return IDENTITY.UNRECONCILED;
}

// Fail-safe predicate. True when a name must NOT be used to gather or disclose
// one person's records.
//
// UNRECONCILED is deliberately NOT treated as unsafe on its own: 650 production
// subjects have no canonical record yet, and refusing every one of them would
// break DSAR for most of the customer base while reconciliation is outstanding.
// It is reported separately so the caller can warn, and so a future phase can
// tighten it once reconciliation has run.
export function identityRequiresReconciliation(records, name, opts) {
  return classifyIdentityByName(records, name, opts) === IDENTITY.AMBIGUOUS;
}
