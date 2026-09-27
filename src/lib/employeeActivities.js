// Phase E1.6 — Employee Activities.
//
// The employee-owned management history that is NOT a formal ER process: the 1:1,
// the return-to-work conversation, the ordinary management conversation, and the
// informal management concern.
//
// These are deliberately not case types. Recording a 1:1 as a case would drag
// hearings, investigations, outcomes and sanctions along behind it, and an
// informal concern would quietly acquire disciplinary machinery nobody chose.
// They are their own domain, parented by canonical employee_id.

export const ACTIVITY_TYPES = Object.freeze([
  { id: "one_to_one", label: "1:1", lifecycle: "conversation",
    blurb: "A regular one-to-one conversation." },
  { id: "return_to_work", label: "Return to Work", lifecycle: "conversation",
    blurb: "The conversation held when someone returns after absence." },
  { id: "conversation", label: "Conversation", lifecycle: "conversation",
    blurb: "Any other management conversation worth recording." },
  { id: "management_concern", label: "Management Concern", lifecycle: "concern",
    blurb: "An informal concern you are managing — not a disciplinary process." },
]);

const TYPE_BY_ID = Object.fromEntries(ACTIVITY_TYPES.map(t => [t.id, t]));

// Database enum values are never shown to a person. "management_concern" is a
// column value; "Management Concern" is what a manager reads.
export function activityTypeLabel(id) {
  return TYPE_BY_ID[id]?.label || "Activity";
}

export function isActivityType(id) {
  return Object.hasOwn(TYPE_BY_ID, id || "");
}

// ── Lifecycle, which is NOT one shared enum ─────────────────────────────────
//
// A completed 1:1 is not "resolved". A management concern is not "completed".
// Two vocabularies, because the two things are genuinely different, and the
// database CHECK constraint makes the wrong pairing unstorable rather than merely
// discouraged. This module must agree with that constraint, not soften it.
export const CONVERSATION_STATES = Object.freeze(["draft", "scheduled", "in_progress", "completed", "cancelled"]);
export const CONCERN_STATES = Object.freeze(["open", "resolved"]);

const CONVERSATION_STATE_LABEL = {
  draft: "Draft", scheduled: "Scheduled", in_progress: "In progress",
  completed: "Recorded", cancelled: "Cancelled",
};
const CONCERN_STATE_LABEL = { open: "Open", resolved: "Resolved" };

export function usesConcernLifecycle(activityType) {
  return TYPE_BY_ID[activityType]?.lifecycle === "concern";
}

// The single place that answers "what state is this in, in words". Returns null
// rather than guessing when the row contradicts its own type.
export function activityStateLabel(activity) {
  if (!activity) return null;
  if (usesConcernLifecycle(activity.activityType)) {
    return CONCERN_STATE_LABEL[activity.concernState] || null;
  }
  // "Recorded" rather than "Completed": a manager recording yesterday's 1:1 has
  // not completed a task, they have written down what happened.
  return CONVERSATION_STATE_LABEL[activity.lifecycleState] || null;
}

// Is this still asking something of someone? A concern is open until resolved; a
// conversation is outstanding only while it has not happened yet.
export function isActivityOpen(activity) {
  if (!activity) return false;
  if (usesConcernLifecycle(activity.activityType)) return activity.concernState === "open";
  return activity.lifecycleState === "draft" || activity.lifecycleState === "scheduled"
      || activity.lifecycleState === "in_progress";
}

// A completed 1:1 is NOT an open item and NOT a current issue. Stated as its own
// function because the temptation to show every recorded conversation as
// something needing attention is exactly what makes a file unreadable.
export function isConcern(activity) {
  return activity?.activityType === "management_concern";
}

export function isOpenConcern(activity) {
  return isConcern(activity) && activity.concernState === "open";
}

// ── Activity records — the chronology inside one activity ───────────────────
export const RECORD_TYPES = Object.freeze([
  { id: "conversation", label: "Conversation" },
  { id: "follow_up", label: "Follow-up" },
  { id: "note", label: "Note" },
  { id: "letter_of_concern", label: "Letter of Concern" },
  { id: "communication", label: "Communication" },
]);

const RECORD_LABEL = Object.fromEntries(RECORD_TYPES.map(r => [r.id, r.label]));

export function recordTypeLabel(id) {
  return RECORD_LABEL[id] || "Entry";
}

export function isRecordType(id) {
  return Object.hasOwn(RECORD_LABEL, id || "");
}

// ── Letter of Concern ───────────────────────────────────────────────────────
//
// An informal management action and meaningful employee history. It is NOT a
// formal disciplinary warning, and the separation is structural rather than a
// label: a Letter of Concern is a row in employee_activity_records, while Current
// Warnings derives only from cases and allegations. There is no warning column to
// populate, no expiry to invent, and no path from one table to the other.
//
// This function exists so the claim is testable in one place.
export function isLetterOfConcern(record) {
  return record?.recordType === "letter_of_concern";
}

