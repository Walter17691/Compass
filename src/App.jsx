import { supabase } from './supabase';
import { useState, useRef, useEffect, useCallback } from "react";
import { MEETING_TYPES, SCREENS, SPEAKERS, NEXT_STEPS_MAP, DEV_MEETING_CONFIG, DEV_TEMPLATES, TEMPLATES, WELLBEING_RESOURCES, WELLBEING_TYPES, ROLE_PERMS } from './constants';
import { streamClaude } from './lib/streamClaude';
import { addWorkingDays } from './lib/dates';
import { ls, lsSet } from './lib/storage';
import { findEmployeeByName } from './lib/employeeRecords';
import { useFonts } from './hooks/useFonts';
import { CompassLogo } from './components/CompassLogo';
import { Badge, Btn, Card, SectionTitle } from './components/Primitives';
import { MDRenderer } from './components/MDRenderer';
import { SignaturePad } from './components/SignaturePad';
import { DateInput } from './components/DateInput';
import { AdjustmentForm } from './components/AdjustmentForm';
import { UserAddForm } from './components/UserAddForm';
import { AddRoleForm } from './components/AddRoleForm';
import { PeopleScreen } from './screens/PeopleScreen';
import { CasesScreen } from './screens/CasesScreen';
import { LetterScreen } from './screens/LetterScreen';
import { SearchScreen } from './screens/SearchScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { PrepScreen } from './screens/PrepScreen';
import { BriefScreen } from './screens/BriefScreen';
import { IntakeScreen } from './screens/IntakeScreen';
import { HomeMeetingScreen } from './screens/HomeMeetingScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { RecordScreen } from './screens/RecordScreen';
import { WellbeingScreen } from './screens/WellbeingScreen';
import { NewStarterScreen } from './screens/NewStarterScreen';
import { PersonViewScreen } from './screens/PersonViewScreen';
import { CaseViewScreen } from './screens/CaseViewScreen';
import { DevelopScreen } from './screens/DevelopScreen';
import { ErReportScreen } from './screens/ErReportScreen';
import { RedundancyScreen } from './screens/RedundancyScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { OnboardingWizard } from './screens/OnboardingWizard';
import { AskCompassWidget } from './screens/AskCompassWidget';
import { OrgSettingsModal } from './screens/OrgSettingsModal';
import { HandoffModal } from './screens/HandoffModal';
import { OutcomeModal } from './screens/OutcomeModal';

