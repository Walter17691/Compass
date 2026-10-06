import { investigationChecklistTasks, INVESTIGATION_CHECKLIST_STEPS } from './investigationChecklist.js';
import { awaitsEmployerReview } from './employeeResponse.js';

// Manager Enablement (Phase 4, MP10, §16) — Investigation Quality Check.
// Same shape as decisionQuality.js's computeDecisionQualityGaps: a flat
// array of plain-English gap strings, advisory only (every path out,
// including "Proceed anyway", is still available), pure and
// unit-testable — no AI call. Distinct scope from decisionQuality.js:
// this checks whether the INVESTIGATION itself was thorough before it
// goes to HR, not whether a final decision is well-reasoned.
const EVIDENCE_KEYWORDS = /\bcctv\b|\bcamera\b|\bemail\b|\be-mail\b|\bmessage\b|\bwhatsapp\b|\btext(s)?\b|\brecording\b|\bscreenshot\b|\bfootage\b|\bvoicemail\b|\bphoto(s)?\b|\bdocument(s)?\b/i;

// "Submit findings to HR" is what's being gated here, so an incomplete
// checklist is reported against everything BUT that final step —
// reporting "you haven't submitted yet" as a reason not to submit would
// be circular.
const CHECKLIST_STEPS_EXCLUDING_SUBMIT = INVESTIGATION_CHECKLIST_STEPS.slice(0, -1);

// TRUST-SIG-03 — an unresolved challenge to a meeting record is a gap in the
// investigation, and this is the mechanism Compass already has for saying so:
// surfaced clearly before the finding, overridable with a recorded reason, never
// an absolute blocker. The brief is explicit that it must not permanently block.
export function computeInvestigationQualityGaps(cs, allegations, caseTasks) {
  const caseAllegations = (allegations || []).filter(a => a.caseId === cs.id);
  const gaps = [];

  const hasInvestigationMeeting = (cs.meetings || []).some(m => (m.type || "").toLowerCase().includes("investigation") && m.record);
  if (!hasInvestigationMeeting) {
    gaps.push("No investigation meeting has been recorded on this case yet.");
  }

  caseAllegations.forEach(a => {
    if (a.status === "unreviewed") {
      gaps.push(`Allegation not yet explored: "${a.title}"`);
    }
    if ((a.peopleInvolved || "").trim() && !(a.witnessEvidence || "").trim()) {
      gaps.push(`Witness(es) named but no witness evidence recorded: "${a.title}"`);
    }
    const mentionsEvidence = EVIDENCE_KEYWORDS.test(a.title || "") || EVIDENCE_KEYWORDS.test(a.description || "");
    const hasLinkedEvidence = (cs.evidence || []).some(ev => ev.allegationId === a.id);
    if (mentionsEvidence && !hasLinkedEvidence) {
      gaps.push(`Evidence mentioned but not linked to the allegation: "${a.title}"`);
    }
  });

  // Only meaningful once a formal investigator assignment has actually
  // seeded the checklist (assignInvestigator, App.jsx) — plenty of cases
  // are run entirely by HR with no separate investigator role ever
  // assigned, and an empty checklist there isn't a real gap, just an
  // unused feature.
  const checklistTasks = investigationChecklistTasks(caseTasks, cs.id);
  if (checklistTasks.length) {
    const doneTaskNames = new Set(checklistTasks.filter(t => t.status === "done").map(t => t.name));
    const outstandingSteps = CHECKLIST_STEPS_EXCLUDING_SUBMIT.filter(step => !doneTaskNames.has(step.label));
    if (outstandingSteps.length) {
      gaps.push(`${outstandingSteps.length} checklist step${outstandingSteps.length !== 1 ? "s" : ""} not yet marked complete: ${outstandingSteps.map(s => s.label).join(", ")}.`);
    }
  }

  // ── A MEETING RECORD THE EMPLOYEE SAYS IS WRONG ───────────────────────────
  //
  // Reaching a finding on evidence the employee has formally challenged, without
  // having answered the challenge, is a procedural problem on its own terms. It
  // is reported here rather than blocked: the employer may have perfectly good
  // reasons to proceed, and the override path records them.
  //
  // ONLY an explicit classification counts (awaitsEmployerReview). A historical
  // generic comment is not a dispute and is not reinterpreted as one.
  (cs.meetings || []).forEach(m => {
    if (awaitsEmployerReview(m)) {
      gaps.push(`${m.type || "Meeting"} record of ${m.date || "an unrecorded date"}: the employee says it is inaccurate or incomplete, and that response has not been reviewed.`);
    }
  });

  return gaps;
}
