import { isGenuineMeeting } from './meetingLifecycle.js';
import { getStageDefinitions } from './processStages.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B.2 corrective — the horizontal case workspace.
//
// Human product decision: the long vertical accordion reads as a settings
// screen, not a case-management workspace. The replacement is horizontal
// navigation — but NOT by promoting each existing accordion row to a tab.
//
// ┌─ THE CLASSIFICATION THIS IS DERIVED FROM ───────────────────────────────┐
// │ procedural stage   investigation, hearing, outcome, appeal — the real    │
// │                    DISCIPLINARY_STAGES/GRIEVANCE_STAGES registries       │
// │ case artefact      allegations, evidence — the subject matter and what   │
// │                    was gathered about it. Both belong to a STAGE; they   │
// │                    are not peers of it.                                  │
// │ procedural events  meetings, which run across every stage               │
// │ case history       the full chronology                                   │
// │ advisory           Compass's analysis                                    │
// │ org classification themes — about the ORGANISATION's patterns, not this  │
// │                    case's process                                        │
// │ specialist tool    the tribunal estimator — no workflow consumes it      │
// │ administration     participants, roles, case information, tasks          │
// └─────────────────────────────────────────────────────────────────────────┘
//
// So: allegations and evidence stop being destinations and become the CONTENT
// of the stage they belong to. Themes, the estimator and administration stop
// competing with the process. What is left is a small set of real jobs.
//
// This module decides WHICH destinations exist for a given case. It holds no
// process knowledge of its own — getStageDefinitions is the authority on whether
// a process type has an investigation stage at all.
// ─────────────────────────────────────────────────────────────────────────

// Does this process type genuinely investigate? Read from the type's own stage
// registry rather than a list maintained here, so a type whose stages change
// changes with it. A grievance has no investigation stage and must not be given
// an investigation workspace it does not have.
export function hasInvestigationStage(caseType) {
  return (getStageDefinitions(caseType) || []).some(s => s.id === "investigation");
}

// The allegations/evidence destination is named for what it actually is on this
// case. On a misconduct case that is the investigation; on a grievance there is
// no investigation stage, so calling it one would assert a procedure that does
// not exist.
export function evidenceDestinationLabel(caseType) {
  return hasInvestigationStage(caseType) ? "Investigation" : "Allegations & evidence";
}

export const WORKSPACE_MORE_LABEL = "More";

// `primary` destinations are the case's real working surfaces. `secondary` ones
// are genuinely supporting and live behind the overflow — not because they are
// unimportant, but because they are not what running the process consists of.
export function caseWorkspaceDestinations({
  cs = {}, allegations = [], evidence = [], meetings = [], tasks = [],
  documents = [], communications = [], participants = [],
  hasOutcome = false, outcomeReachable = false, canSeeThemes = false, showExposure = false,
  hasCaseInformation = false,
} = {}) {
  const openTasks = (tasks || []).filter(t => t && !t.done);
  const genuineMeetings = (meetings || []).filter(isGenuineMeeting);

  const primary = [
    // The stage the human review found had no home at all. Its content already
    // exists — allegations, evidence, the seeded 7-step checklist, investigation
    // meetings, the report — scattered across five former accordion rows.
    {
      id: "investigation",
      label: evidenceDestinationLabel(cs.caseType),
      count: allegations.length + evidence.length || null,
      always: true,
    },
    // Meetings span every stage, so they are a destination rather than content
    // of one. The stage filter inside keeps disciplinary and appeal legible.
    { id: "meetings", label: "Meetings", count: genuineMeetings.length || null, always: true },
    // What was issued or received. Letters, files and correspondence are one job.
    {
      id: "documents",
      label: "Documents",
      count: (documents.length + communications.length) || null,
      always: true,
    },
    // Only when the case has actually reached one. A disciplinary at intake
    // offering an "Outcome" destination invites a decision that has no basis yet.
    // D1 completion — available when the case is READY for a decision as well
    // as when one exists. hasOutcome alone described only the latter, so the
    // destination appeared after the decision had already been recorded, and
    // the only route to recording one ran through drafting its letter first.
    { id: "outcome", label: "Outcome", count: null, always: hasOutcome || outcomeReachable },
    // The full chronology. This is also the honest destination for "View full
    // record", which previously opened a section a thousand pixels below the fold.
    { id: "record", label: "Record", count: null, always: true },
    // One advisory home, unchanged in spirit from B.2.
    { id: "compass", label: "Compass analysis", count: null, always: true },
  ].filter(d => d.always);

  const secondary = [
    { id: "tasks", label: "Tasks", count: openTasks.length || null, always: true },
    { id: "people", label: "Participants & roles", count: participants.length || null, always: true },
    { id: "information", label: "Case information", count: null, always: hasCaseInformation },
    // Organisational classification, not case process: themes exist to find
    // patterns ACROSS cases, and HR confirmation stays authoritative.
    { id: "themes", label: "Themes", count: null, always: canSeeThemes },
    // A specialist calculator nothing in the product consumes.
    { id: "exposure", label: "Tribunal exposure estimate", count: null, always: showExposure },
  ].filter(d => d.always);

  return { primary, secondary };
}

// Every destination id the workspace can render, so a deep link or a restored
// tab can be validated without the caller knowing the shape.
export function isWorkspaceDestination(id, dests) {
  if (!id || !dests) return false;
  return [...dests.primary, ...dests.secondary].some(d => d.id === id);
}

// Responsive overflow. The navigation must never wrap into an unusable bar and
// must never fall back to a stacked list, so when the measured width cannot hold
// every primary destination the rightmost ones move into "More" — which already
// holds the secondary ones. Order is preserved: whatever stays visible stays in
// the same sequence, so the bar does not reshuffle as the window resizes.
export const MIN_VISIBLE_DESTINATIONS = 2;

export function splitForWidth(dests, maxVisible) {
  const primary = dests?.primary || [];
  const secondary = dests?.secondary || [];
  if (typeof maxVisible !== "number" || maxVisible >= primary.length) {
    return { visible: primary, overflow: secondary };
  }
  const keep = Math.max(MIN_VISIBLE_DESTINATIONS, maxVisible);
  if (keep >= primary.length) return { visible: primary, overflow: secondary };
  return {
    visible: primary.slice(0, keep),
    overflow: [...primary.slice(keep), ...secondary],
  };
}

// Every route that previously named a section still has to land. Deep links
// (initialTab, openTimelineSource, the reply-capture "Update Meeting" action)
// speak the OLD vocabulary, and those links exist in saved URLs and in other
// screens — so the old ids are translated rather than broken.
//
// "allegations" and "evidence" both resolve to the investigation, because that
// is now where those artefacts live; "timeline" resolves to the record; "ai" to
// Compass analysis; "communications" to documents.
const LEGACY_DESTINATION = Object.freeze({
  overview: "investigation",      // the deleted bucket's nearest honest home
  timeline: "record",
  allegations: "investigation",
  evidence: "investigation",
  investigation: "investigation",
  meetings: "meetings",
  documents: "documents",
  communications: "documents",
  outcome: "outcome",
  record: "record",
  ai: "compass",
  compass: "compass",
  tasks: "tasks",
  people: "people",
  information: "information",
  themes: "themes",
  exposure: "exposure",
});

export function destinationForLegacyTab(id) {
  if (!id) return null;
  return LEGACY_DESTINATION[id] || null;
}

// The destination a case opens on. Investigation is the working surface for a
// type that investigates; everything else opens on its allegations/evidence too,
// because that is what the case IS before anything has happened to it.
export const DEFAULT_DESTINATION = "investigation";
