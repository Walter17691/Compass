import { estimateExposure } from '../../lib/tribunalEstimate';
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

const RISK_STYLE = {
  HIGH: { color:"#C84B2F", bg:"#FEF0EB" },
  MEDIUM: { color:"#B87520", bg:"#FEF5E7" },
};
const ORDINAL = {2:"2nd",3:"3rd",4:"4th",5:"5th",6:"6th",7:"7th",8:"8th",9:"9th",10:"10th"};
const fmtGBP = n => "£"+Math.round(n).toLocaleString("en-GB");

export function OverviewTab({ cs, cases, saveCases, stage, currentRisk, empRecord, repeatCount, confirmDialog, setScreen, screens, caseSignals, caseTasks, unansweredCovered, unansweredLoading, generateUnansweredQuestions, createCaseTask, changeSignalStatus, onAskWhy, allegations, generateInconsistencies, inconsistencyLoading, linkSignalToAllegation, requestOverrideReason, requestPolicyDeviationReason, caseAccess, orgMembers, assignCaseRole, hrReviewRequests, respondToReview, resolveInvestigationReview, isApprover, auditLog, wellbeingNotes, dueSoon, processTemplates }) {
  const riskItems = computeCaseRisk(cs, { allegations, caseSignals, cases, auditLog, wellbeingNotes, dueSoon });
  const automationSuggestions = evaluateAutomationRules(cs, { caseTasks, caseSignals });
  const processTemplate = getTemplateForType(processTemplates, getProcessType(cs.caseType).id);
  const yearsService = (() => {
    if(!empRecord?.startDate) return null;
    const start = new Date(empRecord.startDate.includes("/") ? empRecord.startDate.split("/").reverse().join("-") : empRecord.startDate);
    if(isNaN(start)) return null;
    return (Date.now()-start.getTime())/(1000*60*60*24*365.25);
  })();
  const exposure = estimateExposure({ weeklyPay: cs.estimatedWeeklyPay, ageAtDismissal: cs.estimatedAgeAtDismissal, yearsService, caseType: cs.caseType });

  return (
    <>
      {stage!=="closed"&&(
        <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,marginBottom:16,padding:"14px 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:currentRisk||cs.estimatedWeeklyPay?10:0}}>
            <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase"}}>Risk & tribunal exposure</div>
            {currentRisk&&RISK_STYLE[currentRisk]&&<span style={{fontSize:11,fontWeight:700,color:RISK_STYLE[currentRisk].color,background:RISK_STYLE[currentRisk].bg,borderRadius:4,padding:"3px 9px"}}>{currentRisk} RISK</span>}
          </div>
          <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
            <div>
              <label style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Weekly pay (£, gross)</label>
              <input type="number" min="0" value={cs.estimatedWeeklyPay||""} placeholder="For exposure estimate"
                onChange={e=>saveCases(cases.map(x=>x.id===cs.id?{...x,estimatedWeeklyPay:e.target.value?Number(e.target.value):null}:x))}
                style={{width:150,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
            </div>
            <div>
              <label style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Age (optional)</label>
              <input type="number" min="16" max="80" value={cs.estimatedAgeAtDismissal||""} placeholder="Assumes 22-40"
                onChange={e=>saveCases(cases.map(x=>x.id===cs.id?{...x,estimatedAgeAtDismissal:e.target.value?Number(e.target.value):null}:x))}
                style={{width:110,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
            </div>
          </div>
          {exposure&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #F5F1EA"}}>
              <div style={{fontSize:13,color:"#1A1535"}}>Indicative exposure: <strong>{fmtGBP(exposure.totalLow)} – {fmtGBP(exposure.totalHigh)}</strong>{exposure.compensatoryUncapped&&<span style={{color:"#C84B2F"}}> (compensatory award uncapped)</span>}</div>
              <div style={{fontSize:11,color:"#9B9098",marginTop:4}}>Basic award {fmtGBP(exposure.basicAward)} + compensatory range {fmtGBP(exposure.compensatoryLow)}–{fmtGBP(exposure.compensatoryHigh)}.{exposure.ageAssumed?" Assumes age 22-40 band — enter age for a more accurate estimate.":""} Indicative only — not legal advice, statutory caps change annually.</div>
            </div>
          )}
        </div>
      )}

      {stage!=="closed"&&(
        <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,marginBottom:16,padding:"14px 16px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>Key dates</div>
          <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
            <div>
              <label style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Fit note expires</label>
              <input type="date" value={cs.fitNoteEndDate||""} onChange={e=>saveCases(cases.map(x=>x.id===cs.id?{...x,fitNoteEndDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
            </div>
            <div>
              <label style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Probation review</label>
              <input type="date" value={cs.probationReviewDate||""} onChange={e=>saveCases(cases.map(x=>x.id===cs.id?{...x,probationReviewDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
            </div>
            <div>
              <label style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>OH referral date</label>
              <input type="date" value={cs.ohReferralDate||""} onChange={e=>saveCases(cases.map(x=>x.id===cs.id?{...x,ohReferralDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
            </div>
            {cs.ohReferralDate&&(
              <div>
                <label style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>OH report received</label>
                <input type="date" value={cs.ohReportReceivedDate||""} onChange={e=>saveCases(cases.map(x=>x.id===cs.id?{...x,ohReportReceivedDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
              </div>
            )}
            <div>
              <label style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Suspension review</label>
              <input type="date" value={cs.suspensionReviewDate||""} onChange={e=>saveCases(cases.map(x=>x.id===cs.id?{...x,suspensionReviewDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
            </div>
          </div>
        </div>
      )}

      <ProcessChecklistPanel template={processTemplate} />

      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px",marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Description</div>
        {cs.description ? (
          <div style={{fontSize:13,color:"#1A1535",lineHeight:1.6}}>{cs.description}</div>
        ) : (
          <div style={{fontSize:13,color:"#9B9098"}}>No description recorded.</div>
        )}
        {cs.referredBy&&<div style={{fontSize:12,color:"#9B9098",marginTop:8}}>Referred by: {cs.referredBy}</div>}
        {repeatCount>1&&<div style={{fontSize:12,color:"#9B9098",marginTop:8}}>{ORDINAL[repeatCount]||repeatCount+"th"} case for {cs.employeeName}.</div>}
      </div>

      <ApprovalsPanel cs={cs} hrReviewRequests={hrReviewRequests} respondToReview={respondToReview} isApprover={isApprover} />

      <HrReviewGatePanel cs={cs} hrReviewRequests={hrReviewRequests} resolveInvestigationReview={resolveInvestigationReview} isHR={isApprover} />

      <AskHrPanel cs={cs} hrReviewRequests={hrReviewRequests} respondToReview={respondToReview} isHR={isApprover} />

      <CaseRolesPanel cs={cs} caseAccess={caseAccess} orgMembers={orgMembers} assignCaseRole={assignCaseRole} />

      <div style={{marginBottom:16}}>
        <UnansweredQuestionsPanel
          cs={cs}
          covered={unansweredCovered?.[cs.id]||[]}
          stillToExplore={openSignalsForCase(caseSignals, cs.id, "unanswered_question")}
          loading={unansweredLoading?.[cs.id]}
          onGenerate={generateUnansweredQuestions}
          createCaseTask={createCaseTask}
          changeSignalStatus={changeSignalStatus}
          onAskWhy={onAskWhy}
        />
      </div>

      <InconsistenciesPanel
        cs={cs}
        signals={openSignalsForCase(caseSignals, cs.id, "inconsistency")}
        loading={inconsistencyLoading}
        onCheck={generateInconsistencies}
        changeSignalStatus={changeSignalStatus}
        createCaseTask={createCaseTask}
        allegations={(allegations||[]).filter(a=>a.caseId===cs.id)}
        onLinkAllegation={linkSignalToAllegation}
        onAskWhy={onAskWhy}
      />

      <GuardrailsPanel
        cs={cs}
        signals={openSignalsForCase(caseSignals, cs.id, "process_risk")}
        changeSignalStatus={changeSignalStatus}
        onAskWhy={onAskWhy}
        createCaseTask={createCaseTask}
        requestOverrideReason={requestOverrideReason}
        requestPolicyDeviationReason={requestPolicyDeviationReason}
      />

      <AutomationSuggestionsPanel suggestions={automationSuggestions} />

      <CaseRiskPanel riskItems={riskItems} onAskWhy={onAskWhy} />

      <div style={{textAlign:"right"}}>
        <button onClick={async()=>{
          const ok = await confirmDialog({title:"Delete case", message:"This will permanently delete this case and all its meeting records. This cannot be undone.", confirmLabel:"Delete", danger:true});
          if(!ok) return;
          saveCases(cases.filter(x=>x.id!==cs.id));
          setScreen(screens.CASES);
        }} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Delete case</button>
      </div>
    </>
  );
}
