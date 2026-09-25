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
| `saveDevMeetingToCase` | a **dev meeting** (probation/appraisal/PDP) — see the explicit breakdown below | **2.5** |
| `App.jsx:1234` `acceptMeetingEvidenceSuggestion` | case **evidence** | 2.5 |
| `App.jsx:1258` `acceptMeetingActionSuggestion` | case **task** | 2.5 |
| `App.jsx:6533` `createQualityCheckFollowUp` | case **task** | 2.5 |
| `App.jsx:6527` `proceedPastQualityCheck` | **audit** attribution | 2.5 |
| `App.jsx:1160`, `6499` | AI **context** lookups (read-only) | 2.5 |

**`saveDevMeetingToCase` — re-confirmed by the Phase 3 audit, 2026-09-25.**
The development / 1:1 save path is a complete unmigrated instance of everything
Phase 2.1 fixed for `saveMeetingToCaseImpl`, and Phase 2.1 migrated the sibling
but not this one. Explicitly, it:
- resolves the case by **employee-name matching**
  (`cases.filter(c => c.employeeName.toLowerCase() === employeeName.toLowerCase())`),
  using `activeCaseId` only as a tie-breaker among same-named matches;
- **may create a case** when no name matches, via `crypto.randomUUID()`;
- **mints a new meeting** with `newId("meeting")` rather than patching an
  existing identity;
- **appends through the legacy sync-all path** —
  `saveCases(cases.map(c => c.id === existing.id ? {...c, meetings:[...c.meetings, meeting]} : c))`
  with no `changedId`, so it takes the branch that returns nothing and whose
  conflict semantics silently swallow a rejection;
- never routes through `persistMeeting`/`planMeetingWrite`.
**Deferred. Not fixed in Phase 3A** (different entry path, out of scope). Recorded
here under NEW-20 FULL rather than as a new defect.

**Sync-all inventory, 2026-09-25:** 20 `saveCases` calls still omit `changedId`
(17 `App.jsx`, 3 `CaseViewScreen.jsx`), one of which is the dev-meeting append
above. No Phase 3A path uses them.

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

### Phase 3A — End is a real lifecycle transition
- **Area** Meeting lifecycle · **Delivered** 2026-09-25
- **STATUS: CLOSED / HUMAN VERIFIED 2026-09-25.**
- **FINAL GOLDEN PATH PASSED — human UI + database evidence.** Fresh case
  `AT - Phase 3A Final UAT` (`640ba406-b75b-4571-8f00-198daece55a9`), created and
  driven entirely through the production UI via the **direct Start** path (no
  Schedule, no Prepare):

  | Proof | Evidence |
  |---|---|
  | one Disciplinary meeting | `meetings` length **1** |
  | same canonical identity | `meeting_ecb851cd-e769-4bca-9eeb-534c298c4244` named by **both** the `Meeting started` and `Meeting ended` audit rows |
  | `status` | **`review_draft`** |
  | `caseId` | `640ba406-b75b-4571-8f00-198daece55a9` |
  | `startedAt` retained | `2026-09-25T12:17:25.903Z` (= `createdAt`, correct for direct Start) |
  | `endedAt` persisted | `2026-09-25T12:20:40.926Z` |
  | **transcript persisted** | **3 utterances**, all three test notes in canonical captured form |
  | no duplicate / orphan | 1 entry; no second `review_draft` |
  | not completed | `record` empty, no `summary`, no `savedAt`, `signStatus` null |
  | no `reviewDraft` field | absent — correct, 3B not built |
  | no `schedule` key | absent — correct for direct Start |

  **One canonical patch, not an append.** Exactly one `PATCH` executed End, at
  `12:20:41.114`, keyed `updated_at=eq.2026-09-25T12:17:25.906+00:00` — the value
  Start produced — so `status`, `endedAt` **and** the transcript were written in a
  single operation, and `b54ef95`'s concurrency held across a three-write chain
  (`POST` case → `PATCH` Start → `PATCH` End).
- **Browser-boundary continuity confirmed by human evidence:** after a hard
  refresh, Case View showed *Disciplinary record in review* and
  *Review meeting record* with no Start, Resume, outcome or closure action, and
  reopening Review presented the persisted dialogue for all three notes rather
  than the "no notes were saved" message.
- **This closes:** persisted `review_draft` lifecycle · End → `review_draft` ·
  transcript persistence at End · Review re-entry · browser-boundary transcript
  continuity · the direct-Start End path (the scheduled path was covered earlier).
- **Limitation stated honestly:** the generated Review **draft** is still
  volatile. Nothing here claims otherwise — see NEW-26.
- **RE-ENTRY DEFECT: CLOSED / HUMAN VERIFIED 2026-09-25.** Walter retested
  `AT - Continuity Retest` against `01e689d`: the case still reads
  *Disciplinary record in review*, Case View shows *Review meeting record*,
  clicking it **opens Review**, Review truthfully reports that no notes were
  saved for that historically damaged fixture, and returning to Case View
  preserves `review_draft`. Fixture left untouched.
- **HUMAN UAT 2026-09-25: FAILED (now fixed and verified) — "Review meeting
  record" CTA inert after persisted `review_draft` re-entry.** The End transition itself worked: after
  Resume → note → End → Review → hard refresh → Case View, the badge read
  *Disciplinary record in review* and both CTAs read *Review meeting record*.
  **Clicking either did nothing** and the user stayed on Case View.
  - **Affected CTAs: both** — the top-right primary and the Suggested next step.
    They share one dispatcher (`handleNextStepAction`), so one cause covered both.
  - **Not a prop mismatch.** `onOpenReviewForMeeting` was passed
    (`App.jsx`), declared and invoked (`CaseViewScreen`) correctly. The whole
    dispatch chain completed.
  - **Root cause, two linked defects of mine:**
    1. **End patched `endedAt` only**, so the transcript was never persisted. The
       meeting reached `review_draft` with `transcript: []` — confirmed in
       production (`transcript_len = 0`). The notes only ever existed in that
       browser tab, and End then cleared the crash-recovery draft. My Phase 3A
       report claimed the transcript "was saved with the meeting"; that was wrong.
    2. **`openReviewForMeeting` never navigated.** It delegated navigation to
       `handleReview`, which returns at `if(!allNotes.length) return;` — *before*
       `setScreen(SCREENS.REVIEW)`. With no notes, the chain completed and then
       silently went nowhere. Opening a screen must never depend on whether
       content can be generated for it.
  - **Fix.** End now patches `{ endedAt, transcript: allNotes }`, and
    `openReviewForMeeting` calls `setScreen(SCREENS.REVIEW)` itself,
    unconditionally. When a meeting genuinely has no persisted notes (this
    fixture, and only meetings ended in the ~1h window before the fix) Review
    still opens and says so truthfully rather than fabricating content.
  - **Why the Phase 3A tests missed it.** They asserted the *source text* of the
    dispatch (`expect(branch).toContain('onOpenReviewForMeeting?.(cs, m)')`) and
    exercised the helpers in isolation. They never rendered the screen, never
    clicked a button, and never executed `handleReview`'s guard — so they proved
    the wiring, not the outcome. The same lesson as *"a unit test on a primitive
    proves nothing about the caller"*, one layer up.
  - **Regression coverage** `src/test/reviewDraftCtaIntegration.test.jsx` — 21
    tests that **render `CaseViewScreen` and click the real buttons**, plus
    behavioural and source proofs of the navigation-independence rule. **3 fail
    against the pre-fix source.** The 12 dispatch-level tests deliberately pass
    against the broken build too, and say so in the file, because that is the
    coverage gap being recorded.
- **Before.** `review_draft` was a declared state with **no writer** and zero
  production rows. End persisted nothing (see NEW-26).
- **Now.** End transitions the existing meeting:
  ```
  in_progress  --End-->  review_draft     (endedAt written once)
  ```
  via the canonical `transitionMeeting` with `allowedFrom: [in_progress]`,
  patching `endedAt` only — so `id`, `caseId`, `type`, `startedAt`, `schedule`,
  `createdAt`, `createdBy`, `chairUserId`, `manager`, `participants`,
  `invitation`, `calendar` and the transcript all survive. One single-case write
  with `changedId`; never sync-all, never an append.
- **Replay is idempotent, not rejected.** A new pure primitive
  `planMeetingEnd` answers TRANSITION / **ALREADY_ENDED** / REJECT. A double
  click, or re-entry into Review from Case View, resolves to the same
  `review_draft` meeting and writes **no second `endedAt`** — NEW-29's
  authoritative-instant rule is preserved by not writing, not by recomputing.
  REJECT covers missing, foreign, cancelled, completed, `scheduled`
  (End cannot skip Start), legacy-null and letter artefacts.
