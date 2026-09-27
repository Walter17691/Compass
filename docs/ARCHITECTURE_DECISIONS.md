# Compass — Architecture Decisions

Formal record of architecture decisions that govern later implementation. Each
entry states what was decided and what it forbids, so a decision is not lost
between the phase that made it and the phase that implements it.

Recording a decision here does **not** mean it is implemented. Each entry states
its own status.

---

## AD-001 — Organisation-level processes are not employee-owned

**Status:** approved architecture, **not implemented**. Recorded during phase
E1.4A (2026-09-27). E1.4A implemented no part of it.

**Supersedes nothing.** Refines one assumption in the approved Employee File
architecture.

### The refinement

The Employee File architecture remains approved. One assumption is now narrowed:

> **Employee-centric does not mean every Compass process belongs to an employee.**

### 1. Two process parentage models

Compass must support two fundamentally different kinds of HR/ER process.

**A. Employee-owned process** — fundamentally concerns one employee's employment
relationship. Disciplinary; individual grievance where appropriate; probation;
flexible working; individual capability/performance; individual attendance and
long-term sickness.

```
Organisation -> Employee File -> HR Process
```

with `employee_id` as authoritative employee parentage.

**B. Organisation-level process** — exists independently of any one employee, and
may involve multiple employees, employees in different roles, external people,
anonymous people, or no employee subject at all. Whistleblowing / protected
disclosure; collective or multi-employee redundancy; future organisational
investigations or protected processes where employee ownership would be
conceptually false.

```
Organisation -> Organisation-level process
```

**not**

```
Organisation -> Employee File -> HR Process
```

`employee_id` parentage must not be forced merely because Compass is
employee-centric.

### 2. Reference is not ownership

An organisation-level process may reference employees in different roles. For a
whistleblowing process: Sarah as whistleblower, John as subject/person
implicated, Emma as witness. The process is **not** therefore owned by Sarah,
John or Emma.

Participation in a process must not automatically cause that process to appear on
an Employee File. This extends the already-approved witness-parentage principle:

- **Reference ≠ ownership.**
- **Participation ≠ Employee File history.**

This distinction must remain structural, not a display rule.

### 3. Whistleblowing — target architecture

Whistleblowing should ultimately be an organisation-level / protected process:

```
Organisation -> Whistleblowing process
```

Relationships may eventually include whistleblower, subject/person implicated,
witness, investigator, decision-maker. **That taxonomy is not finalised and must
not be implemented yet.**

**Interim state.** Phase E1.4 routes `discrimination` and `whistleblowing`
through the existing grievance-family registry entry. This is an interim safe
state, recorded as:

> *existing grievance-family routing requiring later process validation.*

Neither is a fully validated Compass workflow. This temporary routing **must not
become the permanent product architecture.**

### 4. Redundancy — target architecture

Redundancy may also exist outside an individual Employee File:

```
Organisation -> Redundancy process -> affected pool
                                   -> approved selection criteria
                                   -> affected employees
                                   -> consultation / process activity
                                   -> decisions / outcomes
```

Individual employees may subsequently receive employment-history events or
individual outcomes where justified, but the master redundancy process is not
owned by one employee.

**Note from the E1.4A audit:** a separate redundancy feature already exists
(`RedundancyScreen.jsx`, `redundancyScoring.js`, the `redundancy_cases` table,
with its own `setup | pool | consultation | outcome` step model and an at-risk
pool). It is already organisation-level and already separate from `cases`. A
`cases` row typed `redundancy` is a different, unvalidated thing that is not
connected to it. Existing redundancy behaviour was not redesigned in E1.4A.

### 5. Compass intelligence across the boundary

Although an organisation-level process is not owned by an Employee File, Compass
must eventually be able to surface **authorised and genuinely relevant**
information from Employee Files into that process.

> **The information stays with its authoritative source. Compass surfaces it
> where it is relevant.**

Employee history must **not** be duplicated into an organisation-level process
merely to make it visible there.

### 6. Worked example — redundancy selection criterion

An authorised redundancy process has an approved selection criterion *"live
formal disciplinary warning"*, and a pool of John Smith, Sarah Jones, Emma Brown.
Compass should eventually check the authoritative Employee File information for
each and surface, for example, John's First Written Warning issued 11 September
2026 expiring 11 March 2027; Sarah — no live formal warning; Emma — a Final
Written Warning with its dates.

