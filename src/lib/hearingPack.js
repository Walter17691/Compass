// Integrations & Workflow Automation (Phase 5, IP8, §27) — automatic
// hearing pack. Pure aggregation over case data structures that already
// exist (allegations, meetings, evidence, the investigation report,
// policies, the chronology) — no AI call, no new intelligence, just
// compiling what's already on the case into one structured, indexed set
// of sections. Actual PDF rendering (App.jsx's generateHearingPackPDF,
// alongside the existing generatePDF/exportPDF jsPDF patterns) is a
// separate, deliberately untested-here concern — this file only builds
// the data those functions render.
//
// "Excluding irrelevant confidential material" (the spec's own phrasing)
// is satisfied structurally rather than by a new flagging system: the
// pack only ever reads from cs.evidence/cs.meetings/allegations/policies
// — it has no path to wellbeing_notes (a separate, RLS-restricted table
// no case-scoped read ever touches) or anything else confidential by
// design — and the chronology section respects the same
// cs.timelineOverrides exclusions HR has already set via the Timeline
// tab (buildCaseTimeline, lib/caseTimeline.js), rather than inventing a
// second, hearing-pack-specific exclusion mechanism.

import { buildCaseTimeline } from './caseTimeline';
import { allegationsForCase, evidenceForAllegation } from './allegations';
import { getProcessType } from './processStages';

// Reuses the two vocabularies that already exist (PROCESS_TYPES'
// case-type ids, POLICY_CATEGORIES' category ids) rather than a new AI
// judgement call about which policy is "relevant" — a deterministic
// lookup, not a guess.
export const CASE_TYPE_TO_POLICY_CATEGORY = {
  misconduct: "disciplinary",
  appeal: "disciplinary",
  grievance: "grievance",
  capability: "capability",
  attendance: "attendance",
  long_term_sickness: "attendance",
  probation: "probation",
  flexible_working: "flexible_working",
  redundancy: "redundancy",
};

export function buildHearingPackSections(cs, { allegations = [], policies = [], auditLog = [] } = {}) {
  const caseAllegations = allegationsForCase(allegations, cs.id);
  const evidence = cs.evidence || [];
  const meetings = cs.meetings || [];
  const processType = getProcessType(cs.caseType);
  const relevantCategory = CASE_TYPE_TO_POLICY_CATEGORY[processType.id];
  const relevantPolicies = relevantCategory ? policies.filter(p => p.category === relevantCategory) : [];
  const timeline = buildCaseTimeline(cs, allegations, auditLog, cs.timelineOverrides || {});
  // A letterOutput is generic (whichever letter type was last drafted
  // for that meeting — invitation, outcome, appeal) — labelled by its
  // meeting rather than presumptuously called "the invitation", since
  // nothing in the schema distinguishes letter type from meeting type.
  const correspondence = meetings.filter(m => m.letterOutput);

  return {
    caseSummary: { employeeName: cs.employeeName, caseType: cs.caseType || "Not set", stage: cs.stage || null },
    allegations: caseAllegations.map(a => ({
      title: a.title,
      description: a.description || null,
      employeeResponse: a.employeeResponse || null,
      witnessEvidence: a.witnessEvidence || null,
      evidence: evidenceForAllegation(evidence, a.id).map(e => ({ name: e.name, type: e.type, date: e.date })),
    })),
    investigationReport: cs.investigationReport ? { text: cs.investigationReport, date: cs.investigationReportDate || null } : null,
    meetings: meetings.map(m => ({ type: m.type || "Meeting", date: m.date || null, signStatus: m.signStatus || "pending", record: m.record || null })),
    correspondence: correspondence.map(m => ({ meetingType: m.type || "Meeting", date: m.date || null, text: m.letterOutput })),
    evidence: evidence.map(e => ({ name: e.name, type: e.type || null, date: e.date || null, addedBy: e.addedBy || null })),
    policies: relevantPolicies.map(p => ({ name: p.name, clauses: p.clauses || [] })),
    chronology: timeline.map(t => ({ date: t.date, description: t.description })),
  };
}
