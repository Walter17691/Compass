# Compass — Platform Consistency Matrix

**Purpose: prevent accidental architectural forks.**

Compass is one platform with case-type-appropriate process recipes. It is not
a misconduct product with other case types bolted on. Where several places
answer the same question, exactly one of them should be canonical and the
rest should be scheduled to migrate — or documented as an intentional
exception.

This document is **not** permission to redesign any of the areas listed. It is
the register that makes the question answerable for every future phase:

- what common primitive exists?
- who uses it?
- who still uses legacy behaviour, and why?
- when does it migrate?

Created 2026-09-22 (Release 1 Phase 1). Seeded from a codebase-wide inventory
of `src/` and `api/`.

**Consumer classification**

| Class | Meaning |
|---|---|
| **A** | Migrated to the canonical primitive in Phase 1 |
| **B** | Keeps the existing canonical legacy helper for now, with reason |
| **C** | Intentionally a different semantic question — must **not** use the lifecycle helper |
| **D** | Legacy duplicate logic, migrates in a later phase |

---

## 1. Meeting and workflow concepts

### Meeting classification — "is this a genuine meeting or a letter artefact?"

- **Canonical primitive** `isLetterOnlyRecord` / `isGenuineMeetingRecord` — `src/lib/caseStage.js`
- **Target phase** — already canonical (shipped 2026-09-20)
- **Status** CONSISTENT

| Consumer | Class | Note |
|---|---|---|
| `src/lib/meetingLifecycle.js` | A | Delegates; adds a non-contradictory object-shape guard |
| `src/lib/appealInvitation.js:26` | B | Already canonical |
| `src/lib/processTimeline.js:49,63` | B | Already canonical |
| `src/lib/meetingPrepGrounding.js:84` | B | Already canonical |
| `src/screens/HomeMeetingScreen.jsx:68` | B | Already canonical |
| `src/App.jsx:7156` (`isLetterOnlySave`) | B | Already canonical |
| `src/App.jsx:7966` (prior-meeting AI context) | B | Already canonical |

**Intentional exception.** `hasLetterType(meetings, type)` deliberately reads
the **unfiltered** collection. "Which genuine meeting happened last?" and "was
a letter of type X ever saved?" are different questions over the same array.
Filtering letters out of the second made Compass offer to draft an appeal
invitation that already existed — proven against production data by the Phase 0
parity harness. Never unify these two.

### Meeting lifecycle — "what state is this meeting in?"

- **Canonical primitive** `meetingStatus`, `meetingKind`, `MEETING_STATUS` — `src/lib/meetingLifecycle.js`
- **Target phase** Phase 2 (first writer of explicit status)
- **Status** PRIMITIVE ESTABLISHED, NO WRITERS YET

No stored record carries a `status` key (Phase 0 audit: 0 of 884). Until
Phase 2, every read resolves through the legacy compatibility branch.

### Meeting completion — "has this meeting happened, for workflow purposes?"

- **Canonical primitive** `isMeetingComplete` — `src/lib/meetingLifecycle.js`
- **Status** PARTIALLY MIGRATED

