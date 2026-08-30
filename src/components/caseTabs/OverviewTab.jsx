import { useState } from 'react';
import { estimateExposure } from '../../lib/tribunalEstimate';
import { WarningIcon } from '../Icons';
import { openSignalsForCase } from '../../lib/caseSignals';
import { computeCaseRisk } from '../../lib/caseRisk';
import { evaluateAutomationRules } from '../../lib/automationRules';
import { getProcessType } from '../../lib/processStages';
import { getTemplateForType } from '../../lib/processTemplates';
import { requiresApproval } from '../../lib/approvals';
import { UnansweredQuestionsPanel } from '../UnansweredQuestionsPanel';
import { InconsistenciesPanel } from '../InconsistenciesPanel';
import { GuardrailsPanel } from '../GuardrailsPanel';
import { AutomationSuggestionsPanel } from '../AutomationSuggestionsPanel';
import { CaseRolesPanel } from '../CaseRolesPanel';
import { ApprovalsPanel } from '../ApprovalsPanel';
import { HrReviewGatePanel } from '../HrReviewGatePanel';
import { AskHrPanel } from '../AskHrPanel';
import { CaseRiskPanel } from '../CaseRiskPanel';
import { ProcessChecklistPanel } from '../ProcessChecklistPanel';
import { OccupationalHealthPanel } from '../OccupationalHealthPanel';
import { COLOR, TYPE, RADIUS, SPACE } from '../../styles/tokens';

const RISK_STYLE = {
  HIGH: { color:"#C84B2F", bg:"#FEF0EB" },
  MEDIUM: { color:"#B87520", bg:"#FEF5E7" },
};
const ORDINAL = {2:"2nd",3:"3rd",4:"4th",5:"5th",6:"6th",7:"7th",8:"8th",9:"9th",10:"10th"};
const fmtGBP = n => "£"+Math.round(n).toLocaleString("en-GB");
const KEY_DATE_FIELDS = [
  { field:"fitNoteEndDate", label:"Fit note expires" },
  { field:"probationReviewDate", label:"Probation review" },
  { field:"ohReferralDate", label:"OH referral" },
  { field:"suspensionReviewDate", label:"Suspension review" },
];

// 10/10 pass, Part A — a plain heading-and-chevron disclosure, local to
// this tab only (not a new shared design-system primitive — the brief
// for this pass is explicit that the design system itself is frozen).
// Used for the Layer 3 items that are genuinely secondary reference
// material (OH process before it's started, the process-template
// checklist, case-role assignment) rather than for anything actionable —
// nothing behind a Disclosure here blocks case progress, so collapsing
// it by default never hides something the user needed to see.
function Disclosure({ title, defaultOpen=false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,paddingTop:SPACE.md,marginTop:SPACE.md}}>
      <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",padding:0,cursor:"pointer",textAlign:"left",font:"inherit",fontFamily:"inherit"}}>
        <span style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>{title}</span>
        <span aria-hidden="true" style={{fontSize:10,color:COLOR.inkFaint,transform:open?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.15s"}}>▾</span>
      </button>
      {open && <div style={{marginTop:SPACE.md}}>{children}</div>}
    </div>
  );
}

