# Document A — Compass Human UAT Plan (Phase 8)

## Purpose

Technical/security hardening, remediation, controlled-beta infrastructure, an independent UI/UX review, and targeted pre-UAT polish are complete. All of that validates that Compass is *built correctly*. None of it validates that Compass is *usable correctly* by a real HR professional who did not build it.

This UAT programme exists to answer one question:

> **Can a real HR professional who did not build Compass manage realistic Employee Relations cases correctly, confidently and efficiently without being taught how the application works?**

And, subordinate to it, the questions listed in the brief: can users find where to start, understand what needs attention, navigate a case, reconstruct what happened, understand next steps and recommendations, distinguish AI assistance from human decision-making, spot missing evidence, complete core workflows, trust the product, and feel it saves time rather than adds it.

This is a **behavioural** test, not a satisfaction survey. A tester who rates Compass 9/10 while silently failing to notice a missing witness statement is a fail, not a pass — see Document H and Section 15 of this plan.

## Scope

**In scope**: the product as it exists today in production —
- Home (Needs Attention, Active Cases, Compass Recommendations)
- Case creation and the 12-tab Case Workspace (Overview, Timeline, Allegations, Meetings, Evidence, Participants, Tasks, Documents, Communications, Themes, Outcome, AI Assistant)
- Investigation management: allegations, witness evidence, meetings, the "Ask why"/evidence-sourcing pattern
- Guardrails and quality checks (case readiness score, investigation quality gaps, decision quality gaps, procedural guardrails such as "same person chaired investigation and hearing", "outcome letter may be missing the right of appeal")
- Grievance handling (employee-as-complainant case type)
- Attendance/absence case handling and the Occupational Health referral flow (referral → HR review → adjustments considered → review date)
- Disciplinary outcome recording (OutcomeModal), outcome letters, and the appeal flow (appeal grounds, Appeal Manager conflict check)
- Compass Recommendations (AI-prioritised signals on Home and within a case)
- Settings navigation (grouped categories) insofar as a tester needs to reach Policies or Team & Access during a task

**Out of scope for this round**:
- Onboarding and Offboarding — removed from product scope entirely (Phase 7.5C); do not create, reference, or accept tester feedback that assumes these exist.
- Organisational Intelligence / Insights deep-dive (trend detection, risk map, executive briefs) — genuinely powerful but a distinct, org-wide analytics capability rather than a case-management workflow; a poor fit for a 45–60 minute single-case-focused session. Worth its own UAT round later.
- Redundancy consultation and DSAR — real, working features, but neither is a "manage an ER case" workflow in the sense this round is testing; defer to a follow-up round if Compass's roadmap prioritises them.
- Mobile/phone usability — Compass is desktop/laptop-first by design; see Document A §Responsive below and brief Section 13.

## Tester Profiles

See Document A §Testers below (kept in this file rather than split out, since profile definitions and success criteria are read together when recruiting).

| Profile | What we learn from them |
|---|---|
| **Experienced HR/ER professional** | Whether Compass matches or beats their existing mental model of running an investigation/disciplinary — the harshest, most credible judge of whether guardrails and quality checks are actually catching the things a skilled practitioner would catch. If this person is unimpressed, that is a real signal, not a training gap. |
| **HR generalist / People Manager** | The realistic median user — handles ER but isn't a specialist. Tests whether Compass's guidance (Needs Attention, Recommendations, guardrail language) is genuinely load-bearing for someone who needs the help, not just decorative for someone who already knows what to do. |
| **Operational manager** | Tests the boundary of what Compass expects a non-HR person to do unassisted (e.g. raising a concern, or being asked to provide manager input on a case) and whether Compass's language is comprehensible without an HR background. |
| **First-time Compass user** (at least one tester, ideally 2+) | The purest read on discoverability and the 5-second tests in Section 10 of the brief — everyone else's judgement is contaminated by however much Compass exposure they've had. This is the profile the whole "do not over-instruct" rule (Document B) protects most directly. |

Individual testers may satisfy more than one profile (e.g. an HR generalist who has also never used Compass) — see the tester mix recommendation in the README.

## Environment

- **Which build**: the current production deployment at the point UAT begins (Phase 7.5C, commit `159943f` or later — confirm the exact commit in the Session Log before each session and record it in Document G).
- **Data**: synthetic only (Document C). Never real employee data, never real production case records, per Section 4 of the brief and this project's own data-handling discipline.
- **Account**: a dedicated UAT-only organisation and test account(s), separate from the existing `E2E Test Org` used for engineering E2E tests, so tester-created cases don't collide with or pollute automated test data. Provision one HR-director-role account per tester profile that needs it (see Document B for exact roles per scenario).
- **Devices**: primarily a standard office laptop (Windows or Mac, whatever the tester actually uses day-to-day — don't standardise on a demo machine unless that's genuinely representative). See Section 13 / Document E for the responsive-check checklist to run opportunistically.
- **Recording**: screen recording (with audio, if the tester consents) is strongly preferred over live note-taking alone — think-aloud protocol (Document B) generates far more signal than a facilitator can transcribe live, and Document G's "Screenshot/video reference" column depends on it.

## Rules

1. **No teaching.** The facilitator does not explain where features are before the tester has tried to find them. See Document B for the exact intervention ladder.
2. **No leading questions.** "What would you expect to do here?" not "Have you tried the Overview tab?"
3. **Synthetic data only**, per Section 4.
4. **Think aloud.** Every tester is asked to narrate what they're doing and why, from the opening script (Document B) onward.
5. **Observed behaviour outweighs stated opinion** wherever the two conflict (Section 15 / this document's Decision Rule below).
6. **Every finding gets logged**, however small — Document G has no minimum severity to qualify for an entry. Severity classification (Document G) happens after logging, not as a filter on whether to log.
7. **Feature requests are not defects.** Log them in Document G with type = FEATURE REQUEST, kept visually and analytically separate from UAT-P0–P3 defects, and do not action them during or immediately after UAT (brief, Section 16).

## Decision Rule (ratings vs. behaviour)

Where a tester's quantitative rating (Document F) and their observed task performance (Document E) disagree — e.g. a 9/10 "confidence managing a real ER case" score from someone who failed to notice a missing witness statement in Scenario 6 — **the observed behaviour is the primary signal for the Beta Decision Gate (Document I)**. The rating is recorded and reported, but does not by itself satisfy a pass criterion if the behavioural evidence contradicts it. Document H's scorecard presents both, explicitly flagged where they diverge.

## Success Criteria

Full detail and rationale in Document I. Summary:

- **Critical workflows**: ≥90% completed without facilitator intervention (SUCCESS or SUCCESS WITH HESITATION, not SUCCESS WITH ASSISTANCE or FAILURE — see Document E's four-point scale).
- **UAT-P0 (Critical)**: zero unresolved.
- **UAT-P1 (Major)**: zero unresolved for core workflows before controlled beta, unless explicitly accepted with a documented mitigation.
- **No recurring dangerous misunderstanding** of AI-recommendation status, case status, warnings, outcome authority, approvals, or send/issue actions (defined precisely in Document I).
- **Commercial confidence**: average professional-design rating ≥8/10 *and* average confidence-managing-a-case rating ≥8/10 (Document F), read together with Section 15's behaviour-first rule.
- **Product value**: a clear majority of HR-profile testers report Compass would save them time and that they'd want to use it at work.

Thresholds are fixed before the first session and are not adjusted after seeing results (brief, Section 17's closing instruction — repeated here because it is the single easiest rule to quietly break under schedule pressure).
