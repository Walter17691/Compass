# Technical-test revisions in investigation_finding_revisions — 2026-10-09

Governance record for four append-only revision rows created by controlled
technical testing during the Stage 4 (IR-REPORT-01b/B2) production migration.

They are **retained deliberately** (approved option A). They are not deleted,
rewritten, reattributed or labelled in the database, because
`investigation_finding_revisions_append_only_trg` forbids exactly that — which
is the control those tests were verifying.

## What happened

Post-migration verification used authenticated role-context probes that were
intended to be rolled back. Five were written as plpgsql `DO` blocks outside an
explicit transaction. **A `DO` block autocommits**, unlike the
`begin … rollback` form used for the other probes, so three of them committed:
an HR Director write, an HR Manager write, and a service-role write (the
human-identity spoofing probe). A fourth row is the restore described below.

The unintended autocommit is the whole of the cause. No control failed, no guard
was bypassed, and nothing escaped the authorised test organisation.

## Scope — one synthetic allegation, no real person

- **Organisation** `f381bfa6-7b27-497f-9af7-46a82c8f8f4c` — "E2E Test Org", the
  authorised synthetic test organisation
- **Case** `fdf8cea1-ff2e-4e58-8877-a7797e145d39`
- **Subject** "Jordan Ellis (fictional)" — fictional by name and by construction
- **Allegation** `alg_0604d71b-a866-4643-a9b6-6108c70497a1`
- **Field affected** `outstanding_uncertainty` only

Compass LTD: **0 rows touched.** Protected UAT case
`065d5a28-54a0-47f0-99a3-3ecb13f180bf`: **0 rows touched.** Verified by query,
not by assumption.

## The four revisions

| `seq` | Revision id | `actor_kind` | `changed_by` | Change |
|---|---|---|---|---|
| 3 | `582a35c4-f5fe-4a91-83e4-7e432f1bff67` | user | `6dc60cca…` | original wording → `HR director note` |
| 4 | `fd51d370-0beb-479d-8b38-eb7f2f6083d5` | user | `42fc68d1…` | → `HR manager note` |
| 5 | `222e0eed-7708-4f3d-9e69-b42505e6cb53` | **system** | NULL | → `written by a privileged caller` |
| 6 | `cc01eda7-46ee-42db-be9c-c99e3dfd9371` | user | `6dc60cca…` | → **restored original wording** |

`seq` 1 and 2 do not exist. They were consumed by an earlier probe that *was*
rolled back; an identity sequence does not reuse values after a rollback. The
gap is expected behaviour, documented in the migration's §1, and is **not** a
missing or deleted revision.

Row `seq 5` is the service-role spoofing probe and is the evidence that the
defence works: a `service_role` connection presenting a real investigator's
`sub` produced `actor_kind = 'system'` with `changed_by` NULL, rather than
crediting that investigator.

## Restored narrative

The original wording was recovered from `seq 3`'s own `previous_value` — the
revision store preserved the text it was installed to preserve — and written
back verbatim. That write is `seq 6`.

- **`allegations_narrative_digest` after restore**
  `68d7986cf5cf57d456abc7865ae511dc`
- **Pre-migration baseline** `68d7986cf5cf57d456abc7865ae511dc` — identical

The allegation is therefore in exactly its pre-test state. The revision history
correctly shows that it got there via four recorded changes, because it did.

## Why nothing is labelled in the database

`UPDATE` on this table is refused unconditionally. Verified against these exact
rows after deployment:

```
ERROR: 23514: A recorded narrative revision cannot be changed
       (revision 582a35c4-f5fe-4a91-83e4-7e432f1bff67).
       The history is append-only; a later change is a new revision.
```

Adding a marker column or editing these rows would require weakening the control
this record exists to document. It is not done.

## Known presentation limitation

Exposure is **DSAR-only** — `src/lib/findingRevisionGateway.js` →
`src/lib/dsarCompile.js` → `src/screens/DsarScreen.jsx`. There is no
case-level revision UI; confirmed in the browser on the affected case, which
shows the restored narrative and none of the test wording.

A DSAR compiled for this subject would report "4 investigator findings have been
rewritten" and flag them for review, presenting technical testing as
investigative activity. Three things bound that:

1. the subject is fictional and the organisation is the synthetic test org, so
   **no genuine subject's DSAR can surface these rows**;
2. DSAR administration is `hr_director`-only (Stage 2);
3. the compiler emits metadata and review flags, never the superseded text, so
   nothing is auto-disclosed and a human reviews first.

Hardcoding these revision ids into application logic was considered and
**rejected**: production code should not carry a list of test artefacts. This
record is the mitigation.