That answer must come from the **same authoritative Current Warnings logic** used
by Employee File → Overview → Current warnings.

Must not: create duplicate warning records in the redundancy process; manually
reinterpret Activity history; or count any of the following as a live formal
disciplinary warning — a Letter of Concern, a resolved management concern, a 1:1,
an informal conversation, or an expired formal warning.

### 7. Criterion-specific intelligence

Intelligence must be contextual. The entire Employee File must not be dumped into
an organisation-level process. The sequence is:

```
approved process requirement / criterion
  -> determines the relevant authoritative source
  -> permission filtering happens first
  -> authoritative information is retrieved
  -> Compass surfaces the relevant fact
  -> provenance is shown
  -> the human remains responsible for the decision
```

Criterion *"live formal disciplinary warning"* → relevant authoritative source is
**Current formal warnings**, not the whole Activity history. Different criteria
may require different authoritative sources. Do not build a generic mechanism
where AI simply reads everything about every employee.

### 8. Deterministic facts versus AI

Where a fact is determinable from authoritative structured data, use
deterministic logic. *"Does this employee currently have a live formal warning?"*
must **not** require AI — it uses the existing authoritative warning logic.

AI may later help identify potentially relevant unstructured information, explain
authorised information, summarise evidence, and highlight records for human
review. AI must not replace deterministic logic where the answer already exists
in structured authoritative data.

### 9. Potentially relevant history

For less deterministic situations Compass may eventually surface *"potentially
relevant employee history"* — for example, prior authorised activity on
timekeeping, lateness, attendance expectations or previous management concerns
where an investigation concerns repeated lateness.

Compass must **not**: automatically treat that history as evidence; automatically
attach it to the process; state that misconduct is proven; automatically escalate;
automatically increase sanction; treat a Letter of Concern as a warning; infer
repetition without showing the underlying source; or expose records the viewer is
not independently authorised to access. **The human decides relevance.**

### 10. Provenance

Any Employee File information surfaced into another process retains provenance —
what it is, its authoritative source, when it was issued, when it expires, and
why it is being shown (which criterion it matches). Where authorised, the user may
open the source. Source data must never be silently copied.

### 11. Permission filtering first — non-negotiable

Access to an organisation-level process does **not** grant unrestricted Employee
File access. The sequence is:

```
authorisation -> relevant source selection -> permission filtering
              -> retrieval -> relevance -> display
```

Never: retrieve everything, then let AI decide what the user should see.

A user must not learn through relevance surfacing that a hidden process, a
confidential activity, a protected disclosure, or a hidden document exists.
**No hidden-object leakage.**

### 12. Whistleblowing privacy

If Sarah is the whistleblower, Sarah's Employee File does not automatically show
*"Whistleblowing process — Fraud allegation"*. John's does not automatically show
*"Subject of whistleblowing allegation"*. Emma's does not automatically show
*"Witness in whistleblowing investigation"*. Participation is held within the
protected organisation-level process.

Only subsequent employee-owned employment actions appear in an Employee File where
they genuinely belong. Where authorised findings identify potential misconduct by
John and a human decides a disciplinary process should commence, **that
disciplinary process** belongs to John's Employee File. The whistleblowing process
itself is never converted or copied into it.

### 13. Redundancy privacy and fairness

Employee File facts may be surfaced only where relevant to an approved selection
criterion or another legitimate process requirement. Unrelated history must not be
exposed merely because the employee is in the pool — not wellbeing conversations,
unrelated grievances, whistleblowing involvement, medical information, or informal
Letters of Concern — unless a separately justified and authorised requirement
genuinely needs it.

> Compass intelligence should **reduce** irrelevant information, not maximise what
> is shown.

### 14. Human decision-making

Compass may retrieve authoritative facts, calculate deterministic criterion
inputs, identify potentially relevant authorised records, explain provenance, flag
missing information, identify inconsistencies, and prompt human review.

Compass must not make the substantive employment decision. It may say *"John
Smith has one live formal warning matching this selection criterion."* It must not
conclude *"John should therefore be selected for redundancy."* It may surface
potentially relevant timekeeping history; it must not conclude *"this proves
misconduct."*

