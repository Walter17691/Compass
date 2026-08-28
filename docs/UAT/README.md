# Compass Human UAT Programme (Phase 8)

This is a documentation-only deliverable — no application code, database, or UI was changed to produce it. It was grounded in the actual current codebase and deployed product (the real 12-tab Case Workspace — Overview, Timeline, Allegations, Meetings, Evidence, Participants, Tasks, Documents, Communications, Themes, Outcome, AI Assistant — the real guardrail/quality-check library, the real Occupational Health referral flow, the real Home/Needs Attention/Compass Recommendations structure post-Phase-7.5C, and the confirmed removal of Onboarding/Offboarding from product scope), not written generically.

## Contents

| Doc | File | What it is |
|---|---|---|
| A | [A-UAT-PLAN.md](./A-UAT-PLAN.md) | Purpose, scope, tester profiles, environment, rules, success criteria |
| B | [B-FACILITATOR-GUIDE.md](./B-FACILITATOR-GUIDE.md) | Exactly how to run a session, opening script, intervention ladder |
| C | [C-SCENARIO-PACKS.md](./C-SCENARIO-PACKS.md) | Six full fictional case packs with all source material |
| D | [D-TESTER-TASK-SHEETS.md](./D-TESTER-TASK-SHEETS.md) | The minimal instructions actually handed to testers |
| E | [E-OBSERVATION-SHEET.md](./E-OBSERVATION-SHEET.md) | Structured recording template used live in-session |
| F | [F-POST-TEST-QUESTIONNAIRE.md](./F-POST-TEST-QUESTIONNAIRE.md) | Quantitative + qualitative debrief questions |
| G | [G-FINDINGS-REGISTER.md](./G-FINDINGS-REGISTER.md) | Defect/feedback log template and columns |
| H | [H-UAT-SCORECARD.md](./H-UAT-SCORECARD.md) | Summary rollup for a decision-maker who wasn't in the room |
| I | [I-BETA-DECISION-GATE.md](./I-BETA-DECISION-GATE.md) | Final PASS / PASS WITH CONDITIONS / FAIL checklist |
| J | [J-ENVIRONMENT-AND-DATA.md](./J-ENVIRONMENT-AND-DATA.md) | *(Phase 8A)* Environment decision, version freeze, Meridian dataset, tester account matrix, scenario prep matrix |
| K | [K-SESSION-EXECUTION-CHECKLIST.md](./K-SESSION-EXECUTION-CHECKLIST.md) | *(Phase 8A)* Facilitator checklist, recording, stop conditions, pilot plan, session order |
| L | [L-GO-NO-GO.md](./L-GO-NO-GO.md) | *(Phase 8A)* Pre-UAT readiness checklist, manual actions, GO/NO-GO |

Run sessions in the order Documents A→B naturally imply: read A once, use B every session, C+D are what you hand the tester, E+F are what you fill in during/after, and G/H/I are completed once real data exists. J/K/L (Phase 8A) sit in front of all of that — they make the programme actually executable: J says *where* UAT runs and *who's* in it, K says *exactly what to do* each session, L says whether you're actually ready to start.

**Fixture/reset tooling**: `scripts/uat/seed-uat-org.js` (one-time setup) and `scripts/uat/reset-uat-case.js --scenario <1-6>` (run between every session) — both read connection details from `.env`, both hard-refuse to run against anything but the confirmed non-production `compass-e2e-test` project (verified: correctly accepts that project, correctly rejects production, missing config, and any unrecognised project). See Document J §7 for what they do and, just as importantly, what they deliberately don't (Scenario 5's investigation case is seeded manually, not scripted — see J §7 for why).

---

## Final Output (brief, Section 20)

### Recommended number of testers

**7**, drawn from the mix below. This sits inside the brief's 5–8 range at a point that gives every one of the six scenarios at least 2 runs and the two highest-priority scenarios (5 and 6) 3 runs each, without requiring any tester to sit through more than 2 scenarios in one 45–60 minute session (brief, Section 19).

