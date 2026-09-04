import { useState, useEffect, useRef } from 'react';
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
import { resolveSignalRef as resolveSignalRefFor } from '../lib/resolveSignalRef';
import { computeCaseReadiness } from '../lib/caseReadiness';
import { investigationChecklistTasks, INVESTIGATION_CHECKLIST_STEPS } from '../lib/investigationChecklist';
import { investigationPlanTasks } from '../lib/investigationPlan';
import { SignalCard } from '../components/SignalCard';
import { WhySourcesModal } from '../components/WhySourcesModal';
import { PolicyCitation } from '../components/PolicyCitation';
import { CaseReadinessBadge } from '../components/CaseReadinessBadge';
import { InvestigatorChecklistView } from '../components/InvestigatorChecklistView';
import { NotetakerView } from '../components/NotetakerView';
import { ActionMenu } from '../components/design/ActionMenu';
import { usePopoverPosition } from '../hooks/usePopoverPosition';
import { FONT, COLOR, TYPE, RADIUS, BUTTON, CONTENT_MAX_WIDTH } from '../styles/tokens';

const ORDINAL = {2:"2nd",3:"3rd",4:"4th",5:"5th",6:"6th",7:"7th",8:"8th",9:"9th",10:"10th"};

// UAT Product Hierarchy pass, Part 6 — names what's generating in the
// Case Copilot's inline draft preview, matching the ids handleNextStepAction
// actually passes to setDraftedType/handleLetter above.
const DRAFTED_TYPE_LABELS = { invite:"invitation letter", outcome:"outcome letter", appeal:"appeal outcome letter", "no-case-answer":"response letter" };

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

// Phase 2A (Compass Design Vision) — purely a rendering-order/visual
// grouping of the same 12 tabs above; no id, route, or active-tab logic
// depends on this. Every tab still belongs to exactly one group (the
// three lists partition TABS completely) so nothing can silently
// disappear from the workspace if a tab is ever added without also
// being added here — that would just render ungrouped-nowhere, which is
// why this file's own tests check the partition is complete.
const TAB_GROUPS = [
  { label: "Case", ids: ["overview","timeline","allegations","evidence"] },
  { label: "Work", ids: ["meetings","people","tasks","documents","communications"] },
  { label: "Decision", ids: ["themes","outcome","ai"] },
];