### 15. High-level domain model

```
ORGANISATION
├── EMPLOYEE FILES
│   ├── Employee activities
│   ├── Employment events
│   ├── Employee-owned HR processes
│   └── Employee-authoritative documents
│
├── ORGANISATION-LEVEL PROCESSES
│   ├── Whistleblowing
│   ├── Redundancy where organisational / collective
│   └── Future multi-person / protected processes
│
└── PERMISSION-SAFE RELEVANCE / INTELLIGENCE LAYER
    └── Surfaces authoritative information between domains where relevant
```

This is conceptual. A generic "intelligence" database table must **not** be
created merely because it appears in this diagram.

### 16. Cases navigation

Global **Cases** should eventually be the operational work queue for authorised
structured HR/ER processes, and may contain both employee-owned formal processes
and organisation-level processes.

Employee File → HR Processes contains **only** processes genuinely owned by that
employee. Organisation-level processes must not be forced into an Employee File
merely so they can appear in Cases.

### 17. Employee File Activity

Employee File → Activity remains the employee's authorised employment and
management history. It is **not** a universal log of every Compass object that
references the employee.

- **Reference ≠ ownership.**
- **Participation ≠ Employee File history.**

### 18. Requirements for future implementation

When organisation-level processes are implemented or redesigned, their
architecture must support: organisation ownership; optional multiple
employee/person relationships; role-based participation; process-specific access;
protected/confidential processes; authoritative-source references; permission-safe
relevance surfacing; deterministic structured facts where available; AI-assisted
relevance only where appropriate; provenance; and explicit human decision-making.

---

## AD-003 — Canonical employee location, and what it does and does not authorise

**Status:** **implemented** in phase E1.5 (2026-09-27).

### The relationship

`employee_records.location_id UUID` referencing `locations(id)` is the canonical
current location of an employee. Same-organisation integrity is enforced by the
database — a composite foreign key on `(location_id, org_id)` referencing
`locations(id, org_id)` — not by application validation.

`employee_records.location`, the pre-existing free-text column, is **not
authoritative and never determines permission.** It is retained for display and
historical context. It is not dropped, not rewritten, and deliberately **not kept
synchronised** with `location_id`.

### NULL means HR-only, and fails closed

`location_id IS NULL` means the employee is reachable only by organisation-wide
roles, never by a Location Manager. This is a fail-closed rule: absence of a
location removes access rather than widening it.

**Location Manager authority never becomes organisation-wide.** In particular, a
Location Manager whose authorised location list is *empty* sees **nothing**. This
is a deliberate divergence from the older `can_access_case_location()`, whose
first clause returns true for any user who is not a location-scoped manager *with
locations assigned* — meaning an empty list grants everything. Since
`org_members.location_ids` defaults to `'{}'`, that fail-open case is the default
state of a new row. The employee predicate `can_access_employee()` must never be
rewritten in that shape.

### Only one role was narrowed

Compass has seven roles; only `location_manager` is location-scoped
(`LOCATION_SCOPED_ROLES`). E1.5 narrowed employee visibility for that role alone.
`hr_director`, `hr_manager`, `line_manager`, `investigator`, `legal_reviewer` and
`auditor` keep the organisation-wide employee scope they already had, including
unassigned employees.

Read and write predicates are **separate on purpose**. `can_access_employee()`
governs SELECT and returns true for every organisation-wide role.
`is_location_manager_for()` governs the scoped write paths and names the role
explicitly. Reusing the read predicate for INSERT/UPDATE would hand employee-write
privileges to four roles that have never had them.

### A Location Manager cannot move an employee between scopes

In E1.5 a Location Manager may create and edit employees inside their authorised
locations, but **may not change `location_id`** — not even for an employee they
otherwise fully manage. Changing canonical location moves a person into or out of
a permission scope, so it is an explicit HR action, enforced by a column guard
trigger rather than by RLS (a `WITH CHECK` expression cannot see the old row).

Canonical location reassignment is HR-controlled. E1.7's employment events may
later implement a deliberate scoped workflow; until then this is the bounded rule.

### Assignment is reconciliation, never inference

Canonical location is assigned by explicit human selection through
`set_employee_location()` — HR only, same-organisation enforced, optimistic on
`updated_at`, and audited old → new in the same transaction with real employee
parentage (`audit_log.employee_id`).

