# Assessment — HR Review decision atomicity and clarification recovery

**Read-only inspection. Nothing here is implemented.** Written 2026-10-12
alongside the Phase 0 hotfix. Tasks 3 and 4 of the stabilisation brief.

---

# Task 3 — case-level side effects around an HR Review decision

## 3.1 The complete map

Every effect in `resolveInvestigationReview` (`src/App.jsx`), in execution
order. **All of the client effects currently run BEFORE the awaited decision**
except the last.

| # | Effect | Statuses | Target | When |
|---|---|---|---|---|
| — | `cases.find` lookup; Phase 0 note refusal | all | — | before (pure) |
| — | `confirmDialog` | `closed` | — | before (user gate, not an effect) |
| 1 | `saveCases(stage:"investigation")` | `returned` | `cases.stage` | **before** |
| 2 | `toggleCaseTaskDone(submitTask.id)` | `returned` | `case_tasks.status` | **before** |
| 3 | `createCaseTask("Clarify: …")` | `clarification_requested` | `case_tasks` INSERT | **before** |
| 4 | `saveCases(manager: …)` | `taken_over` | `cases.manager` | **before** |
| 5 | `saveCases(stage:"closed")` (awaited, gated on `result.ok`) | `closed` | `cases.stage` | **before** |
| 6 | `audit(…)` — four distinct action strings | `returned`, `clarification_requested`, `taken_over`, `closed`, else-branch | `audit_log` INSERT | **before** |
| 7 | **`respondToReview` → the decision** | all | `hr_review_requests` UPDATE | — |
| 8 | `assignCaseRole(caseId, user.id, "case_owner")` | `taken_over` | `case_access` | **after** |

And inside the decision's own transaction, the database already does:

| Effect | Statuses | Mechanism |
|---|---|---|
| server-stamp `reviewed_by` / `reviewed_at` / `reviewed_by_name` | all | `hr_review_report_integrity_guard` |
| insert `hr_review_clarifications` round | `clarification_requested` | same guard |
| insert `investigation_report_lifecycle_events` (`hr_return`) | `returned` | `record_zz_hr_return_event_trg` |
| insert `audit_log` `'HR review decision: <status>'` | all | `decide_hr_review` **only** — the direct-UPDATE path the client uses today does not write this |

Note effect 8 is separated from effect 4 by an `await`. A takeover that fails
between them leaves `cases.manager` reassigned with no `case_owner` grant —
ambiguous ownership, and it is reachable today.

## 3.2 Which effects must be atomic with the decision

**Must be atomic** — these *are* the decision's meaning. A case holding them
without a matching review row, or vice versa, is a false record:

1. **`cases.stage`** on `returned` (→ `investigation`) and `closed` (→ `closed`).
   A case sitting in `investigation` with no returned review misrepresents who
   sent it back, and a case still in `inv_report` after a recorded return
   misrepresents the state the investigator is being asked to act on.
2. **`cases.manager` + the `case_access` `case_owner` grant** on `taken_over`.
   Both, together — partial application is worse than neither.
3. **`audit_log`.** An audit row asserting a decision that was refused is the
   most damaging of all, because the audit trail is the artefact relied on
   precisely when the record is disputed.

**Must NOT be atomic** — advisory workflow state, recoverable by hand, and
coupling it would widen a transaction for no integrity gain:

4. **`toggleCaseTaskDone`** (un-ticking the submit step). A stale tick is
   visible and re-tickable. Wrong if the return did not happen, but not a
   false record of a decision.
5. **`createCaseTask("Clarify: …")`** — this one should be **deleted, not made
   atomic.** The database now writes a first-class `hr_review_clarifications`
   round for the same event. The task is duplicate bookkeeping that will drift
   from the real record. Remove it in Phase 4 when the clarification surface
   lands.

## 3.3 Can `decide_hr_review` own them? No — and this is the firmest finding

`decide_hr_review` **could** safely write to `cases`: it already holds the
per-case mutex (`perform 1 from public.cases where id = … for update`) as its
first lock, so it is in fact the only place a `cases` write could be made
without risking a lock-order inversion against the lifecycle recorder. The
objection is not locking. It is three other things.

**1. Replay-safety and side-effect ownership are in direct tension.** The RPC's
idempotency works by returning early and writing nothing:

```sql
if v_review.status = p_status then
  if v_review.reviewed_by is not distinct from v_actor
     and coalesce(btrim(v_review.comments), '') = coalesce(v_comments, '') then
    return v_review;        -- writes NOTHING
  end if;
```

If the function also owned the stage change, that early return would skip it.
A client that crashed after the decision committed but before its own case
write, then retried, would get a success back and the case would **never** be
repaired — the retry is precisely the path that must fix it. Making the replay
re-apply the case effects instead means it is no longer a no-op, and the
"exact replay writes nothing" guarantee that makes double-clicks safe is gone.
Those two properties cannot both live in one function.

**2. The effects are per-status; the RPC is deliberately status-agnostic.**
`decide_hr_review` is also the intended path for `ApprovalsPanel`
(`approved`/`rejected`) and `AskHrPanel` (`resolved`) — steps `suspension`,
`final_written_warning`, `dismissal`, `escalation`, `record`. None of those
wants a stage change. Branching on status inside it couples a generic decision
API to the investigation gate's specific workflow and would make the other two
panels carry logic they must never trigger.

**3. It is applied and hash-recorded.** Changing it means a new migration
against `a5f7ce12dbd0c357573d0e7b92bb53e6`, re-running the full preflight, and
re-recording. That cost is worth paying for a defect; it is not worth paying to
avoid writing a second function.

