# Compass — Release 1 Defect Register

The persistent record of known defects, their evidence, and their disposition.
Reconstructed 2026-09-22 from repository evidence (source comments, test-file
headers, SQL migration headers) and the Release 1 Phase 0 production audit.

**Rules for this file**

- A defect is only `CLOSED` when its fix has **shipped and been verified**.
  Expecting a later redesign phase to absorb it does *not* close it.
- `UNKNOWN` means the definition could not be recovered from evidence.
  Never invent one.
- Evidence must point at something checkable: a file and line, a test, a
  migration, a deployment, or an audit query.

**Status vocabulary**

| Status | Meaning |
|---|---|
| `OPEN` | Confirmed, unfixed |
| `DEPLOYED / HUMAN VERIFICATION REQUIRED` | Fix shipped, awaiting human UAT sign-off |
| `CLOSED` | Fixed, shipped, verified |
| `BACKLOG` | Real but deliberately not scheduled |
| `TECHNICAL DEBT` | Not a user-facing defect; a structural risk |
| `ABSORBED BY REDESIGN` | Will be removed by a named phase — **still open until that phase ships** |

---

## Open

### NEW-20 — meeting filed by employee-name match
- **Severity** P1 · **Area** Save path
- `saveMeetingToCaseImpl` resolved the target case by matching
  `employeeName`, took `nameMatches[0]` on collision, and created a brand new
  case when no match was found. `activeCaseId` mitigated but did not fix it.

**NEW-20 CORE = CLOSED** (Phase 2.1, 2026-09-23). The canonical structured
meeting save resolves the case by `caseInfo.caseId` alone. Name matching and
`nameMatches[0]` are gone from that path; an unlinked meeting fails closed
with `parent_required` instead of guessing a case or minting one. Newly saved
meetings carry `caseId`, `createdAt` and `createdBy`, and an existing meeting
id is patched rather than appended.

**NEW-20 FULL = OPEN.** Employee-name parentage still exists on these paths,
none of which persist a structured case meeting:

| Path | What it parents by name | Target phase |
|---|---|---|
| `App.jsx:6880` `saveDevMeetingToCase` | a **dev meeting** (probation/appraisal/PDP) — still name-matches, still auto-creates, still sync-all | **2.5** |
| `App.jsx:1234` `acceptMeetingEvidenceSuggestion` | case **evidence** | 2.5 |
| `App.jsx:1258` `acceptMeetingActionSuggestion` | case **task** | 2.5 |
| `App.jsx:6533` `createQualityCheckFollowUp` | case **task** | 2.5 |
| `App.jsx:6527` `proceedPastQualityCheck` | **audit** attribution | 2.5 |
| `App.jsx:1160`, `6499` | AI **context** lookups (read-only) | 2.5 |

- **Evidence** Phase 2.1 implementation and `src/test/meetingWrites.test.js`.
- **Decision** CORE closed; FULL remains open until Phase 2.5 entry-path
  adoption. Do not record NEW-20 as closed outright.

### Implicit case creation — one remaining narrow exception
- **Severity** P3 · **Area** Save path · **Raised** 2026-09-23
- The structured save can still mint a case in exactly one case: a manager's
  concern referral handled via "Deal with informally"
  (`caseInfo._linkedReferralId`). `startInformalConversation` deliberately
  defers case creation until the conversation is saved, so that backing out
  leaves nothing behind — a real product requirement, not legacy convenience.
- This is creation by **explicit intent on a specific named referral**, and it
  never consults `cases.employeeName`, so it cannot misfile onto a wrong case.
- **Decision** Retained deliberately and documented. Revisit in Phase 2.5 when
  the explicit link/create UX exists.

### Unlinked meetings have no link-or-create flow
- **Severity** P2 · **Area** Save path / UX · **Raised** 2026-09-23
- Phase 2.1 makes an unlinked meeting fail closed at save with an actionable
  message; the user's notes are preserved. The explicit "link to existing
  case / create new case" chooser does not exist yet, so the only route
  forward is to start the meeting from inside a case or use "Link to case" on
  the New meeting form.
- **Intentional behaviour change:** previously such a meeting silently created
  a new case.
- **Decision** OPEN — Phase 2.5 owns the chooser UX.

### NEW-26 — Review draft destroyed by refresh or navigation
- **Severity** P1 · **Area** Review persistence
- `handleReview` deletes the local draft on entry to Review, which is the
  point at which the most unsaved work exists.
