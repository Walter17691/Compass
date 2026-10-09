import { useState, useEffect, useRef } from 'react';
import { SCREENS, MEETING_TYPES } from '../constants';
import { toISODateLocal, isPastLocalDate } from '../lib/dates';
import { appealInvitationLogistics } from '../lib/appealInvitation';
import { getCurrentRisk, isGrievanceCase } from '../lib/caseStage';
import { rollupInvestigationConclusions } from '../lib/investigationConclusion';
import { resolveNextStepMeeting, describeUnresolvedNextStep, NEXT_STEP_TARGET } from '../lib/nextStepTarget';
// Imported directly rather than threaded through as a prop like getNextStep:
// adding a callee inside App.jsx's component is what silently disabled lint
// analysis in an earlier phase, and this file already imports from lib above.
import { hasGuidedProcess } from '../lib/nextStep';
import { caseStatusLabel, isClosedStage, describeWhatIsHappening } from '../lib/caseViewSummary';
import { reasonForDefaultSurface, scheduledMeetingWhen, hasSubstantiveContext, hasCaseInformation } from '../lib/caseSurface';
import { caseWorkspaceDestinations, destinationForLegacyTab, DEFAULT_DESTINATION } from '../lib/caseWorkspace';
import { canRecordOutcome, hasReachedOutcomeStage } from '../lib/outcomeReachability';
import { hasGuidedStages } from '../lib/processStages';
import { CaseWorkspaceNav } from '../components/CaseWorkspaceNav';
import { InvestigationTab } from '../components/caseTabs/InvestigationTab';
import { isRiskExposureRelevant } from '../lib/tribunalExposureRelevance';
import { keyDateRelevance } from '../lib/caseKeyDates';
import { getProcessType } from '../lib/processStages';
import { getTemplateForType } from '../lib/processTemplates';
import { computeCaseRisk } from '../lib/caseRisk';
import { evaluateAutomationRules } from '../lib/automationRules';
import { CaseInformationPanel } from '../components/caseTabs/CaseInformationPanel';
import { TribunalExposurePanel } from '../components/caseTabs/TribunalExposurePanel';
import { CompassAnalysisPanel } from '../components/caseTabs/CompassAnalysisPanel';
import { ApprovalsPanel } from '../components/ApprovalsPanel';
import { HrReviewGatePanel } from '../components/HrReviewGatePanel';
import { AskHrPanel } from '../components/AskHrPanel';
import { CaseRolesPanel } from '../components/CaseRolesPanel';
import { resumableMeetingFor, scheduledMeetingsFor } from '../lib/meetingLifecycle';
import { fmtMeetingTime } from '../lib/meetingTiming';
import { MDRenderer } from '../components/MDRenderer';
import { DateInput } from '../components/DateInput';
import { LockIcon } from '../components/Icons';
import { AllegationsPanel } from '../components/AllegationsPanel';
import { TimelinePanel } from '../components/TimelinePanel';
import { CaseTasksPanel } from '../components/CaseTasksPanel';
import { MeetingsTab } from '../components/caseTabs/MeetingsTab';
import { EvidenceTab } from '../components/caseTabs/EvidenceTab';
import { PeopleTab } from '../components/caseTabs/PeopleTab';
import { DocumentsTab } from '../components/caseTabs/DocumentsTab';
import { CommunicationsTab } from '../components/caseTabs/CommunicationsTab';
import { ThemesTab } from '../components/caseTabs/ThemesTab';
import { OutcomeTab } from '../components/caseTabs/OutcomeTab';
import { GuardrailsPanel } from '../components/GuardrailsPanel';
import { allegationsForCase, linkEvidenceToAllegation } from '../lib/allegations';
import { mayRecordInvestigationNarrative, mayRecordInvestigationConclusion } from '../lib/investigationAuthority';
import { tasksForCase, hrNoteTasks } from '../lib/caseTasks';
import { openSignalsForCase } from '../lib/caseSignals';
import { resolveSignalRef as resolveSignalRefFor } from '../lib/resolveSignalRef';
import { computeCaseReadiness } from '../lib/caseReadiness';
import { computeDueSoon } from '../lib/deadlines';
import { investigationChecklistTasks, INVESTIGATION_CHECKLIST_STEPS } from '../lib/investigationChecklist';
import { investigationPlanTasks } from '../lib/investigationPlan';
import { WhySourcesModal } from '../components/WhySourcesModal';
import { InvestigatorChecklistView } from '../components/InvestigatorChecklistView';
import { NotetakerView } from '../components/NotetakerView';
import { ActionMenu } from '../components/design/ActionMenu';
import { FONT, COLOR, TYPE, RADIUS, BUTTON, CONTENT_MAX_WIDTH } from '../styles/tokens';

const ORDINAL = {2:"2nd",3:"3rd",4:"4th",5:"5th",6:"6th",7:"7th",8:"8th",9:"9th",10:"10th"};

// UAT Product Hierarchy pass, Part 6 — names what's generating in the
// Case Copilot's inline draft preview, matching the ids handleNextStepAction
// actually passes to setDraftedType/handleLetter above.
const DRAFTED_TYPE_LABELS = { invite:"invitation letter", outcome:"outcome letter", appeal:"appeal outcome letter", "no-case-answer":"response letter" };

