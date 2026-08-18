import { useState } from 'react';
import { Btn } from './Primitives';
import { OH_PROCESS_STEPS, ohStepIndex, ohStepStatus, applyOhStepTransition } from '../lib/ohProcess';

const STATUS_DOT = { done: "#1A7A4A", current: "#5B3FD4", upcoming: "#D8D2E8" };
const fmtShort = iso => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

// Integrations & Workflow Automation (Phase 5, IP22, §18) — a genuine
// step-by-step tracker for the OH referral-to-review process, alongside
// (not replacing) the flat "OH referral date"/"OH report received"
// inputs in the Key Dates panel above — submit/received here still
// mirror into those same fields (see ohProcess.js's
// applyOhStepTransition) so deadlines.js's existing chase logic keeps
// working unchanged. Compass tracks the process only, never a medical
// judgement — "Recommendations" is HR's own record of what the OH
// report said, not Compass's interpretation of one.
export function OccupationalHealthPanel({ cs, cases, saveCases, stage }) {
  const ohProcess = cs.ohProcess;
  const [recommendationsDraft, setRecommendationsDraft] = useState(ohProcess?.recommendations || "");
  const [reviewDateDraft, setReviewDateDraft] = useState(ohProcess?.reviewDate || "");
  const [consentChecked, setConsentChecked] = useState(false);

  // Resyncing local drafts when the case itself changes (not on every
  // ohProcess update, which would stomp what HR is mid-typing) — React's
  // own "adjust state during render" pattern rather than an effect, the
  // same shape CommandBarModal.jsx already uses for excludedIndices/
  // lastPlan, since both setters here are local state, not a parent's.
  const [lastCaseId, setLastCaseId] = useState(cs.id);
  if (cs.id !== lastCaseId) {
    setLastCaseId(cs.id);
    setRecommendationsDraft(ohProcess?.recommendations || "");
    setReviewDateDraft(ohProcess?.reviewDate || "");
    setConsentChecked(false);
  }

  if (stage === "closed" && !ohProcess?.currentStep) return null;

  const advance = (stepId, extra) => {
    const updated = applyOhStepTransition(cs, stepId, extra);
    saveCases(cases.map(x => x.id === cs.id ? updated : x), cs.id);
  };

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px",marginBottom:16}}>
      <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Occupational health process</div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {OH_PROCESS_STEPS.map((step, i) => {
          const status = ohStepStatus(ohProcess, step.id);
          const doneAt = ohProcess?.history?.[step.id];
          const isLast = i === OH_PROCESS_STEPS.length - 1;
          return (
            <div key={step.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:isLast?"none":"1px solid #F5F1EA"}}>
              <span style={{width:9,height:9,borderRadius:"50%",background:STATUS_DOT[status],marginTop:5,flexShrink:0}} />
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <span style={{fontSize:13,fontWeight:status==="current"?600:400,color:status==="upcoming"?"#9B9098":"#1A1535"}}>{step.label}</span>
                  {doneAt&&<span style={{fontSize:11,color:"#9B9098"}}>{fmtShort(doneAt)}</span>}
                </div>

                {/* Each block below fires from the step BEFORE its
                    named milestone — currentStep==="consider_referral"
                    is what advances to the "consent" milestone,
                    currentStep==="hr_review" is what advances to the
                    "recommendations" milestone — same shape as the
                    generic "Mark done" button below, just with an extra
                    field captured on the way. */}
                {status==="current"&&step.id==="consider_referral"&&(
                  <div style={{marginTop:8}}>
                    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#1A1535",cursor:"pointer"}}>
                      <input type="checkbox" checked={consentChecked} onChange={e=>setConsentChecked(e.target.checked)} />
                      Employee has given consent for the referral
                    </label>
                    <Btn onClick={()=>advance("consent", { consentObtained: true })} disabled={!consentChecked} style={{marginTop:6}}>Confirm consent</Btn>
                  </div>
                )}

                {status==="current"&&step.id==="hr_review"&&(
                  <div style={{marginTop:8}}>
                    <textarea value={recommendationsDraft} onChange={e=>setRecommendationsDraft(e.target.value)} rows={3} placeholder="What did the OH report recommend?"
                      style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif",boxSizing:"border-box",resize:"vertical"}} />
                    <Btn onClick={()=>advance("recommendations", { recommendations: recommendationsDraft })} disabled={!recommendationsDraft.trim()} style={{marginTop:6}}>Save recommendations</Btn>
                  </div>
                )}

                {step.id==="review_date"&&status==="current"&&(
                  <div style={{display:"flex",gap:8,alignItems:"flex-end",marginTop:8}}>
                    <div>
                      <label style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Review date</label>
                      <input type="date" value={reviewDateDraft} onChange={e=>setReviewDateDraft(e.target.value)}
                        style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}} />
                    </div>
                    <Btn onClick={()=>advance("review_date", { reviewDate: reviewDateDraft })} disabled={!reviewDateDraft}>{ohProcess?.reviewDate?"Update review date":"Confirm review date"}</Btn>
                  </div>
                )}

                {status==="current"&&!["consider_referral","hr_review","review_date"].includes(step.id)&&(
                  <Btn variant="secondary" onClick={()=>advance(OH_PROCESS_STEPS[ohStepIndex(step.id)+1].id)} style={{marginTop:8}}>Mark done</Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
