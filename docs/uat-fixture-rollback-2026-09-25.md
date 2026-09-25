# UAT fixture rollback — AT - Scheduling Phase 2.3

Rollback artefact for the Phase 2 cleanup of the forked meeting created by the
(now fixed) Prepare → Start continuity defect.

- **Case** `e2d474da-4b90-47a7-8e82-cfcaf17d92ef` — "AT - Scheduling Phase 2.3"
- **Captured** 2026-09-25, immediately before the cleanup
- **Pre-cleanup `updated_at`** `2026-09-25 08:53:41.724+00`
- **Pre-cleanup `md5(meetings::text)`** `5b8c187fb3e7ddf376922f4233c2a34a`
- **Pre-cleanup array length** 3

This is UAT test data. `employee_email` is empty, there is no portal account, no
employee record, `confidential = false`, and no real person is involved.

Entry 0, the completed Investigation meeting
`meeting_cad06fdb-24d5-4066-adad-e46aac10483c`, is **not modified** by the
cleanup, so it does not need capturing here — it is restored by being left alone.

## Entry 1 — the scheduled Disciplinary meeting (RETAINED, verbatim as it was)

```json
{"id": "meeting_6a8bdb7c-8a6c-4d4c-881b-a6b071b9769f", "date": "2026-10-02", "type": "Disciplinary", "caseId": "e2d474da-4b90-47a7-8e82-cfcaf17d92ef", "record": null, "status": "scheduled", "endedAt": null, "manager": "mimmi lupo", "calendar": null, "schedule": {"date": "2026-10-02", "time": "10:00", "method": "Microsoft Teams"}, "createdAt": "2026-09-25T08:17:02.782Z", "createdBy": "UAT - HR Manager", "startedAt": null, "invitation": null, "transcript": [], "chairUserId": null, "participants": []}
```

## Entry 2 — the duplicate Disciplinary meeting (REMOVED, verbatim as it was)

```json
{"id": "meeting_352722cc-80b3-4c43-b4c5-deba318f24c7", "date": "2026-10-02", "type": "Disciplinary", "caseId": "e2d474da-4b90-47a7-8e82-cfcaf17d92ef", "record": null, "status": "in_progress", "endedAt": null, "manager": "mimmi lupo", "createdAt": "2026-09-25T08:53:41.718Z", "createdBy": "UAT - HR Manager", "startedAt": "2026-09-25T08:53:41.718Z", "transcript": [], "chairUserId": null, "participants": []}
```

## Restore statement

Rebuilds the exact pre-cleanup array. Guarded so it can only apply to the
post-cleanup shape, and is a no-op otherwise.

```sql
update public.cases
set meetings = jsonb_build_array(
      meetings->0,
      '{"id": "meeting_6a8bdb7c-8a6c-4d4c-881b-a6b071b9769f", "date": "2026-10-02", "type": "Disciplinary", "caseId": "e2d474da-4b90-47a7-8e82-cfcaf17d92ef", "record": null, "status": "scheduled", "endedAt": null, "manager": "mimmi lupo", "calendar": null, "schedule": {"date": "2026-10-02", "time": "10:00", "method": "Microsoft Teams"}, "createdAt": "2026-09-25T08:17:02.782Z", "createdBy": "UAT - HR Manager", "startedAt": null, "invitation": null, "transcript": [], "chairUserId": null, "participants": []}'::jsonb,
      '{"id": "meeting_352722cc-80b3-4c43-b4c5-deba318f24c7", "date": "2026-10-02", "type": "Disciplinary", "caseId": "e2d474da-4b90-47a7-8e82-cfcaf17d92ef", "record": null, "status": "in_progress", "endedAt": null, "manager": "mimmi lupo", "createdAt": "2026-09-25T08:53:41.718Z", "createdBy": "UAT - HR Manager", "startedAt": "2026-09-25T08:53:41.718Z", "transcript": [], "chairUserId": null, "participants": []}'::jsonb
    ),
    updated_at = now()
where id = 'e2d474da-4b90-47a7-8e82-cfcaf17d92ef'
  and jsonb_array_length(meetings) = 2
  and meetings->1->>'id' = 'meeting_6a8bdb7c-8a6c-4d4c-881b-a6b071b9769f';
```

Verify the restore with
`select md5(meetings::text) from public.cases where id = 'e2d474da-4b90-47a7-8e82-cfcaf17d92ef';`
— it should return `5b8c187fb3e7ddf376922f4233c2a34a`. Note `updated_at` will
differ, since the app's own contract stamps it on every write.

## Note on `audit_log`

`audit_log` retains one row referencing the removed id —
*"Meeting started — Disciplinary — meeting meeting_352722cc-…"* at
`2026-09-25 08:53:42.101`. It is **deliberately left untouched**: it is an
immutable record of an event that genuinely happened, not a foreign key to live
state. Rewriting it to name a different meeting would falsify history, which is a
worse integrity violation than a dangling reference in an append-only log. The
relationship between the two ids is recorded in the defect register so the
history stays understandable.
