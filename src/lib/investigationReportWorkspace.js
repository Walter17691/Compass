import { allegationsForCase, evidenceForAllegation } from './allegations.js';
import { openSignalsForCase } from './caseSignals.js';
import { isInvestigationMeeting } from './meetingTypeMatch.js';
import { conclusionLabel, conclusionMeaning, rollupInvestigationConclusions } from './investigationConclusion.js';

// ─────────────────────────────────────────────────────────────────────────
// B3.2-0 — THE READ-ONLY MODEL BEHIND THE INVESTIGATION REPORT WORKSPACE.
//
// Everything the workspace shows is derived HERE, as a pure function over
// data the case already holds, so the rules can be tested without rendering
// anything and so there is one place to audit the only question that matters
// for this slice: does Compass ever state something the record does not say?
//
// THE RULE THIS MODULE EXISTS TO ENFORCE: absence is reported as absence.
// Every section can be empty, and an empty section says so in its own terms
// rather than being hidden, defaulted, or filled with a plausible guess. An
// investigation with no interviews, no named subject and no structured
// matters is a legitimate investigation — a document review of an incident —
// and the workspace has to render that truthfully rather than looking broken.
//
// WHAT IT DELIBERATELY DOES NOT DO:
//   * no conclusion is inferred — a matter with no recorded position reads as
//     "no position recorded", never as "no case to answer";
//   * no version, adoption or provenance is invented for a legacy report;
//   * nothing is gated on cs.caseType, which production shows is unvalidated
//     free text (ten values, and 45 of the 50 live reports carry the empty
//     string), nor on an investigation meeting existing;
//   * no write of any kind is modelled. B3.2-0 is read-only.
// ─────────────────────────────────────────────────────────────────────────

/** The lifecycle this workspace will eventually drive. Shown, not yet actionable. */
export const REPORT_LIFECYCLE = Object.freeze([
  { id: 'draft', label: 'Draft' },
  { id: 'save_version', label: 'Save version' },
  { id: 'adopt', label: 'Adopt' },
  { id: 'submit', label: 'Submit to HR' },
  { id: 'hr_review', label: 'HR Review' },
]);

/** Why the workspace has nothing to show in a given section. Named, not blank. */
export const ABSENT = Object.freeze({
  NO_VERSIONS: 'no_versions',
  NO_MATTERS: 'no_matters',
  NO_MEETINGS: 'no_meetings',
  NO_EMPLOYEE: 'no_employee',
  LEGACY_ONLY: 'legacy_only',
  VERSIONS_UNREADABLE: 'versions_unreadable',
});

const text = v => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * A matter under investigation, with the human's recorded position.
 *
 * `position` is null when nobody has recorded one. That is the whole point:
 * the three permitted positions are a human judgement, and the absence of one
 * is a fact about the investigation, not a value to be defaulted.
 */
function matterFrom(allegation, evidence) {
  const linked = evidenceForAllegation(evidence, allegation.id);
  return {
    id: allegation.id,
    title: text(allegation.title) || 'Untitled matter',
    description: text(allegation.description),
    position: allegation.investigationConclusion || null,
    positionLabel: conclusionLabel(allegation.investigationConclusion),
    positionMeaning: conclusionMeaning(allegation.investigationConclusion),
    // The investigator's own words, surfaced as theirs and never summarised.
    reasoning: text(allegation.investigationConclusionReasoning),
    investigatorFinding: text(allegation.investigatorFinding),
    outstandingUncertainty: text(allegation.outstandingUncertainty),
    employeeResponse: text(allegation.employeeResponse),
    witnessEvidence: text(allegation.witnessEvidence),
    evidence: linked.map(ev => ({
      id: ev.id,
      name: text(ev.name) || 'Unnamed item',
      type: text(ev.type),
      date: ev.date || null,
      // 'supports' / 'contradicts' / null. Null means nobody has said, which
      // is different from neutral and is shown as such.
      stance: ev.stance || null,
    })),
  };
}

/**
 * Signature and dispute provenance for one meeting, read from what the
 * meeting itself records. Returns nulls rather than guesses: a meeting with
 * no signature request has no signature status, which is not the same as
 * being unsigned.
 */
function meetingProvenance(m) {
  const responseType = text(m.responseType);
  return {
    id: m.id,
    type: text(m.type),
    date: m.date || null,
    hasRecord: !!text(m.record),
    // Only ever reported when a signature request actually exists.
    signatureRequested: !!m.signId,
    signatureStatus: m.signId ? (text(m.signStatus) || null) : null,
    disputed: responseType === 'disputed',
    proposedCorrection: text(m.proposedCorrection),
    resolution: text(m.responseResolution),
  };
}

/**
 * Build the whole read-only model.
 *
 * `versions` and `versionsUnreadable` come from the report-version gateway.
 * They are kept distinct for the same reason every other Compass read does:
 * "there are none" and "we could not look" are different facts, and a
 * workspace that renders the first when the second is true is lying quietly.
 */
