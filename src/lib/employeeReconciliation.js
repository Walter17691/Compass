// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — historical employee identity reconciliation.
// Phase E0.5B.
//
// Reconciliation means ONE thing:
//
//     "This historical case belongs to canonical employee UUID X."
//
// It does NOT mean "these names look the same, therefore they are the same
// person". A machine may PROPOSE. A human CONFIRMS. Compass records the
// decision and its provenance.
//
// ┌─ THE LOAD-BEARING RULE ─────────────────────────────────────────────────┐
// │ EXACT NAME EQUALITY IS *CANDIDATE*, NEVER *RESOLVED*.                    │
// │                                                                          │
// │ Nothing in this module returns RESOLVED. RESOLVED is a fact about the    │
// │ database — cases.employee_id being populated — not a conclusion this     │
// │ code is entitled to reach. classifyCase reports RESOLVED only when it    │
// │ is READING an employee_id that a human already confirmed.                │
// └─────────────────────────────────────────────────────────────────────────┘
//
// WHAT EVIDENCE COMPASS ACTUALLY HOLDS (measured in production, 2026-09-26).
// This matters more than the design, because it bounds what the design can
// honestly claim:
//
//   2,956 of 2,959 named legacy cases have NO evidence beyond the name.
//   cases.employee_email .............. 0 of 2,960 populated
//   cases.location_id ................. 3 of 2,960 populated
//   employee_records.work_email ....... 0 of 2,685 populated
//   employee_records.employee_number .. 14 of 2,685 populated
//   employee_records.location ......... 19 of 2,685 populated
//   cases has no employee_number column at all.
//
// So multi-factor corroboration is, for this dataset, mostly unavailable. The
// workbench must therefore say plainly that the only evidence is the name
// rather than dressing a single weak signal up as agreement between several.
// That is why `describeEvidence` reports "no comparable value" as a distinct
// outcome from "matched" — an absent field must never read as confirmation.
// ─────────────────────────────────────────────────────────────────────────

const norm = v => (typeof v === "string" ? v.trim().toLowerCase() : "");

export const RECONCILIATION = Object.freeze({
  // No canonical employee has been confirmed for this case.
  UNRECONCILED: "unreconciled",
  // One plausible canonical employee. HUMAN CONFIRMATION STILL REQUIRED.
  CANDIDATE: "candidate",
  // Several plausible canonical employees; Compass cannot safely distinguish them.
  AMBIGUOUS: "ambiguous",
  // Different evidence dimensions select DIFFERENT employees.
  CONFLICT: "conflict",
  // employee_id has been explicitly confirmed and persisted.
  RESOLVED: "resolved",
});

// Why there is nothing to propose. A reason, not a state — the workbench needs
// to distinguish "nobody on the roster answers to this name" from "this case has
// no employee name at all", and those are very different conversations to have
// with a reviewer. (Production holds exactly 1 nameless legacy case.)
export const NO_CANDIDATE = Object.freeze({
  NO_NAME: "no_name",
  NO_ROSTER_MATCH: "no_roster_match",
});

// The outcome of comparing ONE evidence dimension. `NOT_COMPARABLE` is a
// first-class result and deliberately not folded into `DIFFERS`: "we hold no
// value on one side" is not disagreement, and must never be shown as either
// corroboration or a conflict.
export const EVIDENCE = Object.freeze({
  MATCHES: "matches",
  DIFFERS: "differs",
  NOT_COMPARABLE: "not_comparable",
});

// Dimensions that can SELECT an employee — i.e. that can be used to look a
// person up. Deliberately a short list of deterministic, structured fields.
//
// location and job_title are NOT selectors. They are corroboration shown to the
// reviewer. Two colleagues share a location; a location cannot identify anyone.
export const SELECTOR = Object.freeze({
  NAME: "name",
  WORK_EMAIL: "work_email",
});

// ── Selection: which roster employees does each dimension point at? ─────────
//
// Returns { name: [ids], work_email: [ids] } containing only NON-EMPTY
// dimensions, so callers can count how many dimensions actually had something
// to say rather than treating an absent field as agreement.
export function selectorsForCase(legacyCase, roster) {
  const rows = (Array.isArray(roster) ? roster : []).filter(e => e && e.id);
  const out = {};

  const name = norm(legacyCase?.employeeName);
  if (name) {
    const ids = rows.filter(e => norm(e.name) === name).map(e => e.id);
    if (ids.length) out[SELECTOR.NAME] = ids;
  }

  // Present for completeness and for the day an HRIS import populates it. In
  // production today cases.employee_email is populated 0 times, so this
  // dimension never fires — which is exactly why CONFLICT is currently
  // unreachable, and why that is proven by fixtures rather than by production.
  const email = norm(legacyCase?.employeeEmail);
  if (email) {
    const ids = rows.filter(e => norm(e.workEmail) === email).map(e => e.id);
    if (ids.length) out[SELECTOR.WORK_EMAIL] = ids;
  }

  return out;
}

const intersect = (a, b) => a.filter(x => b.includes(x));
const unique = arr => [...new Set(arr)];

