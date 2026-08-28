# Document K — Session Execution Checklist, Recording, Stop Conditions, Pilot & Order

This document turns Documents A–J into something you can literally run from, session by session. It doesn't replace Document B (Facilitator Guide) — B is the *how* and *why*; this is the *checklist*.

## Facilitator checklist

### 15 minutes before

- [ ] Run `node --env-file=.env scripts/uat/reset-uat-case.js --scenario <N>` for this session's scenario (skip for the first-ever run of a scenario — nothing to reset yet)
- [ ] Verify environment: the tab/window in front of the tester shows "Meridian Fulfilment Ltd (UAT)" as the org name (Settings → Organisation), **not** a real org name
- [ ] Verify tester account: logged in as the correct `uat-hr-<n>@…` account for this session (Document J §5's matrix)
- [ ] Verify correct role: confirm via Settings → Team & access that this account shows the intended role (`hr_manager` or `hr_director`)
- [ ] Verify starting state: for Scenarios 1–4/6, confirm no case exists yet for that scenario's employee (Cases search); for Scenario 5, confirm the pre-seeded investigation case exists and matches Document C's content
- [ ] Open Document E (Observation Sheet), header filled in
- [ ] Have Document C's raw material for this scenario ready to hand over (printed, or ready to paste into an email/chat the tester can open)
- [ ] Confirm recording is set up and ready to start (see Recording, below)

### Start

- [ ] Obtain recording consent (verbal is fine — note it on Document E)
- [ ] Read the opening script (Document B) close to verbatim
- [ ] Explain think-aloud
- [ ] Explicitly say: "We're testing Compass, not you"
- [ ] Do **not** explain how Compass works, where anything is, or what any label means, before the tester asks/struggles

### During

- [ ] Observe and stay quiet by default
- [ ] Timestamp hesitation (Document E)
- [ ] Record mistakes, questions, unexpected navigation as they happen, not from memory afterward
- [ ] Record AI reactions the moment they happen (trust rating + "what would you check first" — Document E's AI table)
- [ ] Apply the intervention ladder (Document B) — never skip to direct help
- [ ] For Scenario 5: hand over the appeal email only once the tester has recorded an outcome and progressed the letter (Document D)
- [ ] For Scenarios 2/3/6: hand over the facilitator-only material (witness statements, IT ticket details, etc.) only if the tester actually asks for it — and note in Document E whether they thought to ask, since that's itself a finding

### End

- [ ] Run Document F (questionnaire) verbally
- [ ] Ask the two closing questions verbatim
- [ ] Record facilitator's own summary (Document E, before looking at the tester's ratings)
- [ ] Stop recording

### After (same day — don't batch this)

- [ ] Run `node --env-file=.env scripts/uat/reset-uat-case.js --scenario <N>` to clear this session's case before the next tester
- [ ] Save/export the recording with a clear filename (`uat-session<N>-<tester>-<date>.mp4` or similar) — see Recording, below
- [ ] Transfer every finding into Document G with a real ID, before starting the next session
- [ ] Classify severity for anything that's obviously UAT-P0 immediately (don't wait for a batch triage meeting to flag a P0 — see brief §14/§13)
- [ ] Do **not** open the Compass codebase or make any change, however small, in response to what you just saw (§ Do Not Fix During UAT, below)

## Recording

**Recommendation: your OS's built-in screen recorder (QuickTime Player's "New Screen Recording" on Mac, Xbox Game Bar on Windows) capturing screen + microphone audio (tester + facilitator both audible, sitting/calling together) in one file.** No new software, no camera, consent-based, exactly matching the brief's "recommend a simple existing screen-recording approach rather than new software development."

- **Screen**: the browser window only, not the full desktop, to avoid capturing anything unrelated open on the machine.
- **Audio**: both tester and facilitator voice in the same track is sufficient — a fully separate facilitator-only audio channel isn't necessary for this round.
- **Camera**: skip it — nothing in this programme's observation framework needs a face on screen, and it adds a consent/comfort barrier for no analytical benefit.
- **Consent**: ask verbally, note the answer on Document E, before pressing record. If a tester declines recording, run the session anyway with only live Document E notes — a session without a recording is still valid data, just harder to re-verify a specific moment against later.
- **Content**: because the environment is the isolated `compass-e2e-test` project and every case is synthetic (Document C), a recording only ever contains fictional Meridian Fulfilment data — never real employee information, so long as the pre-session environment check above is actually done every time.
- **Storage**: keep recordings wherever you'd keep any other confidential-but-synthetic work artefact — they're not regulated personal data (nothing in them is real), but treat them as internal, not for casual sharing, since a tester's own voice/manner is still personally identifiable to them even though the case content isn't sensitive.

## Stop conditions (repeated from Document B, because this is the highest-stakes rule in the whole programme)

Stop the session immediately, and treat as UAT-P0 (Document G), if you observe:

- Cross-tenant data exposure — a tester sees any case, employee, or organisation data that isn't Meridian Fulfilment Ltd (UAT)'s own
- Wrong employee information shown against a case (a genuine data-integrity bug, not the tester's own mistake)
- Another tester's in-progress case appears in this tester's session
- Irreversible data corruption (something that looks wrong and won't be fixed by the normal reset script)
- Any serious privacy/security issue
- A communication is sent externally unexpectedly (an email genuinely leaves Compass to a real address, rather than to a synthetic/test-only address)
- Compass records a materially different outcome from what the tester actually confirmed (e.g. the tester selects one outcome type, a different one is saved)

Everything else — however severe as a usability or trust problem — is logged in Document G and triaged normally, per Document B and the rule below. Do not stop a session for a UX finding, however bad it looks in the moment.

## Do not fix during UAT

Repeated here because it's the rule most likely to be broken under the pressure of watching something go wrong live:

| What you observe | What to do |
|---|---|
| One tester dislikes something | Record it (Document G). Nothing else. |
| Multiple testers independently struggle with the same thing | Escalate as a likely real UX problem (still just a Document G entry, marked with rising Frequency) — do not fix mid-round. |
| A critical workflow (Document I's list) can't be completed | Investigate after the session, log as UAT-P0/P1 per Document G's definitions. Still don't fix mid-round unless it's also a stop-condition. |
| A safety/privacy/data-integrity problem | Stop the session (see Stop conditions above), treat as UAT-P0, investigate before continuing to test the affected workflow with anyone else. |
| A tester asks for something Compass doesn't do | Log as FEATURE REQUEST (Document G), kept separate from defects, not actioned during UAT (Document A). |

The entire round is only comparable if every tester ran against the same frozen version (Document J §2). Fixing something after tester 3 finds it means testers 1–3 and testers 4–7 effectively ran two different products — exactly the confound the version freeze exists to prevent.

## Pilot session

**Tester profile: an Experienced HR/ER professional (Tester #1 or #2 from Document J's matrix). Scenario: 5 (Disciplinary → Outcome → Appeal).**

**Why this profile and scenario for the pilot:** Scenario 5 is the single highest-priority journey in the whole programme (brief, repeatedly) and the one with the most preparation risk (the only manually pre-seeded case, Document J §6/§7) — running it first surfaces any problem with the seeding itself, the appeal hand-off timing, or the facilitator script, before committing six more sessions' worth of tester time to a process that hasn't been dry-run. An experienced HR/ER tester is the right profile for the pilot specifically because they're the profile best placed to tell you, mid-session, whether the seeded case *reads as real* — a first-time or generalist tester wouldn't have the frame of reference to notice if something about the pre-seeded content felt off, and a seeding problem discovered by tester #4 rather than the pilot would be a wasted session.

**What the pilot validates** (brief §16): scenario length (is 45–60 minutes realistic for Scenario 5 specifically, the longest journey), task clarity (does the task sheet's minimal framing actually work, or does the tester stall immediately for reasons unrelated to Compass itself), environment (does the reset/seed tooling actually produce a clean, correct starting state end-to-end), observation process (is Document E's structure actually fillable live, in real time, without missing things), recording (does the screen-recording approach actually work technically), reset process (does `reset-uat-case.js --scenario 5` correctly clear the pilot's case afterward, ready for a possible second Scenario 5 tester later in the main round).

**Do not substantially redesign Compass based on the pilot** (brief) — unless a genuine UAT-P0 emerges (Document K's stop conditions), the pilot's job is to validate the *programme*, not to pre-emptively fix the *product*. If pilot findings suggest Document C/D/E/F need adjusting (timing, clarity), update those documents before the main round starts; that's explicitly in scope (brief §1/§16).

## Main session order (all 7 testers)

Following Document J's allocation matrix, sequenced to front-load discoverability testing (Scenario 1) and keep the two highest-priority scenarios (5, 6) spread rather than clustered, per brief §17:

| Order | Tester | Scenario(s) | Rationale |
|---|---|---|---|
| 0 (pilot) | #1 (Experienced HR/ER) | 5 | Validates the highest-risk, highest-priority journey and its seeding before anyone else runs it |
| 1 | #4 (HR generalist + first-timer) | 1, then 3 | Discoverability (Scenario 1) tested early, by a genuinely first-time user — the purest possible read on it, best obtained before any tester has been "contaminated" by exposure |
| 2 | #7 (First-timer) | 6 | A second first-time-user data point, and the messy/high-risk scenario gets its first independent run early rather than being saved for last (avoids the failure mode of only ever testing it with tired, late-round testers) |
| 3 | #3 (HR generalist) | 2 | Complex investigation, tested by a realistic median user |
| 4 | #5 (Operational manager) | 4 | Attendance/OH, a good fit for this profile's real-world grounding |
| 5 | #6 (Operational manager + first-timer) | 3 | Grievance, tested by someone without prior Compass exposure — a different kind of first read on the employee-as-complainant journey than an HR specialist would give |
| 6 | #2 (Experienced HR/ER) | 6 | Scenario 6's second, independent run — by the profile best equipped to judge whether Compass's guardrails did real work, closing the loop on this engagement's single most important observation (README's "what evidence would convince you" answer) |

**Tester fatigue**: no tester runs more than 2 scenarios in one sitting (only Tester #4, per Document J, and their second scenario — Grievance — is one of the lighter ones). Space sessions across at least 2–3 different days rather than back-to-back in one day, both for tester fatigue and for facilitator note-transfer discipline (Document K's "After" checklist needs to genuinely happen before the next session, not get compressed).
