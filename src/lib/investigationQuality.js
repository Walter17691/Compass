import { investigationChecklistTasks, INVESTIGATION_CHECKLIST_STEPS } from './investigationChecklist.js';

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

  return gaps;
}
