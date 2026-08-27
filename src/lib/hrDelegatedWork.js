import { investigationChecklistTasks, INVESTIGATION_CHECKLIST_STEPS } from './investigationChecklist.js';
import { allegationsForCase } from './allegations.js';
import { parseFlexDate } from './dateMath.js';

// Manager Enablement (Phase 4, MP18, §14) — HR Delegated Work dashboard.
// Deterministic only, same style as guardrails.js: no AI call, just a
// couple of sharp, genuinely actionable signals rather than reusing
// computeInvestigationQualityGaps' own broader pre-submission checklist
// wholesale — this dashboard is "should HR glance at this one", not a
// full quality gate.
const INTERVIEW_STEP_NAMES = ["Interview witnesses", "Interview the employee"];

export function computeHrAttentionFlag(cs, caseAllegations, checklistTasks, targetCompletionDate, today = new Date()) {
  const reasons = [];
  const doneNames = new Set((checklistTasks || []).filter(t => t.status === "done").map(t => t.name));
  const interviewsDone = INTERVIEW_STEP_NAMES.every(name => doneNames.has(name));
  const hasUntouchedAllegation = (caseAllegations || []).some(a => a.status === "unreviewed");
  if (interviewsDone && hasUntouchedAllegation) {
    reasons.push("Interviews are complete but an allegation is still unreviewed.");
  }
  if (targetCompletionDate && !cs.investigationReport) {
    const target = parseFlexDate(targetCompletionDate);
    if (target) {
      const todayMidnight = new Date(today);
      todayMidnight.setHours(0, 0, 0, 0);
      target.setHours(0, 0, 0, 0);
      if (target < todayMidnight) reasons.push("Target completion date has passed with no investigation report yet.");
    }
  }
  return { flagged: reasons.length > 0, reasons };
}

// One row per (case, investigator) case_access grant — investigations
// assigned, who's doing them, progress, meetings held, overdue tasks,
// target date, and whether HR attention is suggested. Every field reads
// data MP1/MP7/MP8/MP10 already produce; nothing new is computed beyond
// the attention flag above.
export function computeDelegatedWork(cases, caseAccess, orgMembers, caseTasks, allegations, today = new Date()) {
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);
  return (caseAccess || [])
    .filter(a => a.role === "investigator")
    .map(access => {
      const cs = (cases || []).find(c => c.id === access.caseId);
      if (!cs) return null;
      const investigator = (orgMembers || []).find(m => m.user_id === access.userId);
      const checklistTasks = investigationChecklistTasks(caseTasks, cs.id);
      const checklistDone = checklistTasks.filter(t => t.status === "done").length;
      const meetingsCompleted = (cs.meetings || []).filter(m => (m.type || "").toLowerCase().includes("investigation") && m.record).length;
      // Was a string comparison (t.dueDate < todayIso) — silently wrong
      // whenever dueDate is UK-format "DD/MM/YYYY" text, since lexical
      // order of that format doesn't match chronological order at all.
      const tasksOverdue = (caseTasks || []).filter(t => {
        if (t.caseId !== cs.id || t.status === "done" || !t.dueDate) return false;
        const due = parseFlexDate(t.dueDate);
        if (!due) return false;
        due.setHours(0, 0, 0, 0);
        return due < todayMidnight;
      }).length;
      const caseAllegations = allegationsForCase(allegations, cs.id);
      // Manager Enablement (Phase 4, MP19, §15) — a paused case never
      // gets flagged for attention (HR paused it deliberately; a
      // deadline/attention nag would defeat the point), but still
      // appears here — silently dropping it, the way computeDueSoon
      // does, would leave HR wondering where a delegated case went.
      const attention = cs.investigationPaused ? { flagged: false, reasons: [] } : computeHrAttentionFlag(cs, caseAllegations, checklistTasks, access.targetCompletionDate, today);
      return {
        caseId: cs.id,
        employeeName: cs.employeeName,
        investigatorName: investigator?.name || "Unknown",
        checklistDone,
        checklistTotal: INVESTIGATION_CHECKLIST_STEPS.length,
        meetingsCompleted,
        tasksOverdue,
        targetCompletionDate: access.targetCompletionDate || null,
        paused: !!cs.investigationPaused,
        attentionFlagged: attention.flagged,
        attentionReasons: attention.reasons,
      };
    })
    .filter(Boolean);
}
