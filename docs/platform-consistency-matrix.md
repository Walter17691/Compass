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

### Meeting parentage — "which case does this meeting belong to?"

- **Canonical primitive** *none yet* — `meeting.caseId`, Phase 2
- **Legacy** `preparedCaseId`, `_linkedCaseId`, employee-name matching (NEW-20)
- **Status** FORKED — three mechanisms answer one question

`_linkedCaseId` additionally encodes "the person in the room is not the case
subject" (witness interview). It retires only once meeting `type` carries that
distinction — not in the same change that introduces `caseId`.

### Meeting scheduling · Meeting transcript · Review draft · Invitation state · Calendar state

| Concept | Canonical | Legacy / duplicate | Target | Status |
|---|---|---|---|---|
| Meeting scheduling | *none* | `meetingScheduling.buildEventTimes` exists but no meeting is ever persisted before it happens | Phase 2 | NOT REPRESENTED (NEW-32) |
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
| Appeal chair | `meeting.chairUserId`, enforced by `protect_appeal_hearing_chair_integrity()` | CONSISTENT — historical fact, immutable once recorded |
| Audit events | `log_audit_event()` RPC; all ~60 `audit()` callers funnel through one line | CONSISTENT — server-derived, unforgeable |

**Known Phase 2 interaction.** The chair trigger validates on entry *creation*.
Once Phase 2 creates the meeting at scheduling rather than at completion, that
check moves earlier and nothing re-validates at completion — so an officer
replaced between scheduling and the hearing would leave a stale chair
unchallenged. Phase 2 must add a completion-time re-assertion **and** cancel
non-completed appeal hearings on officer replacement. Do not relax the
existing immutability rule.

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
