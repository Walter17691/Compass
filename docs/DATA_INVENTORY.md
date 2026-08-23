# Compass — Data Inventory & Privacy Lifecycle

Phase 6.5 hardening (data-lifecycle review). Built from a direct, live query
of the production schema (`information_schema`, `pg_policies`,
`pg_constraint`) on 2026-08-22/23 — not assumed from memory or from what the
application code appears to write. Every table in `public` is listed;
nothing is omitted because it looked unimportant.

## How to read this

For each table: what it holds, whether it's tenant-scoped (`org_id`), how
it's deleted when an org clears its data, whether a data subject's records
in it reach a DSAR export, and anything notable found during the review.

Categories referenced below map to the ones this review was asked to
inventory: employee personal data, allegations, investigation notes,
meeting transcripts, witness information, wellbeing information,
health/disability information, concern referrals, leaver information,
signatures, HR review information, audit records, tasks, case signals,
documents, AI-generated case information.

## Tables holding personal/ER data

| Table | Holds | `org_id`? | Cleared by org delete | Reaches DSAR export |
|---|---|---|---|---|
| `cases` | Employee name/email, description, outcome, investigation report, HR review comments, `meetings` (jsonb — **includes full transcripts, structured records, letters**), `evidence` (jsonb — file metadata + content), `vault_docs`, `oh_process` (health/disability-adjacent dates: fit note, OH referral) | ✅ | ✅ (direct delete) | ✅ |
| `allegations` | Description, people involved, employee response, witness evidence, investigator finding, outstanding uncertainty, decision/appeal reasoning | ✅ | ✅ (cascades from `cases`) | ✅ |
| `case_signals` | AI-generated reasoning, source refs (may point at meetings/evidence) | ✅ | ✅ (cascades from `cases`) | ✅ |
| `case_tasks` | Task name, owner; `case_id` **nullable** (org-level tasks with no case) | ✅ | ✅ (direct delete — see note below) | ✅ (added this review) |
| `case_themes` | Theme tag on a case (no free text) | ✅ | ✅ (cascades from `cases`) | — (not personal data; a taxonomy tag) |
| `case_access` | Who has what role on a case | ✅ | ✅ (cascades from `cases`) | — (access-control metadata, not exported; could be added if ever required) |
| `case_views` | `last_viewed_at` per user per case | ✅ | ✅ (direct delete — added this review) | — (low sensitivity; not exported) |
| `meetings` | **Dead/legacy table** — `case_id` FK with CASCADE exists, but 0 rows and no code path anywhere writes or reads it (`cases.meetings` jsonb is the real, live storage). Left as-is; flagged for a future cleanup migration to drop it outright, not touched here. | ❌ (no `org_id` column at all) | n/a (empty) | n/a |
| `wellbeing_notes` | Employee name, note content (**mental health/wellbeing — special category data**), support offered | ✅ | ✅ (direct delete) | ✅ |
| `concern_referrals` | Employee name, description, witnesses, evidence description/files, AI summary/considerations | ✅ | ✅ (direct delete) | ✅ |
| `hr_review_requests` | Case employee name, review comments, `record_snapshot` (a meeting record snapshot) | ✅ | ✅ (direct delete) | ✅ |
| `audit_log` | User name, action, free-text detail, `case_id` | ✅ | ✅ (direct delete — see note below) | ✅ (case-linked entries only) |
| `signing_requests` | Employee name/email, manager name/email, **the actual document text and signature** | ✅ | ✅ (direct delete — **added this review**, was previously left behind entirely) | ✅ (**added this review** — zero client-facing RLS, needed a new lookup path) |
| `employee_records` | Name, job title, department, manager, employee number, start/probation dates | ✅ | ✅ (direct delete — **added this review**, was the single biggest miss: no FK to `cases`, matched only by name string) | ✅ |
| `employee_portal_accounts` | Employee name/email, `user_id` (portal login) | ✅ | ✅ (direct delete — **added this review**) | ✅ (**added this review**) |
| `employee_portal_invites` | Employee name/email, invite token | ✅ | ✅ (direct delete — **added this review**) | — (pending-invite bookkeeping; not currently exported, low priority to add) |
| `starter_instances` | Name, email, manager, department, checklist tasks | ✅ | ✅ (direct delete) | ✅ (onboarding) |
| `leaver_instances` | Name, email, exit interview notes (**can contain sensitive reasons for leaving**), checklist tasks | ✅ | ✅ (direct delete) | ✅ (offboarding) |
| `dsar_requests` | The DSAR subject's own name, notes | ✅ | ✅ (direct delete) | — (a record *of* the request, not exported *in* the response; low priority) |
| `improvement_initiatives` | AI-generated, case-derived improvement suggestions | ✅ | ✅ (direct delete — **added this review**) | — (aggregate/anti-attribution by design; not linkable to one individual) |
| `manager_capability_insights` | AI-generated insight about a named manager | ✅ | ✅ (direct delete — **added this review**) | — (same reasoning; a genuine future DSAR-for-a-manager feature would need to add this) |
| `er_executive_briefs` | AI-generated narrative, supporting aggregate data | ✅ | ✅ (direct delete — **added this review**) | — (aggregate by design) |
| `org_events` | Org-level event description (restructuring, redundancy announcements) | ✅ | ✅ (direct delete — **added this review**) | — (org-level, not personal) |
| `integration_events` | `user_id`, OAuth sync status/detail | ✅ | ✅ (direct delete — **added this review**) | — (technical/operational log) |