- **Identity is authoritative.** Resolved by `caseId` + `meetingId` from
  `caseInfo`; no employee-name matching, no latest-meeting guessing. A meeting
  with no lifecycle identity keeps its exact previous behaviour, so Phase 2.1
  `PARENT_REQUIRED` is untouched and no case is created to enable an End.
- **Failed transition does not enter Review.** The meeting is still
  `in_progress` on the server and the notes are still in state and in the
  crash-recovery draft, so End can simply be pressed again.
- **Re-entry.** `review_meeting_record` stopped being a placeholder that opened
  the signature modal; it now calls `openReviewForMeeting`, which restores
  identity, `startedAt` and the **persisted `endedAt`** from the meeting,
  reads the transcript back from it, and writes nothing. Generation is deferred
  to an effect so it runs after the queued identity has committed — the same
  React update race `HomeMeetingScreen`'s Start comment warns about.
- **Downstream boundary proven.** `isMeetingComplete(review_draft) === false`,
  so `review_draft` unlocks no signature, no outcome letter, no appeal outcome
  and no closure. The `review_draft → completed` allowed-from guard is
  **deliberately still absent — that is Phase 3B**, and a test asserts 3A did
  not quietly add it.
- **Badge.** A held-but-unconfirmed hearing no longer reads "in progress"; it
  reads "… record in review". Same narrow rule as before: only meetings that
  **declare** a status are reinterpreted, so all 884 legacy rows are unaffected.
- **Appeal unchanged.** The chair is validated at Start; `in_progress →
  review_draft` never writes `chairUserId` and never consults the currently
  appointed officer, so replacing the appeal manager after the hearing started
  does not block End. The deployed trigger was **not** modified — testing showed
  it does not apply to this transition.
- **Evidence** `src/test/endToReviewDraft.test.js` — 47 tests covering A–AI of
  the agreed matrix; **30 fail against the pre-3A source**.
- **Scope held.** No persisted `reviewDraft` content, no autosave, no Regenerate,
  no prep persistence, no completion guard change, no Case View redesign, no
  recipe change, no migration, no new API function. Persisting the **transcript**
  at End is 3A, not 3B: the transcript is the meeting's own long-standing field
  (all 884 legacy rows carry it) and is the input Review generates *from*, which
  the 3A brief required; the Review **draft** remains volatile.
- **REMAINING PHASE 3A VERIFICATION GAP.** The repaired End path now persists
  `{ endedAt, transcript: allNotes }`, but **no production meeting proves it**:
  `AT - Continuity Retest` was ended before the fix, so its transcript is
  irrecoverably empty, and it must not be ended again. One fresh human Golden
  Path is required — notes entered → End → same meeting `review_draft` →
  transcript persisted → Review generates from it → refresh → Case View shows
  *Review meeting record* → reopening uses the same persisted meeting.
- **Fixture NOT pre-created by Compass.** Creating it needs two user-facing
  actions (create case, Start meeting) and there is no authenticated session to
  perform them through the product; fabricating the rows directly would both
  bypass the very `beginMeeting` path under test and risk a fixture shaped
  unlike a real one. Walter creates it via the UI — see the handoff.
- **Both required evidence streams are in** (human UI + read-only database), so
  Phase 3A is closed. **Two separate issues were surfaced by this UAT and are
  registered below, not fixed here: NEW-36 and NEW-37.**

### NEW-26 — Review draft destroyed by refresh or navigation
- **Severity** P1 · **Area** Review persistence
- `handleReview` deletes the local draft on entry to Review, which is the
  point at which the most unsaved work exists.
- **Root cause CONFIRMED by the Phase 3 audit, 2026-09-25.** Worse than
  recorded: `handleReview` performed **no persistence of any kind** — a scan of
  its whole body found `saveCases` 0, `persistMeeting` 0, `transitionMeeting` 0,
  `saveCaseToDB` 0, `supabase` 0, `endedAt` 0, `status` 0 — *and* it cleared the
  localStorage crash-recovery draft on the way out
  (`orgLsSet("compass_meeting_draft", null)`). So between End and Save the
  meeting existed only in that browser tab, on the server and locally.
- **PARTIALLY REMEDIATED by Phase 3A.** The lifecycle now survives: End
  transitions the existing meeting `in_progress → review_draft` and writes
  `endedAt`, so a refresh or navigation returns to Review for that same meeting
  instead of offering to Start or Resume it. **Review CONTENT is still volatile**
  — the generated record, summary, risk and next steps remain React state.
- **Remaining work: Phase 3B** (persisted `reviewDraft`, autosave/explicit save,
  concurrency, and the `review_draft → completed` guard).
- **Evidence** traced 2026-09-21; re-audited 2026-09-25;
  `src/test/endToReviewDraft.test.js` (47 tests) asserts the lifecycle half and
  asserts the content boundary explicitly so the split cannot be mistaken for
  completion.
- **Decision** PARTIALLY REMEDIATED — open until 3B.