| Consumer | Class | Note |
|---|---|---|
| `src/lib/nextStep.js` ×5 completion checks | A | Migrated in Phase 1 |
| `src/lib/guardrails.js:165` (`hasHeldMeeting`) | D | Own type test + `m.record`; Phase 4 |
| `src/lib/investigationQuality.js:22` | D | Own type test + `m.record`; Phase 4 |
| `src/lib/hrDelegatedWork.js:49` | D | Counts investigation meetings via `m.record`; Phase 4 |
| `src/lib/appealReview.js:26` | D | Appeal meetings via `m.record`; Phase 4 |
| `src/components/caseTabs/OverviewTab.jsx:222` | D | Panel visibility via `m.record`; Phase 4 |
| `src/components/InconsistenciesPanel.jsx:14` | D | Panel visibility via `m.record`; Phase 4 |
| `src/App.jsx:8242` (investigation report source) | D | Phase 4 |
| `src/App.jsx:8032` (appeal hearing lookup) | D | Phase 4 |
| `src/App.jsx:1165` (AI context) | C | "Which meetings have readable text?" — a content question |
| `src/App.jsx:5210` (`meetingsWithRecords`) | C | Comparison needs *text to compare*; NEW-30's remaining half is unrelated |
| `src/lib/caseContext.js:173,239` | C | Grounding needs record content, not lifecycle state |
| `src/App.jsx:7467,7519` (PDF export) | C | Rendering content |
| `src/lib/automationRules.js:59,61` | C | Signature chasing — needs a *document* to chase |
| `src/screens/CaseViewScreen.jsx:357` | C | Opens the record for signature — content |
| `src/components/caseTabs/MeetingsTab.jsx:137,161` | C | "View notes" / scheduled-detail display |
| `src/screens/PersonViewScreen.jsx:170`, `OutcomeModal.jsx:169`, `EvidenceTab.jsx:55`, `AllegationsPanel.jsx:88` | C | Open record content in Review |
| `src/lib/caseTimeline.js:75` | D | Renders `held` vs `scheduled` from `m.record` — should read lifecycle once statuses exist; Phase 2 |
| `src/lib/meetingPrepGrounding.js:88` | C | "(record on file)" is a content statement |
| `src/screens/DashboardScreen.jsx:6` | D | Infers closure from record *text* containing "case closed"; Phase 4 |

### Latest meeting — "which meeting happened last?"

- **Canonical primitive** `lastGenuineMeeting` — `src/lib/meetingLifecycle.js`
- **Status** PARTIALLY MIGRATED

| Consumer | Class | Note |
|---|---|---|
| `src/lib/nextStep.js` ×4 (`lastInv`/`lastDisc`/`lastAppeal`/`lastHearing`) | A | Migrated in Phase 1 |
| `src/lib/guardrails.js:270` (`lastDecisionMeeting`) | D | `slice().reverse().find()`; Phase 4 |
| `src/screens/CaseViewScreen.jsx:302,442` (`relevantMeeting`) | D | Raw last-element; Phase 4 |
| `src/components/NotetakerView.jsx:17` | D | Raw last-element; Phase 4 |
| `src/screens/DashboardScreen.jsx:93` | D | Raw last-element; Phase 4 |
| `src/App.jsx:1926` (`lastMeeting`) | D | Raw last-element; Phase 4 |
| `src/App.jsx:8824` ("Latest: {type}") | D | Raw last-element; Phase 4 |

### Meeting write path — "how does a meeting reach the database?"

- **Canonical primitive** `planMeetingWrite` / `persistMeeting` / `stampNewMeeting` — `src/lib/meetingWrites.js`
- **Target phase** Phase 2.1 (shipped 2026-09-23)
- **Status** CANONICAL, PARTIALLY ADOPTED

| Consumer | Class | Note |
|---|---|---|
| `saveMeetingToCaseImpl` structured branch | **MIGRATED** | Resolves by `caseId`, patches by id, single-case path |
| `saveMeetingToCaseImpl` witness branch | **UNCHANGED INTENTIONALLY** | Writes `evidence[]`, not `meetings[]`; already resolves by `_linkedCaseId` |
| `saveMeetingToCaseImpl` referral branch | **INTENTIONAL EXCEPTION** | Creates a case by explicit referral intent; never name-matched |
| Unlinked meeting (no `caseId`) | **BLOCKED SAFELY** | Fails closed with `parent_required`; notes preserved. Chooser UX = Phase 2.5 |
| `scheduleMeeting` (`App.jsx:3038`) | **DEFERRED** | Calendar-gated, no `caseId`/`status`; Phase 2.3 |
| `saveDevMeetingToCase` (`App.jsx:6885`) | **DEFERRED** | Name matches, auto-creates, sync-all; Phase 2.5 |
| `recordAppealReceived` (`App.jsx:8815`) | **DEFERRED** | Appends by id; already correctly parented; Phase 2.5 |
| Meeting patches #6-#11 (reminder, suggestions, signature poll, next-step, sign, notetaker) | **DEFERRED** | Already patch by id; three use sync-all; Phase 2.5 |