## Tables that are org-structure/config, not case or employee content

Deliberately **excluded** from "Delete all data" — the button has always
promised to clear case/employee working data, not the account/team
structure itself (removing teammates or the org is a different, bigger
action). Confirmed each holds no case/employee content:

`organisations`, `org_members`, `org_roles`, `locations`, `process_templates`,
`organisation_themes`, `calendar_connections`, `calendar_synced_events`,
`graph_mail_connections`.

`calendar_connections`/`graph_mail_connections` hold OAuth `access_token`/
`refresh_token` — sensitive, but user-level integration credentials, not ER
data; out of scope for this review.

## Anomalies found (schema-level)

- **`profiles`** — no `org_id`, no foreign key to anything, 0 rows, no code
  anywhere reads or writes it (`grep -rn "from('profiles')"` across
  `src/` and `api/` returns nothing). Legacy/dead. Not touched — dropping a
  table is a bigger, separate decision — but flagged here so it isn't
  mistaken for a live, unscoped data-integrity gap.
- **`meetings`** — see table above. Same posture: dead, flagged, not touched.
- **`api_rate_limits`** — no `org_id`; keyed by an opaque `rate_key` string
  (e.g. `signing-create:<userId>`), short window, self-expiring. This is
  abuse-prevention bookkeeping, not personal/ER data — correctly out of
  scope for DSAR/deletion.
- **`cases.org_id`** and **`employee_records.org_id`** are the only two
  `NO ACTION` foreign keys to `organisations` in the whole schema (every
  other table cascades). This only matters if a genuine "delete the
  `organisations` row itself" feature is ever built — no such feature
  exists today (the current "Delete all data" button explicitly leaves
  the org row alone), so this doesn't block anything currently in
  product, but a future org-deletion feature would need to clear these
  two tables' rows before the `organisations` row itself, same as this
  review's `delete-org-data.js` already does explicitly.

## `localStorage` (client-side)