### NEW-27 — no Regenerate after a successful Review
- **Severity** P2 · **Area** Review UX
- **AUDIT CORRECTION, 2026-09-25.** The earlier framing ("no *safe* Regenerate
  behaviour") overstated what exists. There is **no Regenerate control at all**.
  `ReviewScreen` exposes only `onRetryGeneration`, rendered *solely* when
  `reviewGenerationFailed` is true, plus `editRecord` for AI-assisted editing of
  the record text. So this is new-feature design, not making an existing control
  safe — and "the smallest coherent pattern supported by the existing UI" has no
  existing affordance to build on.
- Helpfully, ``reviewOutputOriginal`` already retains the un-edited AI draft
  alongside the edited one, so "has the user edited this?" is answerable without
  new infrastructure.
- **Deferred to Phase 3C.** No Regenerate button was added in 3A.
- **Decision** OPEN — Phase 3C design work.

### NEW-36 — premature signature action exposed during review_draft — P1
- **Severity** **P1** · **Area** Review screen / lifecycle boundary · **Raised** 2026-09-25 (human UAT)
- **STATUS: DEPLOYED / TECHNICALLY VERIFIED — HUMAN UAT REQUIRED.** Fixed as Phase 3B slice 1.
- **Observed.** On Review, while the meeting was still `review_draft`, the UI
  presented **"Send for signature →"** with *"Send the meeting record to the
  employee for signature"* — both immediately after End and again after a hard
  refresh and re-entry. Walter did not click it.
- **Render condition (`ReviewScreen.jsx:187`):**
  ```jsx
  {reviewOutput && !editingRecord && ( <button onClick={()=>setShowSignModal(true)}> Send for signature → )}
  ```
  It consults **only the volatile local generated text**. It does not check
  meeting `status`, `isMeetingComplete`, the persisted `record`, or anything
  lifecycle-related. So the button appears the moment AI generation returns text.
- **It is NOT cosmetic. Clicking it would, in order:**
  1. `setShowSignModal(true)` → the email modal;
  2. on confirm, `sendForSignature(email)` → `sendDocumentForSignature(…)` →
     **`POST /api/signing`** (creates a `signing_requests` row and mints `signId`
     server-side) then **`POST /api/send-for-signature`** — an **outward-facing,
     irreversible email of the meeting record to the employee**;
  3. then `saveMeetingToCase({ signId, signStatus:"sent" })` →
     `saveMeetingToCaseImpl`, which sets
     `...(lifecycleMeetingId ? { status: MEETING_STATUS.COMPLETED } : {})`
     **with no allowed-from guard** — so it **completes the meeting**, jumping
     `review_draft → completed` and bypassing the intended explicit completion.
  So `review_draft` can genuinely cross the signature boundary, send externally,
  and self-complete. **P1 on actual consequence, not appearance.**
- **Scope: all meeting types.** The condition has no type branching and
  `ReviewScreen` is the shared Review for Disciplinary, Investigation, Appeal and
  Grievance alike.
- **Other exposure on the same screen:** *Save to case* / *Save and go to case*
  (`ReviewScreen.jsx:87,89`) also complete a `review_draft` meeting, for the same
  missing-guard reason. That was **known and accepted** for 3A ("the existing Save
  path may still technically complete meetings today"); the signature path is the
  new finding because it also sends externally and completes as a *side effect* of
  an action whose label does not say "complete".
- **Why the Phase 3A tests missed it.** They asserted that **`getNextStep`** does
  not return `send_signature` for `review_draft` — true, and still true: Case View
  offers no signature action. But `ReviewScreen` has its own independent button
  whose condition never consults lifecycle status, and those tests never rendered
  `ReviewScreen`. The same gap as the CTA defect one turn earlier: the layer that
  was changed was tested; the layer the user touches was not. The human
  screenshot is correct and the previous claim was too narrow — it should have
  read "the Case View next-step never offers signature", not "review_draft does
  not unlock signature".
- **FIXED — Phase 3B slice 1: ONE authoritative completion boundary.**
  The root issue was not the button. `saveMeetingToCaseImpl` set
  `status: completed` **inline with no allowed-from guard**, so every UI action
  reaching it defined completion for itself. Completion is now the canonical
  `transitionMeeting`:
  ```js
  allowedFrom: [MEETING_STATUS.REVIEW_DRAFT, MEETING_STATUS.COMPLETED],
  toStatus: MEETING_STATUS.COMPLETED, patch: stampedMeeting,
  ```
  - `review_draft → completed` — the confirmation, performed by **Save**
  - `completed → completed` — **idempotent**, so a double click, or signature
    attaching `signId` moments later, is neither an error nor a second
    completion. This is what makes it impossible for signature to *be* the
    completion.
  - `scheduled` · `in_progress` · `cancelled` · legacy-null · letter artefact →
    `STALE_STATUS`. A hearing not held, or not **ended**, cannot be confirmed.
  The save object no longer asserts its own status at all, so no caller can.
- **Signature gated twice (defence in depth).**
  - **UI:** `ReviewScreen`'s condition became
    `{signatureEligible && reviewOutput && !editingRecord && (` — eligibility is
    computed from the **persisted** meeting, not the volatile local text.
  - **Action:** `sendForSignature` independently rejects an ineligible meeting
    **before** the signing row is created and before any email leaves.
  - One rule, `signatureEligibleIn(list)` — `completed` **and** a non-empty saved
    `record`, resolved by authoritative `caseId` + `meetingId`, never by name.
    The list is a parameter because render must read **state** while the action
    reads `casesRef.current`; same rule, correct source for each context.
- **An incidental but important finding.** A first attempt added a new
  `planMeetingCompletion` primitive and called it from `App.jsx`. That silently
  stopped **`react-hooks/immutability` (22) and `react-hooks/set-state-in-effect`
  (7)** from reporting anywhere in `App.jsx` — lint appeared to *improve* to 137
  errors while actually losing analysis. Bisected: not file size (20 inert lines
  changed nothing) and not the import (import alone was fine) — adding a new
  **callee** to that 10,700-line component tipped the React Compiler into
  bailing. Routing completion through the already-imported `transitionMeeting`
  both removed the extra callee and is the better architecture. Recorded because
  it means `App.jsx`'s compiler-rule coverage is fragile and lint totals there
  must be read by rule, not by count.
- **Evidence** `src/test/completionBoundary.test.jsx` — 26 tests covering the
  agreed matrix 1–20, **6 failing against the pre-fix source**. It **renders the
  real `ReviewScreen` and clicks the real button**, because the original escape
  happened when only `getNextStep` was tested.
- **Two superseded assertions updated, not weakened.** Phase 2.2's hard gate
  ("saving completes the meeting, so it is not left falsely in progress") was
  pinned to the very inline `status: COMPLETED` line that was the defect; its
  invariant is now proven along the real two-step lifecycle
  (`in_progress → review_draft → completed`, resumable at no point after End).
  The `casesRef` assertion now covers both save branches.
- **UX REFINEMENT (same turn, before closure).** Slice 1 as first deployed was
  architecturally right but forced *Review → Save → Case View → Send for
  signature*. Review now offers **both** legitimate choices while the record is a
  `review_draft`:
  - **Save to case** — confirms the record, `review_draft → completed`, no
    signature; signature can be sent later from Case View.
  - **Save & send for signature →** — a **compound action**, not a bypass: it
    performs the *same* `saveMeetingToCase()` first and only continues to
    signature once that succeeds.
  A bare *"Send for signature"* remains forbidden during `review_draft`, because
  that wording conceals the confirmation side effect. It is still shown for an
  already-completed record, where the record is already authoritative.
- **Ordering is CONFIRM FIRST, THEN SIGNATURE, enforced in code:**
  ```js
  const ids = { caseId: caseInfo.caseId, meetingId: caseInfo.meetingId };  // captured FIRST
  const saved = await saveMeetingToCase();
  if(!saved?.ok) return saved;            // nothing is sent
  setPendingSignature(ids); setShowSignModal(true);
  ```
  The ids must be captured beforehand because a successful save deliberately
  clears `caseInfo.meetingId` (Phase 2.2 — a finished lifecycle id must not
  survive). Without that capture, Stage 2 would have failed eligibility, and the
  old `saveMeetingToCase({signId,…})` tail would have taken its **create** branch
  and appended a duplicate meeting. Signature now attaches `signId` via
  `transitionMeeting` with `allowedFrom: [COMPLETED]` instead — explicit, and
  incapable of completing anything.
- **Failure semantics, all tested:**
  | Case | Behaviour |
  |---|---|
  | Save fails (stale `updated_at`, conflict, invalid state, missing/foreign meeting, server, validation) | **no signing request, no email**; meeting stays `review_draft` |
  | Save succeeds, send fails | meeting **stays completed** — no rollback to draft; nothing falsely recorded as sent; Case View can offer signature later |
  | Save to case only | `completed`, no signing request, signature available later |
  | Save & send | completed **first**, then signature |
- **The document sent is the PERSISTED record** (`signMeeting.record`), no longer
  the local `reviewOutput`, so an edit made after the save can never be emailed
  while the case file says something different.
- **One authoritative save.** Both buttons call `saveMeetingToCase()`; there is no
  `…ForSignature` / `…ForNormalSave` divergence, and exactly **one** occurrence of
  the completion `allowedFrom` set exists in the codebase (asserted).
- **Evidence** `src/test/saveAndSendCompound.test.jsx` — 24 tests covering the
  agreed matrix 1–20, **8 failing against the pre-refinement source**, with the
  external send mocked. No real emails, no real signing requests.
- **NOT human verified.** No duplicate of NEW-26/27/32.

### NEW-37 — Meeting Quality Check: duplicate suggestions and double confirmation — P3 (product/UX)
- **Severity** **P3** · **Area** End flow / Meeting Intelligence · **Raised** 2026-09-25 (human UAT)
- **STATUS: OPEN — informational audit only. Nothing changed.**
- **Observed.** End produced *"MEETING QUALITY CHECK — A few things worth a look
  before you close this out"* listing two unresolved actions, then a **second**
  *"Proceed anyway?"* confirmation with an optional reason.
- **Controlled by** `computeMeetingQualityGaps()` (deterministic) →
  `attemptEndMeeting()` → `setShowQualityCheck(true)`, else `handleReview()`.
- **Deterministic check over AI-generated inputs.** The gap computation is a plain
  filter; three of its four sources are model output from
  `updateMeetingIntelligence` (`parsed.actionsIdentified`,
  `parsed.evidenceMentioned`), and the fourth is a keyword heuristic.
- **Four trigger categories, `status === "pending"` only** (so accept/dismiss
  suppresses them): essential prep questions not asked · evidence/witness
  mentions pending · **action suggestions pending** · allegations whose title
  words appear in under half the transcript text.
- **The two entries were semantically duplicate and deduplication cannot catch
  them.** The merge guard is exact-string, case-insensitive:
  `known.has(a.description.trim().toLowerCase())`. *"Chair to review the meeting
  record before confirmation"* and *"Review the meeting record before issuing
  confirmation of outcome"* are different strings, so both persisted. There is no
  semantic dedup.
- **No pre- vs post-meeting distinction exists.** Every pending action is treated
  as a reason to pause before ending. Both entries here are *legitimate
  post-meeting workflow steps* — reviewing the record before confirming an
  outcome is literally what `review_draft` now exists to represent, so Compass
  warned the user against ending a meeting for intending to do the very next
  thing the lifecycle prescribes. This is the substantive finding.
- **"Create follow-up action"** (`createQualityCheckFollowUp`) creates one case
  task named `"Follow up on: " + gaps.join("; ")`, then proceeds to Review. It
  does not accept the individual suggestions, change meeting state, or emit its
  own audit event. It resolves the case by **employee name** (a NEW-20 FULL site).
- **Accept/Dismiss persistence is split.** Accept creates a **persisted case
  task**; the suggestion's own `accepted`/`dismissed` status is **React state
  only** and is lost on refresh. Accept also name-matches the case.
- **The two confirmation layers do serve different purposes**, though the second
  is thin: the modal is *informational with three routes* (Return / Create
  follow-up / Proceed), while `requestOverride` exists to create the **audit
  record** that a gap was knowingly left. Verified in production: the override
  wrote `Ended meeting despite quality check gaps` with detail
  `"…Chair to review… ; …Review the meeting record… — no reason given"`. The
  unconditional audit is deliberate (Phase 6.5 closed a hole where a blank reason
  left no record at all). So it is **not pure duplicated friction** — but the
  prompt could be merged into the first modal without losing the audit.
- **Reason persistence:** `audit_log` only, against the case. It does **not**
  enter the meeting record or transcript. Appears in audit; timeline presentation
  not separately verified.
- **Scope: all meeting types** — no type branching in the gap computation or the
  single End path.
- **Assessment against "the intelligence should be in the system, not all over
  the screen":**
  | Classification | Item |
  |---|---|
  | **KEEP** | the override audit record; essential-question-not-asked; allegation-not-discussed |
  | **SIMPLIFY** | two confirmation layers → one modal that captures the optional reason inline |
  | **MOVE TO POST-MEETING** | *"review the record before confirming the outcome"*-class actions — these belong as Review/Case View next steps, not as End-time warnings |
  | **REMOVE / DEDUPLICATE** | semantically duplicate AI actions; persist accept/dismiss so a decision is not re-surfaced after refresh |
- **Recommended future treatment:** classify each AI-identified action as
  pre-meeting or post-meeting and only gate End on the former; dedupe
  semantically; fold the reason prompt into the single modal. Belongs with the
  later workflow-simplification phase, **not** 3B.
- **Not a duplicate** of NEW-26, NEW-27 or NEW-32.

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
- **STATUS: DEPLOYED / HUMAN VERIFICATION REQUIRED** (Phase 2.3, 2026-09-23).
- The action label promised scheduling; the handler opened a generic meeting
  form whose only outcomes were Prepare or Start. Nothing was persisted.
- Scheduling now creates a real lifecycle meeting — `status: "scheduled"` with
  `caseId`, `createdAt`, `createdBy` and `schedule.{date,time,method,location}`
  — which is the same object later prepared, started, reviewed and completed.
  The case stops recommending a meeting that is already arranged.
- **Evidence** `src/test/meetingScheduled.test.js` (61 tests); Compass-first
  write order asserted against source; deploy below.
- **Decision** NOT CLOSED. The human-facing route has not been exercised in a
  browser. Close only after the human UAT flow in the Phase 2.3 report passes.

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
- **STATUS: CLOSED** (Phase 2.3, 2026-09-23). The order is reversed: Compass
  persists and confirms first, then attempts calendar sync. A calendar failure
  leaves the meeting scheduled and shows *"Meeting scheduled in Compass.
  Calendar sync failed"*; the provider's error is logged, never shown. Sync
  success patches the same meeting id and cannot create a second one.
- **Evidence** source-order assertions plus `transitionMeeting` patch tests in
  `src/test/meetingScheduled.test.js`.

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
- **STATUS: DEPLOYED / HUMAN VERIFICATION REQUIRED** (Phase 2.3, 2026-09-23).
  Scheduling now sources `chairUserId` from `case_access.role='appeal_manager'`
  via `appealManagerIdForCase`, and the deployed trigger validates it at
  creation. The client supplies the value; the database decides.
- **Decision** NOT CLOSED. Requires the human appeal UAT flow (R-U) in the
  Phase 2.3 report.

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
- **STATUS: DEPLOYED / HUMAN VERIFICATION REQUIRED** (Phase 2.3, 2026-09-23).
  The Case View now detects the mismatch deterministically before any Start
  attempt, states *"Appeal officer changed — this hearing must be rearranged
  under the current officer"*, and disables that hearing's Start button. This
  is an affordance only: the database remains the control and would refuse the
  transition regardless.
- **Decision** NOT CLOSED until a human confirms the state is visible.

### Workflow transition written through unchecked sync-all
- **Severity** P3 · **Area** Persistence · **Raised** 2026-09-22
- `CaseViewScreen.jsx:359` (`disciplinary_invite`) sets `stage:"disciplinary"`
  via `saveCases(cases.map(...))` with no `changedId`, not awaited and with no
  result check — so a rejected or conflicted write proceeds silently.
- **Decision** OPEN — Phase 2.5. No new meeting write may use sync-all
  (enforced structurally in `meetingWrites.js`).

### Live meeting notes are not yet persisted server-side
- **Severity** P2 · **Area** Capture / Resume · **Raised** 2026-09-23
- Phase 2.2 solves **A: meeting existence survives refresh.** It deliberately
  does **not** solve **B: live notes/transcript survive refresh.** The
  transcript is still written only at Save.
- Consequence: resuming on the device the meeting was started on restores the
  notes from the existing localStorage draft; resuming on a *different* device
  restores the meeting's identity and `startedAt` but no notes. The Case View
  affordance states this explicitly rather than implying the notes travel.
- **Decision** OPEN — Phase 5 (capture hardening) owns transcript persistence.
  No autosave architecture was invented here.

### Two tabs can start two separate meetings
- **Severity** P3 · **Area** Concurrency · **Raised** 2026-09-23
- **Currently possible.** Retrying the *same* Start is safe — the id is held
  in `pendingStartRef` and reused, so a retry patches rather than appends. But
  two independent Start-now actions in two tabs mint two ids and create two
  `in_progress` meetings; no database invariant prevents it.
- `resumableMeetingFor` handles the result deterministically (most recently
  started wins, `ambiguous` reported, never array order) and the Case View
  says so, so the condition is visible rather than silent.
- **Decision** OPEN. A uniqueness constraint was deliberately **not** added —
  that is a schema change requiring its own review.

### End does not transition the meeting lifecycle
- **Severity** P3 · **Area** Lifecycle · **Raised** 2026-09-23
- Clicking End does not change `status`; the meeting stays `in_progress`
  until Review Save completes it. `review_draft` does not exist until Phase 3,
  and inventing a stand-in status now would strand anyone mid-Review.
- A meeting ended but never saved therefore remains live and resumable. That
  is truthful — the record was never saved — but it means Resume can offer a
  meeting the user considers finished.
- **Decision** OPEN — Phase 3 inserts `in_progress → review_draft → completed`.
  Deliberately deferred, not overlooked.

### Rollback exposure — Phase 2.2
- **Severity** P3 · **Area** Deployment · **Raised** 2026-09-23
- Reverting Phase 2.2 application code while `in_progress` meetings exist is
  **safe but not free**:
  - Phase 1's reader is still deployed, so `isMeetingComplete` returns false
    and the engine keeps recommending the meeting — no crash, no disappearance.
  - `MeetingsTab` and `caseTimeline` still render the row (as not-yet-held).
  - **Risk:** the reverted Save path mints a fresh id, so a meeting started
    under 2.2 and saved under reverted code would append a **duplicate** row.
    Bounded to meetings in flight across the rollback; visible, non-destructive,
    no data loss.
- **Decision** ACCEPTED and documented. Forward-compatible reading shipped in
  Phase 1, which is why rollback degrades rather than breaks.

### Prepare → Start created a duplicate meeting — P1
- **Severity** **P1** · **Area** Meeting lifecycle continuity · **Raised** 2026-09-25 (human UAT)
- **STATUS: FIXED / DEPLOYED — HUMAN RETEST REQUIRED.**
- **Reproduction.** On case `e2d474da-…`: Schedule a Disciplinary meeting, click
  **Prepare**, then **Start meeting** from the prep pack.

  | Time | Action | Result |
  |---|---|---|
  | 08:17:02 | Schedule | `meeting_6a8bdb7c` — `scheduled`, 2026-10-02 10:00, Teams |
  | 08:51:16 | Prepare | no write at all; `caseInfo.meetingId = meeting_6a8bdb7c` |
  | 08:53:41 | Start | **`meeting_352722cc`** — `in_progress`, **`schedule: null`** |

  One hearing became two objects. The scheduled one was stranded (`startedAt`
  still null) and the live one lost the planned time and method entirely.
- **Root cause.** `PrepScreen` called `beginMeeting()` with no arguments, and
  `beginMeeting` minted `newId("meeting")` unconditionally:
  ```js
  const attempt = pendingStartRef.current && pendingStartRef.current.caseId === caseId
    ? pendingStartRef.current
    : { id: newId("meeting"), caseId, startedAt: startInstant() };
  ```
  It never consulted the authoritative id that `prepareScheduledMeeting` had
  already written to `caseInfo.meetingId`. `startScheduledMeeting` — the correct
  `transitionMeeting` path — was wired to exactly one place, the Case View
  banner. The prep pack had no route to it. Not a regression: Phase 2.2 built
  Start-from-scratch correctly and Phase 2.3 never connected the Prepare → Start
  hop to the transition it had introduced.
- **Why the Investigation did not fork** on 24 Sept: it was started from the
  Case View banner, so it took `startScheduledMeeting`. Same case, two doors.
- **Fix.** `beginMeeting` now branches on an explicitly supplied meeting id:
  a named, already-persisted meeting is authoritative and is **transitioned**
  via the existing shared `startScheduledMeeting`; only an absent id creates.
  The decision itself is a new pure primitive, `planIdentifiedStart`
  (`meetingWrites.js`), which classifies and writes nothing.
  - `scheduled` → TRANSITION (same id, `scheduled → in_progress`)
  - `in_progress` → RESUME (idempotent; writes nothing, never restamps `startedAt`)
  - missing / foreign / cancelled / completed / `review_draft` / legacy-null /
    letter artefact → **REJECT**. Create is never a fallback.
- **Read from `ctx` only, never from `caseInfo`.** `HomeMeetingScreen`'s Start
  calls `commit()` (which queues `meetingId: null`) and then `beginMeeting` in
  the same handler — the documented React update race its own comment already
  warns about for `caseId`. Falling back to `caseInfo` would read the
  **pre-commit** value and could transition a meeting left over from an earlier
  session. `PrepScreen` passes the id (safe: committed before it rendered) and
  `HomeMeetingScreen` passes `meetingId: null` to state the cold intent.
- **Preserved.** `schedule` (date/time/method), `createdAt`, `createdBy`,
  `caseId`, `chairUserId`, `invitation`, `calendar`. Added: `status`,
  `startedAt`. Planned time and actual start remain independent facts — starting
  early does not rewrite the plan.
- **Appeal security untouched.** The transition patches `startedAt` only and
  never writes `chairUserId`; the deployed trigger still revalidates the chair
  on the `scheduled → in_progress` move, and the database remains the control.
- **Regression coverage** `src/test/prepStartContinuity.test.js` — 34 tests.
  **24 of them fail against the pre-fix source** (proven by reverting the four
  changed files). Includes a harness whose `honourIdentified:false` mode
  reproduces the exact production duplicate, and coverage that the corrected
  path cannot leave a scheduled meeting advertised while one is live.
- **Five existing invariant tests were updated**, not weakened: they asserted
  the old *wording* of code deliberately changed. The `beginMeeting` time ban
  became "reads no schedule data and validates no time" (stronger, and immune
  to the delegation identifier); the `meetingWrites` import rule became "exactly
  one import statement, to the lifecycle primitive" (names may grow, a second
  dependency may not).
- **HUMAN VERIFIED 2026-09-25 09:55** on a fresh case,
  `b3400735-f884-4f50-89dc-1012e3546d4b` ("AT - Continuity Retest"), deliberately
  not the forked pair, so the defect evidence stayed intact.

  | Criterion | Evidence |
  |---|---|
  | one meeting | `entry_count = 1` |
  | same id | `meeting_df599cb1-66be-4203-b956-7725721bf318`, matching the Record URL |
  | `in_progress` | `status = in_progress` |
  | schedule preserved | `{2026-10-04, 10:00, Microsoft Teams}` |
  | `startedAt` added | `2026-09-25T09:55:30.265Z` |
  | no duplicate / orphan | `scheduledMeetingsFor` → `[]`; org-wide scan of the window returns this one meeting |
  | no parentage drift | `caseId` unchanged; `createdBy` unchanged; `chairUserId` null |

  **Proof it was a patch, not a create:** `createdAt 09:55:02.484` ≠
  `startedAt 09:55:30.265` — 27.8s apart — so the object predates the Start
  write, and `createdAt` coincides with the Schedule PATCH. The object also
  carries **17 keys**, the scheduled shape, where the pre-fix duplicate carried
  14. The write chain shows each conditional key being the value the previous
  write produced:

  ```
  09:54:21.543  POST  /rest/v1/cases                                        201
  09:55:02.631  PATCH ?…&updated_at=eq.2026-09-25T09:54:21.409+00:00        200   schedule
  09:55:30.426  PATCH ?…&updated_at=eq.2026-09-25T09:55:02.487+00:00        200   start
  ```

  Prepare wrote nothing between them. The audit trail now names the SAME id at
  Start — `Meeting started — meeting meeting_df599cb1-…` — where the defective
  flow named `meeting_352722cc` against a scheduled `meeting_6a8bdb7c`.
- **CONTAMINATED UAT FIXTURE CLEANED — 2026-09-25 ~11:05 UTC.** Forensic
  correction of `AT - Scheduling Phase 2.3`
  (`e2d474da-4b90-47a7-8e82-cfcaf17d92ef`) after the code fix was verified.
  - **Retained** `meeting_6a8bdb7c-8a6c-4d4c-881b-a6b071b9769f` — the scheduled
    parent, proven authoritative three ways: its `createdAt 08:17:02.782` matches
    the `Meeting scheduled` audit row and the schedule PATCH; it is the only
    object holding the `schedule`; and it has the 17-key scheduled shape.
  - **Removed** `meeting_352722cc-80b3-4c43-b4c5-deba318f24c7` — the defective
    duplicate, proven so by `createdAt === startedAt === 08:53:41.718` (minted at
    the Start click), a 13-key `beginMeeting` shape, and **no `schedule` key at
    all**.
  - **Merged in, nothing else:** `status: in_progress` and
    `startedAt: 2026-09-25T08:53:41.718Z`. That start genuinely happened, and it
    is exactly what the fixed code would have patched onto the scheduled object.
    No record, transcript, preparation, invitation or calendar fact was
    manufactured; nothing was marked completed; the Investigation entry was not
    touched (byte-identical, 36 keys).
  - **Method:** one guarded `UPDATE` — single statement, therefore a single
    transaction — asserting the pre-image `updated_at`, the array length, and all
    three ids by position, so it was a no-op unless the state was exactly as
    audited. No admin bypass, RPC or migration was created. There is no
    application path that deletes a meeting, and adding one would have been the
    reusable bypass the brief forbids.
  - **Rollback** `docs/uat-fixture-rollback-2026-09-25.md` — both Disciplinary
    objects verbatim, pre-image `updated_at 2026-09-25 08:53:41.724+00`, pre-image
    `md5(meetings::text) = 5b8c187fb3e7ddf376922f4233c2a34a`, and a guarded
    restore statement.
  - **Safety, verified before mutating:** UAT data (empty `employee_email`, no
    portal account, `confidential = false`, no real person). An exhaustive scan of
    **all 39 public tables** found the two ids referenced nowhere except `cases`
    and one `audit_log` row — `signing_requests` 0, `calendar_synced_events` 0,
    `case_signals` 0, `case_tasks` 0, no other case. All seven `cases` triggers
    still fired; the appeal-chair trigger ran and correctly skipped
    (`'disciplinary' not like '%appeal%'` ⇒ `requires_chair` false).
  - **`audit_log` deliberately untouched.** It keeps its row naming the removed
    id (*"Meeting started — meeting meeting_352722cc-…"*, `08:53:42.101`). That
    row truthfully records what happened; rewriting it would falsify history,
    which is worse than a dangling reference in an append-only log. The id
    relationship is recorded here so the history stays understandable.
  - **Post-cleanup verification:** 2 entries; one Disciplinary lifecycle object;
    `status in_progress`; `schedule {2026-10-02, 10:00, Microsoft Teams}` intact;
    `startedAt` preserved; `endedAt` null; `createdAt`/`createdBy`/`caseId`
    truthful; `scheduledMeetingsFor → []`; `resumableMeetingFor` unambiguous
    (count 1); derived stage `disciplinary`; next step **`resume_meeting`**
    naming the retained id — no false "completed", no orphan, no duplicate. The
    clean retest case `b3400735` is byte-identical
    (`md5 0aeccbf9c8f7200dae424d29b59a84e7`, `updated_at 09:55:30.268`), no other
    case was written, and **no application source file changed**.
- **Decision** **CLOSED.** Code defect fixed and human verified; contaminated
  fixture cleaned and verified. Not reopened.

### Cold / case-less Prepare is deliberately volatile — deferred
- **Severity** P3 · **Area** Prep entry path / UX · **Raised** 2026-09-25 (Phase 3 audit)
- **STATUS: DEFERRED BY DECISION. Not a defect to fix in Phase 3.**
- The Home → **Prepare meeting** button is gated only on employee + type.
  `commit()` sets `caseId: meetingSetup.preparedCaseId || activeCaseId || null`,
  so a user can generate a full prep pack with **`caseId === null`** — no
  meeting, and possibly no case.
- Preparation therefore **cannot** be persisted on that path without either
  violating Phase 2.1 `PARENT_REQUIRED` (an unlinked meeting must never mint a
  case), narrowing the entry point to require a case, or inventing a sixth
  pre-`scheduled` lifecycle state.
- **Decision (Option 4, approved 2026-09-25):** preparation may only ever be
  persisted against a canonical meeting that already exists — a `scheduled` or
  otherwise existing meeting. The case-less Prepare path stays **volatile for
  now**. No case is created to hold prep, no case is inferred by name, no
  anonymous pre-meeting object is created, and **no sixth lifecycle state is
  introduced**.
- Belongs to the later meeting/workflow simplification phase, which owns the
  entry-path UX. Not a Phase 3 blocker.

### Prep-pack content is not persisted to the meeting — P3 design gap
- **Severity** **P3** · **Area** Prep / Phase 3 · **Raised** 2026-09-25
- **STATUS: OPEN — recorded, deliberately out of scope. NOT a Phase 2.3 closure blocker.**
- Generated prep content (`prepNotes`, `prepQuestions`) is React state plus a
  `compass_meeting_draft` localStorage entry. No `preparation` or `preparedAt`
  key is written anywhere, and none exists on any production meeting.
- Consequence: a prep pack belongs to a browser session, not to the meeting. The
  continuity fix above makes Prepare and Start share one meeting **id**; it does
  not make prep content survive.
- Phase 2.3's claim is lifecycle identity continuity, which does not depend on
  prep persistence, so this does not block closure. Belongs with the Phase 3 /
  NEW-26 / NEW-27 prep-and-review work.

### Lifecycle-blind readers — status badge and getNextStep — P2
- **Severity** **P2** · **Area** Case View status badge · **Raised** 2026-09-25
- **STATUS: FIXED / DEPLOYED — covers BOTH the status badge and getNextStep.**
- **Observed.** With the Disciplinary meeting `scheduled` for 2026-10-02 and the
  card correctly reading *Not yet held*, the case badge read
  **"Disciplinary in progress"**.
- **Not the live-meeting banner.** `resumableMeetingFor` returns nothing for
  this case (verified by running it against the real persisted objects) — no
  meeting is `in_progress`. The string comes from `getCaseStatus` in
  `App.jsx:~9040`.
- **Root cause.** `getCaseStatus` maps meeting **type existence** to a badge
  with **no lifecycle filter at all**:
  ```js
  const types = meetings.map(m => (m.type || "").toLowerCase());
  if(types.some(t=>t.includes("disciplinary"))) return {label:"Disciplinary in progress", …};
  if(types.some(t=>t.includes("investigation"))) return {label:"Under investigation", …};
  ```
  The mere presence of a Disciplinary entry flips the badge, and the
  disciplinary test precedes the investigation test, so it wins. This is a
  pre-lifecycle reader that was never migrated to `meetingLifecycle.js`.
- **Why it is a correctness problem, not only wording.** `cancelScheduledMeeting`
  transitions the entry to `cancelled` and **keeps it in the array**. So a case
  whose only Disciplinary meeting was cancelled still reads
  "Disciplinary in progress". The reader cannot distinguish scheduled /
  in progress / completed / cancelled, so relabelling it would not fix it.
- **Process vs lifecycle.** The disciplinary *process* is legitimately underway
  once a hearing is arranged, so a badge change at schedule time is right in
  principle; "in progress" is the wrong word for it, and the mechanism is the
  wrong basis for it. `getCaseStatus` is case-progression metadata, not meeting
  lifecycle, and the two must not be derived from the same unfiltered list.
- **Second reader, same cause (found in the Phase 2.3 retest).** With one
  Disciplinary `in_progress` and nothing scheduled, `getNextStep` returned
  *"Start disciplinary hearing"* while the amber banner offered **Resume**.
  Compass stated both at once, and following the suggestion would have started a
  second hearing. Cause: the recipes ask `isMeetingComplete`, which is
  deliberately the WORKFLOW question ("may the process move on?"). `in_progress`
  and `review_draft` are both correctly "not complete", so every recipe read them
  as "no hearing yet". Only `scheduled` had been routed through the shared
  post-processor.
- **Fix — one shared post-processor, not five recipe branches or UI special
  cases.** `withScheduledMeeting` became **`withExistingMeeting`** and now
  establishes what already exists before the recipe's Start recommendation is
  allowed to stand. The recipe still decides WHAT comes next; the lifecycle layer
  establishes WHAT has happened. `resumableMeetingFor` is reused rather than
  re-derived, so the step and the amber banner can never disagree about which
  meeting is live.

  | State | Behaviour |
  |---|---|
  | `in_progress` | **Resume**, naming that meeting (`resumeMeetingId`). Outranks everything. |
  | `review_draft` | Neither Start nor Resume — surfaces the record for confirmation |
  | `scheduled` | Unchanged: resolves to the existing meeting |
  | `cancelled` | NOT held and NOT existing — a replacement IS still recommended |
  | `completed` | Falls through to the recipe's downstream branches, untouched |
  | legacy (`null`) | Falls through — Phase 1 compatibility preserved exactly |

  Type-scoped: a live Investigation cannot hijack a Disciplinary step.
- **Badge fixed from the same semantics.** `getCaseStatus` no longer reads the
  raw type list. It excludes `cancelled` meetings and distinguishes
  "Disciplinary scheduled" from "Disciplinary in progress".
  **Deliberately narrow: only meetings that DECLARE a status are reinterpreted.**
  A legacy row's `declaredStatus` is `null`, which is never `cancelled` and never
  `scheduled`, so all **884** pre-lifecycle production meetings keep their badge
  byte for byte, and letter artefacts still count exactly as before. Measured
  production impact today: **zero cases change badge** — the only `scheduled`
  meeting sits on a case that also has one `in_progress`, so that case correctly
  still reads "in progress". The fix is forward-looking.
- **New CTA handlers.** `resume_meeting` reuses the same `onResumeMeeting` the
  amber banner calls; `review_meeting_record` opens the existing record
  confirmation flow. Neither can start or create a meeting. No CTA is emitted
  without a handler.
- **Evidence** `src/test/lifecycleReaderConsistency.test.js` — 43 tests,
  **17 fail against the pre-fix source**. Includes the exact production shape
  from the verified retest (`meeting_df599cb1-…`, `in_progress`, schedule
  present, `startedAt` present, empty record, `endedAt` null) asserting Resume is
  available and no Start is recommended, plus the forked case resolving to its
  live meeting rather than promoting the stranded one.
- **Not yet addressed (unchanged scope).** `review_draft` is written by nothing
  and appears in zero production rows; Phase 3 owns the full review lifecycle.
  The `review_meeting_record` step is a safe placeholder, not that design.
- **Decision** FIXED. Human confirmation of the corrected Case View wording is a UI observation, not a data risk.

### Case Readiness question is a stale persisted AI snapshot — P3
- **Severity** **P3** · **Area** Case Readiness / AI signals · **Raised** 2026-09-25
- **STATUS: OPEN — diagnosed, not fixed. UX staleness, not a data defect.**
- **Observed.** After the Disciplinary meeting was scheduled, Case Readiness
  still asked *"Has any outcome, next step, or further meeting been scheduled
  following the investigation meeting?"* with the rationale *"The case record
  shows only one meeting and no subsequent actions, decisions, or letters are
  documented."*
- **Cause: cached/persisted AI analysis.** It is a stored row, not a live
  computation — `case_signals.sig_47802822-6aa7-40ac-ba55-d80f4bc300c8`,
  `type=unanswered_question`, `status=open`, `source=ai`,
  **`created_at 2026-09-24 20:50:32.567+00`**. That is **19 hours before** the
  Disciplinary meeting was scheduled (`2026-09-25 08:17:02`). When written, the
  statement was **true**.
- **Ruled out:** stale `caseContext` (`buildCaseContext` reads
  `cs.meetings` unfiltered, so the scheduled meeting IS in the grounding
  context, rendered as `- Disciplinary on 2026-10-02`); stale React state (the
  row itself is stale in the database); scheduled meetings excluded from
  grounding (they are not excluded).
- **Why it did not refresh.** `generateUnansweredQuestions` is only invoked
  after a meeting is **saved** (two silent call sites), never after a meeting is
  **scheduled**. And nothing auto-resolves AI-sourced signals — the
  auto-resolve path is keyed on `rule_id`, which is `null` for these.
- **Would Refresh fix it? Yes, structurally.** The panel exposes
  `generateUnansweredQuestions`; it rebuilds context from the current case,
  `supersedeOpenSignalsOfType` supersedes the stale open question before
  recreating, `saveSignalToDB` persists the result, and
  `findMatchingQuestionSignal` preserves any prior human decision.
- **Residual gap (same class as the badge).** The context line for a scheduled
  meeting carries no lifecycle status, so a regeneration can see that a meeting
  exists but cannot tell scheduled from held-with-an-empty-record.
- **Also corroborated here:** `sig_fde64568` — *"The meeting record excerpt is
  cut off before the employee's account"* — is independent confirmation of the
  known context-budget starvation (P2, separately tracked, out of scope).
- **Decision** OPEN. Persistence is intentional (human decisions must stick);
  the defect is presenting a present-tense factual claim with no as-at stamp and
  no invalidation when the fact changes.

### Retest 2026-09-25 — scheduled Disciplinary meeting "not visible" — NOT A DEFECT
- **Severity** none (no defect) · **Area** Human UAT observation · **Raised** 2026-09-25
- **STATUS: CLOSED — no code change. Scheduling step never performed.**
- **Report.** After the `b54ef95` retest, Case View showed status *Under
  investigation*, the CTA *Send investigation record for signature*, and no
  scheduled Disciplinary meeting or Prepare/Start/Reschedule/Cancel controls.
- **Authoritative state.** Unchanged from before the retest: 1 meeting-shaped
  entry, `case.updated_at` still `2026-09-24 20:50:23.992`. No Disciplinary
  meeting exists anywhere in the org — a scan for any meeting scheduled
  `2026-10-02`, or created after the first failure, returns zero rows.
- **Root cause: the write was never attempted.** Full request log for the
  retest session (08:01:02 → 08:02:16) contains **no PATCH or POST to
  `/rest/v1/cases` at all**. The only writes in the entire window were
  `rpc/log_audit_event` (Session started, 08:01:06) and
  `case_views` (Case View opened on this very case, 08:01:23.37). The
  `audit_log` agrees: since 21:00 the previous day it holds exactly two rows,
  both `Session started`. So the session hard-refreshed, went straight to Case
  View and observed it; the schedule click was not performed.
- **Case View was telling the truth.** There was no scheduled meeting to show.
  This was not a rendering, selection or masking fault.
- **`b54ef95` is live and intact** in the bundle that session loaded
  (`App-C0cex4kO.js`): both `casesRef` currency sites present, the
  conflict-aware reporter at all five sites, and the `Start scheduled meeting`
  control in the shipped chunk. The stale-concurrency fix is therefore still
  unexercised by a human — it has had no second scheduling attempt to prove it.
- **What this exposed instead.** No test covered the state the retest was
  trying to reach: a completed meeting, an outstanding signature task and a
  future scheduled meeting all at once. The masking risk the brief asked about
  was real as a *risk* and simply unguarded. Now proven absent and locked in —
  the Case View banner is gated on `scheduledMeetings.length>0` alone, with no
  coupling to `nextStep`, `signStatus` or `isMeetingComplete`, and
  `send_signature` is deliberately not a `SCHEDULABLE_ACTION` so it cannot
  consume or rewrite the scheduled meeting.
- **Evidence** `src/test/scheduledMeetingCoexistence.test.js` — 18 tests.
  Mutation-proven: simulating the masking defect (a completed meeting
  suppressing scheduled ones) fails **7** of them.
- **Decision** No production change. **Superseded 2026-09-25 08:17:02** — the
  schedule was then performed successfully, persisting
  `meeting_6a8bdb7c-8a6c-4d4c-881b-a6b071b9769f` and moving the case to
  `updated_at 2026-09-25 08:17:02.787`. The single PATCH carried
  `updated_at=eq.2026-09-24T20:50:23.992+00:00` — the authoritative value, not
  the stale `20:15:11.834` that failed before — so `b54ef95` is now
  **HUMAN VERIFIED**.

### Disciplinary scheduling save failure — stale concurrency key — P1
- **Severity** **P1** · **Area** Persistence / concurrency · **Raised** 2026-09-24 (human UAT)
- **STATUS: DEPLOYED / HUMAN VERIFICATION REQUIRED.**
- **Reproduction.** On case `e2d474da-…`, already holding one completed
  Investigation meeting, scheduling a Disciplinary meeting (02/10/2026, 10:00,
  Microsoft Teams) produced *"Couldn't save this meeting — please try again."*
- **Nothing persisted.** Read-only inspection: still 1 entry,
  `case.updated_at` unchanged at `20:50:23.992`. No partial or malformed write.
- **Root cause, proven from the request logs:**

  | Time | Conditional `updated_at` sent | DB value | Result |
  |---|---|---|---|
  | 20:50:24 | `20:15:11.834` | `20:15:11.834` | matched → saved, DB → `20:50:23.992` |
  | 21:11:59 | `20:15:11.834` | `20:50:23.992` | **0 rows → conflict** |

  `casesRef` is seeded once at mount (`useRef(cases)`) and was only ever
  reassigned inside `saveCases`. Neither `loadCasesFromDB` nor
  `saveCaseToDB`'s success write-back touched it (`saveCaseToDB` contained zero
  `casesRef` references), so the ref lagged the database by exactly one write.
  All seven meeting writes read the ref — they must, because chained writes in
  one synchronous run (schedule → calendar patch) depend on it — so the lag
  became a stale optimistic-concurrency key. A conditional UPDATE matching
  nothing returns **HTTP 200 with an empty array**: no Postgres error, no
  non-2xx status, which is why neither log surfaced anything.
