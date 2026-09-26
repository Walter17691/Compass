// ─────────────────────────────────────────────────────────────────────────
// THE CANONICAL EMPLOYEE READ MODEL. Phase E0.7.
//
// One question, asked one way:
//
//     "What authorised objects belong to employee UUID X?"
//
// and never:
//
//     "What records have a name equal to this employee's current name?"
//
// ┌─ THIS IS IDENTITY COMPOSITION, NOT AUTHORISATION ───────────────────────┐
// │ Every collection is passed IN, already filtered by RLS on the way to this │
// │ client. This function narrows what the viewer can ALREADY see down to one │
// │ employee. It cannot widen anything, and it must never be given a          │
// │ service-role or otherwise-unfiltered collection to filter client-side.    │
// │                                                                          │
// │ So: employee_id does NOT create an access relationship. Being able to see │
// │ John Smith's employee record implies nothing about his wellbeing notes,   │
// │ his confidential case, or his DSAR. Each object's own policy decided that │
// │ before it ever reached here.                                             │
// └─────────────────────────────────────────────────────────────────────────┘
//
// WHY NO NAME FALLBACK, EVER. A fallback would quietly undo the whole
// programme: the moment `employee_id === X || employeeName === employee.name`
// exists anywhere, two people who share a display name share a history, and the
// 2,939 name-only legacy records start attaching themselves to whoever happens
// to match. An employee with no canonically attributed history therefore has an
// EMPTY context, and that is the truthful answer rather than a bug to paper over.
//
// MEETINGS ARE ABSENT DELIBERATELY. public.meetings and embedded
// cases.meetings have no employee_id until E2, which will migrate
// meeting -> employee and optional meeting -> case as one coherent change.
// Including them here by name is precisely the inference being removed.
// ─────────────────────────────────────────────────────────────────────────

const byEmployee = (rows, employeeId) =>
  (Array.isArray(rows) ? rows : []).filter(r => r && r.employeeId === employeeId);

// Rows of a collection that carry no canonical employee at all. Counted
// ORG-WIDE and never matched against this employee's name — the honest
// statement is "some records in this organisation are not yet linked", not
// "these records are probably yours".
const unattributed = rows =>
  (Array.isArray(rows) ? rows : []).filter(r => r && !r.employeeId).length;

export const EMPLOYEE_CONTEXT_COLLECTIONS = Object.freeze([
  "cases", "wellbeingNotes", "concernReferrals", "dsarRequests",
]);

// Compose one employee's canonical context from collections the viewer is
// already authorised to see.
//
// employeeId must be a uuid. A falsy id returns an empty context rather than
// throwing, because a screen may render before its route param resolves — but it
// never returns "everything" or falls back to a name.
export function getEmployeeContext(employeeId, authorisedData = {}) {
  const {
    employeeRecords = [],
    cases = [],
    wellbeingNotes = [],
    concernReferrals = [],
    dsarRequests = [],
  } = authorisedData;

  const employee = employeeId
    ? (employeeRecords.find(e => e && e.id === employeeId) || null)
    : null;

  const context = {
    employeeId: employeeId || null,
    employee,
    // Every one of these is an employee_id equality. There is no branch in this
    // file that compares a name, and the tests assert that structurally.
    cases: employeeId ? byEmployee(cases, employeeId) : [],
    wellbeingNotes: employeeId ? byEmployee(wellbeingNotes, employeeId) : [],
    concernReferrals: employeeId ? byEmployee(concernReferrals, employeeId) : [],
    dsarRequests: employeeId ? byEmployee(dsarRequests, employeeId) : [],
  };

  const total = EMPLOYEE_CONTEXT_COLLECTIONS.reduce((n, k) => n + context[k].length, 0);

  return {
    ...context,
    total,
    // A valid, expected state — not an error. Production is almost entirely
    // synthetic history that was never reconciled, so most contexts are empty,
    // and E1 must be able to say "No recorded activity yet." and be right.
    isEmpty: total === 0,
    // Org-wide, employee-agnostic. Lets a screen say "some older records have
    // not been linked yet" without implying any of them are this person's.
    unattributedInOrg: {
      cases: unattributed(cases),
      wellbeingNotes: unattributed(wellbeingNotes),
      concernReferrals: unattributed(concernReferrals),
      dsarRequests: unattributed(dsarRequests),
    },
  };
}

// True when the organisation still holds records with no canonical employee.
// Used only to decide whether to show an explanatory line; it must never be used
// to attach any of those records to anyone.
export function hasUnattributedRecords(context) {
  const u = context?.unattributedInOrg;
  if (!u) return false;
  return Object.values(u).some(n => n > 0);
}

// ── The roster ─────────────────────────────────────────────────────────────
//
// The People list is the employee_records roster, keyed by uuid. It is NOT
// reconstructed from names appearing in cases: doing that made a "person" out of
// every distinct string, invented people out of typos, merged two same-named
// colleagues into one row, and left 396 real employees with no case entirely
// invisible.
//
// Counts come from canonical relationships only, so a roster row shows what is
// actually attributed to that person — which may legitimately be zero.
export function buildEmployeeRoster(authorisedData = {}) {
  const { employeeRecords = [] } = authorisedData;
  return employeeRecords
    .filter(e => e && e.id)
    .map(e => {
      const ctx = getEmployeeContext(e.id, authorisedData);
      return {
        // Identity. Navigation and React keys both use this, never the name.
        id: e.id,
        // Labels. Display only — every one of these may change without the
        // person changing, which is the whole reason they cannot be identity.
        name: e.name || "",
        jobTitle: e.jobTitle || "",
        location: e.location || "",
        department: e.department || "",
        employeeNumber: e.employeeNumber || "",
        employmentStatus: e.employmentStatus || "unknown",
        caseCount: ctx.cases.length,
        openCaseCount: ctx.cases.filter(c => c && c.stage !== "closed").length,
        wellbeingCount: ctx.wellbeingNotes.length,
        hasActivity: !ctx.isEmpty,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Two employees may legitimately share a display name once UNIQUE(org_id, name)
// is removed. A roster row must stay distinguishable when that happens, so this
// says whether a row needs disambiguating and the list renders accordingly.
export function rosterNamesSharedBy(roster) {
  const counts = new Map();
  (Array.isArray(roster) ? roster : []).forEach(r => {
    const k = (r?.name || "").trim().toLowerCase();
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  });
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}