- **Evidence** traced 2026-09-21.
- **Decision** ABSORBED BY REDESIGN — Phase 3 (server-side `reviewDraft`).

### NEW-27 — no Regenerate after a successful Review
- **Severity** P2 · **Area** Review UX
- `handleReview` is already idempotent; the control is simply not exposed.
- **Decision** ABSORBED BY REDESIGN — Phase 3.

### NEW-30 — signal generator compares a meeting against itself
- **Severity** P2 · **Area** Signals / AI
- **STATUS: OPEN. NOT absorbed by Phase 1.**
- The Phase 0 audit disproved the proposed letter/meeting cause: the
  inconsistency comparison filters on `m.record`, and a letter-only artefact
  by definition has no record, so letter artefacts were never reaching that
  comparison. The letter/meeting separation shipped separately on 2026-09-20
  (`isLetterOnlyRecord`).
- The remaining defect is the AI self-comparison half only, which requires a
  behavioural change to the generator and is untouched by Phase 1.
- **Evidence** `src/App.jsx:5210` — `const meetingsWithRecords = (cs.meetings||[]).filter(m=>m.record);`
- **Decision** OPEN. Not scheduled into the current redesign phases.

### NEW-31 — notetaker absence emitted as a procedural concern
- **Severity** P2 · **Area** Signals / AI
- **Decision** BACKLOG. AI-quality issue, does not intersect the redesign.

### NEW-32 — "Schedule investigation meeting" does not schedule
- **Severity** P1 · **Area** Workflow
- The action label promises scheduling; the handler opens a generic meeting
  form whose only outcomes are Prepare or Start. Nothing is persisted.
- **Evidence** `src/lib/nextStep.js` — `action:"start_investigation"` behind
  the label `"Schedule investigation meeting"`.
- **Decision** ABSORBED BY REDESIGN — Phase 2.

### NEW-34 — transcript ordering under async resolution
- **Severity** P2 · **Area** Capture
- **Not reproduced under natural typing.** Recorded as suspected only.
- **Decision** ABSORBED BY REDESIGN — Phase 5. Must be reproduced first, or
  downgraded to "not reproducible" rather than claimed as fixed.

### NEW-35 — speaker prefix leaks into utterance text
- **Severity** P2 · **Area** Capture
- An utterance is stored as `"WC: This is a test…"` while its `speaker` field
  independently reads `"HR Manager"`, duplicating and contradicting the
  attribution.
- **Evidence** NEW-29 UAT transcript, observed 2026-09-21.
- **Decision** ABSORBED BY REDESIGN — Phase 5.

### Stale-closure coupling at End meeting
- **Severity** P2 · **Area** Capture
- The final typed input is committed by relying on closure timing rather than
  an explicit commit-then-transition sequence.
- **Evidence** `src/screens/RecordScreen.jsx:125`
- **Decision** ABSORBED BY REDESIGN — Phase 5.

### Unsupported case types fall through to the disciplinary recipe
- **Severity** P2 · **Area** Process engine · **Raised** 2026-09-22
- `capability`, `attendance`, `redundancy` and `other` have no recipe and are
  routed to `disciplinaryNextStep`, so a capability case receives disciplinary
  next steps stated with full confidence. A confidently wrong recommendation
  in a legally sensitive area is worse than no recommendation.
- **Evidence** `src/lib/nextStep.js` — final line of `getNextStep`.
  Production case-type census, 2026-09-22: `misconduct` 1972, **empty/none
  566**, **capability 162**, `grievance` 113, `probation` 48,
  `long-term sickness` 32, **absence 28**, `flexible working` 19,
  **informal 14**, **investigation 1**. The bolded 771 cases all reach the
  disciplinary recipe without a disciplinary process having been chosen.
  Note the stored vocabulary is `absence`, not the `attendance` name used in
  the configured type list — a second, separate inconsistency.
- **Decision** OPEN — future process-recipe phase (Phase 6). Explicitly **not**
  fixed in Phase 1.

### Calendar scheduling is gated on calendar success
- **Severity** P2 · **Area** Scheduling · **Raised** 2026-09-22 (Phase 2A)
- `scheduleMeeting` calls `/api/calendar/create-event` and returns early on
  failure, **before** any persistence. No calendar integration, expired token
  or provider outage means no scheduled meeting at all — the meeting is lost,
  not degraded.
