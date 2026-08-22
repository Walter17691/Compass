import { useState, useEffect } from 'react';
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
import { CommunicationsTab } from '../components/caseTabs/CommunicationsTab';
import { ThemesTab } from '../components/caseTabs/ThemesTab';
import { OutcomeTab } from '../components/caseTabs/OutcomeTab';
import { AIAssistantTab } from '../components/caseTabs/AIAssistantTab';
import { allegationsForCase } from '../lib/allegations';
import { tasksForCase, hrNoteTasks } from '../lib/caseTasks';
import { openSignalsForCase } from '../lib/caseSignals';
import { computeCaseReadiness } from '../lib/caseReadiness';
import { investigationChecklistTasks, INVESTIGATION_CHECKLIST_STEPS } from '../lib/investigationChecklist';
import { investigationPlanTasks } from '../lib/investigationPlan';
import { SignalCard } from '../components/SignalCard';
import { WhySourcesModal } from '../components/WhySourcesModal';
import { PolicyCitation } from '../components/PolicyCitation';
import { CaseReadinessBadge } from '../components/CaseReadinessBadge';
import { InvestigatorChecklistView } from '../components/InvestigatorChecklistView';
import { NotetakerView } from '../components/NotetakerView';

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
  { id:"communications", label:"Communications" },
  { id:"themes", label:"Themes" },
  { id:"outcome", label:"Outcome" },
  { id:"ai", label:"AI Assistant" },
];

