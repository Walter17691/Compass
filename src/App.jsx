import { supabase } from './supabase';
import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { MEETING_TYPES, SCREENS, SPEAKERS, NEXT_STEPS_MAP, DEV_MEETING_CONFIG, DEV_TEMPLATES, TEMPLATES, WELLBEING_RESOURCES, WELLBEING_TYPES, POLICY_CATEGORIES, CONCERN_TYPES } from './constants';
import { streamClaude } from './lib/streamClaude';
import { newId } from './lib/ids';
import { addCalendarMonth, toISODateLocal } from './lib/dates';
import { addWorkingDays } from './lib/dateMath';
import { fetchAllPages } from './lib/paginatedFetch';
import { ls, lsSet, orgScopedKey, clearAllOrgScopedData, capRecentForCache } from './lib/storage';
import { findEmployeeByName } from './lib/employeeRecords';
import { computeDueSoon } from './lib/deadlines';
import { mapCaseRow } from './lib/caseMapping';
import { isLetterApproved, createLetterApproval } from './lib/letterApproval';
import { getCaseStage, withStageTransitionStamp, hasLetterType } from './lib/caseStage';
import { getNextStep } from './lib/nextStep';
import { addAllegation, updateAllegation, setAllegationStatus, removeAllegation, allegationStatusMeta, allegationsForCase, linkEvidenceToAllegation, evidenceForAllegation, setAppealOutcome, appealOutcomeMeta } from './lib/allegations';
import { matchExistingTheme, buildThemeSuggestionPrompt, parseThemeSuggestionResponse, buildKnownNameTokens, filterUnsafeThemeSuggestions, isUnsafeThemeSuggestion } from './lib/themes';
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
import { createSignal, setSignalStatus, supersedeOpenSignalsOfType, openSignalsForCase, updateSignal, signalsForCase, findMatchingQuestionSignal } from './lib/caseSignals';
import { computeGuardrailChecks } from './lib/guardrails';
import { addConcernReferral, setReferralStatus, updateConcernReferral } from './lib/concernReferrals';
import { sanitizeTriageSummary } from './lib/concernTriage';
import { seedInvestigationChecklist, investigationChecklistTasks, INVESTIGATION_CHECKLIST_STEPS } from './lib/investigationChecklist';
import { sanitizeInvestigationPlanItems, seedInvestigationPlanTasks } from './lib/investigationPlan';
import { collectInterventionSignals, formatSignalsForPrompt, sanitizeManagerCapabilityInsight } from './lib/managerLearningLoop';
import { computeInvestigationQualityGaps } from './lib/investigationQuality';
import { InvestigationQualityCheckModal } from './components/InvestigationQualityCheckModal';
import { computeChangesSinceView, isNonTrivialChange } from './lib/caseViews';
import { buildCaseTimeline } from './lib/caseTimeline';
import { withFkRetry } from './lib/retryOnFkRace';
import { conditionalUpdate, enqueueSave, withTransientRetry } from './lib/optimisticSave';
import { requestOverride, requestPolicyDeviation } from './lib/humanOverride';
import { caseRoleLabel } from './lib/caseRoles';
import { getProcessType, stageLabel } from './lib/processStages';
import { buildEscalationContext } from './lib/escalation';
import { EscalateToHrModal } from './screens/EscalateToHrModal';
import { getTemplateForType, resolveDefaultTaskDueDate } from './lib/processTemplates';
import { readEvidenceFiles, ensureEvidenceIds } from './lib/evidenceUpload';
import { EvidenceDropzone } from './components/EvidenceDropzone';
import { buildCaseContext, meetingsNeedingSummary, buildOverviewSourceRefs } from './lib/caseContext';
import { canAnalyseEvidence, buildAnalysisContent } from './lib/documentIngestion';
import { OH_REPORT_SYSTEM_PROMPT, buildOhFindings, ohFindingTaskName } from './lib/ohReportIntelligence';
import { isTerminalStatus, signatureStatusLabel } from './lib/eSignature';
import { parseCommitmentDueDate, suggestTaskOwner } from './lib/taskDueDateParsing';
import { derivePeopleForCase } from './lib/casePeople';
import { matchCaseByEmployeeName, matchCaseByEmployeeNameWithConfidence } from './lib/globalAssistant';
import { buildGlobalStatsContext, inferInsightsTab, GLOBAL_CHAT_SYSTEM_PROMPT } from './lib/globalAnalytics';
import { computeAppealIntelligence } from './lib/appealIntelligence';
import { COMMAND_BAR_SYSTEM_PROMPT, resolveCommandBarPlan } from './lib/commandBar';
import { buildHearingPackSections, buildHearingPackEvidenceItem } from './lib/hearingPack';
import { fmtMeetingTime } from './lib/meetingTiming';
import { buildEmailEvidenceItem, buildConcernDescriptionFromEmail } from './lib/emailIngestion';
import { buildSentLetterEvidenceItem, findTaskToCompleteForSentLetter, buildLetterSubject, matchReplyToSentLetters } from './lib/letterSend';
import { snapshotUnresolvedSuggestions, taskFieldsForSuggestion } from './lib/meetingCompletion';
import { buildEmployeeSnapshot, mergeHrisEmployeesIntoRecords } from './lib/employeeHistory';
import { parseEmployeeDeepLink } from './lib/hrisDeepLink';
import { buildEventTimes, parseAttendees, buildScheduledMeetingEntry } from './lib/meetingScheduling';
import { appealLinkCandidates } from './lib/appealLink';
import { isHrRole } from './lib/roles';
import { computeSelectionScore } from './lib/redundancyScoring';
import { parseCsv, toCsv, csvRowsToObjects } from './lib/csv';
import { authedFetch } from './lib/authedFetch';
import { useFonts } from './hooks/useFonts';
import { useModalA11y } from './hooks/useModalA11y';
import { addLoadIssue, removeLoadIssue } from './lib/dataLoadIssues';
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
import { OpenInCompassScreen } from './screens/OpenInCompassScreen';
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
const DevelopScreen = lazy(() => import('./screens/DevelopScreen').then(m => ({default: m.DevelopScreen})));
const RedundancyScreen = lazy(() => import('./screens/RedundancyScreen').then(m => ({default: m.RedundancyScreen})));
const ConcernsScreen = lazy(() => import('./screens/ConcernsScreen').then(m => ({default: m.ConcernsScreen})));
const ManagerPortalScreen = lazy(() => import('./screens/ManagerPortalScreen').then(m => ({default: m.ManagerPortalScreen})));
const HrDelegatedWorkScreen = lazy(() => import('./screens/HrDelegatedWorkScreen').then(m => ({default: m.HrDelegatedWorkScreen})));
// Organisational ER Intelligence (Phase 6, OP1) — replaces the separate
// ManagerInsightsScreen/ErReportScreen lazy chunks above: both are now
// reached only as tabs inside InsightsScreen, which imports them
// directly, so they load together as one chunk with their new shared home.
const InsightsScreen = lazy(() => import('./screens/InsightsScreen').then(m => ({default: m.InsightsScreen})));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen').then(m => ({default: m.SettingsScreen})));
const DsarScreen = lazy(() => import('./screens/DsarScreen').then(m => ({default: m.DsarScreen})));
const TasksScreen = lazy(() => import('./screens/TasksScreen').then(m => ({default: m.TasksScreen})));
const CalendarScreen = lazy(() => import('./screens/CalendarScreen').then(m => ({default: m.CalendarScreen})));
import { OnboardingWizard } from './screens/OnboardingWizard';
import { CommandBarModal } from './screens/CommandBarModal';
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

  // Phase 6.5 hardening (accessibility/UX reliability pass) — none of
  // this file's ~20 data loaders ever surfaced a failed fetch to the
  // user; each one only console.error'd and left its own state at
  // whatever it already was (usually [], the initial value), which every
  // consuming screen renders as a genuine "No X yet" empty state. A
  // network blip or an RLS/permission error was therefore
  // indistinguishable from "this org really has none of this data" —
  // dataLoadIssues/markLoadIssue collect which entities failed in the
  // most recent load attempt so a single, persistent banner (rendered
  // once, near the toast) can tell the user something actually went
  // wrong, with a real Retry action, instead of silently rendering an
  // empty list as fact. Declared at the very top of the component,
  // ahead of every loader that references markLoadIssue/clearLoadIssue,
  // since those loaders are themselves declared at many different points
  // throughout this file.
  const [dataLoadIssues, setDataLoadIssues] = useState([]);
  const [loadBannerDismissed, setLoadBannerDismissed] = useState(false);
  const markLoadIssue = (label) => setDataLoadIssues(prev => {
    const next = addLoadIssue(prev, label);
    // A genuinely new failure re-surfaces the banner even if the user
    // dismissed an earlier one this session — dismissing isn't a
    // standing "never tell me again," just "I've seen this specific
    // problem."
    if(next !== prev) setLoadBannerDismissed(false);
    return next;
  });
  // A few loaders (audit log, cases) also refetch from their own
  // independent effect — a window-focus refresh, for instance — outside
  // loadOrgData's own batch reset. Clearing the specific label on THAT
  // loader's own next success keeps the banner accurate without needing
  // every independent refresh path to also reset the whole array.
  const clearLoadIssue = (label) => setDataLoadIssues(prev => removeLoadIssue(prev, label));

  // Phase 6.5 hardening — tenant isolation. main.jsx now keys this whole
  // component on org.id, so a React-state remount is guaranteed on every
  // org switch; that alone doesn't help localStorage, since a fresh
  // mount's useState(ls("compass_cases", [])) initialisers would just
  // re-read whatever the PREVIOUS org last wrote under that same global
  // key. orgLs/orgLsSet namespace every tenant-data key by the active
  // org's id so a browser used across multiple orgs (an HR consultancy
  // running cases for several clients from one login, per main.jsx's own
  // Root() comment) can never seed one org's cases/employee records/
  // wellbeing notes/branding assets from another org's cached copy.
  // Deliberately NOT applied to compass_gdpr/compass_onboard(ed) — those
  // are non-sensitive, no-PII UI-acknowledgement flags, not tenant data;
  // namespacing them would just make the onboarding wizard re-appear
  // needlessly per org for no privacy benefit.
  // useCallback keeps these referentially stable across renders (they only
  // change identity if org?.id itself changes, which — now that main.jsx
  // fully remounts this component per org — never happens within one
  // mounted instance's lifetime) so the two effects below that read
  // localStorage through them can list them as real dependencies instead
  // of tripping the exhaustive-deps lint rule.
  const orgLs = useCallback((key, fallback) => ls(orgScopedKey(org?.id, key), fallback), [org?.id]);
  const orgLsSet = useCallback((key, val) => lsSet(orgScopedKey(org?.id, key), val), [org?.id]);

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
  // Human UAT remediation, Batch 2, Part 12 — report generation
  // performance. Measured first: the report itself is a genuinely
  // unavoidable ~3400-token AI generation (multi-part structure,
  // ACAS-compliant analysis) — nothing about that latency is removable.
  // What WAS removable was the perceived wait: this used a non-streaming
  // call, so nothing appeared on screen until the entire document was
  // ready, unlike every other long-form generation in this app
  // (handleReview's meeting record, LetterScreen's letters), which
  // already stream. Converting this one to stream too — real words
  // appearing as they're generated — replaces a blank "Generating
  // report..." wait with genuine progress, not a fake percentage.
  const [investigationReportDraft, setInvestigationReportDraft] = useState("");
  const [prepNotes, setPrepNotes] = useState("");
  // Meeting Intelligence Phase 2 (M1) — structured, editable pre-meeting
  // questions alongside the free-text prep pack: {id, text, category,
  // essential, reasoning, linkedAllegationId, linkedEvidenceId, source}.
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
    audit("AI-drafted letter approved for sending", `${caseInfo.employee||"Employee"} — ${meetingType?.label||""} (${activeLetter})`, activeCaseId);
  };
  const [riskScore, setRiskScore] = useState(null);
  const [riskProcessing, setRiskProcessing] = useState(false);
  const [prediction, setPrediction] = useState("");
  const [predProcessing, setPredProcessing] = useState(false);
  const [nextSteps, setNextSteps] = useState([]); // [{step, deadline, done}]

  // ── PDF/Word ──
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [wordGenerating, setWordGenerating] = useState(false);
  const [signature, setSignature] = useState(orgLs("compass_signature", null));
  const [showSigPad, setShowSigPad] = useState(false);
  const [pendingSend, setPendingSend] = useState(null);

  // ── Settings ──
  const [letterhead, setLetterhead] = useState(orgLs("compass_letterhead", null));
  const [wordTemplate, setWordTemplate] = useState(orgLs("compass_word_template", null));
  const [policies, setPolicies] = useState(orgLs("compass_policies", []));
  const [policyProcessing, setPolicyProcessing] = useState(false);

  // ── Cases ──
  const [cases, setCases] = useState(orgLs("compass_cases", []));
  // Phase 6.5 hardening (closes Prompt 11 audit finding 7.6, MEDIUM) —
  // kept in sync SYNCHRONOUSLY inside saveCases itself (not via a
  // useEffect, which only runs after React commits a render — too late
  // for this). A caller that builds several sequential saveCases calls
  // from the SAME synchronous run (e.g. resendSignatureReminder inside
  // AutomationSuggestionsPanel's multi-meeting resend loop, each call
  // awaited before the next starts) would otherwise have every call
  // after the first compute its update from the same stale `cases`
  // closure — each setCases call overwrites the previous one's change
  // rather than composing with it, so only the LAST meeting's
  // reminderSentAt stamp survives, silently leaving every earlier one in
  // the loop still eligible to fire again next cooldown cycle. Reading
  // casesRef.current instead of `cases` in a call site that loops like
  // this sees every prior iteration's own change.
  const casesRef = useRef(cases);
  // Phase 6.5 hardening (P1, reliability review) — cases seeds from a
  // local cache (orgLs), so a returning user usually sees real (if
  // slightly stale) data immediately. A first-ever load on a device, or
  // right after "Delete all data"/sign-out clears that cache, starts
  // from cases=[] — indistinguishable, until now, from "this org
  // genuinely has zero cases," which CasesScreen renders as "No cases
  // yet" with a call to action to create one. For a large org (several
  // thousand cases, now correctly paginated across multiple round-trips
  // rather than silently truncated — see loadCasesFromDB), that fetch
  // can take a few real seconds; showing a false "no cases" empty state
  // during that window risks someone clicking "Create first case" for an
  // org that already has thousands.
  const [casesLoading, setCasesLoading] = useState(true);
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
      // Phase 6.5 hardening (Prompt 14, Section 6 — closes independent
      // audit finding 3.2/4.2, CRITICAL) — was a flat .limit(500): a real
      // org's audit_log already holds tens of thousands of rows, so this
      // silently truncated to the newest 500 everywhere the audit trail is
      // shown (AuditTrailSection) OR exported (DSAR — compileSubjectData
      // received this same capped array). Paged on a stable order (id, the
      // uuid primary key isn't itself meaningful for sorting, but ties
      // with created_at ensure no page skips/dupes), then reversed once to
      // keep every existing caller's newest-first expectation.
      const { data, error } = await fetchAllPages((from, to) => supabase.from('audit_log').select('*').eq('org_id', org.id).order('created_at',{ascending:true}).order('id',{ascending:true}).range(from, to));
      if(error) { console.error("Load audit log error:", error); markLoadIssue('audit log'); return; }
      clearLoadIssue('audit log');
      if(data) setAuditLog(data.map(r=>({id:r.id, ts:r.created_at, user:r.user_name, action:r.action, detail:r.detail||"", caseId:r.case_id||null, aiPrepared:r.ai_prepared||false, approvedBy:r.approved_by||null, dataUsed:r.data_used||null})).reverse());
    } catch(e) { console.error("Load audit log error:", e); markLoadIssue('audit log'); }
  };
  useEffect(() => { if(org?.id) loadAuditLog(); }, [org?.id]);
  // Pick up entries other team members logged while this tab was in the
  // background — cheap alternative to a realtime subscription.
  useEffect(() => {
    const onFocus = () => { if(org?.id) loadAuditLog(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [org?.id]);

  // ── Integration health (Phase 5, IP4 — see integration_events_2026-08-15.sql) ──
  // HR-only, same reasoning as loadWellbeingNotes: org-wide integration
  // health is an admin concern, not something every member connecting
  // their own mailbox needs to see. Declared here (rather than nearer the
  // OAuth connection state further down) so it's already defined by the
  // time the isHR-gated load effect below references it.
  const [integrationEvents, setIntegrationEvents] = useState([]);
  const loadIntegrationEvents = async () => {
    if(!org?.id) return;
    try {
      const { data, error } = await supabase.from('integration_events').select('*').eq('org_id', org.id).order('created_at',{ascending:false}).limit(500);
      if(error) { console.error("Load integration events error:", error); markLoadIssue('integration events'); return; }
      if(data) setIntegrationEvents(data);
    } catch(e) { console.error("Load integration events error:", e); markLoadIssue('integration events'); }
  };

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
  const [employmentProfileOutput, setEmploymentProfileOutput] = useState("");
  const [employeeRecords, setEmployeeRecords] = useState(orgLs("compass_employees", []));
  const saveEmployeeRecords = u => { setEmployeeRecords(u); orgLsSet("compass_employees", u); };
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
  const loadEmployeeRecords = async () => {
    if(!org?.id) return;
    try {
      // Phase 6.5 hardening (Batch 6) — same unpaginated-select bug as
      // loadCasesFromDB, and equally real here: this org's real
      // employee_records count already exceeds the common single-request
      // row cap, so this was silently dropping real employees from the
      // roster. Same fix, paged on a stable order (id, the primary key).
      const { data, error } = await fetchAllPages((from, to) => supabase.from('employee_records').select('*').eq('org_id', org.id).order('id', { ascending: true }).range(from, to));
      if (error) { console.error('loadEmployeeRecords', error); markLoadIssue('employee records'); }
      setEmployeeRecords(data.map(r=>({name:r.name,jobTitle:r.job_title,startDate:r.start_date,location:r.location,employeeNumber:r.employee_number||"",department:r.department||"",manager:r.manager||"",status:r.status||"",workingPattern:r.working_pattern||"",probationEndDate:r.probation_end_date||""})));
    } catch(e) { console.error('loadEmployeeRecords', e); markLoadIssue('employee records'); }
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
      // IP20 — the richer HRIS field set (lib/hrisAdapter.js's own
      // canonical shape); nullable and additive, existing callers that
      // don't pass these just write null, same as before this phase.
      employee_number: fields.employeeNumber||null,
      department: fields.department||null,
      manager: fields.manager||null,
      status: fields.status||null,
      working_pattern: fields.workingPattern||null,
      probation_end_date: fields.probationEndDate||null,
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
      // IP20 — recognises the full HRIS field set (lib/hrisAdapter.js's
      // canonical shape) if the CSV has those columns, same as before if
      // it doesn't (they just come through as "").
      const records = valid.map(o => ({
        name: o.name.trim(),
        jobTitle: o['job title']||o.jobtitle||"",
        startDate: o['start date']||o.startdate||"",
        location: o.location||"",
        employeeNumber: o['employee number']||o.employeenumber||o['emp no']||o.empno||"",
        department: o.department||o.dept||"",
        manager: o.manager||"",
        status: o.status||"",
        workingPattern: o['working pattern']||o.workingpattern||"",
        probationEndDate: o['probation end date']||o.probationenddate||"",
      }));

      const merged = mergeHrisEmployeesIntoRecords(employeeRecords, records.map(r=>({...r, site:r.location})));
      saveEmployeeRecords(merged);

      if(org?.id && records.length>0) {
        const { error } = await supabase.from('employee_records').upsert(
          records.map(r => ({
            org_id: org.id,
            name: r.name,
            job_title: r.jobTitle||null,
            start_date: r.startDate||null,
            location: r.location||null,
            employee_number: r.employeeNumber||null,
            department: r.department||null,
            manager: r.manager||null,
            status: r.status||null,
            working_pattern: r.workingPattern||null,
            probation_end_date: r.probationEndDate||null,
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
    const rows = [["Name","Job title","Start date","Location","Employee number","Department","Manager","Status","Working pattern","Probation end date"]];
    employeeRecords.forEach(r => rows.push([r.name||"", r.jobTitle||"", r.startDate||"", r.location||"", r.employeeNumber||"", r.department||"", r.manager||"", r.status||"", r.workingPattern||"", r.probationEndDate||""]));
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
      const {data, error} = await supabase.from('org_roles').select('*').eq('org_id', org.id).order('access_level', {ascending:false});
      if(error) { console.error('loadOrgRoles', error); markLoadIssue('roles'); return; }
      if(data) setOrgRoles(data);
    } catch(e) { console.error('loadOrgRoles', e); markLoadIssue('roles'); }
  };
  const loadOrgMembers = async () => {
    if(!org?.id) return;
    try {
      // Phase 6.5 hardening (structural remediation, Prompt 12 —
      // Pagination / Complete-Data invariant) — no test org currently
      // exceeds PostgREST's default row cap here, but a real enterprise
      // client's team list plausibly could; fixed proactively with the
      // same fetchAllPages pattern rather than waiting for a live
      // truncation like loadCasesFromDB/loadCaseViews already hit.
      const {data, error} = await fetchAllPages((from, to) => supabase.from('org_members').select('*').eq('org_id', org.id).order('id', {ascending:true}).range(from, to));
      if(error) { console.error('loadOrgMembers', error); markLoadIssue('team members'); return; }
      if(data) setOrgMembers(data);
    } catch(e) { console.error('loadOrgMembers', e); markLoadIssue('team members'); }
  };
  // ── Letter tracking ──
  // Stored per meeting as letterTracking: [{letterId, sentAt, deliveredAt, acknowledgedAt}]

  // ── Reasonable adjustments ──
  const [adjustments, setAdjustments] = useState(orgLs("compass_adjustments", {})); // {caseId: [{id, adjustment, agreed, review, done}]}

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
  const [shareRecipientName, setShareRecipientName] = useState("");
  const [shareSubject, setShareSubject] = useState("");
  const [sharePersonalMessage, setSharePersonalMessage] = useState("");
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

  // Human UAT remediation, Batch 1 hardening round 2 — the signature-sync
  // effect that used to live here (checks pending meeting signatures
  // against the real status whenever a case is opened) was relocated
  // below `audit`'s own declaration: it calls audit() to log a signature
  // completion (Batch 1, Issue 3), and a lint rule (react-hooks/
  // immutability) correctly flags calling a not-yet-declared binding
  // regardless of how far away the actual invocation is deferred to — see
  // its new home just after `audit` itself, a few hundred lines down,
  // for the full effect and its own comments.

  // Phase 13 — "What Changed Since Last View." Reads the stored
  // last_viewed_at BEFORE recordCaseView overwrites it below, same
  // once-per-visit shape as the signature-sync effect elsewhere in this
  // file (deps deliberately just [screen, activeCaseId] — this should
  // diff once per open, not re-run and keep sliding the comparison point
  // forward on every unrelated case edit while the user is still looking
  // at it).
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

  // Integrations & Workflow Automation (Phase 5, IP27, §21) — generalised
  // from the meeting-record-only flow below into something any document
  // type can call: outcome letters (LetterScreen), agreed adjustments
  // (OccupationalHealthPanel), and consultation records (already just
  // meetings, no change needed — meetingType has always been free text).
  // Returns {success, signId} rather than driving UI itself, so each
  // caller decides what "success" means for its own document (save a
  // meeting, advance an OH step, or just show a toast).
  const sendDocumentForSignature = async ({ document, employeeEmail, employeeName, managerName, managerEmail, documentType, documentLabel, documentDate, requiresSignature=true, caseId, letterType }) => {
    if(!employeeEmail||!document) return { success:false };

    // Store document in Supabase via API. Authenticated — this step creates
    // the signing request and mints its sign_id server-side, unlike the
    // signer's later PATCH, which is intentionally reachable without a
    // session (see api/signing.js).
    const storeRes = await authedFetch("/api/signing", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        document, employeeEmail, employeeName, managerName, managerEmail,
        meetingType: documentLabel, meetingDate: documentDate,
        documentType, requiresSignature, orgId: org?.id,
      })
    });
    if(!storeRes.ok) {
      showToast("Couldn't prepare the document for signing — please try again", "error");
      return { success:false };
    }
    const { signId } = await storeRes.json();

    const res = await authedFetch("/api/send-for-signature", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        employeeEmail, employeeName, managerName,
        meetingType: documentLabel, meetingDate: documentDate,
        documentType, requiresSignature, signId, orgId: org?.id, caseId, letterType,
      })
    });
    const data = await res.json();
    if(data.success) {
      showToast((requiresSignature===false?"Acknowledgement":"Signature")+" request sent to "+employeeEmail);
      return { success:true, signId };
    }
    showToast("Failed to send: "+(data.error||JSON.stringify(data)), "error");
    return { success:false, signId };
  };

  // Integrations & Workflow Automation (Phase 5, IP28, §22-23) — the one
  // real, safe administrative action Prepare/Automate can execute
  // against (lib/automationLevels.js's AUTOMATABLE_RULE_IDS): resending
  // the signing-link email for a meeting record that's already been sent
  // and is still sitting unsigned. Looks up the original recipient via
  // the signing_requests row itself (employee_email, added this phase —
  // the address was previously only ever collected once, at send time,
  // and never persisted anywhere retrievable). Stamps reminderSentAt on
  // the meeting so automationRules.js's own cooldown check keeps this
  // from firing again on every render at Automate level.
  const resendSignatureReminder = async (cs, meeting, { level } = {}) => {
    if(!meeting?.signId) return { success:false };
    try {
      // internal=1 — looking up the recipient address to chase, not the
      // employee opening their link; must not itself mark the request
      // "opened" (see api/signing.js's own comment on this parameter).
      // Now a real auth boundary server-side (Prompt 11 audit finding
      // 2.10, MEDIUM), so authedFetch + orgId, same as the signature-sync
      // poll above.
      const statusRes = await authedFetch(`/api/signing?signId=${encodeURIComponent(meeting.signId)}&internal=1&orgId=${encodeURIComponent(org?.id||"")}`);
      if(!statusRes.ok) { showToast("Couldn't find that signing request", "error"); return { success:false }; }
      const request = await statusRes.json();
      if(!request.employee_email) { showToast("No email on file for this reminder — resend manually from the meeting", "error"); return { success:false }; }
      const res = await authedFetch("/api/send-for-signature", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          employeeEmail: request.employee_email, employeeName: request.employee_name, managerName: request.manager_name,
          meetingType: request.meeting_type, meetingDate: request.meeting_date,
          documentType: request.document_type, requiresSignature: request.requires_signature,
          signId: meeting.signId, appUrl: window.location.origin,
          orgId: org?.id, caseId: cs.id,
        })
      });
      const data = await res.json();
      if(!data.success) { showToast("Failed to send reminder: "+(data.error||JSON.stringify(data)), "error"); return { success:false }; }
      // Phase 6.5 hardening (closes Prompt 11 audit finding 7.6, MEDIUM) —
      // casesRef.current, not `cases` — this is called in a sequential,
      // awaited loop over several meetings on the SAME case
      // (AutomationSuggestionsPanel's multi-meeting resend), all within
      // one synchronous run before React commits a new render. Reading
      // the stale `cases` closure meant each call after the first
      // rebuilt its update from a version of this case that didn't yet
      // include the previous meeting's own reminderSentAt stamp, so only
      // the LAST meeting resent in the loop actually got its cooldown
      // stamp — every earlier one stayed silently eligible to fire again
      // next cycle.
      saveCases(casesRef.current.map(x=>x.id===cs.id?{...x, meetings:(x.meetings||[]).map(m=>m.id===meeting.id?{...m, reminderSentAt:new Date().toISOString()}:m)}:x), cs.id);
      // Phase 5, IP30, §29 — the automation-provenance fields: Automate
      // ran with no human click (aiPrepared:true, no approver); Prepare
      // means this exact click on "Send reminder" *is* the approval.
      audit("Signature reminder resent", meeting.type||"Meeting record", cs.id, {
        aiPrepared: level === "automate",
        approvedBy: level === "prepare" ? (currentUser?.name || "HR Manager") : null,
        dataUsed: `${meeting.type||"Meeting"} record dated ${meeting.date||"unknown"}, unsigned since sent`,
      });
      showToast("Reminder sent to "+request.employee_email);
      return { success:true };
    } catch(e) {
      console.error("resendSignatureReminder", e);
      showToast("Couldn't send the reminder — please try again", "error");
      return { success:false };
    }
  };

  const sendForSignature = async (employeeEmail) => {
    if(!employeeEmail||!reviewOutput) return;
    const document = (()=>{
      const full = reviewOutput;
      const start = full.indexOf("## Meeting Details");
      const advisorCut = full.indexOf("## HR Advisor");
      const keyCut = full.indexOf("\n## Key Points");
      const end = advisorCut>-1 ? advisorCut : keyCut>-1 ? keyCut : undefined;
      const raw = start>-1 ? full.slice(start, end) : full.slice(0, advisorCut>-1?advisorCut:undefined);
      return raw.replace(/^## /gm,"").replace(/^# /gm,"").replace(/\*\*/g,"");
    })();
    const { success, signId } = await sendDocumentForSignature({
      document, employeeEmail,
      employeeName: caseInfo.employee||"Employee",
      managerName: caseInfo.manager||"Manager",
      documentType: "meeting_record",
      documentLabel: meetingType?.label||"Meeting",
      // Human UAT remediation, Batch 2, Part 7 — caseInfo.date defaults
      // to a raw ISO string (new Date().toISOString().split("T")[0]),
      // which used to reach the signature/acknowledgement email
      // unformatted (api/send-for-signature.js interpolates
      // meetingDate directly) — an employee could receive "is ready for
      // your signature on 2026-08-31" instead of a UK date.
      documentDate: fmtDate(caseInfo.date)||new Date().toLocaleDateString("en-GB"),
      caseId: activeCaseId,
    });
    if(!success) return;
    setShowSignModal(false);
    // saveMeetingToCase() navigates to the saved case itself now (both
    // branches — witness interviews to the linked case, regular meetings
    // to the found-or-just-created one), so this no longer needs its own
    // duplicate lookup-and-navigate logic.
    saveMeetingToCase({ signId, signStatus: "sent" });
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
            .map((m,i)=>({ id:newId("mes"), description:m.description, kind:m.kind==="witness"?"witness":"evidence", status:"pending" }));
          return fresh.length ? [...existing, ...fresh] : existing;
        });
      }
      // M4 — same merge discipline for detected actions/commitments.
      if(Array.isArray(parsed.actionsIdentified) && parsed.actionsIdentified.length) {
        setMeetingActionSuggestions(existing => {
          const known = new Set(existing.map(s=>s.description.trim().toLowerCase()));
          const fresh = parsed.actionsIdentified
            .filter(a=>a?.description && !known.has(a.description.trim().toLowerCase()))
            .map((a,i)=>({ id:newId("mas"), description:a.description, suggestedOwner:a.suggestedOwner||"", suggestedDueDate:a.suggestedDueDate||"", status:"pending" }));
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
    // Phase 6.5 hardening (closes Prompt 11 audit finding 7.8, MEDIUM) —
    // this filtered on !s.applied but never actually set applied:true
    // afterward, so a suggestion stayed eligible forever: any later call
    // to this same function (there are two call sites, and nothing
    // scopes either to "only suggestions from this specific meeting")
    // re-created a task for every suggestion ever accepted, not just
    // newly-accepted ones.
    const evidenceIdsApplied = [];
    meetingEvidenceSuggestions.filter(s=>s.status==="accepted" && !s.applied).forEach(s => {
      createCaseTask(caseId, {
        name: s.kind==="witness" ? "Interview "+s.description+" as a potential witness" : "Request "+s.description,
      });
      evidenceIdsApplied.push(s.id);
    });
    if(evidenceIdsApplied.length) setMeetingEvidenceSuggestions(s => s.map(x=>evidenceIdsApplied.includes(x.id)?{...x,applied:true}:x));

    const actionIdsApplied = [];
    meetingActionSuggestions.filter(s=>s.status==="accepted" && !s.applied).forEach(s => {
      createCaseTask(caseId, { name:s.description, owner:s.suggestedOwner||"", dueDate:s.suggestedDueDate||"" });
      actionIdsApplied.push(s.id);
    });
    if(actionIdsApplied.length) setMeetingActionSuggestions(s => s.map(x=>actionIdsApplied.includes(x.id)?{...x,applied:true}:x));
  };

  // IP18, §12 — the post-meeting counterpart to applyPendingMeetingSuggestions
  // above: acting on (or dismissing) a suggestion that survived onto a
  // SAVED meeting's own unresolvedSuggestions, from the Meetings tab,
  // potentially long after the live session ended. taskFieldsForSuggestion
  // (lib/meetingCompletion.js) is the same task-naming convention
  // applyPendingMeetingSuggestions already uses, so a suggestion resolved
  // here creates an identical task to one accepted live.
  const acceptSavedMeetingSuggestion = (cs, meetingId, suggestion) => {
    createCaseTask(cs.id, taskFieldsForSuggestion(suggestion));
    saveCases(cases.map(x=>x.id===cs.id?{...x, meetings:x.meetings.map(m=>m.id===meetingId?{...m, unresolvedSuggestions:(m.unresolvedSuggestions||[]).filter(s=>s!==suggestion)}:m)}:x), cs.id);
  };
  const dismissSavedMeetingSuggestion = (cs, meetingId, suggestion) => {
    saveCases(cases.map(x=>x.id===cs.id?{...x, meetings:x.meetings.map(m=>m.id===meetingId?{...m, unresolvedSuggestions:(m.unresolvedSuggestions||[]).filter(s=>s!==suggestion)}:m)}:x), cs.id);
  };

  const [meetingStartTime, setMeetingStartTime] = useState(null);
  const [meetingEndTime, setMeetingEndTime] = useState(null);
  const [editingRecord, setEditingRecord] = useState(false);
  const [reviewAttachment, setReviewAttachment] = useState(null);
  const [showSignModal, setShowSignModal] = useState(false);
  // Integrations & Workflow Automation (Phase 5, IP27, §21) — a separate
  // modal from showSignModal/signEmail above rather than overloading it:
  // that one always drives sendForSignature (a meeting record, drawn
  // signature required); this one drives an outcome letter through
  // sendDocumentForSignature with requiresSignature:false (an
  // acknowledgement, not a signature) — different backing action,
  // different email-collection state, same UI shape.
  const [showLetterAckModal, setShowLetterAckModal] = useState(false);
  const [letterAckEmail, setLetterAckEmail] = useState("");
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
      // owner_id/manager/priority: found during final review — these were
      // missing from this select list despite saveCaseToDB writing all
      // three on every save, so every load silently reverted them to
      // null/"normal" and the NEXT save persisted that reversion. This
      // isn't just a display bug: owner_id is one of MP1's own three
      // access paths ("cases they created, own, or hold case_access on")
      // — a case owner who neither created the case nor holds a
      // case_access row was being silently locked out of their own case
      // the moment anyone saved it. manager being nulled the same way
      // also undid MP19's "take over case" reassignment on the very next
      // save.
      // Phase 6.5 hardening (Batch 6) — PostgREST caps a single request's
      // rows regardless of any .limit() short of paginating (this org's
      // real case count, 1929, already exceeds the common 1000-row
      // default, so this was silently dropping real cases from view, not
      // a theoretical risk). .order() is required, not cosmetic:
      // range-based pagination (fetchAllPages) needs a stable row order
      // across requests, or rows can be skipped or duplicated between
      // pages.
      const { data, error } = await fetchAllPages((from, to) => supabase.from('cases')
        .select('id,employee_name,employee_email,meetings,evidence,stage,case_type,description,date_received,urgency,outcome,investigation_report,investigation_report_date,disciplinary_officer,disciplinary_officer_id,disciplinary_officer_email,investigating_manager,handoff_date,next_steps,location_id,estimated_weekly_pay,estimated_age_at_dismissal,assigned_to,created_by,created_at,updated_at,confidential,timeline_overrides,fit_note_end_date,probation_review_date,oh_referral_date,oh_report_received_date,oh_process,suspension_review_date,investigation_paused,owner_id,manager,priority')
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })
        .range(from, to));
      // Phase 6.5 hardening (accessibility/UX reliability pass) — a
      // failed fetch used to be logged and then IGNORED: this still fell
      // through to setCases with whatever fetchAllPages had accumulated
      // before the error (often []), silently presenting a load failure
      // as "this org has zero cases" — CasesScreen's own casesLoading
      // fix (Batch 6) already stops that from being confused with "still
      // loading", but did nothing for the case where loading genuinely
      // finished, badly. markLoadIssue surfaces it via the shared banner.
      if (error) { console.error("Load cases error:", error); markLoadIssue('cases'); }
      else clearLoadIssue('cases');
      // ensureEvidenceIds — see saveCases' own use of it (Phase 6.5
      // hardening, P0, Cluster 8): backfills a stable id onto any
      // evidence item that predates this fix, here so a legacy case's
      // evidence has real ids from the moment it's loaded, not only
      // after its next save.
      setCases(data.map(mapCaseRow).map(ensureEvidenceIds));
    } catch(e) { console.error("Load cases error:", e); markLoadIssue('cases'); }
    // finally, not just the success path — an error still means the
    // FIRST load attempt has resolved (however it went), so the "still
    // loading" state shouldn't persist forever on a failure. Only ever
    // clears the flag, never re-sets it true — the window-focus refetch
    // below re-runs this same function on every tab focus, and that
    // background refresh must never flash the UI back into a loading
    // state once real data has already been shown once.
    setCasesLoading(false);
  };

  const saveCaseToDB = async (caseObj) => {
    if(!org?.id) return { ok: false, reason: 'error' };
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
        oh_process: caseObj.ohProcess || null,
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
        if(error) { console.error("Save case error:", error); showToast("Couldn't save the case — "+error.message, "error"); return { ok: false, reason: 'error' }; }
        if(!data || data.length===0) {
          // UAT Product Hierarchy pass, Part 5 — the underlying stale-
          // write protection (conditionalUpdate's conflict detection,
          // above) is untouched; only the presentation changes. This is
          // auto-resolved by the reload that follows, so it reads as a
          // routine refresh rather than a system failure, and uses the
          // "info" toast type so it auto-dismisses instead of sitting
          // there like an unresolved error.
          //
          // E2E Navigation Alignment pass, outcome-recording defect (P2)
          // — a plain `false` here was indistinguishable from a genuine
          // save error to every caller, so OutcomeModal's finalizeOutcome
          // (the one caller that actually branches on failure) always
          // overwrote this exact, already-accurate message with its own
          // generic "Couldn't record the outcome — please try again",
          // even though nothing failed: this is a benign, already-
          // recovered conflict (the case was refreshed by loadCasesFromDB
          // above), not a persistence failure. reason:'conflict' lets a
          // caller that cares tell the two apart without parsing toast
          // text; callers that don't care (the signature-sync poll below)
          // just keep checking `.ok`, unchanged either way.
          showToast("This case was updated — new information was added while you were working. We've refreshed it with the latest version.", "info");
          loadCasesFromDB();
          return { ok: false, reason: 'conflict' };
        }
      } else {
        const { error } = await supabase.from('cases').upsert(payload).select();
        if(error) { console.error("Save case error:", error); showToast("Couldn't save the case — "+error.message, "error"); return { ok: false, reason: 'error' }; }
      }
      setCases(prev => prev.map(c => c.id===caseObj.id ? {...c, updatedAt: nowIso} : c));
      // Phase 6.5 hardening (closes Prompt 16 audit finding H4, HIGH) —
      // a real, awaitable success signal, not just "the promise settled"
      // (every path above already resolved normally even on a handled
      // error, via its own showToast + early return). Every existing
      // caller already ignores this return value (fire-and-forget), so
      // this is purely additive — the one caller that now needs a real
      // confirmation before declaring success is OutcomeModal's
      // finalizeOutcome, the highest-stakes single write in the app.
      return { ok: true };
    } catch(e) { console.error("Save case error:", e); showToast("Couldn't save the case — "+e.message, "error"); return { ok: false, reason: 'error' }; }
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
    try {
      // Phase 6.5 hardening (structural remediation, Prompt 12 —
      // Pagination / Complete-Data invariant) — same reasoning as
      // loadOrgMembers above.
      const { data, error } = await fetchAllPages((from, to) => supabase.from('org_members').select('*').eq('org_id', org.id).order('id', {ascending:true}).range(from, to));
      if(error) { console.error('loadTeamMembers', error); markLoadIssue('team members'); return; }
      if(data) setTeamMembers(data);
    } catch(e) { console.error('loadTeamMembers', e); markLoadIssue('team members'); }
  };

  const removeMember = async (member) => {
    const ok = await confirmDialog({title:"Remove team member", message:`Remove ${member.name} from the team? They will lose access to Compass immediately.`, confirmLabel:"Remove", danger:true});
    if(!ok) return;
    try {
      const r = await authedFetch("/api/delete-member", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ orgMemberId: member.id, orgId: org.id })
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
    try {
      const { data, error } = await supabase.from('locations').select('*').eq('org_id', org.id);
      if(error) { console.error('loadLocations', error); markLoadIssue('locations'); return; }
      if(data) setLocations(data);
    } catch(e) { console.error('loadLocations', e); markLoadIssue('locations'); }
  };

  // Organisational ER Intelligence (Phase 6, OP6, §3) — the HR-editable
  // theme taxonomy (organisationThemes) and its per-case assignments
  // (caseThemes), both org-wide flat arrays loaded like allegations
  // elsewhere in this file. themeSuggestions/themeSuggestionLoading are
  // session-local AI output only (keyed by caseId), same posture as
  // documentFindings — nothing is written to case_themes until a
  // suggestion is confirmed. State declared here (not grouped with this
  // file's other case-scoped state further down) specifically so
  // loadOrganisationThemes/loadCaseThemes below can reference their own
  // setters without a forward reference — same reasoning loadLocations
  // above is declared here rather than alongside this file's other
  // org-scoped loaders.
  const [organisationThemes, setOrganisationThemes] = useState([]);
  const [caseThemes, setCaseThemes] = useState([]);
  const [themeSuggestions, setThemeSuggestions] = useState({}); // caseId -> string[]
  const [themeSuggestionLoading, setThemeSuggestionLoading] = useState({}); // caseId -> bool

  const loadOrganisationThemes = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await supabase.from('organisation_themes').select('*').eq('org_id', org.id).order('name', {ascending:true});
      if(error) { console.error('loadOrganisationThemes', error); markLoadIssue('themes'); return; }
      if(data) setOrganisationThemes(data.map(r=>({id:r.id, name:r.name, description:r.description||"", active:r.active, createdBy:r.created_by, createdAt:r.created_at})));
    } catch(e) { console.error('loadOrganisationThemes', e); markLoadIssue('themes'); }
  };

  const loadCaseThemes = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await supabase.from('case_themes').select('*').eq('org_id', org.id);
      if(error) { console.error('loadCaseThemes', error); markLoadIssue('case themes'); return; }
      if(data) setCaseThemes(data.map(r=>({id:r.id, caseId:r.case_id, themeId:r.theme_id, suggestedBy:r.suggested_by, confirmedBy:r.confirmed_by, confirmedAt:r.confirmed_at})));
    } catch(e) { console.error('loadCaseThemes', e); markLoadIssue('case themes'); }
  };

  // Organisational ER Intelligence (Phase 6, OP15, §11) — org-wide,
  // HR-logged organisational events (org_events_2026-08-20.sql). Same
  // declared-alongside-loadLocations reasoning as organisationThemes
  // above — needed by the org-load effect without a forward reference.
  const [orgEvents, setOrgEvents] = useState([]);

  const loadOrgEvents = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await supabase.from('org_events').select('*').eq('org_id', org.id).order('event_date', {ascending:false});
      if(error) { console.error('loadOrgEvents', error); markLoadIssue('organisational events'); return; }
      if(data) setOrgEvents(data.map(r=>({id:r.id, eventDate:r.event_date, eventType:r.event_type, description:r.description, affectedLocations:r.affected_locations||[], createdBy:r.created_by, createdAt:r.created_at})));
    } catch(e) { console.error('loadOrgEvents', e); markLoadIssue('organisational events'); }
  };

  // Organisational ER Intelligence (Phase 6, OP22, §18) — Improvement
  // Initiatives (improvement_initiatives_2026-08-20.sql). Same
  // declared-alongside-loadLocations reasoning as orgEvents above.
  const [improvementInitiatives, setImprovementInitiatives] = useState([]);

  const loadImprovementInitiatives = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await supabase.from('improvement_initiatives').select('*').eq('org_id', org.id).order('created_at', {ascending:false});
      if(error) { console.error('loadImprovementInitiatives', error); markLoadIssue('improvement initiatives'); return; }
      if(data) setImprovementInitiatives(data.map(r=>({
        id:r.id, title:r.title, problemIdentified:r.problem_identified, supportingInsights:r.supporting_insights||[],
        owner:r.owner||"", targetCompletion:r.target_completion||"", status:r.status, milestones:r.milestones||[],
        outcome:r.outcome||"", createdBy:r.created_by, createdAt:r.created_at,
        completedAt:r.completed_at||null, metricKind:r.metric_kind||null, metricValue:r.metric_value||null,
      })));
    } catch(e) { console.error('loadImprovementInitiatives', e); markLoadIssue('improvement initiatives'); }
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
    try {
      const { data, error } = await supabase.from('process_templates').select('*').eq('org_id', org.id);
      if(error) { console.error('loadProcessTemplates', error); markLoadIssue('process templates'); return; }
      if(data) setProcessTemplates(data);
    } catch(e) { console.error('loadProcessTemplates', e); markLoadIssue('process templates'); }
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
    try {
      const { data, error } = await fetchAllPages((from, to) => supabase.from('hr_review_requests').select('*').eq('org_id', org.id).order('requested_at', {ascending: false}).order('id', {ascending: true}).range(from, to));
      if(error) { console.error('loadHrReviews', error); markLoadIssue('HR review requests'); return; }
      if(data) setHrReviewRequests(data);
    } catch(e) { console.error('loadHrReviews', e); markLoadIssue('HR review requests'); }
  };

  // Manager Enablement (Phase 4, MP21, §25) — HR-only, same gating as
  // loadWellbeingNotes (manager_capability_insights_2026-08-14.sql's own
  // RLS is the real boundary; this just avoids a doomed query for
  // non-HR members). State declared right above (rather than grouped
  // with every other useState further down, like hrReviewRequests' own)
  // so this function doesn't reference it before it's declared.
  const [managerCapabilityInsights, setManagerCapabilityInsights] = useState([]);
  const [generatingManagerInsight, setGeneratingManagerInsight] = useState(false);
  const loadManagerCapabilityInsights = async () => {
    if(!org?.id) return;
    const { data, error } = await fetchAllPages((from, to) => supabase.from('manager_capability_insights').select('*').eq('org_id', org.id).order('created_at', {ascending: false}).order('id', {ascending: true}).range(from, to));
    if(error) { console.error('loadManagerCapabilityInsights', error); markLoadIssue('manager capability insights'); return; }
    if(data) setManagerCapabilityInsights(data);
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

  // Phase 6.5 hardening (closes independent audit finding 3.5, part C) —
  // was a bare .eq('id', reviewId), no precondition on the row's current
  // status: a second reviewer's decision landing moments after a first
  // reviewer's approval silently overwrote it, with no trace the first
  // decision ever happened — even though its case-level effect (e.g. an
  // outcome letter already sent on the strength of that approval) may
  // already have taken place. hr_review_requests has no updated_at
  // column, so this uses the simpler, sufficient guard the audit itself
  // recommended for this one case: only a request still genuinely
  // 'pending' can be actioned.
  const respondToReview = async (reviewId, status, comments) => {
    const { data, error } = await supabase.from('hr_review_requests').update({
      status,
      comments,
      reviewed_by: user?.id,
      reviewed_by_name: member?.name||user?.email,
      reviewed_at: new Date().toISOString()
    }).eq('id', reviewId).eq('status', 'pending').select();
    if(error) { console.error("respondToReview", error); showToast("Couldn't submit your response — "+error.message, "error"); return; }
    if(!data?.length) { showToast("This request was already responded to by someone else — nothing further needed from you. Showing the latest version.", "info"); loadHrReviews(); return; }
    setHrReviewRequests(r=>r.map(x=>x.id===reviewId?data[0]:x));
  };

  const isHR = isHrRole(member?.role);

  // Phase 6.5 hardening (production regression suite) — real, DB-confirmed
  // duplicate-signal bug (see syncGuardrailSignals): tracks whether this
  // org's case_signals have actually finished their initial load, so
  // syncGuardrailSignals can wait for real data instead of treating an
  // empty, not-yet-loaded caseSignals as "no signal exists yet." Declared
  // here (ahead of loadOrgData/loadCaseSignals below, which both close
  // over it) rather than alongside caseSignals itself further down.
  const [caseSignalsLoaded, setCaseSignalsLoaded] = useState(false);

  const loadOrgData = () => {
    if(!org?.id) return;
    setDataLoadIssues([]);
    setCaseSignalsLoaded(false);
    loadLocations(); loadOrganisationThemes(); loadCaseThemes(); loadOrgEvents(); loadImprovementInitiatives(); loadHrReviews(); loadOrgRoles(); loadOrgMembers(); loadEmployeeRecords(); loadTeamMembers(); loadStarterInstances(); loadLeaverInstances(); loadDsarRequests(); loadPortalAccounts(); loadAllegations(); loadCaseTasks(); loadCaseSignals(); loadConcernReferrals(); loadCaseAccess(); loadCaseViews(); loadProcessTemplates();
    if(isHR) { loadWellbeingNotes(); loadManagerCapabilityInsights(); loadIntegrationEvents(); loadRedundancyCases(); }
  };
  useEffect(loadOrgData, [org?.id, isHR, user?.id]);

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
  const [showLetterModal, setShowLetterModal] = useState(false);
  // Human UAT remediation, Batch 2, Part 11 (adjacent finding, HIGH
  // PRIORITY — reproduced live) — a separate, never-updated
  // pendingLetterTypeRef (permanently stuck at its "outcome" initial
  // value) was what the "Draft [type] letter" modal actually read from,
  // completely disconnected from this real, correctly-updated state.
  // The practical effect: clicking "Draft invitation letter" from a
  // disciplinary hearing's own prompt silently generated a full OUTCOME
  // letter (Findings and Decision, Upheld/Not Upheld) instead — live-
  // reproduced while investigating Part 11's evidence-attachment gap on
  // invitations, which this also blocked from ever being reachable.
  const [pendingLetterType, setPendingLetterType] = useState("outcome");
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
  // Human UAT remediation, Batch 2, Part 11 — a disciplinary/appeal
  // hearing invitation had no way to attach the case evidence the
  // employee is entitled to see before the hearing (ACAS Code of
  // Practice) — reuses the case's own existing evidence array (with a
  // real file behind it), never a second evidence repository.
  const [selectedInviteEvidenceIds, setSelectedInviteEvidenceIds] = useState([]);
  // Phase 6.5 hardening (closes Prompt 11 audit finding 7.7, MEDIUM) —
  // the "Send email" button had no in-flight guard at all: the modal
  // only closes AFTER sendLetterCoordinated resolves, so it stayed open
  // and clickable for the whole round trip — neither send-letter.js nor
  // send-for-signature.js has any idempotency check of its own (a
  // deliberate choice; a caller-supplied recipient/body means there's no
  // safe key to dedupe on server-side without also rejecting genuinely
  // different letters sent moments apart), so a double-click (or an
  // impatient second click on a slow connection) sent the SAME letter —
  // including a dismissal or other outcome letter — twice.
  const [letterSendProcessing, setLetterSendProcessing] = useState(false);
  const [editingLetter, setEditingLetter] = useState(false);
  const [appealDetected, setAppealDetected] = useState(false);
  const [showLinkCase, setShowLinkCase] = useState(false);
  const appealDetectedRef = useRef(false);
  const [signEmail, setSignEmail] = useState("");
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

  // Phase 6.5 hardening (accessibility pass) — App.jsx's own role="dialog"
  // blocks (unlike the separate-component modals elsewhere in the app)
  // are conditionally-rendered JSX inside this one giant component, not
  // separate components each with their own mount lifecycle — so these
  // calls have to live here, unconditionally, one per dialog, each gated
  // by its own `active` flag rather than by mounting/unmounting. Grouped
  // together rather than split next to each dialog's own state (which is
  // itself scattered from line ~570 to ~1580) so the full set of dialogs
  // this file owns is visible in one place. See useModalA11y's own header
  // for what this replaces: a bare onKeyDown={Escape} on each dialog div
  // with no Tab-focus trapping and no focus moved into the dialog on open.
  const shareModalRef = useRef(null);
  useModalA11y(shareModalRef, () => { setShowShareModal(false); setShareEmail(""); setShareRecipientName(""); setShareSubject(""); setSharePersonalMessage(""); }, showShareModal);
  const linkCaseModalRef = useRef(null);
  useModalA11y(linkCaseModalRef, () => setShowLinkCase(false), showLinkCase && appealDetected);
  const letterModalRef = useRef(null);
  useModalA11y(letterModalRef, () => setShowLetterModal(false), showLetterModal);
  const emailLetterModalRef = useRef(null);
  useModalA11y(emailLetterModalRef, () => { setShowEmailLetter(false); setEmailLetterTo(""); setSelectedInviteEvidenceIds([]); }, showEmailLetter);
  const inviteLinkModalRef = useRef(null);
  useModalA11y(inviteLinkModalRef, () => setInviteLink(null), !!inviteLink);
  const signModalRef = useRef(null);
  useModalA11y(signModalRef, () => setShowSignModal(false), showSignModal);
  const letterAckModalRef = useRef(null);
  useModalA11y(letterAckModalRef, () => setShowLetterAckModal(false), showLetterAckModal);
  const casePromptModalRef = useRef(null);
  useModalA11y(casePromptModalRef, closeCasePrompt, showCasePrompt);
  const onboardModalRef = useRef(null);
  useModalA11y(onboardModalRef, () => { setShowOnboard(false); setOnboardDone(true); lsSet("compass_onboard", true); }, showOnboard && !showGdpr);

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

  // ── Command Bar (Phase 5, IP6, §25) ──
  const [showCommandBar, setShowCommandBar] = useState(false);
  const [commandBarInput, setCommandBarInput] = useState("");
  const [commandBarProcessing, setCommandBarProcessing] = useState(false);
  const [commandBarPlan, setCommandBarPlan] = useState(null);
  const [commandBarError, setCommandBarError] = useState("");

  // Cmd/Ctrl+K opens the Command Bar from anywhere in the app, same as
  // most editors/tools' own command palette shortcut — Escape closes it,
  // matching CommandBarModal's own backdrop-click-to-close behaviour.
  useEffect(() => {
    const onKeyDown = (e) => {
      if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k") {
        e.preventDefault();
        setShowCommandBar(v=>!v);
      } else if(e.key==="Escape" && showCommandBar) {
        setShowCommandBar(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCommandBar]);

  const closeCommandBar = () => {
    setShowCommandBar(false);
    setCommandBarInput(""); setCommandBarPlan(null); setCommandBarError(""); setCommandBarProcessing(false);
  };

  const submitCommandBarInstruction = async (instruction) => {
    setCommandBarProcessing(true); setCommandBarError(""); setCommandBarPlan(null);
    try {
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:500,
        stream:false,
        system:COMMAND_BAR_SYSTEM_PROMPT+`\n\nToday's date: ${new Date().toISOString().split("T")[0]}.`,
        messages:[{role:"user", content:instruction}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setCommandBarPlan(resolveCommandBarPlan(parsed, cases));
    } catch(e) { console.error("Command Bar parse error:", e); setCommandBarError("Couldn't work out what to do — please try rephrasing."); }
    setCommandBarProcessing(false);
  };

  // IP7 — takes exactly the steps CommandBarModal's own per-step
  // checkboxes left selected, not the full resolved plan (commandBarPlan
  // itself never learns which steps the user deselected — that's local,
  // ephemeral UI state the modal manages and hands back only at confirm
  // time, the same "just an entry point onto existing ones" reasoning
  // IP6 already applied to the two action types themselves).
  const confirmCommandBarPlan = (selectedActions) => {
    let taskCount = 0, openedCase = null;
    for(const action of selectedActions) {
      if(action.type==="create_task") { createCaseTask(action.caseId, {name:action.taskName, dueDate:action.dueDate||""}); taskCount++; }
      else if(action.type==="open_case") { openedCase = action; }
    }
    if(openedCase) { setActiveCaseId(openedCase.caseId); setScreen(SCREENS.CASE_VIEW); }
    const summary = [taskCount>0?`${taskCount} task${taskCount>1?"s":""} created`:null, openedCase?`opened ${openedCase.caseEmployeeName}'s case`:null].filter(Boolean).join(", ");
    if(summary) showToast(summary.charAt(0).toUpperCase()+summary.slice(1));
    closeCommandBar();
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

  // Phase 6.5 hardening (data-lifecycle review) — infrastructure only, no
  // enforcement. Compass currently keeps every case/employee/wellbeing
  // record indefinitely, with no way for an org to record how long they
  // actually intend to keep records for, and nothing anywhere reads or
  // acts on this value — deliberately: automatically deleting/
  // anonymising real case evidence on a timer, without a defined legal
  // basis for exactly which record types and retention lengths apply
  // (UK employment law retention periods vary by record type — see
  // docs/DATA_INVENTORY.md's own recommendation), risks destroying
  // evidence an org may still need for a live tribunal claim or ongoing
  // process. This just gives HR somewhere to record their org's own
  // policy; a genuine automated retention/anonymisation workflow (with a
  // legal-hold exemption, and human review before anything is actually
  // removed) is future work once that policy question has a real answer.
  const [dataRetentionYears, setDataRetentionYears] = useState(org?.data_retention_years||null);
  const saveDataRetentionYears = async (years) => {
    if(!org?.id) return;
    const value = years ? parseInt(years, 10) : null;
    setDataRetentionYears(value);
    const { error } = await supabase.from('organisations').update({data_retention_years: value}).eq('id', org.id);
    if(error) showToast("Couldn't save retention period — please try again", "error");
    else { showToast("Retention period saved"); audit("Data retention policy updated", value?`Set to ${value} year${value===1?"":"s"}`:"Cleared"); }
  };
  // Phase 7 (Controlled Beta Infrastructure Gate 1) — which UK
  // bank-holiday calendar this org's own "ACAS: N working days"
  // deadlines are computed against (src/lib/ukBankHolidays.js). Same
  // nullable-org-column, HR-only-write pattern as dataRetentionYears
  // just above; null reads as "england-and-wales" everywhere this is
  // consumed (computeDueSoon's own default).
  const [ukJurisdiction, setUkJurisdiction] = useState(org?.uk_jurisdiction||null);
  const saveUkJurisdiction = async (jurisdiction) => {
    if(!org?.id) return;
    const value = jurisdiction || null;
    setUkJurisdiction(value);
    const { error } = await supabase.from('organisations').update({uk_jurisdiction: value}).eq('id', org.id);
    if(error) showToast("Couldn't save the working-day calendar — please try again", "error");
    else { showToast("Working-day calendar saved"); audit("UK bank-holiday calendar updated", value||"England & Wales (default)"); }
  };
  // Integrations & Workflow Automation (Phase 5, IP28, §22-23) — same
  // JSONB-config-on-organisations precedent as the webhook fields above.
  // Which rule ids are even eligible to be set beyond "suggest" is
  // enforced in lib/automationLevels.js (AUTOMATABLE_RULE_IDS), not
  // here — this just persists whatever level the org picks for a rule
  // that's actually on that list.
  const [automationLevels, setAutomationLevels] = useState(org?.automation_levels||{});
  const saveAutomationLevel = async (ruleId, level) => {
    if(!org?.id) return;
    const updated = {...automationLevels, [ruleId]: level};
    setAutomationLevels(updated);
    const { error } = await supabase.from('organisations').update({automation_levels: updated}).eq('id', org.id);
    if(error) showToast("Couldn't save automation setting — please try again", "error");
    else showToast("Automation setting saved");
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

  // Phase 6.5 hardening (closes Prompt 16 audit finding H6, HIGH) — every
  // toast, success or error, used to auto-dismiss on the same flat 3s
  // timer with no way to review it again — an error like "Couldn't save
  // the case" could vanish before a user's attention was even back on
  // the screen, with no persistent record of the failure anywhere. Error
  // toasts now stay up until the user actually dismisses them (or a new
  // toast replaces them); success toasts keep the existing short
  // auto-dismiss, since a fleeting confirmation of something that worked
  // isn't the same risk as losing the only notice that something didn't.
  // toastIdRef guards against a stale setTimeout closing a NEWER toast
  // that replaced this one before the old timer fired.
  const toastIdRef = useRef(0);
  const showToast = (message, type="success", duration=3000) => {
    const id = ++toastIdRef.current;
    setToast({message, type, id});
    if(type!=="error") {
      setTimeout(()=>setToast(t=>t?.id===id?null:t), duration);
    }
  };
  const dismissToast = () => setToast(null);

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
  const [starterTemplates, setStarterTemplates] = useState(orgLs("compass_starter_templates", [{
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
  const [starterInstances, setStarterInstances] = useState(orgLs("compass_starters", []));
  // Phase 6.5 hardening (P0, data-integrity review) — updateStarterTaskNote
  // wrote straight through to a blind upsert on every keystroke (the
  // ChecklistScreen note input's onChange), of the ENTIRE tasks array —
  // the same per-keystroke-write + stale-full-array-replacement pattern
  // Clusters 6/7 already fixed for allegations, now closed the same way:
  // same conditionalUpdate guard, same enqueueSave ordering, same
  // version ref populated from loaded rows and every successful save.
  const starterVersionRef = useRef({});
  const starterSaveQueueRef = useRef({});
  const [dsarRequests, setDsarRequests] = useState([]);
  // Phase 7.5C — activeStarter/starterView/starterAiProcessing/
  // newStarterForm (UI state that only ever fed the now-removed
  // NewStarterScreen and createStarterInstance below) deleted as
  // genuinely dead code. starterInstances/starterTemplates above stay —
  // DSAR compilation still reads real historical records from them.

  // ── Leaver offboarding ──
  const [leaverTemplates, setLeaverTemplates] = useState(orgLs("compass_leaver_templates", [{
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
  const [leaverInstances, setLeaverInstances] = useState(orgLs("compass_leavers", []));
  // Phase 6.5 hardening (P0, data-integrity review) — same fix as
  // starterVersionRef/starterSaveQueueRef above, for updateLeaverTaskNote's
  // identical per-keystroke pattern.
  const leaverVersionRef = useRef({});
  const leaverSaveQueueRef = useRef({});
  // Phase 7.5C — activeLeaver/leaverView/leaverAiProcessing/newLeaverForm
  // (UI state that only ever fed the now-removed OffboardingScreen,
  // createLeaverInstance and startOffboarding below) deleted as genuinely
  // dead code. leaverInstances/leaverTemplates above stay — DSAR
  // compilation still reads real historical records from them.

  // ── Redundancy / consultation ──
  // Phase 6.5 hardening (closes Prompt 16 audit finding H1, HIGH) — was
  // useState(orgLs(...)), local-only, never synced across HR staff or
  // devices and invisible to RLS/DSAR/erasure entirely. See
  // supabase/redundancy_cases_2026-08-27.sql — same cloud-sync + HR-only
  // RLS pattern wellbeing_notes already has.
  const [redundancyCases, setRedundancyCases] = useState([]);
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
  const [wellbeingNotes, setWellbeingNotes] = useState(orgLs("compass_wellbeing", []));
  // note: {id, employeeName, type:"chat"|"eap"|"adjustment"|"crisis"|"return"|"checkin",
  //         date, manager, content, followUpDate, followUpDone, supportOffered, resources:[], confidential:true}

  // Phase 6.5 hardening (closes Prompt 11 audit finding 4.7, MEDIUM) —
  // the initial state above seeds directly from an ORG-scoped (not
  // user-scoped) localStorage cache, for the same fast-first-paint
  // reason every other SENSITIVE_ORG_SCOPED_KEYS cache does. For a
  // genuine HR user that's fine — loadOrgData's own isHR-gated
  // loadWellbeingNotes() immediately overwrites it with the real,
  // RLS-scoped fetch. For a non-HR user that load never runs at all, so
  // on a shared device where a previous HR session ended without an
  // explicit sign-out (a natural session timeout, browser crash, or
  // simply a different org member opening the same browser before the
  // last person signed out — clearAllOrgScopedData only fires on an
  // actual sign-out click), the stale confidential wellbeing notes from
  // that earlier session stayed sitting in state indefinitely: fed
  // straight into computeDueSoon's org-wide overdue banner every user
  // sees regardless of role, and passed unconditionally into DsarScreen
  // (reachable by URL even though its nav item is HR-only). Once isHR is
  // confirmed false, this clears it at the source — both in memory and
  // in the cache — rather than patching every downstream consumer
  // individually.
  useEffect(() => {
    if (isHR || !wellbeingNotes.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing state a non-HR viewer must never see is exactly the kind of one-time, role-driven sync the other query-param effects in this file already carry this same disable for.
    setWellbeingNotes([]);
    orgLsSet("compass_wellbeing", []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHR]);

  const [activeWellbeing, setActiveWellbeing] = useState(null); // employee name being viewed
  const [wellbeingForm, setWellbeingForm] = useState({employeeName:"",type:"chat",date:"",manager:"",content:"",followUpDate:"",supportOffered:"",confidential:true});
  const [wellbeingView, setWellbeingView] = useState("list"); // list|new|employee

  // ── Allegations (case-scoped issues under investigation) ──
  const [allegations, setAllegations] = useState([]);
  // Phase 6.5 hardening (P0, Clusters 6+7) — refs, not state: two saves
  // for the SAME allegation fired close together (e.g. creating it, then
  // immediately changing its status) can both read the same pre-save
  // updatedAt from React state, since state updates aren't synchronously
  // visible to a function that already started running — the second save
  // would then use a stale conflict-check baseline, comparing against a
  // value neither actual writer produced, and falsely reject a later,
  // unrelated edit as a "someone else changed this" conflict with no real
  // second writer involved. allegationVersionRef is the single, always-
  // synchronously-current source of truth for each row's last known
  // updated_at (updated on every load and every successful save);
  // allegationSaveQueueRef serialises same-row saves so each one only
  // executes (and reads the version ref) after the previous one has
  // actually finished, rather than racing it.
  const allegationVersionRef = useRef({});
  const allegationSaveQueueRef = useRef({});

  // Phase 6.5 hardening (closes independent audit finding 3.5) — same
  // pattern, same reasoning, for the four other save paths that were
  // still bare upsert/update with no conflict detection at all:
  // case_tasks, case_signals, wellbeing_notes, concern_referrals. See
  // lib/optimisticSave.js's own header comment, which named these
  // exact four tables as not-yet-migrated when the pattern was first
  // extracted for allegations.
  const caseTaskVersionRef = useRef({});
  const caseTaskSaveQueueRef = useRef({});
  const caseSignalVersionRef = useRef({});
  const caseSignalSaveQueueRef = useRef({});
  const wellbeingNoteVersionRef = useRef({});
  const wellbeingNoteSaveQueueRef = useRef({});
  const concernReferralVersionRef = useRef({});
  const concernReferralSaveQueueRef = useRef({});
  // Phase 6.5 hardening (closes Prompt 16 audit finding H1) — same
  // conflict-detection pattern, now that redundancy_cases is a real,
  // multi-writer-capable cloud table instead of local-only.
  const redundancyCaseVersionRef = useRef({});
  const redundancyCaseSaveQueueRef = useRef({});

  // ── Case tasks ──
  const [caseTasks, setCaseTasks] = useState([]);

  // ── Case signals (AI-copilot substrate: next-best-action, contradictions,
  // unanswered questions, procedural guardrails — see lib/caseSignals.js) ──
  const [caseSignals, setCaseSignals] = useState([]);
  // Phase 6.5 hardening (Batch 8) — generateUnansweredQuestions/
  // generateInconsistencies/generateAppealReview each capture caseSignals
  // in a local `updated` variable BEFORE a slow AI call, then
  // unconditionally setCaseSignals(updated) once it resolves — silently
  // discarding any other caseSignals change (a dismiss, a guardrail
  // sync, a different AI generation for another case) that happened
  // during the await. Kept in sync on every render so those three can
  // rebuild `updated` from the actual latest state instead, the same
  // ref-for-post-await-freshness pattern allegationVersionRef already
  // uses (Phase 6.5, P0).
  const caseSignalsRef = useRef([]);
  useEffect(() => { caseSignalsRef.current = caseSignals; }, [caseSignals]);
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
    // Phase 6.5 hardening (closes Prompt 11 audit finding 7.6, MEDIUM) —
    // casesRef.current, not `cases`, so a caller invoking saveCases
    // several times in the same synchronous run (before React commits a
    // new render) builds each successive update on top of the PREVIOUS
    // call's own change instead of silently discarding it — see
    // casesRef's own declaration comment.
    const prevById = new Map(casesRef.current.map(cs => [cs.id, cs]));
    const stamped = u.map(cs => ensureEvidenceIds(withStageTransitionStamp(cs, prevById.get(cs.id) || null)));
    setCases(stamped);
    casesRef.current = stamped;
    // Phase 6.5 hardening (data-lifecycle review, closes 10.1's
    // remainder) — the cache mirror only, not the real in-memory list or
    // what's sent to Supabase. Bounded so a large org's case history
    // can't grow this cached key past what localStorage can hold — see
    // capRecentForCache's own comment.
    orgLsSet("compass_cases", capRecentForCache(stamped, "updatedAt", 500));
    if(org?.id) {
      if(changedId) {
        // Only sync the changed case
        //
        // Phase 6.5 hardening (closes Prompt 16 audit finding H4, HIGH) —
        // returns the real save Promise<boolean> instead of firing it and
        // forgetting the result, so a caller that genuinely needs to know
        // whether the write landed (OutcomeModal's finalizeOutcome, the
        // highest-stakes single write in the app) can await it. Every
        // other caller already discards saveCases' return value, so this
        // is purely additive — nothing about the existing fire-and-forget
        // callers changes.
        const changed = stamped.find(x=>x.id===changedId);
        if(changed) return saveCaseToDB(changed);
        deleteCaseFromDB(changedId);
        return Promise.resolve({ ok: true });
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
  // Integrations & Workflow Automation (Phase 5, IP30, §29) — meta is an
  // optional {aiPrepared, approvedBy, dataUsed} for the automation-
  // provenance fields the spec asks for on top of the existing generic
  // action/detail/user/timestamp shape — every pre-existing call site
  // (a human clicking an ordinary button) just omits it, same as before.
  const audit = (action, detail="", caseId=null, meta={}) => {
    const userName = currentUser?.name || "HR Manager";
    const { aiPrepared=false, approvedBy=null, dataUsed=null } = meta;
    const entry = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      user: userName,
      action,
      detail,
      caseId,
      aiPrepared,
      approvedBy,
      dataUsed,
    };
    setAuditLog(p => [entry, ...p].slice(0, 500)); // optimistic — cloud is the source of truth on next load
    if(org?.id && user?.id) {
      withFkRetry(() => supabase.from('audit_log').insert({ org_id: org.id, user_id: user.id, user_name: userName, action, detail, case_id: caseId, ai_prepared: aiPrepared, approved_by: approvedBy, data_used: dataUsed }))
        .then(({error}) => { if(error) console.error('Audit log sync failed:', error.message); });
    }
  };

  // "Send for signature" creates a real signing_requests row, and the
  // employee's actual signature lands there once they sign via the portal
  // — but nothing ever read that back into the case. A meeting showed
  // "Pending signature" forever unless HR remembered to click the manual
  // "Mark signed" button themselves after reading the notification email,
  // with no verification a signature had actually been captured. Checks
  // any pending meeting signatures against the real status whenever the
  // case is opened, and syncs automatically if signed.
  //
  // Human UAT remediation, Batch 1 hardening round 2 — relocated here
  // (was originally right after the URL-sync effect, much earlier in this
  // file) purely because it calls audit() below, which must be declared
  // first — no behavioural change, same deps, same body.
  useEffect(() => {
    if (screen !== SCREENS.CASE_VIEW || !activeCaseId) return;
    const cs = cases.find(c => c.id === activeCaseId);
    const pending = (cs?.meetings || []).filter(m => m.signId && !isTerminalStatus(m.signStatus));
    if (!pending.length) return;
    let cancelled = false;
    (async () => {
      const changes = (await Promise.all(pending.map(async m => {
        try {
          // internal=1 — this is HR silently polling for a status change
          // while viewing a case, not the employee genuinely opening
          // their signing link; must never advance sent→opened itself
          // (see api/signing.js's own comment on this parameter). Now a
          // real auth boundary server-side (closes Prompt 11 audit finding
          // 2.10, MEDIUM), so this needs authedFetch + orgId like any
          // other org-scoped call, not a bare fetch.
          const res = await authedFetch(`/api/signing?signId=${encodeURIComponent(m.signId)}&internal=1&orgId=${encodeURIComponent(org?.id||"")}`);
          if (!res.ok) return null;
          const data = await res.json();
          // Human UAT remediation, Batch 1, Issue 2 — this used to keep
          // only `status`, discarding who signed, when, and the captured
          // signature image, even though signing_requests already stores
          // all of it. A meeting badge that just says "Signed" with
          // nothing else to confirm is what UAT flagged as effectively
          // inaccessible — the case owner needs the same detail an
          // outcome letter's signature record already shows.
          return data.status && data.status !== m.signStatus
            ? { id: m.id, status: data.status, signedAt: data.signed_at || data.declined_at || null, signature: data.signature || null, signerName: data.employee_name || null, declineReason: data.decline_reason || null }
            : null;
        } catch { return null; }
      }))).filter(Boolean);
      if (cancelled || !changes.length) return;
      const changeMap = new Map(changes.map(c => [c.id, c]));
      const updated = cases.map(c => c.id === activeCaseId
        ? { ...c, meetings: c.meetings.map(m => changeMap.has(m.id) ? { ...m, signStatus: changeMap.get(m.id).status, signedAt: changeMap.get(m.id).signedAt, signature: changeMap.get(m.id).signature, signerName: changeMap.get(m.id).signerName, declineReason: changeMap.get(m.id).declineReason } : m) }
        : c);
      // Human UAT remediation, Batch 1, Issue 3 — signature completion had
      // no notification/activity/Timeline event at all. Logged here, not
      // in api/signing.js, because that endpoint only ever touches
      // signing_requests — it has no case_id-aware audit() to call, and
      // giving it one would mean either trusting an unauthenticated
      // caller's own claim of which case this belongs to, or a second,
      // separate lookup; this poll already has the real case/meeting in
      // hand. Idempotency: only logged once saveCases' own optimistic-
      // concurrency write genuinely wins (the same guard that already
      // protects the case update itself — see saveCaseToDB's conditional
      // .eq('updated_at', ...)) — a losing/duplicate poll (two tabs open
      // on the same case, or this effect re-firing before the first
      // write lands) gets `{ ok: false }` back (reason 'error' or
      // 'conflict' — either way this effect doesn't care which) and
      // takes the reload-only path in effect upstream, so it can never
      // double-log the same transition.
      saveCases(updated, activeCaseId).then(result => {
        if (!result?.ok || cancelled) return;
        changes.forEach(({ id, status }) => {
          if (!isTerminalStatus(status)) return; // "opened" isn't a completion — only signed/acknowledged/declined are
          const m = pending.find(p => p.id === id);
          const outcomeText = status === "signed" ? "signed" : status === "acknowledged" ? "acknowledged" : status === "declined" ? "declined to sign" : status;
          audit(`${m?.type || "Meeting"} notes ${outcomeText}`, cs.employeeName, activeCaseId);
        });
      });
    })();
    return () => { cancelled = true; };
    // cases/saveCases deliberately excluded — this should check once per
    // case-view visit, not re-run on every unrelated case-data change
    // (which would refire the check mid-edit and spam the signing API).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeCaseId]);

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
    setDueSoon(computeDueSoon(cases, dsarRequests, new Date(), caseTasks, wellbeingNotes, leaverInstances, redundancyCases, caseAccess, ukJurisdiction||undefined));
  }, [cases, dsarRequests, caseTasks, wellbeingNotes, leaverInstances, redundancyCases, caseAccess, ukJurisdiction]);

  // Lets a deep link (Home's "Suggested for you" quick links) land
  // directly on a specific Settings section instead of always Billing.
  const [settingsSection, setSettingsSection] = useState(null);

  // Organisational ER Intelligence (Phase 6, OP20, §20) — same deep-link
  // pattern as settingsSection above, for sendGlobalChat's own "View in
  // Insights" drill-down after answering an org-wide stats question.
  const [insightsSection, setInsightsSection] = useState(null);

  // ── Calendar integration (Google Calendar) ──
  const [calendarConnected, setCalendarConnected] = useState(false);
  useEffect(() => {
    // Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
    // scoped to the active org now, not just the signed-in user — a
    // multi-org user's status check must reflect THIS org's own
    // connection, not whichever org happens to share the same user_id.
    if(!user?.id||!org?.id) return;
    authedFetch(`/api/calendar/status?orgId=${encodeURIComponent(org.id)}`)
      .then(r=>r.json()).then(d=>setCalendarConnected(!!d.connected)).catch(()=>{});
  }, [user?.id, org?.id]);
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
        body: JSON.stringify({ deadlines: dueSoon.filter(d => !d.confidential), orgId: org?.id }),
      }).catch(e => console.error("Calendar sync failed:", e));
    }, 3000);
    return () => clearTimeout(timeout);
  }, [dueSoon, calendarConnected, user?.id, org?.id]);
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
    if(!user?.id||!org?.id) return;
    try {
      await authedFetch("/api/calendar/disconnect", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ orgId: org.id }),
      });
      setCalendarConnected(false);
      showToast("Google Calendar disconnected");
    } catch(e) { showToast("Couldn't disconnect — please try again"); }
  };

  // ── Microsoft 365 Calendar connection (Phase 5, IP3) ──
  // Same delegated-OAuth shape as Google Calendar above, sharing its
  // calendar_connections row (provider:'microsoft') and its
  // api/calendar/[...action].js router (ms365-* actions) rather than a
  // parallel table/router — see api/calendar/_microsoft.js's own
  // comment. Doesn't hook into the deadline-sync effect above (that
  // stays Google-only for now, unchanged) — this connection exists so
  // the real create/update/delete-event capability (api/calendar/
  // _create-event.js) has a Microsoft calendar to target once a later
  // phase actually schedules a meeting through it.
  const [ms365CalendarConnected, setMs365CalendarConnected] = useState(false);
  useEffect(() => {
    // Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
    // see the Google Calendar status effect's own sibling comment.
    if(!user?.id||!org?.id) return;
    authedFetch(`/api/calendar/ms365-status?orgId=${encodeURIComponent(org.id)}`)
      .then(r=>r.json()).then(d=>setMs365CalendarConnected(!!d.connected)).catch(()=>{});
  }, [user?.id, org?.id]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ms365Param = params.get("ms365calendar");
    if(!ms365Param) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same one-time, query-param-driven sync on mount as the identical calendarParam/mailParam/gmailParam effects elsewhere in this file, none of which the rule flags consistently (see the gmailParam effect's own comment).
    if(ms365Param==="connected") { setMs365CalendarConnected(true); showToast("Microsoft 365 Calendar connected"); }
    else if(ms365Param==="error") { showToast("Couldn't connect Microsoft 365 Calendar — please try again"); }
    params.delete("ms365calendar");
    const newUrl = window.location.pathname + (params.toString()?"?"+params.toString():"");
    window.history.replaceState({}, "", newUrl);
  }, []);
  const connectMs365Calendar = async () => {
    if(!user?.id || !org?.id) return;
    try {
      const res = await authedFetch(`/api/calendar/ms365-oauth-start?orgId=${encodeURIComponent(org.id)}`);
      const data = await res.json();
      if(data.url) window.location.href = data.url;
      else showToast(data.error||"Couldn't start Microsoft 365 Calendar connection", "error");
    } catch { showToast("Couldn't start Microsoft 365 Calendar connection", "error"); }
  };
  const disconnectMs365Calendar = async () => {
    if(!user?.id||!org?.id) return;
    try {
      await authedFetch("/api/calendar/ms365-disconnect", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ orgId: org.id }) });
      setMs365CalendarConnected(false);
      showToast("Microsoft 365 Calendar disconnected");
    } catch { showToast("Couldn't disconnect — please try again"); }
  };

  // Integrations & Workflow Automation (Phase 5, IP15, §9) — the real
  // scheduling UI calling IP3's create-event primitive
  // (api/calendar/_create-event.js) on every calendar the user has
  // connected. Deliberately does NOT auto-create the case's own meeting
  // record/agenda yet — that's IP17's "automatic meeting workspace",
  // layered on top of this once it exists; this phase is just "put it on
  // the calendar."
  const [meetingScheduling, setMeetingScheduling] = useState(false);
  // Integrations & Workflow Automation (Phase 5, IP17, §11) — automatic
  // meeting workspace. One AI call producing both a short agenda and
  // structured prep questions, grounded in the case's own allegations
  // (linkedAllegationId only ever set when it matches a real allegation
  // id already on the case — never a guessed link) — same "AI proposes,
  // nothing auto-executes beyond a draft" posture as generatePrepQuestions
  // (the live-session equivalent this reuses the exact question shape
  // from) and every other AI call in this app.
  const generateMeetingWorkspace = async (cs, meetingLabel) => {
    try {
      const caseAllegations = allegationsForCase(allegations, cs.id);
      const allegationList = caseAllegations.length ? caseAllegations.map(a=>`- id "${a.id}": ${a.title}`).join("\n") : "None recorded.";
      const evidenceList = (cs.evidence||[]).map(e=>e.name).join(", ") || "None recorded.";
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:1200,
        stream:false,
        system:"You are a senior UK HR advisor preparing an automatic workspace for an upcoming Employee Relations meeting, before it has been held. Read the case background and produce a short agenda (3-6 plain bullet points starting each line with \"- \", no headers) and 4-8 structured prep questions. Respond ONLY with valid JSON, no other text: {\"agenda\":\"- ...\\n- ...\",\"questions\":[{\"text\":\"...\",\"category\":\"agenda\"|\"evidence\"|\"clarification\"|\"unanswered\",\"essential\":true|false,\"reasoning\":\"...\",\"allegationId\":\"...\"|null}]} — allegationId only when a question clearly concerns one of the case's own listed allegations (by its exact given id), otherwise null.",
        messages:[{role:"user", content:`Meeting: ${meetingLabel}. Employee: ${cs.employeeName}. Case type: ${cs.caseType||"HR matter"}. Description: ${cs.description||"None"}.\n\nAllegations:\n${allegationList}\n\nEvidence on file: ${evidenceList}`}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const questions = (Array.isArray(parsed.questions)?parsed.questions:[]).map((q,i)=>({
        id:newId("pq"), text:q.text||"", category:q.category||"general", essential:!!q.essential, reasoning:q.reasoning||"",
        linkedAllegationId: caseAllegations.some(a=>a.id===q.allegationId) ? q.allegationId : null,
        linkedEvidenceId:null, source:"ai", status:"not_asked", statusSource:"ai",
      })).filter(q=>q.text.trim());
      return { agenda: parsed.agenda||"", questions };
    } catch(e) { console.error("generateMeetingWorkspace", e); return { agenda:"", questions:[] }; }
  };

  const scheduleMeeting = async ({ caseId, meetingType, date, startTime, durationMinutes, attendees, description }) => {
    const times = buildEventTimes({ date, startTime, durationMinutes });
    if(!times) { showToast("Enter a valid date and time", "error"); return false; }
    const cs = cases.find(x=>x.id===caseId);
    const meetingLabel = MEETING_TYPES.find(t=>t.id===meetingType)?.label || "Meeting";
    const title = `${meetingLabel}${cs?" — "+cs.employeeName:""}`;
    setMeetingScheduling(true);
    try {
      const res = await authedFetch("/api/calendar/create-event", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        title, description: description||"", startISO: times.startISO, endISO: times.endISO, attendees: parseAttendees(attendees), orgId: org?.id,
      })});
      const data = await res.json();
      if(!res.ok || !data.success) { showToast(data.error||"Couldn't schedule the meeting", "error"); setMeetingScheduling(false); return false; }
      audit("Meeting scheduled", title, caseId||null);

      // IP17 — only when a real case is linked; a stand-alone meeting has
      // no case record to attach a workspace to.
      if(cs) {
        const workspace = await generateMeetingWorkspace(cs, meetingLabel);
        const meetingEntry = buildScheduledMeetingEntry({
          meetingTypeLabel: meetingLabel, date, startISO: times.startISO, endISO: times.endISO,
          attendees: parseAttendees(attendees), agenda: workspace.agenda, prepQuestions: workspace.questions,
          manager: cs.manager, savedBy: currentUser?.name, calendarEvents: data.events,
        });
        saveCases(cases.map(x=>x.id===caseId?{...x, meetings:[...(x.meetings||[]), meetingEntry]}:x), caseId);
        // Pre-meeting tasks — only genuinely actionable prep items
        // (essential AND about evidence to gather), not every question.
        workspace.questions.filter(q=>q.essential && q.category==="evidence").forEach(q => {
          createCaseTask(caseId, { name: "Prepare: "+q.text });
        });
        audit("Meeting workspace created", title, caseId);
      }

      // Phase 6.5 hardening (closes Prompt 11 audit finding 7.11, MEDIUM)
      // — create-event deliberately creates the event on EVERY calendar
      // the user has connected (its own header comment), not just one —
      // real for a user with both Google and Microsoft 365 connected,
      // but it means attendees get a separate invite from each. Silently
      // saying "scheduled on your calendar" (singular) when it just went
      // out from two different systems was misleading; naming both here
      // makes that an informed fact instead of a surprise.
      const calendarNote = data.events?.length > 1
        ? ` on ${data.events.length} connected calendars (${data.events.map(e=>e.provider).join(', ')}) — attendees may receive a separate invite from each`
        : "";
      showToast("Meeting scheduled"+(calendarNote||" on your calendar"));
      setMeetingScheduling(false);
      return true;
    } catch(e) { showToast("Couldn't schedule the meeting — "+e.message, "error"); setMeetingScheduling(false); return false; }
  };

  // IP16, §10 — availability checks against the CALLER's own connected
  // calendar only (api/calendar/_check-availability.js's own comment
  // explains why — nobody else has authorised this app to read theirs).
  const [availabilityCheck, setAvailabilityCheck] = useState(null); // {checked, conflicts} | null
  const [availabilityChecking, setAvailabilityChecking] = useState(false);
  // Request-generation counter — ScheduleMeetingModal fires a new check
  // on every date/time/duration change, with no guarantee responses
  // arrive in request order. Without this, quickly picking slot B right
  // after slot A could let A's still-in-flight response land AFTER B's
  // and silently overwrite the correct result with a stale one for a
  // slot the user isn't even looking at anymore.
  const availabilityRequestIdRef = useRef(0);
  const checkMeetingAvailability = async ({ startISO, endISO }) => {
    const requestId = ++availabilityRequestIdRef.current;
    setAvailabilityChecking(true);
    try {
      const res = await authedFetch(`/api/calendar/check-availability?startISO=${encodeURIComponent(startISO)}&endISO=${encodeURIComponent(endISO)}&orgId=${encodeURIComponent(org?.id||"")}`);
      const data = await res.json();
      if (requestId !== availabilityRequestIdRef.current) return; // superseded by a later check
      setAvailabilityCheck(res.ok ? data : { checked:false, conflicts:[] });
    } catch {
      if (requestId !== availabilityRequestIdRef.current) return;
      setAvailabilityCheck({ checked:false, conflicts:[] });
    }
    if (requestId === availabilityRequestIdRef.current) setAvailabilityChecking(false);
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
  // Phase 6.5 hardening (data-lifecycle review) — this only ever included
  // cases, policies, auditLog and adjustments — a fraction of what
  // delete-org-data.js's own now-corrected table list (and the DSAR
  // compiler) treat as real tenant data. An org asking to export "their
  // data" got case files but not employee records, wellbeing notes,
  // concern referrals, allegations, case signals, tasks, HR review
  // requests, onboarding/offboarding checklists, or DSAR request logs.
  // signingRequests/portalAccounts are fetched fresh (zero client-facing
  // RLS — see api/portal/_dsar-lookup.js), the same lookup the DSAR
  // compiler uses, just without an employeeName filter so it returns
  // every row for the org instead of one subject's.
  const exportAllData = async () => {
    let signingRequests = [];
    let portalAccounts = [];
    let portalInvites = [];
    let profiles = [];
    let caseViews = [];
    try {
      const r = await authedFetch(`/api/portal/dsar-lookup?orgId=${encodeURIComponent(org?.id||"")}`);
      if(r.ok) { const d = await r.json(); signingRequests = d.signingRequests||[]; portalAccounts = d.portalAccounts||[]; portalInvites = d.portalInvites||[]; profiles = d.profiles||[]; caseViews = d.caseViews||[]; }
    } catch(e) { console.error('exportAllData dsar-lookup failed:', e.message); }
    // Phase 6.5 hardening (closes independent audit finding 4.3's
    // "tables never wired in" list for this export path too, not only
    // dsarCompile.js's per-subject one) — orgMembers/orgEvents/
    // improvementInitiatives/managerCapabilityInsights/
    // organisationThemes/caseThemes are already loaded client-side under
    // normal RLS; profiles/caseViews/portalInvites came back from the
    // lookup above for the same "no client-facing RLS path" reason
    // signingRequests/portalAccounts already needed it. caseAccess (closes
    // Prompt 16 audit finding H14) was the one remaining already-loaded,
    // org-scoped table this hand-built list had simply never listed.
    const data = {
      cases, policies:policies.map(p=>({...p,content:"[truncated]"})), auditLog, adjustments,
      employeeRecords, wellbeingNotes, concernReferrals, allegations, caseSignals, caseTasks,
      hrReviewRequests, starterInstances, leaverInstances, dsarRequests, signingRequests, portalAccounts,
      orgMembers, orgEvents, improvementInitiatives, managerCapabilityInsights, organisationThemes, caseThemes,
      portalInvites, profiles, caseViews, caseAccess, redundancyCases,
      exportedAt:new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="compass_data_export.json"; a.click();
    URL.revokeObjectURL(url);
    audit("Data exported (GDPR)");
  };
  const deleteAllData = async () => {
    const ok = await confirmDialog({
      title: "Delete all data",
      // Phase 6.5 hardening (data-lifecycle review) — was silently
      // out of sync with what this action actually does (already deleted
      // wellbeing notes and concern referrals without saying so; now
      // also covers employee records, signing requests and portal
      // access) — the person clicking an irreversible delete button
      // should see an accurate list of what it actually removes.
      message: "This will permanently delete all case files, meeting records, allegations, employee records, wellbeing notes, concern referrals, redundancy cases, signing requests, portal access, onboarding/offboarding checklists, DSAR requests, HR review requests, tasks and the audit trail for this organisation. This cannot be undone.",
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
    // Phase 6.5 hardening (High, security review) — was missing
    // compass_wellbeing/compass_employees/compass_redundancy/
    // compass_meeting_draft entirely, so "Delete all data" left wellbeing/
    // health notes, employee records, redundancy case data, and any live
    // meeting transcript draft still sitting in localStorage. Now shares
    // the single complete list (src/lib/storage.js) sign-out itself also
    // uses, instead of a second, independently-maintained one that drifted.
    clearAllOrgScopedData();
    try { window.location.reload(); } catch(e) {}
  };

  // ── New starter helpers ──
  const saveStarterTemplates = u => { setStarterTemplates(u); orgLsSet("compass_starter_templates", u); };

  const loadStarterInstances = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await fetchAllPages((from, to) => supabase.from('starter_instances').select('*').eq('org_id', org.id).order('created_at', {ascending:false}).order('id', {ascending:true}).range(from, to));
      if(error) { console.error('loadStarterInstances', error); markLoadIssue('onboarding checklists'); return; }
      if(data) {
        data.forEach(r => { starterVersionRef.current[r.id] = r.updated_at; });
        setStarterInstances(data.map(r=>({
          id:r.id, name:r.name, role:r.role, department:r.department, manager:r.manager,
          email:r.email, startDate:r.start_date, templateId:r.template_id, templateName:r.template_name,
          tasks:r.tasks||[], aiCustomised:r.ai_customised, createdBy:r.created_by, createdAt:r.created_at,
        })));
      }
    } catch(e) { console.error('loadStarterInstances', e); markLoadIssue('onboarding checklists'); }
  };

  // Phase 7.5C — saveStarterInstanceToDB deleted: it was only ever called
  // from createStarterInstance/applyStarterUpdate/aiCustomiseChecklist,
  // all removed alongside NewStarterScreen. loadStarterInstances (below)
  // stays — starterInstances still needs to be real and current for DSAR
  // compilation, which only ever reads, never writes, this table.

  // ── Leaver offboarding helpers ──
  const saveLeaverTemplates = u => { setLeaverTemplates(u); orgLsSet("compass_leaver_templates", u); };

  const loadLeaverInstances = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await fetchAllPages((from, to) => supabase.from('leaver_instances').select('*').eq('org_id', org.id).order('created_at', {ascending:false}).order('id', {ascending:true}).range(from, to));
      if(error) { console.error('loadLeaverInstances', error); markLoadIssue('offboarding checklists'); return; }
      if(data) {
        data.forEach(r => { leaverVersionRef.current[r.id] = r.updated_at; });
        setLeaverInstances(data.map(r=>({
          id:r.id, name:r.name, role:r.role, department:r.department, manager:r.manager,
          email:r.email, lastWorkingDay:r.last_working_day, reason:r.reason,
          templateId:r.template_id, templateName:r.template_name,
          tasks:r.tasks||[], aiCustomised:r.ai_customised,
          exitInterviewNotes:r.exit_interview_notes, exitInterviewDate:r.exit_interview_date,
          createdBy:r.created_by, createdAt:r.created_at,
        })));
      }
    } catch(e) { console.error('loadLeaverInstances', e); markLoadIssue('offboarding checklists'); }
  };

  // Phase 7.5C — saveLeaverInstanceToDB deleted: same reasoning as
  // saveStarterInstanceToDB above (its only callers were removed
  // alongside OffboardingScreen). loadLeaverInstances (above) stays for
  // the same DSAR-still-reads-this-table reason.

  // ── Employee Portal access management ──
  const loadPortalAccounts = async () => {
    if(!org?.id) return;
    try {
      const r = await authedFetch(`/api/portal/accounts?orgId=${encodeURIComponent(org.id)}`);
      const d = await r.json();
      if(r.ok) setPortalAccounts(d.accounts||[]);
      else { console.error('loadPortalAccounts', d.error); markLoadIssue('portal accounts'); }
    } catch(e) { console.error('loadPortalAccounts', e); markLoadIssue('portal accounts'); }
  };

  // Phase 6.5 hardening (closes Prompt 11 audit finding 2.9, MEDIUM) —
  // accountId (the account's own id, not employeeName) is now the real
  // target; employeeName is kept only for the confirm-dialog copy. See
  // api/portal/_revoke-access.js for why name alone isn't a safe match.
  const revokePortalAccess = async (accountId, employeeName) => {
    if(!org?.id || !accountId) return;
    const ok = await confirmDialog({title:"Revoke portal access?", message:`${employeeName} will immediately lose access to view their case status, sign documents, or complete onboarding tasks in the portal.`, confirmLabel:"Revoke access", danger:true});
    if(!ok) return;
    try {
      const r = await authedFetch("/api/portal/revoke-access", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ orgId: org.id, accountId }),
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
      const {data, error} = await fetchAllPages((from, to) => supabase.from('dsar_requests').select('*').eq('org_id', org.id).order('id', {ascending:true}).range(from, to));
      if(error) { console.error('loadDsarRequests', error); markLoadIssue('DSAR requests'); return; }
      if(data) setDsarRequests(data.map(r=>({
        id:r.id, employeeName:r.employee_name, requestedBy:r.requested_by,
        receivedDate:r.received_date, dueDate:r.due_date, status:r.status,
        completedDate:r.completed_date, notes:r.notes,
        reviewedFlaggedSections:r.reviewed_flagged_sections, createdAt:r.created_at,
        extended:r.extended, extensionReason:r.extension_reason, extendedAt:r.extended_at,
      })));
    } catch(e) { console.error('loadDsarRequests', e); markLoadIssue('DSAR requests'); }
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

  // Phase 7.5C — createLeaverInstance/applyLeaverUpdate/toggleLeaverTask/
  // updateLeaverTaskNote/addLeaverTask/removeLeaverTask/
  // reassignLeaverTaskOwner/updateLeaverExitInterview/
  // aiCustomiseLeaverChecklist/startOffboarding/createStarterInstance/
  // applyStarterUpdate/toggleStarterTask/updateStarterTaskNote/
  // addStarterTask/removeStarterTask/reassignStarterTaskOwner/
  // aiCustomiseChecklist deleted here as genuinely dead code — their only
  // callers were NewStarterScreen/OffboardingScreen/RedundancyScreen's
  // "Start offboarding" button/OutcomeModal's dismissal auto-offer, all
  // removed from the product's active surface this same phase.
  // starterInstances/leaverInstances/starterTemplates/leaverTemplates and
  // their load functions stay — DSAR compilation still reads real
  // historical records from them.

  // ── Redundancy helpers ──
  // Phase 6.5 hardening (closes Prompt 16 audit finding H1) — cloud-synced
  // like wellbeing_notes, RLS-restricted to hr_manager/hr_director org
  // members (see supabase/redundancy_cases_2026-08-27.sql). Only loaded
  // when isHR (loadOrgData below) — the same "avoid a doomed query for a
  // role RLS would reject anyway" reasoning as loadWellbeingNotes.
  const loadRedundancyCases = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await fetchAllPages((from, to) => supabase.from('redundancy_cases').select('*').eq('org_id', org.id).order('created_at', {ascending:false}).order('id', {ascending:true}).range(from, to));
      if(error) { console.error('loadRedundancyCases', error); markLoadIssue('redundancy cases'); return; }
      if(data) {
        data.forEach(r => { redundancyCaseVersionRef.current[r.id] = r.updated_at; });
        setRedundancyCases(data.map(r=>({
          id:r.id, type:r.type, reason:r.reason, poolDescription:r.pool_description,
          selectionCriteria:r.selection_criteria||[], atRiskEmployees:r.at_risk_employees||[],
          collectiveInfo:r.collective_info, status:r.status, aiAdvice:r.ai_advice||"",
          createdBy:r.created_by, createdAt:r.created_at,
        })));
      }
    } catch(e) { console.error('loadRedundancyCases', e); markLoadIssue('redundancy cases'); }
  };

  // Same conflict-detection pattern as saveWellbeingNoteToDB — a second
  // HR writer scoring a different at-risk employee on the same case
  // moments apart must not silently discard the other's edit.
  const saveRedundancyCaseToDB = (rc) => {
    if(!org?.id) return Promise.resolve();
    const fields = {
      org_id: org.id, type: rc.type, reason: rc.reason||null, pool_description: rc.poolDescription||null,
      selection_criteria: rc.selectionCriteria||[], at_risk_employees: rc.atRiskEmployees||[],
      collective_info: rc.collectiveInfo||null, status: rc.status||'setup', ai_advice: rc.aiAdvice||null,
      created_by: rc.createdBy||null,
    };
    const run = async () => {
      const updatedAt = redundancyCaseVersionRef.current[rc.id];
      const nowIso = new Date().toISOString();
      const { error, conflict } = await withTransientRetry(() => withFkRetry(() => conditionalUpdate(supabase, 'redundancy_cases', rc.id, updatedAt, {...fields, updated_at: nowIso})));
      if(conflict) {
        showToast("This redundancy case was updated — new information was added while you were working. We've refreshed it with the latest version.", "info");
        loadRedundancyCases();
        return;
      }
      if(error) { console.error('saveRedundancyCaseToDB', error); showToast("Couldn't save the redundancy case to the cloud — "+error.message, "error"); return; }
      redundancyCaseVersionRef.current[rc.id] = nowIso;
    };
    return enqueueSave(redundancyCaseSaveQueueRef.current, rc.id, run);
  };

  const createRedundancyCase = (type, reason, poolDescription) => {
    const rc = {
      id: newId("redundancy"),
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
    setRedundancyCases(prev => [...prev, rc]);
    saveRedundancyCaseToDB(rc);
    setActiveRedundancy(rc);
    setRedundancyStep("pool");
    audit("Redundancy case created", `${type} — ${reason}`);
    return rc;
  };

  const updateRedundancyCase = (updates) => {
    if(!activeRedundancy) return;
    const merged = {...activeRedundancy, ...updates};
    setRedundancyCases(prev => prev.map(r => r.id===merged.id ? merged : r));
    saveRedundancyCaseToDB(merged);
    setActiveRedundancy(merged);
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
  const saveWellbeingNotes = u => { setWellbeingNotes(u); orgLsSet("compass_wellbeing", u); };

  const loadWellbeingNotes = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await fetchAllPages((from, to) => supabase.from('wellbeing_notes').select('*').eq('org_id', org.id).order('created_at', {ascending:false}).order('id', {ascending:true}).range(from, to));
      if(error) { console.error('loadWellbeingNotes', error); markLoadIssue('wellbeing notes'); return; }
      if(data) {
        data.forEach(r => { wellbeingNoteVersionRef.current[r.id] = r.updated_at; });
        saveWellbeingNotes(data.map(r=>({
          id:r.id, employeeName:r.employee_name, type:r.type, date:r.date, manager:r.manager,
          content:r.content, supportOffered:r.support_offered, followUpDate:r.follow_up_date,
          followUpDone:r.follow_up_done, confidential:r.confidential,
          createdBy:r.created_by, createdAt:r.created_at,
        })));
      }
    } catch(e) { console.error('loadWellbeingNotes', e); markLoadIssue('wellbeing notes'); }
  };

  // Phase 6.5 hardening (closes independent audit finding 3.5) — was a
  // bare upsert, no conflict detection — a second writer's concurrent
  // edit to the same confidential note (e.g. a follow-up date change
  // racing a content edit) could silently discard one of the two.
  const saveWellbeingNoteToDB = (note) => {
    if(!org?.id) return Promise.resolve();
    const fields = {
      org_id: org.id,
      employee_name: note.employeeName, type: note.type||'chat', date: note.date||null,
      manager: note.manager||null, content: note.content, support_offered: note.supportOffered||null,
      follow_up_date: note.followUpDate||null, follow_up_done: !!note.followUpDone,
      confidential: note.confidential!==false, created_by: note.createdBy||null,
    };
    const run = async () => {
      const updatedAt = wellbeingNoteVersionRef.current[note.id];
      const nowIso = new Date().toISOString();
      const { error, conflict } = await withTransientRetry(() => withFkRetry(() => conditionalUpdate(supabase, 'wellbeing_notes', note.id, updatedAt, {...fields, updated_at: nowIso})));
      if(conflict) {
        showToast("This wellbeing note was updated — new information was added while you were working. We've refreshed it with the latest version.", "info");
        loadWellbeingNotes();
        return;
      }
      if(error) { console.error('saveWellbeingNoteToDB', error); showToast("Couldn't save wellbeing note to the cloud — "+error.message, "error"); return; }
      wellbeingNoteVersionRef.current[note.id] = nowIso;
    };
    return enqueueSave(wellbeingNoteSaveQueueRef.current, note.id, run);
  };

  const addWellbeingNote = () => {
    const f = wellbeingForm;
    if(!f.employeeName.trim() || !f.content.trim()) return;
    const note = {
      id: newId("wellbeing"),
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
  // Phase 6.5 hardening (P1, reliability review) — same unpaginated-select
  // truncation bug Batch 6 already fixed for cases/employee_records
  // (src/lib/paginatedFetch.js's own header comment), found here too on a
  // live-data review: this org's real allegations count (816) is already
  // close enough to PostgREST's single-request row cap that it will
  // silently start dropping real allegations from view without any code
  // change at all, just from ordinary case volume growing. Fixed with the
  // same fetchAllPages helper rather than a raised .limit(), which would
  // just move the same failure to a slightly higher row count.
  const loadAllegations = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await fetchAllPages((from, to) => supabase.from('allegations').select('*').eq('org_id', org.id).order('created_at', {ascending:true}).range(from, to));
      if(error) { console.error('loadAllegations', error); markLoadIssue('allegations'); return; }
      // Keep the version ref in sync with every load, not just saves —
      // otherwise a reload (e.g. after another save's conflict) could
      // leave a stale ref value shadowing genuinely fresher data just
      // fetched into React state.
      if(data) data.forEach(r => { allegationVersionRef.current[r.id] = r.updated_at; });
      if(data) setAllegations(data.map(r=>({
        id:r.id, caseId:r.case_id, title:r.title, description:r.description||"",
        period:r.period||"", peopleInvolved:r.people_involved||"", status:r.status,
        employeeResponse:r.employee_response||"", witnessEvidence:r.witness_evidence||"",
        investigatorFinding:r.investigator_finding||"", outstandingUncertainty:r.outstanding_uncertainty||"",
        decisionReasoning:r.decision_reasoning||"", decidedBy:r.decided_by||null, decidedAt:r.decided_at||null,
        appealOutcome:r.appeal_outcome||null, appealReasoning:r.appeal_reasoning||"",
        appealDecidedBy:r.appeal_decided_by||null, appealDecidedAt:r.appeal_decided_at||null,
        createdBy:r.created_by, createdAt:r.created_at, updatedAt:r.updated_at,
      })));
    } catch(e) { console.error('loadAllegations', e); }
  };

  // Phase 6.5 hardening (P0, Clusters 6+7; retry added in the data-integrity
  // review pass) — previously a blind upsert on every keystroke
  // (AllegationsPanel's textareas called onChange straight through to
  // patchAllegation, no debounce), so two people editing different fields
  // of the same allegation within the same window could silently clobber
  // each other's changes — a full-row upsert, not a patch, so the loser's
  // edit doesn't just "lose a race," it vanishes from the saved row
  // entirely. AllegationsPanel now persists on blur (see DraftTextarea
  // there) instead of per keystroke, and this now does a conditionalUpdate
  // (src/lib/optimisticSave.js, the same guard saveCaseToDB already uses)
  // instead of an unconditional upsert — a stale write is rejected as a
  // conflict and reloaded, never silently applied over someone else's more
  // recent save. enqueueSave/withTransientRetry (same module) add ordering
  // and one retry on a genuine transient failure.
  const saveAllegationToDB = (allegation) => {
    if(!org?.id) return Promise.resolve();
    const fields = {
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
    };
    // The actual write, deferred until this allegation's queue reaches it —
    // reads the version ref (not allegation.updatedAt) at execution time,
    // so a save queued behind an earlier one always checks against what
    // that earlier save actually produced, never a value captured before
    // it ran. withTransientRetry gives a genuine network blip one retry
    // before surfacing an error — a conflict is never retried this way,
    // since trying the same stale write again wouldn't resolve it; the
    // reload path below is the correct response to that instead.
    const run = async () => {
      const updatedAt = allegationVersionRef.current[allegation.id];
      const nowIso = new Date().toISOString();
      const { error, conflict } = await withTransientRetry(() => withFkRetry(() => conditionalUpdate(supabase, 'allegations', allegation.id, updatedAt, {...fields, updated_at: nowIso})));
      if(conflict) {
        showToast("This allegation was updated — new information was added while you were working. We've refreshed it with the latest version.", "info");
        loadAllegations();
        return;
      }
      if(error) { console.error('saveAllegationToDB', error); showToast("Couldn't save allegation to the cloud — "+error.message, "error"); return; }
      allegationVersionRef.current[allegation.id] = nowIso;
      setAllegations(prev => prev.map(a => a.id===allegation.id ? {...a, updatedAt: nowIso} : a));
    };
    return enqueueSave(allegationSaveQueueRef.current, allegation.id, run);
  };

  const deleteAllegationFromDB = async (allegationId) => {
    const { error } = await supabase.from('allegations').delete().eq('id', allegationId);
    if(error) { console.error('deleteAllegationFromDB', error); showToast("Couldn't delete allegation — "+error.message, "error"); }
  };

  // Organisational ER Intelligence (Phase 6, OP6, §3) — loadOrganisationThemes/
  // loadCaseThemes themselves are declared earlier, alongside loadLocations
  // (both called from the same org-load effect there — a function
  // referenced by that effect needs to be declared before it, same
  // reason loadLocations lives there and not down here with the rest of
  // this file's org-scoped loaders).
  //
  // HR-only at the RLS layer (organisation_themes_2026-08-19.sql) — the
  // taxonomy itself is curated, not a free-for-all list.
  // Phase 6.5 hardening (closes Prompt 11 audit finding 8.4, MEDIUM) —
  // filterUnsafeThemeSuggestions (themes.js) only ever ran on AI-generated
  // suggestions before they were shown as candidates — the actual write
  // paths (typing a theme name manually, editing a suggestion's text
  // before confirming, or renaming an existing theme) had no screening at
  // all, even though a theme is org-wide-visible taxonomy, not a private
  // per-case note. Same known-name source suggestThemesForCase already
  // builds (employeeRecords/orgMembers), checked here too since this is
  // the actual persistence boundary, not just the AI-suggestion path.
  const orgKnownNameTokens = () => buildKnownNameTokens([...(employeeRecords||[]).map(r=>r.name), ...(orgMembers||[]).map(m=>m.name)]);

  const addOrganisationTheme = async (name, description) => {
    if(!org?.id || !name?.trim()) return null;
    if(isUnsafeThemeSuggestion(name, orgKnownNameTokens())) { showToast("That theme name looks like it may match a real person's name — themes are org-wide, so please rephrase it", "error"); return null; }
    const existing = matchExistingTheme(organisationThemes, name);
    if(existing) return existing;
    const row = {id: crypto.randomUUID(), name: name.trim(), description: description||"", active: true, createdBy: user?.id||null, createdAt: new Date().toISOString()};
    setOrganisationThemes(t=>[...t, row].sort((a,b)=>a.name.localeCompare(b.name)));
    const { error } = await supabase.from('organisation_themes').insert({id: row.id, org_id: org.id, name: row.name, description: row.description||null, active: true, created_by: user?.id||null});
    if(error) { console.error('addOrganisationTheme', error); showToast("Couldn't add theme — "+error.message, "error"); setOrganisationThemes(t=>t.filter(x=>x.id!==row.id)); return null; }
    return row;
  };

  const updateOrganisationTheme = async (themeId, fields) => {
    if(fields.name!==undefined && isUnsafeThemeSuggestion(fields.name, orgKnownNameTokens())) { showToast("That theme name looks like it may match a real person's name — themes are org-wide, so please rephrase it", "error"); return; }
    setOrganisationThemes(t=>t.map(x=>x.id===themeId?{...x, ...fields}:x));
    const patch = {};
    if(fields.name!==undefined) patch.name = fields.name;
    if(fields.description!==undefined) patch.description = fields.description;
    if(fields.active!==undefined) patch.active = fields.active;
    const { error } = await supabase.from('organisation_themes').update(patch).eq('id', themeId);
    if(error) { console.error('updateOrganisationTheme', error); showToast("Couldn't update theme — "+error.message, "error"); }
  };

  // Applies an EXISTING taxonomy theme to a case — open to anyone who
  // can already access the case (case_themes' own RLS), whether typed
  // manually or confirmed from an AI suggestion. suggestedBy records
  // provenance only; both paths insert an already-confirmed row (no
  // "pending" state in the DB — see the migration's own header).
  const assignThemeToCase = async (cs, themeId, suggestedBy = "user") => {
    if(caseThemes.some(t=>t.caseId===cs.id && t.themeId===themeId)) return;
    const row = {id: crypto.randomUUID(), caseId: cs.id, themeId, suggestedBy, confirmedBy: user?.id||null, confirmedAt: new Date().toISOString()};
    setCaseThemes(t=>[...t, row]);
    const { error } = await withFkRetry(() => supabase.from('case_themes').insert({id: row.id, org_id: org.id, case_id: cs.id, theme_id: themeId, suggested_by: suggestedBy, confirmed_by: user?.id||null}));
    if(error) { console.error('assignThemeToCase', error); showToast("Couldn't apply theme — "+error.message, "error"); setCaseThemes(t=>t.filter(x=>x.id!==row.id)); }
  };

  const removeThemeFromCase = async (caseThemeRowId) => {
    setCaseThemes(t=>t.filter(x=>x.id!==caseThemeRowId));
    const { error } = await supabase.from('case_themes').delete().eq('id', caseThemeRowId);
    if(error) { console.error('removeThemeFromCase', error); showToast("Couldn't remove theme — "+error.message, "error"); }
  };

  // AI suggestion is ephemeral (themeSuggestions), same posture as
  // documentFindings — nothing is written until confirmThemeSuggestion
  // (or a manual assignThemeToCase call) actually runs.
  const suggestThemesForCase = async (cs) => {
    setThemeSuggestionLoading(l=>({...l, [cs.id]:true}));
    try {
      const prompt = buildThemeSuggestionPrompt(cs, organisationThemes);
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6", max_tokens:300, stream:false,
        messages:[{role:"user", content:prompt}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const rawSuggestions = parseThemeSuggestionResponse(text);
      // Phase 6.5 hardening (product-principles review) — safe entity
      // filtering ahead of human review (themes.js's own comment): screen
      // out any suggestion matching a real person's name at this org
      // BEFORE it's ever shown, not just before HR could confirm it.
      const knownNames = [
        ...(employeeRecords||[]).map(r=>r.name), ...(orgMembers||[]).map(m=>m.name),
        cs.employeeName, cs.manager, cs.investigatingManager, cs.disciplinaryOfficer,
      ];
      const suggestions = filterUnsafeThemeSuggestions(rawSuggestions, buildKnownNameTokens(knownNames));
      setThemeSuggestions(s=>({...s, [cs.id]:suggestions}));
      if(!suggestions.length) showToast("Compass found no clear themes to suggest for this case");
    } catch(e) { console.error("suggestThemesForCase", e); showToast("Couldn't generate theme suggestions — "+e.message, "error"); }
    setThemeSuggestionLoading(l=>({...l, [cs.id]:false}));
  };

  // Confirming a suggestion that matches an existing theme just applies
  // it. A genuinely new name can only be auto-created by HR (matches
  // organisation_themes' own INSERT policy) — anyone else sees the
  // suggestion but can't confirm a brand-new name themselves, only ask
  // HR to add it via the taxonomy manager.
  const confirmThemeSuggestion = async (cs, suggestedName) => {
    let theme = matchExistingTheme(organisationThemes, suggestedName);
    if(!theme) {
      if(!isHR) { showToast("Ask HR to add \""+suggestedName+"\" as a theme first"); return; }
      theme = await addOrganisationTheme(suggestedName, "");
      if(!theme) return;
    }
    await assignThemeToCase(cs, theme.id, "ai");
    setThemeSuggestions(s=>({...s, [cs.id]:(s[cs.id]||[]).filter(n=>n!==suggestedName)}));
  };

  const dismissThemeSuggestion = (cs, suggestedName) => {
    setThemeSuggestions(s=>({...s, [cs.id]:(s[cs.id]||[]).filter(n=>n!==suggestedName)}));
  };

  // Organisational ER Intelligence (Phase 6, OP15, §11) — HR-only at the
  // RLS layer (org_events_2026-08-20.sql), same optimistic-insert-then-
  // rollback-on-error shape as addOrganisationTheme above.
  const addOrgEvent = async ({ eventDate, eventType, description, affectedLocations }) => {
    if(!org?.id) return;
    const row = { id: crypto.randomUUID(), eventDate, eventType, description, affectedLocations: affectedLocations||[], createdBy: user?.id||null, createdAt: new Date().toISOString() };
    setOrgEvents(evs=>[row, ...evs]);
    const { error } = await supabase.from('org_events').insert({
      id: row.id, org_id: org.id, event_date: eventDate, event_type: eventType,
      description, affected_locations: affectedLocations||[], created_by: user?.id||null,
    });
    if(error) { console.error('addOrgEvent', error); showToast("Couldn't log event — "+error.message, "error"); setOrgEvents(evs=>evs.filter(x=>x.id!==row.id)); }
  };

  // Organisational ER Intelligence (Phase 6, OP22, §18) — HR-only at the
  // RLS layer (improvement_initiatives_2026-08-20.sql), same
  // optimistic-insert-then-rollback-on-error shape as addOrgEvent above.
  const addImprovementInitiative = async ({ title, problemIdentified, supportingInsights, owner, targetCompletion }) => {
    if(!org?.id) return;
    const row = {
      id: crypto.randomUUID(), title, problemIdentified, supportingInsights: supportingInsights||[],
      owner: owner||"", targetCompletion: targetCompletion||"", status: "active", milestones: [], outcome: "",
      createdBy: user?.id||null, createdAt: new Date().toISOString(),
    };
    setImprovementInitiatives(list=>[row, ...list]);
    const { error } = await supabase.from('improvement_initiatives').insert({
      id: row.id, org_id: org.id, title, problem_identified: problemIdentified,
      supporting_insights: supportingInsights||[], owner: owner||null, target_completion: targetCompletion||null,
      status: "active", milestones: [], created_by: user?.id||null,
    });
    if(error) { console.error('addImprovementInitiative', error); showToast("Couldn't create initiative — "+error.message, "error"); setImprovementInitiatives(list=>list.filter(x=>x.id!==row.id)); }
  };

  // Optimistic-update-then-rollback shape, same as toggleCaseTaskDone —
  // milestones/status/outcome/metric are all edited from the same
  // expandable card (ImprovementInitiativesPanel.jsx), so one generic
  // updater covers all of them rather than near-duplicate functions.
  //
  // Organisational ER Intelligence (Phase 6, OP23, §19) — completedAt is
  // stamped here, once, the first time status actually transitions to
  // 'completed' (never on a later edit that happens to also touch
  // status, and never overwritten by a subsequent unrelated edit) — the
  // real anchor date impactTracking.js's before/after comparison needs.
  const updateImprovementInitiative = async (initiativeId, fields) => {
    const previous = improvementInitiatives.find(i=>i.id===initiativeId);
    if(!previous) return;
    const justCompleted = fields.status === 'completed' && previous.status !== 'completed';
    const nextFields = justCompleted ? { ...fields, completedAt: new Date().toISOString() } : fields;
    setImprovementInitiatives(list=>list.map(i=>i.id===initiativeId?{...i,...nextFields}:i));
    const dbFields = { updated_at: new Date().toISOString() };
    if('milestones' in nextFields) dbFields.milestones = nextFields.milestones;
    if('status' in nextFields) dbFields.status = nextFields.status;
    if('outcome' in nextFields) dbFields.outcome = nextFields.outcome;
    if('metricKind' in nextFields) dbFields.metric_kind = nextFields.metricKind;
    if('metricValue' in nextFields) dbFields.metric_value = nextFields.metricValue;
    if('completedAt' in nextFields) dbFields.completed_at = nextFields.completedAt;
    const { error } = await supabase.from('improvement_initiatives').update(dbFields).eq('id', initiativeId);
    if(error) { console.error('updateImprovementInitiative', error); showToast("Couldn't save change — "+error.message, "error"); setImprovementInitiatives(list=>list.map(i=>i.id===initiativeId?previous:i)); }
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
      const {data, error} = await fetchAllPages((from, to) => supabase.from('concern_referrals').select('*').eq('org_id', org.id).order('created_at', {ascending:false}).order('id', {ascending:true}).range(from, to));
      if(error) { console.error('loadConcernReferrals', error); markLoadIssue('concern referrals'); return; }
      if(data) {
        data.forEach(r => { concernReferralVersionRef.current[r.id] = r.updated_at; });
        setConcernReferrals(data.map(r=>({
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
      }
    } catch(e) { console.error('loadConcernReferrals', e); }
  };

  // Phase 6.5 hardening (closes independent audit finding 3.5) — was a
  // bare upsert, no conflict detection — HR adding hr_notes/changing
  // status could race a concurrent AI-triage write (aiCategory/
  // aiSummary etc, written moments after submission) silently
  // discarding one side.
  const saveConcernReferralToDB = (referral) => {
    if(!org?.id) return Promise.resolve();
    const fields = {
      org_id: org.id,
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
    };
    const run = async () => {
      const updatedAt = concernReferralVersionRef.current[referral.id];
      const nowIso = new Date().toISOString();
      const { error, conflict } = await withTransientRetry(() => withFkRetry(() => conditionalUpdate(supabase, 'concern_referrals', referral.id, updatedAt, {...fields, updated_at: nowIso})));
      if(conflict) {
        showToast("This concern referral was updated — new information was added while you were working. We've refreshed it with the latest version.", "info");
        loadConcernReferrals();
        return;
      }
      if(error) { console.error('saveConcernReferralToDB', error); showToast("Couldn't submit — "+error.message, "error"); return; }
      concernReferralVersionRef.current[referral.id] = nowIso;
    };
    return enqueueSave(concernReferralSaveQueueRef.current, referral.id, run);
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
      // `referral` (the parameter) already IS the current, known-complete
      // referral object — submitConcernReferral passes in the exact
      // record it just created, so the merged object to persist can be
      // built directly from it and `sanitized`, with no need to read
      // anything back out of concernReferrals state at all (which this
      // call's own 20-30s AI round trip can make stale relative to
      // regardless — see below). setConcernReferrals is still called
      // with the functional form, but only to apply the merge against
      // whatever `prev` truly is when React processes it — an earlier
      // version of this tried to read the merged result back out of that
      // same updater synchronously, which doesn't work: React defers a
      // functional setState updater's execution rather than running it
      // immediately, even from a plain synchronous caller, so the read
      // always saw the pre-call value and this save silently never ran.
      const savedReferral = { ...referral, ...sanitized };
      setConcernReferrals(prev => updateConcernReferral(prev, referral.id, sanitized));
      saveConcernReferralToDB(savedReferral);
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
      const {data, error} = await fetchAllPages((from, to) => supabase.from('case_access').select('*').eq('org_id', org.id).order('id', {ascending:true}).range(from, to));
      if(error) { console.error('loadCaseAccess', error); markLoadIssue('case access grants'); return; }
      if(data) setCaseAccess(data.map(r=>({id:r.id, caseId:r.case_id, userId:r.user_id, role:r.role, grantedBy:r.granted_by, grantedAt:r.granted_at,
        // Manager Enablement (Phase 4, MP7) — only ever set on
        // role:"investigator" rows; null on every other role.
        scopeAllegationIds:r.scope_allegation_ids||null, targetCompletionDate:r.target_completion_date||null, scopeNote:r.scope_note||""})));
    } catch(e) { console.error('loadCaseAccess', e); }
  };

  // Phase 13 — scoped to the current user's own rows (RLS enforces this
  // anyway) since "since I last viewed" is per-viewer, not org-wide.
  //
  // Phase 6.5 hardening (structural remediation, Prompt 12 — Pagination /
  // Complete-Data invariant) — confirmed live: one real user in the
  // largest org has 2,189 case_views rows, well past PostgREST's default
  // row cap. An unpaginated fetch here silently drops most of that
  // user's "last viewed" records, and computeChangesSinceView (App.jsx)
  // treats a missing record as "never viewed" — a false "nothing's
  // changed" or an incorrectly-flagged "lots changed since you last
  // looked" for a case this same user has actually already reviewed
  // many times. fetchAllPages is the same helper loadCasesFromDB/
  // loadEmployeeRecords/loadAllegations/loadCaseSignals/loadCaseTasks
  // already use for exactly this reason.
  const loadCaseViews = async () => {
    if(!org?.id||!user?.id) return;
    try {
      const {data, error} = await fetchAllPages((from, to) => supabase.from('case_views').select('*').eq('org_id', org.id).eq('user_id', user.id).order('case_id', {ascending:true}).range(from, to));
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
    // Manager Enablement (Phase 4, MP19) — this runs after an awaited
    // network round trip (loadCaseAccess above), so building the seeded
    // checklist from a plain, possibly-stale `caseTasks` closure risked
    // racing another write (createCaseTask, sendHrGuidance) landing in
    // between and silently overwriting it — real, found via
    // hr-intervention.spec.js sending guidance right after assigning an
    // investigator.
    //
    // The original fix for that (computing `newlyCreated` as a side
    // effect *inside* the setCaseTasks updater, then reading it right
    // after) was itself wrong — caught during final review by
    // instrumenting toggleCaseTaskDone's identical pattern and observing
    // that React defers a functional setState updater's execution rather
    // than running it synchronously, even from a plain event handler.
    // newlyCreated was always still `[]` at the point it was read, so
    // saveCaseTaskToDB never actually ran here either — the 7-step
    // checklist has been seeded into local state correctly (so it always
    // *looked* right in the UI) but silently never persisted to the
    // database since this fix landed.
    //
    // The real fix: seedInvestigationChecklist is pure given its inputs,
    // so it's called once against the outer `caseTasks` closure to
    // synchronously compute what's new — no round-trip through React's
    // update queue needed to read that back. The functional setCaseTasks
    // call is kept, but only to merge those already-computed objects in,
    // which is what actually protects against the concurrent-write race.
    const seededFromClosure = seedInvestigationChecklist(caseTasks, caseId, targetMember.name);
    const newlyCreated = seededFromClosure.filter(t=>!caseTasks.some(existing=>existing.id===t.id));
    if(newlyCreated.length) {
      setCaseTasks(prev => [...prev, ...newlyCreated.filter(t=>!prev.some(existing=>existing.id===t.id))]);
      newlyCreated.forEach(t=>saveCaseTaskToDB({...t, createdBy:user?.id}));
    }
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
      // caseTasks was captured before the 20-30s AI round trip above —
      // seedInvestigationPlanTasks is pure given its inputs, so it's
      // called once against that closure to synchronously compute what's
      // new (see createCaseTask's own comment on why NOT reading this
      // back out of a functional setState updater — React defers those,
      // so a value only ever set inside one is never actually readable
      // right after the call). The functional setCaseTasks call is kept
      // to merge those already-computed objects against whatever `prev`
      // truly is when React processes it, protecting against a write
      // landing in the same window (HR guidance, a checklist toggle,
      // assignInvestigator's own seeding) without needing to read
      // anything back out of it.
      const seededFromClosure = seedInvestigationPlanTasks(caseTasks, cs.id, items);
      const newlyCreated = seededFromClosure.filter(t=>!caseTasks.some(existing=>existing.id===t.id));
      if(!newlyCreated.length) { showToast("Compass didn't find any new plan items to add"); }
      else {
        setCaseTasks(prev => [...prev, ...newlyCreated.filter(t=>!prev.some(existing=>existing.id===t.id))]);
        newlyCreated.forEach(t=>saveCaseTaskToDB({...t, createdBy:user?.id}));
        audit("Investigation plan generated", newlyCreated.length+" item"+(newlyCreated.length!==1?"s":""), cs.id);
      }
    } catch(e) { console.error("generateInvestigationPlan", e); showToast("Couldn't generate the investigation plan — "+e.message, "error"); }
    setInvestigationPlanLoading(l=>({...l, [cs.id]:false}));
  };

  // Manager Enablement (Phase 4, MP21, §25) — Manager Learning Loop. One
  // AI call over managerLearningLoop.js's own collectInterventionSignals
  // (HR guidance/question/witness notes, MP11 return-for-rework reasons,
  // M9 meeting-quality-gap overrides, P7 policy deviations) — never full
  // case/meeting content, matching the plan's own "MP20's own aggregated
  // data, not raw case text". Persisted to manager_capability_insights so
  // a real history builds up over time rather than being recomputed (and
  // silently changing) on every page load.
  const generateManagerCapabilityInsight = async () => {
    const signals = collectInterventionSignals(caseTasks, hrReviewRequests, auditLog);
    if(!signals.length) { showToast("Not enough recorded intervention history yet to generate an insight"); return; }
    setGeneratingManagerInsight(true);
    try {
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:900,
        stream:false,
        system:"You are Compass, an Employee Relations copilot identifying ORGANISATIONAL training patterns from a list of HR's own recorded interventions across many different managers' investigations. This is advisory input for HR to consider, never a verdict — you are never grading or naming any individual manager, only describing recurring THEMES a training or process response could address. Ground every category in what the signals actually show; if the data is sparse or inconsistent, say fewer categories with lower confidence rather than inventing patterns. Respond ONLY with valid JSON, no other text: {\"categories\":[{\"label\":\"short theme name, e.g. Insufficient follow-up questioning\",\"description\":\"one or two sentences describing the pattern, grounded in the signals given\",\"frequency\":\"short phrase on how often this theme appears in the data, e.g. Seen in 4 of the recorded notes\"}],\"suggestedResponse\":\"one to three sentences suggesting a concrete organisational or training response HR could consider\"}",
        messages:[{role:"user", content:"RECORDED HR INTERVENTIONS ACROSS INVESTIGATIONS (most recent first):\n"+formatSignalsForPrompt(signals)}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const sanitized = sanitizeManagerCapabilityInsight(parsed);
      if(!sanitized.categories.length) { showToast("Compass couldn't identify a clear pattern from the data on file yet"); }
      else {
        const { data: saved, error } = await withFkRetry(() => supabase.from('manager_capability_insights').insert({
          org_id: org.id, generated_by: user?.id, generated_by_name: member?.name||user?.email,
          sample_size: signals.length, categories: sanitized.categories, suggested_response: sanitized.suggestedResponse,
        }).select().single());
        if(saved) { setManagerCapabilityInsights(list=>[saved, ...list]); audit("Manager capability insight generated", sanitized.categories.length+" theme"+(sanitized.categories.length!==1?"s":"")); }
        else { console.error("generateManagerCapabilityInsight save", error); showToast("Couldn't save the generated insight — "+error?.message, "error"); }
      }
    } catch(e) { console.error("generateManagerCapabilityInsight", e); showToast("Couldn't generate a manager capability insight — "+e.message, "error"); }
    setGeneratingManagerInsight(false);
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
  // The local case/task mutations below all run BEFORE the awaited network
  // calls, deliberately — saveCases takes a full array built from the
  // `cases` closure (it has no functional-update form the way setCaseTasks
  // does), so reading `cases`/`caseTasks` after an await here would risk
  // building that array from a stale pre-await snapshot and silently
  // reverting anything written while respondToReview's request was in
  // flight. Reading and writing them synchronously, before either await,
  // sidesteps the race entirely rather than papering over it.
  const resolveInvestigationReview = async (reviewId, caseId, actionId, comments) => {
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
      audit("Case taken over by HR", member?.name||user?.email, caseId);
    } else if(actionId==="closed") {
      saveCases(cases.map(x=>x.id===caseId?{...x,stage:"closed"}:x));
      audit("Case closed from HR review", comments||cs.employeeName, caseId);
    } else {
      audit("Investigation review: "+actionId, comments||cs.employeeName, caseId);
    }
    await respondToReview(reviewId, actionId, comments);
    if(actionId==="taken_over" && user?.id) await assignCaseRole(caseId, user.id, "case_owner");
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
  // Phase 6.5 hardening (P1, reliability review) — same truncation bug
  // Batch 6 fixed for cases/employee_records, confirmed live and already
  // ACTIVE here, not just a future risk: this org's real case_signals
  // count (1,655) already exceeds the single-request row cap, so this
  // was silently dropping real signals — including guardrail/next-best-
  // action/inconsistency flags — from every case view whose signal
  // happened to land past the cap.
  const loadCaseSignals = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await fetchAllPages((from, to) => supabase.from('case_signals').select('*').eq('org_id', org.id).order('created_at', {ascending:true}).range(from, to));
      if(error) { console.error('loadCaseSignals', error); markLoadIssue('case signals'); return; }
      if(data) {
        data.forEach(r => { caseSignalVersionRef.current[r.id] = r.updated_at; });
        setCaseSignals(data.map(r=>({
          id:r.id, caseId:r.case_id, type:r.type, title:r.title, reasoning:r.reasoning||"",
          status:r.status, sourceRefs:r.source_refs||[], source:r.source,
          createdBy:r.created_by, resolvedBy:r.resolved_by, resolvedAt:r.resolved_at,
          resolvedReason:r.resolved_reason, createdAt:r.created_at, ruleId:r.rule_id||null,
        })));
      }
      // Only after a genuinely successful load — an error above already
      // returns early, leaving this false, so syncGuardrailSignals keeps
      // waiting rather than risk duplicate-creating against incomplete data.
      setCaseSignalsLoaded(true);
    } catch(e) { console.error('loadCaseSignals', e); }
  };

  // Phase 6.5 hardening (closes independent audit finding 3.5, part B) —
  // was a bare upsert with no conflict detection: two users acting on
  // the same signal within seconds (e.g. one resolving it, another
  // editing sourceRefs) could have the second write silently discard the
  // first's resolved_by/resolved_reason — the exact accountability trail
  // those columns exist for. Layered on top of the existing
  // case_signals_open_rule_unique 23505 reconciliation (Prompt 14,
  // guardrail lifecycle redesign) rather than replacing it: that
  // conflict is a UNIQUE-constraint violation on first insert (no known
  // version yet, so conditionalUpdate takes its upsert path, same as
  // before), genuinely different from an optimistic-concurrency conflict
  // on an existing row's update_at — both are handled, on the branch
  // each one actually occurs on.
  const saveSignalToDB = (signal) => {
    if(!org?.id) return Promise.resolve();
    const fields = {
      case_id: signal.caseId, org_id: org.id,
      type: signal.type, title: signal.title, reasoning: signal.reasoning||null,
      status: signal.status||'open', source_refs: signal.sourceRefs||[], source: signal.source||'ai',
      created_by: signal.createdBy||null, resolved_by: signal.resolvedBy||null,
      resolved_at: signal.resolvedAt||null, resolved_reason: signal.resolvedReason||null,
      rule_id: signal.ruleId||null,
    };
    const run = async () => {
      const updatedAt = caseSignalVersionRef.current[signal.id];
      const nowIso = new Date().toISOString();
      const { error, conflict } = await withTransientRetry(() => withFkRetry(() => conditionalUpdate(supabase, 'case_signals', signal.id, updatedAt, {...fields, updated_at: nowIso})));
      if(conflict) {
        showToast("This signal was updated — new information was added while you were working. We've refreshed it with the latest version.", "info");
        loadCaseSignals();
        return;
      }
      if(!error) { caseSignalVersionRef.current[signal.id] = nowIso; return; }
      // 23505 here means case_signals_open_rule_unique lost a race:
      // another tab/session already inserted the open occurrence for
      // this (case_id, rule_id) between this signal being created
      // locally and this write landing. The local row is a genuine
      // duplicate of a real server row, not a failed write — reconcile
      // instead of just logging and leaving a phantom signal stuck in
      // this client's state forever.
      if(error.code === '23505' && signal.ruleId) {
        const { data: canonical, error: fetchError } = await supabase.from('case_signals')
          .select('*').eq('case_id', signal.caseId).eq('rule_id', signal.ruleId).eq('status', 'open').maybeSingle();
        if(fetchError || !canonical) { console.error('saveSignalToDB reconcile', fetchError||'no canonical row found'); return; }
        caseSignalVersionRef.current[canonical.id] = canonical.updated_at;
        setCaseSignals(prev => {
          const withoutLocalDup = prev.filter(s => s.id !== signal.id);
          if(withoutLocalDup.some(s => s.id === canonical.id)) return withoutLocalDup;
          return [...withoutLocalDup, {
            id:canonical.id, caseId:canonical.case_id, type:canonical.type, title:canonical.title,
            reasoning:canonical.reasoning||"", status:canonical.status, sourceRefs:canonical.source_refs||[],
            source:canonical.source, createdBy:canonical.created_by, resolvedBy:canonical.resolved_by,
            resolvedAt:canonical.resolved_at, resolvedReason:canonical.resolved_reason,
            createdAt:canonical.created_at, ruleId:canonical.rule_id,
          }];
        });
        return;
      }
      console.error('saveSignalToDB', error);
    };
    return enqueueSave(caseSignalSaveQueueRef.current, signal.id, run);
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
  // Phase 6.5 hardening (P1, reliability review) — same truncation bug
  // Batch 6 fixed for cases/employee_records, confirmed live and already
  // ACTIVE here, not just a future risk: this org's real case_tasks count
  // (1,263) already exceeds the single-request row cap, so real tasks —
  // including due-soon/overdue deadline tracking, which reads this same
  // state — were being silently dropped from view.
  const loadCaseTasks = async () => {
    if(!org?.id) return;
    try {
      const {data, error} = await fetchAllPages((from, to) => supabase.from('case_tasks').select('*').eq('org_id', org.id).order('created_at', {ascending:true}).range(from, to));
      if(error) { console.error('loadCaseTasks', error); markLoadIssue('case tasks'); return; }
      if(data) {
        data.forEach(r => { caseTaskVersionRef.current[r.id] = r.updated_at; });
        setCaseTasks(data.map(r=>({
          id:r.id, caseId:r.case_id, name:r.name, owner:r.owner||"",
          dueDate:r.due_date||"", priority:r.priority, status:r.status,
          createdBy:r.created_by, createdAt:r.created_at, source:r.source||null,
          insightRef:r.insight_ref||null, improvementInitiativeId:r.improvement_initiative_id||null,
        })));
      }
    } catch(e) { console.error('loadCaseTasks', e); }
  };

  // Phase 6.5 hardening (closes independent audit finding 3.5) — was a
  // bare upsert, no conflict detection: HR Manager A deletes task T;
  // seconds later Investigator B, whose tab hadn't refetched (no
  // realtime subscription), ticks T's still-stale checkbox — the upsert
  // found no conflicting row and re-inserted the deleted task, silently
  // undoing A's deletion. Same conditionalUpdate/enqueueSave/
  // withTransientRetry pattern as saveAllegationToDB. Prefers an
  // explicit UPDATE (via conditionalUpdate, once a version is known)
  // over a bare upsert specifically so a deleted row can't be
  // resurrected — deleteCaseTaskFromDB also needs to clear the version
  // ref so a stale in-flight save queued before the delete can't
  // silently upsert the task back in as a "new" row afterward.
  const saveCaseTaskToDB = (task) => {
    if(!org?.id) return Promise.resolve();
    const fields = {
      case_id: task.caseId||null, org_id: org.id,
      name: task.name, owner: task.owner||null, due_date: task.dueDate||null,
      priority: task.priority||'normal', status: task.status||'open', source: task.source||null,
      insight_ref: task.insightRef||null, improvement_initiative_id: task.improvementInitiativeId||null,
      created_by: task.createdBy||user?.id||null,
    };
    const run = async () => {
      const updatedAt = caseTaskVersionRef.current[task.id];
      const nowIso = new Date().toISOString();
      const { error, conflict } = await withTransientRetry(() => withFkRetry(() => conditionalUpdate(supabase, 'case_tasks', task.id, updatedAt, {...fields, updated_at: nowIso})));
      if(conflict) {
        showToast("This task was updated or removed — new information was added while you were working. We've refreshed it with the latest version.", "info");
        loadCaseTasks();
        return;
      }
      if(error) { console.error('saveCaseTaskToDB', error); showToast("Couldn't save task to the cloud — "+error.message, "error"); return; }
      caseTaskVersionRef.current[task.id] = nowIso;
    };
    return enqueueSave(caseTaskSaveQueueRef.current, task.id, run);
  };

  const deleteCaseTaskFromDB = async (taskId) => {
    const { error } = await supabase.from('case_tasks').delete().eq('id', taskId);
    if(error) { console.error('deleteCaseTaskFromDB', error); showToast("Couldn't delete task — "+error.message, "error"); return; }
    // Not required for correctness — conditionalUpdate's own WHERE clause
    // already fails closed (conflict, not a silent resurrection) against
    // a row that no longer exists — just avoids leaving a stale, never-
    // reused entry in the version ref forever.
    delete caseTaskVersionRef.current[taskId];
  };

  // Manager Enablement (Phase 4, MP19) — createCaseTask is called from
  // many places (Tasks tab, sendHrGuidance, hrReturnForFurtherWork...),
  // and assignInvestigator's own checklist seeding writes caseTasks
  // independently and asynchronously (after an awaited loadCaseAccess()
  // call) — a plain setCaseTasks(updated) built from a stale caseTasks
  // closure risks silently overwriting whichever of the two writes
  // resolves second. Found via a real E2E race (hr-intervention.spec.js
  // sending guidance immediately after assigning an investigator).
  //
  // The FIRST fix attempt for this (computing `created` as a side effect
  // *inside* the setCaseTasks updater callback, then reading it
  // synchronously right after) was itself wrong, caught during final
  // review by instrumenting the actual call and observing the order of
  // execution: React does NOT invoke a functional setState updater
  // synchronously — it's deferred into the next render pass, even from a
  // plain synchronous event handler, under React 18's automatic batching.
  // `created`/`changed`/`target` were reliably still null/undefined at
  // the point they were read, so saveCaseTaskToDB/audit never actually
  // ran — the underlying persistence bug this was meant to fix was
  // silently made *worse* (a save that always failed, not one that
  // occasionally lost a race), just invisible because the one E2E test
  // that exercises this path deliberately checks UI state rather than
  // the network write (its own comment says why: an earlier, differently
  // wrong attempt at asserting on the network response was unreliable —
  // which, in hindsight, was very likely this exact bug, misdiagnosed).
  //
  // The actual fix: addTask (a pure function of its inputs, not of
  // "what's the latest state") is called ONCE against the outer
  // `caseTasks` closure to synchronously compute the new task object —
  // reading fields off a freshly-created object we already hold a
  // reference to needs no round-trip through React's update queue at
  // all. The functional setCaseTasks call is kept, but only to append
  // that already-computed object, which is what actually protects
  // against the concurrent-write race (the merge happens against
  // whatever `prev` truly is when React processes it, not a stale
  // snapshot) — it just no longer tries to read a value back out of it.
  const createCaseTask = (caseId, fields) => {
    const created = addTask([], caseId, fields)[0];
    if(!created) return;
    setCaseTasks(prev => prev.some(t=>t.id===created.id) ? prev : [...prev, created]);
    saveCaseTaskToDB({...created, createdBy:user?.id});
    audit("Task added", created.name, caseId);
  };

  // Same fix as createCaseTask above, same reasoning — toggleTaskDone is
  // pure given (tasks, taskId), so the toggled task can be computed
  // synchronously from the closure for the DB save, while the functional
  // form is kept for the actual local-state merge.
  const toggleCaseTaskDone = (taskId) => {
    const changed = toggleTaskDone(caseTasks, taskId).find(t=>t.id===taskId);
    setCaseTasks(prev => toggleTaskDone(prev, taskId));
    if(changed) saveCaseTaskToDB(changed);
  };

  const deleteCaseTask = (taskId) => {
    const target = caseTasks.find(t=>t.id===taskId);
    setCaseTasks(prev => removeTask(prev, taskId));
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
  const [globalChatInsightsTab, setGlobalChatInsightsTab] = useState(null);

  // IA & User Journey pass, §8 — overrideQuestion lets Home's own prompt
  // box (a second, separate input from GlobalAssistantScreen's own) submit
  // a question in one step rather than needing setGlobalChatInput's state
  // update to land in a render before this closure would see it. No
  // change to the classification/AI-reasoning logic below — only where
  // the initial question string can come from.
  const sendGlobalChat = async (overrideQuestion) => {
    const question = (overrideQuestion ?? globalChatInput).trim();
    if(!question || globalChatProcessing) return;
    setGlobalChatInput("");
    const updated = [...globalChatHistory, {role:"user", content:question}];
    setGlobalChatHistory(updated);
    setGlobalChatProcessing(true);
    setGlobalChatCaseRef(null);
    setGlobalChatInsightsTab(null);
    try {
      const classifyRes = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:200,
        stream:false,
        system:"You classify a question an HR professional is asking an organisation-wide assistant. Respond ONLY with valid JSON, no other text: {\"intent\":\"stats\"|\"case\"|\"general\",\"employeeName\":\"exact name mentioned, or null\"}. Use \"stats\" for questions about counts, totals, or breakdowns across cases — including trend questions (e.g. \"why are grievances increasing\", \"what themes have emerged\"), location/site questions (e.g. \"which locations have the most overdue investigations\"), and appeal questions (e.g. \"why do appeals succeed\"), not just simple counts. Use \"case\" only when a specific named employee's case is being asked about. Use \"general\" for policy, process, or legal-guidance questions not about specific case data.",
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
      let insightsTab = null;
      if(intent==="stats") {
        // Organisational ER Intelligence (Phase 6, OP20, §20) — beyond
        // org_case_stats()'s basic counts, pull in OP2/OP4's richer
        // breakdown, OP7's significant trends, and OP11's own
        // client-side appeal intelligence (already-loaded allegations/
        // caseSignals, no new RPC needed for that one) so genuinely
        // answerable questions like "why are grievances increasing" or
        // "which locations have the most overdue investigations" have
        // real data behind them, not just total/active/closed counts.
        const [statsResult, overviewResult, trendResult] = await Promise.all([
          supabase.rpc('org_case_stats', { p_org_id: org.id }),
          supabase.rpc('org_insights_overview', { p_org_id: org.id, p_period_days: 90 }),
          supabase.rpc('org_trend_detection', { p_org_id: org.id, p_period_days: 90 }),
        ]);
        if(statsResult.error) console.error("org_case_stats", statsResult.error);
        if(overviewResult.error) console.error("org_insights_overview", overviewResult.error);
        if(trendResult.error) console.error("org_trend_detection", trendResult.error);
        const appealData = computeAppealIntelligence(allegations, cases, caseSignals);
        dataContext = buildGlobalStatsContext(statsResult.data, overviewResult.data, trendResult.data, appealData);
        insightsTab = inferInsightsTab(trendResult.data);
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
        system:GLOBAL_CHAT_SYSTEM_PROMPT+getPolicyCtx(),
        messages:[
          ...updated.map(m=>({role:m.role, content:m.content})).slice(0,-1),
          {role:"user", content:(dataContext?dataContext+"\n\n":"")+"Question: "+question},
        ],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(text) setGlobalChatHistory(h=>[...h, {role:"assistant", content:text}]);
      if(matchedCase) setGlobalChatCaseRef(matchedCase.id);
      if(intent==="stats" && text) setGlobalChatInsightsTab(insightsTab);
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

      const openPrior = openSignalsForCase(caseSignalsRef.current, cs.id, "next_action");
      const withoutStale = supersedeOpenSignalsOfType(caseSignalsRef.current, cs.id, "next_action");
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
      // Human UAT remediation, Batch 1, Issue 6 — a human's own Resolved/
      // Not relevant decision on a question used to have no way to reach
      // this prompt at all, so a fresh run had nothing telling it "this
      // was already looked at" and simply re-raised the same ground under
      // slightly different wording. Real signalsForCase resolvedBy is
      // what actually distinguishes a genuine human decision from this
      // same function's own auto-superseded entries (which never set
      // resolvedBy) — only genuine decisions are surfaced here.
      const priorDecisions = signalsForCase(caseSignalsRef.current, cs.id)
        .filter(s => s.type === "unanswered_question" && s.status !== "open" && s.resolvedBy);
      const priorSubject = s => (s.sourceRefs||[]).find(r=>r.kind==="subject")?.label;
      const priorDecisionsText = priorDecisions.length
        ? "\n\nALREADY REVIEWED — do not re-list any of these (recognise them by subject even if you'd now phrase the question differently) unless the case record now contains genuinely new information that specifically changes the answer (in which case, phrase it as what's newly unclear, not a repeat of the old question):\n"
          + priorDecisions.map(s => `- Subject: "${priorSubject(s)||s.title}" — was: "${s.title}" (marked ${s.status==="not_relevant"?"not relevant":"resolved"})`).join("\n")
        : "";
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:700,
        stream:false,
        // Human UAT remediation, Batch 1, Issue 6 (hardening round 2) —
        // `subject` asks for the stable fact/person the question is
        // fundamentally about (e.g. "Sarah Jones — not yet interviewed"),
        // not a restatement of the question's own wording, so the same
        // underlying question can be recognised across a reworded
        // regeneration — see caseSignals.js's findMatchingQuestionSignal
        // for exactly how this is used, and its own comment on why this
        // is offered as a stronger fingerprint, not a semantic guarantee.
        system:"You are Compass, an Employee Relations copilot maintaining a running list of what's been explored in this case and what hasn't. Read the case record and separate topics genuinely covered (a meeting or document already addresses them) from topics that remain open — a person mentioned but not interviewed, a claim made but not checked, a date or detail nobody has confirmed. Only list a 'still to explore' item if the record itself raises it — never invent a generic question the case doesn't support. A human reviewer's own prior judgement on a question must be respected, not silently re-litigated by a fresh pass — see below for anything already reviewed. For each still-to-explore item, also give a short, stable 'subject' naming WHO or WHAT it concerns (e.g. a person's name plus the specific gap, or a specific date/topic) — this is an identity for matching across future runs, not a rephrasing of the question, so keep it factual and consistent rather than creative. Respond ONLY with valid JSON, no other text: {\"covered\":[\"short label\",...],\"stillToExplore\":[{\"question\":\"specific open question\",\"reasoning\":\"one sentence on what in the record raises this\",\"subject\":\"short stable label for who/what this concerns\"}]}"+getPolicyCtx()+priorDecisionsText,
        messages:[{role:"user", content:"CASE RECORD:\n"+context}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());

      setUnansweredCovered(c=>({...c, [cs.id]: parsed.covered||[]}));

      const openPrior = openSignalsForCase(caseSignalsRef.current, cs.id, "unanswered_question");
      let updated = supersedeOpenSignalsOfType(caseSignalsRef.current, cs.id, "unanswered_question");
      openPrior.forEach(s => { const u = updated.find(x=>x.id===s.id); if(u) saveSignalToDB(u); });
      (parsed.stillToExplore||[]).forEach(q => {
        if(!q.question) return;
        // Backstop for the AI prompt guard above: even if the model
        // re-lists something a human already decided (near-identical
        // wording, or a genuinely different phrasing of the same subject,
        // is the realistic failure mode for a re-run against materially
        // unchanged case content), a genuine prior human decision is
        // never silently overridden by regeneration. Subject match is
        // tried first (survives rewording), falling back to normalised-
        // text match for older signals with no subject on file.
        const priorDecision = findMatchingQuestionSignal(updated, cs.id, "unanswered_question", { subject: q.subject, questionText: q.question });
        if (priorDecision && priorDecision.status !== "open" && priorDecision.resolvedBy) return;
        updated = createSignal(updated, cs.id, { type:"unanswered_question", title:q.question, reasoning:q.reasoning||"", source:"ai", sourceRefs: q.subject ? [{kind:"subject", id:q.subject, label:q.subject}] : [] });
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

      const base = caseSignalsRef.current;
      // Phase 6.5 hardening (closes independent audit finding 7.4) — this
      // had no dedup at all, unlike every sibling signal generator in
      // this file, and re-fires on every meeting save AND every
      // concludeInvestigation call — a conflict HR already reviewed and
      // marked Not relevant reappeared as a brand-new, unreviewed signal
      // the very next time either trigger ran. Identity here is the
      // meeting-id pair (order-independent — the AI's own m1/m2 ordering
      // isn't stable across runs), at ANY status: unlike a guardrail
      // check (which re-evaluates live, changeable case state), this
      // compares two specific, already-saved meeting records — if a
      // human already judged this exact pair, there's no new condition
      // for a later run to have detected, only the same two fixed texts
      // again.
      const existingPairs = new Set(
        signalsForCase(base, cs.id)
          .filter(s=>s.type==="inconsistency")
          .map(s=>(s.sourceRefs||[]).filter(r=>r.kind==="meeting").map(r=>r.id).sort().join(":"))
      );
      let updated = base;
      valid.forEach(f => {
        const pairKey = [f.meetingId1, f.meetingId2].sort().join(":");
        if(existingPairs.has(pairKey)) return;
        existingPairs.add(pairKey);
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
      updated.filter(s=>!base.includes(s)).forEach(saveSignalToDB);
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
      const priorOpen = caseSignalsRef.current.filter(s=>s.caseId===cs.id && s.type==="process_risk" && s.status==="open" && s.title.startsWith("Appeal ground:"));
      let updated = caseSignalsRef.current;
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

  // { [caseId]: Set<ruleId> } — see syncGuardrailSignals below for why this
  // needs to be a ref (synchronous, not batched) rather than derived from
  // caseSignals state on every call.
  const guardrailSyncedRuleIdsRef = useRef({});

  // ── Procedural Guardrails ──
  // computeGuardrailChecks (lib/guardrails.js) is a plain data comparison,
  // no AI call — so this runs automatically when a case is opened rather
  // than needing a button + loading state, same "always current" treatment
  // as Case Readiness. Dedup is by rule_id (each check's own stable id,
  // not its presentation title — see caseSignals.js/guardrails.js): a
  // check only creates a new signal if no OPEN signal for that rule_id
  // already exists for this case, so a human's dismiss/not-relevant/accept
  // decision sticks rather than being re-surfaced on the next sync, while
  // a genuinely new occurrence after resolution (the condition clears,
  // then returns later) can still create a fresh row — see
  // guardrail_signal_dedup_2026-08-26.sql for why "any status, ever" was
  // wrong. A currently-open signal is auto-resolved once its condition
  // clears, since these are factual comparisons, not judgment calls a
  // human needs to confirm away.
  //
  // Phase 6.5 hardening (production regression suite) — real duplicate-
  // signal bug found via E2E (decision-workspace.spec.js/
  // procedural-guardrails.spec.js both hit a strict-mode "3 elements"
  // locator failure on a case with only ONE triggering allegation). Root
  // cause: this effect's own deps ([cases, allegations, ...] below) mean
  // it can fire more than once while a case's data is still streaming in
  // from separate REST loads, and each call closes over the SAME
  // `caseSignals` snapshot from the render that scheduled it. If a second
  // call starts before the first call's setCaseSignals has actually
  // landed, `existing` is stale in both calls, so both independently see
  // "no open signal for this rule yet" and both insert one — a genuine
  // duplicate-row bug that could hit real users too, not just this test
  // (case data reliably loads over multiple network round-trips), and
  // confirmed live in production (48 duplicate groups found 2026-08-26,
  // every one created within the same 60-second window). Closing this
  // same-tab race is still worth doing even though
  // case_signals_open_rule_unique (DB) now backstops the cross-tab/
  // cross-request case — avoids a routine 409 on every double-fire.
  // guardrailSyncedRuleIdsRef closes it with a plain, synchronous
  // (non-batched) ref rather than relying on state, which is exactly the
  // dedup guarantee "idempotent by construction" above assumed but didn't
  // actually hold under concurrent fires.
  const syncGuardrailSignals = (cs) => {
    const checks = computeGuardrailChecks(cs, allegations, policies, caseAccess, orgMembers);
    const triggeredRuleIds = new Set(checks.map(c=>c.id));
    // Phase 6.5 hardening (Prompt 14, guardrail lifecycle redesign) —
    // ruleId (case_signals.rule_id, backfilled/enforced by
    // guardrail_signal_dedup_2026-08-26.sql) is now the real identity for
    // a guardrail-generated signal, not title text. This naturally
    // excludes generateAppealReview's "Appeal ground: ..." signals (a
    // different, AI-generated source that shares type:"process_risk"
    // purely by historical accident) without needing GUARDRAIL_CHECK_TITLES
    // — those never carry a ruleId.
    const existing = caseSignals.filter(s=>s.caseId===cs.id && s.type==="process_risk" && s.ruleId);

    // Phase 6.5 hardening (closes Prompt 16 audit finding H13, HIGH) —
    // this used to seed only from status==="open" rows, on the theory
    // that a rule resolved in an earlier sync should stay absent so a
    // real recurrence can create a fresh occurrence. But GuardrailsPanel's
    // own "Mark resolved" button (a HUMAN decision) calls
    // changeSignalStatus(id, "resolved") — the exact same literal status
    // string the auto-clear branch below uses for "the condition itself
    // stopped triggering." Seeding from status==="open" only therefore
    // treated a human's "Mark resolved" click identically to a genuinely
    // cleared condition: on the very next reload (this ref is
    // per-session, wiped on every fresh mount), the underlying condition
    // was almost always still true (dismissing the notification doesn't
    // change the case), so the check re-fired and recreated the exact
    // signal the human had just resolved.
    //
    // resolvedBy is the real distinguishing signal, already present and
    // already set correctly by both paths: changeSignalStatus passes the
    // real user?.id (setSignalStatus stores it as resolvedBy), while the
    // auto-clear branch below explicitly passes null. Seeding from "open
    // OR resolvedBy is set" keeps every human decision (resolved/
    // not_relevant/accepted/dismissed/explained) sticky across a reload,
    // while a signal resolvedBy===null (only ever produced by the
    // auto-clear branch, i.e. the condition genuinely stopped matching)
    // still correctly frees its rule id for a real future recurrence.
    if(!guardrailSyncedRuleIdsRef.current[cs.id]) guardrailSyncedRuleIdsRef.current[cs.id] = new Set(existing.filter(s=>s.status==="open"||s.resolvedBy).map(s=>s.ruleId));
    const syncedRuleIds = guardrailSyncedRuleIdsRef.current[cs.id];

    let updated = caseSignals;
    existing.filter(s=>s.status==="open" && !triggeredRuleIds.has(s.ruleId)).forEach(s => {
      updated = setSignalStatus(updated, s.id, "resolved", null, "Condition no longer detected");
      const changed = updated.find(x=>x.id===s.id);
      if(changed) saveSignalToDB(changed);
      // Removed from syncedRuleIds (not left in, unlike the old
      // title-keyed version) — this rule's slot is genuinely free again,
      // both here and at the DB (case_signals_open_rule_unique only
      // blocks concurrent OPEN duplicates, never a resolved row's later
      // recurrence), so a future sync where this check re-triggers
      // creates a real new occurrence rather than staying silently
      // suppressed forever.
      syncedRuleIds.delete(s.ruleId);
    });

    checks.forEach(c => {
      if(syncedRuleIds.has(c.id)) return;
      syncedRuleIds.add(c.id);
      updated = createSignal(updated, cs.id, { type:"process_risk", title:c.title, reasoning:c.reasoning, sourceRefs:c.sourceRefs||[], source:"ai", ruleId:c.id });
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
  //
  // Phase 6.5 hardening (production regression suite) — real,
  // DB-confirmed duplicate-signal bug found via E2E: on a fresh page
  // load/reload, this effect can (and, per the E2E evidence, does) fire
  // before loadCaseSignals' own async fetch has resolved — at that
  // moment caseSignals is still its initial empty array, which
  // syncGuardrailSignals's title-dedup misreads as "no signal exists
  // yet" and creates a genuine duplicate DB row once the real data does
  // load a moment later. caseSignalsLoaded gates this effect until that
  // load has actually landed at least once, so dedup only ever runs
  // against real data, never an empty placeholder.
  useEffect(()=>{
    if(screen===SCREENS.CASE_VIEW && activeCaseId && caseSignalsLoaded) {
      const cs = cases.find(c=>c.id===activeCaseId);
      if(cs) syncGuardrailSignals(cs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeCaseId, cases, allegations, caseAccess, caseSignalsLoaded]);

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
      // Phase 6.5 hardening (P0, Cluster 8) — the LLM is only ever asked
      // for an index into THIS SAME unlinked array from THIS SAME call,
      // resolved immediately into the evidence item's own stable id here
      // — evidenceSuggestions (session-local state) stores evidenceId,
      // never the index itself, so a later delete elsewhere on the case
      // can't make an already-generated suggestion point at the wrong
      // evidence item.
      const valid = (Array.isArray(parsed)?parsed:[])
        .filter(s=>unlinked.some(ev=>ev.index===s.evidenceIndex) && caseAllegations.some(a=>a.id===s.allegationId))
        .map(s=>({ ...s, evidenceId: unlinked.find(ev=>ev.index===s.evidenceIndex).id }));
      setEvidenceSuggestions(s=>({...s, [cs.id]:valid}));
    } catch(e) { console.error("generateEvidenceSuggestions", e); if(!silent) showToast("Couldn't generate evidence suggestions — "+e.message, "error"); }
    if(!silent) setEvidenceSuggestionsLoading(l=>({...l, [cs.id]:false}));
  };

  const acceptEvidenceSuggestion = (cs, suggestion) => {
    saveCases(cases.map(x=>x.id===cs.id?{...x, evidence:linkEvidenceToAllegation(x.evidence||[], suggestion.evidenceId, suggestion.allegationId, suggestion.stance)}:x));
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
  // Phase 6.5 hardening (P0, Cluster 8) — keyed by the evidence item's own
  // stable id (src/lib/evidenceUpload.js), not array position — deleting
  // a different evidence item can no longer silently reassign these
  // session-local findings to the wrong document.
  const [documentFindings, setDocumentFindings] = useState({}); // `${caseId}::${evidenceId}` -> [{id,type,...,status}]
  const [documentAnalysisLoading, setDocumentAnalysisLoading] = useState({});

  const analyseEvidenceDocument = async (cs, evidenceId) => {
    const ev = (cs.evidence||[]).find(e=>e.id===evidenceId);
    if(!ev || !canAnalyseEvidence(ev)) return;
    const content = buildAnalysisContent(ev);
    if(!content) return;
    const key = `${cs.id}::${evidenceId}`;
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
        .map((f,i)=>({...f, id:newId("finding"), status:"open"}));
      setDocumentFindings(s=>({...s, [key]:findings}));
      if(!findings.length) showToast("Compass found nothing to flag in this document");
    } catch(e) { console.error("analyseEvidenceDocument", e); showToast("Couldn't analyse the document — "+e.message, "error"); }
    setDocumentAnalysisLoading(l=>({...l, [key]:false}));
  };

  const acceptDocumentFinding = (cs, evidenceId, finding) => {
    const key = `${cs.id}::${evidenceId}`;
    if(finding.type==="witness") {
      createCaseTask(cs.id, {name:`Interview ${finding.name} as a potential witness`});
    } else if(finding.type==="action") {
      createCaseTask(cs.id, {name:finding.description, dueDate: parseCommitmentDueDate(finding.description)||"", owner: suggestTaskOwner(cs, orgMembers)});
    } else if(finding.type==="allegation_link") {
      saveCases(cases.map(x=>x.id===cs.id?{...x, evidence:linkEvidenceToAllegation(x.evidence||[], evidenceId, finding.allegationId, finding.stance)}:x));
    } else if(finding.type==="inconsistency") {
      const ev = (cs.evidence||[]).find(e=>e.id===evidenceId);
      const created = createSignal(caseSignals, cs.id, {
        type:"inconsistency", title:"Potential inconsistency: "+(ev?.name||"uploaded document"),
        reasoning:finding.description+(finding.reasoning?" — "+finding.reasoning:""),
        sourceRefs:[{kind:"evidence", id:evidenceId, label:ev?.name}],
        source:"ai",
      });
      setCaseSignals(created);
      saveSignalToDB(created[created.length-1]);
    }
    setDocumentFindings(s=>({...s, [key]:(s[key]||[]).map(f=>f.id===finding.id?{...f,status:"accepted"}:f)}));
  };

  const dismissDocumentFinding = (cs, evidenceId, finding) => {
    const key = `${cs.id}::${evidenceId}`;
    setDocumentFindings(s=>({...s, [key]:(s[key]||[]).map(f=>f.id===finding.id?{...f,status:"dismissed"}:f)}));
  };

  // Integrations & Workflow Automation (Phase 5, IP23, §19) — the same
  // finding-approval shape as analyseEvidenceDocument/acceptDocumentFinding
  // above, kept as its own state/handlers rather than folding into
  // documentFindings: an OH report's findings (adjustment/restriction/
  // further_information/review_date) target ohProcess.js's tracked
  // process, not the evidence-allegation/case-signal write paths the
  // generic finding types use, so mixing the two vocabularies into one
  // map would make both harder to reason about for no real benefit.
  const [ohReportFindings, setOhReportFindings] = useState({}); // `${caseId}::${evidenceId}` -> [{id,type,...,status}]
  const [ohReportAnalysisLoading, setOhReportAnalysisLoading] = useState({});

  const analyseOhReport = async (cs, evidenceId) => {
    const ev = (cs.evidence||[]).find(e=>e.id===evidenceId);
    if(!ev || !canAnalyseEvidence(ev)) return;
    const content = buildAnalysisContent(ev);
    if(!content) return;
    const key = `${cs.id}::${evidenceId}`;
    setOhReportAnalysisLoading(l=>({...l, [key]:true}));
    try {
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:700,
        stream:false,
        system: OH_REPORT_SYSTEM_PROMPT,
        messages:[{role:"user", content:[
          {type:"text", text:`CASE: ${cs.employeeName} (${cs.caseType||"HR matter"})\n\nOCCUPATIONAL HEALTH REPORT TO ANALYSE ("${ev.name}"):`},
          content,
        ]}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const findings = buildOhFindings(parsed);
      setOhReportFindings(s=>({...s, [key]:findings}));
      if(!findings.length) showToast("Compass found nothing to flag in this report");
    } catch(e) { console.error("analyseOhReport", e); showToast("Couldn't analyse the report — "+e.message, "error"); }
    setOhReportAnalysisLoading(l=>({...l, [key]:false}));
  };

  const acceptOhFinding = (cs, evidenceId, finding) => {
    const key = `${cs.id}::${evidenceId}`;
    const taskName = ohFindingTaskName(finding);
    if(taskName) {
      createCaseTask(cs.id, {name: taskName, dueDate: parseCommitmentDueDate(finding.description)||"", owner: suggestTaskOwner(cs, orgMembers)});
    } else if(finding.type==="review_date") {
      saveCases(cases.map(x=>x.id===cs.id?{...x, ohProcess:{...(x.ohProcess||{}), reviewDate: finding.date}}:x), cs.id);
    }
    setOhReportFindings(s=>({...s, [key]:(s[key]||[]).map(f=>f.id===finding.id?{...f,status:"accepted"}:f)}));
  };

  const dismissOhFinding = (cs, evidenceId, finding) => {
    const key = `${cs.id}::${evidenceId}`;
    setOhReportFindings(s=>({...s, [key]:(s[key]||[]).map(f=>f.id===finding.id?{...f,status:"dismissed"}:f)}));
  };

  // ── Email integration groundwork (Phase 24) ──
  // The manual half of a flow designed so a later webhook adapter (Graph
  // mail push / Gmail push) can feed the same pipeline once OAuth
  // credentials exist — see lib/emailIngestion.js. Nothing is saved until
  // saveEmailToCase() is called explicitly; extraction alone never writes
  // anything, same "review before write" posture as Phase 7.
  const [emailExtraction, setEmailExtraction] = useState(null);
  const [emailExtractionLoading, setEmailExtractionLoading] = useState(false);

  // Integrations & Workflow Automation (Phase 5, IP9, §2) — extends the
  // original sender/subject/date/employeeName/summary-only shallow read
  // to the spec's full field set, plus a genuine confidence tier on the
  // case match (matchCaseByEmployeeNameWithConfidence) rather than a
  // silent yes/no. The findings-style fields (potentialActions/
  // Deadlines/Witnesses/Evidence) are surfaced for HR to read here, not
  // yet individually accept/dismiss-able against a case — that's IP11's
  // email-to-evidence phase, once the email is actually saved as
  // evidence with somewhere real for an accepted finding to attach to.
  const extractEmailDetails = async (rawText) => {
    if(!rawText?.trim()) return;
    setEmailExtractionLoading(true);
    setEmailExtraction(null);
    try {
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:800,
        stream:false,
        system:"You are Compass, an Employee Relations copilot extracting structured details from an email so it can be filed to the right case. Read the content given and extract: the sender, recipients (array), the subject, the date (if mentioned or inferable, in DD/MM/YYYY), which named employee this email is primarily about (may differ from the sender or recipient — look for who the content concerns, not just who wrote it), any OTHER named employees mentioned (array, excluding the primary one), any explicit case/matter references mentioned (array, e.g. \"the grievance we discussed\", \"case ref 1234\"), any other dates mentioned beyond the email's own date (array), any attachments the text refers to (array, e.g. \"see attached rota\" -> \"rota\" — only ones the text actually references, never invent one), potential follow-up actions/commitments mentioned (array of short descriptions), potential deadlines mentioned (array of short descriptions), potential witnesses mentioned — people who might need interviewing but aren't the subject employee (array of names), potential evidence mentioned — documents/recordings/messages referred to (array of short descriptions), and a one-sentence neutral summary. Respond ONLY with valid JSON, no other text: {\"sender\":null,\"recipients\":[],\"subject\":null,\"date\":null,\"employeeName\":null,\"employeesMentioned\":[],\"caseReferences\":[],\"datesMentioned\":[],\"attachmentsMentioned\":[],\"potentialActions\":[],\"potentialDeadlines\":[],\"potentialWitnesses\":[],\"potentialEvidence\":[],\"summary\":null} — use null (not a guess) for sender/subject/date/employeeName/summary you can't actually determine, and an empty array for anything the content doesn't mention.",
        messages:[{role:"user", content:rawText.slice(0,8000)}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const { case: matchedCase, confidence: matchConfidence } = parsed.employeeName
        ? matchCaseByEmployeeNameWithConfidence(cases, parsed.employeeName)
        : { case: null, confidence: "none" };
      setEmailExtraction({...parsed, rawText, matchedCaseId:matchedCase?.id||null, matchConfidence});
    } catch(e) { console.error("extractEmailDetails", e); showToast("Couldn't read that email — "+e.message, "error"); }
    setEmailExtractionLoading(false);
  };

  const saveEmailToCase = (caseId) => {
    if(!emailExtraction) return;
    const item = buildEmailEvidenceItem({
      sender:emailExtraction.sender, subject:emailExtraction.subject, date:emailExtraction.date, body:emailExtraction.rawText, addedBy:currentUser?.name||"HR Manager",
      recipients:emailExtraction.recipients, attachmentsMentioned:emailExtraction.attachmentsMentioned, employeesMentioned:emailExtraction.employeesMentioned,
      caseReferences:emailExtraction.caseReferences, datesMentioned:emailExtraction.datesMentioned,
    });
    saveCases(cases.map(x=>x.id===caseId?{...x, evidence:[...(x.evidence||[]), item]}:x), caseId);
    audit("Email saved to case", item.name, caseId);
    showToast("Email saved to the case's evidence");
    setEmailExtraction(null);
    setActiveCaseId(caseId);
    setActiveCaseStage("investigation");
    setScreen(SCREENS.CASE_VIEW);
  };

  // Integrations & Workflow Automation (Phase 5, IP10, §2-3) — "Create
  // New Concern", the fourth of the spec's four choices against a read
  // email (Add to Case / Choose Different Case / Create New Concern /
  // Ignore — the first two are the existing case dropdown+Save button,
  // the last is "Start over"). Seeds the existing concernForm/
  // submitConcernReferral flow rather than a parallel concern-creation
  // path; nothing is submitted until HR reviews the pre-filled form and
  // clicks Submit themselves.
  const [concernFormAutoOpen, setConcernFormAutoOpen] = useState(false);
  // IA & User Journey pass, §7 — same shape as concernFormAutoOpen above,
  // for the universal Create menu's "New task" action to open TasksScreen
  // with its existing form already expanded.
  const [taskFormAutoOpen, setTaskFormAutoOpen] = useState(false);
  const createConcernFromEmail = () => {
    if(!emailExtraction) return;
    setConcernForm({...EMPTY_CONCERN_FORM, employeeName: emailExtraction.employeeName||"", description: buildConcernDescriptionFromEmail(emailExtraction)});
    setConcernFormAutoOpen(true);
    setEmailExtraction(null);
    setScreen(SCREENS.CONCERNS);
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
    // Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
    // scoped to the active org — see the calendar status effect's own
    // sibling comment.
    if(!user?.id||!org?.id) return;
    authedFetch(`/api/graph-mail/status?orgId=${encodeURIComponent(org.id)}`)
      .then(r=>r.json()).then(d=>{ setMailConnected(!!d.connected); setMailboxEmail(d.mailbox||null); }).catch(()=>{});
  }, [user?.id, org?.id]);
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
    if(!user?.id||!org?.id) return;
    try {
      await authedFetch("/api/graph-mail/disconnect", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ orgId: org.id }) });
      setMailConnected(false); setMailboxEmail(null); setInboxMessages(null);
      showToast("Outlook disconnected");
    } catch(e) { showToast("Couldn't disconnect — please try again"); }
  };
  const loadInboxMessages = async () => {
    setInboxLoading(true);
    try {
      const res = await authedFetch(`/api/graph-mail/list-messages?orgId=${encodeURIComponent(org?.id||"")}`);
      const data = await res.json();
      // SaveEmailScreen's own load effect re-fires whenever inboxMessages
      // is still null and inboxLoading is false — leaving inboxMessages
      // at null on a failed fetch (as this used to) made that effect
      // immediately true again the moment loading finished, retrying
      // forever. Setting it to [] on failure (a real "loaded, empty"
      // result, distinct from "never loaded") breaks the loop.
      if(res.ok) setInboxMessages(data.messages||[]);
      else { showToast(data.error||"Couldn't load your inbox", "error"); setInboxMessages([]); }
    } catch(e) { showToast("Couldn't load your inbox", "error"); setInboxMessages([]); }
    setInboxLoading(false);
  };
  // ── Reply capture (Phase 5, IP14, §8) ──
  // Checked before the normal extraction flow whenever a message is
  // picked from the connected inbox: a reply to a letter Compass already
  // sent from a specific case should be flagged as that (with its own
  // Add to Case / Analyse Response / Update Meeting / Create Action
  // choices), not just filed as a fresh, unrelated email.
  const [replyMatch, setReplyMatch] = useState(null); // {caseId, name, subject, recipient, rawText}
  const [caseViewInitialTab, setCaseViewInitialTab] = useState(null);
  const [replyAnalysis, setReplyAnalysis] = useState(null); // {isPostponementRequest, isNewIssue, summary}
  const [replyAnalysisLoading, setReplyAnalysisLoading] = useState(false);
  const clearReplyMatch = () => { setReplyMatch(null); setReplyAnalysis(null); setReplyAnalysisLoading(false); };

  const pickInboxMessage = async (messageId) => {
    try {
      const res = await authedFetch(`/api/graph-mail/get-message?messageId=${encodeURIComponent(messageId)}&orgId=${encodeURIComponent(org?.id||"")}`);
      const data = await res.json();
      if(!res.ok || !data.rawText) { showToast(data.error||"Couldn't read that email", "error"); return; }

      const allSentItems = cases.flatMap(cs => (cs.evidence||[]).filter(ev=>ev.source==="sent_letter").map(ev=>({...ev, caseId:cs.id})));
      const match = matchReplyToSentLetters({ subject: data.subject, from: data.from }, allSentItems);
      if(match) { setReplyAnalysis(null); setReplyMatch({ ...match, rawText: data.rawText }); return; }

      extractEmailDetails(data.rawText);
    } catch(e) { showToast("Couldn't read that email", "error"); }
  };

  const saveReplyToCase = () => {
    if(!replyMatch) return;
    const item = buildEmailEvidenceItem({ body: replyMatch.rawText, addedBy: currentUser?.name||"HR Manager" });
    saveCases(cases.map(x=>x.id===replyMatch.caseId?{...x, evidence:[...(x.evidence||[]), item]}:x), replyMatch.caseId);
    audit("Email saved to case", item.name, replyMatch.caseId);
    showToast("Reply saved to the case's evidence");
    setActiveCaseId(replyMatch.caseId);
    setActiveCaseStage("investigation");
    setScreen(SCREENS.CASE_VIEW);
    clearReplyMatch();
  };

  const analyseReplyResponse = async () => {
    if(!replyMatch) return;
    setReplyAnalysisLoading(true);
    try {
      const res = await authedFetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:400,
        stream:false,
        system:"You are Compass, an Employee Relations copilot reading a reply to a letter HR already sent. Read the reply and determine: whether the sender is asking to postpone or reschedule anything (isPostponementRequest), whether they raise a genuinely new issue, complaint, or piece of information not already anticipated by the letter they're replying to (isNewIssue), and a one-sentence neutral summary of what the reply actually says. Never decide what HR should do about either flag — only report what's there, for a human to review. Respond ONLY with valid JSON, no other text: {\"isPostponementRequest\":false,\"isNewIssue\":false,\"summary\":\"...\"}",
        messages:[{role:"user", content:`This reply is to: "${replyMatch.subject||replyMatch.name}"\n\n${replyMatch.rawText}`}],
      })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setReplyAnalysis(parsed);
    } catch(e) { console.error("analyseReplyResponse", e); showToast("Couldn't analyse the reply — "+e.message, "error"); }
    setReplyAnalysisLoading(false);
  };

  const openReplyCaseMeetings = () => {
    if(!replyMatch) return;
    setActiveCaseId(replyMatch.caseId);
    setCaseViewInitialTab("meetings");
    setScreen(SCREENS.CASE_VIEW);
    clearReplyMatch();
  };

  const createReplyAction = () => {
    if(!replyMatch) return;
    const name = replyAnalysis?.summary || `Follow up on reply to "${replyMatch.name}"`;
    createCaseTask(replyMatch.caseId, { name });
    showToast("Task created");
    clearReplyMatch();
  };

  // ── Gmail connection (Phase 5, IP2) ──
  // Same delegated-OAuth shape as Outlook mail above, sharing its
  // graph_mail_connections row (provider:'google') and its
  // api/graph-mail/[...action].js router (gmail-* actions) rather than a
  // parallel table/router — see api/graph-mail/_gmail.js's own comment on
  // why. Read-only connector only in this phase — no inbox browsing yet,
  // that's a later Track B phase extending the same pattern
  // loadInboxMessages/pickInboxMessage already establish for Outlook.
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailboxEmail, setGmailboxEmail] = useState(null);
  useEffect(() => {
    // Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
    // scoped to the active org — see the calendar status effect's own
    // sibling comment.
    if(!user?.id||!org?.id) return;
    authedFetch(`/api/graph-mail/gmail-status?orgId=${encodeURIComponent(org.id)}`)
      .then(r=>r.json()).then(d=>{ setGmailConnected(!!d.connected); setGmailboxEmail(d.mailbox||null); }).catch(()=>{});
  }, [user?.id, org?.id]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailParam = params.get("gmail");
    if(!gmailParam) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same one-time, query-param-driven sync on mount as the identical mailParam/calendarParam effects above, neither of which the rule flags (it only catches some setState calls in this shape, not the equivalent ones elsewhere in this file, for reasons the rule's own message doesn't explain).
    if(gmailParam==="connected") { setGmailConnected(true); showToast("Gmail connected"); }
    else if(gmailParam==="error") { showToast("Couldn't connect Gmail — please try again"); }
    params.delete("gmail");
    const newUrl = window.location.pathname + (params.toString()?"?"+params.toString():"");
    window.history.replaceState({}, "", newUrl);
  }, []);

  // Integrations & Workflow Automation (Phase 5, IP21, §15) — "Open in
  // Compass" deep link from an HRIS profile. Same one-time,
  // query-param-driven shape as the gmailParam/mailParam/calendarParam
  // effects above rather than folding into readNavFromUrl's bidirectional
  // screen/case router: this is a one-shot "arrived here from an external
  // profile" trigger, not ordinary in-app navigation the user browses
  // into and might expect Back/Forward to retrace.
  const [openEmployeeName, setOpenEmployeeName] = useState(null);
  useEffect(() => {
    const employeeName = parseEmployeeDeepLink(window.location.search);
    if(!employeeName) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same one-time, query-param-driven sync on mount as the identical gmailParam/mailParam/calendarParam effects above.
    setOpenEmployeeName(employeeName);
    setScreen(SCREENS.OPEN_EMPLOYEE);
    const params = new URLSearchParams(window.location.search);
    params.delete("employee");
    const newUrl = window.location.pathname + (params.toString()?"?"+params.toString():"");
    window.history.replaceState({}, "", newUrl);
  }, []);

  const connectGmail = async () => {
    if(!user?.id || !org?.id) return;
    try {
      const res = await authedFetch(`/api/graph-mail/gmail-oauth-start?orgId=${encodeURIComponent(org.id)}`);
      const data = await res.json();
      if(data.url) window.location.href = data.url;
      else showToast(data.error||"Couldn't start Gmail connection", "error");
    } catch { showToast("Couldn't start Gmail connection", "error"); }
  };
  const disconnectGmail = async () => {
    if(!user?.id||!org?.id) return;
    try {
      await authedFetch("/api/graph-mail/gmail-disconnect", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ orgId: org.id }) });
      setGmailConnected(false); setGmailboxEmail(null);
      showToast("Gmail disconnected");
    } catch { showToast("Couldn't disconnect — please try again"); }
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
    if(!hasContent) { orgLsSet("compass_meeting_draft", null); return; }
    orgLsSet("compass_meeting_draft", {
      transcript, inputText, meetingType, caseInfo, meetingStartTime, meetingEndTime, adjournments, participants, prepNotes, prepQuestions,
      savedAt: new Date().toISOString(),
    });
  }, [screen, transcript, inputText, meetingType, caseInfo, meetingStartTime, meetingEndTime, adjournments, participants, prepNotes, prepQuestions, orgLsSet]);

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
    const draft = orgLs("compass_meeting_draft", null);
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
        orgLsSet("compass_meeting_draft", null);
      }
    })();
    // orgLs/orgLsSet are genuinely safe to list here despite the "once on
    // mount" intent — they're useCallback-stable for this component
    // instance's entire lifetime (org?.id can't change without a full
    // remount, see main.jsx's key={org.id}), so adding them doesn't risk
    // a second run, it just satisfies exhaustive-deps honestly.
  }, [orgLs, orgLsSet]);

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
    setPolicies(p=>{const u=p.map(x=>x.id===policyId?{...x,category}:x);orgLsSet("compass_policies",u);return u;});
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
    // Human UAT remediation, Batch 2, Part 4 — this is the one place
    // every real way of adding meeting content converges (typed-then-
    // Enter, live microphone speech, screen-audio-capture speech, an
    // imported transcript, and the final flush on "End meeting") — unlike
    // the textarea's own onChange, which only ever fired for the
    // manual-typing path and left meetingStartTime unset for a meeting
    // conducted purely by speech.
    if(!meetingStartTime) setMeetingStartTime(new Date().toISOString());
    const pendingId = newId("utt");
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
      const items = parsed.map((u,i)=>({id:i===0?pendingId:newId("utt"), speaker:u.speaker, text:u.text, ts, aiAttributed:true}));
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
    // Phase 6.5 hardening (closes Prompt 16 audit finding H7, HIGH) —
    // meetingIntelligence (possible-inconsistency quotes, suggested
    // follow-up questions — both drawn directly from the PREVIOUS
    // meeting's own transcript) was missing from this reset list, unlike
    // every other piece of per-meeting AI state above. updateMeetingIntelligence
    // only re-runs once enough new utterances accumulate, so starting a
    // new meeting for a DIFFERENT employee could show that employee's
    // chair the outgoing meeting's own intelligence panel — a real
    // cross-employee confidentiality leak, not just a stale-content bug
    // — until the new meeting's own first live pass overwrote it.
    // dismissedNudgeKey/dismissedFollowUpKey/dismissedCoachingTipKeys are
    // the same omission, lower severity (they don't render another
    // employee's content, just risk mis-suppressing a new nudge that
    // happens to coincidentally match a stale dismissed key).
    setMeetingIntelligence(null); setDismissedNudgeKey(null); setDismissedFollowUpKey(null); setDismissedCoachingTipKeys([]);
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
        id: newId("pq"),
        text: q.text||"",
        category: q.category||"general",
        essential: !!q.essential,
        reasoning: q.reasoning||"",
        linkedAllegationId: null,
        linkedEvidenceId: null,
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
  const linkPrepQuestionToEvidence = (id, evidenceId) => setPrepQuestions(qs => linkPrepQuestionToEvidenceHelper(qs, id, evidenceId));
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
    const meetingEndTimeVal = new Date().toISOString();
    setMeetingEndTime(meetingEndTimeVal);
    const extra = inputText.trim() ? [{id:newId("utt"),speaker:"Note",text:inputText.trim(),ts:"",pending:false}] : [];
    const allNotes = [...transcript, ...extra];
    if(!allNotes.length) return;
    if(extra.length) { setTranscript(allNotes); setInputText(""); }
    setScreen(SCREENS.REVIEW); setReviewOutput(""); setReviewOutputOriginal(""); setMeetingSummary(""); setAiError(""); setRiskScore(null); setPrediction("");
    setAiProcessing(true);
    // Generate next steps deadlines
    orgLsSet("compass_meeting_draft", null); // transcript is now captured in the AI call in flight — the crash-recovery window has passed
    const baseDate = caseInfo.date ? new Date(caseInfo.date.split("/").reverse().join("-")) : new Date();
    // Phase 6.5 hardening (P1, reliability review) — was lib/dates.js's own
    // addWorkingDays, a second, duplicate implementation of this same
    // function with a real bug: it special-cased days===0 to return null
    // instead of the same date, so NEXT_STEPS_MAP's "Note warning on HR
    // record" step (days:0, constants.js) silently got no deadline at all
    // on every Disciplinary meeting, and so never appeared in the overdue/
    // due-soon feed. dateMath.js's addWorkingDays (the shared module this
    // review consolidated four other date implementations onto) has no
    // such special case and also — unlike the old dates.js version —
    // parses DD/MM/YYYY, not just what `new Date()` itself accepts.
    const steps = (NEXT_STEPS_MAP[meetingType?.label] || []).map(s=>({ step:s.step, deadline:addWorkingDays(baseDate,s.days,ukJurisdiction||undefined)?.toLocaleDateString("en-GB")||null, done:false }));
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
        `${meetingType?.label} meeting. Employee: ${caseInfo.employee}${caseInfo.employeeJobTitle?" ("+caseInfo.employeeJobTitle+")":(employeeRecords||[]).find(r=>r.name===caseInfo.employee)?.jobTitle?" ("+((employeeRecords||[]).find(r=>r.name===caseInfo.employee)?.jobTitle)+")":" "}. Date: ${caseInfo.date||"today"}. Chair: ${caseInfo.manager||"Unknown"}${caseInfo.chairJobTitle?" ("+caseInfo.chairJobTitle+")":(orgMembers||[]).find(m=>m.name===caseInfo.manager)?.job_title?" ("+((orgMembers||[]).find(m=>m.name===caseInfo.manager)?.job_title)+")":" "}. Start time: ${fmtMeetingTime(meetingStartTime)||"Unknown"}. End time: ${fmtMeetingTime(meetingEndTime||meetingEndTimeVal)||"Unknown"}${adjournments.length>0?" Adjournments: "+adjournments.map(a=>a.start+(a.end?" to "+a.end:"- ongoing")+(a.reason?" ("+a.reason+")":"")).join(", "):""}. Notetaker: ${caseInfo.notetaker||"Not specified"}. Representative/companion: ${caseInfo.representative?caseInfo.representative+" ("+(caseInfo.representativeRole||"colleague")+")":"N/A"}. Other participants: ${participants.map(p=>p.name+" ("+p.role+")").join(", ")||"none listed"}${getPolicyCtx()}\n\nTRANSCRIPT:\n${tx}\n\nPlease produce the following sections:\n\n## Meeting Details\nInclude these fields on separate lines:\n- Type: [meeting type]\n- Date: [date]\n- Start time: [start time]\n- End time: [end time]${adjournments.length>0?"\n- Adjournments: [list each adjournment with times and reason]":""}\n- Chair: [chair name and job title]\n- Notetaker: [notetaker name or "Not specified"]\n- Employee: [employee name and job title]\n- Representative/companion: [name and role, or "N/A"]\n- Other participants: [any others or "None"]\n- Purpose: [write 1-2 sentences on the same line explaining why this meeting was held]\n\n## Meeting Dialogue\nRewrite as a clean readable conversation. Each line must start with the speaker\'s INITIALS followed by a colon (e.g. if chair is "${caseInfo.manager||"HR Manager"}" use initials "${(caseInfo.manager||"HR Manager").split(" ").map(w=>w[0]).join("")}:" and if employee is "${caseInfo.employee||"Employee"}" use initials "${(caseInfo.employee||"Employee").split(" ").map(w=>w[0]).join("")}:"). Fix any typos. One line per utterance.\n\n## Key Points\n## Employee Position\n## Management Position\n## Procedural Checks\n## Actions & Next Steps`,
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
  // Phase 6.5 hardening (closes Prompt 11 audit finding 5.9b, MEDIUM) —
  // this was the one remaining AI prompt site with no safety constraint
  // at all: no ban on recommending a specific sanction/outcome (every
  // comparable prompt in this file has one — see runRiskScore just
  // above, the next-step and case-comparison prompts), and its own
  // "## Comparable Cases" heading actively invited the model to name
  // real tribunal decisions it has no way to verify — a fabricated
  // citation presented as real case law is a serious professional risk
  // in this exact domain, the same class of issue this app's own letter
  // system prompt already guards against for invented deadlines.
  const runPrediction = async () => {
    setPredProcessing(true);
    try {
      const tx = reviewOutput || transcript.slice(-40).map(u=>u.text).join("\n");
      await streamClaude(
        `UK employment tribunal outcome predictor. Analyse based on ERA 1996, ACAS Code, case law. Be honest about risks. You must NEVER recommend a specific sanction, disciplinary outcome, or final decision — describe risks and vulnerabilities only; the decision is HR's alone. Never cite a specific named tribunal case, decision, or legal citation — you cannot verify these are real. Discuss precedent in general terms only (e.g. "tribunals have historically scrutinised..."), never naming a specific case. ## headers.`,
        `Meeting: ${meetingType?.label}\nEmployee: ${caseInfo.employee}\nRecord:\n${reviewOutput||tx}\n\n## Likely Outcome if Challenged at Tribunal\n## Key Vulnerabilities\n## Strongest Arguments for Employer\n## Recommended Actions to Strengthen Position\n## How Tribunals Have Approached Similar Situations`,
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
      id: newId("meeting"),
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
    // Phase 6.5 hardening (closes independent audit finding 5.7, sibling
    // instance) — same fix as saveMeetingToCase just below: disambiguate
    // among same-named-employee matches via activeCaseId where possible,
    // never override the name check itself.
    const devNameMatches = cases.filter(c=>c.employeeName.toLowerCase()===employeeName.toLowerCase());
    if(devNameMatches.length>1) console.error(`saveDevMeetingToCase: "${employeeName}" matches ${devNameMatches.length} cases — resolving via activeCaseId where possible, otherwise the first match`);
    const existing = (activeCaseId && devNameMatches.find(c=>c.id===activeCaseId)) || devNameMatches[0];
    const devCaseId = existing ? existing.id : crypto.randomUUID();
    if(existing) {
      saveCases(cases.map(c=>c.id===existing.id?{...c,meetings:[...c.meetings,meeting]}:c));
    } else {
      saveCases([...cases,{id:devCaseId, employeeName, email:s.caseInfo.email||"", createdAt:new Date().toISOString(), meetings:[meeting]}]);
    }
    audit("Development meeting saved", `${employeeName} — ${s.type}`, devCaseId);
    showToast("Meeting saved to case file");
    if(devLetter && org?.id) {
      authedFetch("/api/portal/notify-document", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ orgId: org.id, orgName: org.name, employeeName, documentType: s.type }),
      }).catch(e=>console.error("Portal notify failed:", e));
    }
  };

  // ── Save to case ──
  // Phase 6.5 hardening (structural remediation, Prompt 12 — Signature
  // Identity invariant) — signId/signStatus used to be read from
  // component-level React state at the moment this function ran, not
  // passed as parameters. That state updates asynchronously (a schedule,
  // not an immediate apply), so sendForSignature below was calling this
  // function in the SAME closure as its own state update, before React
  // had committed it — persisting signId:null onto
  // the very meeting it just sent for signature (permanently orphaned:
  // the sync poll never picks it up since it filters on m.signId). Worse,
  // because the state persisted across renders, saving a LATER, unrelated
  // meeting — via any path, including "Save to case", which never
  // touches signatures at all — could silently inherit whatever signId
  // was still sitting in state from an earlier, different meeting's send,
  // stamping one employee's signature onto another employee's record.
  // signatureInfo is now the sole source of truth: every call site must
  // say explicitly whether this save is attached to a signature request,
  // and if so, which one — there is no ambient fallback.
  const savingMeetingRef = useRef(false);
  const saveMeetingToCase = (signatureInfo = {}) => {
    // Phase 6.5 hardening (closes independent audit finding 3.7) — the
    // button that calls this ("Save and go to case →", ReviewScreen.jsx/
    // LetterScreen.jsx) had no disabled/in-flight guard at all — a
    // double-click ~250ms apart, while the previous render is still
    // catching up (several AI calls are fired-and-forgotten below before
    // navigation), fired this function twice, each appending its own
    // meeting record to the case — two byte-identical disciplinary
    // hearing records, both independently offered for signature and
    // both appearing in the hearing pack. A plain ref (not state)
    // guards this synchronously, closing the race regardless of
    // whether React has re-rendered a disabled button in time — this
    // function runs fully synchronously end to end, so a ref checked at
    // entry and cleared in a finally block is both necessary (state
    // alone could still race) and sufficient (no need to also thread a
    // disabled prop through both call sites for the same guarantee).
    if(savingMeetingRef.current) return;
    savingMeetingRef.current = true;
    try {
      saveMeetingToCaseImpl(signatureInfo);
    } finally {
      savingMeetingRef.current = false;
    }
  };
  const saveMeetingToCaseImpl = (signatureInfo = {}) => {
    const { signId: attachedSignId = null, signStatus: attachedSignStatus = null } = signatureInfo;
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
      id: newId("meeting"),
      type: meetingType?.label||"Meeting",
      date: caseInfo.date||new Date().toLocaleDateString("en-GB"),
      // Human UAT remediation, Batch 2, Part 4 — until now the actual
      // start/end instant only ever lived in ephemeral session state and
      // whatever the AI happened to transcribe into reviewOutput's free-
      // text "## Meeting Details" section; this is its first real,
      // structured, queryable home on the saved record. Distinct from
      // `date` above (the case's scheduled date, caseInfo.date) and from
      // `savedAt` below (when this record was saved, not when the
      // meeting itself began or ended).
      startedAt: meetingStartTime || null,
      endedAt: meetingEndTime || null,
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
      // Human UAT remediation, Batch 2 hardening — letterOutput alone never
      // recorded which letter category produced it (outcome vs invite vs
      // appeal vs suspension), only the free text. Every consumer that
      // inferred "an outcome exists" from "some meeting has a letterOutput"
      // (caseStage.js, nextStep.js, getCaseStatus, deadlines.js,
      // processTimeline.js) was therefore equally fooled by a disciplinary/
      // appeal hearing INVITATION saved via this same function — drafting
      // and saving an invitation could make the case read as though an
      // outcome had already been issued. activeLetter is the same type
      // identity already sent to /api/send-letter as letterType when a
      // letter is actually sent (Part 11) — this is its first time being
      // captured at save time too, so every consumer downstream can check
      // the letter's real type instead of guessing from its mere presence.
      letterType: letterOutput ? activeLetter : null,
      letterApprovedBy: letterIsApproved ? letterApproval.by : null,
      letterApprovedAt: letterIsApproved ? letterApproval.at : null,
      riskScore,
      nextSteps,
      prediction,
      letterTracking: {},
      savedAt: new Date().toISOString(),
      savedBy: currentUser?.name || "HR Manager",
      signId: attachedSignId,
      signStatus: attachedSignStatus,
      // IP18, §12 — anything still "pending" (never individually
      // accepted or dismissed live) gets one more chance from the
      // Meetings tab instead of silently vanishing with this session's
      // meetingEvidenceSuggestions/meetingActionSuggestions state.
      unresolvedSuggestions: snapshotUnresolvedSuggestions(meetingEvidenceSuggestions, meetingActionSuggestions),
      // IP20 — formalises what caseInfo.manager above already stamped
      // onto every meeting incidentally: a full point-in-time snapshot of
      // the employee's job title/site/department/manager/status/working
      // pattern AS IT STOOD when this meeting was saved, captured once
      // and never updated afterward — so this meeting keeps showing who
      // was actually in post at the time, even after employee_records
      // (or a future real HRIS sync) later changes.
      employeeSnapshot: buildEmployeeSnapshot(getEmployeeRecord(caseInfo.employee)),
    };
    // Phase 6.5 hardening (closes independent audit finding 5.7) — was a
    // bare cases.find(nameMatch), first-array-hit-wins: an employee with
    // more than one case (an ordinary combination — a closed prior
    // misconduct case and a separately-raised open grievance, or two
    // employees who simply share a name) had this meeting filed onto
    // whichever case happened to sort first, silently. activeCaseId is
    // the app's own general "which case is the user currently in"
    // tracker (set whenever a meeting is started from within a specific
    // case's own view, e.g. "Start investigation meeting") — used here
    // only to disambiguate AMONG the name matches, never to override the
    // name check itself, so a stale activeCaseId from an unrelated,
    // previously-viewed case can never misfile a meeting onto the wrong
    // employee's record; it can only correctly pick among that one
    // employee's own several cases.
    const nameMatches = cases.filter(c=>c.employeeName.toLowerCase()===caseInfo.employee.toLowerCase());
    if(nameMatches.length>1) console.error(`saveMeetingToCase: "${caseInfo.employee}" matches ${nameMatches.length} cases — resolving via activeCaseId where possible, otherwise the first match`);
    const existing = (activeCaseId && nameMatches.find(c=>c.id===activeCaseId)) || nameMatches[0];
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
    audit("Meeting saved", `${caseInfo.employee} — ${meetingType?.label}`, caseId);
    // Human UAT remediation, Batch 1, Issue 4 — distinct from the generic
    // "Meeting saved" above (which fires for every save, signature-bound
    // or not): a dedicated Timeline/audit entry specifically for "this
    // meeting's notes were sent for signature," using the same freshly-
    // resolved caseId (correct for a brand-new case too, unlike
    // activeCaseId at the sendForSignature call site, which may not be
    // set yet for a case being created by this very save).
    if(attachedSignStatus==="sent") audit(`${meetingType?.label||"Meeting"} notes sent for signature`, caseInfo.employee, caseId);
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

  // Human UAT remediation, Batch 2 hardening (Part 5/6 follow-up) — the
  // core layout generatePDF already used for letters, extracted so a
  // second document type (the meeting record itself, for genuine email
  // attachments below) can reuse the exact same jsPDF layout rather than
  // a second, duplicate PDF-building implementation. generatePDF is now
  // a thin wrapper over this with its own existing letterOutput/
  // meetingType/caseInfo/letterhead closure — no behaviour change for
  // its two existing callers (doSend's Download/Gmail/Outlook paths).
  const buildDocumentPDF = async ({ heading, content, employee, date, chair, sig, letterheadImg }) => {
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({unit:"mm",format:"a4"});
    const M=20, W=doc.internal.pageSize.getWidth(), maxW=W-M*2;
    let y=15;
    if(letterheadImg) {
      try { const p=doc.getImageProperties(letterheadImg); const iW=maxW; const iH=Math.min((p.height*iW)/p.width,45); doc.addImage(letterheadImg,p.fileType||"PNG",M,8,iW,iH); y=iH+14; doc.setDrawColor(124,92,252); doc.setLineWidth(0.3); doc.line(M,y,W-M,y); y+=8; } catch(e){}
    }
    doc.setFontSize(9); doc.setTextColor(150); doc.text("PRIVATE & CONFIDENTIAL",M,y); y+=9;
    doc.setFontSize(17); doc.setTextColor(30); doc.setFont("helvetica","bold"); doc.text(heading,M,y); y+=8;
    doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(80); doc.text(`Employee: ${employee||"—"} | Date: ${date||"—"} | Chair: ${chair||"—"}`,M,y); y+=7;
    doc.setDrawColor(124,92,252); doc.setLineWidth(0.5); doc.line(M,y,W-M,y); y+=8;
    const clean = (content||"").replace(/^## (.+)$/gm,"\n$1\n").replace(/^# (.+)$/gm,"\n$1\n").replace(/\*\*(.+?)\*\*/g,"$1").replace(/^[-*] /gm,"  - ");
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
      doc.text(`${chair||"HR Manager"} | ${new Date().toLocaleDateString("en-GB")}`,M,y+2);
    }
    doc.setFontSize(8); doc.setTextColor(150); doc.text("Generated by Compass HR | Private & Confidential",M,287);
    return doc;
  };

  const generatePDF = async sig => buildDocumentPDF({
    heading: `${meetingType?.label} — Letter`,
    content: letterOutput,
    employee: caseInfo.employee, date: caseInfo.date, chair: caseInfo.manager,
    sig, letterheadImg: letterhead,
  });

  // Human UAT remediation, Batch 2 hardening — "Share meeting record"
  // used to send the full record inline in the email body because no
  // attachment was believed possible. That was wrong: this flow goes
  // through Compass's own backend (api/send-letter.js) straight to
  // Resend, not a Gmail/Outlook web-compose link (doSend, above) — the
  // one path in this app that genuinely can't carry a file attachment
  // (no browser API to attach a file to a mailto:/web-compose URL).
  // Resend's own attachments field already exists and is already used
  // for evidence attachments on invitation letters (Part 11) — this
  // reuses that same mechanism for the record itself.
  const generateMeetingRecordPDF = async () => buildDocumentPDF({
    heading: `${meetingType?.label||"Meeting"} — Record`,
    content: reviewOutput,
    employee: caseInfo.employee, date: fmtDate(caseInfo.date), chair: caseInfo.manager,
  });

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
    // Human UAT remediation, Batch 2, Part 6 — this opened with "Please
    // find the letter attached" while the very next line explained the
    // PDF was NOT attached and had to be attached manually — a Gmail/
    // Outlook web compose link genuinely can't carry a file attachment
    // (no browser API for it), so the false claim was never true here.
    // Leads with the real instruction instead of a contradicted one.
    const bodyText = `The ${meetingType?.label} letter has been downloaded to your device as "${fileName}". Please attach it to this email before sending.\n\nEmployee: ${caseInfo.employee||""}\nDate: ${fmtDate(caseInfo.date)}\n\nGenerated by Compass HR.`;

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
  const handleLetterheadUpload = e => { const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setLetterhead(ev.target.result);orgLsSet("compass_letterhead",ev.target.result);};r.readAsDataURL(f); };
  const handleWordTemplateUpload = e => { const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const o={name:f.name,base64:ev.target.result};setWordTemplate(o);orgLsSet("compass_word_template",o);};r.readAsDataURL(f); };
  const handleSaveSignature = sig => { setSignature(sig); setShowSigPad(false); orgLsSet("compass_signature",sig); if(pendingSend){const a=pendingSend;setPendingSend(null);setTimeout(()=>doSend(a,sig),100);} };
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
        const pol={id:newId("policy"),name,fileName:file.name,content:content.slice(0,8000),addedAt:new Date().toISOString(),size:Math.round(content.length/1000)+"k",category:"other",clauses};
        setPolicies(p=>{const u=[...p,pol];orgLsSet("compass_policies",u);return u;});
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

  // Integrations & Workflow Automation (Phase 5, IP8, §27) — same jsPDF
  // pagination pattern as generatePDF/exportPDF above, driven by
  // buildHearingPackSections' pure aggregation (lib/hearingPack.js)
  // rather than a third parallel PDF-building implementation of what
  // sections to include.
  const generateHearingPackPDF = async (cs) => {
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({unit:"mm",format:"a4"});
    const M=20, W=doc.internal.pageSize.getWidth(), maxW=W-M*2;
    let y=15;
    const sections = buildHearingPackSections(cs, {allegations, policies, auditLog});

    const ensureRoom = (needed=6) => { if(y>287-needed){doc.addPage();y=20;} };
    const heading = (text) => { ensureRoom(14); doc.setFontSize(13); doc.setFont("helvetica","bold"); doc.setTextColor(60,40,160); doc.text(text,M,y); y+=7; doc.setDrawColor(220,215,200); doc.setLineWidth(0.2); doc.line(M,y-3,W-M,y-3); y+=2; };
    const label = (text) => { ensureRoom(); doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(80); doc.text(text,M,y); y+=5.5; };
    const body = (text) => { doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(40); doc.splitTextToSize(String(text||""),maxW).forEach(line=>{ ensureRoom(); doc.text(line,M,y); y+=5.5; }); };

    doc.setFontSize(9); doc.setTextColor(150); doc.text("PRIVATE & CONFIDENTIAL",M,y); y+=9;
    doc.setFontSize(18); doc.setFont("helvetica","bold"); doc.setTextColor(30); doc.text("Hearing Pack",M,y); y+=9;
    doc.setFontSize(11); doc.setFont("helvetica","normal"); doc.setTextColor(80);
    doc.text(`Employee: ${sections.caseSummary.employeeName||"—"}  |  Case type: ${sections.caseSummary.caseType}`,M,y); y+=10;

    heading("1. Allegations");
    if(!sections.allegations.length) body("No allegations recorded.");
    sections.allegations.forEach((a,i)=>{
      label(`${i+1}. ${a.title}`);
      if(a.description) body(a.description);
      if(a.employeeResponse) body("Employee response: "+a.employeeResponse);
      if(a.witnessEvidence) body("Witness evidence: "+a.witnessEvidence);
      if(a.evidence.length) body("Linked evidence: "+a.evidence.map(e=>e.name).join(", "));
      y+=3;
    });

    if(sections.investigationReport) {
      heading("2. Investigation Report");
      body(sections.investigationReport.text);
    }

    heading((sections.investigationReport?"3":"2")+". Meeting Records");
    if(!sections.meetings.length) body("No meetings recorded.");
    sections.meetings.forEach(m=>{
      label(`${m.type} — ${m.date||"no date"} (${m.signStatus?signatureStatusLabel(m.signStatus):"not sent"})`);
      if(m.record) body(m.record.slice(0,1500));
      y+=3;
    });

    if(sections.correspondence.length) {
      heading("Correspondence");
      sections.correspondence.forEach(c=>{
        label(`${c.meetingType} — ${c.date||"no date"}`);
        body(c.text.slice(0,1500));
        y+=3;
      });
    }

    heading("Evidence");
    if(!sections.evidence.length) body("No evidence recorded.");
    sections.evidence.forEach(e=>body(`${e.name} (${e.type||"—"}, ${e.date||"—"})${e.addedBy?" — added by "+e.addedBy:""}`));

    if(sections.policies.length) {
      heading("Relevant Policies");
      sections.policies.forEach(p=>{
        label(p.name);
        p.clauses.forEach(c=>body(`${c.heading}: ${c.text}`));
      });
    }

    heading("Chronology");
    if(sections.auditHistoryMayBeIncomplete) body("Note: this case was opened before Compass reliably linked every activity record to its case — some historic entries from that period may not appear below.");
    if(!sections.chronology.length) body("No chronology entries.");
    sections.chronology.forEach(t=>body(`${t.date?new Date(t.date).toLocaleDateString("en-GB"):"—"} — ${t.description}`));

    const pageCount = doc.internal.getNumberOfPages();
    for(let p=1;p<=pageCount;p++){ doc.setPage(p); doc.setFontSize(8); doc.setTextColor(150); doc.text(`Generated by Compass HR | Private & Confidential | Page ${p} of ${pageCount}`,M,293); }

    return doc;
  };

  // Human UAT remediation, Batch 2, Part 2 — generating a hearing pack
  // used to only ever trigger a browser download, with nothing recorded
  // on the case: closing the downloads panel (or coming back days later)
  // left no way to find that exact pack again short of regenerating it
  // against whatever the case looks like today. Now also saved as a real
  // evidence item (buildHearingPackEvidenceItem, lib/hearingPack.js) —
  // the same pattern sendLetterCoordinated already uses for generated
  // correspondence — so it shows up with its own Download entry in the
  // Documents tab (lib/caseDocuments.js) and its own Timeline entry
  // (lib/caseTimeline.js), not just a toast that's gone in a few seconds.
  const [hearingPackGenerating, setHearingPackGenerating] = useState({});
  // Human UAT remediation, Batch 2 hardening — the original UAT complaint
  // was specifically that a generated Building/Hearing Pack "should pop up
  // when generated rather than just appearing below which is not
  // obvious". Persisting it to Documents/Timeline (above) fixed
  // findability later, but the toast alone (auto-dismisses in a few
  // seconds, no action on it) didn't fix the immediate moment of
  // completion. This tracks a per-case "ready to review" banner —
  // cleared at the start of every new generation so a stale banner from a
  // previous pack can never linger once a fresh one is being built —
  // rendered inline in DocumentsTab right where the user already is, with
  // a Review action that opens the pack in a new tab (window.open on its
  // dataUrl, the same "open the original document" pattern
  // AllegationsPanel's openEvidence already uses) rather than navigating
  // the user away from the case.
  const [hearingPackReady, setHearingPackReady] = useState({});
  const handleGenerateHearingPack = async (cs) => {
    setHearingPackGenerating(g=>({...g, [cs.id]:true}));
    setHearingPackReady(r=>({...r, [cs.id]:null}));
    try {
      const doc = await generateHearingPackPDF(cs);
      const dataUrl = doc.output("datauristring");
      doc.save(`${(cs.employeeName||"Case").replace(/\s+/g,"_")}_Hearing_Pack.pdf`);
      const item = buildHearingPackEvidenceItem({
        dataUrl,
        size: doc.output("blob").size,
        addedBy: currentUser?.name || "HR Manager",
      });
      saveCases(cases.map(x=>x.id===cs.id?{...x, evidence:[...(x.evidence||[]), item]}:x), cs.id);
      audit("Hearing pack generated", item.name, cs.id);
      showToast("Hearing pack downloaded — also saved to this case's Documents");
      setHearingPackReady(r=>({...r, [cs.id]:{dataUrl, fileName:item.name}}));
    } catch(e) { console.error("generateHearingPackPDF failed:", e); showToast("Couldn't generate the hearing pack — "+e.message, "error"); }
    setHearingPackGenerating(g=>({...g, [cs.id]:false}));
  };

  // Integrations & Workflow Automation (Phase 5, IP12, §6) — the same
  // minimal caseInfo seed the existing "Start appeal and send invitation"
  // button already uses (CaseViewScreen.jsx) before calling handleLetter
  // directly (not {inline:true} — these types aren't tied to a specific
  // nextStep stage transition, so they navigate straight to the full
  // Letter editor like most other types already do).
  const startCaseCorrespondence = (cs, type) => {
    setCaseInfo(p=>({...p, employee:cs.employeeName, manager:cs.manager||""}));
    handleLetter(type);
  };

  // Integrations & Workflow Automation (Phase 5, IP13, §7) — the actual
  // send (api/send-letter.js, Resend) is unchanged; what's new is
  // everything after a successful send that never happened automatically
  // before: Save Sent Copy (a real, analysable evidence item — see
  // lib/letterSend.js), Add Timeline Event (that item's own dedicated
  // entry, lib/caseTimeline.js), Update Task (only when an open task's
  // name is an exact match for this letter type's product-surfaced
  // label — never a guess), Record Audit Event (audit(), which every
  // other case-mutating action in this app already goes through).
  // Silently skips the case-scoped steps when there's no real linked
  // case (e.g. sending from a case-less meeting session) — the send
  // itself still succeeds either way.
  // Human UAT remediation, Batch 2, Part 11 — evidenceItems (optional,
  // only ever populated for a disciplinary/appeal invitation) are the
  // case's own existing cs.evidence entries HR explicitly chose in the
  // Email letter modal, never a second evidence store. Forwarded as
  // real Resend attachments, not just described in the letter text — a
  // hearing invitation that says evidence is attached must actually
  // carry it (see Part 6's send-letter.js fix for the same principle).
  const sendLetterCoordinated = async (to, evidenceItems = []) => {
    // IP14, §8 — the subject actually sent must match what
    // matchReplyToSentLetters later checks a reply's subject against;
    // see buildLetterSubject's own comment on the bug this fixes (every
    // type used to go out labelled "Outcome Letter").
    const subject = buildLetterSubject({ type: activeLetter, meetingType: meetingType?.label, employeeName: caseInfo.employee });
    const attachments = evidenceItems.filter(e=>e.dataUrl).map(e=>({ filename: e.name||"evidence", content: e.dataUrl.split(",")[1]||"" }));
    const r = await authedFetch("/api/send-letter",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        to,
        subject,
        body: letterOutput,
        orgId: org?.id,
        caseId: activeCaseId,
        letterType: activeLetter,
        employeeName: caseInfo.employee||"Employee",
        meetingType: meetingType?.label||"Meeting",
        managerName: caseInfo.manager||"HR Manager",
        date: (caseInfo.date&&/^\d{4}-\d{2}-\d{2}$/.test(caseInfo.date)?caseInfo.date.split("-").reverse().join("/"):caseInfo.date)||new Date().toLocaleDateString("en-GB"),
        attachments,
        attachmentNames: evidenceItems.filter(e=>e.dataUrl).map(e=>e.name),
      })});
    const d = await r.json();
    if(!d.success) { showToast("Failed: "+d.error, "error"); return false; }

    const activeCase = cases.find(x=>x.id===activeCaseId);
    if(activeCase) {
      const sentItem = buildSentLetterEvidenceItem({ type: activeLetter, subject, recipient: to, body: letterOutput, addedBy: currentUser?.name||"HR Manager" });
      saveCases(cases.map(x=>x.id===activeCaseId?{...x, evidence:[...(x.evidence||[]), sentItem]}:x), activeCaseId);
      audit("Letter sent", sentItem.name, activeCaseId);
      const matchingTask = findTaskToCompleteForSentLetter(caseTasks, activeCaseId, activeLetter);
      if(matchingTask) toggleCaseTaskDone(matchingTask.id);
      // Phase 6.5 hardening (closes independent audit finding 5.4) —
      // APPROVAL_ACTIONS (lib/approvals.js) declares "suspension" as
      // sign-off-required, but approvalActionForOutcome only ever maps
      // outcome-letter types (final written warning, dismissal) — the
      // real trigger point for suspension is here, sending the
      // Suspension letter (LetterScreen's own "suspension" tab), the
      // single most consequential unilateral pre-dismissal act in UK ER
      // process. Matches OutcomeModal.jsx's own requestHrReview call
      // shape for the outcome-letter approval actions.
      if(activeLetter==="suspension") requestHrReview("suspension", activeCaseId, null, subject, false);
    }

    showToast("Letter sent to "+to+(attachments.length?` with ${attachments.length} evidence ${attachments.length===1?"attachment":"attachments"}`:""));
    return true;
  };

  // Integrations & Workflow Automation (Phase 5, IP27, §21) — an
  // alternative to sendLetterCoordinated above: instead of a plain email
  // (Resend, no receipt), this sends the outcome letter through the
  // signing_requests lifecycle so HR can see whether the employee has
  // actually opened and acknowledged it. requiresSignature:false — an
  // outcome letter needs acknowledgement of receipt, not a drawn
  // signature. Same case-side bookkeeping as sendLetterCoordinated (sent
  // copy saved to evidence, audit event, matching task completed), since
  // from the case's own record the letter has equally been sent either way.
  const sendLetterForAcknowledgement = async (to) => {
    const subject = buildLetterSubject({ type: activeLetter, meetingType: meetingType?.label, employeeName: caseInfo.employee });
    const { success, signId } = await sendDocumentForSignature({
      document: letterOutput, employeeEmail: to,
      employeeName: caseInfo.employee||"Employee",
      managerName: caseInfo.manager||"HR Manager",
      documentType: "outcome_letter",
      documentLabel: subject,
      // Human UAT remediation, Batch 2, Part 7 — caseInfo.date defaults
      // to a raw ISO string (new Date().toISOString().split("T")[0]),
      // which used to reach the signature/acknowledgement email
      // unformatted (api/send-for-signature.js interpolates
      // meetingDate directly) — an employee could receive "is ready for
      // your signature on 2026-08-31" instead of a UK date.
      documentDate: fmtDate(caseInfo.date)||new Date().toLocaleDateString("en-GB"),
      requiresSignature: false,
      caseId: activeCaseId,
      letterType: activeLetter,
    });
    if(!success) return false;

    const activeCase = cases.find(x=>x.id===activeCaseId);
    if(activeCase) {
      const sentItem = buildSentLetterEvidenceItem({ type: activeLetter, subject, recipient: to, body: letterOutput, addedBy: currentUser?.name||"HR Manager", signId });
      saveCases(cases.map(x=>x.id===activeCaseId?{...x, evidence:[...(x.evidence||[]), sentItem]}:x), activeCaseId);
      audit("Letter sent for acknowledgement", sentItem.name, activeCaseId);
      const matchingTask = findTaskToCompleteForSentLetter(caseTasks, activeCaseId, activeLetter);
      if(matchingTask) toggleCaseTaskDone(matchingTask.id);
      // Phase 6.5 hardening (closes independent audit finding 5.4) — see
      // sendLetterCoordinated's own comment; a suspension letter can be
      // sent via either path, both need the same trigger.
      if(activeLetter==="suspension") requestHrReview("suspension", activeCaseId, null, subject, false);
    }
    return true;
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
        "invite": "a formal invitation letter to a "+(meetingType?.label||"meeting")+". Include: reason for the meeting, proposed date/time/location placeholders, list of allegations or agenda items (infer from context if available), right to be accompanied by a colleague or trade union rep under ERA 1999 s.10, and how to respond. If the letter states a specific deadline (e.g. to confirm attendance or submit evidence), use a placeholder such as [X working days] rather than a specific number — ACAS does not mandate a fixed notice period for this letter type, so any specific day-count you're not given below would be invented, not real guidance. Follow ACAS Code of Practice.",
        "outcome": "a formal outcome letter following a "+(meetingType?.label||"disciplinary hearing")+". Include: summary of what was discussed; the decision reached for each allegation and the reasons for it, grounded in the specific findings and decision reasoning below where available (not a generic restatement); any mitigation the employee put forward and how it was weighed in reaching the decision; any sanction imposed (e.g. [First Written Warning]) and its duration (e.g. [12 months], matching the uploaded policy's own stated duration where one is referenced below); where a sanction is imposed, the specific improvement required of the employee going forward; the consequences of further misconduct during the sanction's currency (e.g. escalation to the next stage of the disciplinary procedure, up to and including dismissal); and the right of appeal within 5 working days. Follow ACAS Code of Practice.",
        "appeal": "a formal appeal outcome letter. Include: grounds of appeal considered, outcome of the appeal, reasons, whether original decision is upheld or overturned, confirmation this is the final stage. Follow ACAS Code of Practice.",
        "investigation-report": "a formal investigation report. Include: background and reason for investigation, allegations investigated, investigation process and evidence reviewed (infer from meeting record), findings for each allegation (upheld/not upheld), overall recommendation (case to answer/no case to answer). This is an internal HR document, not a letter to the employee. Write in formal report style with clear sections.","no-case-answer": "a formal letter to the employee confirming no case to answer. Include: that an investigation has been completed, that no further action will be taken, that the matter is now closed, and that the record will be kept confidential. Warm but professional tone.","grievance": "a formal grievance outcome letter. Include: summary of grievance raised, investigation findings, outcome and reasons, right of appeal. Follow ACAS Code of Practice.",
        "warning": "a formal written warning letter. Include: nature of misconduct, previous warnings if any, expected improvement, review period, consequence of further misconduct, right of appeal. Follow ACAS Code of Practice.",
        "dismissal": "a formal dismissal letter. Include: reason for dismissal, date employment ends, notice period or payment in lieu, final pay arrangements, right of appeal within 5 working days. Follow ERA 1996 and ACAS Code of Practice.",
        "suspension": "a formal suspension letter. Include: that suspension is a neutral act and not a disciplinary sanction or presumption of guilt, the reason an investigation is required, that suspension is normally on full pay, restrictions during suspension (e.g. contacting colleagues, attending the workplace), a named contact during the suspension period, and that the situation will be kept under review. Follow ACAS Code of Practice.",
        "meeting-confirmation": "a formal letter confirming the details of an upcoming meeting already arranged with the employee. Include: confirmed date, time and location (or video call details), meeting type/purpose, who else will attend, right to be accompanied by a colleague or trade union rep under ERA 1999 s.10, and what to bring or prepare. Shorter and less formal in tone than an invitation letter, since the meeting has already been agreed — this simply confirms the arrangements in writing.",
        // Integrations & Workflow Automation (Phase 5, IP12, §6) — three
        // new draft types, populated from the exact same case/employee/
        // evidence/policy context every other letter type already reads
        // above (no new grounding logic needed) and subject to the same
        // "use [placeholder] for anything unknown, never invent" system
        // prompt rule every other type already follows.
        "witness-invitation": "a letter inviting a named individual to attend a meeting as a witness in an ongoing workplace investigation. Include: that they are being asked to provide information as a witness, not as someone facing any allegation themselves; the general subject matter framed neutrally (never naming a specific allegation against the subject employee unless it's already necessary context); proposed date/time/location placeholders; an explanation that their account will be treated confidentially so far as possible; and that their attendance is appreciated. Follow ACAS Code of Practice principles on witness involvement in investigations.",
        "evidence-request": "a letter or message requesting a specific piece of evidence or information relevant to an ongoing case, from an employee, manager, or third party. Include: what is being requested and why, framed neutrally and without presuming any conclusion; a reasonable deadline for response (e.g. [5 working days]); how the information will be used and kept confidential; and a named contact for questions.",
        "oh-consent-request": "a letter requesting the employee's informed consent to a referral to Occupational Health (OH). Include: the reason a referral is being considered, framed supportively as part of the organisation's duty to support the employee's health and wellbeing, not as a disciplinary step; what OH involvement means in practice (an independent medical assessment, generally not treatment); that explicit consent is required before the referral proceeds and before any resulting report is obtained, per the Access to Medical Reports Act 1988 and UK GDPR principles; what will happen with the resulting report (who sees it, and that the employee has the right to see it first and request corrections before it's shared); and clear instructions for how to give or withhold consent. Warm, supportive tone throughout — this is a wellbeing-oriented letter, not a warning.",
      };

      const instruction = letterInstructions[t] || letterInstructions["outcome"];

      const systemPrompt = "You are a senior UK employment lawyer and HR advisor with 20 years of experience. Draft complete, professional HR correspondence that is legally sound and follows ACAS Code of Practice and relevant UK employment legislation. Always produce a complete letter — never refuse or ask for more information. Where specific details are unknown, use clear placeholders in square brackets such as [Employee Address], [Date of Hearing], [Appeal Officer Name and Job Title], [Company Name], [X working days]. This includes any specific deadline or number of days you state that isn't a fixed statutory/ACAS figure explicitly given in this instruction or in the case information below — never invent a plausible-sounding day-count and present it as if it were a real requirement. The letter should read naturally and professionally. Output only the letter itself with no preamble, explanation or sign-off instructions."+(policies.length?" Reference company policies by name where relevant — e.g. match sanction lengths, appeal windows or procedural steps to what the uploaded policy actually specifies rather than a generic default.":"");

      const userPrompt = "Draft "+instruction+nl+nl+"Available information:"+nl+context+nl+nl+"Important: Use [placeholder] format for any missing details. Today's date for reference: "+new Date().toLocaleDateString("en-GB")+". Always complete the full letter.";

      const res = await authedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:3000,stream:false,
          system:systemPrompt,
          messages:[{role:"user",content:userPrompt}]
        })});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      if(text) {
        setLetterOutput(text); setLetterSources(letterSources);
        // UAT Product Hierarchy pass, Part 6 — generation can genuinely
        // outlive the user staying on this screen (this function isn't
        // tied to LetterScreen's mount lifecycle), so completion has to be
        // announced through the app-level toast, not just by the draft
        // quietly appearing on a screen the user may have left.
        const letterTypeLabels = {outcome:"outcome letter",invite:"invitation letter",appeal:"appeal outcome letter",suspension:"suspension letter",["meeting-confirmation"]:"meeting confirmation letter",["witness-invitation"]:"witness invitation",["evidence-request"]:"evidence request",["oh-consent-request"]:"OH consent request",["no-case-answer"]:"response letter"};
        showToast(`Your ${letterTypeLabels[t]||"letter"} is ready for review`, "success");
        // Human UAT remediation, Batch 2, Part 14 — the toast above is
        // exactly the "genuinely outlive the user staying on this screen"
        // case this whole function's own comment already names, but a
        // toast auto-dismisses in a few seconds; someone who actually took
        // the invitation to "switch tabs or navigate elsewhere" could miss
        // it entirely with no other record it ever finished. Reuses the
        // existing Activity/audit substrate rather than a second,
        // bespoke notification mechanism — excluded from the case Timeline
        // itself (lib/caseTimeline.js) since a draft can be regenerated
        // many times before being sent, and that already has its own
        // "Letter drafted" entry sourced from the saved meeting record.
        if(activeCaseId) audit("Letter drafted", letterTypeLabels[t]||"letter", activeCaseId);
      }
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
    // Human UAT remediation, Batch 2 hardening — the trigger buttons
    // (MeetingsTab's "Conclude investigation & generate report", the
    // next-step banner) already disable themselves while
    // concludingInvestigation is true, but that's a UI-only guard; this
    // makes the function itself refuse to start a second, concurrent
    // generation regardless of what called it, so two overlapping streams
    // can never race to save two different reports onto the same case.
    if(concludingInvestigation) return;
    const cs = cases.find(x=>x.id===caseId);
    if(!cs) return;
    const invMeetings = (cs.meetings||[]).filter(m=>(m.type||"").toLowerCase().includes("investigation")&&m.record);
    if(!invMeetings.length) return;
    setConcludingInvestigation(true);
    setInvestigationReportDraft("");
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
      // Phase 6.5 hardening (closes independent audit finding 7.5) — was
      // signalsForCase(...).filter(type==="inconsistency"), pulling every
      // status unfiltered, unlike openQuestions right above it. A
      // conflict HR already investigated and explicitly marked Not
      // relevant/Explained was still being carried into the formal
      // investigation report as "already identified," inverting a
      // human's exculpatory judgement back into an apparent live finding
      // in the document that goes into the disciplinary bundle.
      const inconsistencies = openSignalsForCase(caseSignals, caseId, "inconsistency");
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
      const text = await streamClaude(systemPrompt, userPrompt, t=>setInvestigationReportDraft(t), 3400);
      if(text) {
        saveCases(cases.map(x=>x.id===caseId?{...x,investigationReport:text,investigationReportDate:new Date().toISOString(),stage:"inv_report"}:x));
        audit("Investigation report generated", cs.employeeName, caseId);
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
    setInvestigationReportDraft("");
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


  // Human UAT remediation, Batch 2, Part 5/6 — "Share meeting record" was
  // silently broken: this call sent a custom `html` body the server
  // (api/send-letter.js) has never actually read — that endpoint only
  // ever builds its own hardcoded outcome-LETTER template from
  // employeeName/meetingType/date/body/managerName fields, none of which
  // this call supplied. The email that actually went out read "Dear ,
  // Please find attached the outcome letter from your recent  on ." with
  // an empty content box — the meeting record itself was never sent at
  // all, while the app showed a false "Record shared" success toast.
  // Fixed at the root: this now sends the same kind of structured,
  // server-escaped fields the letter-sending calls already do (no raw
  // client HTML relayed through Compass's verified domain), tagged
  // documentType:"meeting_record" so the server can build an accurate
  // template instead of reusing the unrelated outcome-letter one.
  // Human UAT remediation, Batch 2 hardening — the UAT requirement was
  // that the recipient actually receives the meeting record as a real
  // attachment, not that Compass merely stop lying about one existing.
  // Generates the same kind of PDF this app already generates for
  // letters/hearing packs (buildDocumentPDF, shared layout) and sends it
  // as a genuine Resend attachment — never a silent fallback to inlining
  // the text if PDF generation fails; a failure here is reported as a
  // failure, not sent anyway with the body doing the attachment's job.
  const shareRecord = async (email, recipientName, subject, personalMessage) => {
    if(!email||!recipientName?.trim()||!reviewOutput) return;
    setShareProcessing(true);
    try {
      const empName = (caseInfo.employee||"Meeting").replace(/\s+/g,"_");
      const fileName = `${empName}_Meeting_Record_${new Date().toLocaleDateString("en-GB").replace(/\//g,"-")}.pdf`;
      const doc = await generateMeetingRecordPDF();
      const dataUri = doc.output("datauristring");
      const base64 = dataUri.split(",")[1];
      if(!base64) throw new Error("Could not generate the meeting record PDF");
      const res = await authedFetch("/api/send-letter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          to:email,
          subject: subject || (meetingType?.label||"Meeting")+" Record - "+caseInfo.employee,
          orgId: org?.id,
          caseId: activeCaseId,
          documentType: "meeting_record",
          recipientName: recipientName.trim(),
          personalMessage: personalMessage||"",
          employeeName: caseInfo.employee,
          meetingType: meetingType?.label||"Meeting",
          date: fmtDate(caseInfo.date),
          managerName: caseInfo.manager||"HR",
          attachments: [{ filename: fileName, content: base64 }],
          attachmentNames: [fileName],
        })});
      const data = await res.json();
      if(!data.success) { showToast("Failed to share record — "+(data.error||"please try again"), "error"); setShareProcessing(false); return; }
      // Human UAT remediation, Batch 2, Part 13 — sharing a meeting
      // record left no trace on the case's own Timeline at all, one of
      // the specific gaps the brief names ("shared" as one of the
      // meaningful events this journey should show).
      if(activeCaseId) audit("Meeting record shared", "Shared with "+email, activeCaseId);
      showToast("Record shared with "+email+" — "+fileName+" attached");
      setShowShareModal(false);
      setShareEmail(""); setShareRecipientName(""); setShareSubject(""); setSharePersonalMessage("");
    } catch(e){ showToast("Failed to share record — "+e.message, "error"); }
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
    // Human UAT remediation, Batch 2 hardening — drafting and saving a
    // disciplinary/appeal hearing invitation used to flip this case's
    // list badge straight to "Outcome issued" (green), since letterOutput
    // alone couldn't tell an invitation from a real outcome. See
    // caseStage.js's hasLetterType for the letterType-aware fix.
    const hasOutcomeLetter = hasLetterType(meetings, "outcome");
    const hasSigned = meetings.some(m => m.signStatus === "signed" || m.signStatus === "acknowledged");
    const hasPending = meetings.some(m => m.signStatus && !isTerminalStatus(m.signStatus));

    // cs.status was never set anywhere — every closed-case transition in
    // this app (bulk close, appeal-window close, "Close case" buttons)
    // writes cs.stage, not cs.status — so this check never matched and a
    // closed case fell through to whatever heuristic below happened to
    // fire instead, sometimes as misleading as "Open — no meetings yet".
    // UAT Product Hierarchy pass, Part 4 — case status is ordinary
    // case-progression metadata, not a primary action, brand moment, or
    // AI interaction, so it no longer borrows purple (which the primary
    // "+ New meeting" button and selected nav already use — the exact
    // "status badges competing with primary actions" the brief called
    // out) or red (reserved for genuine errors/destructive/urgent, not
    // an ordinary disciplinary or appeal simply being under way — hence
    // the same amber already used for Grievance/Redundancy below).
    // Human UAT remediation, Batch 1, Issue 1 — "Signed & closed" used to
    // fire on ANY meeting merely being signed/acknowledged, regardless of
    // whether the case was actually closed. Signing a meeting's notes
    // (routine, mid-investigation) and closing a case (an explicit,
    // separate action — see getCaseStage) are different concepts;
    // conflating them here made an actively open, under-investigation
    // case display as "Signed & closed" the moment its notes were signed.
    // Now this can only ever refine an ALREADY-closed case's label —
    // never independently imply closure.
    if(getCaseStage(cs) === "closed") {
      return hasSigned
        ? {label:"Signed & closed", color:"#1A7A4A", bg:"#E8F5EE"}
        : {label:"Closed", color:"#6B6375", bg:"#F5F1EA"};
    }
    if(hasOutcomeLetter && hasPending) return {label:"Outcome — awaiting signature", color:"#B87520", bg:"#FEF5E7"};
    if(hasOutcomeLetter) return {label:"Outcome issued", color:"#1A7A4A", bg:"#E8F5EE"};
    if(types.some(t=>t.includes("appeal"))) return {label:"Appeal in progress", color:"#B87520", bg:"#FEF5E7"};
    if(types.some(t=>t.includes("disciplinary"))) return {label:"Disciplinary in progress", color:"#B87520", bg:"#FEF5E7"};
    if(types.some(t=>t.includes("grievance"))) return {label:"Grievance in progress", color:"#B87520", bg:"#FEF5E7"};
    if(types.some(t=>t.includes("redundancy"))) return {label:"Redundancy consultation", color:"#B87520", bg:"#FEF5E7"};
    if(types.some(t=>t.includes("investigation"))) return {label:"Under investigation", color:"#6B6375", bg:"#F5F1EA"};
    if(types.some(t=>t.includes("informal")||t.includes("return")||t.includes("performance")||t.includes("pip"))) return {label:"Informal stage", color:"#6B6375", bg:"#F5F1EA"};
    if(meetings.length === 0) return {label:"Open — no meetings yet", color:"#6B6375", bg:"#F5F1EA"};
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

  // Human UAT remediation, Batch 2, Part 11 — a disciplinary/appeal
  // hearing invitation is the one letter type where ACAS expects the
  // employee to see the evidence against them before the hearing.
  // Reuses cs.evidence — the case's own existing evidence, filtered to
  // items that actually have a file behind them (dataUrl); a manually
  // logged, file-less evidence entry can't be attached. Computed
  // unconditionally here (cheap) rather than inline in the Email letter
  // modal's JSX, which otherwise needs an IIFE to scope this — and an
  // IIFE newly introduced there was confusing this file's static ref-
  // usage analysis for an unrelated, distant ref elsewhere in the
  // component (verified via a before/after eslint diff).
  const showEmailLetterEvidencePicker = (activeLetter==="invite"||activeLetter==="appeal");
  const emailLetterAttachableEvidence = showEmailLetterEvidencePicker ? (cases.find(x=>x.id===activeCaseId)?.evidence||[]).filter(e=>e.dataUrl) : [];

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


  // IA & User Journey pass, §21 responsive check — this root wrapper never
  // switched to a stacked layout on mobile: AppSidebar's own isMobile
  // branch renders a <header> meant to sit ABOVE page content, but this
  // parent stayed flexDirection:"row" (the unconditional default)
  // regardless, so the header and the content column sat side by side,
  // squeezing content into a sliver a few dozen pixels wide. Pre-existing
  // gap, not introduced by the IA restructuring — found while verifying
  // mobile support per the brief's own responsive-check requirement.
  return (
    <div style={{fontFamily:"DM Sans,system-ui,sans-serif",minHeight:"100vh",background:"#FDFAF5",color:"#1A1535",display:"flex",flexDirection:isMobile?"column":"row"}}>
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

      {showShareModal&&(()=>{
        const defaultShareSubject = (meetingType?.label||"Meeting")+" Record - "+caseInfo.employee;
        const closeShareModal = () => { setShowShareModal(false); setShareEmail(""); setShareRecipientName(""); setShareSubject(""); setSharePersonalMessage(""); };
        return (
        <div role="dialog" aria-modal="true" aria-labelledby="share-modal-title" ref={shareModalRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto"}}>
            <h3 id="share-modal-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Share meeting record</h3>
            <p style={{fontSize:13,color:"#9B9098",marginBottom:20}}>The full meeting record is included in the email below — nothing is sent as a separate file attachment.</p>

            <label htmlFor="share-recipient-name" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Recipient name</label>
            <input id="share-recipient-name" value={shareRecipientName} onChange={e=>setShareRecipientName(e.target.value)}
              placeholder="e.g. Sam Employee"
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#1A1535",outline:"none",marginBottom:14,boxSizing:"border-box"}}/>

            <label htmlFor="share-recipient-email" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Recipient email</label>
            <input id="share-recipient-email" value={shareEmail} onChange={e=>setShareEmail(e.target.value)}
              placeholder="email@example.com"
              type="email"
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#1A1535",outline:"none",marginBottom:14,boxSizing:"border-box"}}/>

            <label htmlFor="share-subject" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Subject</label>
            <input id="share-subject" value={shareSubject||defaultShareSubject} onChange={e=>setShareSubject(e.target.value)}
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#1A1535",outline:"none",marginBottom:14,boxSizing:"border-box"}}/>

            <label htmlFor="share-personal-message" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Personal note (optional)</label>
            <textarea id="share-personal-message" value={sharePersonalMessage} onChange={e=>setSharePersonalMessage(e.target.value)}
              placeholder="Add a short note for the recipient..."
              rows={3}
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#1A1535",outline:"none",marginBottom:16,boxSizing:"border-box",resize:"vertical",fontFamily:"inherit"}}/>

            <div style={{display:"flex",gap:8}}>
              <Btn onClick={()=>shareRecord(shareEmail, shareRecipientName, shareSubject||defaultShareSubject, sharePersonalMessage)} disabled={shareProcessing||!shareEmail.trim()||!shareRecipientName.trim()} style={{flex:1}}>
                {shareProcessing?"Sending...":"Send"}
              </Btn>
              <Btn variant="ghost" onClick={closeShareModal} style={{flex:1}}>Cancel</Btn>
            </div>
          </div>
        </div>
        );
      })()}

      {showLinkCase&&appealDetected&&(
        <div role="dialog" aria-modal="true" ref={linkCaseModalRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:isMobile?"calc(100vw - 32px)":480}}>
            <div style={{fontSize:11,color:"#7C5CFC",fontWeight:600,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Appeal detected</div>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Link to an existing case?</h3>
            <p style={{fontSize:13,color:"#6B6375",marginBottom:20}}>This looks like an appeal. Would you like to link it to an existing case so the full proceeding is tracked together?</p>
            {(() => { const linkCandidates = appealLinkCandidates(cases, caseInfo.employee); return linkCandidates.length>0?(
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                {linkCandidates.map(cs=>(
                  <button key={cs.id} onClick={()=>{
                    const meeting = {
                      id: newId("meeting"),
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
                      // Phase 6.5 hardening (structural remediation,
                      // Prompt 12 — Signature Identity invariant): this
                      // appeal meeting is never sent for signature as
                      // part of this flow, so it must never carry a
                      // signId/signStatus at all — reading the ambient
                      // signId/signStatus state here (as this previously
                      // did) meant an appeal meeting saved any time after
                      // an unrelated earlier signature send in the same
                      // session would silently inherit that send's id,
                      // the exact cross-contamination bug fixed in
                      // saveMeetingToCase above. This was a second,
                      // independent instance of the same defect — this
                      // meeting-construction path doesn't go through
                      // saveMeetingToCase at all.
                      signId: null, signStatus: null,
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
        <div role="dialog" aria-modal="true" ref={letterModalRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:isMobile?"calc(100vw - 32px)":480}}>
            {/* Human UAT remediation, Batch 2, Part 11 (adjacent finding) —
                this always said "outcome letter" regardless of which
                letter type was actually being drafted, e.g. showing
                "Draft outcome letter" when the flow that led here was
                the disciplinary hearing's own "Draft invitation letter"
                prompt. Same {outcome/invite/appeal} label set doSend
                already uses for its own subject line. */}
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Draft {({outcome:"outcome",invite:"invitation",appeal:"appeal outcome"})[pendingLetterType]||"outcome"} letter</h3>
            <p style={{fontSize:13,color:"#6B6375",marginBottom:24}}>How would you like to create the {({outcome:"outcome",invite:"invitation",appeal:"appeal outcome"})[pendingLetterType]||"outcome"} letter?</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={()=>{setShowLetterModal(false);handleLetter(pendingLetterType||"outcome");}}
                style={{background:"#7C5CFC",border:"none",borderRadius:10,padding:"16px 20px",cursor:"pointer",textAlign:"left"}}>
                <div style={{fontSize:14,color:"#fff",fontWeight:600,marginBottom:4}}>Generate with Compass</div>
                <div style={{fontSize:12,color:"#7C5CFC"}}>Compass drafts a letter based on the meeting record and UK employment law</div>
              </button>
              <button onClick={()=>{setShowLetterModal(false);setScreen(SCREENS.TEMPLATES);setActiveLetter(pendingLetterType||"outcome");}}
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
        <div role="dialog" aria-modal="true" aria-labelledby="email-letter-modal-title" ref={emailLetterModalRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto"}}>
            <h3 id="email-letter-modal-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Email letter</h3>
            <p style={{fontSize:13,color:"#6B6375",marginBottom:20}}>The letter will be sent as email body and also available to download as PDF.</p>
            <label htmlFor="email-letter-to" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Recipient email</label>
            <input id="email-letter-to" value={emailLetterTo} onChange={e=>setEmailLetterTo(e.target.value)}
              placeholder="employee@company.com"
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",fontSize:14,outline:"none",color:"#1A1535",boxSizing:"border-box",marginBottom:16}}/>

            {showEmailLetterEvidencePicker&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Evidence to include (optional)</div>
                {emailLetterAttachableEvidence.length===0?(
                  <p style={{fontSize:12,color:"#9B9098"}}>No case evidence with a file to attach yet.</p>
                ):(
                  <div style={{border:"1px solid #E8E0D0",borderRadius:8,maxHeight:160,overflowY:"auto"}}>
                    {emailLetterAttachableEvidence.map((e,i)=>{
                      const evId = e.id ?? i;
                      const checked = selectedInviteEvidenceIds.includes(evId);
                      return (
                        <label key={evId} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:i<emailLetterAttachableEvidence.length-1?"1px solid #F5F1EA":"none",fontSize:13,color:"#1A1535",cursor:"pointer"}}>
                          <input type="checkbox" checked={checked} onChange={()=>setSelectedInviteEvidenceIds(ids=>checked?ids.filter(x=>x!==evId):[...ids,evId])}/>
                          {e.name}
                        </label>
                      );
                    })}
                  </div>
                )}
                <p style={{fontSize:11,color:"#9B9098",marginTop:6}}>
                  {selectedInviteEvidenceIds.length===0?"No evidence will be attached.":`${selectedInviteEvidenceIds.length} item${selectedInviteEvidenceIds.length===1?"":"s"} will be attached: ${emailLetterAttachableEvidence.filter((e,i)=>selectedInviteEvidenceIds.includes(e.id??i)).map(e=>e.name).join(", ")}`}
                </p>
              </div>
            )}

            <div style={{display:"flex",gap:10}}>
              <Btn onClick={async()=>{
                if(!emailLetterTo.includes("@")||letterSendProcessing) return;
                setLetterSendProcessing(true);
                try {
                  const selectedEvidence = emailLetterAttachableEvidence.filter((e,i)=>selectedInviteEvidenceIds.includes(e.id??i));
                  const ok = await sendLetterCoordinated(emailLetterTo, selectedEvidence);
                  if(ok) { setShowEmailLetter(false); setEmailLetterTo(""); setSelectedInviteEvidenceIds([]); }
                } catch(e){ showToast("Error: "+e.message, "error"); }
                setLetterSendProcessing(false);
              }} disabled={!emailLetterTo.includes("@")||letterSendProcessing} style={{flex:1}}>{letterSendProcessing?"Sending...":"Send email"}</Btn>
              <Btn variant="ghost" onClick={()=>{setShowEmailLetter(false);setEmailLetterTo("");setSelectedInviteEvidenceIds([]);}} style={{flex:1}}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {inviteLink&&(
        <div role="dialog" aria-modal="true" ref={inviteLinkModalRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
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
        <div role="dialog" aria-modal="true" ref={signModalRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:440}}>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Send for signature</h3>
            <p style={{fontSize:13,color:"#6B6375",marginBottom:20}}>The employee will receive an email with a link to read and sign the meeting record.</p>
            <label htmlFor="sign-email" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Employee email</label>
            <input id="sign-email" value={signEmail} onChange={e=>setSignEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&signEmail.includes("@")&&(sendForSignature(signEmail),setShowSignModal(false),setSignEmail(""))}
              placeholder="employee@company.com"
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

      {showLetterAckModal&&(
        <div role="dialog" aria-modal="true" ref={letterAckModalRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:440}}>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Send for acknowledgement</h3>
            <p style={{fontSize:13,color:"#6B6375",marginBottom:20}}>The employee will receive an email with a link to read and acknowledge receipt of this letter.</p>
            <label htmlFor="letter-ack-email" style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Employee email</label>
            <input id="letter-ack-email" value={letterAckEmail} onChange={e=>setLetterAckEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&letterAckEmail.includes("@")&&(sendLetterForAcknowledgement(letterAckEmail),setShowLetterAckModal(false),setLetterAckEmail(""))}
              placeholder="employee@company.com"
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",fontSize:14,outline:"none",color:"#1A1535",boxSizing:"border-box",marginBottom:16}}/>
            <div style={{display:"flex",gap:10}}>
              <Btn onClick={()=>{if(letterAckEmail.includes("@")){sendLetterForAcknowledgement(letterAckEmail);setShowLetterAckModal(false);setLetterAckEmail("");}}}
                disabled={!letterAckEmail.includes("@")}
                style={{flex:1}}>
                Send email
              </Btn>
              <Btn variant="ghost" onClick={()=>{setShowLetterAckModal(false);setLetterAckEmail("");}} style={{flex:1}}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {showSigPad && <SignaturePad onSave={handleSaveSignature} onClose={()=>{setShowSigPad(false);setPendingSend(null);}} />}

      {/* Case file prompt */}
      {showCasePrompt&&(
        <div role="dialog" aria-modal="true" ref={casePromptModalRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
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
              <label htmlFor="case-prompt-name" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Employee name</label>
              <input
                id="case-prompt-name"
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
                <label htmlFor="new-case-job-title" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Job title</label>
                <input id="new-case-job-title" value={newCaseJobTitle} onChange={e=>setNewCaseJobTitle(e.target.value)} placeholder="e.g. Sales Manager" style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label htmlFor="new-case-start-date" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Start date</label>
                <input id="new-case-start-date" type="date" value={newCaseStartDate} onChange={e=>setNewCaseStartDate(e.target.value)} onClick={e=>e.currentTarget.showPicker?.()} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box",colorScheme:"light",cursor:"pointer"}}/>
              </div>
            </div>

            {/* Location + case type */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <label htmlFor="new-case-location" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Location</label>
                <select id="new-case-location" value={newCaseLocation} onChange={e=>setNewCaseLocation(e.target.value)} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:newCaseLocation?"#1C1820":"#9B9098",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
                  <option value="">Select location…</option>
                  {locations.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
                  <option value="__other__">Other / not listed</option>
                </select>
                {newCaseLocation==="__other__"&&<input aria-label="Other location" value={newCaseLocationOther} onChange={e=>setNewCaseLocationOther(e.target.value)} placeholder="Enter location" style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box",marginTop:6}}/>}
              </div>
              <div>
                <label htmlFor="new-case-type" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Case type</label>
                <select id="new-case-type" value={newCaseType} onChange={e=>setNewCaseType(e.target.value)} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
                  <option value="">Select type…</option>
                  {["Misconduct","Grievance","Performance","Absence","Attendance/sickness","Long-term sickness","Redundancy","Appeal","Investigation","Disciplinary","Probation","Capability","Flexible working","Other"].map(t=><option key={t} value={t.toLowerCase()}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Owner + priority */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <div>
                <label htmlFor="new-case-owner" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Case owner</label>
                <select id="new-case-owner" value={newCaseOwnerId} onChange={e=>setNewCaseOwnerId(e.target.value)} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
                  <option value="">{currentUser?.name||"Me"} (default)</option>
                  {orgMembers.filter(m=>m.user_id!==user?.id).map(m=><option key={m.id} value={m.user_id}>{m.name}{m.job_title?" ("+m.job_title+")":""}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="new-case-priority" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Priority</label>
                <select id="new-case-priority" value={newCasePriority} onChange={e=>setNewCasePriority(e.target.value)} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div style={{marginBottom:14}}>
              <label htmlFor="new-case-description" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Brief description <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              <textarea id="new-case-description" value={newCaseDescription} onChange={e=>setNewCaseDescription(e.target.value)} placeholder="Brief summary of the issue…" rows={2} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
            </div>

            {/* Evidence — staged locally and attached once the case is created below */}
            <div style={{marginBottom:20}}>
              {/* Section heading, not a single control's label — the
                  dropzone below is its own labelled control
                  (EvidenceDropzone's own aria-label). */}
              <div style={{fontSize:12,fontWeight:600,color:"#1C1820",marginBottom:5}}>Evidence <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></div>
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

            {/* ── Toast notification ──
                Phase 6.5 hardening (closes Prompt 16 audit finding H6,
                HIGH) — had no role/aria-live at all, so a screen-reader
                user got no announcement that anything had happened, error
                or otherwise. role="alert"/aria-live="assertive" for
                errors (interrupts immediately — the user needs to know
                now), role="status"/aria-live="polite" for everything else
                (announced without interrupting). The close button gives
                every toast — not just errors, which no longer
                auto-dismiss at all — an explicit, keyboard-reachable way
                to dismiss it instead of only ever a timeout. */}
      {toast&&(()=>{
        // UAT Product Hierarchy pass, Part 4/5 — "info" is a third,
        // genuinely neutral toast colour (blue), distinct from the
        // existing red=error and green=success. A case being refreshed
        // with newer data from elsewhere is neither a failure nor a
        // completed action of the user's own, so it no longer borrows
        // green (success) or red (error) to say so.
        const bg = toast.type==="error"?"#FEF0EB":toast.type==="info"?"#EAF2FA":"#E8F5EE";
        const border = toast.type==="error"?"#C84B2F44":toast.type==="info"?"#2E6BA844":"#1A7A4A44";
        const dot = toast.type==="error"?"#C84B2F":toast.type==="info"?"#2E6BA8":"#1A7A4A";
        return (
          <div role={toast.type==="error"?"alert":"status"} aria-live={toast.type==="error"?"assertive":"polite"} style={{position:"fixed",bottom:isMobile?16:24,right:isMobile?16:24,left:isMobile?16:"auto",zIndex:3000,background:bg,border:`1px solid ${border}`,borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 4px 16px rgba(26,21,53,0.14)",animation:"slideIn 0.2s ease",maxWidth:isMobile?"none":360,fontFamily:"DM Sans,system-ui,sans-serif"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:dot,flexShrink:0}}/>
            <span style={{fontSize:14,color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif",flex:1}}>{toast.message}</span>
            <button onClick={dismissToast} aria-label="Dismiss" style={{background:"none",border:"none",color:"#9B9098",fontSize:16,lineHeight:1,cursor:"pointer",padding:2,flexShrink:0,fontFamily:"DM Sans,system-ui,sans-serif"}}>×</button>
          </div>
        );
      })()}

      {/* Phase 6.5 hardening (production regression suite) — this used
          to be its own floating overlay and went through three different
          fixed positions, each a real collision with real screen content
          discovered via E2E (top-centered over Home's own primary
          buttons, bottom-right over the Ask Compass chat panel, a top
          strip over RecordScreen's own "End meeting" button) — every
          screen in this app puts its own primary actions at SOME edge,
          so no floating position over the main content area is ever
          safe. Now rendered inside AppSidebar itself (see its own
          loadIssueBanner), the one piece of UI that's identical and
          genuinely in-flow (position:sticky, not fixed) across every
          screen — a collision is structurally impossible there, not
          just currently-unobserved. */}

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
        <div role="dialog" aria-modal="true" ref={onboardModalRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1900,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
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
        onOpenCommandBar={()=>setShowCommandBar(true)}
        dataLoadIssues={dataLoadIssues}
        loadBannerDismissed={loadBannerDismissed}
        onRetryLoad={loadOrgData}
        onDismissLoadBanner={()=>setLoadBannerDismissed(true)}
        dueSoon={dueSoon}
        askCompassProps={{
          showAskCompass, setShowAskCompass, askCompassHistory, setAskCompassHistory,
          askCompass, askCompassProcessing, setAskCompassProcessing, askCompassInput, setAskCompassInput,
        }}
        createMenuProps={{
          // IA & User Journey pass, §7 — universal Create pattern. Every
          // handler below is the exact existing one its old per-screen
          // button already called (see HomeScreen.jsx's "Start meeting",
          // ConcernsScreen's autoOpenForm flow, CaseViewScreen.jsx:219's
          // own "start a meeting for this case's subject" derivation) —
          // this menu is a new front door, not new business logic.
          onNewCase: () => setShowCasePrompt(true),
          onNewMeeting: () => {
            setMeetingSetup({employee:"", employeeJobTitle:"", manager:currentUser?.name||"", chairJobTitle:"", type:"", date:new Date().toISOString().split("T")[0], linkedCaseId:null, linkedCaseName:null, representative:"", representativeRole:"colleague", participants:[]});
            setScreen(SCREENS.HOME+"_meeting");
          },
          onRaiseConcern: () => { setConcernFormAutoOpen(true); setScreen(SCREENS.CONCERNS); },
          onNewTask: () => { setTaskFormAutoOpen(true); setScreen(SCREENS.TASKS); },
          onAddEmail: () => setScreen(SCREENS.SAVE_EMAIL),
          isInCase: screen===SCREENS.CASE_VIEW && !!activeCaseId,
          activeCaseName: activeCaseId ? cases.find(c=>c.id===activeCaseId)?.employeeName : null,
          onAddEvidence: () => setCaseViewInitialTab("evidence"),
          onAddCaseTask: () => setCaseViewInitialTab("tasks"),
          onStartCaseMeeting: () => {
            const cs = cases.find(c=>c.id===activeCaseId);
            if(!cs) return;
            setMeetingSetup({employee:cs.employeeName, employeeJobTitle:getEmployeeRecord(cs.employeeName)?.jobTitle||"", manager:cs.manager||"", chairJobTitle:(orgMembers||[]).find(m=>m.name===cs.manager)?.job_title||"", type:"", date:new Date().toISOString().split("T")[0], linkedCaseId:null, linkedCaseName:null, representative:"", representativeRole:"colleague", participants:[]});
            setScreen(SCREENS.HOME+"_meeting");
          },
        }}
      />

      {/* ── Content column — everything else (deadline banner through every
          screen and modal below) lives in this flex column beside the
          sidebar. Closes at the very end of this component's return. ── */}
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",minHeight:"100vh"}}>

      {/* ── Deadline banner ──
          Design System Convergence pass — the persistent full-width
          banner (every screen except Home/Case View, permanent vertical
          space, duplicating Home's own Needs Attention) is gone. Same
          underlying dueSoon/overdue data is now surfaced through
          AppSidebar's own OverdueIndicator — the same quiet,
          click-to-expand icon pattern already established for the
          portal-load-issue indicator and Ask Compass, living in
          persistent nav chrome rather than pushing page content down on
          every screen. Nothing about which items count as overdue, or
          where "View all" leads (Home), changed — only where and how
          large this renders. */}

      {/* ══ HOME ══ */}
      {screen===SCREENS.HOME&&(
        <HomeScreen
          cases={cases}
          getCaseStage={getCaseStage}
          currentUser={currentUser}
          getNextStep={getNextStep}
          setScreen={setScreen}
          setShowCasePrompt={setShowCasePrompt}
          dueSoon={dueSoon}
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
          onAskCompass={(q)=>{setGlobalChatInput(q);sendGlobalChat(q);setScreen(SCREENS.ASK_COMPASS);}}
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
          insightsTab={globalChatInsightsTab}
          setInsightsSection={setInsightsSection}
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
          onCreateConcern={createConcernFromEmail}
          replyMatch={replyMatch}
          replyAnalysis={replyAnalysis}
          replyAnalysisLoading={replyAnalysisLoading}
          onSaveReplyToCase={saveReplyToCase}
          onAnalyseReply={analyseReplyResponse}
          onOpenReplyCaseMeetings={openReplyCaseMeetings}
          onCreateReplyAction={createReplyAction}
          onClearReplyMatch={clearReplyMatch}
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
          shell={{
            cases, casesLoading, activeCaseId, setScreen, confirmDialog, getCaseStage, getNextStep, fmtDate,
            getProceedingTitle, getCaseStatus, setMeetingSetup, getEmployeeRecord, orgMembers,
            setCaseInfo, saveCases, setReviewOutput, setMeetingType, showToast, currentUser,
            setLetterOutput, handleLetter, isHR, caseAccess, allegations, auditLog, caseTasks,
            createCaseTask, caseSignals, changeSignalStatus, toggleCaseTaskDone, setShowHandoffModal,
            generateInvestigationPlan, investigationPlanLoading, promptDialog, audit,
          }}
          header={{
            showAppealInput, setShowAppealInput, appealText, setAppealText, setShowReassignModal,
            setShowAssignInvestigatorModal, setShowOutcomeModal, setShowSignModal, letterOutput,
            aiProcessing, aiError, toggleNextStepDone, concludingInvestigation, investigationReportDraft, attemptSubmitInvestigation,
            openEscalateModal, openHrInterventionModal, generateNextBestAction, nextActionLoading,
            changesSinceView: changesSinceView[activeCaseId], changesSummary: changesSummary[activeCaseId],
            changesSummaryLoading: changesSummaryLoading[activeCaseId],
          }}
          initialTab={caseViewInitialTab}
          clearInitialTab={()=>setCaseViewInitialTab(null)}
          deleteCaseTask={deleteCaseTask}
          overview={{
            linkSignalToAllegation, requestOverrideReason, requestPolicyDeviationReason, assignCaseRole,
            hrReviewRequests, respondToReview, resolveInvestigationReview, wellbeingNotes, dueSoon,
            processTemplates, unansweredCovered, unansweredLoading, generateUnansweredQuestions,
            generateInconsistencies, inconsistencyLoading, ohReportFindings, ohReportAnalysisLoading,
            onAnalyseOhReport: analyseOhReport, onAcceptOhFinding: acceptOhFinding, onDismissOhFinding: dismissOhFinding,
            onSendForSignature: sendDocumentForSignature, automationLevels, onResendReminder: resendSignatureReminder,
          }}
          timeline={{ toggleTimelineExclude, editTimelineDescription, generateTimelineRelevance, timelineRelevanceLoading, loadJsPDF }}
          allegationsTab={{
            createAllegation, patchAllegation, changeAllegationStatus, deleteAllegation, evidenceSuggestions,
            evidenceSuggestionsLoading, generateEvidenceSuggestions, acceptEvidenceSuggestion, rejectEvidenceSuggestion,
            generateAppealReview, appealReviewLoading: appealReviewLoading?.[activeCaseId], recordAppealOutcome,
            policies, consistencyReview, consistencyReviewLoading, generateConsistencyReview,
          }}
          meetingsTab={{ activeCaseStage, setActiveCaseStage, onAcceptSavedSuggestion: acceptSavedMeetingSuggestion, onDismissSavedSuggestion: dismissSavedMeetingSuggestion }}
          evidenceTab={{ documentFindings, documentAnalysisLoading, analyseEvidenceDocument, acceptDocumentFinding, dismissDocumentFinding }}
          documentsTab={{ onGenerateHearingPack: handleGenerateHearingPack, hearingPackGenerating, hearingPackReady, onDismissHearingPackReady: (caseId)=>setHearingPackReady(r=>({...r,[caseId]:null})), onDraftCorrespondence: startCaseCorrespondence }}
          themesTab={{
            organisationThemes, caseThemes, themeSuggestions, themeSuggestionLoading,
            onSuggestThemes: suggestThemesForCase, onConfirmThemeSuggestion: confirmThemeSuggestion,
            onDismissThemeSuggestion: dismissThemeSuggestion,
            onAssignExistingTheme: (cs, themeId)=>assignThemeToCase(cs, themeId, "user"),
            onRemoveTheme: removeThemeFromCase,
          }}
          aiTab={{
            caseChatHistory, caseChatInput, setCaseChatInput, caseChatProcessing, sendCaseChat,
            caseOverview, caseOverviewLoading, generateCaseOverview, caseOverviewSources,
          }}
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
        <RecordScreen meetingType={meetingType} caseInfo={caseInfo} isListening={isListening} meetingStartTime={meetingStartTime} currentAdjournment={currentAdjournment} setAdjournments={setAdjournments} setCurrentAdjournment={setCurrentAdjournment} setTranscript={setTranscript} inputText={inputText} aiProcessing={aiProcessing} transcript={transcript} addUtterance={addUtterance} inputRef={inputRef} setInputText={setInputText} updateLiveContext={updateLiveContext} stopSpeech={stopSpeech} startSpeech={startSpeech} isScreenCapturing={isScreenCapturing} stopScreenCapture={stopScreenCapture} startScreenCapture={startScreenCapture} importFileRef={importFileRef} handleImportFile={handleImportFile} liveContextLoading={liveContextLoading} liveContext={liveContext} liveChatHistory={liveChatHistory} liveChatProcessing={liveChatProcessing} liveChatInput={liveChatInput} setLiveChatInput={setLiveChatInput} sendLiveChat={sendLiveChat} setScreen={setScreen} confirmDialog={confirmDialog} clearMeetingDraft={()=>orgLsSet("compass_meeting_draft", null)} promptDialog={promptDialog} updateMeetingIntelligence={updateMeetingIntelligence} meetingIntelligence={meetingIntelligence} dismissedNudgeKey={dismissedNudgeKey} setDismissedNudgeKey={setDismissedNudgeKey} prepQuestions={prepQuestions} onSetPrepQuestionStatus={setPrepQuestionStatus} meetingEvidenceSuggestions={meetingEvidenceSuggestions} onAcceptMeetingEvidenceSuggestion={acceptMeetingEvidenceSuggestion} onDismissMeetingEvidenceSuggestion={dismissMeetingEvidenceSuggestion} meetingActionSuggestions={meetingActionSuggestions} onAcceptMeetingActionSuggestion={acceptMeetingActionSuggestion} onDismissMeetingActionSuggestion={dismissMeetingActionSuggestion} dismissedFollowUpKey={dismissedFollowUpKey} setDismissedFollowUpKey={setDismissedFollowUpKey} dismissedCoachingTipKeys={dismissedCoachingTipKeys} onDismissCoachingTip={key=>setDismissedCoachingTipKeys(ks=>[...ks,key])} attemptEndMeeting={attemptEndMeeting} showQualityCheck={showQualityCheck} qualityCheckGaps={qualityCheckGaps} proceedPastQualityCheck={proceedPastQualityCheck} createQualityCheckFollowUp={createQualityCheckFollowUp} onReturnToMeeting={()=>setShowQualityCheck(false)} fmtDate={fmtDate} />
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
        <LetterScreen handleLetter={handleLetter} activeLetter={activeLetter} aiProcessing={aiProcessing} letterOutput={letterOutput} letterSources={letterSources} onAskWhy={setLetterWhySignal} letterHistory={letterHistory} restoreLetterVersion={restoreLetterVersion} editingLetter={editingLetter} setEditingLetter={setEditingLetter} setLetterOutput={setLetterOutput} signature={signature} setShowSigPad={setShowSigPad} setSignature={setSignature} onRemoveSignature={()=>{setSignature(null);orgLsSet("compass_signature",null);}} caseInfo={caseInfo} triggerWithSig={triggerWithSig} pdfGenerating={pdfGenerating} saveMeetingToCase={saveMeetingToCase} setScreen={setScreen} letterIsApproved={letterIsApproved} letterApproval={letterApproval} approveLetter={approveLetter} onSendFromCompass={()=>setShowEmailLetter(true)} onSendForAcknowledgement={activeLetter==="outcome"?()=>setShowLetterAckModal(true):undefined} outcomeRecorded={!!cases.find(x=>x.id===activeCaseId)?.outcome} />
      )}

      {/* ══ DASHBOARD ══ */}
      {screen===SCREENS.DASHBOARD&&(
        <DashboardScreen cases={cases} setScreen={setScreen} />
      )}

      {/* ══ CASES ══ */}
      {screen===SCREENS.CASES&&(
        <CasesScreen cases={cases} casesLoading={casesLoading} locations={locations} orgMembers={orgMembers} setIntake={setIntake} setScreen={setScreen} getCaseStage={getCaseStage} setActiveCaseId={setActiveCaseId} setActiveCaseStage={setActiveCaseStage} getNextStep={getNextStep} getProceedingTitle={getProceedingTitle} getCaseStatus={getCaseStatus} saveCases={saveCases} confirmDialog={confirmDialog} showToast={showToast} audit={audit} currentUserId={user?.id} />
      )}

      {/* ══ OPEN IN COMPASS (HRIS deep link) ══ */}
      {screen===SCREENS.OPEN_EMPLOYEE&&(
        <OpenInCompassScreen employeeName={openEmployeeName} cases={cases} getCaseStage={getCaseStage} getEmployeeRecord={getEmployeeRecord} setActiveCaseId={setActiveCaseId} setCaseViewInitialTab={setCaseViewInitialTab} setScreen={setScreen} setConcernForm={setConcernForm} emptyConcernForm={EMPTY_CONCERN_FORM} setConcernFormAutoOpen={setConcernFormAutoOpen} setCasePromptName={setCasePromptName} setShowCasePrompt={setShowCasePrompt} fmtDate={fmtDate} />
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

      {/* Phase 7.5C — Onboarding/Offboarding removed from the product's
          user-facing scope (nav entry, this render block, the Settings
          "Checklist templates" editor, and the Portal's own Onboarding
          tab). The underlying starter_instances/leaver_instances tables,
          RLS, App-level state, load/save functions and mutation handlers
          (createStarterInstance, toggleLeaverTask, etc.) are deliberately
          left in place and dormant rather than removed — DSAR compilation
          (dsarCompile.js) still reads real historical records from them
          for subject access requests, and a destructive removal of that
          data path was explicitly out of scope for this change. */}

      {/* Organisational ER Intelligence (Phase 6, OP1) — the new "Insights"
          home; replaces the separate ER ANALYTICS (SCREENS.ERREPORT) and
          Manager Performance Insights (SCREENS.MANAGER_INSIGHTS) route
          blocks below, both now reached as tabs inside InsightsScreen. */}
      {screen===SCREENS.INSIGHTS&&(
        <InsightsScreen
          isHR={isHR}
          deepLink={{
            initialSection: insightsSection,
            clearInitialSection: ()=>setInsightsSection(null),
          }}
          caseData={{
            cases, caseAccess, hrReviewRequests, auditLog, dueSoon, caseTasks,
            allegations, caseSignals, employeeRecords, policies, orgMembers, processTemplates,
          }}
          orgIntel={{
            organisationThemes, caseThemes, orgEvents, improvementInitiatives,
            managerCapabilityInsights, generatingManagerInsight,
          }}
          orgIntelActions={{
            onAddOrganisationTheme: addOrganisationTheme,
            onUpdateOrganisationTheme: updateOrganisationTheme,
            onAddOrgEvent: addOrgEvent,
            onAddImprovementInitiative: addImprovementInitiative,
            onUpdateImprovementInitiative: updateImprovementInitiative,
            onGenerateManagerInsight: generateManagerCapabilityInsight,
            createCaseTask,
          }}
          reporting={{
            reportNarrative, setReportNarrative, getCaseStage, getNextStep, fmtDate, loadJsPDF,
            org, user, memberName: member?.name||user?.email,
          }}
          nav={{ setScreen, setActiveCaseId, setActiveCaseStage, setActivePerson }}
        />
      )}

            {/* ══ REDUNDANCY & CONSULTATION ══ */}
      {/* Phase 6.5 hardening (closes Prompt 16 audit finding H1, HIGH) —
          defense-in-depth screen-level guard, same as Wellbeing below —
          RLS is the real boundary, but this stops the create/empty-state
          UI from ever rendering for a non-HR role even via direct
          setScreen navigation. */}
      {screen===SCREENS.REDUNDANCY&&isHR&&(
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
          autoOpenForm={concernFormAutoOpen}
          clearAutoOpenForm={()=>setConcernFormAutoOpen(false)}
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
          isMobile={isMobile}
          initialSection={settingsSection}
          clearInitialSection={()=>setSettingsSection(null)}
          setScreen={setScreen}
          showToast={showToast}
          auditLog={auditLog}
          lsSet={lsSet}
          org={{ org, locations, deleteLocation, addLocation, orgRoles, loadOrgRoles, orgMembers, loadOrgMembers }}
          team={{ teamMembers, editingMember, setEditingMember, removeMember, updateMemberRole, assignLocations, inviteForm, setInviteForm, inviting, inviteMember }}
          portal={{ portalAccounts, revokePortalAccess }}
          employeeData={{ employeeCsvFileRef, employeeCsvProcessing, handleEmployeeCsvImport, exportEmployeesCsv, caseCsvFileRef, caseCsvProcessing, handleCaseCsvImport, downloadCaseCsvTemplate }}
          branding={{ wordTemplate, setWordTemplate, orgLsSet, wordTemplateRef, handleWordTemplateUpload, letterhead, setLetterhead, letterheadRef, handleLetterheadUpload, signature, setSignature, setShowSigPad }}
          policies={{ policies, setPolicies, policyFileRef, handlePolicyUpload, policyProcessing, changePolicyCategory }}
          templates={{ starterTemplates, saveStarterTemplates, leaverTemplates, saveLeaverTemplates, processTemplates, saveProcessTemplate, promptDialog, confirmDialog }}
          integrations={{ mailConnected, mailboxEmail, onConnectMail: connectOutlookMail, onDisconnectMail: disconnectOutlookMail, gmailConnected, gmailboxEmail, connectGmail, disconnectGmail, calendarConnected, connectGoogleCalendar, disconnectGoogleCalendar, ms365CalendarConnected, connectMs365Calendar, disconnectMs365Calendar, integrationEvents, orgWebhookUrl, orgWebhookType, saveOrgWebhook, sendTestWebhook }}
          notifications={{ dueSoon, caseTasks, createCaseTask, requestNotifications, notifGranted, emailDigestOptIn, toggleEmailDigest }}
          automation={{ automationLevels, saveAutomationLevel }}
          dataPrivacy={{ exportCSV, exportPDF, cases, exportAllData, deleteAllData, setGdprAccepted, setShowGdpr, dataRetentionYears, saveDataRetentionYears, ukJurisdiction, saveUkJurisdiction }}
          onboarding={{ setOnboardStep, setShowOnboard }}
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
          wellbeingNotes={wellbeingNotes}
          concernReferrals={concernReferrals}
          allegations={allegations}
          caseSignals={caseSignals}
          caseTasks={caseTasks}
          hrReviewRequests={hrReviewRequests}
          auditLog={auditLog}
          orgMembers={orgMembers}
          orgEvents={orgEvents}
          improvementInitiatives={improvementInitiatives}
          managerCapabilityInsights={managerCapabilityInsights}
          organisationThemes={organisationThemes}
          caseAccess={caseAccess}
          redundancyCases={redundancyCases}
          orgId={org?.id}
          audit={audit}
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
          autoOpenForm={taskFormAutoOpen}
          clearAutoOpenForm={()=>setTaskFormAutoOpen(false)}
        />
      )}
      {screen===SCREENS.CALENDAR&&(
        <CalendarScreen
          dueSoon={dueSoon}
          setScreen={setScreen}
          screens={SCREENS}
          setActiveCaseId={setActiveCaseId}
          setActiveCaseStage={setActiveCaseStage}
          cases={cases}
          onScheduleMeeting={scheduleMeeting}
          meetingScheduling={meetingScheduling}
          policies={policies}
          caseAccess={caseAccess}
          orgMembers={orgMembers}
          organiserEmail={user?.email}
          ukJurisdiction={ukJurisdiction||undefined}
          onCheckAvailability={checkMeetingAvailability}
          availabilityCheck={availabilityCheck}
          availabilityChecking={availabilityChecking}
          clearAvailabilityCheck={()=>{availabilityRequestIdRef.current++; setAvailabilityCheck(null);}}
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

      {/* ── Command Bar (Cmd/Ctrl+K) ── */}
      <CommandBarModal
        show={showCommandBar}
        onClose={closeCommandBar}
        input={commandBarInput}
        setInput={setCommandBarInput}
        processing={commandBarProcessing}
        plan={commandBarPlan}
        error={commandBarError}
        onSubmit={submitCommandBarInstruction}
        onConfirm={confirmCommandBarPlan}
      />

      {/* Ask Compass quick reference now renders as part of AppSidebar's
          own persistent footer (see the askCompassProps passed to
          AppSidebar above) — it's no longer a page-level floating
          overlay gated to the Home screen. */}

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
