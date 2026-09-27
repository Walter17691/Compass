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