export default function Compass({ user=null, org=null, member=null, onSignOut=null }) {
  useFonts();

  // ── Navigation ──
  const [screen, setScreen] = useState(SCREENS.HOME);

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
  const [prepNotes, setPrepNotes] = useState("");
  const [reviewOutput, setReviewOutput] = useState("");
  const [letterOutput, setLetterOutput] = useState("");
  const [activeLetter, setActiveLetter] = useState("outcome");
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

  // ── Templates ──
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateSearch, setTemplateSearch] = useState("");

  // ── Developmental meetings ──
  const [devSession, setDevSession] = useState(null);
  const [devStep, setDevStep] = useState("self");
  const [devAiProcessing, setDevAiProcessing] = useState(false);
  const [devSummary, setDevSummary] = useState("");
  const [devLetter, setDevLetter] = useState("");

  // ── Audit trail ──
  const [auditLog, setAuditLog] = useState(ls("compass_audit", []));

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  // ── Multi-user profiles ──
  const [currentUser, setCurrentUser] = useState(member ? {...member, email: user?.email} : (user ? {name: user?.user_metadata?.name||user?.email, email: user?.email, role:"hr_manager"} : ls("compass_user", null)));
  const [orgRoles, setOrgRoles] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [showHandoffModal, setShowHandoffModal] = useState(false);
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
  const [editingEmployeeRecord, setEditingEmployeeRecord] = useState(false);
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [outcomeType, setOutcomeType] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [dashFilter, setDashFilter] = useState("all");
  const [showOrgSettings, setShowOrgSettings] = useState(false);

  const loadEmployeeRecords = async () => {
    if(!org?.id) return;
    try {
      const {data} = await supabase.from('employee_records').select('*').eq('org_id', org.id);
      if(data) setEmployeeRecords(data.map(r=>({name:r.name,jobTitle:r.job_title,startDate:r.start_date,location:r.location})));
    } catch(e) { console.error('loadEmployeeRecords', e); }
  };

  const saveEmployeeRecordToDB = async (name, fields) => {
    if(!org?.id) return;
    try {
      await supabase.from('employee_records').upsert({
        org_id: org.id,
        name,
        job_title: fields.jobTitle||null,
        start_date: fields.startDate||null,
        location: fields.location||null,
        updated_at: new Date().toISOString(),
      }, {onConflict: 'org_id,name'});
    } catch(e) { console.error('saveEmployeeRecord', e); }
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
  const [users, setUsers] = useState(ls("compass_users", []));

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
  const [meetingSetup, setMeetingSetup] = useState({employee:"", employeeJobTitle:"", manager:"", chairJobTitle:"", type:"", date:new Date().toISOString().split("T")[0], linkedCaseId:null, linkedCaseName:null});
  const [liveChatInput, setLiveChatInput] = useState("");
  const [editInstruction, setEditInstruction] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareProcessing, setShareProcessing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editProcessing, setEditProcessing] = useState(false);
  const [briefData, setBriefData] = useState(null);
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
  const [briefLoading, setBriefLoading] = useState(false);
  const [openCases, setOpenCases] = useState({});
  const [activeCaseId, setActiveCaseId] = useState(null);
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
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setSignId(id);
    setSignStatus("pending");
    const signId = id;

    // Note: saveMeetingToCase() is called after signature success
    // so we don't auto-save here (avoids duplicate / wrong case allocation)
    const appUrl = window.location.origin;
    
    // Store document in Supabase via API
    await fetch("/api/signing", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        signId,
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

    // Send email via Resend
    const res = await fetch("/api/send-for-signature", {
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
      alert("Signature request sent to "+employeeEmail);
      setShowSignModal(false);
      if(caseInfo._linkedCaseId) {
        saveMeetingToCase();
      } else {
        saveMeetingToCase();
        const cs = cases.find(x=>x.employeeName===caseInfo.employee?.trim());
        if(cs) { setActiveCaseId(cs.id); setActiveCaseStage("investigation"); setScreen(SCREENS.CASE_VIEW); }
        else setScreen(SCREENS.CASES);
      }
    } else {
      alert("Failed to send: "+JSON.stringify(data));
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
      const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
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
      const res = await fetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"},
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
  const [toasts, setToasts] = useState([]);
  // ── Supabase case sync ──
  const loadCasesFromDB = async () => {
    if(!org?.id) return;
    try {
      let query = supabase.from('cases').select('*').eq('org_id', org.id);
      // Location managers only see their location cases
      if(member?.role==='location_manager' && member?.location_ids?.length>0) {
        query = query.in('location_id', member.location_ids);
      }
      const { data, error } = await query;
  if(!error && data) {
        const mapped = data.map(row => ({
          id: row.id,
          employeeName: row.employee_name,
          email: row.employee_email || row.email || "",
          meetings: row.meetings || [],
          evidence: row.evidence || [],
          stage: row.stage || "open",
          caseType: row.case_type || "",
          description: row.description || "",
          dateReceived: row.date_received || "",
          urgency: row.urgency || "normal",
          outcome: row.outcome || "",
          investigationReport: row.investigation_report || null,
          investigationReportDate: row.investigation_report_date || null,
          disciplinaryOfficer: row.disciplinary_officer || null,
          disciplinaryOfficerId: row.disciplinary_officer_id || null,
          disciplinaryOfficerEmail: row.disciplinary_officer_email || null,
          investigatingManager: row.investigating_manager || null,
          handoffDate: row.handoff_date || null,
          nextSteps: row.next_steps || [],
          locationId: row.location_id || "",
          assignedTo: row.assigned_to,
          createdBy: row.created_by,
          createdAt: row.created_at,
        }));
        setCases(mapped);
      }
    } catch(e) { console.error("Load cases error:", e); }
  };

  const saveCaseToDB = async (caseObj) => {
    if(!org?.id) return;
    try {
      const payload = {
        id: caseObj.id.includes('-') ? caseObj.id : crypto.randomUUID(),
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
        location_id: caseObj.locationId || (member?.role==='location_manager'&&member?.location_ids?.[0])||null,
        assigned_to: user?.id || null,
        created_by: user?.id || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('cases').upsert(payload).select();
    } catch(e) { console.error("Save case error:", e); }
  };

  const deleteCaseFromDB = async (caseId) => {
    if(!org?.id) return;
    try {
      await supabase.from('cases').delete().eq('id', caseId);
    } catch(e) {}
  };

  useEffect(() => { if(org?.id) loadCasesFromDB(); }, [org?.id]);

  // ── Team members ──
  const loadTeamMembers = async () => {
    if(!org?.id) return;
    const { data } = await supabase.from('org_members').select('*').eq('org_id', org.id);
    if(data) setTeamMembers(data);
  };

  const removeMember = async (member) => {
    if(!window.confirm("Remove "+member.name+" from the team?")) return;
    try {
      const r = await fetch("/api/delete-member", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ userId: member.user_id, orgMemberId: member.id, locationIds: member.location_ids||[] })
      });
      const d = await r.json();
      if(d.success) setTeamMembers(m=>m.filter(x=>x.id!==member.id));
      else alert("Error: "+d.error);
    } catch(e) { alert("Error: "+e.message); }
  };

  const updateMemberRole = async (memberId, role) => {
    await supabase.from("org_members").update({role}).eq("id", memberId);
    setTeamMembers(m=>m.map(x=>x.id===memberId?{...x,role}:x));
  };

  const assignLocations = async (memberId, locationIds) => {
    await supabase.from("org_members").update({location_ids: locationIds}).eq("id", memberId);
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
    } catch(e) { alert("Error: "+e.message); }
    setInviting(false);
  };

  // ── Locations ──
  const loadLocations = async () => {
    if(!org?.id) return;
    const { data } = await supabase.from('locations').select('*').eq('org_id', org.id);
    if(data) setLocations(data);
  };

  const addLocation = async (name) => {
    if(!org?.id||!name.trim()) return;
    const { data } = await supabase.from('locations').insert({ org_id: org.id, name: name.trim() }).select().single();
    if(data) setLocations(l=>[...l, data]);
  };

  const deleteLocation = async (id) => {
    await supabase.from('locations').delete().eq('id', id);
    setLocations(l=>l.filter(x=>x.id!==id));
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
    const { data } = await supabase.from('hr_review_requests').insert({
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
    }
  };

  const respondToReview = async (reviewId, status, comments) => {
    const { data } = await supabase.from('hr_review_requests').update({
      status,
      comments,
      reviewed_by: user?.id,
      reviewed_by_name: member?.name||user?.email,
      reviewed_at: new Date().toISOString()
    }).eq('id', reviewId).select().single();
    if(data) setHrReviewRequests(r=>r.map(x=>x.id===reviewId?data:x));
  };

  const isHR = member?.role==='hr_director'||member?.role==='hr_manager';

  useEffect(()=>{ if(org?.id){ loadLocations(); loadHrReviews(); loadOrgRoles(); loadOrgMembers(); loadEmployeeRecords(); loadTeamMembers(); loadStarterInstances(); } }, [org?.id]);

  useEffect(()=>{
    if(screen===SCREENS.RECORD && transcript.length>0 && transcript.length%3===0) {
      const notes = transcript.map(u=>u.text).join(" ");
      updateLiveContext(notes);
    }
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
  };

  const createCaseFromChat = () => {
    if(!casePromptName.trim()) return;
    const newCase = {
      id: Date.now().toString(),
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
      const res = await fetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"},
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
  const [toast, setToast] = useState(null);

  const showToast = (message, type="success") => {
    setToast({message, type});
    setTimeout(()=>setToast(null), 3000);
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
  const [activeStarter, setActiveStarter] = useState(null);
  const [starterView, setStarterView] = useState("list");
  const [starterAiProcessing, setStarterAiProcessing] = useState(false);
  const [newStarterForm, setNewStarterForm] = useState({name:"",role:"",department:"",manager:"",email:"",startDate:"",templateId:"default"});

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

  // Refs
  const feedRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenRecRef = useRef(null);
  const letterheadRef = useRef(null);
  const wordTemplateRef = useRef(null);
  const policyFileRef = useRef(null);
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
  const audit = (action, detail="") => {
    const entry = {
      id: Date.now().toString(),
      ts: new Date().toISOString(),
      user: currentUser?.name || "HR Manager",
      action,
      detail,
    };
    setAuditLog(p => {
      const updated = [entry, ...p].slice(0, 500); // keep last 500
      lsSet("compass_audit", updated);
      return updated;
    });
  };

  // ── Users ──
  const saveUsers = u => { setUsers(u); lsSet("compass_users", u); };
  const addUser = (name, role, email) => {
    const u = {id:Date.now().toString(), name, role, email, createdAt:new Date().toISOString()};
    const updated = [...users, u];
    saveUsers(updated);
    return u;
  };
  // ── Deadline checker — UK statutory & ACAS deadlines ──
  useEffect(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = [];

    const workingDaysFromDate = (dateStr, days) => {
      let start;
      if(dateStr && dateStr.includes('/')) { const p=dateStr.split('/'); start=new Date(p[2],p[1]-1,p[0]); }
      else { start=new Date(dateStr); }
      if(isNaN(start)) return null;
      let count=0; let d=new Date(start);
      while(count<days){ d.setDate(d.getDate()+1); const day=d.getDay(); if(day!==0&&day!==6) count++; }
      return d;
    };

    const addDeadline = (employeeName, label, deadlineDate, category, key) => {
      if(!deadlineDate||isNaN(deadlineDate)) return;
      deadlineDate.setHours(0,0,0,0);
      const diff = Math.ceil((deadlineDate-today)/(1000*60*60*24));
      if(diff<=14) due.push({employeeName,label,category,key,deadlineDate:deadlineDate.toLocaleDateString("en-GB"),daysLeft:Math.max(0,diff),overdue:diff<0});
    };

    cases.forEach(cs => {
      if(getCaseStage(cs)==="closed") return;
      const meetings = cs.meetings||[];
      const evidence = cs.evidence||[];

      // Manual next steps
      meetings.forEach(m => {
        (m.nextSteps||[]).filter(s=>!s.done&&s.deadline).forEach(s => {
          const parts=s.deadline.split("/");
          const dl=parts.length===3?new Date(parts[2],parts[1]-1,parts[0]):new Date(s.deadline);
          addDeadline(cs.employeeName, s.step||"Next step due", dl, "next_step", `${cs.id}:nextstep:${m.id}:${s.step}`);
        });
      });

      // Disciplinary outcome — 5 working days from hearing
      const discMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("disciplinary")&&!(m.type||"").toLowerCase().includes("investigation"));
      discMeetings.forEach(m => {
        const hasOutcome = cs.outcome||meetings.some(mt=>mt.letterOutput&&(mt.type||"").toLowerCase().includes("outcome"));
        if(!hasOutcome) {
          const dl = workingDaysFromDate(m.savedAt||m.date, 5);
          if(dl) addDeadline(cs.employeeName, "Disciplinary outcome letter due (ACAS: 5 working days)", dl, "outcome", `${cs.id}:outcome`);
        }
      });

      // Appeal window — 5 working days from outcome letter
      const outcomeLetters = meetings.filter(m=>m.letterOutput&&(m.type||"").toLowerCase().includes("disciplinary"));
      outcomeLetters.forEach(m => {
        const dl = workingDaysFromDate(m.savedAt||m.date, 5);
        if(dl) addDeadline(cs.employeeName, "Employee appeal window closes (ACAS: 5 working days)", dl, "appeal", `${cs.id}:appeal:${m.id}`);
      });

      // Investigation overrunning — 28 days
      if((cs.stage==="investigation"||getCaseStage(cs)==="investigation")&&!cs.investigationReport) {
        const invMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("investigation"));
        if(invMeetings.length>0) {
          const first = invMeetings[0];
          const startStr = first.savedAt||first.date;
          if(startStr) {
            let start; if(startStr.includes('/')) { const p=startStr.split('/'); start=new Date(p[2],p[1]-1,p[0]); } else start=new Date(startStr);
            const daysSince = Math.ceil((today-start)/(1000*60*60*24));
            if(daysSince>21) { const dl=new Date(start); dl.setDate(dl.getDate()+28); addDeadline(cs.employeeName,"Investigation overrunning — consider concluding (ACAS guidance)",dl,"investigation",`${cs.id}:investigation`); }
          }
        }
      }

      // Grievance acknowledgement — 5 working days from receipt
      if((cs.caseType||"").toLowerCase()==="grievance"&&meetings.length===0&&cs.dateReceived) {
        const dl = workingDaysFromDate(cs.dateReceived, 5);
        if(dl) addDeadline(cs.employeeName, "Grievance acknowledgement due (ACAS: 5 working days)", dl, "grievance", `${cs.id}:grievance`);
      }

      // Pending signature chase — 7 days
      evidence.filter(e=>e.signStatus==="pending"&&e.signId).forEach(e => {
        const sent=e.sentAt||e.date;
        if(sent) {
          const sentDate=new Date(sent);
          const daysPending=Math.ceil((today-sentDate)/(1000*60*60*24));
          if(daysPending>7) { const dl=new Date(sentDate); dl.setDate(dl.getDate()+7); addDeadline(cs.employeeName,"Signature pending "+daysPending+" days — consider chasing",dl,"signature",`${cs.id}:signature:${e.id||e.signId}`); }
        }
      });
    });

    due.sort((a,b)=>{ if(a.overdue&&!b.overdue) return -1; if(!a.overdue&&b.overdue) return 1; return a.daysLeft-b.daysLeft; });
    setDueSoon(due);
  }, [cases]);

  // ── Calendar integration (Google Calendar) ──
  const [calendarConnected, setCalendarConnected] = useState(false);
  useEffect(() => {
    if(!user?.id) return;
    fetch(`/api/calendar/status?userId=${encodeURIComponent(user.id)}`)
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
      fetch("/api/calendar/sync", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ userId: user.id, deadlines: dueSoon }),
      }).catch(e => console.error("Calendar sync failed:", e));
    }, 3000);
    return () => clearTimeout(timeout);
  }, [dueSoon, calendarConnected, user?.id]);
  const connectGoogleCalendar = () => {
    if(!user?.id || !org?.id) return;
    window.location.href = `/api/calendar/oauth-start?userId=${encodeURIComponent(user.id)}&orgId=${encodeURIComponent(org.id)}`;
  };
  const disconnectGoogleCalendar = async () => {
    if(!user?.id) return;
    try {
      await fetch("/api/calendar/disconnect", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ userId: user.id }),
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
          body: `${d.caseName}: "${d.step}" due ${d.daysLeft===0?"today":"tomorrow"}`,
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
    });
    setSearchResults(results.slice(0, 30));
  };

  // ── GDPR helpers ──
  const exportAllData = () => {
    const data = { cases, policies:policies.map(p=>({...p,content:"[truncated]"})), auditLog, users, adjustments, exportedAt:new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="compass_data_export.json"; a.click();
    URL.revokeObjectURL(url);
    audit("Data exported (GDPR)");
  };
  const deleteAllData = () => {
    if(!window.confirm("This will permanently delete ALL Compass data. This cannot be undone.")) return;
    ["compass_cases","compass_policies","compass_whistle","compass_audit","compass_users","compass_user","compass_vault","compass_adjustments","compass_signature","compass_letterhead","compass_word_template","compass_starters","compass_starter_templates"].forEach(k=>localStorage.removeItem(k));
    try { window.location.reload(); } catch(e) {}
  };

  // ── New starter helpers ──
  const saveStarterInstances = u => { setStarterInstances(u); lsSet("compass_starters", u); };
  const saveStarterTemplates = u => { setStarterTemplates(u); lsSet("compass_starter_templates", u); };

  const loadStarterInstances = async () => {
    if(!org?.id) return;
    try {
      const {data} = await supabase.from('starter_instances').select('*').eq('org_id', org.id);
      if(data) setStarterInstances(data.map(r=>({
        id:r.id, name:r.name, role:r.role, department:r.department, manager:r.manager,
        email:r.email, startDate:r.start_date, templateId:r.template_id, templateName:r.template_name,
        tasks:r.tasks||[], aiCustomised:r.ai_customised, createdBy:r.created_by, createdAt:r.created_at,
      })));
    } catch(e) { console.error('loadStarterInstances', e); }
  };

  const saveStarterInstanceToDB = async (instance) => {
    if(!org?.id) return;
    try {
      await supabase.from('starter_instances').upsert({
        id: instance.id,
        org_id: org.id,
        name: instance.name, role: instance.role||null, department: instance.department||null,
        manager: instance.manager||null, email: instance.email||null, start_date: instance.startDate||null,
        template_id: instance.templateId||null, template_name: instance.templateName||null,
        tasks: instance.tasks||[], ai_customised: !!instance.aiCustomised, created_by: instance.createdBy||null,
        updated_at: new Date().toISOString(),
      });
    } catch(e) { console.error('saveStarterInstanceToDB', e); }
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
    saveStarterInstances([...starterInstances, instance]);
    saveStarterInstanceToDB(instance);
    setActiveStarter(instance);
    setStarterView("instance");
    setNewStarterForm({name:"",role:"",department:"",manager:"",email:"",startDate:"",templateId:"default"});
    audit("New starter created", f.name+" — "+f.role);
  };

  const toggleStarterTask = (instanceId, taskId) => {
    const updated = starterInstances.map(s => s.id===instanceId ? {
      ...s, tasks: s.tasks.map(t => t.id===taskId ? {...t, done:!t.done, doneAt:t.done?null:new Date().toISOString()} : t)
    } : s);
    saveStarterInstances(updated);
    const changed = updated.find(s=>s.id===instanceId);
    saveStarterInstanceToDB(changed);
    setActiveStarter(changed);
  };

  const updateStarterTaskNote = (instanceId, taskId, note) => {
    const updated = starterInstances.map(s => s.id===instanceId ? {
      ...s, tasks: s.tasks.map(t => t.id===taskId ? {...t, note} : t)
    } : s);
    saveStarterInstances(updated);
    const changed = updated.find(s=>s.id===instanceId);
    saveStarterInstanceToDB(changed);
    setActiveStarter(changed);
  };

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
        return { ...t, id:"ai_"+Date.now()+i, phaseId:t.phase?.toLowerCase().replace(/\s/g,"_")||"w1", phaseLabel:t.phase||"Week 1", dueDate:due.toLocaleDateString("en-GB"), done:false, doneAt:null, note:"" };
      });
      const updated = starterInstances.map(s => s.id===instance.id ? {...s, tasks:[...s.tasks, ...newTasks], aiCustomised:true} : s);
      saveStarterInstances(updated);
      const changed = updated.find(s=>s.id===instance.id);
      saveStarterInstanceToDB(changed);
      setActiveStarter(changed);
      audit("AI customised checklist", instance.name+" — "+instance.role);
    } catch(e) { alert("Could not customise: "+e.message); }
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
        e.id===empId ? {
          ...e,
          scores: {...(e.scores||{}), [criterionId]:score},
          totalScore: activeRedundancy.selectionCriteria.reduce((total,c) => {
            const s = c.id===criterionId ? score : ((e.scores||{})[c.id]||0);
            return total + (s * c.weight/100);
          }, 0).toFixed(1)
        } : e
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
  const saveWellbeingNotes = u => { setWellbeingNotes(u); lsSet("compass_wellbeing", u); };

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
    setWellbeingForm({employeeName:"",type:"chat",date:"",manager:"",content:"",followUpDate:"",supportOffered:"",confidential:true});
    setWellbeingView("employee");
    setActiveWellbeing(f.employeeName);
    audit("Wellbeing note added (confidential)", f.employeeName);
  };

  const toggleFollowUpDone = (noteId) => {
    saveWellbeingNotes(wellbeingNotes.map(n => n.id===noteId ? {...n,followUpDone:!n.followUpDone} : n));
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

  // First use — show onboarding and GDPR
  useEffect(() => {
    if(!gdprAccepted) setShowGdpr(true);
    else if(!onboardDone) { setShowOnboard(true); setOnboardStep(0); }
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
      const result = await streamClaude(
        `UK HR meeting transcription. Two speakers: "${caseInfo.manager||"HR Manager"}" (chair) and "${caseInfo.employee||"Employee"}" (employee). Attribute each utterance. Return JSON only: [{"speaker":"NAME","text":"..."}]. Use exact names.`,
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
    setMeetingType(type); setTranscript([]); setPrepNotes(""); setReviewOutput(""); setLetterOutput("");
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
    setScreen(SCREENS.REVIEW); setReviewOutput(""); setAiError(""); setRiskScore(null); setPrediction("");
    setAiProcessing(true);
    // Generate next steps deadlines
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
      await streamClaude(
        `You are a senior UK HR documentation specialist. Generate a meeting record with EXACTLY these three sections and NO others: ## Meeting Details (date, type, attendees, purpose), ## Meeting Dialogue (what was said, in concise prose), ## HR Advisor Notes (expert legal guidance in flowing prose from a senior employment lawyer - one paragraph covering ACAS compliance, legal risks and recommended next steps). Do NOT add any other sections like Key Points, Next Steps, Summary, Actions, Risk Assessment or anything else. Three sections only. No bold, no emoji, no tables.${policies.length?" Reference company policies by name.":""} IMPORTANT: In the Meeting Dialogue section, prefix every line with initials only. Chair ${caseInfo.manager||"HR Manager"} = ${(caseInfo.manager||"HR Manager").split(" ").map(w=>w[0].toUpperCase()).join("")}. Employee ${caseInfo.employee||"Employee"} = ${(caseInfo.employee||"Employee").split(" ").map(w=>w[0].toUpperCase()).join("")}. Use ONLY these initials, never full names in the dialogue.`,
        `${meetingType?.label} meeting. Employee: ${caseInfo.employee}${caseInfo.employeeJobTitle?" ("+caseInfo.employeeJobTitle+")":(employeeRecords||[]).find(r=>r.name===caseInfo.employee)?.jobTitle?" ("+((employeeRecords||[]).find(r=>r.name===caseInfo.employee)?.jobTitle)+")":" "}. Date: ${caseInfo.date||"today"}. Chair: ${caseInfo.manager||"Unknown"}${caseInfo.chairJobTitle?" ("+caseInfo.chairJobTitle+")":(orgMembers||[]).find(m=>m.name===caseInfo.manager)?.job_title?" ("+((orgMembers||[]).find(m=>m.name===caseInfo.manager)?.job_title)+")":" "}. Start time: ${meetingStartTime||"Unknown"}. End time: ${meetingEndTime||meetingEndTimeVal||"Unknown"}${adjournments.length>0?" Adjournments: "+adjournments.map(a=>a.start+(a.end?" to "+a.end:"- ongoing")+(a.reason?" ("+a.reason+")":"")).join(", "):""}. Notetaker: ${caseInfo.notetaker||"Not specified"}. Other participants: ${participants.map(p=>p.name+" ("+p.role+")").join(", ")||"none listed"}${getPolicyCtx()}\n\nTRANSCRIPT:\n${tx}\n\nPlease produce the following sections:\n\n## Meeting Details\nInclude these fields on separate lines:\n- Type: [meeting type]\n- Date: [date]\n- Start time: [start time]\n- End time: [end time]${adjournments.length>0?"\n- Adjournments: [list each adjournment with times and reason]":""}\n- Chair: [chair name and job title]\n- Notetaker: [notetaker name or "Not specified"]\n- Employee: [employee name and job title]\n- Other participants: [any others or "None"]\n- Purpose: [write 1-2 sentences on the same line explaining why this meeting was held]\n\n## Meeting Dialogue\nRewrite as a clean readable conversation. Each line must start with the speaker\'s INITIALS followed by a colon (e.g. if chair is "${caseInfo.manager||"HR Manager"}" use initials "${(caseInfo.manager||"HR Manager").split(" ").map(w=>w[0]).join("")}:" and if employee is "${caseInfo.employee||"Employee"}" use initials "${(caseInfo.employee||"Employee").split(" ").map(w=>w[0]).join("")}:"). Fix any typos. One line per utterance.\n\n## Key Points\n## Employee Position\n## Management Position\n## Procedural Checks\n## Actions & Next Steps`,
        t=>setReviewOutput(t)
      );
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

  const runRiskScore = async () => {
    if(!reviewOutput && !transcript.length) return;
    setRiskProcessing(true);
    try {
      const tx = reviewOutput || transcript.slice(-40).map(u=>u.text).join("\n");
      const res = await fetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({model:"claude-sonnet-4-6", max_tokens:300, stream:false,
          system:'UK employment law risk specialist. Respond ONLY with valid JSON, no other text: {"rating":"HIGH","summary":"two or three plain English sentences"} Rating must be HIGH, MEDIUM or LOW.',
          messages:[{role:"user", content:"Meeting: "+(meetingType?.label||"General")+"\nEmployee: "+(caseInfo.employee||"Unknown")+"\nContent:\n"+tx.slice(0,3000)}]})});
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      setRiskScore(JSON.parse(text.replace(/```json|```/g,"").trim()));
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
        (()=>{
          const tmpl = getLetterTemplate(t);
          if(tmpl) return "Fill in ONLY the placeholders in [brackets] in this template using the meeting information. Keep the exact structure. Output only the completed letter.\n\nTEMPLATE:\n" + tmpl + "\n\nMEETING INFO:\nEmployee: " + (caseInfo.employee||"") + "\nChair: " + (caseInfo.manager||"") + "\nDate: " + (caseInfo.date||"") + "\nType: " + (meetingType?.label||"") + "\nSummary:\n" + (tx||reviewOutput||"");
          return (prompts[t]||prompts.outcome) + "\nEmployee: " + (caseInfo.employee||"") + "\nChair: " + (caseInfo.manager||"") + "\nDate: " + (caseInfo.date||"") + "\nParticipants: " + (participants.map(p=>p.name+" ("+p.role+")").join(", ")||"N/A") + (getPolicyCtx()) + "\n\nMeeting summary:\n" + (tx||reviewOutput||"");
        })(),
        t2=>setLetterOutput(t2)
      );
    } catch(e) { setAiError(e.message); }
    setAiProcessing(false);
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
    if(existing) {
      saveCases(cases.map(c=>c.id===existing.id?{...c,meetings:[...c.meetings,meeting]}:c));
    } else {
      saveCases([...cases,{id:Date.now().toString(), employeeName:caseInfo.employee, email:caseInfo.email, createdAt:new Date().toISOString(), meetings:[meeting]}]);
    }
    audit("Meeting saved", `${caseInfo.employee} — ${meetingType?.label}`);
    showToast("Meeting saved to case file");
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
      try { const d=await generatePDF(sig); d.save(fileName); } catch(e){alert(e.message);}
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
          alert(`The letter has been downloaded as "${fileName}".\n\nPlease attach it to the email that just opened.`);
        },1000);
      } catch(e){alert(e.message);}
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
      } catch(err){alert("Could not read "+file.name);}
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
    const csv = rows.map(r=>r.map(v=>'"'+String(v).split('"').join('\"\"')+'"').join(",")).join("\n");
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

  const handleLetter = async type => {
    const t = type||"outcome"; setActiveLetter(t); setAiError("");
    setAiProcessing(true); setScreen(SCREENS.LETTER); setLetterOutput("");
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
      ].filter(Boolean).join(nl);

      const letterInstructions = {
        "invite": "a formal invitation letter to a "+(meetingType?.label||"meeting")+". Include: reason for the meeting, proposed date/time/location placeholders, list of allegations or agenda items (infer from context if available), right to be accompanied by a colleague or trade union rep under ERA 1999 s.10, and how to respond. Follow ACAS Code of Practice.",
        "outcome": "a formal outcome letter following a "+(meetingType?.label||"disciplinary hearing")+". Include: summary of what was discussed, decision reached (infer from context or use [Decision]), reasons for the decision, any sanction imposed (e.g. [First Written Warning] lasting [duration]), right of appeal within 5 working days. Follow ACAS Code of Practice.",
        "appeal": "a formal appeal outcome letter. Include: grounds of appeal considered, outcome of the appeal, reasons, whether original decision is upheld or overturned, confirmation this is the final stage. Follow ACAS Code of Practice.",
        "investigation-report": "a formal investigation report. Include: background and reason for investigation, allegations investigated, investigation process and evidence reviewed (infer from meeting record), findings for each allegation (upheld/not upheld), overall recommendation (case to answer/no case to answer). This is an internal HR document, not a letter to the employee. Write in formal report style with clear sections.","no-case-answer": "a formal letter to the employee confirming no case to answer. Include: that an investigation has been completed, that no further action will be taken, that the matter is now closed, and that the record will be kept confidential. Warm but professional tone.","grievance": "a formal grievance outcome letter. Include: summary of grievance raised, investigation findings, outcome and reasons, right of appeal. Follow ACAS Code of Practice.",
        "warning": "a formal written warning letter. Include: nature of misconduct, previous warnings if any, expected improvement, review period, consequence of further misconduct, right of appeal. Follow ACAS Code of Practice.",
        "dismissal": "a formal dismissal letter. Include: reason for dismissal, date employment ends, notice period or payment in lieu, final pay arrangements, right of appeal within 5 working days. Follow ERA 1996 and ACAS Code of Practice.",
      };

      const instruction = letterInstructions[t] || letterInstructions["outcome"];

      const systemPrompt = "You are a senior UK employment lawyer and HR advisor with 20 years of experience. Draft complete, professional HR correspondence that is legally sound and follows ACAS Code of Practice and relevant UK employment legislation. Always produce a complete letter — never refuse or ask for more information. Where specific details are unknown, use clear placeholders in square brackets such as [Employee Address], [Date of Hearing], [Appeal Officer Name and Job Title], [Company Name]. The letter should read naturally and professionally. Output only the letter itself with no preamble, explanation or sign-off instructions.";

      const userPrompt = "Draft "+instruction+nl+nl+"Available information:"+nl+context+nl+nl+"Important: Use [placeholder] format for any missing details. Today's date for reference: "+new Date().toLocaleDateString("en-GB")+". Always complete the full letter.";

      const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
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


  const generateBrief = async (empName, mtLabel) => {
    setBriefLoading(true);
    setBriefData(null);
    const empCases = cases.filter(x=>x.employeeName===empName);
    const meetings = empCases.flatMap(x=>x.meetings||[]).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const lastRisk = meetings.find(m=>m.riskScore?.rating)?.riskScore?.rating||"Unknown";
    const nl = String.fromCharCode(10);
    const history = meetings.slice(0,5).map(m=>m.date+": "+m.type+" - "+(m.record||"").slice(0,150)).join(nl);
    try {
      const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:350,stream:false,
          system:"You are a UK HR advisor. Write in plain prose only. No markdown, no asterisks, no hashes, no emojis, no horizontal rules, no bold. Use clean numbered sections with short bullet points using a simple dash character.",
          messages:[{role:"user",content:"Prepare a brief for a "+mtLabel+" meeting with "+empName+"."+nl+"Previous meetings: "+history+nl+"Risk level: "+lastRisk+nl+nl+"Write three sections:"+nl+"1. Key context from previous meetings (2-3 bullets)"+nl+"2. Procedural or legal risks to watch for today (2-3 bullets)"+nl+"3. Specific questions the chair should ask (3 bullets)"+nl+nl+"Plain text only. Short bullet points with a dash. No markdown, no asterisks."}]
        })});
      const d = await res.json();
      const txt = (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      setBriefData({txt,empName,mtLabel,lastMeeting:meetings[0],count:meetings.length,lastRisk});
    } catch(e){}
    setBriefLoading(false);
  };

  const editRecord = async (instruction) => {
    if(!instruction.trim()||!reviewOutput) return;
    setEditProcessing(true);
    try {
      const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
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
      await fetch("/api/send-letter",{method:"POST",headers:{"Content-Type":"application/json"},
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
      const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
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

    if(cs.status === "closed") return {label:"Closed", color:"#6B6375", bg:"#F5F1EA"};
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


  const CASE_STAGES = [
    {id:"intake",        label:"Case opened",           icon:"📋"},
    {id:"investigation", label:"Investigation",          icon:"🔍"},
    {id:"inv_report",    label:"Investigation report",   icon:"📄"},
    {id:"disciplinary",  label:"Disciplinary hearing",   icon:"⚖️"},
    {id:"outcome",       label:"Outcome letter",         icon:"✉️"},
    {id:"appeal",        label:"Appeal",                 icon:"🔄"},
    {id:"closed",        label:"Closed",                 icon:"✓"},
  ];

  const getCaseStage = (cs) => {
    const meetings = cs.meetings||[];
    const types = meetings.map(m=>(m.type||"").toLowerCase());
    const hasOutcome = meetings.some(m=>m.letterOutput);
    const hasSigned = meetings.some(m=>m.signStatus==="signed");
    const hasInvReport = cs.investigationReport;
    if(cs.stage==="closed") return "closed";
    if(hasSigned&&hasOutcome) return "closed";
    if(cs.stage) return cs.stage;
    if(types.some(t=>t.includes("appeal"))) return "appeal";
    if(hasOutcome) return "outcome";
    if(types.some(t=>t.includes("disciplinary"))) return "disciplinary";
    if(hasInvReport) return "inv_report";
    if(types.some(t=>t.includes("investigation"))) return "investigation";
    if(meetings.length>0) return "investigation";
    return "intake";
  };

  const getNextStep = (cs) => {
    if(getCaseStage(cs)==="closed") return null;
    const stage = getCaseStage(cs);
    const meetings = cs.meetings||[];
    const invMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("investigation"));
    const discMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("disciplinary"));
    const appealMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("appeal"));
    const lastInv = invMeetings[invMeetings.length-1];
    const lastDisc = discMeetings[discMeetings.length-1];
    const lastAppeal = appealMeetings[appealMeetings.length-1];
    const hasDiscOutcome = discMeetings.some(m=>m.letterOutput);
    const hasAppealOutcome = appealMeetings.some(m=>m.letterOutput);
    const hasOutcome = hasDiscOutcome;

    switch(stage) {
      case "intake":
        return {label:"Schedule investigation meeting", action:"start_investigation", primary:true};
      case "investigation":
        if(!lastInv?.record) return {label:"Start investigation meeting", action:"start_investigation", primary:true};
        if(lastInv?.signStatus!=="signed") return {label:"Send investigation record for signature", action:"send_signature", primary:true};
        return {label:"Generate investigation report", action:"inv_report", primary:true};
      case "inv_report":
        return {label:"Proceed to disciplinary — send invitation", action:"disciplinary_invite", primary:true, secondary:{label:"No case to answer — close", action:"close_no_case"}};
      case "disciplinary":
        if(!lastDisc?.record) return {label:"Start disciplinary hearing", action:"start_disciplinary", primary:true};
        if(lastDisc?.signStatus!=="signed") return {label:"Send hearing record for signature", action:"send_signature", primary:true};
        if(!hasDiscOutcome) return {label:"Draft outcome letter", action:"outcome_letter", primary:true};
        return {label:"Outcome issued — close or appeal", action:"post_outcome", primary:true};
      case "outcome":
        return {label:"Close case", action:"close_case", primary:true};
      case "appeal":
        if(!lastAppeal?.record) return {label:"Start appeal hearing", action:"start_appeal_meeting", primary:true};
        if(lastAppeal?.signStatus!=="signed") return {label:"Send appeal record for signature", action:"send_signature", primary:true};
        if(!hasAppealOutcome) return {label:"Draft appeal outcome letter", action:"appeal_letter", primary:true};
        return {label:"Appeal outcome issued — close case", action:"close_case", primary:true};
      case "closed":
        return null;
      case "outcome":
        return null;
      default:
        return null;
    }
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
    <div style={{fontFamily:"DM Sans,system-ui,sans-serif",minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1A1535"}}>
      <style>{`
        *{box-sizing:border-box;}::selection{background:#7C5CFC33;}
        input,textarea{font-family:DM Sans,system-ui,sans-serif;color:#F2EDE4;}
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
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
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
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:isMobile?"calc(100vw - 32px)":480}}>
            <div style={{fontSize:11,color:"#7C5CFC",fontWeight:600,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Appeal detected</div>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>Link to an existing case?</h3>
            <p style={{fontSize:13,color:"#6B6375",marginBottom:20}}>This looks like an appeal. Would you like to link it to an existing case so the full proceeding is tracked together?</p>
            {cases.length>0?(
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                {cases.map(cs=>(
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
                      riskScore,
                      nextSteps,
                      prediction,
                      letterTracking: {},
                      savedAt: new Date().toISOString(),
                      savedBy: currentUser?.name||"HR Manager",
                      signId, signStatus,
                    };
                    saveCases(cases.map(x=>x.id===cs.id?{...x,meetings:[...x.meetings,meeting]}:x));
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
              <div style={{fontSize:13,color:"#6B6880",marginBottom:16}}>No existing cases found.</div>
            )}
            <Btn variant="ghost" onClick={()=>{setShowLinkCase(false);setAppealDetected(false);appealDetectedRef.current=false;}} style={{width:"100%"}}>Skip</Btn>
          </div>
        </div>
      )}

      {showLetterModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
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
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
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
                  const r = await fetch("/api/send-letter",{method:"POST",headers:{"Content-Type":"application/json"},
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
                  else alert("Failed: "+d.error);
                } catch(e){ alert("Error: "+e.message); }
              }} disabled={!emailLetterTo.includes("@")} style={{flex:1}}>Send email</Btn>
              <Btn variant="ghost" onClick={()=>{setShowEmailLetter(false);setEmailLetterTo("");}} style={{flex:1}}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {inviteLink&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
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
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
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
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#FFFFFF",borderRadius:16,padding:28,width:"100%",maxWidth:520,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div>
                <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820",fontWeight:400}}>New case</div>
                <div style={{fontSize:12,color:"#9B9098",marginTop:2}}>Log a new HR case and employee details</div>
              </div>
              <button onClick={closeCasePrompt} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9B9098",lineHeight:1}}>×</button>
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
                  {["Misconduct","Grievance","Performance","Absence","Redundancy","Appeal","Other"].map(t=><option key={t} value={t.toLowerCase()}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Description */}
            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:5}}>Brief description <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              <textarea value={newCaseDescription} onChange={e=>setNewCaseDescription(e.target.value)} placeholder="Brief summary of the issue…" rows={2} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
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
                    stage: "open",
                    meetings: [],
                    evidence: [],
                    urgency: "normal",
                    jobTitle: newCaseJobTitle,
                    startDate: newCaseStartDate,
                    location: newCaseLocation==="__other__"?newCaseLocationOther:newCaseLocation,
                  };
                  saveCases([...cases, newCase]);
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
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:3000,background:toast.type==="error"?"#FEF0EB":"#FFFFFF",border:`1px solid ${toast.type==="error"?"#E8622A44":"#7C5CFC44"}`,borderRadius:10,padding:"14px 20px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 8px 32px rgba(0,0,0,0.4)",animation:"slideIn 0.2s ease"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:toast.type==="error"?"#E8622A":"#7C5CFC",flexShrink:0}}/>
          <span style={{fontSize:14,color:"#1A1535"}}>{toast.message}</span>
        </div>
      )}

      {/* ── GDPR consent modal ── */}
      {showGdpr && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{maxWidth:520,width:"100%"}}>
            <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#7C5CFC",marginBottom:8,fontWeight:600}}>Data &amp; privacy</div>
            <p style={{fontSize:13,color:"#6B6375",lineHeight:1.8,marginBottom:16}}>
              Compass stores case files, employee records and organisation settings in a secure cloud database, shared with your organisation. Uploaded policies, your signature/letterhead and the audit log stay in this browser only. Meeting text is sent to Anthropic's API to generate outputs.
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
              <Btn onClick={()=>{setGdprAccepted(true);lsSet("compass_gdpr",true);setShowGdpr(false);if(!onboardDone){setShowOnboard(true);setOnboardStep(0);}}}>I understand — continue</Btn>
            </div>
          </Card>
        </div>
      )}

      {/* ── Onboarding overlay ── */}
      {showOnboard && !showGdpr && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1900,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
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


      {/* ── HEADER ── */}
      <header style={{display:screen===SCREENS.HOME?"none":"flex",display:screen===SCREENS.HOME?"none":"flex",background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",position:"sticky",top:0,zIndex:99}}>
        <div style={{maxWidth:1440,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:52}}>
          
          {/* Logo */}
          <button onClick={()=>setScreen(SCREENS.HOME)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",padding:0,cursor:"pointer",flexShrink:0}}>
            <CompassLogo size={32}/>
            <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:17,color:"#1A1535",letterSpacing:"-0.2px"}}>Compass</span>
          </button>

          {/* Nav - always show main nav */}
          {(
            <nav style={{display:"flex",alignItems:"center",gap:2}}>
              {[
                {s:SCREENS.HOME, l:"Home"},
                {s:SCREENS.CASES, l:"Cases"+(cases.filter(x=>x.stage!=="closed").length>0?" ("+cases.filter(x=>x.stage!=="closed").length+")":"")},
                {s:SCREENS.PEOPLE, l:"People"},
                {s:SCREENS.ERREPORT, l:"Reports"},
                {s:SCREENS.SEARCH, l:"Search"},
                {s:SCREENS.SETTINGS, l:"Settings"},
              ].map(({s,l,badge})=>(
                <button key={s} onClick={()=>setScreen(s)}
                  style={{background:screen===s?"#F5F3FF":"none",border:"none",color:screen===s?"#7C5CFC":"#6B6375",padding:"6px 14px",borderRadius:6,fontSize:13,fontWeight:screen===s?600:400,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",display:"flex",alignItems:"center",gap:5}}>
                  {l}
                  {badge&&<span style={{background:"#C84B2F",color:"#fff",borderRadius:"50%",width:17,height:17,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>{badge}</span>}
                </button>
              ))}
            </nav>
          )}

          {/* Meeting indicator */}
          {meetingType&&(
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,color:"#9B9098"}}>{meetingType.label}</span>
              {caseInfo.employee&&<span style={{background:"#EDE8FF",color:"#7C5CFC",borderRadius:12,padding:"2px 10px",fontSize:11,fontWeight:600}}>{caseInfo.employee}</span>}
            </div>
          )}

          {/* Right side */}
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            {org?.name&&<span style={{fontSize:11,color:"#9B9098",background:"#F5F1EA",borderRadius:4,padding:"3px 8px"}}>{org.name}</span>}
            {currentUser?.name&&<span style={{fontSize:12,color:"#6B6375"}}>{currentUser.name}</span>}
            {onSignOut&&<button onClick={onSignOut} style={{background:"none",border:"1px solid #E8E0D0",color:"#9B9098",borderRadius:6,padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Sign out</button>}
            <button onClick={()=>setShowOrgSettings(true)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"5px 12px",fontSize:11,cursor:"pointer",color:"#6B6375",fontFamily:"DM Sans,system-ui,sans-serif"}}>Org Settings</button>
            <button onClick={()=>setScreen(SCREENS.SETTINGS)} style={{background:screen===SCREENS.SETTINGS?"#F5F3FF":"none",border:"1px solid #E8E0D0",color:"#6B6375",borderRadius:6,padding:"5px 10px",fontSize:13,cursor:"pointer"}}>⚙</button>
          </div>
        </div>
      </header>

      {/* ── Deadline banner ── */}
      {dueSoon.some(d=>d.overdue)&&screen!==SCREENS.HOME&&(
        <div style={{background:"#FEF0EB",borderBottom:"1px solid #E8622A33",padding:"8px 20px"}}>
          <div style={{maxWidth:1440,margin:"0 auto",display:"flex",alignItems:"center",gap:12,fontSize:12}}>
            <span style={{color:"#C84B2F",fontWeight:600}}>Overdue actions:</span>
            {dueSoon.filter(d=>d.overdue).slice(0,3).map((d,i)=>(
              <span key={i} style={{color:"#3D3560"}}>{d.caseName} — {d.step} <span style={{color:"#C84B2F"}}>({Math.abs(d.daysLeft)}d overdue)</span></span>
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
          org={org}
          setShowOrgSettings={setShowOrgSettings}
          onSignOut={onSignOut}
          currentUser={currentUser}
          getNextStep={getNextStep}
          setMeetingType={setMeetingType}
          setCaseInfo={setCaseInfo}
          setScreen={setScreen}
          setShowCasePrompt={setShowCasePrompt}
          dueSoon={dueSoon}
          policies={policies}
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
        />
      )}

      {/* ══ HOME MEETING SETUP ══ */}
      {screen===SCREENS.HOME+"_meeting"&&(
        <HomeMeetingScreen meetingSetup={meetingSetup} setMeetingSetup={setMeetingSetup} orgMembers={orgMembers} getEmployeeRecord={getEmployeeRecord} cases={cases} needsInvitation={needsInvitation} setCaseInfo={setCaseInfo} setMeetingType={setMeetingType} setPendingLetterType={setPendingLetterType} setShowLetterModal={setShowLetterModal} setScreen={setScreen} setTranscript={setTranscript} setPrepNotes={setPrepNotes} setReviewOutput={setReviewOutput} setLetterOutput={setLetterOutput} setRiskScore={setRiskScore} setLiveChatHistory={setLiveChatHistory} generateBrief={generateBrief} />
      )}

      {/* ══ BRIEF ══ */}
      {screen===SCREENS.BRIEF&&(
        <BriefScreen setScreen={setScreen} meetingType={meetingType} setMeetingType={setMeetingType} caseInfo={caseInfo} setCaseInfo={setCaseInfo} getEmployeeRecord={getEmployeeRecord} cases={cases} currentUser={currentUser} orgMembers={orgMembers} activeCaseId={activeCaseId} setActiveCaseId={setActiveCaseId} getCaseStage={getCaseStage} fmtDate={fmtDate} showToast={showToast} setTranscript={setTranscript} setAdjournments={setAdjournments} setCurrentAdjournment={setCurrentAdjournment} />
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
        />
      )}

{/* ══ CASE VIEW ══ */}
      {screen===SCREENS.CASE_VIEW&&activeCaseId&&(
        <CaseViewScreen
          cases={cases}
          activeCaseId={activeCaseId}
          setScreen={setScreen}
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
          setShowOutcomeModal={setShowOutcomeModal}
          showToast={showToast}
          currentUser={currentUser}
          setLetterOutput={setLetterOutput}
          setShowSignModal={setShowSignModal}
          handleLetter={handleLetter}
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
        <RecordScreen meetingType={meetingType} caseInfo={caseInfo} isListening={isListening} meetingStartTime={meetingStartTime} currentAdjournment={currentAdjournment} setAdjournments={setAdjournments} setCurrentAdjournment={setCurrentAdjournment} setTranscript={setTranscript} inputText={inputText} aiProcessing={aiProcessing} transcript={transcript} addUtterance={addUtterance} handleReview={handleReview} inputRef={inputRef} setMeetingStartTime={setMeetingStartTime} setInputText={setInputText} updateLiveContext={updateLiveContext} stopSpeech={stopSpeech} startSpeech={startSpeech} isScreenCapturing={isScreenCapturing} stopScreenCapture={stopScreenCapture} startScreenCapture={startScreenCapture} importFileRef={importFileRef} handleImportFile={handleImportFile} liveContextLoading={liveContextLoading} liveContext={liveContext} liveChatHistory={liveChatHistory} liveChatProcessing={liveChatProcessing} liveChatInput={liveChatInput} setLiveChatInput={setLiveChatInput} sendLiveChat={sendLiveChat} />
      )}

      {/* ══ REVIEW ══ */}
      {screen===SCREENS.REVIEW&&(
        <ReviewScreen caseInfo={caseInfo} meetingType={meetingType} isHR={isHR} cases={cases} requestHrReview={requestHrReview} reviewOutput={reviewOutput} setShowShareModal={setShowShareModal} saveMeetingToCase={saveMeetingToCase} setScreen={setScreen} showToast={showToast} askCompassInput={askCompassInput} setAskCompassInput={setAskCompassInput} askCompassHistory={askCompassHistory} setAskCompassHistory={setAskCompassHistory} askCompass={askCompass} setAskCompassProcessing={setAskCompassProcessing} askCompassProcessing={askCompassProcessing} editProcessing={editProcessing} editRecord={editRecord} editingRecord={editingRecord} setEditingRecord={setEditingRecord} aiProcessing={aiProcessing} aiError={aiError} setReviewOutput={setReviewOutput} setShowSignModal={setShowSignModal} riskScore={riskScore} />
      )}

      {/* ══ LETTERS ══ */}
      {screen===SCREENS.LETTER&&(
        <LetterScreen handleLetter={handleLetter} activeLetter={activeLetter} aiProcessing={aiProcessing} letterOutput={letterOutput} editingLetter={editingLetter} setEditingLetter={setEditingLetter} setLetterOutput={setLetterOutput} signature={signature} setShowSigPad={setShowSigPad} setSignature={setSignature} caseInfo={caseInfo} triggerWithSig={triggerWithSig} pdfGenerating={pdfGenerating} saveMeetingToCase={saveMeetingToCase} setScreen={setScreen} />
      )}

      {/* ══ DASHBOARD ══ */}
      {screen===SCREENS.DASHBOARD&&(
        <DashboardScreen cases={cases} setScreen={setScreen} />
      )}

      {/* ══ CASES ══ */}
      {screen===SCREENS.CASES&&(
        <CasesScreen cases={cases} setIntake={setIntake} setScreen={setScreen} getCaseStage={getCaseStage} setActiveCaseId={setActiveCaseId} setActiveCaseStage={setActiveCaseStage} getNextStep={getNextStep} getProceedingTitle={getProceedingTitle} getCaseStatus={getCaseStatus} />
      )}

      {screen===SCREENS.SEARCH&&(
        <SearchScreen searchQuery={searchQuery} setSearchQuery={setSearchQuery} runSearch={runSearch} searchResults={searchResults} setScreen={setScreen} setExpandedCases={setExpandedCases} cases={cases} setViewMeeting={setViewMeeting} setViewCaseId={setViewCaseId} dueSoon={dueSoon} />
      )}

      {/* ══ DEVELOP ══ */}
      {screen===SCREENS.DEVELOP&&devSession&&(
        <DevelopScreen
          devSession={devSession}
          setDevSession={setDevSession}
          devStep={devStep}
          setDevStep={setDevStep}
          devAiProcessing={devAiProcessing}
          generateSmartObjectives={(period)=>generateSmartObjectives(period)}
          generateDevSummary={generateDevSummary}
          devSummary={devSummary}
          saveDevMeetingToCase={()=>saveDevMeetingToCase()}
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
        />
      )}

      {/* ══ MENTAL HEALTH & WELLBEING ══ */}
      {screen===SCREENS.WELLBEING&&(
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
          exportCSV={exportCSV}
          exportPDF={exportPDF}
          org={org}
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
          users={users}
          currentUser={currentUser}
          saveUsers={saveUsers}
          addUser={addUser}
          dueSoon={dueSoon}
          requestNotifications={requestNotifications}
          notifGranted={notifGranted}
          auditLog={auditLog}
          cases={cases}
          exportAllData={exportAllData}
          deleteAllData={deleteAllData}
          setGdprAccepted={setGdprAccepted}
          setShowGdpr={setShowGdpr}
          setOnboardStep={setOnboardStep}
          setShowOnboard={setShowOnboard}
          setScreen={setScreen}
        />
      )}

      {/* ── Onboarding wizard ── */}
      {showOnboarding&&(
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

      {/* ── Org Settings Modal ── */}
      {showOrgSettings&&(
        <OrgSettingsModal
          setShowOrgSettings={setShowOrgSettings}
          orgRoles={orgRoles}
          loadOrgRoles={loadOrgRoles}
          org={org}
          orgMembers={orgMembers}
          loadOrgMembers={loadOrgMembers}
          showToast={showToast}
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
        />
      )}
    </div>
  );
}
