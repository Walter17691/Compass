import { supabase } from './supabase';
import { useState, useRef, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const MEETING_TYPES = [
  { id:"investigation", label:"Investigation",  tag:"ACAS S1",    group:"formal", mode:"er" },
  { id:"disciplinary",  label:"Disciplinary",    tag:"ACAS S2",    group:"formal", mode:"er" },
  { id:"formal",        label:"Formal Meeting",  tag:"ERA 1996",   group:"formal", mode:"er" },
  { id:"informal",      label:"Informal / 1-1",  tag:"Best Practice", group:"formal", mode:"quick" },
  { id:"grievance",     label:"Grievance",       tag:"ACAS S6",    group:"formal", mode:"er" },
  { id:"return",        label:"Return to Work",  tag:"EqA 2010",   group:"formal", mode:"er" },
  { id:"probation",     label:"Probation Review", tag:"Development", group:"dev" },
  { id:"appraisal",     label:"Appraisal",        tag:"Development", group:"dev" },
  { id:"pip-review",    label:"PIP Review",       tag:"Development", group:"dev" },
  { id:"pdp",           label:"PDP / 1-2-1",      tag:"Development", group:"dev" },
  { id:"appeal-disciplinary", label:"Disciplinary Appeal", tag:"ACAS S5",       group:"appeal", mode:"er" },
  { id:"appeal-grievance",    label:"Grievance Appeal",    tag:"ACAS S8",       group:"appeal", mode:"er" },
  { id:"appeal-dismissal",    label:"Dismissal Appeal",    tag:"ERA 1996 s.98", group:"appeal", mode:"er" },
  { id:"redundancy-atrisk",   label:"At Risk Consultation",    tag:"ERA 1996 s.188", group:"redundancy", mode:"er" },
  { id:"redundancy-consult",  label:"Redundancy Consultation", tag:"ERA 1996 s.188", group:"redundancy", mode:"er" },
  { id:"redundancy-outcome",  label:"Redundancy Outcome",      tag:"ERA 1996 s.139", group:"redundancy", mode:"er" },
  { id:"redundancy-appeal",   label:"Redundancy Appeal",       tag:"ERA 1996 s.98",  group:"redundancy", mode:"er" },
];

const SCREENS = {
  ORG_SETTINGS: "org_settings",
  HOME:"home", CASES:"cases", PREP:"prep", RECORD:"record",
  REVIEW:"review", LETTER:"letter", SETTINGS:"settings",
  DASHBOARD:"dashboard", PORTAL:"portal", TIMELINE:"timeline",
  TEMPLATES:"templates", WHISTLE:"whistle", HR_REVIEW:"hr_review", AUDIT:"audit", BRIEF:"brief", PEOPLE:"people", INTAKE:"intake", CASE_VIEW:"case_view", PERSON_VIEW:"person_view", PREDICT:"predict",
  DEVELOP:"develop", SEARCH:"search", GDPR:"gdpr", ONBOARD:"onboard",
  NEWSTARTER:"newstarter", ERREPORT:"erreport",
  REDUNDANCY:"redundancy", WELLBEING:"wellbeing",
};

const SPEAKERS = { HR:"HR Manager", EMP:"Employee", NOTE:"Note" };

const NEXT_STEPS_MAP = {
  "Investigation":   [{ step:"Issue investigation outcome letter", days:5 },{ step:"Invite to disciplinary (if evidence found)", days:5 },{ step:"Allow employee to review evidence", days:2 },{ step:"Hold disciplinary hearing", days:14 }],
  "Disciplinary":    [{ step:"Issue outcome letter", days:5 },{ step:"Inform employee of right to appeal", days:5 },{ step:"Process appeal if requested", days:15 },{ step:"Note warning on HR record", days:0 }],
  "Grievance":       [{ step:"Issue grievance outcome letter", days:5 },{ step:"Inform employee of right to appeal", days:5 },{ step:"Allow appeal hearing if requested", days:15 }],
  "Formal Meeting":  [{ step:"Issue meeting record to employee", days:5 },{ step:"Confirm agreed actions in writing", days:3 },{ step:"Schedule follow-up meeting", days:28 }],
  "Informal / 1-1":  [{ step:"Document conversation notes", days:1 },{ step:"Share agreed actions with employee", days:2 },{ step:"Schedule check-in", days:14 }],
  "Return to Work":  [{ step:"Issue return to work form", days:1 },{ step:"Confirm reasonable adjustments in writing", days:3 },{ step:"Schedule welfare review", days:28 }],
  "Probation Review":[{ step:"Send probation outcome letter", days:3 },{ step:"Confirm pass / extend / fail in writing", days:3 },{ step:"Schedule next review if extended", days:28 },{ step:"Update HR record", days:1 }],
  "Appraisal":       [{ step:"Share agreed appraisal summary with employee", days:5 },{ step:"Set objectives for next review period", days:5 },{ step:"Agree development plan", days:7 },{ step:"Schedule mid-year check-in", days:90 }],
  "PIP Review":      [{ step:"Issue PIP progress letter", days:3 },{ step:"Confirm outcome: pass / extend / escalate", days:3 },{ step:"Update PIP targets if extended", days:5 },{ step:"Schedule next review", days:28 }],
  "PDP / 1-2-1":     [{ step:"Share 1-2-1 notes with employee", days:2 },{ step:"Log agreed actions", days:1 },{ step:"Schedule next 1-2-1", days:28 }],
};

// Config for developmental meeting types
const DEV_MEETING_CONFIG = {
  "Probation Review": {
    color:"#4A7C6F",
    selfAssessmentPrompts:[
      "How do you feel your first weeks / months have gone overall?",
      "Which parts of the role have you found most enjoyable or fulfilling?",
      "Which areas have you found most challenging?",
      "What support or training would help you most?",
      "What are your goals for the next phase?",
    ],
    managerPrompts:[
      "Overall performance against the job description and expectations",
      "Key strengths demonstrated during probation",
      "Areas requiring improvement or further development",
      "Feedback on attitude, conduct and team fit",
      "Recommendation: Pass / Extend / Fail probation",
    ],
    objectives:[
      { label:"Role competency", desc:"Meets the core requirements of the role" },
      { label:"Attendance & punctuality", desc:"Reliable and consistent attendance" },
      { label:"Team integration", desc:"Working well with colleagues and stakeholders" },
      { label:"Quality of work", desc:"Output meets required standards" },
    ],
    outcomeOptions:["Pass — probation complete","Extend — additional review in [X] weeks","Fail — employment to end"],
  },
  "Appraisal": {
    color:"#7C5CFC",
    selfAssessmentPrompts:[
      "What achievements are you most proud of this year?",
      "How would you rate your own performance against your objectives? (1-5)",
      "What skills have you developed or improved?",
      "Where do you feel you could have done better?",
      "What support do you need from your manager?",
      "What are your career aspirations for the next 12 months?",
    ],
    managerPrompts:[
      "Overall performance rating (1=Below expectations, 5=Outstanding)",
      "Assessment of each objective",
      "Key achievements and positive contributions",
      "Areas for development and improvement",
      "Recommended objectives for next year",
      "Proposed development activity or training",
    ],
    ratingScale:["1 — Below expectations","2 — Partially meets expectations","3 — Meets expectations","4 — Exceeds expectations","5 — Outstanding"],
    outcomeOptions:["Strong performer — reward / promotion discussion","Good performer — continue development","Needs improvement — support plan required","Underperforming — PIP to be considered"],
  },
  "PIP Review": {
    color:"#B87520",
    selfAssessmentPrompts:[
      "How do you feel your performance has progressed since the PIP started?",
      "Which targets do you feel you have met?",
      "Which areas are you still finding difficult, and why?",
      "What support has helped most?",
      "What do you need to fully meet the required standards?",
    ],
    managerPrompts:[
      "Progress against each PIP target (Met / Partial / Not met)",
      "Evidence of improvement or continued underperformance",
      "Quality of work and consistency",
      "Engagement and effort shown",
      "Recommendation: Pass / Extend / Escalate",
    ],
    outcomeOptions:["Pass — PIP complete, performance satisfactory","Extend — additional review period required","Escalate — further disciplinary action to be considered"],
  },
  "PDP / 1-2-1": {
    color:"#7C5CFC",
    selfAssessmentPrompts:[
      "What's going well for you at the moment?",
      "What's been most challenging since our last meeting?",
      "How are you progressing against your development goals?",
      "Is there anything blocking you that I can help with?",
      "What would you like to focus on or learn next?",
    ],
    managerPrompts:[
      "Progress update against agreed actions",
      "Observations on performance and development",
      "Coaching notes and feedback given",
      "Support offered or agreed",
      "Actions and goals for next meeting",
    ],
    outcomeOptions:["On track — continue as planned","Adjust plan — update goals or support","Flag for further review"],
  },
};

const DEV_TEMPLATES = [
  { id:"prob-pass", cat:"Probation", name:"Probation Passed Letter", body:`Dear [Employee Name],\n\nCONFIRMATION OF SUCCESSFUL PROBATION\n\nI am delighted to confirm that you have successfully completed your probationary period with [Company Name], effective [Date].\n\nDuring your probation, you have demonstrated [key strengths]. Your contribution to the team has been valued and we look forward to your continued development.\n\nYour next appraisal will be held on [Date].\n\nCongratulations and welcome to the team.\n\nYours sincerely,\n[Manager Name]\n[Job Title]` },
  { id:"prob-extend", cat:"Probation", name:"Probation Extended Letter", body:`Dear [Employee Name],\n\nEXTENSION OF PROBATIONARY PERIOD\n\nFollowing your probation review on [Date], I am writing to confirm that your probationary period will be extended by [X weeks] until [New end date].\n\nThe reason for this extension is: [Reason]\n\nDuring this period, the following improvements are required:\n[Required improvements]\n\nThe following support will be provided:\n[Support]\n\nA further review will be held on [Date]. If the required standards are not met, your employment may be terminated.\n\nYours sincerely,\n[Manager Name]` },
  { id:"appraisal-summary", cat:"Appraisal", name:"Annual Appraisal Summary", body:`ANNUAL APPRAISAL SUMMARY\n\nEmployee: [Employee Name]\nRole: [Job Title]\nManager: [Manager Name]\nReview period: [Date] to [Date]\nOverall rating: [Rating]\n\nSUMMARY OF PERFORMANCE\n[Summary]\n\nKEY ACHIEVEMENTS\n[Achievements]\n\nAREAS FOR DEVELOPMENT\n[Development areas]\n\nOBJECTIVES FOR NEXT YEAR\n1. [Objective 1]\n2. [Objective 2]\n3. [Objective 3]\n\nDEVELOPMENT PLAN\n[Training / development agreed]\n\nEmployee comments: [Employee comments]\n\nEmployee signature: _________________ Date: _______\nManager signature:  _________________ Date: _______` },
  { id:"pdp-plan", cat:"PDP", name:"Personal Development Plan", body:`PERSONAL DEVELOPMENT PLAN\n\nEmployee: [Employee Name]\nManager: [Manager Name]\nDate: [Date]\nReview date: [Review Date]\n\nCARREER GOALS (12 months)\n[Goals]\n\nDEVELOPMENT OBJECTIVES\n\nObjective 1: [Objective]\nHow: [Actions]\nBy when: [Date]\nSuccess measure: [Measure]\n\nObjective 2: [Objective]\nHow: [Actions]\nBy when: [Date]\nSuccess measure: [Measure]\n\nObjective 3: [Objective]\nHow: [Actions]\nBy when: [Date]\nSuccess measure: [Measure]\n\nSUPPORT REQUIRED\n[Support from manager / training / resources]\n\nEmployee: _________________ Date: _______\nManager: __________________ Date: _______` },
];

const TEMPLATES = [
  { id:"inv-disc", cat:"Disciplinary", name:"Invitation to Disciplinary Hearing", body:`Dear [Employee Name],\n\nINVITATION TO DISCIPLINARY HEARING\n\nYou are invited to attend a disciplinary hearing:\n\nDate: [Date]\nTime: [Time]\nLocation: [Location]\nChair: [Manager]\n\nAllegations to be discussed:\n[Allegations]\n\nYou have the right to be accompanied by a trade union representative or colleague. Please confirm attendance in advance.\n\nYours sincerely,\n[Manager Name]\n[Job Title]` },
  { id:"out-warn", cat:"Disciplinary", name:"First Written Warning", body:`Dear [Employee Name],\n\nOUTCOME — FIRST WRITTEN WARNING\n\nFollowing the disciplinary hearing on [Date], I am writing to confirm the outcome.\n\nFindings: [Findings]\n\nYou are issued with a FIRST WRITTEN WARNING which will remain on your file for 12 months.\n\nRequired improvement: [Improvement required]\n\nRight of appeal: You may appeal within 5 working days by writing to [Senior Manager].\n\nYours sincerely,\n[Manager Name]` },
  { id:"out-final", cat:"Disciplinary", name:"Final Written Warning", body:`Dear [Employee Name],\n\nOUTCOME — FINAL WRITTEN WARNING\n\nFollowing the disciplinary hearing on [Date]:\n\nFindings: [Findings]\n\nYou are issued with a FINAL WRITTEN WARNING. Any further breach may result in dismissal.\n\nThis warning remains on file for 12 months. You may appeal within 5 working days.\n\nYours sincerely,\n[Manager Name]` },
  { id:"out-dismiss", cat:"Disciplinary", name:"Dismissal Letter", body:`Dear [Employee Name],\n\nOUTCOME — DISMISSAL\n\nFollowing the disciplinary hearing on [Date], I regret to inform you that you are dismissed from employment with effect from [Date].\n\nReason: [Reason for dismissal]\n\nNotice/Payment in lieu: [Notice details]\nFinal pay date: [Date]\n\nYou may appeal within 5 working days by writing to [Senior Manager].\n\nYours sincerely,\n[Manager Name]` },
  { id:"inv-griev", cat:"Grievance", name:"Invitation to Grievance Hearing", body:`Dear [Employee Name],\n\nACKNOWLEDGEMENT OF GRIEVANCE\n\nThank you for your grievance dated [Date]. A hearing has been arranged:\n\nDate: [Date]  Time: [Time]  Location: [Location]  Chair: [Manager]\n\nYou have the right to be accompanied. Please bring any supporting evidence.\n\nYours sincerely,\n[Manager Name]` },
  { id:"out-griev", cat:"Grievance", name:"Grievance Outcome Letter", body:`Dear [Employee Name],\n\nGRIEVANCE OUTCOME\n\nFollowing the grievance hearing on [Date]:\n\nFindings: [Findings]\n\nOutcome: [Outcome]\n\nYou may appeal within 5 working days by writing to [Senior Manager].\n\nYours sincerely,\n[Manager Name]` },
  { id:"suspension", cat:"Investigation", name:"Suspension Letter", body:`Dear [Employee Name],\n\nNOTICE OF SUSPENSION\n\nYou are suspended from work with effect from [Date] pending investigation into [Reason].\n\nThis is a neutral act. You will continue to receive normal pay. During suspension you must not attend work or contact colleagues about this matter without authorisation.\n\nYours sincerely,\n[Manager Name]` },
  { id:"pip", cat:"Performance", name:"Performance Improvement Plan", body:`PERFORMANCE IMPROVEMENT PLAN\n\nEmployee: [Employee Name]\nManager: [Manager]\nStart: [Start Date]\nReview: [Review Date]\n\nPerformance concerns:\n[Concerns]\n\nRequired improvement & targets:\n[Targets]\n\nSupport to be provided:\n[Support]\n\nReview will take place on [Review Date]. Failure to meet targets may result in further action.\n\nEmployee: _________________ Date: _______\nManager: __________________ Date: _______` },
  { id:"occ-health", cat:"Welfare", name:"Occupational Health Referral", body:`Dear [Employee Name],\n\nOCCUPATIONAL HEALTH REFERRAL\n\nWith your consent, we wish to refer you to our Occupational Health provider.\n\nReason for referral: [Reason]\n\nThe OH advisor will assess your fitness for work and may make recommendations. Their report will be shared with HR and your manager. You may refuse this referral.\n\nYours sincerely,\n[Manager Name]` },
  { id:"inv-appeal", cat:"Appeal", name:"Invitation to Appeal Hearing", body:`Dear [Employee Name],\n\nINVITATION TO APPEAL HEARING\n\nThank you for your appeal against [Original decision].\n\nYour appeal will be heard:\nDate: [Date]  Time: [Time]  Location: [Location]\nAppeal Chair: [Manager] (who had no involvement in the original decision)\n\nYou have the right to be accompanied.\n\nYours sincerely,\n[Manager Name]` },
  { id:"return-work", cat:"Welfare", name:"Return to Work Letter", body:`Dear [Employee Name],\n\nRETURN TO WORK — CONFIRMATION\n\nWelcome back following your absence from [Start date] to [End date].\n\nWe discussed the following during your return to work meeting on [Date]:\n\nReasons for absence: [Reasons]\nAny support / adjustments agreed: [Adjustments]\nNext welfare review: [Date]\n\nPlease do not hesitate to speak to [Manager] if you need any further support.\n\nYours sincerely,\n[Manager Name]` },
];

// ─────────────────────────────────────────────
//  AI
// ─────────────────────────────────────────────
async function streamClaude(system, user, onChunk) {
  let apiKey = "";
  try { apiKey = window.COMPASS_API_KEY || ""; } catch(e) {}
  const res = await fetch("/api/chat", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "anthropic-version":"2023-06-01",
      ...(apiKey ? { "x-api-key": apiKey } : {})
    },
    body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:2048, stream:true, system, messages:[{ role:"user", content:user }] })
  });
  if(!res.ok) { const e = await res.text(); throw new Error(`API ${res.status}: ${e.slice(0,200)}`); }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while(true) {
    const { done, value } = await reader.read();
    if(done) break;
    for(const line of dec.decode(value).split("\n")) {
      if(!line.startsWith("data: ")) continue;
      try {
        const d = JSON.parse(line.slice(6));
        if(d.type==="content_block_delta" && d.delta?.text) { full += d.delta.text; onChunk(full); }
      } catch(e) {}
    }
  }
  return full;
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function useFonts() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(l);
  }, []);
}

