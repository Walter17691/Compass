# Document H — UAT Scorecard

Fill this in once all planned sessions are complete (or as a rolling snapshot if reviewing progress mid-programme — mark clearly as "IN PROGRESS, N of M sessions complete" if so). This is the single document to hand to a decision-maker who wasn't in the room for any session.

## Programme summary

| | |
|---|---|
| Sessions completed | ___ of ___ planned |
| Testers | ___ (list names/profiles) |
| Production commit(s) tested | |
| Date range | |

## Completion rates

| Scenario | Sessions run | SUCCESS | SUCCESS w/ hesitation | SUCCESS w/ assistance | FAILURE | % independent (Success + Hesitation) |
|---|---|---|---|---|---|---|
| 1 — Straightforward misconduct | | | | | | |
| 2 — Complex investigation | | | | | | |
| 3 — Grievance | | | | | | |
| 4 — Attendance/OH | | | | | | |
| 5 — Disciplinary→Outcome→Appeal | | | | | | |
| 6 — Messy/high-risk | | | | | | |
| **Overall** | | | | | | |

*(Critical-workflow pass criterion, Document A/I: ≥90% independent — i.e. SUCCESS + SUCCESS WITH HESITATION — across the workflows designated critical: see Document I for the exact list.)*

## Assistance & timing

| Scenario | Avg. task time | Avg. interventions per session | Most common intervention ladder rung reached |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |

## Defect counts (from Document G, current as of scorecard date)

| Severity | Open | Fixed | Deferred (with mitigation) | Won't Fix |
|---|---|---|---|---|
| UAT-P0 | | | | |
| UAT-P1 | | | | |
| UAT-P2 | | | | |
| UAT-P3 | | | | |
| Feature requests (tracked separately, not counted against pass criteria) | | n/a | n/a | n/a |

## Usability & trust ratings (Document F, averaged across all testers)

| Question | Average (1–10) | Range (low–high) | N |
|---|---|---|---|
| Professional feel | | | |
| Ease of understanding | | | |
| Confidence managing a real case | | | |
| Usefulness of recommendations | | | |
| Trust in outputs | | | |

**Ratings vs. behaviour divergence** (Document A's Decision Rule) — list any tester whose rating and observed performance meaningfully disagreed, and which one the scorecard is treating as authoritative for the Decision Gate:

## Value perception

| | Count | % of HR-profile testers |
|---|---|---|
| Would save substantial/some time | | |
| Little difference / adds work | | |
| Would definitely/probably use at work | | |
| Unsure/probably not/definitely not | | |

## Key recurring friction (top 5, by frequency across Document G, defects only — not feature requests)

1.
2.
3.
4.
5.

## Key recurring positive signals (worth protecting in any future redesign — don't let P0/P1 fixes accidentally break these)

1.
2.
3.

## AI/Copilot summary

- Average trust rating across all AI interactions logged (Document E tables): ______
- Instances of observed over-trust (accepted AI output without checking): ______ — list session IDs
- % of testers who could correctly state, when asked, that Compass does not make the employment decision: ______

## Decision-support summary

- % of decision-support checklist items (Document E) noticed **because of Compass** vs. **despite Compass** vs. **not noticed at all**, aggregated across Scenarios 2, 5, 6 sessions:
  - Because of Compass: ______%
  - Despite Compass (tester's own judgement, Compass didn't help): ______%
  - Not noticed: ______%

## Responsive/device findings summary

List every checked item from every session's Document E responsive checklist, deduplicated, with frequency:

## Closing questions (aggregated, Document F Q8/Q9)

**"Which feature would you miss most" — most common answers:**

**"What would stop you using Compass" — most common answers:**

---

*This scorecard feeds directly into Document I's Beta Decision Gate. It should be read alongside Document G in full — the scorecard is a summary, not a substitute, and per Document A's Decision Rule, a strong scorecard with an unresolved UAT-P0 in Document G does not constitute a pass.*
