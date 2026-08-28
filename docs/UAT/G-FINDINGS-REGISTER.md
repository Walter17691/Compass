# Document G — UAT Findings Register

This is a template. For real UAT sessions, maintain this as a live spreadsheet (Google Sheet / Excel) so it can be sorted/filtered by severity, status, and screen — the table below defines the exact columns and conventions to use there. A markdown seed table is included so the structure is versioned in the repo alongside the rest of the pack.

## Columns

| Column | Definition |
|---|---|
| **ID** | `UAT-<session#>-<sequence>`, e.g. `UAT-03-07` (7th finding logged in session 3). Never reused. |
| **Date** | Session date. |
| **Tester** | Tester name/initials + profile (Document A). |
| **Scenario** | Which of the six scenarios (Document C), or "General" if not scenario-specific. |
| **Screen** | Specific screen/tab/component (e.g. "Home — Needs Attention", "Case Workspace — Allegations tab", "Outcome Modal", "Appeal flow"). |
| **Issue** | One-sentence description of the problem. |
| **Observed behaviour** | What the tester actually did/saw, as close to verbatim as possible. |
| **Expected behaviour** | What a successful interaction would have looked like. |
| **Severity** | UAT-P0 / UAT-P1 / UAT-P2 / UAT-P3 / FEATURE REQUEST (Document A's classification — see below). |
| **Frequency** | How many of the sessions run so far reproduced this (update as more sessions complete). |
| **Screenshot/video reference** | Timestamp in the session recording, or a screenshot filename. |
| **Status** | Open / Triaged / Fixed / Won't Fix / Deferred. |
| **Decision** | Who decided the status and why (one line) — keeps triage accountable and auditable. |

## Severity definitions (repeated here for the person filling this in, so they don't have to cross-reference Document A)

- **UAT-P0 — Critical.** Could cause: wrong employee/case, wrong HR decision, a privacy/security issue, lost information, a serious misunderstanding, or inability to complete a critical workflow. Blocks beta.
- **UAT-P1 — Major.** Significant usability problem affecting a core workflow. Normally fixed before beta.
- **UAT-P2 — Moderate.** Noticeable friction; the workflow remains usable. Consider for beta or shortly after.
- **UAT-P3 — Minor.** Cosmetic, preference, or polish. Backlog.
- **FEATURE REQUEST.** A new capability, not a defect in an existing one. Logged and tracked separately from the four defect severities — never counted against UAT-P0–P3 totals in Document H, and never actioned mid-UAT (Document A).

## Logging discipline

- Log **everything**, however small — severity classification happens after logging, not as a filter on whether something gets an entry.
- One row per distinct issue, even if the same tester hits it more than once in a session (update Frequency instead of duplicating rows; a *different* tester hitting the same issue in a later session also updates Frequency on the existing row, doesn't create a new one).
- Classify severity as soon as practical after the session (same day, alongside Document E's transfer step) while context is fresh, but Status/Decision may lag until a proper triage meeting.

## Seed table (first rows — replace with real findings)

| ID | Date | Tester | Scenario | Screen | Issue | Observed behaviour | Expected behaviour | Severity | Frequency | Screenshot/video ref | Status | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UAT-00-01 | *(example)* | *(example)* | 1 | Home — Needs Attention | *(example row — delete before first real session)* | | | UAT-P3 | 1 | | Open | |
