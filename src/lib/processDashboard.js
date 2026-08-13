// Process Intelligence (P17, §18) — Process Dashboard's "Potential
// Bottlenecks" panel: which stages, across all active cases, are
// running notably longer than a sensible default. Pure and unit-
// testable, same style as guardrails.js/caseReadiness.js.
//
// DEFAULT_STAGE_TARGET_DAYS is a single, uniform, clearly-labelled
// guideline (not a statutory deadline, and not fabricated per-stage
// precision this codebase has no real basis for) — the same "advisory,
// not a legal conclusion" discipline caseRisk.js/tribunalEstimate.js
// already apply to their own estimates.
import { getCaseStage } from './caseStage';
import { getProcessType } from './processStages';

export const DEFAULT_STAGE_TARGET_DAYS = 10;

export function computeStageBottlenecks(cases) {
  const now = new Date();
  const byKey = {};

  (cases || []).forEach(cs => {
    const stage = getCaseStage(cs);
    if (!stage || stage === "closed") return;
    // A case that transitioned before this tracking existed has no
    // stageEnteredAt entry for its current stage yet — falling back to
    // createdAt only over-counts a case's very first stage (the common
    // case for a newly-tracked org); it self-corrects as cases move
    // through subsequent stages and get properly stamped.
    const enteredAtStr = cs.timelineOverrides?.stageEnteredAt?.[stage] || cs.createdAt;
    if (!enteredAtStr) return;
    const enteredAt = new Date(enteredAtStr);
    if (isNaN(enteredAt)) return;

    const processType = getProcessType(cs.caseType);
    const stageLabel = processType.stages.find(s => s.id === stage)?.label || stage;
    const key = processType.id + ":" + stage;
    if (!byKey[key]) byKey[key] = { processType: processType.label, stage: stageLabel, durations: [] };
    byKey[key].durations.push(Math.max(0, Math.floor((now - enteredAt) / (1000 * 60 * 60 * 24))));
  });

  return Object.values(byKey)
    .map(b => {
      const avgDays = b.durations.reduce((a, d) => a + d, 0) / b.durations.length;
      return {
        processType: b.processType,
        stage: b.stage,
        caseCount: b.durations.length,
        avgDays: Math.round(avgDays * 10) / 10,
        targetDays: DEFAULT_STAGE_TARGET_DAYS,
      };
    })
    .filter(b => b.avgDays > DEFAULT_STAGE_TARGET_DAYS)
    .sort((a, b) => b.avgDays - a.avgDays);
}