function addWorkingDays(date, days) {
  if(days === 0) return null;
  const d = new Date(date);
  let added = 0;
  while(added < days) {
    d.setDate(d.getDate() + 1);
    if(d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toLocaleDateString("en-GB");
}

function ls(key, fallback) {
  try { const v = typeof localStorage !== 'undefined' && localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(e) { return fallback; }
}
function lsSet(key, val) { try { if(typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} }

// ─────────────────────────────────────────────
//  UI PRIMITIVES
// ─────────────────────────────────────────────
function CompassLogo({ size = 36 }) {
  const s = size;


  const syncNameToRecord = (field, value) => {
    if(!value) return;
    setReviewOutput(r => {
      if(!r) return r;
      const nl = String.fromCharCode(10);
      return r.split(nl).map(l => {
        const lLower = l.toLowerCase();
        const hasChair = lLower.includes('chair') && l.includes(':');
        const hasEmp = (lLower.includes('employee') || lLower.includes('attendee')) && l.includes(':');
        if(field === 'manager' && hasChair) return l.substring(0, l.indexOf(':') + 1) + ' ' + value;
        if(field === 'employee' && hasEmp) return l.substring(0, l.indexOf(':') + 1) + ' ' + value;
        return l;
      }).join(nl);
    });
  };


  return (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none" style={{flexShrink:0}}>
      <circle cx="50" cy="50" r="44" stroke="#7C5CFC" strokeWidth="9" fill="none" />
      <ellipse cx="50" cy="50" rx="8" ry="30" transform="rotate(-40 50 50)" fill="#7C5CFC" />
      <circle cx="50" cy="50" r="5.5" fill="#FDFAF5" />
    </svg>

  );
}

function Badge({ children, color="#7C5CFC" }) {
  return <span style={{fontSize:9, fontWeight:700, letterSpacing:1, color, background:color+"18", border:`1px solid ${color}33`, borderRadius:4, padding:"2px 7px"}}>{children}</span>;
}

function Btn({ children, onClick, variant="primary", disabled, style={} }) {
  const base = { border:"none", borderRadius:8, padding:"10px 20px", fontSize:13, fontWeight:600, cursor:disabled?"not-allowed":"pointer", transition:"all 0.15s", opacity:disabled?0.4:1, letterSpacing:0.2, ...style };
  const vars = {
    primary: { background:"#7C5CFC", color:"#fff", boxShadow:"0 2px 8px rgba(124,92,252,0.3)" },
    secondary: { background:"#FFFFFF", border:"1px solid #E8E0D0", color:"#C8C3D8" },
    ghost: { background:"none", border:"1px solid #E8E0D0", color:"#6B6375" },
    danger: { background:"none", border:"1px solid #E8622A33", color:"#C84B2F" },
    blue: { background:"#1C5AA0", color:"#fff" },
  };
  return <button onClick={disabled ? undefined : onClick} style={{...base,...vars[variant]}}>{children}</button>;
}

function Card({ children, style={} }) {
  return <div style={{background:"#FFFFFF", border:"1px solid #E8E0D0", borderRadius:14, padding:24, boxShadow:"0 1px 3px rgba(0,0,0,0.3)", ...style}}>{children}</div>;
}

function SectionTitle({ children }) {
  return <div style={{fontSize:10, fontWeight:700, letterSpacing:1.5, color:"#7C5CFC", background:"#7C5CFC18", border:"1px solid #7C5CFC33", borderRadius:4, padding:"3px 8px", display:"inline-block", marginBottom:14}}>{children}</div>;
}

function MDRenderer({ text, light }) {
  const base = "#1A1535";
  const muted = "#6B6375";
  const accent = "#7C5CFC";
  if(!text) return null;
  const clean = text
    .replace(/\*\*(.+?)\*\*/g, '')
    .replace(/\*(.+?)\*/g, '')
    .replace(/#{1,3} /g, '');
  const lines = clean.split(String.fromCharCode(10));
  return (
    <div style={{fontFamily:"DM Sans,system-ui,sans-serif",lineHeight:1.7,color:base}}>
      {lines.map((line,i)=>{
        if(!line.trim()) return <div key={i} style={{height:8}}/>;
        if(line.startsWith('- ') || line.startsWith('• ')) return <div key={i} style={{display:"flex",gap:8,marginBottom:4}}><span style={{color:accent,flexShrink:0,marginTop:2}}>·</span><span style={{color:base}}>{line.slice(2)}</span></div>;
        if(/^\d+\./.test(line)) return <div key={i} style={{marginBottom:4,color:base}}>{line}</div>;
        return <p key={i} style={{margin:"0 0 8px",color:base}}>{line}</p>;
      })}
    </div>
  );
}


function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [mode, setMode] = useState("draw");
  const [typed, setTyped] = useState("");
  const [hasDraw, setHasDraw] = useState(false);

  useEffect(() => {
    const c = canvasRef.current; if(!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle="#FFFFFF"; ctx.lineWidth=2; ctx.lineCap="round";
  }, [mode]);

  const pos = (e, c) => {
    const r = c.getBoundingClientRect();
    const x = (e.touches?e.touches[0].clientX:e.clientX) - r.left;
    const y = (e.touches?e.touches[0].clientY:e.clientY) - r.top;
    return { x:x*(c.width/r.width), y:y*(c.height/r.height) };
  };
  const startDraw = e => { const c=canvasRef.current; const ctx=c.getContext("2d"); const p=pos(e,c); ctx.beginPath(); ctx.moveTo(p.x,p.y); setDrawing(true); };
  const draw = e => { if(!drawing) return; e.preventDefault(); const c=canvasRef.current; const ctx=c.getContext("2d"); const p=pos(e,c); ctx.lineTo(p.x,p.y); ctx.stroke(); setHasDraw(true); };
  const endDraw = () => setDrawing(false);
  const clear = () => { const c=canvasRef.current; const ctx=c.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,c.width,c.height); setHasDraw(false); };

  const save = () => {
    if(mode==="draw") { if(!hasDraw) return; onSave({type:"draw", data:canvasRef.current.toDataURL()}); }
    else { if(!typed.trim()) return; onSave({type:"typed", data:typed.trim()}); }
  };

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <Card style={{width:500,maxWidth:"90vw"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600}}>E-signature</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#6B6375",fontSize:22,cursor:"pointer"}}>&#10005;</button>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {["draw","type"].map(m=><Btn key={m} variant={mode===m?"primary":"ghost"} onClick={()=>setMode(m)}>{m==="draw"?"Draw":"Type"}</Btn>)}
        </div>
        {mode==="draw" ? (
          <>
            <div style={{background:"#fff",borderRadius:8,border:"1px solid #E8E0D0",marginBottom:10,overflow:"hidden"}}>
              <canvas ref={canvasRef} width={440} height={150} style={{display:"block",width:"100%",touchAction:"none",cursor:"crosshair"}}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{fontSize:11,color:"#6B6880"}}>Draw your signature above</span>
              <Btn variant="ghost" onClick={clear} style={{padding:"4px 10px",fontSize:11}}>Clear</Btn>
            </div>
          </>
        ) : (
          <div style={{marginBottom:16}}>
            <input value={typed} onChange={e=>setTyped(e.target.value)} placeholder="Type your name"
              style={{width:"100%",background:"#fff",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",fontSize:28,fontFamily:"'Brush Script MT',cursive",color:"#FFFFFF",outline:"none",boxSizing:"border-box"}} />
            {typed && <div style={{background:"#fff",borderRadius:8,border:"1px solid #E8E0D0",padding:"10px 16px",marginTop:8}}><div style={{fontFamily:"'Brush Script MT',cursive",fontSize:32,color:"#FFFFFF"}}>{typed}</div></div>}
          </div>
        )}
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={save}>Apply signature</Btn>
          <Btn variant="ghost" onClick={onClose}>Skip</Btn>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────
function DateInput({ value, onChange, style={} }) {
  return (
    <div className="date-wrap">
      <input type="date" value={value} onChange={onChange}
        style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 36px 9px 12px",fontSize:13,outline:"none",color:"#1A1535",boxSizing:"border-box",...style}} />
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    </div>
  );
}

function AdjustmentForm({ onAdd }) {
  const [adj, setAdj] = useState("");
  const [review, setReview] = useState("");
  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",marginTop:14,borderTop:"1px solid #E8E0D0",paddingTop:14}}>
      <div style={{fontSize:11,color:"#6B6880",marginBottom:8,fontWeight:600}}>Add adjustment</div>
      <input placeholder="e.g. Flexible start time, additional breaks, remote working" value={adj} onChange={e=>setAdj(e.target.value)}
        style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none",marginBottom:8,boxSizing:"border-box"}} />
      <input placeholder="Review date (optional)" value={review} onChange={e=>setReview(e.target.value)}
        style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none",marginBottom:8,boxSizing:"border-box"}} />
      <Btn onClick={()=>{if(adj.trim()){onAdd({adjustment:adj.trim(),review});setAdj("");setReview("");}}} disabled={!adj.trim()} style={{fontSize:11,padding:"7px 14px"}}>Add adjustment</Btn>
    </div>
  );
}

function UserAddForm({ onAdd }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("HR Manager");
  const [email, setEmail] = useState("");
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <input placeholder="Full name" value={name} onChange={e=>setName(e.target.value)}
          style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none"}} />
        <select value={role} onChange={e=>setRole(e.target.value)}
          style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none"}}>
          {["HR Director","HR Manager","Line Manager","HR Administrator"].map(r=><option key={r}>{r}</option>)}
        </select>
      </div>
      <input placeholder="Email (optional)" value={email} onChange={e=>setEmail(e.target.value)}
        style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none",marginBottom:8,boxSizing:"border-box"}} />
      <Btn onClick={()=>{if(name.trim()){onAdd(name.trim(),role,email.trim());}}} disabled={!name.trim()} style={{width:"100%",fontSize:12,padding:"8px"}}>Add user</Btn>
    </div>
  );
}

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

  // ── Whistleblower ──
  const [whistleReports, setWhistleReports] = useState(ls("compass_whistle", []));
  const [whistleForm, setWhistleForm] = useState({ concern:"", category:"", date:"", anonymous:true });
  const [whistleSubmitted, setWhistleSubmitted] = useState(false);

  // ── Document vault ──
  const [vaultDocs, setVaultDocs] = useState(ls("compass_vault", {}));

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
  const [dashSearch, setDashSearch] = useState("");
  const [dashFilter, setDashFilter] = useState("all");
  const [showOrgSettings, setShowOrgSettings] = useState(false);

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
  const [showUserSwitch, setShowUserSwitch] = useState(false);
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
  const [meetingSetup, setMeetingSetup] = useState({employee:"", manager:"", type:"", date:new Date().toISOString().split("T")[0], linkedCaseId:null, linkedCaseName:null});
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
    console.log("signing response:", JSON.stringify(data));
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
    } catch(e) { console.log("liveContext error:", e); }
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

  useEffect(()=>{ if(org?.id){ loadLocations(); loadHrReviews(); loadOrgRoles(); loadOrgMembers(); loadTeamMembers(); } }, [org?.id]);

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
  const [showHrReviewModal, setShowHrReviewModal] = useState(false);
  const [pendingReviewStep, setPendingReviewStep] = useState(null);
  const [pendingReviewCaseId, setPendingReviewCaseId] = useState(null);
  const [showBundleBuilder, setShowBundleBuilder] = useState(null); // caseId
  const [bundleChat, setBundleChat] = useState([]);
  const [bundleChatInput, setBundleChatInput] = useState("");
  const [bundleProcessing, setBundleProcessing] = useState(false);
  const [bundleFiles, setBundleFiles] = useState([]);
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
    const sys = "You are Compass, an expert UK HR AI assistant. You help HR managers with UK employment law, ACAS codes of practice, and HR best practice. Be concise and practical. Use ## for section headers and - for bullet points. Never use ** for bold, never use emoji, never use markdown tables. Plain clear English only. " + caseContext;
    
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
          max_tokens:800,
          stream:false,
          system:sys,
          messages:newHistory,
          tools:[{type:"web_search_20250305",name:"web_search"}]
        })});
      const data = await res.json();
      const reply = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("") || "Sorry, I could not generate a response.";
      setHistory([...displayHistory, {role:"assistant", content:reply}]);
      setHomeAttachment(null);
      
      // Show case prompt after first response
      setShowCasePrompt(true);
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
  const saveWhistle = u => { setWhistleReports(u); lsSet("compass_whistle", u); };
  const saveVault = u => { setVaultDocs(u); lsSet("compass_vault", u); };

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
  const switchUser = u => { setCurrentUser(u); lsSet("compass_user", u); setShowUserSwitch(false); };
  const addUser = (name, role, email) => {
    const u = {id:Date.now().toString(), name, role, email, createdAt:new Date().toISOString()};
    const updated = [...users, u];
    saveUsers(updated);
    return u;
  };
  const ROLES = ["HR Director","HR Manager","Line Manager","HR Administrator"];
  const ROLE_PERMS = {
    "HR Director":   { viewAll:true,  edit:true,  delete:true,  viewRisk:true  },
    "HR Manager":    { viewAll:true,  edit:true,  delete:false, viewRisk:true  },
    "Line Manager":  { viewAll:false, edit:false, delete:false, viewRisk:false },
    "HR Administrator":{ viewAll:true, edit:false, delete:false, viewRisk:true },
  };
  const canDo = (action) => {
    if(!currentUser) return true; // no auth = full access (dev mode)
    const perms = ROLE_PERMS[currentUser.role] || {};
    return perms[action] !== false;
  };

  // ── Reasonable adjustments ──
  const saveAdjustments = u => { setAdjustments(u); lsSet("compass_adjustments", u); };
  const addAdjustment = (caseId, adj) => {
    const item = {id:Date.now().toString(), ...adj, addedAt:new Date().toISOString(), done:false};
    const updated = {...adjustments, [caseId]:[...(adjustments[caseId]||[]), item]};
    saveAdjustments(updated);
    audit("Reasonable adjustment added", `Case: ${caseId} — ${adj.adjustment}`);
  };
  const toggleAdjustment = (caseId, adjId) => {
    const updated = {...adjustments, [caseId]:(adjustments[caseId]||[]).map(a=>a.id===adjId?{...a,done:!a.done}:a)};
    saveAdjustments(updated);
  };

  // ── Letter tracking ──
  const trackLetter = (caseId, meetingId, event) => {
    // event: "sent" | "delivered" | "acknowledged"
    const ts = new Date().toISOString();
    const updated = cases.map(c => c.id===caseId ? {
      ...c,
      meetings: c.meetings.map(m => m.id===meetingId ? {
        ...m,
        letterTracking: {
          ...(m.letterTracking||{}),
          [event]: ts,
          [`${event}By`]: currentUser?.name || "HR Manager",
        }
      } : m)
    } : c);
    saveCases(updated);
    audit(`Letter ${event}`, `Case: ${cases.find(c=>c.id===caseId)?.employeeName}`);
  };

  // ── ICS calendar export ──
  const exportToCalendar = (title, date, description) => {
    if(!date) return;
    const d = date.split("/").reverse().join(""); // DD/MM/YYYY → YYYYMMDD
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Compass HR//EN",
      "BEGIN:VEVENT",
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${d}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${description.replace(/\n/g,"\\n")}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], {type:"text/calendar"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${title.replace(/\s+/g,"_")}.ics`; a.click();
    URL.revokeObjectURL(url);
    audit("Calendar event exported", title);
  };

  // ── Deadline checker ──
  useEffect(() => {
    const today = new Date();
    const due = [];
    cases.forEach(c => {
      c.meetings.forEach(m => {
        (m.nextSteps||[]).filter(s=>!s.done&&s.deadline).forEach(s => {
          const dl = new Date(s.deadline.split("/").reverse().join("-"));
          const diff = Math.ceil((dl-today)/(1000*60*60*24));
          if(diff <= 7 && diff >= 0) due.push({caseName:c.employeeName, step:s.step, deadline:s.deadline, daysLeft:diff});
          else if(diff < 0) due.push({caseName:c.employeeName, step:s.step, deadline:s.deadline, daysLeft:diff, overdue:true});
        });
      });
    });
    setDueSoon(due);
  }, [cases]);

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
    const data = { cases, policies:policies.map(p=>({...p,content:"[truncated]"})), whistleReports, auditLog, users, adjustments, exportedAt:new Date().toISOString() };
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
    setActiveStarter(updated.find(s=>s.id===instanceId));
  };

  const updateStarterTaskNote = (instanceId, taskId, note) => {
    const updated = starterInstances.map(s => s.id===instanceId ? {
      ...s, tasks: s.tasks.map(t => t.id===taskId ? {...t, note} : t)
    } : s);
    saveStarterInstances(updated);
    setActiveStarter(updated.find(s=>s.id===instanceId));
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
      setActiveStarter(updated.find(s=>s.id===instance.id));
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

  const WELLBEING_RESOURCES = [
    { name:"Samaritans", contact:"116 123", note:"24/7 emotional support" },
    { name:"Mind", contact:"0300 123 3393", note:"Mental health support" },
    { name:"NHS Crisis line", contact:"111 (option 2)", note:"Mental health crisis" },
    { name:"Shout", contact:"Text SHOUT to 85258", note:"Crisis text line 24/7" },
    { name:"Employee Assistance Programme", contact:"See company handbook", note:"Confidential counselling" },
    { name:"Occupational Health", contact:"Via HR", note:"Workplace health support" },
  ];

  const WELLBEING_TYPES = {
    "chat": { label:"Wellbeing conversation", desc:"Informal check-in or wellbeing discussion" },
    "eap": { label:"EAP referral", desc:"Employee Assistance Programme referral" },
    "adjustment": { label:"Reasonable adjustment", desc:"Mental health-related workplace adjustment" },
    "crisis": { label:"Crisis support", desc:"Immediate mental health crisis support provided" },
    "return": { label:"Return from MH absence", desc:"Return to work following mental health absence" },
    "checkin": { label:"Follow-up check-in", desc:"Scheduled wellbeing follow-up" },
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
        `UK HR meeting transcription. Attribute speaker. ONLY "HR Manager" or "Employee". Return JSON array only: [{"speaker":"HR Manager","text":"..."}]`,
        `Meeting: ${meetingType?.label||"HR"}\nEmployee: ${caseInfo.employee}\nRecent:\n${transcript.slice(-5).filter(u=>!u.pending).map(u=>u.speaker+": "+u.text).join("\n")}\nNew: "${raw}"`,
        ()=>{}
      );
      const parsed = JSON.parse(result.replace(/```json|```/g,"").trim());
      const items = parsed.map((u,i)=>({id:i===0?pendingId:Date.now()+Math.random(), speaker:u.speaker, text:u.text, ts, aiAttributed:true}));
      setTranscript(p=>{const w=p.filter(u=>u.id!==pendingId); return [...w,...items];});
    } catch(e) {
      setTranscript(p=>p.map(u=>u.id===pendingId?{...u,speaker:"HR Manager",pending:false}:u));
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
    console.log("TX:", tx.slice(0,200));
      // Appeal detection
      const appealWords = ["appeal","original decision","grounds of appeal","outcome being appealed"];
      if(!appealDetectedRef.current && appealWords.some(w=>tx.toLowerCase().includes(w))){
        appealDetectedRef.current = true;
        setAppealDetected(true);
        setShowLinkCase(true);
      }
      await streamClaude(
        `You are a senior UK HR documentation specialist. Generate a meeting record with EXACTLY these three sections and NO others: ## Meeting Details (date, type, attendees, purpose), ## Meeting Dialogue (what was said, in concise prose), ## HR Advisor Notes (expert legal guidance in flowing prose from a senior employment lawyer - one paragraph covering ACAS compliance, legal risks and recommended next steps). Do NOT add any other sections like Key Points, Next Steps, Summary, Actions, Risk Assessment or anything else. Three sections only. No bold, no emoji, no tables.${policies.length?" Reference company policies by name.":""} IMPORTANT: In the Meeting Dialogue section, prefix every line with initials only. Chair ${caseInfo.manager||"HR Manager"} = ${(caseInfo.manager||"HR Manager").split(" ").map(w=>w[0].toUpperCase()).join("")}. Employee ${caseInfo.employee||"Employee"} = ${(caseInfo.employee||"Employee").split(" ").map(w=>w[0].toUpperCase()).join("")}. Use ONLY these initials, never full names in the dialogue.`,
        `${meetingType?.label} meeting. Employee: ${caseInfo.employee}. Date: ${caseInfo.date||"today"}. Chair: ${caseInfo.manager||"Unknown"}. Start time: ${meetingStartTime||"Unknown"}. End time: ${meetingEndTime||meetingEndTimeVal||"Unknown"}. Other participants: ${participants.map(p=>p.name+" ("+p.role+")").join(", ")||"none listed"}${getPolicyCtx()}\n\nTRANSCRIPT:\n${tx}\n\nPlease produce the following sections:\n\n## Meeting Details\nInclude these fields on separate lines:\n- Type: [meeting type]\n- Date: [date]\n- Start time: [start time]\n- End time: [end time]\n- Chair: [chair name]\n- Employee: [employee name]\n- Other participants: [any others or "None"]\n- Purpose: [write 1-2 sentences on the same line explaining why this meeting was held]\n\n## Meeting Dialogue\nRewrite as a clean readable conversation. Each line must start with the speaker's INITIALS followed by a colon (e.g. if chair is "${caseInfo.manager||"HR Manager"}" use initials "${(caseInfo.manager||"HR Manager").split(" ").map(w=>w[0]).join("")}:" and if employee is "${caseInfo.employee||"Employee"}" use initials "${(caseInfo.employee||"Employee").split(" ").map(w=>w[0]).join("")}:"). Fix any typos. One line per utterance.\n\n## Key Points\n## Employee Position\n## Management Position\n## Procedural Checks\n## Actions & Next Steps`,
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

  // ── Document vault ──
  const addToVault = (caseId, file) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const doc = { id:Date.now().toString(), name:file.name, type:file.type, data:ev.target.result, addedAt:new Date().toISOString() };
      const updated = { ...vaultDocs, [caseId]:[...(vaultDocs[caseId]||[]), doc] };
      saveVault(updated);
    };
    reader.readAsDataURL(file);
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
      const context = [
        caseInfo.employee ? "Employee: "+caseInfo.employee : "",
        caseInfo.manager ? "Chair/Manager: "+caseInfo.manager : "",
        caseInfo.date ? "Meeting date: "+caseInfo.date : "",
        meetingType?.label ? "Meeting type: "+meetingType.label : "",
        evidenceList ? "Evidence gathered:"+nl+evidenceList : "",
        reviewOutput ? "Meeting record:"+nl+reviewOutput.slice(0,800) : "",
        tx ? "Transcript:"+nl+tx.slice(0,600) : "",
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
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,stream:false,
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

  const getNextAction = (cs) => {
    const meetings = cs.meetings || [];
    const types = meetings.map(m => (m.type || "").toLowerCase());
    const hasOutcomeLetter = meetings.some(m => m.letterOutput);
    const hasSigned = meetings.some(m => m.signStatus === "signed");
    const hasPending = meetings.some(m => m.signStatus === "pending");
    const lastMeeting = meetings[meetings.length - 1];
    const daysSinceLastMeeting = lastMeeting ? Math.floor((Date.now() - new Date(lastMeeting.date)) / 86400000) : null;

    if(hasSigned) return null;
    if(hasPending) return {action:"Chase employee signature", deadline:"Overdue if more than 7 days", urgent:daysSinceLastMeeting>7};
    if(hasOutcomeLetter) return {action:"Send outcome letter for signature", deadline:"Send immediately", urgent:true};
    if(types.some(t=>t.includes("disciplinary"))&&!hasOutcomeLetter) return {action:"Issue outcome letter", deadline:"Within 5 working days (ACAS)", urgent:daysSinceLastMeeting>5};
    if(types.some(t=>t.includes("appeal"))&&!hasOutcomeLetter) return {action:"Issue appeal outcome letter", deadline:"As soon as possible", urgent:daysSinceLastMeeting>5};
    if(types.some(t=>t.includes("grievance"))&&!hasOutcomeLetter) return {action:"Issue grievance outcome letter", deadline:"Within a reasonable time (ACAS)", urgent:daysSinceLastMeeting>10};
    if(types.some(t=>t.includes("investigation"))) return {action:"Complete investigation — schedule disciplinary if warranted", deadline:"Without unreasonable delay", urgent:daysSinceLastMeeting>14};
    if(meetings.length===0) return {action:"Schedule first meeting", deadline:"As soon as possible", urgent:cs.urgent};
    return null;
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
    <div style={{fontFamily:"Inter,system-ui,sans-serif",minHeight:"100vh",background:"#FDFAF5",fontFamily:"Inter,system-ui,sans-serif",color:"#1A1535"}}>
      <style>{`
        *{box-sizing:border-box;}::selection{background:#7C5CFC33;}
        input,textarea{font-family:Inter,system-ui,sans-serif;color:#F2EDE4;}
        input[type="date"]{color-scheme:dark;color:#F2EDE4;cursor:pointer;}
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
              <Btn variant="ghost" onClick={()=>setShowShareModal(false)} style={{flex:1}}>Cancel</Btn>
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
              <button onClick={()=>{console.log("Generate clicked, pendingLetterTypeRef:", pendingLetterTypeRef.current);setShowLetterModal(false);handleLetter(pendingLetterTypeRef.current||"outcome");}}
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
      {showCasePrompt&&screen===SCREENS.HOME&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:1000,background:"#FFFFFF",border:"1px solid #7C5CFC",borderRadius:12,padding:"16px 20px",width:"100%",maxWidth:500,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontSize:13,color:"#7C5CFC",fontWeight:600,marginBottom:3}}>Save to a case file?</div>
              <div style={{fontSize:11,color:"#6B6880"}}>This looks like it relates to a specific employee situation.</div>
            </div>
            <button onClick={()=>setShowCasePrompt(false)} style={{background:"none",border:"none",color:"#6B6880",fontSize:18,cursor:"pointer",padding:0,marginLeft:12}}>&#10005;</button>
          </div>
          <div style={{display:"flex",gap:8}}>
            <input value={casePromptName} onChange={e=>setCasePromptName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&createCaseFromChat()}
              placeholder="Employee name..."
              autoFocus
              style={{flex:1,background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:13,outline:"none",color:"#1A1535"}}/>
            <Btn onClick={createCaseFromChat} disabled={!casePromptName.trim()} style={{padding:"9px 16px",fontSize:12,flexShrink:0}}>Create case</Btn>
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
              Compass stores all HR data locally in your browser. No data is sent to external servers except the text you submit to the AI for processing via the Anthropic API.
            </p>
            <div style={{background:"#FDFAF5",borderRadius:8,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:1,marginBottom:10}}>WHAT IS STORED</div>
              {["Case files, meeting records, transcripts and letters — in your browser only","Company policies you upload — in your browser only","Your signature and letterhead — in your browser only","Whistleblower reports — in your browser only","AI processing: meeting text is sent to Anthropic's API to generate outputs"].map((item,i)=>(
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
      <header style={{display:screen===SCREENS.HOME?"none":"flex",background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",position:"sticky",top:0,zIndex:99}}>
        <div style={{maxWidth:1440,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:52}}>
          
          {/* Logo */}
          <button onClick={()=>setScreen(SCREENS.HOME)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",padding:0,cursor:"pointer",flexShrink:0}}>
            <CompassLogo size={24}/>
            <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:17,color:"#1A1535",letterSpacing:"-0.2px"}}>Compass</span>
          </button>

          {/* Nav - always show main nav */}
          {(
            <nav style={{display:"flex",alignItems:"center",gap:2}}>
              {[
                {s:SCREENS.HOME, l:"Home"},
                {s:SCREENS.CASES, l:"Cases"+(cases.filter(x=>x.stage!=="closed").length>0?" ("+cases.filter(x=>x.stage!=="closed").length+")":"")},
                ...(isHR?[{s:SCREENS.HR_REVIEW, l:"HR Review"+(hrReviewRequests.filter(r=>r.status==="pending").length>0?" ("+hrReviewRequests.filter(r=>r.status==="pending").length+")":"")}]:[]),
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
        <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
          <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 28px"}}>

            {/* ── Greeting + primary actions ── */}
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:16}}>
              <div>
                <div style={{fontSize:11,color:"#9B9098",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>
                  {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase()}
                </div>
                <h1 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:32,fontWeight:400,color:"#1C1820",margin:0,letterSpacing:"-0.5px"}}>
                  Good {new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening"}{currentUser?.name?", "+currentUser.name.split(" ")[0]:""}
                </h1>
                <p style={{fontSize:13,color:"#9B9098",margin:"5px 0 0"}}>
                  {(()=>{
                    const active = cases.filter(cs=>getCaseStage(cs)!=="closed").length;
                    const actions = cases.filter(cs=>getCaseStage(cs)!=="closed"&&getNextStep(cs)?.action).length;
                    if(active===0) return "No active cases. Start by creating a new case.";
                    return active+" active case"+(active!==1?"s":"")+(actions>0?" · "+actions+" requiring action":"");
                  })()}
                </p>
              </div>
              <div style={{display:"flex",gap:10,flexShrink:0}}>
                <button onClick={()=>setScreen(SCREENS.BRIEF)} style={{fontSize:13,background:"#FFFFFF",border:"1.5px solid #1C1820",borderRadius:9,padding:"11px 20px",cursor:"pointer",color:"#1C1820",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600,letterSpacing:"-0.1px"}}>Start meeting</button>
                <button onClick={()=>setShowCaseIntake(true)} style={{fontSize:13,background:"#7C5CFC",border:"none",borderRadius:9,padding:"11px 20px",cursor:"pointer",color:"#fff",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600,letterSpacing:"-0.1px"}}>+ New case</button>
              </div>
            </div>

            {/* ── Priority strip ── */}
            {(()=>{
              const actions = cases.filter(cs=>getCaseStage(cs)!=="closed"&&getNextStep(cs)?.action);
              const pendingSigs = cases.reduce((a,cs)=>a+(cs.evidence||[]).filter(e=>e.signStatus==="pending"&&e.signId).length,0);
              const overdue = dueSoon.filter(d=>d.overdue);
              if(actions.length===0&&pendingSigs===0&&overdue.length===0) return null;
              return (
                <div style={{background:"#FFF8F0",border:"1.5px solid #E8622A33",borderRadius:12,padding:"14px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#E8622A",letterSpacing:"0.3px",flexShrink:0}}>Needs attention</div>
                  {actions.slice(0,3).map((cs,i)=>(
                    <button key={i} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}} style={{fontSize:12,color:"#E8622A",background:"#FFFFFF",border:"1px solid #E8622A44",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,whiteSpace:"nowrap"}}>
                      {cs.employeeName} · {getNextStep(cs)?.label}
                    </button>
                  ))}
                  {pendingSigs>0&&<div style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",borderRadius:7,padding:"6px 12px",fontWeight:500}}>{pendingSigs} pending signature{pendingSigs!==1?"s":""}</div>}
                  {overdue.length>0&&<div style={{fontSize:12,color:"#C84B2F",background:"#FFF0ED",borderRadius:7,padding:"6px 12px",fontWeight:500}}>{overdue.length} overdue deadline{overdue.length!==1?"s":""}</div>}
                </div>
              );
            })()}

            {/* ── Stat cards ── */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:28}}>
              {(()=>{
                const active = cases.filter(cs=>getCaseStage(cs)!=="closed").length;
                const actions = cases.filter(cs=>getCaseStage(cs)!=="closed"&&getNextStep(cs)?.action).length;
                const pendingSigs = cases.reduce((a,cs)=>a+(cs.evidence||[]).filter(e=>e.signStatus==="pending"&&e.signId).length,0);
                const closedMonth = cases.filter(cs=>{
                  if(getCaseStage(cs)!=="closed") return false;
                  const d = new Date(cs.updatedAt||cs.createdAt||0);
                  const n = new Date();
                  return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();
                }).length;
                const updatedWeek = cases.filter(cs=>{
                  const d = new Date(cs.updatedAt||cs.createdAt||0);
                  return getCaseStage(cs)!=="closed"&&(Date.now()-d)<7*24*60*60*1000;
                }).length;
                const overdueCount = dueSoon.filter(d=>d.overdue).length;
                return [
                  {label:"Active cases", value:active, sub:updatedWeek>0?updatedWeek+" updated this week":"No updates this week", accent:"#7C5CFC"},
                  {label:"Awaiting action", value:actions, sub:actions>0?"Review next steps":"All up to date", accent:"#E8622A"},
                  {label:"Pending signatures", value:pendingSigs, sub:pendingSigs>0?"Awaiting employee sign-off":"None outstanding", accent:"#1A7A4A"},
                  {label:"Closed this month", value:closedMonth, sub:overdueCount>0?overdueCount+" deadline"+(overdueCount!==1?"s":"")+" overdue":"No overdue deadlines", accent:"#6B6375"},
                ].map(s=>(
                  <div key={s.label} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>{s.label}</div>
                    <div style={{fontSize:30,fontWeight:700,color:s.accent,fontFamily:"DM Serif Display,Georgia,serif",marginBottom:4,lineHeight:1}}>{s.value}</div>
                    <div style={{fontSize:11,color:"#9B9098"}}>{s.sub}</div>
                  </div>
                ));
              })()}
            </div>

            {/* ── Main grid ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:20,alignItems:"start"}}>

              {/* ── Left: Cases + Calendar ── */}
              <div style={{display:"flex",flexDirection:"column",gap:16}}>

                {/* Cases header + search */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                  <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820",fontWeight:400}}>Active cases</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <div style={{position:"relative"}}>
                      <svg style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"#9B9098",pointerEvents:"none"}} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input value={dashSearch} onChange={e=>setDashSearch(e.target.value)} placeholder="Search cases…" style={{paddingLeft:28,paddingRight:10,paddingTop:7,paddingBottom:7,fontSize:12,border:"1px solid #E8E0D0",borderRadius:7,background:"#FFFFFF",color:"#1C1820",fontFamily:"DM Sans,system-ui,sans-serif",outline:"none",width:160}}/>
                    </div>
                    {["all","open","investigation","disciplinary","closed"].map(s=>(
                      <button key={s} onClick={()=>setDashFilter(s)} style={{fontSize:11,padding:"5px 11px",borderRadius:20,border:"1px solid",borderColor:dashFilter===s?"#7C5CFC":"#E8E0D0",background:dashFilter===s?"#EDE8FF":"#FFFFFF",color:dashFilter===s?"#7C5CFC":"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:dashFilter===s?600:400,textTransform:"capitalize",whiteSpace:"nowrap"}}>
                        {s==="all"?"All":s.charAt(0).toUpperCase()+s.slice(1)}
                      </button>
                    ))}
                    <button onClick={()=>setScreen(SCREENS.CASES)} style={{fontSize:12,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,whiteSpace:"nowrap"}}>View all →</button>
                  </div>
                </div>

                {/* Cases list */}
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                  {(()=>{
                    const filtered = cases.filter(cs=>{
                      const matchStage = dashFilter==="all"||(dashFilter==="closed"?getCaseStage(cs)==="closed":cs.stage===dashFilter||getCaseStage(cs)===dashFilter);
                      const matchSearch = !dashSearch||cs.employeeName?.toLowerCase().includes(dashSearch.toLowerCase())||cs.caseType?.toLowerCase().includes(dashSearch.toLowerCase());
                      return matchStage&&matchSearch;
                    });
                    if(filtered.length===0) return (
                      <div style={{padding:"40px",textAlign:"center"}}>
                        <div style={{fontSize:14,color:"#9B9098",marginBottom:8}}>{dashSearch?"No cases match your search.":"No cases yet."}</div>
                        {!dashSearch&&<button onClick={()=>setShowCaseIntake(true)} style={{fontSize:13,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Create your first case</button>}
                      </div>
                    );
                    const statusMap = {
                      open:{label:"Open",color:"#6B6375",bg:"#F5F1EA"},
                      investigation:{label:"In progress",color:"#E8622A",bg:"#FFF0EB"},
                      inv_report:{label:"Awaiting action",color:"#7C5CFC",bg:"#EDE8FF"},
                      disciplinary:{label:"Disciplinary",color:"#C84B2F",bg:"#FFF0ED"},
                      closed:{label:"Closed",color:"#1A7A4A",bg:"#E8F5EE"},
                    };
                    return filtered.map((cs,i)=>{
                      const next = getNextStep(cs);
                      const st = statusMap[cs.stage||getCaseStage(cs)]||statusMap.open;
                      const lastUpdated = cs.updatedAt||cs.createdAt;
                      const daysAgo = lastUpdated?Math.floor((Date.now()-new Date(lastUpdated))/(1000*60*60*24)):null;
                      return (
                        <div key={cs.id}
                          onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}}
                          style={{display:"flex",alignItems:"center",padding:"13px 18px",borderBottom:i<filtered.length-1?"1px solid #F5F1EA":"none",cursor:"pointer",transition:"background 0.1s"}}
                          onMouseEnter={e=>e.currentTarget.style.background="#FDFAF5"}
                          onMouseLeave={e=>e.currentTarget.style.background="none"}>
                          <div style={{width:36,height:36,borderRadius:"50%",background:"#EDE8FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#7C5CFC",flexShrink:0,marginRight:14}}>
                            {(cs.employeeName||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,color:"#1C1820",marginBottom:1}}>{cs.employeeName}</div>
                            <div style={{fontSize:12,color:"#9B9098"}}>{cs.caseType||"HR Matter"}{next?" · "+next.label:""}</div>
                          </div>
                          <div style={{marginRight:16}}>
                            <span style={{fontSize:11,fontWeight:600,color:st.color,background:st.bg,borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap"}}>{st.label}</span>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0,minWidth:80}}>
                            <div style={{fontSize:11,color:"#9B9098",marginBottom:1}}>Last updated</div>
                            <div style={{fontSize:11,color:"#1C1820",fontWeight:500}}>{daysAgo===null?"—":daysAgo===0?"Today":daysAgo===1?"Yesterday":fmtDate(lastUpdated)}</div>
                          </div>
                          <div style={{marginLeft:12,color:"#C4BAB0",fontSize:16,flexShrink:0}}>›</div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* ── Calendar ── */}
                {(()=>{
                  const today = new Date();
                  const weekDays = Array.from({length:7},(_,i)=>{
                    const d = new Date(today);
                    d.setDate(today.getDate()-today.getDay()+1+i);
                    return d;
                  });
                  const caseMeetings = cases.flatMap(cs=>(cs.meetings||[]).map(m=>({...m,employeeName:cs.employeeName,caseId:cs.id})));
                  return (
                    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                      <div style={{padding:"14px 18px",borderBottom:"1px solid #E8E0D0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div>
                          <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>This week</div>
                          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1C1820",fontWeight:400}}>Calendar</div>
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>setScreen(SCREENS.BRIEF)} style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Schedule meeting</button>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"1px solid #F5F1EA"}}>
                        {weekDays.map((d,i)=>{
                          const isToday = d.toDateString()===today.toDateString();
                          const dayMeetings = caseMeetings.filter(m=>{
                            if(!m.date) return false;
                            const parts = m.date.split("/");
                            if(parts.length===3){const md=new Date(parts[2],parts[1]-1,parts[0]);return md.toDateString()===d.toDateString();}
                            return false;
                          });
                          return (
                            <div key={i} style={{padding:"10px 8px",textAlign:"center",borderRight:i<6?"1px solid #F5F1EA":"none",background:isToday?"#EDE8FF":"none"}}>
                              <div style={{fontSize:10,fontWeight:600,color:isToday?"#7C5CFC":"#9B9098",letterSpacing:"0.5px",marginBottom:4}}>{d.toLocaleDateString("en-GB",{weekday:"short"}).toUpperCase()}</div>
                              <div style={{fontSize:16,fontWeight:700,color:isToday?"#7C5CFC":"#1C1820",marginBottom:4}}>{d.getDate()}</div>
                              {dayMeetings.slice(0,2).map((m,j)=>(
                                <div key={j} style={{fontSize:9,background:isToday?"#7C5CFC":"#F5F1EA",color:isToday?"#fff":"#6B6375",borderRadius:3,padding:"2px 4px",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}} onClick={()=>{setActiveCaseId(m.caseId);setScreen(SCREENS.CASE_VIEW);}}>{m.employeeName}</div>
                              ))}
                              {dayMeetings.length>2&&<div style={{fontSize:9,color:"#9B9098"}}>+{dayMeetings.length-2}</div>}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{padding:"12px 18px"}}>
                        {(()=>{
                          const todayMeetings = caseMeetings.filter(m=>{
                            if(!m.date) return false;
                            const parts = m.date.split("/");
                            if(parts.length===3){const md=new Date(parts[2],parts[1]-1,parts[0]);return md.toDateString()===today.toDateString();}
                            return false;
                          });
                          if(todayMeetings.length===0) return <div style={{fontSize:12,color:"#9B9098",textAlign:"center",padding:"8px 0"}}>No meetings logged for today. Connect your calendar to see external events.</div>;
                          return todayMeetings.map((m,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:i<todayMeetings.length-1?"1px solid #F5F1EA":"none"}}>
                              <div style={{width:3,height:32,background:"#7C5CFC",borderRadius:2,flexShrink:0}}/>
                              <div>
                                <div style={{fontSize:12,fontWeight:600,color:"#1C1820"}}>{m.employeeName}</div>
                                <div style={{fontSize:11,color:"#9B9098"}}>{m.type||"Meeting"}</div>
                              </div>
                            </div>
                          ));
                        })()}
                        <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F5F1EA",display:"flex",gap:8,flexWrap:"wrap"}}>
                          <button style={{fontSize:11,color:"#6B6375",background:"#F5F1EA",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Connect Google Calendar</button>
                          <button style={{fontSize:11,color:"#6B6375",background:"#F5F1EA",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Connect Outlook</button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* ── Right column ── */}
              <div style={{display:"flex",flexDirection:"column",gap:16}}>

                {/* AI HR Advisor */}
                <div style={{background:"#1C1820",borderRadius:12,overflow:"hidden"}}>
                  <div style={{padding:"14px 18px",borderBottom:"1px solid #2A2535"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>AI powered</div>
                    <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#FFFFFF",fontWeight:400}}>HR Advisor</div>
                    <div style={{fontSize:11,color:"#6B6375",marginTop:2}}>UK employment law · ACAS guidance</div>
                  </div>
                  <div style={{padding:14}}>
                    <div style={{maxHeight:200,overflowY:"auto",marginBottom:10,display:"flex",flexDirection:"column",gap:8}}>
                      {askCompassHistory.length===0&&(
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          {["ACAS disciplinary process?","Dismissal on zero-hours contract?","Reasonable adjustments — what's required?","How long should an investigation take?"].map((q,i)=>(
                            <button key={i} onClick={()=>{setAskCompassHistory([{role:"user",content:q}]);askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}} style={{textAlign:"left",fontSize:12,color:"#9B9098",background:"#252030",border:"1px solid #2A2535",borderRadius:7,padding:"7px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",lineHeight:1.4}}>{q}</button>
                          ))}
                        </div>
                      )}
                      {askCompassHistory.map((m,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                          <div style={{maxWidth:"85%",fontSize:12,lineHeight:1.5,padding:"7px 10px",borderRadius:8,background:m.role==="user"?"#7C5CFC":"#252030",color:m.role==="user"?"#fff":"#C4BDAF"}}>{m.content}</div>
                        </div>
                      ))}
                      {askCompassProcessing&&<div style={{fontSize:12,color:"#6B6375",fontStyle:"italic"}}>Thinking…</div>}
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <input value={askCompassInput} onChange={e=>setAskCompassInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&askCompassInput.trim()){const q=askCompassInput.trim();setAskCompassInput("");setAskCompassHistory(h=>[...h,{role:"user",content:q}]);askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}}} placeholder="Ask an HR question…" style={{flex:1,fontSize:12,border:"1px solid #2A2535",borderRadius:7,padding:"7px 10px",background:"#252030",color:"#F2EDE4",fontFamily:"DM Sans,system-ui,sans-serif",outline:"none"}}/>
                      <button onClick={()=>{if(askCompassInput.trim()){const q=askCompassInput.trim();setAskCompassInput("");setAskCompassHistory(h=>[...h,{role:"user",content:q}]);askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}}} style={{background:"#7C5CFC",border:"none",borderRadius:7,padding:"7px 12px",cursor:"pointer",color:"#fff",fontSize:14,fontWeight:600}}>→</button>
                    </div>
                  </div>
                </div>

                {/* Quick links */}
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                  <div style={{padding:"14px 18px",borderBottom:"1px solid #E8E0D0"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>Resources</div>
                    <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1C1820",fontWeight:400}}>Policies & templates</div>
                  </div>
                  <div style={{padding:"4px 0"}}>
                    {(()=>{
                      const links = policies.length>0
                        ? policies.slice(0,5).map(p=>({label:p.name||p.title||"Policy",type:"POLICY"}))
                        : [{label:"Disciplinary Policy",type:"POLICY"},{label:"Grievance Policy",type:"POLICY"},{label:"ACAS Code of Practice",type:"GUIDE"},{label:"Invitation to hearing",type:"TEMPLATE"},{label:"Outcome letter",type:"TEMPLATE"}];
                      return links.map((item,i)=>(
                        <button key={i} onClick={()=>setScreen(SCREENS.SETTINGS)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"10px 18px",border:"none",background:"none",cursor:"pointer",textAlign:"left",fontFamily:"DM Sans,system-ui,sans-serif",borderBottom:i<links.length-1?"1px solid #F5F1EA":"none",transition:"background 0.1s"}}
                          onMouseEnter={e=>e.currentTarget.style.background="#FDFAF5"}
                          onMouseLeave={e=>e.currentTarget.style.background="none"}>
                          <div style={{width:28,height:28,background:"#FFF0EB",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <div style={{width:3,height:14,background:"#E8622A",borderRadius:2}}/>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:10,color:"#9B9098",fontWeight:600,letterSpacing:"0.5px"}}>{item.type}</div>
                            <div style={{fontSize:12,color:"#1C1820",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.label}</div>
                          </div>
                          <span style={{color:"#C4BAB0",fontSize:14,flexShrink:0}}>›</span>
                        </button>
                      ));
                    })()}
                    <button onClick={()=>setScreen(SCREENS.SETTINGS)} style={{width:"100%",padding:"10px 18px",border:"none",background:"none",cursor:"pointer",textAlign:"center",fontSize:12,color:"#7C5CFC",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>View all policies →</button>
                  </div>
                </div>

                {/* Deadlines */}
                {dueSoon.length>0&&(
                  <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                    <div style={{padding:"14px 18px",borderBottom:"1px solid #E8E0D0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1C1820",fontWeight:400}}>Deadlines</div>
                      {dueSoon.some(d=>d.overdue)&&<span style={{fontSize:11,background:"#FFF0EB",color:"#E8622A",borderRadius:10,padding:"3px 8px",fontWeight:600}}>Overdue</span>}
                    </div>
                    <div style={{padding:"4px 0"}}>
                      {dueSoon.slice(0,5).map((d,i)=>(
                        <div key={i} style={{padding:"10px 18px",display:"flex",alignItems:"center",gap:10,borderBottom:i<Math.min(dueSoon.length,5)-1?"1px solid #F5F1EA":"none"}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:d.overdue?"#C84B2F":d.daysLeft<=3?"#E8622A":"#7C5CFC",flexShrink:0}}/>
                          <div style={{flex:1}}>
                            <div style={{fontSize:12,color:"#1C1820",fontWeight:500}}>{d.label||d.employeeName}</div>
                            <div style={{fontSize:11,color:d.overdue?"#C84B2F":"#9B9098"}}>{d.overdue?"Overdue":d.daysLeft===0?"Due today":"In "+d.daysLeft+" day"+(d.daysLeft!==1?"s":"")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ HOME MEETING SETUP ══ */}
      {screen===SCREENS.HOME+"_meeting"&&(
        <div style={{minHeight:"100vh",background:"#FDFAF5",display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 32px",background:"#FFFFFF",borderBottom:"1px solid #EDE5D8"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <CompassLogo size={26}/>
              <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535"}}>Compass</span>
            </div>
            <button onClick={()=>setScreen(SCREENS.HOME)} style={{background:"none",border:"none",color:"#6B6375",fontSize:13,cursor:"pointer"}}>← Back</button>
          </div>
          <div style={{flex:1,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"48px 24px"}}>
            <div style={{width:"100%",maxWidth:480}}>
              <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:28,fontWeight:400,color:"#1A1535",margin:"0 0 6px",letterSpacing:"-0.3px"}}>New meeting</h2>
              <p style={{fontSize:14,color:"#9B9098",margin:"0 0 32px"}}>Fill in the details — Compass handles the rest</p>

              <div style={{marginBottom:20}}>
                <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>Your name (chair)</label>
                <input autoFocus placeholder="e.g. Tom Norton"
                  value={meetingSetup.manager||""}
                  onChange={e=>setMeetingSetup(p=>({...p,manager:e.target.value}))}
                  style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",fontSize:15,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}
                  onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.boxShadow="0 0 0 3px rgba(124,92,252,0.1)";}}
                  onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.boxShadow="0 1px 2px rgba(26,21,53,0.04)";}}/>
              </div>

              {meetingSetup.linkedCaseId&&(
                <div style={{background:"#EDE8FF",border:"1px solid #D4C9F5",borderRadius:8,padding:"12px 16px",marginBottom:16}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#5B3FD4",marginBottom:2}}>Witness interview</div>
                  <div style={{fontSize:12,color:"#7C5CFC"}}>This interview will be saved as evidence in {meetingSetup.linkedCaseName} case</div>
                </div>
              )}
              <div style={{marginBottom:20}}>
                <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>{meetingSetup.linkedCaseId?"Witness name":"Employee name"}</label>
                <input placeholder={meetingSetup.linkedCaseId?"e.g. John Smith (witness)":"e.g. Sarah Johnson"}
                  value={meetingSetup.employee}
                  onChange={e=>setMeetingSetup(p=>({...p,employee:e.target.value}))}
                  list="employee-list"
                  style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",fontSize:15,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}
                  onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.boxShadow="0 0 0 3px rgba(124,92,252,0.1)";}}
                  onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.boxShadow="0 1px 2px rgba(26,21,53,0.04)";}}/>
                <datalist id="employee-list">
                  {[...new Set(cases.map(cs=>cs.employeeName).filter(Boolean))].map(n=><option key={n} value={n}/>)}
                </datalist>
              </div>

              <div style={{marginBottom:20}}>
                <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>Meeting type</label>
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,overflow:"hidden",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}>
                  {[
                    {id:"investigation",label:"Investigation",desc:"Fact-finding before formal action"},
                    {id:"disciplinary",label:"Disciplinary hearing",desc:"Formal disciplinary process"},
                    {id:"grievance",label:"Grievance",desc:"Employee raised a concern"},
                    {id:"redundancy-atrisk",label:"Redundancy consultation",desc:"At risk or confirmed redundancy"},
                    {id:"return",label:"Return to work",desc:"After sickness absence"},
                    {id:"informal",label:"Informal / 1-1",desc:"General check-in"},
                    {id:"appeal-disciplinary",label:"Appeal",desc:"Appeal against a decision"},
                    {id:"pip-review",label:"Performance review",desc:"PIP or performance discussion"},
                  ].map((t,i,arr)=>(
                    <button key={t.id} onClick={()=>setMeetingSetup(p=>({...p,type:t.id}))}
                      style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",background:meetingSetup.type===t.id?"#F5F3FF":"#FFFFFF",border:"none",borderBottom:i<arr.length-1?"1px solid #F5F1EA":"none",borderLeft:`3px solid ${meetingSetup.type===t.id?"#7C5CFC":"transparent"}`,cursor:"pointer",textAlign:"left",transition:"all 0.1s",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:meetingSetup.type===t.id?600:400,color:meetingSetup.type===t.id?"#5B3FD4":"#1A1535"}}>{t.label}</div>
                        <div style={{fontSize:12,color:"#9B9098",marginTop:1}}>{t.desc}</div>
                      </div>
                      {meetingSetup.type===t.id&&<span style={{color:"#7C5CFC",fontSize:14,marginLeft:8}}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Invitation warning */}
              {meetingSetup.type&&needsInvitation(meetingSetup.type)&&(
                <div style={{background:"#FEF5E7",border:"1px solid #F5E6C4",borderRadius:10,padding:"14px 16px",marginBottom:16,display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:15,flexShrink:0}}>⚠️</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#B87520",marginBottom:3}}>Formal invitation required</div>
                    <div style={{fontSize:12,color:"#7A5C1A",lineHeight:1.6}}>
                      {meetingSetup.type==="disciplinary"&&"The employee must receive a written invitation at least 48 hours before the hearing, including the allegations, evidence, and right to be accompanied (ERA 1999 s.10)."}
                      {meetingSetup.type==="grievance"&&"Send a written invitation confirming the date, time, location and the employee's right to be accompanied."}
                      {meetingSetup.type==="redundancy-atrisk"&&"Employees must receive written notice of the at-risk meeting and have the opportunity to discuss alternatives (ERA 1996)."}
                      {meetingSetup.type==="appeal-disciplinary"&&"The appeal invitation must confirm the grounds being considered and the employee's right to be accompanied."}
                      {meetingSetup.type==="pip-review"&&"Send a written invitation with the agenda and any supporting documents in advance."}
                    </div>
                    <button onClick={()=>{
                        const mt = MEETING_TYPES.find(t=>t.id===meetingSetup.type)||{id:meetingSetup.type,label:meetingSetup.type};
                        setCaseInfo(p=>({...p,
                          employee:meetingSetup.employee.trim()||p.employee,
                          manager:meetingSetup.manager||p.manager,
                          date:meetingSetup.date
                        }));
                        setMeetingType(mt);
                        setPendingLetterType("invite");
                        setShowLetterModal(true);
                      }}
                      style={{marginTop:8,background:"none",border:"1px solid #B87520",borderRadius:6,padding:"5px 12px",fontSize:11,color:"#B87520",cursor:"pointer",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>
                      Draft invitation letter →
                    </button>
                  </div>
                </div>
              )}

              <div style={{marginBottom:28}}>
                <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:7}}>Date</label>
                <input type="date" value={meetingSetup.date}
                  onChange={e=>setMeetingSetup(p=>({...p,date:e.target.value}))}
                  style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",fontSize:15,color:"#1A1535",outline:"none",boxSizing:"border-box",boxShadow:"0 1px 2px rgba(26,21,53,0.04)"}}
                  onFocus={e=>{e.target.style.borderColor="#7C5CFC";}}
                  onBlur={e=>{e.target.style.borderColor="#E8E0D0";}}/>
              </div>

              <button
                disabled={!meetingSetup.employee.trim()||!meetingSetup.type}
                onClick={()=>{
                  const mt = MEETING_TYPES.find(t=>t.id===meetingSetup.type)||{id:meetingSetup.type,label:meetingSetup.type,mode:"er",group:"formal"};
                  setMeetingType(mt);
                  setCaseInfo(p=>({...p,employee:meetingSetup.employee.trim(),date:meetingSetup.date,manager:meetingSetup.manager||"",_linkedCaseId:meetingSetup.linkedCaseId||p._linkedCaseId,_linkedCaseName:meetingSetup.linkedCaseName||p._linkedCaseName}));
                  setTranscript([]);setPrepNotes("");setReviewOutput("");setLetterOutput("");setRiskScore(null);setLiveChatHistory([]);
                  const hasPrev=cases.some(cs=>cs.employeeName===meetingSetup.employee.trim());
                  if(hasPrev){generateBrief(meetingSetup.employee.trim(),mt.label);setScreen(SCREENS.BRIEF);}else{setScreen(SCREENS.RECORD);}
                }}
                style={{width:"100%",background:(!meetingSetup.employee.trim()||!meetingSetup.type)?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:10,padding:"14px",fontSize:15,color:(!meetingSetup.employee.trim()||!meetingSetup.type)?"#9B9098":"#FFFFFF",fontWeight:600,cursor:(!meetingSetup.employee.trim()||!meetingSetup.type)?"not-allowed":"pointer",transition:"all 0.15s",fontFamily:"DM Sans,system-ui,sans-serif",boxShadow:(!meetingSetup.employee.trim()||!meetingSetup.type)?"none":"0 4px 16px rgba(124,92,252,0.25)"}}>
                Start meeting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ BRIEF ══ */}
      {screen===SCREENS.BRIEF&&(
        <div style={{minHeight:"100vh",background:"#FDFAF5",display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",borderBottom:"1px solid #EDE5D8",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <CompassLogo size={22}/>
              <div>
                <div style={{fontSize:11,color:"#7C5CFC",fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>{meetingType?.label}</div>
                <div style={{fontSize:15,fontFamily:"DM Serif Display,Georgia,serif",color:"#1A1535"}}>{caseInfo.employee}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setScreen(SCREENS.HOME)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"7px 14px",fontSize:12,color:"#6B6375",cursor:"pointer"}}>Back</button>
              <button onClick={()=>setScreen(SCREENS.RECORD)} style={{background:"#7C5CFC",border:"none",borderRadius:6,padding:"7px 18px",fontSize:13,color:"#fff",fontWeight:600,cursor:"pointer"}}>Start meeting</button>
            </div>
          </div>
          <div style={{flex:1,maxWidth:660,margin:"0 auto",padding:"40px 24px",width:"100%"}}>
            <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:24,fontWeight:400,color:"#1A1535",margin:"0 0 4px"}}>Meeting brief</h2>
            <p style={{fontSize:13,color:"#9B9098",margin:"0 0 28px"}}>Review before starting your meeting with {caseInfo.employee}</p>
            {briefData&&(
              <div style={{display:"flex",gap:10,marginBottom:24,flexWrap:"wrap"}}>
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",flex:1}}>
                  <div style={{fontSize:11,color:"#9B9098",marginBottom:4}}>Previous meetings</div>
                  <div style={{fontSize:20,fontWeight:600,color:"#1A1535"}}>{briefData.count}</div>
                </div>
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",flex:1}}>
                  <div style={{fontSize:11,color:"#9B9098",marginBottom:4}}>Last meeting</div>
                  <div style={{fontSize:13,color:"#3D3560"}}>{briefData.lastMeeting?.type||"—"}</div>
                  <div style={{fontSize:11,color:"#9B9098"}}>{briefData.lastMeeting?.date||""}</div>
                </div>
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",flex:1}}>
                  <div style={{fontSize:11,color:"#9B9098",marginBottom:4}}>Risk level</div>
                  <div style={{fontSize:13,fontWeight:600,color:briefData.lastRisk==="HIGH"?"#F04E37":briefData.lastRisk==="MEDIUM"?"#F59E0B":"#22C55E"}}>{briefData.lastRisk}</div>
                </div>
              </div>
            )}
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"20px",marginBottom:20}}>
              <div style={{fontSize:11,color:"#7C5CFC",fontWeight:600,letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>AI Brief</div>
              {briefLoading&&<div style={{fontSize:12,color:"#9B9098",fontStyle:"italic"}}>Preparing your brief...</div>}
              {briefData?.txt&&<div style={{fontSize:13,color:"#3D3560",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{briefData.txt}</div>}
              {!briefLoading&&!briefData&&<div style={{fontSize:12,color:"#9B9098"}}>No previous meetings found.</div>}
            </div>
            {briefData&&briefData.count>0&&(
              <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                <div style={{padding:"14px 20px",borderBottom:"1px solid #EDE5D8"}}>
                  <div style={{fontSize:11,color:"#6B6375",fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>Meeting history</div>
                </div>
                {cases.filter(cs=>cs.employeeName===caseInfo.employee).flatMap(cs=>cs.meetings||[]).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5).map((m,i)=>(
                  <div key={i} style={{padding:"11px 20px",borderBottom:"1px solid #EDE5D8",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13,color:"#3D3560"}}>{m.type}</div>
                      <div style={{fontSize:11,color:"#9B9098"}}>{m.date}</div>
                    </div>
                    {m.riskScore?.rating&&<span style={{fontSize:11,fontWeight:600,color:m.riskScore.rating==="HIGH"?"#F04E37":m.riskScore.rating==="MEDIUM"?"#F59E0B":"#22C55E"}}>{m.riskScore.rating}</span>}
                  </div>
                ))}
              </div>
            )}
            <div style={{marginTop:24,textAlign:"center"}}>
              <button onClick={()=>setScreen(SCREENS.RECORD)} style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"12px 36px",fontSize:14,color:"#fff",fontWeight:600,cursor:"pointer"}}>Start meeting</button>
            </div>
          </div>
        </div>
      )}


      {/* ══ PEOPLE ══ */}
      {screen===SCREENS.PEOPLE&&(
        <div style={{maxWidth:900,margin:"0 auto",padding:"32px 20px"}}>
          <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>People</h2>
          <p style={{fontSize:13,color:"#9B9098",margin:"0 0 24px"}}>All employees with meeting history</p>
          {(()=>{
            const people = [...new Set(cases.map(c=>c.employeeName))].map(name=>{
              const empCases = cases.filter(c=>c.employeeName===name);
              const meetings = empCases.flatMap(c=>c.meetings||[]).sort((a,b)=>new Date(b.date)-new Date(a.date));
              const lastRisk = meetings.find(m=>m.riskScore?.rating)?.riskScore?.rating;
              return {name, meetings, lastRisk, lastDate:meetings[0]?.date};
            }).sort((a,b)=>new Date(b.lastDate)-new Date(a.lastDate));
            return(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {people.map(p=>(
                  <div key={p.name} onClick={()=>{setActivePerson(p.name);setScreen(SCREENS.PERSON_VIEW);}}
                    style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px 20px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>{p.name}</div>
                      <div style={{fontSize:12,color:"#9B9098"}}>{p.meetings.length} meeting{p.meetings.length!==1?"s":""} · Last: {p.lastDate||"Unknown"}</div>
                      <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                        {p.meetings.slice(0,3).map((m,i)=>(
                          <span key={i} style={{fontSize:11,background:"#F5F1EA",border:"1px solid #E8E0D0",borderRadius:4,padding:"2px 8px",color:"#6B6375"}}>{m.type}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                      {p.lastRisk&&<span style={{fontSize:11,fontWeight:600,color:p.lastRisk==="HIGH"?"#F04E37":p.lastRisk==="MEDIUM"?"#F59E0B":"#22C55E",background:p.lastRisk==="HIGH"?"rgba(240,78,55,0.1)":p.lastRisk==="MEDIUM"?"rgba(245,158,11,0.1)":"rgba(34,197,94,0.1)",padding:"3px 8px",borderRadius:4}}>{p.lastRisk} RISK</span>}
                      <button onClick={e=>{e.stopPropagation();setCaseInfo(p2=>({...p2,employee:p.name}));setMeetingSetup(s=>({...s,employee:p.name}));setScreen(SCREENS.HOME);}}
                        style={{fontSize:11,background:"#7C5CFC",border:"none",borderRadius:5,padding:"4px 10px",color:"#fff",cursor:"pointer",fontWeight:500}}>New meeting</button>
                    </div>
                  </div>
                ))}
                {people.length===0&&<div style={{textAlign:"center",padding:"60px 20px",color:"#9B9098",fontSize:13}}>No people yet — start a meeting to create records</div>}
              </div>
            );
          })()}
        </div>
      )}


      
      
      {/* ══ PERSON VIEW ══ */}
      {screen===SCREENS.PERSON_VIEW&&(()=>{
        const empName = activePerson;
        const empCases = cases.filter(c=>c.employeeName===empName);
        const allMeetings = empCases.flatMap(cs=>(cs.meetings||[]).map(m=>({...m,caseId:cs.id,caseType:cs.caseType}))).sort((a,b)=>new Date(b.date)-new Date(a.date));
        const activeCases = empCases.filter(cs=>cs.stage!=="closed");
        const closedCases = empCases.filter(cs=>cs.stage==="closed");
        const highRisk = allMeetings.some(m=>m.riskScore?.rating==="HIGH");

        return(
          <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>

            {/* Header */}
            <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"14px 28px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <button onClick={()=>setScreen(SCREENS.PEOPLE)}
                  style={{background:"none",border:"none",color:"#6B6375",fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>← People</button>
                <div style={{width:1,height:20,background:"#EDE5D8"}}/>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:"#EDE8FF",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{fontSize:16,fontWeight:600,color:"#7C5CFC"}}>{(empName||"?")[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535"}}>{empName}</div>
                    <div style={{fontSize:12,color:"#9B9098"}}>{allMeetings.length} meeting{allMeetings.length!==1?"s":""} · {empCases.length} case{empCases.length!==1?"s":""}{highRisk?" · High risk":""}</div>
                  </div>
                </div>
              </div>
              <button onClick={()=>{setMeetingSetup(p=>({...p,employee:empName}));setScreen(SCREENS.HOME+"_meeting");}}
                style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                + New meeting
              </button>
            </div>

            <div style={{maxWidth:820,margin:"0 auto",padding:"28px 24px"}}>

              {/* Active cases */}
              {activeCases.length>0&&(
                <div style={{marginBottom:24}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Active cases</div>
                  {activeCases.map(cs=>(
                    <div key={cs.id} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}}
                      style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all 0.15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor="#7C5CFC";e.currentTarget.style.background="#FDFAFF";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="#E8E0D0";e.currentTarget.style.background="#FFFFFF";}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"#1A1535",marginBottom:3,textTransform:"capitalize"}}>{cs.caseType||"HR Case"}</div>
                        <div style={{fontSize:12,color:"#9B9098"}}>Opened {fmtDate(cs.dateReceived)} · {(cs.meetings||[]).length} meeting{(cs.meetings||[]).length!==1?"s":""}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,fontWeight:600,color:getCaseStatus(cs).color,background:getCaseStatus(cs).bg,borderRadius:20,padding:"3px 10px"}}>{getCaseStatus(cs).label}</span>
                        <span style={{color:"#C4BAB0",fontSize:16}}>›</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Full meeting history */}
              <div>
                <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Meeting history</div>
                {allMeetings.length===0&&(
                  <div style={{textAlign:"center",padding:"40px",background:"#FFFFFF",borderRadius:10,border:"1px solid #E8E0D0",color:"#9B9098",fontSize:13}}>
                    No meetings recorded yet
                  </div>
                )}
                {allMeetings.map((m,i)=>(
                  <div key={i} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:(m.type||"").toLowerCase().includes("investigation")?"#EDE8FF":(m.type||"").toLowerCase().includes("disciplinary")?"#FEF0EB":(m.type||"").toLowerCase().includes("appeal")?"#FEF5E7":"#F5F1EA",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:11,fontWeight:700,color:(m.type||"").toLowerCase().includes("investigation")?"#7C5CFC":(m.type||"").toLowerCase().includes("disciplinary")?"#C84B2F":(m.type||"").toLowerCase().includes("appeal")?"#B87520":"#6B6375"}}>
                          {(m.type||"M")[0].toUpperCase()}
                        </span>
                      </div>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,color:"#1A1535"}}>{m.type}</div>
                        <div style={{fontSize:11,color:"#9B9098",marginTop:1}}>{fmtDate(m.date)} · {m.savedBy||m.manager||"HR Manager"}{m.caseType?" · "+m.caseType:""}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                      {m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN"&&<span style={{fontSize:10,fontWeight:600,color:m.riskScore.rating==="HIGH"?"#C84B2F":"#B87520",background:m.riskScore.rating==="HIGH"?"#FEF0EB":"#FEF5E7",borderRadius:4,padding:"2px 7px"}}>{m.riskScore.rating}</span>}
                      {m.signStatus==="signed"&&<span style={{fontSize:10,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"2px 7px",fontWeight:600}}>Signed</span>}
                      {m.signStatus==="pending"&&<span style={{fontSize:10,color:"#B87520",background:"#FEF5E7",borderRadius:4,padding:"2px 7px"}}>Pending signature</span>}
                      {m.record&&<button onClick={()=>{setReviewOutput(m.record);setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);setCaseInfo(p=>({...p,employee:empName,date:m.date,manager:m.manager||""}));setScreen(SCREENS.REVIEW);}}
                        style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>View</button>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Closed cases */}
              {closedCases.length>0&&(
                <div style={{marginTop:24}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Closed cases</div>
                  {closedCases.map(cs=>(
                    <div key={cs.id} style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontSize:13,color:"#6B6375",textTransform:"capitalize"}}>{cs.caseType||"HR Case"}</div>
                        <div style={{fontSize:11,color:"#9B9098"}}>Opened {fmtDate(cs.dateReceived)} · {(cs.meetings||[]).length} meeting{(cs.meetings||[]).length!==1?"s":""}</div>
                      </div>
                      <span style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",borderRadius:20,padding:"3px 10px",fontWeight:600}}>Closed</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

{/* ══ CASE VIEW ══ */}
      {screen===SCREENS.CASE_VIEW&&activeCaseId&&(()=>{
        const cs = cases.find(x=>x.id===activeCaseId);
        if(!cs) return <div style={{padding:40,color:"#9B9098",fontFamily:"DM Sans,system-ui,sans-serif"}}>Case not found — <button onClick={()=>setScreen(SCREENS.CASES)} style={{color:"#7C5CFC",background:"none",border:"none",cursor:"pointer"}}>Back to cases</button></div>;
        const meetings = cs.meetings||[];
        const invMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("investigation")).sort((a,b)=>new Date(b.date)-new Date(a.date));
        const discMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("disciplinary")).sort((a,b)=>new Date(b.date)-new Date(a.date));
        const appealMeetings = meetings.filter(m=>(m.type||"").toLowerCase().includes("appeal")).sort((a,b)=>new Date(b.date)-new Date(a.date));
        const otherMeetings = meetings.filter(m=>!["investigation","disciplinary","appeal"].some(t=>(m.type||"").toLowerCase().includes(t))).sort((a,b)=>new Date(b.date)-new Date(a.date));
        const stage = getCaseStage(cs);
        const nextStep = getNextStep(cs);
        const allStages = [
          {id:"investigation",label:"Investigation",meetings:invMeetings,color:"#7C5CFC"},
          {id:"disciplinary",label:"Disciplinary",meetings:discMeetings,color:"#C84B2F"},
          {id:"appeal",label:"Appeal",meetings:appealMeetings,color:"#B87520"},
          ...(otherMeetings.length>0?[{id:"other",label:"Other",meetings:otherMeetings,color:"#6B6375"}]:[]),
        ].filter(s=>s.meetings.length>0||s.id==="investigation");
        const activeStage = allStages.find(s=>s.id===activeCaseStage)||allStages[0];

        const MeetingRow = ({m})=>(
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:"1px solid #F5F1EA",gap:12}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,color:"#1A1535"}}>{m.type}</div>
              <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{fmtDate(m.date)} · {m.savedBy||m.manager||"HR Manager"}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              {m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN"&&<span style={{fontSize:10,fontWeight:600,color:m.riskScore.rating==="HIGH"?"#C84B2F":"#B87520",background:m.riskScore.rating==="HIGH"?"#FEF0EB":"#FEF5E7",borderRadius:4,padding:"2px 7px"}}>{m.riskScore.rating}</span>}
              {m.signStatus==="signed"&&<span style={{fontSize:10,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"2px 7px",fontWeight:600}}>Signed</span>}
              {m.signStatus==="pending"&&<span style={{fontSize:10,color:"#B87520",background:"#FEF5E7",borderRadius:4,padding:"2px 7px"}}>Pending signature</span>}
              {m.signStatus==="pending"&&<button onClick={()=>saveCases(cases.map(x=>x.id===cs.id?{...x,meetings:x.meetings.map(mt=>mt.id===m.id?{...mt,signStatus:"signed"}:mt)}:x))} style={{fontSize:10,background:"#E8F5EE",border:"none",borderRadius:4,padding:"2px 8px",color:"#1A7A4A",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Mark signed</button>}
              {m.record&&<button onClick={()=>{setReviewOutput(m.record);setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);setCaseInfo(p=>({...p,employee:cs.employeeName,manager:m.manager||"",date:m.date}));setScreen(SCREENS.REVIEW);}} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>View notes</button>}
            </div>
          </div>
        );

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
                  <button onClick={()=>{const type=activeStage?.id==="investigation"?"investigation":activeStage?.id==="appeal"?"appeal-disciplinary":"disciplinary";setMeetingSetup(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",type}));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",_linkedCaseId:null}));setScreen(SCREENS.HOME+"_meeting");}}
                    style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>+ New meeting</button>
                </div>
              </div>
              {/* Stage tabs */}
              <div style={{display:"flex",gap:2}}>
                {allStages.map(s=>(
                  <button key={s.id} onClick={()=>setActiveCaseStage(s.id)}
                    style={{padding:"6px 14px",borderRadius:6,border:"none",background:activeCaseStage===s.id?"#F5F3FF":"none",color:activeCaseStage===s.id?s.color:"#6B6375",fontWeight:activeCaseStage===s.id?600:400,fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",display:"flex",alignItems:"center",gap:5}}>
                    {s.label}
                    {s.meetings.length>0&&<span style={{fontSize:10,background:activeCaseStage===s.id?s.color:"#E8E0D0",color:activeCaseStage===s.id?"#fff":"#6B6375",borderRadius:10,padding:"1px 6px",fontWeight:600}}>{s.meetings.length}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Next action */}
            {nextStep&&stage!=="closed"&&(
              <div style={{background:"#F5F3FF",borderBottom:"1px solid #DDD9F5",padding:"10px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
                <div style={{fontSize:13,color:"#5B3FD4",fontWeight:500}}>Next: {nextStep.label}</div>
                <div style={{display:"flex",gap:8}}>
                  {nextStep.secondary&&<button onClick={()=>{if(nextStep.secondary.action==="close_no_case"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed",closedReason:"no_case"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||""}));handleLetter("no-case-answer");}}} style={{fontSize:12,background:"none",border:"1px solid #DDD9F5",borderRadius:6,padding:"6px 14px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{nextStep.secondary.label}</button>}
                  <button onClick={()=>{
                    if(nextStep.action==="start_investigation"||nextStep.action==="start_disciplinary"||nextStep.action==="start_appeal_meeting"){setMeetingSetup(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",type:nextStep.action==="start_investigation"?"investigation":nextStep.action==="start_appeal_meeting"?"appeal-disciplinary":"disciplinary"}));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",_linkedCaseId:null}));setScreen(SCREENS.HOME+"_meeting");}
                    else if(nextStep.action==="send_signature"){const rel=stage==="investigation"?invMeetings:stage==="appeal"?appealMeetings:discMeetings;const m=rel[0]||meetings[meetings.length-1];if(m?.record){setReviewOutput(m.record);setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);setShowSignModal(true);}}
                    else if(nextStep.action==="inv_report"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"inv_report"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",evidence:cs.evidence||[]}));setMeetingType(MEETING_TYPES.find(t=>t.id==="investigation")||null);handleLetter("investigation-report");}
                    else if(nextStep.action==="disciplinary_invite"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"disciplinary"}:x));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",evidence:cs.evidence||[]}));setMeetingType(MEETING_TYPES.find(t=>t.id==="disciplinary")||null);handleLetter("invite");}
                    else if(nextStep.action==="outcome_letter"||nextStep.action==="appeal_letter"){const m=discMeetings[0]||meetings[meetings.length-1];if(m){setReviewOutput(m.record||"");setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",date:m.date}));setMeetingType(MEETING_TYPES.find(t=>t.label===m.type)||null);}saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"outcome"}:x));handleLetter("outcome");}
                    else if(nextStep.action==="close_case"){saveCases(cases.map(x=>x.id===cs.id?{...x,stage:"closed"}:x));}
                  }} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"6px 18px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{nextStep.label} →</button>
                </div>
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

            {/* Stage content */}
            <div style={{flex:1,overflowY:"auto",padding:"24px 28px"}}>
              {activeStage&&(
                <div style={{maxWidth:800,margin:"0 auto"}}>
                  {activeStage.meetings.length>0?(
                    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,marginBottom:16,overflow:"hidden"}}>
                      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{fontSize:11,fontWeight:700,color:activeStage.color,letterSpacing:"0.5px",textTransform:"uppercase"}}>Meetings ({activeStage.meetings.length})</div>
                        <button onClick={()=>{const type=activeStage.id==="investigation"?"investigation":activeStage.id==="appeal"?"appeal-disciplinary":"disciplinary";setMeetingSetup(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",type}));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",_linkedCaseId:null}));setScreen(SCREENS.HOME+"_meeting");}} style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>+ Add meeting</button>
                      </div>
                      <div style={{padding:"0 16px"}}>
                        {activeStage.meetings.map((m,i)=><MeetingRow key={m.id||i} m={m}/>)}
                      </div>
                    </div>
                  ):(
                    <div style={{textAlign:"center",padding:"40px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E8E0D0",marginBottom:16}}>
                      <div style={{fontSize:14,color:"#9B9098",marginBottom:12}}>No {activeStage.label.toLowerCase()} meetings yet</div>
                      <button onClick={()=>{const type=activeStage.id==="investigation"?"investigation":activeStage.id==="appeal"?"appeal-disciplinary":"disciplinary";setMeetingSetup(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",type}));setCaseInfo(p=>({...p,employee:cs.employeeName,manager:cs.manager||"",_linkedCaseId:null}));setScreen(SCREENS.HOME+"_meeting");}} style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Start {activeStage.label.toLowerCase()} meeting</button>
                    </div>
                  )}

                  {activeStage.id==="investigation"&&(
                    <>
                      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,marginBottom:16,overflow:"hidden"}}>
                        <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}><div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Evidence & witness statements</div></div>
                        <div style={{padding:"16px"}}>
                          {(cs.evidence||[]).length===0&&<div style={{fontSize:13,color:"#9B9098",marginBottom:12}}>No evidence added yet</div>}
                          {(cs.evidence||[]).map((ev,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #F5F1EA"}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:13,color:"#1A1535",fontWeight:500}}>{ev.name}</div>
                                <div style={{display:"flex",gap:6,marginTop:2,alignItems:"center",flexWrap:"wrap"}}>
                                  <span style={{fontSize:11,color:"#9B9098"}}>{ev.type} · {fmtDate(ev.date)}</span>
                                  {ev.type==="Witness statement"&&(ev.signStatus==="signed"?<span style={{fontSize:10,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"1px 6px",fontWeight:600}}>Signed</span>:<span style={{fontSize:10,color:"#B87520",background:"#FEF5E7",borderRadius:4,padding:"1px 6px"}}>Pending signature</span>)}
                                </div>
                              </div>
                              <div style={{display:"flex",gap:6,flexShrink:0}}>
                                {ev.dataUrl&&<a href={ev.dataUrl} download={ev.name} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",borderRadius:4,padding:"3px 8px",textDecoration:"none",fontWeight:500}}>Download</a>}
                                {ev.record&&<button onClick={()=>{setReviewOutput(ev.record);setScreen(SCREENS.REVIEW);}} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>View notes</button>}
                                {ev.type==="Witness statement"&&(ev.signStatus==="signed"?<span style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",borderRadius:4,padding:"3px 8px",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Signed</span>:<button onClick={()=>saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:(x.evidence||[]).map((e,j)=>j===i?{...e,signStatus:"signed"}:e)}:x))} style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Mark signed</button>)}
                                <button onClick={()=>saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:(x.evidence||[]).filter((_,j)=>j!==i)}:x))} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Remove</button>
                              </div>
                            </div>
                          ))}
                          <label style={{display:"flex",alignItems:"center",justifyContent:"center",border:"2px dashed #E8E0D0",borderRadius:8,padding:"16px",cursor:"pointer",background:"#FDFAF5",marginTop:12,transition:"all 0.15s"}}
                            onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor="#7C5CFC";e.currentTarget.style.background="#F5F3FF";}}
                            onDragLeave={e=>{e.currentTarget.style.borderColor="#E8E0D0";e.currentTarget.style.background="#FDFAF5";}}
                            onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor="#E8E0D0";e.currentTarget.style.background="#FDFAF5";Array.from(e.dataTransfer.files).forEach(f=>{const r=new FileReader();r.onload=ev=>{const nv={name:f.name,type:f.type||"Document",size:f.size,date:new Date().toLocaleDateString("en-GB"),addedBy:currentUser?.name||"HR Manager",dataUrl:ev.target.result};saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:[...(x.evidence||[]),nv]}:x));};r.readAsDataURL(f);});}}>
                            <input type="file" multiple onChange={e=>{Array.from(e.target.files).forEach(f=>{const r=new FileReader();r.onload=ev=>{const nv={name:f.name,type:f.type||"Document",size:f.size,date:new Date().toLocaleDateString("en-GB"),addedBy:currentUser?.name||"HR Manager",dataUrl:ev.target.result};saveCases(cases.map(x=>x.id===cs.id?{...x,evidence:[...(x.evidence||[]),nv]}:x));};r.readAsDataURL(f);});}} style={{display:"none"}}/>
                            <div style={{textAlign:"center"}}><div style={{fontSize:13,color:"#6B6375",fontWeight:500}}>Drop files or click to upload</div><div style={{fontSize:11,color:"#9B9098",marginTop:2}}>CCTV, emails, screenshots, documents</div></div>
                          </label>
                          <div style={{marginTop:12,padding:"12px",background:"#F5F3FF",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <div><div style={{fontSize:12,fontWeight:500,color:"#1A1535"}}>Witness interview</div><div style={{fontSize:11,color:"#9B9098"}}>Record and save directly to this investigation</div></div>
                            <button onClick={()=>{setMeetingSetup(p=>({...p,employee:"",manager:cs.manager||"",type:"investigation",linkedCaseId:cs.id,linkedCaseName:cs.employeeName}));setCaseInfo(p=>({...p,_linkedCaseId:cs.id,_linkedCaseName:cs.employeeName}));setScreen(SCREENS.HOME+"_meeting");}} style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:6,padding:"6px 14px",color:"#fff",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>+ Witness interview</button>
                          </div>
                        </div>
                      </div>
                      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                        <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Investigation report</div>
                          {cs.investigationReport&&<button onClick={()=>{setLetterOutput(cs.investigationReport);setScreen(SCREENS.LETTER);}} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:4,padding:"3px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>View report</button>}
                        </div>
                        <div style={{padding:"14px 16px"}}>{
                          cs.investigationReport?(
                            <div style={{fontSize:13,color:"#1A7A4A"}}>Report generated {fmtDate(cs.investigationReportDate)}</div>
                          ):invMeetings.some(m=>m.record)?(
                            <div>
                              <div style={{fontSize:13,color:"#6B6375",marginBottom:12}}>Investigation meetings recorded. Ready to conclude.</div>
                              <button onClick={()=>{
                                const rpt = invMeetings.filter(m=>m.record).map(m=>"Meeting: "+m.type+" — "+m.date+"\n\n"+(m.record||"")).join("\n\n---\n\n");
                                const fullRpt = "Investigation Report\n\nEmployee: "+cs.employeeName+"\nCase: "+(cs.caseType||"HR Matter")+"\nDate concluded: "+new Date().toLocaleDateString("en-GB")+"\n\n"+rpt;
                                saveCases(cases.map(x=>x.id===cs.id?{...x,investigationReport:fullRpt,investigationReportDate:new Date().toISOString(),stage:"inv_report"}:x));
                                showToast("Investigation concluded");
                              }} style={{background:"#1C1820",border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                                Conclude investigation &amp; generate report
                              </button>
                            </div>
                          ):(
                            <div style={{fontSize:13,color:"#9B9098"}}>No report yet — complete investigation meetings first, then generate here.</div>
                          )
                        }</div>
                      </div>
                      {cs.investigationReport && !cs.disciplinaryOfficer && (
                        <div style={{marginTop:12,padding:"14px 16px",background:"#EDE8FF",borderRadius:12,border:"1px solid #C8BCFF"}}>
                          <div style={{fontSize:13,color:"#1C1820",fontWeight:600,marginBottom:4}}>Investigation complete</div>
                          <div style={{fontSize:12,color:"#6B6375",marginBottom:12}}>Appoint a disciplinary officer to continue the process.</div>
                          <button onClick={()=>setShowHandoffModal(true)} style={{fontSize:13,background:"#7C5CFC",border:"none",borderRadius:8,padding:"9px 20px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Appoint disciplinary officer →</button>
                        </div>
                      )}
                      {cs.disciplinaryOfficer && (
                        <div style={{marginTop:12,padding:"14px 16px",background:"#E8F5EE",borderRadius:12,border:"1px solid #A8D5B5"}}>
                          <div style={{fontSize:13,color:"#1A7A4A",fontWeight:600}}>Disciplinary officer appointed</div>
                          <div style={{fontSize:12,color:"#6B6375",marginTop:2}}>{cs.disciplinaryOfficer} · Handed off {fmtDate(cs.handoffDate)}</div>
                        </div>
                      )}
                    </>
                  )}
                  <div style={{marginTop:20,padding:"12px 0",borderTop:"1px solid #EDE5D8",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:11,color:"#9B9098"}}>{cs.description&&<span style={{fontStyle:"italic"}}>"{cs.description.slice(0,60)}{cs.description.length>60?"...":""}"</span>}{cs.referredBy&&<span style={{marginLeft:8}}>Referred by: {cs.referredBy}</span>}</div>
                    <button onClick={()=>{if(window.confirm("Delete this case?"))saveCases(cases.filter(x=>x.id!==cs.id));setScreen(SCREENS.CASES);}} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Delete case</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
{/* ══ INTAKE ══ */}
      {screen===SCREENS.INTAKE&&(
        <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>

          {/* Header */}
          <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"16px 32px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <CompassLogo size={24}/>
              <div>
                <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535"}}>New case</div>
                <div style={{fontSize:12,color:"#9B9098"}}>Log a case before starting any meetings</div>
              </div>
            </div>
            <button onClick={()=>setScreen(SCREENS.CASES)}
              style={{background:"none",border:"none",color:"#6B6375",fontSize:13,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
              ← Back to cases
            </button>
          </div>

          <div style={{maxWidth:620,margin:"0 auto",padding:"40px 24px"}}>

            <div style={{background:"#EDE8FF",border:"1px solid #D4C9F5",borderRadius:10,padding:"14px 18px",marginBottom:28,display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16}}>💡</span>
              <div style={{fontSize:13,color:"#5B3FD4",lineHeight:1.6}}>Log the case first — even before any meetings take place. This creates the case file and helps Compass track ACAS timelines and next steps from day one.</div>
            </div>

            {/* Employee details */}
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"24px",marginBottom:16,boxShadow:"0 1px 3px rgba(26,21,53,0.04)"}}>
              <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:16}}>Employee details</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <div>
                  <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:6}}>Employee name</label>
                  <input value={intake.employee} onChange={e=>setIntake(p=>({...p,employee:e.target.value}))}
                    placeholder="Full name"
                    list="intake-employee-list"
                    style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box"}}
                    onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.background="#FFFFFF";}}
                    onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.background="#FDFAF5";}}/>
                  <datalist id="intake-employee-list">
                    {[...new Set(cases.map(cs=>cs.employeeName).filter(Boolean))].map(n=><option key={n} value={n}/>)}
                  </datalist>
                </div>
                <div>
                  <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:6}}>HR manager (you)</label>
                  <input value={intake.manager} onChange={e=>setIntake(p=>({...p,manager:e.target.value}))}
                    placeholder="Your name"
                    style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box"}}
                    onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.background="#FFFFFF";}}
                    onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.background="#FDFAF5";}}/>
                </div>
                <div>
                  <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:6}}>Date received</label>
                  <input type="date" value={intake.dateReceived} onChange={e=>setIntake(p=>({...p,dateReceived:e.target.value}))}
                    style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box"}}
                    onFocus={e=>{e.target.style.borderColor="#7C5CFC";}}
                    onBlur={e=>{e.target.style.borderColor="#E8E0D0";}}/>
                </div>
                <div>
                  <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:6}}>Referred by</label>
                  <input value={intake.referredBy} onChange={e=>setIntake(p=>({...p,referredBy:e.target.value}))}
                    placeholder="Line manager, employee, etc"
                    style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box"}}
                    onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.background="#FFFFFF";}}
                    onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.background="#FDFAF5";}}/>
                </div>
              </div>
            </div>

            {/* Case type */}
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"24px",marginBottom:16,boxShadow:"0 1px 3px rgba(26,21,53,0.04)"}}>
              <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:16}}>Case type</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  {id:"misconduct",label:"Misconduct",desc:"Policy breach or behaviour issue"},
                  {id:"grievance",label:"Grievance",desc:"Employee raised a formal concern"},
                  {id:"performance",label:"Performance",desc:"Capability or performance issue"},
                  {id:"attendance",label:"Attendance",desc:"Absence or lateness pattern"},
                  {id:"redundancy",label:"Redundancy",desc:"Role at risk or confirmed redundancy"},
                  {id:"discrimination",label:"Discrimination",desc:"Equality Act 2010 concern"},
                  {id:"whistleblowing",label:"Whistleblowing",desc:"Protected disclosure"},
                  {id:"other",label:"Other",desc:"Other HR matter"},
                ].map(t=>(
                  <button key={t.id} onClick={()=>setIntake(p=>({...p,type:t.id}))}
                    style={{background:intake.type===t.id?"#F5F3FF":"#FDFAF5",border:"1px solid",borderColor:intake.type===t.id?"#7C5CFC":"#E8E0D0",borderRadius:8,padding:"10px 14px",cursor:"pointer",textAlign:"left",transition:"all 0.1s",fontFamily:"DM Sans,system-ui,sans-serif",borderLeft:intake.type===t.id?"3px solid #7C5CFC":"1px solid #E8E0D0"}}>
                    <div style={{fontSize:13,fontWeight:intake.type===t.id?600:400,color:intake.type===t.id?"#5B3FD4":"#1A1535"}}>{t.label}</div>
                    <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Issue description */}
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"24px",marginBottom:16,boxShadow:"0 1px 3px rgba(26,21,53,0.04)"}}>
              <div style={{fontSize:12,fontWeight:600,color:"#9B9098",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:16}}>Issue description</div>
              <div style={{marginBottom:14}}>
                <label style={{display:"block",fontSize:13,fontWeight:500,color:"#1A1535",marginBottom:6}}>Brief summary of the issue</label>
                <textarea value={intake.description} onChange={e=>setIntake(p=>({...p,description:e.target.value}))}
                  placeholder="Describe the issue in a few sentences. What happened? When? Who is involved?"
                  rows={4}
                  style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#1A1535",outline:"none",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif",boxSizing:"border-box",lineHeight:1.6}}
                  onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.background="#FFFFFF";}}
                  onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.background="#FDFAF5";}}/>
              </div>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                <input type="checkbox" checked={intake.urgent} onChange={e=>setIntake(p=>({...p,urgent:e.target.checked}))}
                  style={{width:16,height:16,accentColor:"#C84B2F",cursor:"pointer"}}/>
                <div>
                  <span style={{fontSize:13,fontWeight:500,color:"#1A1535"}}>Mark as urgent</span>
                  <span style={{fontSize:12,color:"#9B9098",marginLeft:8}}>Requires immediate attention or action</span>
                </div>
              </label>
            </div>

            {/* Submit */}
            <button
              disabled={!intake.employee.trim()||!intake.type}
              onClick={()=>{
                const newCase = {
                  id: crypto.randomUUID(),
                  employeeName: intake.employee.trim(),
                  manager: intake.manager,
                  email: "",
                  caseType: intake.type,
                  description: intake.description,
                  referredBy: intake.referredBy,
                  dateReceived: intake.dateReceived,
                  urgent: intake.urgent,
                  status: "open",
                  meetings: [],
                  createdAt: new Date().toISOString(),
                };
                saveCases([...cases, newCase]);
                setIntake({employee:"",manager:"",issue:"",type:"",dateReceived:new Date().toISOString().split("T")[0],description:"",referredBy:"",urgent:false});
                setScreen(SCREENS.CASES);
              }}
              style={{width:"100%",background:(!intake.employee.trim()||!intake.type)?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:10,padding:"14px",fontSize:15,color:(!intake.employee.trim()||!intake.type)?"#9B9098":"#FFFFFF",fontWeight:600,cursor:(!intake.employee.trim()||!intake.type)?"not-allowed":"pointer",transition:"all 0.15s",fontFamily:"DM Sans,system-ui,sans-serif",boxShadow:(!intake.employee.trim()||!intake.type)?"none":"0 4px 16px rgba(124,92,252,0.25)"}}>
              Create case file →
            </button>
            <p style={{textAlign:"center",fontSize:12,color:"#9B9098",marginTop:12}}>You can start a meeting from the case file once it's created</p>
          </div>
        </div>
      )}

{/* ══ PREP ══ */}
      {screen===SCREENS.PREP&&(
        <div style={{maxWidth:560,margin:"0 auto",padding:isMobile?"24px 16px":"60px 20px",textAlign:"center"}}>
          <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:"#7C5CFC",marginBottom:12,fontWeight:600}}>Prepare first</div>
          <h1 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:30,color:"#1A1535",margin:"0 0 8px",fontWeight:400}}>Tell Compass about this meeting</h1>
          <p style={{fontSize:14,color:"#6B6880",margin:"0 0 32px",lineHeight:1.7}}>Compass will generate targeted questions and a prep pack.</p>

          <div style={{textAlign:"left",marginBottom:16}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Meeting type <span style={{color:"#C84B2F"}}>*</span></label>
            <select value={meetingType?.id||""} onChange={e=>{const t=MEETING_TYPES.find(x=>x.id===e.target.value);setMeetingType(t);}}
              style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"14px 16px",fontSize:14,outline:"none",color:meetingType?"#F2EDE4":"#555",boxSizing:"border-box"}}>
              <option value="" disabled>Select meeting type...</option>
              <option disabled style={{color:"#6B6880"}}>── ER Meetings ──</option>
              {MEETING_TYPES.filter(t=>t.mode==="er"&&t.group==="formal").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              <option disabled style={{color:"#6B6880"}}>── Appeals ──</option>
              {MEETING_TYPES.filter(t=>t.group==="appeal").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              <option disabled style={{color:"#6B6880"}}>── Redundancy ──</option>
              {MEETING_TYPES.filter(t=>t.group==="redundancy").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              <option disabled style={{color:"#6B6880"}}>── Development ──</option>
              {MEETING_TYPES.filter(t=>t.group==="dev").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <div style={{textAlign:"left",marginBottom:16}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Employee name <span style={{color:"#C84B2F"}}>*</span></label>
            <input autoFocus placeholder="e.g. Sarah Johnson" value={caseInfo.employee}
              onChange={e=>setCaseInfo(p=>({...p,employee:e.target.value}))}
              style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"14px 16px",fontSize:15,outline:"none",color:"#1A1535",boxSizing:"border-box"}} />
          </div>

          <div style={{textAlign:"left",marginBottom:16}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Meeting date</label>
            <DateInput value={caseInfo.date} onChange={e=>setCaseInfo(p=>({...p,date:e.target.value}))} />
          </div>

          <div style={{textAlign:"left",marginBottom:16}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Your name</label>
            <input placeholder="Chair / HR manager name" value={caseInfo.manager}
              onChange={e=>setCaseInfo(p=>({...p,manager:e.target.value}))}
              style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"14px 16px",fontSize:15,outline:"none",color:"#1A1535",boxSizing:"border-box"}} />
          </div>

          <div style={{textAlign:"left",marginBottom:32}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Background <span style={{color:"#6B6880",fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:10}}>(recommended)</span></label>
            <textarea value={caseInfo.context} onChange={e=>setCaseInfo(p=>({...p,context:e.target.value}))}
              placeholder="Previous warnings, allegations, relevant history, reasonable adjustments..."
              rows={4} style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 16px",fontSize:14,outline:"none",color:"#1A1535",boxSizing:"border-box",resize:"vertical",lineHeight:1.6}}></textarea>
          </div>

          <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:16}}>
            <Btn onClick={handlePrepare} disabled={aiProcessing||!caseInfo.employee.trim()||!meetingType}
              style={{padding:"14px 28px",fontSize:15,background:"#7C5CFC",borderColor:"#E8622A"}}>
              {aiProcessing?"Building...":"Generate prep pack"}
            </Btn>
            <Btn variant="ghost" onClick={()=>{setMeetingType(null);setScreen(SCREENS.HOME);}} style={{padding:"14px 20px",fontSize:14}}>Cancel</Btn>
          </div>

          <div style={{textAlign:"left",marginBottom:24}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Supporting document <span style={{color:"#6B6880",fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:10}}>(optional — PDF, Word or text)</span></label>
            {bgDoc?(
              <div style={{display:"flex",alignItems:"center",gap:10,background:"#FFFFFF",border:"1px solid #7C5CFC33",borderRadius:8,padding:"12px 16px"}}>
                <span style={{fontSize:20}}>&#128196;</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,color:"#1A1535",fontWeight:500}}>{bgDoc.name}</div>
                  <div style={{fontSize:11,color:"#6B6880"}}>{bgDoc.text.length} characters extracted</div>
                </div>
                <button onClick={()=>setBgDoc(null)} style={{background:"none",border:"none",color:"#6B6880",fontSize:18,cursor:"pointer"}}>&#10005;</button>
              </div>
            ):(
              <label style={{display:"block",background:"#FFFFFF",border:"1px dashed #E8E0D0",borderRadius:8,padding:"20px",textAlign:"center",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC44"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
                <input type="file" accept=".pdf,.doc,.docx,.txt" style={{display:"none"}} onChange={async e=>{
                  const file = e.target.files[0];
                  if(!file) return;
                  const name = file.name;
                  if(name.endsWith(".txt")) {
                    const text = await file.text();
                    setBgDoc({name, text: text.slice(0,8000)});
                  } else if(name.endsWith(".pdf")) {
                    const arr = await file.arrayBuffer();
                    const bytes = new Uint8Array(arr);
                    const str = new TextDecoder("utf-8").decode(bytes);
                    const text = str.split("").filter(ch=>ch.charCodeAt(0)>31).join("").replace(/  +/g," ").trim().slice(0,8000);
                    setBgDoc({name, text});
                  } else {
                    const text = await file.text();
                    setBgDoc({name, text: text.slice(0,8000)});
                  }
                }}/>
                <div style={{fontSize:13,color:"#6B6375",marginBottom:4}}>Click to upload</div>
                <div style={{fontSize:11,color:"#5A5570"}}>PDF, Word or text file</div>
              </label>
            )}
          </div>

          <button onClick={()=>setScreen(SCREENS.RECORD)}
            style={{background:"none",border:"none",color:"#6B6880",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>
            Skip prep and start meeting now
          </button>

          {prepNotes&&(
            <div style={{marginTop:28,textAlign:"left",background:"#FFFFFF",border:"1px solid #7C5CFC33",borderRadius:12,padding:20}}>
              <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Prep pack ready</div>
              <MDRenderer text={prepNotes}/>
              <Btn onClick={()=>setScreen(SCREENS.RECORD)} style={{marginTop:16,width:"100%"}}>Start meeting</Btn>
            </div>
          )}
        </div>
      )}

            {/* ══ RECORD ══ */}
      {screen===SCREENS.RECORD&&(
        <div style={{position:"fixed",inset:0,background:"#FDFAF5",display:"flex",flexDirection:"column",zIndex:2000,fontFamily:"DM Sans,system-ui,sans-serif"}}>

          {/* Header */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 24px",background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <CompassLogo size={22}/>
              <div style={{width:1,height:20,background:"#EDE5D8"}}/>
              <div>
                <span style={{fontSize:12,color:"#7C5CFC",fontWeight:600,letterSpacing:"0.5px",textTransform:"uppercase"}}>{meetingType?.label||"Meeting"}</span>
                <span style={{fontSize:12,color:"#9B9098",margin:"0 6px"}}>·</span>
                <span style={{fontSize:12,color:"#1A1535",fontWeight:500}}>{caseInfo.employee||"Unknown"}</span>
                <span style={{fontSize:12,color:"#9B9098",margin:"0 6px"}}>·</span>
                <span style={{fontSize:12,color:"#9B9098"}}>{caseInfo.date}</span>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {isListening&&(
                <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#C84B2F",background:"#FEF0EB",padding:"4px 10px",borderRadius:20}}>
                  <span className="pu" style={{width:6,height:6,borderRadius:"50%",background:"#C84B2F",display:"inline-block"}}></span>
                  Live
                </div>
              )}
              {meetingStartTime&&<span style={{fontSize:12,color:"#9B9098",fontFamily:"monospace"}}>{meetingStartTime}</span>}
              <button
                onClick={()=>{if(inputText.trim())addUtterance(inputText);handleReview();}}
                disabled={aiProcessing||(transcript.length===0&&!inputText.trim())}
                style={{background:aiProcessing?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:8,padding:"8px 20px",fontSize:13,color:aiProcessing?"#9B9098":"#FFFFFF",fontWeight:600,cursor:aiProcessing?"not-allowed":"pointer",transition:"all 0.15s",boxShadow:aiProcessing?"none":"0 2px 8px rgba(124,92,252,0.25)"}}>
                {aiProcessing?"Processing...":"End meeting →"}
              </button>
            </div>
          </div>

          {/* Main area */}
          <div style={{flex:1,display:"flex",overflow:"hidden"}}>

            {/* Notepad */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <textarea
                ref={inputRef}
                value={inputText}
                style={{flex:1,background:"transparent",border:"none",padding:"40px 48px",fontSize:16,lineHeight:1.9,outline:"none",color:"#1A1535",resize:"none",fontFamily:"DM Sans,system-ui,sans-serif",letterSpacing:"0.1px"}}
                onChange={e=>{
                  const val = e.target.value;
                  if(!meetingStartTime && val.trim()) setMeetingStartTime(new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}));
                  if(val.endsWith(String.fromCharCode(10))) {
                    const ls=val.split(String.fromCharCode(10)).filter(l=>l.trim());
                    ls.forEach(line=>addUtterance(line.trim()));
                    setInputText("");
                    updateLiveContext(val);
                  } else {
                    setInputText(val);
                  }
                }}
                placeholder={"Type or speak your meeting notes here..." + String.fromCharCode(10) + String.fromCharCode(10) + "Just capture what is being said — Compass will organise everything when you end the meeting."}
              />

              {/* Bottom toolbar */}
              <div style={{padding:"12px 48px",borderTop:"1px solid #EDE5D8",display:"flex",alignItems:"center",gap:8,background:"#FFFFFF",flexShrink:0}}>
                <button onClick={isListening?stopSpeech:startSpeech}
                  style={{display:"flex",alignItems:"center",gap:6,background:isListening?"#FEF0EB":"#F5F1EA",border:"1px solid",borderColor:isListening?"#C84B2F44":"#E8E0D0",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,color:isListening?"#C84B2F":"#6B6375",fontWeight:500,fontFamily:"DM Sans,system-ui,sans-serif"}}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:isListening?"#C84B2F":"#9B9098",display:"inline-block"}}></span>
                  {isListening?"Stop mic":"Microphone"}
                </button>
                <button onClick={isScreenCapturing?stopScreenCapture:startScreenCapture}
                  style={{display:"flex",alignItems:"center",gap:6,background:isScreenCapturing?"#E8F5EE":"#F5F1EA",border:"1px solid",borderColor:isScreenCapturing?"#1A7A4A44":"#E8E0D0",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,color:isScreenCapturing?"#1A7A4A":"#6B6375",fontWeight:500,fontFamily:"DM Sans,system-ui,sans-serif"}}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:isScreenCapturing?"#1A7A4A":"#9B9098",display:"inline-block"}}></span>
                  {isScreenCapturing?"Stop":"Screen audio"}
                </button>
                <label style={{display:"flex",alignItems:"center",gap:6,background:"#F5F1EA",border:"1px solid #E8E0D0",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,color:"#6B6375",fontWeight:500,fontFamily:"DM Sans,system-ui,sans-serif"}}>
                  Import transcript
                  <input ref={importFileRef} type="file" accept=".vtt,.txt,.srt" onChange={handleImportFile} style={{display:"none"}}/>
                </label>
                <div style={{marginLeft:"auto",fontSize:11,color:"#9B9098"}}>
                  {transcript.length>0&&`${transcript.length} note${transcript.length!==1?"s":""} captured`}
                </div>
              </div>

              {/* Suggested questions */}
              {false&&(
                <div style={{padding:"10px 48px",borderTop:"1px solid #F5F1EA",background:"#FDFAF5",flexShrink:0}}>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:11,color:"#9B9098",fontWeight:500,marginRight:4,whiteSpace:"nowrap"}}>Ask next:</span>
                    {(ACAS_TEMPLATES[meetingType?.id]||MEETING_QUESTIONS[meetingType?.id]||MEETING_QUESTIONS["informal"]).slice(0,3).map((q,i)=>(
                      <button key={i}
                        onClick={()=>{const nl=String.fromCharCode(10);setInputText(t=>t+(t&&t.slice(-1)!==nl?nl:"")+q.trim()+nl);}}
                        style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:20,padding:"5px 12px",fontSize:11,color:"#6B6375",cursor:"pointer",transition:"all 0.1s",whiteSpace:"nowrap",fontFamily:"DM Sans,system-ui,sans-serif"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor="#7C5CFC";e.currentTarget.style.color="#7C5CFC";}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor="#E8E0D0";e.currentTarget.style.color="#6B6375";}}>
                        {q.trim().length>55?q.trim().slice(0,52)+"...":q.trim()}
                      </button>
                    ))}
                    {liveContextLoading&&<span style={{fontSize:11,color:"#9B9098",fontStyle:"italic"}}>updating...</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <div style={{width:300,borderLeft:"1px solid #EDE5D8",background:"#FFFFFF",display:"flex",flexDirection:"column",flexShrink:0}}>

              {/* Live context */}
              <div style={{padding:"16px 18px",borderBottom:"1px solid #EDE5D8",flexShrink:0}}>
                <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8}}>Live context</div>
                {liveContextLoading&&!liveContext&&(
                  <div style={{fontSize:12,color:"#9B9098",fontStyle:"italic"}}>Analysing conversation...</div>
                )}
                {liveContext?(
                  <div style={{fontSize:12,color:"#3D3560",lineHeight:1.7}}><MDRenderer text={liveContext}/></div>
                ):(
                  !liveContextLoading&&<div style={{fontSize:12,color:"#C4BAB0"}}>Will update as you take notes</div>
                )}
              </div>

              {/* Ask Compass */}
              <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                <div style={{flex:1,overflowY:"auto",padding:"16px 18px"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:12}}>Ask Compass</div>
                  {liveChatHistory.length===0&&(
                    <div style={{fontSize:12,color:"#C4BAB0",lineHeight:1.6}}>Ask anything about the meeting or get HR advice in real time</div>
                  )}
                  {liveChatHistory.map((m,i)=>(
                    <div key={i} style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:600,color:m.role==="user"?"#1A1535":"#7C5CFC",marginBottom:3}}>{m.role==="user"?"You":"Compass"}</div>
                      <div style={{fontSize:12,color:"#3D3560",lineHeight:1.6,background:m.role==="assistant"?"#F5F3FF":"none",padding:m.role==="assistant"?"8px 10px":"0",borderRadius:6,borderLeft:m.role==="assistant"?"2px solid #7C5CFC":"none"}}><MDRenderer text={m.content}/></div>
                    </div>
                  ))}
                  {liveChatProcessing&&<div style={{fontSize:11,color:"#9B9098",fontStyle:"italic"}}>Thinking...</div>}
                </div>
                <div style={{padding:"12px 14px",borderTop:"1px solid #EDE5D8",flexShrink:0}}>
                  <div style={{display:"flex",gap:8,background:"#F5F1EA",borderRadius:8,padding:"8px 12px",alignItems:"center"}}>
                    <input value={liveChatInput} onChange={e=>setLiveChatInput(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&sendLiveChat()}
                      placeholder="Ask about this meeting..."
                      style={{flex:1,background:"none",border:"none",outline:"none",fontSize:12,color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
                    <button onClick={sendLiveChat} disabled={liveChatProcessing||!liveChatInput.trim()}
                      style={{background:"#7C5CFC",border:"none",borderRadius:6,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:liveChatProcessing||!liveChatInput.trim()?0.4:1,flexShrink:0}}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 10V2M6 2L3 5M6 2L9 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ REVIEW ══ */}
      {screen===SCREENS.REVIEW&&(
        <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>

          {/* Top action bar */}
          <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"14px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <CompassLogo size={22}/>
              <div style={{width:1,height:20,background:"#EDE5D8"}}/>
              <div>
                <span style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>{caseInfo.employee}</span>
                <span style={{fontSize:13,color:"#9B9098",margin:"0 6px"}}>—</span>
                <span style={{fontSize:13,color:"#6B6375"}}>{meetingType?.label}</span>
                <span style={{fontSize:12,color:"#9B9098",marginLeft:8}}>{caseInfo.date}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {!isHR&&(
                <Btn onClick={()=>{
                  const cs=cases.find(x=>x.employeeName===caseInfo.employee?.trim());
                  requestHrReview("record",cs?.id||null,null,reviewOutput);
                }} variant="ghost" style={{fontSize:13}}>Request HR review</Btn>
              )}
              <Btn onClick={()=>setShowShareModal(true)} variant="ghost" style={{fontSize:13}}>Share</Btn>
              <Btn onClick={()=>{saveMeetingToCase();setScreen(SCREENS.CASES);showToast("Saved to case file");}} variant="secondary" style={{fontSize:13}}>Save to case</Btn>
              
<Btn onClick={()=>saveMeetingToCase()} style={{fontSize:13,background:"#7C5CFC",borderColor:"#7C5CFC",boxShadow:"0 2px 8px rgba(124,92,252,0.25)"}}>
                {caseInfo._linkedCaseId?"Save witness statement to case →":"Save and go to case →"}
              </Btn>
            </div>
          </div>

          {/* Main layout */}
          <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 24px",display:"grid",gridTemplateColumns:"1fr 340px",gap:24,alignItems:"start"}}>

            {/* Left — record */}
            <div>
              {/* Ask Compass / Edit bar */}
              <div style={{display:"flex",gap:8,marginBottom:16}}>
                <input value={askCompassInput} onChange={e=>setAskCompassInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"){const q=askCompassInput;setAskCompassInput("");askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}}}
                  placeholder='Ask Compass or edit the record... e.g. "What should I do next?" or "Make section 2 more formal"'
                  style={{flex:1,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#1A1535",outline:"none",fontFamily:"DM Sans,system-ui,sans-serif"}}
                  onFocus={e=>{e.target.style.borderColor="#7C5CFC";e.target.style.boxShadow="0 0 0 3px rgba(124,92,252,0.08)";}}
                  onBlur={e=>{e.target.style.borderColor="#E8E0D0";e.target.style.boxShadow="none";}}/>
                <button onClick={()=>{
                    const q=askCompassInput;
                    setAskCompassInput("");
                    if(q.toLowerCase().includes("edit")||q.toLowerCase().includes("change")||q.toLowerCase().includes("make")||q.toLowerCase().includes("add")||q.toLowerCase().includes("remove")){
                      editRecord(q);
                    } else {
                      askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);
                    }
                  }} disabled={(askCompassProcessing||editProcessing)||!askCompassInput.trim()}
                  style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,color:"#fff",cursor:"pointer",fontWeight:500,opacity:(askCompassProcessing||editProcessing)||!askCompassInput.trim()?0.4:1,whiteSpace:"nowrap",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                  {askCompassProcessing||editProcessing?"Working...":"Ask →"}
                </button>
              </div>



              {/* Meeting record card */}
              <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,boxShadow:"0 1px 3px rgba(26,21,53,0.06)",overflow:"hidden",marginBottom:16}}>
                <div style={{padding:"12px 20px",borderBottom:"1px solid #EDE5D8",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FDFAF5"}}>
                  <span style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.8px",textTransform:"uppercase"}}>Meeting record</span>
                  <button onClick={()=>setEditingRecord(r=>!r)}
                    style={{fontSize:11,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",fontWeight:500,fontFamily:"DM Sans,system-ui,sans-serif"}}>
                    {editingRecord?"Done editing":"Edit record"}
                  </button>
                </div>
                <div style={{padding:"28px 32px"}}>
                  {aiProcessing&&!reviewOutput&&(
                    <div style={{textAlign:"center",padding:"48px 0",color:"#9B9098",fontSize:14}}>
                      <div className="pu" style={{width:8,height:8,borderRadius:"50%",background:"#7C5CFC",display:"inline-block",marginBottom:12}}></div>
                      <div>Compass is generating your record...</div>
                    </div>
                  )}
                  {reviewOutput&&!editingRecord&&(()=>{
                    const advisorStart = reviewOutput.indexOf("## HR Advisor");
                    let meetingPart = advisorStart > -1 ? reviewOutput.slice(0, advisorStart) : reviewOutput;
                    const extraSections = ["## Key Points","## Next Steps","## Summary","## Actions","## Risk","## Outcome","## Recommendations","## Notes"];
                    extraSections.forEach(s=>{ const si=meetingPart.indexOf(s); if(si>-1) meetingPart=meetingPart.slice(0,si); });
                    return <div style={{fontSize:14,lineHeight:1.9,color:"#1A1535"}}><MDRenderer text={meetingPart.trim()}/></div>;
                  })()}
                  {reviewOutput&&editingRecord&&(
                    <textarea value={reviewOutput} onChange={e=>setReviewOutput(e.target.value)}
                      style={{width:"100%",minHeight:400,background:"none",border:"none",outline:"none",fontSize:14,lineHeight:1.9,color:"#1A1535",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif",boxSizing:"border-box"}}/>
                  )}
                  {aiError&&<div style={{color:"#C84B2F",fontSize:13}}>{aiError}</div>}
                </div>
                {reviewOutput&&!editingRecord&&(
                  <div style={{padding:"16px 28px",borderTop:"1px solid #EDE5D8",background:"#FDFAF5"}}>
                    <button onClick={()=>setShowSignModal(true)}
                      style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"11px 24px",fontSize:13,color:"#FFFFFF",fontWeight:600,cursor:"pointer",boxShadow:"0 2px 8px rgba(124,92,252,0.2)",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                      Send for signature →
                    </button>
                    <span style={{fontSize:12,color:"#9B9098",marginLeft:12}}>Send the meeting record to the employee for signature</span>
                  </div>
                )}
              </div>

              {/* HR Advisor Notes — separate card */}
              {reviewOutput&&reviewOutput.includes("## HR Advisor")&&(
                <div style={{background:"#F5F3FF",border:"1px solid #D4C9F5",borderRadius:12,overflow:"hidden",marginBottom:16}}>
                  <div style={{padding:"12px 20px",borderBottom:"1px solid #D4C9F5",background:"#EDE8FF"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:"0.8px",textTransform:"uppercase"}}>Compass HR Advisor</div>
                    <div style={{fontSize:11,color:"#8B7FCC",marginTop:2}}>Expert guidance based on UK employment law and ACAS</div>
                  </div>
                  <div style={{padding:"24px 28px"}}>
                    <div style={{fontSize:14,lineHeight:1.9,color:"#2D2060"}}>
                      <MDRenderer text={reviewOutput.slice(reviewOutput.indexOf("## HR Advisor"))}/>
                    </div>
                  </div>
                </div>
              )}

              {/* Ask Compass response — inline below input */}
              {askCompassHistory.length>0&&(
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden",marginBottom:16}}>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid #EDE5D8",background:"#FDFAF5"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:"0.8px",textTransform:"uppercase"}}>Compass response</div>
                  </div>
                  <div style={{padding:"16px 20px"}}>
                    {askCompassHistory.slice(-2).map((m,i)=>(
                      <div key={i} style={{marginBottom:10}}>
                        <div style={{fontSize:11,fontWeight:600,color:m.role==="user"?"#9B9098":"#7C5CFC",marginBottom:4}}>{m.role==="user"?"Your question":"Compass"}</div>
                        <div style={{fontSize:14,color:m.role==="user"?"#6B6375":"#1A1535",lineHeight:1.8,background:m.role==="assistant"?"#F5F3FF":"none",padding:m.role==="assistant"?"12px 16px":"0",borderRadius:8,borderLeft:m.role==="assistant"?"3px solid #7C5CFC":"none"}}><MDRenderer text={m.content}/></div>
                      </div>
                    ))}
                    {askCompassProcessing&&<div style={{fontSize:13,color:"#9B9098",fontStyle:"italic"}}>Compass is thinking...</div>}
                  </div>
                </div>
              )}


            </div>

            {/* Right sidebar */}
            <div style={{display:"flex",flexDirection:"column",gap:16,position:"sticky",top:80}}>

              {/* Risk score */}
              {riskScore&&(
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"20px",boxShadow:"0 1px 3px rgba(26,21,53,0.06)"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:12}}>Risk assessment</div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:riskScore.rating==="HIGH"?"#C84B2F":riskScore.rating==="MEDIUM"?"#B87520":"#1A7A4A",flexShrink:0}}></div>
                    <span style={{fontSize:18,fontWeight:700,color:riskScore.rating==="HIGH"?"#C84B2F":riskScore.rating==="MEDIUM"?"#B87520":"#1A7A4A",fontFamily:"DM Serif Display,Georgia,serif"}}>{riskScore.rating}</span>
                    <span style={{fontSize:12,color:"#9B9098"}}>tribunal risk</span>
                  </div>
                  {riskScore.summary&&<div style={{fontSize:12,color:"#6B6375",lineHeight:1.6}}><MDRenderer text={riskScore.summary}/></div>}
                </div>
              )}



            </div>
          </div>
        </div>
      )}

      {/* ══ LETTERS ══ */}
      {screen===SCREENS.LETTER&&(
        <div>
          <div style={{borderBottom:"1px solid #E8E0D0"}}>
            <div style={{maxWidth:1440,margin:"0 auto",padding:"0 20px",display:"flex",gap:2}}>
              {[{id:"outcome",l:"Outcome letter"},{id:"invite",l:"Invitation"},{id:"appeal",l:"Appeal outcome"}].map(lt=>(
                <button key={lt.id} onClick={()=>handleLetter(lt.id)}
                  style={{background:"none",border:"none",borderBottom:"2px solid",borderBottomColor:activeLetter===lt.id?"#7C5CFC":"transparent",padding:"12px 16px",fontSize:13,color:activeLetter===lt.id?"#F2EDE4":"#666",fontWeight:activeLetter===lt.id?600:400}}>
                  {lt.l}
                </button>
              ))}
            </div>
          </div>
          <div style={{maxWidth:900,margin:"28px auto",padding:"0 20px"}}>
            {aiProcessing&&!letterOutput&&<div style={{textAlign:"center",padding:50}}><span className="pu" style={{color:"#7C5CFC",fontSize:24}}>●</span><div style={{color:"#6B6375",marginTop:10}}>Drafting...</div></div>}
            {letterOutput&&(
              <>
                {/* Edit toggle */}
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
                  <button onClick={()=>setEditingLetter(e=>!e)}
                    style={{background:editingLetter?"#7C5CFC":"none",border:"1px solid",borderColor:editingLetter?"#7C5CFC":"#E8E0D0",borderRadius:5,padding:"4px 12px",fontSize:11,color:editingLetter?"#fff":"#888",cursor:"pointer"}}>
                    {editingLetter?"Done editing":"Edit letter"}
                  </button>
                </div>
                {editingLetter&&(
                  <textarea value={letterOutput} onChange={e=>setLetterOutput(e.target.value)}
                    style={{width:"100%",minHeight:400,background:"#FDFAF5",border:"1px solid #7C5CFC33",borderRadius:8,padding:"16px",fontSize:13,lineHeight:1.8,outline:"none",color:"#1A1535",resize:"vertical",boxSizing:"border-box",fontFamily:"DM Serif Display,Georgia,serif",marginBottom:12}}/>
                )}
                {/* Sig bar */}
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,color:"#6B6375"}}>E-signature:</span>
                    {signature
                      ?<span style={{fontSize:11,color:"#7C5CFC",fontWeight:600}}>✓ {signature.type==="typed"?`"${signature.data}"`:"Drawn"}</span>
                      :<span style={{fontSize:11,color:"#6B6880"}}>Not added — will prompt on send</span>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setShowSigPad(true)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 10px",fontSize:11,color:"#7C5CFC",cursor:"pointer"}}>{signature?"Change":"Add"}</button>
                    {signature&&<button onClick={()=>{setSignature(null);lsSet("compass_signature",null);}} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 10px",fontSize:11,color:"#C84B2F",cursor:"pointer"}}>Remove</button>}
                  </div>
                </div>

                <div style={{background:"#FDFAF5",borderRadius:12,padding:"36px 44px",marginBottom:16,textAlign:"left"}}>
                  <MDRenderer text={letterOutput} light/>
                  {signature&&(
                    <div style={{marginTop:20,paddingTop:18,borderTop:"1px solid #E0DDD8"}}>
                      <div style={{fontSize:10,color:"#999",marginBottom:6}}>Signed:</div>
                      {signature.type==="typed"
                        ?<div style={{fontFamily:"'Brush Script MT',cursive",fontSize:30,color:"#FFFFFF"}}>{signature.data}</div>
                        :<img src={signature.data} alt="Sig" style={{maxHeight:55,maxWidth:180}}/>}
                      <div style={{fontSize:11,color:"#6B6375",marginTop:5}}>{caseInfo.manager||"HR Manager"} | {new Date().toLocaleDateString("en-GB")}</div>
                    </div>
                  )}
                </div>

                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <Btn onClick={()=>triggerWithSig("download")} disabled={pdfGenerating}>{pdfGenerating?"Generating...":"Download PDF"}</Btn>
                  <Btn variant="secondary" onClick={()=>triggerWithSig("gmail")} disabled={pdfGenerating}>Send via Gmail</Btn>
                  <Btn variant="secondary" onClick={()=>triggerWithSig("outlook")} disabled={pdfGenerating}>Send via Outlook</Btn>
                  <Btn variant="ghost" onClick={()=>navigator.clipboard.writeText(letterOutput)}>Copy text</Btn>
                  <Btn variant="blue" onClick={()=>{saveMeetingToCase();setScreen(SCREENS.CASES);}}>Save to case</Btn>
                  <Btn variant="ghost" onClick={()=>setScreen(SCREENS.REVIEW)}>← Back</Btn>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ DASHBOARD ══ */}
      {screen===SCREENS.DASHBOARD&&(()=>{
        const allM = cases.flatMap(c=>c.meetings.map(m=>({...m,employeeName:c.employeeName})));
        const open = cases.filter(c=>!c.meetings[c.meetings.length-1]?.record?.toLowerCase().includes("case closed"));
        const rC={HIGH:0,MEDIUM:0,LOW:0};
        allM.forEach(m=>{ if(m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN") rC[m.riskScore.rating]=(rC[m.riskScore.rating]||0)+1; });
        const byType = MEETING_TYPES.map(t=>({label:t.label,count:allM.filter(m=>m.type===t.label).length})).filter(t=>t.count>0);
        const recent = [...allM].sort((a,b)=>new Date(b.savedAt)-new Date(a.savedAt)).slice(0,8);
        const rColors={HIGH:"#E8622A",MEDIUM:"#D4882A",LOW:"#7C5CFC"};

        return(
          <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 20px"}}>
            <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Dashboard</h2>
            <p style={{fontSize:13,color:"#6B6375",margin:"0 0 28px"}}>Overview of all HR cases and activity</p>

            {cases.length===0&&(
              <Card style={{textAlign:"center",padding:"50px 20px"}}>
                <div style={{fontSize:32,marginBottom:12}}>⬛</div>
                <div style={{fontSize:15,color:"#6B6375",marginBottom:6}}>No data yet</div>
                <div style={{fontSize:12,color:"#5A5570"}}>Complete your first meeting and save it to a case file to see your dashboard.</div>
              </Card>
            )}

            {cases.length>0&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  {[{l:"Total cases",v:cases.length,c:"#7C5CFC"},{l:"Open cases",v:open.length,c:"#7C5CFC"},{l:"Total meetings",v:allM.length,c:"#D4882A"},{l:"High risk",v:rC.HIGH||0,c:"#E8622A"}].map(s=>(
                    <Card key={s.l}>
                      <div style={{fontSize:30,fontWeight:700,color:s.c,fontFamily:"Inter,sans-serif"}}>{s.v}</div>
                      <div style={{fontSize:11,color:"#6B6880",marginTop:3}}>{s.l}</div>
                    </Card>
                  ))}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:14}}>Risk distribution</div>
                    {Object.entries(rC).map(([r,c])=>{
                      const total=Object.values(rC).reduce((a,b)=>a+b,0)||1;
                      return c>0?(
                        <div key={r} style={{marginBottom:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <span style={{fontSize:11,color:rColors[r],fontWeight:600}}>{r}</span>
                            <span style={{fontSize:11,color:"#6B6880"}}>{c}</span>
                          </div>
                          <div style={{background:"#FDFAF5",borderRadius:3,height:5}}>
                            <div style={{background:rColors[r],borderRadius:3,height:5,width:`${Math.round(c/total*100)}%`}}/>
                          </div>
                        </div>
                      ):null;
                    })}
                    {Object.values(rC).every(v=>v===0)&&<div style={{fontSize:11,color:"#5A5570"}}>No risk scores yet</div>}
                  </Card>
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:14}}>Meetings by type</div>
                    {byType.length===0&&<div style={{fontSize:11,color:"#5A5570"}}>No meetings yet</div>}
                    {byType.map(t=>(
                      <div key={t.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
                        <span style={{fontSize:11,color:"#3D3560"}}>{t.label}</span>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{background:"#FDFAF5",borderRadius:3,height:4,width:70}}>
                            <div style={{background:"#7C5CFC",borderRadius:3,height:4,width:(t.count/Math.max(...byType.map(x=>x.count))*70)+"px"}}/>
                          </div>
                          <span style={{fontSize:11,color:"#7C5CFC",fontWeight:600,width:14,textAlign:"right"}}>{t.count}</span>
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>

                <Card style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:14}}>Recent meetings</div>
                  {recent.map(m=>(
                    <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #1a1a1a"}}>
                      <div>
                        <div style={{fontSize:14,color:"#1A1535",fontWeight:500,marginBottom:2}}>{m.employeeName}</div>
                        <div style={{fontSize:10,color:"#5A5570"}}>{m.type} · {m.date}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        {m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN"&&<Badge color={rColors[m.riskScore.rating]}>{m.riskScore.rating}</Badge>}
                        <Btn variant="ghost" onClick={()=>setScreen(SCREENS.CASES)} style={{padding:"3px 10px",fontSize:10}}>View</Btn>
                      </div>
                    </div>
                  ))}
                </Card>

                <Card>
                  <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:14}}>Active cases</div>
                  {open.length===0&&<div style={{fontSize:11,color:"#5A5570"}}>No open cases</div>}
                  {open.map(c=>{
                    const last=c.meetings[c.meetings.length-1];
                    const high=c.meetings.some(m=>m.riskScore?.rating==="HIGH");
                    return(
                      <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                            <span style={{fontSize:14,color:"#1A1535",fontWeight:600}}>{c.employeeName}</span>
                            {high&&<Badge color="#E8622A">HIGH RISK</Badge>}
                          </div>
                          <div style={{fontSize:10,color:"#5A5570"}}>{c.meetings.length} meeting{c.meetings.length!==1?"s":""} · Last: {last?.type} on {last?.date}</div>
                        </div>
                        <Btn onClick={()=>setScreen(SCREENS.CASES)} style={{padding:"5px 14px",fontSize:11}}>Open →</Btn>
                      </div>
                    );
                  })}
                </Card>
              </>
            )}
          </div>
        );
      })()}

      {/* ══ CASES ══ */}
      {screen===SCREENS.CASES&&(
        <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
          <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"16px 32px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#1A1535",margin:0,fontWeight:400}}>Cases</h2>
              <p style={{fontSize:13,color:"#9B9098",margin:"2px 0 0"}}>{cases.filter(cs=>getCaseStage(cs)!=="closed").length} active · {cases.filter(cs=>getCaseStage(cs)==="closed").length} closed</p>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setIntake({employee:"",manager:"",issue:"",type:"",dateReceived:new Date().toISOString().split("T")[0],description:"",referredBy:"",urgent:false});setScreen(SCREENS.INTAKE);}}
                style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 20px",fontSize:13,color:"#1A1535",fontWeight:500,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>+ New case</button>
              <button onClick={()=>setScreen(SCREENS.HOME+"_meeting")}
                style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"10px 20px",fontSize:13,color:"#FFFFFF",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>+ New meeting</button>
            </div>
          </div>
          <div style={{maxWidth:860,margin:"0 auto",padding:"28px 24px"}}>
            {cases.length===0&&(
              <div style={{textAlign:"center",padding:"80px 20px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E8E0D0"}}>
                <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#1A1535",marginBottom:8}}>No cases yet</div>
                <div style={{fontSize:14,color:"#9B9098",marginBottom:24}}>Create a case to start managing HR proceedings</div>
                <button onClick={()=>setScreen(SCREENS.INTAKE)} style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"12px 28px",fontSize:14,color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Create first case →</button>
              </div>
            )}
            {(()=>{
              const employees = [...new Set(cases.map(cs=>cs.employeeName))];
              return employees.map(emp=>{
                const empCases = cases.filter(cs=>cs.employeeName===emp);
                const activeCount = empCases.filter(cs=>getCaseStage(cs)!=="closed").length;
                return(
                  <div key={emp} style={{marginBottom:28}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:"#EDE8FF",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:14,fontWeight:600,color:"#7C5CFC"}}>{(emp||"?")[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <div style={{fontSize:15,fontWeight:600,color:"#1A1535"}}>{emp}</div>
                        <div style={{fontSize:12,color:"#9B9098"}}>{empCases.length} proceeding{empCases.length!==1?"s":""}{activeCount>0?" · "+activeCount+" active":""}</div>
                      </div>
                    </div>
                    {empCases.map(cs=>{
                      const closed = getCaseStage(cs)==="closed";
                      const next = getNextStep(cs);
                      return(
                        <div key={cs.id} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}}
                          style={{background:closed?"#FDFAF5":"#FFFFFF",border:"1px solid",borderColor:closed?"#EDE5D8":next?"#D4C9F5":"#E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:6,marginLeft:48,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,transition:"all 0.15s"}}
                          onMouseEnter={e=>{if(!closed){e.currentTarget.style.borderColor="#7C5CFC";e.currentTarget.style.background="#FDFAFF";}}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor=closed?"#EDE5D8":next?"#D4C9F5":"#E8E0D0";e.currentTarget.style.background=closed?"#FDFAF5":"#FFFFFF";}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:closed?400:600,color:closed?"#9B9098":"#1A1535",marginBottom:3}}>{getProceedingTitle(cs)}</div>
                            <div style={{fontSize:11,color:"#9B9098",display:"flex",gap:8}}>
                              <span>{(cs.meetings||[]).length} meeting{(cs.meetings||[]).length!==1?"s":""}</span>
                              {cs.urgent&&<span style={{color:"#C84B2F",fontWeight:600}}>· URGENT</span>}
                            </div>
                            {next&&!closed&&<div style={{fontSize:11,color:"#7C5CFC",fontWeight:500,marginTop:4}}>Next: {next.label}</div>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                            <span style={{fontSize:11,fontWeight:600,color:getCaseStatus(cs).color,background:getCaseStatus(cs).bg,borderRadius:20,padding:"3px 10px"}}>{getCaseStatus(cs).label}</span>
                            <span style={{color:"#C4BAB0",fontSize:16}}>›</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {screen===SCREENS.SEARCH&&(
        <div style={{maxWidth:900,margin:"0 auto",padding:"40px 20px"}}>
          <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 20px",fontWeight:600}}>Search</h2>
          <input
            autoFocus
            placeholder="Search cases, records, letters, transcripts..."
            value={searchQuery}
            onChange={e=>{setSearchQuery(e.target.value);runSearch(e.target.value);}}
            style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"14px 18px",fontSize:15,color:"#1A1535",outline:"none",marginBottom:24,boxSizing:"border-box"}} />

          {searchQuery&&searchResults.length===0&&(
            <div style={{textAlign:"center",padding:"40px 20px",color:"#5A5570",fontSize:13}}>No results found for "{searchQuery}"</div>
          )}

          {searchResults.length>0&&(
            <div>
              <div style={{fontSize:11,color:"#6B6880",marginBottom:12}}>{searchResults.length} result{searchResults.length!==1?"s":""}</div>
              {searchResults.map((r,i)=>{
                const typeColors={case:"#7C5CFC",record:"#D4882A",letter:"#4A6FA5",transcript:"#888"};
                return(
                  <button key={i} onClick={()=>{
                    setScreen(SCREENS.CASES);
                    setExpandedCases(e=>({...e,[r.caseId]:true}));
                    if(r.meetingId){
                      const cs = cases.find(c=>c.id===r.caseId);
                      const m = cs?.meetings.find(m=>m.id===r.meetingId);
                      if(m) { setViewMeeting({...m,employeeName:cs.employeeName,caseId:cs.id}); setViewCaseId(cs.id); }
                    }
                  }}
                    style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"14px 16px",marginBottom:8,textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:14,transition:"border-color 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC44"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
                    <div style={{width:40,height:40,borderRadius:6,background:typeColors[r.type]+"22",border:`1px solid ${typeColors[r.type]}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:9,fontWeight:700,color:typeColors[r.type],letterSpacing:0.5,textTransform:"uppercase"}}>{r.type}</span>
                    </div>
                    <div>
                      <div style={{fontSize:14,color:"#1A1535",fontWeight:500,marginBottom:2}}>{r.title}</div>
                      <div style={{fontSize:11,color:"#6B6880"}}>{r.sub}</div>
                      {r.type==="transcript"&&<div style={{fontSize:11,color:"#7C5CFC",marginTop:4,fontStyle:"italic"}}>Found in transcript</div>}
                      {r.type==="record"&&<div style={{fontSize:11,color:"#B87520",marginTop:4}}>Found in meeting record</div>}
                      {r.type==="letter"&&<div style={{fontSize:11,color:"#1A7A4A",marginTop:4}}>Found in letter</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!searchQuery&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Card style={{background:"#F5F1EA"}}>
                <div style={{fontSize:11,color:"#6B6880",marginBottom:12,fontWeight:600,letterSpacing:0.5,textTransform:"uppercase"}}>Recent cases</div>
                {cases.slice(-5).reverse().map(c=>(
                  <div key={c.id} onClick={()=>setScreen(SCREENS.CASES)} style={{padding:"8px 0",borderBottom:"1px solid #1a1a1a",cursor:"pointer",fontSize:12,color:"#3D3560"}}>{c.employeeName}</div>
                ))}
                {cases.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No cases yet</div>}
              </Card>
              <Card style={{background:"#F5F1EA"}}>
                <div style={{fontSize:11,color:"#6B6880",marginBottom:12,fontWeight:600,letterSpacing:0.5,textTransform:"uppercase"}}>Overdue actions</div>
                {dueSoon.filter(d=>d.overdue).slice(0,5).map((d,i)=>(
                  <div key={i} style={{padding:"8px 0",borderBottom:"1px solid #1a1a1a",fontSize:12}}>
                    <div style={{color:"#C84B2F",marginBottom:1}}>{d.caseName}</div>
                    <div style={{color:"#6B6880",fontSize:10}}>{d.step} · {Math.abs(d.daysLeft)}d overdue</div>
                  </div>
                ))}
                {dueSoon.filter(d=>d.overdue).length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No overdue actions</div>}
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ══ DEVELOP ══ */}
      {screen===SCREENS.DEVELOP&&devSession&&(()=>{
        const s = devSession;
        const cfg = s.config;
        const isAppraisal = s.type==="Appraisal";
        const green = "#7C5CFC";
        const stepLabels = { self:"Employee self-assessment", manager:"Manager assessment", summary:"Review & summary", output:"Outcome document" };

        return(
          <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 20px"}}>
            {/* Step indicator */}
            <div style={{display:"flex",alignItems:"center",gap:0,marginBottom:28}}>
              {Object.entries(stepLabels).map(([k,l],i,arr)=>(
                <div key={k} style={{display:"flex",alignItems:"center",flex:1}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1}}>
                    <div style={{width:28,height:28,borderRadius:"50%",border:"2px solid",
                      borderColor:devStep===k?"#7C5CFC":["self","manager","summary","output"].indexOf(devStep)>i?"#7C5CFC44":"#E8E0D0",
                      background:devStep===k?"#7C5CFC22":"none",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:4}}>
                      {["self","manager","summary","output"].indexOf(devStep)>i
                        ?<span style={{color:"#7C5CFC",fontSize:14}}>✓</span>
                        :<span style={{fontSize:11,color:devStep===k?"#7C5CFC":"#555",fontWeight:600}}>{i+1}</span>}
                    </div>
                    <div style={{fontSize:10,color:devStep===k?"#7C5CFC":"#444",fontWeight:devStep===k?600:400,textAlign:"center"}}>{l}</div>
                  </div>
                  {i<arr.length-1&&<div style={{width:40,height:1,background:"#F5F1EA",flexShrink:0}}/>}
                </div>
              ))}
            </div>

            {/* ── STEP 1: Case info + Employee self-assessment ── */}
            {devStep==="self"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                <Card>
                  <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600,marginBottom:4}}>{s.type}</div>
                  <p style={{fontSize:12,color:"#6B6880",margin:"0 0 18px"}}>Fill in the employee details, then the employee completes their self-assessment.</p>
                  {[
                    {k:"employee",l:"Employee name",req:true,ph:"e.g. Sarah Johnson"},
                    {k:"role",l:"Job title",ph:"e.g. Marketing Manager"},
                    {k:"department",l:"Department",ph:"e.g. Marketing"},
                    {k:"email",l:"Employee email",ph:"sarah@company.com",type:"email"},
                    {k:"manager",l:"Manager name",ph:"Your name"},
                    {k:"date",l:"Meeting date",type:"date"},
                    {k:"reviewPeriod",l:"Review period",ph:"e.g. Jan – Dec 2024"},
                  ].map(f=>(
                    <div key={f.k} style={{marginBottom:12}}>
                      <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:4}}>{f.l}{f.req&&<span style={{color:"#C84B2F"}}> *</span>}</label>
                      {f.type==="date"
                        ?<DateInput value={s.caseInfo[f.k]||""} onChange={e=>setDevSession(ds=>({...ds,caseInfo:{...ds.caseInfo,[f.k]:e.target.value}}))} />
                        :<input type={f.type||"text"} placeholder={f.ph} value={s.caseInfo[f.k]||""} onChange={e=>setDevSession(ds=>({...ds,caseInfo:{...ds.caseInfo,[f.k]:e.target.value}}))}
                          style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535"}} />}
                    </div>
                  ))}
                </Card>

                <Card>
                  <div style={{fontSize:12,fontWeight:600,color:"#7C5CFC",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Employee self-assessment</div>
                  <p style={{fontSize:11,color:"#6B6880",margin:"0 0 16px",lineHeight:1.6}}>The employee fills this in before the meeting. Their answers will sit alongside the manager assessment.</p>
                  {cfg?.selfAssessmentPrompts?.map((q,i)=>(
                    <div key={i} style={{marginBottom:14}}>
                      <label style={{display:"block",fontSize:12,color:"#3D3560",marginBottom:5,lineHeight:1.5}}>{i+1}. {q}</label>
                      <textarea value={s.selfAssessment[i]||""} onChange={e=>setDevSession(ds=>({...ds,selfAssessment:{...ds.selfAssessment,[i]:e.target.value}}))}
                        placeholder="Employee answer..." rows={2}
                        style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",resize:"vertical",color:"#1A1535"}} ></textarea>
                    </div>
                  ))}
                  <Btn onClick={()=>setDevStep("manager")} disabled={!s.caseInfo.employee.trim()} style={{marginTop:4,background:"#7C5CFC",border:"none"}}>
                    Continue to manager assessment →
                  </Btn>
                </Card>
              </div>
            )}

            {/* ── STEP 2: Manager assessment + Objectives ── */}
            {devStep==="manager"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                <Card>
                  <div style={{fontSize:12,fontWeight:600,color:"#7C5CFC",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Manager assessment</div>
                  <p style={{fontSize:11,color:"#6B6880",margin:"0 0 16px",lineHeight:1.6}}>Complete your assessment of {s.caseInfo.employee||"the employee"}. Be specific and evidence-based.</p>

                  {isAppraisal&&(
                    <div style={{marginBottom:16}}>
                      <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Overall rating</label>
                      <div style={{display:"flex",gap:8}}>
                        {["1","2","3","4","5"].map(r=>(
                          <button key={r} onClick={()=>setDevSession(ds=>({...ds,rating:r}))}
                            style={{flex:1,padding:"8px 4px",borderRadius:6,border:"1px solid",borderColor:s.rating===r?"#7C5CFC":"#E8E0D0",
                              background:s.rating===r?"#7C5CFC22":"#FDFAF5",color:s.rating===r?"#A98FFF":"#555",fontSize:13,fontWeight:s.rating===r?700:400,cursor:"pointer"}}>
                            {r}
                          </button>
                        ))}
                      </div>
                      <div style={{fontSize:10,color:"#5A5570",marginTop:6}}>1=Below expectations · 3=Meets · 5=Outstanding</div>
                    </div>
                  )}

                  {cfg?.managerPrompts?.map((q,i)=>(
                    <div key={i} style={{marginBottom:14}}>
                      <label style={{display:"block",fontSize:12,color:"#3D3560",marginBottom:5,lineHeight:1.5}}>{i+1}. {q}</label>
                      <textarea value={s.managerAssessment[i]||""} onChange={e=>setDevSession(ds=>({...ds,managerAssessment:{...ds.managerAssessment,[i]:e.target.value}}))}
                        placeholder="Your assessment..." rows={2}
                        style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",resize:"vertical",color:"#1A1535"}} ></textarea>
                    </div>
                  ))}

                  <div style={{marginBottom:14}}>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Agreed outcome</label>
                    <select value={s.outcome} onChange={e=>setDevSession(ds=>({...ds,outcome:e.target.value}))}
                      style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none"}}>
                      <option value="">Select outcome...</option>
                      {cfg?.outcomeOptions?.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div style={{marginBottom:16}}>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Development plan / actions</label>
                    <textarea value={s.devPlan||""} onChange={e=>setDevSession(ds=>({...ds,devPlan:e.target.value}))}
                      placeholder="Training agreed, coaching, support, resources..." rows={3}
                      style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",resize:"vertical",color:"#1A1535"}} ></textarea>
                  </div>

                  <div style={{display:"flex",gap:8}}>
                    <Btn onClick={()=>setDevStep("summary")} style={{background:"#7C5CFC",border:"none"}}>Continue →</Btn>
                    <Btn variant="ghost" onClick={()=>setDevStep("self")}>← Back</Btn>
                  </div>
                </Card>

                {/* Objectives panel */}
                <Card style={{background:"#F5F1EA"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#7C5CFC",textTransform:"uppercase",letterSpacing:0.5}}>Objectives &amp; ratings</div>
                    <Btn onClick={()=>generateSmartObjectives(s.caseInfo.reviewPeriod)} disabled={devAiProcessing} style={{padding:"4px 12px",fontSize:11,background:"#7C5CFC",border:"none"}}>
                      {devAiProcessing?"...":"AI suggest"}
                    </Btn>
                  </div>
                  {s.objectives.map((obj,i)=>(
                    <div key={i} style={{background:"#FDFAF5",border:"1px solid #EDE5D8",borderRadius:8,padding:"12px 14px",marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,color:"#1A1535",fontWeight:600,marginBottom:2}}>{obj.label}</div>
                          {obj.desc&&<div style={{fontSize:11,color:"#6B6880"}}>{obj.desc}</div>}
                          {obj.measure&&<div style={{fontSize:10,color:"#5A5570",marginTop:2}}>Measure: {obj.measure}</div>}
                        </div>
                        <button onClick={()=>setDevSession(ds=>({...ds,objectives:ds.objectives.filter((_,j)=>j!==i)}))}
                          style={{background:"none",border:"none",color:"#6B6880",fontSize:14,cursor:"pointer",marginLeft:8}}>✕</button>
                      </div>
                      {/* Rating */}
                      <div style={{display:"flex",gap:4,marginBottom:8}}>
                        {[1,2,3,4,5].map(r=>(
                          <button key={r} onClick={()=>setDevSession(ds=>({...ds,objectives:ds.objectives.map((x,j)=>j===i?{...x,rating:r}:x)}))}
                            style={{width:28,height:28,borderRadius:4,border:"1px solid",borderColor:obj.rating>=r?"#7C5CFC":"#E8E0D0",background:obj.rating>=r?"#7C5CFC22":"none",color:obj.rating>=r?"#7C5CFC":"#555",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                            {r}
                          </button>
                        ))}
                        <span style={{fontSize:10,color:"#5A5570",lineHeight:"28px",marginLeft:6}}>{["","Below","Developing","Meeting","Exceeding","Exceptional"][obj.rating]}</span>
                      </div>
                      <input value={obj.note||""} onChange={e=>setDevSession(ds=>({...ds,objectives:ds.objectives.map((x,j)=>j===i?{...x,note:e.target.value}:x)}))}
                        placeholder="Notes on progress..."
                        style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:5,padding:"6px 10px",fontSize:11,outline:"none",color:"#1A1535"}} />
                    </div>
                  ))}
                  <button onClick={()=>setDevSession(ds=>({...ds,objectives:[...ds.objectives,{label:"New objective",desc:"",rating:3,note:""}]}))}
                    style={{width:"100%",background:"none",border:"1px dashed #E8E0D0",borderRadius:7,padding:"9px",fontSize:12,color:"#6B6880",cursor:"pointer"}}>
                    + Add objective
                  </button>

                  {/* Self-assessment reference */}
                  {Object.keys(s.selfAssessment).length>0&&(
                    <details style={{marginTop:14}}>
                      <summary style={{fontSize:11,color:"#7C5CFC",cursor:"pointer",fontWeight:600}}>View employee self-assessment</summary>
                      <div style={{marginTop:10}}>
                        {cfg?.selfAssessmentPrompts?.map((q,i)=>s.selfAssessment[i]?(
                          <div key={i} style={{marginBottom:10}}>
                            <div style={{fontSize:10,color:"#6B6880",marginBottom:3}}>{q}</div>
                            <div style={{fontSize:12,color:"#3D3560",background:"#FDFAF5",borderRadius:5,padding:"7px 10px"}}>{s.selfAssessment[i]}</div>
                          </div>
                        ):null)}
                      </div>
                    </details>
                  )}
                </Card>
              </div>
            )}

            {/* ── STEP 3: Summary ── */}
            {devStep==="summary"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:20}}>
                <Card>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600}}>{s.type} — Summary</div>
                    <Btn onClick={generateDevSummary} disabled={devAiProcessing} style={{background:"#7C5CFC",border:"none",padding:"7px 16px",fontSize:12}}>
                      {devAiProcessing?"Generating...":"Generate AI summary"}
                    </Btn>
                  </div>
                  {devAiProcessing&&!devSummary&&<div style={{textAlign:"center",padding:32}}><span className="pu" style={{color:"#7C5CFC",fontSize:22}}>●</span><div style={{color:"#6B6880",marginTop:10,fontSize:12}}>Building your summary...</div></div>}
                  {devSummary&&<MDRenderer text={devSummary}/>}
                  {!devSummary&&!devAiProcessing&&(
                    <div style={{background:"#FDFAF5",borderRadius:8,padding:20,textAlign:"center"}}>
                      <div style={{fontSize:13,color:"#6B6880",marginBottom:6}}>Click "Generate AI summary" to produce a structured meeting record</div>
                      <div style={{fontSize:11,color:"#5A5570"}}>Combines self-assessment, manager feedback, and objectives into a professional document</div>
                    </div>
                  )}
                  <div style={{display:"flex",gap:8,marginTop:20,flexWrap:"wrap"}}>
                    {devSummary&&<Btn onClick={()=>setDevStep("output")} style={{background:"#7C5CFC",border:"none"}}>Generate outcome letter →</Btn>}
                    <Btn style={{background:"#7C5CFC",borderColor:"#7C5CFC"}} onClick={()=>{saveDevMeetingToCase();setScreen(SCREENS.CASES);}}>Save to case file</Btn>
                    <Btn variant="ghost" onClick={()=>setDevStep("manager")}>← Back</Btn>
                  </div>
                </Card>

                {/* Side panel: combined view */}
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <Card style={{background:"#F5F1EA"}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#7C5CFC",letterSpacing:1,marginBottom:12}}>OBJECTIVES SUMMARY</div>
                    {s.objectives.map((obj,i)=>{
                      const rColors=["","#7C5CFC","#7C5CFC","#7C5CFC","#7C5CFC","#7C5CFC"]; const _ignore=["","#E8622A","#D4882A","#888","#7C5CFC","#7C5CFC"];
                      return(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #1a1a1a"}}>
                          <span style={{fontSize:12,color:"#3D3560"}}>{obj.label}</span>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            {[1,2,3,4,5].map(r=><div key={r} style={{width:8,height:8,borderRadius:"50%",background:obj.rating>=r?rColors[obj.rating]:"#E8E0D0"}}/>)}
                            <span style={{fontSize:10,color:rColors[obj.rating],marginLeft:4,fontWeight:600}}>{obj.rating}/5</span>
                          </div>
                        </div>
                      );
                    })}
                  </Card>
                  <Card style={{background:"#F5F1EA"}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#7C5CFC",letterSpacing:1,marginBottom:10}}>OUTCOME</div>
                    <div style={{fontSize:13,color:s.outcome?"#F2EDE4":"#555"}}>{s.outcome||"Not set"}</div>
                    {s.rating&&<div style={{fontSize:12,color:"#7C5CFC",marginTop:6}}>Rating: {s.rating}/5</div>}
                  </Card>
                </div>
              </div>
            )}

            {/* ── STEP 4: Output letter ── */}
            {devStep==="output"&&(
              <div style={{maxWidth:900,margin:"0 auto"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600}}>Outcome document</div>
                  <Btn onClick={generateDevLetter} disabled={devAiProcessing} style={{background:"#7C5CFC",border:"none"}}>
                    {devAiProcessing?"Generating...":"Generate letter"}
                  </Btn>
                </div>

                {devAiProcessing&&!devLetter&&<div style={{textAlign:"center",padding:40}}><span className="pu" style={{color:"#7C5CFC",fontSize:22}}>●</span></div>}
                {devLetter&&(
                  <>
                    <div style={{background:"#FDFAF5",borderRadius:12,padding:"36px 44px",marginBottom:16,textAlign:"left"}}>
                      <MDRenderer text={devLetter} light/>
                    </div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      <Btn onClick={()=>navigator.clipboard.writeText(devLetter)} style={{background:"#7C5CFC",border:"none"}}>Copy letter</Btn>
                      <Btn variant="blue" onClick={()=>{saveDevMeetingToCase();setScreen(SCREENS.CASES);}}>Save to case</Btn>
                      <Btn variant="ghost" onClick={()=>setDevStep("summary")}>← Back</Btn>
                    </div>
                  </>
                )}
                {!devLetter&&!devAiProcessing&&(
                  <Card style={{textAlign:"center",padding:"32px"}}>
                    <div style={{fontSize:13,color:"#6B6880",marginBottom:8}}>Click "Generate letter" to draft the outcome document</div>
                    <div style={{fontSize:11,color:"#5A5570"}}>Available: {Object.values(DEV_TEMPLATES.filter(t=>t.cat.toLowerCase().includes(s.type.split(" ")[0].toLowerCase()))).map(t=>t.name).join(", ")||"outcome letter"}</div>
                  </Card>
                )}

                {/* Template alternatives */}
                <div style={{marginTop:20}}>
                  <div style={{fontSize:10,color:"#5A5570",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Or use a template</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
                    {DEV_TEMPLATES.map(t=>(
                      <button key={t.id} onClick={()=>{navigator.clipboard.writeText(t.body);}}
                        style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"12px 14px",textAlign:"left",cursor:"pointer"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC44"}
                        onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
                        <div style={{fontSize:11,color:"#7C5CFC",fontWeight:600,marginBottom:3}}>{t.cat}</div>
                        <div style={{fontSize:12,color:"#1A1535"}}>{t.name}</div>
                        <div style={{fontSize:10,color:"#6B6880",marginTop:3}}>Click to copy →</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ NEW STARTER ONBOARDING ══ */}
      {screen===SCREENS.NEWSTARTER&&(()=>{
        const phases = activeStarter
          ? [...new Set(activeStarter.tasks.map(t=>t.phaseLabel))].map(pl=>({
              label:pl,
              tasks:activeStarter.tasks.filter(t=>t.phaseLabel===pl)
            }))
          : [];
        const completedCount = activeStarter?.tasks.filter(t=>t.done).length || 0;
        const totalCount = activeStarter?.tasks.length || 0;
        const pct = totalCount ? Math.round(completedCount/totalCount*100) : 0;
        const ownerColors = {"HR":"#7C5CFC","Line Manager":"#D4882A","IT":"#4A6FA5","Facilities":"#4A7C6F","New Starter":"#888"};

        return(
          <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
              <div>
                <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>New starter onboarding</h2>
                <p style={{fontSize:13,color:"#6B6880",margin:0}}>AI-customised induction journeys. Track every task from offer accepted to end of probation.</p>
              </div>
              <div style={{display:"flex",gap:8}}>
                {activeStarter&&<Btn variant="ghost" onClick={()=>{setActiveStarter(null);setStarterView("list");}}>← All starters</Btn>}
                {!activeStarter&&<Btn onClick={()=>setStarterView(starterView==="list"?"new":"list")}>{starterView==="list"?"+ Add starter":"Cancel"}</Btn>}
              </div>
            </div>

            {/* Add new starter form */}
            {starterView==="new"&&!activeStarter&&(
              <Card style={{marginBottom:24}}>
                <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",margin:"0 0 16px",fontWeight:600}}>New starter details</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                  {[
                    {k:"name",l:"Full name",req:true,ph:"e.g. James Wilson"},
                    {k:"role",l:"Job title",ph:"e.g. Marketing Executive"},
                    {k:"department",l:"Department",ph:"e.g. Marketing"},
                    {k:"manager",l:"Line manager",ph:"e.g. Sarah Johnson"},
                    {k:"email",l:"Email",ph:"james@company.com",type:"email"},
                    {k:"startDate",l:"Start date",req:true,type:"date"},
                  ].map(f=>(
                    <div key={f.k}>
                      <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>{f.l}{f.req&&<span style={{color:"#C84B2F"}}> *</span>}</label>
                      {f.type==="date"
                        ?<DateInput value={newStarterForm[f.k]||""} onChange={e=>setNewStarterForm(p=>({...p,[f.k]:e.target.value}))} />
                        :<input type={f.type||"text"} placeholder={f.ph} value={newStarterForm[f.k]||""} onChange={e=>setNewStarterForm(p=>({...p,[f.k]:e.target.value}))}
                          style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:13,outline:"none",color:"#1A1535",boxSizing:"border-box"}} />}
                    </div>
                  ))}
                </div>
                <div style={{marginBottom:16}}>
                  <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Onboarding template</label>
                  <select value={newStarterForm.templateId} onChange={e=>setNewStarterForm(p=>({...p,templateId:e.target.value}))}
                    style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none"}}>
                    {starterTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <Btn onClick={createStarterInstance} disabled={!newStarterForm.name||!newStarterForm.startDate}>Create onboarding journey</Btn>
                  <Btn variant="ghost" onClick={()=>setStarterView("list")}>Cancel</Btn>
                </div>
              </Card>
            )}

            {/* Starter list */}
            {starterView==="list"&&!activeStarter&&(
              <>
                {starterInstances.length===0&&(
                  <Card style={{textAlign:"center",padding:"50px 20px"}}>
                    <div style={{fontSize:32,marginBottom:12,color:"#E8E0D0"}}>—</div>
                    <div style={{fontSize:15,color:"#6B6880",marginBottom:6}}>No starters yet</div>
                    <div style={{fontSize:12,color:"#5A5570",marginBottom:20}}>Create an onboarding journey for each new hire.</div>
                    <Btn onClick={()=>setStarterView("new")}>+ Add first starter</Btn>
                  </Card>
                )}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:12}}>
                  {starterInstances.map(s=>{
                    const done = s.tasks.filter(t=>t.done).length;
                    const total = s.tasks.length;
                    const pct = total ? Math.round(done/total*100) : 0;
                    const overdueTasks = s.tasks.filter(t=>!t.done&&t.dueDate&&new Date(t.dueDate.split("/").reverse().join("-"))<new Date());
                    return(
                      <button key={s.id} onClick={()=>{setActiveStarter(s);setStarterView("instance");}}
                        style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"18px",textAlign:"left",cursor:"pointer",transition:"border-color 0.15s"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC"}
                        onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                          <div>
                            <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",fontWeight:600,marginBottom:2}}>{s.name}</div>
                            <div style={{fontSize:11,color:"#6B6880"}}>{s.role}{s.department?" · "+s.department:""}</div>
                          </div>
                          {overdueTasks.length>0&&<Badge color="#E8622A">{overdueTasks.length} overdue</Badge>}
                        </div>
                        <div style={{fontSize:11,color:"#6B6880",marginBottom:12}}>
                          Start: {new Date(s.startDate).toLocaleDateString("en-GB")} · Manager: {s.manager||"Not set"}
                        </div>
                        <div style={{background:"#FDFAF5",borderRadius:4,height:4,marginBottom:6}}>
                          <div style={{background:"#7C5CFC",borderRadius:4,height:4,width:pct+"%",transition:"width 0.3s"}}/>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6B6880"}}>
                          <span>{done}/{total} tasks complete</span>
                          <span style={{color:pct===100?"#7C5CFC":"#555"}}>{pct}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Active starter journey */}
            {activeStarter&&(
              <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:20,alignItems:"start"}}>
                {/* Sidebar */}
                <div>
                  <Card style={{marginBottom:12}}>
                    <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",fontWeight:600,marginBottom:4}}>{activeStarter.name}</div>
                    <div style={{fontSize:12,color:"#6B6880",marginBottom:12}}>{activeStarter.role}{activeStarter.department?" · "+activeStarter.department:""}</div>
                    <div style={{fontSize:11,color:"#6B6880",marginBottom:3}}>Start date: {new Date(activeStarter.startDate).toLocaleDateString("en-GB")}</div>
                    <div style={{fontSize:11,color:"#6B6880",marginBottom:12}}>Manager: {activeStarter.manager||"Not set"}</div>
                    <div style={{background:"#FDFAF5",borderRadius:4,height:6,marginBottom:6}}>
                      <div style={{background:"#7C5CFC",borderRadius:4,height:6,width:pct+"%",transition:"width 0.5s"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6B6880",marginBottom:14}}>
                      <span>{completedCount}/{totalCount} complete</span>
                      <span style={{color:pct===100?"#7C5CFC":"#555",fontWeight:600}}>{pct}%</span>
                    </div>
                    <Btn onClick={()=>aiCustomiseChecklist(activeStarter)} disabled={starterAiProcessing} style={{width:"100%",fontSize:12,padding:"9px"}}>
                      {starterAiProcessing?"Customising...":"AI customise for role"}
                    </Btn>
                    {activeStarter.aiCustomised&&<div style={{fontSize:10,color:"#7C5CFC",marginTop:6,textAlign:"center"}}>AI tasks added</div>}
                  </Card>
                  {/* Owner legend */}
                  <Card style={{background:"#F5F1EA",padding:14}}>
                    <div style={{fontSize:10,color:"#6B6880",fontWeight:700,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Task owners</div>
                    {Object.entries(ownerColors).map(([owner,color])=>(
                      <div key={owner} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0}}/>
                        <span style={{fontSize:11,color:"#6B6880"}}>{owner}</span>
                      </div>
                    ))}
                  </Card>
                </div>

                {/* Task phases */}
                <div>
                  {phases.map(phase=>{
                    const phaseDone = phase.tasks.filter(t=>t.done).length;
                    const phaseOverdue = phase.tasks.filter(t=>!t.done&&t.dueDate&&new Date(t.dueDate.split("/").reverse().join("-"))<new Date());
                    return(
                      <Card key={phase.label} style={{marginBottom:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:15,color:"#1A1535",fontWeight:600}}>{phase.label}</span>
                            {phaseOverdue.length>0&&<Badge color="#E8622A">{phaseOverdue.length} overdue</Badge>}
                          </div>
                          <span style={{fontSize:11,color:"#6B6880"}}>{phaseDone}/{phase.tasks.length}</span>
                        </div>
                        {phase.tasks.map(task=>{
                          const ownerColor = ownerColors[task.owner]||"#555";
                          const isOverdue = !task.done&&task.dueDate&&new Date(task.dueDate.split("/").reverse().join("-"))<new Date();
                          return(
                            <div key={task.id} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:"1px solid #1a1a1a",alignItems:"flex-start"}}>
                              <button onClick={()=>toggleStarterTask(activeStarter.id,task.id)}
                                style={{width:18,height:18,borderRadius:4,border:"1px solid",borderColor:task.done?"#7C5CFC":"#E8E0D0",background:task.done?"#7C5CFC":"none",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                                {task.done&&<span style={{color:"#fff",fontSize:10}}>✓</span>}
                              </button>
                              <div style={{flex:1}}>
                                <div style={{fontSize:13,color:task.done?"#555":"#F2EDE4",textDecoration:task.done?"line-through":"none",marginBottom:3}}>{task.task}</div>
                                <div style={{display:"flex",alignItems:"center",gap:10}}>
                                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                                    <div style={{width:6,height:6,borderRadius:"50%",background:ownerColor}}/>
                                    <span style={{fontSize:10,color:"#6B6880"}}>{task.owner}</span>
                                  </div>
                                  {task.dueDate&&<span style={{fontSize:10,color:isOverdue?"#E8622A":"#444",fontFamily:"JetBrains Mono,monospace"}}>{task.dueDate}{isOverdue?" (overdue)":""}</span>}
                                  {task.done&&task.doneAt&&<span style={{fontSize:10,color:"#7C5CFC"}}>Done {new Date(task.doneAt).toLocaleDateString("en-GB")}</span>}
                                </div>
                                {task.note&&<div style={{fontSize:11,color:"#6B6375",marginTop:4,fontStyle:"italic"}}>{task.note}</div>}
                              </div>
                              <input placeholder="Add note..." value={task.note||""} onChange={e=>updateStarterTaskNote(activeStarter.id,task.id,e.target.value)}
                                style={{background:"none",border:"none",borderBottom:"1px solid #E8E0D0",color:"#6B6880",fontSize:11,outline:"none",width:140,padding:"2px 4px"}}/>
                            </div>
                          );
                        })}
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ ER ANALYTICS ══ */}
      {screen===SCREENS.ERREPORT&&(()=>{
        const allMeetings = cases.flatMap(c=>c.meetings.map(m=>({...m,employeeName:c.employeeName,email:c.email,caseId:c.id})));
        const formalMeetings = allMeetings.filter(m=>MEETING_TYPES.find(t=>t.label===m.type&&t.group==="formal"));
        const rColors = {HIGH:"#E8622A",MEDIUM:"#D4882A",LOW:"#7C5CFC",UNKNOWN:"#555"};

        // Resolution time (days between first and last meeting per case)
        const resolutionTimes = cases.filter(c=>c.meetings.length>1).map(c=>{
          const dates = c.meetings.map(m=>new Date(m.savedAt)).sort((a,b)=>a-b);
          const days = Math.round((dates[dates.length-1]-dates[0])/(1000*60*60*24));
          return {name:c.employeeName, days, meetings:c.meetings.length};
        });
        const avgResolution = resolutionTimes.length ? Math.round(resolutionTimes.reduce((t,r)=>t+r.days,0)/resolutionTimes.length) : 0;

        // Managers appearing in cases
        const managerCounts = {};
        allMeetings.forEach(m=>{ if(m.manager) managerCounts[m.manager]=(managerCounts[m.manager]||0)+1; });
        const managerList = Object.entries(managerCounts).sort((a,b)=>b[1]-a[1]);

        // Meeting types breakdown
        const typeCounts = {};
        allMeetings.forEach(m=>{ typeCounts[m.type]=(typeCounts[m.type]||0)+1; });

        // Risk trends over time (by month)
        const riskByMonth = {};
        allMeetings.filter(m=>m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN").forEach(m=>{
          const month = m.savedAt ? new Date(m.savedAt).toLocaleDateString("en-GB",{month:"short",year:"2-digit"}) : "Unknown";
          if(!riskByMonth[month]) riskByMonth[month]={HIGH:0,MEDIUM:0,LOW:0};
          riskByMonth[month][m.riskScore.rating]=(riskByMonth[month][m.riskScore.rating]||0)+1;
        });
        const months = Object.keys(riskByMonth).slice(-6);

        // Repeat cases (employees with 2+ formal meetings)
        const repeatCases = cases.filter(c=>c.meetings.filter(m=>MEETING_TYPES.find(t=>t.label===m.type&&t.group==="formal")).length>=2);

        // Outcome patterns
        const highRiskMeetings = allMeetings.filter(m=>m.riskScore?.rating==="HIGH");

        return(
          <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 20px"}}>
            <div style={{marginBottom:28}}>
              <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>ER Analytics</h2>
              <p style={{fontSize:13,color:"#6B6880",margin:0}}>Employee relations case patterns, trends, and risk intelligence.</p>
            </div>

            {cases.length<2&&(
              <Card style={{textAlign:"center",padding:"50px 20px"}}>
                <div style={{fontSize:15,color:"#6B6880",marginBottom:6}}>Not enough data yet</div>
                <div style={{fontSize:12,color:"#5A5570"}}>Analytics become meaningful once you have 3+ cases saved. Keep using Compass and check back.</div>
              </Card>
            )}

            {cases.length>=2&&(
              <>
                {/* Headline stats */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:20}}>
                  {[
                    {l:"Total ER cases",v:cases.length},
                    {l:"Total meetings",v:allMeetings.length},
                    {l:"High risk meetings",v:highRiskMeetings.length},
                    {l:"Repeat cases",v:repeatCases.length},
                    {l:"Avg resolution",v:avgResolution+"d"},
                  ].map(s=>(
                    <Card key={s.l} style={{textAlign:"center",padding:"16px 10px"}}>
                      <div style={{fontSize:26,fontWeight:700,color:"#7C5CFC",fontFamily:"Inter,sans-serif",marginBottom:4}}>{s.v}</div>
                      <div style={{fontSize:10,color:"#6B6880"}}>{s.l}</div>
                    </Card>
                  ))}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                  {/* Case type breakdown */}
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:14}}>Case type breakdown</div>
                    {Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([type,count])=>{
                      const maxCount = Math.max(...Object.values(typeCounts));
                      return(
                        <div key={type} style={{marginBottom:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                            <span style={{fontSize:12,color:"#3D3560"}}>{type}</span>
                            <span style={{fontSize:12,color:"#7C5CFC",fontWeight:600}}>{count}</span>
                          </div>
                          <div style={{background:"#FDFAF5",borderRadius:3,height:5}}>
                            <div style={{background:"#7C5CFC",borderRadius:3,height:5,width:`${Math.round(count/maxCount*100)}%`}}/>
                          </div>
                        </div>
                      );
                    })}
                  </Card>

                  {/* Managers in cases */}
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:14}}>Managers by case involvement</div>
                    {managerList.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No manager data yet — add manager names when creating meetings</div>}
                    {managerList.map(([manager,count],i)=>(
                      <div key={manager} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1a1a1a"}}>
                        <div>
                          <div style={{fontSize:12,color:"#1A1535"}}>{manager}</div>
                          <div style={{fontSize:10,color:"#6B6880"}}>{count} meeting{count!==1?"s":""}</div>
                        </div>
                        {count>=3&&<Badge color="#E8622A">High involvement</Badge>}
                        {count===2&&<Badge color="#D4882A">Repeat</Badge>}
                      </div>
                    ))}
                    {managerList.length>0&&managerList.some(([,c])=>c>=3)&&(
                      <div style={{marginTop:12,padding:"10px 12px",background:"#FEF0EB",borderRadius:6,border:"1px solid #E8622A33"}}>
                        <div style={{fontSize:11,color:"#C84B2F",fontWeight:600,marginBottom:3}}>Pattern alert</div>
                        <div style={{fontSize:11,color:"#6B6375"}}>One or more managers appear in 3+ ER cases. Consider investigating management practice.</div>
                      </div>
                    )}
                  </Card>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                  {/* Risk trend by month */}
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:14}}>Risk profile over time</div>
                    {months.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No risk data yet — complete meeting reviews to see trends</div>}
                    {months.map(month=>{
                      const data = riskByMonth[month];
                      const total = data.HIGH+data.MEDIUM+data.LOW;
                      return(
                        <div key={month} style={{marginBottom:12}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                            <span style={{fontSize:11,color:"#6B6375"}}>{month}</span>
                            <div style={{display:"flex",gap:8}}>
                              {data.HIGH>0&&<span style={{fontSize:10,color:"#C84B2F"}}>{data.HIGH}H</span>}
                              {data.MEDIUM>0&&<span style={{fontSize:10,color:"#B87520"}}>{data.MEDIUM}M</span>}
                              {data.LOW>0&&<span style={{fontSize:10,color:"#7C5CFC"}}>{data.LOW}L</span>}
                            </div>
                          </div>
                          <div style={{display:"flex",height:8,borderRadius:4,overflow:"hidden",gap:1}}>
                            {data.HIGH>0&&<div style={{background:"#7C5CFC",flex:data.HIGH}}/>}
                            {data.MEDIUM>0&&<div style={{background:"#D4882A",flex:data.MEDIUM}}/>}
                            {data.LOW>0&&<div style={{background:"#7C5CFC",flex:data.LOW}}/>}
                          </div>
                        </div>
                      );
                    })}
                  </Card>

                  {/* Repeat cases */}
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:6}}>Repeat ER cases</div>
                    <div style={{fontSize:11,color:"#6B6880",marginBottom:14}}>Employees with 2 or more formal meetings</div>
                    {repeatCases.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No repeat cases — a positive sign</div>}
                    {repeatCases.map(c=>{
                      const formalCount = c.meetings.filter(m=>MEETING_TYPES.find(t=>t.label===m.type&&t.group==="formal")).length;
                      const highRisk = c.meetings.some(m=>m.riskScore?.rating==="HIGH");
                      return(
                        <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid #1a1a1a"}}>
                          <div>
                            <div style={{fontSize:14,color:"#1A1535",fontWeight:500,marginBottom:1}}>{c.employeeName}</div>
                            <div style={{fontSize:10,color:"#6B6880"}}>{formalCount} formal meetings</div>
                          </div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            {highRisk&&<Badge color="#E8622A">High risk</Badge>}
                            <Btn variant="ghost" onClick={()=>setScreen(SCREENS.CASES)} style={{padding:"3px 10px",fontSize:10}}>View</Btn>
                          </div>
                        </div>
                      );
                    })}
                  </Card>
                </div>

                {/* Resolution times */}
                {resolutionTimes.length>0&&(
                  <Card style={{marginBottom:16}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:6}}>Case resolution times</div>
                    <div style={{fontSize:11,color:"#6B6880",marginBottom:14}}>Days from first to last meeting per case · Average: {avgResolution} days</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                      {resolutionTimes.sort((a,b)=>b.days-a.days).map(r=>(
                        <div key={r.name} style={{background:"#FDFAF5",borderRadius:7,padding:"10px 14px",minWidth:140}}>
                          <div style={{fontSize:12,color:"#1A1535",fontWeight:500,marginBottom:3}}>{r.name}</div>
                          <div style={{fontSize:20,color:r.days>avgResolution*1.5?"#E8622A":"#7C5CFC",fontWeight:700,fontFamily:"Inter,sans-serif"}}>{r.days}<span style={{fontSize:11,color:"#6B6880",fontWeight:400}}>d</span></div>
                          <div style={{fontSize:10,color:"#5A5570"}}>{r.meetings} meetings</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Export report */}
                <div style={{display:"flex",gap:10}}>
                  <Btn onClick={()=>{
                    const report = {
                      generatedAt: new Date().toISOString(),
                      summary:{ totalCases:cases.length, totalMeetings:allMeetings.length, highRisk:highRiskMeetings.length, repeatCases:repeatCases.length, avgResolutionDays:avgResolution },
                      caseTypeBreakdown: typeCounts,
                      managerInvolvement: Object.fromEntries(managerList),
                      repeatCases: repeatCases.map(c=>c.employeeName),
                      riskTrend: riskByMonth,
                    };
                    const blob = new Blob([JSON.stringify(report,null,2)],{type:"application/json"});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href=url; a.download="compass_er_analytics.json"; a.click();
                    audit("ER analytics report exported");
                  }}>Export analytics report</Btn>
                  <Btn variant="ghost" onClick={()=>navigator.clipboard.writeText(JSON.stringify({totalCases:cases.length,highRisk:highRiskMeetings.length,repeatCases:repeatCases.length,avgResolution:avgResolution+"d"},null,2))}>Copy summary</Btn>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ══ REDUNDANCY & CONSULTATION ══ */}
      {screen===SCREENS.REDUNDANCY&&(()=>{
        const stepLabels = {setup:"Setup",pool:"Selection",consultation:"Consultation",outcome:"Outcome"};
        const steps = ["setup","pool","consultation","outcome"];

        return(
          <div style={{maxWidth:1280,margin:"0 auto",padding:"32px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
              <div>
                <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Redundancy &amp; consultation</h2>
                <p style={{fontSize:13,color:"#6B6880",margin:0}}>Individual and collective redundancy processes. Legally guided, document-ready.</p>
              </div>
              <div style={{display:"flex",gap:8}}>
                {activeRedundancy&&<Btn variant="ghost" onClick={()=>{setActiveRedundancy(null);setRedundancyStep("setup");setRedundancyAiOutput("");}}>← All cases</Btn>}
              </div>
            </div>

            {/* Case list */}
            {!activeRedundancy&&(
              <div>
                {redundancyCases.length===0&&(
                  <Card style={{textAlign:"center",padding:"40px 20px",marginBottom:20}}>
                    <div style={{fontSize:15,color:"#6B6880",marginBottom:6}}>No redundancy cases</div>
                    <div style={{fontSize:12,color:"#5A5570",marginBottom:20}}>Start a new individual or collective redundancy process.</div>
                  </Card>
                )}
                {redundancyCases.map(r=>(
                  <button key={r.id} onClick={()=>{setActiveRedundancy(r);setRedundancyStep(r.status||"pool");setRedundancyAiOutput("");}}
                    style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"16px 20px",textAlign:"left",marginBottom:10,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"border-color 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                        <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:15,color:"#1A1535",fontWeight:600}}>{r.reason}</span>
                        <Badge color={r.type==="collective"?"#E8622A":"#7C5CFC"}>{r.type}</Badge>
                      </div>
                      <div style={{fontSize:11,color:"#6B6880"}}>{r.atRiskEmployees.length} at-risk · Created {new Date(r.createdAt).toLocaleDateString("en-GB")} · {r.createdBy}</div>
                    </div>
                    <Badge color={r.status==="complete"?"#7C5CFC":"#D4882A"}>{r.status||"setup"}</Badge>
                  </button>
                ))}

                {/* New case form */}
                <Card>
                  <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 14px",fontWeight:600}}>Start new redundancy process</h3>
                  <div style={{marginBottom:14}}>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:6}}>Process type</label>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      {[
                        {type:"individual",title:"Individual redundancy",sub:"Fewer than 20 redundancies · No minimum consultation period · ACAS Early Conciliation recommended"},
                        {type:"collective",title:"Collective redundancy",sub:"20+ redundancies · 30 days (20-99) or 45 days (100+) consultation · HR1 form required · Employee representatives"},
                      ].map(opt=>(
                        <button key={opt.type} onClick={()=>{
                          const reason = window.prompt("Brief reason for redundancy (e.g. restructure, site closure, role no longer required):");
                          if(!reason) return;
                          const pool = window.prompt("Describe the selection pool (e.g. all Marketing Executives, all staff in Leeds office):");
                          if(pool===null) return;
                          createRedundancyCase(opt.type, reason, pool||"Not specified");
                        }}
                          style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"16px",textAlign:"left",cursor:"pointer",transition:"border-color 0.15s"}}
                          onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC"}
                          onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
                          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:14,color:"#1A1535",fontWeight:600,marginBottom:6}}>{opt.title}</div>
                          <div style={{fontSize:11,color:"#6B6880",lineHeight:1.6}}>{opt.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Active redundancy case */}
            {activeRedundancy&&(
              <div>
                {/* Step nav */}
                <div style={{display:"flex",gap:0,marginBottom:24,background:"#FFFFFF",borderRadius:8,overflow:"hidden",border:"1px solid #E8E0D0"}}>
                  {steps.map((s,i)=>(
                    <button key={s} onClick={()=>setRedundancyStep(s)}
                      style={{flex:1,padding:"10px 8px",background:redundancyStep===s?"#7C5CFC18":"none",border:"none",borderRight:i<steps.length-1?"1px solid #E8E0D0":"none",color:redundancyStep===s?"#A98FFF":"#555",fontSize:12,fontWeight:redundancyStep===s?600:400,cursor:"pointer"}}>
                      {stepLabels[s]}
                    </button>
                  ))}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:20,alignItems:"start",gridTemplateColumns:isMobile?"1fr":"1fr 380px"}}>
                  <div>
                    {/* SETUP STEP */}
                    {redundancyStep==="setup"&&(
                      <Card>
                        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#7C5CFC",margin:"0 0 14px",fontWeight:600}}>Case details</h3>
                        <div style={{background:"#FDFAF5",borderRadius:8,padding:"14px 16px",marginBottom:16}}>
                          <div style={{fontSize:11,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:8}}>CASE SUMMARY</div>
                          <div style={{fontSize:14,color:"#1A1535",marginBottom:4}}><span style={{color:"#6B6880"}}>Type:</span> {activeRedundancy.type} redundancy</div>
                          <div style={{fontSize:14,color:"#1A1535",marginBottom:4}}><span style={{color:"#6B6880"}}>Reason:</span> {activeRedundancy.reason}</div>
                          <div style={{fontSize:14,color:"#1A1535",marginBottom:4}}><span style={{color:"#6B6880"}}>Pool:</span> {activeRedundancy.poolDescription}</div>
                          <div style={{fontSize:14,color:"#1A1535"}}><span style={{color:"#6B6880"}}>Created:</span> {new Date(activeRedundancy.createdAt).toLocaleDateString("en-GB")} by {activeRedundancy.createdBy}</div>
                        </div>

                        {activeRedundancy.type==="collective"&&(
                          <div style={{marginBottom:16}}>
                            <div style={{fontSize:11,color:"#C84B2F",fontWeight:700,letterSpacing:1,marginBottom:10}}>COLLECTIVE CONSULTATION REQUIREMENTS</div>
                            {[
                              {label:"Number of redundancies",k:"count",type:"number",ph:"e.g. 25"},
                              {label:"HR1 form submitted to BEIS",k:"hrOneSubmitted",type:"checkbox"},
                              {label:"Employee representatives elected",k:"repElected",type:"checkbox"},
                              {label:"Consultation start date",k:"consultationStartDate",type:"date"},
                            ].map(f=>(
                              <div key={f.k} style={{marginBottom:10}}>
                                <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:4}}>{f.label}</label>
                                {f.type==="checkbox"
                                  ?<input type="checkbox" checked={activeRedundancy.collectiveInfo?.[f.k]||false}
                                    onChange={e=>updateRedundancyCase({collectiveInfo:{...activeRedundancy.collectiveInfo,[f.k]:e.target.checked}})}
                                    style={{accentColor:"#7C5CFC",width:16,height:16}} />
                                  :<input type={f.type||"text"} placeholder={f.ph} value={activeRedundancy.collectiveInfo?.[f.k]||""}
                                    onChange={e=>updateRedundancyCase({collectiveInfo:{...activeRedundancy.collectiveInfo,[f.k]:e.target.value}})}
                                    style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",outline:"none",width:"100%",boxSizing:"border-box"}} />}
                              </div>
                            ))}
                            <div style={{background:"#FEF0EB",borderRadius:7,padding:"10px 14px",border:"1px solid #E8622A33"}}>
                              <div style={{fontSize:11,color:"#C84B2F",fontWeight:600,marginBottom:3}}>Legal requirement</div>
                              <div style={{fontSize:11,color:"#6B6375",lineHeight:1.6}}>
                                {(activeRedundancy.collectiveInfo?.count||0)>=100?"45 days minimum consultation before any redundancy takes effect":"30 days minimum consultation before any redundancy takes effect"}
                                {" "}· HR1 form must be submitted to BEIS before consultation starts · Failure to consult is an automatic 90-day protective award per employee.
                              </div>
                            </div>
                          </div>
                        )}
                        <Btn onClick={()=>setRedundancyStep("pool")}>Continue to selection pool →</Btn>
                      </Card>
                    )}

                    {/* POOL / SELECTION STEP */}
                    {redundancyStep==="pool"&&(
                      <div>
                        {/* Selection criteria */}
                        <Card style={{marginBottom:14}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:0,fontWeight:600}}>Selection criteria</h3>
                            <span style={{fontSize:11,color:Math.abs(activeRedundancy.selectionCriteria.reduce((t,c)=>t+c.weight,0)-100)<1?"#7C5CFC":"#E8622A",fontWeight:600}}>
                              Total: {activeRedundancy.selectionCriteria.reduce((t,c)=>t+c.weight,0)}% {Math.abs(activeRedundancy.selectionCriteria.reduce((t,c)=>t+c.weight,0)-100)>1?"(must equal 100%)":"✓"}
                            </span>
                          </div>
                          {activeRedundancy.selectionCriteria.map(c=>(
                            <div key={c.id} style={{background:"#FDFAF5",borderRadius:7,padding:"12px 14px",marginBottom:8}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                                <div style={{fontSize:14,color:"#1A1535",fontWeight:500}}>{c.criterion}</div>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  <input type="number" min="0" max="100" value={c.weight}
                                    onChange={e=>updateRedundancyCase({selectionCriteria:activeRedundancy.selectionCriteria.map(x=>x.id===c.id?{...x,weight:parseInt(e.target.value)||0}:x)})}
                                    style={{width:56,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 8px",fontSize:12,color:"#1A1535",outline:"none",textAlign:"center"}} />
                                  <span style={{fontSize:11,color:"#6B6880"}}>%</span>
                                </div>
                              </div>
                              <div style={{fontSize:11,color:"#6B6880"}}>{c.description}</div>
                            </div>
                          ))}
                          <div style={{background:"#FDFAF5",borderRadius:7,padding:"10px 12px",border:"1px solid #E8E0D0",marginTop:8}}>
                            <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:4}}>LEGAL NOTE</div>
                            <div style={{fontSize:11,color:"#6B6880",lineHeight:1.6}}>Criteria must be objective and measurable. Avoid criteria that could be indirectly discriminatory (e.g. part-time working, recent maternity leave). Disability-related absences must be excluded from attendance scoring.</div>
                          </div>
                        </Card>

                        {/* At-risk employees */}
                        <Card>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:0,fontWeight:600}}>At-risk employees</h3>
                            <Btn onClick={()=>{
                              const name=window.prompt("Employee name:");
                              if(!name) return;
                              const role=window.prompt("Job title:");
                              const dept=window.prompt("Department:");
                              const emp={id:Date.now().toString(),name,role:role||"",department:dept||"",scores:{},totalScore:0,selected:null,consultationMeetings:[],outcome:"",redundancyPay:""};
                              updateRedundancyCase({atRiskEmployees:[...activeRedundancy.atRiskEmployees,emp]});
                            }} style={{padding:"6px 14px",fontSize:12}}>+ Add employee</Btn>
                          </div>
                          {activeRedundancy.atRiskEmployees.length===0&&<div style={{fontSize:12,color:"#5A5570",padding:"20px 0",textAlign:"center"}}>No employees added yet — add all employees in the selection pool</div>}
                          {activeRedundancy.atRiskEmployees.map(emp=>(
                            <div key={emp.id} style={{background:"#FDFAF5",borderRadius:8,padding:"14px",marginBottom:10,border:"1px solid #E8E0D0"}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                                <div>
                                  <div style={{fontSize:14,color:"#1A1535",fontWeight:600,marginBottom:2}}>{emp.name}</div>
                                  <div style={{fontSize:11,color:"#6B6880"}}>{emp.role}{emp.department?" · "+emp.department:""}</div>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  <div style={{fontSize:18,fontWeight:700,color:"#7C5CFC",fontFamily:"Inter,sans-serif"}}>{emp.totalScore||0}</div>
                                  <div style={{fontSize:10,color:"#6B6880"}}>/ 5.0</div>
                                  {emp.selected!==null&&<Badge color={emp.selected?"#E8622A":"#7C5CFC"}>{emp.selected?"At risk":"Retained"}</Badge>}
                                </div>
                              </div>
                              {/* Scoring grid */}
                              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8,marginBottom:10}}>
                                {activeRedundancy.selectionCriteria.map(c=>(
                                  <div key={c.id} style={{background:"#FFFFFF",borderRadius:5,padding:"8px 10px"}}>
                                    <div style={{fontSize:9,color:"#6B6880",marginBottom:5,fontWeight:600,letterSpacing:0.3}}>{c.criterion.slice(0,20)}</div>
                                    <div style={{display:"flex",gap:3}}>
                                      {[1,2,3,4,5].map(s=>(
                                        <button key={s} onClick={()=>scoreEmployee(emp.id,c.id,s)}
                                          style={{width:22,height:22,borderRadius:3,border:"1px solid",borderColor:(emp.scores?.[c.id]||0)>=s?"#7C5CFC":"#E8E0D0",background:(emp.scores?.[c.id]||0)>=s?"#7C5CFC22":"none",color:(emp.scores?.[c.id]||0)>=s?"#A98FFF":"#555",fontSize:10,cursor:"pointer"}}>
                                          {s}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div style={{display:"flex",gap:8}}>
                                <button onClick={()=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(e=>e.id===emp.id?{...e,selected:true}:e)})}
                                  style={{background:"#E8622A18",border:"1px solid #E8622A44",borderRadius:5,padding:"4px 12px",fontSize:11,color:"#C84B2F",cursor:"pointer"}}>At risk</button>
                                <button onClick={()=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(e=>e.id===emp.id?{...e,selected:false}:e)})}
                                  style={{background:"#7C5CFC18",border:"1px solid #7C5CFC33",borderRadius:5,padding:"4px 12px",fontSize:11,color:"#7C5CFC",cursor:"pointer"}}>Retained</button>
                                <button onClick={()=>generateRedundancyLetter("at-risk",emp)}
                                  style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 12px",fontSize:11,color:"#6B6375",cursor:"pointer"}}>At-risk letter</button>
                              </div>
                            </div>
                          ))}
                          {activeRedundancy.atRiskEmployees.length>0&&<Btn onClick={()=>setRedundancyStep("consultation")} style={{marginTop:8}}>Continue to consultation →</Btn>}
                        </Card>
                      </div>
                    )}

                    {/* CONSULTATION STEP */}
                    {redundancyStep==="consultation"&&(
                      <Card>
                        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:"0 0 14px",fontWeight:600}}>Consultation meetings</h3>
                        <p style={{fontSize:12,color:"#6B6880",margin:"0 0 16px",lineHeight:1.6}}>
                          {activeRedundancy.type==="collective"
                            ?"Collective consultation must happen before individual consultation. Hold meaningful consultation — employees must be able to influence the outcome."
                            :"Individual consultation must be meaningful. Consider all representations made. Keep records of all meetings."}
                        </p>
                        {activeRedundancy.atRiskEmployees.filter(e=>e.selected).map(emp=>(
                          <div key={emp.id} style={{background:"#FDFAF5",borderRadius:8,padding:"14px",marginBottom:12,border:"1px solid #E8E0D0"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                              <div style={{fontSize:14,color:"#1A1535",fontWeight:600}}>{emp.name}</div>
                              <div style={{display:"flex",gap:8}}>
                                <button onClick={()=>generateRedundancyLetter("consultation-invite",emp)}
                                  style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 10px",fontSize:11,color:"#6B6375",cursor:"pointer"}}>Invite letter</button>
                                <button onClick={()=>generateRedundancyLetter("alternative-roles",emp)}
                                  style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 10px",fontSize:11,color:"#6B6375",cursor:"pointer"}}>Alt roles letter</button>
                              </div>
                            </div>
                            <div style={{fontSize:11,color:"#6B6880",marginBottom:8}}>{emp.consultationMeetings?.length||0} consultation meeting{(emp.consultationMeetings?.length||0)!==1?"s":""} recorded</div>
                            <textarea placeholder={`Notes from consultation with ${emp.name}...`}
                              value={emp.consultationNotes||""}
                              onChange={e=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(x=>x.id===emp.id?{...x,consultationNotes:e.target.value}:x)})}
                              rows={3}
                              style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#1A1535",resize:"vertical",outline:"none",boxSizing:"border-box"}} ></textarea>
                          </div>
                        ))}
                        {activeRedundancy.atRiskEmployees.filter(e=>e.selected).length===0&&(
                          <div style={{fontSize:12,color:"#5A5570",textAlign:"center",padding:"20px 0"}}>No at-risk employees selected yet — go back to the Selection step</div>
                        )}
                        {activeRedundancy.atRiskEmployees.filter(e=>e.selected).length>0&&<Btn onClick={()=>setRedundancyStep("outcome")} style={{marginTop:8}}>Continue to outcome →</Btn>}
                      </Card>
                    )}

                    {/* OUTCOME STEP */}
                    {redundancyStep==="outcome"&&(
                      <Card>
                        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:"0 0 14px",fontWeight:600}}>Outcome letters</h3>
                        {activeRedundancy.atRiskEmployees.filter(e=>e.selected).map(emp=>(
                          <div key={emp.id} style={{background:"#FDFAF5",borderRadius:8,padding:"14px",marginBottom:10,border:"1px solid #E8E0D0"}}>
                            <div style={{fontSize:14,color:"#1A1535",fontWeight:600,marginBottom:8}}>{emp.name}</div>
                            <div style={{marginBottom:10}}>
                              <label style={{display:"block",fontSize:10,color:"#6B6880",fontWeight:600,letterSpacing:0.8,textTransform:"uppercase",marginBottom:4}}>Statutory redundancy pay</label>
                              <input placeholder="e.g. £3,450 (1.5 weeks × £2,300/week × 1 year)" value={emp.redundancyPay||""}
                                onChange={e=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(x=>x.id===emp.id?{...x,redundancyPay:e.target.value}:x)})}
                                style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:5,padding:"7px 10px",fontSize:12,color:"#1A1535",outline:"none",boxSizing:"border-box"}} />
                            </div>
                            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                              <button onClick={()=>generateRedundancyLetter("redundancy-confirmed",emp)}
                                style={{background:"#7C5CFC",border:"none",borderRadius:5,padding:"6px 14px",fontSize:12,color:"#fff",fontWeight:600,cursor:"pointer"}}>Redundancy letter</button>
                              <button onClick={()=>generateRedundancyLetter("appeal-invite",emp)}
                                style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"6px 12px",fontSize:12,color:"#6B6375",cursor:"pointer"}}>Appeal invite</button>
                            </div>
                          </div>
                        ))}
                        <Btn variant="blue" onClick={()=>updateRedundancyCase({status:"complete"})} style={{marginTop:12}}>Mark case complete</Btn>
                      </Card>
                    )}
                  </div>

                  {/* AI advice panel */}
                  <Card style={{background:"#F5F1EA",position:"sticky",top:70}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <SectionTitle>LEGAL GUIDANCE</SectionTitle>
                      <Btn onClick={getRedundancyAiAdvice} disabled={redundancyAiProcessing} style={{padding:"4px 12px",fontSize:11}}>
                        {redundancyAiProcessing?"Analysing...":"Get AI advice"}
                      </Btn>
                    </div>
                    {redundancyAiProcessing&&!redundancyAiOutput&&(
                      <div style={{textAlign:"center",padding:20}}><span className="pu" style={{color:"#7C5CFC",fontSize:20}}>●</span></div>
                    )}
                    {redundancyAiOutput&&<MDRenderer text={redundancyAiOutput}/>}
                    {!redundancyAiOutput&&!redundancyAiProcessing&&(
                      <div>
                        <div style={{fontSize:12,color:"#5A5570",lineHeight:1.8,marginBottom:16}}>
                          Click "Get AI advice" for jurisdiction-specific legal guidance on your redundancy process — consultation requirements, selection risks, equality considerations, and common pitfalls.
                        </div>
                        <div style={{borderTop:"1px solid #E8E0D0",paddingTop:14}}>
                          <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:10}}>QUICK REFERENCE</div>
                          {[
                            {l:"Individual redundancy",v:"No statutory minimum — but must be meaningful"},
                            {l:"20–99 redundancies",v:"30 days before first dismissal"},
                            {l:"100+ redundancies",v:"45 days before first dismissal"},
                            {l:"HR1 form",v:"Required for 20+ — notify BEIS before consultation"},
                            {l:"Protective award",v:"Up to 90 days pay per employee if consultation fails"},
                            {l:"Statutory redundancy pay",v:"1.5 weeks × weekly pay × years service (capped)"},
                          ].map(({l,v})=>(
                            <div key={l} style={{padding:"6px 0",borderBottom:"1px solid #1a1a1a"}}>
                              <div style={{fontSize:11,color:"#1A1535",fontWeight:500}}>{l}</div>
                              <div style={{fontSize:10,color:"#6B6880",marginTop:1}}>{v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {redundancyAiOutput&&(
                      <div style={{display:"flex",gap:8,marginTop:14}}>
                        <Btn variant="ghost" onClick={()=>navigator.clipboard.writeText(redundancyAiOutput)} style={{fontSize:11,padding:"5px 12px"}}>Copy</Btn>
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ MENTAL HEALTH & WELLBEING ══ */}
      {screen===SCREENS.WELLBEING&&(()=>{
        const typeColors = {"chat":"#7C5CFC","eap":"#4A7C6F","adjustment":"#4A6FA5","crisis":"#E8622A","return":"#D4882A","checkin":"#888"};
        const allEmployees = [...new Set(wellbeingNotes.map(n=>n.employeeName))];
        const employeeNotes = activeWellbeing ? wellbeingNotes.filter(n=>n.employeeName===activeWellbeing).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)) : [];
        const overdueFollowUps = wellbeingNotes.filter(n=>!n.followUpDone&&n.followUpDate&&new Date(n.followUpDate.split("/").reverse().join("-"))<new Date());

        return(
          <div style={{maxWidth:1100,margin:"0 auto",padding:"32px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Mental health &amp; wellbeing</h2>
                <p style={{fontSize:13,color:"#6B6880",margin:0}}>Confidential wellbeing case notes. Completely separate from disciplinary and performance records.</p>
              </div>
              <div style={{display:"flex",gap:8}}>
                {activeWellbeing&&<Btn variant="ghost" onClick={()=>{setActiveWellbeing(null);setWellbeingView("list");}}>← All employees</Btn>}
                <Btn onClick={()=>setWellbeingView(wellbeingView==="new"?"list":"new")}>{wellbeingView==="new"?"Cancel":"+ Add note"}</Btn>
              </div>
            </div>

            {/* Confidentiality notice */}
            <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",marginBottom:20,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#7C5CFC",flexShrink:0}}/>
              <div style={{fontSize:11,color:"#6B6880",lineHeight:1.5}}>These notes are confidential and are not linked to any disciplinary, performance, or ER case file. Access should be restricted to HR only. Notes may be relevant to reasonable adjustment obligations under the Equality Act 2010.</div>
            </div>

            {/* Overdue follow-ups */}
            {overdueFollowUps.length>0&&(
              <div style={{background:"#FEF5E7",border:"1px solid #D4882A33",borderRadius:8,padding:"12px 16px",marginBottom:16}}>
                <div style={{fontSize:11,color:"#B87520",fontWeight:600,marginBottom:8}}>Overdue follow-ups ({overdueFollowUps.length})</div>
                {overdueFollowUps.map(n=>(
                  <div key={n.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0"}}>
                    <span style={{fontSize:12,color:"#3D3560"}}>{n.employeeName} — {n.followUpDate}</span>
                    <button onClick={()=>toggleFollowUpDone(n.id)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:4,padding:"2px 10px",fontSize:11,color:"#7C5CFC",cursor:"pointer"}}>Mark done</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add note form */}
            {wellbeingView==="new"&&(
              <Card style={{marginBottom:20}}>
                <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 16px",fontWeight:600}}>Add wellbeing note</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Employee name *</label>
                    <input placeholder="e.g. James Wilson" value={wellbeingForm.employeeName} onChange={e=>setWellbeingForm(p=>({...p,employeeName:e.target.value}))}
                      style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box"}} />
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Note type</label>
                    <select value={wellbeingForm.type} onChange={e=>setWellbeingForm(p=>({...p,type:e.target.value}))}
                      style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none"}}>
                      {Object.entries(WELLBEING_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Date</label>
                    <DateInput value={wellbeingForm.date} onChange={e=>setWellbeingForm(p=>({...p,date:e.target.value}))} />
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>HR manager</label>
                    <input placeholder="Your name" value={wellbeingForm.manager} onChange={e=>setWellbeingForm(p=>({...p,manager:e.target.value}))}
                      style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box"}} />
                  </div>
                </div>
                <div style={{marginBottom:14}}>
                  <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Conversation notes *</label>
                  <textarea placeholder="What was discussed? What did the employee share? What was observed? How did they seem?" value={wellbeingForm.content} onChange={e=>setWellbeingForm(p=>({...p,content:e.target.value}))}
                    rows={5}
                    style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",resize:"vertical",outline:"none",boxSizing:"border-box"}} ></textarea>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Support offered</label>
                    <input placeholder="e.g. EAP referral, flexible working, OH referral" value={wellbeingForm.supportOffered} onChange={e=>setWellbeingForm(p=>({...p,supportOffered:e.target.value}))}
                      style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box"}} />
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6880",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Follow-up date</label>
                    <DateInput value={wellbeingForm.followUpDate} onChange={e=>setWellbeingForm(p=>({...p,followUpDate:e.target.value}))} />
                  </div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <Btn onClick={addWellbeingNote} disabled={!wellbeingForm.employeeName.trim()||!wellbeingForm.content.trim()}>Save note</Btn>
                  <Btn variant="ghost" onClick={()=>setWellbeingView("list")}>Cancel</Btn>
                </div>
              </Card>
            )}

            <div style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:20,alignItems:"start"}}>
              {/* Employee list */}
              <div>
                <Card style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:"#6B6880",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Employees ({allEmployees.length})</div>
                  {allEmployees.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No wellbeing notes yet</div>}
                  {allEmployees.map(emp=>{
                    const empNotes = wellbeingNotes.filter(n=>n.employeeName===emp);
                    const hasOverdue = empNotes.some(n=>!n.followUpDone&&n.followUpDate&&new Date(n.followUpDate.split("/").reverse().join("-"))<new Date());
                    return(
                      <button key={emp} onClick={()=>{setActiveWellbeing(emp);setWellbeingView("employee");}}
                        style={{width:"100%",background:activeWellbeing===emp?"#7C5CFC18":"none",border:"1px solid",borderColor:activeWellbeing===emp?"#7C5CFC33":"transparent",borderRadius:7,padding:"10px 12px",marginBottom:4,textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontSize:14,color:"#1A1535",fontWeight:activeWellbeing===emp?600:400}}>{emp}</div>
                          <div style={{fontSize:10,color:"#6B6880",marginTop:2}}>{empNotes.length} note{empNotes.length!==1?"s":""}</div>
                        </div>
                        {hasOverdue&&<div style={{width:7,height:7,borderRadius:"50%",background:"#D4882A"}}/>}
                      </button>
                    );
                  })}
                </Card>

                {/* Resources */}
                <Card style={{background:"#F5F1EA"}}>
                  <div style={{fontSize:10,color:"#6B6880",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Crisis resources</div>
                  {WELLBEING_RESOURCES.map(r=>(
                    <div key={r.name} style={{padding:"7px 0",borderBottom:"1px solid #1a1a1a"}}>
                      <div style={{fontSize:12,color:"#1A1535",fontWeight:500}}>{r.name}</div>
                      <div style={{fontSize:11,color:"#7C5CFC",marginTop:1}}>{r.contact}</div>
                      <div style={{fontSize:10,color:"#5A5570",marginTop:1}}>{r.note}</div>
                    </div>
                  ))}
                </Card>
              </div>

              {/* Notes view */}
              <div>
                {!activeWellbeing&&wellbeingView!=="new"&&(
                  <Card style={{textAlign:"center",padding:"40px 20px",background:"#F5F1EA"}}>
                    <div style={{fontSize:14,color:"#6B6880",marginBottom:8}}>Select an employee to view their wellbeing history</div>
                    <div style={{fontSize:12,color:"#5A5570"}}>Or click "+ Add note" to log a new wellbeing conversation</div>
                  </Card>
                )}

                {activeWellbeing&&employeeNotes.length>0&&(
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",fontWeight:600}}>{activeWellbeing}</div>
                      <Btn onClick={()=>{setWellbeingForm(p=>({...p,employeeName:activeWellbeing}));setWellbeingView("new");}} style={{padding:"6px 14px",fontSize:12}}>+ Add note</Btn>
                    </div>
                    {employeeNotes.map(note=>{
                      const typeColor = typeColors[note.type]||"#7C5CFC";
                      const typeInfo = WELLBEING_TYPES[note.type];
                      const isOverdue = !note.followUpDone&&note.followUpDate&&new Date(note.followUpDate.split("/").reverse().join("-"))<new Date();
                      return(
                        <Card key={note.id} style={{marginBottom:12,borderLeft:`3px solid ${typeColor}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <Badge color={typeColor}>{typeInfo?.label||note.type}</Badge>
                              <span style={{fontSize:11,color:"#6B6880"}}>{note.date}</span>
                              {note.manager&&<span style={{fontSize:11,color:"#5A5570"}}>{note.manager}</span>}
                            </div>
                            {note.confidential&&<span style={{fontSize:9,color:"#6B6880",border:"1px solid #E8E0D0",borderRadius:3,padding:"1px 6px",letterSpacing:0.5}}>CONFIDENTIAL</span>}
                          </div>
                          <div style={{fontSize:13,color:"#3D3560",lineHeight:1.7,marginBottom:10,whiteSpace:"pre-wrap"}}>{note.content}</div>
                          {note.supportOffered&&(
                            <div style={{fontSize:11,color:"#6B6880",marginBottom:8}}>
                              <span style={{color:"#6B6375",fontWeight:600}}>Support offered: </span>{note.supportOffered}
                            </div>
                          )}
                          {note.followUpDate&&(
                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#FDFAF5",borderRadius:6,padding:"8px 12px"}}>
                              <div>
                                <span style={{fontSize:11,color:isOverdue?"#D4882A":"#555"}}>Follow-up: {note.followUpDate}</span>
                                {isOverdue&&<span style={{fontSize:10,color:"#B87520",marginLeft:8}}>overdue</span>}
                              </div>
                              <button onClick={()=>toggleFollowUpDone(note.id)}
                                style={{background:note.followUpDone?"#7C5CFC22":"none",border:"1px solid",borderColor:note.followUpDone?"#7C5CFC":"#E8E0D0",borderRadius:5,padding:"3px 10px",fontSize:11,color:note.followUpDone?"#A98FFF":"#666",cursor:"pointer"}}>
                                {note.followUpDone?"Done":"Mark done"}
                              </button>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}

                {activeWellbeing&&employeeNotes.length===0&&(
                  <Card style={{textAlign:"center",padding:"32px",background:"#F5F1EA"}}>
                    <div style={{fontSize:13,color:"#6B6880",marginBottom:12}}>No notes yet for {activeWellbeing}</div>
                    <Btn onClick={()=>{setWellbeingForm(p=>({...p,employeeName:activeWellbeing}));setWellbeingView("new");}}>Add first note</Btn>
                  </Card>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ SETTINGS ══ */}
      {screen===SCREENS.SETTINGS&&(
        <div style={{maxWidth:680,margin:"0 auto",padding:"40px 20px"}}>
          <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Settings</h2>
          <p style={{fontSize:13,color:"#6B6375",margin:"0 0 28px"}}>All data saved in your browser.</p>

          {/* Data export */}
          {isHR&&(
            <Card style={{marginBottom:20}}>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Data export</div>
              <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Export all cases and meeting records for reporting or backup.</p>
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={exportCSV} style={{flex:1}}>Export CSV</Btn>
                <Btn onClick={exportPDF} variant="ghost" style={{flex:1}}>Export PDF</Btn>
              </div>
              <div style={{fontSize:11,color:"#5A5570",marginTop:10}}>CSV includes all cases, meetings, risk scores and dates. PDF includes full case summaries.</div>
            </Card>
          )}

          {/* Invite code */}
          {isHR&&org?.invite_code&&(
            <Card style={{marginBottom:20}}>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Team invite code</div>
              <p style={{fontSize:12,color:"#6B6880",marginBottom:12}}>Share this code with team members to join your workspace.</p>
              <div style={{display:"flex",alignItems:"center",gap:10,background:"#F5F1EA",borderRadius:8,padding:"12px 16px"}}>
                <span style={{fontFamily:"JetBrains Mono,monospace",fontSize:20,color:"#7C5CFC",letterSpacing:4,fontWeight:700}}>{org.invite_code}</span>
                <button onClick={()=>navigator.clipboard.writeText(org.invite_code)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 10px",fontSize:11,color:"#6B6375",cursor:"pointer"}}>Copy</button>
              </div>
            </Card>
          )}

          {/* Locations */}
          {isHR&&(
            <Card style={{marginBottom:20}}>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Locations</div>
              <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Add office locations. Managers will be assigned to a location and will only see cases from their location.</p>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                {locations.map(l=>(
                  <div key={l.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#F5F1EA",borderRadius:8,padding:"10px 14px"}}>
                    <span style={{fontSize:14,color:"#1A1535"}}>{l.name}</span>
                    <button onClick={()=>deleteLocation(l.id)} style={{background:"none",border:"none",color:"#C84B2F",cursor:"pointer",fontSize:12}}>Remove</button>
                  </div>
                ))}
                {locations.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No locations added yet</div>}
              </div>
              <div style={{display:"flex",gap:8}}>
                <input id="new-location-input" placeholder="e.g. London, Manchester..."
                  style={{flex:1,background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535"}}/>
                <Btn onClick={()=>{
                  const input = document.getElementById("new-location-input");
                  if(input?.value.trim()){ addLocation(input.value.trim()); input.value=""; }
                }}>Add</Btn>
              </div>
            </Card>
          )}

          {/* Team members */}
          {isHR&&(
            <Card style={{marginBottom:20}}>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Team members</div>
              <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Invite team members to your workspace. They will receive an email invite.</p>
              
              {/* Current members */}
              <div style={{marginBottom:16}}>
                {teamMembers.map(m=>(
                  <div key={m.id} style={{padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div>
                        <div style={{fontSize:14,color:"#1A1535"}}>{m.name||"Unknown"}</div>
                        <div style={{fontSize:11,color:"#6B6880"}}>
                          {m.role==="hr_director"?"HR Director":m.role==="hr_manager"?"HR Manager":"Location Manager"}
                          {(m.location_ids||[]).length>0&&" · "+locations.filter(l=>(m.location_ids||[]).includes(l.id)).map(l=>l.name).join(", ")}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>setEditingMember(editingMember===m.id?null:m.id)}
                          style={{background:"none",border:"1px solid #E8E0D0",borderRadius:4,padding:"3px 8px",color:"#7C5CFC",cursor:"pointer",fontSize:11}}>
                          {editingMember===m.id?"Done":"Edit access"}
                        </button>
                        <button onClick={()=>removeMember(m)}
                          style={{background:"none",border:"none",color:"#C84B2F",cursor:"pointer",fontSize:11}}>Remove</button>
                      </div>
                    </div>
                    {editingMember===m.id&&locations.length>0&&(
                      <div style={{background:"#F5F1EA",borderRadius:8,padding:"10px 14px",marginTop:4}}>
                        <div style={{fontSize:10,color:"#6B6880",marginBottom:8,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>Role</div>
                        <select value={m.role} onChange={e=>updateMemberRole(m.id,e.target.value)}
                          style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#1A1535",outline:"none",marginBottom:12}}>
                          <option value="hr_director">HR Director</option>
                          <option value="hr_manager">HR Manager</option>
                          <option value="location_manager">Location Manager</option>
                        </select>
                        <div style={{fontSize:10,color:"#6B6880",marginBottom:8,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>Location access</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                          {locations.map(l=>(
                            <label key={l.id} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:"#1A1535"}}>
                              <input type="checkbox"
                                checked={(m.location_ids||[]).includes(l.id)}
                                onChange={e=>{
                                  const current = m.location_ids||[];
                                  const updated = e.target.checked?[...current,l.id]:current.filter(x=>x!==l.id);
                                  assignLocations(m.id, updated);
                                }}
                                style={{accentColor:"#7C5CFC"}}/>
                              {l.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {teamMembers.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No team members yet</div>}
              </div>

              {/* Invite form */}
              <div style={{borderTop:"1px solid #E8E0D0",paddingTop:16}}>
                <div style={{fontSize:11,color:"#6B6375",marginBottom:12,fontWeight:600}}>Invite new member</div>
                <input placeholder="Full name" value={inviteForm.name} onChange={e=>setInviteForm(p=>({...p,name:e.target.value}))}
                  style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:8,boxSizing:"border-box"}}/>
                <input placeholder="Email address" type="email" value={inviteForm.email} onChange={e=>setInviteForm(p=>({...p,email:e.target.value}))}
                  style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:8,boxSizing:"border-box"}}/>
                <select value={inviteForm.role} onChange={e=>setInviteForm(p=>({...p,role:e.target.value}))}
                  style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:12}}>
                  <option value="hr_manager">HR Manager</option>
                  <option value="hr_director">HR Director</option>
                  <option value="location_manager">Location Manager</option>
                </select>
                {locations.length>0&&(
                  <div style={{marginBottom:12}}>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Locations</label>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {locations.map(l=>(
                        <label key={l.id} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:"#1A1535"}}>
                          <input type="checkbox" checked={inviteForm.locationIds.includes(l.id)}
                            onChange={e=>{
                              setInviteForm(p=>({...p,locationIds:e.target.checked?[...p.locationIds,l.id]:p.locationIds.filter(x=>x!==l.id)}));
                            }}
                            style={{accentColor:"#7C5CFC"}}/>
                          {l.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <Btn onClick={inviteMember} disabled={inviting||!inviteForm.name.trim()||!inviteForm.email.trim()} style={{width:"100%"}}>
                  {inviting?"Sending invite...":"Send invite"}
                </Btn>
              </div>
            </Card>
          )}

          {/* Word template */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Word letter template</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Upload your .docx with header/footer. Enables Word export on letters.</p></div>
              <Badge color="#1C5AA0">WORD</Badge>
            </div>
            {wordTemplate?<div style={{background:"#FDFAF5",borderRadius:7,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#1A1535"}}>{wordTemplate.name}</span><Btn variant="danger" onClick={()=>{setWordTemplate(null);lsSet("compass_word_template",null);}} style={{padding:"2px 10px",fontSize:11}}>Remove</Btn></div>:<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#5A5570"}}>No template uploaded</div>}
            <input ref={wordTemplateRef} type="file" accept=".docx" onChange={handleWordTemplateUpload} style={{display:"none"}} />
            <Btn variant="blue" onClick={()=>wordTemplateRef.current?.click()}>{wordTemplate?"Replace":"Upload .docx template"} →</Btn>
          </Card>

          {/* Letterhead */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Letterhead image</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>PNG or JPG — appears at top of PDF letters.</p></div>
              <Badge>PDF</Badge>
            </div>
            {letterhead?<div style={{background:"#fff",borderRadius:7,padding:12,marginBottom:12,position:"relative"}}><img src={letterhead} alt="Letterhead" style={{width:"100%",maxHeight:100,objectFit:"contain",objectPosition:"left"}}/><button onClick={()=>{setLetterhead(null);lsSet("compass_letterhead",null);}} style={{position:"absolute",top:6,right:6,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 8px",fontSize:11,color:"#C84B2F",cursor:"pointer"}}>Remove</button></div>:<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#5A5570"}}>No letterhead uploaded</div>}
            <input ref={letterheadRef} type="file" accept="image/*" onChange={handleLetterheadUpload} style={{display:"none"}} />
            <Btn onClick={()=>letterheadRef.current?.click()}>{letterhead?"Replace":"Upload letterhead"} →</Btn>
          </Card>

          {/* E-signature */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>E-signature</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Draw or type your signature. Applied to all PDF letters.</p></div>
            </div>
            {signature?<div style={{background:"#fff",borderRadius:7,padding:"12px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              {signature.type==="typed"?<div style={{fontFamily:"'Brush Script MT',cursive",fontSize:28,color:"#FFFFFF"}}>{signature.data}</div>:<img src={signature.data} alt="Sig" style={{maxHeight:45,maxWidth:160}}/>}
              <Btn variant="danger" onClick={()=>{setSignature(null);lsSet("compass_signature",null);}} style={{padding:"3px 10px",fontSize:11}}>Remove</Btn>
            </div>:<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#5A5570"}}>No signature saved</div>}
            <Btn onClick={()=>setShowSigPad(true)}>{signature?"Update":"Create"} signature →</Btn>
          </Card>

          {/* Policies */}
          <Card style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Company policies</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Upload HR policies (.docx, .txt). Compass references them in all AI outputs.</p></div>
              <Badge color="#7C5CFC">AI</Badge>
            </div>
            {policies.length>0&&(
              <div style={{marginBottom:14}}>
                {policies.map(p=>(
                  <div key={p.id} style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:7,padding:"9px 12px",marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <span style={{fontSize:12,color:"#1A1535",fontWeight:600}}>{p.name}</span>
                      <span style={{fontSize:10,color:"#5A5570",marginLeft:8,fontFamily:"JetBrains Mono,monospace"}}>{p.size}</span>
                    </div>
                    <Btn variant="danger" onClick={()=>{const u=policies.filter(x=>x.id!==p.id);setPolicies(u);lsSet("compass_policies",u);}} style={{padding:"2px 10px",fontSize:11}}>Remove</Btn>
                  </div>
                ))}
              </div>
            )}
            {policies.length===0&&<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:14,fontSize:12,color:"#5A5570"}}>No policies uploaded</div>}
            <input ref={policyFileRef} type="file" multiple accept=".txt,.md,.docx" onChange={handlePolicyUpload} style={{display:"none"}} />
            <Btn onClick={()=>policyFileRef.current?.click()} disabled={policyProcessing}>{policyProcessing?"Processing...":"+ Upload policies →"}</Btn>
            {policies.length>0&&<div style={{marginTop:12,fontSize:11,color:"#7C5CFC"}}>✓ Active in: prep, note structuring, letter drafting, risk scoring</div>}
          </Card>

          {/* Team members */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Team members</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Manage who can access Compass. Each user has role-based permissions.</p></div>
            </div>
            {users.length>0&&(
              <div style={{marginBottom:14}}>
                {users.map(u=>(
                  <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
                    <div>
                      <div style={{fontSize:14,color:"#1A1535",fontWeight:currentUser?.id===u.id?600:400}}>{u.name}{currentUser?.id===u.id&&" (you)"}</div>
                      <div style={{fontSize:11,color:"#6B6880",marginTop:1}}>{u.role} {u.email?"· "+u.email:""}</div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <div style={{fontSize:10,color:"#5A5570"}}>
                        {ROLE_PERMS[u.role]?.viewAll?"All cases":"Assigned only"} ·{" "}
                        {ROLE_PERMS[u.role]?.edit?"Can edit":"Read only"}
                      </div>
                      <button onClick={()=>saveUsers(users.filter(x=>x.id!==u.id))} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 8px",fontSize:11,color:"#C84B2F",cursor:"pointer"}}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <UserAddForm onAdd={(name,role,email)=>addUser(name,role,email)} />
            <div style={{marginTop:12,background:"#FDFAF5",borderRadius:7,padding:"10px 14px"}}>
              <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:6}}>PERMISSIONS</div>
              {Object.entries(ROLE_PERMS).map(([role,p])=>(
                <div key={role} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6B6880",padding:"3px 0"}}>
                  <span style={{color:"#6B6375",fontWeight:500}}>{role}</span>
                  <span>{p.viewAll?"All cases":"Assigned"} · {p.edit?"Edit":"Read"} · {p.delete?"Delete":"No delete"} · {p.viewRisk?"Risk":"No risk"}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Notifications */}
          <Card style={{marginBottom:12}}>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Deadline reminders</h3>
            <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Get browser notifications for upcoming and overdue deadlines.</p>
            {dueSoon.length>0?(
              <div style={{marginBottom:14}}>
                {dueSoon.slice(0,5).map((d,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1a1a1a",fontSize:12}}>
                    <div>
                      <span style={{color:d.overdue?"#E8622A":"#F2EDE4"}}>{d.caseName}</span>
                      <span style={{color:"#6B6880",marginLeft:8}}>{d.step}</span>
                    </div>
                    <span style={{color:d.overdue?"#E8622A":"#888",fontFamily:"JetBrains Mono,monospace"}}>{d.overdue?`${Math.abs(d.daysLeft)}d overdue`:`${d.daysLeft}d`}</span>
                  </div>
                ))}
              </div>
            ):<div style={{fontSize:12,color:"#5A5570",marginBottom:14}}>No upcoming deadlines in the next 7 days</div>}
            <Btn onClick={requestNotifications} disabled={notifGranted}>{notifGranted?"Notifications enabled":"Enable browser notifications"}</Btn>
          </Card>

          {/* Audit trail */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Audit trail</h3><p style={{fontSize:12,color:"#6B6375",margin:0}}>Every action timestamped and logged.</p></div>
              <span style={{fontSize:11,color:"#6B6880"}}>{auditLog.length} entries</span>
            </div>
            <div style={{maxHeight:240,overflowY:"auto"}}>
              {auditLog.slice(0,50).map((e,i)=>(
                <div key={i} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid #1a1a1a",alignItems:"flex-start"}}>
                  <span style={{fontSize:10,color:"#5A5570",fontFamily:"JetBrains Mono,monospace",flexShrink:0,marginTop:1}}>{new Date(e.ts).toLocaleString("en-GB",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                  <div>
                    <span style={{fontSize:11,color:"#1A1535",fontWeight:500}}>{e.action}</span>
                    {e.detail&&<span style={{fontSize:11,color:"#6B6880",marginLeft:6}}>{e.detail}</span>}
                    {e.user&&e.user!=="HR Manager"&&<span style={{fontSize:10,color:"#7C5CFC",marginLeft:6}}>· {e.user}</span>}
                  </div>
                </div>
              ))}
              {auditLog.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No actions logged yet</div>}
            </div>
          </Card>

          {/* GDPR / Data */}
          <Card style={{marginBottom:20}}>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Data &amp; privacy</h3>
            <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>All data is stored locally in your browser. You are responsible for UK GDPR compliance when processing employee personal data.</p>
            <div style={{background:"#FDFAF5",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
              <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:8}}>DATA INVENTORY</div>
              {[
                {l:"Case files & meetings",v:cases.length+" cases, "+cases.reduce((t,c)=>t+c.meetings.length,0)+" meetings"},
                {l:"Policies uploaded",v:policies.length+" documents"},
                {l:"Whistleblower reports",v:whistleReports.length+" reports"},
                {l:"Audit log entries",v:auditLog.length+" entries"},
                {l:"Storage used",v:Math.round(JSON.stringify(localStorage).length/1024)+"kb"},
              ].map(({l,v})=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6B6880",padding:"3px 0"}}>
                  <span>{l}</span><span style={{color:"#6B6375"}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <Btn variant="secondary" onClick={exportAllData}>Export all data</Btn>
              <Btn variant="danger" onClick={deleteAllData} style={{color:"#C84B2F"}}>Delete all data</Btn>
              <button onClick={()=>{setGdprAccepted(false);lsSet("compass_gdpr",false);setShowGdpr(true);}} style={{background:"none",border:"none",color:"#6B6880",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>View privacy notice</button>
            </div>
          </Card>

          {/* Help / Onboarding */}
          <Card style={{marginBottom:20}}>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Help &amp; onboarding</h3>
            <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px"}}>Rewatch the getting started guide.</p>
            <Btn onClick={()=>{setOnboardStep(0);setShowOnboard(true);}}>Restart tour</Btn>
          </Card>

          <Btn variant="ghost" onClick={()=>setScreen(SCREENS.HOME)}>← Back to home</Btn>
        </div>
      )}
    </div>
  );
}
