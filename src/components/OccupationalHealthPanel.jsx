import { useState } from 'react';
import { Btn } from './Primitives';
import { OH_PROCESS_STEPS, ohStepIndex, ohStepStatus, applyOhStepTransition } from '../lib/ohProcess';
import { canAnalyseEvidence } from '../lib/documentIngestion';
import { parseCommitmentDueDate } from '../lib/taskDueDateParsing';

const OH_TASK_FINDING_TYPES = ["adjustment", "restriction", "further_information"];

const STATUS_DOT = { done: "#1A7A4A", current: "#5B3FD4", upcoming: "#D8D2E8" };
const fmtShort = iso => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
const OH_FINDING_LABEL = { adjustment: "Adjustment", restriction: "Restriction", further_information: "Further information needed", review_date: "Suggested review date" };

// Integrations & Workflow Automation (Phase 5, IP22, §18) — a genuine
// step-by-step tracker for the OH referral-to-review process, alongside
// (not replacing) the flat "OH referral date"/"OH report received"
// inputs in the Key Dates panel above — submit/received here still
// mirror into those same fields (see ohProcess.js's
// applyOhStepTransition) so deadlines.js's existing chase logic keeps
// working unchanged. Compass tracks the process only, never a medical
// judgement — "Recommendations" is HR's own record of what the OH
// report said, not Compass's interpretation of one.
export function OccupationalHealthPanel({ cs, cases, saveCases, stage, ohReportFindings, ohReportAnalysisLoading, onAnalyseOhReport, onAcceptOhFinding, onDismissOhFinding, onSendForSignature }) {
  const ohProcess = cs.ohProcess;
  const [recommendationsDraft, setRecommendationsDraft] = useState(ohProcess?.recommendations || "");
  const [reviewDateDraft, setReviewDateDraft] = useState(ohProcess?.reviewDate || "");
  const [consentChecked, setConsentChecked] = useState(false);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState("");
  const [adjustmentEmailDraft, setAdjustmentEmailDraft] = useState("");
  const [sendingAdjustment, setSendingAdjustment] = useState(false);

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
    setSelectedEvidenceId("");
    setAdjustmentEmailDraft("");
  }

  // Phase 6.5 hardening (P0, Cluster 8) — findingsKey/selectedEvidenceId
  // are keyed by the evidence item's own stable id, not array position
  // (see src/lib/evidenceUpload.js/allegations.js's own equivalent fix).
  const analysableEvidence = (cs.evidence||[]).filter(canAnalyseEvidence);
  const findingsKey = `${cs.id}::${selectedEvidenceId}`;
  const findings = (selectedEvidenceId!==""&&ohReportFindings?.[findingsKey])||[];
  const openFindings = findings.filter(f=>f.status==="open");
  const analysing = !!ohReportAnalysisLoading?.[findingsKey];

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
              <span role="img" aria-label={status==="done"?"Done":status==="current"?"Current step":"Upcoming"} title={status==="done"?"Done":status==="current"?"Current step":"Upcoming"} style={{width:9,height:9,borderRadius:"50%",background:STATUS_DOT[status],marginTop:5,flexShrink:0}} />
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
                    <textarea aria-label="OH report recommendations" value={recommendationsDraft} onChange={e=>setRecommendationsDraft(e.target.value)} rows={3} placeholder="What did the OH report recommend?"
                      style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif",boxSizing:"border-box",resize:"vertical"}} />
                    <Btn onClick={()=>advance("recommendations", { recommendations: recommendationsDraft })} disabled={!recommendationsDraft.trim()} style={{marginTop:6}}>Save recommendations</Btn>

                    {onAnalyseOhReport&&analysableEvidence.length>0&&(
                      <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid #F5F1EA"}}>
                        <div style={{fontSize:11,fontWeight:600,color:"#9B9098",marginBottom:6}}>Or let Compass suggest findings from the uploaded report</div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          <select aria-label="Select the OH report" value={selectedEvidenceId} onChange={e=>setSelectedEvidenceId(e.target.value)}
                            style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                            <option value="">Select the OH report...</option>
                            {analysableEvidence.map(ev=><option key={ev.id} value={ev.id}>{ev.name}</option>)}
                          </select>
                          <Btn variant="secondary" onClick={()=>onAnalyseOhReport(cs, selectedEvidenceId)} disabled={selectedEvidenceId===""||analysing}>{analysing?"Analysing...":"Analyse OH report"}</Btn>
                        </div>

                        {openFindings.length>0&&(
                          <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                            {openFindings.map(finding=>(
                              <div key={finding.id} style={{background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:8,padding:"10px 12px"}}>
                                <div style={{fontSize:11,fontWeight:700,color:"#5B3FD4",textTransform:"uppercase",letterSpacing:"0.3px",marginBottom:3}}>{OH_FINDING_LABEL[finding.type]||finding.type}</div>
                                <div style={{fontSize:13,color:"#1A1535"}}>{finding.type==="review_date"?finding.date:finding.description}</div>
                                {finding.reasoning&&<div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{finding.reasoning}</div>}
                                {/* Integrations & Workflow Automation (Phase 5, IP24, §20) —
                                    preview of the due date accepting this finding will set
                                    on the resulting task, parsed from the finding's own text. */}
                                {OH_TASK_FINDING_TYPES.includes(finding.type)&&parseCommitmentDueDate(finding.description)&&<div style={{fontSize:11,color:"#5B3FD4",marginTop:2}}>Due {parseCommitmentDueDate(finding.description)}</div>}
                                <div style={{display:"flex",gap:8,marginTop:8}}>
                                  <Btn onClick={()=>onAcceptOhFinding(cs, selectedEvidenceId, finding)} style={{fontSize:12,padding:"6px 14px"}}>Accept</Btn>
                                  <Btn variant="ghost" onClick={()=>onDismissOhFinding(cs, selectedEvidenceId, finding)} style={{fontSize:12,padding:"6px 14px"}}>Dismiss</Btn>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {status==="current"&&step.id==="adjustments_considered"&&(
                  <div style={{marginTop:8}}>
                    <Btn variant="secondary" onClick={()=>advance("manager_discussion")}>Mark done</Btn>
                    {/* Integrations & Workflow Automation (Phase 5, IP27, §21) —
                        the closest real analog in this codebase to "agreed
                        adjustments" as a document type: the free-text
                        recommendations HR already recorded at hr_review,
                        sent through the same signing_requests lifecycle as
                        an outcome letter (acknowledgement, not a drawn
                        signature — an employee confirms they've seen and
                        agreed the adjustments, they don't sign a form). */}
                    {onSendForSignature&&ohProcess?.recommendations&&(
                      <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F5F1EA"}}>
                        <div style={{fontSize:11,fontWeight:600,color:"#9B9098",marginBottom:6}}>Or send the agreed adjustments for the employee to sign</div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          <input aria-label="Employee email for signature" value={adjustmentEmailDraft} onChange={e=>setAdjustmentEmailDraft(e.target.value)} placeholder="employee@company.com"
                            style={{flex:1,minWidth:180,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}} />
                          <Btn variant="secondary" disabled={!adjustmentEmailDraft.includes("@")||sendingAdjustment} onClick={async ()=>{
                            setSendingAdjustment(true);
                            const result = await onSendForSignature({
                              document: ohProcess.recommendations, employeeEmail: adjustmentEmailDraft,
                              employeeName: cs.employeeName, managerName: cs.manager||"HR Manager",
                              documentType: "adjustment_record", documentLabel: "Agreed adjustments",
                              documentDate: new Date().toLocaleDateString("en-GB"), requiresSignature: false,
                            });
                            setSendingAdjustment(false);
                            if (result?.success) setAdjustmentEmailDraft("");
                          }}>{sendingAdjustment?"Sending...":"Send for signature"}</Btn>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {step.id==="review_date"&&status==="current"&&(
                  <div style={{display:"flex",gap:8,alignItems:"flex-end",marginTop:8}}>
                    <div>
                      <label htmlFor="oh-review-date" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Review date</label>
                      <input id="oh-review-date" type="date" value={reviewDateDraft} onChange={e=>setReviewDateDraft(e.target.value)}
                        style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}} />
                    </div>
                    <Btn onClick={()=>advance("review_date", { reviewDate: reviewDateDraft })} disabled={!reviewDateDraft}>{ohProcess?.reviewDate?"Update review date":"Confirm review date"}</Btn>
                  </div>
                )}

                {status==="current"&&!["consider_referral","hr_review","adjustments_considered","review_date"].includes(step.id)&&(
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