**No automatic mapping from legacy free text to a canonical UUID**, ever, and no
fuzzy matching. At the time of E1.5, all five of Compass LTD's free-text values
matched a canonical location name exactly — which is precisely why automating it
would feel helpful and be wrong. The match is a coincidence of spelling, not a
record of anyone's decision. The same organisation holds both `London` and
`London Soho`, which is what fuzzy matching would get wrong first.

### Historical context must not be rewritten

When an employee's `location_id` changes, historical activity must retain the
location context it had at the time it occurred. A location change is a change to
the employee's *current* state, never a retroactive edit of their history. There
are no employee activities yet (E1.6), and no employment events yet (E1.7) — this
rule exists so that neither is built in a way that violates it.

### Location lifecycle

`locations` has no active/inactive column, so there is no deactivation concept to
respect. `employee_records.location_id` is the first referential link to the table,
and it uses `ON DELETE RESTRICT`: deleting a location that still has employees is
blocked. `ON DELETE SET NULL` was rejected because it would silently move every
employee at that location into the HR-only unassigned pool without anyone
deciding to — a silent reclassification of customer data.

Consequence to be aware of: `locations.org_id` cascades from `organisations`, so
deleting an organisation row would now be blocked while any of its employees hold
a location. No application path deletes an organisation (the billing webhook
PATCHes it; "Delete all data" deliberately preserves `locations`), so this is
reachable only by manual database administration.

---

## AD-004 — The case access boundary

**Status:** **implemented** in phases E1.5A (employee roster cache) and E1.5B
(case cache, orphaned location predicate). Recorded 2026-09-27.

### Case access is the three-level model, and location is not part of it

Case visibility is decided by `org_members.case_access_level` and `case_access`:

| Level | Sees |
|---|---|
| **1** | every case in the organisation, confidential ones included |
| **2** | cases they created, plus any case they hold `case_access` on |
| **3** | cases they hold `case_access` on, only |

Roles map to levels: `hr_director`, `hr_manager`, `legal_reviewer`, `auditor` → 1;
`location_manager`, `line_manager` → 2; `investigator` → 3. **An unrecognised role
falls to Level 3, never Level 1.**

Enforced by a permissive base policy (own organisation *or* an explicit
`case_access` row) **AND** restrictive per-command policies carrying the level
rule. Postgres requires *(any permissive) AND (all restrictive)*, so the
restrictive policies narrow the base rather than competing with it.

> **An employee's location plays no part in case access.** Verified against
> production: a Location Manager authorised for the very location a case belongs
> to cannot see that case unless they created it or hold `case_access` on it.

### Empty or NULL Location Manager location scope grants nothing

**No authorised locations = no location-derived access.** This is now
unconditionally true because there *is* no location-derived case access: a
Location Manager with an empty list sees exactly the same set as one with
locations — their own created cases and their explicit assignments.

`can_access_case_location()` was **removed** in E1.5B rather than repaired. Its
leading clause returned true for any caller who was not a location-scoped manager
*with locations assigned*, so an empty `location_ids` (the column default, `'{}'`)
passed it for every location. The audit established it was an orphan: referenced
by zero policies, functions, views, triggers and constraints, with `EXECUTE`
granted only to `postgres` and `service_role`. Repairing an unused fail-open
predicate would have left a second, competing answer to a question the three-level
model already answers — and a plausible-looking "location helper that already
exists" is exactly what the next person reaches for.

Nothing replaced it. Location-derived case access, if ever wanted, needs its own
decision against the approved model.

### Confidentiality is the same rule, not a separate one

There is deliberately **no confidential-case SELECT policy.** Level 1 sees
confidential cases under the same unconditional rule as every other case, and
Level 2/3's confidential rule is *identical* to their ordinary rule, so a separate
gate would only restate it. The stated goal when this was approved was **"do not
retain a hidden role-specific confidential exception."**

Consequence to keep in mind: an **HR Manager is Level 1 and does see confidential
cases.** Confidential status restricts who may *change* a case
(`protect_confidential_case_write`) and records sensitivity; it is not a read
cloak. `hasConfidentialOversight()` (HR Director, Legal, Auditor) governs
oversight features, not case readability.

