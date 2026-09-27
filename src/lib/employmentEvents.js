// Phase E1.7 — Employment Events.
//
// The employment-relationship context that makes employee history readable: a
// promotion, a transfer, a new manager, a change of working pattern, employment
// ending. Each one preserves OLD -> NEW -> EFFECTIVE DATE.
//
// Compass is not becoming a payroll platform or an HRIS. Only changes backed by
// a real employee field exist, and nothing is inferred from anything.
//
// The central rule, mirrored here from the database:
//
//   CURRENT STATE IS RESOLVED, NEVER WRITTEN AHEAD OF TIME.
//
// A promotion effective 1 November changes nothing until 1 November, and then
// changes it with no scheduler having run. The same resolution exists in SQL
// (effective_employee_location / effective_employment_status) because RLS needs
// it; this module is the read model, not a second authority.

// ── Event types ─────────────────────────────────────────────────────────────
//
// contractual_hours_changed is deliberately ABSENT: employee_records has no such
// column, and inventing one to satisfy an example would be inventing employee
// data. employment_started is absent too — start_date is legacy text and 14 of
// the 17 populated production values are not ISO dates, so it cannot be read as
// one without guessing.
export const EMPLOYMENT_EVENT_TYPES = Object.freeze([
  { id: "job_title_changed", label: "Job title changed", field: "jobTitle", kind: "text",
    question: "What is the new job title?" },
  { id: "department_changed", label: "Department changed", field: "department", kind: "text",
    question: "What is the new department?" },
  { id: "manager_changed", label: "Manager changed", field: "manager", kind: "text",
    question: "Who is the new manager?" },
  { id: "working_pattern_changed", label: "Working pattern changed", field: "workingPattern", kind: "text",
    question: "What is the new working pattern?" },
  { id: "location_changed", label: "Location changed", field: "locationId", kind: "location",
    question: "Which location are they moving to?" },
  { id: "employment_ended", label: "Employment ended", field: null, kind: "leaver",
    question: null },
]);

const TYPE_BY_ID = Object.fromEntries(EMPLOYMENT_EVENT_TYPES.map(t => [t.id, t]));

export function employmentEventLabel(id) {
  return TYPE_BY_ID[id]?.label || "Employment change";
}

export function isEmploymentEventType(id) {
  return Object.hasOwn(TYPE_BY_ID, id || "");
}

// The types a manager picks from when recording a change. Employment ending has
// its own action ("Mark as leaver") because it is not one field changing value.
export const CHANGEABLE_EVENT_TYPES = EMPLOYMENT_EVENT_TYPES.filter(t => t.kind !== "leaver");

export const DOCUMENTATION_STATUSES = Object.freeze([
  { id: "sent", label: "Yes, it has been sent" },
  { id: "not_sent", label: "Not yet" },
  { id: "not_required", label: "Not required" },
]);

export function documentationLabel(id) {
  return DOCUMENTATION_STATUSES.find(d => d.id === id)?.label || "Not required";
}

// ── Effective dating ────────────────────────────────────────────────────────
//
// DATE semantics throughout. "Effective 1 November" has no time of day, and
// comparing instants is exactly how it becomes effective late on 31 October for
// one reader and late on 1 November for another. Both sides are reduced to a
// plain YYYY-MM-DD string and compared lexicographically, which for that format
// is the same as comparing calendar dates and carries no timezone at all.
export function asDateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return toDateOnly(parsed);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toDateOnly(value);
  return null;
}

function toDateOnly(d) {
  // Local calendar date, not UTC: an employment change is a calendar fact in the
  // organisation's own reckoning, and toISOString() would shift it for anyone
  // east or west of UTC.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isEffective(event, today = new Date()) {
  if (!event || event.cancelledAt) return false;
  const eff = asDateOnly(event.effectiveDate);
  const now = asDateOnly(today);
  if (!eff || !now) return false;
  // On the effective date itself, it IS effective.
  return eff <= now;
}

export function isPending(event, today = new Date()) {
  if (!event || event.cancelledAt) return false;
  const eff = asDateOnly(event.effectiveDate);
  const now = asDateOnly(today);
  if (!eff || !now) return false;
  return eff > now;
}

// ── Current effective employee state ───────────────────────────────────────
//
// base record + effective events + today. Nothing else. No mutation, no timer.
export function resolveEffectiveEmployee(employee, events = [], today = new Date()) {
  if (!employee) return null;
  const mine = events.filter(e => e && e.employeeId === employee.id && isEffective(e, today));
  // Oldest first, so the most recent effective change wins by being applied last.
  const ordered = mine.slice().sort((a, b) => {
    const d = asDateOnly(a.effectiveDate).localeCompare(asDateOnly(b.effectiveDate));
    return d !== 0 ? d : String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });

  const resolved = { ...employee };
  ordered.forEach(e => {
    const type = TYPE_BY_ID[e.eventType];
    if (!type) return;
    if (type.kind === "text" && type.field) resolved[type.field] = e.newText || "";
    else if (type.kind === "location") resolved.locationId = e.newLocationId || null;
    else if (type.kind === "leaver") resolved.employmentStatus = "leaver";
  });
  return resolved;
}

