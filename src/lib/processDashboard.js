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
import { getCaseStage } from './caseStage.js';
import { getProcessType } from './processStages.js';
import { getTemplateForType } from './processTemplates.js';

export const DEFAULT_STAGE_TARGET_DAYS = 10;

// Shared by computeStageDurations/computeStageBottlenecks (aggregate,
// no location) and computeStageBottlenecksByLocation (Phase 6, OP10) —
// both need the same per-case "days in this stage" computation; this is
// the one place that logic lives, so it can't drift between the two
// call sites. employeeRecords is optional and only used by the
// location-aware caller — every case's own entry still carries a
// location field either way, defaulting to "Not specified" without it.
function groupCasesByStage(cases, templates, employeeRecords) {
  const now = new Date();
  const employeeLocationMap = {};
  (employeeRecords || []).forEach(r => { employeeLocationMap[r.name] = r.location || null; });
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
    if (!byKey[key]) {
      const template = getTemplateForType(templates, processType.id);
      const targetDays = template?.target_days || DEFAULT_STAGE_TARGET_DAYS;
      byKey[key] = { processType: processType.label, stage: stageLabel, stageId: stage, targetDays, entries: [] };
    }
    const days = Math.max(0, Math.floor((now - enteredAt) / (1000 * 60 * 60 * 24)));
    byKey[key].entries.push({
      caseId: cs.id,
      employeeName: cs.employeeName,
      days,
      location: employeeLocationMap[cs.employeeName] || "Not specified",
    });
  });

  return byKey;
}

// templates (P18) is optional — every existing call site keeps working
// unmodified with the one uniform default; when an org has set a
// target_days on its template for a given process type, that value
// replaces the default for that process type's own groups only, not
// every group in the result.
//
// Organisational ER Intelligence (Phase 6, OP3) — split the average-
// duration computation out from the over-target filter that used to be
// baked into this one function, so OP3's dashboard ("avg investigation
// duration") can read every stage's real average, not just the ones
// currently breaching target. computeStageBottlenecks below is now a
// thin filter over computeStageDurations, same exact behaviour as
// before (verified by this file's own unmodified test suite).
export function computeStageDurations(cases, templates) {
  const byKey = groupCasesByStage(cases, templates);
  return Object.values(byKey).map(b => {
    const avgDays = b.entries.reduce((a, e) => a + e.days, 0) / b.entries.length;
    return {
      processType: b.processType,
      stage: b.stage,
      caseCount: b.entries.length,
      avgDays: Math.round(avgDays * 10) / 10,
      targetDays: b.targetDays,
    };
  });
}

export function computeStageBottlenecks(cases, templates) {
  return computeStageDurations(cases, templates)
    .filter(b => b.avgDays > b.targetDays)
    .sort((a, b) => b.avgDays - a.avgDays);
}

// Organisational ER Intelligence (Phase 6, OP10, §7) — extends
// computeStageBottlenecks with a per-location breakdown and the
// underlying cases, for drill-in. Only returns stages that are
// genuinely bottlenecked overall (same avgDays > targetDays filter) —
// a location breakdown of a stage that ISN'T a bottleneck isn't the
// question §7 asks. Location comes from employeeRecords (the same
// field org_insights_location_fix_2026-08-19.sql's SQL join already
// established as the real, populated signal — cases.location_id is 0%
// populated in this project's own data), matched client-side since this
// reads the already-loaded, RLS-scoped cases/employeeRecords arrays
// exactly like computeStageDurations itself always has.
export function computeStageBottlenecksByLocation(cases, employeeRecords, templates) {
  const byKey = groupCasesByStage(cases, templates, employeeRecords);

  return Object.values(byKey)
    .map(b => {
      const avgDays = b.entries.reduce((a, e) => a + e.days, 0) / b.entries.length;
      const byLocationMap = {};
      b.entries.forEach(e => {
        if (!byLocationMap[e.location]) byLocationMap[e.location] = [];
        byLocationMap[e.location].push(e);
      });
      const byLocation = Object.entries(byLocationMap)
        .map(([location, entries]) => ({
          location,
          caseCount: entries.length,
          avgDays: Math.round((entries.reduce((a, e) => a + e.days, 0) / entries.length) * 10) / 10,
          cases: entries.map(e => ({ caseId: e.caseId, employeeName: e.employeeName, days: e.days })),
        }))
        .sort((a, b) => b.avgDays - a.avgDays);
      return {
        processType: b.processType,
        stage: b.stage,
        stageId: b.stageId,
        caseCount: b.entries.length,
        avgDays: Math.round(avgDays * 10) / 10,
        targetDays: b.targetDays,
        byLocation,
      };
    })
    .filter(b => b.avgDays > b.targetDays)
    .sort((a, b) => b.avgDays - a.avgDays);
}