### Persistent browser storage cannot extend case authorisation

**Neither the employee roster nor the case list is persisted client-side.**

`compass_cases` held up to 500 full case objects and seeded React state in a
`useState` initialiser, so the first paint after any load reflected whatever the
browser last held — captured under whatever permissions applied then. A case
object is not a summary: it carries meeting records and transcripts, the
investigation report, the outcome and its warning dates, the employee's own appeal
text, evidence, the confidential flag, and occupational-health and fit-note dates
(special-category health data), plus redundancy pay and age inputs.

The rules, applying to both caches:

- **Never persisted.** The authoritative RLS-filtered response is the only source.
- **Replaced, never merged.** Merging a narrower response into a broader previous
  set preserves exactly the records the server just declined to return.
- **Fail closed on fetch failure.** A failed load empties the list. A record must
  never remain visible because the browser still remembers it.
- **Purged at module load**, before any component can read it, for every
  organisation and including un-namespaced pre-org-scoping copies. Ceasing to
  write a key does nothing for browsers that already hold one.
- **Cleared on authentication identity change**, not only on an explicit sign-out
  — org-scoping is no defence when two users share one organisation.
- Both keys stay in the global sensitive sweep as defence in depth.

**RLS is never reproduced in JavaScript.** No client-side "authorised set" is
calculated or persisted; a second copy of an authorisation rule is the copy people
end up trusting.

---

## AD-005 — Employee Activities

**Status:** **implemented** in phase E1.6 (2026-09-27). First implementation phase
of the approved Employee File product model.

### Not everything is a case

An Employee Activity is employee-owned management history that is **not** a formal
ER process: `one_to_one`, `return_to_work`, `conversation`, `management_concern`.
They are **not** case types and are never converted into cases. Recording a 1:1 as
a case would drag hearings, investigations, outcomes and sanctions behind it, and
an informal concern would acquire disciplinary machinery nobody chose.

Product language is natural — 1:1, Return to Work, Conversation, Management
Concern — and database enum values are never shown to a user.

### Two tables: the matter, and its chronology

`employee_activities` is the management matter. `employee_activity_records` is the
chronology inside it (`conversation`, `follow_up`, `note`, `letter_of_concern`,
`communication`). Without the second table every follow-up would have to become a
new activity, which is the same mistake as making every follow-up a new case.

### Lifecycle vocabularies are NOT shared

A completed 1:1 is **not** "resolved"; a management concern is **not**
"completed". Two columns, never one shared enum:

- ordinary activities: `lifecycle_state ∈ draft | scheduled | in_progress | completed | cancelled`
- management concerns: `concern_state ∈ open | resolved`

A CHECK constraint makes the wrong pairing **unstorable**, not merely
discouraged — a concern must have a concern state and no lifecycle state, and
every other type the reverse. Resolution metadata is likewise constrained to a
resolved concern.

### occurred_at is not created_at

`occurred_at` is when it happened and may be in the past; `created_at` is when the
system record was made. A conversation held on 15 September and recorded on 27
September belongs in employment history on the 15th. **`created_at` is never
back-dated to simulate retrospective history**, and the UI states when something
was recorded later rather than disguising it.

### Location is context, not authority

`employee_activities.location_id` is a snapshot of the location **at occurrence**,
so a later transfer cannot rewrite where a conversation happened. It plays **no
part in access control** — authorisation always follows the employee. Using it
would mean a transfer silently changed who could read history.

### Authorisation is inherited, not restated

Activity RLS is `EXISTS (SELECT 1 FROM employee_records WHERE id = employee_id)`.
Because `employee_records` has its own RLS, that subquery only finds employees the
caller is authorised for, so:

- activity visibility can never exceed Employee File visibility;
- it cannot drift out of step with `can_access_employee()`, because it does not
  duplicate it;
- a Location Manager reaches only their authorised locations' employees, never an
  unassigned employee;
- child records inherit from the activity, which inherits from the employee, so
  knowing a record uuid discloses nothing.

There is **no DELETE policy**: employment history is not something a manager
removes because they would rather it had not happened.

Case access is **not** the authority for activities, and `case_access_level` plays
no part.

### Parentage is declared, then frozen

