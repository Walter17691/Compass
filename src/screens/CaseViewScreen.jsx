import { useState } from 'react';
import { SCREENS, MEETING_TYPES } from '../constants';
import { getCurrentRisk } from '../lib/caseStage';
import { MDRenderer } from '../components/MDRenderer';
import { LockIcon } from '../components/Icons';
import { AllegationsPanel } from '../components/AllegationsPanel';
import { TimelinePanel } from '../components/TimelinePanel';
import { CaseTasksPanel } from '../components/CaseTasksPanel';
import { OverviewTab } from '../components/caseTabs/OverviewTab';
import { MeetingsTab } from '../components/caseTabs/MeetingsTab';
import { EvidenceTab } from '../components/caseTabs/EvidenceTab';
import { PeopleTab } from '../components/caseTabs/PeopleTab';
import { DocumentsTab } from '../components/caseTabs/DocumentsTab';
import { OutcomeTab } from '../components/caseTabs/OutcomeTab';
import { AIAssistantTab } from '../components/caseTabs/AIAssistantTab';
import { allegationsForCase } from '../lib/allegations';
import { tasksForCase } from '../lib/caseTasks';

const ORDINAL = {2:"2nd",3:"3rd",4:"4th",5:"5th",6:"6th",7:"7th",8:"8th",9:"9th",10:"10th"};

const TABS = [
  { id:"overview", label:"Overview" },
  { id:"timeline", label:"Timeline" },
  { id:"allegations", label:"Allegations" },
  { id:"meetings", label:"Meetings" },
  { id:"evidence", label:"Evidence" },
  { id:"people", label:"Participants" }, // "People" collides with the top-nav employee directory — this is who's involved in THIS case
  { id:"tasks", label:"Tasks" },
  { id:"documents", label:"Documents" },
  { id:"outcome", label:"Outcome" },
  { id:"ai", label:"AI Assistant" },
];

