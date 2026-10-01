import { buildCaseTimeline } from './caseTimeline.js';
import { isMeetingComplete, isResumableMeeting, isScheduledMeeting, isGenuineMeeting, declaredStatus, MEETING_STATUS } from './meetingLifecycle.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B — reading a case without operating it.
//
// The Case View carried twelve destinations and eleven analysis panels on its
// default surface, so understanding a case meant navigating it. This module
// derives the four things a manager actually needs — where the process is, what
// is happening, what needs doing, and what has happened — from the SAME
// authoritative engines the screen already used.
//
// ┌─ WHAT THIS MODULE IS NOT ───────────────────────────────────────────────┐
// │ It is not a process engine. getNextStep stays the single authority on     │
// │ what happens next, buildCaseTimeline stays the single authority on what   │
// │ happened, and getCaseStage stays the single authority on where the case   │
// │ is. Everything here is presentation derived from those three.             │
// │                                                                         │
// │ It is not an authorisation boundary either: it is handed the case the     │
// │ viewer was already given. An inaccessible case never reaches it.          │
// │                                                                         │
// │ And it invents nothing. No AI, no narrative generation, no process        │
// │ guidance for a type Compass has no recipe for.                            │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

// ── Where is this process? ──────────────────────────────────────────────────
//
// Stage ids are implementation vocabulary — "inv_report" is a column value, not
// something to show a person. This maps the validated stage sequence to words,
// and deliberately has no default branch that invents meaning: an unrecognised
// stage reads as "In progress", which is true of every open case and claims
// nothing further.
const STAGE_LABEL = Object.freeze({
  open: "Open",
  investigation: "Investigation",
  disciplinary: "Disciplinary",
  outcome: "Outcome",
  appeal: "Appeal",
  closed: "Closed",
});

export function caseStatusLabel(stage) {
  if (!stage) return "Open";
  return STAGE_LABEL[stage] || "In progress";
}

export function isClosedStage(stage) {
  return stage === "closed";
}

// ── What is happening? ──────────────────────────────────────────────────────
//
// One or two short sentences, assembled from counts and lifecycle state. Every
// clause is a fact the case object already holds; nothing is estimated, predicted
// or phrased as advice.
//
// Returns null when there is genuinely nothing factual to say, rather than
// padding the screen with a sentence that means "this case exists".
export function describeWhatIsHappening({ cs, stage, allegations = [], meetings = [], scheduledWhen = null } = {}) {
  if (!cs) return null;

  const genuine = meetings.filter(isGenuineMeeting);
  const held = genuine.filter(isMeetingComplete);
  const live = genuine.find(isResumableMeeting);
  const inReview = genuine.find(m => declaredStatus(m) === MEETING_STATUS.REVIEW_DRAFT);
  const scheduled = genuine.filter(isScheduledMeeting);

  if (isClosedStage(stage)) {
    return cs.outcome
      ? `Closed. The outcome was ${cs.outcome}.`
      : "Closed.";
  }

  const parts = [];

  // Where the process is, in words.
  if (stage === "appeal") parts.push("An appeal is in progress.");
  else if (stage === "outcome") parts.push("A decision is being recorded.");
  else if (stage === "disciplinary") parts.push("At the disciplinary stage.");
  else if (stage === "investigation") parts.push("Investigation in progress.");

  // What has actually been gathered. Counted, never characterised.
  const detail = [];
  if (allegations.length) {
    detail.push(`${allegations.length} allegation${allegations.length === 1 ? "" : "s"} recorded`);
  }
  if (held.length) {
    detail.push(`${held.length} meeting${held.length === 1 ? "" : "s"} held`);
  }
  if (detail.length) parts.push(`${detail.join(" and ")}.`);

  // The single most immediate fact about a meeting, if there is one.
  //
  // Wave B.2 — the meeting clause absorbs the one piece of CLASS A state the
  // next-step reason used to carry in its own strip: when a scheduled meeting is
  // actually arranged for. That date appears nowhere else, so it is a fact worth
  // a clause; "it does not need starting or resuming again" is not, because the
  // single action and the status chip already say so.
  if (live) parts.push("A meeting is in progress.");
  else if (inReview) parts.push("The meeting has been held and its record is awaiting review.");
  else if (scheduled.length) {
    parts.push(
      scheduled.length === 1
        ? `A meeting is scheduled${scheduledWhen ? ` for ${scheduledWhen}` : ""}.`
        : `${scheduled.length} meetings are scheduled.`
    );
  }

  return parts.length ? parts.join(" ") : null;
}

