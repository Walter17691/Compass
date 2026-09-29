import { getEmployeeContext, hasUnattributedRecords } from './employeeContext.js';
import { getCaseStage, isGenuineMeetingRecord } from './caseStage.js';
import { getNextStep } from './nextStep.js';
import { isMeetingComplete } from './meetingLifecycle.js';
import { isWarningOutcome } from './outcomeTypes.js';
import { allegationsForCase, appealOutcomeMeta } from './allegations.js';
import { buildActivityEntries, activityAttention, isOpenConcern } from './employeeActivities.js';
import { resolveEffectiveEmployee, upcomingChanges, buildEmploymentEventEntries,
         employmentAttention, effectiveLeavingDate, isCurrentEmployee } from './employmentEvents.js';

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

// Phase E1.6 — the approved four-tab model.
//
// Timeline and Meetings are gone as separate tabs, not hidden: both were
// chronological views of the same employment history, and Activity is now that
// history in one place — employee activities, formal process milestones, and the
// meetings reached through an authorised case. "Cases & processes" becomes
// "HR Processes", which is what it has always contained.
//
// This is the minimum coherent change for Employee Activities. The broader Case
// View / workflow simplification is a separate UX phase and is not started here.
export const EMPLOYEE_FILE_TABS = Object.freeze([
  { id: "overview", label: "Overview" },
  // Wave A — the LABEL becomes "History", the id stays "activity".
  //
  // Managers were being offered three words for one idea: Activity here, Timeline
  // on the Case View, and a dead "View timeline" link. "History" is what this is.
  // The id is deliberately unchanged: it is a stable route key that App state,
  // deep links and several suites already use, and renaming it would buy nothing
  // but churn.
  { id: "activity", label: "History" },
  { id: "processes", label: "HR Processes" },
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

// Day-precision comparison, in UTC. Used by the current-warning derivation below.
const asDay = v => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d)) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Wave A removed buildRecentActivity().
//
// It was a SECOND, independently assembled chronology feeding the Overview
// preview, and it disagreed with the History tab about the same employee. It is
// deleted rather than left exported: an unused chronology builder is precisely
// what the next person reaches for, and that is how the divergence happened the
// first time. There is now one projection (see activityEntries below).
//
// It also carried HR-only wellbeing notes and concern referrals into the Overview
// preview. Those no longer appear on the Employee File at all — special category
// health data does not belong on a general overview, and it remains available on
// the Wellbeing and Concerns screens where it is the subject of the page.

export function isWarningLive(expiresAt, now = new Date()) {
  const expiry = asDay(expiresAt);
  const today = asDay(now);
  if (expiry == null || today == null) return false;
  return today <= expiry;
}

// What an appeal did to the original decision.
//
// AUDITED, AND A REAL GAP FOUND: Compass records an appeal outcome PER
// ALLEGATION (allegations.appealOutcome → effectTag overturned | varied |
// unchanged | null). Nothing writes a case-level appeal result, and
// recordAppealOutcome does not touch cases.outcome or warningExpiresAt. So the
// case's recorded outcome is unchanged by an appeal.
//
//   overturned → the original decision does not stand. NOT current.
//   varied     → the decision was varied, but Compass does not record what it
//                was varied TO. The operative warning cannot be established, so
//                it is NOT shown. Reported as a gap rather than guessed.
//   unchanged  → the decision stands. Current.
//   none yet   → nothing in Compass suspends an outcome pending appeal; the
//                recorded outcome remains operative. Existing semantics,
//                preserved rather than replaced by a new policy in the UI.
export function appealEffectOnCase(caseId, allegations) {
  const tags = allegationsForCase(allegations, caseId)
    .map(a => appealOutcomeMeta(a.appealOutcome)?.effectTag)
    .filter(Boolean);
  if (tags.includes("overturned")) return "overturned";
  if (tags.includes("varied")) return "varied";
  return tags.length ? "unchanged" : "none";
}