**Guarantee by construction:** `persistMeeting` makes exactly one `saveCases`
call and always supplies `changedId`, so the sync-all branch is structurally
unreachable from the meeting write primitive. No new meeting mutation may use
sync-all.

### Scheduling (Phase 2.3)

- **Canonical primitives** `scheduleCaseMeeting` · `syncMeetingToCalendar` ·
  `startScheduledMeeting` · `prepareScheduledMeeting` · `rescheduleCaseMeeting` ·
  `cancelScheduledMeeting` (App.jsx) · `isScheduledMeeting`,
  `scheduledMeetingsFor`, `scheduleInstant` (`meetingLifecycle.js`) ·
  `withScheduledMeeting` (`nextStep.js`)
- **Status** LIVE — `scheduled` is a real, startable lifecycle state

| Consumer | Class | Note |
|---|---|---|
| `HomeMeetingScreen` "Schedule meeting" | **MIGRATED** | New, distinct from Start |
| `CalendarScreen` → `scheduleMeeting` | **MIGRATED** | Rewritten Compass-first |
| Case View scheduled banner | **MIGRATED** | Prepare · Start · Reschedule · Cancel |
| `getNextStep` | **MIGRATED** | One shared `withScheduledMeeting` wrapper; recipes untouched |
| `buildScheduledMeetingEntry` | **RETIRED** | Removed — the pre-lifecycle forked builder |
| `caseTimeline` "held vs scheduled" | **UNCHANGED INTENTIONALLY** | Already keys on record presence, so a scheduled meeting reads "scheduled" |
| `MeetingsTab` scheduled details | **UNCHANGED INTENTIONALLY** | Still renders agenda/questions/attendees |
| Time / Method controls (`HomeMeetingScreen`) | **MIGRATED 2026-09-24** | Visibility un-coupled from the appeal chair security flag; render for every structured type |
| **Record navigation identity** | **MIGRATED 2026-09-24** | `?screen=record&case=<caseId>&meeting=<meetingId>` — the URL identifies the workflow object |
| Start / Resume navigation | **MIGRATED 2026-09-24** | Both write the authoritative pair; scheduled Start reuses the same meeting id |
| Cold-load recovery | **MIGRATED 2026-09-24** | Waits for the case set, resolves by `caseId`+`meetingId`, verifies parentage and `in_progress`, else redirects |
| `startedAt` authority | **MIGRATED 2026-09-24** | NEW-29 capture narrowed by `!recordRecovery`; recovery restores the persisted instant and never restamps |
| **Creation metadata** (`createdAt`/`createdBy`) | **MIGRATED 2026-09-24** | Immutable. Enforced in `planMeetingWrite`, so `persistMeeting` and `transitionMeeting` both inherit it. A patch preserves a stored value, ignores an incoming one, and never invents one for a legacy row |
| Crash-recovery precedence | **MIGRATED 2026-09-24** | A draft may supplement content for the same `caseId`+`meetingId` only; it can never own identity or null `startedAt` |
| Failure redirects | **MIGRATED 2026-09-24** | No case ⇒ Cases · no meeting ⇒ Case View · unknown/non-live/cross-parented ⇒ Case View. Never guesses |

**Principle established.** THE URL IDENTIFIES THE WORKFLOW OBJECT. THE SERVER
PROVIDES ITS TRUTH. THE CLIENT DOES NOT RECONSTRUCT IT BY GUESSING. Recovery may
not use employee name, array order, meeting type, recency, "the first
in_progress one", the clock, or local-only state.
| `schedule.location` | **RETIRED FOR NEW WRITES** | Never written; reads tolerate it on pre-existing objects. No location concept exists yet |
| `scheduleInstant` | **MIGRATED 2026-09-24** | A missing/malformed time is unsortable, not midnight |
| Invitation flow | **UNCHANGED INTENTIONALLY** | Letters remain independent facts |
| Dev meetings | **DEFERRED** | Phase 2.5 |

**Compass first.** Persist → confirm → then attempt calendar sync. A calendar
failure leaves the meeting scheduled and surfaces a recoverable message; the
provider's own error is logged, never shown. Calendar success patches the
**same** meeting id via `transitionMeeting` and can never create a second one.