// Wave B — the tab MODEL is gone, not just its row.
//
// TABS / TAB_GROUPS / PRIMARY_TAB_IDS / MORE_GROUPS described twelve destinations
// and which three were promoted. There are no destinations now: the case is one
// page, and the former tab contents are progressive sections whose ids come from
// lib/caseViewSummary.caseDetailSections(). Deleted rather than left unused,
// because a dormant tab model is what a future change would reach for.

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
export function CaseViewScreen({ onResumeMeeting, onStartScheduledMeeting, onPrepareScheduledMeeting, onOpenReviewForMeeting, onCancelScheduledMeeting, onRescheduleMeeting,
  shell = {}, header = {}, initialTab, clearInitialTab, deleteCaseTask,
  overview = {}, timeline = {}, allegationsTab = {}, meetingsTab = {},
  evidenceTab = {}, documentsTab = {}, themesTab = {}, aiTab = {},
}) {
  const {
    cases, casesLoading, activeCaseId, setScreen, confirmDialog, getCaseStage, getNextStep, fmtDate,
    // Wave B.1 — lets the case header link its employee name back to the
    // Employee File. Navigation only; no employee data is duplicated here.
    setActiveEmployeeId,
    getProceedingTitle, getCaseStatus, setMeetingSetup, getEmployeeRecord, getCaseEmployeeRecord, orgMembers,
    setCaseInfo, saveCases, setReviewOutput, onPresentMeetingRecord, setMeetingType, showToast, currentUser,
    setLetterOutput, onOpenInvestigationReport, handleLetter, isHR, caseAccess, allegations, auditLog, caseTasks,
    createCaseTask, caseSignals, changeSignalStatus, toggleCaseTaskDone, setShowHandoffModal,
    setShowAppealOfficerModal,
    generateInvestigationPlan, investigationPlanLoading, promptDialog, audit,
  } = shell;
  const {
    showAppealInput, setShowAppealInput, appealText, setAppealText, recordAppealReceived, setShowReassignModal,
    setShowAssignInvestigatorModal, setShowOutcomeModal, letterOutput,
    letterValidationIssues = [],
    aiProcessing, aiError, toggleNextStepDone, concludingInvestigation, investigationReportDraft, attemptSubmitInvestigation,
    openEscalateModal, openHrInterventionModal, generateNextBestAction, nextActionLoading,
    changesSinceView, changesSummary, changesSummaryLoading,
  } = header;
  const [showDraft, setShowDraft] = useState(false);
  const [draftedType, setDraftedType] = useState(null);
  // Appeal Invitation UAT P1 remediation (2026-09-19) — the essential
  // hearing logistics Compass cannot know on its own (date/time/location
  // or method). Collected here, deterministically, BEFORE any AI call —
  // never left for the model to invent or backfilled from unrelated state
  // (caseInfo.date, the employee's own location, etc). Local to this
  // component: these values are only ever meaningful for the one
  // structured appeal-invitation flow that sets them, never persisted as
  // component state beyond this single draft.
  const [showAppealInviteLogistics, setShowAppealInviteLogistics] = useState(false);
  const [appealInviteDate, setAppealInviteDate] = useState("");
  const [appealInviteTime, setAppealInviteTime] = useState("");
  const [appealInviteLocation, setAppealInviteLocation] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  // Wave B.2 corrective — the workspace below the case always has a destination
  // open. That is the point of horizontal navigation: there is no "everything
  // closed" state to scroll past, and no row to open before anything is visible.
  const [activeTab, setActiveTab] = useState(DEFAULT_DESTINATION);
  // "View full record" used to set a section that withRequestedSection appended
  // to the END of a long accordion — it opened correctly, a thousand pixels
  // below the fold, so clicking it appeared to do nothing. The workspace is now
  // scrolled to and focused, which is the behaviour the control always implied.
  const workspaceRef = useRef(null);
  const goToDestination = (id) => {
    setActiveTab(id);
    requestAnimationFrame(() => {
      const el = workspaceRef.current;
      if (!el) return;
      if (typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
      if (typeof el.focus === "function") el.focus({ preventScroll: true });
    });
  };
  const [whySignal, setWhySignal] = useState(null);
  // Wave B.2 — suspension has no authoritative trigger anywhere in the data
  // model (see caseKeyDates.js), so it keeps the same single narrow reveal it
  // always had. Only its entry point moved, into More actions.
  const [suspensionRevealed, setSuspensionRevealed] = useState(false);
  const [changesBannerDismissed, setChangesBannerDismissed] = useState(false);
  // IA & User Journey pass, §11 — More tab popover; same open/outside-
  // click/Escape shape as AppSidebar's own More menu.
  // Case Closure Safety P0 remediation — declared here, alongside every
  // other hook, rather than down by requestCloseCase's own definition
  // (which only *uses* it): this component has an early return above for
  // a not-yet-loaded/missing case, and React's hooks must never be called
  // conditionally relative to that.
  const [closingCase, setClosingCase] = useState(false);
  const cs = cases.find(x=>x.id===activeCaseId);
  // Release 1 Phase 2.2 — deterministic live-meeting discovery. Declared
  // status only; never inferred from record/transcript/latest-meeting.
  const liveMeeting = resumableMeetingFor(cs);
  // Release 1 Phase 2.3 — every meeting arranged on this case, soonest first.
  // A case may legitimately have several; no one-per-case rule is implied.
  const scheduledMeetings = scheduledMeetingsFor(cs);
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
  // Deep links speak the OLD section vocabulary and must still land.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- one-time, prop-driven sync on a genuine value change, same shape as this file's own changesBannerDismissed effect and the mailParam/calendarParam effects in App.jsx that this rule doesn't flag consistently.
  useEffect(() => { if(initialTab) { setActiveTab(destinationForLegacyTab(initialTab) || DEFAULT_DESTINATION); clearInitialTab?.(); } }, [initialTab]);
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
    if (casesLoading) return <div style={{padding:80,textAlign:"center"}}><span className="pu" style={{color:"#7A2FD8",fontSize:24}}>●</span></div>;
    return <div style={{padding:40,color:"#8A8EA3",fontFamily:FONT.sans}}>Case not found — <button onClick={()=>setScreen(SCREENS.CASES)} style={{color:"#7A2FD8",background:"none",border:"none",cursor:"pointer"}}>Back to cases</button></div>;
  }
  const meetings = cs.meetings||[];
  const stage = getCaseStage(cs);
  // Appeal Independence P1 (2026-09-18) — hoisted above currentAppealManager
  // et al. below so getNextStep's "no officer yet" gate and the existing
  // appeal-manager display block read the exact same case_access lookup,
  // never a second source of truth for appeal-manager state.
  const currentAppealManagerAccess = caseAccess.find(a=>a.caseId===cs.id && a.role==="appeal_manager");
  // Declared here rather than further down because the Slice 2 rollup below
  // needs it, and nextStep is computed before the old declaration site.
  const caseAllegations = allegationsForCase(allegations, cs.id);
  // ER Journey Slice 2 — the structured per-allegation investigation
  // conclusions are what the inv_report step now consults. Derived, never
  // stored: there is deliberately no case-level conclusion field for this to
  // disagree with.
  // A plain call, not useMemo: this sits below an early return, so a hook here
  // would be conditionally called (rules-of-hooks). It is a single pass over one
  // case's allegations and returns a frozen object, so memoising it buys nothing.
  const conclusionRollup = rollupInvestigationConclusions(caseAllegations);
  const nextStep = getNextStep(cs, {hasAppealManager: !!currentAppealManagerAccess, isHR, conclusionRollup});
  const currentRisk = getCurrentRisk(cs);
  const empRecord = getEmployeeRecord(cs.employeeName);
  // Open items from the deterministic NEXT_STEPS_MAP checklist saved onto
  // each meeting (App.jsx:1468-1470) — already feeds computeDueSoon but
  // was never rendered anywhere until now; ticking one off here removes
  // it from the overdue banner/Settings list/digest with no changes
  // needed to any of those three.
  const openChecklist = meetings.flatMap(m=>(m.nextSteps||[]).map((s,idx)=>({...s, meetingId:m.id, idx})).filter(s=>!s.done));
  // Phase E0.7 — "Nth case for X" counted by name, so two same-named colleagues
  // inflated each other's count. Canonical only; a legacy case reports 1 (itself)
  // rather than a number assembled from string matches.
  const repeatCount = cs.employeeId ? cases.filter(c=>c.employeeId===cs.employeeId).length : 1;
  const caseTaskList = tasksForCase(caseTasks, cs.id);
  const nextActionSignal = openSignalsForCase(caseSignals, cs.id, "next_action")[0];
  // P5 — a next_action signal may carry a real, indexed policy clause
  // (generateNextBestAction, App.jsx) rather than folding "your policy
  // requires X" anonymously into its reasoning prose.
  const nextActionPolicyRef = nextActionSignal?.sourceRefs?.find(r=>r.kind==="policy");
  const readiness = computeCaseReadiness(cs, allegations, caseSignals, caseTasks);

  // ── Wave B.2 — the pieces "Checks and analysis" used to compute for itself ──
  //
  // These are the SAME derivations OverviewTab made, lifted to the screen so
  // each one can be routed to a coherent section instead of a shared bucket.
  // Not one predicate changed: isRiskExposureRelevant and keyDateRelevance are
  // the original functions, moved to lib/ verbatim.
  const processTypeId = getProcessType(cs.caseType).id;
  const processTemplate = getTemplateForType(overview.processTemplates, processTypeId);
  const exposureCtx = { stage, currentRisk };
  const showRiskExposure = stage !== "closed" && isRiskExposureRelevant(cs, exposureCtx, processTypeId);
  const rawDateRelevance = keyDateRelevance(cs, exposureCtx, overview.wellbeingNotes, processTypeId);
  const dateRelevance = { ...rawDateRelevance, suspensionReviewDate: rawDateRelevance.suspensionReviewDate || suspensionRevealed };
  const hasKeyDates = Object.values(dateRelevance).some(Boolean);
  const compassRiskItems = computeCaseRisk(cs, { allegations, caseSignals, cases, auditLog, wellbeingNotes: overview.wellbeingNotes, dueSoon: overview.dueSoon });
  // caseTaskList, not caseTasks: the old call site narrowed tasks to THIS case
  // before handing them over, and widening that would change which automation
  // suggestions fire.
  const automationSuggestions = evaluateAutomationRules(cs, { caseTasks: caseTaskList, caseSignals });
  // Years of service feeds the basic-award multiplier. Fractional years by
  // design — see tribunalEstimate.js. Unchanged from OverviewTab.
  const yearsService = (() => {
    if(!empRecord?.startDate) return null;
    const start = new Date(empRecord.startDate.includes("/") ? empRecord.startDate.split("/").reverse().join("-") : empRecord.startDate);
    if(isNaN(start)) return null;
    return (Date.now()-start.getTime())/(1000*60*60*24*365.25);
  })();
  const screens = SCREENS;

  // Phase 15 — Manager Investigation Mode. caseAccess is org-wide (RLS
  // scopes SELECT by org, not by user — see baseline_schema_2026-08-06.sql),
  // so this filters down to just this case's grants client-side.
  const caseInvestigatorAccess = caseAccess.filter(a=>a.caseId===cs.id && a.role==="investigator");
  const currentInvestigatorAccess = caseInvestigatorAccess[caseInvestigatorAccess.length-1];
  const currentInvestigator = currentInvestigatorAccess ? orgMembers.find(m=>m.user_id===currentInvestigatorAccess.userId) : null;
  const myAccess = caseAccess.find(a=>a.caseId===cs.id && a.userId===currentUser?.user_id);
  // Independent appeal officer workflow (2026-09-16) — the one authoritative
  // appeal_manager relationship for this case, read the same way as
  // currentInvestigator above. Deliberately not derived from
  // cs.disciplinaryOfficer, which names a different person by design.
  // (currentAppealManagerAccess itself is computed earlier, above, and
  // reused here — see the getNextStep call site.)
  const currentAppealManager = currentAppealManagerAccess ? orgMembers.find(m=>m.user_id===currentAppealManagerAccess.userId) : null;
  const appealManagerName = currentAppealManager?.name || null;
  const isMyAppealManagerAssignment = myAccess?.role==="appeal_manager";
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

  // ── ER Journey Slice 1 — the right question at the right stage ───────────
  //
  // "Is the allegation substantiated?" is the DISCIPLINARY question. Asking it
  // during Investigation invites the investigator to decide the case before the
  // employee has been heard, which is the wrong adviser mental model and reads,
  // procedurally, as a finding reached before the hearing.
  //
  // hasReachedOutcomeStage is the EXISTING canonical test for "this process has
  // reached its decision point", and it is process-type aware: the stage
  // immediately before `outcome` is `disciplinary` for a misconduct track and
  // `hearing` for a grievance. Reused deliberately rather than writing a second
  // stage comparison that could drift from it.
  //
  // A case type with no guided stage model (hasGuidedStages false) is NOT
  // withheld from: Compass has no basis to say such a case has not reached its
  // decision point, and hiding the control there would make the existing
  // control unreachable on real historical cases rather than merely deferred.
  const atDecisionStage = !hasGuidedStages(cs.caseType) || hasReachedOutcomeStage(cs, stage);

  // The assigned investigator already exists as a case_access role with
  // allegation scope (isAssignedInvestigator above). They may write the
  // investigation NARRATIVE — the fields literally named for them — and nothing
  // else: not the status, not the reasoning, not the outcome. Deliberately a
  // separate, narrower gate than canDecide rather than widening canDecide.
  //
  // IR-REPORT-01b/B2 REVIEW: the two gates no longer nest. canDecide is NOT a
  // superset of narrative authority any more — the disciplinary officer holds
  // canDecide and not the narrative, because findings belong to the
  // investigation workflow. Both are enforced in the database independently.
  //
  // ── IR-REPORT-01a — TWO AUTHORITIES, NOT ONE ────────────────────────────
  //
  // These were one gate, and the conclusion control received it. But the
  // database rule for the conclusion is narrower than the rule for the
  // narrative: protect_allegations_investigation_conclusion_columns admits HR
  // or this case's assigned investigator and deliberately NOT the disciplinary
  // officer, because they are the person who will hear the case. So the officer
  // was shown "Record investigation conclusion", typed a conclusion and its
  // mandatory reasoning, and got a 42501 refusal on save.
  //
  // Both now come from pure functions in investigationAuthority.js that mirror
  // the two database rules, so the relationship between them is executable and
  // testable rather than an expression here. The database still enforces; this
  // only stops Compass offering a write that cannot land.
  const investigatorCaseRole = myAccess?.role || null;
  const canRecordInvestigation = mayRecordInvestigationNarrative({ isHR, caseRole: investigatorCaseRole });
  const canConcludeInvestigation = mayRecordInvestigationConclusion({ isHR, caseRole: investigatorCaseRole });
  // Independent appeal officer workflow (2026-09-16) — the appeal-decision
  // gate is deliberately separate from canDecide above. The original
  // disciplinary_officer does not gain appeal-decision authority merely
  // from that role (per the approved spec); only HR or this case's
  // currently-appointed appeal_manager may record an appeal outcome. This
  // mirrors protect_allegations_appeal_decision_columns() in
  // appeal_officer_workflow_2026-09-16.sql exactly, so the UI never offers
  // a control that the database would then reject.
  const canDecideAppeal = isHR || isMyAppealManagerAssignment;
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
    setMeetingSetup(p=>({...p,employeeId:cs.employeeId||null,employee:cs.employeeName,employeeJobTitle:getCaseEmployeeRecord?.(cs)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",type}));
    setCaseInfo(p=>({...p,employeeId:cs.employeeId||null,employee:cs.employeeName,employeeJobTitle:getCaseEmployeeRecord?.(cs)?.jobTitle||"",manager:cs.manager||"",chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"",_linkedCaseId:null}));
    setScreen(SCREENS.HOME+"_meeting");
  };

  // Phase 2A (Compass Design Vision) — extracted verbatim from the Case
  // Copilot banner's own onClick (previously inline there, ~25 lines) so
  // the compact CaseHeader's single primary action button (below) can
  // call the exact same handler rather than a second, drifting copy of
  // this logic. Behaviour is byte-for-byte unchanged — same branches,
  // same side effects, same order — only its location moved from an
  // inline closure to a named function referenced from two places.
  // ── Wave B — the composed case surface, derived from existing engines ─────
  //
  // getNextStep stays the sole authority on what happens next, buildCaseTimeline
  // on what happened, and getCaseStage on where the case is. Nothing here is a
  // second engine; it is presentation over those three.
  const statusLabel = caseStatusLabel(stage);
  const caseClosed = isClosedStage(stage);
  // Wave B.2 — the next-step reason is classified rather than rendered on
  // sight. Class A (a scheduled meeting's date) becomes one clause here;
  // class B (a genuine ambiguity) sits beside the action; class C stays in
  // the data and off the default surface.
  const scheduledWhen = scheduledMeetingWhen(nextStep);
  const exceptionReason = reasonForDefaultSurface(nextStep);
  const whatIsHappening = describeWhatIsHappening({ cs, stage, allegations: caseAllegations, meetings: cs.meetings || [], scheduledWhen });

  // Overdue work only. Taken from the SAME deadline engine the Employee File
  // uses, matched on this case's id — never on the deadline's own display name.
  // Wave B.1 — attention carries OTHER work, never a second copy of the primary
  // action. If the top item is the thing the header button already does, repeating
  // it immediately underneath is the repetition this wave exists to remove.
  const caseAttention = (overview.dueSoon || [])
    .filter(d => d && d.caseId === cs.id && d.overdue)
    .map(d => ({ key: d.key || d.caseId, label: d.label || "Overdue item",
                 context: d.daysOverdue ? `${d.daysOverdue} day${d.daysOverdue === 1 ? "" : "s"} overdue` : "Overdue" }))
    .filter(a => !nextStep?.label || a.label.trim().toLowerCase() !== nextStep.label.trim().toLowerCase());
  // Wave B.2 corrective — found in production UAT: "Note warning on HR record"
  // listed twice, identically, 20 days overdue both times. Two deadlines on the
  // same case with no `key` of their own both fall back to d.caseId, so they
  // collide as React keys AND read as one item said twice. Deduplicated on what
  // the user actually sees; the underlying deadline engine is untouched.
  const seenAttention = new Set();
  const caseAttentionDeduped = caseAttention.filter(a => {
    const sig = `${a.label}|${a.context}`;
    if (seenAttention.has(sig)) return false;
    seenAttention.add(sig);
    return true;
  });

  // Wave B.1 — this filtered on `sig.kind`, which case_signals does not have: the
  // field is `type`. So the gate never matched, and the guardrail block Wave B
  // claimed was prominent never rendered at all. It now uses the same helper the
  // Overview panel uses, so the two cannot disagree about what an open guardrail is.
  //
  // Conditional prominence is also the product decision: a safety-critical system
  // does not need an empty guardrail panel permanently occupying the surface. No
  // open guardrail, no block; a real one, and it is prominent.
  const openGuardrails = openSignalsForCase(caseSignals, cs.id, "process_risk");

  // A section the user has EXPLICITLY asked for always renders, even when empty.
  // Deep links (openTimelineSource, initialTab, the reply-capture "Update Meeting"
  // action) name a section directly, and an empty Participants list must not make
  // the link land on nothing. Empty sections still stay out of the default list.
  // ── Wave B.2 corrective — the horizontal workspace ────────────────────────
  //
  // caseDetailSections/withRequestedSection described an accordion and are gone
  // with it. caseWorkspace.js decides the destinations instead, from what each
  // thing IS: a stage, the meetings across stages, what was issued, the record,
  // the analysis — then administration, organisational classification and the
  // specialist estimator behind an overflow.
  const workspaceDestinations = caseWorkspaceDestinations({
    cs,
    allegations: caseAllegations,
    evidence: cs.evidence || [],
    meetings: cs.meetings || [],
    tasks: caseTaskList,
    documents: cs.evidence || [],
    communications: [],
    participants: (cs.meetings || []).flatMap(m => m?.participants || []),
    // HAS an outcome — unchanged meaning, used wherever "already decided" matters.
    hasOutcome: !!cs.outcome || stage === "outcome" || caseClosed,
    // CAN record one — the separate idea the destination also needs.
    outcomeReachable: canRecordOutcome(cs, stage),
    canSeeThemes: isHR,
    showExposure: showRiskExposure,
    hasCaseInformation: hasCaseInformation(cs, { repeatCount }) || hasKeyDates || !!processTemplate,
  });
  // activeTab still carries the value every existing deep link sets, translated
  // into the destination vocabulary so no saved link breaks.
  const activeDestination = destinationForLegacyTab(activeTab) || DEFAULT_DESTINATION;

  const handleNextStepAction = () => {
    if(!nextStep) return;
    // meetingType-derived search term for finding "the meeting this step
    // is about" among cs.meetings — meeting records store the human
    // label (e.g. "Disciplinary Appeal", "Grievance"), not the
    // MEETING_TYPES id, so an "appeal-*" meetingType searches
    // generically for "appeal" rather than the id's own hyphenated form.
    const searchTerm = nextStep.meetingType?.startsWith("appeal-") ? "appeal" : nextStep.meetingType;
    const relevantMeeting = () => meetings.filter(m=>(m.type||"").toLowerCase().includes(searchTerm||""))[0]||meetings[meetings.length-1];
    // Release 1 Phase 2.3 — the step already names the scheduled meeting, so
    // starting it transitions THAT meeting rather than setting up a new one.
    if(nextStep.action==="start_scheduled_meeting"){
      const m = (cs.meetings||[]).find(x=>x.id===nextStep.scheduledMeetingId);
      if(m) onStartScheduledMeeting?.(cs, m);
      return;
    }
    // Lifecycle reader consistency (2026-09-25) — the step can now name a
    // meeting that is already under way. Reuses the same onResumeMeeting the
    // amber banner calls, so both surfaces act on one meeting, never two.
    if(nextStep.action==="resume_meeting"){
      const m = (cs.meetings||[]).find(x=>x.id===nextStep.resumeMeetingId);
      if(m) onResumeMeeting?.(cs, m);
      return;
    }
    // Release 1 Phase 3A — review_draft is now a real persisted state, so this
    // reopens Review for that exact meeting instead of the placeholder that
    // opened the signature modal. It writes nothing and cannot complete the
    // meeting; confirming the record is Phase 3B.
    if(nextStep.action==="review_meeting_record"){
      const m = (cs.meetings||[]).find(x=>x.id===nextStep.reviewMeetingId);
      if(m) onOpenReviewForMeeting?.(cs, m);
      return;
    }
    if(nextStep.action==="start_investigation"||nextStep.action==="start_disciplinary"||nextStep.action==="start_appeal_meeting"||nextStep.action==="start_hearing"){
      // Appeal Hearing Control Remediation (2026-09-18) — a structured
      // appeal hearing (reached via "Start appeal hearing" with a current
      // appeal_manager already appointed) sources the hearing chair from
      // that authoritative case_access relationship, never from cs.manager
      // (a generic, unrelated field — see the Appeal Hearing UX discovery
      // report for why it was wrong here: it happened to hold the ORIGINAL
      // decision-maker's name on the discovery case). Every other entry in
      // this shared branch (investigation/disciplinary/generic hearing,
      // and an appeal somehow reached with no officer appointed — the
      // workflow engine no longer offers that as a next step, but this
      // stays defensive) keeps the exact prior behaviour unchanged.
      const isStructuredAppealHearing = nextStep.action==="start_appeal_meeting" && !!currentAppealManagerAccess;
      const chairName = isStructuredAppealHearing ? (appealManagerName||"") : (cs.manager||"");
      const chairJobTitle = isStructuredAppealHearing ? (currentAppealManager?.job_title||"") : ((orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"");
      // Appeal hearing sequencing P1 (2026-09-20) — the scheduled logistics
      // were captured before the invitation was drafted and persisted ON that
      // invitation, but nothing read them back: the date fell through to
      // today's default and time/method had nowhere to go, so the user was
      // asked to recreate what they had already entered. Seeded from the
      // latest valid saved invitation's STRUCTURED fields only — never its
      // save date, never the letter prose. Falls back to the existing
      // defaults when no invitation logistics exist, rather than inventing
      // values.
      const scheduled = isStructuredAppealHearing ? appealInvitationLogistics(cs) : null;
      setMeetingSetup(p=>({...p,
        employeeId:cs.employeeId||null,
        employee:cs.employeeName,
        employeeJobTitle:getCaseEmployeeRecord?.(cs)?.jobTitle||"",
        manager:chairName,
        chairJobTitle,
        type:nextStep.meetingType||"disciplinary",
        date:scheduled?.date||p.date,
        time:scheduled?.time||"",
        locationOrMethod:scheduled?.locationOrMethod||"",
        appealChairLocked:isStructuredAppealHearing,
        appealManagerId:isStructuredAppealHearing ? currentAppealManagerAccess.userId : null,
        appealGrounds:isStructuredAppealHearing ? (cs.appealText||"") : "",
        // Appeal Prep Pack P1 (2026-09-20) — the case this preparation is
        // grounded in. Deliberately NOT _linkedCaseId: that flag means
        // "file this record as witness evidence on a parent case" and
        // drives saveMeetingToCaseImpl's routing, so reusing it here would
        // misfile the hearing. This one only ever feeds prep grounding.
        preparedCaseId:cs.id,
      }));
      setCaseInfo(p=>({...p,
        employeeId:cs.employeeId||null,
        employee:cs.employeeName,
        employeeJobTitle:getCaseEmployeeRecord?.(cs)?.jobTitle||"",
        manager:chairName,
        chairJobTitle,
        _linkedCaseId:null,
        preparedCaseId:cs.id,
        // Release 1 Phase 2.1 — authoritative parentage (NEW-20). The meeting
        // is being started from inside this case, so its parent is known here
        // and is carried through to the save rather than re-derived from the
        // employee's name. Deliberately separate from preparedCaseId, which
        // means "the case this preparation was grounded in" and is read by
        // prep grounding and NEW-19's discovery gate.
        caseId:cs.id,
      }));
      setScreen(SCREENS.HOME+"_meeting");
    }
    // Trust Slice 1c — carries the persisted identity. Without it the sign modal
    // opened, collected an address, and then sendForSignature's own gate refused
    // because the ids were undefined: a dead end on a record that was eligible.
    // ── REVIEW & SEND — BY EXACT MEETING IDENTITY ────────────────────────
    //
    // Human UAT: this CTA did NOTHING. It resolved the meeting with
    // relevantMeeting() — FIRST type match by array position — while the engine
    // had reasoned about lastGenuineMeeting. On a case with three Investigation
    // meetings those are different meetings, and the one [0] found was a
    // review_draft with an empty record, so `if(m?.record)` fell through a guard
    // with no else and the click was swallowed.
    //
    // Now: the step NAMES the meeting, this resolves that id and nothing else,
    // and every failure says so out loud. It also opens REVIEW rather than the
    // signature modal — reopening and issuing are separate decisions, and the
    // record is read before it leaves the building. presentMeetingRecord is the
    // same authoritative path the Meetings tab uses, so both surfaces agree on
    // one meeting and one grounding.
    else if(nextStep.action==="send_signature"){
      const target = resolveNextStepMeeting(cs, nextStep);
      if(target.kind !== NEXT_STEP_TARGET.RESOLVED) {
        showToast?.(describeUnresolvedNextStep(target.kind), "error");
        return;
      }
      const m = target.meeting;
      onPresentMeetingRecord?.(m, {
        meetingType: MEETING_TYPES.find(t=>t.label===m.type)||null,
        caseInfo: { employee:cs.employeeName, manager:m.manager||cs.manager||"", date:m.date, caseId:cs.id },
      });
    }
    // D1 completion — the workflow can now say "Record outcome", so the action
    // must land somewhere. Opens the Outcome destination, where the decision is
    // recorded; it does NOT record anything itself.
    // setActiveTab, not goToDestination: the latter reads workspaceRef inside a
    // requestAnimationFrame, and this handler is constructed during render, so
    // calling it here trips react-hooks/refs. Same navigation, same state
    // setter goToDestination itself uses — only the scroll-into-view nicety is
    // skipped, and the destination is already in view from this control.
    else if(nextStep.action==="outcome"){setActiveTab("outcome");}
    else if(nextStep.action==="inv_report"){attemptSubmitInvestigation(cs.id);}
    else if(nextStep.action==="disciplinary_invite"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"disciplinary"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",evidence:cs.evidence||[],appealManagerId:null,isAppealHearingInvitation:false}));setMeetingType(MEETING_TYPES.find(t=>t.id==="disciplinary")||null);setShowDraft(true);setDraftedType("invite");handleLetter("invite",{inline:true,employeeName:cs.employeeName,manager:cs.manager||""});}
    else if(nextStep.action==="appeal_invite"){
      // Appeal Invitation UAT P1 remediation (2026-09-19) — generation no
      // longer fires immediately. The AI cannot know the hearing date/
      // time/location, and previously wasn't asked to wait for them —
      // it silently inherited stale caseInfo.date as if it were "the
      // meeting date" and placeholder'd everything else. The logistics
      // form (below) collects exactly those three facts deterministically
      // before any /api/chat call; see attemptGenerateAppealInvitation.
      setAppealInviteDate("");setAppealInviteTime("");setAppealInviteLocation("");
      setShowAppealInviteLogistics(true);
    }
    else if(nextStep.action==="outcome_letter"){const m=relevantMeeting();if(m){setReviewOutput(m.record||"");setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date,appealManagerId:null,isAppealHearingInvitation:false}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);}saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"outcome"}:x));setShowDraft(true);setDraftedType("outcome");handleLetter("outcome",{inline:true,employeeName:cs.employeeName,manager:cs.manager||"",date:m?.date});}
    else if(nextStep.action==="appeal_letter"){
      // Was previously handled identically to outcome_letter — drafted
      // an "outcome" letter and regressed stage from "appeal" back to
      // "outcome", even though the case had already progressed past
      // that point. The appeal is the final stage (ACAS Code); this
      // only closes on an explicit close_case, never silently un-does
      // progress.
      const m=relevantMeeting();if(m){setReviewOutput(m.record||"");setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date,appealManagerId:null,isAppealHearingInvitation:false}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);}setShowDraft(true);setDraftedType("appeal");handleLetter("appeal",{inline:true,employeeName:cs.employeeName,manager:cs.manager||"",date:m?.date});
    }
    else if(nextStep.action==="close_case"){requestCloseCase();}
    // ER Journey Slice 2. Two actions the inv_report step can now produce.
    //
    // investigation_conclusions just navigates — the conclusion is recorded on
    // the allegation itself, in the Investigation destination, and this step
    // exists to say what the case is waiting for rather than to do it.
    else if(nextStep.action==="investigation_conclusions"){setActiveTab("investigation");}
    // close_no_case was previously reachable ONLY from the secondary button in
    // the context strip. The structured conclusions can now make it the primary
    // action, so it needs a branch here too — the same requestCloseCase gate,
    // the same HR-only check, the same confirm dialog, the same letter.
    else if(nextStep.action==="close_no_case"){closeWithNoCaseToAnswer();}
    // Appeal Independence P1 (2026-09-18) — the suggested next step itself
    // must execute the correct action, not just relabel the button; opens
    // the same AppealOfficerModal the existing manual "Appoint appeal
    // officer" button (below, in the appeal-stage bar) already opens.
    else if(nextStep.action==="appoint_appeal_officer"){setShowAppealOfficerModal(true);}
  };

  // Appeal Invitation UAT P1 remediation (2026-09-19) — the deterministic
  // gate between the logistics form and generation. Blocks on exactly the
  // three facts the AI must never be left to invent/infer: a missing or
  // past hearing date, a missing time, or a missing location/method.
  // Mirrors validateFormalLetter's own isPastLocalDate usage so the "not
  // earlier than today" rule is defined once (lib/dates.js) and applied
  // identically at collection time here and at final-letter validation
  // time there.
  const appealInviteLogisticsErrors = [];
  if(!appealInviteDate) appealInviteLogisticsErrors.push("Add the hearing date.");
  else if(isPastLocalDate(appealInviteDate)) appealInviteLogisticsErrors.push("The hearing date cannot be in the past.");
  if(!appealInviteTime) appealInviteLogisticsErrors.push("Add the hearing time.");
  if(!appealInviteLocation.trim()) appealInviteLogisticsErrors.push("Add the hearing location or method.");

  const attemptGenerateAppealInvitation = () => {
    if(appealInviteLogisticsErrors.length>0) return;
    const hearingLogistics = { date: appealInviteDate, time: appealInviteTime, locationOrMethod: appealInviteLocation.trim() };
    // appealManagerId:null — this letter's own eventual meeting-save must
    // never inherit chair-integrity enforcement meant for the actual
    // hearing record (see saveMeetingToCaseImpl). isAppealHearingInvitation
    // + the three hearing fields ride on caseInfo (not just the local
    // hearingLogistics override passed to handleLetter below) so
    // LetterScreen's own later re-validation can see them too.
    setCaseInfo(p=>({...p,
      employee:cs.employeeName,
      manager:appealManagerName||"",
      evidence:cs.evidence||[],
      appealManagerId:null,
      isAppealHearingInvitation:true,
      hearingDate:hearingLogistics.date,
      hearingTime:hearingLogistics.time,
      hearingLocationOrMethod:hearingLogistics.locationOrMethod,
    }));
    setMeetingType(MEETING_TYPES.find(t=>t.id===(nextStep?.meetingType||"appeal-disciplinary"))||null);
    setShowAppealInviteLogistics(false);
    setShowDraft(true);setDraftedType("invite");
    handleLetter("invite",{inline:true,employeeName:cs.employeeName,manager:appealManagerName||"",hearingLogistics});
  };

  // Defect #17 remediation — a durable, always-available way to draft or
  // regenerate the outcome letter once cs.outcome is decided, independent
  // of Case Copilot's own single-track nextStep suggestion (which moves on
  // to "Close case" the moment a letter's been saved once, with no way
  // back — see nextStep.js's "outcome" stage branch). Mirrors the grounding
  // handleNextStepAction's own "outcome_letter" branch already does (same
  // relevant-meeting lookup, same caseInfo/reviewOutput/meetingType setup,
  // same handleLetter("outcome", {inline:true}) call — the one shared
  // generation pipeline, not a second weaker route) but deliberately does
  // NOT write cs.stage: getCaseStage now infers "outcome" from cs.outcome
  // directly (caseStage.js), so no manual stage write is needed here, and
  // not writing one avoids ever pinning an explicit stage this action has
  // no business deciding.
  const draftOutcomeLetter = () => {
    const relevant = meetings.filter(m=>(m.type||"").toLowerCase().includes(isGrievanceCase(cs)?"grievance":"disciplinary"))[0]||meetings[meetings.length-1];
    if(relevant){setReviewOutput(relevant.record||"");setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:relevant.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===relevant.type)||null);}
    setShowDraft(true);setDraftedType("outcome");handleLetter("outcome",{inline:true,employeeName:cs.employeeName,manager:cs.manager||"",date:relevant?.date});
  };

  // Case Closure Safety P0 remediation — the single, shared gate every
  // user-triggered "close this case" action on this screen now goes
  // through, replacing three independent one-click stage:"closed" writes
  // that had no confirmation, no re-validation at click time, and no
  // audit trail. Reuses nextStep.js as the sole authority on whether this
  // case's own type-specific lifecycle actually considers it ready to
  // close — the exact same condition that already decides whether a
  // "Close case" button is even shown/labelled that way — rather than
  // inventing a second, appeal-specific readiness model. This is what
  // closes the appeal-stage bypass: the standalone appeal "Close case"
  // button (below) used to write stage:"closed" unconditionally the
  // moment an appeal was raised, skipping the hearing/signature/outcome-
  // letter sequence nextStep.js itself requires before it would ever
  // recommend closing; it now goes through this same check and is denied
  // with the genuine next-step reason if the appeal isn't actually done.
  // allowNoCase exists only for the "No case to answer — close" secondary
  // action (nextStep.secondary.action==="close_no_case"), the one
  // legitimate closure path nextStep.js models that isn't its own
  // primary "close_case" recommendation.
  // Warnings reuse the same signals already computed on this screen
  // (readiness/computeDueSoon) rather than a new calculation — the same
  // sources CasesScreen's bulkClose already relies on. closingCase itself
  // is declared with the component's other hooks, above the early return.
  const requestCloseCase = async ({ allowNoCase = false, closeReasonLabel = null, afterClose = null } = {}) => {
    if (closingCase) return;
    // Destructive & Decision Authorization hardening (2026-09-13) — case
    // closure is now HR-only, enforced authoritatively by
    // protect_case_closure_trigger. Checked here, before the readiness
    // check, so a non-HR user gets a clear "you can't" message rather
    // than the misleading "not ready yet" one (which implies it would
    // work once ready). This is the single gate both the "Suggested next
    // step" close-case button and the appeal-stage standalone Close
    // button go through — neither is individually role-gated, since the
    // former also handles other, non-close next-step actions that remain
    // available to non-HR users.
    if (!isHR) { showToast("Only HR can close a case.", "error"); return; }
    const primaryReady = nextStep?.action === "close_case";
    // Slice 2 — close_no_case used to exist only as a secondary action. Once the
    // structured allegation conclusions all say "no case to answer" it becomes
    // the PRIMARY recommendation, so both positions have to count as ready. The
    // gate itself is unchanged: it still only ever agrees with what nextStep.js
    // currently recommends, which is now derived from the conclusions.
    const secondaryReady = allowNoCase
      && (nextStep?.secondary?.action === "close_no_case" || nextStep?.action === "close_no_case");
    if (!primaryReady && !secondaryReady) {
      showToast(nextStep ? `This case isn't ready to close yet — try "${nextStep.label}" first.` : "This case isn't ready to close yet.", "error");
      return;
    }

    // Set before the confirm dialog (not just around the save) so a rapid
    // repeat click can't open a second confirmation or fire a second save
    // while the first is still in flight — the real ConfirmModal's own
    // full-screen overlay already prevents this visually, but the guard
    // shouldn't depend on that alone.
    setClosingCase(true);
    try {
      const warnings = [];
      if (readiness.applicable && readiness.gaps.length > 0) {
        warnings.push(...readiness.gaps.map(g => g.detail));
      } else {
        const openTasks = caseTaskList.filter(t => t.status !== "done");
        if (openTasks.length > 0) warnings.push(openTasks.length === 1 ? "1 case task is still open." : `${openTasks.length} case tasks are still open.`);
      }
      const dueSoon = computeDueSoon([cs]);
      if (dueSoon.length > 0) warnings.push(`${dueSoon.length} live deadline${dueSoon.length === 1 ? "" : "s"} (e.g. an outstanding appeal window or a signature still pending) will stop being tracked once closed.`);

      const ok = await confirmDialog({
        title: "Close this case?",
        message: `This marks the case as closed. There's no general way to reopen it afterwards.${warnings.length ? " " + warnings.join(" ") : ""}`,
        confirmLabel: "Close case",
        danger: true,
      });
      if (!ok) return;

      const previousStage = stage;
      const result = await saveCases(cases.map(x => x.id === cs.id ? { ...x, stage: "closed" } : x), cs.id);
      if (result?.ok) {
        const reasonText = closeReasonLabel || nextStep?.reason || null;
        audit("Case closed", reasonText ? `Closed from ${previousStage} — ${reasonText}` : `Closed from ${previousStage}`, cs.id);
        showToast("Case closed");
        afterClose?.();
      }
    } finally {
      setClosingCase(false);
    }
  };

  // ER Journey Slice 2 — ONE close-no-case implementation, not two.
  //
  // This body used to live inline in the secondary button's onClick. Now that
  // the structured conclusions can make "No case to answer — close" the primary
  // recommendation, two call sites need it, and duplicating it would be exactly
  // the second decision path section D of the brief forbids.
  //
  // It remains a CONSEQUENCE, not a conclusion. It records no decision of its
  // own: the authoritative facts are the per-allegation conclusions already on
  // the allegations, and this transitions the case and offers the letter that
  // follows from them.
  const closeWithNoCaseToAnswer = () => requestCloseCase({
    allowNoCase: true,
    closeReasonLabel: "no case to answer",
    afterClose: () => {
      setCaseInfo(p=>({...p, employee: cs.employeeName, manager: cs.manager||""}));
      setShowDraft(true);
      setDraftedType("no-case-answer");
      handleLetter("no-case-answer", {inline:true, employeeName: cs.employeeName, manager: cs.manager||""});
    },
  });

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

  // ── IR-REPORT-01a — THE INVESTIGATOR'S OWN WRITES ───────────────────────
  //
  // Narrow callbacks, deliberately. InvestigatorChecklistView's prop contract
  // is a within-case minimisation boundary, so it is given the ability to make
  // these three writes without being handed `cases`, and the only org members
  // it receives are the ones already named by a conclusion on THIS case rather
  // than the org directory. Every write lands in the same column HR's panel
  // writes, through the same function — no second store.
  const setInvestigationEvidenceStance = (allegationId, evidenceId, stance) => {
    if(!evidenceId) return;
    // No stance default decided here: linkEvidenceToAllegation owns it, so
    // "unclassified until the investigator says otherwise" has one home.
    saveCases(cases.map(x => x.id===cs.id
      ? { ...x, evidence: linkEvidenceToAllegation(x.evidence||[], evidenceId, allegationId, stance) }
      : x), cs.id);
  };
  const conclusionAuthors = (orgMembers||[]).filter(m =>
    caseAllegations.some(a => a.investigationConclusionBy === m.user_id));

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
        canRecordNarrative={canRecordInvestigation}
        canRecordConclusion={canConcludeInvestigation}
        onPatchIssue={allegationsTab.patchAllegation}
        onRecordConclusion={allegationsTab.recordInvestigationConclusion}
        onSetEvidenceStance={setInvestigationEvidenceStance}
        onCreateIssue={fields=>allegationsTab.createAllegation?.(cs.id, fields)}
        conclusionAuthors={conclusionAuthors}
      />
    );
  }

  const openTimelineSource = (linkTo) => {
    if(!linkTo) return;
    // Allegations and evidence now live inside the investigation, so a record
    // entry linking to either opens that destination rather than a section.
    if(linkTo.kind==="meeting") goToDestination("meetings");
    else if(linkTo.kind==="allegation") goToDestination("investigation");
    else if(linkTo.kind==="letter"||linkTo.kind==="report") goToDestination("documents");
    else if(linkTo.kind==="outcome") goToDestination("outcome");
    else if(linkTo.kind==="evidence") goToDestination("investigation");
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
      <div style={{background:COLOR.surface,borderBottom:"1px solid #E3E5EE",padding:"16px 28px",flexShrink:0}}>
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
            <div style={{width:1,height:16,background:"#E3E5EE",flexShrink:0}}/>
            <div style={{minWidth:0}}>
              <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                {/* Wave B.1 — the employee name links back to their Employee File. A case
                    is a formal process belonging to a person, and arriving from the
                    cross-employee Cases view should make that ownership obvious and
                    traversable. Navigation only: the case is not a second employee record,
                    and nothing about the employee is duplicated here beyond their name.
                    Falls back to plain text when there is no canonical employee to link to. */}
                {cs.employeeId && setActiveEmployeeId ? (
                  <button type="button"
                    onClick={()=>{ setActiveEmployeeId(cs.employeeId); setScreen(SCREENS.EMPLOYEE_FILE); }}
                    style={{...TYPE.identity,fontSize:20,color:COLOR.ink,background:"none",border:"none",padding:0,
                            cursor:"pointer",fontFamily:FONT.sans,textAlign:"left",textDecoration:"underline",
                            textDecorationColor:COLOR.border,textUnderlineOffset:3}}>
                    {cs.employeeName}
                  </button>
                ) : (
                  <div style={{...TYPE.identity,fontSize:20,color:COLOR.ink}}>{cs.employeeName}</div>
                )}
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
                {getProceedingTitle(cs)} · {statusLabel}{cs.manager&&<> · Owner: {cs.manager}</>}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
            {(()=>{
              const showNextStepPrimary = nextStep&&stage!=="closed";
              // Wave B — a CLOSED case reads as completed history and offers no
              // workflow action. It previously fell through to "+ New meeting",
              // inviting the manager to reopen work on a finished process. Starting
              // a new meeting is still available, in the menu.
              const primary = showNextStepPrimary
                ? { label: nextStep.action==="inv_report"&&concludingInvestigation?"Generating report...":nextStep.label, onClick: handleNextStepAction, disabled: (nextStep.action==="inv_report"&&concludingInvestigation)||(nextStep.action==="close_case"&&closingCase) }
                : caseClosed ? null
                : { label: "+ New meeting", onClick: startMeetingFromHeader };
              const menuActions = [
                { label: cs.confidential?"Remove confidentiality":"Mark confidential", onClick: async()=>{
                  const turningOn = !cs.confidential;
                  const ok = await confirmDialog(turningOn?{title:"Mark case confidential?",message:"This records the case as confidential and restricts who may change it. It does not hide the case from colleagues who already have organisation-wide access."}:{title:"Remove confidentiality?",message:"This case will no longer be marked confidential."});
                  if(!ok) return;
                  saveCases(cases.map(x=>x.id===cs.id?{...x,confidential:turningOn}:x));
                  showToast(turningOn?"Case marked confidential":"Case no longer confidential");
                } },
                { label: `Reassign (currently ${cs.manager||"unassigned"})`, onClick: ()=>setShowReassignModal(true) },
                isHR && { label: currentInvestigator?`Investigator: ${currentInvestigator.name}`:"Assign investigator...", onClick: ()=>setShowAssignInvestigatorModal(true) },
                isHR && { label: cs.investigationPaused?"Paused (HR Intervention)":"HR Intervention", onClick: ()=>openHrInterventionModal(cs.id) },
                !isHR && { label: "Ask HR", onClick: ()=>openEscalateModal(cs.id) },
                (showNextStepPrimary || caseClosed) && { label: "+ New meeting", onClick: startMeetingFromHeader },
                // Wave B.1 — a UI relocation only. It was buried inside the former
                // Overview panels; it now sits last in the menu, with the SAME
                // isHR gate, the SAME danger confirmation and the SAME handler.
                // It must never be a primary action, and it is not one here.
                // Wave B.2 — "Record a suspension" is an ACTION. It was a bare link
                // under a tribunal-exposure calculator, which is nowhere a manager
                // would look for it. Same single reveal, same ungated visibility as
                // before (no role gate added or removed) — it simply opens Case
                // information with the suspension review date revealed.
                !dateRelevance.suspensionReviewDate && stage!=="closed" && {
                  label: "Record a suspension",
                  onClick: ()=>{ setSuspensionRevealed(true); goToDestination("information"); },
                },
                isHR && { label: "Delete case", onClick: async()=>{
                  const ok = await confirmDialog({title:"Delete case", message:"This will permanently delete this case and all its meeting records. This cannot be undone.", confirmLabel:"Delete", danger:true});
                  if(!ok) return;
                  saveCases(cases.filter(x=>x.id!==cs.id));
                  setScreen(screens.CASES);
                } },
              ];
              return (
                <>
                  {primary && <button onClick={primary.onClick} disabled={primary.disabled} style={{...BUTTON.primary,fontSize:13,padding:"9px 18px",cursor:primary.disabled?"not-allowed":"pointer",opacity:primary.disabled?0.6:1}}>{primary.label}</button>}
                  <ActionMenu actions={menuActions}/>
                </>
              );
            })()}
          </div>
        </div>
        {/* Wave B — the twelve-destination navigation is gone.

            It was three visible tabs plus a "More" popover holding nine more, so
            understanding a case meant navigating it: the chronology lived behind
            Timeline, the allegations behind More, and the default surface carried
            eleven analysis panels.

            Nothing is removed. The same panels render as progressive sections
            under Case details below, keyed on the SAME activeTab value — so every
            existing deep link (openTimelineSource, initialTab) keeps working and
            simply expands a section instead of switching a tab. */}
        </div>
      </div>

      {/* Phase 13 — "What Changed Since Last View." Dismissible for this
          viewing session only; reopening the case later recomputes a
          fresh diff against the just-updated last_viewed_at regardless. */}
      {changesSinceView?.length>0 && !changesBannerDismissed && (
        <div style={{background:"#F3EDFD",borderBottom:"1px solid #E8EAF2",padding:"10px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexShrink:0}}>
          <div style={{fontSize:12,color:"#7A2FD8",flex:1,minWidth:0}}>
            {changesSummaryLoading ? "Compass is summarising what's changed…" : (changesSummary || `${changesSinceView.length} update${changesSinceView.length!==1?"s":""} since you last viewed this case.`)}
          </div>
          <button onClick={()=>setChangesBannerDismissed(true)} style={{fontSize:11,color:"#7A2FD8",background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,flexShrink:0}}>Dismiss</button>
        </div>
      )}

      {/* Release 1 Phase 2.2 — a live meeting is authoritative server state,
          so it is stated before any recommendation. Deliberately the smallest
          possible affordance: the Case View redesign is a later phase, and
          this must not pre-empt it. Resume is deterministic (declared
          status "in_progress"), never inferred from record absence,
          transcript presence or "the latest meeting". */}
      {liveMeeting.meeting&&(
        <div style={{background:"#FFF6E8",borderBottom:"1px solid #F0D9B5",padding:"12px 28px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:13,color:"#8A5A17",fontWeight:600}}>
                {liveMeeting.meeting.type||"Meeting"} in progress{liveMeeting.meeting.startedAt?` — started ${fmtMeetingTime(liveMeeting.meeting.startedAt)}`:""}
              </div>
              <div style={{fontSize:11,color:"#4A4E63",marginTop:2}}>
                {/* Truthful about the Phase 2.2 boundary: the meeting itself
                    is saved, live notes are not yet. See the defect register
                    entry for the A/B split. */}
                This meeting is saved to the case. Notes typed during it are held on the device it was started on until the record is saved.
                {liveMeeting.ambiguous&&` ${liveMeeting.count} meetings on this case are marked in progress — showing the most recently started.`}
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexShrink:0}}>
              <button onClick={()=>onResumeMeeting?.(cs, liveMeeting.meeting)}
                style={{fontSize:12,background:"#8A5A17",border:"none",borderRadius:6,padding:"7px 14px",color:"#fff",cursor:"pointer",fontFamily:FONT.sans,fontWeight:600}}>
                Resume meeting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release 1 Phase 2.3 — meetings that are arranged but have not
          happened. A FUTURE event: never described as held. Minimal by
          design — the Case View redesign is a later phase. */}
      {scheduledMeetings.length>0&&(
        <div style={{background:"#F3F7FF",borderBottom:"1px solid #D5E0F5",padding:"12px 28px",flexShrink:0}}>
          {scheduledMeetings.map(m=>{
            // Deterministically knowable BEFORE the user tries to start:
            // this hearing's recorded chair is no longer the appointed
            // officer. Surfacing it early is a courtesy — the database
            // remains the control and will refuse the Start regardless.
            const isAppeal = (m.type||"").toLowerCase().includes("appeal");
            const chairStale = isAppeal && !!m.chairUserId && !!currentAppealManagerAccess && m.chairUserId !== currentAppealManagerAccess.userId;
            const when = [m.schedule?.date&&fmtDate(m.schedule.date), m.schedule?.time].filter(Boolean).join(" at ");
            const where = m.schedule?.location||m.schedule?.method||"";
            return (
              <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:6}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13,color:"#2E4F86",fontWeight:600}}>
                    {m.type||"Meeting"} scheduled{when?` — ${when}`:""}
                  </div>
                  <div style={{fontSize:11,color:"#4A4E63",marginTop:2}}>
                    {where&&<>{where} · </>}
                    {m.manager&&<>Chair: {m.manager} · </>}
                    Not yet held
                    {m.calendar?.syncedAt&&<> · In your calendar</>}
                    {m.invitation?.sentAt&&<> · Invitation sent</>}
                  </div>
                  {chairStale&&(
                    <div style={{fontSize:11,color:"#8A5A17",marginTop:4,fontWeight:600}}>
                      Appeal officer changed — this hearing must be rearranged under the current officer. Cancel it and schedule a replacement.
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:8,flexShrink:0}}>
                  <button onClick={()=>onPrepareScheduledMeeting?.(cs, m)}
                    style={{fontSize:12,background:"none",border:"1px solid #2E4F86",borderRadius:6,padding:"6px 12px",color:"#2E4F86",cursor:"pointer",fontFamily:FONT.sans}}>
                    Prepare
                  </button>
                  <button onClick={()=>onStartScheduledMeeting?.(cs, m)} disabled={chairStale}
                    style={{fontSize:12,background:chairStale?"#C4BAB0":"#2E4F86",border:"none",borderRadius:6,padding:"7px 14px",color:"#fff",cursor:chairStale?"not-allowed":"pointer",fontFamily:FONT.sans,fontWeight:600}}>
                    Start scheduled meeting
                  </button>
                  <button onClick={()=>onRescheduleMeeting?.(cs, m)}
                    style={{fontSize:12,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"6px 12px",color:"#4A4E63",cursor:"pointer",fontFamily:FONT.sans}}>
                    Reschedule
                  </button>
                  <button onClick={()=>onCancelScheduledMeeting?.(cs, m)}
                    style={{fontSize:12,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"6px 12px",color:"#4A4E63",cursor:"pointer",fontFamily:FONT.sans}}>
                    Cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phase E1.4 — an open case whose process Compass holds no recipe for.
          Deliberately not the purple Copilot banner and deliberately not a
          warning: the case is perfectly valid, Compass simply has nothing
          useful to say about how to run it, and saying so plainly is more
          honest than an empty space the user has to interpret. Rendered only
          when there is no recipe at all — a supported process sitting at a
          stage its own recipe does not cover keeps showing nothing, exactly as
          it did before. */}
      {!nextStep&&stage!=="closed"&&!hasGuidedProcess(cs)&&(
        <div style={{background:"#FAFAFB",borderBottom:"1px solid #E8E6EF",padding:"12px 28px",flexShrink:0}}>
          <div style={{fontSize:13,color:"#3F3A4D"}}>No guided next step is available for this process type.</div>
          <div style={{fontSize:11,color:"#4A4E63",marginTop:2}}>
            You can continue to record meetings, notes and documents on this case as normal.
          </div>
        </div>
      )}

      {/* Case Copilot — recommended next action, upgraded in place from the
          old "Next action" banner rather than adding a new element.

          Wave B.2 — this strip is no longer permanent. After B.1 removed the
          duplicate label and button, a full-width pale-purple band was left
          holding nothing but an explanation of the button above it, pushing the
          case record below the fold. It now renders ONLY when it has something
          substantive to carry: a genuine ambiguity, a secondary choice, a live
          investigation's progress, a persisted next-action signal, the appeal
          hearing-arrangements form, or an inline draft. On the screenshot's
          review_draft case it has none of those, so there is no strip at all. */}
      {nextStep&&stage!=="closed"&&hasSubstantiveContext({
        exceptionReason,
        hasSecondaryAction: !!nextStep.secondary,
        hasInvestigatorProgress: !!(isHR&&currentInvestigator),
        showAppealInviteLogistics,
        showInlineDraft: showDraft,
        hasOpenChecklist: openChecklist.length > 0,
      })&&(
        <div style={(()=>{
          // Wave B.2 corrective — the band is a container for substantive content.
          // When the ONLY thing left in it is the outstanding-steps disclosure, a
          // full-width pale-purple banner around a single link is the orphaned
          // strip again in miniature, so it loses the banner treatment and keeps
          // the content.
          const onlyChecklist = !exceptionReason && !nextStep.secondary && !(isHR&&currentInvestigator)
            && !showAppealInviteLogistics && !showDraft;
          return onlyChecklist
            ? {background:"transparent",borderBottom:"1px solid #E3E5EE",padding:"6px 28px",flexShrink:0}
            : {background:"#F3EDFD",borderBottom:"1px solid #E8EAF2",padding:"12px 28px",flexShrink:0};
        })()}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div style={{minWidth:0}}>
              {/* UAT Product Hierarchy pass, Part 7 — "Next:" read as an
                  instruction Compass was enforcing rather than a
                  recommendation HR is free to act on differently. */}
                {/* Wave B.1 — the duplicate next-step label is gone.
                    The header already carries the authoritative primary action from
                    getNextStep; repeating its label here, with a second copy of its
                    button below, said the same instruction three times on one screen.
                    What remains is CONTEXT: why, how ready the case is, and the
                    genuinely different secondary option. */}
              {/* Wave B.2 — only a CLASS B reason reaches this surface: one that
                  resolves a real ambiguity (more than one meeting in progress, so
                  "Resume meeting" is genuinely unclear about which). Class A state
                  became a clause in "What is happening"; class C rationale — the
                  ACAS citations and the engine restating its own label — stays on
                  the nextStep object and off the default surface. Nothing deleted. */}
              {exceptionReason&&<div style={{fontSize:11,color:"#4A4E63",marginTop:2}}>{exceptionReason}</div>}
              {/* Case readiness moved to Compass analysis — it is Compass's opinion
                  of the case, and beside the action it read as part of the
                  instruction rather than an assessment HR may disagree with. */}
              {isHR&&currentInvestigator&&(
                <div style={{fontSize:11,color:"#7A2FD8",marginTop:6}}>
                  Investigation by {currentInvestigator.name}: {checklistTasks.filter(t=>t.status==="done").length} of {INVESTIGATION_CHECKLIST_STEPS.length} steps complete
                  {currentInvestigatorAccess?.targetCompletionDate&&<> · Due {fmtDate(currentInvestigatorAccess.targetCompletionDate)}</>}
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,flexShrink:0}}>
              {nextStep.secondary&&<button onClick={()=>{if(nextStep.secondary.action==="close_no_case"){closeWithNoCaseToAnswer();}}} disabled={closingCase} style={{fontSize:12,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"6px 14px",color:"#4A4E63",cursor:closingCase?"not-allowed":"pointer",opacity:closingCase?0.6:1,fontFamily:FONT.sans}}>{nextStep.secondary.label}</button>}
            </div>
          </div>

          {/* Appeal Invitation UAT P1 remediation (2026-09-19) — the
              essential hearing logistics Compass cannot know on its own,
              collected before any AI call. Deliberately compact: exactly
              three fields, no meeting-type/employee/chair re-entry (the
              appointed appeal_manager, already shown as "Officer:" in the
              banner above, is authoritative and reused as-is). */}
          {showAppealInviteLogistics&&(
            <div style={{marginTop:12,background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:10,padding:14}}>
              <div style={{fontSize:13,color:"#0F1224",fontWeight:600,marginBottom:2}}>Hearing arrangements</div>
              <div style={{fontSize:11,color:"#8A8EA3",marginBottom:12}}>Compass needs these before it can draft the invitation — it will not guess a date, time, or venue.</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:10}}>
                <div style={{flex:"1 1 140px"}}>
                  <label htmlFor="appeal-invite-date" style={{display:"block",fontSize:11,fontWeight:600,color:"#0F1224",marginBottom:4}}>Hearing date</label>
                  {/* Date control consistency (Human UAT P2, 2026-09-20) —
                      was a raw <input type="date">, which the app-wide
                      indicator-hiding rule left with no visible calendar
                      affordance at all. Uses the established DateInput now
                      (custom Compass icon + showPicker on click); the
                      min-date restriction is unchanged and still blocks a
                      past hearing date at the same point it always did. */}
                  <DateInput id="appeal-invite-date" value={appealInviteDate} min={toISODateLocal(new Date())}
                    onChange={e=>setAppealInviteDate(e.target.value)}
                    style={{background:"#FFFFFF",borderRadius:8}}/>
                </div>
                <div style={{flex:"1 1 100px"}}>
                  <label htmlFor="appeal-invite-time" style={{display:"block",fontSize:11,fontWeight:600,color:"#0F1224",marginBottom:4}}>Hearing time</label>
                  <input id="appeal-invite-time" type="time" value={appealInviteTime}
                    onChange={e=>setAppealInviteTime(e.target.value)}
                    style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#0F1224",boxSizing:"border-box"}}/>
                </div>
                <div style={{flex:"2 1 220px"}}>
                  <label htmlFor="appeal-invite-location" style={{display:"block",fontSize:11,fontWeight:600,color:"#0F1224",marginBottom:4}}>Hearing method / location</label>
                  <input id="appeal-invite-location" type="text" placeholder="e.g. Microsoft Teams, or Manchester Head Office" value={appealInviteLocation}
                    onChange={e=>setAppealInviteLocation(e.target.value)}
                    style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#0F1224",boxSizing:"border-box"}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={attemptGenerateAppealInvitation} disabled={appealInviteLogisticsErrors.length>0} style={{fontSize:12,background:appealInviteLogisticsErrors.length>0?"#E8EAF2":"#7A2FD8",border:"none",borderRadius:6,padding:"6px 14px",color:appealInviteLogisticsErrors.length>0?"#8A8EA3":"#fff",fontWeight:600,cursor:appealInviteLogisticsErrors.length>0?"not-allowed":"pointer",fontFamily:FONT.sans}}>Continue →</button>
                <button onClick={()=>setShowAppealInviteLogistics(false)} style={{fontSize:12,background:"none",border:"none",color:"#8A8EA3",cursor:"pointer",fontFamily:FONT.sans}}>Cancel</button>
                {appealInviteLogisticsErrors.length>0&&<span style={{fontSize:11,color:"#B87520"}}>{appealInviteLogisticsErrors[0]}</span>}
              </div>
            </div>
          )}

          {/* Inline draft preview — only for letter-generating actions */}
          {showDraft&&(
            <div style={{marginTop:12,background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:10,padding:14}}>
              {/* UAT Product Hierarchy pass, Part 6 — a bare "Drafting…"
                  gave no sense of what was being generated, for whom, or
                  that anything was still happening. This banner already
                  sits below the case's full header/tabs (nothing here
                  hides page identity), so the fix is just naming the
                  letter type and employee and reassuring the user the
                  rest of the case is still usable while this finishes. */}
              {aiProcessing?(
                <div>
                  <div style={{fontSize:13,color:"#0F1224",fontWeight:600}}>Drafting your {DRAFTED_TYPE_LABELS[draftedType]||"letter"}...</div>
                  <div style={{fontSize:11,color:"#8A8EA3",marginTop:4}}>For {cs.employeeName}. Compass is still working — feel free to keep working elsewhere on this case meanwhile.</div>
                </div>
              ):aiError?(
                <div style={{fontSize:13,color:"#C84B2F"}}>{aiError}</div>
              ):(
                <>
                  <div style={{maxHeight:180,overflowY:"auto",fontSize:12,color:"#0F1224",lineHeight:1.6,paddingRight:4}}>
                    <MDRenderer text={letterOutput}/>
                  </div>
                  {/* Human UAT hotfix (2026-09-19) — the same
                      validateFormalLetter issues LetterScreen renders, shown
                      here too so an inline-generated draft explains itself on
                      the screen the user is actually on. Deliberately placed
                      immediately above the draft actions, since it explains
                      why those actions are limited. Not a second validation
                      source: these come from the one generation-time result
                      (App.jsx's letterValidationIssues). */}
                  {letterValidationIssues.length>0&&(
                    <div style={{background:"#FEF0EB",border:"1px solid #E8A08A",borderRadius:8,padding:"10px 12px",marginTop:10}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#B8341F",marginBottom:6}}>This draft needs review before it can be used</div>
                      <ul style={{margin:0,paddingLeft:18,fontSize:12,color:"#8A2A18"}}>
                        {letterValidationIssues.map((issue,i)=>(<li key={i} style={{marginBottom:2}}>{issue}</li>))}
                      </ul>
                      <div style={{fontSize:12,color:"#8A2A18",marginTop:8}}>
                        Saving, downloading, sending and signing are disabled until this is corrected. Open it in the Letter editor to edit the text, or regenerate.
                      </div>
                    </div>
                  )}
                  <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                    <button onClick={()=>handleLetter(draftedType,{inline:true})} style={{fontSize:12,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"6px 14px",color:"#4A4E63",cursor:"pointer",fontFamily:FONT.sans}}>Regenerate</button>
                    <button onClick={()=>setScreen(SCREENS.LETTER)} style={{fontSize:12,background:"#7A2FD8",border:"none",borderRadius:6,padding:"6px 14px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:FONT.sans}}>Open in Letter editor →</button>
                    <button onClick={()=>setShowDraft(false)} style={{fontSize:12,background:"none",border:"none",color:"#8A8EA3",cursor:"pointer",fontFamily:FONT.sans}}>Discard</button>
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
              <button onClick={()=>setShowDetails(v=>!v)} style={{fontSize:11,color:"#7A2FD8",background:"none",border:"none",cursor:"pointer",padding:0,marginTop:10,fontFamily:FONT.sans}}>{showDetails?"Hide details ▴":"Details ▾"}</button>
              {showDetails&&(
                <div style={{marginTop:8}}>
                  {openChecklist.length>0&&(
                    <div style={{marginBottom:repeatCount>1?10:0}}>
                      {openChecklist.map((item,i)=>(
                        <label key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#0F1224",padding:"3px 0",cursor:"pointer"}}>
                          <input type="checkbox" checked={false} onChange={()=>toggleNextStepDone(cs.id, item.meetingId, item.idx)} style={{cursor:"pointer"}}/>
                          <span style={{flex:1}}>{item.step}</span>
                          {item.deadline&&<span style={{color:"#8A8EA3",fontSize:11}}>{item.deadline}</span>}
                        </label>
                      ))}
                    </div>
                  )}
                  {repeatCount>1&&<div style={{fontSize:12,color:"#8A8EA3"}}>{ORDINAL[repeatCount]||repeatCount+"th"} case for {cs.employeeName}.</div>}
                </div>
              )}
            </>
          )}

          {/* Compass's own take — advisory, separate from the deterministic
              step above it. Persisted as a next_action case_signal so it
              can be accepted/dismissed/marked-not-relevant rather than
              only living as a re-generated string on every visit. */}
          {/* Wave B.2 — the persisted next-action signal and the control that
              requests one both moved to Compass analysis. A shortcut to an opinion
              did not warrant a full-width band under the case header, and Compass
              analysis is now the one home for advisory intelligence rather than a
              competing surface. */}
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
          <div style={{fontSize:13,color:"#7A2FD8",fontWeight:500,marginBottom:8}}>Record the employee's appeal grounds:</div>
          <textarea aria-label="Employee appeal text" value={appealText[cs.id]||""} onChange={e=>setAppealText(p=>({...p,[cs.id]:e.target.value}))} rows={3} style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#0F1224",outline:"none",resize:"vertical",fontFamily:FONT.sans,boxSizing:"border-box",marginBottom:8}}/>
          <div style={{display:"flex",gap:8}}>
            {/* Appeal UAT remediation (2026-09-18) — this used to be
                "Start appeal and send invitation", which recorded the
                appeal AND immediately navigated into the AI letter
                composer as one inseparable action — the authoritative
                appeal-received event (stage + audit) was already fully
                persisted before that navigation happened, but there was
                no way to record the appeal and stop there. Save appeal
                now does exactly what recordAppealReceived already does on
                its own: persist stage="appeal" and the grounds text in
                one atomic write, log "Appeal received", and close this
                panel — no meeting context, no AI call, no screen
                navigation. Preparing the appeal hearing invitation
                remains fully reachable afterward via the case's own
                existing "Suggested next step: Start appeal hearing"
                action (getNextStep, lib/nextStep.js — already resolves to
                meetingType:"appeal-disciplinary" the moment stage is
                "appeal"), so nothing about reaching the invitation is
                lost by removing the combined shortcut. */}
            <button onClick={async ()=>{
              const ok = await recordAppealReceived(cs.id, { appealText: appealText[cs.id] || "" });
              if(!ok) return;
              setShowAppealInput(p=>({...p,[cs.id]:false}));
            }} style={{fontSize:12,background:"#7A2FD8",border:"none",borderRadius:6,padding:"7px 16px",color:"#fff",cursor:"pointer",fontWeight:600,fontFamily:FONT.sans}}>Save appeal</button>
            <button onClick={()=>setShowAppealInput(p=>({...p,[cs.id]:false}))} style={{fontSize:12,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"7px 14px",color:"#4A4E63",cursor:"pointer",fontFamily:FONT.sans}}>Cancel</button>
          </div>
        </div>
      )}
      {/* Appeal — option to proceed to new disciplinary if appeal upheld/dismissed */}
      {stage==="appeal"&&(
        <div style={{background:"#FFFFFF",borderBottom:"1px solid #E8EAF2",padding:"10px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          {/* Independent appeal officer workflow (2026-09-16) — reads the
              real, authoritative appeal_manager case_access relationship,
              not cs.disciplinaryOfficer (that field belongs to the
              original disciplinary hand-off and is a different person by
              design — see AppealOfficerModal.jsx's own header comment for
              why this used to be wrongly conflated). */}
          <div style={{fontSize:12,color:"#8A8EA3"}}>Appeal in progress · {appealManagerName?"Officer: "+appealManagerName:"No officer assigned"}</div>
          <div style={{display:"flex",gap:8}}>
            {isHR&&(
              <button onClick={()=>setShowAppealOfficerModal(true)} style={{fontSize:12,color:"#7A2FD8",background:"#EDE8FF",border:"none",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500}}>
                {appealManagerName?"Reassign officer":"Appoint appeal officer"}
              </button>
            )}
            <button onClick={()=>requestCloseCase()} disabled={closingCase} style={{fontSize:12,color:"#1A7A4A",background:"#E8F5EE",border:"none",borderRadius:7,padding:"6px 14px",cursor:closingCase?"not-allowed":"pointer",opacity:closingCase?0.6:1,fontFamily:FONT.sans,fontWeight:500}}>
              Close case
            </button>
          </div>
          {/* Appeal UAT remediation (2026-09-18) — the durably-persisted
              grounds (cases.appeal_text), displayed concisely in the same
              existing appeal-stage bar rather than a new permanent
              Overview section. Read-only: once stage is "appeal" the
              recording panel above no longer renders, and there is no
              other control that writes this field — see the migration's
              own header for why an audited edit model wasn't built for
              Release 1.0. */}
          {cs.appealText&&(
            <div style={{fontSize:12,color:"#4A4E63",width:"100%"}}>
              <span style={{fontWeight:600,color:"#8A8EA3"}}>Appeal grounds: </span>
              {cs.appealText.length>200?cs.appealText.slice(0,200)+"…":cs.appealText}
            </div>
          )}
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
        {/* ── Wave B — the composed case surface ────────────────────────────
            Header (above) → what is happening → what needs doing → the record →
            supporting detail. The manager reads down the page instead of
            navigating across twelve destinations. */}
        <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"0 28px 40px"}}>

          {/* WHAT IS HAPPENING — assembled from counts and lifecycle state. No AI,
              no narrative generation, and nothing said that the case does not
              already record. Renders nothing when there is nothing factual. */}
          {whatIsHappening && (
            <section style={{marginTop:20}}>
              <h2 style={{...TYPE.sectionHeading,color:COLOR.ink,margin:"0 0 6px"}}>What is happening</h2>
              <p style={{...TYPE.rowContext,color:COLOR.inkSoft,margin:0,lineHeight:1.6,maxWidth:640}}>{whatIsHappening}</p>
              {/* The explanation deliberately does NOT repeat here: it already sits
                  with the readiness context above. One state sentence, one
                  explanation, one action. */}
            </section>
          )}

          {/* NEEDS YOUR ATTENTION — overdue work only, from the engines that already
              own it. The primary action lives in the header and is deliberately NOT
              repeated here: the screen should not say the same instruction three
              times. */}
          {caseAttentionDeduped.length > 0 && (
            <section style={{marginTop:28}}>
              <h2 style={{...TYPE.sectionHeading,color:COLOR.ink,margin:"0 0 10px"}}>Needs your attention</h2>
              {/* Wave B.2 final cleanup — three full-width tinted cards consumed most
                  of a viewport before the user reached any work. The amber is
                  SEMANTIC here (these are overdue) so it stays, but as a left rule on
                  one compact row rather than a filled card each: same meaning, same
                  urgency, roughly a third of the height. Nothing is hidden — the
                  overflow link still reaches every item. */}
              <ul style={{listStyle:"none",margin:0,padding:0,border:`1px solid ${COLOR.border}`,
                          borderRadius:RADIUS.card,overflow:"hidden"}}>
                {caseAttentionDeduped.slice(0,3).map((a,i)=>(
                  <li key={a.key} style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",
                        gap:12,flexWrap:"wrap",padding:"9px 14px",background:COLOR.surface,
                        borderLeft:`3px solid ${COLOR.amber}`,
                        borderTop:i===0?"none":`1px solid ${COLOR.borderFaint}`}}>
                    <span style={{...TYPE.rowContext,color:COLOR.ink,minWidth:0}}>{a.label}</span>
                    {a.context && <span style={{...TYPE.metadata,color:COLOR.amber,flexShrink:0}}>{a.context}</span>}
                  </li>
                ))}
              </ul>
              {caseAttentionDeduped.length > 3 && (
                <button type="button" onClick={()=>goToDestination("tasks")}
                  style={{...TYPE.metadata,background:"none",border:"none",padding:0,marginTop:8,color:COLOR.purple,cursor:"pointer",fontFamily:FONT.sans}}>
                  View all {caseAttentionDeduped.length}
                </button>
              )}
            </section>
          )}

          {/* Wave B.2 — approvals, the HR review gate and an open Ask HR request are
              process BLOCKERS, not analysis. They sat inside "Case readiness" in the
              legacy bucket, where work that stops the case needed two clicks to find.
              Each panel already returns null when it has nothing to show, so this is
              conditional by construction — no empty container ever appears. */}
          <section>
            <ApprovalsPanel cs={cs} hrReviewRequests={overview.hrReviewRequests}
              respondToReview={overview.respondToReview} isApprover={isHR}/>
            <HrReviewGatePanel cs={cs} hrReviewRequests={overview.hrReviewRequests}
              resolveInvestigationReview={overview.resolveInvestigationReview} isHR={isHR}/>
            <AskHrPanel cs={cs} hrReviewRequests={overview.hrReviewRequests}
              respondToReview={overview.respondToReview} isHR={isHR}/>
          </section>

          {/* GUARDRAILS stay on the main surface. They are deterministic process-risk
              signals carrying policy citations, and proceeding past one is a recorded
              policy deviation — safety-critical information is not hidden for visual
              cleanliness. Wave B.2 did not touch this. */}
          {openGuardrails.length > 0 && (
            <section style={{marginTop:28}}>
              <GuardrailsPanel cs={cs} signals={openGuardrails} changeSignalStatus={changeSignalStatus}
                createCaseTask={createCaseTask} onAskWhy={setWhySignal}
                requestOverrideReason={overview.requestOverrideReason}
                requestPolicyDeviationReason={overview.requestPolicyDeviationReason}/>
            </section>
          )}

          {/* THE CASE RECORD summary and its "View full record" link used to sit here.
              Both are gone: the workspace now has a first-class Record destination that
              owns the chronology outright, so a compact copy above it was the same
              concept twice, occupying the most valuable space on the screen. Nothing
              underneath was removed — TimelinePanel, buildCaseTimeline, the process
              stage strip, filters, export and the audit history all live in Record. */}
          {/* THE CASE WORKSPACE — horizontal, and derived from what each thing
              actually IS rather than from the old row list. A procedural stage, the
              meetings that run across every stage, what was issued, the chronology
              and Compass's analysis are the jobs; organisational classification, a
              specialist calculator and administration are not peers of those and sit
              behind a deliberate overflow. The bar measures itself and never wraps,
              and never falls back to a stacked list. */}
          <section style={{marginTop:36}}>
            {(()=>{
                const WORKSPACE_CONTENT = {
                      // Wave B.2 corrective — one destination per real job. Allegations and
                      // evidence are no longer peers of the stage they belong to: they are
                      // the content of the Investigation, alongside its checklist, its
                      // meetings and its findings. Every panel below is the existing panel,
                      // with the existing props and the existing handlers.
                      investigation: (
            <InvestigationTab cs={cs} fmtDate={fmtDate}
              investigator={currentInvestigator}
              targetDate={currentInvestigatorAccess?.targetCompletionDate}
              checklistTasks={checklistTasks}
              onOpenMeeting={()=>goToDestination("meetings")}
              onOpenDocuments={()=>goToDestination("documents")}
              allegationsPanel={
            <AllegationsPanel cs={cs} allegations={caseAllegations} allAllegations={allegations} createAllegation={allegationsTab.createAllegation} patchAllegation={allegationsTab.patchAllegation} changeAllegationStatus={allegationsTab.changeAllegationStatus} deleteAllegation={allegationsTab.deleteAllegation} saveCases={saveCases} cases={cases} confirmDialog={confirmDialog} showToast={showToast} evidenceSuggestions={allegationsTab.evidenceSuggestions?.[cs.id]||[]} evidenceSuggestionsLoading={allegationsTab.evidenceSuggestionsLoading?.[cs.id]} generateEvidenceSuggestions={allegationsTab.generateEvidenceSuggestions} acceptEvidenceSuggestion={allegationsTab.acceptEvidenceSuggestion} rejectEvidenceSuggestion={allegationsTab.rejectEvidenceSuggestion} setReviewOutput={setReviewOutput} onPresentMeetingRecord={onPresentMeetingRecord}  setScreen={setScreen} screens={screens} orgMembers={orgMembers} fmtDate={fmtDate} caseSignals={caseSignals} onAskWhy={setWhySignal} generateAppealReview={allegationsTab.generateAppealReview} appealReviewLoading={allegationsTab.appealReviewLoading} recordAppealOutcome={allegationsTab.recordAppealOutcome} policies={allegationsTab.policies} consistencyReview={allegationsTab.consistencyReview?.[cs.id]} consistencyReviewLoading={allegationsTab.consistencyReviewLoading?.[cs.id]} generateConsistencyReview={allegationsTab.generateConsistencyReview} canDecide={canDecide} canDecideAppeal={canDecideAppeal} atDecisionStage={atDecisionStage} canRecordInvestigation={canRecordInvestigation} canConcludeInvestigation={canConcludeInvestigation} recordInvestigationConclusion={allegationsTab.recordInvestigationConclusion}/>
              }
              evidencePanel={
            <EvidenceTab cs={cs} cases={cases} saveCases={saveCases} currentUser={currentUser} showToast={showToast} setReviewOutput={setReviewOutput} onPresentMeetingRecord={onPresentMeetingRecord}  setScreen={setScreen} screens={screens} fmtDate={fmtDate} setMeetingSetup={setMeetingSetup} setCaseInfo={setCaseInfo} orgMembers={orgMembers} allegations={caseAllegations} documentFindings={evidenceTab.documentFindings} documentAnalysisLoading={evidenceTab.documentAnalysisLoading} onAnalyseEvidence={(evidenceId)=>evidenceTab.analyseEvidenceDocument(cs, evidenceId)} onAcceptFinding={(evidenceId, finding)=>evidenceTab.acceptDocumentFinding(cs, evidenceId, finding)} onDismissFinding={(evidenceId, finding)=>evidenceTab.dismissDocumentFinding(cs, evidenceId, finding)} onRemoveEvidence={(evidenceId)=>evidenceTab.removeEvidence(cs.id, evidenceId)} promptDialog={promptDialog} audit={audit}/>
              }/>
            ),
                      meetings: (
            <MeetingsTab cs={cs} cases={cases} saveCases={saveCases} showToast={showToast} currentUser={currentUser} activeCaseStage={meetingsTab.activeCaseStage} setActiveCaseStage={meetingsTab.setActiveCaseStage} setMeetingSetup={setMeetingSetup} setCaseInfo={setCaseInfo} getEmployeeRecord={getEmployeeRecord} orgMembers={orgMembers} setScreen={setScreen} screens={screens} setReviewOutput={setReviewOutput} onPresentMeetingRecord={onPresentMeetingRecord}  setMeetingType={setMeetingType} meetingTypes={MEETING_TYPES} fmtDate={fmtDate} attemptSubmitInvestigation={attemptSubmitInvestigation} concludingInvestigation={concludingInvestigation} loadSignedSnapshot={overview.loadSignedSnapshot} loadRequestHistory={overview.loadRequestHistory} proceedWithoutConfirmation={overview.proceedWithoutConfirmation} resolveSignatureResponse={overview.resolveSignatureResponse} onResendReminder={overview.onResendReminder} investigationReportDraft={investigationReportDraft} setShowHandoffModal={setShowHandoffModal} onOpenInvestigationReport={onOpenInvestigationReport} onAcceptSavedSuggestion={meetingsTab.onAcceptSavedSuggestion} onDismissSavedSuggestion={meetingsTab.onDismissSavedSuggestion} promptDialog={promptDialog} audit={audit}/>
            ),
                      documents: (
            <>
            <DocumentsTab cs={cs} setLetterOutput={setLetterOutput} onOpenInvestigationReport={onOpenInvestigationReport} setScreen={setScreen} screens={screens} fmtDate={fmtDate} onGenerateHearingPack={documentsTab.onGenerateHearingPack} hearingPackGenerating={!!documentsTab.hearingPackGenerating?.[cs.id]} hearingPackReady={documentsTab.hearingPackReady?.[cs.id]||null} onDismissHearingPackReady={()=>documentsTab.onDismissHearingPackReady?.(cs.id)} onDraftCorrespondence={documentsTab.onDraftCorrespondence}/>
              {/* Correspondence is the same job as letters and files: what was
                  issued or received on this case. Two destinations for that was a
                  distinction only the data model cared about. */}
              <div style={{marginTop:28}}>
            <CommunicationsTab cs={cs} allegations={allegations} auditLog={auditLog} fmtDate={fmtDate} onOpenSource={openTimelineSource}/>
              </div>
            </>
            ),
                      outcome: (
            <OutcomeTab cs={cs} stage={stage} fmtDate={fmtDate} setShowOutcomeModal={setShowOutcomeModal} canDecide={canDecide} onDraftOutcomeLetter={draftOutcomeLetter}/>
            ),
                      record: (
            <TimelinePanel cs={cs} allegations={allegations} auditLog={auditLog} fmtDate={fmtDate} onOpenSource={openTimelineSource} onToggleExclude={timeline.toggleTimelineExclude} onEditDescription={timeline.editTimelineDescription} onGenerateRelevance={timeline.generateTimelineRelevance} relevanceLoading={timeline.timelineRelevanceLoading?.[cs.id]} onPdfError={m=>showToast(m,"error")} loadJsPDF={timeline.loadJsPDF}/>
            ),
                      compass: (
            <CompassAnalysisPanel cs={cs} readiness={readiness} currentRisk={currentRisk}
              nextAction={{
                signal: nextActionSignal,
                policyRef: nextActionPolicyRef,
                loading: nextActionLoading?.[cs.id],
                onGenerate: ()=>generateNextBestAction(cs),
                onDismiss: ()=>changeSignalStatus(nextActionSignal.id, "dismissed"),
                onMarkNotRelevant: ()=>changeSignalStatus(nextActionSignal.id, "not_relevant"),
                onAskWhy: ()=>setWhySignal(nextActionSignal),
                extraActions: nextActionSignal ? [
                  {label:"Accept", onClick:()=>changeSignalStatus(nextActionSignal.id, "accepted")},
                  {label:"Create task", onClick:()=>{createCaseTask(cs.id, {name:nextActionSignal.title}); changeSignalStatus(nextActionSignal.id, "accepted");}},
                ] : [],
              }}
              caseIntel={{ unansweredCovered: overview.unansweredCovered, unansweredLoading: overview.unansweredLoading,
                           generateUnansweredQuestions: overview.generateUnansweredQuestions,
                           generateInconsistencies: overview.generateInconsistencies,
                           inconsistencyLoading: overview.inconsistencyLoading?.[cs.id],
                           allegations: caseAllegations }}
              caseActions={{ changeSignalStatus, createCaseTask, onAskWhy: setWhySignal, linkSignalToAllegation: overview.linkSignalToAllegation }}
              caseSignals={{ unanswered: openSignalsForCase(caseSignals, cs.id, "unanswered_question"), inconsistencies: openSignalsForCase(caseSignals, cs.id, "inconsistency") }}
              automation={{ suggestions: automationSuggestions, automationLevels: overview.automationLevels, onResendReminder: overview.onResendReminder }}
              riskItems={compassRiskItems}
              ai={{ chatHistory: aiTab.caseChatHistory[cs.id]||[], chatInput: aiTab.caseChatInput, setChatInput: aiTab.setCaseChatInput,
                    chatProcessing: aiTab.caseChatProcessing, sendChat: ()=>aiTab.sendCaseChat(cs), overview: aiTab.caseOverview[cs.id],
                    overviewLoading: !!aiTab.caseOverviewLoading[cs.id], generateOverview: ()=>aiTab.generateCaseOverview(cs),
                    overviewSources: aiTab.caseOverviewSources?.[cs.id] }}/>
            ),
                      tasks: (
            <CaseTasksPanel cs={cs} tasks={caseTaskList} createCaseTask={createCaseTask} toggleCaseTaskDone={toggleCaseTaskDone} deleteCaseTask={deleteCaseTask} fmtDate={fmtDate} isHR={isHR} onGeneratePlan={()=>generateInvestigationPlan(cs)} planLoading={!!investigationPlanLoading[cs.id]}/>
            ),
                      people: (
            <>
              <PeopleTab cs={cs}/>
              {/* Wave B.2 — Case roles is case ADMINISTRATION, not analysis. It sits with
                  the people it is about. Not a duplicate of Participants: Participants is
                  derived from the case (employee, chair, witnesses), while this assigns
                  formal roles backed by case_access. Same panel, same handler, same
                  server-side can_grant_case_access authority — placement only. */}
              <div style={{marginTop:16}}>
                <div style={{...TYPE.metadata,color:COLOR.inkFaint,marginBottom:10}}>Case roles</div>
                <CaseRolesPanel cs={cs} caseAccess={caseAccess} orgMembers={orgMembers} assignCaseRole={overview.assignCaseRole}/>
              </div>
            </>
            ),
                      information: (
            <CaseInformationPanel cs={cs} cases={cases} saveCases={saveCases} repeatCount={repeatCount}
              dateRelevance={dateRelevance} processTemplate={processTemplate}/>
            ),
                      themes: (
            <ThemesTab cs={cs} organisationThemes={themesTab.organisationThemes} caseThemes={themesTab.caseThemes} suggestions={themesTab.themeSuggestions?.[cs.id]} suggesting={!!themesTab.themeSuggestionLoading?.[cs.id]} isHR={isHR} onSuggest={themesTab.onSuggestThemes} onConfirmSuggestion={themesTab.onConfirmThemeSuggestion} onDismissSuggestion={themesTab.onDismissThemeSuggestion} onAssignExisting={themesTab.onAssignExistingTheme} onRemove={themesTab.onRemoveTheme}/>
            ),
                      exposure: (
            <TribunalExposurePanel cs={cs} cases={cases} saveCases={saveCases}
              currentRisk={currentRisk} yearsService={yearsService}/>
            ),
    };
                return (
                  <>
                    <CaseWorkspaceNav destinations={workspaceDestinations} active={activeDestination}
                      onSelect={goToDestination}/>
                    <div ref={workspaceRef} tabIndex={-1} id="case-workspace"
                      role="tabpanel" aria-label={activeDestination}
                      style={{paddingTop:24,outline:"none"}}>
                      {WORKSPACE_CONTENT[activeDestination]}
                    </div>
                  </>
                );
            })()}
          </section>
        </div>
      </div>
    </div>
  );
}