- **Nothing to do with the meeting type.** "Disciplinary" does not match the
  appeal trigger's `%appeal%` test, and no type-specific guard exists.
- **Not caused by the creation-metadata remediation** (`1b9175a`). That rule
  applies only on PATCH inside `planMeetingWrite`, which this write never
  reached — it failed at the case-write layer. Verified independently: the
  CREATE path still produces valid `createdAt`/`createdBy`.
- **A quieter hazard it was masking.** When a ref entry's `updatedAt` is
  `undefined`, `saveCaseToDB` takes the unconditional `upsert` branch —
  bypassing optimistic concurrency entirely. Earlier writes in this UAT took
  that path. Synchronising the ref closes it.
- **Remediation.** `casesRef.current` is now advanced in the two places that
  previously updated only `setCases`: a database load, and a successful case
  write. The ref keeps its purpose (synchronous freshness for chained writes)
  and can no longer be staler than the contract it is used for. Additionally,
  the Phase 2.2/2.3 handlers no longer show a red error for `reason:'conflict'`
  — `saveCaseToDB` already shows an accurate info toast and reloads, and
  `saveMeetingToCaseImpl` already had this right.
- **Evidence** `src/test/casesRefConcurrency.test.js` — 12 tests modelling the
  real conditional-update contract, including one that **reproduces the defect**
  with the sync disabled and asserts the exact stale key from the logs.