export function buildReportWorkspace({
  cs = {},
  allegations = [],
  evidence = null,
  caseSignals = [],
  documents = [],
  versions = [],
  versionsUnreadable = false,
  versionsLoading = false,
} = {}) {
  const caseId = cs?.id ?? null;
  const caseEvidence = Array.isArray(evidence) ? evidence : (Array.isArray(cs?.evidence) ? cs.evidence : []);
  const meetings = Array.isArray(cs?.meetings) ? cs.meetings : [];
  // allegationsForCase does `(allegations || []).filter(...)`, which passes a
  // non-array straight through to .filter and throws. Guarding here rather
  // than changing a helper a dozen other call sites rely on: a workspace must
  // degrade to "nothing recorded", never to a blank screen.
  const caseAllegations = allegationsForCase(Array.isArray(allegations) ? allegations : [], caseId)
    .filter(Boolean);
  const safeSignals = Array.isArray(caseSignals) ? caseSignals : [];

  const matters = caseAllegations.map(a => matterFrom(a, caseEvidence));
  const rollup = rollupInvestigationConclusions(caseAllegations);

  const investigationMeetings = meetings.filter(m => m && isInvestigationMeeting(m.type)).map(meetingProvenance);
  const disputes = investigationMeetings.filter(m => m.disputed);

  const unresolvedQuestions = openSignalsForCase(safeSignals, caseId, 'unanswered_question')
    .map(s => ({ id: s.id, title: text(s.title) || 'Unresolved question', reasoning: text(s.reasoning) }));

  // Evidence that is not linked to any matter is still part of the record and
  // must not vanish just because nobody attached it to an issue.
  const linkedIds = new Set(matters.flatMap(m => m.evidence.map(e => e.id)));
  const unlinkedEvidence = caseEvidence
    .filter(ev => ev && !linkedIds.has(ev.id))
    .map(ev => ({ id: ev.id, name: text(ev.name) || 'Unnamed item', type: text(ev.type), date: ev.date || null, stance: ev.stance || null }));

  const safeVersions = (Array.isArray(versions) ? versions : []).filter(Boolean);
  const adopted = safeVersions.filter(v => v.adoptedAt);
  const currentAdopted = safeVersions.find(v => v.isCurrent && v.adoptedAt) || null;

  const legacyReport = text(cs?.investigationReport);
  // A legacy report is one held on the case itself with no version behind it.
  // It is shown AS a legacy record — never dressed up with an adoption that
  // never happened.
  const legacyOnly = !!legacyReport && safeVersions.length === 0;

  const namedEmployee = text(cs?.employeeName);

  return {
    caseId,
    // An investigation may legitimately concern an incident or process with
    // nobody identified. Reported, never treated as an error.
    subject: namedEmployee,
    subjectAbsent: !namedEmployee,

    matters,
    mattersAbsent: matters.length === 0,
    rollupState: rollup.state,
    positionsRecorded: matters.filter(m => m.position).length,
    positionsOutstanding: matters.filter(m => !m.position).length,

    investigationMeetings,
    meetingsAbsent: investigationMeetings.length === 0,
    disputes,

    unlinkedEvidence,
    unresolvedQuestions,
    documents: (Array.isArray(documents) ? documents : []).filter(Boolean),

    versions: safeVersions,
    versionsAbsent: safeVersions.length === 0,
    versionsUnreadable: !!versionsUnreadable,
    // Distinct from absent: the read has not come back yet, so no claim is made.
    versionsLoading: !!versionsLoading,
    adoptedCount: adopted.length,
    currentAdopted,

    legacyReport,
    legacyOnly,

    // Nothing in B3.2-0 may act. The lifecycle is shown so the investigator can
    // see where they are, and every step is inert.
    lifecycle: REPORT_LIFECYCLE,
    readOnly: true,
  };
}

/**
 * The one-line status a reader needs before anything else: which document, if
 * any, is currently the official one. Deliberately refuses to answer when the
 * versions could not be read.
 */
export function describeReportState(model) {
  if (!model) return 'No investigation report information is available.';
  if (model.versionsLoading) return 'Loading the report history for this case\u2026';
  if (model.versionsUnreadable) {
    return 'Compass could not read the saved report versions for this case, so it cannot say which report is current. Try again before relying on this view.';
  }
  if (model.currentAdopted) {
    return `Version ${model.currentAdopted.versionNo} is the adopted investigation report for this case.`;
  }
  if (!model.versionsAbsent) {
    return 'Report versions have been saved for this case, but none has been adopted as the official report.';
  }
  if (model.legacyOnly) {
    return 'This case holds an investigation report created before Compass recorded report versions. It is kept as a legacy record: there is no version history or adoption record behind it, and none has been invented.';
  }
  return 'No investigation report has been saved for this case yet.';
}