// Deliberately returns nothing resembling a warning. Any caller that wants to
// treat a Letter of Concern as a warning has to write that themselves, in the
// open, against a test that forbids it.
export function letterOfConcernSummary(record) {
  if (!isLetterOfConcern(record)) return null;
  return {
    label: "Letter of Concern",
    // Said out loud, because the whole risk here is someone reading it as a
    // sanction later.
    isFormalWarning: false,
    expiresAt: null,
    occurredAt: record.occurredAt || null,
  };
}

// ── Building the Activity projection ───────────────────────────────────────
//
// The Activity tab is a PROJECTION, not a table dump: one chronological list
// answering what happened, when, what kind of thing it was, who recorded it, and
// whether anything is still open.
//
// Employment events are E1.7 and deliberately absent. Formal process milestones
// are included only where they are already safely available from authorised
// cases — never invented.
export function buildActivityEntries({ activities = [], activityRecords = [], cases = [] } = {}) {
  const recordsByActivity = new Map();
  activityRecords.forEach(r => {
    if (!r?.activityId) return;
    const list = recordsByActivity.get(r.activityId) || [];
    list.push(r);
    recordsByActivity.set(r.activityId, list);
  });

  const activityEntries = activities.filter(a => a && a.id).map(a => {
    const records = (recordsByActivity.get(a.id) || [])
      .slice()
      .sort((x, y) => new Date(x.occurredAt || 0) - new Date(y.occurredAt || 0));
    return {
      kind: "activity",
      id: a.id,
      activityType: a.activityType,
      typeLabel: activityTypeLabel(a.activityType),
      title: a.title || "",
      stateLabel: activityStateLabel(a),
      open: isActivityOpen(a),
      isConcern: isConcern(a),
      // The employment-history date, which is occurred_at — never created_at.
      occurredAt: a.occurredAt || null,
      recordedAt: a.createdAt || null,
      // True when the record was written down later than the day it happened.
      recordedLater: !!(a.occurredAt && a.createdAt
        && new Date(a.createdAt).toDateString() !== new Date(a.occurredAt).toDateString()),
      managerName: a.managerName || "",
      followUpDate: a.followUpDate || null,
      resolvedAt: a.resolvedAt || null,
      locationId: a.locationId || null,
      records,
      hasLetterOfConcern: records.some(isLetterOfConcern),
    };
  });

  // Formal processes appear as one milestone each, so the chronology reads as one
  // history rather than two lists. They stay clearly labelled as processes.
  const processEntries = cases.filter(c => c && c.id).map(c => ({
    kind: "process",
    id: c.id,
    typeLabel: "HR process",
    title: c.caseType || "Case",
    occurredAt: c.createdAt || c.dateReceived || null,
    open: (c.stage || "") !== "closed",
  }));

  // Case meetings, reached THROUGH an authorised case — authoritative parentage,
  // not a name match. This is what the separate Meetings tab used to show; it
  // belongs in the one chronology rather than in a list of its own. Meetings held
  // outside a case are still absent, because public.meetings has no employee_id
  // and attributing one by name is the inference this programme removed.
  const meetingEntries = [];
  cases.filter(c => c && c.id).forEach(c => {
    (c.meetings || []).forEach(m => {
      if (!m || !m.id) return;
      meetingEntries.push({
        kind: "meeting",
        id: `${c.id}:${m.id}`,
        caseId: c.id,
        typeLabel: m.type || "Meeting",
        title: c.caseType || "Case",
        occurredAt: m.date || null,
        open: false,
      });
    });
  });

  return [...activityEntries, ...processEntries, ...meetingEntries]
    .sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0));
}

// Open concerns and due follow-ups are the only activity items that belong in
// "Needs your attention". A recorded 1:1 is history, not a task.
export function activityAttention(activities = [], today = new Date()) {
  const items = [];
  activities.filter(a => a && a.id).forEach(a => {
    if (isOpenConcern(a)) {
      items.push({
        id: `concern:${a.id}`,
        activityId: a.id,
        label: a.title ? `Open management concern — ${a.title}` : "Open management concern",
        reason: "Still open. Record a follow-up, or resolve it once it is settled.",
      });
    }
    if (a.followUpDate && !a.resolvedAt) {
      const due = new Date(a.followUpDate);
      if (!Number.isNaN(due.getTime()) && due <= today) {
        items.push({
          id: `followup:${a.id}`,
          activityId: a.id,
          label: `Follow-up due — ${activityTypeLabel(a.activityType)}`,
          reason: "The follow-up date you set has arrived.",
        });
      }
    }
  });
  return items;
}