- **Decision** NOT CLOSED until Walter's retest.

### Creation metadata overwritten by a later meeting save — P2
- **Severity** P2 · **Area** Lifecycle integrity · **Raised** 2026-09-24 (human UAT)
- **STATUS: DEPLOYED / HUMAN VERIFICATION REQUIRED.**
- `meeting_cad06fdb-24d5-4066-adad-e46aac10483c` was created when scheduled at
  `2026-09-24T20:11:55.819Z`. After "Save and go to case" its `createdAt` read
  `2026-09-24T20:50:23.987Z` — exactly its `savedAt` — and `createdBy` had been
  re-stamped with the saving user.
- **Root cause.** `saveMeetingToCaseImpl` applies `stampNewMeeting`
  unconditionally, including when the write turns out to be a PATCH, and
  `planMeetingWrite`'s patch spread (`{...m, ...meeting}`) let the fresh values
  win. Effect: the scheduling moment is destroyed and the deliberate `createdAt`
  (first persisted) vs `startedAt` (meeting began) distinction — the thing
  scheduling made meaningful — collapses at Save.
- **Remediation.** Enforced centrally in `planMeetingWrite`, which both
  `persistMeeting` and `transitionMeeting` route through, so every write path
  present and future inherits it. On a patch: a stored value is preserved and
  the incoming one ignored; an absent one **stays absent**, so no patch can
  fabricate creation metadata for the 884 pre-lifecycle rows that carry none.
  The caller may keep stamping — on a patch the stamp cannot land.