// ── What has happened? ──────────────────────────────────────────────────────
//
// The case record becomes the spine of the screen, so the manager does not have
// to open a Timeline tab to find out what happened.
//
// buildCaseTimeline is the existing authority. It is called with NO audit log on
// purpose: the record is meaningful process history, not technical audit history,
// and every "Case viewed"/"Field updated" row would bury the milestones that
// matter. The full record — audit included — is still reachable, unchanged.
export function caseRecordEntries(cs, allegations = [], { limit = null } = {}) {
  if (!cs) return [];
  const entries = buildCaseTimeline(cs, allegations, [])
    .filter(e => e && e.type !== "audit")
    .slice()
    .reverse();   // most recent first: what happened last is what matters now
  return typeof limit === "number" ? entries.slice(0, limit) : entries;
}

// ── What supporting material does this case actually have? ──────────────────
//
// Sections that do not apply do not appear. A case with no evidence should not
// offer an "Evidence (0)" row — an empty section is a thing to open and be
// disappointed by, and twelve of them is the navigation this wave removes.
//
// `always` marks the sections that stay available even when empty, because their
// absence would block work: an investigator with no allegations recorded yet still
// needs somewhere to record the first one.
export function caseDetailSections({
  allegations = [], evidence = [], meetings = [], tasks = [],
  participants = [], documents = [], communications = [],
  hasOutcome = false, canSeeAnalysis = false, canSeeThemes = false,
  hasInformation = false, showExposure = false,
} = {}) {
  const openTasks = tasks.filter(t => t && !t.done);
  return [
    // Wave B.2 — basic case facts stop hiding inside a section called "Checks
    // and analysis", which was neither. Absent entirely when the case has none,
    // so a blank description is never the first thing on the list.
    { id: "information", label: "Case information", count: null, always: hasInformation },
    { id: "allegations", label: "Allegations", count: allegations.length, always: true },
    { id: "evidence", label: "Evidence", count: evidence.length, always: true },
    { id: "meetings", label: "Meetings", count: meetings.filter(isGenuineMeeting).length, always: true },
    { id: "tasks", label: "Tasks", count: openTasks.length, always: true },
    { id: "people", label: "Participants", count: participants.length, always: false },
    { id: "documents", label: "Documents", count: documents.length, always: true },
    { id: "communications", label: "Communications", count: communications.length, always: false },
    { id: "outcome", label: "Outcome", count: null, always: hasOutcome },
    { id: "themes", label: "Themes", count: null, always: canSeeThemes },
    // "AI Assistant" named the mechanism. This names what it is: Compass's own
    // reading of the case, available to whoever may already see the case.
    { id: "ai", label: "Compass analysis", count: null, always: canSeeAnalysis },
    // Wave B.2 — a specialist estimator, not case management. It appears only
    // for a case where it is already in use or where risk has genuinely been
    // assessed above LOW (isRiskExposureRelevant, unchanged), and it sits last
    // so it never competes with the manager's process journey.
    { id: "exposure", label: "Tribunal exposure estimate", count: null, always: showExposure },
    // "Checks and analysis" is gone. It was a bucket, not a category: basic case
    // facts, an AI readiness score, a tribunal calculator, an action to record a
    // suspension and a role-assignment form shared one accordion because they
    // were all once on the same legacy tab. Each now has a coherent home.
  ].filter(s => s.always || (typeof s.count === "number" && s.count > 0));
}

// Every section id the screen can render, so an explicitly requested one can be
// restored even when it would otherwise be filtered out as empty.
const ALL_SECTIONS = Object.freeze({
  // Wave B.2 — "overview" ("Checks and analysis") is gone from the vocabulary
  // too, so a stale deep link cannot resurrect the bucket as an empty section.
  information: "Case information", timeline: "Full record", allegations: "Allegations",
  evidence: "Evidence", meetings: "Meetings", people: "Participants", tasks: "Tasks",
  documents: "Documents", communications: "Communications", themes: "Themes",
  outcome: "Outcome", ai: "Compass analysis", exposure: "Tribunal exposure estimate",
});

// A section the user has EXPLICITLY asked for is always available.
//
// Deep links name a section directly — openTimelineSource maps a record entry to
// "meetings"/"allegations"/"documents"/"outcome"/"evidence", and initialTab carries
// one in from elsewhere in the app. If that section had been filtered out for being
// empty, the link would land on nothing at all. Empty sections still stay out of the
// default list; this only re-admits the one that was asked for.
export function withRequestedSection(requestedId, sections = []) {
  if (!requestedId || !ALL_SECTIONS[requestedId]) return sections;
  if (sections.some(s => s.id === requestedId)) return sections;
  return [...sections, { id: requestedId, label: ALL_SECTIONS[requestedId], count: null, always: true }];
}
