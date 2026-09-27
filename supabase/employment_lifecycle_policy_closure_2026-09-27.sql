-- ============================================================================
-- Phase E1.7A — EMPLOYMENT LIFECYCLE POLICY CLOSURE — 2026-09-27
-- ============================================================================
-- POLICY-ONLY. Two policies replaced on employee_employment_events. No table,
-- column, index, trigger, function or row is touched, and no customer data is
-- read or written.
--
-- ┌─ WHAT CHANGES ──────────────────────────────────────────────────────────┐
-- │ A Location Manager may now record a LOCATION TRANSFER for an employee    │
-- │ they currently manage — to ANY canonical location in the same            │
-- │ organisation, including one they have no authority over.                 │
-- │                                                                         │
-- │ AND a read-only Auditor can no longer create employment events at all,   │
-- │ which it could before. See "the hole this closes" below.                 │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- THE APPROVED RULE
--
-- Authority comes from CURRENT authority over the EMPLOYEE, not from authority
-- over the destination. A Manchester manager may send their own employee to
-- Birmingham; what they may not do is reach into Birmingham, or move an employee
-- they do not manage.
--
-- Everything that makes that safe was already in place and is unchanged:
--   * `exists (employee_records …)` — employee RLS resolves the EFFECTIVE
--     location, so "currently manage" means currently, not historically.
--   * The composite FK on (new_location_id, org_id) makes a cross-organisation
--     destination unstorable; client filtering is not relied on.
--   * recorded_by = auth.uid(), so an event cannot be attributed to someone else.
--   * The parentage guard freezes employee and organisation.
--   * Nothing is written to employee_records, so no transfer moves access early.
--
-- AUTHORSHIP IS NOT AN ACCESS PATH. Access is resolved from the employee's
-- effective location and nothing else, so the manager who RECORDS a transfer out
-- of their own scope loses the employee — and the event — the moment it takes
-- effect. Verified live, both directions.
--
-- ── THE HOLE THIS CLOSES ───────────────────────────────────────────────────
--
-- E1.7's INSERT check ended in
--
--     and (event_type <> 'location_changed' or is_hr_in_org(org_id))
--
-- so every other event type was open to ANY role that could see the employee.
-- That included `auditor`, whose own definition in src/lib/roles.js is "Read-only
-- access; cannot create, edit, or delete records", and `line_manager`, which no
-- approved decision names as a lifecycle operator. Verified against production
-- before making this change: both could create employment events.
--
-- Simply deleting the HR-only clause — the literal instruction — would have
-- widened that to LOCATION TRANSFERS, letting a read-only auditor move employees
-- between sites. So the clause is replaced rather than removed: creation and
-- amendment now require HR or a Location Manager authorised for the employee,
-- which is precisely the set of roles the approved decisions name.
--
-- This narrows `auditor` and `line_manager`, neither of which was ever granted
-- the capability deliberately. Production has 0 of each (all 5 members are HR)
-- and 0 employment events, so the change removes nothing anyone is using.
-- Whether a Line Manager SHOULD be a lifecycle operator is a product question,
-- reported rather than answered here.
-- ============================================================================

drop policy if exists employment_events_insert on public.employee_employment_events;
create policy employment_events_insert
  on public.employee_employment_events for insert
  to authenticated
  with check (
    org_id in (select public.my_org_ids())
    -- An event cannot be attributed to another user.
    and recorded_by = auth.uid()
    -- CURRENT authority over the employee, resolved through employee RLS, which
    -- reads the effective location. This is the whole of the transfer authority
    -- rule: nothing here consults the DESTINATION against the actor's own scope.
    and exists (
      select 1 from public.employee_records er
      where er.id = employee_employment_events.employee_id
    )
    -- …and the actor must be a lifecycle operator, not merely someone who can
    -- read the employee. Without this, a read-only auditor could transfer people.
    and (
      public.is_hr_in_org(org_id)
      or public.is_location_manager_for(org_id, public.effective_employee_location(employee_id))
    )
  );

drop policy if exists employment_events_update on public.employee_employment_events;
create policy employment_events_update
  on public.employee_employment_events for update
  to authenticated
  using (
    org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.employee_records er
      where er.id = employee_employment_events.employee_id
    )
    and (
      public.is_hr_in_org(org_id)
      or public.is_location_manager_for(org_id, public.effective_employee_location(employee_id))
    )
  )
  with check (
    org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.employee_records er
      where er.id = employee_employment_events.employee_id
    )
    and (
      public.is_hr_in_org(org_id)
      or public.is_location_manager_for(org_id, public.effective_employee_location(employee_id))
    )
  );

-- SELECT is deliberately UNCHANGED and stays broader than write: anyone who can
-- see the employee can see their employment history. That is the E1.6/E1.7
-- inheritance rule, and narrowing reads was not part of this decision.
--
-- There is still no DELETE policy. A future event recorded in error is CANCELLED,
-- which keeps the row, the reason and the audit trail.
--
-- ARCHIVE needs no policy at all. It is a view over the same canonical Employee
-- Files whose effective employment status is former, so it inherits the employee
-- boundary exactly: a Location Manager sees an archived former employee only
-- while that employee's effective location is still within their current scope,
-- and loses them if that scope is removed. No archive-specific rule exists, and
-- none should — a separate one is how "former manager keeps access forever" gets
-- built by accident.

-- ============================================================================
-- ROLLBACK (complete) — restores the E1.7 policies exactly, including the
-- auditor hole they carried.
-- ============================================================================
--   drop policy if exists employment_events_insert on public.employee_employment_events;
--   create policy employment_events_insert on public.employee_employment_events for insert to authenticated
--     with check (
--       org_id in (select public.my_org_ids())
--       and recorded_by = auth.uid()
--       and exists (select 1 from public.employee_records er where er.id = employee_employment_events.employee_id)
--       and (event_type <> 'location_changed' or public.is_hr_in_org(org_id))
--     );
--   drop policy if exists employment_events_update on public.employee_employment_events;
--   create policy employment_events_update on public.employee_employment_events for update to authenticated
--     using (
--       org_id in (select public.my_org_ids())
--       and exists (select 1 from public.employee_records er where er.id = employee_employment_events.employee_id)
--     )
--     with check (
--       org_id in (select public.my_org_ids())
--       and exists (select 1 from public.employee_records er where er.id = employee_employment_events.employee_id)
--     );
-- ============================================================================