**Schedule and Start are different intents.** Neither routes through the other.
Schedule creates `scheduled` and returns to the case; Start creates
`in_progress` and enters the live screen. They share identity and lifecycle
infrastructure only.

**Rescheduling** amends logistics on the same id and never touches
`chairUserId`. **Cancellation** preserves the id, schedule and chair, sets
`cancelledAt`/`cancelledBy`/`cancelledReason`, deletes nothing, and does not
block a replacement. `completed → cancelled` is refused by allowed-from.

**Multiple scheduled meetings per case are supported and expected** —
investigation interview, witness meeting, hearing, follow-up. No case-level
uniqueness rule exists or is implied; ordering is soonest-first with undated
last.

**Appeal chair.** Scheduling stamps the appointed officer and the deployed
trigger validates it at creation; Start revalidates. The Case View surfaces a
stale-officer hearing early and disables its Start button — an affordance, not
the control. Nothing client-side rewrites the chair.

### Meeting lifecycle — Start / Resume (Phase 2.2)

- **Canonical primitives** `beginMeeting` / `resumeMeeting` (App.jsx) ·
  `transitionMeeting` (`meetingWrites.js`) · `isResumableMeeting`,
  `resumableMeetingFor`, `declaredStatus` (`meetingLifecycle.js`)
- **Status** LIVE — `in_progress` is the first lifecycle status ever written

| Consumer | Class | Note |
|---|---|---|
| `HomeMeetingScreen` "Start meeting" | **MIGRATED** | Persists, then enters RecordScreen |
| `PrepScreen` "Start meeting" | **MIGRATED** | Same |
| `PrepScreen` "Skip prep and start meeting now" | **MIGRATED** | Same |
| `CaseViewScreen` live-meeting banner | **MIGRATED** | Deterministic Resume affordance |
| Review Save | **MIGRATED** | Patches the started meeting id; completes it |
| Crash-recovery restore | **MIGRATED (precedence only)** | A draft naming a meeting the case no longer calls live is discarded |
| `scheduleMeeting` | **DEFERRED** | Phase 2.3 |
| Dev meetings (`DevelopScreen`) | **DEFERRED** | Phase 2.5 — separate flow, no lifecycle |
| Witness / evidence route | **INTENTIONAL EXCEPTION** | Writes `evidence[]`, not a meeting |
| Unlinked / ad-hoc meetings | **BLOCKED SAFELY** | Phase 2.1's `parent_required` is unchanged |
| End meeting | **DEFERRED — documented** | No lifecycle transition; `review_draft` arrives in Phase 3 |

**Start / Resume invariants.** The meeting exists on the server before the live
UI is entered; Start navigates, audits and fires AI only after persistence
succeeds. `startedAt` is captured once per Start attempt, promoted only on
success, and never recomputed on Resume, End or Save. Resume is deterministic
(`declaredStatus === "in_progress"`) and never inferred from record absence,
transcript presence, notes or "the latest meeting". A legacy row has no
declared status, so it can never satisfy a transition's allowed-from set and is
never swept into the lifecycle.

**Multiple live meetings.** Possible but abnormal — no database invariant
enforces one. `resumableMeetingFor` selects the most recently started (a
justified rule, never array position), reports `count` and `ambiguous`, and the
Case View says so out loud. No uniqueness constraint was added.

**Concurrency.** Retrying the *same* Start reuses the id held in
`pendingStartRef`, so a retry patches instead of appending. Two tabs pressing
Start-now independently would still mint two ids — recorded in the defect
register, not hidden.

### Meeting parentage — "which case does this meeting belong to?"

- **Canonical primitive** `meeting.caseId`, supplied via `caseInfo.caseId`
- **Target phase** Phase 2.1 (structured meetings) · Phase 2.5 (everything else)
- **Status** CANONICAL FOR STRUCTURED MEETINGS; legacy paths remain

