import { getEmployeeContext, hasUnattributedRecords } from './employeeContext.js';
import { getCaseStage, isGenuineMeetingRecord } from './caseStage.js';
import { getNextStep } from './nextStep.js';
import { isMeetingComplete } from './meetingLifecycle.js';

// ─────────────────────────────────────────────────────────────────────────
// THE EMPLOYEE FILE — derivation. Phase E1.
//
// The Employee File is the permanent employment-history container:
//
//     Organisation → Employee File → { Overview, Timeline, Meetings,
//                                      Cases & processes, Documents }
//
// A CASE IS NOT THE EMPLOYEE FILE. A case is one distinct HR process
// belonging to an employee, and an employee may legitimately have several at
// once. Nothing here merges them: a misconduct case and a flexible-working
// request are two processes that happen to concern the same person, each with
// its own stage, owner, permissions, meetings, outcome and audit history.
//
// ┌─ THIS IS A COMPOSITION SURFACE, NOT A PERMISSION BOUNDARY ──────────────┐
// │ Every collection is passed in already filtered by RLS. Composing them    │
// │ can only narrow what the viewer could already see.                       │
// │                                                                          │
// │ "I can open John Smith" must NEVER imply "I can see everything about     │
// │ John Smith". A Location Manager opening a file sees the cases they could  │
// │ already see and nothing more; wellbeing and DSAR are HR-only and are      │
// │ OMITTED rather than shown as locked — a greyed-out section is itself a    │
// │ disclosure that confidential records exist.                              │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Everything below is deterministic. There is no AI here: E0.7 removed
// name-based employee profiling and E1 does not replace it with a different
// prominent profiling feature. E6 owns bounded, provenance-aware intelligence.
// ─────────────────────────────────────────────────────────────────────────

export const EMPLOYEE_FILE_TABS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "meetings", label: "Meetings" },
  { id: "processes", label: "Cases & processes" },
  { id: "documents", label: "Documents" },
]);

export const isEmployeeFileTab = id => EMPLOYEE_FILE_TABS.some(t => t.id === id);

const openCase = cs => getCaseStage(cs) !== "closed";

// Human wording for a process. Deliberately not the database's case_type
// string: "flexible_working" is a column value, not something to show a person.
const PROCESS_LABEL = {
  misconduct: "Disciplinary", conduct: "Disciplinary", gross_misconduct: "Disciplinary",
  performance: "Performance", capability: "Capability", attendance: "Attendance",
  grievance: "Grievance", investigation: "Investigation",
  probation: "Probation review", redundancy: "Redundancy",
  discrimination: "Discrimination complaint", informal: "Informal",
  flexible_working: "Flexible working", "flexible working": "Flexible working",
  long_term_sickness: "Long-term sickness", "long-term sickness": "Long-term sickness",
  other: "HR process",
};

export function processLabel(caseType) {
  const key = (caseType || "").trim().toLowerCase();
  return PROCESS_LABEL[key] || (caseType ? caseType.charAt(0).toUpperCase() + caseType.slice(1) : "HR process");
}

// A calm one-line answer to "where has this process got to?", derived from the
// meetings that have actually happened rather than from a lifecycle enum. The
// user should not have to read stage names to understand their own case.
export function processPosition(cs) {
  const meetings = (cs?.meetings || []).filter(isGenuineMeetingRecord);
  const completed = meetings.filter(isMeetingComplete);
  if (!meetings.length) return "Not started";
  if (completed.length) {
    const last = completed[completed.length - 1];
    return `${last.type || "Meeting"} completed`;
  }
  const inFlight = meetings[meetings.length - 1];
  return `${inFlight.type || "Meeting"} arranged`;
}

// ── What is happening / Needs your attention ───────────────────────────────
//
// Derived from getNextStep, which is the SAME function the case view, Home and
// Cases already use. E1 deliberately does not introduce a second opinion about
// what happens next: two workflow engines disagreeing is worse than one.
export function buildProcessSummary(cs, viewer = {}) {
  const next = openCase(cs) ? getNextStep(cs, { isHR: !!viewer.isHR }) : null;
  return {
    caseId: cs.id,
    label: processLabel(cs.caseType),
    position: processPosition(cs),
    stage: getCaseStage(cs),
    open: openCase(cs),
    openedAt: cs.createdAt || cs.dateReceived || null,
    owner: cs.manager || cs.investigatingManager || null,
    // `next` may legitimately be null — a closed case, or a process genuinely
    // waiting on something outside Compass. A null is rendered as nothing, not
    // as an invented instruction.
    next: next ? { label: next.label, reason: next.reason || null } : null,
  };
}

// Attention items come from state that ALREADY establishes them: the
// deterministic next step of an open process, and overdue items the deadline
// engine has already computed. Nothing is invented, and if nothing needs doing
// the list is empty — an empty warning panel is noise pretending to be rigour.
export function buildAttention({ processes = [], dueSoon = [], caseIds = new Set() }) {
  const items = [];
  processes.forEach(p => {
    if (p.open && p.next?.label) {
      items.push({ id: `next:${p.caseId}`, caseId: p.caseId, label: p.next.label, context: p.label, kind: "next_step" });
    }
  });
  // Only deadlines belonging to this employee's CANONICAL cases, and only ones
  // already overdue — "due in three weeks" is not something needing attention.
  //
  // Matched on caseId, never on the deadline's own employeeName: the deadline
  // engine stamps a display name onto every item, and using it here would
  // reintroduce name identity through the back door.
  //
  // The human text is `label` and the stable identity is `key` — both taken from
  // the deadline engine's actual shape rather than assumed.
  (dueSoon || []).forEach(d => {
    if (!d || !d.caseId || !caseIds.has(d.caseId)) return;
    if (!d.overdue) return;
    items.push({
      id: `due:${d.key || d.caseId}`,
      caseId: d.caseId,
      label: d.label || "Overdue item",
      context: d.daysOverdue ? `${d.daysOverdue} day${d.daysOverdue === 1 ? "" : "s"} overdue` : "Overdue",
      kind: "overdue",
    });
  });
  return items;
}