// ── Classification ─────────────────────────────────────────────────────────
//
// Deterministic and total: every case lands in exactly one state, and the
// precedence is fixed and explicit rather than emergent from if-ordering.
//
//   RESOLVED    the database already holds a confirmed employee_id
//   CONFLICT    ≥2 dimensions spoke and they select disjoint employees
//   AMBIGUOUS   >1 plausible employee survives
//   CANDIDATE   exactly 1 plausible employee — still needs a human
//   UNRECONCILED nothing to propose
export function classifyCase(legacyCase, roster) {
  if (legacyCase?.employeeId) {
    return { state: RECONCILIATION.RESOLVED, employeeId: legacyCase.employeeId, candidateIds: [] };
  }

  if (!norm(legacyCase?.employeeName)) {
    return { state: RECONCILIATION.UNRECONCILED, reason: NO_CANDIDATE.NO_NAME, candidateIds: [] };
  }

  const selectors = selectorsForCase(legacyCase, roster);
  const dimensions = Object.keys(selectors);

  if (dimensions.length === 0) {
    return { state: RECONCILIATION.UNRECONCILED, reason: NO_CANDIDATE.NO_ROSTER_MATCH, candidateIds: [] };
  }

  // Where several dimensions spoke, agreement is their INTERSECTION. An empty
  // intersection is the literal definition of "evidence points inconsistently
  // to different employees" — and it is reported with every dimension's own
  // answer, because "the evidence disagrees" is useless without saying how.
  let agreed = selectors[dimensions[0]];
  for (const d of dimensions.slice(1)) agreed = intersect(agreed, selectors[d]);

  if (dimensions.length > 1 && agreed.length === 0) {
    return { state: RECONCILIATION.CONFLICT, candidateIds: unique(Object.values(selectors).flat()), selectors };
  }
  if (agreed.length > 1) {
    return { state: RECONCILIATION.AMBIGUOUS, candidateIds: agreed, selectors };
  }
  return { state: RECONCILIATION.CANDIDATE, candidateIds: agreed, selectors };
}

// A state a machine is allowed to act on: none of them. Kept as an explicit
// predicate so no caller can drift into treating CANDIDATE as good enough.
export function requiresHumanConfirmation(state) {
  return state !== RECONCILIATION.RESOLVED;
}

export function isReconcilable(state) {
  // Every unresolved state is reconcilable BY A HUMAN — including AMBIGUOUS and
  // CONFLICT, where the human is the only thing that can settle it. What varies
  // is what Compass may pre-select, not whether a person may decide.
  return state !== RECONCILIATION.RESOLVED;
}

// ── Provenance: WHY was this candidate proposed? ────────────────────────────
//
// Returned per candidate so the reviewer sees the basis for a proposal instead
// of a bare suggestion. Absent values are NOT_COMPARABLE, never MATCHES.
export function describeEvidence(legacyCase, employee, caseLocationName = null) {
  const cmp = (a, b) => {
    if (!norm(a) || !norm(b)) return EVIDENCE.NOT_COMPARABLE;
    return norm(a) === norm(b) ? EVIDENCE.MATCHES : EVIDENCE.DIFFERS;
  };
  return {
    name: cmp(legacyCase?.employeeName, employee?.name),
    workEmail: cmp(legacyCase?.employeeEmail, employee?.workEmail),
    // cases has no employee_number column, so this is structurally
    // NOT_COMPARABLE for every legacy case — stated rather than hidden.
    employeeNumber: EVIDENCE.NOT_COMPARABLE,
    // Corroboration only. Never a selector: colleagues share a location.
    location: cmp(caseLocationName, employee?.location),
  };
}

// ── Grouping for review — EXPLICITLY NOT IDENTITY ──────────────────────────
//
// The workbench groups legacy cases by display name so a reviewer can work
// through one person's apparent history in one place. That is an ERGONOMIC
// grouping and nothing more.
//
// ┌─ WHY THIS DISTINCTION IS LOAD-BEARING ──────────────────────────────────┐
// │ Three historical cases reading "John Smith" may legitimately resolve to  │
// │ TWO different people:                                                    │
// │     case A → John Smith (uuid 1)                                         │
// │     case B → John Smith (uuid 1)                                         │
// │     case C → John Smith (uuid 2)                                         │
// │                                                                          │
// │ So a group carries NO shared identity and NO shared decision. Each case   │
// │ keeps its own classification and its own reconciliation. There is         │
// │ deliberately no group-level employeeId field for a caller to reach for.   │
// └─────────────────────────────────────────────────────────────────────────┘
export function groupLegacyForReview(legacyCases, roster) {
  const groups = new Map();
  (Array.isArray(legacyCases) ? legacyCases : []).forEach(c => {
    if (!c) return;
    // Nameless cases group under their own id: they share a label with nobody,
    // and bundling them together would invent a "subject" that does not exist.
    const key = norm(c.employeeName) || ` nameless:${c.id}`;
    if (!groups.has(key)) {
      groups.set(key, { key, displayName: (c.employeeName || "").trim(), cases: [] });
    }
    const g = groups.get(key);
    // The FIRST spelling encountered is kept as the group's display label, and
    // no case's own employee_name is rewritten to match it — see the historical
    // display-name rule: the uuid establishes identity, the stored name stays a
    // point-in-time snapshot ("John A. Smith" stays "John A. Smith").
    g.cases.push({ ...c, classification: classifyCase(c, roster) });
  });
  return [...groups.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Group-level summary for the list view. Counts states; asserts nothing about
// identity. `allResolved` drives nothing but a visual affordance.
export function summariseGroup(group) {
  const states = (group?.cases || []).map(c => c.classification?.state);
  const count = s => states.filter(x => x === s).length;
  return {
    total: states.length,
    resolved: count(RECONCILIATION.RESOLVED),
    candidate: count(RECONCILIATION.CANDIDATE),
    ambiguous: count(RECONCILIATION.AMBIGUOUS),
    conflict: count(RECONCILIATION.CONFLICT),
    unreconciled: count(RECONCILIATION.UNRECONCILED),
    allResolved: states.length > 0 && states.every(s => s === RECONCILIATION.RESOLVED),
  };
}
