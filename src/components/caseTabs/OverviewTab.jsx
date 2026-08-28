import { estimateExposure } from '../../lib/tribunalEstimate';
import { WarningIcon } from '../Icons';
import { openSignalsForCase } from '../../lib/caseSignals';
import { computeCaseRisk } from '../../lib/caseRisk';
import { evaluateAutomationRules } from '../../lib/automationRules';
import { getProcessType } from '../../lib/processStages';
import { getTemplateForType } from '../../lib/processTemplates';
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

  return (
    <>
      {/* Phase 2A (Compass Design Vision) — Description no longer gets a
          bordered card: it was the clearest example of "a container that
          doesn't earn its border" found during the design review — an
          empty case got the exact same boxed treatment as a full one, for
          a single line of text either way. Typography (a section label +
          text) carries this now; same data (cs.description), same empty-
          state copy, same referredBy/repeatCount lines — presentation
          only, still positioned first per Phase 7.5B's own reasoning
          (what happened before secondary financial/process inputs). */}
      <div style={{marginBottom:SPACE.xl}}>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.xs}}>Description</div>
        {cs.description ? (
          <div style={{fontSize:13,color:COLOR.ink,lineHeight:1.6}}>{cs.description}</div>
        ) : (
          <div style={{fontSize:13,color:COLOR.inkFaint}}>No description recorded.</div>
        )}
        {cs.referredBy&&<div style={{fontSize:12,color:COLOR.inkFaint,marginTop:8}}>Referred by: {cs.referredBy}</div>}
        {caseCtx.repeatCount>1&&<div style={{fontSize:12,color:COLOR.inkFaint,marginTop:8}}>{ORDINAL[caseCtx.repeatCount]||caseCtx.repeatCount+"th"} case for {cs.employeeName}.</div>}
      </div>

      {/* Phase 2A — Risk & Tribunal Exposure and Key Dates consolidate
          into one surface with an internal divider instead of two
          separate bordered cards: both are always shown/hidden together
          (same caseCtx.stage!=="closed" gate) and both are genuinely
          input-heavy sections that still earn a contained surface — this
          isn't a demotion like Description above, just one container
          instead of two adjacent, near-identical ones. Every field, every
          calculation (estimateExposure), every input id/label/onChange is
          completely unchanged. */}
      {caseCtx.stage!=="closed"&&(
        <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,marginBottom:SPACE.xl,overflow:"hidden"}}>
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

      <OccupationalHealthPanel cs={cs} cases={caseCtx.cases} saveCases={caseCtx.saveCases} stage={caseCtx.stage} ohReportFindings={oh.ohReportFindings} ohReportAnalysisLoading={oh.ohReportAnalysisLoading} onAnalyseOhReport={oh.onAnalyseOhReport} onAcceptOhFinding={oh.onAcceptOhFinding} onDismissOhFinding={oh.onDismissOhFinding} onSendForSignature={oh.onSendForSignature} />

      <ProcessChecklistPanel template={processTemplate} />

      <ApprovalsPanel cs={cs} hrReviewRequests={caseData.hrReviewRequests} respondToReview={review.respondToReview} isApprover={review.isApprover} />

      <HrReviewGatePanel cs={cs} hrReviewRequests={caseData.hrReviewRequests} resolveInvestigationReview={review.resolveInvestigationReview} isHR={review.isApprover} />

      <AskHrPanel cs={cs} hrReviewRequests={caseData.hrReviewRequests} respondToReview={review.respondToReview} isHR={review.isApprover} />

      <CaseRolesPanel cs={cs} caseAccess={caseData.caseAccess} orgMembers={caseData.orgMembers} assignCaseRole={review.assignCaseRole} />

      <div style={{marginBottom:16}}>
        <UnansweredQuestionsPanel
          cs={cs}
          covered={caseIntel.unansweredCovered?.[cs.id]||[]}
          stillToExplore={openSignalsForCase(caseData.caseSignals, cs.id, "unanswered_question")}
          loading={caseIntel.unansweredLoading?.[cs.id]}
          onGenerate={caseIntel.generateUnansweredQuestions}
          createCaseTask={caseActions.createCaseTask}
          changeSignalStatus={caseActions.changeSignalStatus}
          onAskWhy={caseActions.onAskWhy}
        />
      </div>

      <InconsistenciesPanel
        cs={cs}
        signals={openSignalsForCase(caseData.caseSignals, cs.id, "inconsistency")}
        loading={caseIntel.inconsistencyLoading}
        onCheck={caseIntel.generateInconsistencies}
        changeSignalStatus={caseActions.changeSignalStatus}
        createCaseTask={caseActions.createCaseTask}
        allegations={(caseData.allegations||[]).filter(a=>a.caseId===cs.id)}
        onLinkAllegation={caseActions.linkSignalToAllegation}
        onAskWhy={caseActions.onAskWhy}
      />

      <GuardrailsPanel
        cs={cs}
        signals={openSignalsForCase(caseData.caseSignals, cs.id, "process_risk")}
        changeSignalStatus={caseActions.changeSignalStatus}
        onAskWhy={caseActions.onAskWhy}
        createCaseTask={caseActions.createCaseTask}
        requestOverrideReason={caseActions.requestOverrideReason}
        requestPolicyDeviationReason={caseActions.requestPolicyDeviationReason}
      />

      <AutomationSuggestionsPanel suggestions={automationSuggestions} automationLevels={automation.automationLevels} cs={cs} onResendReminder={automation.onResendReminder} />

      <CaseRiskPanel riskItems={riskItems} onAskWhy={caseActions.onAskWhy} />

      <div style={{textAlign:"right"}}>
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