| Consumer | Class | Note |
|---|---|---|
| `CaseViewScreen` start handlers | **MIGRATED** | `caseId: cs.id` |
| `HomeMeetingScreen` commit | **MIGRATED** | `caseId` from the visible "Link to case" selection (`activeCaseId`); recomputed every time, never carried over |
| `saveMeetingToCaseImpl` structured | **MIGRATED** | Name matching removed |
| `_linkedCaseId` (witness) | **INTENTIONAL EXCEPTION** | Also encodes "the person in the room is not the case subject". Retires only once meeting `type` carries that distinction — Phase 2.5 |
| `preparedCaseId` | **INTENTIONAL EXCEPTION** | Means "the case this preparation was grounded in". Read by prep grounding and NEW-19's gate. Kept distinct so neither meaning drifts into the other |
| `saveDevMeetingToCase`, `acceptMeetingEvidenceSuggestion`, `acceptMeetingActionSuggestion`, `createQualityCheckFollowUp`, `proceedPastQualityCheck` | **DEFERRED** | Still name-based; none persists a structured case meeting. NEW-20 FULL stays open — Phase 2.5 |

### Meeting identity — "is this the same meeting?"

- **Canonical primitive** `meeting.id`, create-vs-patch decided by id presence in `planMeetingWrite`
- **Status** CANONICAL FOR THE STRUCTURED SAVE

Two independent id generators remain: `newId("meeting")` in the save path and
`crypto.randomUUID()` in `buildScheduledMeetingEntry`. They converge in Phase 2.3.

### Meeting scheduling · Meeting transcript · Review draft · Invitation state · Calendar state

| Concept | Canonical | Legacy / duplicate | Target | Status |
|---|---|---|---|---|
| Meeting scheduling | *none yet* | `scheduleMeeting` **exists and persists a scheduled row**, but is gated on calendar success, writes no `caseId`/`status`, and is rejected by the chair trigger for appeal types. Production census: **0 of 884 rows** — it has never succeeded | Phase 2.3 | BROKEN, NOT MISSING (NEW-32) |
| Meeting timing | `startedAt` / `endedAt` (NEW-29) | — | shipped | CONSISTENT — immutable once set |
| Meeting transcript | `meeting.transcript` | ordering not guaranteed (NEW-34); speaker prefix leak (NEW-35) | Phase 5 | OPEN |
| Review draft | *none* — browser-only | `localStorage` `compass_meeting_draft`, deleted on entry to Review (NEW-26) | Phase 3 | NOT REPRESENTED |
| Invitation state | *none* | inferred from a letter-shaped meeting row via `hasLetterType(..., "invite")` | Phase 2 | INFERRED, NOT DECLARED |
| Calendar state | `calendar_synced_events` (33 rows) | external mirror only, not linked to a meeting | Phase 2 | DISCONNECTED |

---

## 2. Case-level concepts