Composite foreign keys carry tenancy and identity together — `(employee_id,
org_id)` must exist on `employee_records`, and a record's `(activity_id, org_id,
employee_id)` triple must exist on its parent. Cross-tenant and cross-employee
parentage is therefore unrepresentable, not merely forbidden. Guard triggers then
prevent re-pointing an existing row at a different employee, organisation or
activity.

Identity is `employee_id` only. **No name parentage, no name fallback, no merging
of same-name employees** — in the domain, the writes, or the DSAR package.

### A Letter of Concern is not a warning

It is informal management action and meaningful employee history. The separation
is **structural**, not a label: a Letter of Concern is a `record_type` on
`employee_activity_records`, there is no warning column to populate and no expiry
to invent, and Current Warnings derives only from cases and allegations. A formal
warning is not even a valid `record_type`. No informal activity escalates a
sanction automatically.

### Resolution preserves history

A resolved management concern keeps its full chronology and stays in Activity. It
simply stops being current, and stops appearing in "needs your attention". A
recorded 1:1 never appears there at all — it is history, not a task.

### Employee File information architecture

Four tabs: **Overview, Activity, HR Processes, Documents**. Timeline and Meetings
were both chronological views of the same history and are now one Activity tab —
activities with their own chronology, formal process milestones, and meetings
reached through an authorised case. Meetings held outside a case remain absent
because `public.meetings` has no `employee_id`.

Activity is a **projection**, not a table dump.

### Audit and privacy

Activity audit is written by an **AFTER trigger**, not by the client or an RPC
wrapper: `audit_log` has no INSERT policy, and a trigger cannot be forgotten by a
new code path. `audit_log.employee_activity_id` mirrors `case_id` and
`employee_id`; **no activity event borrows a case_id as fake parentage.** The seven
activity actions are reserved against the generic audit RPC.

Activities are **never persisted to localStorage**, and a failed load fails closed
— AD-004's rule applies unchanged.

### Deliberately not built

Employment events (E1.7). Any migration of legacy `case_type='informal'` cases,
wellbeing notes, meetings or return-to-work history. Relevance-history
intelligence, AI scoring and automatic escalation. Competency frameworks, OKRs,
performance ratings, development matrices or succession planning — **Compass
records the management conversation; it does not manage the employee's development
programme.**

---

## AD-006 — Employment Events, leavers and Archive

**Status:** **implemented** in phase E1.7 (2026-09-27).

### A peer domain

Employment Events sit alongside Employee Activities (AD-005) and employee-owned HR
Processes under the Employee File. They are not activities, not cases, and never
converted into either. Canonical `employee_id` parentage; no case is ever borrowed
as fake parentage.

### Current state is RESOLVED, never written ahead of time

This is the whole architecture:

```
current state  =  base employee record
               +  events whose effective_date has arrived
               +  today