export function CaseViewScreen({ cases, activeCaseId, setScreen, confirmDialog, getCaseStage, getNextStep, fmtDate, getProceedingTitle, getCaseStatus, setMeetingSetup, getEmployeeRecord, orgMembers, setCaseInfo, activeCaseStage, setActiveCaseStage, saveCases, setReviewOutput, setMeetingType, showAppealInput, setShowAppealInput, appealText, setAppealText, setShowHandoffModal, setShowReassignModal, setShowOutcomeModal, showToast, currentUser, setLetterOutput, setShowSignModal, handleLetter, letterOutput, aiProcessing, aiError, toggleNextStepDone, concludeInvestigation, concludingInvestigation, allegations, createAllegation, patchAllegation, changeAllegationStatus, deleteAllegation, auditLog, caseTasks, createCaseTask, toggleCaseTaskDone, deleteCaseTask }) {
  const [showDraft, setShowDraft] = useState(false);
  const [draftedType, setDraftedType] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const cs = cases.find(x=>x.id===activeCaseId);
  if(!cs) return <div style={{padding:40,color:"#9B9098",fontFamily:"DM Sans,system-ui,sans-serif"}}>Case not found — <button onClick={()=>setScreen(SCREENS.CASES)} style={{color:"#7C5CFC",background:"none",border:"none",cursor:"pointer"}}>Back to cases</button></div>;
  const meetings = cs.meetings||[];
  const stage = getCaseStage(cs);
  const nextStep = getNextStep(cs);
  const currentRisk = getCurrentRisk(cs);
  const empRecord = getEmployeeRecord(cs.employeeName);
  // Open items from the deterministic NEXT_STEPS_MAP checklist saved onto
  // each meeting (App.jsx:1468-1470) — already feeds computeDueSoon but
  // was never rendered anywhere until now; ticking one off here removes
  // it from the overdue banner/Settings list/digest with no changes
  // needed to any of those three.
  const openChecklist = meetings.flatMap(m=>(m.nextSteps||[]).map((s,idx)=>({...s, meetingId:m.id, idx})).filter(s=>!s.done));
  const repeatCount = cases.filter(c=>c.employeeName===cs.employeeName).length;
  const caseAllegations = allegationsForCase(allegations, cs.id);
  const caseTaskList = tasksForCase(caseTasks, cs.id);
  const screens = SCREENS;

  const startMeetingFromHeader = () => {
    const type = stage==="investigation"?"investigation":stage==="appeal"?"appeal-disciplinary":"disciplinary";
    setMeetingSetup(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type}));
    setCaseInfo(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",_linkedCaseId:null}));
    setScreen(SCREENS.HOME+"_meeting");
  };

  return(
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"14px 28px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setScreen(SCREENS.CASES)} style={{background:"none",border:"none",color:"#6B6375",fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0}}>← Cases</button>
            <div style={{width:1,height:16,background:"#EDE5D8"}}/>
            <div>
              <div style={{fontSize:11,color:"#9B9098"}}>{cs.employeeName}</div>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:17,color:"#1A1535"}}>{getProceedingTitle(cs)}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:12,fontWeight:600,color:getCaseStatus(cs).color,background:getCaseStatus(cs).bg,borderRadius:20,padding:"4px 12px"}}>{getCaseStatus(cs).label}</span>
            <button onClick={async()=>{
              const turningOn = !cs.confidential;
              const ok = await confirmDialog(turningOn?{title:"Mark case confidential?",message:"Only you, the case creator, and HR Directors will be able to see this case. Other HR managers will lose access unless explicitly granted."}:{title:"Remove confidentiality?",message:"This case will become visible to every HR manager in the organisation again."});
              if(!ok) return;
              saveCases(cases.map(x=>x.id===cs.id?{...x,confidential:turningOn}:x));
              showToast(turningOn?"Case marked confidential":"Case no longer confidential");
            }} title={cs.confidential?"Visible only to authorised staff":"Visible to all HR staff in the org"} style={{background:cs.confidential?"#FEF5E7":"none",border:"1px solid",borderColor:cs.confidential?"#E8C88A":"#E8E0D0",borderRadius:8,padding:"8px 14px",fontSize:12,color:cs.confidential?"#B87520":"#6B6375",fontWeight:500,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",display:"inline-flex",alignItems:"center",gap:6}}>{cs.confidential?<><LockIcon size={11} />Confidential</>:"Mark confidential"}</button>
            <button onClick={()=>setShowReassignModal(true)} title={`Currently run by ${cs.manager||"unassigned"}`} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#6B6375",fontWeight:500,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Reassign</button>
            <button onClick={startMeetingFromHeader}
              style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>+ New meeting</button>
          </div>
        </div>
        {/* Workspace tabs */}
        <div style={{display:"flex",gap:2,overflowX:"auto"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)}
              style={{padding:"6px 14px",borderRadius:6,border:"none",background:activeTab===t.id?"#F5F3FF":"none",color:activeTab===t.id?"#5B3FD4":"#6B6375",fontWeight:activeTab===t.id?600:400,fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",whiteSpace:"nowrap"}}>
              {t.label}
              {t.id==="allegations"&&caseAllegations.length>0&&<span style={{fontSize:10,marginLeft:5,background:activeTab===t.id?"#5B3FD4":"#E8E0D0",color:activeTab===t.id?"#fff":"#6B6375",borderRadius:10,padding:"1px 6px",fontWeight:600}}>{caseAllegations.length}</span>}
              {t.id==="tasks"&&caseTaskList.filter(x=>x.status!=="done").length>0&&<span style={{fontSize:10,marginLeft:5,background:activeTab===t.id?"#5B3FD4":"#E8E0D0",color:activeTab===t.id?"#fff":"#6B6375",borderRadius:10,padding:"1px 6px",fontWeight:600}}>{caseTaskList.filter(x=>x.status!=="done").length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Case Copilot — recommended next action, upgraded in place from the
          old "Next action" banner rather than adding a new element */}
      {nextStep&&stage!=="closed"&&(
        <div style={{background:"#F5F3FF",borderBottom:"1px solid #DDD9F5",padding:"12px 28px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:13,color:"#5B3FD4",fontWeight:600}}>Next: {nextStep.label}</div>
              {nextStep.reason&&<div style={{fontSize:11,color:"#6B6375",marginTop:2}}>{nextStep.reason}</div>}
            </div>
            <div style={{display:"flex",gap:8,flexShrink:0}}>
              {nextStep.secondary&&<button onClick={()=>{if(nextStep.secondary.action==="close_no_case"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed",closedReason:"no_case"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||""}));setShowDraft(true);setDraftedType("no-case-answer");handleLetter("no-case-answer",{inline:true});}}} style={{fontSize:12,background:"none",border:"1px solid #DDD9F5",borderRadius:6,padding:"6px 14px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{nextStep.secondary.label}</button>}
              <button onClick={()=>{
                if(nextStep.action==="start_investigation"||nextStep.action==="start_disciplinary"||nextStep.action==="start_appeal_meeting"){setMeetingSetup(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type:nextStep.action==="start_investigation"?"investigation":nextStep.action==="start_appeal_meeting"?"appeal-disciplinary":"disciplinary"}));setCaseInfo(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",_linkedCaseId:null}));setScreen(SCREENS.HOME+"_meeting");}
                else if(nextStep.action==="send_signature"){const rel=meetings.filter(m=>(m.type||"").toLowerCase().includes(stage==="appeal"?"appeal":stage==="investigation"?"investigation":"disciplinary"));const m=rel[0]||meetings[meetings.length-1];if(m?.record){setReviewOutput(m.record);setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);setShowSignModal(true);}}
                else if(nextStep.action==="inv_report"){concludeInvestigation(cs.id);}
                else if(nextStep.action==="disciplinary_invite"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"disciplinary"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",evidence:cs.evidence||[]}));setMeetingType(MEETING_TYPES.find(t=>t.id==="disciplinary")||null);setShowDraft(true);setDraftedType("invite");handleLetter("invite",{inline:true});}
                else if(nextStep.action==="outcome_letter"||nextStep.action==="appeal_letter"){const m=meetings.filter(mt=>(mt.type||"").toLowerCase().includes("disciplinary"))[0]||meetings[meetings.length-1];if(m){setReviewOutput(m.record||"");setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);}saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"outcome"}:x));setShowDraft(true);setDraftedType("outcome");handleLetter("outcome",{inline:true});}
                else if(nextStep.action==="close_case"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed"}:x));}
              }} disabled={nextStep.action==="inv_report"&&concludingInvestigation} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"6px 18px",color:"#fff",fontWeight:600,cursor:(nextStep.action==="inv_report"&&concludingInvestigation)?"not-allowed":"pointer",opacity:(nextStep.action==="inv_report"&&concludingInvestigation)?0.6:1,fontFamily:"DM Sans,system-ui,sans-serif"}}>{nextStep.action==="inv_report"&&concludingInvestigation?"Generating report...":nextStep.label+" →"}</button>
            </div>
          </div>

          {/* Inline draft preview — only for letter-generating actions */}
          {showDraft&&(
            <div style={{marginTop:12,background:"#FFFFFF",border:"1px solid #DDD9F5",borderRadius:10,padding:14}}>
              {aiProcessing?(
                <div style={{fontSize:13,color:"#9B9098"}}>Drafting…</div>
              ):aiError?(
                <div style={{fontSize:13,color:"#C84B2F"}}>{aiError}</div>
              ):(
                <>
                  <div style={{maxHeight:180,overflowY:"auto",fontSize:12,color:"#1A1535",lineHeight:1.6,paddingRight:4}}>
                    <MDRenderer text={letterOutput}/>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                    <button onClick={()=>handleLetter(draftedType,{inline:true})} style={{fontSize:12,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 14px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Regenerate</button>
                    <button onClick={()=>setScreen(SCREENS.LETTER)} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"6px 14px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Open in Letter editor →</button>
                    <button onClick={()=>setShowDraft(false)} style={{fontSize:12,background:"none",border:"none",color:"#9B9098",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Discard</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Details — collapsed by default so the card never grows the
              page uninvited; the checklist finally gives the per-meeting
              nextSteps data (App.jsx NEXT_STEPS_MAP) somewhere to live. */}
          {(openChecklist.length>0||repeatCount>1)&&(
            <>
              <button onClick={()=>setShowDetails(v=>!v)} style={{fontSize:11,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",padding:0,marginTop:10,fontFamily:"DM Sans,system-ui,sans-serif"}}>{showDetails?"Hide details ▴":"Details ▾"}</button>
              {showDetails&&(
                <div style={{marginTop:8}}>
                  {openChecklist.length>0&&(
                    <div style={{marginBottom:repeatCount>1?10:0}}>
                      {openChecklist.map((item,i)=>(
                        <label key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#1A1535",padding:"3px 0",cursor:"pointer"}}>
                          <input type="checkbox" checked={false} onChange={()=>toggleNextStepDone(cs.id, item.meetingId, item.idx)} style={{cursor:"pointer"}}/>
                          <span style={{flex:1}}>{item.step}</span>
                          {item.deadline&&<span style={{color:"#9B9098",fontSize:11}}>{item.deadline}</span>}
                        </label>
                      ))}
                    </div>
                  )}
                  {repeatCount>1&&<div style={{fontSize:12,color:"#9B9098"}}>{ORDINAL[repeatCount]||repeatCount+"th"} case for {cs.employeeName}.</div>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Closed - appeal */}
      {stage==="closed"&&!showAppealInput[cs.id]&&!meetings.some(m=>(m.type||"").toLowerCase().includes("appeal"))&&(
        <div style={{background:"#E8F5EE",borderBottom:"1px solid #C8E6C9",padding:"10px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{fontSize:13,color:"#1A7A4A",fontWeight:600}}>Case closed</div>
          <button onClick={()=>setShowAppealInput(p=>({...p,[cs.id]:true}))} style={{fontSize:12,background:"none",border:"1px solid #C84B2F",borderRadius:6,padding:"5px 14px",color:"#C84B2F",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Employee is appealing</button>
        </div>
      )}
      {showAppealInput[cs.id]&&(
        <div style={{background:"#FEF5E7",borderBottom:"1px solid #F5E6C4",padding:"14px 28px",flexShrink:0}}>
          <div style={{fontSize:13,color:"#5B3FD4",fontWeight:500,marginBottom:8}}>Paste the employee appeal — Compass will use this for the appeal hearing:</div>
          <textarea value={appealText[cs.id]||""} onChange={e=>setAppealText(p=>({...p,[cs.id]:e.target.value}))} rows={3} style={{width:"100%",background:"#FFFFFF",border:"1px solid #DDD9F5",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#1A1535",outline:"none",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif",boxSizing:"border-box",marginBottom:8}}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"appeal",appealText:appealText[cs.id]||""}:x));setShowAppealInput(p=>({...p,[cs.id]:false}));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||""}));setMeetingType(MEETING_TYPES.find(t=>t.id==="appeal-disciplinary")||null);handleLetter("invite");}} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"7px 16px",color:"#fff",cursor:"pointer",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>Start appeal and send invitation</button>
            <button onClick={()=>setShowAppealInput(p=>({...p,[cs.id]:false}))} style={{fontSize:12,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"7px 14px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Cancel</button>
          </div>
        </div>
      )}
      {/* Appeal — option to proceed to new disciplinary if appeal upheld/dismissed */}
      {stage==="appeal"&&(
        <div style={{background:"#FDFAF5",borderBottom:"1px solid #E8E0D0",padding:"10px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:"#9B9098"}}>Appeal in progress · {cs.disciplinaryOfficer?"Officer: "+cs.disciplinaryOfficer:"No officer assigned"}</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowHandoffModal(true)} style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>
              {cs.disciplinaryOfficer?"Reassign officer":"Appoint appeal officer"}
            </button>
            <button onClick={()=>{saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed"}:x));showToast("Case closed");}} style={{fontSize:12,color:"#1A7A4A",background:"#E8F5EE",border:"none",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>
              Close case
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div style={{flex:1,overflowY:"auto",padding:"24px 28px"}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          {activeTab==="overview"&&(
            <OverviewTab cs={cs} cases={cases} saveCases={saveCases} stage={stage} currentRisk={currentRisk} empRecord={empRecord} repeatCount={repeatCount} confirmDialog={confirmDialog} setScreen={setScreen} screens={screens}/>
          )}
          {activeTab==="timeline"&&(
            <TimelinePanel cs={cs} allegations={allegations} auditLog={auditLog} fmtDate={fmtDate}/>
          )}
          {activeTab==="allegations"&&(
            <AllegationsPanel cs={cs} allegations={caseAllegations} createAllegation={createAllegation} patchAllegation={patchAllegation} changeAllegationStatus={changeAllegationStatus} deleteAllegation={deleteAllegation} saveCases={saveCases} cases={cases} confirmDialog={confirmDialog} showToast={showToast}/>
          )}
          {activeTab==="meetings"&&(
            <MeetingsTab cs={cs} cases={cases} saveCases={saveCases} activeCaseStage={activeCaseStage} setActiveCaseStage={setActiveCaseStage} setMeetingSetup={setMeetingSetup} setCaseInfo={setCaseInfo} getEmployeeRecord={getEmployeeRecord} orgMembers={orgMembers} setScreen={setScreen} screens={screens} setReviewOutput={setReviewOutput} setMeetingType={setMeetingType} meetingTypes={MEETING_TYPES} fmtDate={fmtDate} concludeInvestigation={concludeInvestigation} concludingInvestigation={concludingInvestigation} setShowHandoffModal={setShowHandoffModal} setLetterOutput={setLetterOutput}/>
          )}
          {activeTab==="evidence"&&(
            <EvidenceTab cs={cs} cases={cases} saveCases={saveCases} currentUser={currentUser} showToast={showToast} setReviewOutput={setReviewOutput} setScreen={setScreen} screens={screens} fmtDate={fmtDate} setMeetingSetup={setMeetingSetup} setCaseInfo={setCaseInfo} orgMembers={orgMembers}/>
          )}
          {activeTab==="people"&&(
            <PeopleTab cs={cs}/>
          )}
          {activeTab==="tasks"&&(
            <CaseTasksPanel cs={cs} tasks={caseTaskList} createCaseTask={createCaseTask} toggleCaseTaskDone={toggleCaseTaskDone} deleteCaseTask={deleteCaseTask} fmtDate={fmtDate}/>
          )}
          {activeTab==="documents"&&(
            <DocumentsTab cs={cs} setLetterOutput={setLetterOutput} setScreen={setScreen} screens={screens} fmtDate={fmtDate}/>
          )}
          {activeTab==="outcome"&&(
            <OutcomeTab cs={cs} stage={stage} fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal}/>
          )}
          {activeTab==="ai"&&(
            <AIAssistantTab/>
          )}
        </div>
      </div>
    </div>
  );
}