// IA & User Journey pass, §11 — "aggressively reduce permanent case nav"
// down to Overview/Timeline/Evidence/More. These three (plus Overview,
// which the case always opens on) are the tabs a normal working session
// touches every time; the other nine are genuinely specialised or
// lower-frequency (allegations detail, meeting records, participants,
// tasks, documents, communications, themes, outcome, the AI assistant) —
// still one click away behind More, not removed. MORE_GROUPS is derived
// from TAB_GROUPS rather than a second hand-written list so the two can
// never drift apart: every tab not promoted to the permanent row above
// automatically ends up in More, under the same conceptual grouping this
// file already used for the old flat 12-tab row.
const PRIMARY_TAB_IDS = ["overview","timeline","evidence"];
const MORE_GROUPS = TAB_GROUPS
  .map(g => ({ label: g.label, ids: g.ids.filter(id => !PRIMARY_TAB_IDS.includes(id)) }))
  .filter(g => g.ids.length > 0);

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
    cases, casesLoading, activeCaseId, setScreen, confirmDialog, getCaseStage, getNextStep, fmtDate,
    getProceedingTitle, getCaseStatus, setMeetingSetup, getEmployeeRecord, orgMembers,
    setCaseInfo, saveCases, setReviewOutput, setMeetingType, showToast, currentUser,
    setLetterOutput, handleLetter, isHR, caseAccess, allegations, auditLog, caseTasks,
    createCaseTask, caseSignals, changeSignalStatus, toggleCaseTaskDone, setShowHandoffModal,
    generateInvestigationPlan, investigationPlanLoading, promptDialog, audit,
  } = shell;
  const {
    showAppealInput, setShowAppealInput, appealText, setAppealText, setShowReassignModal,
    setShowAssignInvestigatorModal, setShowOutcomeModal, setShowSignModal, letterOutput,
    aiProcessing, aiError, toggleNextStepDone, concludingInvestigation, investigationReportDraft, attemptSubmitInvestigation,
    openEscalateModal, openHrInterventionModal, generateNextBestAction, nextActionLoading,
    changesSinceView, changesSummary, changesSummaryLoading,
  } = header;
  const [showDraft, setShowDraft] = useState(false);
  const [draftedType, setDraftedType] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [whySignal, setWhySignal] = useState(null);
  const [changesBannerDismissed, setChangesBannerDismissed] = useState(false);
  // IA & User Journey pass, §11 — More tab popover; same open/outside-
  // click/Escape shape as AppSidebar's own More menu.
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const moreTabsRef = useRef(null);
  const moreTabsBtnRef = useRef(null);
  const moreTabsPopoverStyle = usePopoverPosition(moreTabsBtnRef, showMoreTabs, { minHeight: 260 });
  useEffect(() => {
    if (!showMoreTabs) return;
    const onKeyDown = e => { if (e.key === "Escape") setShowMoreTabs(false); };
    const onClickOutside = e => { if (moreTabsRef.current && !moreTabsRef.current.contains(e.target)) setShowMoreTabs(false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onClickOutside); };
  }, [showMoreTabs]);
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
  if(!cs) {
    // Phase 7.5B (P0 polish) — casesLoading distinguishes "the org's
    // cases genuinely haven't loaded yet" (a direct nav/reload/bookmark
    // to a case URL always hits this on first render, since activeCaseId
    // is read synchronously from the URL but `cases` starts empty) from
    // "cases have loaded and this id truly isn't in them" — the only
    // case that should ever say Not Found. Same loading affordance
    // (pulsing dot) already used for the app's own initial load and
    // lazy-route Suspense fallback, not a new pattern. Authorization/
    // retrieval itself is untouched — cs is still exactly
    // cases.find(x=>x.id===activeCaseId) above; this only changes what
    // renders while that result is still unreliable.
    if (casesLoading) return <div style={{padding:80,textAlign:"center"}}><span className="pu" style={{color:"#7C5CFC",fontSize:24}}>●</span></div>;
    return <div style={{padding:40,color:"#9B9098",fontFamily:FONT.sans}}>Case not found — <button onClick={()=>setScreen(SCREENS.CASES)} style={{color:"#7C5CFC",background:"none",border:"none",cursor:"pointer"}}>Back to cases</button></div>;
  }
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

  // Phase 2A (Compass Design Vision) — extracted verbatim from the Case
  // Copilot banner's own onClick (previously inline there, ~25 lines) so
  // the compact CaseHeader's single primary action button (below) can
  // call the exact same handler rather than a second, drifting copy of
  // this logic. Behaviour is byte-for-byte unchanged — same branches,
  // same side effects, same order — only its location moved from an
  // inline closure to a named function referenced from two places.
  const handleNextStepAction = () => {
    if(!nextStep) return;
    // meetingType-derived search term for finding "the meeting this step
    // is about" among cs.meetings — meeting records store the human
    // label (e.g. "Disciplinary Appeal", "Grievance"), not the
    // MEETING_TYPES id, so an "appeal-*" meetingType searches
    // generically for "appeal" rather than the id's own hyphenated form.
    const searchTerm = nextStep.meetingType?.startsWith("appeal-") ? "appeal" : nextStep.meetingType;
    const relevantMeeting = () => meetings.filter(m=>(m.type||"").toLowerCase().includes(searchTerm||""))[0]||meetings[meetings.length-1];
    if(nextStep.action==="start_investigation"||nextStep.action==="start_disciplinary"||nextStep.action==="start_appeal_meeting"||nextStep.action==="start_hearing"){setMeetingSetup(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type:nextStep.meetingType||"disciplinary"}));setCaseInfo(p=>({...p,employee:cs.employeeName,employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",_linkedCaseId:null}));setScreen(SCREENS.HOME+"_meeting");}
    else if(nextStep.action==="send_signature"){const m=relevantMeeting();if(m?.record){setReviewOutput(m.record);setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);setShowSignModal(true);}}
    else if(nextStep.action==="inv_report"){attemptSubmitInvestigation(cs.id);}
    else if(nextStep.action==="disciplinary_invite"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"disciplinary"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",evidence:cs.evidence||[]}));setMeetingType(MEETING_TYPES.find(t=>t.id==="disciplinary")||null);setShowDraft(true);setDraftedType("invite");handleLetter("invite",{inline:true});}
    else if(nextStep.action==="outcome_letter"){const m=relevantMeeting();if(m){setReviewOutput(m.record||"");setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);}saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"outcome"}:x));setShowDraft(true);setDraftedType("outcome");handleLetter("outcome",{inline:true});}
    else if(nextStep.action==="appeal_letter"){
      // Was previously handled identically to outcome_letter — drafted
      // an "outcome" letter and regressed stage from "appeal" back to
      // "outcome", even though the case had already progressed past
      // that point. The appeal is the final stage (ACAS Code); this
      // only closes on an explicit close_case, never silently un-does
      // progress.
      const m=relevantMeeting();if(m){setReviewOutput(m.record||"");setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);}setShowDraft(true);setDraftedType("appeal");handleLetter("appeal",{inline:true});
    }
    else if(nextStep.action==="close_case"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed"}:x));}
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

  const resolveSignalRef = (ref) => resolveSignalRefFor(ref, { meetings, allegations: caseAllegations, evidence: cs.evidence||[] });

  return(
    <div style={{minHeight:"100vh",background:COLOR.paper,fontFamily:FONT.sans,display:"flex",flexDirection:"column"}}>
      {/* Header (Phase 2A, Compass Design Vision) — compact CaseHeader:
          identity first, type/stage second (folded into the same line as
          the status badge), owner as trailing metadata, one primary
          action sourced from the same getNextStep logic the Case
          Copilot banner below already uses (handleNextStepAction,
          extracted above so both call the identical handler), everything
          else collapsed into one "More actions" menu. Every action here
          is the exact same handler the old five-button row called
          directly — Mark confidential/Reassign/Assign investigator/HR
          Intervention/Ask HR/+New meeting all still work identically,
          just reachable through one menu instead of five parallel
          buttons. Confidentiality gets its own small read-only indicator
          next to the status badge (a LockIcon pill) so that state stays
          visible at a glance even though the toggle action itself moved
          into the menu. */}
      <div style={{background:COLOR.surface,borderBottom:"1px solid #EDE5D8",padding:"16px 28px",flexShrink:0}}>
        {/* Phase 2A follow-up — the header band's background/border stay
            full-bleed (a workspace band, not a content card), but its
            inner content now shares the same centred CONTENT_MAX_WIDTH
            column as the tab content below, with the same 28px edge
            padding, so identity/actions/tabs line up with Overview's
            cards instead of a full-width header sitting over a
            narrower, independently-centred content block. */}
        <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,marginBottom:14,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
            <button onClick={()=>setScreen(SCREENS.CASES)} style={{background:"none",border:"none",color:COLOR.inkSoft,fontSize:13,cursor:"pointer",fontFamily:FONT.sans,padding:0,flexShrink:0}}>← Cases</button>
            <div style={{width:1,height:16,background:"#EDE5D8",flexShrink:0}}/>
            <div style={{minWidth:0}}>
              <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                <div style={{...TYPE.identity,fontSize:20,color:COLOR.ink}}>{cs.employeeName}</div>
                <span style={{fontSize:11,fontWeight:600,color:getCaseStatus(cs).color,background:getCaseStatus(cs).bg,borderRadius:RADIUS.pill,padding:"3px 10px",whiteSpace:"nowrap"}}>{getCaseStatus(cs).label}</span>
                {cs.confidential&&(
                  <span title="Visible only to authorised staff" style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,color:"#B87520",background:"#FEF5E7",borderRadius:RADIUS.pill,padding:"3px 10px",whiteSpace:"nowrap"}}><LockIcon size={10} />Confidential</span>
                )}
                {/* Phase 2A — investigationPaused used to be the HR
                    Intervention header BUTTON's own label ("Paused"),
                    genuinely visible status information, not just an
                    action — moving that button into "More actions" would
                    have made a paused investigation invisible at a
                    glance. Given its own persistent read-only indicator
                    here, same pattern as Confidential above; the toggle
                    action itself lives in the menu. */}
                {cs.investigationPaused&&(
                  <span title="Investigation paused by HR" style={{fontSize:11,fontWeight:600,color:"#B87520",background:"#FEF5E7",borderRadius:RADIUS.pill,padding:"3px 10px",whiteSpace:"nowrap"}}>Paused</span>
                )}
              </div>
              <div style={{...TYPE.metadata,color:COLOR.inkFaint,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {getProceedingTitle(cs)}{cs.manager&&<> · Owner: {cs.manager}</>}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
            {(()=>{
              const showNextStepPrimary = nextStep&&stage!=="closed";
              const primary = showNextStepPrimary
                ? { label: nextStep.action==="inv_report"&&concludingInvestigation?"Generating report...":nextStep.label, onClick: handleNextStepAction, disabled: nextStep.action==="inv_report"&&concludingInvestigation }
                : { label: "+ New meeting", onClick: startMeetingFromHeader };
              const menuActions = [
                { label: cs.confidential?"Remove confidentiality":"Mark confidential", onClick: async()=>{
                  const turningOn = !cs.confidential;
                  const ok = await confirmDialog(turningOn?{title:"Mark case confidential?",message:"Only you, the case creator, and HR Directors will be able to see this case. Other HR managers will lose access unless explicitly granted."}:{title:"Remove confidentiality?",message:"This case will become visible to every HR manager in the organisation again."});
                  if(!ok) return;
                  saveCases(cases.map(x=>x.id===cs.id?{...x,confidential:turningOn}:x));
                  showToast(turningOn?"Case marked confidential":"Case no longer confidential");
                } },
                { label: `Reassign (currently ${cs.manager||"unassigned"})`, onClick: ()=>setShowReassignModal(true) },
                isHR && { label: currentInvestigator?`Investigator: ${currentInvestigator.name}`:"Assign investigator...", onClick: ()=>setShowAssignInvestigatorModal(true) },
                isHR && { label: cs.investigationPaused?"Paused (HR Intervention)":"HR Intervention", onClick: ()=>openHrInterventionModal(cs.id) },
                !isHR && { label: "Ask HR", onClick: ()=>openEscalateModal(cs.id) },
                showNextStepPrimary && { label: "+ New meeting", onClick: startMeetingFromHeader },
              ];
              return (
                <>
                  <button onClick={primary.onClick} disabled={primary.disabled} style={{...BUTTON.primary,fontSize:13,padding:"9px 18px",cursor:primary.disabled?"not-allowed":"pointer",opacity:primary.disabled?0.6:1}}>{primary.label}</button>
                  <ActionMenu actions={menuActions}/>
                </>
              );
            })()}
          </div>
        </div>
        {/* IA & User Journey pass, §11 — the old flat/grouped 12-tab row
            (see git history) is reduced to the three tabs a normal
            working session touches every visit — Overview/Timeline/
            Evidence — plus a "More" popover for the other nine, grouped
            under the same Case/Work/Decision labels the old row already
            used (MORE_GROUPS derives from TAB_GROUPS above, so nothing
            here can silently omit a tab). No route, id, or active-tab
            logic changed — this is which control reaches each tab, not
            what the tabs are. */}
        <div style={{display:"flex",alignItems:"center",gap:2}} ref={moreTabsRef}>
          {TABS.filter(t=>PRIMARY_TAB_IDS.includes(t.id)).map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)}
              style={{padding:"6px 9px",borderRadius:6,border:"none",background:activeTab===t.id?COLOR.purpleTint:"none",color:activeTab===t.id?COLOR.purpleDeep:COLOR.inkSoft,fontWeight:activeTab===t.id?600:400,fontSize:13,cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap"}}>
              {t.label}
            </button>
          ))}
          {(()=>{
            const moreActive = !PRIMARY_TAB_IDS.includes(activeTab);
            const activeMoreTab = moreActive ? TABS.find(t=>t.id===activeTab) : null;
            // Same badge signal the old flat row gave per-tab, surfaced
            // on the collapsed trigger instead so "there's an open
            // allegation/task" doesn't silently disappear just because
            // those tabs moved behind More.
            const badgeCount = caseAllegations.length + caseTaskList.filter(x=>x.status!=="done").length;
            return (
              <div style={{position:"relative"}}>
                <button ref={moreTabsBtnRef} onClick={()=>setShowMoreTabs(v=>!v)} aria-expanded={showMoreTabs} aria-haspopup="true"
                  style={{padding:"6px 9px",borderRadius:6,border:"none",background:moreActive||showMoreTabs?COLOR.purpleTint:"none",color:moreActive?COLOR.purpleDeep:COLOR.inkSoft,fontWeight:moreActive?600:400,fontSize:13,cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5}}>
                  {activeMoreTab ? activeMoreTab.label : "More"}
                  {!moreActive&&badgeCount>0&&<span style={{fontSize:10,background:COLOR.border,color:COLOR.inkSoft,borderRadius:10,padding:"1px 6px",fontWeight:600}}>{badgeCount}</span>}
                  <span aria-hidden="true" style={{fontSize:9}}>▾</span>
                </button>
                {showMoreTabs&&moreTabsPopoverStyle&&(
                  <div role="menu" aria-label="More case tabs" style={{...moreTabsPopoverStyle,width:200,maxWidth:"calc(100vw - 24px)",background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:250,padding:"8px"}}>
                    {MORE_GROUPS.map((group,gi)=>(
                      <div key={group.label} style={{marginTop:gi>0?8:0}}>
                        <div style={{...TYPE.micro,color:COLOR.inkQuiet,padding:"4px 8px"}}>{group.label}</div>
                        {TABS.filter(t=>group.ids.includes(t.id)).map(t=>(
                          <button key={t.id} onClick={()=>{setActiveTab(t.id);setShowMoreTabs(false);}}
                            style={{display:"flex",alignItems:"center",width:"100%",textAlign:"left",background:activeTab===t.id?COLOR.purpleTint:"none",border:"none",color:activeTab===t.id?COLOR.purpleDeep:COLOR.ink,padding:"7px 8px",borderRadius:6,fontSize:13,fontWeight:activeTab===t.id?600:400,cursor:"pointer",fontFamily:FONT.sans}}>
                            {t.label}
                            {t.id==="allegations"&&caseAllegations.length>0&&<span style={{fontSize:10,marginLeft:5,background:COLOR.border,color:COLOR.inkSoft,borderRadius:10,padding:"1px 6px",fontWeight:600}}>{caseAllegations.length}</span>}
                            {t.id==="tasks"&&caseTaskList.filter(x=>x.status!=="done").length>0&&<span style={{fontSize:10,marginLeft:5,background:COLOR.border,color:COLOR.inkSoft,borderRadius:10,padding:"1px 6px",fontWeight:600}}>{caseTaskList.filter(x=>x.status!=="done").length}</span>}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
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
          <button onClick={()=>setChangesBannerDismissed(true)} style={{fontSize:11,color:"#5B3FD4",background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,flexShrink:0}}>Dismiss</button>
        </div>
      )}

      {/* Case Copilot — recommended next action, upgraded in place from the
          old "Next action" banner rather than adding a new element */}
      {nextStep&&stage!=="closed"&&(
        <div style={{background:"#F5F3FF",borderBottom:"1px solid #DDD9F5",padding:"12px 28px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div style={{minWidth:0}}>
              {/* UAT Product Hierarchy pass, Part 7 — "Next:" read as an
                  instruction Compass was enforcing rather than a
                  recommendation HR is free to act on differently. */}
              <div style={{fontSize:13,color:"#5B3FD4",fontWeight:600}}>Suggested next step: {nextStep.label}</div>
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
              {nextStep.secondary&&<button onClick={()=>{if(nextStep.secondary.action==="close_no_case"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed",closedReason:"no_case"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||""}));setShowDraft(true);setDraftedType("no-case-answer");handleLetter("no-case-answer",{inline:true});}}} style={{fontSize:12,background:"none",border:"1px solid #DDD9F5",borderRadius:6,padding:"6px 14px",color:"#6B6375",cursor:"pointer",fontFamily:FONT.sans}}>{nextStep.secondary.label}</button>}
              <button onClick={handleNextStepAction} disabled={nextStep.action==="inv_report"&&concludingInvestigation} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"6px 18px",color:"#fff",fontWeight:600,cursor:(nextStep.action==="inv_report"&&concludingInvestigation)?"not-allowed":"pointer",opacity:(nextStep.action==="inv_report"&&concludingInvestigation)?0.6:1,fontFamily:FONT.sans}}>{nextStep.action==="inv_report"&&concludingInvestigation?"Generating report...":nextStep.label+" →"}</button>
            </div>
          </div>

          {/* Inline draft preview — only for letter-generating actions */}
          {showDraft&&(
            <div style={{marginTop:12,background:"#FFFFFF",border:"1px solid #DDD9F5",borderRadius:10,padding:14}}>
              {/* UAT Product Hierarchy pass, Part 6 — a bare "Drafting…"
                  gave no sense of what was being generated, for whom, or
                  that anything was still happening. This banner already
                  sits below the case's full header/tabs (nothing here
                  hides page identity), so the fix is just naming the
                  letter type and employee and reassuring the user the
                  rest of the case is still usable while this finishes. */}
              {aiProcessing?(
                <div>
                  <div style={{fontSize:13,color:"#1A1535",fontWeight:600}}>Drafting your {DRAFTED_TYPE_LABELS[draftedType]||"letter"}...</div>
                  <div style={{fontSize:11,color:"#9B9098",marginTop:4}}>For {cs.employeeName}. Compass is still working — feel free to keep working elsewhere on this case meanwhile.</div>
                </div>
              ):aiError?(
                <div style={{fontSize:13,color:"#C84B2F"}}>{aiError}</div>
              ):(
                <>
                  <div style={{maxHeight:180,overflowY:"auto",fontSize:12,color:"#1A1535",lineHeight:1.6,paddingRight:4}}>
                    <MDRenderer text={letterOutput}/>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                    <button onClick={()=>handleLetter(draftedType,{inline:true})} style={{fontSize:12,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 14px",color:"#6B6375",cursor:"pointer",fontFamily:FONT.sans}}>Regenerate</button>
                    <button onClick={()=>setScreen(SCREENS.LETTER)} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"6px 14px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:FONT.sans}}>Open in Letter editor →</button>
                    <button onClick={()=>setShowDraft(false)} style={{fontSize:12,background:"none",border:"none",color:"#9B9098",cursor:"pointer",fontFamily:FONT.sans}}>Discard</button>
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
              <button onClick={()=>setShowDetails(v=>!v)} style={{fontSize:11,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",padding:0,marginTop:10,fontFamily:FONT.sans}}>{showDetails?"Hide details ▴":"Details ▾"}</button>
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
                style={{fontSize:12,background:"none",border:"1px solid #DDD9F5",borderRadius:6,padding:"6px 14px",color:"#7C5CFC",cursor:nextActionLoading?.[cs.id]?"not-allowed":"pointer",fontFamily:FONT.sans}}>
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
          <button onClick={()=>setShowAppealInput(p=>({...p,[cs.id]:true}))} style={{fontSize:12,background:"none",border:"1px solid #C84B2F",borderRadius:6,padding:"5px 14px",color:"#C84B2F",cursor:"pointer",fontFamily:FONT.sans}}>Employee is appealing</button>
        </div>
      )}
      {showAppealInput[cs.id]&&(
        <div style={{background:"#FEF5E7",borderBottom:"1px solid #F5E6C4",padding:"14px 28px",flexShrink:0}}>
          <div style={{fontSize:13,color:"#5B3FD4",fontWeight:500,marginBottom:8}}>Paste the employee appeal — Compass will use this for the appeal hearing:</div>
          <textarea aria-label="Employee appeal text" value={appealText[cs.id]||""} onChange={e=>setAppealText(p=>({...p,[cs.id]:e.target.value}))} rows={3} style={{width:"100%",background:"#FFFFFF",border:"1px solid #DDD9F5",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#1A1535",outline:"none",resize:"vertical",fontFamily:FONT.sans,boxSizing:"border-box",marginBottom:8}}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"appeal",appealText:appealText[cs.id]||""}:x));setShowAppealInput(p=>({...p,[cs.id]:false}));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||""}));setMeetingType(MEETING_TYPES.find(t=>t.id==="appeal-disciplinary")||null);handleLetter("invite");}} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"7px 16px",color:"#fff",cursor:"pointer",fontWeight:600,fontFamily:FONT.sans}}>Start appeal and send invitation</button>
            <button onClick={()=>setShowAppealInput(p=>({...p,[cs.id]:false}))} style={{fontSize:12,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"7px 14px",color:"#6B6375",cursor:"pointer",fontFamily:FONT.sans}}>Cancel</button>
          </div>
        </div>
      )}
      {/* Appeal — option to proceed to new disciplinary if appeal upheld/dismissed */}
      {stage==="appeal"&&(
        <div style={{background:"#FDFAF5",borderBottom:"1px solid #E8E0D0",padding:"10px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:"#9B9098"}}>Appeal in progress · {cs.disciplinaryOfficer?"Officer: "+cs.disciplinaryOfficer:"No officer assigned"}</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowHandoffModal(true)} style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500}}>
              {cs.disciplinaryOfficer?"Reassign officer":"Appoint appeal officer"}
            </button>
            <button onClick={()=>{saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed"}:x));showToast("Case closed");}} style={{fontSize:12,color:"#1A7A4A",background:"#E8F5EE",border:"none",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500}}>
              Close case
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div style={{flex:1,overflowY:"auto",padding:"24px 28px"}}>
        {/* Phase 2A follow-up — every tab now shares the same
            CONTENT_MAX_WIDTH (1200) column as the header/nav above (was
            a pre-existing, tab-agnostic 800 that left Overview's cards
            in an unbalanced narrow column under a full-width header, and
            would have misaligned every OTHER tab against the now-capped
            header if left at 800 while only Overview changed). One
            shared token, one coherent workspace width for every tab. */}
        <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto"}}>
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
            <MeetingsTab cs={cs} cases={cases} saveCases={saveCases} activeCaseStage={meetingsTab.activeCaseStage} setActiveCaseStage={meetingsTab.setActiveCaseStage} setMeetingSetup={setMeetingSetup} setCaseInfo={setCaseInfo} getEmployeeRecord={getEmployeeRecord} orgMembers={orgMembers} setScreen={setScreen} screens={screens} setReviewOutput={setReviewOutput} setMeetingType={setMeetingType} meetingTypes={MEETING_TYPES} fmtDate={fmtDate} attemptSubmitInvestigation={attemptSubmitInvestigation} concludingInvestigation={concludingInvestigation} investigationReportDraft={investigationReportDraft} setShowHandoffModal={setShowHandoffModal} setLetterOutput={setLetterOutput} onAcceptSavedSuggestion={meetingsTab.onAcceptSavedSuggestion} onDismissSavedSuggestion={meetingsTab.onDismissSavedSuggestion} promptDialog={promptDialog} audit={audit}/>
          )}
          {activeTab==="evidence"&&(
            <EvidenceTab cs={cs} cases={cases} saveCases={saveCases} currentUser={currentUser} showToast={showToast} setReviewOutput={setReviewOutput} setScreen={setScreen} screens={screens} fmtDate={fmtDate} setMeetingSetup={setMeetingSetup} setCaseInfo={setCaseInfo} orgMembers={orgMembers} allegations={caseAllegations} documentFindings={evidenceTab.documentFindings} documentAnalysisLoading={evidenceTab.documentAnalysisLoading} onAnalyseEvidence={(evidenceId)=>evidenceTab.analyseEvidenceDocument(cs, evidenceId)} onAcceptFinding={(evidenceId, finding)=>evidenceTab.acceptDocumentFinding(cs, evidenceId, finding)} onDismissFinding={(evidenceId, finding)=>evidenceTab.dismissDocumentFinding(cs, evidenceId, finding)} promptDialog={promptDialog} audit={audit}/>
          )}
          {activeTab==="people"&&(
            <PeopleTab cs={cs}/>
          )}
          {activeTab==="tasks"&&(
            <CaseTasksPanel cs={cs} tasks={caseTaskList} createCaseTask={createCaseTask} toggleCaseTaskDone={toggleCaseTaskDone} deleteCaseTask={deleteCaseTask} fmtDate={fmtDate} isHR={isHR} onGeneratePlan={()=>generateInvestigationPlan(cs)} planLoading={!!investigationPlanLoading[cs.id]}/>
          )}
          {activeTab==="documents"&&(
            <DocumentsTab cs={cs} setLetterOutput={setLetterOutput} setScreen={setScreen} screens={screens} fmtDate={fmtDate} onGenerateHearingPack={documentsTab.onGenerateHearingPack} hearingPackGenerating={!!documentsTab.hearingPackGenerating?.[cs.id]} hearingPackReady={documentsTab.hearingPackReady?.[cs.id]||null} onDismissHearingPackReady={()=>documentsTab.onDismissHearingPackReady?.(cs.id)} onDraftCorrespondence={documentsTab.onDraftCorrespondence}/>
          )}
          {activeTab==="communications"&&(
            <CommunicationsTab cs={cs} allegations={allegations} auditLog={auditLog} fmtDate={fmtDate} onOpenSource={openTimelineSource}/>
          )}
          {activeTab==="themes"&&(
            <ThemesTab cs={cs} organisationThemes={themesTab.organisationThemes} caseThemes={themesTab.caseThemes} suggestions={themesTab.themeSuggestions?.[cs.id]} suggesting={!!themesTab.themeSuggestionLoading?.[cs.id]} isHR={isHR} onSuggest={themesTab.onSuggestThemes} onConfirmSuggestion={themesTab.onConfirmThemeSuggestion} onDismissSuggestion={themesTab.onDismissThemeSuggestion} onAssignExisting={themesTab.onAssignExistingTheme} onRemove={themesTab.onRemoveTheme}/>
          )}
          {activeTab==="outcome"&&(
            <OutcomeTab cs={cs} stage={stage} fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal} canDecide={canDecide}/>
          )}
          {activeTab==="ai"&&(
            <AIAssistantTab cs={cs} chatHistory={aiTab.caseChatHistory[cs.id]||[]} chatInput={aiTab.caseChatInput} setChatInput={aiTab.setCaseChatInput} chatProcessing={aiTab.caseChatProcessing} sendChat={()=>aiTab.sendCaseChat(cs)} overview={aiTab.caseOverview[cs.id]} overviewLoading={!!aiTab.caseOverviewLoading[cs.id]} generateOverview={()=>aiTab.generateCaseOverview(cs)} overviewSources={aiTab.caseOverviewSources?.[cs.id]} onAskWhy={setWhySignal}/>
          )}
        </div>
      </div>
    </div>
  );
}