### Recommended tester mix

| # | Profile | Notes |
|---|---|---|
| 1 | Experienced HR/ER professional | Ideally someone who has personally run real disciplinary/grievance processes, not just managed a team that has |
| 2 | Experienced HR/ER professional | A second, independent, to avoid one specialist's idiosyncrasies driving the whole "does this match real practice" signal |
| 3 | HR generalist / People Manager | |
| 4 | HR generalist / People Manager, **and** first-time Compass user | Satisfies two profiles at once, per Document A |
| 5 | Operational manager | Non-HR-specialist perspective, especially valuable on Scenario 3 (the employee-complainant side) and Scenario 4 (the reporting-manager side) |
| 6 | Operational manager, **and** first-time Compass user | |
| 7 | First-time Compass user (any background) | A third first-time-user data point purely for the 5-second/discoverability tests — this profile is the one the brief singles out as needing "at least one," and three independent reads on it is a stronger signal than one |

This gives 3 genuinely first-time-Compass sessions (testers 4, 6, 7), which is the single most valuable and most perishable data this programme can collect — every session after the first few "burns" a tester's first-time-user status permanently.

### Scenario allocation matrix

Each row is a session (one tester, one sitting, 45–60 minutes). "Primary" is the scenario the session is built around; a session only gets a second scenario if the primary is expected to run short (Scenarios 1, 3, 4 are lighter than 2, 5, 6).