| Concept | Canonical | Legacy / duplicate | Target | Status |
|---|---|---|---|---|
| Case next action | `getNextStep` — `src/lib/nextStep.js` | AI "Next Best Action" is a **second, competing** recommendation surface | Phase 4 | FORKED |
| Case View primary action | *none* | "Suggested next step" and the NBA card render simultaneously | Phase 4 | FORKED |
| Timeline | `src/lib/caseTimeline.js` + `TimelinePanel` | `processTimeline.js` answers a different (stage-progress) question | — | CONSISTENT |
| Attention / warnings | *none* | ~11 Overview panels each decide their own visibility; 13 relevance-gating expressions already exist in `OverviewTab.jsx` | Phase 4 | PARTIALLY IMPLEMENTED |
| AI advisory content | `REVIEW_EVIDENTIAL_CONTRACT`, `LIVE_QUESTION_CONTRACT`, `NO_INVENTED_AUTHORITIES`, `LEGAL_ACCURACY_BOUNDARY`, Review Advisory Mode (NEW-28) | Proposed Updates does not yet apply the evidential contract | backlog | MOSTLY CONSISTENT |
| Process recipes | `getNextStep` branch functions | 5 recipes exist; `capability`/`absence`/`redundancy`/`informal`/empty fall through to **disciplinary** | Phase 6 | FORKED — see defect register |
| Concurrency / write path | `saveCaseToDB` conditional update on `updated_at` | **31 `saveCases` sites omit `changedId`**, including a workflow transition (`CaseViewScreen:359`) | Phase 2.5 | PRIMITIVE CORRECT, ADOPTION PARTIAL |
| **`casesRef` currency** | `casesRef.current`, advanced on database load and on successful case write | Was seeded once at mount and only reassigned in `saveCases`, so it lagged the database by one write and sent a stale concurrency key | fixed 2026-09-25 | CONSISTENT |
| **Meeting End** | `planMeetingEnd` + `transitionMeeting`, `allowedFrom: [in_progress]` → `review_draft`, patching `endedAt` only | End previously persisted NOTHING — no status, no `endedAt` — and cleared the local crash-recovery draft on the way out | Phase 3A (2026-09-25) | CONSISTENT |
| **Review re-entry** | `review_meeting_record` → `openReviewForMeeting`, identity + `endedAt` read back from the meeting | Was a placeholder that opened the signature modal | Phase 3A | CONSISTENT (lifecycle only — content persistence is 3B) |
| **Review draft content** | none yet — React state | `reviewOutput`/`summary`/`riskScore`/`nextSteps` are volatile | **Phase 3B** | KNOWN GAP |
| **Meeting transcript at End** | persisted by the End transition (`patch: { endedAt, transcript }`) | End patched `endedAt` only, so notes were lost at the browser boundary | Phase 3A (human verified) | CONSISTENT |
| **Completion boundary** | `saveMeetingToCaseImpl` writes `completed` with **no allowed-from guard** | reachable from `review_draft` via Save **and** via Send for signature (NEW-36, P1) | **Phase 3B, first slice** | KNOWN DEFECT |
| **Review screen action gating** | `reviewOutput && !editingRecord` — volatile local text only | no reader consults meeting status; Case View readers are lifecycle-aware, Review is not | NEW-36 | INCONSISTENT |

**Rule.** Meeting writes read `casesRef.current` deliberately — chained writes
in one synchronous run depend on it. The ref must therefore never be staler
than the `updated_at` contract it is used for, and is synchronised wherever the
database value changes.

**Phase ordering correction (Phase 2A).** Phase 6 (process recipes) must
precede Phase 4 (Case View). Phase 4 collapses the UI to one obvious primary
action and removes the competing surfaces that currently give a user a second
opinion; at that point a wrong recommendation becomes the path of least
resistance on 771 of 774 case-carrying cases. Phase 2's guard — meeting type
must be explicitly confirmed before first persistence, never defaulted from a
recipe — makes Phase 2 safe. It does not make Phase 4 safe.

**Process recipe boundary.** Meeting lifecycle answers *"what state is this
meeting in?"*. The process recipe answers *"what should this case do next?"*.
AI answers *"what might the user need to consider, understand or draft?"*.
These three must not blur.

---

## 3. Security and authority

| Concept | Canonical | Status |
|---|---|---|
| Case visibility | Level 1/2/3 + `case_access_level` RLS | CONSISTENT |
| Role / capability | `case_access.role`; role and access level kept separate | CONSISTENT |
| Confidential cases | `cases.confidential` + RLS | CONSISTENT |
| Appeal officer | `case_access.role = 'appeal_manager'`; HR-only appointment via `appoint_appeal_manager()` | CONSISTENT — live, replaceable fact |
| Appeal chair | `meeting.chairUserId`, enforced by `protect_appeal_hearing_chair_integrity()` | CONSISTENT — **validated at SCHEDULE, revalidated at START, historical after START** |
| Audit events | `log_audit_event()` RPC; all ~60 `audit()` callers funnel through one line | CONSISTENT — server-derived, unforgeable |

### Appeal chair — the one intentional security-specific exception

**Resolved 2026-09-23** (`supabase/appeal_hearing_chair_lifecycle_2026-09-23.sql`).
This supersedes the earlier note here, which proposed re-asserting at
*completion* and cancelling non-completed hearings on officer replacement.
Both were wrong and are not implemented.