// ── Recent activity — a small Overview preview, NOT the E5 timeline ────────
//
// Canonical relationships only. A legacy name-only record is never included: we
// do not know it is this person's, and a timeline that might be somebody else's
// is worse than a short one.
export function buildRecentActivity(ctx, { viewer = {}, limit = 6 } = {}) {
  const events = [];

  ctx.cases.forEach(cs => {
    if (cs.createdAt || cs.dateReceived) {
      events.push({ id: `case-open:${cs.id}`, at: cs.createdAt || cs.dateReceived, label: `${processLabel(cs.caseType)} case opened`, caseId: cs.id });
    }
    if (cs.outcome && cs.outcomeIssuedAt) {
      events.push({ id: `outcome:${cs.id}`, at: cs.outcomeIssuedAt, label: `Outcome issued — ${cs.outcome}`, caseId: cs.id });
    }
    // Meetings are reached THROUGH the case, which is authoritative parentage.
    // No meeting is matched to this employee by name anywhere in E1.
    (cs.meetings || []).filter(isGenuineMeetingRecord).filter(isMeetingComplete).forEach(m => {
      events.push({ id: `meeting:${cs.id}:${m.id}`, at: m.date || m.completedAt || null, label: `${m.type || "Meeting"} completed`, caseId: cs.id });
    });
  });

  // HR-only collections. Gated on capability, not on the array happening to be
  // empty, so a non-HR viewer cannot infer existence from a section appearing.
  if (viewer.canSeeWellbeing) {
    ctx.wellbeingNotes.forEach(n => {
      // The TYPE and DATE only. Wellbeing content is not re-disclosed on a
      // second surface; this is a pointer, and the Wellbeing screen is where
      // the record is read.
      events.push({ id: `wellbeing:${n.id}`, at: n.createdAt || n.date || null, label: "Wellbeing note recorded", quiet: true });
    });
  }
  if (viewer.canSeeReferrals) {
    ctx.concernReferrals.forEach(r => {
      events.push({ id: `referral:${r.id}`, at: r.createdAt || null, label: "Concern referral triaged", quiet: true });
    });
  }

  return events
    .filter(e => e.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);
}

// ── Employment details — only what is actually recorded ────────────────────
//
// Rows of dashes are visual noise that make a sparse record look broken. An
// absent field is simply absent.
export function buildEmploymentDetails(employee) {
  if (!employee) return [];
  return [
    ["Employee number", employee.employeeNumber],
    ["Work email", employee.workEmail],
    ["Job title", employee.jobTitle],
    ["Department", employee.department],
    ["Location", employee.location],
    ["Manager", employee.manager],
    ["Start date", employee.startDate],
  ].filter(([, v]) => v != null && String(v).trim() !== "")
   .map(([label, value]) => ({ label, value: String(value) }));
}

// ── The viewer's capability slice ──────────────────────────────────────────
//
// Computed from the SAME role predicates the rest of the product uses. This
// decides what the Employee File OFFERS; the database decides what it can
// actually read, and the two are deliberately separate.
export function employeeFileViewer({ isHR = false, role = null } = {}) {
  return {
    isHR: !!isHR,
    role,
    // Wellbeing, referrals and DSAR are HR-only at the database. Mirrored here
    // so a section never renders — not even empty, and never as "hidden" —
    // for someone without the capability.
    canSeeWellbeing: !!isHR,
    canSeeReferrals: !!isHR,
    canSeeDsar: !!isHR,
    // Opening a case from the Employee File goes through the ordinary
    // case-creation flow; this only decides whether to offer it.
    canCreateCase: !!isHR,
    canEditEmployee: !!isHR,
    // Organisation-level migration information, not a fact about this person.
    canSeeUnattributedNotice: !!isHR,
  };
}

// ── The whole file, composed ───────────────────────────────────────────────
export function buildEmployeeFile(employeeId, authorisedData = {}, viewerInput = {}) {
  const viewer = employeeFileViewer(viewerInput);
  const ctx = getEmployeeContext(employeeId, authorisedData);
  const processes = ctx.cases.map(cs => buildProcessSummary(cs, viewer));
  const open = processes.filter(p => p.open);
  const closed = processes.filter(p => !p.open);
  const caseIds = new Set(ctx.cases.map(c => c.id));

  return {
    viewer,
    context: ctx,
    employee: ctx.employee,
    processes,
    openProcesses: open,
    closedProcesses: closed,
    // "What is happening" shows ONE process when there is exactly one, and a
    // calm count plus the list when there are several. It never merges them.
    currentProcess: open.length === 1 ? open[0] : null,
    hasMultipleOpen: open.length > 1,
    attention: buildAttention({ processes, dueSoon: authorisedData.dueSoon, caseIds }),
    recentActivity: buildRecentActivity(ctx, { viewer }),
    employmentDetails: buildEmploymentDetails(ctx.employee),
    // A first-class state: an employee with nothing canonically attributed.
    isEmpty: ctx.isEmpty,
    // Organisation-wide and employee-agnostic — it must never read as
    // "this person has older records", because Compass does not know that.
    showUnattributedNotice: viewer.canSeeUnattributedNotice && hasUnattributedRecords(ctx),
  };
}
