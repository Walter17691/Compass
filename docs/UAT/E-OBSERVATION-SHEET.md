# Document E — Observation Sheet

One copy per session. Fill the header immediately; fill the per-task blocks live during the session; fill the summary immediately after (same day).

## Session header

| Field | Value |
|---|---|
| Date | |
| Facilitator | |
| Tester name | |
| Tester profile(s) (Doc A) | Experienced HR/ER / HR generalist / Operational manager / First-time Compass user *(circle all that apply)* |
| Tester's real-world role | |
| Prior Compass exposure | None / Brief demo seen / Used before |
| Scenario(s) assigned | |
| Production commit / deployment ID under test | |
| Device / browser / screen size | |
| Recording file reference | |
| Session start / end time | |

## Per-task observation block (copy this block once per major task within the scenario)

**Task / sub-goal:** _(e.g. "open a case for the reported incident", "record who was involved", "get the outcome letter ready to send")_

**Outcome** — circle one:

- [ ] SUCCESS — completed independently
- [ ] SUCCESS WITH HESITATION — completed, but hesitated or explored unnecessarily
- [ ] SUCCESS WITH ASSISTANCE — completed only after facilitator help (record intervention ladder rung used, Document B)
- [ ] FAILURE — could not complete, or completed incorrectly

**If SUCCESS WITH ASSISTANCE:** ladder rung reached (1–5, Document B) ______ | exactly what was shown/said: ___________________________

**If FAILURE:** what did the tester believe happened instead? ___________________________

**Time to completion:** started ______ finished ______ (or "gave up at" ______)

**Navigation path actually taken** (list screens/tabs/buttons in the order used — including false starts and backtracking):

1.
2.
3.

**Number of obvious navigation errors:** ______

**Points of hesitation** (what, and for roughly how long):

**Unexpected behaviour observed** (anything Compass did that visibly surprised the tester, good or bad):

**Terminology confusion** (any word/label the tester didn't understand, misread, or used differently than Compass does):

**Warnings/guardrails/recommendations present on screen during this task — were they noticed?**

- [ ] Noticed and understood
- [ ] Noticed but misunderstood — how: ___________________________
- [ ] Not noticed at all
- [ ] N/A — none present

**Notable tester comments (verbatim where possible):**

---

## Critical UX observation checklist (fill once per session, at the natural point it comes up)

### Home
- [ ] Tester could identify what needs attention without prompting
- [ ] Tester could identify their active cases without prompting
- [ ] Tester knew where to start the task without prompting
- Notes:

### Case Workspace — within ~5 seconds of first opening a case, could the tester say (ask them directly if not spontaneously stated):
- [ ] Whose case this is
- [ ] What type of case it is
- [ ] What stage it's at
- [ ] What happened (at a glance)
- [ ] What requires attention
- [ ] What should happen next
- Notes (which of the above failed, and what they said instead):

### Needs Attention
- [ ] Tester understood *why* an item was listed
- [ ] Tester understood *what action* was expected
- Notes:

### Compass Recommendations
- [ ] Tester treated these as suggestions, not instructions
- [ ] Tester engaged with at least one recommendation
- [ ] Tester could explain, if asked, why a recommendation was shown
- Notes:

### Guardrails / warnings
- [ ] Noticed
- [ ] Understood
- [ ] Tester knew what action (if any) to take in response
- Notes:

## AI / Copilot observation (fill for every AI interaction — Recommendation click, AI-drafted letter, AI Assistant tab)

| Interaction | Trust rating (1–5, asked immediately after) | "What would you do before relying on it?" (verbatim) | Did the tester edit/verify the AI output, or accept it as-is? | Did the tester understand a human decision was still required? |
|---|---|---|---|---|
| | | | | |
| | | | | |

**Any sign of over-trust** (accepted AI output without checking, treated a recommendation as an instruction, assumed AI had made the decision rather than assisted it)? Describe:

## Decision-support observation (investigation/outcome scenarios only — 2, 5, 6 especially)

Did the tester, unprompted, notice:

- [ ] Missing evidence
- [ ] A contradiction between accounts
- [ ] An unresolved allegation
- [ ] A procedural issue (e.g. conflict of interest, missing right of appeal)
- [ ] Incomplete information that should be gathered before deciding
- [ ] A quality/guardrail warning Compass itself surfaced

For each checked item, note whether the tester noticed it **because of something Compass showed them**, or **independently of Compass** (i.e. despite Compass, not because of it) — this distinction matters more than the raw count:

## Responsive / device observations (Section 13 — record opportunistically, don't derail the session to force this)

- [ ] Horizontal overflow observed — where:
- [ ] Clipped text observed — where:
- [ ] Inaccessible action observed — where:
- [ ] Notification popover positioning issue — describe:
- [ ] Modal positioning issue — describe:
- [ ] Tab navigation issue (Case Workspace's 12 tabs) — describe:
- [ ] Case Workspace readability issue — describe:
- [ ] Home layout issue — describe:
- Device/resolution this was observed at:

## Session summary (fill immediately after, same day)

**Overall task completion:** ___ / ___ major tasks SUCCESS or SUCCESS WITH HESITATION

**Total facilitator interventions:** ______

**Standout positive moments:**

**Standout negative moments:**

**Defects to log in Document G** (list IDs once logged):

**Facilitator's one-paragraph impression** (write this before looking at the tester's own ratings in Document F, to keep it uncontaminated):