// Returns display data, never JSX. `cases` must already be the AUTHORISED,
// employee_id-linked slice — this function performs no permission logic and no
// name matching, so a case the viewer cannot see simply never arrives.
export function deriveCurrentWarnings(cases = [], allegations = [], now = new Date()) {
  return (Array.isArray(cases) ? cases : [])
    .filter(cs => cs && isWarningOutcome(cs.outcome))
    // An outcome that was never issued is a draft, not a warning.
    .filter(cs => !!cs.outcomeIssuedAt)
    .filter(cs => isWarningLive(cs.warningExpiresAt, now))
    .filter(cs => {
      const effect = appealEffectOnCase(cs.id, allegations);
      return effect === "none" || effect === "unchanged";
    })
    .map(cs => ({
      caseId: cs.id,
      type: cs.outcome,
      issuedAt: cs.outcomeIssuedAt,
      expiresAt: cs.warningExpiresAt,
      durationMonths: cs.warningDurationMonths || null,
      processLabel: processLabel(cs.caseType),
    }))
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
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

  // Phase E1.6 — activities for THIS employee only, selected by canonical id.
  // Never by name: two employees may share one, and the caller hands over the
  // whole authorised set.
  const activities = (authorisedData.employeeActivities || []).filter(a => a && a.employeeId === employeeId);
  const activityIds = new Set(activities.map(a => a.id));
  const activityRecords = (authorisedData.employeeActivityRecords || [])
    .filter(r => r && activityIds.has(r.activityId));
  const openConcerns = activities.filter(isOpenConcern);

  // Phase E1.7 — employment events for THIS employee, by canonical id.
  const employmentEvents = (authorisedData.employmentEvents || []).filter(e => e && e.employeeId === employeeId);
  const now = authorisedData.now || new Date();
  // CURRENT EFFECTIVE details. A future promotion recorded today is not the
  // current job title, and Overview must never imply that it is.
  const effectiveEmployee = resolveEffectiveEmployee(ctx.employee, employmentEvents, now);
  const pendingChanges = upcomingChanges(employeeId, employmentEvents, now);

  // ── Wave A — the ONE authoritative employee history ─────────────────────
  //
  // Computed once, here, and used for BOTH the full History tab and the Overview
  // preview. Previously the preview came from a separate builder, so the two
  // disagreed: the preview knew about cases, meetings, wellbeing notes and
  // referrals; the tab knew about activities, processes, meetings and employment
  // events. Neither was the employee's history.
  //
  // Everything here is already authorised: activities and employment events
  // arrive RLS-filtered, and process/meeting entries are reached THROUGH
  // ctx.cases, which is itself the authorised set. An inaccessible case
  // contributes nothing because it is ABSENT — not because it was filtered out
  // in the projection — so no "restricted event" placeholder is needed, and none
  // exists. Existence itself can be confidential.
  // HR-only collections, carried into the ONE projection rather than dropped.
  //
  // These two used to reach the Overview through the separate preview builder, each
  // behind its own capability gate. Unifying the projection must not silently
  // remove them — Wave A was asked to make the two surfaces agree, not to narrow
  // what an authorised HR user can see. So the gates move here, unchanged, and
  // canSeeWellbeing / canSeeReferrals stay live rather than becoming orphans.
  //
  // `quiet: true` marks them as context rather than management activity, exactly as
  // the previous builder did.
  const hrOnlyEntries = [];
  if (viewer.canSeeWellbeing) {
    ctx.wellbeingNotes.forEach(n => {
      if (!n?.id) return;
      hrOnlyEntries.push({
        kind: "wellbeing", id: `wellbeing:${n.id}`, typeLabel: "Wellbeing note",
        title: "", occurredAt: n.createdAt || n.date || null, quiet: true,
      });
    });
  }
  if (viewer.canSeeReferrals) {
    ctx.concernReferrals.forEach(r => {
      if (!r?.id) return;
      hrOnlyEntries.push({
        kind: "referral", id: `referral:${r.id}`, typeLabel: "Concern referral",
        title: "", occurredAt: r.createdAt || null, quiet: true,
      });
    });
  }

  // Meetings are reached THROUGH the case, which is authoritative parentage.
  // No meeting is matched to this employee by name — not in E1, not in E2, and not
  // here. Table-resident meetings are still not passed to this builder at all.
  //
  // And the E2 prohibition still holds structurally: a WITNESS INTERVIEW can never
  // appear on the witness's Employee File, because it carries no employee_id and
  // every entry in this projection is reached either from an authorised case or
  // from an employee_id-keyed collection.
  const activityEntries = [
    ...buildActivityEntries({ activities, activityRecords, cases: ctx.cases }),
    ...buildEmploymentEventEntries(employmentEvents, { locationName: authorisedData.locationName, today: now }),
    ...hrOnlyEntries,
  ].sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0));

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
    // Open concerns and due follow-ups join the existing attention list. A
    // RECORDED 1:1 does not: it is history, and putting every completed
    // conversation here is how "needs your attention" stops meaning anything.
    attention: [
      ...buildAttention({ processes, dueSoon: authorisedData.dueSoon, caseIds }),
      ...activityAttention(activities, authorisedData.now),
      ...employmentAttention(employeeId, employmentEvents, now),
    ],
    // From EVERY authorised case, not just open ones: a closed disciplinary
    // case can still hold a live warning.
    currentWarnings: deriveCurrentWarnings(ctx.cases, authorisedData.allegations, authorisedData.now),
    // ── Wave A — ONE authoritative history ───────────────────────────────
    //
    // This was `buildRecentActivity(ctx, …)`, a SECOND independently assembled
    // chronology: it carried case-opened, outcome-issued, meeting-completed,
    // wellbeing and referral events, and carried NO activities and NO employment
    // events. So Overview and the History tab disagreed about what had recently
    // happened to the same person, and the link between them was broken.
    //
    // It is now a preview of the same projection the tab renders — assigned
    // below, once activityEntries exists.
    recentActivity: activityEntries.slice(0, 5),
    // The Activity tab's chronological projection: activities with their own
    // chronology, formal process milestones, and meetings reached through an
    // authorised case.
    activities,
    activityRecords,
    activityEntries,
    // Employment events are their own authoritative domain under the same
    // projection — never merged into activities, never turned into a case.
    employmentEvents,
    // What is true NOW, and what is coming. Both, clearly separated.
    effectiveEmployee,
    pendingChanges,
    leavingDate: effectiveLeavingDate(employeeId, employmentEvents, now),
    isCurrentEmployee: isCurrentEmployee(ctx.employee, employmentEvents, now),
    // "What is happening" may name an open concern alongside an open process.
    openConcerns,
    employmentDetails: buildEmploymentDetails(effectiveEmployee || ctx.employee),
    // A first-class state: an employee with nothing canonically attributed.
    // ── Wave A — the Employee File decides its OWN emptiness ────────────────
    //
    // This was ctx.isEmpty, which counts cases, wellbeing notes, concern referrals
    // and DSAR requests — the E1-era collections, all of it predating conversations
    // and employment events.
    //
    // So an employee whose history was a 1:1 and a job-title change rendered the
    // empty state: "No recorded activity yet." That is not a cosmetic wrong answer.
    // It hid their real history, and with it Coming up and Recent history, on the
    // exact surface Wave A makes the manager's working home. Found by rendering the
    // screen, not by reading it.
    //
    // The file is empty when there is genuinely nothing it would show.
    isEmpty: ctx.isEmpty && activityEntries.length === 0 && pendingChanges.length === 0,
    // Organisation-wide and employee-agnostic — it must never read as
    // "this person has older records", because Compass does not know that.
    showUnattributedNotice: viewer.canSeeUnattributedNotice && hasUnattributedRecords(ctx),
  };
}