| Transition | Chair rule |
|---|---|
| **CREATE** (scheduled, or directly `in_progress` via Start-now) | **must equal the current `appeal_manager`** |
| Prepare | immutability only |
| **START** (`→ in_progress`) | **must STILL equal the current `appeal_manager`** |
| End · Review · Regenerate | immutability only |
| **COMPLETE** | **immutability only — never revalidated against the current officer** |
| Cancel | no chair requirement |

**Why completion is not revalidated.** A hearing held Monday by the properly
appointed Officer A, who leaves on Tuesday, must still be saveable on
Wednesday under B's appointment. Revalidating at completion would block a
truthful record of a hearing that properly happened; cancelling a
`review_draft` hearing would assert that a hearing which demonstrably occurred
did not. After Start, `chairUserId` is historical truth.

**Officer replacement is given no new behaviour.** `appoint_appeal_manager` is
untouched and has no concept of scheduled meetings. A stale scheduled hearing
simply cannot Start (`APPEAL_CHAIR_STALE_AT_START`) and remains readable so
the UI can offer "reschedule required".

**This exception must not leak into the generic meeting lifecycle primitive.**
`meetingLifecycle.js` and `meetingWrites.js` contain no chair logic and no
appeal vocabulary, and tests assert that. `chairUserId` remains
security-authoritative for **appeal hearings only**; every other meeting's
chair stays descriptive metadata in `manager`. No general meeting
authorisation primitive exists or is being created.

**Scope now covered:** the trigger fires on `INSERT` as well as `UPDATE`,
closing a case-creation bypass, and the NULL-`letterType` three-valued-logic
hole (P1, see defect register) is closed with `coalesce`.

---

## 4. Design system

Approved platform-wide design principles. Recorded here so that equivalent
concepts get equivalent treatment. **Phase 1 changes nothing visual.**

- Archivo-only typography
- Existing Compass visual identity
- Calm neutral surface; restrained purple
- Compact sidebar
- Progressive disclosure
- One obvious primary action
- Deterministic state presented confidently
- AI explanation subordinate to workflow state
- No duplicated recommendation surfaces
- No permanent panel merely because data exists
- Warnings only when actionable and material
- The Case View itself is the overview — no Overview tab duplicating it
- Timeline is the chronological spine
- Equivalent concepts use equivalent UI patterns
- Responsive behaviour is part of the shared pattern, not an afterthought

| Concept | Canonical | Status |
|---|---|---|
| Loading states | *none* | FORKED — per-component |
| Error states | `showToast` + `describeSaveMeetingError` | PARTIAL |
| Empty states | *none* | FORKED |
| Buttons / actions | *none* — inline styles throughout | FORKED |
| Forms | *none* | FORKED |
| Date/time controls | `fmtMeetingTime` for display | PARTIAL — display only |
| People selectors | *none* | FORKED |
| Responsive behaviour | *none* | FORKED |

These are recorded as forks so they are not mistaken for decisions. No phase
currently owns them.

---

## Accidental forks discovered during the Phase 1 inventory

1. **`m.record` is doing two unrelated jobs** — workflow state *and* document
   content — in 20+ places. Phase 1 separated them in `nextStep.js` only.
2. **Seven independent "latest meeting" implementations**, none of which
   excluded letter artefacts before Phase 1.
3. **`DashboardScreen.jsx:6` infers case closure from record text** containing
   the string `"case closed"` — a content heuristic standing in for
   `cases.stage`.
4. **Stored case-type vocabulary is `absence`**, while the configured type list
   uses `attendance`. Neither has a recipe.
5. **566 production cases have no case type at all** and are silently given
   disciplinary process recommendations.
6. **Two independent meeting-append implementations** — `saveMeetingToCaseImpl`
   and `scheduleMeeting` — sharing no code, no id strategy and no parentage
   rule. Partially closed in Phase 2.1; converges in Phase 2.3.
7. **Two independent id generators** for the same entity (`newId("meeting")`
   and `crypto.randomUUID()`).
8. **Scheduling is reachable from the Calendar screen only** and is invisible
   to the case it belongs to.