| Session | Tester | Primary scenario | Secondary scenario (if time allows) |
|---|---|---|---|
| 1 | Experienced HR/ER (#1) | 5 — Disciplinary→Outcome→Appeal | — (this scenario alone can run the full session) |
| 2 | Experienced HR/ER (#2) | 6 — Messy/high-risk | — |
| 3 | HR generalist (#3) | 2 — Complex investigation | — |
| 4 | HR generalist + first-timer (#4) | 1 — Straightforward misconduct | 3 — Grievance |
| 5 | Operational manager (#5) | 4 — Attendance/OH | — |
| 6 | Operational manager + first-timer (#6) | 3 — Grievance | 1 — Straightforward misconduct (only if #4 ran short/differently — otherwise skip and let this session run long on Scenario 3) |
| 7 | First-timer (#7) | 6 — Messy/high-risk | — |

**Resulting coverage:** Scenario 1 ×2, Scenario 2 ×1, Scenario 3 ×2, Scenario 4 ×1, Scenario 5 ×1, Scenario 6 ×2.

This is thinner on Scenarios 2, 4, and 5 than ideal for a large programme, but matches the brief's explicit instruction to prioritise Scenario 5 and the messy/high-risk case (6) for coverage while keeping 7 testers inside realistic session-length limits. **If recruiting can stretch to 8 testers**, add one more experienced-HR or generalist session on Scenario 5 specifically — it is the single highest-priority journey in the brief and 1 data point is the minimum defensible, not the target.

### Recommended session structure

1. **0:00–0:03** — Opening script (Document B), consent/recording confirmation.
2. **0:03–0:38 (primary scenario) / +0:15–0:20 (secondary, if scheduled)** — Task execution, think-aloud, live Document E capture.
3. **0:38–0:50** — Debrief: AI-trust follow-ups not yet asked, Document F questionnaire, two closing questions.
4. **0:50–0:60** — Buffer for overrun, thank-you, immediate same-day note transfer to Document E/G (do this before the next session, not batched at the end of the week).

### UAT success criteria

Full detail in Document A/I. In brief: ≥90% independent completion of the six named critical workflows; zero unresolved UAT-P0; zero unresolved UAT-P1 on core workflows without an accepted mitigation; no dangerous misunderstanding recurring across 2+ testers; average professional-feel and confidence-managing-a-case ratings both ≥8/10; a clear majority of HR-profile testers reporting time saved and willingness to use Compass at work.

### What I (the facilitator) should personally observe

- Whether hesitation clusters around **specific screens** (a genuine UX problem) or is evenly spread (more likely genuine task difficulty, not a Compass problem).
- Whether a tester's *stated* trust in a recommendation matches their *behaviour* immediately afterward — do they actually verify, or just say they would (Document A's Decision Rule exists precisely for this gap).
- Whether the same misunderstanding recurs across testers who've never spoken to each other — the single strongest signal in the whole programme, because it rules out one person's idiosyncrasy.
- In Scenario 6 specifically: does the tester ever reach for more evidence unprompted, or do they build a case on the first version of events they're given? This is the one observation in the whole programme that most directly answers the brief's core secondary question about decision-support.
- My own urge to intervene early (Document B's closing note) — if I notice I want to jump in, that's data about the product, not a cue to act on it.

### What NOT to tell testers

- Where any feature is located, before they've tried to find it themselves.
- That a particular action is "correct" or "wrong" mid-task.
- Anything from Document C's "Facilitator context" sections.
- That Onboarding/Offboarding exist, are coming, or were ever a feature — they are out of scope entirely and no tester task references them.
- Any real employee, case, or organisation detail from actual Compass production usage — every name and fact a tester sees must trace back to Document C.
- Their own rating/performance relative to other testers, at any point, including after the session ends.

### When to intervene

Document B's full ladder governs this. In one line: **silence and neutral reflection first, direct help only after genuine, sustained stalling or an explicit request**, except for the three "intervene immediately" cases in Document B (tenant-isolation exposure, apparent silent data loss, real/non-synthetic personal data appearing).

### When to stop testing and fix something immediately

Also Document B, repeated here because it's the highest-stakes rule in the whole programme: **tenant isolation failure, apparent silent save failure, or real personal data appearing anywhere in the UAT org.** Nothing else — however severe as a UX finding — justifies stopping a session or touching the codebase mid-UAT. Everything else waits for Document G and a proper triage.

### Exact criteria for progressing to controlled beta

Document I, in full, is the answer to this — it is the literal decision gate, not a summary of one. Do not treat this README's summary above as a substitute for actually completing Document I.

---

## "What evidence would convince you that Compass is ready for controlled external beta?"

Not a strong average rating, and not a clean demo. Three specific things, all of which Document I is built to force into the open rather than let a good overall impression paper over:

1. **At least one experienced HR/ER professional, unprompted, treating Scenario 6 the way a genuinely careful practitioner would** — requesting the underlying evidence rather than accepting a manager's summary, sitting with the contradiction between Nadia's and the log's dates rather than resolving it arbitrarily, and not moving toward a disciplinary outcome without a proper investigation, *despite* Denise's email explicitly pushing for a fast dismissal. If Compass's own guardrails and quality checks are doing real work, they should visibly help this happen even for a tester who might otherwise have taken the shortcut — that's the actual product being tested, not the tester's own professionalism.

2. **Every tester, when asked directly (Document F Q10), correctly stating that Compass does not make the employment decision** — and, more importantly, no tester *behaving* as though it does somewhere earlier in the session (accepting an AI-drafted outcome letter without reading it, treating a Compass Recommendation as a required next step rather than a suggestion). A single stated-vs-observed mismatch here is more concerning than a whole page of P3 cosmetic findings, because it's the one failure mode that could cause real harm to a real employee once this goes live.

3. **Zero UAT-P0s and zero unmitigated core-workflow UAT-P1s that recur across independent testers** — not "the P0/P1 count is low," but specifically that nothing in that tier survives a second, independent tester hitting the same thing. One tester's one-off confusion is normal variance in any product; the same confusion from two people who've never met is a genuine defect in Compass, not in the tester.

If those three hold up across real sessions — not asserted, observed — that's ready for controlled beta. If any one of them doesn't, that's exactly the further product work the FAIL path in Document I describes, and it should happen before beta, not be discovered by beta.