Full audit already completed in the previous hardening pass (High —
security review). Summary: 14 org-scoped keys (`compass_cases`,
`compass_wellbeing`, `compass_employees`, `compass_meeting_draft`, and 10
others), all namespaced by org id (`src/lib/storage.js`'s `orgScopedKey`)
so one org's browser cache can never seed another's. `clearAllOrgScopedData()`
now wipes every one of them, for every org this browser has ever cached data
for, on sign-out and on "Delete all data." See that pass's own commit for
the full key-by-key breakdown.

## DSAR compiler coverage (`src/lib/dsarCompile.js`)

Before this review: cases (+ embedded meetings/evidence), employee record,
onboarding/offboarding, wellbeing notes, concern referrals, allegations,
case signals, HR review requests, audit log (case-linked only).

Added this review: `case_tasks` (the "tasks" category), `signing_requests`
and `employee_portal_accounts` (both required a new lookup —
`api/portal/_dsar-lookup.js` — since neither has any client-facing RLS at
all; the compiler genuinely had no query path to either before).

**Same-name collision detection**: a name is not a stable identity.
`compileSubjectData` now flags `possibleNameCollision` when either more
than one `employee_records` row shares the exact subject name, or the
subject's own matched cases carry more than one distinct `employee_email`
between them — surfaced as a warning in the DSAR screen UI, never
auto-resolved (there's no reliable signal to pick the "right" person from a
name alone; the same "flag for a human, don't guess" posture the existing
third-party-mention flagging already uses).

**Third-party mention flagging** (pre-existing, unchanged): free-text
fields are scanned for other known names and flagged for human review
before a response goes out — never auto-redacted. Now also covers
`signing_requests.document`.

**Not currently in the DSAR export, on purpose**: `employee_portal_invites`
(pending-invite bookkeeping, not established personal history — low
priority), `improvement_initiatives`/`manager_capability_insights`/
`er_executive_briefs` (aggregate, anti-attribution by design — Phase 6's
own stated privacy constraint is that these must never be traceable to one
named individual, so including them in a *subject* export would be a
category error, not an omission).

## Organisation deletion (`api/delete-org-data.js`)

Before this review, `ORG_SCOPED_TABLES` covered 9 tables. A live FK-cascade
check against the real schema found the actual coverage (direct delete +
cascade) was correct for cases/allegations/case_signals/case_themes, but
missed ten more org-scoped tables entirely — see the table above, each
marked "**added this review**." All ten were confirmed live to have no
other path to being cleared (no FK cascade, no case_id at all in most
cases). The confirm dialog text was also out of sync with actual behaviour
(never mentioned wellbeing notes or concern referrals, which were already
silently included) — corrected to list everything the button now actually
removes.

The deletion event itself is now recorded as a fresh `audit_log` row,
written *after* the org's previous audit trail is cleared — otherwise the
standard compliance record of "who deleted this org's data, and when"
would itself be a casualty of the action it's meant to record. No
case/employee specifics in that entry, per the "no unnecessary sensitive
detail in the audit log" principle.

## Data export (`exportAllData`, Settings → Data & privacy)

Before this review: `cases`, `policies`, `auditLog`, `adjustments` only.
Now includes every category `delete-org-data.js` and the DSAR compiler
treat as real tenant data — `employeeRecords`, `wellbeingNotes`,
`concernReferrals`, `allegations`, `caseSignals`, `caseTasks`,
`hrReviewRequests`, `starterInstances`, `leaverInstances`, `dsarRequests`,
plus `signingRequests`/`portalAccounts` via the same new lookup endpoint
(called without an `employeeName` filter, returning every row for the
org instead of one subject's).

## Employee deletion / retention — assessment, not built

**Compass currently has no retention, anonymisation, or deletion workflow
for individual employee records at all** — everything is kept indefinitely
until an org explicitly runs "Delete all data" (which erases everything,
not one employee selectively).

Under UK employment law, retention periods genuinely vary by record type —
this is a real legal question, not something to decide unilaterally in a
hardening pass:
- Basic employment records are commonly retained for the length of
  employment plus a further period (6 years is a common conservative
  figure, aligned with the general 6-year limitation period for contract
  claims in England & Wales).
- Tribunal claim time limits are short (typically 3 months less one day
  from the relevant act for most ET claims), but the *practical* retention
  window HR teams use is usually much longer than that limit, precisely
  because litigation risk and reference/pension queries can surface years
  later.
- Special category data (health/disability information — this app's own
  wellbeing notes and OH-process fields) carries a stricter UK GDPR
  minimisation expectation: keep only as long as actually necessary for
  the purpose, which may argue for a *shorter* retention window than
  ordinary personnel records, not a longer one.

Given this is a genuine legal/product decision — not something to guess —
this review deliberately did **not** build automated deletion or
anonymisation logic. What it did add: `organisations.data_retention_years`
(nullable, additive), configurable per org from Settings → Data & privacy,
with UI copy stating explicitly that it is informational only. **Nothing
in the codebase currently reads or acts on this value.** It exists so an
org can record its own policy now, without Compass silently deciding for
them what "too old" means and deleting real case evidence on a timer.

**Recommended next steps, in order:**
1. Get real employment-law input on which record types need which
   retention periods (the same "flag for legal sign-off, don't guess"
   posture already applied to the tribunal basic-award formula earlier in
   this hardening effort).
2. Design a **legal hold** flag (e.g. on `cases`) that can exempt a
   specific case from any future automated retention action — build this
   *before* any automated deletion logic, not after.
3. Build the actual retention workflow as a **human-reviewed queue**
   ("these N records are past your configured retention period — review
   and confirm before anything is removed"), not a silent background job,
   mirroring the same "AI/automation flags, a human decides" posture this
   whole hardening effort has used everywhere else (third-party DSAR
   mentions, evidence review, guardrail suggestions).

## Audit logging of privacy actions

| Action | Logged? |
|---|---|
| DSAR data compiled | ✅ **Added this review** — `audit("DSAR data compiled", req.employeeName)`, in `DsarScreen.jsx`'s `compile()`. |
| DSAR response downloaded | ✅ **Added this review** — `audit("DSAR response downloaded", req.employeeName)`, on the download button itself. |
| Data exported (org-wide) | ✅ `audit("Data exported (GDPR)")` — pre-existing. |
| Organisation data deleted | ✅ **Added this review** — recorded server-side as the sole surviving `audit_log` row after the wipe (see above). |
| Retention policy changed | ✅ **Added this review** — `audit("Data retention policy updated", ...)`, records the new value only (a number of years), not any record content. |

None of these entries include case content, employee free-text fields, or
other sensitive detail — only the fact that the action happened, who did
it, and (for retention) the configured number.
