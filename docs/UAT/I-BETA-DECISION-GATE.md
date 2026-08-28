# Document I — UAT → Controlled Beta Decision Gate

Complete this only after Document H is finalised. This is the final checklist. Do not adjust the thresholds below after seeing the results (Document A) — if a threshold turns out to be wrong in hindsight, record that as a note for the *next* UAT round, not as a same-round adjustment.

## Critical workflows (for the ≥90% independent-completion criterion)

The following are designated **critical** — a workflow a real HR user must be able to complete unassisted for Compass to be viable at all:

1. Opening a new case from an unstructured report (Scenario 1).
2. Recording allegations, witnesses, and evidence into a case as an investigation develops (Scenarios 1, 2, 6).
3. Understanding, within ~5 seconds, whose case it is, what stage it's at, and what's needed next, on returning to an existing case (all scenarios — Document E's 5-second checklist).
4. Recording a human outcome and progressing an outcome letter (Scenario 5).
5. Handling an appeal, including recognising an Appeal Manager conflict of interest if Compass's guardrail flags one (Scenario 5).
6. Understanding that a Compass Recommendation or AI-drafted output is a suggestion requiring human review, not a final decision (all scenarios, Document F Q10).

Non-critical for this round (still logged and scored, but not part of the 90% gate): grievance-specific triage nuance (Scenario 3), OH referral flow completion (Scenario 4), and the resolution of Scenario 6's deliberately unresolved ambiguity (getting to the *right* answer in Scenario 6 is not required for a pass — noticing the ambiguity is).

## Checklist

Work through in order. Any single item marked **FAIL** below is sufficient, on its own, to prevent a PASS verdict (though not necessarily a PASS WITH CONDITIONS — see the decision logic beneath the checklist).

- [ ] **Critical workflows**: ≥90% of critical-workflow attempts across all sessions scored SUCCESS or SUCCESS WITH HESITATION (Document H).
- [ ] **UAT-P0**: zero unresolved in Document G.
- [ ] **UAT-P1**: zero unresolved *for core workflows* in Document G, OR every remaining one has an explicit, documented mitigation accepted by whoever owns this decision (not the facilitator alone).
- [ ] **No recurring dangerous misunderstanding**, defined as: the same misunderstanding of AI-recommendation status, case status, warning meaning, outcome authority, approval requirements, or send/issue consequences, observed in **2 or more independent tester sessions** (Document E/G). A single tester's one-off confusion is a P1/P2 finding, not automatically a gate failure; the same confusion recurring across testers is.
- [ ] **Commercial confidence**: average professional-design rating ≥8/10 **and** average confidence-managing-a-case rating ≥8/10 (Document H), with no unresolved rating-vs-behaviour divergence (Document A's Decision Rule) that would undermine either average.
- [ ] **Product value**: a clear majority (>50%, and ideally materially more) of HR-profile testers (experienced HR/ER + HR generalist profiles, per Document A) report Compass would save them time (Document H "Value perception") **and** would want to use it at work.

## Decision logic

- **All items PASS → PASS — ready for controlled external beta.**
- **All P0/P1/dangerous-misunderstanding items PASS, but one or more of the commercial-confidence/product-value/critical-workflow-percentage items falls short → PASS WITH CONDITIONS.** Name the condition explicitly (e.g. "re-test the specific failing workflow with 2 more testers after a targeted fix" or "proceed to a narrow, closely-monitored beta cohort only"). A PASS WITH CONDITIONS is not a pass with a vague intention to "keep an eye on it" — it names a specific re-test or mitigation with an owner and a date.
- **Any P0 unresolved, or any P1 core-workflow item unresolved without an accepted mitigation, or a recurring dangerous misunderstanding → FAIL — further product work required.** Return to the fix/verify/re-deploy cycle already established across this engagement's prior phases, then re-run UAT on the affected scenario(s) with fresh testers (not the same testers who already know the fix) before re-attempting this gate.

## Verdict

**Verdict:** ☐ FAIL — further product work required · ☐ PASS WITH CONDITIONS · ☐ PASS — ready for controlled external beta

**Decided by:**

**Date:**

**Rationale (one paragraph, referencing the specific checklist items):**

**If PASS WITH CONDITIONS — conditions, owners, and re-test dates:**

**If FAIL — which specific findings (Document G IDs) must be resolved before re-attempting this gate:**