### Recommendation: a separate transactional RPC

`resolve_investigation_review(p_review_id uuid, p_status text, p_comments text)`:

* takes the case mutex **first** — same order as every other lifecycle
  function, so no inversion;
* performs the decision (the same guard-respecting UPDATE, so authority,
  independence, currency, ordering and server-stamping all still apply —
  the guard is a trigger and cannot be bypassed);
* applies effects 1, 4, 5, 6 and 8 from §3.1 in the same transaction;
* leaves effects 2 and 4-the-task to the client, and drops effect 3 entirely;
* is idempotent in the **already-in-target-state** sense rather than the
  write-nothing sense — a replay re-asserts the case state, which is what a
  retry after a partial failure needs;
* leaves `decide_hr_review` untouched for the two simpler panels.

It must also respect `protect_zzd_progression_update_trg` and
`protect_case_outcome`, which already refuse some `cases` writes — during this
engagement a setup `update cases set outcome = …` was silently refused by A3c's
own progression guard, so any new `cases` write from inside an RPC needs that
checked explicitly, not assumed.

### Interim, and why it is still worth shipping

**Phase 2's reorder (decision first, effects after) is not atomicity** — a
crash between the two still leaves a decided review on an unmoved case. But it
inverts the failure into the much better direction. Today the case moves, the
audit row lands, and *then* the decision can be refused for four new reasons
(independence, terminal, stale version, returned-since), so the visible
artefact asserts something that did not happen. After the reorder, the worst
case is a correct decision with a lagging case — recoverable, and visibly
inconsistent rather than confidently wrong. Ship the reorder; follow with the
RPC.

---

# Task 4 — clarification recovery

## 4.1 There is nothing to recover yet

Measured, with a control:

```
hr_review_clarifications rows                     0
reviews in status clarification_requested         0
CONTROL full status census                        approved=20, pending=119   (139, PASS)
investigation_report_lifecycle_events rows        0
```

**The dead end described in the Phase 0 brief is latent, not live.** No review
is stuck and no clarification row exists, because no decision has been taken
since the migration was applied. The recovery path below is therefore
**preventive**, and no existing review record needs altering — which is
fortunate, since altering one is not authorised.

## 4.2 Everything needed is already deployed

| Requirement | Status |
|---|---|
| `answer_hr_review_clarification(uuid, text)` | applied; `EXECUTE` granted to `authenticated` |
| `SELECT` on `hr_review_clarifications` | granted to `authenticated` |
| `INSERT` on that table | **correctly denied** (control — the probe discriminates) |
| RLS | enabled, one SELECT policy delegating to the caller's own `cases` visibility |
| at most one open round per review | partial unique index `(review_id) where answered_at is null` |

The RPC permits the case's assigned `investigator` **or** HR, requires the
review to be in `clarification_requested`, records the response, and flips the
review back to `pending`. **No migration and no privilege change is needed for
the recovery path.** It is client wiring only.

## 4.3 The smallest safe path — four steps, no new surface

1. **Load.** One `select('*')` from `hr_review_clarifications`, org-scoped,
   beside `loadHrReviews`. Read-only; the privilege already exists.
2. **Show HR why the buttons are gone.** In `HrReviewGatePanel`, for a review in
   `clarification_requested`, render the question and *"Awaiting the
   investigator's answer"*. One conditional block. Today that review renders an
   empty row, which is the part that reads as broken.
3. **Let the investigator answer where they already look.** Add the open
   question and an answer field to the existing *"Guidance from HR"* block in
   `InvestigatorChecklistView.jsx:141-151`. **No new screen, no new nav entry** —
   that block exists for exactly this class of message.
4. **Submit via the RPC.** On success the review returns to `pending`, at which
   point `HrReviewGatePanel`'s existing `status === 'pending'` condition starts
   rendering the six actions again **with no change to that component**. The
   recovery closes itself.

Apply the same requirement the Phase 0 hotfix introduced: an answer is a written
response, so the submit control stays disabled until it is non-empty after
`.trim()`. Reuse `decisionNoteMissing`'s sibling rather than re-deriving it.

## 4.4 One thing to fix at the same time

Delete the `createCaseTask("Clarify: …")` shadow record (`src/App.jsx`, the
`clarification_requested` branch). Once the real round is visible, the task is a
second, diverging copy of the same question — and unlike the round, it has no
answer field, no round number and no link back to the review.

---

# A database gap found while implementing Phase 0

Not fixed — no migration is authorised, and the client now compensates.

`hr_review_report_integrity_guard` tests the clarification question with
`coalesce(btrim(new.comments), '') = ''`. **Postgres `btrim()` with no second
argument strips spaces only.** Verified against production:

```
btrim('   ') = ''      true     -- spaces caught
btrim(E'\t')  = ''     FALSE    -- a tab-only question SATISFIES the guard
btrim(E'\n')  = ''     FALSE    -- so does a newline-only one
```

So the database accepts a question consisting of a single tab or newline. The
Phase 0 client check uses JS `.trim()`, which strips all whitespace and is
therefore **stricter** than the guard — it refuses inputs the database would
store. That is the safe direction, and it is the exact inverse of the
mistranslation that caused the adoption-predicate defect, where the SQL was
*looser* than the JS it was copied from.

The residual gap is reachable only by a caller that bypasses the UI. Closing it
properly means `btrim(new.comments, E' \t\n\r')` or a regex test in a future
migration. **Recorded, not patched.**