export function OverviewTab({
  cs,
  caseCtx = {},
  shell = {},
  caseData = {},
  caseActions = {},
  caseIntel = {},
  oh = {},
  review = {},
  automation = {},
}) {
  const riskItems = computeCaseRisk(cs, { allegations: caseData.allegations, caseSignals: caseData.caseSignals, cases: caseCtx.cases, auditLog: caseData.auditLog, wellbeingNotes: caseData.wellbeingNotes, dueSoon: caseData.dueSoon });
  const automationSuggestions = evaluateAutomationRules(cs, { caseTasks: caseData.caseTasks, caseSignals: caseData.caseSignals });
  const processTemplate = getTemplateForType(caseData.processTemplates, getProcessType(cs.caseType).id);
  // Phase 6.5 hardening (Batch 12) — deliberately NOT switched to
  // dateMath.daysBetween: this is a fractional-YEARS estimate (divided
  // by 365.25, itself already an approximation), not a calendar-day
  // count for display — the DST-driven error here (~1 hour out of
  // ~8766) is immaterial next to the 365.25 approximation it's already
  // built on, and this feeds estimateExposure, whose own age-banding
  // formula is flagged (task #201) as awaiting employment-law review
  // before further changes.
  const yearsService = (() => {
    if(!caseCtx.empRecord?.startDate) return null;
    const start = new Date(caseCtx.empRecord.startDate.includes("/") ? caseCtx.empRecord.startDate.split("/").reverse().join("-") : caseCtx.empRecord.startDate);
    if(isNaN(start)) return null;
    return (Date.now()-start.getTime())/(1000*60*60*24*365.25);
  })();
  const exposure = estimateExposure({ weeklyPay: cs.estimatedWeeklyPay, ageAtDismissal: cs.estimatedAgeAtDismissal, yearsService, caseType: cs.caseType });

  // 10/10 pass, Part A — Layer 2 ("Case readiness") visibility flags.
  // Each condition is the exact same predicate its own panel already
  // uses internally to decide null-vs-render (requiresApproval/
  // r.step==="inv_report"/meetings with a record/open process_risk
  // signals) — recomputed here only to decide whether this subsection
  // draws a divider before the next one, never to change what renders.
  const unansweredStillToExplore = openSignalsForCase(caseData.caseSignals, cs.id, "unanswered_question");
  const inconsistencySignals = openSignalsForCase(caseData.caseSignals, cs.id, "inconsistency");
  const guardrailSignals = openSignalsForCase(caseData.caseSignals, cs.id, "process_risk");
  const hasApprovals = (caseData.hrReviewRequests||[]).some(r=>r.case_id===cs.id && requiresApproval(r.step));
  const hasHrReviewGate = (caseData.hrReviewRequests||[]).some(r=>r.case_id===cs.id && r.step==="inv_report");
  const hasInconsistenciesPanel = (cs.meetings||[]).some(m=>m.record);
  const readinessSections = [
    { key:"approvals", visible: hasApprovals },
    { key:"hrReviewGate", visible: hasHrReviewGate },
    { key:"unanswered", visible: true },
    { key:"inconsistencies", visible: hasInconsistenciesPanel },
    { key:"guardrails", visible: guardrailSignals.length>0 },
  ].filter(s=>s.visible);

  // 10/10 pass, Part A, item 1 — Layer 1 (Case Briefing): the exact same
  // fields already shown further down (owner via the header's own
  // Reassign control, risk via Risk & tribunal exposure, key dates via
  // Key dates, attention counts via the Layer 2 sections above),
  // surfaced as one read-only summary line so the case's state is
  // legible before scrolling into the editable detail. No new
  // calculation — nearestKeyDate picks the soonest of the four already-
  // existing date fields; attentionCount sums the same arrays Layer 2
  // already computed.
  const nearestKeyDate = KEY_DATE_FIELDS
    .filter(d=>cs[d.field])
    .map(d=>({ ...d, date: new Date(cs[d.field]) }))
    .sort((a,b)=>a.date-b.date)[0];
  const pendingApprovalCount = (caseData.hrReviewRequests||[]).filter(r=>r.case_id===cs.id && requiresApproval(r.step) && r.status==="pending").length;
  const pendingHrReviewCount = (caseData.hrReviewRequests||[]).filter(r=>r.case_id===cs.id && r.step==="inv_report" && r.status==="pending").length;
  const attentionCount = unansweredStillToExplore.length + inconsistencySignals.length + guardrailSignals.length + pendingApprovalCount + pendingHrReviewCount;

  return (
    <>
      {/* ══ LAYER 1 — CASE BRIEFING ══
          10/10 pass, Part A — typography and spacing only, no card, no
          stat tiles: what this case is about, then one compact summary
          line (owner / risk / next date / attention count) so the reader
          understands the case's state before reaching any detailed tool
          below. Same underlying fields as before (cs.description,
          cs.manager, caseCtx.currentRisk, the four Key Dates fields) —
          presentation and aggregation only. */}
      <div style={{marginBottom:SPACE.xl}}>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.xs}}>Description</div>
        {cs.description ? (
          <div style={{fontSize:13,color:COLOR.ink,lineHeight:1.6}}>{cs.description}</div>
        ) : (
          <div style={{fontSize:13,color:COLOR.inkFaint}}>No description recorded.</div>
        )}
        {cs.referredBy&&<div style={{fontSize:12,color:COLOR.inkFaint,marginTop:8}}>Referred by: {cs.referredBy}</div>}
        {caseCtx.repeatCount>1&&<div style={{fontSize:12,color:COLOR.inkFaint,marginTop:8}}>{ORDINAL[caseCtx.repeatCount]||caseCtx.repeatCount+"th"} case for {cs.employeeName}.</div>}

        <div style={{display:"flex",flexWrap:"wrap",gap:"6px 16px",marginTop:14,paddingTop:14,borderTop:`1px solid ${COLOR.borderFaint}`,fontSize:12.5}}>
          <span><span style={{color:COLOR.inkFaint}}>Owner </span><span style={{color:COLOR.ink,fontWeight:600}}>{cs.manager||"Unassigned"}</span></span>
          <span style={{color:COLOR.inkQuiet}}>·</span>
          <span>
            <span style={{color:COLOR.inkFaint}}>Risk </span>
            <span style={{color:caseCtx.currentRisk&&RISK_STYLE[caseCtx.currentRisk]?RISK_STYLE[caseCtx.currentRisk].color:COLOR.ink,fontWeight:600}}>{caseCtx.currentRisk||"Not assessed"}</span>
          </span>
          {nearestKeyDate&&(<>
            <span style={{color:COLOR.inkQuiet}}>·</span>
            <span><span style={{color:COLOR.inkFaint}}>{nearestKeyDate.label} </span><span style={{color:COLOR.ink,fontWeight:600}}>{nearestKeyDate.date.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span></span>
          </>)}
          {attentionCount>0&&(<>
            <span style={{color:COLOR.inkQuiet}}>·</span>
            <span style={{color:COLOR.amber,fontWeight:600}}>{attentionCount} item{attentionCount!==1?"s":""} need{attentionCount===1?"s":""} attention</span>
          </>)}
        </div>
      </div>

      {/* ══ LAYER 2 — CASE READINESS ══
          10/10 pass, Part A, items 2 & 4 — "what do I need to deal with
          before this case can progress?" Approvals, HR Review Gate,
          Unanswered Questions, Inconsistencies, and Guardrails used to
          be five separate cards; they're now one shared surface with a
          divider between whichever of them actually have content, each
          rendered as queue rows rather than a card per item. Every
          panel's own data source, handler, and gating logic is
          untouched — Do NOT combine their underlying data models — this
          only changes which DOM element draws the border. */}
      <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:SPACE.lg,marginBottom:SPACE.xl}}>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.md}}>Case readiness</div>
        {readinessSections.map((section,i)=>{
          const last = i===readinessSections.length-1;
          const wrap = node => <div key={section.key} style={{paddingBottom:last?0:SPACE.md,marginBottom:last?0:SPACE.md,borderBottom:last?"none":`1px solid ${COLOR.borderFaint}`}}>{node}</div>;
          if(section.key==="approvals") return wrap(<ApprovalsPanel cs={cs} hrReviewRequests={caseData.hrReviewRequests} respondToReview={review.respondToReview} isApprover={review.isApprover} />);
          if(section.key==="hrReviewGate") return wrap(<HrReviewGatePanel cs={cs} hrReviewRequests={caseData.hrReviewRequests} resolveInvestigationReview={review.resolveInvestigationReview} isHR={review.isApprover} />);
          if(section.key==="unanswered") return wrap(
            <UnansweredQuestionsPanel
              cs={cs}
              covered={caseIntel.unansweredCovered?.[cs.id]||[]}
              stillToExplore={unansweredStillToExplore}
              loading={caseIntel.unansweredLoading?.[cs.id]}
              onGenerate={caseIntel.generateUnansweredQuestions}
              createCaseTask={caseActions.createCaseTask}
              changeSignalStatus={caseActions.changeSignalStatus}
              onAskWhy={caseActions.onAskWhy}
            />
          );
          if(section.key==="inconsistencies") return wrap(
            <InconsistenciesPanel
              cs={cs}
              signals={inconsistencySignals}
              loading={caseIntel.inconsistencyLoading}
              onCheck={caseIntel.generateInconsistencies}
              changeSignalStatus={caseActions.changeSignalStatus}
              createCaseTask={caseActions.createCaseTask}
              allegations={(caseData.allegations||[]).filter(a=>a.caseId===cs.id)}
              onLinkAllegation={caseActions.linkSignalToAllegation}
              onAskWhy={caseActions.onAskWhy}
            />
          );
          if(section.key==="guardrails") return wrap(
            <GuardrailsPanel
              cs={cs}
              signals={guardrailSignals}
              changeSignalStatus={caseActions.changeSignalStatus}
              onAskWhy={caseActions.onAskWhy}
              createCaseTask={caseActions.createCaseTask}
              requestOverrideReason={caseActions.requestOverrideReason}
              requestPolicyDeviationReason={caseActions.requestPolicyDeviationReason}
            />
          );
          return null;
        })}
      </div>

      {/* ══ LAYER 3 — SUPPORTING DETAIL ══
          10/10 pass, Part A, items 3 & 6 — Risk & tribunal exposure and
          Key dates are genuinely editable inputs, so they keep one
          contained surface (unchanged internals/calculations). OH
          process, Process checklist, and Case roles are reference/
          configuration material, not case-progression blockers, so they
          collapse behind a Disclosure by default — expanded automatically
          only where there's real OH progress already recorded, since
          that's no longer merely "reference." Ask HR, Automation
          Suggestions, and Case risk stay directly visible (none of them
          are long enough to justify hiding, and Automation Suggestions
          in particular must stay legible, just quiet — item 8). */}
      {caseCtx.stage!=="closed"&&(
        <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,marginBottom:SPACE.lg,overflow:"hidden"}}>
          <div style={{padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:caseCtx.currentRisk||cs.estimatedWeeklyPay?10:0}}>
              <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>Risk & tribunal exposure</div>
              {caseCtx.currentRisk&&RISK_STYLE[caseCtx.currentRisk]&&<span style={{fontSize:11,fontWeight:700,color:RISK_STYLE[caseCtx.currentRisk].color,background:RISK_STYLE[caseCtx.currentRisk].bg,borderRadius:4,padding:"3px 9px"}}>{caseCtx.currentRisk} RISK</span>}
            </div>
            <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div>
                <label htmlFor="overview-weekly-pay" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Weekly pay (£, gross)</label>
                <input id="overview-weekly-pay" type="number" min="0" value={cs.estimatedWeeklyPay||""} placeholder="For exposure estimate"
                  onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,estimatedWeeklyPay:e.target.value?Number(e.target.value):null}:x))}
                  style={{width:150,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
              </div>
              <div>
                <label htmlFor="overview-age-at-dismissal" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Age (optional)</label>
                <input id="overview-age-at-dismissal" type="number" min="16" max="80" value={cs.estimatedAgeAtDismissal||""} placeholder="Assumes 22-40"
                  onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,estimatedAgeAtDismissal:e.target.value?Number(e.target.value):null}:x))}
                  style={{width:110,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
              </div>
            </div>
            {exposure&&(
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #F5F1EA"}}>
                <div style={{fontSize:13,color:"#1A1535"}}>Indicative exposure: <strong>{fmtGBP(exposure.totalLow)} – {fmtGBP(exposure.totalHigh)}</strong>{exposure.compensatoryUncapped&&<span style={{color:"#C84B2F"}}> (compensatory award uncapped)</span>}</div>
                <div style={{fontSize:11,color:"#9B9098",marginTop:4}}>Basic award {fmtGBP(exposure.basicAward)} + compensatory range {fmtGBP(exposure.compensatoryLow)}–{fmtGBP(exposure.compensatoryHigh)}.{exposure.ageAssumed?" Assumes age 22-40 band — enter age for a more accurate estimate.":""} Indicative only — not legal advice, statutory caps change annually.</div>
                {exposure.capsStale&&<div style={{fontSize:11,color:"#C84B2F",marginTop:4,fontWeight:600,display:"flex",alignItems:"center",gap:5}}><WarningIcon size={12} color="#C84B2F" style={{flexShrink:0}}/>These statutory caps haven't been re-verified against gov.uk in over a year — they may be out of date. Check gov.uk/employment-tribunal-compensation-limits before relying on this figure.</div>}
              </div>
            )}
          </div>

          <div style={{padding:"14px 16px",borderTop:`1px solid ${COLOR.border}`}}>
            <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:10}}>Key dates</div>
            <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div>
                <label htmlFor="overview-fit-note-end-date" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Fit note expires</label>
                <input id="overview-fit-note-end-date" type="date" value={cs.fitNoteEndDate||""} onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,fitNoteEndDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
              </div>
              <div>
                <label htmlFor="overview-probation-review-date" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Probation review</label>
                <input id="overview-probation-review-date" type="date" value={cs.probationReviewDate||""} onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,probationReviewDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
              </div>
              <div>
                <label htmlFor="overview-oh-referral-date" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>OH referral date</label>
                <input id="overview-oh-referral-date" type="date" value={cs.ohReferralDate||""} onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,ohReferralDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
              </div>
              {cs.ohReferralDate&&(
                <div>
                  <label htmlFor="overview-oh-report-received-date" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>OH report received</label>
                  <input id="overview-oh-report-received-date" type="date" value={cs.ohReportReceivedDate||""} onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,ohReportReceivedDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
                </div>
              )}
              <div>
                <label htmlFor="overview-suspension-review-date" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Suspension review</label>
                <input id="overview-suspension-review-date" type="date" value={cs.suspensionReviewDate||""} onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,suspensionReviewDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10/10 pass — unlike Risk & tribunal exposure/Key dates (gated
          above on stage!=="closed", unchanged), none of OH process/
          Process checklist/Case roles were ever gated by stage in the
          original tab — OccupationalHealthPanel already decides its own
          closed-case visibility internally (renders when a process is
          genuinely in train, hides only when closed AND never started),
          ProcessChecklistPanel returns null on its own when the org has
          no template configured, and Case roles had no gate at all.
          Kept exactly that visibility; only wrapped each in a collapsed-
          by-default Disclosure now that they're reference/configuration
          material rather than blockers — OH still opens automatically
          the moment real progress exists. */}
      {(()=>{
        // Mirrors each panel's own internal null-check exactly (see
        // OccupationalHealthPanel.jsx / ProcessChecklistPanel.jsx) so a
        // Disclosure never shows a heading that expands to nothing.
        const showOh = !(caseCtx.stage === "closed" && !cs.ohProcess?.currentStep);
        const showChecklist = !!processTemplate && (
          processTemplate.required_documents?.length>0 ||
          processTemplate.suggested_meetings?.length>0 ||
          processTemplate.suggested_role_ids?.length>0 ||
          !!processTemplate.policy_category ||
          processTemplate.target_days>0
        );
        return (
          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"0 16px",marginBottom:SPACE.lg}}>
            {showOh&&(
              <Disclosure title="Occupational health process" defaultOpen={Object.keys(cs.ohProcess?.history||{}).length>0}>
                <OccupationalHealthPanel cs={cs} cases={caseCtx.cases} saveCases={caseCtx.saveCases} stage={caseCtx.stage} ohReportFindings={oh.ohReportFindings} ohReportAnalysisLoading={oh.ohReportAnalysisLoading} onAnalyseOhReport={oh.onAnalyseOhReport} onAcceptOhFinding={oh.onAcceptOhFinding} onDismissOhFinding={oh.onDismissOhFinding} onSendForSignature={oh.onSendForSignature} />
              </Disclosure>
            )}
            {showChecklist&&(
              <Disclosure title="Process checklist" defaultOpen={false}>
                <ProcessChecklistPanel template={processTemplate} />
              </Disclosure>
            )}
            <div style={{paddingBottom:16}}>
              <Disclosure title="Case roles" defaultOpen={false}>
                <CaseRolesPanel cs={cs} caseAccess={caseData.caseAccess} orgMembers={caseData.orgMembers} assignCaseRole={review.assignCaseRole} />
              </Disclosure>
            </div>
          </div>
        );
      })()}

      <AskHrPanel cs={cs} hrReviewRequests={caseData.hrReviewRequests} respondToReview={review.respondToReview} isHR={review.isApprover} />

      <AutomationSuggestionsPanel suggestions={automationSuggestions} automationLevels={automation.automationLevels} cs={cs} onResendReminder={automation.onResendReminder} />

      <div style={{marginTop:automationSuggestions?.length?SPACE.lg:0}}>
        <CaseRiskPanel riskItems={riskItems} onAskWhy={caseActions.onAskWhy} />
      </div>

      <div style={{textAlign:"right",marginTop:SPACE.lg}}>
        <button onClick={async()=>{
          const ok = await shell.confirmDialog({title:"Delete case", message:"This will permanently delete this case and all its meeting records. This cannot be undone.", confirmLabel:"Delete", danger:true});
          if(!ok) return;
          caseCtx.saveCases(caseCtx.cases.filter(x=>x.id!==cs.id));
          shell.setScreen(shell.screens.CASES);
        }} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Delete case</button>
      </div>
    </>
  );
}