- **Why the earlier test missed it.** `meetingStartResume.test.js` asserted
  `out.createdAt === started.createdAt` but hand-built its input as
  `{ ...started, record, status }` — already carrying the correct value. It
  tested `planMeetingWrite` alone, never the production composition
  `stampNewMeeting → persistMeeting → planMeetingWrite`. The new suite drives
  that composition: **12 of its 23 tests fail against the pre-fix code.**
- **No production data was repaired.** The already-affected UAT meeting is
  retained as regression evidence; no customer backfill.

### Context budget starves the meeting dialogue — P2
- **Severity** P2 · **Area** AI grounding · **Raised** 2026-09-24 · **NOT IMPLEMENTED**
- Case Readiness asked *"What account or response did the employee give?"*
  explaining *"The meeting record excerpt is cut off before the employee's
  account"* — on a meeting whose record contains it.
- **Not a NEW-33 regression.** Verified by running the real `buildCaseContext`
  on the real record: excerpt marker present, NOTE ON EXCERPTS present, and the
  employee's account genuinely absent from the context. The model described its
  input accurately, which is exactly what NEW-33 was built to achieve.
- **The budget is the problem.** Factual record 794 chars vs
  `MEETING_FULL_CHARS` 500; `## Meeting Dialogue` begins at ~char 455 and
  `"public transport"` sits at char 663. Roughly 455 of the 500 characters are
  spent on Meeting Details boilerplate (Type, Date, times, Chair, Notetaker,
  Employee, Representative, Participants, Purpose), so the dialogue is cut
  within its first question. **NEW-33 solved truthfulness, not sufficiency.**