// Is this employee currently employed? Drives People vs Archive with no scheduled
// move: an employee with a future leaving date is still current today.
export function isCurrentEmployee(employee, events = [], today = new Date()) {
  return resolveEffectiveEmployee(employee, events, today)?.employmentStatus !== "leaver";
}

export function effectiveLeavingDate(employeeId, events = [], today = new Date()) {
  const ended = events
    .filter(e => e && e.employeeId === employeeId && e.eventType === "employment_ended" && !e.cancelledAt)
    .map(e => asDateOnly(e.effectiveDate))
    .filter(Boolean)
    .sort();
  if (!ended.length) return null;
  const effective = ended.filter(d => d <= asDateOnly(today));
  // The effective one if it has arrived, otherwise the earliest pending one — so
  // a future leaver can be shown as leaving without being treated as gone.
  return effective.length ? effective[effective.length - 1] : ended[0];
}

// Changes recorded but not yet in force. Surfaced compactly on Overview so a
// reader knows what is coming without the current value ever being in doubt.
export function upcomingChanges(employeeId, events = [], today = new Date()) {
  return events
    .filter(e => e && e.employeeId === employeeId && isPending(e, today))
    .slice()
    .sort((a, b) => asDateOnly(a.effectiveDate).localeCompare(asDateOnly(b.effectiveDate)))
    .map(e => ({
      id: e.id,
      eventType: e.eventType,
      label: employmentEventLabel(e.eventType),
      effectiveDate: asDateOnly(e.effectiveDate),
      newValue: e.eventType === "location_changed" ? null : (e.newText || ""),
      newLocationId: e.newLocationId || null,
    }));
}

// ── Describing what changed, in words ──────────────────────────────────────
//
// "Promoted" on its own would lose the history. Old -> new, always.
export function describeEmploymentEvent(event, { locationName } = {}) {
  if (!event) return null;
  const type = TYPE_BY_ID[event.eventType];
  if (!type) return null;
  if (type.kind === "leaver") {
    return { label: "Employment ended", from: null, to: null };
  }
  if (type.kind === "location") {
    return {
      label: type.label,
      from: locationName?.(event.oldLocationId) || null,
      to: locationName?.(event.newLocationId) || null,
    };
  }
  return { label: type.label, from: event.oldText || null, to: event.newText || null };
}

// ── The Activity projection ────────────────────────────────────────────────
//
// Employment events join the same chronology as activities, processes and
// meetings. A pending change is shown as pending rather than as something that
// has happened, and a cancelled one says so instead of disappearing.
export function buildEmploymentEventEntries(events = [], { locationName, today = new Date() } = {}) {
  return events.filter(e => e && e.id).map(e => {
    const described = describeEmploymentEvent(e, { locationName });
    const pending = isPending(e, today);
    return {
      kind: "employment_event",
      id: e.id,
      eventType: e.eventType,
      typeLabel: described?.label || "Employment change",
      from: described?.from || null,
      to: described?.to || null,
      // The employment-history date is the EFFECTIVE date, not when it was typed.
      occurredAt: asDateOnly(e.effectiveDate),
      recordedAt: e.createdAt || null,
      pending,
      cancelled: !!e.cancelledAt,
      documentationStatus: e.documentationStatus || "not_required",
      open: pending,
    };
  });
}

// Only a genuinely outstanding lifecycle follow-up belongs in "needs your
// attention". Documentation that has not been sent qualifies; a recorded change
// does not, and neither does a pending one that is simply in the future.
export function employmentAttention(employeeId, events = [], today = new Date()) {
  return events
    .filter(e => e && e.employeeId === employeeId && !e.cancelledAt
      && e.documentationStatus === "not_sent" && isEffective(e, today))
    .map(e => ({
      id: `doc:${e.id}`,
      employmentEventId: e.id,
      label: `Documentation not sent — ${employmentEventLabel(e.eventType)}`,
      reason: "This change has taken effect and the paperwork is still outstanding.",
    }));
}

// Row → camelCase.
export function mapEmploymentEventRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    employeeId: row.employee_id,
    eventType: row.event_type,
    effectiveDate: row.effective_date || null,
    oldText: row.old_text || "",
    newText: row.new_text || "",
    oldLocationId: row.old_location_id || null,
    newLocationId: row.new_location_id || null,
    note: row.note || "",
    documentationStatus: row.documentation_status || "not_required",
    cancelledAt: row.cancelled_at || null,
    cancelledBy: row.cancelled_by || null,
    cancellationReason: row.cancellation_reason || "",
    recordedBy: row.recorded_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}
