import { supabase } from './supabase';
import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { MEETING_TYPES, SCREENS, SPEAKERS, NEXT_STEPS_MAP, DEV_MEETING_CONFIG, DEV_TEMPLATES, TEMPLATES, WELLBEING_RESOURCES, WELLBEING_TYPES } from './constants';
import { streamClaude } from './lib/streamClaude';
import { addWorkingDays, addCalendarMonth, toISODateLocal } from './lib/dates';
import { ls, lsSet } from './lib/storage';
import { findEmployeeByName } from './lib/employeeRecords';
import { computeDueSoon } from './lib/deadlines';
import { mapCaseRow } from './lib/caseMapping';
import { toggleChecklistTask, updateChecklistTaskNote, addChecklistTask, removeChecklistTask, reassignChecklistTaskOwner, updateChecklistInstanceFields } from './lib/checklistTasks';
import { isLetterApproved, createLetterApproval } from './lib/letterApproval';
import { getCaseStage } from './lib/caseStage';
import { getNextStep } from './lib/nextStep';
import { addAllegation, updateAllegation, setAllegationStatus, removeAllegation, allegationStatusMeta, allegationsForCase } from './lib/allegations';
import { addTask, toggleTaskDone, removeTask, tasksForCase } from './lib/caseTasks';
import { createSignal, setSignalStatus, supersedeOpenSignalsOfType, openSignalsForCase } from './lib/caseSignals';
import { withFkRetry } from './lib/retryOnFkRace';
import { readEvidenceFiles } from './lib/evidenceUpload';
import { EvidenceDropzone } from './components/EvidenceDropzone';
import { buildCaseContext } from './lib/caseContext';
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
// Lazy: less-common screens, split out of the main bundle so the common
// login -> Home -> Cases path doesn't pay to download them upfront.
const WellbeingScreen = lazy(() => import('./screens/WellbeingScreen').then(m => ({default: m.WellbeingScreen})));
const NewStarterScreen = lazy(() => import('./screens/NewStarterScreen').then(m => ({default: m.NewStarterScreen})));
const OffboardingScreen = lazy(() => import('./screens/OffboardingScreen').then(m => ({default: m.OffboardingScreen})));
const DevelopScreen = lazy(() => import('./screens/DevelopScreen').then(m => ({default: m.DevelopScreen})));
const ErReportScreen = lazy(() => import('./screens/ErReportScreen').then(m => ({default: m.ErReportScreen})));
const RedundancyScreen = lazy(() => import('./screens/RedundancyScreen').then(m => ({default: m.RedundancyScreen})));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen').then(m => ({default: m.SettingsScreen})));
const DsarScreen = lazy(() => import('./screens/DsarScreen').then(m => ({default: m.DsarScreen})));
const TasksScreen = lazy(() => import('./screens/TasksScreen').then(m => ({default: m.TasksScreen})));
import { OnboardingWizard } from './screens/OnboardingWizard';
import { AskCompassWidget } from './screens/AskCompassWidget';
import { HandoffModal } from './screens/HandoffModal';
import { ReassignCaseModal } from './screens/ReassignCaseModal';
import { OutcomeModal } from './screens/OutcomeModal';

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
  const [reviewOutput, setReviewOutput] = useState("");
  const [reviewOutputOriginal, setReviewOutputOriginal] = useState(""); // the AI's un-edited draft, kept so hand-edits can be reverted
  const [letterOutput, setLetterOutput] = useState("");
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
      let query = supabase.from('cases').select('id,employee_name,employee_email,meetings,evidence,stage,case_type,description,date_received,urgency,outcome,investigation_report,investigation_report_date,disciplinary_officer,disciplinary_officer_id,disciplinary_officer_email,investigating_manager,handoff_date,next_steps,location_id,estimated_weekly_pay,estimated_age_at_dismissal,assigned_to,created_by,created_at,updated_at,confidential').eq('org_id', org.id);
      // Location managers only see their location cases
      if(member?.role==='location_manager' && member?.location_ids?.length>0) {
        query = query.in('location_id', member.location_ids);
      }
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

  // ── HR Review Requests ──
  const loadHrReviews = async () => {
    if(!org?.id) return;
    const { data } = await supabase.from('hr_review_requests').select('*').eq('org_id', org.id).order('requested_at', {ascending: false});
    if(data) setHrReviewRequests(data);
  };

  const requestHrReview = async (step, caseId, meetingId, recordSnapshot) => {
    if(!org?.id) return;
    const cs = cases.find(x=>x.id===caseId);
    const meeting = cs?.meetings.find(m=>m.id===meetingId);
    const { data, error } = await supabase.from('hr_review_requests').insert({
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
    }).select().single();
    if(data) {
      setHrReviewRequests(r=>[data,...r]);
      showToast("HR review requested");
    } else {
      console.error("requestHrReview", error);
      showToast("Couldn't request HR review — "+error?.message, "error");
    }
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

  useEffect(()=>{ if(org?.id){ loadLocations(); loadHrReviews(); loadOrgRoles(); loadOrgMembers(); loadEmployeeRecords(); loadTeamMembers(); loadStarterInstances(); loadLeaverInstances(); loadDsarRequests(); loadPortalAccounts(); loadAllegations(); loadCaseTasks(); loadCaseSignals(); if(isHR) loadWellbeingNotes(); } }, [org?.id, isHR]);

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
    const caseContext = cases.length > 0
      ? "Active cases: " + cases.map(ca=>ca.employeeName + " ("+ca.meetings.length+" meetings)").join(", ")
      : "No active cases yet.";
    const sys = "You are Compass, an expert UK HR AI assistant. You help HR managers with UK employment law, ACAS codes of practice, and HR best practice. Give thorough, practical answers. Use plain numbered lists and bullet points (- ) for structure. Never use ## headers, never use ** for bold, never use emoji, never use markdown tables. Plain clear English only. Separate sections with a blank line. " + caseContext;
    
    let userContent;
    if(homeAttachment?.base64) {
      userContent = [
        {type:"document", source:{type:"base64", media_type:"application/pdf", data:homeAttachment.base64}},
        {type:"text", text:msg||"Please review this document and advise on any HR or legal considerations."}
      ];
    } else {
      userContent = msg;
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
    setCases(u); 
    lsSet("compass_cases", u);
    if(org?.id) {
      if(changedId) {
        // Only sync the changed case
        const changed = u.find(x=>x.id===changedId);
        if(changed) saveCaseToDB(changed);
        else deleteCaseFromDB(changedId);
      } else {
        // Sync all
        u.forEach(cs => saveCaseToDB(cs));
        cases.forEach(cs => { if(!u.find(x=>x.id===cs.id)) deleteCaseFromDB(cs.id); });
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

  // ── Users ──
  // ── Deadline checker — UK statutory & ACAS deadlines ──
  // Rules live in src/lib/deadlines.js so the digest cron function (server
  // side) can compute the same due-soon set without duplicating them.
  useEffect(() => {
    setDueSoon(computeDueSoon(cases, dsarRequests, new Date(), caseTasks));
  }, [cases, dsarRequests, caseTasks]);

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
    const updated = setAllegationStatus(allegations, allegationId, status);
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
        createdBy:r.created_by, createdAt:r.created_at,
      })));
    } catch(e) { console.error('loadCaseTasks', e); }
  };

  const saveCaseTaskToDB = async (task) => {
    if(!org?.id) return;
    const { error } = await withFkRetry(() => supabase.from('case_tasks').upsert({
      id: task.id, case_id: task.caseId, org_id: org.id,
      name: task.name, owner: task.owner||null, due_date: task.dueDate||null,
      priority: task.priority||'normal', status: task.status||'open',
      created_by: task.createdBy||user?.id||null, updated_at: new Date().toISOString(),
    }));
    if(error) { console.error('saveCaseTaskToDB', error); showToast("Couldn't save task to the cloud — "+error.message, "error"); }
  };

  const deleteCaseTaskFromDB = async (taskId) => {
    const { error } = await supabase.from('case_tasks').delete().eq('id', taskId);
    if(error) { console.error('deleteCaseTaskFromDB', error); showToast("Couldn't delete task — "+error.message, "error"); }
  };

  const createCaseTask = (caseId, fields) => {
    const updated = addTask(caseTasks, caseId, fields);
    if(updated===caseTasks) return;
    setCaseTasks(updated);
    const created = updated[updated.length-1];
    saveCaseTaskToDB({...created, createdBy:user?.id});
    audit("Task added", created.name, caseId);
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
  const [caseOverviewLoading, setCaseOverviewLoading] = useState({});

  const sendCaseChat = async (cs) => {
    const question = caseChatInput.trim();
    if(!question || caseChatProcessing) return;
    setCaseChatInput("");
    const history = caseChatHistory[cs.id]||[];
    const updated = [...history, {role:"user", content:question}];
    setCaseChatHistory(h=>({...h, [cs.id]:updated}));
    setCaseChatProcessing(true);
    try {
      const context = buildCaseContext(cs, allegationsForCase(allegations, cs.id), tasksForCase(caseTasks, cs.id));
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
      const context = buildCaseContext(cs, allegationsForCase(allegations, cs.id), tasksForCase(caseTasks, cs.id));
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:1200,
        stream:false,
        system:"You are an HR case-review assistant. Read the case record provided and produce a structured, strictly neutral overview for the HR professional running the case. You must NEVER present something as an established fact unless the case record explicitly supports it — distinguish clearly between what's agreed, what's disputed, and what's simply unknown. You must NEVER recommend a sanction, disciplinary outcome, or final decision on any allegation — that is solely for the responsible manager to decide; you may only recommend the next *procedural* step (e.g. \"hold the investigation meeting\", \"obtain a written witness statement\"), never an outcome. Where evidence conflicts or is missing, say so explicitly rather than resolving it yourself."+getPolicyCtx(),
        messages:[{role:"user", content:"CASE RECORD:\n"+context+"\n\nProduce the overview using exactly these markdown headers, in this order: ## Established facts, ## Disputed facts, ## Evidence for and against each allegation, ## Outstanding questions, ## Procedural risk, ## Recommended next procedural step. If a section has nothing to report, write \"Nothing recorded yet.\" under it rather than omitting it."}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(text) setCaseOverview(o=>({...o, [cs.id]:text}));
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
  const generateNextBestAction = async (cs) => {
    setNextActionLoading(l=>({...l, [cs.id]:true}));
    try {
      const context = buildCaseContext(cs, allegationsForCase(allegations, cs.id), tasksForCase(caseTasks, cs.id));
      const floor = getNextStep(cs);
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:400,
        stream:false,
        system:"You are Compass, an Employee Relations copilot recommending the single most useful next step for this case. Ground your recommendation in a specific fact from the case record — name the person, meeting, or evidence gap that makes this the right next step; never recommend something generic the record doesn't support. You must NEVER recommend a sanction, disciplinary outcome, or final decision on any allegation — only a procedural step (e.g. \"interview a named witness\", \"obtain a specific document\", \"send the signed record for confirmation\"). A deterministic procedural-stage check has already identified the case's baseline next step below — you may agree with it and sharpen it with a specific reason, or recommend something more specific that still satisfies that same procedural requirement, but never contradict or skip its stage. Respond ONLY with valid JSON, no other text: {\"title\":\"short imperative action, e.g. 'Interview Sarah Jones'\",\"reasoning\":\"one or two sentences citing the specific fact that makes this the right next step\",\"afterThis\":\"one sentence on what should happen once this is done\"}"+getPolicyCtx(),
        messages:[{role:"user", content:"CASE RECORD:\n"+context+(floor?"\n\nDeterministic baseline next step: "+floor.label+" — "+(floor.reason||""):"")}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      if(!parsed.title) throw new Error("No recommendation returned");

      const openPrior = openSignalsForCase(caseSignals, cs.id, "next_action");
      const withoutStale = supersedeOpenSignalsOfType(caseSignals, cs.id, "next_action");
      openPrior.forEach(s => { const updated = withoutStale.find(x=>x.id===s.id); if(updated) saveSignalToDB(updated); });

      const created = createSignal(withoutStale, cs.id, {
        type:"next_action", title:parsed.title,
        reasoning:[parsed.reasoning, parsed.afterThis?"After this: "+parsed.afterThis:null].filter(Boolean).join(" "),
        source:"ai",
      });
      setCaseSignals(created);
      saveSignalToDB(created[created.length-1]);
    } catch(e) { console.error("generateNextBestAction", e); showToast("Couldn't generate a recommendation — "+e.message, "error"); }
    setNextActionLoading(l=>({...l, [cs.id]:false}));
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
      transcript, inputText, meetingType, caseInfo, meetingStartTime, meetingEndTime, adjournments, participants, prepNotes,
      savedAt: new Date().toISOString(),
    });
  }, [screen, transcript, inputText, meetingType, caseInfo, meetingStartTime, meetingEndTime, adjournments, participants, prepNotes]);

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
  const getPolicyCtx = () => {
    if(!policies.length) return "";
    return "\n\nCOMPANY POLICIES (reference where relevant):\n" + policies.map(p=>`--- ${p.name} ---\n${p.content}`).join("\n\n").slice(0,12000);
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
    setMeetingType(type); setTranscript([]); setPrepNotes(""); setReviewOutput(""); setReviewOutputOriginal(""); setLetterOutput(""); setLetterHistory([]);
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

  // ── AI: Prepare ──
  const handlePrepare = async () => {
    if(!caseInfo.employee.trim()) return;
    setAiError(""); setAiProcessing(true);
    try {
      await streamClaude(
        `Senior UK HR advisor specialising in UK employment law. Use ## for section headers and - for bullet points. Do not use ** for bold, do not use emoji, do not use markdown tables. Write in plain clear English with ## headers and - bullets only.${policies.length?" Reference company policies where relevant.":""}`,
        `Prepare for ${meetingType.label}. Employee: ${caseInfo.employee}. Date: ${caseInfo.date||"TBD"}. Chair: ${caseInfo.manager||"TBC"}. Background: ${caseInfo.context||"None"}. Participants: ${participants.map(p=>p.name+" ("+p.role+")").join(", ")||"HR Manager, Employee"}${getPolicyCtx()}\n\n## Objectives\n## Agenda\n## Key Questions\n## Legal Checklist\n## Risk Flags`,
        t=>setPrepNotes(t)
      );
    } catch(e) { setAiError(e.message); }
    setAiProcessing(false);
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
    setScreen(SCREENS.REVIEW); setReviewOutput(""); setReviewOutputOriginal(""); setAiError(""); setRiskScore(null); setPrediction("");
    setAiProcessing(true);
    // Generate next steps deadlines
    lsSet("compass_meeting_draft", null); // transcript is now captured in the AI call in flight — the crash-recovery window has passed
    const baseDate = caseInfo.date ? new Date(caseInfo.date.split("/").reverse().join("-")) : new Date();
    const steps = (NEXT_STEPS_MAP[meetingType?.label] || []).map(s=>({ step:s.step, deadline:addWorkingDays(baseDate,s.days), done:false }));
    setNextSteps(steps);
    try {
      const tx = allNotes.slice(-60).map(u=>u.text).join("\n");
          // Appeal detection
      const appealWords = ["appeal","original decision","grounds of appeal","outcome being appealed"];
      if(!appealDetectedRef.current && appealWords.some(w=>tx.toLowerCase().includes(w))){
        appealDetectedRef.current = true;
        setAppealDetected(true);
        setShowLinkCase(true);
      }
      const fullRecord = await streamClaude(
        `You are a senior UK HR documentation specialist. Generate a meeting record with EXACTLY these three sections and NO others: ## Meeting Details (date, type, attendees, purpose), ## Meeting Dialogue (what was said, in concise prose), ## HR Advisor Notes (expert legal guidance in flowing prose from a senior employment lawyer - one paragraph covering ACAS compliance, legal risks and recommended next steps). Do NOT add any other sections like Key Points, Next Steps, Summary, Actions, Risk Assessment or anything else. Three sections only. No bold, no emoji, no tables.${policies.length?" Reference company policies by name.":""} IMPORTANT: In the Meeting Dialogue section, prefix every line with initials only. Chair ${caseInfo.manager||"HR Manager"} = ${(caseInfo.manager||"HR Manager").split(" ").map(w=>w[0].toUpperCase()).join("")}. Employee ${caseInfo.employee||"Employee"} = ${(caseInfo.employee||"Employee").split(" ").map(w=>w[0].toUpperCase()).join("")}. Use ONLY these initials, never full names in the dialogue.`,
        `${meetingType?.label} meeting. Employee: ${caseInfo.employee}${caseInfo.employeeJobTitle?" ("+caseInfo.employeeJobTitle+")":(employeeRecords||[]).find(r=>r.name===caseInfo.employee)?.jobTitle?" ("+((employeeRecords||[]).find(r=>r.name===caseInfo.employee)?.jobTitle)+")":" "}. Date: ${caseInfo.date||"today"}. Chair: ${caseInfo.manager||"Unknown"}${caseInfo.chairJobTitle?" ("+caseInfo.chairJobTitle+")":(orgMembers||[]).find(m=>m.name===caseInfo.manager)?.job_title?" ("+((orgMembers||[]).find(m=>m.name===caseInfo.manager)?.job_title)+")":" "}. Start time: ${meetingStartTime||"Unknown"}. End time: ${meetingEndTime||meetingEndTimeVal||"Unknown"}${adjournments.length>0?" Adjournments: "+adjournments.map(a=>a.start+(a.end?" to "+a.end:"- ongoing")+(a.reason?" ("+a.reason+")":"")).join(", "):""}. Notetaker: ${caseInfo.notetaker||"Not specified"}. Representative/companion: ${caseInfo.representative?caseInfo.representative+" ("+(caseInfo.representativeRole||"colleague")+")":"N/A"}. Other participants: ${participants.map(p=>p.name+" ("+p.role+")").join(", ")||"none listed"}${getPolicyCtx()}\n\nTRANSCRIPT:\n${tx}\n\nPlease produce the following sections:\n\n## Meeting Details\nInclude these fields on separate lines:\n- Type: [meeting type]\n- Date: [date]\n- Start time: [start time]\n- End time: [end time]${adjournments.length>0?"\n- Adjournments: [list each adjournment with times and reason]":""}\n- Chair: [chair name and job title]\n- Notetaker: [notetaker name or "Not specified"]\n- Employee: [employee name and job title]\n- Representative/companion: [name and role, or "N/A"]\n- Other participants: [any others or "None"]\n- Purpose: [write 1-2 sentences on the same line explaining why this meeting was held]\n\n## Meeting Dialogue\nRewrite as a clean readable conversation. Each line must start with the speaker\'s INITIALS followed by a colon (e.g. if chair is "${caseInfo.manager||"HR Manager"}" use initials "${(caseInfo.manager||"HR Manager").split(" ").map(w=>w[0]).join("")}:" and if employee is "${caseInfo.employee||"Employee"}" use initials "${(caseInfo.employee||"Employee").split(" ").map(w=>w[0]).join("")}:"). Fix any typos. One line per utterance.\n\n## Key Points\n## Employee Position\n## Management Position\n## Procedural Checks\n## Actions & Next Steps`,
        t=>setReviewOutput(t)
      );
      setReviewOutputOriginal(fullRecord);
    } catch(e) { setAiError(e.message); }
    setAiProcessing(false);
    // Auto risk score
    runRiskScore();
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

  const runRiskScore = async () => {
    if(!reviewOutput && !transcript.length) return;
    setRiskProcessing(true);
    try {
      const tx = reviewOutput || transcript.slice(-40).map(u=>u.text).join("\n");
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
      saveCases(cases.map(x=>x.id===caseInfo._linkedCaseId?{...x,evidence:[...(x.evidence||[]),witnessNote]}:x));
      const targetId = caseInfo._linkedCaseId;
      setCaseInfo(p=>({...p,_linkedCaseId:null,_linkedCaseName:null}));
      setMeetingSetup(p=>({...p,linkedCaseId:null,linkedCaseName:null}));
      setActiveCaseId(targetId);
      setActiveCaseStage("investigation");
      setScreen(SCREENS.CASE_VIEW);
      showToast("Witness statement saved to case");
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
    if(existing) {
      saveCases(cases.map(c=>c.id===existing.id?{...c,meetings:[...c.meetings,meeting]}:c));
    } else {
      saveCases([...cases,{id:caseId, employeeName:caseInfo.employee, email:caseInfo.email, createdAt:new Date().toISOString(), meetings:[meeting]}]);
    }
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
  const handlePolicyUpload = async e => {
    const files=Array.from(e.target.files);if(!files.length)return; setPolicyProcessing(true);
    for(const file of files) {
      try {
        let content="";
        if(file.name.endsWith(".docx")) {
          await new Promise(res=>{if(window.mammoth){res();return;}const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";s.onload=res;document.head.appendChild(s);});
          const buf=await file.arrayBuffer(); const r=await window.mammoth.extractRawText({arrayBuffer:buf}); content=r.value;
        } else { content=await file.text(); }
        const pol={id:Date.now().toString()+Math.random(),name:file.name.replace(/\.[^.]+$/,""),fileName:file.name,content:content.slice(0,8000),addedAt:new Date().toISOString(),size:Math.round(content.length/1000)+"k"};
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
    setAiProcessing(true); if(!inline) setScreen(SCREENS.LETTER); setLetterOutput("");
    try {
      const nl = String.fromCharCode(10);
      const tx = transcript.map(u=>u.speaker+": "+u.text).join(nl);
      const evidenceList = (caseInfo.evidence||[]).map((e,i)=>(i+1)+". "+e.name+" ("+e.type+", "+e.date+")").join(nl);
      // Pull additional context from active case
      const activeCase = cases.find(x=>x.id===activeCaseId);
      const empRec = getEmployeeRecord(caseInfo.employee)||{};
      const prevMeetings = activeCase?(activeCase.meetings||[]).slice(-3).map(m=>m.type+" on "+m.date+(m.record?" — "+m.record.slice(0,100):"")).join("; "):"";
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
        meetingType?.label ? "Meeting type: "+meetingType.label : "",
        evidenceList ? "Evidence gathered:"+nl+evidenceList : "",
        prevMeetings ? "Previous meetings: "+prevMeetings : "",
        reviewOutput ? "Meeting record:"+nl+reviewOutput.slice(0,1200) : "",
        tx ? "Transcript:"+nl+tx.slice(0,800) : "",
      ].filter(Boolean).join(nl) + getPolicyCtx();

      const letterInstructions = {
        "invite": "a formal invitation letter to a "+(meetingType?.label||"meeting")+". Include: reason for the meeting, proposed date/time/location placeholders, list of allegations or agenda items (infer from context if available), right to be accompanied by a colleague or trade union rep under ERA 1999 s.10, and how to respond. Follow ACAS Code of Practice.",
        "outcome": "a formal outcome letter following a "+(meetingType?.label||"disciplinary hearing")+". Include: summary of what was discussed, decision reached (infer from context or use [Decision]), reasons for the decision, any sanction imposed (e.g. [First Written Warning] lasting [duration]), right of appeal within 5 working days. Follow ACAS Code of Practice.",
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
      if(text) { setLetterOutput(text); }
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
      const systemPrompt = "You are a senior UK employment lawyer and HR advisor with 20 years of experience. Draft complete, professional HR documents that are legally sound and follow ACAS Code of Practice and relevant UK employment legislation. Always produce a complete document — never refuse or ask for more information. Where specific details are unknown, use clear placeholders in square brackets. Output only the document itself with no preamble, explanation or sign-off instructions.";
      const userPrompt = "Draft a formal investigation report. Include: background and reason for investigation, allegations investigated, investigation process and evidence reviewed, findings for each allegation (upheld/not upheld), overall recommendation (case to answer/no case to answer). This is an internal HR document, not a letter to the employee. Write in formal report style with clear sections."+nl+nl
        +"Employee: "+cs.employeeName+nl
        +"Case type: "+(cs.caseType||"HR Matter")+nl
        +(cs.description?"Case description: "+cs.description+nl:"")
        +(evidenceList?"Evidence gathered:"+nl+evidenceList+nl:"")
        +nl+"Investigation meeting records (full):"+nl+meetingContent+nl+nl
        +"Today's date for reference: "+new Date().toLocaleDateString("en-GB")+". Always complete the full report.";
      const res = await authedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:3000,stream:false,
          system:systemPrompt,
          messages:[{role:"user",content:userPrompt}]
        })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(text) {
        saveCases(cases.map(x=>x.id===caseId?{...x,investigationReport:text,investigationReportDate:new Date().toISOString(),stage:"inv_report"}:x));
        audit("Investigation report generated", cs.employeeName);
        showToast("Investigation report generated");
      } else {
        showToast("Failed to generate investigation report", "error");
      }
    } catch(e) {
      console.error("concludeInvestigation error:", e);
      showToast("Error generating investigation report", "error");
    }
    setConcludingInvestigation(false);
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
                    saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"appeal",meetings:[...x.meetings,meeting]}:x));
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
                  {["Misconduct","Grievance","Performance","Absence","Attendance/sickness","Redundancy","Appeal","Investigation","Disciplinary","Probation","Capability","Flexible working","Other"].map(t=><option key={t} value={t.toLowerCase()}>{t}</option>)}
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
        />
      )}

      {/* ══ HOME MEETING SETUP ══ */}
      {screen===SCREENS.HOME+"_meeting"&&(
        <HomeMeetingScreen meetingSetup={meetingSetup} setMeetingSetup={setMeetingSetup} orgMembers={orgMembers} getEmployeeRecord={getEmployeeRecord} cases={cases} getCaseStage={getCaseStage} activeCaseId={activeCaseId} setActiveCaseId={setActiveCaseId} needsInvitation={needsInvitation} setCaseInfo={setCaseInfo} setMeetingType={setMeetingType} setPendingLetterType={setPendingLetterType} setShowLetterModal={setShowLetterModal} setScreen={setScreen} setTranscript={setTranscript} setPrepNotes={setPrepNotes} setReviewOutput={setReviewOutput} setReviewOutputOriginal={setReviewOutputOriginal} setLetterOutput={setLetterOutput} setRiskScore={setRiskScore} setLiveChatHistory={setLiveChatHistory} setParticipants={setParticipants} fmtDate={fmtDate} startSession={startSession} />
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
          allegations={allegations}
          createAllegation={createAllegation}
          patchAllegation={patchAllegation}
          changeAllegationStatus={changeAllegationStatus}
          deleteAllegation={deleteAllegation}
          auditLog={auditLog}
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
          caseSignals={caseSignals}
          changeSignalStatus={changeSignalStatus}
          generateNextBestAction={generateNextBestAction}
          nextActionLoading={nextActionLoading}
        />
      )}
{/* ══ INTAKE ══ */}
      {screen===SCREENS.INTAKE&&(
        <IntakeScreen setScreen={setScreen} intake={intake} setIntake={setIntake} cases={cases} saveCases={saveCases} />
      )}

{/* ══ PREP ══ */}
      {screen===SCREENS.PREP&&(
        <PrepScreen isMobile={isMobile} meetingType={meetingType} setMeetingType={setMeetingType} caseInfo={caseInfo} setCaseInfo={setCaseInfo} handlePrepare={handlePrepare} aiProcessing={aiProcessing} setScreen={setScreen} bgDoc={bgDoc} setBgDoc={setBgDoc} prepNotes={prepNotes} />
      )}

            {/* ══ RECORD ══ */}
      {screen===SCREENS.RECORD&&(
        <RecordScreen meetingType={meetingType} caseInfo={caseInfo} isListening={isListening} meetingStartTime={meetingStartTime} currentAdjournment={currentAdjournment} setAdjournments={setAdjournments} setCurrentAdjournment={setCurrentAdjournment} setTranscript={setTranscript} inputText={inputText} aiProcessing={aiProcessing} transcript={transcript} addUtterance={addUtterance} handleReview={handleReview} inputRef={inputRef} setMeetingStartTime={setMeetingStartTime} setInputText={setInputText} updateLiveContext={updateLiveContext} stopSpeech={stopSpeech} startSpeech={startSpeech} isScreenCapturing={isScreenCapturing} stopScreenCapture={stopScreenCapture} startScreenCapture={startScreenCapture} importFileRef={importFileRef} handleImportFile={handleImportFile} liveContextLoading={liveContextLoading} liveContext={liveContext} liveChatHistory={liveChatHistory} liveChatProcessing={liveChatProcessing} liveChatInput={liveChatInput} setLiveChatInput={setLiveChatInput} sendLiveChat={sendLiveChat} setScreen={setScreen} confirmDialog={confirmDialog} clearMeetingDraft={()=>lsSet("compass_meeting_draft", null)} promptDialog={promptDialog} />
      )}

      {/* ══ REVIEW ══ */}
      {screen===SCREENS.REVIEW&&(
        <ReviewScreen caseInfo={caseInfo} meetingType={meetingType} isHR={isHR} cases={cases} requestHrReview={requestHrReview} reviewOutput={reviewOutput} reviewOutputOriginal={reviewOutputOriginal} confirmDialog={confirmDialog} setShowShareModal={setShowShareModal} saveMeetingToCase={saveMeetingToCase} setScreen={setScreen} showToast={showToast} askCompassInput={askCompassInput} setAskCompassInput={setAskCompassInput} askCompassHistory={askCompassHistory} setAskCompassHistory={setAskCompassHistory} askCompass={askCompass} setAskCompassProcessing={setAskCompassProcessing} askCompassProcessing={askCompassProcessing} editProcessing={editProcessing} editRecord={editRecord} editingRecord={editingRecord} setEditingRecord={setEditingRecord} aiProcessing={aiProcessing} aiError={aiError} setReviewOutput={setReviewOutput} setShowSignModal={setShowSignModal} riskScore={riskScore} />
      )}

      {/* ══ LETTERS ══ */}
      {screen===SCREENS.LETTER&&(
        <LetterScreen handleLetter={handleLetter} activeLetter={activeLetter} aiProcessing={aiProcessing} letterOutput={letterOutput} letterHistory={letterHistory} restoreLetterVersion={restoreLetterVersion} editingLetter={editingLetter} setEditingLetter={setEditingLetter} setLetterOutput={setLetterOutput} signature={signature} setShowSigPad={setShowSigPad} setSignature={setSignature} caseInfo={caseInfo} triggerWithSig={triggerWithSig} pdfGenerating={pdfGenerating} saveMeetingToCase={saveMeetingToCase} setScreen={setScreen} letterIsApproved={letterIsApproved} letterApproval={letterApproval} approveLetter={approveLetter} />
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
          starterTemplates={starterTemplates}
          saveStarterTemplates={saveStarterTemplates}
          leaverTemplates={leaverTemplates}
          saveLeaverTemplates={saveLeaverTemplates}
          promptDialog={promptDialog}
          confirmDialog={confirmDialog}
          dueSoon={dueSoon}
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
        />
      )}
      </div>
    </div>
  );
}
