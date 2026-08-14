import { supabase } from './supabase';
import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { MEETING_TYPES, SCREENS, SPEAKERS, NEXT_STEPS_MAP, DEV_MEETING_CONFIG, DEV_TEMPLATES, TEMPLATES, WELLBEING_RESOURCES, WELLBEING_TYPES, POLICY_CATEGORIES, CONCERN_TYPES } from './constants';
import { streamClaude } from './lib/streamClaude';
import { addWorkingDays, addCalendarMonth, toISODateLocal } from './lib/dates';
import { ls, lsSet } from './lib/storage';
import { findEmployeeByName } from './lib/employeeRecords';
import { computeDueSoon } from './lib/deadlines';
import { mapCaseRow } from './lib/caseMapping';
import { toggleChecklistTask, updateChecklistTaskNote, addChecklistTask, removeChecklistTask, reassignChecklistTaskOwner, updateChecklistInstanceFields } from './lib/checklistTasks';
import { isLetterApproved, createLetterApproval } from './lib/letterApproval';
import { getCaseStage, withStageTransitionStamp } from './lib/caseStage';
import { getNextStep } from './lib/nextStep';
import { addAllegation, updateAllegation, setAllegationStatus, removeAllegation, allegationStatusMeta, allegationsForCase, linkEvidenceToAllegation, evidenceForAllegation, setAppealOutcome, appealOutcomeMeta } from './lib/allegations';
import {
  addPrepQuestion as addPrepQuestionHelper,
  updatePrepQuestionText as updatePrepQuestionTextHelper,
  removePrepQuestion as removePrepQuestionHelper,
  movePrepQuestion as movePrepQuestionHelper,
  togglePrepQuestionEssential as togglePrepQuestionEssentialHelper,
  linkPrepQuestionToAllegation as linkPrepQuestionToAllegationHelper,
  linkPrepQuestionToEvidence as linkPrepQuestionToEvidenceHelper,
  setPrepQuestionStatus as setPrepQuestionStatusHelper,
} from './lib/prepQuestions';
import { newEvidenceSinceFinding, appealMeetingsForCase, formatAppealGroundReasoning } from './lib/appealReview';
import { comparableCaseSummaries } from './lib/outcomeConsistency';
import { addTask, toggleTaskDone, removeTask, tasksForCase } from './lib/caseTasks';
import { createSignal, setSignalStatus, supersedeOpenSignalsOfType, openSignalsForCase, updateSignal, signalsForCase } from './lib/caseSignals';
import { computeGuardrailChecks } from './lib/guardrails';
import { addConcernReferral, setReferralStatus, updateConcernReferral } from './lib/concernReferrals';
import { sanitizeTriageSummary } from './lib/concernTriage';
import { seedInvestigationChecklist, investigationChecklistTasks, INVESTIGATION_CHECKLIST_STEPS } from './lib/investigationChecklist';
import { sanitizeInvestigationPlanItems, seedInvestigationPlanTasks } from './lib/investigationPlan';
import { computeInvestigationQualityGaps } from './lib/investigationQuality';
import { InvestigationQualityCheckModal } from './components/InvestigationQualityCheckModal';
import { computeChangesSinceView, isNonTrivialChange } from './lib/caseViews';
import { buildCaseTimeline } from './lib/caseTimeline';
import { withFkRetry } from './lib/retryOnFkRace';
import { requestOverride, requestPolicyDeviation } from './lib/humanOverride';
import { caseRoleLabel } from './lib/caseRoles';
import { getProcessType, stageLabel } from './lib/processStages';
import { buildEscalationContext } from './lib/escalation';
import { EscalateToHrModal } from './screens/EscalateToHrModal';
import { getTemplateForType, resolveDefaultTaskDueDate } from './lib/processTemplates';
import { readEvidenceFiles } from './lib/evidenceUpload';
import { EvidenceDropzone } from './components/EvidenceDropzone';
import { buildCaseContext, meetingsNeedingSummary, buildOverviewSourceRefs } from './lib/caseContext';
import { canAnalyseEvidence, buildAnalysisContent } from './lib/documentIngestion';
import { derivePeopleForCase } from './lib/casePeople';
import { matchCaseByEmployeeName } from './lib/globalAssistant';
import { buildEmailEvidenceItem } from './lib/emailIngestion';
import { appealLinkCandidates } from './lib/appealLink';
import { isHrRole } from './lib/roles';
import { computeSelectionScore } from './lib/redundancyScoring';
import { parseCsv, toCsv, csvRowsToObjects } from './lib/csv';
import { authedFetch } from './lib/authedFetch';
import { useFonts } from './hooks/useFonts';
import { AppSidebar } from './components/AppSidebar';
import { Badge, Btn, Card, SectionTitle } from './components/Primitives';
import { MDRenderer } from './components/MDRenderer';
import { SignaturePad } from './components/SignaturePad';
import { DateInput } from './components/DateInput';
import { AdjustmentForm } from './components/AdjustmentForm';
import { AddRoleForm } from './components/AddRoleForm';
import { ConfirmModal } from './components/ConfirmModal';
import { PromptModal } from './components/PromptModal';
import { WhySourcesModal } from './components/WhySourcesModal';
import { PeopleScreen } from './screens/PeopleScreen';
import { CasesScreen } from './screens/CasesScreen';
import { LetterScreen } from './screens/LetterScreen';
import { SearchScreen } from './screens/SearchScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { PrepScreen } from './screens/PrepScreen';
import { IntakeScreen } from './screens/IntakeScreen';
import { HomeMeetingScreen } from './screens/HomeMeetingScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { RecordScreen } from './screens/RecordScreen';
import { PersonViewScreen } from './screens/PersonViewScreen';
import { CaseViewScreen } from './screens/CaseViewScreen';
import { HomeScreen } from './screens/HomeScreen';
import { GlobalAssistantScreen } from './screens/GlobalAssistantScreen';
import { SaveEmailScreen } from './screens/SaveEmailScreen';
// Lazy: less-common screens, split out of the main bundle so the common
// login -> Home -> Cases path doesn't pay to download them upfront.
const WellbeingScreen = lazy(() => import('./screens/WellbeingScreen').then(m => ({default: m.WellbeingScreen})));
const NewStarterScreen = lazy(() => import('./screens/NewStarterScreen').then(m => ({default: m.NewStarterScreen})));
const OffboardingScreen = lazy(() => import('./screens/OffboardingScreen').then(m => ({default: m.OffboardingScreen})));
const DevelopScreen = lazy(() => import('./screens/DevelopScreen').then(m => ({default: m.DevelopScreen})));
const ErReportScreen = lazy(() => import('./screens/ErReportScreen').then(m => ({default: m.ErReportScreen})));
const RedundancyScreen = lazy(() => import('./screens/RedundancyScreen').then(m => ({default: m.RedundancyScreen})));
const ConcernsScreen = lazy(() => import('./screens/ConcernsScreen').then(m => ({default: m.ConcernsScreen})));
const ManagerPortalScreen = lazy(() => import('./screens/ManagerPortalScreen').then(m => ({default: m.ManagerPortalScreen})));
const HrDelegatedWorkScreen = lazy(() => import('./screens/HrDelegatedWorkScreen').then(m => ({default: m.HrDelegatedWorkScreen})));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen').then(m => ({default: m.SettingsScreen})));
const DsarScreen = lazy(() => import('./screens/DsarScreen').then(m => ({default: m.DsarScreen})));
const TasksScreen = lazy(() => import('./screens/TasksScreen').then(m => ({default: m.TasksScreen})));
const CalendarScreen = lazy(() => import('./screens/CalendarScreen').then(m => ({default: m.CalendarScreen})));
import { OnboardingWizard } from './screens/OnboardingWizard';
import { AskCompassWidget } from './screens/AskCompassWidget';
import { HandoffModal } from './screens/HandoffModal';
import { ReassignCaseModal } from './screens/ReassignCaseModal';
import { AssignInvestigatorModal } from './screens/AssignInvestigatorModal';
import { HrInterventionModal } from './screens/HrInterventionModal';
import { OutcomeModal } from './screens/OutcomeModal';

// Manager Enablement (Phase 4, MP4) — shared by concernForm's initial
// state and its post-submit reset, so the two can't silently drift apart.
const EMPTY_CONCERN_FORM = {employeeName:"",concernType:"other",description:"",witnesses:"",discussedWithEmployee:false,involvesSafetyOrWelfare:false,immediateSafetyConcern:false,mayNeedFormalProcess:false,evidenceDescription:"",evidenceFiles:[]};

export default function Compass({ user=null, org=null, member=null, availableOrgs=[], switchOrg=()=>{}, onJoinAnotherOrg=()=>{}, onSignOut=null }) {
  useFonts();

  // ── Navigation ──
  // Screen (and, for case view, the case id) sync to the URL as query
  // params — previously "screen" was pure in-memory state with the whole
  // app living at "/", so the browser Back button had nothing to go back
  // to within the app (it exited straight to whatever was open before
  // Compass) and refreshing silently dropped you back on Home. syncSource
  // distinguishes a change driven by clicking around the app (push a new
  // history entry) from one driven by popstate/back-forward (don't
  // push again, or Back would immediately re-push Forward).
  const readNavFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return { screen: params.get('screen') || SCREENS.HOME, caseId: params.get('case') || null };
  };
  const [screen, setScreen] = useState(() => readNavFromUrl().screen);
  const navSyncSourceRef = useRef('init');

  // ── Session ──
  const [meetingType, setMeetingType] = useState(null);
  const [caseInfo, setCaseInfo] = useState({employee:"", date:new Date().toISOString().split("T")[0], manager:"", context:"", email:""});
  const [participants, setParticipants] = useState([]); // [{name, role, email}]

  // ── Transcript ──
  const [transcript, setTranscript] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isScreenCapturing, setIsScreenCapturing] = useState(false);
  const [screenStatus, setScreenStatus] = useState("");
  const [captureMode, setCaptureMode] = useState("type");
  const [importText, setImportText] = useState("");

  // ── AI outputs ──
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiError, setAiError] = useState("");
  const [concludingInvestigation, setConcludingInvestigation] = useState(false);
  const [prepNotes, setPrepNotes] = useState("");
  // Meeting Intelligence Phase 2 (M1) — structured, editable pre-meeting
  // questions alongside the free-text prep pack: {id, text, category,
  // essential, reasoning, linkedAllegationId, linkedEvidenceIndex, source}.
  // source is "ai" for AI-generated or "user" for manually added. Session-
  // local like prepNotes — not written to the DB until the meeting itself
  // saves.
  const [prepQuestions, setPrepQuestions] = useState([]);
  const [reviewOutput, setReviewOutput] = useState("");
  const [reviewOutputOriginal, setReviewOutputOriginal] = useState(""); // the AI's un-edited draft, kept so hand-edits can be reverted
  // M10 — a second, short AI generation alongside the full record: what
  // actually matters for someone triaging the case, not the full formatted
  // dialogue. Session-local like reviewOutput; only persisted as
  // meeting.summary once the meeting itself saves.
  const [meetingSummary, setMeetingSummary] = useState("");
  const [letterOutput, setLetterOutput] = useState("");
  // Explainability sweep (P19, §19) — snapshot of what fed this exact
  // letter draft, captured at generation time (same "as-of" approach
  // AIAssistantTab's overviewSources already uses) rather than resolved
  // live later, since case data can change after the letter was drafted.
  // Fully self-contained refs (own label/detail/date), not ids to look
  // up — WhySourcesModal is given the identity function as resolveRef.
  const [letterSources, setLetterSources] = useState([]);
  const [letterWhySignal, setLetterWhySignal] = useState(null);
  const [letterHistory, setLetterHistory] = useState([]); // previous drafts from this session, most recent first
  const [activeLetter, setActiveLetter] = useState("outcome");
  // AI-approval gate — see src/lib/letterApproval.js. Tied to the exact
  // letter text, not a bare flag, so editing/regenerating after approving
  // silently requires re-approval rather than letting stale sign-off cover
  // different content.
  const [letterApproval, setLetterApproval] = useState(null);
  const letterIsApproved = isLetterApproved(letterOutput, letterApproval);
  const approveLetter = () => {
    if(!letterOutput) return;
    const approval = createLetterApproval(letterOutput, { by: currentUser?.name || member?.name, type: activeLetter });
    setLetterApproval(approval);
    audit("AI-drafted letter approved for sending", `${caseInfo.employee||"Employee"} — ${meetingType?.label||""} (${activeLetter})`);
  };
  const [riskScore, setRiskScore] = useState(null);
  const [riskProcessing, setRiskProcessing] = useState(false);
  const [prediction, setPrediction] = useState("");
  const [predProcessing, setPredProcessing] = useState(false);
  const [nextSteps, setNextSteps] = useState([]); // [{step, deadline, done}]

  // ── PDF/Word ──
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [wordGenerating, setWordGenerating] = useState(false);
  const [signature, setSignature] = useState(ls("compass_signature", null));
  const [showSigPad, setShowSigPad] = useState(false);
  const [pendingSend, setPendingSend] = useState(null);

  // ── Settings ──
  const [letterhead, setLetterhead] = useState(ls("compass_letterhead", null));
  const [wordTemplate, setWordTemplate] = useState(ls("compass_word_template", null));
  const [policies, setPolicies] = useState(ls("compass_policies", []));
  const [policyProcessing, setPolicyProcessing] = useState(false);

  // ── Cases ──
  const [cases, setCases] = useState(ls("compass_cases", []));
  const [viewMeeting, setViewMeeting] = useState(null);
  const [viewCaseId, setViewCaseId] = useState(null);

  // ── Portal ──
  const [portalCaseId, setPortalCaseId] = useState(null);
  const [portalAccounts, setPortalAccounts] = useState([]);

  // ── Templates ──
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateSearch, setTemplateSearch] = useState("");

  // ── Developmental meetings ──
  const [devSession, setDevSession] = useState(null);
  const [devStep, setDevStep] = useState("self");
  const [devAiProcessing, setDevAiProcessing] = useState(false);
  const [devSummary, setDevSummary] = useState("");
  const [devLetter, setDevLetter] = useState("");

  // ── Audit trail (cloud-synced — see audit_log_cloud_sync_2026-07-25.sql) ──
  const [auditLog, setAuditLog] = useState([]);

  const loadAuditLog = async () => {
    if(!org?.id) return;
    try {
      const { data, error } = await supabase.from('audit_log').select('*').eq('org_id', org.id).order('created_at',{ascending:false}).limit(500);
      if(!error && data) setAuditLog(data.map(r=>({id:r.id, ts:r.created_at, user:r.user_name, action:r.action, detail:r.detail||"", caseId:r.case_id||null})));
    } catch(e) { console.error("Load audit log error:", e); }
  };
  useEffect(() => { if(org?.id) loadAuditLog(); }, [org?.id]);
  // Pick up entries other team members logged while this tab was in the
  // background — cheap alternative to a realtime subscription.
  useEffect(() => {
    const onFocus = () => { if(org?.id) loadAuditLog(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [org?.id]);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  // ── Multi-user profiles ──
  const [currentUser, setCurrentUser] = useState(member ? {...member, email: user?.email} : (user ? {name: user?.user_metadata?.name||user?.email, email: user?.email, role:"hr_manager"} : ls("compass_user", null)));
  const [orgRoles, setOrgRoles] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [showAssignInvestigatorModal, setShowAssignInvestigatorModal] = useState(false);
  const [adjournments, setAdjournments] = useState([]);
  const [currentAdjournment, setCurrentAdjournment] = useState(null);
  const [expandedCases, setExpandedCases] = useState({});
  const [casesSearch, setCasesSearch] = useState("");
  const [casesFilter, setCasesFilter] = useState("active");
  const [casesView, setCasesView] = useState("list");
  const [dashSearch, setDashSearch] = useState("");
  const [employmentProfileOutput, setEmploymentProfileOutput] = useState("");
  const [employeeRecords, setEmployeeRecords] = useState(ls("compass_employees", []));
  const saveEmployeeRecords = u => { setEmployeeRecords(u); lsSet("compass_employees", u); };
  const getEmployeeRecord = (name) => findEmployeeByName(employeeRecords, name);
  const upsertEmployeeRecord = (name, fields) => {
    if(!name) return;
    const existing = employeeRecords.find(e=>e.name===name);
    if(existing) {
      saveEmployeeRecords(employeeRecords.map(e=>e.name===name?{...e,...fields}:e));
    } else {
      saveEmployeeRecords([...employeeRecords,{name,...fields,createdAt:new Date().toISOString()}]);
    }
    saveEmployeeRecordToDB(name, fields);
  };
  const [employmentProfileLoading, setEmploymentProfileLoading] = useState(false);
  const [newCaseJobTitle, setNewCaseJobTitle] = useState("");
  const [newCaseStartDate, setNewCaseStartDate] = useState("");
  const [newCaseLocation, setNewCaseLocation] = useState("");
  const [newCaseType, setNewCaseType] = useState("");
  const [newCaseDescription, setNewCaseDescription] = useState("");
  const [newCaseLocationOther, setNewCaseLocationOther] = useState("");
  const [newCaseOwnerId, setNewCaseOwnerId] = useState("");
  const [newCasePriority, setNewCasePriority] = useState("normal");
  const [newCaseEvidence, setNewCaseEvidence] = useState([]);
  const [editingEmployeeRecord, setEditingEmployeeRecord] = useState(false);
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [outcomeType, setOutcomeType] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  // Default must be one of the actual filter chips ("active", "investigation",
  // "disciplinary", "closed") — there's no "all" chip, and the matching logic
  // in HomeScreen has no case for it either, so "all" silently matched zero
  // cases and the dashboard's case list showed nothing until a user manually
  // clicked a filter, on every single fresh page load.
  const [dashFilter, setDashFilter] = useState("active");

  const loadEmployeeRecords = async () => {
    if(!org?.id) return;
    try {
      const {data} = await supabase.from('employee_records').select('*').eq('org_id', org.id);
      if(data) setEmployeeRecords(data.map(r=>({name:r.name,jobTitle:r.job_title,startDate:r.start_date,location:r.location})));
    } catch(e) { console.error('loadEmployeeRecords', e); }
  };

  // Only removes the profile row (job title/start date/location) — case
  // files and meeting records are a separate legal record with their own
  // retention obligations (ACAS/tribunal limitation periods) and aren't
  // touched here, so this is safe to offer without a GDPR erasure review.
  const deleteEmployeeRecord = async (name) => {
    if(!name) return;
    saveEmployeeRecords(employeeRecords.filter(e=>e.name!==name));
    if(org?.id) {
      const { error } = await supabase.from('employee_records').delete().eq('org_id', org.id).eq('name', name);
      if(error) { console.error('deleteEmployeeRecord', error); showToast("Couldn't delete the employee record — "+error.message, "error"); return; }
    }
    audit("Employee record deleted", name);
  };

  const saveEmployeeRecordToDB = async (name, fields) => {
    if(!org?.id) return;
    const { error } = await supabase.from('employee_records').upsert({
      org_id: org.id,
      name,
      job_title: fields.jobTitle||null,
      start_date: fields.startDate||null,
      location: fields.location||null,
      updated_at: new Date().toISOString(),
    }, {onConflict: 'org_id,name'});
    if(error) { console.error('saveEmployeeRecord', error); showToast("Couldn't save the employee record — "+error.message, "error"); }
  };

  // ── HRIS/payroll CSV import-export — generic CSV rather than a specific
  // vendor API, since it works with whatever system (BambooHR, Xero, Sage,
  // ...) the org actually exports from, without needing live credentials
  // to a third-party account to build and verify against. ──
  const handleEmployeeCsvImport = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    setEmployeeCsvProcessing(true);
    try {
      const text = await file.text();
      const objs = csvRowsToObjects(parseCsv(text));
      const valid = objs.filter(o => o.name && o.name.trim());
      const skipped = objs.length - valid.length;
      const records = valid.map(o => ({
        name: o.name.trim(),
        jobTitle: o['job title']||o.jobtitle||"",
        startDate: o['start date']||o.startdate||"",
        location: o.location||"",
      }));

      const merged = [...employeeRecords];
      records.forEach(r => {
        const idx = merged.findIndex(m=>m.name===r.name);
        if(idx>=0) merged[idx] = {...merged[idx], ...r};
        else merged.push(r);
      });
      saveEmployeeRecords(merged);

      if(org?.id && records.length>0) {
        const { error } = await supabase.from('employee_records').upsert(
          records.map(r => ({
            org_id: org.id,
            name: r.name,
            job_title: r.jobTitle||null,
            start_date: r.startDate||null,
            location: r.location||null,
            updated_at: new Date().toISOString(),
          })),
          {onConflict: 'org_id,name'}
        );
        if(error) throw error;
      }
      showToast(`Imported ${records.length} employee${records.length===1?"":"s"}${skipped>0?`, skipped ${skipped} row${skipped===1?"":"s"} with no name`:""}`);
    } catch(err) {
      console.error("Employee CSV import error:", err);
      showToast("Could not import CSV — check the file format", "error");
    }
    setEmployeeCsvProcessing(false);
    e.target.value = "";
  };

  const exportEmployeesCsv = () => {
    const rows = [["Name","Job title","Start date","Location"]];
    employeeRecords.forEach(r => rows.push([r.name||"", r.jobTitle||"", r.startDate||"", r.location||""]));
    const csv = toCsv(rows);
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=(org?.name||"Compass")+"_Employees_"+new Date().toLocaleDateString("en-GB").split("/").join("-")+".csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // Lets a prospect switching from spreadsheets or another system bring
  // in existing case history instead of only starting fresh — imported
  // rows have no meeting/transcript data (that's not something a CSV can
  // carry), just the case-level facts: who, what, when, current status.
  const handleCaseCsvImport = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    setCaseCsvProcessing(true);
    try {
      const text = await file.text();
      const objs = csvRowsToObjects(parseCsv(text));
      const valid = objs.filter(o => o['employee name']?.trim());
      const skipped = objs.length - valid.length;
      const imported = valid.map(o => ({
        id: crypto.randomUUID(),
        employeeName: o['employee name'].trim(),
        email: "",
        caseType: (o['case type']||"").trim().toLowerCase(),
        description: o['description']||"",
        dateReceived: o['date received']||new Date().toISOString().split("T")[0],
        stage: (o['stage']||"").trim().toLowerCase()==="closed" ? "closed" : "open",
        outcome: o['outcome']||"",
        meetings: [],
        evidence: [],
        urgency: "normal",
      }));
      if(imported.length>0) saveCases([...cases, ...imported]);
      audit("Case history imported", `${imported.length} case${imported.length===1?"":"s"}`);
      showToast(`Imported ${imported.length} case${imported.length===1?"":"s"}${skipped>0?`, skipped ${skipped} row${skipped===1?"":"s"} with no employee name`:""}`);
    } catch(err) {
      console.error("Case CSV import error:", err);
      showToast("Could not import CSV — check the file format", "error");
    }
    setCaseCsvProcessing(false);
    e.target.value = "";
  };

  const downloadCaseCsvTemplate = () => {
    const rows = [
      ["Employee name","Case type","Stage","Date received","Description","Outcome"],
      ["Jane Smith","misconduct","closed","2025-03-10","Repeated lateness following two informal warnings","First written warning issued"],
    ];
    const csv = toCsv(rows);
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download="Compass_Case_Import_Template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const loadOrgRoles = async () => {
    if(!org?.id) return;
    try {
      const {data} = await supabase.from('org_roles').select('*').eq('org_id', org.id).order('access_level', {ascending:false});
      if(data) setOrgRoles(data);
    } catch(e) { console.error('loadOrgRoles', e); }
  };
  const loadOrgMembers = async () => {
    if(!org?.id) return;
    try {
      const {data} = await supabase.from('org_members').select('*').eq('org_id', org.id);
      if(data) setOrgMembers(data);
    } catch(e) { console.error('loadOrgMembers', e); }
  };
  // ── Letter tracking ──
  // Stored per meeting as letterTracking: [{letterId, sentAt, deliveredAt, acknowledgedAt}]

  // ── Reasonable adjustments ──
  const [adjustments, setAdjustments] = useState(ls("compass_adjustments", {})); // {caseId: [{id, adjustment, agreed, review, done}]}

  // ── GDPR ──
  const [gdprAccepted, setGdprAccepted] = useState(ls("compass_gdpr", false));
  const [showGdpr, setShowGdpr] = useState(false);

  // ── Onboarding ──
  const [onboardDone, setOnboardDone] = useState(ls("compass_onboard", false));
  const [onboardStep, setOnboardStep] = useState(0);
  const [showOnboard, setShowOnboard] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [meetingSetup, setMeetingSetup] = useState({employee:"", employeeJobTitle:"", manager:"", chairJobTitle:"", type:"", date:new Date().toISOString().split("T")[0], linkedCaseId:null, linkedCaseName:null, representative:"", representativeRole:"colleague", participants:[]});
  const [liveChatInput, setLiveChatInput] = useState("");
  const [editInstruction, setEditInstruction] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareProcessing, setShareProcessing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editProcessing, setEditProcessing] = useState(false);
  const [homeChat, setHomeChat] = useState([]);
  const [askCompassHistory, setAskCompassHistory] = useState([]);
  const [showAskCompass, setShowAskCompass] = useState(false);
  const [reportNarrative, setReportNarrative] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(!cases.length && !ls("compass_onboarded", false));
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [askCompassInput, setAskCompassInput] = useState("");
  const [askCompassProcessing, setAskCompassProcessing] = useState(false);
  const [homeChatInput, setHomeChatInput] = useState("");
  const [homeChatLoading, setHomeChatLoading] = useState(false);
  const [openCases, setOpenCases] = useState({});
  const [activeCaseId, setActiveCaseId] = useState(() => readNavFromUrl().caseId);

  // Respond to Back/Forward: read the URL the browser just navigated to
  // and mirror it into state, tagging the source so the effect below
  // doesn't turn right around and push a duplicate history entry for it.
  useEffect(() => {
    const onPopState = () => {
      const next = readNavFromUrl();
      navSyncSourceRef.current = 'popstate';
      setScreen(next.screen);
      setActiveCaseId(next.caseId);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Mirror in-app navigation into the URL so Back/Forward and refresh
  // actually work. Skips the very first render (URL already matches what
  // was just read from it) and skips runs caused by a popstate we just
  // handled above (the URL already matches — pushing again would break
  // Back by immediately re-adding what the user just went back from).
  useEffect(() => {
    if (navSyncSourceRef.current === 'init') { navSyncSourceRef.current = 'app'; return; }
    if (navSyncSourceRef.current === 'popstate') { navSyncSourceRef.current = 'app'; return; }
    const params = new URLSearchParams();
    params.set('screen', screen);
    if (screen === SCREENS.CASE_VIEW && activeCaseId) params.set('case', activeCaseId);
    const nextSearch = `?${params.toString()}`;
    // activeCaseId can change without the screen changing (e.g. linking a
    // meeting to a case from a dropdown) — only push when the URL this
    // would produce actually differs, so that doesn't add a dead history
    // entry that just makes Back need an extra press for no visible change.
    if (nextSearch === window.location.search) return;
    window.history.pushState(null, '', `${window.location.pathname}${nextSearch}`);
  }, [screen, activeCaseId]);

  // "Send for signature" creates a real signing_requests row, and the
  // employee's actual signature lands there once they sign via the portal
  // — but nothing ever read that back into the case. A meeting showed
  // "Pending signature" forever unless HR remembered to click the manual
  // "Mark signed" button themselves after reading the notification email,
  // with no verification a signature had actually been captured. Checks
  // any pending meeting signatures against the real status whenever the
  // case is opened, and syncs automatically if signed.
  useEffect(() => {
    if (screen !== SCREENS.CASE_VIEW || !activeCaseId) return;
    const cs = cases.find(c => c.id === activeCaseId);
    const pending = (cs?.meetings || []).filter(m => m.signStatus === "pending" && m.signId);
    if (!pending.length) return;
    let cancelled = false;
    (async () => {
      const signedIds = (await Promise.all(pending.map(async m => {
        try {
          const res = await fetch(`/api/signing?signId=${encodeURIComponent(m.signId)}`);
          if (!res.ok) return null;
          const data = await res.json();
          return data.status === "signed" ? m.id : null;
        } catch { return null; }
      }))).filter(Boolean);
      if (cancelled || !signedIds.length) return;
      const updated = cases.map(c => c.id === activeCaseId
        ? { ...c, meetings: c.meetings.map(m => signedIds.includes(m.id) ? { ...m, signStatus: "signed" } : m) }
        : c);
      saveCases(updated, activeCaseId);
    })();
    return () => { cancelled = true; };
    // cases/saveCases deliberately excluded — this should check once per
    // case-view visit, not re-run on every unrelated case-data change
    // (which would refire the check mid-edit and spam the signing API).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeCaseId]);

  // Phase 13 — "What Changed Since Last View." Reads the stored
  // last_viewed_at BEFORE recordCaseView overwrites it below, same
  // once-per-visit shape as the signature-sync effect just above (deps
  // deliberately just [screen, activeCaseId] — this should diff once per
  // open, not re-run and keep sliding the comparison point forward on
  // every unrelated case edit while the user is still looking at it).
  useEffect(() => {
    if (screen !== SCREENS.CASE_VIEW || !activeCaseId) return;
    const cs = cases.find(c => c.id === activeCaseId);
    if (!cs) return;
    const priorView = caseViews.find(v => v.caseId === activeCaseId);
    const changes = computeChangesSinceView(priorView?.lastViewedAt, { auditLog, caseSignals }, activeCaseId);
    setChangesSinceView(prev => ({ ...prev, [activeCaseId]: changes }));
    if (isNonTrivialChange(changes)) generateChangesSummary(cs, changes);
    recordCaseView(activeCaseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeCaseId]);

  const [activePerson, setActivePerson] = useState(null);
  const [activeCaseStage, setActiveCaseStage] = useState("investigation");
  const [showAppealInput, setShowAppealInput] = useState({});
  const [showEvidencePanel, setShowEvidencePanel] = useState({});
  const [evidenceNote, setEvidenceNote] = useState({});
  const [appealText, setAppealText] = useState({});
  const [intake, setIntake] = useState({employee:"",manager:"",issue:"",type:"",dateReceived:new Date().toISOString().split("T")[0],description:"",referredBy:"",urgent:false});
  const [liveChatHistory, setLiveChatHistory] = useState([]);
  const [liveChatProcessing, setLiveChatProcessing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [homeChatHistory, setHomeChatHistory] = useState([]);
  const [homeChatOpen, setHomeChatOpen] = useState(false);
  const [homeChatProcessing, setHomeChatProcessing] = useState(false);

  const sendForSignature = async (employeeEmail) => {
    if(!employeeEmail||!reviewOutput) return;
    setSignStatus("pending");

    // Note: saveMeetingToCase() is called after signature success
    // so we don't auto-save here (avoids duplicate / wrong case allocation)
    const appUrl = window.location.origin;

    // Store document in Supabase via API. Authenticated — this step creates
    // the signing request and mints its sign_id server-side, unlike the
    // signer's later PATCH, which is intentionally reachable without a
    // session (see api/signing.js).
    const storeRes = await authedFetch("/api/signing", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        document: (()=>{
        const full = reviewOutput;
        const start = full.indexOf("## Meeting Details");
        const advisorCut = full.indexOf("## HR Advisor");
        const keyCut = full.indexOf("\n## Key Points");
        const end = advisorCut>-1 ? advisorCut : keyCut>-1 ? keyCut : undefined;
        const raw = start>-1 ? full.slice(start, end) : full.slice(0, advisorCut>-1?advisorCut:undefined);
        return raw.replace(/^## /gm,"").replace(/^# /gm,"").replace(/\*\*/g,"");
      })(),
        employeeName: caseInfo.employee||"Employee",
        managerName: caseInfo.manager||"Manager",
        meetingType: meetingType?.label||"Meeting",
        meetingDate: caseInfo.date||new Date().toLocaleDateString("en-GB")
      })
    });
    if(!storeRes.ok) {
      showToast("Couldn't prepare the document for signing — please try again", "error");
      setSignStatus(null);
      return;
    }
    const { signId } = await storeRes.json();
    setSignId(signId);

    // Send email via Resend
    const res = await authedFetch("/api/send-for-signature", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        employeeEmail,
        employeeName: caseInfo.employee||"Employee",
        managerName: caseInfo.manager||"Manager",
        meetingType: meetingType?.label||"Meeting",
        meetingDate: caseInfo.date||new Date().toLocaleDateString("en-GB"),
        signId,
        appUrl
      })
    });
    
    const data = await res.json();
        if(data.success) {
      showToast("Signature request sent to "+employeeEmail);
      setShowSignModal(false);
      // saveMeetingToCase() navigates to the saved case itself now (both
      // branches — witness interviews to the linked case, regular meetings
      // to the found-or-just-created one), so this no longer needs its own
      // duplicate lookup-and-navigate logic.
      saveMeetingToCase();
    } else {
      showToast("Failed to send: "+(data.error||JSON.stringify(data)), "error");
    }
  };

  const sendLiveChat = async () => {
    if(!liveChatInput.trim()||liveChatProcessing) return;
    const question = liveChatInput.trim();
    setLiveChatInput("");
    setLiveChatHistory(h=>[...h,{role:"user",content:question}]);
    setLiveChatProcessing(true);
    try {
      const tx = transcript.map(u=>u.text).join(String.fromCharCode(10))||inputText;
      const res = await authedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-6",
          max_tokens:300,
          stream:false,
          system:"You are a senior UK HR advisor listening live to a HR meeting. Give brief, direct, practical advice as a trusted colleague in the room would. Reference ACAS and relevant law where helpful. Plain text only — no asterisks, no bold.",
          messages:[
            ...liveChatHistory.map(m=>({role:m.role,content:m.content})),
            {role:"user",content:"Meeting type: "+(meetingType?.label||"General")+String.fromCharCode(10)+"Employee: "+(caseInfo.employee||"Unknown")+String.fromCharCode(10)+"Transcript so far:"+String.fromCharCode(10)+tx+String.fromCharCode(10)+"Question: "+question}
          ]
        })
      });
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(text) setLiveChatHistory(h=>[...h,{role:"assistant",content:text}]);
    } catch(e) { console.error(e); }
    setLiveChatProcessing(false);
  };

  const updateLiveContext = async (notes) => {
    if(notes.trim().split(/\s+/).length < 10) return;
    setLiveContextLoading(true);
    try {
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({model:"claude-sonnet-4-6", max_tokens:250, stream:false,
          system:"You are an HR advisor listening to a live meeting. In 2-3 short sentences, summarise the key points covered so far and flag any immediate legal or procedural risks. No questions. No bullet points. Plain prose only. Be specific to what was said.",
          messages:[{role:"user", content:"Meeting: "+(meetingType?.label||"General")+"\nNotes:\n"+notes.slice(-2000)}]})});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(text) setLiveContext(text);
    } catch(e) { }
    setLiveContextLoading(false);
  };
  const [homeAttachment, setHomeAttachment] = useState(null);
  const [liveContext, setLiveContext] = useState(null);
  const [liveContextLoading, setLiveContextLoading] = useState(false);
  const [meetingIntelligence, setMeetingIntelligence] = useState(null);
  const [dismissedNudgeKey, setDismissedNudgeKey] = useState(null);
  // M5 — dismissedFollowUpKey mirrors dismissedNudgeKey exactly: keyed on
  // the suggestion's own text, so dismissing one specific follow-up
  // doesn't suppress a genuinely different one a later pass proposes.
  const [dismissedFollowUpKey, setDismissedFollowUpKey] = useState(null);
  // Manager Enablement (Phase 4, MP14, §10/§11) — unlike
  // dismissedNudgeKey/dismissedFollowUpKey above (content-keyed, so a
  // new meeting's different content naturally makes them reappear), the
  // three coaching-tip keys are fixed strings — reset explicitly in
  // HomeMeetingScreen's commit() when a new meeting starts, or a
  // dismissal in one meeting would silently suppress that tip in every
  // later meeting this session.
  const [dismissedCoachingTipKeys, setDismissedCoachingTipKeys] = useState([]);
  // M3 — live evidence/witness mentions, made actionable. Enriched from
  // meetingIntelligence.evidenceMentioned (kept session-local, distinct
  // from that raw AI array) so accept/dismiss state survives across
  // repeated live passes instead of being wiped out each cycle — same
  // "AI proposes, session-local until acted on" shape as evidenceSuggestions.
  const [meetingEvidenceSuggestions, setMeetingEvidenceSuggestions] = useState([]);
  // M4 — live action/commitment detection, made actionable. Same shape and
  // merge discipline as meetingEvidenceSuggestions above.
  const [meetingActionSuggestions, setMeetingActionSuggestions] = useState([]);
  // M9 — Meeting Quality Check. Advisory only, never blocking — see
  // attemptEndMeeting below.
  const [showQualityCheck, setShowQualityCheck] = useState(false);
  const [qualityCheckGaps, setQualityCheckGaps] = useState([]);
  // Manager Enablement (Phase 4, MP10, §16) — Investigation Quality
  // Check. Same advisory-only shape, but a separate gap set
  // (computeInvestigationQualityGaps) and its own modal, since it's
  // triggered from three different places (CaseViewScreen's next-step
  // banner, MeetingsTab's own button, and the assigned investigator's
  // restricted view) rather than living component-local like
  // OutcomeModal's own decision-quality check — see
  // attemptSubmitInvestigation below.
  const [showInvestigationQualityCheck, setShowInvestigationQualityCheck] = useState(false);
  const [investigationQualityGaps, setInvestigationQualityGaps] = useState([]);
  const [investigationQualitySubmitCaseId, setInvestigationQualitySubmitCaseId] = useState(null);

  // ── Intelligent Meeting Mode — live panels ──
  // Fires on the same throttled cadence as updateLiveContext (every 3rd
  // utterance) rather than its own timer — no new polling infrastructure.
  // A separate call from updateLiveContext rather than folding into it:
  // that one's existing prose-summary contract stays untouched, this adds
  // structured data alongside it. possibleInconsistency compares the
  // *current live transcript* against itself (an early/late answer from
  // the same meeting) — distinct from Phase 3's generateInconsistencies,
  // which compares across separate, already-saved meetings.
  const updateMeetingIntelligence = async (notes) => {
    if(notes.trim().split(/\s+/).length < 10) return;
    try {
      // M2 — when the meeting has a real structured question list (M1),
      // track per-question status against it instead of the old free-text
      // questionsAsked/questionsRemoved arrays. Only AI-owned questions
      // (statusSource !== "user") are even sent to the model, so a status
      // the user already set by hand can never come back changed — the
      // model was simply never asked about it. Meetings started via "Skip
      // prep" have no prepQuestions at all, so this falls back to the
      // original free-text behaviour unchanged.
      const trackedQuestions = prepQuestions.filter(q=>q.statusSource!=="user");
      const plannedQuestions = trackedQuestions.length ? "" : ((prepNotes.match(/## Key Questions\n([\s\S]*?)(\n## |$)/)||[])[1]||"");
      const questionContext = trackedQuestions.length
        ? "\nQuestions to track (id: text):\n"+trackedQuestions.map(q=>q.id+": "+q.text).join("\n")
        : (plannedQuestions?"\nPlanned key questions:\n"+plannedQuestions:"");
      const questionInstruction = trackedQuestions.length
        ? "For each question under \"Questions to track\", judge its current status from the transcript and add it to questionStatusUpdates as {\"id\":\"<its id>\",\"status\":\"asked\"|\"answered\"|\"partially_answered\"|\"not_asked\"|\"no_longer_relevant\"}. Only include a question you have real evidence for in the transcript — omit ones you're unsure about rather than guessing."
        : "Where the planned key questions are provided, track which have been asked in questionsAsked and questionsRemaining.";
      const questionShape = trackedQuestions.length
        ? "\"questionStatusUpdates\":[{\"id\":\"...\",\"status\":\"...\"}],"
        : "\"questionsAsked\":[\"...\"],\"questionsRemaining\":[\"...\"],";
      const todayStr = new Date().toLocaleDateString("en-GB");
      // M5 — capped to one live suggestion at a time (spec's own "do not
      // flood the interface" instruction): if the previous pass already
      // produced one the user hasn't dismissed or inserted yet, don't even
      // ask for a new one this cycle rather than silently replacing it.
      const hasPendingFollowUp = !!meetingIntelligence?.suggestedFollowUp && meetingIntelligence.suggestedFollowUp.text!==dismissedFollowUpKey;
      const followUpInstruction = hasPendingFollowUp
        ? "Set suggestedFollowUp to null — one is already pending review."
        : "If (and only if) something just said clearly invites one natural next question — a name, event or detail mentioned without enough detail to act on — set suggestedFollowUp to {\"text\":\"the question, phrased naturally\",\"reasoning\":\"one short sentence on why this is worth asking\"}. Otherwise set it null. At most one suggestion, and only when there's a genuinely good one — most passes should return null here.";
      // M6 — cross-meeting-aware contradiction context. Previously this
      // only ever compared the live transcript against itself. Resolves
      // the case the same way M3/M4 do (matches by employee name, not
      // just caseInfo._linkedCaseId, which only covers witness interviews)
      // so this actually fires for the realistic common case — a
      // follow-up meeting on an ongoing investigation — not just witness
      // interviews. Bounded like buildHardenedCaseContext elsewhere:
      // titles/short excerpts only, never a full case dump.
      const linkedCaseForContext = cases.find(c=>c.id===caseInfo._linkedCaseId) || cases.find(c=>c.employeeName.toLowerCase()===caseInfo.employee.trim().toLowerCase());
      let crossMeetingContext = "";
      if(linkedCaseForContext) {
        const openInconsistencies = openSignalsForCase(caseSignals, linkedCaseForContext.id, "inconsistency");
        const openQuestions = openSignalsForCase(caseSignals, linkedCaseForContext.id, "unanswered_question");
        const recentMeetings = (linkedCaseForContext.meetings||[]).filter(m=>m.record).slice(-2);
        const parts = [
          openInconsistencies.length ? "Potential inconsistencies already noted on this case:\n"+openInconsistencies.map(s=>"- "+s.title).join("\n") : null,
          openQuestions.length ? "Unanswered questions already noted on this case:\n"+openQuestions.map(q=>"- "+q.title).join("\n") : null,
          recentMeetings.length ? "Excerpts from this case's recent prior meetings:\n"+recentMeetings.map(m=>(m.type||"Meeting")+" on "+m.date+":\n"+(m.record||"").slice(0,600)).join("\n\n") : null,
        ].filter(Boolean);
        crossMeetingContext = parts.length ? "\n\nPRIOR CASE CONTEXT — compare live statements against this too, not just the current transcript:\n"+parts.join("\n\n") : "";
      }
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({model:"claude-sonnet-4-6", max_tokens:700, stream:false,
          system:"You are Compass, an Employee Relations copilot silently tracking a live HR meeting. Read the transcript so far. "+questionInstruction+" For evidenceMentioned, capture anything referred to that isn't already on record — a document, recording, message or piece of physical/digital evidence (kind:\"evidence\", e.g. \"CCTV footage from the loading bay\", \"a WhatsApp message to their manager\"), or a person named as having relevant knowledge who isn't already a participant in this meeting (kind:\"witness\", e.g. \"Sarah Jones\"). For actionsIdentified, capture only genuine commitments someone in the meeting actually made (e.g. \"I'll send the screenshots tomorrow\", \"HR will check the CCTV\") — never a generic to-do you've inferred yourself. suggestedOwner is who said they'd do it (or \"HR\" if HR committed to it), suggestedDueDate is a DD/MM/YYYY date if the transcript implies a timeframe (today's date is given at the start of the message below, so \"tomorrow\" etc. can be resolved relative to it) or null if no timeframe was mentioned. "+followUpInstruction+" Only report a possible inconsistency if someone's later statement genuinely conflicts with something specific they (or another named participant) said earlier in THIS transcript, or with something in the PRIOR CASE CONTEXT section if one is provided below — never flag a mere gap or a different emphasis, and never state or imply anyone is lying. Respond ONLY with valid JSON, no other text: {"+questionShape+"\"newIssues\":[\"...\"],\"evidenceMentioned\":[{\"description\":\"...\",\"kind\":\"evidence\"|\"witness\"}],\"actionsIdentified\":[{\"description\":\"...\",\"suggestedOwner\":\"...\",\"suggestedDueDate\":\"DD/MM/YYYY\"|null}],\"suggestedFollowUp\":{\"text\":\"...\",\"reasoning\":\"...\"}|null,\"possibleInconsistency\":{\"earlier\":\"...\",\"later\":\"...\",\"suggestedQuestion\":\"...\"}} — omit possibleInconsistency (set it null) if there is none. Keep every array short — only real, specific items, empty arrays where nothing applies.",
          messages:[{role:"user", content:"Today: "+todayStr+"\nMeeting: "+(meetingType?.label||"General")+"\nEmployee: "+(caseInfo.employee||"Unknown")+questionContext+"\n\nTranscript so far:\n"+notes.slice(-3000)+crossMeetingContext}]})});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      // Preserve the still-pending follow-up rather than letting the
      // model's (correctly-instructed) null response wipe it from the UI —
      // followUpInstruction only told the model not to propose a *new*
      // one this cycle, the existing one is still awaiting the user.
      if(hasPendingFollowUp) parsed.suggestedFollowUp = meetingIntelligence.suggestedFollowUp;
      setMeetingIntelligence(parsed);
      if(Array.isArray(parsed.questionStatusUpdates)) {
        setPrepQuestions(qs => parsed.questionStatusUpdates.reduce(
          (acc,u) => (u?.id && u?.status) ? setPrepQuestionStatusHelper(acc, u.id, u.status, "ai") : acc,
          qs
        ));
      }
      // M3 — merge newly-mentioned evidence/witnesses into the running,
      // actionable list rather than replacing it wholesale: a later pass
      // re-reporting the same mention (transcript.slice(-3000) can see it
      // again for a while) must not duplicate or reset a suggestion the
      // user already accepted or dismissed.
      if(Array.isArray(parsed.evidenceMentioned) && parsed.evidenceMentioned.length) {
        setMeetingEvidenceSuggestions(existing => {
          const known = new Set(existing.map(s=>s.description.trim().toLowerCase()));
          const fresh = parsed.evidenceMentioned
            .filter(m=>m?.description && !known.has(m.description.trim().toLowerCase()))
            .map((m,i)=>({ id:"mes_"+Date.now()+"_"+i, description:m.description, kind:m.kind==="witness"?"witness":"evidence", status:"pending" }));
          return fresh.length ? [...existing, ...fresh] : existing;
        });
      }
      // M4 — same merge discipline for detected actions/commitments.
      if(Array.isArray(parsed.actionsIdentified) && parsed.actionsIdentified.length) {
        setMeetingActionSuggestions(existing => {
          const known = new Set(existing.map(s=>s.description.trim().toLowerCase()));
          const fresh = parsed.actionsIdentified
            .filter(a=>a?.description && !known.has(a.description.trim().toLowerCase()))
            .map((a,i)=>({ id:"mas_"+Date.now()+"_"+i, description:a.description, suggestedOwner:a.suggestedOwner||"", suggestedDueDate:a.suggestedDueDate||"", status:"pending" }));
          return fresh.length ? [...existing, ...fresh] : existing;
        });
      }
    } catch(e) { console.error("updateMeetingIntelligence", e); }
  };

  // M3 — accept/dismiss for live evidence/witness mentions. Mirrors
  // acceptDocumentFinding's witness/action branches exactly (App.jsx's
  // document-analysis pipeline, Phase 7): a witness mention becomes an
  // interview task, an evidence mention becomes a request task. Resolves
  // the target case the same way saveMeetingToCase() itself will at save
  // time (App.jsx:3721) — caseInfo._linkedCaseId only covers witness
  // interviews; an ordinary follow-up meeting on an employee who already
  // has a case is matched by employee name, not a pre-set link, so
  // checking _linkedCaseId alone would miss the common case. A brand-new
  // meeting for an employee with no existing case has nowhere to attach a
  // task until it's saved, so acceptance is still recorded locally either
  // way (the sidebar reflects the user's decision) but the real task only
  // gets created when a matching case already exists.
  const acceptMeetingEvidenceSuggestion = (suggestion) => {
    const existingCase = cases.find(c=>c.employeeName.toLowerCase()===caseInfo.employee.trim().toLowerCase());
    const caseId = caseInfo._linkedCaseId || existingCase?.id;
    let applied = false;
    if(caseId) {
      createCaseTask(caseId, {
        name: suggestion.kind==="witness"
          ? "Interview "+suggestion.description+" as a potential witness"
          : "Request "+suggestion.description,
      });
      applied = true;
    } else {
      showToast("Noted — save this meeting to a case to turn it into a task");
    }
    // applied:false here is exactly what M8's post-meeting review panel
    // looks for — an already-accepted decision with nothing created yet,
    // applied automatically once a real case exists at save time.
    setMeetingEvidenceSuggestions(s => s.map(x=>x.id===suggestion.id?{...x,status:"accepted",applied}:x));
  };
  const dismissMeetingEvidenceSuggestion = (id) => setMeetingEvidenceSuggestions(s => s.map(x=>x.id===id?{...x,status:"dismissed"}:x));

  // M4 — accept/dismiss for detected actions/commitments. Same case-
  // resolution and "record locally either way" behaviour as M3's
  // acceptMeetingEvidenceSuggestion above.
  const acceptMeetingActionSuggestion = (suggestion) => {
    const existingCase = cases.find(c=>c.employeeName.toLowerCase()===caseInfo.employee.trim().toLowerCase());
    const caseId = caseInfo._linkedCaseId || existingCase?.id;
    let applied = false;
    if(caseId) {
      createCaseTask(caseId, { name:suggestion.description, owner:suggestion.suggestedOwner||"", dueDate:suggestion.suggestedDueDate||"" });
      applied = true;
    } else {
      showToast("Noted — save this meeting to a case to turn it into a task");
    }
    setMeetingActionSuggestions(s => s.map(x=>x.id===suggestion.id?{...x,status:"accepted",applied}:x));
  };
  const dismissMeetingActionSuggestion = (id) => setMeetingActionSuggestions(s => s.map(x=>x.id===id?{...x,status:"dismissed"}:x));

  // M8 — applies any evidence/action suggestions the user already
  // accepted (live, or via the post-meeting review panel) but that
  // couldn't become a real task yet because no case existed at the time.
  // Called from saveMeetingToCase() once a real case id is finally known.
  // Still-pending (never decided) suggestions are deliberately left alone
  // here — silence isn't consent, only an explicit accept applies.
  const applyPendingMeetingSuggestions = (caseId) => {
    if(!caseId) return;
    meetingEvidenceSuggestions.filter(s=>s.status==="accepted" && !s.applied).forEach(s => {
      createCaseTask(caseId, {
        name: s.kind==="witness" ? "Interview "+s.description+" as a potential witness" : "Request "+s.description,
      });
    });
    meetingActionSuggestions.filter(s=>s.status==="accepted" && !s.applied).forEach(s => {
      createCaseTask(caseId, { name:s.description, owner:s.suggestedOwner||"", dueDate:s.suggestedDueDate||"" });
    });
  };

  const [meetingStartTime, setMeetingStartTime] = useState(null);
  const [meetingEndTime, setMeetingEndTime] = useState(null);
  const [editingRecord, setEditingRecord] = useState(false);
  const [reviewAttachment, setReviewAttachment] = useState(null);
  const [showSignModal, setShowSignModal] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showMobileNav, setShowMobileNav] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [toasts, setToasts] = useState([]);
  // ── Supabase case sync ──
  const loadCasesFromDB = async () => {
    if(!org?.id) return;
    try {
      // vault_docs is excluded — it's fetched but never read (mapCaseRow
      // doesn't map it), so it was pure dead weight on every case load.
      // meetings/evidence stay in: runSearch does full-text search over
      // transcripts client-side, so dropping them would silently break
      // search rather than just trimming payload.
      // Manager Enablement (Phase 4, MP1) — no client-side location_id
      // filter here any more: the new restrictive RLS policy on cases
      // (manager_enablement_case_access_2026-08-13.sql) already narrows
      // non-oversight roles down to created/owned/case_access-granted
      // cases, which can legitimately include a case outside a location_
      // manager's own assigned locations (e.g. HR explicitly granting
      // them investigator access elsewhere) — the old blanket
      // .in('location_id', ...) filter would have incorrectly hidden
      // exactly that case from the list. RLS is now the single source of
      // truth for what this query returns.
      const query = supabase.from('cases').select('id,employee_name,employee_email,meetings,evidence,stage,case_type,description,date_received,urgency,outcome,investigation_report,investigation_report_date,disciplinary_officer,disciplinary_officer_id,disciplinary_officer_email,investigating_manager,handoff_date,next_steps,location_id,estimated_weekly_pay,estimated_age_at_dismissal,assigned_to,created_by,created_at,updated_at,confidential,timeline_overrides,fit_note_end_date,probation_review_date,oh_referral_date,oh_report_received_date,suspension_review_date,investigation_paused').eq('org_id', org.id);
      const { data, error } = await query;
  if(!error && data) {
        setCases(data.map(mapCaseRow));
      }
    } catch(e) { console.error("Load cases error:", e); }
  };

  const saveCaseToDB = async (caseObj) => {
    if(!org?.id) return;
    const nowIso = new Date().toISOString();
    try {
      const payload = {
        id: caseObj.id,
        org_id: org.id,
        employee_name: caseObj.employeeName,
        employee_email: caseObj.email || "",
        meetings: caseObj.meetings || [],
        evidence: caseObj.evidence || [],
        stage: caseObj.stage || "open",
        case_type: caseObj.caseType || "",
        description: caseObj.description || "",
        date_received: caseObj.dateReceived || null,
        urgency: caseObj.urgency || "normal",
        outcome: caseObj.outcome || "",
        investigation_report: caseObj.investigationReport || null,
        investigation_report_date: caseObj.investigationReportDate || null,
        disciplinary_officer: caseObj.disciplinaryOfficer || null,
        disciplinary_officer_id: caseObj.disciplinaryOfficerId || null,
        disciplinary_officer_email: caseObj.disciplinaryOfficerEmail || null,
        investigating_manager: caseObj.investigatingManager || null,
        handoff_date: caseObj.handoffDate || null,
        next_steps: caseObj.nextSteps || [],
        estimated_weekly_pay: caseObj.estimatedWeeklyPay || null,
        estimated_age_at_dismissal: caseObj.estimatedAgeAtDismissal || null,
        location_id: caseObj.locationId || (member?.role==='location_manager'&&member?.location_ids?.[0])||null,
        assigned_to: user?.id || null,
        created_by: caseObj.createdBy || user?.id || null, // preserve the original creator across edits by other staff — the confidential-case RLS policy grants them access by this field
        confidential: caseObj.confidential || false,
        // manager/owner_id/priority: added in supabase/case_structure_2026-08-09.sql.
        // manager was previously read/displayed/reassigned throughout the app
        // (ReassignCaseModal, meeting setup) but never actually included in
        // this payload — there was no column to persist it to before that
        // migration, so every reassignment silently only ever updated local
        // state, never the database.
        manager: caseObj.manager || null,
        owner_id: caseObj.ownerId || null,
        priority: caseObj.priority || null,
        timeline_overrides: caseObj.timelineOverrides || {},
        fit_note_end_date: caseObj.fitNoteEndDate || null,
        probation_review_date: caseObj.probationReviewDate || null,
        oh_referral_date: caseObj.ohReferralDate || null,
        oh_report_received_date: caseObj.ohReportReceivedDate || null,
        suspension_review_date: caseObj.suspensionReviewDate || null,
        investigation_paused: caseObj.investigationPaused || false,
        updated_at: nowIso,
      };

      if(caseObj.updatedAt) {
        // Conditional update — only succeeds if nobody else has saved this
        // case since we last loaded it. A blind upsert here would silently
        // overwrite a teammate's concurrent edit with our full local copy,
        // including their changes to meetings/evidence we never saw.
        const { data, error } = await supabase.from('cases').update(payload).eq('id', caseObj.id).eq('updated_at', caseObj.updatedAt).select();
        if(error) { console.error("Save case error:", error); showToast("Couldn't save the case — "+error.message, "error"); return; }
        if(!data || data.length===0) {
          showToast("This case was updated elsewhere — reloading the latest version so you don't overwrite it", "error");
          loadCasesFromDB();
          return;
        }
      } else {
        const { error } = await supabase.from('cases').upsert(payload).select();
        if(error) { console.error("Save case error:", error); showToast("Couldn't save the case — "+error.message, "error"); return; }
      }
      setCases(prev => prev.map(c => c.id===caseObj.id ? {...c, updatedAt: nowIso} : c));
    } catch(e) { console.error("Save case error:", e); showToast("Couldn't save the case — "+e.message, "error"); }
  };

  const deleteCaseFromDB = async (caseId) => {
    if(!org?.id) return;
    const { error } = await supabase.from('cases').delete().eq('id', caseId);
    if(error) { console.error("Delete case error:", error); showToast("Couldn't delete the case — "+error.message, "error"); }
  };

  useEffect(() => { if(org?.id) loadCasesFromDB(); }, [org?.id]);
  // Pick up cases a teammate created/edited while this tab was in the
  // background — same cheap approach as the audit log, above. Without this,
  // a tab left open all day never sees anyone else's changes and a later
  // save from it can overwrite them (see the updated_at guard in
  // saveCaseToDB, which is the other half of that problem).
  useEffect(() => {
    const onFocus = () => { if(org?.id) loadCasesFromDB(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [org?.id]);

  // ── Team members ──
  const loadTeamMembers = async () => {
    if(!org?.id) return;
    const { data } = await supabase.from('org_members').select('*').eq('org_id', org.id);
    if(data) setTeamMembers(data);
  };

  const removeMember = async (member) => {
    const ok = await confirmDialog({title:"Remove team member", message:`Remove ${member.name} from the team? They will lose access to Compass immediately.`, confirmLabel:"Remove", danger:true});
    if(!ok) return;
    try {
      const r = await authedFetch("/api/delete-member", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ orgMemberId: member.id })
      });
      const d = await r.json();
      if(d.success) setTeamMembers(m=>m.filter(x=>x.id!==member.id));
      else showToast("Error: "+d.error, "error");
    } catch(e) { showToast("Error: "+e.message, "error"); }
  };

  const updateMemberRole = async (memberId, role) => {
    const { error } = await supabase.from("org_members").update({role}).eq("id", memberId);
    if(error) { console.error("updateMemberRole", error); showToast("Couldn't update role — "+error.message, "error"); return; }
    setTeamMembers(m=>m.map(x=>x.id===memberId?{...x,role}:x));
  };

  const assignLocations = async (memberId, locationIds) => {
    const { error } = await supabase.from("org_members").update({location_ids: locationIds}).eq("id", memberId);
    if(error) { console.error("assignLocations", error); showToast("Couldn't update locations — "+error.message, "error"); return; }
    setTeamMembers(m=>m.map(x=>x.id===memberId?{...x,location_ids:locationIds}:x));
  };

  const inviteMember = async () => {
    if(!inviteForm.name.trim()||!inviteForm.email.trim()) return;
    setInviting(true);
    try {
      const link = `https://compass-lemon-iota.vercel.app?invite=${org.invite_code}`;
      setInviteLink({
        name: inviteForm.name.trim(),
        email: inviteForm.email.trim(),
        link,
        code: org.invite_code
      });
      setInviteForm({name:"",email:"",role:"hr_manager",locationIds:[]});
    } catch(e) { showToast("Error: "+e.message, "error"); }
    setInviting(false);
  };

  // ── Locations ──
  const loadLocations = async () => {
    if(!org?.id) return;
    const { data } = await supabase.from('locations').select('*').eq('org_id', org.id);
    if(data) setLocations(data);
  };

  // Billing is priced per location — every add/remove needs to reach
  // Stripe too, not just the locations table, or the subscription quietly
  // drifts from what the org is actually using. Failing to sync isn't
  // treated as an error the user needs to see: the location change itself
  // already succeeded, and the next successful sync (or the webhook on
  // renewal) will catch up.
  const syncBillingQuantity = () => {
    if(!org?.id) return;
    authedFetch(`/api/billing/sync-quantity?orgId=${encodeURIComponent(org.id)}`, {method:"POST"})
      .catch(e=>console.error("Billing quantity sync failed:", e));
  };

  const addLocation = async (name) => {
    if(!org?.id||!name.trim()) return;
    const { data, error } = await supabase.from('locations').insert({ org_id: org.id, name: name.trim() }).select().single();
    if(error) { console.error("addLocation", error); showToast("Couldn't add location — "+error.message, "error"); return; }
    if(data) { setLocations(l=>[...l, data]); syncBillingQuantity(); }
  };

  const deleteLocation = async (id) => {
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if(error) { console.error("deleteLocation", error); showToast("Couldn't delete location — "+error.message, "error"); return; }
    setLocations(l=>l.filter(x=>x.id!==id));
    syncBillingQuantity();
  };

  // ── Process Templates (P18) — one row per (org, process type); saved via
  // upsert on that pair rather than separate insert/update paths, since
  // ProcessTemplatesSection always edits "the template for this process
  // type", whether or not a row already exists yet. ──
  const loadProcessTemplates = async () => {
    if(!org?.id) return;
    const { data } = await supabase.from('process_templates').select('*').eq('org_id', org.id);
    if(data) setProcessTemplates(data);
  };

  const saveProcessTemplate = async (processType, fields) => {
    if(!org?.id) return;
    const { data, error } = await supabase.from('process_templates')
      .upsert({ org_id: org.id, process_type: processType, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'org_id,process_type' })
      .select().single();
    if(error) { console.error("saveProcessTemplate", error); showToast("Couldn't save process template — "+error.message, "error"); return; }
    if(data) setProcessTemplates(list=>[...list.filter(t=>t.process_type!==processType), data]);
  };

  // ── HR Review Requests ──
  const loadHrReviews = async () => {
    if(!org?.id) return;
    const { data } = await supabase.from('hr_review_requests').select('*').eq('org_id', org.id).order('requested_at', {ascending: false});
    if(data) setHrReviewRequests(data);
  };

  // Process Intelligence (P9) — OutcomeModal calls this right after
  // saveCases() for the case it's scoped to; that case save is itself
  // fire-and-forget (saveCaseToDB), so this needs the same FK-race
  // protection every other case-scoped write already has (withFkRetry).
  // Not needed before P9 — the only prior call site (ReviewScreen's
  // "Request HR review") always fires well after its case was already
  // saved and settled.
  // `announce` defaults to true for ReviewScreen's "Request HR review"
  // button, which shows no toast of its own and relies on this one for
  // feedback. OutcomeModal (P9) passes false since it already shows its
  // own combined "Outcome recorded — approval requested" toast right
  // after calling this — without this flag the two toasts (single-slot
  // `toast` state) race and the generic one silently wins.
  const requestHrReview = async (step, caseId, meetingId, recordSnapshot, announce=true) => {
    if(!org?.id) return;
    const cs = cases.find(x=>x.id===caseId);
    const meeting = cs?.meetings.find(m=>m.id===meetingId);
    const { data, error } = await withFkRetry(() => supabase.from('hr_review_requests').insert({
      org_id: org.id,
      case_id: caseId,
      meeting_id: meetingId,
      step,
      requested_by: user?.id,
      requested_by_name: member?.name||user?.email,
      case_employee_name: cs?.employeeName,
      meeting_type: meeting?.type||meetingType?.label,
      record_snapshot: recordSnapshot||reviewOutput,
      status: 'pending'
    }).select().single());
    if(data) {
      setHrReviewRequests(r=>[data,...r]);
      if(announce) showToast("HR review requested");
    } else {
      console.error("requestHrReview", error);
      showToast("Couldn't request HR review — "+error?.message, "error");
    }
  };

  // Manager Enablement (Phase 4, MP12, §13) — "Escalate to HR". A new,
  // distinct step ("escalation") from ReviewScreen's own pre-existing
  // step:"record" request — that one stays exactly as it is, tied to a
  // specific just-recorded meeting. This is the persistent, case-wide
  // affordance the plan calls for: reachable from anywhere on a case
  // (CaseViewScreen's header, and the investigator's own restricted
  // view), auto-attaching context via buildEscalationContext rather than
  // making the manager explain the situation from scratch.
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateCaseId, setEscalateCaseId] = useState(null);
  const openEscalateModal = (caseId) => { setEscalateCaseId(caseId); setShowEscalateModal(true); };
  const escalateToHr = (note) => {
    const cs = cases.find(c=>c.id===escalateCaseId);
    if(!cs) return;
    const context = buildEscalationContext({
      employeeName: cs.employeeName,
      caseType: cs.caseType,
      stageLabel: stageLabel(cs.caseType, getCaseStage(cs)),
      lastMeeting: (cs.meetings||[])[(cs.meetings||[]).length-1]||null,
      allegationsCount: allegationsForCase(allegations, cs.id).length,
      evidenceCount: (cs.evidence||[]).length,
      openQuestionsCount: openSignalsForCase(caseSignals, cs.id, "unanswered_question").length,
      note,
    });
    requestHrReview("escalation", escalateCaseId, null, context, true);
  };

  const respondToReview = async (reviewId, status, comments) => {
    const { data, error } = await supabase.from('hr_review_requests').update({
      status,
      comments,
      reviewed_by: user?.id,
      reviewed_by_name: member?.name||user?.email,
      reviewed_at: new Date().toISOString()
    }).eq('id', reviewId).select().single();
    if(data) setHrReviewRequests(r=>r.map(x=>x.id===reviewId?data:x));
    else { console.error("respondToReview", error); showToast("Couldn't submit your response — "+error?.message, "error"); }
  };

  const isHR = isHrRole(member?.role);

  useEffect(()=>{ if(org?.id){ loadLocations(); loadHrReviews(); loadOrgRoles(); loadOrgMembers(); loadEmployeeRecords(); loadTeamMembers(); loadStarterInstances(); loadLeaverInstances(); loadDsarRequests(); loadPortalAccounts(); loadAllegations(); loadCaseTasks(); loadCaseSignals(); loadConcernReferrals(); loadCaseAccess(); loadCaseViews(); loadProcessTemplates(); if(isHR) loadWellbeingNotes(); } }, [org?.id, isHR, user?.id]);

  // Deliberately keyed only on transcript.length: this throttles the context
  // refresh to every 3rd utterance while recording. screen/transcript/updateLiveContext
  // are read from the same render that this effect fires in (React re-creates the
  // closure every render, only skips invoking it), so they're never stale here —
  // adding them as deps would instead re-fire this on every screen change, e.g.
  // re-triggering an API call just from navigating back into Record.
  useEffect(()=>{
    if(screen===SCREENS.RECORD && transcript.length>0 && transcript.length%3===0) {
      const notes = transcript.map(u=>u.text).join(" ");
      updateLiveContext(notes);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- same fire-and-forget shape as updateLiveContext just above (async, setState only after an await); the rule doesn't flag that call, only this one, for reasons unclear from its generic message — both are equally safe here.
      updateMeetingIntelligence(notes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript.length]);




  useEffect(()=>{
    const handler = ()=>setIsMobile(window.innerWidth<768);
    window.addEventListener("resize", handler);
    return ()=>window.removeEventListener("resize", handler);
  }, []);
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [pendingLetterType, setPendingLetterType] = useState("outcome");
  const pendingLetterTypeRef = useRef("outcome");
  const [locations, setLocations] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [inviteForm, setInviteForm] = useState({name:"",email:"",role:"hr_manager",locationIds:[]});
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [hrReviewRequests, setHrReviewRequests] = useState([]);
  const [processTemplates, setProcessTemplates] = useState([]);
  const [acasData, setAcasData] = useState({});
  const [redundancyData, setRedundancyData] = useState({});
  const [showEmailLetter, setShowEmailLetter] = useState(false);
  const [emailLetterTo, setEmailLetterTo] = useState("");
  const [editingLetter, setEditingLetter] = useState(false);
  const [appealDetected, setAppealDetected] = useState(false);
  const [showLinkCase, setShowLinkCase] = useState(false);
  const appealDetectedRef = useRef(false);
  const [signEmail, setSignEmail] = useState("");
  const [signId, setSignId] = useState(null);
  const [signStatus, setSignStatus] = useState(null);
  const [editingStructured, setEditingStructured] = useState(false);
  const liveContextTimer = useRef(null);
  const meetingEndedRef = useRef(false);
  const [showCasePrompt, setShowCasePrompt] = useState(false);
  const [casePromptName, setCasePromptName] = useState("");

  const closeCasePrompt = () => {
    setShowCasePrompt(false);
    setCasePromptName("");
    setNewCaseJobTitle("");
    setNewCaseStartDate("");
    setNewCaseLocation("");
    setNewCaseType("");
    setNewCaseDescription("");
    setNewCaseLocationOther("");
    setNewCaseOwnerId("");
    setNewCasePriority("normal");
    setNewCaseEvidence([]);
  };

  const createCaseFromChat = () => {
    if(!casePromptName.trim()) return;
    const newCase = {
      id: crypto.randomUUID(),
      employeeName: casePromptName.trim(),
      employeeEmail: "",
      createdAt: new Date().toISOString(),
      meetings: [],
      backgroundChat: homeChatHistory,
    };
    saveCases([...cases, newCase]);
    setShowCasePrompt(false);
    setCasePromptName("");
    setScreen(SCREENS.CASES);
  };

  const askCompass = async (msg, history, setHistory, setProcessing) => {
    if(!msg.trim() && !homeAttachment) return;
    setProcessing(true);
    // Kept out of the system prompt (below) and appended to the user turn
    // instead — cases change constantly, and the system prompt is
    // otherwise identical on every call, so this is what makes it worth
    // prompt-caching (see api/chat.js).
    const caseContext = cases.length > 0
      ? "Active cases: " + cases.map(ca=>ca.employeeName + " ("+ca.meetings.length+" meetings)").join(", ")
      : "No active cases yet.";
    const sys = "You are Compass, an expert UK HR AI assistant. You help HR managers with UK employment law, ACAS codes of practice, and HR best practice. Give thorough, practical answers. Use plain numbered lists and bullet points (- ) for structure. Never use ## headers, never use ** for bold, never use emoji, never use markdown tables. Plain clear English only. Separate sections with a blank line.";

    let userContent;
    if(homeAttachment?.base64) {
      userContent = [
        {type:"document", source:{type:"base64", media_type:"application/pdf", data:homeAttachment.base64}},
        {type:"text", text:(msg||"Please review this document and advise on any HR or legal considerations.")+"\n\n"+caseContext}
      ];
    } else {
      userContent = (msg||"")+"\n\n"+caseContext;
    }
    
    const newHistory = [...history, {role:"user", content:userContent}];
    const displayHistory = [...history, {role:"user", content:msg||"Please review the attached document."}];
    setHistory(displayHistory);
    
    try {
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-6",
          max_tokens:3000,
          stream:false,
          system:sys,
          messages:newHistory,
          tools:[{type:"web_search_20250305",name:"web_search"}]
        })});
      const data = await res.json();
      const reply = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("") || "Sorry, I could not generate a response.";
      setHistory([...displayHistory, {role:"assistant", content:reply}]);
      setHomeAttachment(null);
    } catch(e) {
      setHistory([...displayHistory, {role:"assistant", content:"Sorry, something went wrong."}]);
    }
    setProcessing(false);
  };
  const [bgDoc, setBgDoc] = useState(null); // {name, text}

  // ── Deadline reminders ──
  const [dueSoon, setDueSoon] = useState([]);
  const [notifGranted, setNotifGranted] = useState(false);
  const [emailDigestOptIn, setEmailDigestOptIn] = useState(member?.email_digest_opt_in !== false);
  const toggleEmailDigest = async () => {
    const next = !emailDigestOptIn;
    setEmailDigestOptIn(next);
    if(member?.id) {
      const { error } = await supabase.from('org_members').update({email_digest_opt_in: next}).eq('id', member.id);
      if(error) { setEmailDigestOptIn(!next); showToast("Couldn't update digest setting — please try again"); }
    }
  };

  // ── Team chat notifications (Slack/Teams) ──
  const [orgWebhookUrl, setOrgWebhookUrl] = useState(org?.notification_webhook_url||"");
  const [orgWebhookType, setOrgWebhookType] = useState(org?.notification_webhook_type||"slack");
  const saveOrgWebhook = async (url, type) => {
    if(!org?.id) return;
    setOrgWebhookUrl(url); setOrgWebhookType(type);
    const { error } = await supabase.from('organisations').update({notification_webhook_url: url||null, notification_webhook_type: type}).eq('id', org.id);
    if(error) showToast("Couldn't save webhook — please try again", "error");
    else showToast("Notification settings saved");
  };
  const sendTestWebhook = async () => {
    if(!orgWebhookUrl||!org?.id||!user?.id) return;
    try {
      const res = await authedFetch("/api/cron/test-notify", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({orgId: org.id, url: orgWebhookUrl, type: orgWebhookType}),
      });
      showToast(res.ok?"Test message sent":"Webhook responded with an error — check the URL", res.ok?"success":"error");
    } catch(e) { showToast("Couldn't reach that webhook URL", "error"); }
  };
  const [toast, setToast] = useState(null);

  const showToast = (message, type="success", duration=3000) => {
    setToast({message, type});
    setTimeout(()=>setToast(null), duration);
  };

  // In-app replacement for window.confirm — returns a Promise<boolean> so
  // call sites can `if(!await confirmDialog({...})) return;` the same way
  // they used to with the blocking native dialog.
  const [confirmState, setConfirmState] = useState(null);
  const confirmDialog = ({title, message, confirmLabel, cancelLabel, danger}) => {
    return new Promise(resolve => {
      setConfirmState({title, message, confirmLabel, cancelLabel, danger, resolve});
    });
  };

  // In-app replacement for window.prompt() — returns a Promise<object|null>
  // (null if cancelled) so call sites that used to chain several sequential
  // prompt() calls can collect all fields in one styled form instead.
  const [promptState, setPromptState] = useState(null);
  const promptDialog = ({title, message, fields, confirmLabel, cancelLabel}) => {
    return new Promise(resolve => {
      setPromptState({title, message, fields, confirmLabel, cancelLabel, resolve});
    });
  };

  // New starter onboarding
  const [starterTemplates, setStarterTemplates] = useState(ls("compass_starter_templates", [{
    id:"default", name:"Standard Employee Onboarding", createdAt:new Date().toISOString(),
    phases:[
      { id:"pre", label:"Before day 1", tasks:[
        { id:"t1", task:"Send welcome email with start details", owner:"HR", day:-3 },
        { id:"t2", task:"Set up IT equipment and system access", owner:"IT", day:-2 },
        { id:"t3", task:"Prepare desk / workspace", owner:"Line Manager", day:-1 },
        { id:"t4", task:"Send first day agenda", owner:"HR", day:-1 },
        { id:"t5", task:"Complete right to work check", owner:"HR", day:-1 },
      ]},
      { id:"w1", label:"Week 1", tasks:[
        { id:"t6", task:"Conduct induction meeting", owner:"HR", day:1 },
        { id:"t7", task:"Introduce to team", owner:"Line Manager", day:1 },
        { id:"t8", task:"Complete health and safety induction", owner:"Line Manager", day:1 },
        { id:"t9", task:"Share company handbook and policies", owner:"HR", day:2 },
        { id:"t10", task:"Set up payroll and benefits", owner:"HR", day:3 },
        { id:"t11", task:"End of week 1 check-in", owner:"Line Manager", day:5 },
      ]},
      { id:"m1", label:"Month 1", tasks:[
        { id:"t12", task:"Complete mandatory training", owner:"HR", day:14 },
        { id:"t13", task:"First 1-2-1 with line manager", owner:"Line Manager", day:14 },
        { id:"t14", task:"Set initial objectives", owner:"Line Manager", day:21 },
        { id:"t15", task:"Review probation plan and expectations", owner:"HR", day:28 },
      ]},
      { id:"m3", label:"Month 3", tasks:[
        { id:"t16", task:"Mid-probation review meeting", owner:"Line Manager", day:90 },
        { id:"t17", task:"Training needs assessment", owner:"Line Manager", day:90 },
      ]},
      { id:"prob", label:"End of probation", tasks:[
        { id:"t19", task:"Formal probation review meeting", owner:"Line Manager", day:180 },
        { id:"t20", task:"Issue probation outcome letter", owner:"HR", day:183 },
        { id:"t21", task:"Set 12-month objectives", owner:"Line Manager", day:187 },
      ]},
    ],
  }]));
  const [starterInstances, setStarterInstances] = useState(ls("compass_starters", []));
  const [dsarRequests, setDsarRequests] = useState([]);
  const [activeStarter, setActiveStarter] = useState(null);
  const [starterView, setStarterView] = useState("list");
  const [starterAiProcessing, setStarterAiProcessing] = useState(false);
  const [newStarterForm, setNewStarterForm] = useState({name:"",role:"",department:"",manager:"",email:"",startDate:"",templateId:"default"});

  // ── Leaver offboarding ──
  const [leaverTemplates, setLeaverTemplates] = useState(ls("compass_leaver_templates", [{
    id:"default", name:"Standard Employee Offboarding", createdAt:new Date().toISOString(),
    phases:[
      { id:"notice", label:"On notice received", tasks:[
        { id:"l1", task:"Acknowledge resignation/notice in writing", owner:"HR", day:0 },
        { id:"l2", task:"Confirm last working day and notice period", owner:"HR", day:0 },
        { id:"l3", task:"Update HR system and notify payroll", owner:"HR", day:1 },
        { id:"l4", task:"Inform line manager and team", owner:"Line Manager", day:1 },
      ]},
      { id:"before", label:"Before last day", tasks:[
        { id:"l5", task:"Schedule exit interview", owner:"HR", day:-7 },
        { id:"l6", task:"Agree handover plan and knowledge transfer", owner:"Line Manager", day:-7 },
        { id:"l7", task:"Confirm outstanding holiday balance", owner:"Payroll", day:-5 },
        { id:"l8", task:"Schedule access revocation and equipment return", owner:"IT", day:-1 },
      ]},
      { id:"lastday", label:"Last day", tasks:[
        { id:"l9", task:"Conduct exit interview", owner:"HR", day:0 },
        { id:"l10", task:"Collect keys, passes and equipment", owner:"Facilities", day:0 },
        { id:"l11", task:"Revoke system and building access", owner:"IT", day:0 },
      ]},
      { id:"after", label:"After leaving", tasks:[
        { id:"l12", task:"Process final pay including outstanding holiday", owner:"Payroll", day:1 },
        { id:"l13", task:"Issue P45", owner:"Payroll", day:7 },
        { id:"l14", task:"Remove from distribution lists and directories", owner:"IT", day:1 },
        { id:"l15", task:"Redistribute responsibilities", owner:"Line Manager", day:1 },
      ]},
    ],
  }]));
  const [leaverInstances, setLeaverInstances] = useState(ls("compass_leavers", []));
  const [activeLeaver, setActiveLeaver] = useState(null);
  const [leaverView, setLeaverView] = useState("list");
  const [leaverAiProcessing, setLeaverAiProcessing] = useState(false);
  const [newLeaverForm, setNewLeaverForm] = useState({name:"",role:"",department:"",manager:"",email:"",lastWorkingDay:"",reason:"resignation",templateId:"default"});

  // ── Redundancy / consultation ──
  const [redundancyCases, setRedundancyCases] = useState(ls("compass_redundancy", []));
  // case: {id, type:"individual"|"collective", reason, poolDescription, selectionCriteria:[{criterion,weight}],
  //         atRiskEmployees:[{id,name,role,dept,score,selected,consultationMeetings:[],outcome:"",redundancyPay:""}],
  //         collectiveInfo:{count,hrOneRequired,notifiedDate,electionDate,consultationStartDate},
  //         status:"pool-building"|"at-risk"|"consultation"|"outcome"|"complete",
  //         createdAt, createdBy, aiAdvice:""}
  const [activeRedundancy, setActiveRedundancy] = useState(null);
  const [redundancyStep, setRedundancyStep] = useState("setup"); // setup|pool|consultation|outcome
  const [redundancyAiProcessing, setRedundancyAiProcessing] = useState(false);
  const [redundancyAiOutput, setRedundancyAiOutput] = useState("");

  // ── Mental health / wellbeing ──
  const [wellbeingNotes, setWellbeingNotes] = useState(ls("compass_wellbeing", []));
  // note: {id, employeeName, type:"chat"|"eap"|"adjustment"|"crisis"|"return"|"checkin",
  //         date, manager, content, followUpDate, followUpDone, supportOffered, resources:[], confidential:true}
  const [activeWellbeing, setActiveWellbeing] = useState(null); // employee name being viewed
  const [wellbeingForm, setWellbeingForm] = useState({employeeName:"",type:"chat",date:"",manager:"",content:"",followUpDate:"",supportOffered:"",confidential:true});
  const [wellbeingView, setWellbeingView] = useState("list"); // list|new|employee

  // ── Allegations (case-scoped issues under investigation) ──
  const [allegations, setAllegations] = useState([]);

  // ── Case tasks ──
  const [caseTasks, setCaseTasks] = useState([]);

  // ── Case signals (AI-copilot substrate: next-best-action, contradictions,
  // unanswered questions, procedural guardrails — see lib/caseSignals.js) ──
  const [caseSignals, setCaseSignals] = useState([]);
  const [nextActionLoading, setNextActionLoading] = useState({});
  // "Covered" topics aren't actionable, so — like caseOverview/
  // caseChatHistory — they're session-local, not persisted; only the
  // "still to explore" half becomes real unanswered_question signals.
  const [unansweredCovered, setUnansweredCovered] = useState({});
  const [unansweredLoading, setUnansweredLoading] = useState({});
  // Proposed evidence-to-allegation links are session-local until the user
  // accepts one, at which point it becomes a real link via the existing
  // linkEvidenceToAllegation()/saveCases() path — same "AI proposes, HR
  // confirms" shape as unansweredCovered, never auto-applied.
  const [evidenceSuggestions, setEvidenceSuggestions] = useState({});
  const [evidenceSuggestionsLoading, setEvidenceSuggestionsLoading] = useState({});
  const [timelineRelevanceLoading, setTimelineRelevanceLoading] = useState({});
  const [inconsistencyLoading, setInconsistencyLoading] = useState({});
  const [appealReviewLoading, setAppealReviewLoading] = useState({});
  // Process Intelligence (P14) — transient, regenerate-on-demand, keyed
  // by case id, same "not persisted to Supabase" pattern as caseOverview:
  // this is an on-demand comparison, not a record that needs to survive
  // a reload.
  const [consistencyReview, setConsistencyReview] = useState({});
  const [consistencyReviewLoading, setConsistencyReviewLoading] = useState({});

  // ── Concern referrals (manager self-service — any org member can raise
  // one, only HR triages) — see lib/concernReferrals.js ──
  const [concernReferrals, setConcernReferrals] = useState([]);
  const [concernTriageLoading, setConcernTriageLoading] = useState({});
  const [concernForm, setConcernForm] = useState(EMPTY_CONCERN_FORM);
  const [concernSubmitted, setConcernSubmitted] = useState(false);

  // ── Case access (Phase 15 — Manager Investigation Mode) ──
  // case_access already existed (baseline_schema_2026-08-06.sql) for the
  // disciplinary-officer handoff and case-owner assignment flows
  // (HandoffModal.jsx/ReassignCaseModal.jsx write it, but nothing ever
  // loaded it client-side) — this is the first read of it, so
  // CaseViewScreen can tell whether the current, non-HR user has been
  // granted investigator access to the case they're viewing.
  const [caseAccess, setCaseAccess] = useState([]);

  // Phase 13 — "What Changed Since Last View." caseViews mirrors
  // case_views (one row per case+user); changesSinceView/changesSummary
  // are ephemeral, computed fresh each time a case is opened rather than
  // persisted — see the useEffect near syncGuardrailSignals.
  const [caseViews, setCaseViews] = useState([]);
  const [changesSinceView, setChangesSinceView] = useState({});
  const [changesSummary, setChangesSummary] = useState({});
  const [changesSummaryLoading, setChangesSummaryLoading] = useState({});

  // Refs
  const feedRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenRecRef = useRef(null);
  const letterheadRef = useRef(null);
  const wordTemplateRef = useRef(null);
  const policyFileRef = useRef(null);
  const employeeCsvFileRef = useRef(null);
  const [employeeCsvProcessing, setEmployeeCsvProcessing] = useState(false);
  const caseCsvFileRef = useRef(null);
  const [caseCsvProcessing, setCaseCsvProcessing] = useState(false);
  const importFileRef = useRef(null);
  const vaultFileRef = useRef(null);

  useEffect(() => { if(feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [transcript]);

  // ── Persistence helpers ──
  const saveCases = (u, changedId=null) => {
    // P17 — stamps timelineOverrides.stageEnteredAt whenever a case's
    // computed stage actually changes (withStageTransitionStamp returns
    // the exact same reference otherwise), so every case write passing
    // through this one central function gets the "Potential Bottlenecks"
    // panel's own time-in-stage tracking for free, regardless of which
    // of the many call sites that set cs.stage (or just change data a
    // heuristic infers a new stage from) triggered it.
    const prevById = new Map(cases.map(cs => [cs.id, cs]));
    const stamped = u.map(cs => withStageTransitionStamp(cs, prevById.get(cs.id) || null));
    setCases(stamped);
    lsSet("compass_cases", stamped);
    if(org?.id) {
      if(changedId) {
        // Only sync the changed case
        const changed = stamped.find(x=>x.id===changedId);
        if(changed) saveCaseToDB(changed);
        else deleteCaseFromDB(changedId);
      } else {
        // Sync all — but only cases that actually changed. Callers build u
        // via cases.map(x => cond ? {...x, ...} : x), which preserves
        // reference equality for every untouched case, so a reference
        // check here is enough to skip them. Blindly re-saving the whole
        // array (as this used to) bumped every case's updated_at on every
        // single bulk action regardless of whether its fields changed —
        // in an org with hundreds of cases, that's hundreds of concurrent
        // no-op writes on every close/bulk action, and saveCaseToDB's own
        // optimistic-concurrency check (conditional update on updated_at)
        // meant any of those no-op writes could silently clobber a
        // genuine concurrent edit to an unrelated case, or itself fail
        // and trigger a full loadCasesFromDB() that discards whatever
        // this action just changed.
        stamped.forEach(cs => { if(cs !== prevById.get(cs.id)) saveCaseToDB(cs); });
        cases.forEach(cs => { if(!stamped.find(x=>x.id===cs.id)) deleteCaseFromDB(cs.id); });
      }
    }
  };
  // ── Audit trail ──
  const audit = (action, detail="", caseId=null) => {
    const userName = currentUser?.name || "HR Manager";
    const entry = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      user: userName,
      action,
      detail,
      caseId,
    };
    setAuditLog(p => [entry, ...p].slice(0, 500)); // optimistic — cloud is the source of truth on next load
    if(org?.id && user?.id) {
      withFkRetry(() => supabase.from('audit_log').insert({ org_id: org.id, user_id: user.id, user_name: userName, action, detail, case_id: caseId }))
        .then(({error}) => { if(error) console.error('Audit log sync failed:', error.message); });
    }
  };

  // Process Intelligence (P1) — thin App-level wrapper binding
  // requestOverride to this component's own promptDialog/audit closures.
  // Every later phase that needs a "significant override, optionally
  // explain why" step (P6, P7, P9, P11) calls this rather than building
  // its own reason-capture UI.
  const requestOverrideReason = (label, opts) => requestOverride(promptDialog, audit, label, opts);
  // Process Intelligence (P7) — same binding pattern, for the richer
  // policy-expectation/actual/reason flow used when proceeding past a
  // signal that carries a real policy citation (P6's guardrails today).
  const requestPolicyDeviationReason = (opts) => requestPolicyDeviation(promptDialog, audit, opts);

  // ── Users ──
  // ── Deadline checker — UK statutory & ACAS deadlines ──
  // Rules live in src/lib/deadlines.js so the digest cron function (server
  // side) can compute the same due-soon set without duplicating them.
  useEffect(() => {
    setDueSoon(computeDueSoon(cases, dsarRequests, new Date(), caseTasks, wellbeingNotes, leaverInstances, redundancyCases, caseAccess));
  }, [cases, dsarRequests, caseTasks, wellbeingNotes, leaverInstances, redundancyCases, caseAccess]);

  // Lets a deep link (Home's "Suggested for you" quick links) land
  // directly on a specific Settings section instead of always Billing.
  const [settingsSection, setSettingsSection] = useState(null);

  // ── Calendar integration (Google Calendar) ──
  const [calendarConnected, setCalendarConnected] = useState(false);
  useEffect(() => {
    if(!user?.id) return;
    authedFetch(`/api/calendar/status`)
      .then(r=>r.json()).then(d=>setCalendarConnected(!!d.connected)).catch(()=>{});
  }, [user?.id]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const calendarParam = params.get("calendar");
    if(!calendarParam) return;
    if(calendarParam==="connected") { setCalendarConnected(true); showToast("Google Calendar connected"); }
    else if(calendarParam==="error") { showToast("Couldn't connect Google Calendar — please try again"); }
    params.delete("calendar");
    const newUrl = window.location.pathname + (params.toString()?"?"+params.toString():"");
    window.history.replaceState({}, "", newUrl);
  }, []);
  useEffect(() => {
    if(!calendarConnected || !user?.id) return;
    const timeout = setTimeout(() => {
      // Google Calendar is outside Compass's own access control (RLS
      // already scopes dueSoon to cases this user can see, but a shared
      // or delegated calendar has no such per-case boundary) — "Mark
      // confidential" exists specifically to restrict a case beyond normal
      // org-wide visibility, so those deadlines never leave Compass via
      // this sync, full stop, even for the case's own creator.
      authedFetch("/api/calendar/sync", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ deadlines: dueSoon.filter(d => !d.confidential) }),
      }).catch(e => console.error("Calendar sync failed:", e));
    }, 3000);
    return () => clearTimeout(timeout);
  }, [dueSoon, calendarConnected, user?.id]);
  const connectGoogleCalendar = async () => {
    if(!user?.id || !org?.id) return;
    try {
      const res = await authedFetch(`/api/calendar/oauth-start?orgId=${encodeURIComponent(org.id)}`);
      const data = await res.json();
      if(data.url) window.location.href = data.url;
      else showToast(data.error||"Couldn't start Calendar connection", "error");
    } catch(e) { showToast("Couldn't start Calendar connection", "error"); }
  };
  const disconnectGoogleCalendar = async () => {
    if(!user?.id) return;
    try {
      await authedFetch("/api/calendar/disconnect", {
        method: "POST", headers: {"Content-Type":"application/json"},
      });
      setCalendarConnected(false);
      showToast("Google Calendar disconnected");
    } catch(e) { showToast("Couldn't disconnect — please try again"); }
  };

  // ── Browser notifications ──
  const requestNotifications = async () => {
    if(!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    if(perm === "granted") {
      setNotifGranted(true);
      dueSoon.filter(d=>d.daysLeft<=1).forEach(d => {
        new Notification("Compass HR — Deadline", {
          body: `${d.employeeName}: "${d.label}" due ${d.daysLeft===0?"today":"tomorrow"}`,
          icon: "/favicon.ico",
        });
      });
    }
  };

  // ── Search ──
  const runSearch = (q) => {
    if(!q.trim()) { setSearchResults([]); return; }
    const ql = q.toLowerCase();
    const results = [];
    cases.forEach(c => {
      if(c.employeeName.toLowerCase().includes(ql)) {
        results.push({type:"case", title:c.employeeName, sub:`${c.meetings.length} meetings`, caseId:c.id});
      }
      c.meetings.forEach(m => {
        if((m.record||"").toLowerCase().includes(ql))
          results.push({type:"record", title:`${c.employeeName} — ${m.type}`, sub:`Meeting record · ${m.date}`, caseId:c.id, meetingId:m.id});
        if((m.letterOutput||"").toLowerCase().includes(ql))
          results.push({type:"letter", title:`${c.employeeName} — ${m.type} letter`, sub:m.date, caseId:c.id, meetingId:m.id});
        (m.transcript||[]).forEach(u => {
          if(u.text.toLowerCase().includes(ql))
            results.push({type:"transcript", title:`"${u.text.slice(0,60)}..."`, sub:`${c.employeeName} · ${m.type} · ${m.date}`, caseId:c.id, meetingId:m.id});
        });
      });
      (c.evidence||[]).forEach(ev => {
        if((ev.name||"").toLowerCase().includes(ql))
          results.push({type:"evidence", title:ev.name, sub:`${c.employeeName} · ${ev.type||"Document"} · ${ev.date||""}`, caseId:c.id});
      });
    });
    employeeRecords.forEach(r => {
      if((r.name||"").toLowerCase().includes(ql) && !cases.some(c=>c.employeeName===r.name))
        results.push({type:"employee", title:r.name, sub:[r.jobTitle,r.department].filter(Boolean).join(" · ")||"Employee record, no case yet"});
    });
    dsarRequests.forEach(req => {
      if((req.employeeName||"").toLowerCase().includes(ql))
        results.push({type:"dsar", title:`${req.employeeName} — DSAR request`, sub:`Received ${req.receivedDate} · Due ${req.dueDate}`, dsarId:req.id});
    });
    setSearchResults(results.slice(0, 30));
  };

  // ── GDPR helpers ──
  const exportAllData = () => {
    const data = { cases, policies:policies.map(p=>({...p,content:"[truncated]"})), auditLog, adjustments, exportedAt:new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="compass_data_export.json"; a.click();
    URL.revokeObjectURL(url);
    audit("Data exported (GDPR)");
  };
  const deleteAllData = async () => {
    const ok = await confirmDialog({
      title: "Delete all data",
      message: "This will permanently delete all case files, meeting records, DSAR requests, HR review requests and the audit trail for this organisation. This cannot be undone.",
      confirmLabel: "Delete everything",
      danger: true,
    });
    if(!ok) return;
    if(org?.id) {
      try {
        const r = await authedFetch("/api/delete-org-data", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({orgId: org.id})});
        const d = await r.json();
        if(!r.ok) { showToast("Couldn't delete organisation data: "+(d.error||"unknown error"), "error"); return; }
      } catch(e) { showToast("Couldn't delete organisation data: "+e.message, "error"); return; }
    }
    ["compass_cases","compass_policies","compass_whistle","compass_users","compass_user","compass_vault","compass_adjustments","compass_signature","compass_letterhead","compass_word_template","compass_starters","compass_starter_templates","compass_leavers","compass_leaver_templates"].forEach(k=>localStorage.removeItem(k));
    try { window.location.reload(); } catch(e) {}
  };

  // ── New starter helpers ──
  const saveStarterInstances = u => { setStarterInstances(u); lsSet("compass_starters", u); };
  const saveStarterTemplates = u => { setStarterTemplates(u); lsSet("compass_starter_templates", u); };

  const loadStarterInstances = async () => {
    if(!org?.id) return;
    try {
      const {data} = await supabase.from('starter_instances').select('*').eq('org_id', org.id).order('created_at', {ascending:false});
      if(data) setStarterInstances(data.map(r=>({
        id:r.id, name:r.name, role:r.role, department:r.department, manager:r.manager,
        email:r.email, startDate:r.start_date, templateId:r.template_id, templateName:r.template_name,
        tasks:r.tasks||[], aiCustomised:r.ai_customised, createdBy:r.created_by, createdAt:r.created_at,
      })));
    } catch(e) { console.error('loadStarterInstances', e); }
  };

  const saveStarterInstanceToDB = async (instance) => {
    if(!org?.id) return;
    const { error } = await supabase.from('starter_instances').upsert({
      id: instance.id,
      org_id: org.id,
      name: instance.name, role: instance.role||null, department: instance.department||null,
      manager: instance.manager||null, email: instance.email||null, start_date: instance.startDate||null,
      template_id: instance.templateId||null, template_name: instance.templateName||null,
      tasks: instance.tasks||[], ai_customised: !!instance.aiCustomised, created_by: instance.createdBy||null,
      updated_at: new Date().toISOString(),
    });
    if(error) { console.error('saveStarterInstanceToDB', error); showToast("Couldn't save onboarding record — "+error.message, "error"); }
  };

  // ── Leaver offboarding helpers ──
  const saveLeaverInstances = u => { setLeaverInstances(u); lsSet("compass_leavers", u); };
  const saveLeaverTemplates = u => { setLeaverTemplates(u); lsSet("compass_leaver_templates", u); };

  const loadLeaverInstances = async () => {
    if(!org?.id) return;
    try {
      const {data} = await supabase.from('leaver_instances').select('*').eq('org_id', org.id).order('created_at', {ascending:false});
      if(data) setLeaverInstances(data.map(r=>({
        id:r.id, name:r.name, role:r.role, department:r.department, manager:r.manager,
        email:r.email, lastWorkingDay:r.last_working_day, reason:r.reason,
        templateId:r.template_id, templateName:r.template_name,
        tasks:r.tasks||[], aiCustomised:r.ai_customised,
        exitInterviewNotes:r.exit_interview_notes, exitInterviewDate:r.exit_interview_date,
        createdBy:r.created_by, createdAt:r.created_at,
      })));
    } catch(e) { console.error('loadLeaverInstances', e); }
  };

  const saveLeaverInstanceToDB = async (instance) => {
    if(!org?.id) return;
    const { error } = await supabase.from('leaver_instances').upsert({
      id: instance.id,
      org_id: org.id,
      name: instance.name, role: instance.role||null, department: instance.department||null,
      manager: instance.manager||null, email: instance.email||null, last_working_day: instance.lastWorkingDay||null,
      reason: instance.reason||null,
      template_id: instance.templateId||null, template_name: instance.templateName||null,
      tasks: instance.tasks||[], ai_customised: !!instance.aiCustomised,
      exit_interview_notes: instance.exitInterviewNotes||null, exit_interview_date: instance.exitInterviewDate||null,
      created_by: instance.createdBy||null,
      updated_at: new Date().toISOString(),
    });
    if(error) { console.error('saveLeaverInstanceToDB', error); showToast("Couldn't save offboarding record — "+error.message, "error"); }
  };

  // ── Employee Portal access management ──
  const loadPortalAccounts = async () => {
    if(!org?.id) return;
    try {
      const r = await authedFetch(`/api/portal/accounts?orgId=${encodeURIComponent(org.id)}`);
      const d = await r.json();
      if(r.ok) setPortalAccounts(d.accounts||[]);
    } catch(e) { console.error('loadPortalAccounts', e); }
  };

  const revokePortalAccess = async (employeeName) => {
    if(!org?.id) return;
    const ok = await confirmDialog({title:"Revoke portal access?", message:`${employeeName} will immediately lose access to view their case status, sign documents, or complete onboarding tasks in the portal.`, confirmLabel:"Revoke access", danger:true});
    if(!ok) return;
    try {
      const r = await authedFetch("/api/portal/revoke-access", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ orgId: org.id, employeeName }),
      });
      const d = await r.json();
      if(d.success) { showToast("Portal access revoked"); loadPortalAccounts(); }
      else showToast("Couldn't revoke access: "+(d.error||"unknown error"), "error");
    } catch(e) { showToast("Couldn't revoke access: "+e.message, "error"); }
  };

  // ── DSAR (Data Subject Access Request) tracking ──
  const loadDsarRequests = async () => {
    if(!org?.id) return;
    try {
      const {data} = await supabase.from('dsar_requests').select('*').eq('org_id', org.id);
      if(data) setDsarRequests(data.map(r=>({
        id:r.id, employeeName:r.employee_name, requestedBy:r.requested_by,
        receivedDate:r.received_date, dueDate:r.due_date, status:r.status,
        completedDate:r.completed_date, notes:r.notes,
        reviewedFlaggedSections:r.reviewed_flagged_sections, createdAt:r.created_at,
        extended:r.extended, extensionReason:r.extension_reason, extendedAt:r.extended_at,
      })));
    } catch(e) { console.error('loadDsarRequests', e); }
  };

  const createDsarRequest = async ({employeeName, requestedBy, receivedDate}) => {
    if(!org?.id || !employeeName?.trim() || !receivedDate) return;
    const dueDate = addCalendarMonth(receivedDate);
    if(!dueDate) { showToast("Invalid received date", "error"); return; }
    try {
      const {data, error} = await supabase.from('dsar_requests').insert({
        org_id: org.id,
        employee_name: employeeName.trim(),
        requested_by: requestedBy||null,
        received_date: receivedDate,
        due_date: toISODateLocal(dueDate),
        created_by: user?.id||null,
      }).select().single();
      if(error) throw error;
      setDsarRequests(p=>[...p, {
        id:data.id, employeeName:data.employee_name, requestedBy:data.requested_by,
        receivedDate:data.received_date, dueDate:data.due_date, status:data.status,
        completedDate:data.completed_date, notes:data.notes,
        reviewedFlaggedSections:data.reviewed_flagged_sections, createdAt:data.created_at,
        extended:data.extended, extensionReason:data.extension_reason, extendedAt:data.extended_at,
      }]);
      showToast("DSAR request logged");
    } catch(e) { console.error('createDsarRequest', e); showToast("Could not log DSAR request", "error"); }
  };

  const updateDsarRequest = async (id, fields) => {
    const payload = {};
    if('status' in fields) payload.status = fields.status;
    if('notes' in fields) payload.notes = fields.notes;
    if('reviewedFlaggedSections' in fields) payload.reviewed_flagged_sections = fields.reviewedFlaggedSections;
    if('completedDate' in fields) payload.completed_date = fields.completedDate;
    if('dueDate' in fields) payload.due_date = fields.dueDate;
    if('extended' in fields) payload.extended = fields.extended;
    if('extensionReason' in fields) payload.extension_reason = fields.extensionReason;
    if('extendedAt' in fields) payload.extended_at = fields.extendedAt;
    try {
      const {error} = await supabase.from('dsar_requests').update(payload).eq('id', id);
      if(error) throw error;
      setDsarRequests(p=>p.map(r=>r.id===id?{...r,...fields}:r));
      return true;
    } catch(e) { console.error('updateDsarRequest', e); showToast("Could not update DSAR request", "error"); return false; }
  };

  // UK GDPR allows extending the 1-month DSAR deadline by a further 2
  // months for complex or numerous requests (Art. 12(3)) — the individual
  // must be told within the original month, with reasons. Fixed 2-month
  // extension (not an arbitrary date) to stay within the statutory limit;
  // the reason is kept for the audit trail.
  const extendDsarRequest = async (req, reason) => {
    if(!req || req.extended) return;
    const extended = addCalendarMonth(addCalendarMonth(req.dueDate));
    if(!extended) { showToast("Invalid due date", "error"); return; }
    const ok = await updateDsarRequest(req.id, {
      dueDate: toISODateLocal(extended), extended:true,
      extensionReason: reason||"", extendedAt: new Date().toISOString(),
    });
    if(!ok) return;
    audit("DSAR deadline extended", req.employeeName+" — "+(reason||"complex request"));
    showToast("Deadline extended to "+extended.toLocaleDateString("en-GB"));
  };

  const createLeaverInstance = () => {
    const f = newLeaverForm;
    if(!f.name.trim() || !f.lastWorkingDay) return;
    const template = leaverTemplates.find(t=>t.id===f.templateId) || leaverTemplates[0];
    const lastDay = new Date(f.lastWorkingDay);
    const tasks = template.phases.flatMap(phase =>
      phase.tasks.map(t => {
        const due = new Date(lastDay);
        due.setDate(due.getDate() + t.day);
        return { ...t, id:t.id+"_"+Date.now(), phaseId:phase.id, phaseLabel:phase.label, dueDate:due.toLocaleDateString("en-GB"), done:false, doneAt:null, note:"" };
      })
    );
    const instance = {
      id: Date.now().toString(),
      name: f.name, role: f.role, department: f.department,
      manager: f.manager, email: f.email, lastWorkingDay: f.lastWorkingDay, reason: f.reason,
      templateId: f.templateId, templateName: template.name,
      tasks, createdAt: new Date().toISOString(),
      createdBy: currentUser?.name || "HR Manager",
    };
    saveLeaverInstances([instance, ...leaverInstances]);
    saveLeaverInstanceToDB(instance);
    setActiveLeaver(instance);
    setLeaverView("instance");
    setNewLeaverForm({name:"",role:"",department:"",manager:"",email:"",lastWorkingDay:"",reason:"resignation",templateId:"default"});
    audit("Leaver offboarding started", f.name+" — "+f.role);
  };

  // Task-level mutations are shared with onboarding's starter_instances —
  // see src/lib/checklistTasks.js. Persistence (localStorage/Supabase) and
  // which instance is "active" stay here since they're wired to this flow's
  // own state.
  const applyLeaverUpdate = (updated, instanceId) => {
    saveLeaverInstances(updated);
    const changed = updated.find(s=>s.id===instanceId);
    saveLeaverInstanceToDB(changed);
    setActiveLeaver(changed);
  };
  const toggleLeaverTask = (instanceId, taskId) => applyLeaverUpdate(toggleChecklistTask(leaverInstances, instanceId, taskId), instanceId);
  const updateLeaverTaskNote = (instanceId, taskId, note) => applyLeaverUpdate(updateChecklistTaskNote(leaverInstances, instanceId, taskId, note), instanceId);
  const addLeaverTask = (instanceId, phaseLabel, taskText, owner) => applyLeaverUpdate(addChecklistTask(leaverInstances, instanceId, phaseLabel, taskText, owner), instanceId);
  const removeLeaverTask = (instanceId, taskId) => applyLeaverUpdate(removeChecklistTask(leaverInstances, instanceId, taskId), instanceId);
  const reassignLeaverTaskOwner = (instanceId, taskId, owner) => applyLeaverUpdate(reassignChecklistTaskOwner(leaverInstances, instanceId, taskId, owner), instanceId);
  const updateLeaverExitInterview = (instanceId, fields) => applyLeaverUpdate(updateChecklistInstanceFields(leaverInstances, instanceId, fields), instanceId);

  const aiCustomiseLeaverChecklist = async (instance) => {
    if(!instance) return;
    setLeaverAiProcessing(true);
    try {
      const result = await streamClaude(
        `You are a UK HR offboarding specialist. Generate a customised leaver checklist.
Respond ONLY with a JSON array of task objects, no markdown:
[{"task":"...","owner":"HR|Line Manager|IT|Facilities|Payroll","day":1,"phase":"Before last day"}]
Day is number of days relative to the last working day (negative = before, positive = after). Phases: "On notice received","Before last day","Last day","After leaving".
Maximum 20 tasks total. Be specific to the role, department, and reason for leaving.`,
        `Role: ${instance.role||"General"}
Department: ${instance.department||"General"}
Reason for leaving: ${(instance.reason||"").replace(/_/g," ")||"Not specified"}
Manager: ${instance.manager||"Unknown"}
Generate a tailored offboarding checklist for this role, considering any role-specific access, equipment, or handover needs.`,
        ()=>{}
      );
      const parsed = JSON.parse(result.replace(/```json|```/g,"").trim());
      const lastDay = new Date(instance.lastWorkingDay);
      const newTasks = parsed.map((t,i) => {
        const due = new Date(lastDay);
        due.setDate(due.getDate() + (t.day||0));
        return { ...t, id:"ai_"+Date.now()+i, phaseId:t.phase?.toLowerCase().replace(/\s/g,"_")||"before", phaseLabel:t.phase||"Before last day", dueDate:due.toLocaleDateString("en-GB"), done:false, doneAt:null, note:"", source:"ai" };
      });
      const updated = leaverInstances.map(s => s.id===instance.id ? {...s, tasks:[...s.tasks, ...newTasks], aiCustomised:true} : s);
      saveLeaverInstances(updated);
      const changed = updated.find(s=>s.id===instance.id);
      saveLeaverInstanceToDB(changed);
      setActiveLeaver(changed);
      audit("AI customised leaver checklist", instance.name+" — "+instance.role);
    } catch(e) { showToast("Could not customise: "+e.message, "error"); }
    setLeaverAiProcessing(false);
  };

  // Bridges a dismissal outcome or redundancy confirmation straight into a
  // pre-filled offboarding checklist — those were previously two dead ends
  // with no link to each other, despite the leaver checklist being exactly
  // what's needed at that moment (access revocation, equipment, final pay).
  // confirm:true (default) is for automatic/implicit offers riding an
  // unrelated primary action (e.g. issuing a dismissal outcome); explicit
  // "Start offboarding" buttons the user already chose to click pass
  // confirm:false to skip the extra prompt.
  const startOffboarding = async ({name, role, department, manager, email, reason}, {confirm=true}={}) => {
    if(confirm) {
      const ok = await confirmDialog({
        title: "Start offboarding checklist?",
        message: `Set up an offboarding checklist for ${name} now — access revocation, equipment return, final pay and exit interview.`,
        confirmLabel: "Start checklist",
        cancelLabel: "Not now",
      });
      if(!ok) return;
    }
    setNewLeaverForm({name, role:role||"", department:department||"", manager:manager||"", email:email||"", lastWorkingDay:"", reason:reason||"other", templateId:"default"});
    setLeaverView("new");
    setActiveLeaver(null);
    setScreen(SCREENS.OFFBOARDING);
  };

  const createStarterInstance = () => {
    const f = newStarterForm;
    if(!f.name.trim() || !f.startDate) return;
    const template = starterTemplates.find(t=>t.id===f.templateId) || starterTemplates[0];
    const startDate = new Date(f.startDate);
    const tasks = template.phases.flatMap(phase =>
      phase.tasks.map(t => {
        const due = new Date(startDate);
        due.setDate(due.getDate() + t.day);
        return { ...t, id:t.id+"_"+Date.now(), phaseId:phase.id, phaseLabel:phase.label, dueDate:due.toLocaleDateString("en-GB"), done:false, doneAt:null, note:"" };
      })
    );
    const instance = {
      id: Date.now().toString(),
      name: f.name, role: f.role, department: f.department,
      manager: f.manager, email: f.email, startDate: f.startDate,
      templateId: f.templateId, templateName: template.name,
      tasks, createdAt: new Date().toISOString(),
      createdBy: currentUser?.name || "HR Manager",
    };
    saveStarterInstances([instance, ...starterInstances]);
    saveStarterInstanceToDB(instance);
    setActiveStarter(instance);
    setStarterView("instance");
    setNewStarterForm({name:"",role:"",department:"",manager:"",email:"",startDate:"",templateId:"default"});
    audit("New starter created", f.name+" — "+f.role);
  };

  // See applyLeaverUpdate above — same shared task-mutation logic, this
  // flow's own persistence/active-instance wiring.
  const applyStarterUpdate = (updated, instanceId) => {
    saveStarterInstances(updated);
    const changed = updated.find(s=>s.id===instanceId);
    saveStarterInstanceToDB(changed);
    setActiveStarter(changed);
  };
  const toggleStarterTask = (instanceId, taskId) => applyStarterUpdate(toggleChecklistTask(starterInstances, instanceId, taskId), instanceId);
  const updateStarterTaskNote = (instanceId, taskId, note) => applyStarterUpdate(updateChecklistTaskNote(starterInstances, instanceId, taskId, note), instanceId);
  const addStarterTask = (instanceId, phaseLabel, taskText, owner) => applyStarterUpdate(addChecklistTask(starterInstances, instanceId, phaseLabel, taskText, owner), instanceId);
  const removeStarterTask = (instanceId, taskId) => applyStarterUpdate(removeChecklistTask(starterInstances, instanceId, taskId), instanceId);
  const reassignStarterTaskOwner = (instanceId, taskId, owner) => applyStarterUpdate(reassignChecklistTaskOwner(starterInstances, instanceId, taskId, owner), instanceId);

  const aiCustomiseChecklist = async (instance) => {
    if(!instance) return;
    setStarterAiProcessing(true);
    try {
      const result = await streamClaude(
        `You are a UK HR onboarding specialist. Generate a customised onboarding checklist.
Respond ONLY with a JSON array of task objects, no markdown:
[{"task":"...","owner":"HR|Line Manager|IT|Facilities|New Starter","day":1,"phase":"Week 1"}]
Day is number of days from start date (negative = before start). Phases: "Before day 1","Week 1","Month 1","Month 3","End of probation".
Maximum 25 tasks total. Be specific to the role and department.`,
        `Role: ${instance.role||"General"}
Department: ${instance.department||"General"}
Manager: ${instance.manager||"Unknown"}
Company context: ${policies.length?policies[0].name:"Standard UK employer"}
Generate a tailored onboarding checklist for this role. Include role-specific tasks beyond the standard HR admin.`,
        ()=>{}
      );
      const parsed = JSON.parse(result.replace(/```json|```/g,"").trim());
      const startDate = new Date(instance.startDate);
      const newTasks = parsed.map((t,i) => {
        const due = new Date(startDate);
        due.setDate(due.getDate() + (t.day||1));
        return { ...t, id:"ai_"+Date.now()+i, phaseId:t.phase?.toLowerCase().replace(/\s/g,"_")||"w1", phaseLabel:t.phase||"Week 1", dueDate:due.toLocaleDateString("en-GB"), done:false, doneAt:null, note:"", source:"ai" };
      });
      const updated = starterInstances.map(s => s.id===instance.id ? {...s, tasks:[...s.tasks, ...newTasks], aiCustomised:true} : s);
      saveStarterInstances(updated);
      const changed = updated.find(s=>s.id===instance.id);
      saveStarterInstanceToDB(changed);
      setActiveStarter(changed);
      audit("AI customised checklist", instance.name+" — "+instance.role);
    } catch(e) { showToast("Could not customise: "+e.message, "error"); }
    setStarterAiProcessing(false);
  };

  // ── Redundancy helpers ──
  const saveRedundancyCases = u => { setRedundancyCases(u); lsSet("compass_redundancy", u); };

  const createRedundancyCase = (type, reason, poolDescription) => {
    const rc = {
      id: Date.now().toString(),
      type, reason, poolDescription,
      selectionCriteria: [
        {id:"sc1", criterion:"Skills and qualifications", weight:30, description:"Relevant skills, qualifications, and competencies for future needs"},
        {id:"sc2", criterion:"Performance", weight:25, description:"Appraisal scores and performance record over last 12 months"},
        {id:"sc3", criterion:"Attendance", weight:20, description:"Attendance record — note: disability-related absence must be excluded"},
        {id:"sc4", criterion:"Flexibility", weight:15, description:"Ability to work across roles or locations as business requires"},
        {id:"sc5", criterion:"Length of service", weight:10, description:"Tie-breaker only — cannot be sole criterion (avoids age discrimination)"},
      ],
      atRiskEmployees: [],
      collectiveInfo: type==="collective" ? {count:0,hrOneRequired:false,notifiedDate:"",electionDate:"",consultationStartDate:""} : null,
      status:"setup",
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name || "HR Manager",
      aiAdvice:"",
    };
    const updated = [...redundancyCases, rc];
    saveRedundancyCases(updated);
    setActiveRedundancy(rc);
    setRedundancyStep("pool");
    audit("Redundancy case created", `${type} — ${reason}`);
    return rc;
  };

  const updateRedundancyCase = (updates) => {
    if(!activeRedundancy) return;
    const updated = redundancyCases.map(r => r.id===activeRedundancy.id ? {...r,...updates} : r);
    saveRedundancyCases(updated);
    setActiveRedundancy(prev=>({...prev,...updates}));
  };

  const scoreEmployee = (empId, criterionId, score) => {
    if(!activeRedundancy) return;
    const updated = {
      ...activeRedundancy,
      atRiskEmployees: activeRedundancy.atRiskEmployees.map(e =>
        e.id===empId ? {...e, ...computeSelectionScore(e.scores, criterionId, score, activeRedundancy.selectionCriteria)} : e
      )
    };
    updateRedundancyCase(updated);
  };

  const getRedundancyAiAdvice = async () => {
    if(!activeRedundancy) return;
    setRedundancyAiProcessing(true);
    setRedundancyAiOutput("");
    try {
      const type = activeRedundancy.type;
      const count = activeRedundancy.atRiskEmployees.length;
      await streamClaude(
        `You are a UK employment law specialist focusing on redundancy. ERA 1996, TULRCA 1992, Equality Act 2010. Be precise and practical. ## headers.`,
        `Redundancy type: ${type} (${count} at-risk employees)
Reason for redundancy: ${activeRedundancy.reason}
Pool description: ${activeRedundancy.poolDescription}
Selection criteria: ${activeRedundancy.selectionCriteria.map(c=>c.criterion+" ("+c.weight+"%)").join(", ")}
At-risk employees: ${activeRedundancy.atRiskEmployees.map(e=>e.name+" ("+e.role+")").join(", ")||"Not yet added"}
${activeRedundancy.type==="collective"?`Number affected: ${activeRedundancy.collectiveInfo?.count||"unknown"}`:""}

Please advise on:
## Legal Requirements for This Process
## Consultation Obligations (minimum periods, format)
## Selection Criteria Risk Assessment
## Equality Act Considerations (protected characteristics in pool)
## Right to Be Accompanied
## Redundancy Pay Calculations
## Key Documents Required
## Common Pitfalls to Avoid`,
        t => setRedundancyAiOutput(t)
      );
    } catch(e) { setRedundancyAiOutput("Error: "+e.message); }
    setRedundancyAiProcessing(false);
  };

  const generateRedundancyLetter = async (letterType, employee) => {
    setRedundancyAiProcessing(true);
    setRedundancyAiOutput("");
    const letters = {
      "at-risk": `Draft an at-risk of redundancy notification letter for UK employment. This is NOT confirmation of redundancy — it is notification that the employee is at risk and invites them to a consultation meeting.`,
      "consultation-invite": `Draft an invitation to individual redundancy consultation meeting letter.`,
      "redundancy-confirmed": `Draft a redundancy confirmation letter confirming termination of employment by reason of redundancy. Include statutory redundancy pay, notice period, garden leave if applicable, and right of appeal.`,
      "alternative-roles": `Draft a letter offering an alternative role to avoid redundancy, giving the employee time to consider and a trial period if applicable.`,
      "appeal-invite": `Draft an invitation to a redundancy appeal hearing.`,
    };
    try {
      await streamClaude(
        "UK HR professional. Formal, precise, legally compliant. ERA 1996. DD Month YYYY dates.",
        `${letters[letterType]||"Draft a redundancy letter."}
Employee: ${employee?.name||"[Name]"}
Role: ${employee?.role||"[Role]"}
Department: ${employee?.department||"[Department]"}
Manager: ${activeRedundancy?.createdBy||"[Manager]"}
Reason for redundancy: ${activeRedundancy?.reason||"[Reason]"}
${employee?.redundancyPay?"Redundancy pay: "+employee.redundancyPay:""}
Date: ${new Date().toLocaleDateString("en-GB")}

Include all legally required elements. End with ## Next Steps checklist for HR.`,
        t => setRedundancyAiOutput(t)
      );
    } catch(e) { setRedundancyAiOutput("Error: "+e.message); }
    setRedundancyAiProcessing(false);
  };

  // ── Wellbeing helpers ──
  // Cloud-synced like cases/starter_instances/leaver_instances, but RLS on
  // wellbeing_notes restricts every operation to hr_manager/hr_director org
  // members (see supabase/wellbeing_notes_2026-08-09.sql) — these notes were
  // previously localStorage-only, meaning they never actually reached other
  // HR staff or devices despite the screen's own "confidential... restricted
  // to HR only" copy implying a shared record.
  const saveWellbeingNotes = u => { setWellbeingNotes(u); lsSet("compass_wellbeing", u); };

  const loadWellbeingNotes = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await supabase.from('wellbeing_notes').select('*').eq('org_id', org.id).order('created_at', {ascending:false});
      if(error) { console.error('loadWellbeingNotes', error); return; }
      if(data) saveWellbeingNotes(data.map(r=>({
        id:r.id, employeeName:r.employee_name, type:r.type, date:r.date, manager:r.manager,
        content:r.content, supportOffered:r.support_offered, followUpDate:r.follow_up_date,
        followUpDone:r.follow_up_done, confidential:r.confidential,
        createdBy:r.created_by, createdAt:r.created_at,
      })));
    } catch(e) { console.error('loadWellbeingNotes', e); }
  };

  const saveWellbeingNoteToDB = async (note) => {
    if(!org?.id) return;
    const { error } = await supabase.from('wellbeing_notes').upsert({
      id: note.id,
      org_id: org.id,
      employee_name: note.employeeName, type: note.type||'chat', date: note.date||null,
      manager: note.manager||null, content: note.content, support_offered: note.supportOffered||null,
      follow_up_date: note.followUpDate||null, follow_up_done: !!note.followUpDone,
      confidential: note.confidential!==false, created_by: note.createdBy||null,
      updated_at: new Date().toISOString(),
    });
    if(error) { console.error('saveWellbeingNoteToDB', error); showToast("Couldn't save wellbeing note to the cloud — "+error.message, "error"); }
  };

  const addWellbeingNote = () => {
    const f = wellbeingForm;
    if(!f.employeeName.trim() || !f.content.trim()) return;
    const note = {
      id: Date.now().toString(),
      ...f,
      date: f.date || new Date().toLocaleDateString("en-GB"),
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name || "HR Manager",
      followUpDone: false,
    };
    saveWellbeingNotes([...wellbeingNotes, note]);
    saveWellbeingNoteToDB(note);
    setWellbeingForm({employeeName:"",type:"chat",date:"",manager:"",content:"",followUpDate:"",supportOffered:"",confidential:true});
    setWellbeingView("employee");
    setActiveWellbeing(f.employeeName);
    audit("Wellbeing note added (confidential)", f.employeeName);
  };

  const toggleFollowUpDone = (noteId) => {
    const updated = wellbeingNotes.map(n => n.id===noteId ? {...n,followUpDone:!n.followUpDone} : n);
    saveWellbeingNotes(updated);
    const changed = updated.find(n=>n.id===noteId);
    if(changed) saveWellbeingNoteToDB(changed);
  };

  // ── Allegations ──
  // Own table (not nested on cases) so they can be listed cross-case later
  // (Reports/Insights) without scanning every case's JSONB — same reasoning
  // as wellbeing_notes/dsar_requests. RLS inherits case access rules via an
  // EXISTS join (see supabase/case_structure_2026-08-09.sql), so this loads
  // straight by org_id like every other org-scoped table.
  const loadAllegations = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await supabase.from('allegations').select('*').eq('org_id', org.id).order('created_at', {ascending:true});
      if(error) { console.error('loadAllegations', error); return; }
      if(data) setAllegations(data.map(r=>({
        id:r.id, caseId:r.case_id, title:r.title, description:r.description||"",
        period:r.period||"", peopleInvolved:r.people_involved||"", status:r.status,
        employeeResponse:r.employee_response||"", witnessEvidence:r.witness_evidence||"",
        investigatorFinding:r.investigator_finding||"", outstandingUncertainty:r.outstanding_uncertainty||"",
        decisionReasoning:r.decision_reasoning||"", decidedBy:r.decided_by||null, decidedAt:r.decided_at||null,
        appealOutcome:r.appeal_outcome||null, appealReasoning:r.appeal_reasoning||"",
        appealDecidedBy:r.appeal_decided_by||null, appealDecidedAt:r.appeal_decided_at||null,
        createdBy:r.created_by, createdAt:r.created_at,
      })));
    } catch(e) { console.error('loadAllegations', e); }
  };

  const saveAllegationToDB = async (allegation) => {
    if(!org?.id) return;
    const { error } = await withFkRetry(() => supabase.from('allegations').upsert({
      id: allegation.id, case_id: allegation.caseId, org_id: org.id,
      title: allegation.title, description: allegation.description||null,
      period: allegation.period||null, people_involved: allegation.peopleInvolved||null,
      status: allegation.status||'unreviewed', employee_response: allegation.employeeResponse||null,
      witness_evidence: allegation.witnessEvidence||null, created_by: allegation.createdBy||user?.id||null,
      investigator_finding: allegation.investigatorFinding||null, outstanding_uncertainty: allegation.outstandingUncertainty||null,
      decision_reasoning: allegation.decisionReasoning||null, decided_by: allegation.decidedBy||null,
      decided_at: allegation.decidedAt||null,
      appeal_outcome: allegation.appealOutcome||null, appeal_reasoning: allegation.appealReasoning||null,
      appeal_decided_by: allegation.appealDecidedBy||null, appeal_decided_at: allegation.appealDecidedAt||null,
      updated_at: new Date().toISOString(),
    }));
    if(error) { console.error('saveAllegationToDB', error); showToast("Couldn't save allegation to the cloud — "+error.message, "error"); }
  };

  const deleteAllegationFromDB = async (allegationId) => {
    const { error } = await supabase.from('allegations').delete().eq('id', allegationId);
    if(error) { console.error('deleteAllegationFromDB', error); showToast("Couldn't delete allegation — "+error.message, "error"); }
  };

  const createAllegation = (caseId, fields) => {
    const updated = addAllegation(allegations, caseId, fields);
    if(updated===allegations) return;
    setAllegations(updated);
    const created = updated[updated.length-1];
    saveAllegationToDB({...created, createdBy:user?.id});
    audit("Allegation added", created.title, caseId);
  };

  const patchAllegation = (allegationId, fields) => {
    const updated = updateAllegation(allegations, allegationId, fields);
    setAllegations(updated);
    const changed = updated.find(a=>a.id===allegationId);
    if(changed) saveAllegationToDB(changed);
  };

  const changeAllegationStatus = (allegationId, status) => {
    const updated = setAllegationStatus(allegations, allegationId, status, user?.id||null);
    setAllegations(updated);
    const changed = updated.find(a=>a.id===allegationId);
    if(changed) { saveAllegationToDB(changed); audit("Allegation status changed", `${changed.title} → ${allegationStatusMeta(status).label}`, changed.caseId); }
  };

  const deleteAllegation = (allegationId) => {
    const target = allegations.find(a=>a.id===allegationId);
    setAllegations(removeAllegation(allegations, allegationId));
    deleteAllegationFromDB(allegationId);
    if(target) audit("Allegation removed", target.title, target.caseId);
  };

  // Phase 19 — the chair's own recorded appeal outcome, layered on top of
  // (never replacing) the original finding — Compass's own appeal review
  // is advisory only, generated separately below as case_signals.
  const recordAppealOutcome = (allegationId, outcome, reasoning) => {
    const updated = setAppealOutcome(allegations, allegationId, outcome, reasoning, user?.id||null);
    setAllegations(updated);
    const changed = updated.find(a=>a.id===allegationId);
    if(changed) { saveAllegationToDB(changed); audit("Appeal outcome recorded", `${changed.title} → ${appealOutcomeMeta(outcome)?.label||outcome}`, changed.caseId); }
  };

  // ── Concern referrals (manager self-service) ──
  // Any org member can read/insert their own; only HR roles can see every
  // referral or triage one — enforced by RLS (concern_referrals_2026-08-12.sql),
  // not just this client-side gate, since a non-HR user's own request would
  // otherwise be denied by Postgres regardless of what the UI shows.
  const loadConcernReferrals = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await supabase.from('concern_referrals').select('*').eq('org_id', org.id).order('created_at', {ascending:false});
      if(error) { console.error('loadConcernReferrals', error); return; }
      if(data) setConcernReferrals(data.map(r=>({
        id:r.id, employeeName:r.employee_name, concernType:r.concern_type, description:r.description,
        witnesses:r.witnesses||"", discussedWithEmployee:!!r.discussed_with_employee, involvesSafetyOrWelfare:!!r.involves_safety_or_welfare,
        immediateSafetyConcern:!!r.immediate_safety_concern,
        mayNeedFormalProcess:!!r.may_need_formal_process, evidenceDescription:r.evidence_description||"", evidenceFiles:r.evidence_files||[],
        submittedBy:r.submitted_by, submittedByName:r.submitted_by_name||"",
        status:r.status, hrNotes:r.hr_notes||"", linkedCaseId:r.linked_case_id, createdAt:r.created_at,
        aiCategory:r.ai_category||"", aiSummary:r.ai_summary||"", aiWitnessesCount:r.ai_witnesses_count??null,
        aiEvidenceMentioned:r.ai_evidence_mentioned||[], aiImmediateAction:r.ai_immediate_action||"",
        aiConsiderations:r.ai_considerations||"", aiUrgency:r.ai_urgency||null,
      })));
    } catch(e) { console.error('loadConcernReferrals', e); }
  };

  const saveConcernReferralToDB = async (referral) => {
    if(!org?.id) return;
    const { error } = await withFkRetry(() => supabase.from('concern_referrals').upsert({
      id: referral.id, org_id: org.id,
      employee_name: referral.employeeName, concern_type: referral.concernType||null,
      description: referral.description, witnesses: referral.witnesses||null, discussed_with_employee: !!referral.discussedWithEmployee,
      involves_safety_or_welfare: !!referral.involvesSafetyOrWelfare, immediate_safety_concern: !!referral.immediateSafetyConcern,
      may_need_formal_process: !!referral.mayNeedFormalProcess,
      evidence_description: referral.evidenceDescription||null, evidence_files: referral.evidenceFiles||[],
      submitted_by: referral.submittedBy||null, submitted_by_name: referral.submittedByName||null,
      status: referral.status||'new', hr_notes: referral.hrNotes||null, linked_case_id: referral.linkedCaseId||null,
      ai_category: referral.aiCategory||null, ai_summary: referral.aiSummary||null, ai_witnesses_count: referral.aiWitnessesCount??null,
      ai_evidence_mentioned: referral.aiEvidenceMentioned||[], ai_immediate_action: referral.aiImmediateAction||null,
      ai_considerations: referral.aiConsiderations||null, ai_urgency: referral.aiUrgency||null,
      updated_at: new Date().toISOString(),
    }));
    if(error) { console.error('saveConcernReferralToDB', error); showToast("Couldn't submit — "+error.message, "error"); }
  };

  // Manager Enablement (Phase 4, MP5, §3) — runs automatically right
  // after submission, never on a manual trigger and never deciding
  // anything: HR's own 5-action disposition is completely untouched by
  // this. Extracts only what the manager's own account already supports
  // (category/summary/witness count/evidence mentioned/immediate action/
  // considerations/urgency) so HR doesn't have to re-read the raw
  // description from scratch. Failure is silent (console only) — a
  // referral is fully usable without this, HR just falls back to reading
  // the manager's own text directly, same as before this phase.
  const generateConcernTriageSummary = async (referral) => {
    setConcernTriageLoading(l=>({...l, [referral.id]:true}));
    try {
      const nl = String.fromCharCode(10);
      const context = [
        "Employee: "+referral.employeeName,
        "Reported concern type: "+(CONCERN_TYPES.find(t=>t.id===referral.concernType)?.label||referral.concernType),
        "What happened, in the manager's own words: "+referral.description,
        referral.witnesses ? "Witnesses named by the manager: "+referral.witnesses : "",
        referral.evidenceDescription ? "Evidence the manager mentioned: "+referral.evidenceDescription : "",
        "Already discussed with the employee: "+(referral.discussedWithEmployee?"Yes":"No"),
        "Manager flagged anyone at risk: "+(referral.involvesSafetyOrWelfare?"Yes":"No"),
        "Manager flagged an immediate operational or safety concern: "+(referral.immediateSafetyConcern?"Yes":"No"),
      ].filter(Boolean).join(nl);

      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:600,
        stream:false,
        system:"You are Compass, an Employee Relations copilot triaging a concern a line manager has just raised, before it reaches HR. Extract only what the manager's own account actually supports — never invent detail, never speculate beyond what's written. You must never recommend or imply what formal process (if any) this should become — that is HR's decision alone; you only summarise the facts as given, neutrally. Respond ONLY with valid JSON, no other text: {\"category\":\"one short label, e.g. Conduct, Attendance, Welfare, Interpersonal\",\"summary\":\"one or two neutral, factual sentences\",\"witnessesCount\":number or null,\"evidenceMentioned\":[\"short items, e.g. CCTV, WhatsApp conversation\"],\"immediateActionTaken\":\"short phrase, or empty string if none mentioned\",\"considerations\":\"one sentence flagging any genuine ambiguity or gap HR should check, or empty string if nothing stands out\",\"urgency\":\"LOW, MEDIUM, or HIGH\"}",
        messages:[{role:"user", content:context}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const sanitized = sanitizeTriageSummary(parsed);
      // Functional update, not the concernReferrals closed over above —
      // this call can take 20-30s (a real AI round trip), and by the time
      // it resolves that closure's array is whatever it was back when
      // submitConcernReferral first called this function, which doesn't
      // yet include the referral just created (setConcernReferrals there
      // hadn't been applied yet either). Reading state instead of relying
      // on a stale closure is what makes this safe regardless of timing.
      let savedReferral = null;
      setConcernReferrals(prev => {
        const updated = updateConcernReferral(prev, referral.id, sanitized);
        savedReferral = updated.find(r=>r.id===referral.id);
        return updated;
      });
      if(savedReferral) saveConcernReferralToDB(savedReferral);
    } catch(e) { console.error("generateConcernTriageSummary", e); }
    setConcernTriageLoading(l=>({...l, [referral.id]:false}));
  };

  const submitConcernReferral = () => {
    const updated = addConcernReferral(concernReferrals, {
      ...concernForm, submittedBy: user?.id||null, submittedByName: currentUser?.name||"",
    });
    if(updated===concernReferrals) { showToast("Add the employee's name and a short description first", "error"); return; }
    setConcernReferrals(updated);
    const created = updated[updated.length-1];
    saveConcernReferralToDB(created);
    generateConcernTriageSummary(created);
    audit("Concern referral submitted", created.employeeName+" — "+created.concernType);
    setConcernForm(EMPTY_CONCERN_FORM);
    setConcernSubmitted(true);
  };

  // The five triage dispositions HR can give a referral. "Open formal
  // case" is the one genuinely interconnected action — it creates a real
  // case using the same shape IntakeScreen's own "Create case file" button
  // writes (id/employeeName/caseType/description/status/meetings/
  // createdAt), rather than leaving the referral as a dead-end record HR
  // has to separately remember to act on.
  const CONCERN_TYPE_TO_CASE_TYPE = {
    conduct:"misconduct", performance:"performance", attendance:"attendance", grievance:"grievance",
    bullying_harassment:"discrimination", safety_welfare:"other", other:"other",
  };

  const triageReferral = (referralId, action) => {
    const referral = concernReferrals.find(r=>r.id===referralId);
    if(!referral) return;
    const actionToStatus = {
      request_more_info:"more_info_requested", return_to_manager:"returned_to_manager", close:"closed",
    };
    if(action==="open_case") {
      const newCase = {
        id: crypto.randomUUID(), employeeName: referral.employeeName, manager: "", email: "",
        caseType: CONCERN_TYPE_TO_CASE_TYPE[referral.concernType]||"other",
        description: referral.description, referredBy: "Manager referral — "+(referral.submittedByName||"unknown"),
        dateReceived: new Date().toISOString().split("T")[0], status: "open", meetings: [],
        createdAt: new Date().toISOString(),
      };
      saveCases([...cases, newCase]);
      const updated = setReferralStatus(concernReferrals, referralId, "case_opened", { linkedCaseId: newCase.id });
      setConcernReferrals(updated);
      saveConcernReferralToDB(updated.find(r=>r.id===referralId));
      audit("Concern referral opened as a case", referral.employeeName, newCase.id);
      return;
    }
    const status = actionToStatus[action];
    if(!status) return;
    const updated = setReferralStatus(concernReferrals, referralId, status);
    setConcernReferrals(updated);
    saveConcernReferralToDB(updated.find(r=>r.id===referralId));
    audit("Concern referral "+status.replace(/_/g," "), referral.employeeName);
  };

  // Manager Enablement (Phase 4, MP6, §6) — "Deal with informally" used
  // to just flip the referral's status with nothing to show for it; this
  // launches a real, guided conversation instead, reusing the existing
  // "Informal / 1-1" meeting type (mode:"quick", constants.js) rather
  // than inventing a new meeting shape. caseInfo.context is the same
  // field handlePrepare's own AI prep already reads ("Background:
  // ${caseInfo.context}") — the closest thing this app already has to
  // §6's "before meeting: review record" — pre-filled here with the
  // referral's own description and, once MP5 has run, Compass's own
  // summary of it. The actual disposition write (status →
  // handled_informally, linked to whatever case the meeting lands on)
  // only happens once the meeting is actually saved — see
  // saveMeetingToCase's own _linkedReferralId branch — not here, so
  // nothing changes if the manager backs out without ever starting it.
  const startInformalConversation = (referral) => {
    setMeetingSetup(p=>({...p, employee:referral.employeeName, employeeJobTitle:"", manager:currentUser?.name||"", chairJobTitle:"", type:"informal", date:new Date().toISOString().split("T")[0], linkedCaseId:null, linkedCaseName:null, representative:"", representativeRole:"colleague", participants:[]}));
    setCaseInfo(p=>({...p, employee:referral.employeeName, employeeJobTitle:"", manager:currentUser?.name||"", chairJobTitle:"",
      context: [referral.aiSummary, referral.description].filter(Boolean).join("\n\n"),
      _linkedCaseId:null, _linkedCaseName:null, _linkedReferralId:referral.id, _linkedReferralName:referral.employeeName}));
    setScreen(SCREENS.HOME+"_meeting");
  };

  const loadCaseAccess = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await supabase.from('case_access').select('*').eq('org_id', org.id);
      if(error) { console.error('loadCaseAccess', error); return; }
      if(data) setCaseAccess(data.map(r=>({id:r.id, caseId:r.case_id, userId:r.user_id, role:r.role, grantedBy:r.granted_by, grantedAt:r.granted_at,
        // Manager Enablement (Phase 4, MP7) — only ever set on
        // role:"investigator" rows; null on every other role.
        scopeAllegationIds:r.scope_allegation_ids||null, targetCompletionDate:r.target_completion_date||null, scopeNote:r.scope_note||""})));
    } catch(e) { console.error('loadCaseAccess', e); }
  };

  // Phase 13 — scoped to the current user's own rows (RLS enforces this
  // anyway) since "since I last viewed" is per-viewer, not org-wide.
  const loadCaseViews = async () => {
    if(!org?.id||!user?.id) return;
    try {
      const {data, error} = await supabase.from('case_views').select('*').eq('org_id', org.id).eq('user_id', user.id);
      if(error) { console.error('loadCaseViews', error); return; }
      if(data) setCaseViews(data.map(r=>({caseId:r.case_id, userId:r.user_id, lastViewedAt:r.last_viewed_at})));
    } catch(e) { console.error('loadCaseViews', e); }
  };

  const recordCaseView = async (caseId) => {
    if(!org?.id||!user?.id) return;
    const nowIso = new Date().toISOString();
    const { error } = await withFkRetry(() => supabase.from('case_views').upsert({
      case_id: caseId, user_id: user.id, org_id: org.id, last_viewed_at: nowIso,
    }, { onConflict: 'case_id,user_id' }));
    if(error) { console.error('recordCaseView', error); return; }
    setCaseViews(prev => prev.some(v=>v.caseId===caseId&&v.userId===user.id)
      ? prev.map(v => v.caseId===caseId&&v.userId===user.id ? {...v, lastViewedAt:nowIso} : v)
      : [...prev, {caseId, userId:user.id, lastViewedAt:nowIso}]);
  };

  // Only called when computeChangesSinceView() already found something —
  // no LLM call on a quiet case, and no LLM call at all on the very first
  // ever view (lastViewedAt null, so computeChangesSinceView short-circuits
  // to []). One plain sentence, not a structured breakdown — the change
  // list itself (rendered in the banner) already has the detail.
  const generateChangesSummary = async (cs, changes) => {
    setChangesSummaryLoading(l => ({...l, [cs.id]:true}));
    try {
      const changesText = changes.map(c=>`- ${c.label}`).join("\n");
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:150,
        stream:false,
        system:"You are Compass, an Employee Relations copilot. Summarise what has changed on a case since the user last viewed it, in exactly one plain sentence, factual and neutral, starting with \"Since you last viewed this case,\". No markdown, no bullet points, no preamble — just the one sentence.",
        messages:[{role:"user", content:`Case: ${cs.employeeName} (${cs.caseType||"HR matter"})\n\nChanges:\n${changesText}`}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      if(text) setChangesSummary(s => ({...s, [cs.id]:text}));
    } catch(e) { console.error("generateChangesSummary", e); }
    setChangesSummaryLoading(l => ({...l, [cs.id]:false}));
  };

  // Grants case_access with role "investigator" (a vocabulary value that
  // existed since role_expansion_2026-08-09.sql but nothing ever wrote
  // until now — HandoffModal/ReassignCaseModal only ever write
  // "disciplinary_officer"/"case_owner") and seeds the fixed 7-step
  // investigation checklist as ordinary case_tasks so it's immediately
  // visible on both the investigator's restricted view and HR's normal
  // Tasks tab.
  // Manager Enablement (Phase 4, MP7, §7) — scope gains three fields:
  // which specific allegations to investigate (a subset, not implicitly
  // "all" — AssignInvestigatorModal defaults to every allegation checked,
  // preserving the old implicit behaviour, but HR can now narrow it),
  // a target completion date, and a short free-text scope note. All
  // optional/nullable so a scope-less call (e.g. from a test or a future
  // caller) behaves exactly as before this phase.
  const assignInvestigator = async (caseId, memberId, scope={}) => {
    const targetMember = orgMembers.find(m=>m.id===memberId||m.user_id===memberId);
    if(!targetMember?.user_id||!org?.id) { showToast("Couldn't find that team member", "error"); return; }
    const { error } = await withFkRetry(() => supabase.from('case_access').upsert({
      case_id: caseId, user_id: targetMember.user_id, org_id: org.id, role: "investigator", granted_by: user?.id,
      scope_allegation_ids: scope.allegationIds?.length ? scope.allegationIds : null,
      target_completion_date: scope.targetCompletionDate || null,
      scope_note: (scope.scopeNote||"").trim() || null,
    }));
    if(error) { console.error('assignInvestigator', error); showToast("Couldn't assign investigator — "+error.message, "error"); return; }
    await loadCaseAccess();
    // Manager Enablement (Phase 4, MP19) — functional update: this runs
    // after an awaited network round trip (loadCaseAccess above), so a
    // plain setCaseTasks(updatedTasks) built from whatever caseTasks
    // closure existed when assignInvestigator was first called can race
    // another write (e.g. createCaseTask, MP19's own sendHrGuidance)
    // that happens in between and silently overwrite it. Real bug, found
    // via hr-intervention.spec.js sending guidance immediately after
    // assigning an investigator — not a hypothetical.
    let newlyCreated = [];
    setCaseTasks(prev => {
      const updatedTasks = seedInvestigationChecklist(prev, caseId, targetMember.name);
      newlyCreated = updatedTasks.filter(t=>!prev.some(existing=>existing.id===t.id));
      return updatedTasks;
    });
    newlyCreated.forEach(t=>saveCaseTaskToDB({...t, createdBy:user?.id}));
    audit("Investigator assigned", targetMember.name, caseId);
    showToast(targetMember.name+" assigned as investigator");
  };

  // Manager Enablement (Phase 4, MP8, §9) — distinct from the fixed
  // generic 7-step checklist above: a real AI call producing concrete,
  // case-specific action items grounded only in the allegations and
  // evidence already on this case (never inventing facts — e.g. "obtain
  // CCTV" only if CCTV is already mentioned). Reachable from both HR
  // (CaseTasksPanel) and the assigned investigator's own restricted view
  // (InvestigatorChecklistView) — same case_tasks storage either side
  // writes to, tagged investigation_plan (investigationPlan.js) so it
  // renders as its own section rather than mixed into the generic
  // checklist or ad-hoc tasks. Batches the whole write into one
  // setCaseTasks call via seedInvestigationPlanTasks (same reasoning as
  // assignInvestigator/seedInvestigationChecklist above) rather than
  // looping createCaseTask calls, which would each read the same stale
  // caseTasks closure and silently drop all but the last item.
  const [investigationPlanLoading, setInvestigationPlanLoading] = useState({});
  const generateInvestigationPlan = async (cs) => {
    const caseAllegations = allegationsForCase(allegations, cs.id);
    setInvestigationPlanLoading(l=>({...l, [cs.id]:true}));
    try {
      const allegationList = caseAllegations.map(a=>`- ${a.title}${a.description?" — "+a.description:""}`).join("\n") || "None recorded yet.";
      const evidenceList = (cs.evidence||[]).map(e=>`- ${e.name}${e.type?" ("+e.type+")":""}`).join("\n") || "None on file yet.";
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:600,
        stream:false,
        system:"You are Compass, an Employee Relations copilot drafting a case-specific investigation plan — concrete action items an investigator should actually do, grounded ONLY in the allegations and evidence already on file. Never invent evidence, witnesses, or facts not mentioned (e.g. only suggest obtaining CCTV footage if CCTV is already mentioned in the allegations or evidence). 3 to 8 items, ordered roughly by priority. Respond ONLY with valid JSON, no other text: [{\"name\":\"short imperative action, e.g. Interview Priya Shah as a named witness\",\"reasoning\":\"one short sentence tying it to what's on file\"}]",
        messages:[{role:"user", content:"ALLEGATIONS:\n"+allegationList+"\n\nEVIDENCE ON FILE:\n"+evidenceList}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const items = sanitizeInvestigationPlanItems(parsed);
      const updatedTasks = seedInvestigationPlanTasks(caseTasks, cs.id, items);
      const newlyCreated = updatedTasks.filter(t=>!caseTasks.some(existing=>existing.id===t.id));
      if(!newlyCreated.length) { showToast("Compass didn't find any new plan items to add"); }
      else {
        setCaseTasks(updatedTasks);
        newlyCreated.forEach(t=>saveCaseTaskToDB({...t, createdBy:user?.id}));
        audit("Investigation plan generated", newlyCreated.length+" item"+(newlyCreated.length!==1?"s":""), cs.id);
      }
    } catch(e) { console.error("generateInvestigationPlan", e); showToast("Couldn't generate the investigation plan — "+e.message, "error"); }
    setInvestigationPlanLoading(l=>({...l, [cs.id]:false}));
  };

  // Process Intelligence (P8) — generalizes assignInvestigator for the
  // roles that had no dedicated assignment flow at all before this phase
  // (caseRoles.js's ASSIGNABLE_ROLES: Appeal Manager, Notetaker, the
  // employee's own line manager, Approver). case_access has one row per
  // (case, user) — case_access_case_id_user_id_key — so reassigning a
  // role, or giving someone who already holds a different role on this
  // case a new one, needs to replace their existing row. That can't be a
  // plain upsert targeting the constraint: case_access's RLS only has
  // SELECT/INSERT/DELETE policies (baseline_schema_2026-08-06.sql), no
  // UPDATE one — an upsert that resolves to an UPDATE gets silently
  // blocked (42501) rather than failing loudly. Delete-then-insert stays
  // within the policies that actually exist instead.
  const assignCaseRole = async (caseId, memberId, roleId) => {
    const targetMember = orgMembers.find(m=>m.id===memberId||m.user_id===memberId);
    if(!targetMember?.user_id||!org?.id) { showToast("Couldn't find that team member", "error"); return; }
    await supabase.from('case_access').delete().eq('case_id', caseId).eq('user_id', targetMember.user_id);
    const { error } = await withFkRetry(() => supabase.from('case_access').insert({
      case_id: caseId, user_id: targetMember.user_id, org_id: org.id, role: roleId, granted_by: user?.id,
    }));
    if(error) { console.error('assignCaseRole', error); showToast("Couldn't assign "+caseRoleLabel(roleId)+" — "+error.message, "error"); return; }
    await loadCaseAccess();
    audit(caseRoleLabel(roleId)+" assigned", targetMember.name, caseId);
    showToast(targetMember.name+" assigned as "+caseRoleLabel(roleId));
  };

  // Manager Enablement (Phase 4, MP11, §17) — the HR Review Gate's own
  // action set (HrReviewGatePanel.jsx), distinct from respondToReview's
  // plain approve/reject that the outcome-approval flow (OutcomeModal,
  // ApprovalsPanel) still uses unchanged. Each action writes its own
  // status via respondToReview, then applies at most one deterministic
  // case-level effect. Deliberately does NOT make "progress to next
  // stage" force cs.stage straight to "disciplinary": getNextStep's own
  // "disciplinary" branch assumes an invitation was already sent
  // (checks !lastDisc?.record), so skipping straight there would bypass
  // the ACAS invitation step entirely. Both "approved" and "progressed"
  // leave the case's stage machinery alone — the case's own next-step
  // banner already shows "Proceed to disciplinary — send invitation"
  // once stage is "inv_report" (MP10's own finalizeInvestigationSubmission);
  // the review's status is what's genuinely new here, not a stage jump.
  const resolveInvestigationReview = async (reviewId, caseId, actionId, comments) => {
    await respondToReview(reviewId, actionId, comments);
    const cs = cases.find(c=>c.id===caseId);
    if(!cs) return;
    if(actionId==="returned") {
      saveCases(cases.map(x=>x.id===caseId?{...x,stage:"investigation"}:x));
      const submitTask = investigationChecklistTasks(caseTasks, caseId).find(t=>t.name===INVESTIGATION_CHECKLIST_STEPS[INVESTIGATION_CHECKLIST_STEPS.length-1].label);
      if(submitTask?.status==="done") toggleCaseTaskDone(submitTask.id);
      audit("Investigation returned for further work", comments||cs.employeeName, caseId);
    } else if(actionId==="clarification_requested") {
      createCaseTask(caseId, { name: "Clarify: "+(comments||"HR requested clarification on the investigation") });
      audit("Clarification requested on investigation", comments||cs.employeeName, caseId);
    } else if(actionId==="taken_over") {
      saveCases(cases.map(x=>x.id===caseId?{...x,manager:member?.name||user?.email||x.manager}:x));
      if(user?.id) await assignCaseRole(caseId, user.id, "case_owner");
      audit("Case taken over by HR", member?.name||user?.email, caseId);
    } else if(actionId==="closed") {
      saveCases(cases.map(x=>x.id===caseId?{...x,stage:"closed"}:x));
      audit("Case closed from HR review", comments||cs.employeeName, caseId);
    } else {
      audit("Investigation review: "+actionId, comments||cs.employeeName, caseId);
    }
  };

  // Manager Enablement (Phase 4, MP19, §15) — HR Intervention actions,
  // reachable from the case itself (CaseViewScreen's header) and from
  // MP18's own Delegated Work dashboard. Distinct from
  // resolveInvestigationReview above: these are proactive, HR-initiated
  // actions available at any point during a delegated investigation, not
  // only in response to a submitted review request — "Return for further
  // work" and "Take over" apply the exact same case-level effects as
  // resolveInvestigationReview's own "returned"/"taken_over" branches,
  // just without needing a review request to exist first.
  const [showHrInterventionModal, setShowHrInterventionModal] = useState(false);
  const [hrInterventionCaseId, setHrInterventionCaseId] = useState(null);
  const openHrInterventionModal = (caseId) => { setHrInterventionCaseId(caseId); setShowHrInterventionModal(true); };

  // "Send guidance", "Add investigation question" and "Request additional
  // witness" are the same underlying mechanism — a case_task tagged with
  // its own distinct source (same tagging pattern MP8 uses for the
  // investigation plan) so InvestigatorChecklistView can render it as a
  // note rather than a checklist item — differing only in label/source.
  const HR_NOTE_TYPES = {
    guidance: { source: "hr_guidance", prefix: "Guidance from HR" },
    question: { source: "hr_question", prefix: "HR question" },
    witness: { source: "hr_witness_request", prefix: "HR requests a witness" },
  };
  const sendHrGuidance = (caseId, note, noteType) => {
    const cs = cases.find(c=>c.id===caseId);
    if(!cs || !(note||"").trim()) return;
    const { source, prefix } = HR_NOTE_TYPES[noteType] || HR_NOTE_TYPES.guidance;
    createCaseTask(caseId, { name: prefix+": "+note.trim(), source, owner: "" });
    audit(prefix, note.trim(), caseId);
  };

  const hrReturnForFurtherWork = (caseId, note) => {
    const cs = cases.find(c=>c.id===caseId);
    if(!cs) return;
    saveCases(cases.map(x=>x.id===caseId?{...x,stage:"investigation"}:x));
    const submitTask = investigationChecklistTasks(caseTasks, caseId).find(t=>t.name===INVESTIGATION_CHECKLIST_STEPS[INVESTIGATION_CHECKLIST_STEPS.length-1].label);
    if(submitTask?.status==="done") toggleCaseTaskDone(submitTask.id);
    if((note||"").trim()) createCaseTask(caseId, { name: "Guidance from HR: "+note.trim(), source: "hr_guidance", owner: "" });
    audit("Investigation returned for further work (HR intervention)", note||cs.employeeName, caseId);
  };

  const hrTakeOverCase = async (caseId) => {
    const cs = cases.find(c=>c.id===caseId);
    if(!cs) return;
    saveCases(cases.map(x=>x.id===caseId?{...x,manager:member?.name||user?.email||x.manager}:x));
    if(user?.id) await assignCaseRole(caseId, user.id, "case_owner");
    audit("Case taken over by HR (intervention)", member?.name||user?.email, caseId);
  };

  // "Pause" is deliberately scoped narrow: a boolean + this one audit
  // entry, not a new status state machine — computeDueSoon (MP17) and
  // computeDelegatedWork (MP18) both already respect it, nothing more.
  const togglePauseInvestigation = (caseId) => {
    const cs = cases.find(c=>c.id===caseId);
    if(!cs) return;
    const nowPaused = !cs.investigationPaused;
    saveCases(cases.map(x=>x.id===caseId?{...x,investigationPaused:nowPaused}:x));
    audit(nowPaused?"Investigation paused":"Investigation resumed", cs.employeeName, caseId);
  };

  // Closes this modal and opens the existing AssignInvestigatorModal
  // (MP7) instead of duplicating its own reassignment UI — that modal
  // reads activeCaseId, which the Delegated Work dashboard's own
  // "Intervene" button never sets (it isn't "viewing" a case), so this
  // sets it explicitly first.
  const reassignFromIntervention = () => {
    setActiveCaseId(hrInterventionCaseId);
    setShowHrInterventionModal(false);
    setShowAssignInvestigatorModal(true);
  };

  // ── Case signals ──
  const loadCaseSignals = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await supabase.from('case_signals').select('*').eq('org_id', org.id).order('created_at', {ascending:true});
      if(error) { console.error('loadCaseSignals', error); return; }
      if(data) setCaseSignals(data.map(r=>({
        id:r.id, caseId:r.case_id, type:r.type, title:r.title, reasoning:r.reasoning||"",
        status:r.status, sourceRefs:r.source_refs||[], source:r.source,
        createdBy:r.created_by, resolvedBy:r.resolved_by, resolvedAt:r.resolved_at,
        resolvedReason:r.resolved_reason, createdAt:r.created_at,
      })));
    } catch(e) { console.error('loadCaseSignals', e); }
  };

  const saveSignalToDB = async (signal) => {
    if(!org?.id) return;
    const { error } = await withFkRetry(() => supabase.from('case_signals').upsert({
      id: signal.id, case_id: signal.caseId, org_id: org.id,
      type: signal.type, title: signal.title, reasoning: signal.reasoning||null,
      status: signal.status||'open', source_refs: signal.sourceRefs||[], source: signal.source||'ai',
      created_by: signal.createdBy||null, resolved_by: signal.resolvedBy||null,
      resolved_at: signal.resolvedAt||null, resolved_reason: signal.resolvedReason||null,
      updated_at: new Date().toISOString(),
    }));
    if(error) console.error('saveSignalToDB', error);
  };

  const changeSignalStatus = (signalId, status, reason) => {
    const updated = setSignalStatus(caseSignals, signalId, status, user?.id, reason);
    setCaseSignals(updated);
    const changed = updated.find(s=>s.id===signalId);
    if(changed) saveSignalToDB(changed);
  };

  // ── Case tasks ──
  // Same own-table treatment as allegations (see supabase/case_structure_2026-08-09.sql)
  // — checklistTasks.js's nested {id, tasks:[...]} shape doesn't fit a flat,
  // cross-case-listable table, so these are new but deliberately small,
  // mirroring allegations' own CRUD shape rather than inventing a third pattern.
  const loadCaseTasks = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await supabase.from('case_tasks').select('*').eq('org_id', org.id).order('created_at', {ascending:true});
      if(error) { console.error('loadCaseTasks', error); return; }
      if(data) setCaseTasks(data.map(r=>({
        id:r.id, caseId:r.case_id, name:r.name, owner:r.owner||"",
        dueDate:r.due_date||"", priority:r.priority, status:r.status,
        createdBy:r.created_by, createdAt:r.created_at, source:r.source||null,
      })));
    } catch(e) { console.error('loadCaseTasks', e); }
  };

  const saveCaseTaskToDB = async (task) => {
    if(!org?.id) return;
    const { error } = await withFkRetry(() => supabase.from('case_tasks').upsert({
      id: task.id, case_id: task.caseId, org_id: org.id,
      name: task.name, owner: task.owner||null, due_date: task.dueDate||null,
      priority: task.priority||'normal', status: task.status||'open', source: task.source||null,
      created_by: task.createdBy||user?.id||null, updated_at: new Date().toISOString(),
    }));
    if(error) { console.error('saveCaseTaskToDB', error); showToast("Couldn't save task to the cloud — "+error.message, "error"); }
  };

  const deleteCaseTaskFromDB = async (taskId) => {
    const { error } = await supabase.from('case_tasks').delete().eq('id', taskId);
    if(error) { console.error('deleteCaseTaskFromDB', error); showToast("Couldn't delete task — "+error.message, "error"); }
  };

  // Manager Enablement (Phase 4, MP19) — functional update, same
  // stale-closure fix pattern as MP5/MP6: createCaseTask is called from
  // many places (Tasks tab, sendHrGuidance, hrReturnForFurtherWork...),
  // and assignInvestigator's own checklist seeding writes caseTasks
  // independently and asynchronously (after an awaited loadCaseAccess()
  // call) — a plain setCaseTasks(updated) here reads whatever caseTasks
  // closure this call happened to capture, and if the checklist's own
  // still-in-flight write commits afterwards, ITS plain setCaseTasks
  // call (built from ITS OWN pre-await snapshot) silently overwrites
  // this one. Found via a real E2E race (hr-intervention.spec.js
  // sending guidance immediately after assigning an investigator), not
  // just reasoned about in the abstract.
  const createCaseTask = (caseId, fields) => {
    let created = null;
    setCaseTasks(prev => {
      const updated = addTask(prev, caseId, fields);
      if(updated===prev) return prev;
      created = updated[updated.length-1];
      return updated;
    });
    if(created) {
      saveCaseTaskToDB({...created, createdBy:user?.id});
      audit("Task added", created.name, caseId);
    }
  };

  const toggleCaseTaskDone = (taskId) => {
    const updated = toggleTaskDone(caseTasks, taskId);
    setCaseTasks(updated);
    const changed = updated.find(t=>t.id===taskId);
    if(changed) saveCaseTaskToDB(changed);
  };

  const deleteCaseTask = (taskId) => {
    const target = caseTasks.find(t=>t.id===taskId);
    setCaseTasks(removeTask(caseTasks, taskId));
    deleteCaseTaskFromDB(taskId);
    if(target) audit("Task removed", target.name, target.caseId);
  };

  // ── AI Case Assistant + AI Case Overview ──
  // Both read-only over buildCaseContext() (src/lib/caseContext.js) — no
  // new source of truth. Keyed by case id, same {[caseId]: value} pattern
  // as adjustments/showAppealInput, so state survives switching case tabs
  // without leaking between cases.
  const [caseChatHistory, setCaseChatHistory] = useState({});
  const [caseChatInput, setCaseChatInput] = useState("");
  const [caseChatProcessing, setCaseChatProcessing] = useState(false);
  const [caseOverview, setCaseOverview] = useState({});
  // Phase 23 — Explainability retrofit. Captured once per generation
  // (not re-derived at render time) so "why" always reflects exactly
  // what actually fed that specific overview, even if the case's own
  // allegations/meetings change afterwards.
  const [caseOverviewSources, setCaseOverviewSources] = useState({});
  const [caseOverviewLoading, setCaseOverviewLoading] = useState({});

  // Phase 21 — Case Memory hardening. Session-local only (meeting records
  // don't change once a meeting's saved, so a fresh summary next session
  // costs nothing beyond one more AI call and never goes stale) — no new
  // table needed for what's really a memoisation cache.
  const [meetingSummaries, setMeetingSummaries] = useState({});

  // One combined call per case per session, not one per meeting — every
  // meeting still needing a summary (lib/caseContext.js's
  // meetingsNeedingSummary) goes in a single request. Falls back silently
  // (buildCaseContext's own short excerpt) if the call or parse fails,
  // same "never block on an enrichment step" posture as every other
  // best-effort AI pass in this build-out.
  const summarizeMeetingsForCase = async (meetings) => {
    if (!meetings.length) return {};
    try {
      const meetingsText = meetings.map(m => `MEETING id="${m.id}" — ${m.type||"Meeting"} on ${m.date||"unknown date"}\n${(m.record||"").slice(0, 3000)}`).join("\n\n");
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:800,
        stream:false,
        system:"You are compressing older meeting records from an HR case file so they can still inform later AI analysis without the full transcript. For each meeting given, write a factual 2-3 sentence summary: what was discussed, any admissions/denials, and any evidence or names mentioned. Respond ONLY with valid JSON, no other text: [{\"id\":\"...\",\"summary\":\"...\"}]",
        messages:[{role:"user", content:meetingsText}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      if (!Array.isArray(parsed)) return {};
      const next = {};
      parsed.forEach(p => { if (p.id && p.summary) next[p.id] = p.summary; });
      setMeetingSummaries(prev => ({...prev, ...next}));
      return next;
    } catch(e) { console.error("summarizeMeetingsForCase", e); return {}; }
  };

  // The one entry point every case-context AI call (Ask Compass, Case
  // Overview, Next Best Action, Unanswered Questions) should build its
  // context through — ensures any meeting summaries the budget needs are
  // ready before the pure, synchronous buildCaseContext() assembles the
  // final string, without those call sites needing to know this exists.
  const buildHardenedCaseContext = async (cs) => {
    const caseAllegations = allegationsForCase(allegations, cs.id);
    const caseTaskList = tasksForCase(caseTasks, cs.id);
    const needing = meetingsNeedingSummary(cs, meetingSummaries);
    const summaries = needing.length
      ? {...meetingSummaries, ...(await summarizeMeetingsForCase(needing))}
      : meetingSummaries;
    return buildCaseContext(cs, caseAllegations, caseTaskList, summaries);
  };

  // ── Global Compass AI (Phase 22) ──
  // A new, additive entry point alongside — not replacing — the existing
  // per-case AI Assistant tab and per-meeting Ask Compass widget above.
  // Answers org-wide questions by classifying intent first (a real,
  // separate AI call) and only then routing to a genuinely scoped query:
  // org_case_stats() (a Supabase RPC, supabase/global_ai_stats_2026-08-12.sql)
  // for aggregate/count questions, so the client never has to loop over
  // every case it can see just to answer "how many"; buildHardenedCaseContext
  // (Phase 21) for a specific named case, over the SAME already-loaded,
  // already RLS-scoped `cases` array every other feature in this app
  // already relies on — matchCaseByEmployeeName (lib/globalAssistant.js)
  // can only ever narrow within that array, never see anything wider.
  // Confidentiality is therefore enforced twice over: once by RLS on the
  // `cases` table itself (what's ever loaded client-side), and again by
  // RLS on org_case_stats() specifically — verified directly against the
  // database (not just assumed) before this shipped: a simulated session
  // for a user with no org membership got every count back as zero, and
  // the real org member correctly saw the real numbers including a
  // temporary confidential test case, matching how hr_director oversight
  // already works everywhere else in this app.
  //
  // Manager Enablement (Phase 4, MP15, §12) — the plan called for
  // "narrowing globalAssistant.js's case-context building for non-HR
  // roles to reuse MP1's RLS as the sole enforcement boundary." Re-checked
  // against the live database rather than assumed: org_case_stats() is
  // still SECURITY INVOKER (pg_proc.prosecdef = false), and MP1's own
  // restrictive policy ("Non-oversight members restricted to their own
  // assigned cases", RESTRICTIVE FOR SELECT on public.cases) is deployed
  // and combines with every other cases policy automatically — so both
  // this RPC's internal `my_cases` CTE and matchCaseByEmployeeName's own
  // array (sourced from the same RLS-scoped loadCasesFromDB() fetch)
  // already narrow to a non-HR manager's own accessible cases with no
  // code change needed here. There is no second, parallel allow-list to
  // build or drift out of sync — MP1's RLS already is the sole
  // enforcement boundary, exactly as the plan asked for, purely as a
  // structural consequence of this function never having been written as
  // SECURITY DEFINER and never having its own bespoke visibility rules.
  const [globalChatHistory, setGlobalChatHistory] = useState([]);
  const [globalChatInput, setGlobalChatInput] = useState("");
  const [globalChatProcessing, setGlobalChatProcessing] = useState(false);
  const [globalChatCaseRef, setGlobalChatCaseRef] = useState(null);

  const sendGlobalChat = async () => {
    const question = globalChatInput.trim();
    if(!question || globalChatProcessing) return;
    setGlobalChatInput("");
    const updated = [...globalChatHistory, {role:"user", content:question}];
    setGlobalChatHistory(updated);
    setGlobalChatProcessing(true);
    setGlobalChatCaseRef(null);
    try {
      const classifyRes = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:200,
        stream:false,
        system:"You classify a question an HR professional is asking an organisation-wide assistant. Respond ONLY with valid JSON, no other text: {\"intent\":\"stats\"|\"case\"|\"general\",\"employeeName\":\"exact name mentioned, or null\"}. Use \"stats\" for questions about counts, totals, or breakdowns across cases (e.g. how many open cases, what mix of case types). Use \"case\" only when a specific named employee's case is being asked about. Use \"general\" for policy, process, or legal-guidance questions not about specific case data.",
        messages:[{role:"user", content:question}],
      })});
      const classifyData = await classifyRes.json();
      const classifyText = (classifyData.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      let intent = "general", employeeName = null;
      try {
        const parsed = JSON.parse(classifyText.replace(/```json|```/g,"").trim());
        intent = parsed.intent || "general";
        employeeName = parsed.employeeName || null;
      } catch { /* malformed classification — fall back to general, no case/stats data attached */ }

      let dataContext = "";
      let matchedCase = null;
      if(intent==="stats") {
        const { data, error } = await supabase.rpc('org_case_stats');
        if(error) console.error("org_case_stats", error);
        else dataContext = "ORG-WIDE CASE STATISTICS (live database query, scoped to cases you have access to):\n"+JSON.stringify(data);
      } else if(intent==="case" && employeeName) {
        matchedCase = matchCaseByEmployeeName(cases, employeeName);
        dataContext = matchedCase
          ? "CASE RECORD for "+matchedCase.employeeName+":\n"+await buildHardenedCaseContext(matchedCase)
          : "No case matching the name \""+employeeName+"\" was found among the cases you have access to.";
      }

      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:600,
        stream:false,
        system:"You are Compass, an organisation-wide Employee Relations copilot. Answer only using the data provided below — if a specific number or fact isn't in it, say so rather than guessing or estimating. Never recommend a sanction, disciplinary outcome, or final decision on any specific case. When discussing statistics, cite only the real numbers given. Plain text only — no asterisks, no markdown headers."+getPolicyCtx(),
        messages:[
          ...updated.map(m=>({role:m.role, content:m.content})).slice(0,-1),
          {role:"user", content:(dataContext?dataContext+"\n\n":"")+"Question: "+question},
        ],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(text) setGlobalChatHistory(h=>[...h, {role:"assistant", content:text}]);
      if(matchedCase) setGlobalChatCaseRef(matchedCase.id);
    } catch(e) { console.error("sendGlobalChat", e); showToast("Couldn't reach Compass — "+e.message, "error"); }
    setGlobalChatProcessing(false);
  };

  const sendCaseChat = async (cs) => {
    const question = caseChatInput.trim();
    if(!question || caseChatProcessing) return;
    setCaseChatInput("");
    const history = caseChatHistory[cs.id]||[];
    const updated = [...history, {role:"user", content:question}];
    setCaseChatHistory(h=>({...h, [cs.id]:updated}));
    setCaseChatProcessing(true);
    try {
      const context = await buildHardenedCaseContext(cs);
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:500,
        stream:false,
        system:"You are Compass, an AI assistant helping an HR professional work through a specific employee relations case. Answer only using the case record and company policies provided below — if the answer isn't in the record, say so rather than guessing or inventing detail. Never tell the user what the final decision, sanction, or disciplinary outcome should be; you may explain relevant UK employment law or ACAS guidance and help them think through the process, but the decision itself is theirs to make. Plain text only — no asterisks, no markdown headers."+getPolicyCtx(),
        messages:[
          ...updated.map(m=>({role:m.role, content:m.content})).slice(0,-1),
          {role:"user", content:"CASE RECORD:\n"+context+"\n\nQuestion: "+question},
        ],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(text) setCaseChatHistory(h=>({...h, [cs.id]:[...updated, {role:"assistant", content:text}]}));
    } catch(e) { console.error("sendCaseChat", e); showToast("Couldn't reach Compass — "+e.message, "error"); }
    setCaseChatProcessing(false);
  };

  const generateCaseOverview = async (cs) => {
    setCaseOverviewLoading(l=>({...l, [cs.id]:true}));
    try {
      const context = await buildHardenedCaseContext(cs);
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:1200,
        stream:false,
        system:"You are an HR case-review assistant. Read the case record provided and produce a structured, strictly neutral overview for the HR professional running the case. You must NEVER present something as an established fact unless the case record explicitly supports it — distinguish clearly between what's agreed, what's disputed, and what's simply unknown. You must NEVER recommend a sanction, disciplinary outcome, or final decision on any allegation — that is solely for the responsible manager to decide; you may only recommend the next *procedural* step (e.g. \"hold the investigation meeting\", \"obtain a written witness statement\"), never an outcome. Where evidence conflicts or is missing, say so explicitly rather than resolving it yourself."+getPolicyCtx(),
        messages:[{role:"user", content:"CASE RECORD:\n"+context+"\n\nProduce the overview using exactly these markdown headers, in this order: ## Established facts, ## Disputed facts, ## Evidence for and against each allegation, ## Outstanding questions, ## Procedural risk, ## Recommended next procedural step. If a section has nothing to report, write \"Nothing recorded yet.\" under it rather than omitting it."}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(text) {
        setCaseOverview(o=>({...o, [cs.id]:text}));
        const caseAllegs = allegationsForCase(allegations, cs.id);
        setCaseOverviewSources(s=>({...s, [cs.id]:buildOverviewSourceRefs(caseAllegs, cs.meetings||[])}));
      }
      else showToast("Couldn't generate the case overview", "error");
    } catch(e) { console.error("generateCaseOverview", e); showToast("Couldn't generate the case overview — "+e.message, "error"); }
    setCaseOverviewLoading(l=>({...l, [cs.id]:false}));
  };

  // ── Next Best Action ──
  // getNextStep() (lib/nextStep.js) stays the deterministic floor — this
  // AI pass never contradicts its procedural stage, only sharpens it with
  // a reason grounded in the actual case record (a named witness, a
  // specific evidence gap) and writes the result as a next_action
  // case_signal so it can be accepted/dismissed/marked-not-relevant and
  // explained later, rather than living only as a re-generated string.
  // P5 — built from P4's indexed clauses (not the raw policy text
  // getPolicyCtx already sends as general context) so the model can cite
  // a SPECIFIC clause by policy name + heading rather than folding "your
  // policy requires X" anonymously into prose. Bounded the same way
  // getPolicyCtx is, for the same reason.
  const buildPolicyClauseDigest = () => {
    const withClauses = policies.filter(p => (p.clauses||[]).length);
    if(!withClauses.length) return "";
    const body = withClauses.map(p =>
      `Policy: "${p.name}"\n` + p.clauses.map(c=>`- ${c.heading}: ${c.text}`).join("\n")
    ).join("\n\n");
    return "\n\nINDEXED POLICY CLAUSES (cite one by exact policyName + heading in policyClause if, and only if, it genuinely supports your recommendation — otherwise policyClause must be null):\n" + body.slice(0, 6000);
  };

  const generateNextBestAction = async (cs, silent=false) => {
    if(!silent) setNextActionLoading(l=>({...l, [cs.id]:true}));
    try {
      const context = await buildHardenedCaseContext(cs);
      const floor = getNextStep(cs);
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:500,
        stream:false,
        system:"You are Compass, an Employee Relations copilot recommending the single most useful next step for this case. Ground your recommendation in a specific fact from the case record — name the person, meeting, or evidence gap that makes this the right next step; never recommend something generic the record doesn't support. You must NEVER recommend a sanction, disciplinary outcome, or final decision on any allegation — only a procedural step (e.g. \"interview a named witness\", \"obtain a specific document\", \"send the signed record for confirmation\"). A deterministic procedural-stage check has already identified the case's baseline next step below — you may agree with it and sharpen it with a specific reason, or recommend something more specific that still satisfies that same procedural requirement, but never contradict or skip its stage. Respond ONLY with valid JSON, no other text: {\"title\":\"short imperative action, e.g. 'Interview Sarah Jones'\",\"reasoning\":\"one or two sentences citing the specific fact that makes this the right next step\",\"afterThis\":\"one sentence on what should happen once this is done\",\"policyClause\":{\"policyName\":\"exact policy name as given\",\"heading\":\"exact clause heading as given\"}|null}"+getPolicyCtx()+buildPolicyClauseDigest(),
        messages:[{role:"user", content:"CASE RECORD:\n"+context+(floor?"\n\nDeterministic baseline next step: "+floor.label+" — "+(floor.reason||""):"")}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      if(!parsed.title) throw new Error("No recommendation returned");

      // P5 — resolve the AI's citation (by name+heading — it doesn't know
      // policy ids) back to the real indexed clause, so the signal carries
      // an actual quotable source. Silently drops it if either side no
      // longer matches (e.g. the AI slightly reworded a heading) rather
      // than showing a broken/empty citation.
      let sourceRefs = [];
      if(parsed.policyClause?.policyName && parsed.policyClause?.heading) {
        const policy = policies.find(p=>p.name===parsed.policyClause.policyName);
        const clause = policy?.clauses?.find(c=>c.heading===parsed.policyClause.heading);
        if(policy && clause) sourceRefs = [{kind:"policy", id:policy.id, label:policy.name, clauseHeading:clause.heading, clauseText:clause.text}];
      }

      const openPrior = openSignalsForCase(caseSignals, cs.id, "next_action");
      const withoutStale = supersedeOpenSignalsOfType(caseSignals, cs.id, "next_action");
      openPrior.forEach(s => { const updated = withoutStale.find(x=>x.id===s.id); if(updated) saveSignalToDB(updated); });

      const created = createSignal(withoutStale, cs.id, {
        type:"next_action", title:parsed.title,
        reasoning:[parsed.reasoning, parsed.afterThis?"After this: "+parsed.afterThis:null].filter(Boolean).join(" "),
        sourceRefs,
        source:"ai",
      });
      setCaseSignals(created);
      saveSignalToDB(created[created.length-1]);
    } catch(e) { console.error("generateNextBestAction", e); if(!silent) showToast("Couldn't generate a recommendation — "+e.message, "error"); }
    if(!silent) setNextActionLoading(l=>({...l, [cs.id]:false}));
  };

  // ── Unanswered Question Tracker ──
  // Separates what the case record already addresses from what it raises
  // but never follows up on — a person named but not interviewed, a claim
  // made but not checked. Only "still to explore" becomes persisted
  // unanswered_question signals; "covered" is informational only.
  const generateUnansweredQuestions = async (cs, silent=false) => {
    if(!silent) setUnansweredLoading(l=>({...l, [cs.id]:true}));
    try {
      const context = await buildHardenedCaseContext(cs);
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:600,
        stream:false,
        system:"You are Compass, an Employee Relations copilot maintaining a running list of what's been explored in this case and what hasn't. Read the case record and separate topics genuinely covered (a meeting or document already addresses them) from topics that remain open — a person mentioned but not interviewed, a claim made but not checked, a date or detail nobody has confirmed. Only list a 'still to explore' item if the record itself raises it — never invent a generic question the case doesn't support. Respond ONLY with valid JSON, no other text: {\"covered\":[\"short label\",...],\"stillToExplore\":[{\"question\":\"specific open question\",\"reasoning\":\"one sentence on what in the record raises this\"}]}"+getPolicyCtx(),
        messages:[{role:"user", content:"CASE RECORD:\n"+context}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());

      setUnansweredCovered(c=>({...c, [cs.id]: parsed.covered||[]}));

      const openPrior = openSignalsForCase(caseSignals, cs.id, "unanswered_question");
      let updated = supersedeOpenSignalsOfType(caseSignals, cs.id, "unanswered_question");
      openPrior.forEach(s => { const u = updated.find(x=>x.id===s.id); if(u) saveSignalToDB(u); });
      (parsed.stillToExplore||[]).forEach(q => {
        if(!q.question) return;
        updated = createSignal(updated, cs.id, { type:"unanswered_question", title:q.question, reasoning:q.reasoning||"", source:"ai" });
      });
      setCaseSignals(updated);
      updated.filter(s=>s.caseId===cs.id && s.type==="unanswered_question" && s.status==="open").forEach(saveSignalToDB);
    } catch(e) { console.error("generateUnansweredQuestions", e); if(!silent) showToast("Couldn't generate unanswered questions — "+e.message, "error"); }
    if(!silent) setUnansweredLoading(l=>({...l, [cs.id]:false}));
  };

  // ── Contradiction & Inconsistency Detection ──
  // Compares meeting records pairwise for specific, quotable conflicts —
  // never phrased as an accusation (the prompt enforces "potential
  // inconsistency" / "point requiring clarification" wording directly,
  // matching the spec's own constraint). Each signal carries two real
  // meeting source_refs, so "ask why" here is the first place
  // WhySourcesModal resolves more than one source. silent=true is used
  // when this runs automatically after concludeInvestigation() — no
  // loading spinner, no toast on finding nothing, since the user didn't
  // ask for it directly.
  const generateInconsistencies = async (cs, silent=false) => {
    const meetingsWithRecords = (cs.meetings||[]).filter(m=>m.record);
    if(meetingsWithRecords.length<2) { if(!silent) showToast("Need at least two meeting records to compare", "error"); return; }
    if(!silent) setInconsistencyLoading(l=>({...l, [cs.id]:true}));
    try {
      const meetingList = meetingsWithRecords.map(m=>`MEETING id="${m.id}" — ${m.type||"Meeting"} on ${m.date}:\n${(m.record||"").slice(0,2500)}`).join("\n\n---\n\n");
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:900,
        stream:false,
        system:"You are Compass, an Employee Relations copilot comparing meeting records for potential inconsistencies — specific factual details (times, dates, who was present, what was said) that appear to conflict between two accounts. Never state or imply that anyone is lying; accounts can differ for innocent reasons. Always frame findings as a potential inconsistency or a point requiring clarification, never as a contradiction that proves something. Only report a genuine, specific, quotable conflict — not a vague difference in emphasis or a gap where one account simply says less than another. Respond ONLY with valid JSON, no other text: [{\"meetingId1\":\"...\",\"quote1\":\"short quote or paraphrase\",\"meetingId2\":\"...\",\"quote2\":\"short quote or paraphrase\",\"suggestedQuestion\":\"a neutral clarifying question\"}]",
        messages:[{role:"user", content:"MEETING RECORDS:\n\n"+meetingList}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const valid = (Array.isArray(parsed)?parsed:[]).filter(f=>meetingsWithRecords.some(m=>m.id===f.meetingId1) && meetingsWithRecords.some(m=>m.id===f.meetingId2));

      let updated = caseSignals;
      valid.forEach(f => {
        const m1 = meetingsWithRecords.find(m=>m.id===f.meetingId1), m2 = meetingsWithRecords.find(m=>m.id===f.meetingId2);
        updated = createSignal(updated, cs.id, {
          type:"inconsistency",
          title:"Potential inconsistency: "+(m1.type||"a meeting")+" vs "+(m2.type||"another meeting"),
          reasoning:`"${f.quote1}" (${m1.type||"meeting"}, ${m1.date}) — "${f.quote2}" (${m2.type||"meeting"}, ${m2.date}). Suggested clarifying question: ${f.suggestedQuestion||"—"}`,
          sourceRefs:[{kind:"meeting", id:m1.id}, {kind:"meeting", id:m2.id}],
          source:"ai",
        });
      });
      setCaseSignals(updated);
      updated.filter(s=>!caseSignals.includes(s)).forEach(saveSignalToDB);
      if(!silent && valid.length===0) showToast("No inconsistencies found");
    } catch(e) { console.error("generateInconsistencies", e); if(!silent) showToast("Couldn't check for inconsistencies — "+e.message, "error"); }
    if(!silent) setInconsistencyLoading(l=>({...l, [cs.id]:false}));
  };

  const linkSignalToAllegation = (signal, allegationId) => {
    const allegation = allegations.find(a=>a.id===allegationId);
    if(!allegation) return;
    const updated = updateSignal(caseSignals, signal.id, { sourceRefs:[...(signal.sourceRefs||[]), {kind:"allegation", id:allegationId, label:allegation.title}] });
    setCaseSignals(updated);
    const changed = updated.find(s=>s.id===signal.id);
    if(changed) saveSignalToDB(changed);
  };

  // ── Advanced Appeal Workspace (Phase 19) ──
  // Assembles a per-ground comparison once an appeal meeting has a real
  // record: original finding/reasoning (Phase 16) vs. the grounds of
  // appeal Compass extracts from that record vs. any evidence added since
  // the finding (lib/appealReview.js). Written as process_risk case_signals
  // — the same explainability substrate as guardrails/inconsistencies —
  // so "ask why" resolves back to the real allegation and meeting. Never
  // recommends upheld/not upheld; the chair records that separately via
  // recordAppealOutcome.
  const generateAppealReview = async (cs) => {
    const appealMeetings = appealMeetingsForCase(cs);
    if(!appealMeetings.length) { showToast("No appeal meeting record found for this case yet", "error"); return; }
    const caseAllegs = allegations.filter(a=>a.caseId===cs.id);
    if(!caseAllegs.length) { showToast("No allegations recorded on this case", "error"); return; }
    setAppealReviewLoading(l=>({...l, [cs.id]:true}));
    try {
      const appealMeeting = appealMeetings[appealMeetings.length-1];
      const allegationContext = caseAllegs.map(a=>`ALLEGATION id="${a.id}" — ${a.title}\nOriginal finding: ${allegationStatusMeta(a.status).label}\nReasoning: ${a.decisionReasoning||"None recorded"}`).join("\n\n");
      const newEvidenceContext = caseAllegs.map(a=>{
        const ne = newEvidenceSinceFinding(cs.evidence||[], a);
        return ne.length ? `New evidence since the finding on "${a.title}": ${ne.map(e=>e.name).join(", ")}` : null;
      }).filter(Boolean).join("\n") || "None recorded";

      // Process Intelligence (P13) — restructured from one combined blob
      // per allegation to one entry per distinct GROUND of appeal (an
      // allegation can have several, e.g. "the sanction was
      // disproportionate" and "new evidence wasn't considered" both aimed
      // at the same finding) — the AI can return multiple entries sharing
      // the same allegationId. potentialIssue is a genuinely separate
      // field from compassReview, not folded into the same prose, so a
      // real procedural/evidential concern reads distinctly rather than
      // buried in a paragraph of neutral comparison.
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:1600,
        stream:false,
        system:"You are Compass, an Employee Relations copilot assembling a neutral appeal review. Identify each distinct ground of appeal raised in the appeal meeting record — an allegation may have more than one ground raised against it, or none. For each ground, write a short label, then quote or closely paraphrase what the employee specifically argued for it (from the appeal meeting record), then give a neutral comparison against the original finding/reasoning and any new evidence. Never state or recommend whether the appeal should be upheld, partially upheld, or not upheld — that decision belongs solely to the chair hearing the appeal; only describe what the record shows. ground, employeeArgument and compassReview must never be left blank — if there is genuinely nothing to review, return an empty array [] rather than an entry with empty fields. Respond ONLY with valid JSON, no other text, in this exact shape (allegationId must be one of the ids given in ALLEGATIONS AND ORIGINAL FINDINGS below): [{\"allegationId\":\"the matching allegation id\",\"ground\":\"e.g. 'The sanction was disproportionate to the conduct'\",\"employeeArgument\":\"e.g. 'The employee argued the record didn't account for them covering an emergency delivery that day'\",\"compassReview\":\"e.g. 'The original finding relied solely on the swipe-card record and did not record whether this explanation was put to the employee before the finding was reached'\",\"potentialIssue\":\"e.g. 'No record of the employee being asked about this circumstance before the finding' — or an empty string if there genuinely isn't one\"}]",
        messages:[{role:"user", content:"ALLEGATIONS AND ORIGINAL FINDINGS:\n"+allegationContext+"\n\nNEW EVIDENCE:\n"+newEvidenceContext+"\n\nAPPEAL MEETING RECORD:\n"+(appealMeeting.record||"").slice(0,4000)}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const valid = (Array.isArray(parsed)?parsed:[]).filter(f=>f.ground && caseAllegs.some(a=>a.id===f.allegationId));
      if(!valid.length) { showToast("Compass couldn't match the appeal record to any allegation", "error"); setAppealReviewLoading(l=>({...l,[cs.id]:false})); return; }

      // Regenerating supersedes only this case's prior appeal-ground
      // signals (matched by title prefix), never other process_risk
      // signals (guardrails write that same type) — the exact same
      // "supersede stale, don't touch unrelated" split guardrails.js's
      // syncGuardrailSignals already relies on.
      const priorOpen = caseSignals.filter(s=>s.caseId===cs.id && s.type==="process_risk" && s.status==="open" && s.title.startsWith("Appeal ground:"));
      let updated = caseSignals;
      priorOpen.forEach(s => { updated = setSignalStatus(updated, s.id, "resolved", null, "Superseded by a refreshed appeal review"); });
      priorOpen.forEach(s => { const u = updated.find(x=>x.id===s.id); if(u) saveSignalToDB(u); });

      valid.forEach(f => {
        const allegation = caseAllegs.find(a=>a.id===f.allegationId);
        updated = createSignal(updated, cs.id, {
          type:"process_risk",
          title:"Appeal ground: "+f.ground,
          reasoning: formatAppealGroundReasoning({ground:f.ground, employeeArgument:f.employeeArgument, compassReview:f.compassReview, potentialIssue:f.potentialIssue}),
          sourceRefs:[{kind:"allegation", id:allegation.id, label:allegation.title}, {kind:"meeting", id:appealMeeting.id}],
          source:"ai",
        });
        saveSignalToDB(updated[updated.length-1]);
      });
      setCaseSignals(updated);
    } catch(e) { console.error("generateAppealReview", e); showToast("Couldn't generate the appeal review — "+e.message, "error"); }
    setAppealReviewLoading(l=>({...l, [cs.id]:false}));
  };

  // Process Intelligence (P14, §11+§12) — an AI-written companion to
  // computeSanctionDistribution/comparableCaseSummaries' own deterministic
  // tallies (lib/outcomeConsistency.js): why the comparable cases are
  // actually comparable, and what genuinely distinguishes this one.
  // comparableCaseSummaries already strips employee names before this is
  // ever called, so there is nothing identifying to leak into the
  // prompt — but the model is still told explicitly never to reason
  // about protected characteristics, since that's a real instruction
  // this specific prompt needs even though the data itself carries no
  // such field (same "explicit, not just incidental" guard the module's
  // own header comment calls for). Never persisted (see
  // consistencyReview's own declaration) — regenerated on demand, same
  // as generateCaseOverview.
  const generateConsistencyReview = async (cs) => {
    const comparable = comparableCaseSummaries(cases, allegations, cs.caseType, cs.id);
    if(comparable.length < 3) { showToast("Not enough closed cases of this type yet for a consistency review", "error"); return; }
    setConsistencyReviewLoading(l=>({...l, [cs.id]:true}));
    try {
      const currentAllegs = allegationsForCase(allegations, cs.id);
      const currentSummary = currentAllegs.map(a=>`- ${a.title}: ${allegationStatusMeta(a.status).label}${a.decisionReasoning?" — "+a.decisionReasoning.slice(0,220):""}`).join("\n") || "No allegations recorded yet";
      const comparableContext = comparable.map((c,i)=>`Case ${i+1} — outcome: ${c.outcome||"not recorded"}\n`+c.findings.map(f=>`  - ${f.label}${f.reasoningExcerpt?": "+f.reasoningExcerpt:""}`).join("\n")).join("\n\n");

      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:1200,
        stream:false,
        system:"You are Compass, an Employee Relations copilot comparing a case against anonymised closed cases of the same type to help HR reason about consistency. You are given no employee names, and you must never speculate about, infer, or reason based on any employee's protected characteristics (age, sex, race, disability, religion or belief, sexual orientation, gender reassignment, marriage/civil partnership, pregnancy/maternity) — none of that data is provided to you, and none should be assumed. Compare on procedural/factual grounds only: allegation type, seriousness of the conduct, whether it's a first offence or part of a pattern (only if the record actually says so), and impact. Never state something as an established fact the record doesn't support, and never recommend what outcome this case should receive — describe similarities and differences only; the decision is HR's alone. Respond ONLY with valid JSON, no other text: {\"similarityReasoning\":\"why these comparable cases are relevant to this one\",\"distinguishingFeatures\":\"how this case differs from the comparable set, or an empty string if nothing distinguishes it\"}",
        messages:[{role:"user", content:"THIS CASE'S ALLEGATIONS:\n"+currentSummary+"\n\nCOMPARABLE CLOSED CASES (same case type, anonymised):\n"+comparableContext}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      if(parsed.similarityReasoning || parsed.distinguishingFeatures) {
        setConsistencyReview(r=>({...r, [cs.id]: parsed}));
      } else {
        showToast("Couldn't generate a consistency review", "error");
      }
    } catch(e) { console.error("generateConsistencyReview", e); showToast("Couldn't generate a consistency review — "+e.message, "error"); }
    setConsistencyReviewLoading(l=>({...l, [cs.id]:false}));
  };

  // ── Procedural Guardrails ──
  // computeGuardrailChecks (lib/guardrails.js) is a plain data comparison,
  // no AI call — so this runs automatically when a case is opened rather
  // than needing a button + loading state, same "always current" treatment
  // as Case Readiness. Dedup is by exact signal title: a check only
  // creates a new signal if no signal (any status) with that title already
  // exists for this case, so a human's dismiss/not-relevant/accept
  // decision sticks rather than being re-surfaced on the next sync. A
  // currently-open signal is auto-resolved once its condition clears,
  // since these are factual comparisons, not judgment calls a human needs
  // to confirm away.
  const syncGuardrailSignals = (cs) => {
    const checks = computeGuardrailChecks(cs, allegations, policies, caseAccess, orgMembers);
    const triggeredTitles = new Set(checks.map(c=>c.title));
    const existing = caseSignals.filter(s=>s.caseId===cs.id && s.type==="process_risk");

    let updated = caseSignals;
    existing.filter(s=>s.status==="open" && !triggeredTitles.has(s.title)).forEach(s => {
      updated = setSignalStatus(updated, s.id, "resolved", null, "Condition no longer detected");
      const changed = updated.find(x=>x.id===s.id);
      if(changed) saveSignalToDB(changed);
    });

    checks.forEach(c => {
      if(existing.some(s=>s.title===c.title)) return;
      updated = createSignal(updated, cs.id, { type:"process_risk", title:c.title, reasoning:c.reasoning, sourceRefs:c.sourceRefs||[], source:"ai" });
      saveSignalToDB(updated[updated.length-1]);
    });

    if(updated!==caseSignals) setCaseSignals(updated);
  };

  // cases/allegations are deliberately in this dependency array, not just
  // [screen, activeCaseId]: on a fresh page load or reload straight into a
  // case (e.g. following a link, or the browser's own refresh), cases
  // hasn't finished loading from Supabase yet the first time this fires,
  // so `cs` is undefined and the sync silently never runs — and without
  // cases/allegations as deps, it would never get a second chance once
  // they do load. Re-running on every mutation is safe, not wasteful
  // churn: syncGuardrailSignals is idempotent by construction (dedup by
  // exact title), so a re-fire that finds nothing new just does nothing.
  // caseAccess added for P8's checkAppealManagerConflict — assigning an
  // Appeal Manager (or reassigning one) should surface a conflict signal
  // immediately, not just on the next full page reload.
  useEffect(()=>{
    if(screen===SCREENS.CASE_VIEW && activeCaseId) {
      const cs = cases.find(c=>c.id===activeCaseId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncGuardrailSignals only calls setCaseSignals when a check's dedup-by-title comparison finds something new/cleared, not on every fire; the guarded, title-deduped write is what keeps this effect from cascading, same shape the rule can't see through elsewhere in this file (e.g. updateMeetingIntelligence above).
      if(cs) syncGuardrailSignals(cs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeCaseId, cases, allegations, caseAccess]);

  // ── Automatic Evidence Matrix — link suggestions ──
  // The matrix grid itself and manual linking already existed (Evidence
  // Matrix panel, allegations.js's linkEvidenceToAllegation) — this only
  // adds the AI proposing which of the case's *unlinked* evidence probably
  // belongs to which allegation. A suggestion becomes a real link only
  // through the existing linkEvidenceToAllegation()/saveCases() path when
  // the HR user accepts it — never applied automatically.
  const generateEvidenceSuggestions = async (cs, silent=false) => {
    const caseAllegations = allegationsForCase(allegations, cs.id);
    const unlinked = (cs.evidence||[]).map((ev,index)=>({...ev,index})).filter(ev=>!ev.allegationId);
    if(!caseAllegations.length || !unlinked.length) { setEvidenceSuggestions(s=>({...s, [cs.id]:[]})); return; }
    if(!silent) setEvidenceSuggestionsLoading(l=>({...l, [cs.id]:true}));
    try {
      const allegationList = caseAllegations.map(a=>`- id "${a.id}": ${a.title}${a.description?" — "+a.description:""}`).join("\n");
      const evidenceList = unlinked.map(ev=>`- index ${ev.index}: ${ev.name}${ev.type?" ("+ev.type+")":""}`).join("\n");
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:500,
        stream:false,
        system:"You are Compass, an Employee Relations copilot proposing which unlinked evidence items probably belong to which allegation, based on the evidence's name/type alone — you cannot read file contents. Only propose a link where the name/type gives a real reason to connect it to a specific allegation; skip anything ambiguous rather than guessing. These are proposals only — the HR user must confirm or correct every one. Respond ONLY with valid JSON, no other text: [{\"evidenceIndex\":0,\"allegationId\":\"alg_...\",\"stance\":\"supports\",\"reasoning\":\"one short sentence\"}] — stance must be one of supports, contradicts, context, neutral.",
        messages:[{role:"user", content:"ALLEGATIONS:\n"+allegationList+"\n\nUNLINKED EVIDENCE:\n"+evidenceList}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const valid = (Array.isArray(parsed)?parsed:[]).filter(s=>unlinked.some(ev=>ev.index===s.evidenceIndex) && caseAllegations.some(a=>a.id===s.allegationId));
      setEvidenceSuggestions(s=>({...s, [cs.id]:valid}));
    } catch(e) { console.error("generateEvidenceSuggestions", e); if(!silent) showToast("Couldn't generate evidence suggestions — "+e.message, "error"); }
    if(!silent) setEvidenceSuggestionsLoading(l=>({...l, [cs.id]:false}));
  };

  const acceptEvidenceSuggestion = (cs, suggestion) => {
    saveCases(cases.map(x=>x.id===cs.id?{...x, evidence:linkEvidenceToAllegation(x.evidence||[], suggestion.evidenceIndex, suggestion.allegationId, suggestion.stance)}:x));
    setEvidenceSuggestions(s=>({...s, [cs.id]:(s[cs.id]||[]).filter(sug=>sug!==suggestion)}));
  };

  const rejectEvidenceSuggestion = (cs, suggestion) => {
    setEvidenceSuggestions(s=>({...s, [cs.id]:(s[cs.id]||[]).filter(sug=>sug!==suggestion)}));
  };

  // ── Intelligent Document Ingestion (Phase 7) ──
  // Findings are session-local only (documentFindings), same posture as
  // caseOverview/caseChatHistory — nothing is written anywhere until a
  // specific finding is accepted, and each finding type dispatches to an
  // existing write path rather than a new one: a witness/action finding
  // becomes an ordinary case_task (lib/caseTasks.js), an allegation_link
  // finding reuses Phase 6's own linkEvidenceToAllegation, and an
  // inconsistency finding becomes a process_risk... no, an
  // "inconsistency"-type case_signal (Phase 0/3's substrate) with a
  // sourceRef back to this exact evidence item. There's no standalone
  // "people record" or manual timeline-entry concept anywhere else in
  // this app (People/Timeline are both fully derived views — see
  // lib/casePeople.js/lib/caseTimeline.js) to write those two finding
  // shapes from the original spec into, so this deliberately only
  // implements the four finding types that map onto something that
  // already exists.
  const [documentFindings, setDocumentFindings] = useState({}); // `${caseId}::${evidenceIndex}` -> [{id,type,...,status}]
  const [documentAnalysisLoading, setDocumentAnalysisLoading] = useState({});

  const analyseEvidenceDocument = async (cs, evidenceIndex) => {
    const ev = (cs.evidence||[])[evidenceIndex];
    if(!ev || !canAnalyseEvidence(ev)) return;
    const content = buildAnalysisContent(ev);
    if(!content) return;
    const key = `${cs.id}::${evidenceIndex}`;
    setDocumentAnalysisLoading(l=>({...l, [key]:true}));
    try {
      const caseAllegations = allegationsForCase(allegations, cs.id);
      const knownPeople = derivePeopleForCase(cs).map(p=>p.name);
      const allegationList = caseAllegations.length ? caseAllegations.map(a=>`- id "${a.id}": ${a.title}`).join("\n") : "None recorded on this case.";
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:700,
        stream:false,
        system:"You are Compass, an Employee Relations copilot analysing a document just uploaded as evidence on an HR case. Read its actual content — you are given the real file, not just its name — and extract findings for the case handler to review and decide on; never act on them yourself. Only include a finding where the document's actual content clearly supports it — never invent a generic one just to have something to report. Valid finding types: \"witness\" (a person mentioned who is NOT already in the known-people list below and might need to be interviewed — give their exact name), \"allegation_link\" (the document relates to one of the case's existing allegations — give its id and whether the document supports, contradicts, or gives context), \"inconsistency\" (the document appears to conflict with something else already described to you), \"action\" (a concrete follow-up step the document's content suggests). Respond ONLY with valid JSON, no other text: [{\"type\":\"witness\",\"name\":\"...\",\"reasoning\":\"...\"}] or [{\"type\":\"allegation_link\",\"allegationId\":\"...\",\"stance\":\"supports\",\"reasoning\":\"...\"}] or [{\"type\":\"inconsistency\",\"description\":\"...\",\"reasoning\":\"...\"}] or [{\"type\":\"action\",\"description\":\"...\",\"reasoning\":\"...\"}] — stance must be one of supports, contradicts, context.",
        messages:[{role:"user", content:[
          {type:"text", text:`CASE: ${cs.employeeName} (${cs.caseType||"HR matter"})\n\nKNOWN PEOPLE ALREADY ON THIS CASE: ${knownPeople.join(", ")||"None recorded"}\n\nEXISTING ALLEGATIONS:\n${allegationList}\n\nDOCUMENT TO ANALYSE ("${ev.name}"):`},
          content,
        ]}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const validTypes = ["witness","allegation_link","inconsistency","action"];
      const findings = (Array.isArray(parsed)?parsed:[])
        .filter(f=>validTypes.includes(f.type) && (f.type!=="allegation_link" || caseAllegations.some(a=>a.id===f.allegationId)))
        .map((f,i)=>({...f, id:`finding_${Date.now()}_${i}`, status:"open"}));
      setDocumentFindings(s=>({...s, [key]:findings}));
      if(!findings.length) showToast("Compass found nothing to flag in this document");
    } catch(e) { console.error("analyseEvidenceDocument", e); showToast("Couldn't analyse the document — "+e.message, "error"); }
    setDocumentAnalysisLoading(l=>({...l, [key]:false}));
  };

  const acceptDocumentFinding = (cs, evidenceIndex, finding) => {
    const key = `${cs.id}::${evidenceIndex}`;
    if(finding.type==="witness") {
      createCaseTask(cs.id, {name:`Interview ${finding.name} as a potential witness`});
    } else if(finding.type==="action") {
      createCaseTask(cs.id, {name:finding.description});
    } else if(finding.type==="allegation_link") {
      saveCases(cases.map(x=>x.id===cs.id?{...x, evidence:linkEvidenceToAllegation(x.evidence||[], evidenceIndex, finding.allegationId, finding.stance)}:x));
    } else if(finding.type==="inconsistency") {
      const ev = (cs.evidence||[])[evidenceIndex];
      const created = createSignal(caseSignals, cs.id, {
        type:"inconsistency", title:"Potential inconsistency: "+(ev?.name||"uploaded document"),
        reasoning:finding.description+(finding.reasoning?" — "+finding.reasoning:""),
        sourceRefs:[{kind:"evidence", id:evidenceIndex, label:ev?.name}],
        source:"ai",
      });
      setCaseSignals(created);
      saveSignalToDB(created[created.length-1]);
    }
    setDocumentFindings(s=>({...s, [key]:(s[key]||[]).map(f=>f.id===finding.id?{...f,status:"accepted"}:f)}));
  };

  const dismissDocumentFinding = (cs, evidenceIndex, finding) => {
    const key = `${cs.id}::${evidenceIndex}`;
    setDocumentFindings(s=>({...s, [key]:(s[key]||[]).map(f=>f.id===finding.id?{...f,status:"dismissed"}:f)}));
  };

  // ── Email integration groundwork (Phase 24) ──
  // The manual half of a flow designed so a later webhook adapter (Graph
  // mail push / Gmail push) can feed the same pipeline once OAuth
  // credentials exist — see lib/emailIngestion.js. Nothing is saved until
  // saveEmailToCase() is called explicitly; extraction alone never writes
  // anything, same "review before write" posture as Phase 7.
  const [emailExtraction, setEmailExtraction] = useState(null);
  const [emailExtractionLoading, setEmailExtractionLoading] = useState(false);

  const extractEmailDetails = async (rawText) => {
    if(!rawText?.trim()) return;
    setEmailExtractionLoading(true);
    setEmailExtraction(null);
    try {
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:400,
        stream:false,
        system:"You are Compass, an Employee Relations copilot extracting structured details from a pasted email so it can be filed to the right case. Read the content given and extract: the sender, the subject, the date (if mentioned or inferable, in DD/MM/YYYY), which named employee this email is actually about (may differ from the sender or recipient — look for who the content concerns, not just who wrote it), and a one-sentence neutral summary. Respond ONLY with valid JSON, no other text: {\"sender\":null,\"subject\":null,\"date\":null,\"employeeName\":null,\"summary\":null} — use null (not a guess) for anything you can't actually determine from the content.",
        messages:[{role:"user", content:rawText.slice(0,8000)}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const matchedCase = parsed.employeeName ? matchCaseByEmployeeName(cases, parsed.employeeName) : null;
      setEmailExtraction({...parsed, rawText, matchedCaseId:matchedCase?.id||null});
    } catch(e) { console.error("extractEmailDetails", e); showToast("Couldn't read that email — "+e.message, "error"); }
    setEmailExtractionLoading(false);
  };

  const saveEmailToCase = (caseId) => {
    if(!emailExtraction) return;
    const item = buildEmailEvidenceItem({sender:emailExtraction.sender, subject:emailExtraction.subject, date:emailExtraction.date, body:emailExtraction.rawText, addedBy:currentUser?.name||"HR Manager"});
    saveCases(cases.map(x=>x.id===caseId?{...x, evidence:[...(x.evidence||[]), item]}:x), caseId);
    audit("Email saved to case", item.name, caseId);
    showToast("Email saved to the case's evidence");
    setEmailExtraction(null);
    setActiveCaseId(caseId);
    setActiveCaseStage("investigation");
    setScreen(SCREENS.CASE_VIEW);
  };

  // ── Outlook mail connection (Phase 24 follow-up) ──
  // Delegated OAuth to the signed-in user's own Outlook inbox — same
  // architecture as the Google Calendar connection above (api/graph-mail/*
  // mirrors api/calendar/*). Never pulls or files mail automatically:
  // picking a message just fetches its text and runs it through the same
  // extractEmailDetails()/saveEmailToCase() review-then-confirm pipeline a
  // pasted email already uses.
  const [mailConnected, setMailConnected] = useState(false);
  const [mailboxEmail, setMailboxEmail] = useState(null);
  const [inboxMessages, setInboxMessages] = useState(null);
  const [inboxLoading, setInboxLoading] = useState(false);
  useEffect(() => {
    if(!user?.id) return;
    authedFetch(`/api/graph-mail/status`)
      .then(r=>r.json()).then(d=>{ setMailConnected(!!d.connected); setMailboxEmail(d.mailbox||null); }).catch(()=>{});
  }, [user?.id]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mailParam = params.get("mail");
    if(!mailParam) return;
    if(mailParam==="connected") { setMailConnected(true); showToast("Outlook connected"); }
    else if(mailParam==="error") { showToast("Couldn't connect Outlook — please try again"); }
    params.delete("mail");
    const newUrl = window.location.pathname + (params.toString()?"?"+params.toString():"");
    window.history.replaceState({}, "", newUrl);
  }, []);
  const connectOutlookMail = async () => {
    if(!user?.id || !org?.id) return;
    try {
      const res = await authedFetch(`/api/graph-mail/oauth-start?orgId=${encodeURIComponent(org.id)}`);
      const data = await res.json();
      if(data.url) window.location.href = data.url;
      else showToast(data.error||"Couldn't start Outlook connection", "error");
    } catch(e) { showToast("Couldn't start Outlook connection", "error"); }
  };
  const disconnectOutlookMail = async () => {
    if(!user?.id) return;
    try {
      await authedFetch("/api/graph-mail/disconnect", { method: "POST", headers: {"Content-Type":"application/json"} });
      setMailConnected(false); setMailboxEmail(null); setInboxMessages(null);
      showToast("Outlook disconnected");
    } catch(e) { showToast("Couldn't disconnect — please try again"); }
  };
  const loadInboxMessages = async () => {
    setInboxLoading(true);
    try {
      const res = await authedFetch("/api/graph-mail/list-messages");
      const data = await res.json();
      if(res.ok) setInboxMessages(data.messages||[]);
      else showToast(data.error||"Couldn't load your inbox", "error");
    } catch(e) { showToast("Couldn't load your inbox", "error"); }
    setInboxLoading(false);
  };
  const pickInboxMessage = async (messageId) => {
    try {
      const res = await authedFetch(`/api/graph-mail/get-message?messageId=${encodeURIComponent(messageId)}`);
      const data = await res.json();
      if(res.ok && data.rawText) extractEmailDetails(data.rawText);
      else showToast(data.error||"Couldn't read that email", "error");
    } catch(e) { showToast("Couldn't read that email", "error"); }
  };

  // ── Case Chronology overrides ──
  // buildCaseTimeline() (lib/caseTimeline.js) is still the single source
  // of the merge; these three just write to the case's own
  // timeline_overrides column, which that function already knows how to
  // apply — no separate override-handling logic duplicated here.
  const toggleTimelineExclude = (cs, key) => {
    const current = cs.timelineOverrides || {};
    const excluded = current.excluded || [];
    const nextExcluded = excluded.includes(key) ? excluded.filter(k=>k!==key) : [...excluded, key];
    saveCases(cases.map(x=>x.id===cs.id?{...x, timelineOverrides:{...current, excluded:nextExcluded}}:x));
  };

  const editTimelineDescription = (cs, key, text) => {
    const current = cs.timelineOverrides || {};
    saveCases(cases.map(x=>x.id===cs.id?{...x, timelineOverrides:{...current, edits:{...(current.edits||{}), [key]:text}}}:x));
  };

  const generateTimelineRelevance = async (cs) => {
    const entries = buildCaseTimeline(cs, allegations, auditLog, cs.timelineOverrides||{});
    if(!entries.length) return;
    setTimelineRelevanceLoading(l=>({...l, [cs.id]:true}));
    try {
      const entryList = entries.map(e=>`- key "${e.key}": ${e.description} (${e.date})`).join("\n");
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:800,
        stream:false,
        system:"You are Compass, an Employee Relations copilot. For each timeline entry below, write one short sentence on why it matters to this case's progress — not a restatement of the entry itself. Skip routine/administrative entries that add no real understanding rather than inventing significance for them. Respond ONLY with valid JSON, no other text: {\"key1\":\"relevance sentence\", ...} — only include keys worth annotating.",
        messages:[{role:"user", content:"TIMELINE:\n"+entryList}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const current = cs.timelineOverrides || {};
      saveCases(cases.map(x=>x.id===cs.id?{...x, timelineOverrides:{...current, relevance:{...(current.relevance||{}), ...parsed}}}:x));
    } catch(e) { console.error("generateTimelineRelevance", e); showToast("Couldn't assess timeline relevance — "+e.message, "error"); }
    setTimelineRelevanceLoading(l=>({...l, [cs.id]:false}));
  };

  // ── Onboarding steps ──
  const ONBOARD_STEPS = [
    { title:"Welcome to Compass", body:"Compass is your AI-powered HR meeting platform. It handles every stage of an HR meeting — from preparation through to outcome letters and case management.", action:"Next" },
    { title:"Start a meeting", body:"Choose a meeting type from the home screen. Formal meetings (disciplinary, grievance etc.) and development meetings (appraisals, probation, PDP) each have their own tailored flow.", action:"Next" },
    { title:"Prepare", body:"Enter the employee details and Compass builds a preparation pack — agenda, suggested questions, legal checklist, and risk flags — all referencing your uploaded company policies.", action:"Next" },
    { title:"Record", body:"During the meeting, type or speak what's said. Compass automatically identifies who is speaking and logs each utterance. You can also import transcripts from Teams, Meet, or Zoom.", action:"Next" },
    { title:"Structure & risk score", body:"Click 'End meeting' and Compass produces a structured meeting record and legal risk assessment. It flags Equality Act, ACAS Code, and ERA 1996 exposure with specific recommendations.", action:"Next" },
    { title:"Letters & case files", body:"Draft outcome letters with one click. Save everything to a case file — transcripts, records, risk scores, next steps, and letters are all stored together per employee.", action:"Next" },
    { title:"Upload your policies", body:"Go to Settings → Company policies and upload your HR policies (.docx or .txt). Compass will reference them in every AI output — so advice is tailored to your organisation.", action:"Get started" },
  ];

  // First use — GDPR consent is mandatory. The deeper feature-walkthrough
  // tour (showOnboard) is no longer auto-triggered: OnboardingWizard
  // already covers first-run welcome, and forcing both back-to-back added
  // up to 11+ screens before a brand-new signup ever reached the app. The
  // tour stays available on demand via "Restart tour" in Settings.
  useEffect(() => {
    if(!gdprAccepted) setShowGdpr(true);
  }, []);

  // Autosave the in-progress meeting to localStorage — transcript/inputText
  // were plain React state with zero persistence, meaning a crashed tab or
  // dead laptop 40 minutes into a real disciplinary hearing lost everything
  // typed, with no warning. This writes on every change while the meeting
  // is actually in progress, and is cleared once handleReview() picks the
  // transcript up (see there) or the meeting is explicitly discarded (see
  // cancelMeeting in RecordScreen.jsx).
  useEffect(() => {
    if(screen !== SCREENS.RECORD) return;
    const hasContent = transcript.length > 0 || inputText.trim();
    if(!hasContent) { lsSet("compass_meeting_draft", null); return; }
    lsSet("compass_meeting_draft", {
      transcript, inputText, meetingType, caseInfo, meetingStartTime, meetingEndTime, adjournments, participants, prepNotes, prepQuestions,
      savedAt: new Date().toISOString(),
    });
  }, [screen, transcript, inputText, meetingType, caseInfo, meetingStartTime, meetingEndTime, adjournments, participants, prepNotes, prepQuestions]);

  // Warn on accidental tab close/refresh mid-meeting — the in-app "← Back"
  // button already confirms via cancelMeeting, but that doesn't cover
  // closing the tab or browser directly.
  useEffect(() => {
    const handler = (e) => {
      if(screen === SCREENS.RECORD && (transcript.length > 0 || inputText.trim())) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [screen, transcript, inputText]);

  // Once, on load: offer to resume a meeting that never made it past the
  // crash-recovery window above.
  useEffect(() => {
    const draft = ls("compass_meeting_draft", null);
    if(!draft) return;
    (async () => {
      const ok = await confirmDialog({
        title: "Resume unsaved meeting?",
        message: `Compass found meeting notes for ${draft.caseInfo?.employee || "an employee"} that never got saved (from ${draft.savedAt ? new Date(draft.savedAt).toLocaleString("en-GB") : "earlier"}). Resume where you left off, or discard them?`,
        confirmLabel: "Resume",
        cancelLabel: "Discard",
      });
      if(ok) {
        setTranscript(draft.transcript || []);
        setInputText(draft.inputText || "");
        if(draft.meetingType) setMeetingType(draft.meetingType);
        if(draft.caseInfo) setCaseInfo(draft.caseInfo);
        setMeetingStartTime(draft.meetingStartTime || null);
        setMeetingEndTime(draft.meetingEndTime || null);
        setAdjournments(draft.adjournments || []);
        setParticipants(draft.participants || []);
        setPrepNotes(draft.prepNotes || "");
        setPrepQuestions(draft.prepQuestions || []);
        setScreen(SCREENS.RECORD);
      } else {
        lsSet("compass_meeting_draft", null);
      }
    })();
  }, []);

  // Audit session starts
  useEffect(() => {
    if(currentUser) audit("Session started", `User: ${currentUser.name} (${currentUser.role})`);
  }, [currentUser]);

  // ── Policy context ──
  // Phase 11 — grouped by category (blank/"other" policies still included,
  // just unlabelled by area) so a consumer prompt can cite "your
  // Disciplinary Policy" specifically rather than an undifferentiated
  // policy blob. The distinguish-company-policy-from-guidance instruction
  // lives here, once, since every AI call site already goes through this
  // single function rather than each needing its own wording.
  const getPolicyCtx = () => {
    if(!policies.length) return "";
    const byCategory = POLICY_CATEGORIES.map(cat => ({
      cat, items: policies.filter(p => (p.category||"other")===cat.id),
    })).filter(g => g.items.length);
    const body = byCategory.map(g =>
      `[${g.cat.label}]\n` + g.items.map(p=>`--- ${p.name} ---\n${p.content}`).join("\n\n")
    ).join("\n\n");
    return "\n\nCOMPANY POLICIES (grouped by area — cite these specifically as \"your company [X] policy\" when relied on. Always keep three things visibly distinct in your answer: company policy (what these documents say), general Compass guidance (standard HR/ACAS practice where no policy is provided), and legal/regulatory guidance (UK employment law) — never state or imply that a company policy is itself the law):\n" + body.slice(0,12000);
  };

  const changePolicyCategory = (policyId, category) => {
    setPolicies(p=>{const u=p.map(x=>x.id===policyId?{...x,category}:x);lsSet("compass_policies",u);return u;});
  };

  // ── Speech ──
  const startSpeech = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) return;
    const rec = new SR(); rec.continuous=true; rec.interimResults=true; rec.lang="en-GB";
    let buf="";
    rec.onresult = e => { let interim=""; for(let i=e.resultIndex;i<e.results.length;i++) { if(e.results[i].isFinal) buf+=e.results[i][0].transcript+" "; else interim=e.results[i][0].transcript; } setInputText(buf+interim); };
    rec.onend = () => { if(buf.trim()) { addUtterance(buf.trim()); buf=""; setInputText(""); } setIsListening(false); };
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec; rec.start(); setIsListening(true);
  }, []);
  const stopSpeech = () => { if(recognitionRef.current) recognitionRef.current.stop(); setIsListening(false); };

  // ── Screen capture ──
  const startScreenCapture = async () => {
    try {
      setScreenStatus("Requesting screen share — select meeting window and tick 'Share audio'...");
      const stream = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:{ echoCancellation:false, noiseSuppression:false } });
      screenStreamRef.current = stream;
      const audioTracks = stream.getAudioTracks();
      if(!audioTracks.length) { stream.getTracks().forEach(t=>t.stop()); setScreenStatus("No audio detected — tick 'Share audio' when sharing."); return; }
      setIsScreenCapturing(true); setScreenStatus("Capturing meeting audio...");
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if(SR) {
        const rec = new SR(); rec.continuous=true; rec.interimResults=false; rec.lang="en-GB";
        let buf="";
        rec.onresult = e => { for(let i=e.resultIndex;i<e.results.length;i++) { if(e.results[i].isFinal) { buf+=e.results[i][0].transcript+" "; if(buf.trim().split(" ").length>=8) { addUtterance(buf.trim()); buf=""; } } } };
        screenRecRef.current = rec; rec.start();
      }
      stream.getVideoTracks()[0].addEventListener("ended", () => stopScreenCapture());
    } catch(e) { setScreenStatus(e.name==="NotAllowedError"?"Permission denied.":"Could not start: "+e.message); setIsScreenCapturing(false); }
  };
  const stopScreenCapture = () => {
    if(screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t=>t.stop()); screenStreamRef.current=null; }
    if(screenRecRef.current) { try{screenRecRef.current.stop();}catch(e){} screenRecRef.current=null; }
    setIsScreenCapturing(false); setScreenStatus("Capture stopped.");
  };

  // ── Import transcript ──
  const handleImportFile = e => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      let text = ev.target.result;
      text = text.replace(/WEBVTT\n?/g,"").replace(/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*.+$/gm,"").replace(/^\d+\s*$/gm,"").replace(/\n{3,}/g,"\n\n").trim();
      setImportText(text);
    };
    reader.readAsText(file);
  };
  const handleImportSubmit = async () => {
    if(!importText.trim()) return;
    const chunks = importText.split("\n\n").filter(c=>c.trim().length>10);
    for(const chunk of chunks) await addUtterance(chunk.trim());
    setImportText("");
  };

  // ── Auto-attribute utterance ──
  const addUtterance = async text => {
    if(!text||!text.trim()) return;
    const raw = text.trim(); setInputText(""); if(inputRef.current) inputRef.current.focus();
    const pendingId = Date.now()+Math.random();
    const ts = new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    setTranscript(p=>[...p,{id:pendingId, speaker:"...", text:raw, ts, pending:true}]);
    try {
      const knownSpeakers = [
        `"${caseInfo.manager||"HR Manager"}" (chair)`,
        `"${caseInfo.employee||"Employee"}" (employee)`,
        ...(caseInfo.representative ? [`"${caseInfo.representative}" (representative/companion)`] : []),
        ...participants.map(p=>`"${p.name}" (${p.role})`),
      ];
      const result = await streamClaude(
        `UK HR meeting transcription. Known speakers: ${knownSpeakers.join(", ")}. Attribute each utterance to whichever of these speakers actually said it. Return JSON only: [{"speaker":"NAME","text":"..."}]. Use exact names.`,
        `Meeting: ${meetingType?.label||"HR"}\nEmployee: ${caseInfo.employee}\nRecent:\n${transcript.slice(-5).filter(u=>!u.pending).map(u=>u.speaker+": "+u.text).join("\n")}\nNew: "${raw}"`,
        ()=>{}
      );
      const parsed = JSON.parse(result.replace(/```json|```/g,"").trim());
      const items = parsed.map((u,i)=>({id:i===0?pendingId:Date.now()+Math.random(), speaker:u.speaker, text:u.text, ts, aiAttributed:true}));
      setTranscript(p=>{const w=p.filter(u=>u.id!==pendingId); return [...w,...items];});
    } catch(e) {
      setTranscript(p=>p.map(u=>u.id===pendingId?{...u,speaker:caseInfo.manager||"HR Manager",pending:false}:u));
    }
  };
  const handleKeyDown = e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addUtterance(inputText);} };

  // ── Session management ──
  const startSession = type => {
    meetingEndedRef.current = false;
    appealDetectedRef.current = false;
    setAppealDetected(false);
    setShowLinkCase(false);
    setMeetingStartTime(null);
    setMeetingEndTime(null);
    setMeetingType(type); setTranscript([]); setPrepNotes(""); setPrepQuestions([]); setMeetingEvidenceSuggestions([]); setMeetingActionSuggestions([]); setReviewOutput(""); setReviewOutputOriginal(""); setMeetingSummary(""); setLetterOutput(""); setLetterHistory([]);
    setRiskScore(null); setPrediction(""); setNextSteps([]); setParticipants([]);
    if(type && type.group === "dev") {
      const config = DEV_MEETING_CONFIG[type.label];
      setDevSession({
        type: type.label, config,
        caseInfo:{ employee:"", date:"", manager:"", email:"", role:"", department:"", reviewPeriod:"" },
        selfAssessment:{}, managerAssessment:{},
        objectives: config?.objectives?.map(o=>({...o, rating:3, progress:"", note:""})) || [],
        outcome:"", rating:"", devPlan:"", aiSummary:"",
      });
      setDevStep("self"); setDevSummary(""); setDevLetter("");
      setScreen(SCREENS.DEVELOP);
    } else {
      setScreen(SCREENS.PREP);
    }
  };

  const reset = () => {
    startSession(null); setMeetingType(null); setCaseInfo({employee:"",date:"",manager:"",context:"",email:""});
    setCaptureMode("type"); setIsScreenCapturing(false); setScreenStatus(""); setImportText("");
    stopSpeech(); stopScreenCapture(); setScreen(SCREENS.HOME);
  };

  // Meeting Intelligence Phase 2 (M1) — a second, non-streaming call
  // alongside the free-text prep pack, producing an editable, structured
  // question list. Kept separate from the streamClaude call above rather
  // than embedded in the markdown: interleaving a JSON block into a
  // streaming response would flash raw JSON into the visible prep pack
  // while it's still generating, and every other structured-output call in
  // this codebase (extractEmailDetails, generateNextBestAction, etc.)
  // already uses this same plain non-streaming JSON pattern.
  const generatePrepQuestions = async (carriedContext) => {
    try {
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:2000,
        stream:false,
        system:"You are a senior UK HR advisor preparing structured questions for an upcoming Employee Relations meeting. Respond ONLY with valid JSON, no other text: [{\"text\":\"...\",\"category\":\"agenda\"|\"evidence\"|\"clarification\"|\"unanswered\",\"essential\":true|false,\"reasoning\":\"...\"}] — produce 5 to 12 concise, specific questions. Mark essential true only for questions central to the core issue(s) being addressed. reasoning is one short sentence explaining why this particular question matters, grounded in the background given — this is shown to the user as \"Why ask this?\".",
        messages:[{role:"user", content:`Meeting: ${meetingType.label}. Employee: ${caseInfo.employee}. Background: ${caseInfo.context||"None"}.${carriedContext?"\n\n"+carriedContext:""}`}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setPrepQuestions((Array.isArray(parsed)?parsed:[]).map((q,i)=>({
        id: "pq_"+Date.now()+"_"+i,
        text: q.text||"",
        category: q.category||"general",
        essential: !!q.essential,
        reasoning: q.reasoning||"",
        linkedAllegationId: null,
        linkedEvidenceIndex: null,
        source: "ai",
        status: "not_asked",
        statusSource: "ai",
      })).filter(q=>q.text.trim()));
    } catch(e) { console.error("generatePrepQuestions", e); }
  };

  // ── AI: Prepare ──
  // Manager Enablement (Phase 4, MP13, §10 first half) — this pre-dates
  // the phase (PrepScreen/handlePrepare already existed) but already
  // covered nearly all of the spec's own pre-meeting-brief list —
  // Objectives≈purpose, Key Questions≈questions, Evidence to
  // Explore≈evidence requiring clarification, Unanswered Issues≈
  // outstanding issues. Only Opening Script and Closing Points were
  // missing, added here as two more ## sections rather than building a
  // parallel screen: PrepScreen.jsx renders prepNotes through MDRenderer
  // generically, so any ## section in this prompt appears with zero UI
  // changes. Applies to every meeting type this screen already serves,
  // not just investigations — the spec frames this around investigation
  // meetings specifically, but there's no reason a disciplinary or
  // grievance chair should get a worse-equipped prep pack.
  const handlePrepare = async () => {
    if(!caseInfo.employee.trim()) return;
    setAiError(""); setAiProcessing(true); setPrepQuestions([]);
    try {
      // When this meeting is linked to an existing case, surface what
      // Phases 2/3 already found (open unanswered_question / inconsistency
      // signals) as prep context — not fresh AI reasoning, just carrying
      // forward what Compass already knows about this case into the
      // sections the meeting is actually being prepared for.
      const linkedCaseId = caseInfo._linkedCaseId;
      const openQuestions = linkedCaseId ? openSignalsForCase(caseSignals, linkedCaseId, "unanswered_question") : [];
      const openInconsistencies = linkedCaseId ? openSignalsForCase(caseSignals, linkedCaseId, "inconsistency") : [];
      const carriedContext = [
        openQuestions.length ? "Unanswered questions already identified on this case:\n"+openQuestions.map(q=>"- "+q.title).join("\n") : null,
        openInconsistencies.length ? "Potential inconsistencies already identified on this case:\n"+openInconsistencies.map(s=>"- "+s.title+(s.reasoning?" — "+s.reasoning:"")).join("\n") : null,
      ].filter(Boolean).join("\n\n");
      await Promise.all([
        streamClaude(
          `Senior UK HR advisor specialising in UK employment law. Use ## for section headers and - for bullet points. Do not use ** for bold, do not use emoji, do not use markdown tables. Write in plain clear English with ## headers and - bullets only.${policies.length?" Reference company policies where relevant.":""}`,
          `Prepare for ${meetingType.label}. Employee: ${caseInfo.employee}. Date: ${caseInfo.date||"TBD"}. Chair: ${caseInfo.manager||"TBC"}. Background: ${caseInfo.context||"None"}. Participants: ${participants.map(p=>p.name+" ("+p.role+")").join(", ")||"HR Manager, Employee"}${getPolicyCtx()}${carriedContext?"\n\n"+carriedContext:""}\n\n## Objectives\n## Agenda\n## Opening Script\n## Key Questions\n## Evidence to Explore\n## Unanswered Issues\n## Potential Inconsistencies\n## Closing Points\n## Legal Checklist\n## Risk Flags${carriedContext?"\n\nFor Unanswered Issues and Potential Inconsistencies, use the items listed above as a starting point (rephrased as prep guidance) rather than re-deriving them from scratch — add any further ones only if the background/context clearly supports them.":""}\n\nFor Opening Script, write actual words the chair could read aloud to open the meeting professionally (introductions, purpose, right to be accompanied where relevant) — a real script, not a bullet-point agenda restated. For Closing Points, list what the chair should cover before ending: next steps, what happens next and by when, and confirming the employee has nothing further to add.`,
          t=>setPrepNotes(t)
        ),
        generatePrepQuestions(carriedContext),
      ]);
    } catch(e) { setAiError(e.message); }
    setAiProcessing(false);
  };

  // ── Pre-meeting question list editing (M1) — thin wrappers over the pure
  // helpers in lib/prepQuestions.js; no DB persistence of their own, the
  // list travels with the meeting draft and is saved as part of the
  // meeting record once the meeting itself saves. ──
  const addPrepQuestion = () => setPrepQuestions(qs => addPrepQuestionHelper(qs));
  const updatePrepQuestionText = (id, text) => setPrepQuestions(qs => updatePrepQuestionTextHelper(qs, id, text));
  const removePrepQuestion = (id) => setPrepQuestions(qs => removePrepQuestionHelper(qs, id));
  const movePrepQuestion = (id, direction) => setPrepQuestions(qs => movePrepQuestionHelper(qs, id, direction));
  const togglePrepQuestionEssential = (id) => setPrepQuestions(qs => togglePrepQuestionEssentialHelper(qs, id));
  const linkPrepQuestionToAllegation = (id, allegationId) => setPrepQuestions(qs => linkPrepQuestionToAllegationHelper(qs, id, allegationId));
  const linkPrepQuestionToEvidence = (id, evidenceIndex) => setPrepQuestions(qs => linkPrepQuestionToEvidenceHelper(qs, id, evidenceIndex));
  // Manual status override (M2) — always source:"user", so
  // updateMeetingIntelligence's next live pass leaves this question alone
  // rather than silently reverting the user's own correction.
  const setPrepQuestionStatus = (id, status) => setPrepQuestions(qs => setPrepQuestionStatusHelper(qs, id, status, "user"));

  // M9 — Meeting Quality Check. Fully deterministic, no AI call — reuses
  // exactly what M1/M3/M4 already computed rather than re-deriving an
  // approximation (same discipline as Case Readiness). Mirrors
  // handleReview's own pattern of combining transcript state with
  // whatever's still sitting in inputText directly, rather than trusting
  // transcript to already reflect it — the same stale-closure shape found
  // and fixed in runRiskScore earlier this session.
  const computeMeetingQualityGaps = () => {
    const fullText = (transcript.map(u=>u.text).join(" ") + " " + inputText).toLowerCase();
    const gaps = [];

    prepQuestions.filter(q=>q.essential && q.status==="not_asked").forEach(q => {
      gaps.push(`Essential question not yet asked: "${q.text}"`);
    });

    meetingEvidenceSuggestions.filter(s=>s.status==="pending").forEach(s => {
      gaps.push((s.kind==="witness"?"Potential witness":"Evidence")+" mentioned but not yet actioned: "+s.description);
    });

    meetingActionSuggestions.filter(s=>s.status==="pending").forEach(s => {
      gaps.push("Action identified but not yet actioned: "+s.description);
    });

    const linkedCase = cases.find(c=>c.id===caseInfo._linkedCaseId) || cases.find(c=>c.employeeName.toLowerCase()===caseInfo.employee.trim().toLowerCase());
    if(linkedCase) {
      allegationsForCase(allegations, linkedCase.id).forEach(a => {
        const words = (a.title||"").toLowerCase().split(/\W+/).filter(w=>w.length>3);
        if(!words.length) return;
        const matched = words.filter(w=>fullText.includes(w));
        if(matched.length < Math.ceil(words.length/2)) gaps.push(`Allegation not discussed in this meeting: "${a.title}"`);
      });
    }
    return gaps;
  };

  // Never blocking — RecordScreen's "End meeting" always calls this
  // instead of handleReview directly; if there's nothing to flag it goes
  // straight through with no extra step, same as before this phase.
  const attemptEndMeeting = () => {
    const gaps = computeMeetingQualityGaps();
    if(gaps.length) { setQualityCheckGaps(gaps); setShowQualityCheck(true); }
    else handleReview();
  };
  // P1 — proceeding past an unresolved gap is exactly the kind of
  // significant override requestOverrideReason exists for: the modal
  // closes immediately (no stacked modals), then an optional-reason
  // prompt takes its place. Cancelling that prompt cancels the whole
  // "proceed" action — the user's left back on the meeting, same end
  // state as clicking "Return to meeting" would have given them.
  const proceedPastQualityCheck = async () => {
    setShowQualityCheck(false);
    const linkedCase = cases.find(c=>c.id===caseInfo._linkedCaseId) || cases.find(c=>c.employeeName.toLowerCase()===caseInfo.employee.trim().toLowerCase());
    const ok = await requestOverrideReason(qualityCheckGaps.join("; "), { caseId: linkedCase?.id, actionLabel: "Ended meeting despite quality check gaps" });
    if(!ok) return;
    handleReview();
  };
  const createQualityCheckFollowUp = () => {
    const linkedCase = cases.find(c=>c.id===caseInfo._linkedCaseId) || cases.find(c=>c.employeeName.toLowerCase()===caseInfo.employee.trim().toLowerCase());
    if(linkedCase) createCaseTask(linkedCase.id, { name:"Follow up on: "+qualityCheckGaps.join("; ") });
    else showToast("Noted — save this meeting to a case to turn it into a task");
    setShowQualityCheck(false);
    handleReview();
  };

  // ── AI: Review + Risk ──
  const handleReview = async () => {
    meetingEndedRef.current = false;
    appealDetectedRef.current = false;
    setAppealDetected(false);
    setShowLinkCase(false);
    const meetingEndTimeVal = new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
    setMeetingEndTime(meetingEndTimeVal);
    const extra = inputText.trim() ? [{id:Date.now(),speaker:"Note",text:inputText.trim(),ts:"",pending:false}] : [];
    const allNotes = [...transcript, ...extra];
    if(!allNotes.length) return;
    if(extra.length) { setTranscript(allNotes); setInputText(""); }
    setScreen(SCREENS.REVIEW); setReviewOutput(""); setReviewOutputOriginal(""); setMeetingSummary(""); setAiError(""); setRiskScore(null); setPrediction("");
    setAiProcessing(true);
    // Generate next steps deadlines
    lsSet("compass_meeting_draft", null); // transcript is now captured in the AI call in flight — the crash-recovery window has passed
    const baseDate = caseInfo.date ? new Date(caseInfo.date.split("/").reverse().join("-")) : new Date();
    const steps = (NEXT_STEPS_MAP[meetingType?.label] || []).map(s=>({ step:s.step, deadline:addWorkingDays(baseDate,s.days), done:false }));
    setNextSteps(steps);
    let fullRecord = "";
    try {
      const tx = allNotes.slice(-60).map(u=>u.text).join("\n");
          // Appeal detection
      const appealWords = ["appeal","original decision","grounds of appeal","outcome being appealed"];
      if(!appealDetectedRef.current && appealWords.some(w=>tx.toLowerCase().includes(w))){
        appealDetectedRef.current = true;
        setAppealDetected(true);
        setShowLinkCase(true);
      }
      // M10 — a second, short, distinct generation alongside the full
      // record: what actually matters for triage (key facts, disputed
      // points, allegation impact), not the full formatted dialogue. Kicked
      // off before awaiting the full record so both stream concurrently;
      // resolved with its own try/catch so a failure here never blocks or
      // taints the main record generation — this panel just stays empty.
      const linkedCaseForSummary = cases.find(c=>c.id===caseInfo._linkedCaseId) || cases.find(c=>c.employeeName.toLowerCase()===caseInfo.employee.trim().toLowerCase());
      const allegationTitlesForSummary = linkedCaseForSummary ? allegationsForCase(allegations, linkedCaseForSummary.id).map(a=>a.title) : [];
      const summaryPromise = streamClaude(
        `You are Compass, an Employee Relations copilot writing a short internal triage summary of a meeting — distinct from the full formal record, meant to be scanned in seconds by someone who wasn't in the room. Use concise bullet points under these headings only, in this order: ## Key Facts Established ## New Information ## Disputed Points ## Potential Inconsistencies ## New Witnesses or Evidence Mentioned ## Outstanding Questions ## Actions Required ## Potential Impact on Existing Allegations. Omit a heading entirely if it has nothing to report — never write "None" or leave a heading with no content. No preamble, no bold, no emoji, no tables.`,
        `${meetingType?.label} meeting. Employee: ${caseInfo.employee||"Unknown"}.${allegationTitlesForSummary.length?" Existing allegations on this case: "+allegationTitlesForSummary.join("; ")+".":""}\n\nTRANSCRIPT:\n${tx}`,
        t=>setMeetingSummary(t)
      ).catch(e=>{ console.error("Meeting summary generation failed:", e); return ""; });
      fullRecord = await streamClaude(
        `You are a senior UK HR documentation specialist. Generate a meeting record with EXACTLY these three sections and NO others: ## Meeting Details (date, type, attendees, purpose), ## Meeting Dialogue (what was said, in concise prose), ## HR Advisor Notes (expert legal guidance in flowing prose from a senior employment lawyer - one paragraph covering ACAS compliance, legal risks and recommended next steps). Do NOT add any other sections like Key Points, Next Steps, Summary, Actions, Risk Assessment or anything else. Three sections only. No bold, no emoji, no tables.${policies.length?" Reference company policies by name.":""} IMPORTANT: In the Meeting Dialogue section, prefix every line with initials only. Chair ${caseInfo.manager||"HR Manager"} = ${(caseInfo.manager||"HR Manager").split(" ").map(w=>w[0].toUpperCase()).join("")}. Employee ${caseInfo.employee||"Employee"} = ${(caseInfo.employee||"Employee").split(" ").map(w=>w[0].toUpperCase()).join("")}. Use ONLY these initials, never full names in the dialogue.`,
        `${meetingType?.label} meeting. Employee: ${caseInfo.employee}${caseInfo.employeeJobTitle?" ("+caseInfo.employeeJobTitle+")":(employeeRecords||[]).find(r=>r.name===caseInfo.employee)?.jobTitle?" ("+((employeeRecords||[]).find(r=>r.name===caseInfo.employee)?.jobTitle)+")":" "}. Date: ${caseInfo.date||"today"}. Chair: ${caseInfo.manager||"Unknown"}${caseInfo.chairJobTitle?" ("+caseInfo.chairJobTitle+")":(orgMembers||[]).find(m=>m.name===caseInfo.manager)?.job_title?" ("+((orgMembers||[]).find(m=>m.name===caseInfo.manager)?.job_title)+")":" "}. Start time: ${meetingStartTime||"Unknown"}. End time: ${meetingEndTime||meetingEndTimeVal||"Unknown"}${adjournments.length>0?" Adjournments: "+adjournments.map(a=>a.start+(a.end?" to "+a.end:"- ongoing")+(a.reason?" ("+a.reason+")":"")).join(", "):""}. Notetaker: ${caseInfo.notetaker||"Not specified"}. Representative/companion: ${caseInfo.representative?caseInfo.representative+" ("+(caseInfo.representativeRole||"colleague")+")":"N/A"}. Other participants: ${participants.map(p=>p.name+" ("+p.role+")").join(", ")||"none listed"}${getPolicyCtx()}\n\nTRANSCRIPT:\n${tx}\n\nPlease produce the following sections:\n\n## Meeting Details\nInclude these fields on separate lines:\n- Type: [meeting type]\n- Date: [date]\n- Start time: [start time]\n- End time: [end time]${adjournments.length>0?"\n- Adjournments: [list each adjournment with times and reason]":""}\n- Chair: [chair name and job title]\n- Notetaker: [notetaker name or "Not specified"]\n- Employee: [employee name and job title]\n- Representative/companion: [name and role, or "N/A"]\n- Other participants: [any others or "None"]\n- Purpose: [write 1-2 sentences on the same line explaining why this meeting was held]\n\n## Meeting Dialogue\nRewrite as a clean readable conversation. Each line must start with the speaker\'s INITIALS followed by a colon (e.g. if chair is "${caseInfo.manager||"HR Manager"}" use initials "${(caseInfo.manager||"HR Manager").split(" ").map(w=>w[0]).join("")}:" and if employee is "${caseInfo.employee||"Employee"}" use initials "${(caseInfo.employee||"Employee").split(" ").map(w=>w[0]).join("")}:"). Fix any typos. One line per utterance.\n\n## Key Points\n## Employee Position\n## Management Position\n## Procedural Checks\n## Actions & Next Steps`,
        t=>setReviewOutput(t)
      );
      setReviewOutputOriginal(fullRecord);
      await summaryPromise;
    } catch(e) { setAiError(e.message); }
    setAiProcessing(false);
    // Auto risk score — fullRecord is preferred (the polished, structured
    // record) but falls back to the raw transcript text if the record
    // generation itself failed, so a risk assessment can still be
    // attempted from whatever content is actually available.
    runRiskScore(fullRecord || allNotes.slice(-40).map(u=>u.text).join("\n"));
    // Auto-populate names and update dialogue initials
    setReviewOutput(r => {
      if(!r) return r;
      r.split(String.fromCharCode(10)).forEach(l => {
        const lLow = l.toLowerCase();
        if(lLow.includes('chair') && l.includes(':') && !caseInfo.manager) {
          const name = l.substring(l.indexOf(':')+1).trim();
          if(name && name !== 'Unknown' && name.length > 1) setCaseInfo(p=>({...p,manager:name}));
        }
        if((lLow.startsWith('- employee') || lLow.startsWith('employee:')) && l.includes(':') && !caseInfo.employee) {
          const name = l.substring(l.indexOf(':')+1).trim();
          if(name && name !== 'Unknown' && name.length > 1 && name.length < 50 && !name.includes('.')) setCaseInfo(p=>({...p,employee:name}));
        }
      });
      return r;
    });
  };

  // Deterministic, not AI-generated — this is the organisation's own track
  // record (same case type's past outcomes, this employee's case count),
  // computed directly from existing case data rather than trusting the LLM
  // to remember or reference it. Fed into the risk-scoring prompt below,
  // and shown as-is in the UI so the value of accumulated history is
  // visible, not just silently folded into the AI's summary.
  const getCaseHistoryContext = () => {
    const activeCase = cases.find(c => c.id === activeCaseId);
    const excludeId = activeCase?.id;
    const parts = [];

    if(activeCase?.caseType) {
      const sameType = cases.filter(c => c.id !== excludeId && c.caseType === activeCase.caseType && getCaseStage(c) === "closed");
      if(sameType.length > 0) {
        const outcomes = sameType.map(c => c.outcome).filter(Boolean);
        parts.push(`This organisation has closed ${sameType.length} previous ${activeCase.caseType} case${sameType.length === 1 ? "" : "s"}${outcomes.length ? ", with outcomes: " + outcomes.join("; ") : ""}.`);
      }
    }

    const employeeName = caseInfo.employee?.trim();
    if(employeeName) {
      const sameEmployee = cases.filter(c => c.id !== excludeId && c.employeeName === employeeName);
      if(sameEmployee.length > 0) {
        parts.push(`This is case ${sameEmployee.length + 1} for this employee — ${sameEmployee.length} previous case${sameEmployee.length === 1 ? "" : "s"} on file.`);
      }
    }

    return parts.length ? parts.join(" ") : null;
  };

  // Phase 23 — Explainability retrofit surfaced a real, pre-existing bug
  // here (not something this phase introduced, but the first thing to
  // actually exercise the risk-assessment panel end-to-end): handleReview()
  // called this with no arguments, so it read reviewOutput/transcript from
  // its OWN closure — captured back when handleReview started running,
  // before the meeting record had streamed in. Both were still empty at
  // that point, so the guard below silently no-opped on every single
  // meeting, and the risk panel simply never appeared. Taking the
  // transcript text as a parameter (handleReview now passes fullRecord,
  // its own local/hoisted variable with the just-generated record) fixes
  // this at the source instead of reaching for a fresher closure another
  // way.
  const runRiskScore = async (transcriptText) => {
    if(!transcriptText) return;
    setRiskProcessing(true);
    try {
      const tx = transcriptText;
      const historyContext = getCaseHistoryContext();
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({model:"claude-sonnet-4-6", max_tokens:300, stream:false,
          system:'UK employment law risk specialist. Respond ONLY with valid JSON, no other text: {"rating":"HIGH","summary":"two or three plain English sentences"} Rating must be HIGH, MEDIUM or LOW.'+(historyContext?' If organisational history is provided, factor it into your rating — but keep organisation-wide patterns (how similar cases have been resolved before, across other employees) and this specific employee\'s own case history analytically separate. Never word the summary so it could be read as this employee personally having a prior warning or case unless the history explicitly says so for this employee by name — an unrelated case\'s outcome is base-rate context, not this person\'s record. Only suggest escalating up a disciplinary scale (e.g. "could escalate to a final warning") if this employee\'s own prior record actually supports that, not organisation-wide history alone.':'')+(policies.length?' If company policies are provided, factor any deviation from them into your rating too.':''),
          messages:[{role:"user", content:"Meeting: "+(meetingType?.label||"General")+"\nEmployee: "+(caseInfo.employee||"Unknown")+"\nContent:\n"+tx.slice(0,3000)+(historyContext?"\n\nOrganisational history: "+historyContext:"")+getPolicyCtx()}]})});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      setRiskScore({...JSON.parse(text.replace(/```json|```/g,"").trim()), historyContext});
    } catch(e) { setRiskScore({rating:"UNKNOWN",summary:"Could not assess.",flags:[]}); }
    setRiskProcessing(false);
  };

  // ── AI: Outcome prediction ──
  const runPrediction = async () => {
    setPredProcessing(true);
    try {
      const tx = reviewOutput || transcript.slice(-40).map(u=>u.text).join("\n");
      await streamClaude(
        `UK employment tribunal outcome predictor. Analyse based on ERA 1996, ACAS Code, case law. Be honest about risks. ## headers.`,
        `Meeting: ${meetingType?.label}\nEmployee: ${caseInfo.employee}\nRecord:\n${reviewOutput||tx}\n\n## Likely Outcome if Challenged at Tribunal\n## Key Vulnerabilities\n## Strongest Arguments for Employer\n## Recommended Actions to Strengthen Position\n## Comparable Cases`,
        t=>setPrediction(t)
      );
    } catch(e) { setPrediction("Could not generate prediction: "+e.message); }
    setPredProcessing(false);
  };

  // ── AI: Developmental meeting summary ──
  const generateDevSummary = async () => {
    if(!devSession) return;
    setDevAiProcessing(true);
    const s = devSession;
    const selfText = s.config?.selfAssessmentPrompts?.map((q,i)=>q+"\n"+(s.selfAssessment[i]||"Not answered")).join("\n\n") || "";
    const manText = s.config?.managerPrompts?.map((q,i)=>q+"\n"+(s.managerAssessment[i]||"Not completed")).join("\n\n") || "";
    const objText = s.objectives?.map(o=>`${o.label} (Rating: ${o.rating}/5): ${o.note||"No notes"}`).join("\n") || "";
    try {
      await streamClaude(
        `You are a UK HR specialist facilitating developmental meetings. Write professionally but warmly — this is not disciplinary. Be specific and constructive. Use ## headers.`,
        `${s.type} for ${s.caseInfo.employee||"employee"} (${s.caseInfo.role||"role"})
Date: ${s.caseInfo.date||"today"} | Manager: ${s.caseInfo.manager||"unknown"}
Review period: ${s.caseInfo.reviewPeriod||"this period"}
Overall rating: ${s.rating||"not set"}
Agreed outcome: ${s.outcome||"not set"}

EMPLOYEE SELF-ASSESSMENT:
${selfText}

MANAGER ASSESSMENT:
${manText}

OBJECTIVES / AREAS:
${objText}

DEVELOPMENT PLAN NOTES:
${s.devPlan||"None noted"}

Please produce:
## Meeting Summary
## Key Strengths
## Development Areas
## Agreed Objectives for Next Period
## Development Plan
## Manager Recommendations
## Employee Next Steps
## Manager Next Steps`,
        t => setDevSummary(t)
      );
    } catch(e) { setDevSummary("Error generating summary: "+e.message); }
    setDevAiProcessing(false);
  };

  const generateDevLetter = async () => {
    if(!devSession) return;
    setDevAiProcessing(true);
    const s = devSession;
    const letterConfig = {
      "Probation Review": `Write a formal probation review outcome letter. Outcome: ${s.outcome}. Tone: professional but warm if passing, supportive but clear if extending.`,
      "Appraisal": `Write a formal annual appraisal confirmation letter summarising the review and agreed objectives.`,
      "PIP Review": `Write a formal PIP review progress letter. Outcome: ${s.outcome}. Be clear about next steps.`,
      "PDP / 1-2-1": `Write a friendly 1-2-1 follow-up note confirming discussion points and agreed actions.`,
    };
    try {
      await streamClaude(
        "You are a UK HR letter writer.",
        (letterConfig[meetingType?.label] || letterConfig["PDP / 1-2-1"]) + "\nEmployee: " + (caseInfo.employee||"") + "\nChair: " + (caseInfo.manager||"") + "\nDate: " + (caseInfo.date||""),
        t2=>setLetterOutput(t2)
      );
    } catch(e) { setAiError(e.message); }
    setDevAiProcessing(false);
  };

  const generateSmartObjectives = async (period) => {
    if(!devSession) return;
    setDevAiProcessing(true);
    const s = devSession;
    try {
      const result = await streamClaude(
        "UK HR performance management. Suggest 3-4 SMART objectives (Specific, Measurable, Achievable, Relevant, Time-bound). Return JSON only: [{\"label\":\"...\",\"desc\":\"...\",\"measure\":\"...\"}]. No markdown, no commentary.",
        `Employee: ${s.caseInfo.employee||"Employee"}${s.caseInfo.role?" ("+s.caseInfo.role+")":""}. Department: ${s.caseInfo.department||"Not specified"}. Review period: ${period||"Not specified"}. Meeting type: ${s.type}.`,
        ()=>{}
      );
      const parsed = JSON.parse(result.replace(/```json|```/g,"").trim());
      setDevSession(ds=>({...ds, objectives:[...ds.objectives, ...parsed.map(o=>({...o, rating:3, progress:"", note:""}))]}));
    } catch(e) { setAiError(e.message); }
    setDevAiProcessing(false);
  };

  const saveDevMeetingToCase = () => {
    if(!devSession) return;
    const s = devSession;
    const employeeName = (s.caseInfo.employee||"").trim() || "Unknown Employee";
    const meeting = {
      id: Date.now().toString(),
      type: s.type,
      date: s.caseInfo.date || new Date().toLocaleDateString("en-GB"),
      manager: s.caseInfo.manager,
      record: devSummary || "",
      letterOutput: devLetter || "",
      objectives: s.objectives,
      outcome: s.outcome,
      rating: s.rating,
      devPlan: s.devPlan,
      selfAssessment: s.selfAssessment,
      managerAssessment: s.managerAssessment,
      savedAt: new Date().toISOString(),
      savedBy: currentUser?.name || "HR Manager",
    };
    const existing = cases.find(c=>c.employeeName.toLowerCase()===employeeName.toLowerCase());
    if(existing) {
      saveCases(cases.map(c=>c.id===existing.id?{...c,meetings:[...c.meetings,meeting]}:c));
    } else {
      saveCases([...cases,{id:crypto.randomUUID(), employeeName, email:s.caseInfo.email||"", createdAt:new Date().toISOString(), meetings:[meeting]}]);
    }
    audit("Development meeting saved", `${employeeName} — ${s.type}`);
    showToast("Meeting saved to case file");
    if(devLetter && org?.id) {
      authedFetch("/api/portal/notify-document", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ orgId: org.id, orgName: org.name, employeeName, documentType: s.type }),
      }).catch(e=>console.error("Portal notify failed:", e));
    }
  };

  // ── Save to case ──
  const saveMeetingToCase = () => {
    // If this is a witness interview, save to parent case evidence instead
    if(caseInfo._linkedCaseId) {
      const witnessNote = {
        name:"Witness: "+(caseInfo.employee||"Unknown")+" ("+fmtDate(caseInfo.date)+")",
        type:"Witness statement",
        date:caseInfo.date||new Date().toLocaleDateString("en-GB"),
        addedBy:caseInfo.manager||"HR Manager",
        record:reviewOutput,
        signStatus:"pending"
      };
      const targetCase = cases.find(x=>x.id===caseInfo._linkedCaseId);
      const updatedTargetCase = targetCase ? {...targetCase, evidence:[...(targetCase.evidence||[]), witnessNote]} : null;
      saveCases(cases.map(x=>x.id===caseInfo._linkedCaseId?{...x,evidence:[...(x.evidence||[]),witnessNote]}:x));
      const targetId = caseInfo._linkedCaseId;
      setCaseInfo(p=>({...p,_linkedCaseId:null,_linkedCaseName:null}));
      setMeetingSetup(p=>({...p,linkedCaseId:null,linkedCaseName:null}));
      setActiveCaseId(targetId);
      setActiveCaseStage("investigation");
      setScreen(SCREENS.CASE_VIEW);
      showToast("Witness statement saved to case");
      applyPendingMeetingSuggestions(targetId);
      // M7 — a new witness statement can resolve an open question or
      // introduce new evidence just as much as a regular meeting can.
      if(updatedTargetCase) {
        generateUnansweredQuestions(updatedTargetCase, true);
        generateEvidenceSuggestions(updatedTargetCase, true);
        generateNextBestAction(updatedTargetCase, true);
      }
      return;
    }
    const employeeName = caseInfo.employee.trim()||"Unknown Employee";
    const meeting = {
      id: Date.now().toString(),
      type: meetingType?.label||"Meeting",
      date: caseInfo.date||new Date().toLocaleDateString("en-GB"),
      manager: caseInfo.manager,
      participants,
      transcript: transcript.filter(u=>!u.pending),
      record: reviewOutput,
      summary: meetingSummary,
      signDocument: (()=>{
        const full = reviewOutput;
        const start = full.indexOf("## Meeting Details");
        const advisorCut = full.indexOf("## HR Advisor");
        const keyCut = full.indexOf("\n## Key Points");
        const end = advisorCut>-1 ? advisorCut : keyCut>-1 ? keyCut : undefined;
        const raw = start>-1 ? full.slice(start, end) : full.slice(0, advisorCut>-1?advisorCut:undefined);
        return raw.replace(/^## /gm,"").replace(/^# /gm,"").replace(/\*\*/g,"");
      })(),
      letterOutput,
      letterApprovedBy: letterIsApproved ? letterApproval.by : null,
      letterApprovedAt: letterIsApproved ? letterApproval.at : null,
      riskScore,
      nextSteps,
      prediction,
      letterTracking: {},
      savedAt: new Date().toISOString(),
      savedBy: currentUser?.name || "HR Manager",
      signId: signId,
      signStatus: signStatus,
    };
    const existing = cases.find(c=>c.employeeName.toLowerCase()===caseInfo.employee.toLowerCase());
    const caseId = existing ? existing.id : crypto.randomUUID();
    const updatedCase = existing
      ? {...existing, meetings:[...existing.meetings, meeting]}
      // caseType "informal" only on a brand-new case created from a
      // referral (MP6) — an existing employee's own case keeps whatever
      // type it already had; one informal chat about them doesn't
      // relabel it.
      : {id:caseId, employeeName:caseInfo.employee, email:caseInfo.email, createdAt:new Date().toISOString(), meetings:[meeting], ...(caseInfo._linkedReferralId?{caseType:"informal"}:{})};
    if(existing) {
      saveCases(cases.map(c=>c.id===existing.id?{...c,meetings:[...c.meetings,meeting]}:c));
    } else {
      saveCases([...cases,updatedCase]);
    }
    // Manager Enablement (Phase 4, MP6) — closes the loop back to the
    // referral that started this conversation. Functional update, same
    // reasoning as generateConcernTriageSummary (MP5): concernReferrals
    // closed over above could be stale by the time a real meeting is
    // actually recorded and saved.
    if(caseInfo._linkedReferralId) {
      const referralId = caseInfo._linkedReferralId;
      setConcernReferrals(prev => {
        const updated = setReferralStatus(prev, referralId, "handled_informally", { linkedCaseId: caseId });
        const saved = updated.find(r=>r.id===referralId);
        if(saved) saveConcernReferralToDB(saved);
        return updated;
      });
      setCaseInfo(p=>({...p, _linkedReferralId:null, _linkedReferralName:null}));
      audit("Concern referral handled informally", caseInfo.employee, caseId);
    }
    // M7 — auto-refresh case intelligence so the rest of the case reflects
    // this meeting without HR having to click each panel separately.
    // Case Readiness and Chronology need no direct call here — both are
    // pure derivations over exactly what these calls (plus
    // generateInconsistencies, already silent-capable) just wrote.
    generateInconsistencies(updatedCase, true);
    generateUnansweredQuestions(updatedCase, true);
    generateEvidenceSuggestions(updatedCase, true);
    generateNextBestAction(updatedCase, true);
    applyPendingMeetingSuggestions(caseId);
    audit("Meeting saved", `${caseInfo.employee} — ${meetingType?.label}`);
    showToast("Meeting saved to case file");
    // The button that triggers this is labelled "Save and go to case →" —
    // it used to only save, never navigate, silently stranding the user on
    // the Review screen. Callers that want the general Cases list instead
    // (ReviewScreen's/LetterScreen's plain "Save to case" buttons) already
    // call setScreen(SCREENS.CASES) right after this returns, which wins
    // over this since it runs later in the same handler.
    setActiveCaseId(caseId);
    setActiveCaseStage("investigation");
    setScreen(SCREENS.CASE_VIEW);
    if(letterOutput && org?.id) {
      authedFetch("/api/portal/notify-document", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ orgId: org.id, orgName: org.name, employeeName, documentType: meetingType?.label }),
      }).catch(e=>console.error("Portal notify failed:", e));
    }
  };

  // ── PDF generation ──
  const loadJsPDF = () => new Promise(resolve => {
    if(window.jspdf){resolve(window.jspdf.jsPDF);return;}
    const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"; s.onload=()=>resolve(window.jspdf.jsPDF); document.head.appendChild(s);
  });

  const generatePDF = async sig => {
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({unit:"mm",format:"a4"});
    const M=20, W=doc.internal.pageSize.getWidth(), maxW=W-M*2;
    let y=15;
    if(letterhead) {
      try { const p=doc.getImageProperties(letterhead); const iW=maxW; const iH=Math.min((p.height*iW)/p.width,45); doc.addImage(letterhead,p.fileType||"PNG",M,8,iW,iH); y=iH+14; doc.setDrawColor(124,92,252); doc.setLineWidth(0.3); doc.line(M,y,W-M,y); y+=8; } catch(e){}
    }
    doc.setFontSize(9); doc.setTextColor(150); doc.text("PRIVATE & CONFIDENTIAL",M,y); y+=9;
    doc.setFontSize(17); doc.setTextColor(30); doc.setFont("helvetica","bold"); doc.text(`${meetingType?.label} — Letter`,M,y); y+=8;
    doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(80); doc.text(`Employee: ${caseInfo.employee||"—"} | Date: ${caseInfo.date||"—"} | Chair: ${caseInfo.manager||"—"}`,M,y); y+=7;
    doc.setDrawColor(124,92,252); doc.setLineWidth(0.5); doc.line(M,y,W-M,y); y+=8;
    const clean = letterOutput.replace(/^## (.+)$/gm,"\n$1\n").replace(/^# (.+)$/gm,"\n$1\n").replace(/\*\*(.+?)\*\*/g,"$1").replace(/^[-*] /gm,"  - ");
    doc.setFontSize(11); doc.setTextColor(30); doc.setFont("helvetica","normal");
    doc.splitTextToSize(clean,maxW).forEach(line=>{
      if(y>255){doc.addPage();y=20;}
      const isH=line.trim()&&line.trim()===line.trim().toUpperCase()&&line.trim().length>3&&!line.startsWith(" ");
      if(isH){doc.setFont("helvetica","bold");doc.setTextColor(60,40,160);}else{doc.setFont("helvetica","normal");doc.setTextColor(30);}
      doc.text(line,M,y); y+=6;
    });
    if(sig) {
      y+=8; if(y>260){doc.addPage();y=20;}
      doc.setFontSize(9); doc.setTextColor(120); doc.text("Signed:",M,y); y+=6;
      if(sig.type==="draw"){try{doc.addImage(sig.data,"PNG",M,y,60,20);y+=24;}catch(e){}}
      else{doc.setFont("helvetica","italic");doc.setFontSize(22);doc.setTextColor(30);doc.text(sig.data,M,y+6);y+=14;}
      doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(120);
      doc.text(`${caseInfo.manager||"HR Manager"} | ${new Date().toLocaleDateString("en-GB")}`,M,y+2);
    }
    doc.setFontSize(8); doc.setTextColor(150); doc.text("Generated by Compass HR | Private & Confidential",M,287);
    return doc;
  };

  const triggerWithSig = action => {
    // Defense in depth — LetterScreen already disables these buttons until
    // the letter is approved, but a letter is never sent from here without
    // that gate passing, even if some future caller skips the UI.
    if(!letterIsApproved) { showToast("Approve the letter before sending it — see the approval bar above the letter.", "error"); return; }
    if(signature) { doSend(action, signature); }
    else { setPendingSend(action); setShowSigPad(true); }
  };
  const doSend = async (action, sig) => {
    const lTypes={outcome:"Outcome",invite:"Invitation",appeal:"Appeal"};
    const empName = (caseInfo.employee||"Letter").replace(/\s+/g,"_");
    const fileName = `${empName}_${meetingType?.label||"Letter"}_${new Date().toLocaleDateString("en-GB").replace(/\//g,"-")}.pdf`;
    const subj = encodeURIComponent(`${meetingType?.label} ${lTypes[activeLetter]||""} - ${caseInfo.employee||"Employee"}`);
    const to = encodeURIComponent(caseInfo.email||"");
    const bodyText = `Please find the ${meetingType?.label} letter attached.\n\nEmployee: ${caseInfo.employee||""}\nDate: ${caseInfo.date||""}\n\nGenerated by Compass HR.\n\n---\nNote: The PDF letter has been downloaded to your device as "${fileName}". Please attach it to this email before sending.`;

    if(action==="download") {
      setPdfGenerating(true);
      try { const d=await generatePDF(sig); d.save(fileName); } catch(e){showToast(e.message, "error");}
      setPdfGenerating(false);
    } else {
      setPdfGenerating(true);
      try {
        const d=await generatePDF(sig); d.save(fileName);
        const url = action==="gmail"
          ? `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subj}&body=${encodeURIComponent(bodyText)}`
          : `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subj}&body=${encodeURIComponent(bodyText)}`;
        setTimeout(()=>{
          window.open(url,"_blank");
          showToast(`Letter downloaded as "${fileName}" — please attach it to the email that just opened.`, "success", 6000);
        },1000);
      } catch(e){showToast(e.message, "error");}
      setPdfGenerating(false);
    }
  };

  // ── Settings handlers ──
  const handleLetterheadUpload = e => { const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setLetterhead(ev.target.result);lsSet("compass_letterhead",ev.target.result);};r.readAsDataURL(f); };
  const handleWordTemplateUpload = e => { const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const o={name:f.name,base64:ev.target.result};setWordTemplate(o);lsSet("compass_word_template",o);};r.readAsDataURL(f); };
  const handleSaveSignature = sig => { setSignature(sig); setShowSigPad(false); lsSet("compass_signature",sig); if(pendingSend){const a=pendingSend;setPendingSend(null);setTimeout(()=>doSend(a,sig),100);} };
  // Process Intelligence (P4) — one extra AI call per uploaded policy,
  // extracting its specific quotable clauses (short heading + a near-
  // verbatim excerpt) rather than leaving the whole document as one
  // undifferentiated blob only ever consumed as raw context (getPolicyCtx,
  // below, still does that for general drafting/Q&A — this is additive,
  // not a replacement). Downstream consumers (P5's Next Best Action, P6's
  // guardrails, P10's decision workspace) cite a specific clause instead
  // of an unsourced "your policy says something relevant".
  const indexPolicyClauses = async (name, content) => {
    try {
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({model:"claude-sonnet-4-6", max_tokens:1200, stream:false,
          system:"You are indexing a UK HR policy document into short, quotable clauses for later citation. Extract only genuine procedural provisions with clear practical meaning — timeframes, notice periods, rights, required steps, escalation routes. Each clause's text should be a short, near-verbatim excerpt (1-3 sentences), not a paraphrase or summary. Respond ONLY with valid JSON, no other text: [{\"heading\":\"short label, e.g. Notice of hearing\",\"text\":\"the near-verbatim clause text\"}]. Return at most 12 clauses — the most practically citable ones, not every sentence.",
          messages:[{role:"user", content:`Policy: ${name}\n\n${content.slice(0,8000)}`}]})});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      return Array.isArray(parsed) ? parsed : [];
    } catch(e) { console.error("indexPolicyClauses failed:", e); return []; }
  };

  const handlePolicyUpload = async e => {
    const files=Array.from(e.target.files);if(!files.length)return; setPolicyProcessing(true);
    for(const file of files) {
      try {
        let content="";
        if(file.name.endsWith(".docx")) {
          await new Promise(res=>{if(window.mammoth){res();return;}const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";s.onload=res;document.head.appendChild(s);});
          const buf=await file.arrayBuffer(); const r=await window.mammoth.extractRawText({arrayBuffer:buf}); content=r.value;
        } else { content=await file.text(); }
        const name = file.name.replace(/\.[^.]+$/,"");
        const clauses = await indexPolicyClauses(name, content);
        const pol={id:Date.now().toString()+Math.random(),name,fileName:file.name,content:content.slice(0,8000),addedAt:new Date().toISOString(),size:Math.round(content.length/1000)+"k",category:"other",clauses};
        setPolicies(p=>{const u=[...p,pol];lsSet("compass_policies",u);return u;});
      } catch(err){showToast("Could not read "+file.name, "error");}
    }
    setPolicyProcessing(false); e.target.value="";
  };

  // ── Speaker colours ──
  const spColor=sp=>sp===SPEAKERS.HR?"#7C5CFC":sp===SPEAKERS.NOTE?"#888":"#E8622A";
  const spBg=sp=>sp===SPEAKERS.HR?"#1a1a2e":sp===SPEAKERS.NOTE?"#1a1a1a":"#1e1a14";
  const spBdr=sp=>sp===SPEAKERS.HR?"#7C5CFC":sp===SPEAKERS.NOTE?"#E8E0D0":"#E8622A";

  // ─────────────────────────────────────────────
  //  RENDER
  const exportCSV = () => {
    const rows = [["Employee","Email","Meeting Type","Date","Risk","Signed","Record Summary","Saved By","Saved At"]];
    cases.forEach(cs => {
      cs.meetings.forEach(m => {
        rows.push([
          cs.employeeName||"",
          cs.email||"",
          m.type||"",
          m.date||"",
          m.riskScore?.rating||"",
          m.signStatus==="signed"?"Yes":"No",
          (m.record||"").slice(0,200).split("\n").join(" ").split(",").join(";"),
          m.savedBy||"",
          m.savedAt?new Date(m.savedAt).toLocaleDateString("en-GB"):""
        ]);
      });
    });
    const csv = toCsv(rows);
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=(org?.name||"Compass")+"_Cases_"+new Date().toLocaleDateString("en-GB").split("/").join("-")+".csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({unit:"mm",format:"a4"});
    const M=20, W=doc.internal.pageSize.getWidth(), maxW=W-M*2;
    let y=20;
    const addLine = (text,size,r,g,b,bold=false) => {
      doc.setFontSize(size); doc.setTextColor(r,g,b); doc.setFont("helvetica",bold?"bold":"normal");
      const lines = doc.splitTextToSize(String(text||""),maxW);
      lines.forEach(l=>{ if(y>270){doc.addPage();y=20;} doc.text(l,M,y); y+=size*0.45; });
    };
    addLine("Compass HR — Cases Export",18,124,92,252,true);
    addLine(`${org?.name||""} · ${new Date().toLocaleDateString("en-GB")}`,10,100,100,100);
    y+=5;
    cases.forEach(cs=>{
      if(y>250){doc.addPage();y=20;}
      addLine(cs.employeeName,13,242,237,228,true);
      if(cs.email) addLine(cs.email,9,100,100,100);
      cs.meetings.forEach(m=>{
        if(y>260){doc.addPage();y=20;}
        addLine(`${m.type||"Meeting"} — ${m.date||""}`,11,164,143,255,true);
        if(m.riskScore?.rating) addLine(`Risk: ${m.riskScore.rating}`,9,232,98,42);
        if(m.record) addLine(m.record.slice(0,300).split("\n").join(" ")+"...",9,196,189,175);
        addLine(`${m.savedBy||"HR Manager"} · ${m.savedAt?new Date(m.savedAt).toLocaleDateString("en-GB"):""}`,8,80,80,80);
        y+=2;
      });
      y+=4;
    });
    doc.setFontSize(8); doc.setTextColor(150); doc.text("Generated by Compass HR | Confidential",M,287);
    doc.save((org?.name||"Compass")+"_Cases_"+new Date().toLocaleDateString("en-GB").split("/").join("-")+".pdf");
  };

  // ─────────────────────────────────────────────








  const LETTER_TEMPLATES = {
    outcome: (emp, chair, date, meetingType) => [
      date,
      "",
      emp,
      "[Employee Address Line 1]",
      "[Employee Address Line 2]",
      "[Town/City, Postcode]",
      "",
      "Sent via email: [Employee email address]",
      "",
      "Private and Confidential",
      "",
      "Re: Outcome of " + (meetingType || "Disciplinary Hearing"),
      "",
      "Dear " + emp.split(" ")[0] + ",",
      "",
      "I am writing to confirm the outcome of the " + (meetingType || "disciplinary hearing") + " held on " + date + ", chaired by " + chair + ".",
      "",
      "Decision",
      "[Insert decision — e.g. First Written Warning / Final Written Warning / Dismissal / No further action]",
      "",
      "Reason",
      "[Insert reason for decision based on evidence and findings]",
      "",
      "Duration",
      "[If warning: This warning will remain on your personnel file for [X months] from the date of this letter, after which it will be disregarded for disciplinary purposes provided there are no further issues.]",
      "",
      "Right of Appeal",
      "You have the right to appeal this decision in accordance with the ACAS Code of Practice. If you wish to appeal, please write to [Name and Job Title] within 5 working days of receiving this letter, setting out your grounds of appeal.",
      "",
      "Yours sincerely,",
      "",
      chair,
      "[Job Title]",
      "[Company Name]",
    ].join("\n"),

    invite: (emp, chair, date, meetingType) => [
      date,
      "",
      emp,
      "[Employee Address Line 1]",
      "[Employee Address Line 2]",
      "[Town/City, Postcode]",
      "",
      "Sent via email: [Employee email address]",
      "",
      "Private and Confidential",
      "",
      "Re: Invitation to " + (meetingType || "Hearing"),
      "",
      "Dear " + emp.split(" ")[0] + ",",
      "",
      "I am writing to invite you to attend a " + (meetingType || "hearing") + " which has been arranged as follows:",
      "",
      "Date: [Insert date]",
      "Time: [Insert time]",
      "Location: [Insert location]",
      "Chair: " + chair,
      "",
      "Purpose",
      "[Insert purpose of the meeting]",
      "",
      "Issues to be Discussed",
      "[Set out clearly the specific allegations or issues to be discussed at the meeting]",
      "",
      "Evidence",
      "Copies of the evidence to be referred to at the meeting are enclosed with this letter.",
      "",
      "Right to be Accompanied",
      "You have the right to be accompanied at this meeting by a trade union representative or a work colleague of your choice. Please let us know in advance if you wish to exercise this right.",
      "",
      "If you are unable to attend on the date proposed, please contact [HR contact] as soon as possible.",
      "",
      "Yours sincerely,",
      "",
      chair,
      "[Job Title]",
      "[Company Name]",
    ].join("\n"),

    appeal: (emp, chair, date, meetingType) => [
      date,
      "",
      emp,
      "[Employee Address Line 1]",
      "[Employee Address Line 2]",
      "[Town/City, Postcode]",
      "",
      "Sent via email: [Employee email address]",
      "",
      "Private and Confidential",
      "",
      "Re: Outcome of Appeal Hearing",
      "",
      "Dear " + emp.split(" ")[0] + ",",
      "",
      "I am writing to confirm the outcome of your appeal hearing held on " + date + ", chaired by " + chair + ".",
      "",
      "Original Decision",
      "[Insert original decision that was appealed]",
      "",
      "Grounds of Appeal",
      "[Summarise the grounds of appeal raised by the employee]",
      "",
      "Outcome",
      "[Select one: Appeal upheld — original decision overturned / Appeal partially upheld — sanction varied to [insert] / Appeal not upheld — original decision confirmed]",
      "",
      "Reasons",
      "[Insert reasons for the appeal outcome, addressing each ground of appeal raised]",
      "",
      "This decision is final. There is no further right of internal appeal.",
      "",
      "Yours sincerely,",
      "",
      chair,
      "[Job Title]",
      "[Company Name]",
    ].join("\n"),

    redundancy_atrisk: (emp, chair, date) => [
      date,
      "",
      emp,
      "[Employee Address Line 1]",
      "[Employee Address Line 2]",
      "[Town/City, Postcode]",
      "",
      "Sent via email: [Employee email address]",
      "",
      "Private and Confidential",
      "",
      "Re: Notification of At Risk of Redundancy",
      "",
      "Dear " + emp.split(" ")[0] + ",",
      "",
      "I am writing to inform you that your role of [Job Title] has been identified as potentially at risk of redundancy. This is due to [insert business reason].",
      "",
      "No final decision has been made at this stage. We are committed to a period of meaningful consultation with you before any decisions are taken.",
      "",
      "A consultation meeting was held on " + date + ", chaired by " + chair + ". Your views were heard and will be fully considered before any decision is reached.",
      "",
      "We will actively explore all reasonable alternatives to redundancy, including [suitable alternative roles / reduced hours / voluntary redundancy].",
      "",
      "You have the right to be accompanied at any future consultation meeting by a trade union representative or a work colleague of your choice.",
      "",
      "A further consultation meeting will be arranged in due course. If you have any questions in the meantime, please do not hesitate to contact " + chair + ".",
      "",
      "Yours sincerely,",
      "",
      chair,
      "[Job Title]",
      "[Company Name]",
    ].join("\n"),

    redundancy_outcome: (emp, chair, date) => [
      date,
      "",
      emp,
      "[Employee Address Line 1]",
      "[Employee Address Line 2]",
      "[Town/City, Postcode]",
      "",
      "Sent via email: [Employee email address]",
      "",
      "Private and Confidential",
      "",
      "Re: Confirmation of Redundancy",
      "",
      "Dear " + emp.split(" ")[0] + ",",
      "",
      "I am writing to confirm that, following the conclusion of our consultation process, your role of [Job Title] has been made redundant. I am sorry to have to inform you of this decision.",
      "",
      "Your last working day will be [insert last working day].",
      "",
      "Notice",
      "Your notice period of [X weeks] will run from " + date + " to [insert end date]. You will [work your notice period in full / receive a payment in lieu of notice].",
      "",
      "Redundancy Pay",
      "You are entitled to a statutory redundancy payment of £[insert amount]. This will be paid on [insert payment date] with your final salary.",
      "",
      "Annual Leave",
      "You have [X days] of accrued untaken annual leave. This will be [paid out with your final salary / taken during your notice period].",
      "",
      "Right of Appeal",
      "You have the right to appeal this decision. To do so, please write to [HR contact name and job title] within 5 working days of receiving this letter, setting out your grounds of appeal.",
      "",
      "Yours sincerely,",
      "",
      chair,
      "[Job Title]",
      "[Company Name]",
    ].join("\n"),
  };

  const getLetterTemplate = (type) => {
    const emp = caseInfo.employee || "[Employee Name]";
    const chair = caseInfo.manager || "[Chair Name]";
    const dt = caseInfo.date
      ? new Date(caseInfo.date.split("/").reverse().join("-")).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})
      : new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
    const mt = meetingType?.label || "";
    const fn = LETTER_TEMPLATES[type];
    return fn ? fn(emp, chair, dt, mt) : null;
  };

  const handleLetter = async (type, {inline}={}) => {
    const t = type||"outcome"; setAiError("");
    // Regenerating overwrites letterOutput — keep the draft being replaced
    // so it's not just silently gone.
    if(letterOutput) setLetterHistory(h => [{type: activeLetter, text: letterOutput, ts: new Date().toISOString()}, ...h].slice(0, 10));
    setActiveLetter(t);
    setAiProcessing(true); if(!inline) setScreen(SCREENS.LETTER); setLetterOutput(""); setLetterSources([]);
    try {
      const nl = String.fromCharCode(10);
      const tx = transcript.map(u=>u.speaker+": "+u.text).join(nl);
      const evidenceList = (caseInfo.evidence||[]).map((e,i)=>(i+1)+". "+e.name+" ("+e.type+", "+e.date+")").join(nl);
      // Pull additional context from active case
      const activeCase = cases.find(x=>x.id===activeCaseId);
      const empRec = getEmployeeRecord(caseInfo.employee)||{};
      const prevMeetings = activeCase?(activeCase.meetings||[]).slice(-3).map(m=>m.type+" on "+m.date+(m.record?" — "+m.record.slice(0,100):"")).join("; "):"";
      // Outcome Builder (P12) — an outcome letter used to draw only on the
      // generic case/meeting context above, the same as every other letter
      // type; it never actually looked at the allegations, findings, or
      // mitigation the Decision Workspace (Phase 16, P10) already holds,
      // even though that's precisely what "reasons for the decision" and
      // "mitigation considered" should be grounded in. Same per-allegation
      // pull as concludeInvestigation, just scoped to the outcome letter
      // and reading the decision-maker's own decisionReasoning/
      // investigatorFinding/outstandingUncertainty fields concludeInvestigation
      // doesn't need (it runs before any finding exists).
      const allegationOutcomeContext = t==="outcome" && activeCase ? allegationsForCase(allegations, activeCase.id).map(a => {
        const linked = evidenceForAllegation(activeCase.evidence||[], a.id);
        const supporting = linked.filter(ev=>ev.stance==="supports").map(ev=>ev.name);
        const contrary = linked.filter(ev=>ev.stance==="contradicts").map(ev=>ev.name);
        return `- "${a.title}"${a.description?": "+a.description:""}`+nl
          +"  Finding: "+allegationStatusMeta(a.status).label+nl
          +"  Decision reasoning: "+(a.decisionReasoning||"not recorded")+nl
          +"  Investigator's finding: "+(a.investigatorFinding||"not recorded")+nl
          +"  Employee response / mitigation put forward: "+(a.employeeResponse||"not recorded")+nl
          +"  Supporting evidence: "+(supporting.join(", ")||"none linked")+nl
          +"  Contrary evidence: "+(contrary.join(", ")||"none linked")+nl
          +"  Outstanding uncertainty: "+(a.outstandingUncertainty||"none recorded");
      }).join(nl+nl) : "";
      const context = [
        caseInfo.employee ? "Employee: "+caseInfo.employee+(empRec.jobTitle?" ("+empRec.jobTitle+")":"") : "",
        caseInfo.manager ? "Chair/Manager: "+caseInfo.manager : "",
        caseInfo.representative ? "Representative/companion: "+caseInfo.representative+" ("+(caseInfo.representativeRole||"colleague")+")" : "",
        caseInfo.date ? "Meeting date: "+caseInfo.date : "",
        empRec.startDate ? "Employee start date: "+empRec.startDate : "",
        empRec.location ? "Location: "+empRec.location : "",
        activeCase?.caseType ? "Case type: "+activeCase.caseType : "",
        activeCase?.description ? "Case description: "+activeCase.description : "",
        activeCase?.outcome ? "Outcome decision: "+activeCase.outcome : "",
        activeCase?.outcomeNotes ? "Outcome rationale recorded by HR: "+activeCase.outcomeNotes : "",
        meetingType?.label ? "Meeting type: "+meetingType.label : "",
        evidenceList ? "Evidence gathered:"+nl+evidenceList : "",
        prevMeetings ? "Previous meetings: "+prevMeetings : "",
        allegationOutcomeContext ? "Allegations and findings on record:"+nl+allegationOutcomeContext : "",
        reviewOutput ? "Meeting record:"+nl+reviewOutput.slice(0,1200) : "",
        tx ? "Transcript:"+nl+tx.slice(0,800) : "",
      ].filter(Boolean).join(nl) + getPolicyCtx();

      // Explainability sweep (P19) — a self-contained snapshot mirroring
      // exactly what the "Available information" block above just fed
      // the AI, not a generic "this case's data" pointer. Own label/
      // detail/date on every entry (not ids to resolve later) since case
      // data can change after the letter was drafted.
      const letterSources = [
        (t==="outcome" && activeCase) ? allegationsForCase(allegations, activeCase.id).map(a => ({kind:"allegation", label:a.title, detail:"Finding: "+allegationStatusMeta(a.status).label})) : [],
        (caseInfo.evidence||[]).map(e => ({kind:"evidence", label:e.name, detail:[e.type, e.date].filter(Boolean).join(" · ")})),
        activeCase ? (activeCase.meetings||[]).slice(-3).map(m => ({kind:"meeting", label:m.type||"Meeting", date:m.date})) : [],
        policies.length>0 ? [{kind:"policy", label:"Uploaded company policies", detail:policies.map(p=>p.name).join(", ")}] : [],
        [{kind:"context", label:"Case & employee details", detail:"Employee, manager, meeting date, and case type/description/outcome as recorded on this case."}],
      ].flat();

      const letterInstructions = {
        "invite": "a formal invitation letter to a "+(meetingType?.label||"meeting")+". Include: reason for the meeting, proposed date/time/location placeholders, list of allegations or agenda items (infer from context if available), right to be accompanied by a colleague or trade union rep under ERA 1999 s.10, and how to respond. Follow ACAS Code of Practice.",
        "outcome": "a formal outcome letter following a "+(meetingType?.label||"disciplinary hearing")+". Include: summary of what was discussed; the decision reached for each allegation and the reasons for it, grounded in the specific findings and decision reasoning below where available (not a generic restatement); any mitigation the employee put forward and how it was weighed in reaching the decision; any sanction imposed (e.g. [First Written Warning]) and its duration (e.g. [12 months], matching the uploaded policy's own stated duration where one is referenced below); where a sanction is imposed, the specific improvement required of the employee going forward; the consequences of further misconduct during the sanction's currency (e.g. escalation to the next stage of the disciplinary procedure, up to and including dismissal); and the right of appeal within 5 working days. Follow ACAS Code of Practice.",
        "appeal": "a formal appeal outcome letter. Include: grounds of appeal considered, outcome of the appeal, reasons, whether original decision is upheld or overturned, confirmation this is the final stage. Follow ACAS Code of Practice.",
        "investigation-report": "a formal investigation report. Include: background and reason for investigation, allegations investigated, investigation process and evidence reviewed (infer from meeting record), findings for each allegation (upheld/not upheld), overall recommendation (case to answer/no case to answer). This is an internal HR document, not a letter to the employee. Write in formal report style with clear sections.","no-case-answer": "a formal letter to the employee confirming no case to answer. Include: that an investigation has been completed, that no further action will be taken, that the matter is now closed, and that the record will be kept confidential. Warm but professional tone.","grievance": "a formal grievance outcome letter. Include: summary of grievance raised, investigation findings, outcome and reasons, right of appeal. Follow ACAS Code of Practice.",
        "warning": "a formal written warning letter. Include: nature of misconduct, previous warnings if any, expected improvement, review period, consequence of further misconduct, right of appeal. Follow ACAS Code of Practice.",
        "dismissal": "a formal dismissal letter. Include: reason for dismissal, date employment ends, notice period or payment in lieu, final pay arrangements, right of appeal within 5 working days. Follow ERA 1996 and ACAS Code of Practice.",
        "suspension": "a formal suspension letter. Include: that suspension is a neutral act and not a disciplinary sanction or presumption of guilt, the reason an investigation is required, that suspension is normally on full pay, restrictions during suspension (e.g. contacting colleagues, attending the workplace), a named contact during the suspension period, and that the situation will be kept under review. Follow ACAS Code of Practice.",
        "meeting-confirmation": "a formal letter confirming the details of an upcoming meeting already arranged with the employee. Include: confirmed date, time and location (or video call details), meeting type/purpose, who else will attend, right to be accompanied by a colleague or trade union rep under ERA 1999 s.10, and what to bring or prepare. Shorter and less formal in tone than an invitation letter, since the meeting has already been agreed — this simply confirms the arrangements in writing.",
      };

      const instruction = letterInstructions[t] || letterInstructions["outcome"];

      const systemPrompt = "You are a senior UK employment lawyer and HR advisor with 20 years of experience. Draft complete, professional HR correspondence that is legally sound and follows ACAS Code of Practice and relevant UK employment legislation. Always produce a complete letter — never refuse or ask for more information. Where specific details are unknown, use clear placeholders in square brackets such as [Employee Address], [Date of Hearing], [Appeal Officer Name and Job Title], [Company Name]. The letter should read naturally and professionally. Output only the letter itself with no preamble, explanation or sign-off instructions."+(policies.length?" Reference company policies by name where relevant — e.g. match sanction lengths, appeal windows or procedural steps to what the uploaded policy actually specifies rather than a generic default.":"");

      const userPrompt = "Draft "+instruction+nl+nl+"Available information:"+nl+context+nl+nl+"Important: Use [placeholder] format for any missing details. Today's date for reference: "+new Date().toLocaleDateString("en-GB")+". Always complete the full letter.";

      const res = await authedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:3000,stream:false,
          system:systemPrompt,
          messages:[{role:"user",content:userPrompt}]
        })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(text) { setLetterOutput(text); setLetterSources(letterSources); }
      else { setAiError("Failed to generate letter. Please try again."); }
    } catch(e) { setAiError("Error: "+e.message); }
    setAiProcessing(false);
  };

  // "Conclude investigation" used to just concatenate each investigation
  // meeting's raw record (itself a 3-section AI output including a literal
  // "## Meeting Dialogue" section) under an "Investigation Report" heading
  // — no synthesis, no findings, no recommendation, just meeting notes
  // wearing a report's name. This generates the report handleLetter's
  // "investigation-report" prompt was already designed to produce
  // elsewhere (background, allegations investigated, findings per
  // allegation, recommendation) — but feeds it the FULL text of every
  // investigation meeting rather than handleLetter's generic ~100-char-
  // per-meeting context summary, since a real investigation report has to
  // reflect actual findings, not truncated paraphrase.
  // ── One-Click Investigation Report — Phase 9 ──
  // Restructured from one free-text prompt into the spec's full section
  // list, organised into three explicitly-labelled parts so Evidence / AI
  // interpretation / HR conclusions read as visually distinct in
  // MDRenderer (## for the three parts, ### for subsections — MDRenderer
  // was stripping all markdown headers to plain paragraphs before this
  // phase, so that got a small, generally-useful fix rather than building
  // a report-specific renderer). Findings by allegation, conflicting
  // accounts, and the recommended next step aren't re-derived from
  // scratch — they carry forward what Phases 1/3/6 already found (real
  // evidence stance links, real inconsistency signals, the real next-
  // action recommendation) as input context, same "surface what Compass
  // already knows" pattern used in Phase 10's prep enhancement.
  const concludeInvestigation = async (caseId) => {
    const cs = cases.find(x=>x.id===caseId);
    if(!cs) return;
    const invMeetings = (cs.meetings||[]).filter(m=>(m.type||"").toLowerCase().includes("investigation")&&m.record);
    if(!invMeetings.length) return;
    setConcludingInvestigation(true);
    try {
      const nl = String.fromCharCode(10);
      const meetingContent = invMeetings.map((m,i)=>"Investigation meeting "+(i+1)+" — "+m.date+nl+m.record).join(nl+nl+"---"+nl+nl);
      const evidenceList = (cs.evidence||[]).map((e,i)=>(i+1)+". "+e.name+" ("+e.type+", "+e.date+")").join(nl);

      const caseAllegations = allegationsForCase(allegations, caseId);
      const allegationContext = caseAllegations.map(a => {
        const linked = evidenceForAllegation(cs.evidence||[], a.id);
        const supporting = linked.filter(ev=>ev.stance==="supports").map(ev=>ev.name);
        const contrary = linked.filter(ev=>ev.stance==="contradicts").map(ev=>ev.name);
        return `- "${a.title}"${a.description?": "+a.description:""}\n  Current status: ${allegationStatusMeta(a.status).label}\n  Supporting evidence: ${supporting.join(", ")||"none linked"}\n  Contrary evidence: ${contrary.join(", ")||"none linked"}\n  Employee response: ${a.employeeResponse||"not recorded"}\n  Witness evidence: ${a.witnessEvidence||"not recorded"}`;
      }).join(nl+nl);

      const openQuestions = openSignalsForCase(caseSignals, caseId, "unanswered_question");
      const inconsistencies = signalsForCase(caseSignals, caseId).filter(s=>s.type==="inconsistency");
      const nextAction = openSignalsForCase(caseSignals, caseId, "next_action")[0];

      const systemPrompt = "You are a senior UK employment lawyer and HR advisor with 20 years of experience, drafting a formal internal investigation report. Follow ACAS Code of Practice. Produce the report using EXACTLY the section structure given, using ## for the three PART headers and ### for subsections within them — this structure is what keeps evidence, AI interpretation, and the HR decision visually separate for the reader, so do not merge or reorder it. PART 1 must contain only what is actually in the record — no interpretation. PART 2 is explicitly your analysis — say so, and never state a finding as an established fact where the record is silent or disputed. PART 3 must recommend only a procedural next step, never a sanction, disciplinary outcome, or finding of guilt — that decision belongs solely to the responsible HR manager. Where a detail is genuinely unknown, say so rather than inventing it. Output only the document itself, no preamble.";
      const userPrompt = "Employee: "+cs.employeeName+nl
        +"Case type: "+(cs.caseType||"HR Matter")+nl
        +(cs.description?"Case description: "+cs.description+nl:"")
        +(evidenceList?"Evidence gathered:"+nl+evidenceList+nl:"")
        +(allegationContext?nl+"ALLEGATIONS ON RECORD:"+nl+allegationContext+nl:"")
        +(openQuestions.length?nl+"UNANSWERED QUESTIONS ALREADY IDENTIFIED (carry into Outstanding Issues):"+nl+openQuestions.map(q=>"- "+q.title).join(nl)+nl:"")
        +(inconsistencies.length?nl+"POTENTIAL INCONSISTENCIES ALREADY IDENTIFIED (carry into Conflicting Accounts):"+nl+inconsistencies.map(s=>"- "+s.title+(s.reasoning?" — "+s.reasoning:"")).join(nl)+nl:"")
        +(nextAction?nl+"COMPASS'S CURRENT NEXT-STEP RECOMMENDATION (carry into Recommended Procedural Next Step, unless the investigation record clearly supersedes it):"+nl+"- "+nextAction.title+(nextAction.reasoning?" — "+nextAction.reasoning:"")+nl:"")
        +nl+"Investigation meeting records (full):"+nl+meetingContent+nl+nl
        +"Today's date for reference: "+new Date().toLocaleDateString("en-GB")+"."+nl+nl
        +"Produce the report with exactly this structure:"+nl
        +"## Executive Summary"+nl
        +"## PART 1 — Evidence on Record"+nl
        +"### Background"+nl+"### Scope of Investigation"+nl+"### Allegations"+nl+"### Investigation Undertaken"+nl+"### People Interviewed"+nl+"### Evidence Considered"+nl+"### Employee Responses"+nl+"### Witness Evidence"+nl
        +"## PART 2 — Compass Analysis (advisory interpretation, not a finding)"+nl
        +"### Findings by Allegation (for each: supporting evidence, contrary evidence, and whether the allegation currently appears upheld / not upheld / unable to determine)"+nl+"### Conflicting Accounts"+nl+"### Matters That Could Not Be Established"+nl+"### Outstanding Issues"+nl
        +"## PART 3 — For HR Decision"+nl
        +"### Recommended Procedural Next Step"+nl
        +"End PART 3 with one line making clear that the final finding, sanction, and outcome decision rest with the responsible HR manager, not with this report.";
      const res = await authedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:3400,stream:false,
          system:systemPrompt,
          messages:[{role:"user",content:userPrompt}]
        })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(text) {
        saveCases(cases.map(x=>x.id===caseId?{...x,investigationReport:text,investigationReportDate:new Date().toISOString(),stage:"inv_report"}:x));
        audit("Investigation report generated", cs.employeeName);
        showToast("Investigation report generated");
        if(invMeetings.length>=2) generateInconsistencies(cs, true);
      } else {
        showToast("Failed to generate investigation report", "error");
      }
    } catch(e) {
      console.error("concludeInvestigation error:", e);
      showToast("Error generating investigation report", "error");
    }
    setConcludingInvestigation(false);
  };

  // Manager Enablement (Phase 4, MP10, §16) — "Submit investigation" is
  // the gated entry point every trigger (the next-step banner, MeetingsTab's
  // "Conclude investigation & generate report" button, and the assigned
  // investigator's own "Submit investigation" step) now calls instead of
  // concludeInvestigation directly. finalizeInvestigationSubmission does
  // the real work (still concludeInvestigation underneath — no duplicate
  // report-generation logic), plus the two things MP10 adds: a trackable
  // hr_review_request (reusing the existing pipeline rather than a new
  // one — MP11 later extends its status set beyond today's binary
  // pending/approved/rejected, it doesn't need to exist yet) and marking
  // the checklist's own "Submit findings to HR" step done, if a checklist
  // was ever seeded for this case.
  const finalizeInvestigationSubmission = (caseId) => {
    concludeInvestigation(caseId);
    requestHrReview("inv_report", caseId, null, "Investigation submitted for review", false);
    const submitTask = investigationChecklistTasks(caseTasks, caseId).find(t => t.name === INVESTIGATION_CHECKLIST_STEPS[INVESTIGATION_CHECKLIST_STEPS.length - 1].label);
    if(submitTask && submitTask.status !== "done") toggleCaseTaskDone(submitTask.id);
  };

  const attemptSubmitInvestigation = (caseId) => {
    const cs = cases.find(c=>c.id===caseId);
    if(!cs) return;
    const gaps = computeInvestigationQualityGaps(cs, allegations, caseTasks);
    setInvestigationQualitySubmitCaseId(caseId);
    if(gaps.length) { setInvestigationQualityGaps(gaps); setShowInvestigationQualityCheck(true); return; }
    finalizeInvestigationSubmission(caseId);
  };

  const proceedPastInvestigationQualityCheck = async () => {
    setShowInvestigationQualityCheck(false);
    const ok = await requestOverrideReason(investigationQualityGaps.join("; "), { caseId: investigationQualitySubmitCaseId, actionLabel: "Submitted investigation despite quality check gaps" });
    if(!ok) return;
    finalizeInvestigationSubmission(investigationQualitySubmitCaseId);
  };

  const createInvestigationQualityFollowUp = () => {
    createCaseTask(investigationQualitySubmitCaseId, { name: "Follow up on: "+investigationQualityGaps.join("; ") });
    setShowInvestigationQualityCheck(false);
    finalizeInvestigationSubmission(investigationQualitySubmitCaseId);
  };

  const restoreLetterVersion = (entry) => {
    if(letterOutput) setLetterHistory(h => [{type: activeLetter, text: letterOutput, ts: new Date().toISOString()}, ...h.filter(x=>x!==entry)].slice(0, 10));
    else setLetterHistory(h => h.filter(x=>x!==entry));
    setActiveLetter(entry.type);
    setLetterOutput(entry.text);
  };

  const MEETING_QUESTIONS = {
    "investigation": [
      "Can you tell me in your own words what happened?",
      "When did this incident take place?",
      "Were there any witnesses present?",
      "Have you been involved in any similar incidents before?",
      "Is there anything else you would like to add?",
    ],
    "disciplinary": [
      "Have you received and read the invitation letter and evidence?",
      "Do you understand the allegation(s) against you?",
      "Would you like to respond to the allegation(s)?",
      "Is there any mitigation you would like me to consider?",
      "Do you have any witnesses or evidence to present?",
    ],
    "grievance": [
      "Can you explain the nature of your grievance?",
      "When did the issue first arise?",
      "Have you tried to resolve this informally?",
      "Who else is involved or affected?",
      "What outcome are you hoping for?",
    ],
    "redundancy-atrisk": [
      "Do you understand why your role has been identified as at risk?",
      "Do you have any questions about the selection process?",
      "Are there any alternatives to redundancy you would like us to consider?",
      "Are you interested in any alternative roles within the organisation?",
      "Do you have any personal circumstances we should be aware of?",
    ],
    "redundancy-consult": [
      "Have you had a chance to consider the information provided?",
      "Do you have any suggestions to avoid redundancy?",
      "Have you looked at any of the alternative roles available?",
      "Do you have any questions about your redundancy pay entitlement?",
      "Is there anything else you would like to raise at this stage?",
    ],
    "appeal-disciplinary": [
      "What are your grounds for appeal?",
      "Do you believe the process was followed correctly?",
      "Do you consider the sanction to be disproportionate?",
      "Do you have any new evidence to present?",
      "Is there anything else you would like the panel to consider?",
    ],
    "return": [
      "How are you feeling now compared to when you were absent?",
      "Is there anything at work that contributed to your absence?",
      "Do you have any medical restrictions we should be aware of?",
      "Is there any support we can put in place to help your return?",
      "Are you aware of the company's absence management policy?",
    ],
    "pip-review": [
      "How do you feel your performance has been against the targets set?",
      "What progress have you made since our last meeting?",
      "Are there any obstacles preventing you from meeting your objectives?",
      "What support do you need from us going forward?",
      "Do you have any concerns about the targets or timescales?",
    ],
    "informal": [
      "How are things going generally?",
      "Is there anything you would like to raise or discuss?",
      "How are you finding your workload?",
      "Is there any support I can provide?",
      "Any questions or concerns you would like to discuss?",
    ],
  };


  const editRecord = async (instruction) => {
    if(!instruction.trim()||!reviewOutput) return;
    setEditProcessing(true);
    try {
      const res = await authedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2000,stream:false,
          system:"You are a UK HR documentation specialist. Edit the meeting record exactly as instructed. Keep the same format and sections. Output only the complete updated record with no preamble or explanation.",
          messages:[{role:"user",content:"Current record:"+String.fromCharCode(10)+reviewOutput+String.fromCharCode(10)+String.fromCharCode(10)+"Instruction: "+instruction+String.fromCharCode(10)+String.fromCharCode(10)+"Output the complete updated record only."}]
        })});
      const d = await res.json();
      const txt = (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(txt) setReviewOutput(txt);
      setEditInstruction("");
    } catch(e){}
    setEditProcessing(false);
  };


  const ACAS_TEMPLATES = {
    "investigation": ["Explain purpose of investigation meeting","Ask employee to describe events in their own words","Establish timeline of events","Identify any witnesses","Ask if there is anything else they wish to add","Inform of next steps"],
    "disciplinary": ["Confirm employee received invitation and evidence","Read out the allegation(s)","Ask employee to respond to each allegation","Hear any mitigation","Ask if employee has any witnesses or evidence","Explain right of appeal"],
    "grievance": ["Ask employee to explain their grievance in full","Establish key facts and dates","Ask who else is involved","Ask what outcome they are seeking","Explore any previous attempts to resolve","Explain next steps and timescales"],
    "redundancy-atrisk": ["Explain business reason for redundancy proposal","Confirm role is at risk not the person","Explain selection criteria if applicable","Ask for employee views on alternatives","Discuss suitable alternative vacancies","Confirm consultation period and next meeting date"],
    "return": ["Welcome employee back","Ask how they are feeling","Discuss any ongoing health concerns","Review any fit note restrictions","Agree any reasonable adjustments","Confirm return to work plan"],
    "appeal-disciplinary": ["Confirm grounds of appeal","Allow employee to present their case","Review original decision and process","Consider any new evidence","Adjourn to make decision","Communicate outcome"],
    "pip-review": ["Review objectives set at last meeting","Discuss progress against each objective","Identify any support needed","Set objectives for next review period","Confirm consequences if improvement not achieved","Agree review date"],
    "informal": ["Check in on wellbeing","Discuss workload and priorities","Raise any concerns","Agree any actions","Confirm support available"],
  };


  const shareRecord = async (email) => {
    if(!email||!reviewOutput) return;
    setShareProcessing(true);
    try {
      await authedFetch("/api/send-letter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          to:email,
          subject:(meetingType?.label||"Meeting")+" Record - "+caseInfo.employee,
          html:"<div style='font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px'><h2 style='color:#7C5CFC'>Compass HR</h2><h3>"+( meetingType?.label||"Meeting")+" Record</h3><p><strong>Employee:</strong> "+caseInfo.employee+"</p><p><strong>Date:</strong> "+caseInfo.date+"</p><hr/><div style='white-space:pre-wrap;font-size:14px;line-height:1.6'>"+reviewOutput+"</div><p style='color:#999;font-size:12px;margin-top:20px'>Sent via Compass HR | Private and Confidential</p></div>"
        })});
      showToast("Record shared with "+email);
      setShowShareModal(false);
      setShareEmail("");
    } catch(e){ showToast("Failed to share record","error"); }
    setShareProcessing(false);
  };


  const sendHomeChat = async () => {
    if(!homeChatInput.trim()||homeChatLoading) return;
    const question = homeChatInput.trim();
    setHomeChatInput("");
    setHomeChat(h=>[...h,{role:"user",content:question}]);
    setHomeChatLoading(true);
    try {
      const res = await authedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-6",max_tokens:600,stream:false,
          system:"You are Compass, a senior UK HR advisor and employment lawyer. Answer questions directly and practically, as a trusted senior colleague would. Reference ACAS Code of Practice, ERA 1996, EqA 2010 and other relevant legislation where appropriate. Be concise, warm and human — never robotic or overly formal. No markdown headers or asterisks. Use plain prose or short bullet points.",
          messages:[...homeChat.map(m=>({role:m.role,content:m.content})),{role:"user",content:question}]
        })});
      const d = await res.json();
      const txt = (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(txt) setHomeChat(h=>[...h,{role:"assistant",content:txt}]);
    } catch(e){}
    setHomeChatLoading(false);
  };


  const getCaseStatus = (cs) => {
    const meetings = cs.meetings || [];
    const types = meetings.map(m => (m.type || "").toLowerCase());
    const hasOutcomeLetter = meetings.some(m => m.letterOutput);
    const hasSigned = meetings.some(m => m.signStatus === "signed");
    const hasPending = meetings.some(m => m.signStatus === "pending");

    // cs.status was never set anywhere — every closed-case transition in
    // this app (bulk close, appeal-window close, "Close case" buttons)
    // writes cs.stage, not cs.status — so this check never matched and a
    // closed case fell through to whatever heuristic below happened to
    // fire instead, sometimes as misleading as "Open — no meetings yet".
    if(getCaseStage(cs) === "closed") return {label:"Closed", color:"#6B6375", bg:"#F5F1EA"};
    if(hasSigned) return {label:"Signed & closed", color:"#1A7A4A", bg:"#E8F5EE"};
    if(hasOutcomeLetter && hasPending) return {label:"Outcome — awaiting signature", color:"#B87520", bg:"#FEF5E7"};
    if(hasOutcomeLetter) return {label:"Outcome issued", color:"#1A7A4A", bg:"#E8F5EE"};
    if(types.some(t=>t.includes("appeal"))) return {label:"Appeal in progress", color:"#C84B2F", bg:"#FEF0EB"};
    if(types.some(t=>t.includes("disciplinary"))) return {label:"Disciplinary in progress", color:"#C84B2F", bg:"#FEF0EB"};
    if(types.some(t=>t.includes("grievance"))) return {label:"Grievance in progress", color:"#B87520", bg:"#FEF5E7"};
    if(types.some(t=>t.includes("redundancy"))) return {label:"Redundancy consultation", color:"#B87520", bg:"#FEF5E7"};
    if(types.some(t=>t.includes("investigation"))) return {label:"Under investigation", color:"#7C5CFC", bg:"#EDE8FF"};
    if(types.some(t=>t.includes("informal")||t.includes("return")||t.includes("performance")||t.includes("pip"))) return {label:"Informal stage", color:"#6B6375", bg:"#F5F1EA"};
    if(meetings.length === 0) return {label:"Open — no meetings yet", color:"#7C5CFC", bg:"#EDE8FF"};
    return {label:"In progress", color:"#6B6375", bg:"#F5F1EA"};
  };

  const needsInvitation = (meetingTypeId) => {
    return ["disciplinary","grievance","redundancy-atrisk","appeal-disciplinary","pip-review"].includes(meetingTypeId);
  };


  // Toggles a single item in a meeting's deterministic nextSteps checklist
  // (NEXT_STEPS_MAP-derived, App.jsx:1468-1470) — the same array
  // computeDueSoon already reads via the "next_step" category, so ticking
  // an item off here removes it from the overdue banner/Settings list/
  // digest email with no changes needed to any of those.
  const toggleNextStepDone = (caseId, meetingId, stepIndex) => {
    saveCases(cases.map(x=>x.id===caseId?{...x,meetings:x.meetings.map(m=>m.id===meetingId?{...m,nextSteps:(m.nextSteps||[]).map((s,i)=>i===stepIndex?{...s,done:!s.done}:s)}:m)}:x), caseId);
  };

  const fmtDate = (d) => {
    if(!d) return "";
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d; // already UK format
    if(/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y,m,day] = d.split("-");
      return day+"/"+m+"/"+y;
    }
    try { return new Date(d).toLocaleDateString("en-GB"); } catch(e) { return d; }
  };


  const getProceedingTitle = (cs) => {
    if(cs.proceedingTitle) return cs.proceedingTitle;
    const meetings = cs.meetings||[];
    const types = meetings.map(m=>(m.type||"").toLowerCase());
    const typeLabel = cs.caseType ? ({misconduct:"Misconduct",grievance:"Grievance",performance:"Performance",attendance:"Attendance",redundancy:"Redundancy",discrimination:"Discrimination",whistleblowing:"Whistleblowing",other:"HR Matter"}[cs.caseType]||cs.caseType)
      : types.some(t=>t.includes("disciplinary"))?"Disciplinary"
      : types.some(t=>t.includes("investigation"))?"Investigation"
      : types.some(t=>t.includes("grievance"))?"Grievance"
      : types.some(t=>t.includes("redundancy"))?"Redundancy"
      : types.some(t=>t.includes("appeal"))?"Appeal"
      : "HR Matter";
    const desc = cs.description ? " — "+cs.description.slice(0,50)+(cs.description.length>50?"...":"") : "";
    const date = cs.dateReceived||cs.createdAt ? new Date(cs.dateReceived||cs.createdAt).toLocaleDateString("en-GB",{month:"short",year:"numeric"}) : "";
    return typeLabel+(desc||"")+(date?" · "+date:"");
  };


  return (
    <div style={{fontFamily:"DM Sans,system-ui,sans-serif",minHeight:"100vh",background:"#FDFAF5",color:"#1A1535",display:"flex"}}>
      <style>{`
        *{box-sizing:border-box;}::selection{background:#7C5CFC33;}
        input,textarea{font-family:DM Sans,system-ui,sans-serif;color:#1A1535;}
        input[type="date"]{color-scheme:light;cursor:pointer;}
        input[type="date"]::-webkit-calendar-picker-indicator{opacity:0;position:absolute;right:0;width:40px;height:100%;cursor:pointer;}
        .date-wrap{position:relative;display:block;}
        .date-wrap svg{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;}
        .pu{animation:pu 1.4s infinite;}@keyframes pu{0%,100%{opacity:1}50%{opacity:0.3}}
        .fu{animation:fu 0.2s ease;}@keyframes fu{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        button{cursor:pointer;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:#FDFAF5;}::-webkit-scrollbar-thumb{background:#E8E0D0;border-radius:2px;}
      `}</style>

      {showShareModal&&(
        <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape"){setShowShareModal(false);setShareEmail("");}}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:420}}>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Share meeting record</h3>
            <p style={{fontSize:13,color:"#9B9098",marginBottom:20}}>Send the meeting record to an email address</p>
            <input value={shareEmail} onChange={e=>setShareEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&shareRecord(shareEmail)}
              placeholder="Email address"
              type="email"
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#1A1535",outline:"none",marginBottom:16,boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={()=>shareRecord(shareEmail)} disabled={shareProcessing||!shareEmail.trim()} style={{flex:1}}>
                {shareProcessing?"Sending...":"Send"}
              </Btn>
              <Btn variant="ghost" onClick={()=>{setShowShareModal(false);setShareEmail("");}} style={{flex:1}}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {showLinkCase&&appealDetected&&(
        <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape")setShowLinkCase(false);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:isMobile?"calc(100vw - 32px)":480}}>
            <div style={{fontSize:11,color:"#7C5CFC",fontWeight:600,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Appeal detected</div>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Link to an existing case?</h3>
            <p style={{fontSize:13,color:"#6B6375",marginBottom:20}}>This looks like an appeal. Would you like to link it to an existing case so the full proceeding is tracked together?</p>
            {(() => { const linkCandidates = appealLinkCandidates(cases, caseInfo.employee); return linkCandidates.length>0?(
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                {linkCandidates.map(cs=>(
                  <button key={cs.id} onClick={()=>{
                    const meeting = {
                      id: Date.now().toString(),
                      type: meetingType?.label||"Appeal",
                      date: caseInfo.date||new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}),
                      manager: caseInfo.manager,
                      participants,
                      transcript: transcript.filter(u=>!u.pending),
                      record: reviewOutput,
                      letterOutput,
                      letterApprovedBy: letterIsApproved ? letterApproval.by : null,
                      letterApprovedAt: letterIsApproved ? letterApproval.at : null,
                      riskScore,
                      nextSteps,
                      prediction,
                      letterTracking: {},
                      savedAt: new Date().toISOString(),
                      savedBy: currentUser?.name||"HR Manager",
                      signId, signStatus,
                    };
                    // Explicitly move the case to the appeal stage — the
                    // most common real case here is appealing a case
                    // that's already closed, and getCaseStage() returns
                    // "closed" unconditionally for cs.stage==="closed"
                    // before any heuristic ever runs, so without this the
                    // case would silently stay shown as closed even with
                    // a live appeal meeting now on file.
                    // Scoped to just this case (changedId) — an unscoped
                    // sync-all here re-saves every case in the org, and
                    // saveCaseToDB's optimistic-concurrency check reloads
                    // ALL cases from the DB the moment any single one of
                    // them has a stale updatedAt (near-guaranteed in an
                    // org with hundreds of cases and ongoing activity),
                    // silently reverting this exact update before it lands.
                    saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"appeal",meetings:[...x.meetings,meeting]}:x), cs.id);
                    setCaseInfo(p=>({...p,employee:cs.employeeName,email:cs.email||""}));
                    setShowLinkCase(false);
                    setAppealDetected(false);
                    appealDetectedRef.current=false;
                    showToast("Appeal linked to "+cs.employeeName);
                  }} style={{background:"#F5F1EA",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",fontSize:14,color:"#1A1535",cursor:"pointer",textAlign:"left",fontFamily:"DM Serif Display,Georgia,serif"}}>
                    <div style={{fontWeight:600}}>{cs.employeeName}</div>
                    <div style={{fontSize:11,color:"#6B6880",marginTop:2}}>{cs.meetings.length} meeting{cs.meetings.length!==1?"s":""} · Latest: {cs.meetings[cs.meetings.length-1]?.type}</div>
                  </button>
                ))}
              </div>
            ):(
              <div style={{fontSize:13,color:"#6B6880",marginBottom:16}}>No existing case found for {caseInfo.employee||"this employee"}.</div>
            ); })()}
            <Btn variant="ghost" onClick={()=>{setShowLinkCase(false);setAppealDetected(false);appealDetectedRef.current=false;}} style={{width:"100%"}}>Skip</Btn>
          </div>
        </div>
      )}

      {showLetterModal&&(
        <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape")setShowLetterModal(false);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:isMobile?"calc(100vw - 32px)":480}}>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Draft outcome letter</h3>
            <p style={{fontSize:13,color:"#6B6375",marginBottom:24}}>How would you like to create the outcome letter?</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={()=>{setShowLetterModal(false);handleLetter(pendingLetterTypeRef.current||"outcome");}}
                style={{background:"#7C5CFC",border:"none",borderRadius:10,padding:"16px 20px",cursor:"pointer",textAlign:"left"}}>
                <div style={{fontSize:14,color:"#fff",fontWeight:600,marginBottom:4}}>Generate with Compass</div>
                <div style={{fontSize:12,color:"#7C5CFC"}}>Compass drafts a letter based on the meeting record and UK employment law</div>
              </button>
              <button onClick={()=>{setShowLetterModal(false);setScreen(SCREENS.TEMPLATES);setActiveLetter("outcome");}}
                style={{background:"#F5F1EA",border:"1px solid #E8E0D0",borderRadius:10,padding:"16px 20px",cursor:"pointer",textAlign:"left"}}>
                <div style={{fontSize:14,color:"#1A1535",fontWeight:600,marginBottom:4}}>Use a template</div>
                <div style={{fontSize:12,color:"#6B6880"}}>Pick from your uploaded templates and Compass will populate it with meeting details</div>
              </button>
            </div>
            <Btn variant="ghost" onClick={()=>setShowLetterModal(false)} style={{width:"100%",marginTop:16}}>Cancel</Btn>
          </div>
        </div>
      )}

      {showEmailLetter&&(
        <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape"){setShowEmailLetter(false);setEmailLetterTo("");}}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:440}}>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Email letter</h3>
            <p style={{fontSize:13,color:"#6B6375",marginBottom:20}}>The letter will be sent as email body and also available to download as PDF.</p>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Recipient email</label>
            <input value={emailLetterTo} onChange={e=>setEmailLetterTo(e.target.value)}
              placeholder="employee@company.com" autoFocus
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",fontSize:14,outline:"none",color:"#1A1535",boxSizing:"border-box",marginBottom:16}}/>
            <div style={{display:"flex",gap:10}}>
              <Btn onClick={async()=>{
                if(!emailLetterTo.includes("@")) return;
                try {
                  const r = await authedFetch("/api/send-letter",{method:"POST",headers:{"Content-Type":"application/json"},
                    body:JSON.stringify({
                      to: emailLetterTo,
                      subject: (meetingType?.label||"Meeting")+" Outcome Letter - "+(caseInfo.employee||"Employee"),
                      body: letterOutput,
                      employeeName: caseInfo.employee||"Employee",
                      meetingType: meetingType?.label||"Meeting",
                      managerName: caseInfo.manager||"HR Manager",
                      date: (caseInfo.date&&/^\d{4}-\d{2}-\d{2}$/.test(caseInfo.date)?caseInfo.date.split("-").reverse().join("/"):caseInfo.date)||new Date().toLocaleDateString("en-GB")
                    })});
                  const d = await r.json();
                  if(d.success){ showToast("Letter sent to "+emailLetterTo); setShowEmailLetter(false); setEmailLetterTo(""); }
                  else showToast("Failed: "+d.error, "error");
                } catch(e){ showToast("Error: "+e.message, "error"); }
              }} disabled={!emailLetterTo.includes("@")} style={{flex:1}}>Send email</Btn>
              <Btn variant="ghost" onClick={()=>{setShowEmailLetter(false);setEmailLetterTo("");}} style={{flex:1}}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {inviteLink&&(
        <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape")setInviteLink(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:480}}>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Share invite with {inviteLink.name}</h3>
            <p style={{fontSize:13,color:"#6B6375",marginBottom:20}}>Share this link or invite code with {inviteLink.name} ({inviteLink.email}):</p>
            <div style={{background:"#F5F1EA",borderRadius:8,padding:"12px 16px",marginBottom:12}}>
              <div style={{fontSize:10,color:"#6B6880",marginBottom:4}}>Invite link</div>
              <div style={{fontSize:12,color:"#7C5CFC",wordBreak:"break-all"}}>{inviteLink.link}</div>
            </div>
            <div style={{background:"#F5F1EA",borderRadius:8,padding:"12px 16px",marginBottom:20}}>
              <div style={{fontSize:10,color:"#6B6880",marginBottom:4}}>Invite code</div>
              <div style={{fontFamily:"JetBrains Mono,monospace",fontSize:20,color:"#7C5CFC",letterSpacing:4,fontWeight:700}}>{inviteLink.code}</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={()=>navigator.clipboard.writeText(inviteLink.link)} style={{flex:1}}>Copy link</Btn>
              <Btn variant="ghost" onClick={()=>setInviteLink(null)} style={{flex:1}}>Done</Btn>
            </div>
          </div>
        </div>
      )}

      {showSignModal&&(
        <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape")setShowSignModal(false);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:440}}>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Send for signature</h3>
            <p style={{fontSize:13,color:"#6B6375",marginBottom:20}}>The employee will receive an email with a link to read and sign the meeting record.</p>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Employee email</label>
            <input value={signEmail} onChange={e=>setSignEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&signEmail.includes("@")&&(sendForSignature(signEmail),setShowSignModal(false),setSignEmail(""))}
              placeholder="employee@company.com" autoFocus
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",fontSize:14,outline:"none",color:"#1A1535",boxSizing:"border-box",marginBottom:16}}/>
            <div style={{display:"flex",gap:10}}>
              <Btn onClick={()=>{if(signEmail.includes("@")){sendForSignature(signEmail);setShowSignModal(false);setSignEmail("");}}}
                disabled={!signEmail.includes("@")}
                style={{flex:1}}>
                Send email
              </Btn>
              <Btn variant="ghost" onClick={()=>{setShowSignModal(false);setSignEmail("");}} style={{flex:1}}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {showSigPad && <SignaturePad onSave={handleSaveSignature} onClose={()=>{setShowSigPad(false);setPendingSend(null);}} />}

      {/* Case file prompt */}
      {showCasePrompt&&(
        <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape")closeCasePrompt();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#FFFFFF",borderRadius:16,padding:28,width:"100%",maxWidth:520,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div>
                <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820",fontWeight:400}}>New case</div>
                <div style={{fontSize:12,color:"#9B9098",marginTop:2}}>Log a new HR case and employee details</div>
              </div>
              <button onClick={closeCasePrompt} aria-label="Close" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9B9098",lineHeight:1}}>×</button>
            </div>

            {/* Employee name with lookup */}
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Employee name</label>
              <input
                value={casePromptName}
                onChange={e=>{
                  setCasePromptName(e.target.value);
                  const rec = getEmployeeRecord(e.target.value.trim());
                  if(rec) {
                    setNewCaseJobTitle(rec.jobTitle||"");
                    setNewCaseStartDate(rec.startDate||"");
                    setNewCaseLocation(rec.location||"");
                  }
                }}
                placeholder="Full name"
                list="employee-suggestions"
                style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}
              />
              <datalist id="employee-suggestions">
                {[...new Set(cases.map(c=>c.employeeName).filter(Boolean))].map(n=><option key={n} value={n}/>)}
              </datalist>
              {getEmployeeRecord(casePromptName.trim())&&<div style={{fontSize:11,color:"#1A7A4A",marginTop:4}}>Employee record found — details pre-filled</div>}
            </div>

            {/* Job title + start date */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Job title</label>
                <input value={newCaseJobTitle} onChange={e=>setNewCaseJobTitle(e.target.value)} placeholder="e.g. Sales Manager" style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Start date</label>
                <input type="date" value={newCaseStartDate} onChange={e=>setNewCaseStartDate(e.target.value)} onClick={e=>e.currentTarget.showPicker?.()} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box",colorScheme:"light",cursor:"pointer"}}/>
              </div>
            </div>

            {/* Location + case type */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Location</label>
                <select value={newCaseLocation} onChange={e=>setNewCaseLocation(e.target.value)} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:newCaseLocation?"#1C1820":"#9B9098",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
                  <option value="">Select location…</option>
                  {locations.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
                  <option value="__other__">Other / not listed</option>
                </select>
                {newCaseLocation==="__other__"&&<input value={newCaseLocationOther} onChange={e=>setNewCaseLocationOther(e.target.value)} placeholder="Enter location" style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box",marginTop:6}}/>}
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Case type</label>
                <select value={newCaseType} onChange={e=>setNewCaseType(e.target.value)} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
                  <option value="">Select type…</option>
                  {["Misconduct","Grievance","Performance","Absence","Attendance/sickness","Long-term sickness","Redundancy","Appeal","Investigation","Disciplinary","Probation","Capability","Flexible working","Other"].map(t=><option key={t} value={t.toLowerCase()}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Owner + priority */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Case owner</label>
                <select value={newCaseOwnerId} onChange={e=>setNewCaseOwnerId(e.target.value)} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
                  <option value="">{currentUser?.name||"Me"} (default)</option>
                  {orgMembers.filter(m=>m.user_id!==user?.id).map(m=><option key={m.id} value={m.user_id}>{m.name}{m.job_title?" ("+m.job_title+")":""}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Priority</label>
                <select value={newCasePriority} onChange={e=>setNewCasePriority(e.target.value)} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Brief description <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              <textarea value={newCaseDescription} onChange={e=>setNewCaseDescription(e.target.value)} placeholder="Brief summary of the issue…" rows={2} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
            </div>

            {/* Evidence — staged locally and attached once the case is created below */}
            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Evidence <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              {newCaseEvidence.map((ev,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F5F1EA"}}>
                  <span style={{fontSize:12,color:"#1A1535"}}>{ev.name}</span>
                  <button onClick={()=>setNewCaseEvidence(list=>list.filter((_,j)=>j!==i))} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Remove</button>
                </div>
              ))}
              <div style={{marginTop:newCaseEvidence.length>0?8:0}}>
                <EvidenceDropzone onFilesSelected={async files=>{
                  const items = await readEvidenceFiles(files, { addedBy: currentUser?.name||"HR Manager", onReject: msg=>showToast(msg,"error") });
                  if(items.length) setNewCaseEvidence(list=>[...list, ...items]);
                }}/>
              </div>
            </div>

            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={closeCasePrompt} style={{fontSize:13,padding:"10px 20px",border:"1px solid #E8E0D0",borderRadius:8,background:"#FFFFFF",cursor:"pointer",color:"#6B6375",fontFamily:"DM Sans,system-ui,sans-serif"}}>Cancel</button>
              <button
                disabled={!casePromptName.trim()}
                onClick={()=>{
                  const name = casePromptName.trim();
                  if(!name) return;
                  // Save/update employee record
                  upsertEmployeeRecord(name,{jobTitle:newCaseJobTitle,startDate:newCaseStartDate,location:newCaseLocation});
                  // Create case
                  const newCase = {
                    id: crypto.randomUUID(),
                    employeeName: name,
                    email: "",
                    caseType: newCaseType,
                    description: newCaseDescription,
                    dateReceived: new Date().toISOString().split("T")[0],
                    // No explicit stage — same as a case created by starting
                    // a meeting first. getCaseStage() infers "intake" for a
                    // fresh case with no meetings, which is the one stage
                    // getNextStep() actually has a recommendation for
                    // ("Schedule investigation meeting"). Hardcoding
                    // stage:"open" here used to permanently stick every
                    // case created via this form at a stage getNextStep's
                    // switch doesn't recognise (it falls to the default
                    // null branch), so Case Copilot never showed any
                    // guidance for it at all, from creation onward — the
                    // most prominent "create a case" entry point on Home
                    // silently produced cases with no next-step guidance,
                    // ever, unlike cases created by starting a meeting first.
                    meetings: [],
                    evidence: newCaseEvidence,
                    urgency: "normal",
                    jobTitle: newCaseJobTitle,
                    startDate: newCaseStartDate,
                    location: newCaseLocation==="__other__"?newCaseLocationOther:newCaseLocation,
                    // The location select's value is the location's name
                    // (kept as-is — it also feeds upsertEmployeeRecord and
                    // the case's own display text below, both of which
                    // expect text, not a uuid), so the real FK the Cases
                    // list's location filter reads is looked up separately
                    // rather than by changing what the select stores.
                    locationId: locations.find(l=>l.name===newCaseLocation)?.id || null,
                    manager: newCaseOwnerId ? (orgMembers.find(m=>m.user_id===newCaseOwnerId)?.name || "") : (currentUser?.name || ""),
                    ownerId: newCaseOwnerId || user?.id || null,
                    priority: newCasePriority,
                  };
                  saveCases([...cases, newCase]);
                  // Process Intelligence (P18) — auto-initialise the
                  // default tasks from this process type's own org-
                  // configured template, if one exists. The rest of the
                  // template (required documents, suggested meetings,
                  // target days, suggested roles, linked policy) is
                  // informational only, rendered live from
                  // processTemplates by ProcessChecklistPanel — nothing
                  // else about it is copied onto the case itself.
                  const template = getTemplateForType(processTemplates, getProcessType(newCaseType).id);
                  (template?.default_tasks||[]).forEach(t => {
                    if(!t?.name) return;
                    createCaseTask(newCase.id, { name: t.name, owner: t.owner||"", dueDate: resolveDefaultTaskDueDate(t.dayOffset, newCase.dateReceived) });
                  });
                  if(newCaseOwnerId && org?.id) {
                    supabase.from("case_access").upsert({
                      case_id: newCase.id, user_id: newCaseOwnerId, org_id: org.id,
                      role: "case_owner", granted_by: user?.id,
                    }).then(({error})=>{ if(error) console.error("case_access write failed:", error); });
                  }
                  setActiveCaseId(newCase.id);
                  setActiveCaseStage("investigation");
                  closeCasePrompt();
                  setScreen(SCREENS.CASE_VIEW);
                  showToast("Case created");
                }}
                style={{fontSize:13,padding:"10px 20px",background:!casePromptName.trim()?"#B8A9F8":"#7C5CFC",border:"none",borderRadius:8,color:"#fff",cursor:!casePromptName.trim()?"not-allowed":"pointer",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}
              >Create case</button>
            </div>
          </div>
        </div>
      )}

            {/* ── Toast notification ── */}
      {toast&&(
        <div style={{position:"fixed",bottom:isMobile?16:24,right:isMobile?16:24,left:isMobile?16:"auto",zIndex:3000,background:toast.type==="error"?"#FEF0EB":"#E8F5EE",border:`1px solid ${toast.type==="error"?"#C84B2F44":"#1A7A4A44"}`,borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 4px 16px rgba(26,21,53,0.14)",animation:"slideIn 0.2s ease",maxWidth:isMobile?"none":360,fontFamily:"DM Sans,system-ui,sans-serif"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:toast.type==="error"?"#C84B2F":"#1A7A4A",flexShrink:0}}/>
          <span style={{fontSize:14,color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif"}}>{toast.message}</span>
        </div>
      )}

      {confirmState&&(
        <ConfirmModal
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          danger={confirmState.danger}
          onConfirm={()=>{ confirmState.resolve(true); setConfirmState(null); }}
          onCancel={()=>{ confirmState.resolve(false); setConfirmState(null); }}
        />
      )}

      {promptState&&(
        <PromptModal
          title={promptState.title}
          message={promptState.message}
          fields={promptState.fields}
          confirmLabel={promptState.confirmLabel}
          cancelLabel={promptState.cancelLabel}
          onConfirm={(values)=>{ promptState.resolve(values); setPromptState(null); }}
          onCancel={()=>{ promptState.resolve(null); setPromptState(null); }}
        />
      )}

      {/* Explainability sweep (P19) — LetterScreen renders outside
          CaseViewScreen, which owns its own WhySourcesModal instance for
          case_signals; letterSources' refs are already fully self-
          contained (own label/detail/date), so resolveRef is just the
          identity function rather than a new lookup. */}
      {letterWhySignal&&(
        <WhySourcesModal title={letterWhySignal.title} reasoning={letterWhySignal.reasoning} sourceRefs={letterWhySignal.sourceRefs} resolveRef={ref=>ref} onClose={()=>setLetterWhySignal(null)} />
      )}

      {/* ── GDPR consent modal ── */}
      {showGdpr && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{maxWidth:520,width:"100%"}}>
            <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#7C5CFC",marginBottom:8,fontWeight:600}}>Data &amp; privacy</div>
            <p style={{fontSize:13,color:"#6B6375",lineHeight:1.8,marginBottom:16}}>
              Compass stores case files, employee records, organisation settings and the audit trail in a secure cloud database, shared with your organisation. Uploaded policies and your signature/letterhead stay in this browser only. Meeting text is sent to Anthropic's API to generate outputs.
            </p>
            <div style={{background:"#FDFAF5",borderRadius:8,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:1,marginBottom:10}}>WHAT IS STORED</div>
              {["Case files, meetings and evidence — stored in the cloud, shared with your organisation","Employee records and organisation settings — stored in the cloud, shared with your organisation","Company policies you upload — in your browser only","Your signature and letterhead — in your browser only","AI processing: meeting text is sent to Anthropic's API to generate outputs"].map((item,i)=>(
                <div key={i} style={{display:"flex",gap:8,marginBottom:6,fontSize:12,color:"#3D3560"}}>
                  <span style={{color:"#7C5CFC",flexShrink:0}}>·</span><span>{item}</span>
                </div>
              ))}
            </div>
            <div style={{background:"#FDFAF5",borderRadius:8,padding:"14px 16px",marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:1,marginBottom:8}}>YOUR RIGHTS</div>
              <div style={{fontSize:12,color:"#6B6375",lineHeight:1.7}}>You can export all your data or delete it at any time from Settings. Data is retained until you delete it. You are responsible for compliance with UK GDPR when processing employee data using this tool.</div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn onClick={()=>{setGdprAccepted(true);lsSet("compass_gdpr",true);setShowGdpr(false);}}>I understand — continue</Btn>
            </div>
          </Card>
        </div>
      )}

      {/* ── Onboarding overlay ── */}
      {showOnboard && !showGdpr && (
        <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape"){setShowOnboard(false);setOnboardDone(true);lsSet("compass_onboard",true);}}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1900,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{maxWidth:480,width:"100%"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontSize:10,color:"#6B6880",letterSpacing:1}}>{onboardStep+1} / {ONBOARD_STEPS.length}</div>
              <button onClick={()=>{setShowOnboard(false);setOnboardDone(true);lsSet("compass_onboard",true);}} style={{background:"none",border:"none",color:"#6B6880",fontSize:12,cursor:"pointer"}}>Skip</button>
            </div>
            <div style={{height:2,background:"#F5F1EA",borderRadius:1,marginBottom:20}}>
              <div style={{height:2,background:"#7C5CFC",borderRadius:1,width:`${((onboardStep+1)/ONBOARD_STEPS.length)*100}%`,transition:"width 0.3s"}}/>
            </div>
            <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#1A1535",marginBottom:10,fontWeight:600}}>{ONBOARD_STEPS[onboardStep].title}</div>
            <p style={{fontSize:14,color:"#6B6375",lineHeight:1.8,marginBottom:24}}>{ONBOARD_STEPS[onboardStep].body}</p>
            <Btn onClick={()=>{
              if(onboardStep<ONBOARD_STEPS.length-1) setOnboardStep(s=>s+1);
              else { setShowOnboard(false); setOnboardDone(true); lsSet("compass_onboard",true); }
            }}>{ONBOARD_STEPS[onboardStep].action}</Btn>
          </Card>
        </div>
      )}


      {/* ── SIDEBAR ── */}
      <AppSidebar
        screen={screen}
        setScreen={setScreen}
        cases={cases}
        getCaseStage={getCaseStage}
        isMobile={isMobile}
        showMobileNav={showMobileNav}
        setShowMobileNav={setShowMobileNav}
        meetingType={meetingType}
        caseInfo={caseInfo}
        org={org}
        availableOrgs={availableOrgs}
        switchOrg={switchOrg}
        onJoinAnotherOrg={onJoinAnotherOrg}
        currentUser={currentUser}
        auditLog={auditLog}
        onSignOut={onSignOut}
        isHR={isHR}
      />

      {/* ── Content column — everything else (deadline banner through every
          screen and modal below) lives in this flex column beside the
          sidebar. Closes at the very end of this component's return. ── */}
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",minHeight:"100vh"}}>

      {/* ── Deadline banner ── */}
      {dueSoon.some(d=>d.overdue)&&screen!==SCREENS.HOME&&(
        <div style={{background:"#FEF0EB",borderBottom:"1px solid #E8622A33",padding:"8px 20px"}}>
          <div style={{maxWidth:1440,margin:"0 auto",display:"flex",alignItems:"center",gap:12,fontSize:12}}>
            <span style={{color:"#C84B2F",fontWeight:600}}>Overdue actions:</span>
            {dueSoon.filter(d=>d.overdue).slice(0,3).map((d,i)=>(
              <span key={i} style={{color:"#3D3560"}}>{d.employeeName} — {d.label} <span style={{color:"#C84B2F"}}>({d.daysOverdue}d overdue)</span></span>
            ))}
            <button onClick={()=>setScreen(SCREENS.DASHBOARD)} style={{background:"none",border:"none",color:"#C84B2F",fontSize:11,cursor:"pointer",marginLeft:"auto",textDecoration:"underline"}}>View all</button>
          </div>
        </div>
      )}

      {/* ══ HOME ══ */}
      {screen===SCREENS.HOME&&(
        <HomeScreen
          cases={cases}
          getCaseStage={getCaseStage}
          currentUser={currentUser}
          getNextStep={getNextStep}
          setMeetingSetup={setMeetingSetup}
          setScreen={setScreen}
          setShowCasePrompt={setShowCasePrompt}
          dueSoon={dueSoon}
          dashSearch={dashSearch}
          setDashSearch={setDashSearch}
          dashFilter={dashFilter}
          setDashFilter={setDashFilter}
          setActiveCaseId={setActiveCaseId}
          setActiveCaseStage={setActiveCaseStage}
          fmtDate={fmtDate}
          showToast={showToast}
          calendarConnected={calendarConnected}
          connectGoogleCalendar={connectGoogleCalendar}
          disconnectGoogleCalendar={disconnectGoogleCalendar}
          setSettingsSection={setSettingsSection}
          caseSignals={caseSignals}
          concernReferrals={concernReferrals}
          isHR={isHR}
          hrReviewRequests={hrReviewRequests}
          processTemplates={processTemplates}
        />
      )}

      {/* ══ ASK COMPASS (Phase 22 — Global Compass AI) ══ */}
      {screen===SCREENS.ASK_COMPASS&&(
        <GlobalAssistantScreen
          chatHistory={globalChatHistory}
          chatInput={globalChatInput}
          setChatInput={setGlobalChatInput}
          chatProcessing={globalChatProcessing}
          sendChat={sendGlobalChat}
          caseRef={globalChatCaseRef}
          setActiveCaseId={setActiveCaseId}
          setActiveCaseStage={setActiveCaseStage}
          setScreen={setScreen}
        />
      )}

      {/* ══ SAVE EMAIL TO CASE (Phase 24 — Email integration groundwork) ══ */}
      {screen===SCREENS.SAVE_EMAIL&&(
        <SaveEmailScreen
          cases={cases}
          extraction={emailExtraction}
          extractionLoading={emailExtractionLoading}
          onExtract={extractEmailDetails}
          onSave={saveEmailToCase}
          onClear={()=>setEmailExtraction(null)}
          mailConnected={mailConnected}
          mailboxEmail={mailboxEmail}
          onConnectMail={connectOutlookMail}
          onDisconnectMail={disconnectOutlookMail}
          inboxMessages={inboxMessages}
          inboxLoading={inboxLoading}
          onLoadInbox={loadInboxMessages}
          onPickMessage={pickInboxMessage}
        />
      )}

      {/* ══ HOME MEETING SETUP ══ */}
      {screen===SCREENS.HOME+"_meeting"&&(
        <HomeMeetingScreen meetingSetup={meetingSetup} setMeetingSetup={setMeetingSetup} orgMembers={orgMembers} getEmployeeRecord={getEmployeeRecord} cases={cases} getCaseStage={getCaseStage} activeCaseId={activeCaseId} setActiveCaseId={setActiveCaseId} needsInvitation={needsInvitation} setCaseInfo={setCaseInfo} setMeetingType={setMeetingType} setPendingLetterType={setPendingLetterType} setShowLetterModal={setShowLetterModal} setScreen={setScreen} setTranscript={setTranscript} setPrepNotes={setPrepNotes} setPrepQuestions={setPrepQuestions} setMeetingEvidenceSuggestions={setMeetingEvidenceSuggestions} setMeetingActionSuggestions={setMeetingActionSuggestions} setReviewOutput={setReviewOutput} setReviewOutputOriginal={setReviewOutputOriginal} setMeetingSummary={setMeetingSummary} setLetterOutput={setLetterOutput} setRiskScore={setRiskScore} setLiveChatHistory={setLiveChatHistory} setParticipants={setParticipants} setDismissedCoachingTipKeys={setDismissedCoachingTipKeys} fmtDate={fmtDate} startSession={startSession} />
      )}

            {screen===SCREENS.PEOPLE&&(
              <PeopleScreen cases={cases} setActivePerson={setActivePerson} setScreen={setScreen} setCaseInfo={setCaseInfo} setMeetingSetup={setMeetingSetup} />
            )}


      
      
      {/* ══ PERSON VIEW ══ */}
      {screen===SCREENS.PERSON_VIEW&&(
        <PersonViewScreen
          activePerson={activePerson}
          cases={cases}
          setScreen={setScreen}
          setMeetingSetup={setMeetingSetup}
          getEmployeeRecord={getEmployeeRecord}
          editingEmployeeRecord={editingEmployeeRecord}
          setEditingEmployeeRecord={setEditingEmployeeRecord}
          editJobTitle={editJobTitle}
          setEditJobTitle={setEditJobTitle}
          editStartDate={editStartDate}
          setEditStartDate={setEditStartDate}
          editLocation={editLocation}
          setEditLocation={setEditLocation}
          locations={locations}
          upsertEmployeeRecord={upsertEmployeeRecord}
          deleteEmployeeRecord={deleteEmployeeRecord}
          confirmDialog={confirmDialog}
          showToast={showToast}
          setActiveCaseId={setActiveCaseId}
          setActiveCaseStage={setActiveCaseStage}
          getCaseStatus={getCaseStatus}
          fmtDate={fmtDate}
          setReviewOutput={setReviewOutput}
          setMeetingType={setMeetingType}
          setCaseInfo={setCaseInfo}
          employmentProfileLoading={employmentProfileLoading}
          setEmploymentProfileLoading={setEmploymentProfileLoading}
          employmentProfileOutput={employmentProfileOutput}
          setEmploymentProfileOutput={setEmploymentProfileOutput}
          getCaseStage={getCaseStage}
          setLetterOutput={setLetterOutput}
          org={org}
          user={user}
          promptDialog={promptDialog}
        />
      )}

{/* ══ CASE VIEW ══ */}
      {screen===SCREENS.CASE_VIEW&&activeCaseId&&(
        <CaseViewScreen
          cases={cases}
          activeCaseId={activeCaseId}
          setScreen={setScreen}
          confirmDialog={confirmDialog}
          getCaseStage={getCaseStage}
          getNextStep={getNextStep}
          fmtDate={fmtDate}
          getProceedingTitle={getProceedingTitle}
          getCaseStatus={getCaseStatus}
          setMeetingSetup={setMeetingSetup}
          getEmployeeRecord={getEmployeeRecord}
          orgMembers={orgMembers}
          setCaseInfo={setCaseInfo}
          activeCaseStage={activeCaseStage}
          setActiveCaseStage={setActiveCaseStage}
          saveCases={saveCases}
          setReviewOutput={setReviewOutput}
          setMeetingType={setMeetingType}
          showAppealInput={showAppealInput}
          setShowAppealInput={setShowAppealInput}
          appealText={appealText}
          setAppealText={setAppealText}
          setShowHandoffModal={setShowHandoffModal}
          setShowReassignModal={setShowReassignModal}
          setShowAssignInvestigatorModal={setShowAssignInvestigatorModal}
          setShowOutcomeModal={setShowOutcomeModal}
          showToast={showToast}
          currentUser={currentUser}
          setLetterOutput={setLetterOutput}
          setShowSignModal={setShowSignModal}
          handleLetter={handleLetter}
          letterOutput={letterOutput}
          aiProcessing={aiProcessing}
          aiError={aiError}
          toggleNextStepDone={toggleNextStepDone}
          concludeInvestigation={concludeInvestigation}
          concludingInvestigation={concludingInvestigation}
          attemptSubmitInvestigation={attemptSubmitInvestigation}
          openEscalateModal={openEscalateModal}
          openHrInterventionModal={openHrInterventionModal}
          allegations={allegations}
          createAllegation={createAllegation}
          patchAllegation={patchAllegation}
          changeAllegationStatus={changeAllegationStatus}
          deleteAllegation={deleteAllegation}
          auditLog={auditLog}
          wellbeingNotes={wellbeingNotes}
          dueSoon={dueSoon}
          processTemplates={processTemplates}
          caseTasks={caseTasks}
          createCaseTask={createCaseTask}
          toggleCaseTaskDone={toggleCaseTaskDone}
          deleteCaseTask={deleteCaseTask}
          caseChatHistory={caseChatHistory}
          caseChatInput={caseChatInput}
          setCaseChatInput={setCaseChatInput}
          caseChatProcessing={caseChatProcessing}
          sendCaseChat={sendCaseChat}
          caseOverview={caseOverview}
          caseOverviewLoading={caseOverviewLoading}
          generateCaseOverview={generateCaseOverview}
          caseOverviewSources={caseOverviewSources}
          caseSignals={caseSignals}
          changeSignalStatus={changeSignalStatus}
          generateNextBestAction={generateNextBestAction}
          nextActionLoading={nextActionLoading}
          unansweredCovered={unansweredCovered}
          unansweredLoading={unansweredLoading}
          generateUnansweredQuestions={generateUnansweredQuestions}
          evidenceSuggestions={evidenceSuggestions}
          evidenceSuggestionsLoading={evidenceSuggestionsLoading}
          generateEvidenceSuggestions={generateEvidenceSuggestions}
          acceptEvidenceSuggestion={acceptEvidenceSuggestion}
          rejectEvidenceSuggestion={rejectEvidenceSuggestion}
          toggleTimelineExclude={toggleTimelineExclude}
          editTimelineDescription={editTimelineDescription}
          generateTimelineRelevance={generateTimelineRelevance}
          timelineRelevanceLoading={timelineRelevanceLoading}
          loadJsPDF={loadJsPDF}
          generateInconsistencies={generateInconsistencies}
          inconsistencyLoading={inconsistencyLoading}
          linkSignalToAllegation={linkSignalToAllegation}
          isHR={isHR}
          caseAccess={caseAccess}
          assignInvestigator={assignInvestigator}
          generateInvestigationPlan={generateInvestigationPlan}
          investigationPlanLoading={investigationPlanLoading}
          generateAppealReview={generateAppealReview}
          appealReviewLoading={appealReviewLoading?.[activeCaseId]}
          recordAppealOutcome={recordAppealOutcome}
          changesSinceView={changesSinceView[activeCaseId]}
          changesSummary={changesSummary[activeCaseId]}
          changesSummaryLoading={changesSummaryLoading[activeCaseId]}
          documentFindings={documentFindings}
          documentAnalysisLoading={documentAnalysisLoading}
          analyseEvidenceDocument={analyseEvidenceDocument}
          acceptDocumentFinding={acceptDocumentFinding}
          dismissDocumentFinding={dismissDocumentFinding}
          requestOverrideReason={requestOverrideReason}
          requestPolicyDeviationReason={requestPolicyDeviationReason}
          assignCaseRole={assignCaseRole}
          hrReviewRequests={hrReviewRequests}
          respondToReview={respondToReview}
          resolveInvestigationReview={resolveInvestigationReview}
          policies={policies}
          consistencyReview={consistencyReview}
          consistencyReviewLoading={consistencyReviewLoading}
          generateConsistencyReview={generateConsistencyReview}
        />
      )}
{/* ══ INTAKE ══ */}
      {screen===SCREENS.INTAKE&&(
        <IntakeScreen setScreen={setScreen} intake={intake} setIntake={setIntake} cases={cases} saveCases={saveCases} />
      )}

{/* ══ PREP ══ */}
      {screen===SCREENS.PREP&&(
        <PrepScreen isMobile={isMobile} meetingType={meetingType} setMeetingType={setMeetingType} caseInfo={caseInfo} setCaseInfo={setCaseInfo} handlePrepare={handlePrepare} aiProcessing={aiProcessing} setScreen={setScreen} bgDoc={bgDoc} setBgDoc={setBgDoc} prepNotes={prepNotes}
          prepQuestions={prepQuestions}
          linkedCaseAllegations={caseInfo._linkedCaseId ? allegationsForCase(allegations, caseInfo._linkedCaseId) : []}
          linkedCaseEvidence={caseInfo._linkedCaseId ? (cases.find(c=>c.id===caseInfo._linkedCaseId)?.evidence||[]) : []}
          onAddPrepQuestion={addPrepQuestion}
          onUpdatePrepQuestionText={updatePrepQuestionText}
          onRemovePrepQuestion={removePrepQuestion}
          onMovePrepQuestion={movePrepQuestion}
          onTogglePrepQuestionEssential={togglePrepQuestionEssential}
          onLinkPrepQuestionToAllegation={linkPrepQuestionToAllegation}
          onLinkPrepQuestionToEvidence={linkPrepQuestionToEvidence}
        />
      )}

            {/* ══ RECORD ══ */}
      {screen===SCREENS.RECORD&&(
        <RecordScreen meetingType={meetingType} caseInfo={caseInfo} isListening={isListening} meetingStartTime={meetingStartTime} currentAdjournment={currentAdjournment} setAdjournments={setAdjournments} setCurrentAdjournment={setCurrentAdjournment} setTranscript={setTranscript} inputText={inputText} aiProcessing={aiProcessing} transcript={transcript} addUtterance={addUtterance} inputRef={inputRef} setMeetingStartTime={setMeetingStartTime} setInputText={setInputText} updateLiveContext={updateLiveContext} stopSpeech={stopSpeech} startSpeech={startSpeech} isScreenCapturing={isScreenCapturing} stopScreenCapture={stopScreenCapture} startScreenCapture={startScreenCapture} importFileRef={importFileRef} handleImportFile={handleImportFile} liveContextLoading={liveContextLoading} liveContext={liveContext} liveChatHistory={liveChatHistory} liveChatProcessing={liveChatProcessing} liveChatInput={liveChatInput} setLiveChatInput={setLiveChatInput} sendLiveChat={sendLiveChat} setScreen={setScreen} confirmDialog={confirmDialog} clearMeetingDraft={()=>lsSet("compass_meeting_draft", null)} promptDialog={promptDialog} updateMeetingIntelligence={updateMeetingIntelligence} meetingIntelligence={meetingIntelligence} dismissedNudgeKey={dismissedNudgeKey} setDismissedNudgeKey={setDismissedNudgeKey} prepQuestions={prepQuestions} onSetPrepQuestionStatus={setPrepQuestionStatus} meetingEvidenceSuggestions={meetingEvidenceSuggestions} onAcceptMeetingEvidenceSuggestion={acceptMeetingEvidenceSuggestion} onDismissMeetingEvidenceSuggestion={dismissMeetingEvidenceSuggestion} meetingActionSuggestions={meetingActionSuggestions} onAcceptMeetingActionSuggestion={acceptMeetingActionSuggestion} onDismissMeetingActionSuggestion={dismissMeetingActionSuggestion} dismissedFollowUpKey={dismissedFollowUpKey} setDismissedFollowUpKey={setDismissedFollowUpKey} dismissedCoachingTipKeys={dismissedCoachingTipKeys} onDismissCoachingTip={key=>setDismissedCoachingTipKeys(ks=>[...ks,key])} attemptEndMeeting={attemptEndMeeting} showQualityCheck={showQualityCheck} qualityCheckGaps={qualityCheckGaps} proceedPastQualityCheck={proceedPastQualityCheck} createQualityCheckFollowUp={createQualityCheckFollowUp} onReturnToMeeting={()=>setShowQualityCheck(false)} />
      )}

      {/* ══ REVIEW ══ */}
      {screen===SCREENS.REVIEW&&(
        <ReviewScreen caseInfo={caseInfo} meetingType={meetingType} isHR={isHR} cases={cases} requestHrReview={requestHrReview} reviewOutput={reviewOutput} reviewOutputOriginal={reviewOutputOriginal} meetingSummary={meetingSummary} confirmDialog={confirmDialog} setShowShareModal={setShowShareModal} saveMeetingToCase={saveMeetingToCase} setScreen={setScreen} showToast={showToast} askCompassInput={askCompassInput} setAskCompassInput={setAskCompassInput} askCompassHistory={askCompassHistory} setAskCompassHistory={setAskCompassHistory} askCompass={askCompass} setAskCompassProcessing={setAskCompassProcessing} askCompassProcessing={askCompassProcessing} editProcessing={editProcessing} editRecord={editRecord} editingRecord={editingRecord} setEditingRecord={setEditingRecord} aiProcessing={aiProcessing} aiError={aiError} setReviewOutput={setReviewOutput} setShowSignModal={setShowSignModal} riskScore={riskScore}
          meetingEvidenceSuggestions={meetingEvidenceSuggestions} onAcceptMeetingEvidenceSuggestion={acceptMeetingEvidenceSuggestion} onDismissMeetingEvidenceSuggestion={dismissMeetingEvidenceSuggestion}
          meetingActionSuggestions={meetingActionSuggestions} onAcceptMeetingActionSuggestion={acceptMeetingActionSuggestion} onDismissMeetingActionSuggestion={dismissMeetingActionSuggestion}
        />
      )}

      {/* ══ LETTERS ══ */}
      {screen===SCREENS.LETTER&&(
        <LetterScreen handleLetter={handleLetter} activeLetter={activeLetter} aiProcessing={aiProcessing} letterOutput={letterOutput} letterSources={letterSources} onAskWhy={setLetterWhySignal} letterHistory={letterHistory} restoreLetterVersion={restoreLetterVersion} editingLetter={editingLetter} setEditingLetter={setEditingLetter} setLetterOutput={setLetterOutput} signature={signature} setShowSigPad={setShowSigPad} setSignature={setSignature} caseInfo={caseInfo} triggerWithSig={triggerWithSig} pdfGenerating={pdfGenerating} saveMeetingToCase={saveMeetingToCase} setScreen={setScreen} letterIsApproved={letterIsApproved} letterApproval={letterApproval} approveLetter={approveLetter} />
      )}

      {/* ══ DASHBOARD ══ */}
      {screen===SCREENS.DASHBOARD&&(
        <DashboardScreen cases={cases} setScreen={setScreen} />
      )}

      {/* ══ CASES ══ */}
      {screen===SCREENS.CASES&&(
        <CasesScreen cases={cases} locations={locations} orgMembers={orgMembers} setIntake={setIntake} setScreen={setScreen} getCaseStage={getCaseStage} setActiveCaseId={setActiveCaseId} setActiveCaseStage={setActiveCaseStage} getNextStep={getNextStep} getProceedingTitle={getProceedingTitle} getCaseStatus={getCaseStatus} saveCases={saveCases} confirmDialog={confirmDialog} showToast={showToast} />
      )}

      {screen===SCREENS.SEARCH&&(
        <SearchScreen searchQuery={searchQuery} setSearchQuery={setSearchQuery} runSearch={runSearch} searchResults={searchResults} setScreen={setScreen} setExpandedCases={setExpandedCases} cases={cases} setViewMeeting={setViewMeeting} setViewCaseId={setViewCaseId} dueSoon={dueSoon} setActivePerson={setActivePerson} />
      )}

      <Suspense fallback={<div style={{textAlign:"center",padding:80}}><span className="pu" style={{color:"#7C5CFC",fontSize:24}}>●</span></div>}>
      {/* ══ DEVELOP ══ */}
      {screen===SCREENS.DEVELOP&&devSession&&(
        <DevelopScreen
          devSession={devSession}
          setDevSession={setDevSession}
          devStep={devStep}
          setDevStep={setDevStep}
          devAiProcessing={devAiProcessing}
          generateSmartObjectives={generateSmartObjectives}
          generateDevSummary={generateDevSummary}
          devSummary={devSummary}
          saveDevMeetingToCase={saveDevMeetingToCase}
          setScreen={setScreen}
          generateDevLetter={generateDevLetter}
          devLetter={devLetter}
        />
      )}

      {/* ══ NEW STARTER ONBOARDING ══ */}
      {screen===SCREENS.NEWSTARTER&&(
        <NewStarterScreen
          activeStarter={activeStarter}
          setActiveStarter={setActiveStarter}
          starterView={starterView}
          setStarterView={setStarterView}
          newStarterForm={newStarterForm}
          setNewStarterForm={setNewStarterForm}
          starterTemplates={starterTemplates}
          createStarterInstance={createStarterInstance}
          starterInstances={starterInstances}
          aiCustomiseChecklist={aiCustomiseChecklist}
          starterAiProcessing={starterAiProcessing}
          toggleStarterTask={toggleStarterTask}
          updateStarterTaskNote={updateStarterTaskNote}
          addStarterTask={addStarterTask}
          removeStarterTask={removeStarterTask}
          reassignStarterTaskOwner={reassignStarterTaskOwner}
        />
      )}

      {/* ══ LEAVER OFFBOARDING ══ */}
      {screen===SCREENS.OFFBOARDING&&(
        <OffboardingScreen
          activeLeaver={activeLeaver}
          setActiveLeaver={setActiveLeaver}
          leaverView={leaverView}
          setLeaverView={setLeaverView}
          newLeaverForm={newLeaverForm}
          setNewLeaverForm={setNewLeaverForm}
          leaverTemplates={leaverTemplates}
          createLeaverInstance={createLeaverInstance}
          leaverInstances={leaverInstances}
          aiCustomiseLeaverChecklist={aiCustomiseLeaverChecklist}
          leaverAiProcessing={leaverAiProcessing}
          toggleLeaverTask={toggleLeaverTask}
          updateLeaverTaskNote={updateLeaverTaskNote}
          addLeaverTask={addLeaverTask}
          removeLeaverTask={removeLeaverTask}
          reassignLeaverTaskOwner={reassignLeaverTaskOwner}
          updateLeaverExitInterview={updateLeaverExitInterview}
          portalAccounts={portalAccounts}
          revokePortalAccess={revokePortalAccess}
        />
      )}

      {/* ══ ER ANALYTICS ══ */}
      {screen===SCREENS.ERREPORT&&(
        <ErReportScreen
          cases={cases}
          getCaseStage={getCaseStage}
          employeeRecords={employeeRecords}
          setReportNarrative={setReportNarrative}
          reportNarrative={reportNarrative}
          setActiveCaseId={setActiveCaseId}
          setActiveCaseStage={setActiveCaseStage}
          setScreen={setScreen}
          setActivePerson={setActivePerson}
          getNextStep={getNextStep}
          fmtDate={fmtDate}
          loadJsPDF={loadJsPDF}
        />
      )}

            {/* ══ REDUNDANCY & CONSULTATION ══ */}
      {screen===SCREENS.REDUNDANCY&&(
        <RedundancyScreen
          activeRedundancy={activeRedundancy}
          setActiveRedundancy={setActiveRedundancy}
          redundancyStep={redundancyStep}
          setRedundancyStep={setRedundancyStep}
          redundancyAiOutput={redundancyAiOutput}
          setRedundancyAiOutput={setRedundancyAiOutput}
          redundancyCases={redundancyCases}
          createRedundancyCase={createRedundancyCase}
          updateRedundancyCase={updateRedundancyCase}
          scoreEmployee={scoreEmployee}
          generateRedundancyLetter={generateRedundancyLetter}
          isMobile={isMobile}
          getRedundancyAiAdvice={getRedundancyAiAdvice}
          redundancyAiProcessing={redundancyAiProcessing}
          startOffboarding={startOffboarding}
          promptDialog={promptDialog}
        />
      )}

      {/* ══ MANAGER SELF-SERVICE — CONCERN REFERRALS ══ */}
      {screen===SCREENS.CONCERNS&&(
        <ConcernsScreen
          isHR={isHR}
          concernReferrals={concernReferrals}
          concernForm={concernForm}
          setConcernForm={setConcernForm}
          submitConcernReferral={submitConcernReferral}
          concernSubmitted={concernSubmitted}
          setConcernSubmitted={setConcernSubmitted}
          triageReferral={triageReferral}
          startInformalConversation={startInformalConversation}
          concernTriageLoading={concernTriageLoading}
          currentUser={currentUser}
          showToast={showToast}
          setActiveCaseId={setActiveCaseId}
          setActiveCaseStage={setActiveCaseStage}
          setScreen={setScreen}
          screens={SCREENS}
        />
      )}

      {/* Manager Enablement (Phase 4, MP16, §1) — "My People Actions" */}
      {screen===SCREENS.MANAGER_PORTAL&&(
        <ManagerPortalScreen
          cases={cases}
          caseAccess={caseAccess}
          caseTasks={caseTasks}
          hrReviewRequests={hrReviewRequests}
          concernReferrals={concernReferrals}
          dueSoon={dueSoon}
          currentUser={currentUser}
          fmtDate={fmtDate}
          setScreen={setScreen}
          setActiveCaseId={setActiveCaseId}
          setActiveCaseStage={setActiveCaseStage}
        />
      )}

      {/* Manager Enablement (Phase 4, MP18, §14) — "Delegated Work" */}
      {screen===SCREENS.HR_DELEGATED_WORK&&isHR&&(
        <HrDelegatedWorkScreen
          cases={cases}
          caseAccess={caseAccess}
          orgMembers={orgMembers}
          caseTasks={caseTasks}
          allegations={allegations}
          fmtDate={fmtDate}
          setScreen={setScreen}
          setActiveCaseId={setActiveCaseId}
          setActiveCaseStage={setActiveCaseStage}
          openHrInterventionModal={openHrInterventionModal}
        />
      )}

      {/* ══ MENTAL HEALTH & WELLBEING ══ */}
      {screen===SCREENS.WELLBEING&&isHR&&(
        <WellbeingScreen
          wellbeingNotes={wellbeingNotes}
          activeWellbeing={activeWellbeing}
          wellbeingView={wellbeingView}
          setActiveWellbeing={setActiveWellbeing}
          setWellbeingView={setWellbeingView}
          toggleFollowUpDone={toggleFollowUpDone}
          wellbeingForm={wellbeingForm}
          setWellbeingForm={setWellbeingForm}
          addWellbeingNote={addWellbeingNote}
        />
      )}

      {/* ══ SETTINGS ══ */}
      {screen===SCREENS.SETTINGS&&(
        <SettingsScreen
          isHR={isHR}
          showToast={showToast}
          exportCSV={exportCSV}
          exportPDF={exportPDF}
          initialSection={settingsSection}
          clearInitialSection={()=>setSettingsSection(null)}
          org={org}
          user={user}
          locations={locations}
          deleteLocation={deleteLocation}
          addLocation={addLocation}
          teamMembers={teamMembers}
          editingMember={editingMember}
          setEditingMember={setEditingMember}
          removeMember={removeMember}
          updateMemberRole={updateMemberRole}
          assignLocations={assignLocations}
          inviteForm={inviteForm}
          setInviteForm={setInviteForm}
          inviting={inviting}
          inviteMember={inviteMember}
          wordTemplate={wordTemplate}
          setWordTemplate={setWordTemplate}
          lsSet={lsSet}
          wordTemplateRef={wordTemplateRef}
          handleWordTemplateUpload={handleWordTemplateUpload}
          letterhead={letterhead}
          setLetterhead={setLetterhead}
          letterheadRef={letterheadRef}
          handleLetterheadUpload={handleLetterheadUpload}
          signature={signature}
          setSignature={setSignature}
          setShowSigPad={setShowSigPad}
          policies={policies}
          setPolicies={setPolicies}
          policyFileRef={policyFileRef}
          handlePolicyUpload={handlePolicyUpload}
          policyProcessing={policyProcessing}
          changePolicyCategory={changePolicyCategory}
          starterTemplates={starterTemplates}
          saveStarterTemplates={saveStarterTemplates}
          leaverTemplates={leaverTemplates}
          saveLeaverTemplates={saveLeaverTemplates}
          processTemplates={processTemplates}
          saveProcessTemplate={saveProcessTemplate}
          promptDialog={promptDialog}
          confirmDialog={confirmDialog}
          dueSoon={dueSoon}
          caseTasks={caseTasks}
          createCaseTask={createCaseTask}
          requestNotifications={requestNotifications}
          notifGranted={notifGranted}
          emailDigestOptIn={emailDigestOptIn}
          toggleEmailDigest={toggleEmailDigest}
          orgWebhookUrl={orgWebhookUrl}
          orgWebhookType={orgWebhookType}
          saveOrgWebhook={saveOrgWebhook}
          sendTestWebhook={sendTestWebhook}
          employeeCsvFileRef={employeeCsvFileRef}
          employeeCsvProcessing={employeeCsvProcessing}
          handleEmployeeCsvImport={handleEmployeeCsvImport}
          exportEmployeesCsv={exportEmployeesCsv}
          caseCsvFileRef={caseCsvFileRef}
          caseCsvProcessing={caseCsvProcessing}
          handleCaseCsvImport={handleCaseCsvImport}
          downloadCaseCsvTemplate={downloadCaseCsvTemplate}
          auditLog={auditLog}
          cases={cases}
          exportAllData={exportAllData}
          deleteAllData={deleteAllData}
          setGdprAccepted={setGdprAccepted}
          setShowGdpr={setShowGdpr}
          setOnboardStep={setOnboardStep}
          setShowOnboard={setShowOnboard}
          setScreen={setScreen}
          portalAccounts={portalAccounts}
          revokePortalAccess={revokePortalAccess}
          orgRoles={orgRoles}
          loadOrgRoles={loadOrgRoles}
          orgMembers={orgMembers}
          loadOrgMembers={loadOrgMembers}
          isMobile={isMobile}
        />
      )}

      {/* ══ DSAR ══ */}
      {screen===SCREENS.DSAR&&(
        <DsarScreen
          dsarRequests={dsarRequests}
          createDsarRequest={createDsarRequest}
          updateDsarRequest={updateDsarRequest}
          extendDsarRequest={extendDsarRequest}
          promptDialog={promptDialog}
          cases={cases}
          employeeRecords={employeeRecords}
          starterInstances={starterInstances}
          leaverInstances={leaverInstances}
          setScreen={setScreen}
        />
      )}
      {screen===SCREENS.TASKS&&(
        <TasksScreen
          caseTasks={caseTasks}
          cases={cases}
          createCaseTask={createCaseTask}
          toggleCaseTaskDone={toggleCaseTaskDone}
          deleteCaseTask={deleteCaseTask}
          setScreen={setScreen}
          setActiveCaseId={setActiveCaseId}
          setActiveCaseStage={setActiveCaseStage}
          fmtDate={fmtDate}
        />
      )}
      {screen===SCREENS.CALENDAR&&(
        <CalendarScreen
          dueSoon={dueSoon}
          setScreen={setScreen}
          screens={SCREENS}
          setActiveCaseId={setActiveCaseId}
          setActiveCaseStage={setActiveCaseStage}
        />
      )}
      </Suspense>

      {/* ── Onboarding wizard ── */}
      {showOnboarding&&!showGdpr&&!showOnboard&&(
        <OnboardingWizard
          onboardingStep={onboardingStep}
          setOnboardingStep={setOnboardingStep}
          org={org}
          currentUser={currentUser}
          lsSet={lsSet}
          setShowOnboarding={setShowOnboarding}
          setShowCasePrompt={setShowCasePrompt}
          setShowAskCompass={setShowAskCompass}
        />
      )}

      {/* ── Ask Compass floating chat ── */}
      {screen===SCREENS.HOME&&(
        <AskCompassWidget
          showAskCompass={showAskCompass}
          setShowAskCompass={setShowAskCompass}
          askCompassHistory={askCompassHistory}
          setAskCompassHistory={setAskCompassHistory}
          askCompass={askCompass}
          askCompassProcessing={askCompassProcessing}
          setAskCompassProcessing={setAskCompassProcessing}
          askCompassInput={askCompassInput}
          setAskCompassInput={setAskCompassInput}
        />
      )}

      {/* ── Disciplinary Handoff Modal ── */}
      {showHandoffModal&&(
        <HandoffModal
          cases={cases}
          activeCaseId={activeCaseId}
          currentUser={currentUser}
          orgMembers={orgMembers}
          selectedMemberId={selectedMemberId}
          setSelectedMemberId={setSelectedMemberId}
          setShowHandoffModal={setShowHandoffModal}
          saveCases={saveCases}
          org={org}
          user={user}
          setActiveCaseStage={setActiveCaseStage}
          showToast={showToast}
        />
      )}

      {/* ── General Case Reassignment Modal ── */}
      {showReassignModal&&(
        <ReassignCaseModal
          cases={cases}
          activeCaseId={activeCaseId}
          currentUser={currentUser}
          orgMembers={orgMembers}
          selectedMemberId={selectedMemberId}
          setSelectedMemberId={setSelectedMemberId}
          setShowReassignModal={setShowReassignModal}
          saveCases={saveCases}
          org={org}
          user={user}
          showToast={showToast}
          audit={audit}
        />
      )}

      {/* ── Assign Investigator Modal ── */}
      {showAssignInvestigatorModal&&(
        <AssignInvestigatorModal
          cases={cases}
          activeCaseId={activeCaseId}
          allegations={allegations}
          orgMembers={orgMembers}
          setShowAssignInvestigatorModal={setShowAssignInvestigatorModal}
          assignInvestigator={assignInvestigator}
        />
      )}

      {/* ── HR Intervention Modal ── */}
      {showHrInterventionModal&&(
        <HrInterventionModal
          cs={cases.find(c=>c.id===hrInterventionCaseId)}
          setShowHrInterventionModal={setShowHrInterventionModal}
          onSendGuidance={(note,noteType)=>sendHrGuidance(hrInterventionCaseId,note,noteType)}
          onReturnForFurtherWork={(note)=>hrReturnForFurtherWork(hrInterventionCaseId,note)}
          onTakeOver={()=>hrTakeOverCase(hrInterventionCaseId)}
          onTogglePause={()=>togglePauseInvestigation(hrInterventionCaseId)}
          onReassign={reassignFromIntervention}
        />
      )}

      {/* ── Investigation Quality Check Modal ── */}
      {showInvestigationQualityCheck&&(
        <InvestigationQualityCheckModal
          gaps={investigationQualityGaps}
          onGoBack={()=>setShowInvestigationQualityCheck(false)}
          onCreateFollowUp={createInvestigationQualityFollowUp}
          onProceed={proceedPastInvestigationQualityCheck}
        />
      )}

      {/* ── Escalate to HR Modal ── */}
      {showEscalateModal&&(
        <EscalateToHrModal
          caseName={cases.find(c=>c.id===escalateCaseId)?.employeeName}
          setShowEscalateModal={setShowEscalateModal}
          escalateToHr={escalateToHr}
        />
      )}

      {/* ── Issue Outcome Modal ── */}
      {showOutcomeModal&&(
        <OutcomeModal
          cases={cases}
          activeCaseId={activeCaseId}
          setShowOutcomeModal={setShowOutcomeModal}
          outcomeType={outcomeType}
          setOutcomeType={setOutcomeType}
          outcomeNotes={outcomeNotes}
          setOutcomeNotes={setOutcomeNotes}
          saveCases={saveCases}
          showToast={showToast}
          handleLetter={handleLetter}
          startOffboarding={startOffboarding}
          requestHrReview={requestHrReview}
          allegations={allegations}
          caseSignals={caseSignals}
          requestOverrideReason={requestOverrideReason}
          createCaseTask={createCaseTask}
        />
      )}
      </div>
    </div>
  );
}
