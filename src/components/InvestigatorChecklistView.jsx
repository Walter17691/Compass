import { INVESTIGATION_CHECKLIST_STEPS } from '../lib/investigationChecklist';
import { computeInvestigatorRecommendation } from '../lib/investigatorRecommendation';
import { InvestigatorFindingsPanel } from './InvestigatorFindingsPanel';
import { COLOR, TYPE, FONT, RADIUS } from '../styles/tokens';

// Phase 15 of the reasoning-layer build-out (Manager Investigation Mode).
// A restricted, checklist-driven workspace over the SAME underlying case
// data (allegations, evidence, unanswered-question signals) — not a new
// source of truth, not a parallel screen with its own state. Rendered
// instead of CaseViewScreen's normal tabbed workspace when the current,
// non-HR user has been granted case_access with role "investigator" on
// this specific case (see App.jsx's assignInvestigator).
//
// Manager Enablement (Phase 4, MP9, §8/§21) — this component's own prop
// contract IS the within-case minimization boundary: it is never handed
// wellbeingNotes, other cases for the same employee, or anything beyond
// this one case's allegations/evidence/signals/tasks, regardless of what
// CaseViewScreen's own broader fetch contains. Keep it that way when
// adding props here — don't widen this beyond what an investigator
// should see.
//
// ── IR-REPORT-01a — THE INVESTIGATOR CAN NOW RECORD THEIR OWN WORK ────────
//
// Step 6, "Complete the investigation", was an empty card. The investigator
// was told to complete an investigation and then submit findings, with no
// field anywhere in their view for a finding, an uncertainty or a conclusion
// — those live on AllegationsPanel, which sits behind the early return in
// CaseViewScreen that renders THIS component instead. So the step is now the
// workspace it always claimed to be (InvestigatorFindingsPanel), writing the
// same columns HR's panel writes. Nothing else about the checklist moves.
//
// The styling also moves off this file's own hardcoded cream/beige palette and
// DM Sans onto the canonical design tokens — Archivo, navy, white, restrained
// violet, no blue. This component predated src/styles/tokens.js, and adding a
// token-compliant findings panel to a cream DM Sans screen would have produced
// a workspace that is compliant only in its newest third. Values only; no
// layout, structure, copy or behaviour changed by that swap.
function StepCard({ index, step, task, onToggle, children }) {
  const done = task?.status === "done";
  return (
    <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.border}`,
                  borderRadius: RADIUS.card, padding: "18px 20px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <button onClick={() => task && onToggle(task.id)} aria-label={done ? "Mark not done" : "Mark done"}
          style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", border: "2px solid",
                   borderColor: done ? COLOR.green : COLOR.border, background: done ? COLOR.green : COLOR.surface,
                   cursor: task ? "pointer" : "default", marginTop: 1, display: "flex", alignItems: "center",
                   justifyContent: "center", color: COLOR.surface, fontSize: 12 }}>{done ? "✓" : ""}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...TYPE.micro, color: COLOR.inkQuiet, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 2 }}>
            Step {index + 1} of {INVESTIGATION_CHECKLIST_STEPS.length}
          </div>
          {/* displayLabel is wording only; `label` stays the persisted task key. */}
          <div style={{ ...TYPE.rowName, color: done ? COLOR.inkSoft : COLOR.ink,
                        textDecoration: done ? "line-through" : "none" }}>
            {step.displayLabel || step.label}
          </div>
          {children && <div style={{ marginTop: 10 }}>{children}</div>}
        </div>
      </div>
    </div>
  );
}

export function InvestigatorChecklistView({ cs, caseAllegations, checklistTasks, toggleCaseTaskDone, openQuestions, onStartWitnessInterview, onStartEmployeeInterview, setScreen, screens, scopeAllegationIds, targetCompletionDate, scopeNote, fmtDate, planTasks = [], onGeneratePlan, planLoading, caseSignals = [], onSubmitInvestigation, submittingInvestigation, onEscalate, guidanceTasks = [],
  // IR-REPORT-01a. Callbacks, not stores: this view still never receives the
  // cases array, and conclusionAuthors carries only the org members actually
  // named by a conclusion on this case — not the org directory.
  canRecordNarrative = false, canRecordConclusion = false,
  onPatchIssue, onRecordConclusion, onSetEvidenceStance, onCreateIssue,
  conclusionAuthors = [] }) {
  const evidence = cs.evidence || [];
  const stepFor = (label) => checklistTasks.find(t => t.name === label);
  const doneCount = checklistTasks.filter(t => t.status === "done").length;
  const recommendation = computeInvestigatorRecommendation(cs, checklistTasks, planTasks, caseSignals);
  // Manager Enablement (Phase 4, MP7, §7) — scopeAllegationIds is null for
  // investigators assigned before this phase (or via a scope-less caller),
  // which keeps their old "sees every allegation" behaviour; a non-null
  // array (even an empty one, if HR deliberately unchecked everything)
  // narrows this step's list to just what was actually assigned.
  const scopedAllegations = scopeAllegationIds ? caseAllegations.filter(a => scopeAllegationIds.includes(a.id)) : caseAllegations;

  const secondaryButton = {
    ...TYPE.button, background: COLOR.surface, border: `1px solid ${COLOR.border}`,
    borderRadius: RADIUS.button, padding: "6px 12px", color: COLOR.inkSoft,
    cursor: "pointer", fontFamily: FONT.sans,
  };

  return (
    <div style={{ minHeight: "100vh", background: COLOR.rail, fontFamily: FONT.sans }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={() => setScreen(screens.CASES)}
            style={{ background: "none", border: "none", color: COLOR.inkSoft, ...TYPE.rowContext,
                     cursor: "pointer", fontFamily: FONT.sans, padding: 0 }}>← Cases</button>
          {/* Manager Enablement (Phase 4, MP12, §13) — same persistent
              "Ask HR" affordance as CaseViewScreen's own header, available
              here too since the investigator's restricted view never
              reaches that header. */}
          {onEscalate && (
            <button onClick={onEscalate} style={{ ...secondaryButton, background: "none" }}>Ask HR</button>
          )}
        </div>
        <div style={{ ...TYPE.micro, color: COLOR.inkQuiet }}>{cs.employeeName}</div>
        <h2 style={{ ...TYPE.pageTitle, fontSize: 24, color: COLOR.ink, margin: "2px 0 6px" }}>Investigation checklist</h2>
        <p style={{ ...TYPE.rowContext, color: COLOR.inkSoft, margin: "0 0 8px" }}>
          You&apos;ve been assigned to investigate this case. Work through each step below — HR can see your progress at any point.
        </p>
        <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: targetCompletionDate || scopeNote ? "0 0 8px" : "0 0 24px" }}>
          {doneCount} of {INVESTIGATION_CHECKLIST_STEPS.length} steps complete{targetCompletionDate && <> · Due {fmtDate(targetCompletionDate)}</>}
        </p>
        {scopeNote && (
          <div style={{ ...TYPE.metadata, color: COLOR.purple, background: COLOR.purpleTint,
                        border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.surface,
                        padding: "8px 12px", marginBottom: 12 }}>{scopeNote}</div>
        )}

        {/* Manager Enablement (Phase 4, MP9, §8) — the one deterministic
            "what next" line, combining an unresolved guardrail, MP8's own
            plan, and the fixed checklist in that priority order
            (computeInvestigatorRecommendation). Never free-form AI text. */}
        {recommendation && (
          <div style={{ background: recommendation.kind === "guardrail" ? COLOR.redTint : COLOR.purpleTint,
                        border: `1px solid ${recommendation.kind === "guardrail" ? COLOR.redTint : COLOR.border}`,
                        borderRadius: RADIUS.surface, padding: "12px 14px",
                        marginBottom: guidanceTasks.length ? 12 : 24 }}>
            <div style={{ ...TYPE.micro, color: recommendation.kind === "guardrail" ? COLOR.red : COLOR.purple,
                          textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>Compass recommends next</div>
            <div style={{ ...TYPE.rowContext, color: COLOR.ink }}>{recommendation.text}</div>
          </div>
        )}

        {/* Manager Enablement (Phase 4, MP19, §15) — guidance, questions
            and witness requests HR has sent on this case (App.jsx's
            sendHrGuidance) — read-only notes, distinct from the fixed
            checklist and MP8's own generated plan below. */}
        {guidanceTasks.length > 0 && (
          <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.border}`,
                        borderRadius: RADIUS.surface, padding: "12px 14px", marginBottom: 24 }}>
            <div style={{ ...TYPE.micro, color: COLOR.purple, textTransform: "uppercase",
                          letterSpacing: "0.4px", marginBottom: 8 }}>Guidance from HR</div>
            {guidanceTasks.map(t => (
              <div key={t.id} style={{ ...TYPE.rowContext, color: COLOR.ink, padding: "6px 0",
                                       borderBottom: `1px solid ${COLOR.borderFaint}` }}>{t.name}</div>
            ))}
          </div>
        )}

        <StepCard index={0} step={INVESTIGATION_CHECKLIST_STEPS[0]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[0].label)} onToggle={toggleCaseTaskDone}>
          {scopedAllegations.length === 0 && (
            <div style={{ ...TYPE.rowContext, color: COLOR.inkQuiet }}>
              No issues under investigation have been recorded on this case yet.
            </div>
          )}
          {scopedAllegations.map(a => (
            <div key={a.id} style={{ padding: "8px 0", borderBottom: `1px solid ${COLOR.borderFaint}` }}>
              <div style={{ ...TYPE.rowContext, fontWeight: 600, color: COLOR.ink }}>{a.title}</div>
              {a.description && <div style={{ ...TYPE.metadata, color: COLOR.inkSoft, marginTop: 2 }}>{a.description}</div>}
            </div>
          ))}
        </StepCard>

        <StepCard index={1} step={INVESTIGATION_CHECKLIST_STEPS[1]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[1].label)} onToggle={toggleCaseTaskDone}>
          {evidence.length === 0 && <div style={{ ...TYPE.rowContext, color: COLOR.inkQuiet }}>No evidence uploaded to this case yet.</div>}
          {evidence.map((e, i) => (
            <div key={i} style={{ ...TYPE.rowContext, color: COLOR.ink, padding: "6px 0",
                                  borderBottom: `1px solid ${COLOR.borderFaint}` }}>{e.name}</div>
          ))}
        </StepCard>

        <StepCard index={2} step={INVESTIGATION_CHECKLIST_STEPS[2]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[2].label)} onToggle={toggleCaseTaskDone}>
          <button onClick={onStartWitnessInterview} style={secondaryButton}>Start a witness interview</button>
        </StepCard>

        <StepCard index={3} step={INVESTIGATION_CHECKLIST_STEPS[3]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[3].label)} onToggle={toggleCaseTaskDone}>
          <button onClick={onStartEmployeeInterview} style={secondaryButton}>Start the investigation meeting</button>
        </StepCard>

        <StepCard index={4} step={INVESTIGATION_CHECKLIST_STEPS[4]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[4].label)} onToggle={toggleCaseTaskDone}>
          {openQuestions.length === 0 && <div style={{ ...TYPE.rowContext, color: COLOR.inkQuiet }}>No outstanding questions flagged on this case.</div>}
          {openQuestions.map(q => (
            <div key={q.id} style={{ ...TYPE.rowContext, color: COLOR.ink, padding: "6px 0",
                                     borderBottom: `1px solid ${COLOR.borderFaint}` }}>{q.title}</div>
          ))}
        </StepCard>

        {/* IR-REPORT-01a — the investigator's own findings, on the step that
            already told them to complete the investigation. Same columns as
            AllegationsPanel; the conclusion control is the existing shared
            component, so HR and the investigator cannot drift apart. */}
        <StepCard index={5} step={INVESTIGATION_CHECKLIST_STEPS[5]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[5].label)} onToggle={toggleCaseTaskDone}>
          <InvestigatorFindingsPanel
            issues={scopedAllegations}
            evidence={evidence}
            canRecordNarrative={canRecordNarrative}
            canRecordConclusion={canRecordConclusion}
            onPatchIssue={onPatchIssue}
            onRecordConclusion={onRecordConclusion}
            onSetEvidenceStance={onSetEvidenceStance}
            onCreateIssue={onCreateIssue}
            conclusionAuthors={conclusionAuthors}
            fmtDate={fmtDate}
          />
        </StepCard>

        {/* Manager Enablement (Phase 4, MP10, §16) — this used to be an
            inert checkbox; onSubmitInvestigation runs the same
            attemptSubmitInvestigation gate (App.jsx) HR's own two
            trigger points use, so a not-yet-thorough investigation gets
            the same Investigation Quality Check either side. */}
        <StepCard index={6} step={INVESTIGATION_CHECKLIST_STEPS[6]} task={stepFor(INVESTIGATION_CHECKLIST_STEPS[6].label)} onToggle={toggleCaseTaskDone}>
          {stepFor(INVESTIGATION_CHECKLIST_STEPS[6].label)?.status === "done"
            ? <div style={{ ...TYPE.metadata, color: COLOR.green }}>Submitted to HR.</div>
            : onSubmitInvestigation && <button onClick={() => onSubmitInvestigation(cs.id)} disabled={submittingInvestigation}
                style={{ ...secondaryButton, cursor: submittingInvestigation ? "default" : "pointer",
                         opacity: submittingInvestigation ? 0.6 : 1 }}>
                {submittingInvestigation ? "Submitting…" : "Submit investigation"}
              </button>}
        </StepCard>

        {/* Manager Enablement (Phase 4, MP8, §9) — distinct from the fixed
            steps above: Compass's own case-specific plan, grounded in this
            case's actual allegations/evidence rather than a generic list.
            Deliberately separate, not folded into a StepCard, since it
            isn't a fixed step — it's a variable-length, generated set. */}
        <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.border}`,
                      borderRadius: RADIUS.card, padding: "18px 20px", marginTop: 8 }}>
          <div style={{ ...TYPE.micro, color: COLOR.inkQuiet, letterSpacing: "0.5px",
                        textTransform: "uppercase", marginBottom: 2 }}>Investigation plan</div>
          <div style={{ ...TYPE.metadata, color: COLOR.inkSoft, marginBottom: planTasks.length ? 14 : 10 }}>
            Compass-suggested, based on what&apos;s already on this case.
          </div>
          {planTasks.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0",
                                     borderBottom: `1px solid ${COLOR.borderFaint}` }}>
              <button onClick={() => toggleCaseTaskDone(t.id)} aria-label={t.status === "done" ? "Mark not done" : "Mark done"}
                style={{ flexShrink: 0, width: 18, height: 18, borderRadius: "50%", border: "2px solid",
                         borderColor: t.status === "done" ? COLOR.green : COLOR.border,
                         background: t.status === "done" ? COLOR.green : COLOR.surface, cursor: "pointer",
                         marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center",
                         color: COLOR.surface, fontSize: 10 }}>{t.status === "done" ? "✓" : ""}</button>
              <div style={{ ...TYPE.rowContext, color: t.status === "done" ? COLOR.inkSoft : COLOR.ink,
                            textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.name}</div>
            </div>
          ))}
          {onGeneratePlan && (
            <button onClick={onGeneratePlan} disabled={planLoading}
              style={{ ...secondaryButton, marginTop: planTasks.length ? 14 : 0,
                       cursor: planLoading ? "default" : "pointer", opacity: planLoading ? 0.6 : 1 }}>
              {planLoading ? "Compass is drafting a plan…" : planTasks.length ? "Regenerate plan" : "Generate investigation plan"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