- **Evidence** `src/App.jsx:3022-3026`. Production census 2026-09-22: 0 of 884
  stored entries carry `scheduledStartISO`, `calendarEvents`, `agenda`,
  `prepQuestions` or `attendees`; 0 are future-dated. **This path has never
  produced a row in production.**
- **Decision** OPEN — Phase 2.3 reverses the order so persistence succeeds
  first and calendar failure is visible and retryable.

### Appeal chair validation bypassed by NULL letterType — P1
- **Severity** **P1** · **Area** Appeal security · **Raised** 2026-09-23
- **STATUS: CLOSED** (Appeal Meeting Lifecycle Security, 2026-09-23).
- The 2026-09-18 classifier read
  `entry_letter_type in ('invite','appeal') and entry_record = '' and entry_transcript_len = 0`.
  `entry_letter_type` is NULL on every non-letter entry, and in SQL
  `NULL in (...)` is **NULL, not false**. For an entry with no `letterType`,
  no `record` and no `transcript`, the conjunction evaluated to NULL,
  `requires_chair` became `true and not NULL` = NULL, and `if requires_chair
  and ...` was not true — so **no chair was required and none was checked**.
- Latent until now because an appeal hearing *with* content evaluates
  `NULL and false` = false, so every historically persisted hearing was
  correctly validated, and a contentless appeal meeting could not previously
  be persisted at all. **A scheduled appeal hearing is exactly that shape**,
  so the hole would have opened the moment lifecycle writers shipped.
- **Evidence** Rolled-back disposable verification against the deployed
  function, 2026-09-23: a scheduled appeal hearing carrying a *fabricated*
  `chairUserId` was ACCEPTED; so was one created directly as `in_progress`;
  so was starting a stale hearing after the officer had been replaced.
  Three-valued-logic probe confirmed `NULL in ('invite','appeal')` → NULL.
- **This corrects the Phase 2A report**, which stated appeal scheduling would
  be *rejected* with `APPEAL_HEARING_CHAIR_MISSING`. It would have been
  silently *accepted* with no chair — the opposite, and worse.
- **Decision** Fixed with `coalesce(entry_letter_type, '')`. The JS mirror
  could not have caught it: `['invite','appeal'].includes(undefined)` is
  `false` in JavaScript, so the mirror was accidentally correct while the SQL
  was not. Only executing the real trigger found it.

### Appeal hearings could not be scheduled with a verified chair
- **Severity** P2 · **Area** Scheduling · **Raised** 2026-09-22
- `buildScheduledMeetingEntry` sets no `chairUserId` at all, so a scheduled
  appeal hearing carries no verified chair.
- Prior to 2026-09-23 this was silently accepted (see the P1 above). With the
  bypass closed it is now correctly **rejected** with
  `APPEAL_HEARING_CHAIR_MISSING` — the safe direction, and a visible blocker
  rather than a silent hole.
- **Evidence** `src/lib/meetingScheduling.js:131-147`; rolled-back test 3
  (“CREATE scheduled with NO chair at all” → rejected).
- **Decision** OPEN — Phase 2.3 must source the chair from
  `case_access.role='appeal_manager'` at scheduling, or block with an
  actionable message. The trigger is behaving correctly and is not at fault.

### Stale scheduled appeal hearing after officer replacement
- **Severity** P2 · **Area** Appeal security / UX · **Raised** 2026-09-23
- A hearing scheduled under Officer A cannot Start once A is replaced: the
  Start check fails closed with `APPEAL_CHAIR_STALE_AT_START`. This is the
  intended, safe behaviour — nothing is silently rewritten, cancelled, or
  started under the new officer, and `appoint_appeal_manager` is deliberately
  not expanded.
- The row remains fully readable and patchable so it can be surfaced as
  *"Appeal officer changed — reschedule required"*, but **that UI state does
  not exist yet**, so today the user only discovers it on attempting to Start.
- **Decision** OPEN — the affordance belongs to Phase 2.3 (scheduling UI).

### Workflow transition written through unchecked sync-all
- **Severity** P3 · **Area** Persistence · **Raised** 2026-09-22
- `CaseViewScreen.jsx:359` (`disciplinary_invite`) sets `stage:"disciplinary"`
  via `saveCases(cases.map(...))` with no `changedId`, not awaited and with no
  result check — so a rejected or conflicted write proceeds silently.