// Phase 6.5 hardening (Batch 10b, task #205) — was 132 individually
// destructured props (2 of them, concludeInvestigation/assignInvestigator,
// entirely dead — never read anywhere in this file, removed here), the
// single worst offender in the whole codebase. This file's own body is
// far denser than OverviewTab's or SettingsScreen's (15+ handler closures
// referencing dozens of these names across ~450 lines), so cross-cutting
// props (shell/header — read throughout the function body, not just
// passed to one child) are re-destructured flat immediately below rather
// than accessed as group.field everywhere, which would otherwise touch
// nearly every line. Props that belong to exactly one tab component
// (overview/timeline/allegationsTab/meetingsTab/evidenceTab/documentsTab/
// themesTab/aiTab) are referenced as group.field only at that tab's own
// single JSX call site, same pattern as OverviewTab/SettingsScreen.
export function CaseViewScreen({
  shell = {}, header = {}, initialTab, clearInitialTab, deleteCaseTask,
  overview = {}, timeline = {}, allegationsTab = {}, meetingsTab = {},
  evidenceTab = {}, documentsTab = {}, themesTab = {}, aiTab = {},
}) {
  const {
    cases, activeCaseId, setScreen, confirmDialog, getCaseStage, getNextStep, fmtDate,
    getProceedingTitle, getCaseStatus, setMeetingSetup, getEmployeeRecord, orgMembers,
    setCaseInfo, saveCases, setReviewOutput, setMeetingType, showToast, currentUser,
    setLetterOutput, handleLetter, isHR, caseAccess, allegations, auditLog, caseTasks,
    createCaseTask, caseSignals, changeSignalStatus, toggleCaseTaskDone, setShowHandoffModal,
    generateInvestigationPlan, investigationPlanLoading,
  } = shell;
  const {
    showAppealInput, setShowAppealInput, appealText, setAppealText, setShowReassignModal,
    setShowAssignInvestigatorModal, setShowOutcomeModal, setShowSignModal, letterOutput,
    aiProcessing, aiError, toggleNextStepDone, concludingInvestigation, attemptSubmitInvestigation,
    openEscalateModal, openHrInterventionModal, generateNextBestAction, nextActionLoading,
    changesSinceView, changesSummary, changesSummaryLoading,
  } = header;
  const [showDraft, setShowDraft] = useState(false);
  const [draftedType, setDraftedType] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [whySignal, setWhySignal] = useState(null);
  const [changesBannerDismissed, setChangesBannerDismissed] = useState(false);
  const cs = cases.find(x=>x.id===activeCaseId);
  // CaseViewScreen doesn't remount when switching between cases while
  // staying on this screen (no key={cs.id} at the App.jsx call site), so
  // without this a dismiss on one case would silently carry over and hide
  // the next case's own banner too.
  useEffect(() => { setChangesBannerDismissed(false); }, [activeCaseId]);
  // Integrations & Workflow Automation (Phase 5, IP14, §8) — reply
  // capture's "Update Meeting" action lands directly on the Meetings tab
  // rather than always defaulting to Overview, same initialSection/
  // clearInitialSection deep-link shape SettingsScreen already uses.
  // Deliberately keyed on initialTab only — clearInitialTab is an inline
  // arrow at the App.jsx call site with a new identity every render, and
  // re-running this whenever THAT changes (rather than when the actual
  // trigger value changes) would fight anyone clicking between tabs by
  // hand right after landing here.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- one-time, prop-driven sync on a genuine value change, same shape as this file's own changesBannerDismissed effect and the mailParam/calendarParam effects in App.jsx that this rule doesn't flag consistently.
  useEffect(() => { if(initialTab) { setActiveTab(initialTab); clearInitialTab?.(); } }, [initialTab]);
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
  const nextActionSignal = openSignalsForCase(caseSignals, cs.id, "next_action")[0];
  // P5 — a next_action signal may carry a real, indexed policy clause
  // (generateNextBestAction, App.jsx) rather than folding "your policy
  // requires X" anonymously into its reasoning prose.
  const nextActionPolicyRef = nextActionSignal?.sourceRefs?.find(r=>r.kind==="policy");
  const readiness = computeCaseReadiness(cs, allegations, caseSignals, caseTasks);
  const screens = SCREENS;

  // Phase 15 — Manager Investigation Mode. caseAccess is org-wide (RLS
  // scopes SELECT by org, not by user — see baseline_schema_2026-08-06.sql),
  // so this filters down to just this case's grants client-side.
  const caseInvestigatorAccess = caseAccess.filter(a=>a.caseId===cs.id && a.role==="investigator");
  const currentInvestigatorAccess = caseInvestigatorAccess[caseInvestigatorAccess.length-1];
  const currentInvestigator = currentInvestigatorAccess ? orgMembers.find(m=>m.user_id===currentInvestigatorAccess.userId) : null;
  const myAccess = caseAccess.find(a=>a.caseId===cs.id && a.userId===currentUser?.user_id);
  const isAssignedInvestigator = !isHR && myAccess?.role==="investigator";
  // Manager Enablement (Phase 4, MP2) — same restricted-view branch-point
  // as isAssignedInvestigator above, one case_access role earlier in the
  // render order since they're mutually exclusive per user per case.
  const isAssignedNotetaker = !isHR && myAccess?.role==="notetaker";
  // Manager Enablement (Phase 4, MP3, §18) — the P10 decision workspace
  // (AllegationsPanel's investigator finding / decision reasoning /
  // outstanding uncertainty / employee response / status) used to be
  // implicitly editable by anyone who reached the full case view at all —
  // there was no formal "who's actually deciding this" concept. Real
  // assignment already existed (HandoffModal already writes a real
  // case_access role:"disciplinary_officer" row on appointment); this is
  // what actually reads it to gate editing to HR or that assigned Hearing
  // Manager. Investigator/notetaker never reach this panel at all any
  // more (MP1/MP2's own restricted views), so the remaining non-HR
  // audience here is appeal_manager/employee_manager/approver/case_owner —
  // they still see these fields (context they may legitimately need), just
  // read-only.
  const canDecide = isHR || (myAccess?.role==="disciplinary_officer");
  const checklistTasks = investigationChecklistTasks(caseTasks, cs.id);
  const planTasks = investigationPlanTasks(caseTasks, cs.id);
  const guidanceTasks = hrNoteTasks(caseTasks, cs.id);

  const startWitnessInterview = () => {
    setMeetingSetup(p=>({...p,employee:"",employeeJobTitle:"",manager:currentUser?.name||"",chairJobTitle:"",type:"investigation",linkedCaseId:cs.id,linkedCaseName:cs.employeeName}));
    setCaseInfo(p=>({...p,employee:"",employeeJobTitle:"",manager:currentUser?.name||"",chairJobTitle:"",_linkedCaseId:cs.id,_linkedCaseName:cs.employeeName}));
    setScreen(SCREENS.HOME+"_meeting");
  };

  const startMeetingFromHeader = () => {
    // nextStep already carries the type-aware meetingType for wherever
    // this case actually is (disciplinary vs grievance shaped); only a
    // closed case (nextStep null) falls back to the old default.
    const type = nextStep?.meetingType || (stage==="investigation"?"investigation":stage==="appeal"?"appeal-disciplinary":"disciplinary");
    setMeetingSetup(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type}));
    setCaseInfo(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",_linkedCaseId:null}));
    setScreen(SCREENS.HOME+"_meeting");
  };

  if(isAssignedNotetaker) {
    return (
      <NotetakerView
        cs={cs}
        cases={cases}
        saveCases={saveCases}
        createCaseTask={createCaseTask}
        openQuestions={openSignalsForCase(caseSignals, cs.id, "unanswered_question")}
        currentUser={currentUser}
        fmtDate={fmtDate}
        setScreen={setScreen}
        screens={screens}
      />
    );
  }

  if(isAssignedInvestigator) {
    return (
      <InvestigatorChecklistView
        cs={cs}
        caseAllegations={caseAllegations}
        checklistTasks={checklistTasks}
        toggleCaseTaskDone={toggleCaseTaskDone}
        openQuestions={openSignalsForCase(caseSignals, cs.id, "unanswered_question")}
        onStartWitnessInterview={startWitnessInterview}
        onStartEmployeeInterview={startMeetingFromHeader}
        setScreen={setScreen}
        screens={screens}
        scopeAllegationIds={myAccess?.scopeAllegationIds}
        targetCompletionDate={myAccess?.targetCompletionDate}
        scopeNote={myAccess?.scopeNote}
        fmtDate={fmtDate}
        planTasks={planTasks}
        onGeneratePlan={()=>generateInvestigationPlan(cs)}
        planLoading={!!investigationPlanLoading[cs.id]}
        caseSignals={caseSignals}
        onSubmitInvestigation={attemptSubmitInvestigation}
        submittingInvestigation={concludingInvestigation}
        onEscalate={()=>openEscalateModal(cs.id)}
        guidanceTasks={guidanceTasks}
      />
    );
  }

  const openTimelineSource = (linkTo) => {
    if(!linkTo) return;
    if(linkTo.kind==="meeting") setActiveTab("meetings");
    else if(linkTo.kind==="allegation") setActiveTab("allegations");
    else if(linkTo.kind==="letter"||linkTo.kind==="report") setActiveTab("documents");
    else if(linkTo.kind==="outcome") setActiveTab("outcome");
    else if(linkTo.kind==="evidence") setActiveTab("evidence");
  };

  const resolveSignalRef = (ref) => {
    if(ref.kind==="meeting") { const m = meetings.find(x=>x.id===ref.id); return m ? {label:m.type||"Meeting", detail:null, date:m.date} : null; }
    if(ref.kind==="allegation") { const a = caseAllegations.find(x=>x.id===ref.id); return a ? {label:a.title, detail:null, date:a.createdAt} : null; }
    if(ref.kind==="evidence") { const e = (cs.evidence||[])[ref.id]; return e ? {label:e.name||"Evidence", detail:e.type||null, date:e.date||null} : null; }
    // Self-contained refs (own label/detail already set, nothing to look
    // up by id) — e.g. ConsistencyPanel's anonymised comparable-case
    // count, where there's no specific case id that could be shown
    // without defeating the anonymity.
    if(ref.detail || ref.date) return ref;
    return null;
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
            {isHR&&(
              <button onClick={()=>setShowAssignInvestigatorModal(true)}
                title={currentInvestigator?`Currently investigating: ${currentInvestigator.name}`+(currentInvestigatorAccess?.targetCompletionDate?` — due ${fmtDate(currentInvestigatorAccess.targetCompletionDate)}`:"")+(currentInvestigatorAccess?.scopeNote?` — ${currentInvestigatorAccess.scopeNote}`:""):"No investigator assigned"}
                style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:8,padding:"8px 14px",color:"#6B6375",background:"#fff",fontFamily:"DM Sans,system-ui,sans-serif",cursor:"pointer",fontWeight:500}}>
                {currentInvestigator?"Investigator: "+currentInvestigator.name:"Assign investigator..."}
              </button>
            )}
            {/* Manager Enablement (Phase 4, MP19, §15) — send guidance/a
                question/a witness request, return for further work,
                reassign, take over, or pause — all in one place, also
                reachable from HrDelegatedWorkScreen's own "Intervene"
                button per row. */}
            {isHR&&(
              <button onClick={()=>openHrInterventionModal(cs.id)}
                style={{background:cs.investigationPaused?"#FEF5E7":"none",border:"1px solid "+(cs.investigationPaused?"#E8C88A":"#E8E0D0"),borderRadius:8,padding:"8px 14px",fontSize:12,color:cs.investigationPaused?"#B87520":"#6B6375",fontWeight:500,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                {cs.investigationPaused?"Paused":"HR Intervention"}
              </button>
            )}
            {/* Manager Enablement (Phase 4, MP12, §13) — persistent,
                case-wide, unlike the old post-meeting-only "Request HR
                review" button (ReviewScreen.jsx, untouched). HR doesn't
                need to escalate to themselves. */}
            {!isHR&&(
              <button onClick={()=>openEscalateModal(cs.id)}
                style={{background:"none",border:"1px solid #E8E0D0",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#6B6375",fontWeight:500,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Ask HR</button>
            )}
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

      {/* Phase 13 — "What Changed Since Last View." Dismissible for this
          viewing session only; reopening the case later recomputes a
          fresh diff against the just-updated last_viewed_at regardless. */}
      {changesSinceView?.length>0 && !changesBannerDismissed && (
        <div style={{background:"#F5F3FF",borderBottom:"1px solid #DDD9F5",padding:"10px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexShrink:0}}>
          <div style={{fontSize:12,color:"#5B3FD4",flex:1,minWidth:0}}>
            {changesSummaryLoading ? "Compass is summarising what's changed…" : (changesSummary || `${changesSinceView.length} update${changesSinceView.length!==1?"s":""} since you last viewed this case.`)}
          </div>
          <button onClick={()=>setChangesBannerDismissed(true)} style={{fontSize:11,color:"#5B3FD4",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",flexShrink:0}}>Dismiss</button>
        </div>
      )}

      {/* Case Copilot — recommended next action, upgraded in place from the
          old "Next action" banner rather than adding a new element */}
      {nextStep&&stage!=="closed"&&(
        <div style={{background:"#F5F3FF",borderBottom:"1px solid #DDD9F5",padding:"12px 28px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:13,color:"#5B3FD4",fontWeight:600}}>Next: {nextStep.label}</div>
              {nextStep.reason&&<div style={{fontSize:11,color:"#6B6375",marginTop:2}}>{nextStep.reason}</div>}
              <CaseReadinessBadge readiness={readiness}/>
              {isHR&&currentInvestigator&&(
                <div style={{fontSize:11,color:"#5B3FD4",marginTop:6}}>
                  Investigation by {currentInvestigator.name}: {checklistTasks.filter(t=>t.status==="done").length} of {INVESTIGATION_CHECKLIST_STEPS.length} steps complete
                  {currentInvestigatorAccess?.targetCompletionDate&&<> · Due {fmtDate(currentInvestigatorAccess.targetCompletionDate)}</>}
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,flexShrink:0}}>
              {nextStep.secondary&&<button onClick={()=>{if(nextStep.secondary.action==="close_no_case"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed",closedReason:"no_case"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||""}));setShowDraft(true);setDraftedType("no-case-answer");handleLetter("no-case-answer",{inline:true});}}} style={{fontSize:12,background:"none",border:"1px solid #DDD9F5",borderRadius:6,padding:"6px 14px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{nextStep.secondary.label}</button>}
              <button onClick={()=>{
                // meetingType-derived search term for finding "the meeting
                // this step is about" among cs.meetings — meeting records
                // store the human label (e.g. "Disciplinary Appeal",
                // "Grievance"), not the MEETING_TYPES id, so an
                // "appeal-*" meetingType searches generically for
                // "appeal" rather than the id's own hyphenated form.
                const searchTerm = nextStep.meetingType?.startsWith("appeal-") ? "appeal" : nextStep.meetingType;
                const relevantMeeting = () => meetings.filter(m=>(m.type||"").toLowerCase().includes(searchTerm||""))[0]||meetings[meetings.length-1];
                if(nextStep.action==="start_investigation"||nextStep.action==="start_disciplinary"||nextStep.action==="start_appeal_meeting"||nextStep.action==="start_hearing"){setMeetingSetup(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type:nextStep.meetingType||"disciplinary"}));setCaseInfo(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",_linkedCaseId:null}));setScreen(SCREENS.HOME+"_meeting");}
                else if(nextStep.action==="send_signature"){const m=relevantMeeting();if(m?.record){setReviewOutput(m.record);setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);setShowSignModal(true);}}
                else if(nextStep.action==="inv_report"){attemptSubmitInvestigation(cs.id);}
                else if(nextStep.action==="disciplinary_invite"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"disciplinary"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",evidence:cs.evidence||[]}));setMeetingType(MEETING_TYPES.find(t=>t.id==="disciplinary")||null);setShowDraft(true);setDraftedType("invite");handleLetter("invite",{inline:true});}
                else if(nextStep.action==="outcome_letter"){const m=relevantMeeting();if(m){setReviewOutput(m.record||"");setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);}saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"outcome"}:x));setShowDraft(true);setDraftedType("outcome");handleLetter("outcome",{inline:true});}
                else if(nextStep.action==="appeal_letter"){
                  // Was previously handled identically to outcome_letter —
                  // drafted an "outcome" letter and regressed stage from
                  // "appeal" back to "outcome", even though the case had
                  // already progressed past that point. The appeal is the
                  // final stage (ACAS Code); this only closes on an
                  // explicit close_case, never silently un-does progress.
                  const m=relevantMeeting();if(m){setReviewOutput(m.record||"");setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);}setShowDraft(true);setDraftedType("appeal");handleLetter("appeal",{inline:true});
                }
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

          {/* Compass's own take — advisory, separate from the deterministic
              step above it. Persisted as a next_action case_signal so it
              can be accepted/dismissed/marked-not-relevant rather than
              only living as a re-generated string on every visit. */}
          <div style={{marginTop:12}}>
            {nextActionSignal ? (
              <SignalCard
                signal={nextActionSignal}
                onDismiss={()=>changeSignalStatus(nextActionSignal.id, "dismissed")}
                onMarkNotRelevant={()=>changeSignalStatus(nextActionSignal.id, "not_relevant")}
                onAskWhy={()=>setWhySignal(nextActionSignal)}
                extraActions={[
                  {label:"Accept", onClick:()=>changeSignalStatus(nextActionSignal.id, "accepted")},
                  {label:"Create task", onClick:()=>{createCaseTask(cs.id, {name:nextActionSignal.title}); changeSignalStatus(nextActionSignal.id, "accepted");}},
                ]}
              />
            ) : null}
            {nextActionPolicyRef&&(
              <div style={{marginTop:8}}>
                <PolicyCitation
                  policyName={nextActionPolicyRef.label}
                  clauseHeading={nextActionPolicyRef.clauseHeading}
                  clauseText={nextActionPolicyRef.clauseText}
                />
              </div>
            )}
            {!nextActionSignal&&(
              <button onClick={()=>generateNextBestAction(cs)} disabled={nextActionLoading?.[cs.id]}
                style={{fontSize:12,background:"none",border:"1px solid #DDD9F5",borderRadius:6,padding:"6px 14px",color:"#7C5CFC",cursor:nextActionLoading?.[cs.id]?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                {nextActionLoading?.[cs.id] ? "Compass is thinking…" : "Ask Compass for its take"}
              </button>
            )}
          </div>
        </div>
      )}

      {whySignal&&(
        <WhySourcesModal title={whySignal.title} reasoning={whySignal.reasoning} sourceRefs={whySignal.sourceRefs} resolveRef={resolveSignalRef} onClose={()=>setWhySignal(null)} />
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
          <textarea aria-label="Employee appeal text" value={appealText[cs.id]||""} onChange={e=>setAppealText(p=>({...p,[cs.id]:e.target.value}))} rows={3} style={{width:"100%",background:"#FFFFFF",border:"1px solid #DDD9F5",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#1A1535",outline:"none",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif",boxSizing:"border-box",marginBottom:8}}/>
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
            <OverviewTab cs={cs}
              caseCtx={{ cases, saveCases, stage, currentRisk, empRecord, repeatCount }}
              shell={{ setScreen, screens, confirmDialog }}
              caseData={{ caseSignals, caseTasks: caseTaskList, allegations, auditLog, wellbeingNotes: overview.wellbeingNotes, dueSoon: overview.dueSoon, processTemplates: overview.processTemplates, caseAccess, orgMembers, hrReviewRequests: overview.hrReviewRequests }}
              caseActions={{ changeSignalStatus, createCaseTask, onAskWhy: setWhySignal, linkSignalToAllegation: overview.linkSignalToAllegation, requestOverrideReason: overview.requestOverrideReason, requestPolicyDeviationReason: overview.requestPolicyDeviationReason }}
              caseIntel={{ unansweredCovered: overview.unansweredCovered, unansweredLoading: overview.unansweredLoading, generateUnansweredQuestions: overview.generateUnansweredQuestions, generateInconsistencies: overview.generateInconsistencies, inconsistencyLoading: overview.inconsistencyLoading?.[cs.id] }}
              oh={{ ohReportFindings: overview.ohReportFindings, ohReportAnalysisLoading: overview.ohReportAnalysisLoading, onAnalyseOhReport: overview.onAnalyseOhReport, onAcceptOhFinding: overview.onAcceptOhFinding, onDismissOhFinding: overview.onDismissOhFinding, onSendForSignature: overview.onSendForSignature }}
              review={{ isApprover: isHR, respondToReview: overview.respondToReview, resolveInvestigationReview: overview.resolveInvestigationReview, assignCaseRole: overview.assignCaseRole }}
              automation={{ automationLevels: overview.automationLevels, onResendReminder: overview.onResendReminder }}
            />
          )}
          {activeTab==="timeline"&&(
            <TimelinePanel cs={cs} allegations={allegations} auditLog={auditLog} fmtDate={fmtDate} onOpenSource={openTimelineSource} onToggleExclude={timeline.toggleTimelineExclude} onEditDescription={timeline.editTimelineDescription} onGenerateRelevance={timeline.generateTimelineRelevance} relevanceLoading={timeline.timelineRelevanceLoading?.[cs.id]} loadJsPDF={timeline.loadJsPDF}/>
          )}
          {activeTab==="allegations"&&(
            <AllegationsPanel cs={cs} allegations={caseAllegations} allAllegations={allegations} createAllegation={allegationsTab.createAllegation} patchAllegation={allegationsTab.patchAllegation} changeAllegationStatus={allegationsTab.changeAllegationStatus} deleteAllegation={allegationsTab.deleteAllegation} saveCases={saveCases} cases={cases} confirmDialog={confirmDialog} showToast={showToast} evidenceSuggestions={allegationsTab.evidenceSuggestions?.[cs.id]||[]} evidenceSuggestionsLoading={allegationsTab.evidenceSuggestionsLoading?.[cs.id]} generateEvidenceSuggestions={allegationsTab.generateEvidenceSuggestions} acceptEvidenceSuggestion={allegationsTab.acceptEvidenceSuggestion} rejectEvidenceSuggestion={allegationsTab.rejectEvidenceSuggestion} setReviewOutput={setReviewOutput} setScreen={setScreen} screens={screens} orgMembers={orgMembers} fmtDate={fmtDate} caseSignals={caseSignals} onAskWhy={setWhySignal} generateAppealReview={allegationsTab.generateAppealReview} appealReviewLoading={allegationsTab.appealReviewLoading} recordAppealOutcome={allegationsTab.recordAppealOutcome} policies={allegationsTab.policies} consistencyReview={allegationsTab.consistencyReview?.[cs.id]} consistencyReviewLoading={allegationsTab.consistencyReviewLoading?.[cs.id]} generateConsistencyReview={allegationsTab.generateConsistencyReview} canDecide={canDecide}/>
          )}
          {activeTab==="meetings"&&(
            <MeetingsTab cs={cs} cases={cases} saveCases={saveCases} activeCaseStage={meetingsTab.activeCaseStage} setActiveCaseStage={meetingsTab.setActiveCaseStage} setMeetingSetup={setMeetingSetup} setCaseInfo={setCaseInfo} getEmployeeRecord={getEmployeeRecord} orgMembers={orgMembers} setScreen={setScreen} screens={screens} setReviewOutput={setReviewOutput} setMeetingType={setMeetingType} meetingTypes={MEETING_TYPES} fmtDate={fmtDate} attemptSubmitInvestigation={attemptSubmitInvestigation} concludingInvestigation={concludingInvestigation} setShowHandoffModal={setShowHandoffModal} setLetterOutput={setLetterOutput} onAcceptSavedSuggestion={meetingsTab.onAcceptSavedSuggestion} onDismissSavedSuggestion={meetingsTab.onDismissSavedSuggestion}/>
          )}
          {activeTab==="evidence"&&(
            <EvidenceTab cs={cs} cases={cases} saveCases={saveCases} currentUser={currentUser} showToast={showToast} setReviewOutput={setReviewOutput} setScreen={setScreen} screens={screens} fmtDate={fmtDate} setMeetingSetup={setMeetingSetup} setCaseInfo={setCaseInfo} orgMembers={orgMembers} allegations={caseAllegations} documentFindings={evidenceTab.documentFindings} documentAnalysisLoading={evidenceTab.documentAnalysisLoading} onAnalyseEvidence={(evidenceId)=>evidenceTab.analyseEvidenceDocument(cs, evidenceId)} onAcceptFinding={(evidenceId, finding)=>evidenceTab.acceptDocumentFinding(cs, evidenceId, finding)} onDismissFinding={(evidenceId, finding)=>evidenceTab.dismissDocumentFinding(cs, evidenceId, finding)}/>
          )}
          {activeTab==="people"&&(
            <PeopleTab cs={cs}/>
          )}
          {activeTab==="tasks"&&(
            <CaseTasksPanel cs={cs} tasks={caseTaskList} createCaseTask={createCaseTask} toggleCaseTaskDone={toggleCaseTaskDone} deleteCaseTask={deleteCaseTask} fmtDate={fmtDate} isHR={isHR} onGeneratePlan={()=>generateInvestigationPlan(cs)} planLoading={!!investigationPlanLoading[cs.id]}/>
          )}
          {activeTab==="documents"&&(
            <DocumentsTab cs={cs} setLetterOutput={setLetterOutput} setScreen={setScreen} screens={screens} fmtDate={fmtDate} onGenerateHearingPack={documentsTab.onGenerateHearingPack} hearingPackGenerating={!!documentsTab.hearingPackGenerating?.[cs.id]} onDraftCorrespondence={documentsTab.onDraftCorrespondence}/>
          )}
          {activeTab==="communications"&&(
            <CommunicationsTab cs={cs} allegations={allegations} auditLog={auditLog} fmtDate={fmtDate} onOpenSource={openTimelineSource}/>
          )}
          {activeTab==="themes"&&(
            <ThemesTab cs={cs} organisationThemes={themesTab.organisationThemes} caseThemes={themesTab.caseThemes} suggestions={themesTab.themeSuggestions?.[cs.id]} suggesting={!!themesTab.themeSuggestionLoading?.[cs.id]} isHR={isHR} onSuggest={themesTab.onSuggestThemes} onConfirmSuggestion={themesTab.onConfirmThemeSuggestion} onDismissSuggestion={themesTab.onDismissThemeSuggestion} onAssignExisting={themesTab.onAssignExistingTheme} onRemove={themesTab.onRemoveTheme}/>
          )}
          {activeTab==="outcome"&&(
            <OutcomeTab cs={cs} stage={stage} fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal}/>
          )}
          {activeTab==="ai"&&(
            <AIAssistantTab cs={cs} chatHistory={aiTab.caseChatHistory[cs.id]||[]} chatInput={aiTab.caseChatInput} setChatInput={aiTab.setCaseChatInput} chatProcessing={aiTab.caseChatProcessing} sendChat={()=>aiTab.sendCaseChat(cs)} overview={aiTab.caseOverview[cs.id]} overviewLoading={!!aiTab.caseOverviewLoading[cs.id]} generateOverview={()=>aiTab.generateCaseOverview(cs)} overviewSources={aiTab.caseOverviewSources?.[cs.id]} onAskWhy={setWhySignal}/>
          )}
        </div>
      </div>
    </div>
  );
}