```

A promotion recorded on 27 September and effective 1 November changes nothing
until 1 November, and then changes it with **no scheduler having run**. There is no
cron, no `setTimeout`, no background job, and the browser never mutates
security-critical state.

Resolution exists twice, deliberately: in SQL
(`effective_employee_location`, `effective_employment_status`) because RLS needs
it, and in JS for the read model. The SQL is the authority.

### Location, RLS and the future-transfer problem

`employee_records.location_id` remains the **base** canonical location and is
**never written with a future value**. RLS now reads
`can_access_employee(org_id, effective_employee_location(id))` instead of the raw
column — one narrowly-substituted predicate.

Consequences, verified against production:

- a future transfer grants the **target** location's manager nothing early;
- it removes nothing from the **source** location's manager early;
- on the effective date access moves, with nothing having run in between;
- with no events the function returns the base column, so behaviour is identical
  for every employee who has none.

Cancelled and future events are excluded by construction, not by a caller
remembering to filter.

### Location Manager transfers — DECISION REQUIRED, not guessed

A Location Manager may record every employment change **except a location
transfer**, which is HR-only, enforced in the INSERT policy.

E1.5/AD-003 deferred "may a Location Manager move an employee, and to which
locations" to this phase without deciding it. Rather than guess, the fail-closed
behaviour ships: no Location Manager can enlarge or manipulate their own scope
through a transfer. **The open question is whether they may target any same-org
location, or only one they are independently authorised for.** Until answered,
HR-only stands.

### Correction is not a change

| | Correct employee details | Record employment change |
|---|---|---|
| Fixes | data recorded wrongly | the employment itself |
| Effective date | none | required, may be future |
| Creates an event | **no** | yes |
| In Activity | **no** | yes |
| Audited | yes (`Employee details corrected`) | yes |

The correction audit is a trigger on `employee_records`, so no code path can
correct details silently. It deliberately excludes `location_id`, which has its own
authoritative operation and its own event type.

### Old → new is always preserved

Typed columns, not a JSON dumping ground: one text pair for job title / department
/ manager / working pattern, one uuid pair for location so the same-organisation
foreign key still applies. A CHECK enforces the right pair for the right type, so
"Promoted" with no values is not storable.

Only changes backed by a **real** employee field exist. `contractual_hours_changed`
is absent because no such column exists. `employment_started` is absent because
`start_date` is legacy text and 14 of the 17 populated production values are not
ISO dates — it cannot be read as a date without guessing.

### Leavers and Archive are a projection

"Mark as leaver" records an effective-dated `employment_ended` event. Nothing is
moved, copied or deleted.

- Before the leaving date: **People**, still a current employee.
- From the leaving date: **Archive**, same Employee File, same UUID, full history.

Archive is a **view** over `employee_records` filtered by effective employment
state. There is no `archived_employees` table and no second employee store. No
manager opening a record triggers the move, and no cron performs it.

**Archived Employee File access** follows the unchanged employee predicate: a
leaving event does not change location, so a Location Manager retains access to a
former employee at their location. That is the existing behaviour rather than a new
entitlement — revoking it would be an invention. **Flagged as a product decision.**

### History is corrected or cancelled, never deleted

A future event may be corrected. Once **effective**, its substance is frozen by
trigger — record a further change instead. Cancellation keeps the row, says it was
cancelled, records who and why, and stops it counting toward current state;
reinstating is refused, because un-cancelling would make the audit trail a lie.
There is no DELETE policy on the table.

### Historical activity location is immutable

When an employee's location changes, `employee_activities.location_id` is **never**
rewritten. A January 1:1 in London stays London after a March move to Manchester.
Asserted across every write surface, not just the activity module.

### Rehire

Never create or merge an employee by name, and never overwrite previous employment
history. An `employee_number` or `work_email` collision is **not** identity proof
without an approved rule. No rehire workflow was implemented.

### Boundaries

Employment events do not alter **Current Warnings**, which remain formal-case
derived only — a promotion, transfer, manager change or leaving date is not a
warning, and the event table has no warning or sanction column. Formal-case access
still follows the three-level model (AD-004); location remains not a case-access
path. DSAR includes events keyed on `employee_id` with **no name fallback**, and
the table is in the erasure list. Events are never persisted to localStorage and a
failed load fails closed (AD-004's rule).

Legacy `leaver_instances` (107 rows, no `employee_id`, name-based) is **not
migrated and not attached**; it has no write route in the application.
`start_date`/`end_date` are **not converted** — effective dates live on the event
table as a proper `DATE`.

---

## AD-002 — A process type only receives what Compass owns for it

**Status:** **implemented** in phases E1.4 (next-step guidance) and E1.4A (stage
model).

A process type receives guidance or a stage sequence only where Compass owns a
validated model for it. There is no default and no fall-through.

Compass owns both halves for exactly five process types: **misconduct**
(including its `investigation`, `disciplinary` and `conduct concern` synonyms),
**grievance**, **probation**, **flexible working**, **long-term sickness**.

Every other type — `capability`/`performance`, `attendance`/`absence`,
`redundancy`, standalone `appeal`, `other`, and any unrecognised or unrecorded
type — receives no guided next step and no stage sequence. The UI says so plainly
and does not imply the case is broken.

The two halves must agree: a type with no recipe must have no stage sequence, and
the reverse. A test asserts this across every known type string, because the
defect these phases closed was precisely those two answers disagreeing.

**Not a licence to invent.** Adding a process type to either model requires a
validated process design, not a plausible-looking stage list.

The `appeal` **stage** of a misconduct process is not the same thing as a case
typed `appeal`. The validated progression
`investigation → disciplinary → appeal → closure` inside one misconduct case is
unaffected by anything above.