- **Decision** OPEN — Phase 2.5. No new meeting write may use sync-all
  (enforced structurally in `meetingWrites.js`).

### Proposed Updates evidential contract not applied
- **Severity** P2 · **Area** AI
- **Decision** BACKLOG.

---

## Compatibility constraints and investigation items

### Legacy no-record meetings
- **Severity** P3 — compatibility constraint, not a user-facing defect
- **Status** INVESTIGATION ITEM
- **Evidence** Phase 0 production audit, 2026-09-22: 99 of 880 genuine
  meetings carry no `record`. All 99 carry a `savedAt` value; 49 carry a
  transcript; 18 are appeal-type; 0 carry `startedAt` or `summary`.
- Semantically these meetings happened. The historical engine treats them as
  workflow-incomplete because it used record presence as its completion proxy,
  so their cases still recommend holding the meeting.
- **Decision** Phase 1 preserves current behaviour exactly — see the
  compatibility boundary in `src/lib/meetingLifecycle.js`. No mutation, no
  backfill. Explicit lifecycle status removes the ambiguity prospectively from
  Phase 2; historical rows are never rewritten.

### Legacy meeting ID audit
- **Status** `CLOSED / NO MIGRATION REQUIRED`
- The appeal chair trigger matches old and new meeting entries by
  `value->>'id'`. A null id would make an existing entry look newly created and
  wrongly demand a chair. This was a latent risk before persisting meetings
  earlier in their lifecycle.
- **Evidence** Phase 0 audit, 2026-09-22: 880/880 genuine meetings carry a
  usable id; 67/67 appeal-type meetings carry a usable id; 4/4 letter
  artefacts carry a usable id; 0 non-object entries.
- **Decision** No correctness migration required before Phase 2.

---

## Technical debt

### Sync-all persistence architecture
- **Area** Persistence
- `saveCases(u)` without a `changedId` writes every case whose object
  reference changed. Correctness depends on callers building `u` via
  `cases.map(x => cond ? {...x, ...} : x)` — a convention enforced by comment,
  not by types. A caller that rebuilds objects unconditionally silently
  re-saves everything.
- **Evidence** `src/App.jsx:2664-2678`
- **Decision** Not refactored. Meeting lifecycle transitions are required to
  use the single-case path (`saveCases(u, caseId)`) exclusively, so the
  redesign never depends on the bulk branch.

### Dead legal stubs
- `runPrediction` is never invoked and is tree-shaken from every bundle.
- **Decision** BACKLOG.

---

## Closed

| ID | Title | Evidence | Deploy |
|---|---|---|---|
| NEW-19 | Structured appeal hearing offered "Link to an existing case?" at Review | `src/test/appealLinkDiscoveryGate.test.js` | `c2e307a` |
| NEW-22 | Review asserted unverifiable legal requirements; disputed assertion became a finding | `src/test/reviewAdvisoryBoundary.test.js` | `f4702a1`, `40d88fa` |
| NEW-23 | HIGH/MEDIUM/LOW risk rating from transcript alone presented as system fact | same | `f4702a1`, `40d88fa` |
| NEW-24 | Review output persisted to `meeting.record`, re-fed by `buildCaseContext` as authoritative grounding | `src/lib/caseContext.js:76` | `f4702a1` |
| NEW-25 | Tribunal-outcome and compensation prediction citing unverifiable case law | `src/test/reviewAdvisoryBoundary.test.js` | `f4702a1` |
| NEW-28 | Prompt granted a conditional permission whose condition is unverifiable from inside the prompt | `src/test/reviewAdvisoryBoundary.test.js:423` | `b51ec9f` |
| NEW-29 | Meeting start time derived from first utterance rather than captured at Start | `src/test/meetingTimingIntegrity.test.js` | `16a005f` (HUMAN PASS) |
| NEW-33 | Silent 500-char truncation made the model correctly report its input as cut off | `src/test/caseContextExcerpt.test.js` | `13e39fd` |

---

## Unrecoverable definitions

The following IDs are referenced in project history but no definition can be
established from repository or project evidence. They are recorded as
`UNKNOWN` rather than guessed. Each must be reconstructed by a human or
formally voided.

`#3` · `#6` · `#7` · `#9` · `#10` · `#13` · `#21` · `#23` · `#24` ·
`NEW-3` · `NEW-4` · `NEW-5` · `NEW-12` · `NEW-17` · `NEW-18`