- **Decision** OPEN. Per the NEW-33 instruction not to raise 500 to an
  arbitrary larger number, the likely fix is to prioritise the dialogue section
  over metadata the AI can obtain from structured fields. Not implemented.

### NEW-31 reproduced — the unanswered-question generator is unguarded
- **Severity** P2 · **Area** Signals / AI · **Raised** 2026-09-24 · **NOT IMPLEMENTED**
- Case Readiness asked *"Has a notetaker been identified and are meeting notes
  available…?"* on a record reading `Notetaker: Not specified`.
- The **Review record generator** carries an extensive guard (*"a named
  notetaker is optional… never raise the absence of a named notetaker as a
  concern, a risk or something to verify"*). `generateUnansweredQuestions`
  carries **none of it**: measured on its prompt — `notetaker` 0,
  `NO_INVENTED_AUTHORITIES` 0, `REVIEW_EVIDENTIAL_CONTRACT` 0,
  `LEGAL_ACCURACY_BOUNDARY` 0. It does use `buildHardenedCaseContext`, so it
  receives the NEW-33 excerpt, but none of the four evidential contracts.
- **This is NEW-31's open half**, and the generator is an unguarded surface for
  the whole NEW-22/23/25/28 class, not only notetaker.
- **Decision** OPEN. Not implemented.

### Signature next step is an unconditional recipe default
- **Severity** P3 · **Area** Process recipe · **Raised** 2026-09-24 · **NOT IMPLEMENTED**
- `nextStep.js:161` returns *"Send investigation record for signature"* with the
  reason *"The employee should confirm the record is accurate before it's relied
  on"* whenever `lastInv?.signStatus !== "signed"`. It is not gated on
  organisation configuration, policy, case type or any authority, and is
  presented as the single primary action — which reads as stronger than
  recommended good practice. Recorded as what the code does; no legal conclusion
  is drawn here.
- **Decision** OPEN — belongs to the later process-recipe / UX phase.

### RecordScreen refresh lost the meeting and regenerated startedAt — P1
- **Severity** **P1** · **Area** App bootstrap / navigation · **Raised** 2026-09-24 (human UAT)
- **STATUS: DEPLOYED / HUMAN VERIFICATION REQUIRED.**
- Before refresh: *Investigation · AT - Scheduling Phase 2.3 · Started 21:15*.
  After a plain ⌘R at `?screen=record`: *Meeting · Unknown · Started 21:18*.
- **No data was harmed.** Read-only inspection proved one meeting, `status
  in_progress`, `startedAt 2026-09-24T20:15:11.833Z`, no duplicate, and
  `cases.updated_at` unchanged since the Start write — the refresh performed no
  database write at all. The 21:18 value existed only in client state.
- **Cause.** The record route persisted only `screen=record`; `case` was written
  for the Case View alone. On a cold load `activeCaseId`, `meetingType`,
  `caseInfo` and `meetingStartTime` all fell back to defaults, so the header
  rendered `meetingType?.label||"Meeting"` and `caseInfo.employee||"Unknown"`,
  and the NEW-29 capture effect — correct by its own contract — stamped `now`
  because reaching RecordScreen no longer only means "a meeting is beginning".
- **Phase 2.2 implemented Case View resume navigation, not RecordScreen refresh
  recovery.** `resumableMeetingFor` had exactly one consumer, the Case View
  banner. Nothing on the bootstrap path consulted lifecycle state.
- **Remediation (2026-09-24):** the record URL now carries
  `case=<caseId>&meeting=<meetingId>`; cold load waits for the authorised case
  set, resolves both, verifies parentage and `in_progress`, then restores via
  `resumeMeeting`; RecordScreen shows "Restoring your meeting…" instead of its
  own defaults; the NEW-29 capture is narrowed by `!recordRecovery`; a local
  draft for a different meeting can no longer own identity or null a recovered
  `startedAt`. Recovery fails closed — no case ⇒ Cases, no meeting ⇒ Case View,
  unknown/non-live/cross-parented ⇒ Case View. It never guesses.
- **Evidence** 36 tests in `src/test/recordBootstrapRecovery.test.js`, driving
  the real URL reader, URL writer and resolver against the exact production
  meeting state.
- **Decision** NOT CLOSED until Walter's retest.

### Missing app-bootstrap / cold-load test coverage — P2
- **Severity** P2 · **Area** Process · **Raised** 2026-09-24
- **STATUS: CLOSED** — the category now exists.
- Phase 2.2 had lifecycle helper unit tests, Case View wiring assertions and
  source-invariant checks, and all passed. **Nothing mounted the app fresh with
  no prior navigation state.** Every test either called a pure helper directly
  or grepped source, so the entry point a user actually arrives through was
  never exercised. This is the same shape as the bundle-marker gap the day
  before: the parts were verified, the door was not.
- **Closed by** `src/test/recordBootstrapRecovery.test.js`, which drives cold-load
  resolution, fail-closed redirects, ambiguity handling and `startedAt`
  authority without any pre-existing React state.

### Scheduling logistics were unreachable for non-appeal meetings — P1
- **Severity** **P1** · **Area** Scheduling UX · **Raised** 2026-09-24 (human UAT)
- **STATUS: DEPLOYED / HUMAN VERIFICATION REQUIRED.**
- Time and Method/location were rendered only when
  `meetingSetup.appealChairLocked` was true — the **appeal chair security**
  flag, set solely by `CaseViewScreen`'s `start_appeal_meeting` handler. An
  Investigation, Disciplinary, Grievance or any other type therefore had **no
  way to enter a time or a method at all**, while Phase 2.3's Schedule action
  claimed to persist `schedule.{date,time,method,location}`.
- The coupling was accidental: those fields were added on 2026-09-20 to show an
  appeal hearing's *actual* logistics prefilled from a saved invitation, not as
  scheduling inputs. Phase 2.3 added a Schedule intent to a form built for the
  older Prepare/Start model, where `date` meant "the date this meeting is being
  held" and no time was ever needed.
- **Compounded by my own report**, which instructed the tester to "enter a
  future date, a time, and a method" — describing controls that did not exist
  on that route. My tests asserted the source string `'Schedule meeting'` and
  the persisted shape, never that a user could supply the values that shape
  claims to hold.
- **Remediation (2026-09-24):** visibility coupling removed so both controls
  render for every structured type; appeal chair locking and prefill untouched;
  **Time required for Schedule only** — never for Prepare or Start;
  `schedule.method` written once, `schedule.location` no longer written (reads
  of any pre-existing one still tolerated); `scheduleInstant` returns NaN for a
  missing or malformed time instead of inventing midnight, so timeless
  scheduled meetings sort last; invitation drafting now receives the time and
  method it can be given.
- **Evidence** 80 tests in `src/test/meetingScheduled.test.js`; served-bundle
  assertions now include the user-facing control labels and both input ids.
- **Decision** NOT CLOSED. Requires Walter's retest.

### Verification gap — bundle checks used downstream strings only
- **Severity** P2 · **Area** Process · **Raised** 2026-09-24
- The Phase 2.3 serving-bundle check grepped `Meeting scheduled`,
  `Start scheduled meeting`, `Meeting rescheduled`, `Meeting cancelled` and
  `Appeal officer changed` — **every one of which lives in `App.jsx` or
  `CaseViewScreen.jsx`.** All five could have been present while the actual new
  control was missing from the screen the user operates, which is exactly what
  happened.
- **Remediation** Bundle verification must assert the **user-facing control
  labels and input ids**, not only downstream toast/banner strings. Applied
  from this remediation onward, pre-build and post-deploy.
- **Decision** CLOSED as a process change; recorded so it is not repeated.

### Calendar sync has no retry affordance
- **Severity** P3 · **Area** Calendar · **Raised** 2026-09-23
- When sync fails the meeting is scheduled and the user is told so, but there
  is no button to retry the sync against the same meeting. `syncMeetingToCalendar`
  is already safe to call again — it patches the existing meeting id and would
  not create a second Compass meeting — but a retry could create a **duplicate
  calendar event** at the provider, because nothing checks for an existing
  `calendar.eventId` first.
- **Decision** OPEN — deliberately deferred. A safe retry needs
  eventId-aware update-or-create semantics in the integration, which is a
  larger change than this phase allows.

### Scheduling from the Calendar screen requires a linked case
- **Severity** P3 · **Area** Scheduling · **Raised** 2026-09-23
- The Calendar screen previously allowed scheduling a stand-alone meeting with
  no case; it created a calendar event and no Compass record. Because a
  lifecycle meeting requires authoritative parentage (Phase 2.1), that path
  now asks the user to choose a case.
- **Intentional behaviour change**, consistent with `parent_required`.
- **Decision** OPEN — the unlinked link-or-create flow is Phase 2.5.

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
