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
];

const SCREENS = {
  HOME:"home", CASES:"cases", PREP:"prep", RECORD:"record",
  REVIEW:"review", LETTER:"letter", SETTINGS:"settings",
  DASHBOARD:"dashboard", PORTAL:"portal", TIMELINE:"timeline",
  TEMPLATES:"templates", WHISTLE:"whistle", PREDICT:"predict",
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
    color:"#D4882A",
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
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none" style={{flexShrink:0}}>
      <circle cx="50" cy="50" r="44" stroke="#7C5CFC" strokeWidth="9" fill="none" />
      <ellipse cx="50" cy="50" rx="8" ry="30" transform="rotate(-40 50 50)" fill="#7C5CFC" />
      <circle cx="50" cy="50" r="5.5" fill="#0D0D0F" />
    </svg>
  );
}

function Badge({ children, color="#7C5CFC" }) {
  return <span style={{fontSize:9, fontWeight:700, letterSpacing:1, color, background:color+"18", border:`1px solid ${color}33`, borderRadius:4, padding:"2px 7px"}}>{children}</span>;
}

function Btn({ children, onClick, variant="primary", disabled, style={} }) {
  const base = { border:"none", borderRadius:6, padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer", transition:"opacity 0.15s", opacity:disabled?0.5:1, ...style };
  const vars = {
    primary: { background:"#7C5CFC", color:"#fff" },
    secondary: { background:"#1C1C22", border:"1px solid #2A2A35", color:"#F2EDE4" },
    ghost: { background:"none", border:"1px solid #2A2A35", color:"#888" },
    danger: { background:"none", border:"1px solid #2A2A35", color:"#E8622A" },
    blue: { background:"#1C5AA0", color:"#fff" },
  };
  return <button onClick={disabled ? undefined : onClick} style={{...base,...vars[variant]}}>{children}</button>;
}

function Card({ children, style={} }) {
  return <div style={{background:"#1C1C22", border:"1px solid #2A2A35", borderRadius:12, padding:24, ...style}}>{children}</div>;
}

function SectionTitle({ children }) {
  return <div style={{fontSize:10, fontWeight:700, letterSpacing:1.5, color:"#7C5CFC", background:"#7C5CFC18", border:"1px solid #7C5CFC33", borderRadius:4, padding:"3px 8px", display:"inline-block", marginBottom:14}}>{children}</div>;
}

function MDRenderer({ text, light }) {
  const base = light ? "#1C1C22" : "#F2EDE4";
  const muted = light ? "#4A5060" : "#C4BDAF";
  const accent = "#7C5CFC";
  if(!text) return null;




  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",fontFamily:"Inter,system-ui,sans-serif", lineHeight:1.75, color:base, fontSize:14}}>
      {text.split("\n").map((line, i) => {
        if(line.startsWith("## ")) return <h3 key={i} style={{fontFamily:"Playfair Display,Georgia,serif", fontSize:16, fontWeight:600, color:accent, margin:"24px 0 8px"}}>{line.slice(3)}</h3>;
        if(line.startsWith("# ")) return <h2 key={i} style={{fontFamily:"Playfair Display,Georgia,serif", fontSize:20, fontWeight:600, color:base, margin:"8px 0 16px"}}>{line.slice(2)}</h2>;
        if(line.match(/^\*\*(.+)\*\*$/)) return <p key={i} style={{fontWeight:600, color:base, margin:"8px 0 4px"}}>{line.slice(2,-2)}</p>;
        if(line.startsWith("- ") || line.startsWith("* ")) return <div key={i} style={{display:"flex", gap:8, margin:"3px 0"}}><span style={{color:accent}}>·</span><span>{line.slice(2)}</span></div>;
        if(/^\d+\.\s/.test(line)) return <div key={i} style={{display:"flex", gap:10, margin:"3px 0"}}><span style={{color:accent, fontWeight:600}}>{line.match(/^\d+/)[0]}.</span><span>{line.replace(/^\d+\.\s/,"")}</span></div>;
        if(line.trim()==="") return <div key={i} style={{height:6}} />;
        if(line.startsWith("---")) return <hr key={i} style={{border:"none", borderTop:"1px solid #2A2A35", margin:"16px 0"}} />;
        return <p key={i} style={{margin:"2px 0", color:line.startsWith("[") ? muted : base}}>{line}</p>;
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
    ctx.strokeStyle="#1C1C22"; ctx.lineWidth=2; ctx.lineCap="round";
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
          <span style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600}}>E-signature</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#888",fontSize:22,cursor:"pointer"}}>&#10005;</button>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {["draw","type"].map(m=><Btn key={m} variant={mode===m?"primary":"ghost"} onClick={()=>setMode(m)}>{m==="draw"?"Draw":"Type"}</Btn>)}
        </div>
        {mode==="draw" ? (
          <>
            <div style={{background:"#fff",borderRadius:8,border:"1px solid #2A2A35",marginBottom:10,overflow:"hidden"}}>
              <canvas ref={canvasRef} width={440} height={150} style={{display:"block",width:"100%",touchAction:"none",cursor:"crosshair"}}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{fontSize:11,color:"#555"}}>Draw your signature above</span>
              <Btn variant="ghost" onClick={clear} style={{padding:"4px 10px",fontSize:11}}>Clear</Btn>
            </div>
          </>
        ) : (
          <div style={{marginBottom:16}}>
            <input value={typed} onChange={e=>setTyped(e.target.value)} placeholder="Type your name"
              style={{width:"100%",background:"#fff",border:"1px solid #2A2A35",borderRadius:8,padding:"12px 16px",fontSize:28,fontFamily:"'Brush Script MT',cursive",color:"#1C1C22",outline:"none",boxSizing:"border-box"}} />
            {typed && <div style={{background:"#fff",borderRadius:8,border:"1px solid #2A2A35",padding:"10px 16px",marginTop:8}}><div style={{fontFamily:"'Brush Script MT',cursive",fontSize:32,color:"#1C1C22"}}>{typed}</div></div>}
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
        style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 36px 9px 12px",fontSize:13,outline:"none",color:"#F2EDE4",boxSizing:"border-box",...style}} />
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
    <div style={{fontFamily:"Inter,system-ui,sans-serif",marginTop:14,borderTop:"1px solid #2A2A35",paddingTop:14}}>
      <div style={{fontSize:11,color:"#555",marginBottom:8,fontWeight:600}}>Add adjustment</div>
      <input placeholder="e.g. Flexible start time, additional breaks, remote working" value={adj} onChange={e=>setAdj(e.target.value)}
        style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#F2EDE4",outline:"none",marginBottom:8,boxSizing:"border-box"}} />
      <input placeholder="Review date (optional)" value={review} onChange={e=>setReview(e.target.value)}
        style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#F2EDE4",outline:"none",marginBottom:8,boxSizing:"border-box"}} />
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
          style={{background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#F2EDE4",outline:"none"}} />
        <select value={role} onChange={e=>setRole(e.target.value)}
          style={{background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#F2EDE4",outline:"none"}}>
          {["HR Director","HR Manager","Line Manager","HR Administrator"].map(r=><option key={r}>{r}</option>)}
        </select>
      </div>
      <input placeholder="Email (optional)" value={email} onChange={e=>setEmail(e.target.value)}
        style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#F2EDE4",outline:"none",marginBottom:8,boxSizing:"border-box"}} />
      <Btn onClick={()=>{if(name.trim()){onAdd(name.trim(),role,email.trim());}}} disabled={!name.trim()} style={{width:"100%",fontSize:12,padding:"8px"}}>Add user</Btn>
    </div>
  );
}

export default function Compass() {
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
  const [currentUser, setCurrentUser] = useState(ls("compass_user", null)); // {name, role, email}
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
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [homeChatInput, setHomeChatInput] = useState("");
  const [homeChatHistory, setHomeChatHistory] = useState([]);
  const [homeChatOpen, setHomeChatOpen] = useState(false);
  const [homeChatProcessing, setHomeChatProcessing] = useState(false);

  const sendForSignature = async (employeeEmail) => {
    if(!employeeEmail||!reviewOutput) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setSignId(id);
    setSignStatus("pending");
    const signId = id;

    // Auto-save case with signId
    if(caseInfo.employee.trim()) {
      const meeting = {
        id: Date.now().toString(),
        type: meetingType?.label||"Meeting",
        date: caseInfo.date||new Date().toLocaleDateString("en-GB"),
        manager: caseInfo.manager,
        participants,
        transcript: transcript.filter(u=>!u.pending),
        record: reviewOutput,
      signDocument: (()=>{const s=reviewOutput.indexOf("## Meeting Details");const e=reviewOutput.indexOf("\n## Key Points");return s>-1?reviewOutput.slice(s,e>-1?e:undefined):reviewOutput;})(),
        letterOutput,
        riskScore,
        nextSteps,
        prediction,
        letterTracking: {},
        savedAt: new Date().toISOString(),
        savedBy: currentUser?.name || "HR Manager",
        signId: id,
        signStatus: "pending",
      };
      const existing = cases.find(c=>c.employeeName===caseInfo.employee.trim());
      if(existing) {
        saveCases(cases.map(c=>c.employeeName===caseInfo.employee.trim()?{...c,meetings:[...(c.meetings||[]),meeting]}:c));
      } else {
        saveCases([...cases,{id:Date.now().toString(),employeeName:caseInfo.employee.trim(),meetings:[meeting]}]);
      }
    }
    const appUrl = window.location.origin;
    
    // Store document in Supabase via API
    await fetch("/api/signing", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        signId,
        document: (()=>{const s=reviewOutput.indexOf("## Meeting Details");const e=reviewOutput.indexOf("\n## Key Points");return s>-1?reviewOutput.slice(s,e>-1?e:undefined):reviewOutput;})(),
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
    } else {
      alert("Failed to send: "+JSON.stringify(data));
    }
  };

  const updateLiveContext = async (notes) => {
    if(notes.trim().split(/\s+/).length < 20) return;
    setLiveContextLoading(true);
    try {
      const res = await fetch("/api/chat", {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({model:"claude-sonnet-4-6", max_tokens:250, stream:false,
          system:"You are a quiet HR advisor listening to a live meeting. Give exactly two things: OBSERVATION: [1-2 sentences flagging risks or important points] SUGGESTED QUESTIONS: 1. [question] 2. [question]. No bold, no emoji.",
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
      console.log("Setting showCasePrompt to true");
      setShowCasePrompt(true);
      console.log("showCasePrompt set");
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
  const saveCases = u => { setCases(u); lsSet("compass_cases", u); };
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
      await streamClaude(
        `You are a UK HR documentation specialist. Use ## for headers and - for bullets. No bold asterisks, no emoji, no tables. Fix typos. Max 3 sentences per section.${policies.length?" Reference company policies by name.":""} IMPORTANT: In the Meeting Dialogue section, prefix every line with initials only. Chair ${caseInfo.manager||"HR Manager"} = ${(caseInfo.manager||"HR Manager").split(" ").map(w=>w[0].toUpperCase()).join("")}. Employee ${caseInfo.employee||"Employee"} = ${(caseInfo.employee||"Employee").split(" ").map(w=>w[0].toUpperCase()).join("")}. Use ONLY these initials, never full names in the dialogue.`,
        `${meetingType?.label} meeting. Employee: ${caseInfo.employee}. Date: ${caseInfo.date||"today"}. Chair: ${caseInfo.manager||"Unknown"}. Start time: ${meetingStartTime||"Unknown"}. End time: ${meetingEndTime||meetingEndTimeVal||"Unknown"}. Other participants: ${participants.map(p=>p.name+" ("+p.role+")").join(", ")||"none listed"}${getPolicyCtx()}\n\nTRANSCRIPT:\n${tx}\n\nPlease produce the following sections:\n\n## Meeting Details\nInclude these fields on separate lines:\n- Type: [meeting type]\n- Date: [date]\n- Start time: [start time]\n- End time: [end time]\n- Chair: [chair name]\n- Employee: [employee name]\n- Other participants: [any others or "None"]\n- Purpose: [write 1-2 sentences on the same line explaining why this meeting was held]\n\n## Meeting Dialogue\nRewrite as a clean readable conversation. Each line must start with the speaker's INITIALS followed by a colon (e.g. if chair is "${caseInfo.manager||"HR Manager"}" use initials "${(caseInfo.manager||"HR Manager").split(" ").map(w=>w[0]).join("")}:" and if employee is "${caseInfo.employee||"Employee"}" use initials "${(caseInfo.employee||"Employee").split(" ").map(w=>w[0]).join("")}:"). Fix any typos. One line per utterance.\n\n## Key Points\n## Employee Position\n## Management Position\n## Procedural Checks\n## Actions & Next Steps`,
        t=>setReviewOutput(t)
      );
    } catch(e) { setAiError(e.message); }
    setAiProcessing(false);
    // Auto risk score
    runRiskScore();
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
        `UK HR professional writing developmental correspondence. Professional but human tone. Not disciplinary. DD Month YYYY dates.`,
        `${letterConfig[s.type]||"Draft a development meeting outcome letter."}

Employee: ${s.caseInfo.employee||"[Name]"}
Role: ${s.caseInfo.role||"[Role]"}
Manager: ${s.caseInfo.manager||"[Manager]"}
Date: ${s.caseInfo.date||"[Date]"}
Rating: ${s.rating||"N/A"}
Outcome: ${s.outcome||"N/A"}

Meeting summary:
${devSummary||"Please refer to the discussion notes."}

Include: date, greeting, what was discussed, agreed outcomes, next steps, signature block.`,
        t => setDevLetter(t)
      );
    } catch(e) { setDevLetter("Error: "+e.message); }
    setDevAiProcessing(false);
  };

  const generateSmartObjectives = async (context) => {
    if(!devSession) return;
    setDevAiProcessing(true);
    try {
      const result = await streamClaude(
        `UK HR specialist. Generate SMART objectives. Respond ONLY with JSON array, no markdown: [{"label":"...","desc":"...","measure":"...","timeframe":"..."}]`,
        `Role: ${devSession.caseInfo.role||"employee"}\nMeeting type: ${devSession.type}\nContext: ${context||devSession.caseInfo.reviewPeriod||"annual review"}\nGenerate 4 specific, measurable objectives appropriate for this person and meeting type.`,
        ()=>{}
      );
      const parsed = JSON.parse(result.replace(/```json|```/g,"").trim());
      setDevSession(s=>({...s, objectives:[...s.objectives, ...parsed.map(o=>({...o,rating:3,progress:"",note:""}))]}));
    } catch(e) { alert("Could not generate objectives: "+e.message); }
    setDevAiProcessing(false);
  };

  const saveDevMeetingToCase = () => {
    if(!devSession?.caseInfo?.employee) return;
    const empName = devSession.caseInfo.employee;
    const meeting = {
      id: Date.now().toString(),
      type: devSession.type,
      date: devSession.caseInfo.date||new Date().toLocaleDateString("en-GB"),
      manager: devSession.caseInfo.manager,
      participants:[],
      transcript:[],
      record: devSummary,
      letterOutput: devLetter,
      riskScore: null,
      nextSteps: (NEXT_STEPS_MAP[devSession.type]||[]).map(s=>({...s,done:false})),
      devSession: devSession,
      savedAt: new Date().toISOString(),
      isDev: true,
    };
    const existing = cases.find(c=>c.employeeName.toLowerCase()===empName.toLowerCase());
    if(existing) {
      saveCases(cases.map(c=>c.id===existing.id?{...c,meetings:[...c.meetings,meeting]}:c));
    } else {
      saveCases([...cases,{id:Date.now().toString(),employeeName:empName,email:devSession.caseInfo.email,createdAt:new Date().toISOString(),meetings:[meeting]}]);
    }
  };

  // ── AI: Letter ──
  const handleLetter = async type => {
    const t = type||"outcome"; setActiveLetter(t); setAiError("");
    setAiProcessing(true); setScreen(SCREENS.LETTER); setLetterOutput("");
    try {
      const tx = transcript.map(u=>u.speaker+": "+u.text).join("\n");
      const prompts = { outcome:`Draft formal ${meetingType?.label} outcome letter.`, invite:`Draft formal invitation to ${meetingType?.label} meeting.`, appeal:`Draft appeal outcome letter for ${meetingType?.label}.` };
      await streamClaude(
        `UK HR professional. ACAS Code, ERA 1996. DD Month YYYY dates.${policies.length?" Reference company policies by name.":""}`,
        `${prompts[t]}\nEmployee: ${caseInfo.employee||"[Name]"}\nDate: ${caseInfo.date||"[Date]"}\nChair: ${caseInfo.manager||"[Manager]"}\nParticipants: ${participants.map(p=>p.name+" ("+p.role+")").join(", ")||"N/A"}${getPolicyCtx()}\n\nMeeting summary:\n${tx||reviewOutput||"No transcript"}\n\nInclude: formal header, findings, decision, right of appeal, timescales, signature block. End with ## Next Steps for HR.`,
        t2=>setLetterOutput(t2)
      );
    } catch(e) { setAiError(e.message); }
    setAiProcessing(false);
  };

  // ── Save to case ──
  const saveMeetingToCase = () => {
    if(!caseInfo.employee.trim()) return;
    const meeting = {
      id: Date.now().toString(),
      type: meetingType?.label||"Meeting",
      date: caseInfo.date||new Date().toLocaleDateString("en-GB"),
      manager: caseInfo.manager,
      participants,
      transcript: transcript.filter(u=>!u.pending),
      record: reviewOutput,
      signDocument: (()=>{const s=reviewOutput.indexOf("## Meeting Details");const e=reviewOutput.indexOf("\n## Key Points");return s>-1?reviewOutput.slice(s,e>-1?e:undefined):reviewOutput;})(),
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
    const fileName = `Compass_${meetingType?.label}_${caseInfo.employee||"Letter"}.pdf`;
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
  const spBdr=sp=>sp===SPEAKERS.HR?"#7C5CFC":sp===SPEAKERS.NOTE?"#2A2A35":"#E8622A";

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",minHeight:"100vh",background:"#0D0D0F",fontFamily:"Inter,system-ui,sans-serif",color:"#F2EDE4"}}>
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
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:#0D0D0F;}::-webkit-scrollbar-thumb{background:#2A2A35;border-radius:2px;}
      `}</style>

      {showSignModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:16,padding:28,width:"100%",maxWidth:440}}>
            <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#F2EDE4",marginBottom:8,fontWeight:400}}>Send for signature</h3>
            <p style={{fontSize:13,color:"#666",marginBottom:20}}>The employee will receive an email with a link to read and sign the meeting record.</p>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Employee email</label>
            <input value={signEmail} onChange={e=>setSignEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&signEmail.includes("@")&&(sendForSignature(signEmail),setShowSignModal(false),setSignEmail(""))}
              placeholder="employee@company.com" autoFocus
              style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:8,padding:"12px 16px",fontSize:14,outline:"none",color:"#F2EDE4",boxSizing:"border-box",marginBottom:16}}/>
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
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:1000,background:"#1C1C22",border:"1px solid #7C5CFC",borderRadius:12,padding:"16px 20px",width:"100%",maxWidth:500,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontSize:13,color:"#7C5CFC",fontWeight:600,marginBottom:3}}>Save to a case file?</div>
              <div style={{fontSize:11,color:"#555"}}>This looks like it relates to a specific employee situation.</div>
            </div>
            <button onClick={()=>setShowCasePrompt(false)} style={{background:"none",border:"none",color:"#555",fontSize:18,cursor:"pointer",padding:0,marginLeft:12}}>&#10005;</button>
          </div>
          <div style={{display:"flex",gap:8}}>
            <input value={casePromptName} onChange={e=>setCasePromptName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&createCaseFromChat()}
              placeholder="Employee name..."
              autoFocus
              style={{flex:1,background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 12px",fontSize:13,outline:"none",color:"#F2EDE4"}}/>
            <Btn onClick={createCaseFromChat} disabled={!casePromptName.trim()} style={{padding:"9px 16px",fontSize:12,flexShrink:0}}>Create case</Btn>
          </div>
        </div>
      )}

      {/* ── Toast notification ── */}
      {toast&&(
        <div style={{position:"fixed",bottom:24,right:24,zIndex:3000,background:toast.type==="error"?"#2A1008":"#1C1C22",border:`1px solid ${toast.type==="error"?"#E8622A44":"#7C5CFC44"}`,borderRadius:10,padding:"14px 20px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 8px 32px rgba(0,0,0,0.4)",animation:"slideIn 0.2s ease"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:toast.type==="error"?"#E8622A":"#7C5CFC",flexShrink:0}}/>
          <span style={{fontSize:13,color:"#F2EDE4"}}>{toast.message}</span>
        </div>
      )}

      {/* ── GDPR consent modal ── */}
      {showGdpr && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{maxWidth:520,width:"100%"}}>
            <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:22,color:"#7C5CFC",marginBottom:8,fontWeight:600}}>Data &amp; privacy</div>
            <p style={{fontSize:13,color:"#888",lineHeight:1.8,marginBottom:16}}>
              Compass stores all HR data locally in your browser. No data is sent to external servers except the text you submit to the AI for processing via the Anthropic API.
            </p>
            <div style={{background:"#0D0D0F",borderRadius:8,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:1,marginBottom:10}}>WHAT IS STORED</div>
              {["Case files, meeting records, transcripts and letters — in your browser only","Company policies you upload — in your browser only","Your signature and letterhead — in your browser only","Whistleblower reports — in your browser only","AI processing: meeting text is sent to Anthropic's API to generate outputs"].map((item,i)=>(
                <div key={i} style={{display:"flex",gap:8,marginBottom:6,fontSize:12,color:"#C4BDAF"}}>
                  <span style={{color:"#7C5CFC",flexShrink:0}}>·</span><span>{item}</span>
                </div>
              ))}
            </div>
            <div style={{background:"#0D0D0F",borderRadius:8,padding:"14px 16px",marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:1,marginBottom:8}}>YOUR RIGHTS</div>
              <div style={{fontSize:12,color:"#888",lineHeight:1.7}}>You can export all your data or delete it at any time from Settings. Data is retained until you delete it. You are responsible for compliance with UK GDPR when processing employee data using this tool.</div>
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
              <div style={{fontSize:10,color:"#555",letterSpacing:1}}>{onboardStep+1} / {ONBOARD_STEPS.length}</div>
              <button onClick={()=>{setShowOnboard(false);setOnboardDone(true);lsSet("compass_onboard",true);}} style={{background:"none",border:"none",color:"#555",fontSize:12,cursor:"pointer"}}>Skip</button>
            </div>
            <div style={{height:2,background:"#2A2A35",borderRadius:1,marginBottom:20}}>
              <div style={{height:2,background:"#7C5CFC",borderRadius:1,width:`${((onboardStep+1)/ONBOARD_STEPS.length)*100}%`,transition:"width 0.3s"}}/>
            </div>
            <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:22,color:"#F2EDE4",marginBottom:10,fontWeight:600}}>{ONBOARD_STEPS[onboardStep].title}</div>
            <p style={{fontSize:14,color:"#888",lineHeight:1.8,marginBottom:24}}>{ONBOARD_STEPS[onboardStep].body}</p>
            <Btn onClick={()=>{
              if(onboardStep<ONBOARD_STEPS.length-1) setOnboardStep(s=>s+1);
              else { setShowOnboard(false); setOnboardDone(true); lsSet("compass_onboard",true); }
            }}>{ONBOARD_STEPS[onboardStep].action}</Btn>
          </Card>
        </div>
      )}

      {/* ── User switcher modal ── */}
      {showUserSwitch && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1800,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{maxWidth:440,width:"100%"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#F2EDE4",fontWeight:600}}>Switch user</div>
              <button onClick={()=>setShowUserSwitch(false)} style={{background:"none",border:"none",color:"#666",fontSize:20,cursor:"pointer"}}>✕</button>
            </div>
            {users.map(u=>(
              <button key={u.id} onClick={()=>switchUser(u)}
                style={{width:"100%",background:currentUser?.id===u.id?"#7C5CFC18":"#0D0D0F",border:"1px solid",borderColor:currentUser?.id===u.id?"#7C5CFC":"#2A2A35",borderRadius:8,padding:"12px 14px",marginBottom:8,textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,color:"#F2EDE4",fontWeight:600,marginBottom:2}}>{u.name}</div>
                  <div style={{fontSize:11,color:"#555"}}>{u.role} {u.email?"· "+u.email:""}</div>
                </div>
                {currentUser?.id===u.id&&<span style={{fontSize:11,color:"#7C5CFC",fontWeight:600}}>Active</span>}
              </button>
            ))}
            <div style={{borderTop:"1px solid #2A2A35",paddingTop:14,marginTop:6}}>
              <div style={{fontSize:11,color:"#555",marginBottom:10}}>Add team member</div>
              <UserAddForm onAdd={(name,role,email)=>{ const u=addUser(name,role,email); switchUser(u); setShowUserSwitch(false); }}/>
            </div>
          </Card>
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{background:"#0D0D0F",borderBottom:"1px solid #1C1C22",position:"sticky",top:0,zIndex:99}}>
        <div style={{maxWidth:1440,margin:"0 auto",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <button onClick={reset} style={{display:"flex",alignItems:"center",gap:10,background:"none",border:"none",padding:0,flexShrink:0}}>
            <CompassLogo size={32} />
            <span style={{fontFamily:"Inter,sans-serif",fontSize:20,fontWeight:500,color:"#7C5CFC",letterSpacing:-0.3}}>Compass</span>
          </button>

          {meetingType && (
            <div style={{display:"flex",alignItems:"center",gap:8,flex:1,justifyContent:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:"#888"}}>{meetingType.label}</span>
              {caseInfo.employee&&<span style={{background:"#7C5CFC",color:"#fff",borderRadius:12,padding:"2px 10px",fontSize:11,fontWeight:600}}>{caseInfo.employee}</span>}
              {caseInfo.date&&<span style={{color:"#555",fontSize:11}}>{caseInfo.date}</span>}
            </div>
          )}

          <nav style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
            {meetingType && [
              {s:SCREENS.PREP,l:"Prepare"},
              {s:SCREENS.RECORD,l:"Record"},
              {s:SCREENS.REVIEW,l:"Review"},
              {s:SCREENS.LETTER,l:"Letters"},
            ].map(({s,l})=>(
              <button key={s} onClick={()=>s===SCREENS.REVIEW?handleReview():setScreen(s)}
                style={{background:screen===s?"#1C1C22":"none",border:"none",color:screen===s?"#F2EDE4":"#666",padding:"5px 10px",borderRadius:6,fontSize:12,fontWeight:screen===s?600:400}}>
                {l}
              </button>
            ))}
            {!meetingType&&[
              {s:SCREENS.CASES,l:"Cases"+(cases.length?` (${cases.length})`:"")},
              {s:SCREENS.SEARCH,l:"Search"},
            ].map(({s,l})=>(
              <button key={s} onClick={()=>setScreen(s)}
                style={{background:screen===s?"#7C5CFC18":"none",border:"1px solid",borderColor:screen===s?"#7C5CFC33":"transparent",color:screen===s?"#A98FFF":"#666",padding:"5px 10px",borderRadius:6,fontSize:11,fontWeight:screen===s?600:400}}>
                {l}
              </button>
            ))}
            {dueSoon.some(d=>d.overdue)&&(
              <button onClick={()=>setScreen(SCREENS.DASHBOARD)}
                style={{background:"#2A1008",border:"1px solid #E8622A44",color:"#E8622A",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600}}>
                {dueSoon.filter(d=>d.overdue).length} overdue
              </button>
            )}
            <button onClick={()=>setShowUserSwitch(true)}
              style={{background:"#1C1C22",border:"1px solid #2A2A35",color:"#888",borderRadius:6,padding:"5px 10px",fontSize:11,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {currentUser ? currentUser.name : "Set user"}
            </button>
            <button onClick={()=>setScreen(SCREENS.SETTINGS)} style={{background:screen===SCREENS.SETTINGS?"#1C1C22":"none",border:"1px solid #2A2A35",color:"#666",borderRadius:6,padding:"5px 10px",fontSize:14}}>⚙</button>
            {meetingType&&<button onClick={reset} style={{background:"none",border:"1px solid #2A2A35",color:"#555",borderRadius:6,padding:"4px 10px",fontSize:11}}>End meeting</button>}
          </nav>
        </div>
      </header>

      {/* ── Deadline banner ── */}
      {dueSoon.some(d=>d.overdue)&&screen===SCREENS.HOME&&(
        <div style={{background:"#2A1008",borderBottom:"1px solid #E8622A33",padding:"8px 20px"}}>
          <div style={{maxWidth:1440,margin:"0 auto",display:"flex",alignItems:"center",gap:12,fontSize:12}}>
            <span style={{color:"#E8622A",fontWeight:600}}>Overdue actions:</span>
            {dueSoon.filter(d=>d.overdue).slice(0,3).map((d,i)=>(
              <span key={i} style={{color:"#C4BDAF"}}>{d.caseName} — {d.step} <span style={{color:"#E8622A"}}>({Math.abs(d.daysLeft)}d overdue)</span></span>
            ))}
            <button onClick={()=>setScreen(SCREENS.DASHBOARD)} style={{background:"none",border:"none",color:"#E8622A",fontSize:11,cursor:"pointer",marginLeft:"auto",textDecoration:"underline"}}>View all</button>
          </div>
        </div>
      )}

      {/* ══ HOME ══ */}
      {screen===SCREENS.HOME&&(()=>{
        return(
          <div style={{maxWidth:760,margin:"0 auto",padding:"80px 20px",textAlign:"center"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:20}}><CompassLogo size={52}/></div>
            <div style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:"#7C5CFC",marginBottom:12,fontWeight:600}}>UK HR Intelligence</div>
            <h1 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:"clamp(32px,5vw,56px)",fontWeight:400,color:"#F2EDE4",margin:"0 0 16px",lineHeight:1.1}}>
              Navigate every<br/><em style={{color:"#7C5CFC"}}>HR conversation.</em>
            </h1>
            <p style={{fontSize:15,color:"#666",maxWidth:420,margin:"0 auto 40px",lineHeight:1.8}}>
              AI-powered meeting records, legal risk scoring, outcome letters, and full case management.
            </p>
            <div style={{display:"flex",gap:12,justifyContent:"center",marginBottom:48,position:"relative"}}>
              <div style={{position:"relative"}}>
                <button onClick={()=>setShowPicker(p=>!p)}
                  style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"14px 28px",fontSize:15,color:"#fff",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
                  + Start meeting <span style={{fontSize:10,opacity:0.7}}>&#9660;</span>
                </button>
                {showPicker&&(
                  <div style={{position:"absolute",top:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:12,overflow:"hidden",width:280,zIndex:200,boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>
                    <button onClick={()=>{setShowPicker(false);const t={id:"catchup",label:"General meeting",mode:"quick",group:"quick"};setMeetingType(t);setTranscript([]);setPrepNotes("");setReviewOutput("");setLetterOutput("");setRiskScore(null);setNextSteps([]);setScreen(SCREENS.RECORD);}}
                      style={{width:"100%",background:"none",border:"none",borderBottom:"1px solid #2A2A35",padding:"18px 20px",textAlign:"left",cursor:"pointer"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#141418"}
                      onMouseLeave={e=>e.currentTarget.style.background="none"}>
                      <div style={{fontSize:14,color:"#F2EDE4",fontWeight:600,marginBottom:4}}>Start now</div>
                      <div style={{fontSize:12,color:"#555",lineHeight:1.5}}>Jump straight into the notepad. Compass structures everything after.</div>
                    </button>
                    <button onClick={()=>{setShowPicker(false);setMeetingType(null);setTranscript([]);setPrepNotes("");setReviewOutput("");setLetterOutput("");setRiskScore(null);setNextSteps([]);setScreen(SCREENS.PREP);}}
                      style={{width:"100%",background:"none",border:"none",padding:"18px 20px",textAlign:"left",cursor:"pointer"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#141418"}
                      onMouseLeave={e=>e.currentTarget.style.background="none"}>
                      <div style={{fontSize:14,color:"#F2EDE4",fontWeight:600,marginBottom:4}}>Prepare first</div>
                      <div style={{fontSize:12,color:"#555",lineHeight:1.5}}>Enter case details. Compass generates targeted questions and a prep pack.</div>
                    </button>
                  </div>
                )}
              </div>
              
            </div>

            {/* Ask Compass */}
            <div style={{marginBottom:32}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#7C5CFC,#A98FFF)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{color:"#fff",fontSize:14,fontWeight:700}}>C</span>
                </div>
                <div>
                  <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",fontWeight:600}}>Ask Compass</div>
                  <div style={{fontSize:11,color:"#555"}}>Your HR advisor — available anytime</div>
                </div>
              </div>

              <div style={{background:"#141418",borderRadius:12,border:"1px solid #2A2A35",overflow:"hidden"}}>
                {homeChatHistory.length>0&&(
                  <div style={{maxHeight:360,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
                    {homeChatHistory.map((m,i)=>(
                      <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",flexDirection:m.role==="user"?"row-reverse":"row"}}>
                        <div style={{width:28,height:28,borderRadius:"50%",background:m.role==="user"?"#2A2A35":"linear-gradient(135deg,#7C5CFC,#A98FFF)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                          <span style={{color:"#fff",fontSize:11,fontWeight:700}}>{m.role==="user"?"U":"C"}</span>
                        </div>
                        <div style={{maxWidth:"80%",padding:"10px 14px",borderRadius:10,background:m.role==="user"?"#2A2A35":"#1C1C22",border:m.role==="user"?"none":"1px solid #2A2A35"}}>
                          {m.role==="user"
                            ?<div style={{fontSize:13,color:"#F2EDE4",fontFamily:"Inter,sans-serif",lineHeight:1.6}}>{m.content}</div>
                            :<div style={{fontSize:13,color:"#C4BDAF",fontFamily:"Inter,sans-serif",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{m.content}</div>
                          }
                        </div>
                      </div>
                    ))}
                    {homeChatProcessing&&(
                      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                        <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#7C5CFC,#A98FFF)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <span style={{color:"#fff",fontSize:11,fontWeight:700}}>C</span>
                        </div>
                        <div style={{padding:"12px 14px",borderRadius:10,background:"#1C1C22",border:"1px solid #2A2A35"}}>
                          <span className="pu" style={{color:"#7C5CFC",fontSize:18}}>&#9679;</span>
                          <span className="pu" style={{color:"#7C5CFC",fontSize:18,animationDelay:"0.2s",margin:"0 3px"}}>&#9679;</span>
                          <span className="pu" style={{color:"#7C5CFC",fontSize:18,animationDelay:"0.4s"}}>&#9679;</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{borderTop:"1px solid #2A2A35",padding:"12px 14px",display:"flex",gap:8,alignItems:"center",background:"#0D0D0F"}}>
                  {homeAttachment&&(
                    <div style={{display:"flex",alignItems:"center",gap:6,background:"#7C5CFC18",border:"1px solid #7C5CFC33",borderRadius:6,padding:"4px 8px",marginRight:4,flexShrink:0}}>
                      <span style={{fontSize:11,color:"#A98FFF",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{homeAttachment.name}</span>
                      <button onClick={()=>setHomeAttachment(null)} style={{background:"none",border:"none",color:"#7C5CFC",fontSize:12,cursor:"pointer",padding:0,lineHeight:1}}>&#10005;</button>
                    </div>
                  )}
                  <input value={homeChatInput} onChange={e=>setHomeChatInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&(homeChatInput.trim()||homeAttachment)&&!homeChatProcessing){const msg=homeChatInput||"Please review this document and advise me.";setHomeChatInput("");askCompass(msg,homeChatHistory,setHomeChatHistory,setHomeChatProcessing);}}}
                    placeholder={homeAttachment?"Ask about the attached document...":"Ask anything about HR or employment law..."}
                    style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#F2EDE4",fontSize:13,fontFamily:"Inter,sans-serif",padding:"4px 0"}}/>
                  <label style={{cursor:"pointer",color:"#444",fontSize:16,padding:"0 4px",display:"flex",alignItems:"center"}}
                    onMouseEnter={e=>e.currentTarget.style.color="#7C5CFC"}
                    onMouseLeave={e=>e.currentTarget.style.color="#444"}>
                    &#128206;
                    <input type="file" accept=".pdf,.doc,.docx,.txt" style={{display:"none"}} onChange={async e=>{
                      const file = e.target.files[0];
                      if(!file) return;
                      try {
                        if(file.name.endsWith(".pdf")) {
                          const arr = await file.arrayBuffer();
                          const bytes = new Uint8Array(arr);
                          let b64 = "";
                          const chunkSize = 8192;
                          for(let i=0;i<bytes.length;i+=chunkSize){
                            b64 += String.fromCharCode.apply(null, bytes.subarray(i,i+chunkSize));
                          }
                          const base64 = btoa(b64);
                          setHomeAttachment({name:file.name, base64});
                        } else {
                          const text = await file.text();
                          setHomeAttachment({name:file.name, text:text.slice(0,8000)});
                        }
                      } catch(err) {
                        setHomeAttachment({name:file.name, text:"Could not read file."});
                      }
                      e.target.value = "";
                    }}/>
                  </label>
                  {homeChatHistory.length>0&&(
                    <button onClick={()=>setHomeChatHistory([])}
                      style={{background:"none",border:"none",color:"#444",fontSize:11,cursor:"pointer",fontFamily:"Inter,sans-serif",padding:"4px 8px",borderRadius:4}}
                      onMouseEnter={e=>e.currentTarget.style.color="#666"}
                      onMouseLeave={e=>e.currentTarget.style.color="#444"}>
                      Clear
                    </button>
                  )}
                  <button onClick={()=>{if((homeChatInput.trim()||homeAttachment)&&!homeChatProcessing){const msg=homeChatInput||"Please review the attached document and advise me on any HR or legal considerations.";setHomeChatInput("");askCompass(msg,homeChatHistory,setHomeChatHistory,setHomeChatProcessing);}}}
                    disabled={(!homeChatInput.trim()&&!homeAttachment)||homeChatProcessing}
                    style={{width:32,height:32,borderRadius:"50%",background:homeChatInput.trim()&&!homeChatProcessing?"#7C5CFC":"#2A2A35",border:"none",color:"#fff",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background 0.15s"}}>
                    &#8593;
                  </button>
                </div>
              </div>
            </div>
            {dueSoon.some(d=>d.overdue)&&(
              <div style={{background:"#2A1008",border:"1px solid #E8622A33",borderRadius:10,padding:"12px 18px",marginBottom:24,display:"flex",alignItems:"center",justifyContent:"space-between",textAlign:"left"}}>
                <span style={{fontSize:12,color:"#E8622A"}}>{dueSoon.filter(d=>d.overdue).length} overdue action{dueSoon.filter(d=>d.overdue).length!==1?"s":""}</span>
                <button onClick={()=>setScreen(SCREENS.CASES)} style={{background:"none",border:"none",color:"#E8622A",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>View all</button>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"left"}}>
              {[
                {s:SCREENS.CASES,l:"Cases",sub:cases.length+" saved"},
                {s:SCREENS.NEWSTARTER,l:"New starters",sub:"Onboarding"},
                {s:SCREENS.DASHBOARD,l:"Dashboard",sub:"Overview"},
                {s:SCREENS.SETTINGS,l:"Settings",sub:"Policies & more"},
              ].map(({s,l,sub})=>(
                <button key={s} onClick={()=>setScreen(s)}
                  style={{background:"#141418",border:"1px solid #2A2A35",borderRadius:8,padding:"14px",cursor:"pointer",transition:"border-color 0.15s",textAlign:"left"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC44"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="#2A2A35"}>
                  <div style={{fontSize:12,color:"#F2EDE4",fontWeight:600,marginBottom:3}}>{l}</div>
                  <div style={{fontSize:11,color:"#555"}}>{sub}</div>
                </button>
              ))}
            </div>

            <p style={{fontSize:11,color:"#333",marginTop:32}}>Compass provides AI-assisted guidance. Always verify against current UK employment law.</p>
            
          </div>
        );
      })()}


            {/* ══ PREP ══ */}
      {screen===SCREENS.PREP&&(
        <div style={{maxWidth:560,margin:"0 auto",padding:"60px 20px",textAlign:"center"}}>
          <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:"#7C5CFC",marginBottom:12,fontWeight:600}}>Prepare first</div>
          <h1 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:30,color:"#F2EDE4",margin:"0 0 8px",fontWeight:400}}>Tell Compass about this meeting</h1>
          <p style={{fontSize:14,color:"#555",margin:"0 0 32px",lineHeight:1.7}}>Compass will generate targeted questions and a prep pack.</p>

          <div style={{textAlign:"left",marginBottom:16}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Meeting type <span style={{color:"#E8622A"}}>*</span></label>
            <select value={meetingType?.id||""} onChange={e=>{const t=MEETING_TYPES.find(x=>x.id===e.target.value);setMeetingType(t);}}
              style={{width:"100%",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:8,padding:"14px 16px",fontSize:14,outline:"none",color:meetingType?"#F2EDE4":"#555",boxSizing:"border-box"}}>
              <option value="" disabled>Select meeting type...</option>
              <option disabled style={{color:"#555"}}>── ER Meetings ──</option>
              {MEETING_TYPES.filter(t=>t.mode==="er").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              <option disabled style={{color:"#555"}}>── Development ──</option>
              {MEETING_TYPES.filter(t=>t.group==="dev").map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <div style={{textAlign:"left",marginBottom:16}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Employee name <span style={{color:"#E8622A"}}>*</span></label>
            <input autoFocus placeholder="e.g. Sarah Johnson" value={caseInfo.employee}
              onChange={e=>setCaseInfo(p=>({...p,employee:e.target.value}))}
              style={{width:"100%",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:8,padding:"14px 16px",fontSize:15,outline:"none",color:"#F2EDE4",boxSizing:"border-box"}} />
          </div>

          <div style={{textAlign:"left",marginBottom:16}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Meeting date</label>
            <DateInput value={caseInfo.date} onChange={e=>setCaseInfo(p=>({...p,date:e.target.value}))} />
          </div>

          <div style={{textAlign:"left",marginBottom:16}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Your name</label>
            <input placeholder="Chair / HR manager name" value={caseInfo.manager}
              onChange={e=>setCaseInfo(p=>({...p,manager:e.target.value}))}
              style={{width:"100%",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:8,padding:"14px 16px",fontSize:15,outline:"none",color:"#F2EDE4",boxSizing:"border-box"}} />
          </div>

          <div style={{textAlign:"left",marginBottom:32}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Background <span style={{color:"#555",fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:10}}>(recommended)</span></label>
            <textarea value={caseInfo.context} onChange={e=>setCaseInfo(p=>({...p,context:e.target.value}))}
              placeholder="Previous warnings, allegations, relevant history, reasonable adjustments..."
              rows={4} style={{width:"100%",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:8,padding:"12px 16px",fontSize:14,outline:"none",color:"#F2EDE4",boxSizing:"border-box",resize:"vertical",lineHeight:1.6}}></textarea>
          </div>

          <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:16}}>
            <Btn onClick={handlePrepare} disabled={aiProcessing||!caseInfo.employee.trim()||!meetingType}
              style={{padding:"14px 28px",fontSize:15,background:"#7C5CFC",borderColor:"#E8622A"}}>
              {aiProcessing?"Building...":"Generate prep pack"}
            </Btn>
            <Btn variant="ghost" onClick={()=>{setMeetingType(null);setScreen(SCREENS.HOME);}} style={{padding:"14px 20px",fontSize:14}}>Cancel</Btn>
          </div>

          <div style={{textAlign:"left",marginBottom:24}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Supporting document <span style={{color:"#555",fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:10}}>(optional — PDF, Word or text)</span></label>
            {bgDoc?(
              <div style={{display:"flex",alignItems:"center",gap:10,background:"#1C1C22",border:"1px solid #7C5CFC33",borderRadius:8,padding:"12px 16px"}}>
                <span style={{fontSize:20}}>&#128196;</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:"#F2EDE4",fontWeight:500}}>{bgDoc.name}</div>
                  <div style={{fontSize:11,color:"#555"}}>{bgDoc.text.length} characters extracted</div>
                </div>
                <button onClick={()=>setBgDoc(null)} style={{background:"none",border:"none",color:"#555",fontSize:18,cursor:"pointer"}}>&#10005;</button>
              </div>
            ):(
              <label style={{display:"block",background:"#1C1C22",border:"1px dashed #2A2A35",borderRadius:8,padding:"20px",textAlign:"center",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC44"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="#2A2A35"}>
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
                <div style={{fontSize:13,color:"#666",marginBottom:4}}>Click to upload</div>
                <div style={{fontSize:11,color:"#444"}}>PDF, Word or text file</div>
              </label>
            )}
          </div>

          <button onClick={()=>setScreen(SCREENS.RECORD)}
            style={{background:"none",border:"none",color:"#555",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>
            Skip prep and start meeting now
          </button>

          {prepNotes&&(
            <div style={{marginTop:28,textAlign:"left",background:"#1C1C22",border:"1px solid #7C5CFC33",borderRadius:12,padding:20}}>
              <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Prep pack ready</div>
              <MDRenderer text={prepNotes}/>
              <Btn onClick={()=>setScreen(SCREENS.RECORD)} style={{marginTop:16,width:"100%"}}>Start meeting</Btn>
            </div>
          )}
        </div>
      )}

            {/* ══ RECORD ══ */}
      {screen===SCREENS.RECORD&&(
        <div style={{position:"fixed",inset:0,background:"#0D0D0F",display:"flex",flexDirection:"column",zIndex:50}}>
          {/* Minimal header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",borderBottom:"1px solid #1C1C22",flexShrink:0}}>
            <div>
              <div style={{fontSize:11,color:"#7C5CFC",fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>{meetingType?.label||"Meeting"}</div>
              <div style={{fontSize:16,fontFamily:"Playfair Display,Georgia,serif",color:"#F2EDE4"}}>{caseInfo.employee||"Notes"}</div>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              {isListening&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#E8622A"}}><span className="pu">&#9679;</span> Listening</div>}
              {isScreenCapturing&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#7C5CFC"}}><span className="pu">&#9679;</span> Capturing</div>}
              <Btn onClick={()=>{if(inputText.trim())addUtterance(inputText);handleReview();}}
                disabled={aiProcessing||(transcript.length===0&&!inputText.trim())}
                style={{padding:"9px 20px",fontSize:13}}>
                {aiProcessing?"Processing...":"End meeting"}
              </Btn>
            </div>
          </div>

          {/* Full screen notepad + live context */}
          <div style={{flex:1,display:"flex",overflow:"hidden"}}>
            <textarea
              ref={inputRef}
              value={inputText}
              style={{flex:1,background:"transparent",border:"none",padding:"32px",fontSize:15,lineHeight:1.9,outline:"none",color:"#F2EDE4",resize:"none",fontFamily:"Inter,system-ui,sans-serif"}}
              onChange={e=>{
                const val = e.target.value;
                if(!meetingStartTime && val.trim()) setMeetingStartTime(new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}));
                if(val.endsWith("\n")) {
                  const lines=val.split("\n").filter(l=>l.trim());
                  lines.forEach(line=>addUtterance(line.trim()));
                  setInputText("");
                  updateLiveContext(val);
                } else {
                  setInputText(val);
                }

              }}
              placeholder="Type your notes freely... just capture what is being said. Compass will organise everything when you end the meeting."
            ></textarea>
            {(liveContext||liveContextLoading)&&(
              <div style={{width:240,borderLeft:"1px solid #1C1C22",padding:"20px 14px",overflowY:"auto",background:"#080808",display:"flex",flexDirection:"column",gap:12,flexShrink:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:"linear-gradient(135deg,#7C5CFC,#A98FFF)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{color:"#fff",fontSize:9,fontWeight:700}}>C</span>
                  </div>
                  <div style={{fontSize:11,fontWeight:600,color:"#7C5CFC"}}>Live context</div>
                </div>
                {liveContext&&<div style={{fontSize:12,color:"#888",lineHeight:1.8,fontFamily:"Inter,sans-serif"}}>{liveContext}</div>}
                {liveContextLoading&&<div style={{fontSize:12,color:"#444"}}>Analysing...</div>}
                <button onClick={()=>setLiveContext(null)} style={{background:"none",border:"none",color:"#333",fontSize:11,cursor:"pointer",textDecoration:"underline",textAlign:"left",marginTop:"auto"}}>Dismiss</button>
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <div style={{borderTop:"1px solid #1C1C22",padding:"12px 24px",display:"flex",gap:10,alignItems:"center",background:"#0D0D0F",flexShrink:0}}>
            <button onClick={isListening?stopSpeech:startSpeech}
              style={{background:isListening?"#2A1008":"#1C1C22",border:"1px solid",borderColor:isListening?"#E8622A":"#2A2A35",borderRadius:8,padding:"8px 16px",fontSize:12,color:isListening?"#E8622A":"#888",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:16}}>{isListening?"🔴":"🎤"}</span>
              {isListening?"Stop mic":"Microphone"}
            </button>
            <button onClick={isScreenCapturing?stopScreenCapture:startScreenCapture}
              style={{background:isScreenCapturing?"#0A1A0A":"#1C1C22",border:"1px solid",borderColor:isScreenCapturing?"#7C5CFC33":"#2A2A35",borderRadius:8,padding:"8px 16px",fontSize:12,color:isScreenCapturing?"#7C5CFC":"#888",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:16}}>🖥</span>
              {isScreenCapturing?"Stop":"Screen audio"}
            </button>
            <label style={{background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:8,padding:"8px 16px",fontSize:12,color:"#888",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:16}}>📄</span>
              Import transcript
              <input ref={importFileRef} type="file" accept=".vtt,.txt,.srt" onChange={handleImportFile} style={{display:"none"}}/>
            </label>
            <div style={{marginLeft:"auto",fontSize:11,color:"#333"}}>{transcript.length>0?transcript.length+" notes logged":""}</div>
          </div>
        </div>
      )}

{/* ══ REVIEW ══ */}
      {screen===SCREENS.REVIEW&&(
        <div style={{maxWidth:1440,margin:"0 auto",padding:"28px 20px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:20,alignItems:"start"}}>
            <div>
              {/* Meeting record */}
              <Card style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"center",alignItems:"center",marginBottom:16,position:"relative"}}>
                  <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#7C5CFC",fontWeight:600,margin:0}}>Meeting Details</h3>
                  <button onClick={()=>setEditingStructured(e=>!e)} style={{background:editingStructured?"#7C5CFC":"none",border:"1px solid",borderColor:editingStructured?"#7C5CFC":"#2A2A35",borderRadius:5,padding:"3px 10px",fontSize:11,color:editingStructured?"#fff":"#888",cursor:"pointer",position:"absolute",right:0}}>{editingStructured?"Done":"Edit record"}</button>
                </div>
                {aiProcessing&&!reviewOutput&&<div style={{textAlign:"center",padding:32}}><span className="pu" style={{color:"#7C5CFC",fontSize:22}}>●</span><div style={{color:"#666",marginTop:10,fontSize:12}}>Structuring...</div></div>}
                {aiError&&(
                  <div style={{background:"#2A1010",border:"1px solid #E8622A44",borderRadius:8,padding:"14px 18px",marginBottom:14}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#E8622A",marginBottom:4}}>Error</div>
                    <div style={{fontSize:11,color:"#888",fontFamily:"JetBrains Mono,monospace"}}>{aiError}</div>
                    <Btn onClick={handleReview} style={{marginTop:10,padding:"6px 14px",fontSize:11}}>Retry</Btn>
                  </div>
                )}
                {reviewOutput&&(
                  <>
                    {(()=>{
                      const dlgMarker = reviewOutput.indexOf("## Meeting Dialogue");
                      const afterDlg = dlgMarker>-1 ? reviewOutput.indexOf("\n## ",dlgMarker+5) : -1;
                      const topSection = dlgMarker>-1 ? reviewOutput.slice(0,dlgMarker) : reviewOutput;
                      const dlgSection = dlgMarker>-1 && afterDlg>-1 ? reviewOutput.slice(dlgMarker,afterDlg) : "";
                      const bottomSection = afterDlg>-1 ? reviewOutput.slice(afterDlg) : "";
                      return (<>
{/* Top section - edit button appears next to first header */}

                        {editingStructured
                          ?<textarea value={topSection} onChange={e=>setReviewOutput(e.target.value+dlgSection+bottomSection)}
                            style={{width:"100%",minHeight:120,background:"#0D0D0F",border:"1px solid #7C5CFC33",borderRadius:8,padding:"12px",fontSize:13,lineHeight:1.8,outline:"none",color:"#F2EDE4",resize:"vertical",boxSizing:"border-box",fontFamily:"Inter,sans-serif",marginBottom:12}}></textarea>
                          :<MDRenderer text={topSection.replace("## Meeting Details","").replace("## Meeting Details\n","").trim()}/>
                        }
                        {/* Meeting Dialogue with edit button */}
                        {dlgSection&&(<>
                          <div style={{background:"#141418",border:"1px solid #2A2A35",borderRadius:8,padding:"12px 14px",margin:"16px 0 8px"}}>
                            <div style={{fontSize:11,color:"#666",marginBottom:8}}>Enter names to update dialogue initials:</div>
                            <div style={{display:"flex",gap:8}}>
                              <input value={caseInfo.manager||""} 
                                onChange={e=>setCaseInfo(p=>({...p,manager:e.target.value}))}
                                onBlur={e=>{const v=e.target.value;if(v)setReviewOutput(r=>{const lines=r.split("\n");console.log("Chair lines:",lines.filter(l=>l.includes("Chair")));return lines.map(l=>l.startsWith("- Chair:")||l.startsWith("Chair:")?l.replace(/:\s*.*/,": "+v):l).join("\n");});}}
                                placeholder="Chair / Manager name"
                                style={{flex:1,background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:13,outline:"none",color:"#F2EDE4"}}/>
                              <input value={caseInfo.employee||""}
                                onChange={e=>setCaseInfo(p=>({...p,employee:e.target.value}))}
                                onBlur={e=>{const v=e.target.value;if(v)setReviewOutput(r=>{const lines=r.split("\n");return lines.map(l=>l.startsWith("- Employee:")||l.startsWith("Employee:")?l.replace(/:\s*.*/,": "+v):l).join("\n");});}}
                                placeholder="Employee name"
                                style={{flex:1,background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:13,outline:"none",color:"#F2EDE4"}}/>
                              <button onClick={async()=>{
                                if(!caseInfo.manager||!caseInfo.employee) return;
                                const mInit=caseInfo.manager.split(" ").filter(Boolean).map(w=>w[0].toUpperCase()).join("");
                                const eInit=caseInfo.employee.split(" ").filter(Boolean).map(w=>w[0].toUpperCase()).join("");
                                const dlgStart=reviewOutput.indexOf("## Meeting Dialogue");
                                const dlgEnd=reviewOutput.indexOf("\n## ",dlgStart+5);
                                const dlgText=dlgStart>-1?reviewOutput.slice(dlgStart,dlgEnd>-1?dlgEnd:undefined):"";
                                if(!dlgText) return;
                                const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
                                  body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,stream:false,
                                    system:"You are a transcript editor. Replace initials in this dialogue. Chair="+mInit+" ("+caseInfo.manager+"), Employee="+eInit+" ("+caseInfo.employee+"). In HR meetings managers ask questions. Return ONLY the dialogue lines with corrected initials, no other text.",
                                    messages:[{role:"user",content:dlgText}]})});
                                const data=await res.json();
                                const updated=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
                                if(updated){
                                  const before=dlgStart>-1?reviewOutput.slice(0,dlgStart):"";
                                  const after=dlgEnd>-1?reviewOutput.slice(dlgEnd):"";
                                  setReviewOutput(before+"## Meeting Dialogue\n"+updated.replace("## Meeting Dialogue\n","").trim()+after);
                                }
                              }} style={{background:"#7C5CFC",border:"none",borderRadius:6,padding:"0 12px",fontSize:12,color:"#fff",cursor:"pointer",whiteSpace:"nowrap"}}>
                                Update initials
                              </button>
                            </div>
                          </div>
                          <div style={{display:"flex",justifyContent:"center",alignItems:"center",margin:"16px 0 6px",position:"relative"}}>
                            <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:15,fontWeight:600,color:"#7C5CFC",margin:0,flex:1,textAlign:"center"}}>Meeting Dialogue</h3>
                            <button onClick={()=>setEditingRecord(e=>!e)}
                              style={{background:editingRecord?"#7C5CFC":"none",border:"1px solid",borderColor:editingRecord?"#7C5CFC":"#2A2A35",borderRadius:5,padding:"3px 10px",fontSize:11,color:editingRecord?"#fff":"#888",cursor:"pointer",position:"absolute",right:0}}>
                              {editingRecord?"Done":"Edit dialogue"}
                            </button>
                          </div>
                          {editingRecord
                            ?<textarea value={dlgSection.replace("## Meeting Dialogue\n","")} onChange={e=>setReviewOutput(topSection+"## Meeting Dialogue\n"+e.target.value+bottomSection)}
                              style={{width:"100%",minHeight:200,background:"#0D0D0F",border:"1px solid #7C5CFC33",borderRadius:8,padding:"12px",fontSize:13,lineHeight:1.8,outline:"none",color:"#F2EDE4",resize:"vertical",boxSizing:"border-box",fontFamily:"Inter,sans-serif"}}></textarea>
                            :<MDRenderer text={dlgSection.replace("## Meeting Dialogue\n","")}/>
                          }
                        </>)}
                        {bottomSection&&<MDRenderer text={bottomSection}/>}
                      </>);
                    })()}
                    <div style={{display:"flex",gap:8,marginTop:20,flexWrap:"wrap"}}>
                      <Btn onClick={()=>handleLetter("outcome")}>Draft outcome letter →</Btn>
                      <Btn style={{background:"#7C5CFC",borderColor:"#7C5CFC"}} onClick={()=>{saveMeetingToCase();setScreen(SCREENS.CASES);}}>Save to case file</Btn>
                      <Btn onClick={()=>setShowSignModal(true)} style={{background:"#1C1C22",border:"1px solid #2A2A35",color:"#F2EDE4"}}>Send for signature ✉</Btn>
                      {signId&&(
                        <button onClick={async()=>{
                          const r=await fetch("/api/signing?signId="+signId);
                          const d=await r.json();
                          setSignStatus(d.status);
                        }} style={{background:"none",border:"1px solid #2A2A35",borderRadius:6,padding:"6px 12px",fontSize:12,color:"#888",cursor:"pointer"}}>
                          {signStatus==="signed"?"✓ Signed":"Check signature status"}
                        </button>
                      )}
                      <Btn variant="ghost" onClick={()=>navigator.clipboard.writeText(reviewOutput)}>Copy</Btn>
                    </div>
                  </>
                )}
              </Card>

              {/* Next steps & deadlines */}
              {nextSteps.length>0&&(
                <Card style={{marginBottom:16}}>
                  <SectionTitle>Next Steps &amp; ACAS Deadlines</SectionTitle>
                  {nextSteps.map((s,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<nextSteps.length-1?"1px solid #1C1C22":"none"}}>
                      <button onClick={()=>setNextSteps(ns=>ns.map((x,j)=>j===i?{...x,done:!x.done}:x))}
                        style={{width:18,height:18,borderRadius:4,border:"1px solid",borderColor:s.done?"#7C5CFC":"#2A2A35",background:s.done?"#7C5CFC22":"none",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {s.done&&<span style={{color:"#7C5CFC",fontSize:11}}>✓</span>}
                      </button>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,color:s.done?"#555":"#F2EDE4",textDecoration:s.done?"line-through":"none"}}>{s.step}</div>
                      </div>
                      {s.deadline&&(
                        <div style={{fontSize:11,color:"#888",fontFamily:"JetBrains Mono,monospace",flexShrink:0,textAlign:"right"}}>
                          <div style={{fontSize:9,color:"#555",marginBottom:1}}>deadline</div>
                          {s.deadline}
                        </div>
                      )}
                    </div>
                  ))}
                </Card>
              )}

              {/* Risk & Prediction */}
              <Card style={{marginBottom:16}}>
                <div style={{fontSize:10,fontWeight:600,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Legal Risk & Tribunal Prediction</div>
                {riskScore&&(()=>{
                  const rC={HIGH:"#E8622A",MEDIUM:"#D4882A",LOW:"#7C5CFC",UNKNOWN:"#888"};
                  const col=rC[riskScore.rating]||"#888";
                  return(
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingBottom:16,borderBottom:"1px solid #2A2A35"}}>
                      <div style={{width:52,height:52,borderRadius:"50%",background:col+"22",border:"2px solid "+col,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:9,fontWeight:800,color:col,letterSpacing:0.5}}>{riskScore.rating}</span>
                      </div>
                      <div style={{fontSize:12,color:"#C4BDAF",lineHeight:1.7,fontFamily:"Inter,sans-serif",flex:1}}>{riskScore.summary}</div>
                    </div>
                  );
                })()}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:11,color:"#666"}}>Tribunal outcome prediction</div>
                  <Btn onClick={runPrediction} disabled={predProcessing} style={{padding:"4px 10px",fontSize:11}}>
                    {predProcessing?"Running...":"Run prediction"}
                  </Btn>
                </div>
                {predProcessing&&<div style={{textAlign:"center",padding:20}}><span className="pu" style={{color:"#7C5CFC",fontSize:18}}>●</span></div>}
                {prediction&&<MDRenderer text={prediction}/>}
                {!prediction&&!predProcessing&&(
                  <div style={{fontSize:11,color:"#444",lineHeight:1.6}}>
                    Analyses the case against ERA 1996, ACAS Code, and comparable tribunal outcomes.
                    <div style={{fontSize:10,color:"#333",marginTop:4}}>Not legal advice — consult a qualified employment solicitor for complex cases.</div>
                  </div>
                )}
              </Card>
            </div>

            {/* Right panel */}
            <div>


              {/* Chat with Compass */}
              <Card style={{padding:0,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                <div style={{padding:"12px 16px",borderBottom:"1px solid #2A2A35",background:"#141418"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#F2EDE4",fontFamily:"Playfair Display,Georgia,serif"}}>Chat with Compass</div>
                  <div style={{fontSize:11,color:"#555",marginTop:2}}>Ask questions or refine this record</div>
                </div>
                <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:8,minHeight:200,maxHeight:360}}>
                  {chatHistory.map((m,i)=>(
                    <div key={i} style={{display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start"}}>
                      <div style={{maxWidth:"85%",padding:"9px 12px",borderRadius:10,background:m.role==="user"?"#7C5CFC":"#1C1C22",border:m.role==="user"?"none":"1px solid #2A2A35"}}>
                        {m.role==="user"
                          ?<div style={{fontSize:12,color:"#fff",fontFamily:"Inter,sans-serif"}}>{m.content}</div>
                          :<div style={{fontSize:12,color:"#C4BDAF",lineHeight:1.7,fontFamily:"Inter,sans-serif"}}>{m.content}</div>}
                      </div>
                      {m.role==="assistant"&&m.content.length>300&&(
                        <button onClick={()=>{
                          const blob=new Blob([m.content],{type:'application/msword'});
                          const url=URL.createObjectURL(blob);
                          const a=document.createElement("a");
                          a.href=url; a.download="compass-template.doc"; a.click();
                          URL.revokeObjectURL(url);
                        }} style={{marginTop:6,background:"none",border:"1px solid #7C5CFC44",borderRadius:6,padding:"4px 10px",fontSize:11,color:"#7C5CFC",cursor:"pointer"}}>
                          Download as Word
                        </button>
                      )}
                    </div>
                  ))}
                  {chatProcessing&&<div style={{padding:"9px 12px",borderRadius:10,background:"#1C1C22",border:"1px solid #2A2A35",alignSelf:"flex-start",color:"#7C5CFC",fontSize:16}}>●</div>}
                </div>
                <div style={{padding:"10px 12px",borderTop:"1px solid #2A2A35",display:"flex",gap:8,alignItems:"center"}}>
                  <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&chatInput.trim()&&!chatProcessing){
                      const msg=chatInput.trim(); setChatInput("");
                      const sys="You are Compass, a UK HR assistant. Meeting record:\n\n"+reviewOutput+"\n\nHelp refine the record, answer questions, or draft letters. Use ## for headers and - for bullets. No bold asterisks, no emoji.";
                      setChatHistory(h=>[...h,{role:"user",content:msg}]); setChatProcessing(true);
                      fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:500,stream:false,system:sys,messages:[...chatHistory,{role:"user",content:msg}]})})
                        .then(r=>r.json()).then(d=>{const reply=(d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("")||"Sorry.";setChatHistory(h=>[...h,{role:"assistant",content:reply}]);setChatProcessing(false);})
                        .catch(()=>{setChatHistory(h=>[...h,{role:"assistant",content:"Sorry, something went wrong."}]);setChatProcessing(false);});
                    }}}
                    placeholder="Ask Compass about this meeting..."
                    style={{flex:1,background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",color:"#F2EDE4",fontFamily:"Inter,sans-serif"}}/>
                  {reviewAttachment&&(
                    <div style={{display:"flex",alignItems:"center",gap:6,background:"#7C5CFC18",border:"1px solid #7C5CFC33",borderRadius:6,padding:"3px 8px",flexShrink:0}}>
                      <span style={{fontSize:11,color:"#A98FFF",maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{reviewAttachment.name}</span>
                      <button onClick={()=>setReviewAttachment(null)} style={{background:"none",border:"none",color:"#7C5CFC",fontSize:12,cursor:"pointer",padding:0}}>&#10005;</button>
                    </div>
                  )}
                  <label style={{cursor:"pointer",color:"#444",fontSize:16,display:"flex",alignItems:"center",padding:"0 2px"}}
                    onMouseEnter={e=>e.currentTarget.style.color="#7C5CFC"}
                    onMouseLeave={e=>e.currentTarget.style.color="#444"}>
                    &#128206;
                    <input type="file" accept=".pdf,.doc,.docx,.txt" style={{display:"none"}} onChange={async e=>{
                      const file=e.target.files[0]; if(!file) return;
                      try {
                        if(file.name.endsWith(".pdf")) {
                          const arr=await file.arrayBuffer();
                          const bytes=new Uint8Array(arr);
                          let b64=""; const chunk=8192;
                          for(let i=0;i<bytes.length;i+=chunk) b64+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk));
                          setReviewAttachment({name:file.name, base64:btoa(b64), type:"pdf"});
                        } else {
                          const text=await file.text();
                          setReviewAttachment({name:file.name, text:text.slice(0,4000), type:"text"});
                        }
                      } catch(err){}
                      e.target.value="";
                    }}/>
                  </label>
                  <button onClick={()=>{if((chatInput.trim()||reviewAttachment)&&!chatProcessing){
                      const msg=chatInput.trim()||"Please review the attached document in context of this meeting."; setChatInput("");
                      const sys="You are Compass, a UK HR assistant. Meeting record:\n\n"+reviewOutput+"\n\nHelp the user. No bold asterisks, no emoji.";
                      let userContent;
                      if(reviewAttachment?.base64){
                        userContent=[{type:"document",source:{type:"base64",media_type:"application/pdf",data:reviewAttachment.base64}},{type:"text",text:msg}];
                      } else if(reviewAttachment?.text){
                        userContent=msg+"\n\nAttached ("+reviewAttachment.name+"):\n"+reviewAttachment.text;
                      } else { userContent=msg; }
                      const displayMsg=reviewAttachment?"["+reviewAttachment.name+"] "+msg:msg;
                      setChatHistory(h=>[...h,{role:"user",content:displayMsg}]);
                      setChatProcessing(true); setReviewAttachment(null);
                      fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:600,stream:false,system:sys,messages:[...chatHistory,{role:"user",content:userContent}]})})
                        .then(r=>r.json()).then(d=>{const reply=(d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("")||"Sorry.";setChatHistory(h=>[...h,{role:"assistant",content:reply}]);setChatProcessing(false);})
                        .catch(()=>{setChatHistory(h=>[...h,{role:"assistant",content:"Sorry."}]);setChatProcessing(false);});
                    }}}
                    disabled={(!chatInput.trim()&&!reviewAttachment)||chatProcessing}
                    style={{background:"#7C5CFC",border:"none",borderRadius:6,padding:"0 12px",color:"#fff",fontSize:16,cursor:"pointer",opacity:((!chatInput.trim()&&!reviewAttachment)||chatProcessing)?0.4:1}}>&#8593;</button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

{/* ══ LETTERS ══ */}
      {screen===SCREENS.LETTER&&(
        <div>
          <div style={{borderBottom:"1px solid #2A2A35"}}>
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
            {aiProcessing&&!letterOutput&&<div style={{textAlign:"center",padding:50}}><span className="pu" style={{color:"#7C5CFC",fontSize:24}}>●</span><div style={{color:"#666",marginTop:10}}>Drafting...</div></div>}
            {letterOutput&&(
              <>
                {/* Sig bar */}
                <div style={{background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,color:"#666"}}>E-signature:</span>
                    {signature
                      ?<span style={{fontSize:11,color:"#7C5CFC",fontWeight:600}}>✓ {signature.type==="typed"?`"${signature.data}"`:"Drawn"}</span>
                      :<span style={{fontSize:11,color:"#555"}}>Not added — will prompt on send</span>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setShowSigPad(true)} style={{background:"none",border:"1px solid #2A2A35",borderRadius:5,padding:"3px 10px",fontSize:11,color:"#7C5CFC",cursor:"pointer"}}>{signature?"Change":"Add"}</button>
                    {signature&&<button onClick={()=>{setSignature(null);lsSet("compass_signature",null);}} style={{background:"none",border:"1px solid #2A2A35",borderRadius:5,padding:"3px 10px",fontSize:11,color:"#E8622A",cursor:"pointer"}}>Remove</button>}
                  </div>
                </div>

                <div style={{background:"#FDFAF6",borderRadius:12,padding:"36px 44px",marginBottom:16}}>
                  <MDRenderer text={letterOutput} light/>
                  {signature&&(
                    <div style={{marginTop:20,paddingTop:18,borderTop:"1px solid #E0DDD8"}}>
                      <div style={{fontSize:10,color:"#999",marginBottom:6}}>Signed:</div>
                      {signature.type==="typed"
                        ?<div style={{fontFamily:"'Brush Script MT',cursive",fontSize:30,color:"#1C1C22"}}>{signature.data}</div>
                        :<img src={signature.data} alt="Sig" style={{maxHeight:55,maxWidth:180}}/>}
                      <div style={{fontSize:11,color:"#888",marginTop:5}}>{caseInfo.manager||"HR Manager"} | {new Date().toLocaleDateString("en-GB")}</div>
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
            <h2 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Dashboard</h2>
            <p style={{fontSize:13,color:"#666",margin:"0 0 28px"}}>Overview of all HR cases and activity</p>

            {cases.length===0&&(
              <Card style={{textAlign:"center",padding:"50px 20px"}}>
                <div style={{fontSize:32,marginBottom:12}}>⬛</div>
                <div style={{fontSize:15,color:"#666",marginBottom:6}}>No data yet</div>
                <div style={{fontSize:12,color:"#444"}}>Complete your first meeting and save it to a case file to see your dashboard.</div>
              </Card>
            )}

            {cases.length>0&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  {[{l:"Total cases",v:cases.length,c:"#7C5CFC"},{l:"Open cases",v:open.length,c:"#7C5CFC"},{l:"Total meetings",v:allM.length,c:"#D4882A"},{l:"High risk",v:rC.HIGH||0,c:"#E8622A"}].map(s=>(
                    <Card key={s.l}>
                      <div style={{fontSize:30,fontWeight:700,color:s.c,fontFamily:"Inter,sans-serif"}}>{s.v}</div>
                      <div style={{fontSize:11,color:"#555",marginTop:3}}>{s.l}</div>
                    </Card>
                  ))}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:"#F2EDE4",marginBottom:14}}>Risk distribution</div>
                    {Object.entries(rC).map(([r,c])=>{
                      const total=Object.values(rC).reduce((a,b)=>a+b,0)||1;
                      return c>0?(
                        <div key={r} style={{marginBottom:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <span style={{fontSize:11,color:rColors[r],fontWeight:600}}>{r}</span>
                            <span style={{fontSize:11,color:"#555"}}>{c}</span>
                          </div>
                          <div style={{background:"#0D0D0F",borderRadius:3,height:5}}>
                            <div style={{background:rColors[r],borderRadius:3,height:5,width:`${Math.round(c/total*100)}%`}}/>
                          </div>
                        </div>
                      ):null;
                    })}
                    {Object.values(rC).every(v=>v===0)&&<div style={{fontSize:11,color:"#444"}}>No risk scores yet</div>}
                  </Card>
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:"#F2EDE4",marginBottom:14}}>Meetings by type</div>
                    {byType.length===0&&<div style={{fontSize:11,color:"#444"}}>No meetings yet</div>}
                    {byType.map(t=>(
                      <div key={t.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
                        <span style={{fontSize:11,color:"#C4BDAF"}}>{t.label}</span>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{background:"#0D0D0F",borderRadius:3,height:4,width:70}}>
                            <div style={{background:"#7C5CFC",borderRadius:3,height:4,width:(t.count/Math.max(...byType.map(x=>x.count))*70)+"px"}}/>
                          </div>
                          <span style={{fontSize:11,color:"#7C5CFC",fontWeight:600,width:14,textAlign:"right"}}>{t.count}</span>
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>

                <Card style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#F2EDE4",marginBottom:14}}>Recent meetings</div>
                  {recent.map(m=>(
                    <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #1a1a1a"}}>
                      <div>
                        <div style={{fontSize:13,color:"#F2EDE4",fontWeight:500,marginBottom:2}}>{m.employeeName}</div>
                        <div style={{fontSize:10,color:"#444"}}>{m.type} · {m.date}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        {m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN"&&<Badge color={rColors[m.riskScore.rating]}>{m.riskScore.rating}</Badge>}
                        <Btn variant="ghost" onClick={()=>setScreen(SCREENS.CASES)} style={{padding:"3px 10px",fontSize:10}}>View</Btn>
                      </div>
                    </div>
                  ))}
                </Card>

                <Card>
                  <div style={{fontSize:12,fontWeight:600,color:"#F2EDE4",marginBottom:14}}>Active cases</div>
                  {open.length===0&&<div style={{fontSize:11,color:"#444"}}>No open cases</div>}
                  {open.map(c=>{
                    const last=c.meetings[c.meetings.length-1];
                    const high=c.meetings.some(m=>m.riskScore?.rating==="HIGH");
                    return(
                      <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                            <span style={{fontSize:13,color:"#F2EDE4",fontWeight:600}}>{c.employeeName}</span>
                            {high&&<Badge color="#E8622A">HIGH RISK</Badge>}
                          </div>
                          <div style={{fontSize:10,color:"#444"}}>{c.meetings.length} meeting{c.meetings.length!==1?"s":""} · Last: {last?.type} on {last?.date}</div>
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
        <div style={{maxWidth:1100,margin:"0 auto",padding:"32px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
            <div>
              <h2 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Case files</h2>
              <p style={{fontSize:13,color:"#666",margin:0}}>All cases grouped by employee, with full meeting history and documents.</p>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn variant="ghost" onClick={()=>{setPortalCaseId(null);setScreen(SCREENS.PORTAL);}}>Employee portal</Btn>
              <Btn onClick={()=>setScreen(SCREENS.HOME)}>+ New meeting</Btn>
            </div>
          </div>

          {cases.length===0&&(
            <Card style={{textAlign:"center",padding:"50px 20px"}}>
              <div style={{fontSize:32,marginBottom:12}}></div>
              <div style={{fontSize:15,color:"#666",marginBottom:6}}>No case files yet</div>
              <div style={{fontSize:12,color:"#444"}}>After reviewing a meeting, click "Save to case file".</div>
            </Card>
          )}

          {cases.map(c=>(
            <Card key={c.id} style={{marginBottom:14,padding:0,overflow:"hidden"}}>
              <div style={{padding:"16px 20px",borderBottom:"1px solid #2A2A35",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
                    <span style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:17,color:"#F2EDE4",fontWeight:600}}>{c.employeeName}</span>
                    {c.email&&<span style={{fontSize:11,color:"#555"}}>{c.email}</span>}
                    {c.meetings.some(m=>m.riskScore?.rating==="HIGH")&&<Badge color="#E8622A">HIGH RISK</Badge>}
                  </div>
                  <div style={{fontSize:11,color:"#444"}}>{c.meetings.length} meeting{c.meetings.length!==1?"s":""} · Since {new Date(c.createdAt).toLocaleDateString("en-GB")}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <Btn variant="secondary" onClick={()=>{setCaseInfo(p=>({...p,employee:c.employeeName,email:c.email||""}));setScreen(SCREENS.HOME);}} style={{fontSize:11,padding:"5px 12px"}}>+ Add meeting</Btn>
                  <Btn variant="ghost" onClick={()=>{setPortalCaseId(c.id);setScreen(SCREENS.PORTAL);}} style={{fontSize:11,padding:"5px 12px"}}>Portal</Btn>
                  <Btn variant="danger" onClick={()=>{if(window.confirm("Delete entire case?"))saveCases(cases.filter(x=>x.id!==c.id));}} style={{fontSize:11,padding:"5px 12px"}}>Delete</Btn>
                </div>
              </div>

              {c.meetings.map((m,idx)=>(
                <div key={m.id} style={{padding:"12px 20px",borderBottom:idx<c.meetings.length-1?"1px solid #141414":"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                        <Badge>{m.type}</Badge>
                        <span style={{fontSize:12,color:"#F2EDE4"}}>{m.date}</span>
                        {m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN"&&<Badge color={{HIGH:"#E8622A",MEDIUM:"#D4882A",LOW:"#7C5CFC"}[m.riskScore.rating]}>{m.riskScore.rating}</Badge>}
                      </div>
                      <div style={{fontSize:10,color:"#444"}}>{m.transcript?.length||0} utterances · {m.participants?.length>0?m.participants.map(p=>p.name).join(", "):"HR Manager, Employee"}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {m.signId&&m.signStatus==="signed"&&<Btn variant="ghost" style={{fontSize:11,padding:"4px 8px",color:"#4CAF50"}} onClick={()=>window.open("/sign/"+m.signId,"_blank")}>View signed doc</Btn>}{m.signId&&<Btn variant="ghost" style={{fontSize:11,padding:"4px 8px",color:m.signStatus==="signed"?"#4CAF50":"#888"}} onClick={async()=>{const r=await fetch("/api/signing?signId="+m.signId);const d=await r.json();if(d.status){saveCases(cases.map(cs=>cs.id===c.id?{...cs,meetings:cs.meetings.map(x=>x.id===m.id?{...x,signStatus:d.status}:x)}:cs));}}}>{m.signStatus==="signed"?"✓ Signed":"Check signature"}</Btn>}
                    <Btn variant="secondary" onClick={()=>{setViewMeeting({...m,employeeName:c.employeeName,caseId:c.id});setViewCaseId(c.id);}} style={{fontSize:11,padding:"4px 12px"}}>View</Btn>
                    <Btn variant="danger" onClick={()=>{if(window.confirm("Delete?"))saveCases(cases.map(x=>x.id===c.id?{...x,meetings:x.meetings.filter(mm=>mm.id!==m.id)}:x).filter(x=>x.meetings.length>0));}} style={{fontSize:11,padding:"4px 10px"}}>✕</Btn>
                  </div>
                </div>
              ))}

              {/* Document vault for this case */}
              <div style={{padding:"10px 20px",background:"#141414",borderTop:"1px solid #1a1a1a"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:10,color:"#444"}}>Documents: {(vaultDocs[c.id]||[]).length} file{(vaultDocs[c.id]||[]).length!==1?"s":""}</span>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    {(vaultDocs[c.id]||[]).map(d=>(
                      <span key={d.id} style={{fontSize:10,color:"#7C5CFC",background:"#7C5CFC18",border:"1px solid #7C5CFC33",borderRadius:4,padding:"2px 8px"}}>{d.name}</span>
                    ))}
                    <input type="file" style={{display:"none"}} ref={vaultFileRef} onChange={e=>{if(e.target.files[0])addToVault(c.id,e.target.files[0]);}} />
                    <button onClick={()=>vaultFileRef.current?.click()} style={{background:"none",border:"1px dashed #2A2A35",borderRadius:5,padding:"3px 10px",fontSize:10,color:"#555",cursor:"pointer"}}>+ Add document</button>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {/* Meeting detail modal */}
          {viewMeeting&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:200,overflowY:"auto",padding:"32px 20px"}}>
              <div style={{maxWidth:860,margin:"0 auto",background:"#1C1C22",borderRadius:12,border:"1px solid #2A2A35",overflow:"hidden"}}>
                <div style={{padding:"18px 24px",borderBottom:"1px solid #2A2A35",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <Badge style={{marginBottom:6}}>{viewMeeting.type}</Badge>
                    <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#F2EDE4",marginTop:4}}>{viewMeeting.employeeName} — {viewMeeting.date}</div>
                  </div>
                  <button onClick={()=>setViewMeeting(null)} style={{background:"none",border:"none",color:"#666",fontSize:22,cursor:"pointer"}}>✕</button>
                </div>
                <div style={{padding:"20px 24px"}}>
                  {/* Tabs: record, transcript, letter, letter tracking, risk, next steps, adjustments, audit */}
                  {[
                    {label:"Record",content:viewMeeting.record},
                    {label:"Transcript",type:"transcript"},
                    {label:"Letter",content:viewMeeting.letterOutput,light:true},
                    {label:"Letter tracking",type:"tracking"},
                    {label:"Risk",type:"risk"},
                    {label:"Next Steps",type:"nextsteps"},
                    {label:"Adjustments",type:"adjustments"},
                  ].map(tab=>(
                    <details key={tab.label} style={{marginBottom:12,background:"#141418",borderRadius:8,overflow:"hidden"}}>
                      <summary style={{padding:"11px 16px",fontSize:11,fontWeight:600,color:"#7C5CFC",cursor:"pointer",letterSpacing:0.5,textTransform:"uppercase"}}>{tab.label}</summary>
                      <div style={{padding:"0 16px 16px"}}>
                        {tab.type==="transcript"&&(
                          <div style={{maxHeight:280,overflowY:"auto"}}>
                            {viewMeeting.transcript?.map((u,i)=>(
                              <div key={i} style={{marginBottom:8}}>
                                <span style={{fontSize:9,fontWeight:700,color:spColor(u.speaker),textTransform:"uppercase"}}>{u.speaker}</span>
                                <div style={{fontSize:12,color:"#F2EDE4",fontFamily:"JetBrains Mono,monospace",marginTop:2,lineHeight:1.5}}>{u.text}</div>
                              </div>
                            ))}
                            {!viewMeeting.transcript?.length&&<div style={{fontSize:12,color:"#444"}}>No transcript recorded</div>}
                          </div>
                        )}
                        {tab.type==="tracking"&&(
                          <div>
                            <div style={{fontSize:11,color:"#555",marginBottom:12,lineHeight:1.6}}>Track delivery and acknowledgement for tribunal evidence purposes.</div>
                            {["sent","delivered","acknowledged"].map(event=>{
                              const lt = viewMeeting.letterTracking||{};
                              const done = !!lt[event];
                              return(
                                <div key={event} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
                                  <div>
                                    <div style={{fontSize:12,color:done?"#F2EDE4":"#555",fontWeight:done?500:400,textTransform:"capitalize"}}>{event}</div>
                                    {done&&<div style={{fontSize:10,color:"#555",marginTop:2}}>
                                      {new Date(lt[event]).toLocaleString("en-GB")} · {lt[event+"By"]||"HR Manager"}
                                    </div>}
                                  </div>
                                  {!done?(
                                    <Btn onClick={()=>trackLetter(viewCaseId,viewMeeting.id,event)} style={{padding:"4px 12px",fontSize:11}}>
                                      Mark as {event}
                                    </Btn>
                                  ):(
                                    <span style={{fontSize:11,color:"#7C5CFC",fontWeight:600}}>✓ Recorded</span>
                                  )}
                                </div>
                              );
                            })}
                            {viewMeeting.letterOutput&&(
                              <button onClick={()=>{
                                const w=window.open("","_blank");
                                const html = '<html><head><title>Letter</title></head><body>' + viewMeeting.letterOutput.replace(/\n/g,'<br/>') + '</body></html>'; w.document.write(html);
                                w.print();
                              }}
                                style={{marginTop:14,width:"100%",background:"none",border:"1px solid #2A2A35",borderRadius:6,padding:"9px",fontSize:12,color:"#888",cursor:"pointer"}}>
                                Print letter
                              </button>
                            )}
                            {viewMeeting.nextSteps?.some(s=>s.deadline)&&(
                              <button onClick={()=>exportToCalendar(
                                `${viewMeeting.type} — ${cases.find(c=>c.id===viewCaseId)?.employeeName}`,
                                viewMeeting.nextSteps.find(s=>s.deadline)?.deadline,
                                viewMeeting.nextSteps.filter(s=>s.deadline).map(s=>s.step+" ("+s.deadline+")").join("\n")
                              )}
                                style={{marginTop:8,width:"100%",background:"none",border:"1px solid #2A2A35",borderRadius:6,padding:"9px",fontSize:12,color:"#888",cursor:"pointer"}}>
                                Add deadlines to calendar (.ics)
                              </button>
                            )}
                          </div>
                        )}
                        {tab.type==="risk"&&viewMeeting.riskScore&&(()=>{
                          const rColors={HIGH:"#E8622A",MEDIUM:"#D4882A",LOW:"#7C5CFC",UNKNOWN:"#888"};
                          const col=rColors[viewMeeting.riskScore.rating]||"#888";
                          return(
                            <div>
                              <div style={{fontSize:13,color:col,fontWeight:700,marginBottom:6}}>{viewMeeting.riskScore.rating} — {viewMeeting.riskScore.summary}</div>
                              {viewMeeting.riskScore.flags?.map((f,i)=>(
                                <div key={i} style={{marginBottom:8,paddingBottom:8,borderBottom:"1px solid #1C1C22"}}>
                                  <div style={{display:"flex",gap:8,marginBottom:3}}><Badge color={rColors[f.severity]}>{f.severity}</Badge><span style={{fontSize:10,color:"#555"}}>{f.law}</span></div>
                                  <div style={{fontSize:12,color:"#F2EDE4",fontWeight:600}}>{f.issue}</div>
                                  <div style={{fontSize:11,color:"#888",marginTop:2}}>Recommendation: {f.recommendation}</div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                        {tab.type==="nextsteps"&&(
                          <div>
                            {viewMeeting.nextSteps?.map((s,i)=>(
                              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1C1C22"}}>
                                <span style={{fontSize:12,color:s.done?"#555":"#F2EDE4",textDecoration:s.done?"line-through":"none"}}>{s.step}</span>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  {s.deadline&&<span style={{fontSize:10,color:"#666",fontFamily:"JetBrains Mono,monospace"}}>{s.deadline}</span>}
                                  {s.deadline&&<button onClick={()=>exportToCalendar(s.step,s.deadline,`${viewMeeting.type} — ${s.step}`)}
                                    style={{background:"none",border:"1px solid #2A2A35",borderRadius:4,padding:"2px 8px",fontSize:10,color:"#7C5CFC",cursor:"pointer"}}>+ Cal</button>}
                                </div>
                              </div>
                            ))}
                            {!viewMeeting.nextSteps?.length&&<div style={{fontSize:12,color:"#444"}}>No next steps recorded</div>}
                          </div>
                        )}
                        {tab.type==="adjustments"&&(
                          <div>
                            <div style={{fontSize:11,color:"#555",marginBottom:12,lineHeight:1.6}}>
                              Reasonable adjustments required under the Equality Act 2010. Log and track adjustments agreed for this employee.
                            </div>
                            {(adjustments[viewCaseId]||[]).map(a=>(
                              <div key={a.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
                                <button onClick={()=>toggleAdjustment(viewCaseId,a.id)}
                                  style={{width:18,height:18,borderRadius:4,border:"1px solid",borderColor:a.done?"#7C5CFC":"#2A2A35",background:a.done?"#7C5CFC22":"none",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                                  {a.done&&<span style={{color:"#7C5CFC",fontSize:10}}>✓</span>}
                                </button>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:12,color:a.done?"#555":"#F2EDE4",textDecoration:a.done?"line-through":"none"}}>{a.adjustment}</div>
                                  {a.review&&<div style={{fontSize:10,color:"#555",marginTop:2}}>Review: {a.review}</div>}
                                  <div style={{fontSize:10,color:"#444",marginTop:1}}>Added {new Date(a.addedAt).toLocaleDateString("en-GB")}</div>
                                </div>
                              </div>
                            ))}
                            {/* Add adjustment form */}
                            <AdjustmentForm onAdd={(adj)=>addAdjustment(viewCaseId, adj)} />
                          </div>
                        )}
                        {tab.content&&(
                          tab.light
                            ?<div style={{background:"#FDFAF6",borderRadius:6,padding:"16px 20px"}}><MDRenderer text={tab.content} light/></div>
                            :<MDRenderer text={tab.content}/>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ TEMPLATES ══ */}
      {screen===SCREENS.TEMPLATES&&(
        <div style={{maxWidth:1100,margin:"0 auto",padding:"32px 20px"}}>
          <h2 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Template library</h2>
          <p style={{fontSize:13,color:"#666",margin:"0 0 20px"}}>UK-compliant HR letter templates. Click to view and copy.</p>

          <input placeholder="Search templates..." value={templateSearch} onChange={e=>setTemplateSearch(e.target.value)}
            style={{width:"100%",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:8,padding:"10px 14px",fontSize:13,outline:"none",marginBottom:20,color:"#F2EDE4"}} />

          {["Disciplinary","Grievance","Investigation","Performance","Appeal","Welfare"].map(cat=>{
            const filtered = TEMPLATES.filter(t=>t.cat===cat&&(templateSearch===""||t.name.toLowerCase().includes(templateSearch.toLowerCase())));
            if(!filtered.length) return null;
            return(
              <div key={cat} style={{marginBottom:24}}>
                <div style={{fontSize:10,fontWeight:700,color:"#888",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{cat}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
                  {filtered.map(t=>(
                    <button key={t.id} onClick={()=>setSelectedTemplate(t)}
                      style={{background:"#1C1C22",border:"1px solid",borderColor:selectedTemplate?.id===t.id?"#7C5CFC":"#2A2A35",borderRadius:10,padding:"16px",textAlign:"left",cursor:"pointer",transition:"border-color 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC44"}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=selectedTemplate?.id===t.id?"#7C5CFC":"#2A2A35"}>
                      <Badge style={{marginBottom:8}}>{cat}</Badge>
                      <div style={{fontSize:14,color:"#F2EDE4",fontWeight:600,margin:"6px 0 4px",fontFamily:"Playfair Display,Georgia,serif"}}>{t.name}</div>
                      <div style={{fontSize:11,color:"#555"}}>Click to preview and copy →</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {selectedTemplate&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:200,overflowY:"auto",padding:"32px 20px"}}>
              <div style={{maxWidth:780,margin:"0 auto",background:"#1C1C22",borderRadius:12,border:"1px solid #2A2A35",overflow:"hidden"}}>
                <div style={{padding:"16px 24px",borderBottom:"1px solid #2A2A35",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <Badge style={{marginBottom:4}}>{selectedTemplate.cat}</Badge>
                    <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#F2EDE4",marginTop:4}}>{selectedTemplate.name}</div>
                  </div>
                  <button onClick={()=>setSelectedTemplate(null)} style={{background:"none",border:"none",color:"#666",fontSize:22,cursor:"pointer"}}>✕</button>
                </div>
                <div style={{padding:"20px 24px"}}>
                  <div style={{background:"#FDFAF6",borderRadius:8,padding:"24px 28px",marginBottom:16}}>
                    <pre style={{fontFamily:"Inter,sans-serif",fontSize:13,color:"#1C1C22",lineHeight:1.8,whiteSpace:"pre-wrap",margin:0}}>{selectedTemplate.body}</pre>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <Btn onClick={()=>{navigator.clipboard.writeText(selectedTemplate.body);setSelectedTemplate(null);}}>Copy template</Btn>
                    <Btn variant="ghost" onClick={()=>setSelectedTemplate(null)}>Close</Btn>
                  </div>
                  <div style={{marginTop:12,fontSize:11,color:"#444",lineHeight:1.6}}>Fields in [brackets] should be replaced with actual information. Always review before sending.</div>
                </div>
              </div>

              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
                {["ACAS dismissal process","Suspend on full pay?","Grievance — what next?","Investigation timescales"].map((s,i)=>(
                  <button key={i} onClick={()=>askCompass(s,homeChatHistory,setHomeChatHistory,setHomeChatProcessing)}
                    style={{background:"#141418",border:"1px solid #2A2A35",borderRadius:20,padding:"5px 12px",fontSize:11,color:"#666",cursor:"pointer",fontFamily:"Inter,sans-serif"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#7C5CFC44";e.currentTarget.style.color="#A98FFF";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="#2A2A35";e.currentTarget.style.color="#666";}}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ WHISTLEBLOWER ══ */}
      {screen===SCREENS.WHISTLE&&(
        <div style={{maxWidth:900,margin:"0 auto",padding:"32px 20px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
            {/* Submit form */}
            <div>
              <h2 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:22,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Anonymous reporting</h2>
              <p style={{fontSize:13,color:"#666",margin:"0 0 20px",lineHeight:1.6}}>Employees can submit concerns anonymously. Reports go directly to HR and are not linked to any user account.</p>

              {whistleSubmitted?(
                <Card style={{textAlign:"center",padding:"32px 20px"}}>
                  <div style={{fontSize:32,marginBottom:12}}>✓</div>
                  <div style={{fontSize:15,color:"#7C5CFC",fontWeight:600,marginBottom:6}}>Report submitted</div>
                  <div style={{fontSize:12,color:"#666",marginBottom:16}}>Your report has been received by HR. Thank you for speaking up.</div>
                  <Btn onClick={()=>{setWhistleSubmitted(false);setWhistleForm({concern:"",category:"",date:"",anonymous:true});}}>Submit another</Btn>
                </Card>
              ):(
                <Card>
                  <div style={{marginBottom:14}}>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:0.8,textTransform:"uppercase",marginBottom:6}}>Category</label>
                    <select value={whistleForm.category} onChange={e=>setWhistleForm(p=>({...p,category:e.target.value}))}
                      style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 12px",fontSize:13,color:"#F2EDE4",outline:"none"}}>
                      <option value="">Select a category...</option>
                      {["Harassment / Bullying","Discrimination","Health & Safety","Financial misconduct","Data protection breach","Management misconduct","Other"].map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:0.8,textTransform:"uppercase",marginBottom:6}}>When did this occur?</label>
                    <DateInput value={whistleForm.date} onChange={e=>setWhistleForm(p=>({...p,date:e.target.value}))} />
                  </div>
                  <div style={{marginBottom:16}}>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:0.8,textTransform:"uppercase",marginBottom:6}}>Describe your concern *</label>
                    <textarea value={whistleForm.concern} onChange={e=>setWhistleForm(p=>({...p,concern:e.target.value}))}
                      placeholder="Please describe what happened, who was involved (if you wish), and any other relevant details..."
                      rows={6}
                      style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 12px",fontSize:13,outline:"none",resize:"vertical",color:"#F2EDE4"}} ></textarea>
                  </div>
                  <div style={{background:"#0D0D0F",borderRadius:8,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:12,color:"#7C5CFC"}}></span>
                    <span style={{fontSize:11,color:"#666",lineHeight:1.5}}>This report is anonymous. No identifying information is collected or stored.</span>
                  </div>
                  <Btn onClick={()=>{
                    if(!whistleForm.concern.trim()) return;
                    const report = { id:Date.now().toString(), ...whistleForm, receivedAt:new Date().toISOString(), status:"New" };
                    saveWhistle([...whistleReports, report]);
                    setWhistleSubmitted(true);
                  }} disabled={!whistleForm.concern.trim()}>Submit report</Btn>
                </Card>
              )}
            </div>

            {/* HR view of reports */}
            <div>
              <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#F2EDE4",margin:"0 0 14px",fontWeight:600}}>Received reports <span style={{fontSize:13,color:"#555",fontWeight:400}}>({whistleReports.length})</span></h3>
              {whistleReports.length===0&&<Card style={{textAlign:"center",padding:"28px"}}><div style={{fontSize:12,color:"#444"}}>No reports received yet</div></Card>}
              {[...whistleReports].reverse().map(r=>(
                <Card key={r.id} style={{marginBottom:10,padding:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {r.category&&<Badge>{r.category}</Badge>}
                      <Badge color={r.status==="New"?"#E8622A":"#7C5CFC"}>{r.status}</Badge>
                    </div>
                    <span style={{fontSize:10,color:"#444",fontFamily:"JetBrains Mono,monospace"}}>{new Date(r.receivedAt).toLocaleDateString("en-GB")}</span>
                  </div>
                  <div style={{fontSize:12,color:"#C4BDAF",lineHeight:1.6,marginBottom:10}}>{r.concern}</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>saveWhistle(whistleReports.map(x=>x.id===r.id?{...x,status:x.status==="New"?"Under review":"Closed"}:x))}
                      style={{background:"none",border:"1px solid #2A2A35",borderRadius:5,padding:"3px 10px",fontSize:10,color:"#7C5CFC",cursor:"pointer"}}>
                      {r.status==="New"?"Mark under review":"Mark closed"}
                    </button>
                    <button onClick={()=>{if(window.confirm("Delete?"))saveWhistle(whistleReports.filter(x=>x.id!==r.id));}}
                      style={{background:"none",border:"1px solid #2A2A35",borderRadius:5,padding:"3px 10px",fontSize:10,color:"#E8622A",cursor:"pointer"}}>Delete</button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ EMPLOYEE PORTAL ══ */}
      {screen===SCREENS.PORTAL&&(()=>{
        const portalCase = portalCaseId ? cases.find(c=>c.id===portalCaseId) : null;
        return(
          <div style={{maxWidth:800,margin:"0 auto",padding:"40px 20px"}}>
            <div style={{textAlign:"center",marginBottom:32}}>
              <CompassLogo size={44}/>
              <h2 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:22,color:"#F2EDE4",margin:"14px 0 4px"}}>Employee Portal</h2>
              <p style={{fontSize:13,color:"#666"}}>View your HR correspondence and letters</p>
            </div>

            {!portalCase&&(
              <Card>
                <div style={{fontSize:13,color:"#888",marginBottom:16,fontWeight:600}}>Select an employee</div>
                {cases.length===0&&<div style={{fontSize:12,color:"#444"}}>No cases saved yet.</div>}
                {cases.map(c=>(
                  <button key={c.id} onClick={()=>setPortalCaseId(c.id)}
                    style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:8,padding:"12px 14px",marginBottom:8,textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:14,color:"#F2EDE4",fontWeight:600,marginBottom:2}}>{c.employeeName}</div>
                      <div style={{fontSize:10,color:"#444"}}>{c.meetings.filter(m=>m.letterOutput).length} letter{c.meetings.filter(m=>m.letterOutput).length!==1?"s":""} · {c.email||"No email set"}</div>
                    </div>
                    <span style={{color:"#7C5CFC",fontSize:18}}>›</span>
                  </button>
                ))}
                <div style={{marginTop:16,padding:"12px 14px",background:"#0D0D0F",borderRadius:8,border:"1px solid #2A2A35"}}>
                  <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:5}}>FUTURE UPDATE</div>
                  <div style={{fontSize:11,color:"#444",lineHeight:1.7}}>Employees will receive a private link to access their portal directly without HR needing to be present. Coming in the next release.</div>
                </div>
              </Card>
            )}

            {portalCase&&(
              <div>
                <button onClick={()=>setPortalCaseId(null)} style={{background:"none",border:"none",color:"#666",fontSize:13,cursor:"pointer",marginBottom:18,padding:0}}>← Back</button>
                <Card style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:"#7C5CFC22",border:"1px solid #7C5CFC44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#7C5CFC",fontWeight:700,flexShrink:0}}>
                      {portalCase.employeeName[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:17,color:"#F2EDE4",fontWeight:600}}>{portalCase.employeeName}</div>
                      <div style={{fontSize:11,color:"#444"}}>{portalCase.email||"No email on file"} · {portalCase.meetings.length} meeting{portalCase.meetings.length!==1?"s":""}</div>
                    </div>
                  </div>
                </Card>
                {portalCase.meetings.filter(m=>m.letterOutput).length===0&&<Card style={{textAlign:"center",padding:"28px"}}><div style={{fontSize:12,color:"#444"}}>No letters drafted for this employee yet.</div></Card>}
                {portalCase.meetings.filter(m=>m.letterOutput).map(m=>(
                  <Card key={m.id} style={{marginBottom:12,padding:0,overflow:"hidden"}}>
                    <div style={{padding:"12px 18px",borderBottom:"1px solid #2A2A35",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}><Badge>{m.type}</Badge><span style={{fontSize:12,color:"#F2EDE4"}}>{m.date}</span></div>
                      <Btn variant="ghost" onClick={()=>navigator.clipboard.writeText(m.letterOutput)} style={{fontSize:11,padding:"3px 10px"}}>Copy</Btn>
                    </div>
                    <div style={{background:"#FDFAF6",padding:"24px 28px"}}><MDRenderer text={m.letterOutput} light/></div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ SEARCH ══ */}
      {screen===SCREENS.SEARCH&&(
        <div style={{maxWidth:900,margin:"0 auto",padding:"40px 20px"}}>
          <h2 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 20px",fontWeight:600}}>Search</h2>
          <input
            autoFocus
            placeholder="Search cases, records, letters, transcripts..."
            value={searchQuery}
            onChange={e=>{setSearchQuery(e.target.value);runSearch(e.target.value);}}
            style={{width:"100%",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:8,padding:"14px 18px",fontSize:15,color:"#F2EDE4",outline:"none",marginBottom:24,boxSizing:"border-box"}} />

          {searchQuery&&searchResults.length===0&&(
            <div style={{textAlign:"center",padding:"40px 20px",color:"#444",fontSize:13}}>No results found for "{searchQuery}"</div>
          )}

          {searchResults.length>0&&(
            <div>
              <div style={{fontSize:11,color:"#555",marginBottom:12}}>{searchResults.length} result{searchResults.length!==1?"s":""}</div>
              {searchResults.map((r,i)=>{
                const typeColors={case:"#7C5CFC",record:"#D4882A",letter:"#4A6FA5",transcript:"#888"};
                return(
                  <button key={i} onClick={()=>{setViewMeeting(null);setScreen(SCREENS.CASES);}}
                    style={{width:"100%",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:8,padding:"14px 16px",marginBottom:8,textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:14,transition:"border-color 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC44"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="#2A2A35"}>
                    <div style={{width:40,height:40,borderRadius:6,background:typeColors[r.type]+"22",border:`1px solid ${typeColors[r.type]}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:9,fontWeight:700,color:typeColors[r.type],letterSpacing:0.5,textTransform:"uppercase"}}>{r.type}</span>
                    </div>
                    <div>
                      <div style={{fontSize:13,color:"#F2EDE4",fontWeight:500,marginBottom:2}}>{r.title}</div>
                      <div style={{fontSize:11,color:"#555"}}>{r.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!searchQuery&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Card style={{background:"#141418"}}>
                <div style={{fontSize:11,color:"#555",marginBottom:12,fontWeight:600,letterSpacing:0.5,textTransform:"uppercase"}}>Recent cases</div>
                {cases.slice(-5).reverse().map(c=>(
                  <div key={c.id} onClick={()=>setScreen(SCREENS.CASES)} style={{padding:"8px 0",borderBottom:"1px solid #1a1a1a",cursor:"pointer",fontSize:12,color:"#C4BDAF"}}>{c.employeeName}</div>
                ))}
                {cases.length===0&&<div style={{fontSize:12,color:"#444"}}>No cases yet</div>}
              </Card>
              <Card style={{background:"#141418"}}>
                <div style={{fontSize:11,color:"#555",marginBottom:12,fontWeight:600,letterSpacing:0.5,textTransform:"uppercase"}}>Overdue actions</div>
                {dueSoon.filter(d=>d.overdue).slice(0,5).map((d,i)=>(
                  <div key={i} style={{padding:"8px 0",borderBottom:"1px solid #1a1a1a",fontSize:12}}>
                    <div style={{color:"#E8622A",marginBottom:1}}>{d.caseName}</div>
                    <div style={{color:"#555",fontSize:10}}>{d.step} · {Math.abs(d.daysLeft)}d overdue</div>
                  </div>
                ))}
                {dueSoon.filter(d=>d.overdue).length===0&&<div style={{fontSize:12,color:"#444"}}>No overdue actions</div>}
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
                      borderColor:devStep===k?"#7C5CFC":["self","manager","summary","output"].indexOf(devStep)>i?"#7C5CFC44":"#2A2A35",
                      background:devStep===k?"#7C5CFC22":"none",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:4}}>
                      {["self","manager","summary","output"].indexOf(devStep)>i
                        ?<span style={{color:"#7C5CFC",fontSize:14}}>✓</span>
                        :<span style={{fontSize:11,color:devStep===k?"#7C5CFC":"#555",fontWeight:600}}>{i+1}</span>}
                    </div>
                    <div style={{fontSize:10,color:devStep===k?"#7C5CFC":"#444",fontWeight:devStep===k?600:400,textAlign:"center"}}>{l}</div>
                  </div>
                  {i<arr.length-1&&<div style={{width:40,height:1,background:"#2A2A35",flexShrink:0}}/>}
                </div>
              ))}
            </div>

            {/* ── STEP 1: Case info + Employee self-assessment ── */}
            {devStep==="self"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                <Card>
                  <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600,marginBottom:4}}>{s.type}</div>
                  <p style={{fontSize:12,color:"#555",margin:"0 0 18px"}}>Fill in the employee details, then the employee completes their self-assessment.</p>
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
                      <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:4}}>{f.l}{f.req&&<span style={{color:"#E8622A"}}> *</span>}</label>
                      {f.type==="date"
                        ?<DateInput value={s.caseInfo[f.k]||""} onChange={e=>setDevSession(ds=>({...ds,caseInfo:{...ds.caseInfo,[f.k]:e.target.value}}))} />
                        :<input type={f.type||"text"} placeholder={f.ph} value={s.caseInfo[f.k]||""} onChange={e=>setDevSession(ds=>({...ds,caseInfo:{...ds.caseInfo,[f.k]:e.target.value}}))}
                          style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#F2EDE4"}} />}
                    </div>
                  ))}
                </Card>

                <Card>
                  <div style={{fontSize:12,fontWeight:600,color:"#7C5CFC",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Employee self-assessment</div>
                  <p style={{fontSize:11,color:"#555",margin:"0 0 16px",lineHeight:1.6}}>The employee fills this in before the meeting. Their answers will sit alongside the manager assessment.</p>
                  {cfg?.selfAssessmentPrompts?.map((q,i)=>(
                    <div key={i} style={{marginBottom:14}}>
                      <label style={{display:"block",fontSize:12,color:"#C4BDAF",marginBottom:5,lineHeight:1.5}}>{i+1}. {q}</label>
                      <textarea value={s.selfAssessment[i]||""} onChange={e=>setDevSession(ds=>({...ds,selfAssessment:{...ds.selfAssessment,[i]:e.target.value}}))}
                        placeholder="Employee answer..." rows={2}
                        style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",resize:"vertical",color:"#F2EDE4"}} ></textarea>
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
                  <p style={{fontSize:11,color:"#555",margin:"0 0 16px",lineHeight:1.6}}>Complete your assessment of {s.caseInfo.employee||"the employee"}. Be specific and evidence-based.</p>

                  {isAppraisal&&(
                    <div style={{marginBottom:16}}>
                      <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Overall rating</label>
                      <div style={{display:"flex",gap:8}}>
                        {["1","2","3","4","5"].map(r=>(
                          <button key={r} onClick={()=>setDevSession(ds=>({...ds,rating:r}))}
                            style={{flex:1,padding:"8px 4px",borderRadius:6,border:"1px solid",borderColor:s.rating===r?"#7C5CFC":"#2A2A35",
                              background:s.rating===r?"#7C5CFC22":"#0D0D0F",color:s.rating===r?"#A98FFF":"#555",fontSize:13,fontWeight:s.rating===r?700:400,cursor:"pointer"}}>
                            {r}
                          </button>
                        ))}
                      </div>
                      <div style={{fontSize:10,color:"#444",marginTop:6}}>1=Below expectations · 3=Meets · 5=Outstanding</div>
                    </div>
                  )}

                  {cfg?.managerPrompts?.map((q,i)=>(
                    <div key={i} style={{marginBottom:14}}>
                      <label style={{display:"block",fontSize:12,color:"#C4BDAF",marginBottom:5,lineHeight:1.5}}>{i+1}. {q}</label>
                      <textarea value={s.managerAssessment[i]||""} onChange={e=>setDevSession(ds=>({...ds,managerAssessment:{...ds.managerAssessment,[i]:e.target.value}}))}
                        placeholder="Your assessment..." rows={2}
                        style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",resize:"vertical",color:"#F2EDE4"}} ></textarea>
                    </div>
                  ))}

                  <div style={{marginBottom:14}}>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Agreed outcome</label>
                    <select value={s.outcome} onChange={e=>setDevSession(ds=>({...ds,outcome:e.target.value}))}
                      style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 12px",fontSize:13,color:"#F2EDE4",outline:"none"}}>
                      <option value="">Select outcome...</option>
                      {cfg?.outcomeOptions?.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div style={{marginBottom:16}}>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Development plan / actions</label>
                    <textarea value={s.devPlan||""} onChange={e=>setDevSession(ds=>({...ds,devPlan:e.target.value}))}
                      placeholder="Training agreed, coaching, support, resources..." rows={3}
                      style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:12,outline:"none",resize:"vertical",color:"#F2EDE4"}} ></textarea>
                  </div>

                  <div style={{display:"flex",gap:8}}>
                    <Btn onClick={()=>setDevStep("summary")} style={{background:"#7C5CFC",border:"none"}}>Continue →</Btn>
                    <Btn variant="ghost" onClick={()=>setDevStep("self")}>← Back</Btn>
                  </div>
                </Card>

                {/* Objectives panel */}
                <Card style={{background:"#141418"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#7C5CFC",textTransform:"uppercase",letterSpacing:0.5}}>Objectives &amp; ratings</div>
                    <Btn onClick={()=>generateSmartObjectives(s.caseInfo.reviewPeriod)} disabled={devAiProcessing} style={{padding:"4px 12px",fontSize:11,background:"#7C5CFC",border:"none"}}>
                      {devAiProcessing?"...":"AI suggest"}
                    </Btn>
                  </div>
                  {s.objectives.map((obj,i)=>(
                    <div key={i} style={{background:"#0D0D0F",border:"1px solid #1C1C22",borderRadius:8,padding:"12px 14px",marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,color:"#F2EDE4",fontWeight:600,marginBottom:2}}>{obj.label}</div>
                          {obj.desc&&<div style={{fontSize:11,color:"#555"}}>{obj.desc}</div>}
                          {obj.measure&&<div style={{fontSize:10,color:"#444",marginTop:2}}>Measure: {obj.measure}</div>}
                        </div>
                        <button onClick={()=>setDevSession(ds=>({...ds,objectives:ds.objectives.filter((_,j)=>j!==i)}))}
                          style={{background:"none",border:"none",color:"#555",fontSize:14,cursor:"pointer",marginLeft:8}}>✕</button>
                      </div>
                      {/* Rating */}
                      <div style={{display:"flex",gap:4,marginBottom:8}}>
                        {[1,2,3,4,5].map(r=>(
                          <button key={r} onClick={()=>setDevSession(ds=>({...ds,objectives:ds.objectives.map((x,j)=>j===i?{...x,rating:r}:x)}))}
                            style={{width:28,height:28,borderRadius:4,border:"1px solid",borderColor:obj.rating>=r?"#7C5CFC":"#2A2A35",background:obj.rating>=r?"#7C5CFC22":"none",color:obj.rating>=r?"#7C5CFC":"#555",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                            {r}
                          </button>
                        ))}
                        <span style={{fontSize:10,color:"#444",lineHeight:"28px",marginLeft:6}}>{["","Below","Developing","Meeting","Exceeding","Exceptional"][obj.rating]}</span>
                      </div>
                      <input value={obj.note||""} onChange={e=>setDevSession(ds=>({...ds,objectives:ds.objectives.map((x,j)=>j===i?{...x,note:e.target.value}:x)}))}
                        placeholder="Notes on progress..."
                        style={{width:"100%",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:5,padding:"6px 10px",fontSize:11,outline:"none",color:"#F2EDE4"}} />
                    </div>
                  ))}
                  <button onClick={()=>setDevSession(ds=>({...ds,objectives:[...ds.objectives,{label:"New objective",desc:"",rating:3,note:""}]}))}
                    style={{width:"100%",background:"none",border:"1px dashed #2A2A35",borderRadius:7,padding:"9px",fontSize:12,color:"#555",cursor:"pointer"}}>
                    + Add objective
                  </button>

                  {/* Self-assessment reference */}
                  {Object.keys(s.selfAssessment).length>0&&(
                    <details style={{marginTop:14}}>
                      <summary style={{fontSize:11,color:"#7C5CFC",cursor:"pointer",fontWeight:600}}>View employee self-assessment</summary>
                      <div style={{marginTop:10}}>
                        {cfg?.selfAssessmentPrompts?.map((q,i)=>s.selfAssessment[i]?(
                          <div key={i} style={{marginBottom:10}}>
                            <div style={{fontSize:10,color:"#555",marginBottom:3}}>{q}</div>
                            <div style={{fontSize:12,color:"#C4BDAF",background:"#0D0D0F",borderRadius:5,padding:"7px 10px"}}>{s.selfAssessment[i]}</div>
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
                    <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600}}>{s.type} — Summary</div>
                    <Btn onClick={generateDevSummary} disabled={devAiProcessing} style={{background:"#7C5CFC",border:"none",padding:"7px 16px",fontSize:12}}>
                      {devAiProcessing?"Generating...":"Generate AI summary"}
                    </Btn>
                  </div>
                  {devAiProcessing&&!devSummary&&<div style={{textAlign:"center",padding:32}}><span className="pu" style={{color:"#7C5CFC",fontSize:22}}>●</span><div style={{color:"#555",marginTop:10,fontSize:12}}>Building your summary...</div></div>}
                  {devSummary&&<MDRenderer text={devSummary}/>}
                  {!devSummary&&!devAiProcessing&&(
                    <div style={{background:"#0D0D0F",borderRadius:8,padding:20,textAlign:"center"}}>
                      <div style={{fontSize:13,color:"#555",marginBottom:6}}>Click "Generate AI summary" to produce a structured meeting record</div>
                      <div style={{fontSize:11,color:"#444"}}>Combines self-assessment, manager feedback, and objectives into a professional document</div>
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
                  <Card style={{background:"#141418"}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#7C5CFC",letterSpacing:1,marginBottom:12}}>OBJECTIVES SUMMARY</div>
                    {s.objectives.map((obj,i)=>{
                      const rColors=["","#7C5CFC","#7C5CFC","#7C5CFC","#7C5CFC","#7C5CFC"]; const _ignore=["","#E8622A","#D4882A","#888","#7C5CFC","#7C5CFC"];
                      return(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #1a1a1a"}}>
                          <span style={{fontSize:12,color:"#C4BDAF"}}>{obj.label}</span>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            {[1,2,3,4,5].map(r=><div key={r} style={{width:8,height:8,borderRadius:"50%",background:obj.rating>=r?rColors[obj.rating]:"#2A2A35"}}/>)}
                            <span style={{fontSize:10,color:rColors[obj.rating],marginLeft:4,fontWeight:600}}>{obj.rating}/5</span>
                          </div>
                        </div>
                      );
                    })}
                  </Card>
                  <Card style={{background:"#141418"}}>
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
                  <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#7C5CFC",fontWeight:600}}>Outcome document</div>
                  <Btn onClick={generateDevLetter} disabled={devAiProcessing} style={{background:"#7C5CFC",border:"none"}}>
                    {devAiProcessing?"Generating...":"Generate letter"}
                  </Btn>
                </div>

                {devAiProcessing&&!devLetter&&<div style={{textAlign:"center",padding:40}}><span className="pu" style={{color:"#7C5CFC",fontSize:22}}>●</span></div>}
                {devLetter&&(
                  <>
                    <div style={{background:"#FDFAF6",borderRadius:12,padding:"36px 44px",marginBottom:16}}>
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
                    <div style={{fontSize:13,color:"#555",marginBottom:8}}>Click "Generate letter" to draft the outcome document</div>
                    <div style={{fontSize:11,color:"#444"}}>Available: {Object.values(DEV_TEMPLATES.filter(t=>t.cat.toLowerCase().includes(s.type.split(" ")[0].toLowerCase()))).map(t=>t.name).join(", ")||"outcome letter"}</div>
                  </Card>
                )}

                {/* Template alternatives */}
                <div style={{marginTop:20}}>
                  <div style={{fontSize:10,color:"#444",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Or use a template</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
                    {DEV_TEMPLATES.map(t=>(
                      <button key={t.id} onClick={()=>{navigator.clipboard.writeText(t.body);}}
                        style={{background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:8,padding:"12px 14px",textAlign:"left",cursor:"pointer"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC44"}
                        onMouseLeave={e=>e.currentTarget.style.borderColor="#2A2A35"}>
                        <div style={{fontSize:11,color:"#7C5CFC",fontWeight:600,marginBottom:3}}>{t.cat}</div>
                        <div style={{fontSize:12,color:"#F2EDE4"}}>{t.name}</div>
                        <div style={{fontSize:10,color:"#555",marginTop:3}}>Click to copy →</div>
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
                <h2 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>New starter onboarding</h2>
                <p style={{fontSize:13,color:"#555",margin:0}}>AI-customised induction journeys. Track every task from offer accepted to end of probation.</p>
              </div>
              <div style={{display:"flex",gap:8}}>
                {activeStarter&&<Btn variant="ghost" onClick={()=>{setActiveStarter(null);setStarterView("list");}}>← All starters</Btn>}
                {!activeStarter&&<Btn onClick={()=>setStarterView(starterView==="list"?"new":"list")}>{starterView==="list"?"+ Add starter":"Cancel"}</Btn>}
              </div>
            </div>

            {/* Add new starter form */}
            {starterView==="new"&&!activeStarter&&(
              <Card style={{marginBottom:24}}>
                <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#F2EDE4",margin:"0 0 16px",fontWeight:600}}>New starter details</h3>
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
                      <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>{f.l}{f.req&&<span style={{color:"#E8622A"}}> *</span>}</label>
                      {f.type==="date"
                        ?<DateInput value={newStarterForm[f.k]||""} onChange={e=>setNewStarterForm(p=>({...p,[f.k]:e.target.value}))} />
                        :<input type={f.type||"text"} placeholder={f.ph} value={newStarterForm[f.k]||""} onChange={e=>setNewStarterForm(p=>({...p,[f.k]:e.target.value}))}
                          style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 12px",fontSize:13,outline:"none",color:"#F2EDE4",boxSizing:"border-box"}} />}
                    </div>
                  ))}
                </div>
                <div style={{marginBottom:16}}>
                  <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Onboarding template</label>
                  <select value={newStarterForm.templateId} onChange={e=>setNewStarterForm(p=>({...p,templateId:e.target.value}))}
                    style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 12px",fontSize:13,color:"#F2EDE4",outline:"none"}}>
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
                    <div style={{fontSize:32,marginBottom:12,color:"#2A2A35"}}>—</div>
                    <div style={{fontSize:15,color:"#555",marginBottom:6}}>No starters yet</div>
                    <div style={{fontSize:12,color:"#444",marginBottom:20}}>Create an onboarding journey for each new hire.</div>
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
                        style={{background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:10,padding:"18px",textAlign:"left",cursor:"pointer",transition:"border-color 0.15s"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC"}
                        onMouseLeave={e=>e.currentTarget.style.borderColor="#2A2A35"}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                          <div>
                            <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",fontWeight:600,marginBottom:2}}>{s.name}</div>
                            <div style={{fontSize:11,color:"#555"}}>{s.role}{s.department?" · "+s.department:""}</div>
                          </div>
                          {overdueTasks.length>0&&<Badge color="#E8622A">{overdueTasks.length} overdue</Badge>}
                        </div>
                        <div style={{fontSize:11,color:"#555",marginBottom:12}}>
                          Start: {new Date(s.startDate).toLocaleDateString("en-GB")} · Manager: {s.manager||"Not set"}
                        </div>
                        <div style={{background:"#0D0D0F",borderRadius:4,height:4,marginBottom:6}}>
                          <div style={{background:"#7C5CFC",borderRadius:4,height:4,width:pct+"%",transition:"width 0.3s"}}/>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#555"}}>
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
                    <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",fontWeight:600,marginBottom:4}}>{activeStarter.name}</div>
                    <div style={{fontSize:12,color:"#555",marginBottom:12}}>{activeStarter.role}{activeStarter.department?" · "+activeStarter.department:""}</div>
                    <div style={{fontSize:11,color:"#555",marginBottom:3}}>Start date: {new Date(activeStarter.startDate).toLocaleDateString("en-GB")}</div>
                    <div style={{fontSize:11,color:"#555",marginBottom:12}}>Manager: {activeStarter.manager||"Not set"}</div>
                    <div style={{background:"#0D0D0F",borderRadius:4,height:6,marginBottom:6}}>
                      <div style={{background:"#7C5CFC",borderRadius:4,height:6,width:pct+"%",transition:"width 0.5s"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#555",marginBottom:14}}>
                      <span>{completedCount}/{totalCount} complete</span>
                      <span style={{color:pct===100?"#7C5CFC":"#555",fontWeight:600}}>{pct}%</span>
                    </div>
                    <Btn onClick={()=>aiCustomiseChecklist(activeStarter)} disabled={starterAiProcessing} style={{width:"100%",fontSize:12,padding:"9px"}}>
                      {starterAiProcessing?"Customising...":"AI customise for role"}
                    </Btn>
                    {activeStarter.aiCustomised&&<div style={{fontSize:10,color:"#7C5CFC",marginTop:6,textAlign:"center"}}>AI tasks added</div>}
                  </Card>
                  {/* Owner legend */}
                  <Card style={{background:"#141418",padding:14}}>
                    <div style={{fontSize:10,color:"#555",fontWeight:700,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Task owners</div>
                    {Object.entries(ownerColors).map(([owner,color])=>(
                      <div key={owner} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0}}/>
                        <span style={{fontSize:11,color:"#555"}}>{owner}</span>
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
                            <span style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:15,color:"#F2EDE4",fontWeight:600}}>{phase.label}</span>
                            {phaseOverdue.length>0&&<Badge color="#E8622A">{phaseOverdue.length} overdue</Badge>}
                          </div>
                          <span style={{fontSize:11,color:"#555"}}>{phaseDone}/{phase.tasks.length}</span>
                        </div>
                        {phase.tasks.map(task=>{
                          const ownerColor = ownerColors[task.owner]||"#555";
                          const isOverdue = !task.done&&task.dueDate&&new Date(task.dueDate.split("/").reverse().join("-"))<new Date();
                          return(
                            <div key={task.id} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:"1px solid #1a1a1a",alignItems:"flex-start"}}>
                              <button onClick={()=>toggleStarterTask(activeStarter.id,task.id)}
                                style={{width:18,height:18,borderRadius:4,border:"1px solid",borderColor:task.done?"#7C5CFC":"#2A2A35",background:task.done?"#7C5CFC":"none",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                                {task.done&&<span style={{color:"#fff",fontSize:10}}>✓</span>}
                              </button>
                              <div style={{flex:1}}>
                                <div style={{fontSize:13,color:task.done?"#555":"#F2EDE4",textDecoration:task.done?"line-through":"none",marginBottom:3}}>{task.task}</div>
                                <div style={{display:"flex",alignItems:"center",gap:10}}>
                                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                                    <div style={{width:6,height:6,borderRadius:"50%",background:ownerColor}}/>
                                    <span style={{fontSize:10,color:"#555"}}>{task.owner}</span>
                                  </div>
                                  {task.dueDate&&<span style={{fontSize:10,color:isOverdue?"#E8622A":"#444",fontFamily:"JetBrains Mono,monospace"}}>{task.dueDate}{isOverdue?" (overdue)":""}</span>}
                                  {task.done&&task.doneAt&&<span style={{fontSize:10,color:"#7C5CFC"}}>Done {new Date(task.doneAt).toLocaleDateString("en-GB")}</span>}
                                </div>
                                {task.note&&<div style={{fontSize:11,color:"#888",marginTop:4,fontStyle:"italic"}}>{task.note}</div>}
                              </div>
                              <input placeholder="Add note..." value={task.note||""} onChange={e=>updateStarterTaskNote(activeStarter.id,task.id,e.target.value)}
                                style={{background:"none",border:"none",borderBottom:"1px solid #2A2A35",color:"#555",fontSize:11,outline:"none",width:140,padding:"2px 4px"}}/>
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
              <h2 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>ER Analytics</h2>
              <p style={{fontSize:13,color:"#555",margin:0}}>Employee relations case patterns, trends, and risk intelligence.</p>
            </div>

            {cases.length<2&&(
              <Card style={{textAlign:"center",padding:"50px 20px"}}>
                <div style={{fontSize:15,color:"#555",marginBottom:6}}>Not enough data yet</div>
                <div style={{fontSize:12,color:"#444"}}>Analytics become meaningful once you have 3+ cases saved. Keep using Compass and check back.</div>
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
                      <div style={{fontSize:10,color:"#555"}}>{s.l}</div>
                    </Card>
                  ))}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                  {/* Case type breakdown */}
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:"#F2EDE4",marginBottom:14}}>Case type breakdown</div>
                    {Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([type,count])=>{
                      const maxCount = Math.max(...Object.values(typeCounts));
                      return(
                        <div key={type} style={{marginBottom:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                            <span style={{fontSize:12,color:"#C4BDAF"}}>{type}</span>
                            <span style={{fontSize:12,color:"#7C5CFC",fontWeight:600}}>{count}</span>
                          </div>
                          <div style={{background:"#0D0D0F",borderRadius:3,height:5}}>
                            <div style={{background:"#7C5CFC",borderRadius:3,height:5,width:`${Math.round(count/maxCount*100)}%`}}/>
                          </div>
                        </div>
                      );
                    })}
                  </Card>

                  {/* Managers in cases */}
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:"#F2EDE4",marginBottom:14}}>Managers by case involvement</div>
                    {managerList.length===0&&<div style={{fontSize:12,color:"#444"}}>No manager data yet — add manager names when creating meetings</div>}
                    {managerList.map(([manager,count],i)=>(
                      <div key={manager} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1a1a1a"}}>
                        <div>
                          <div style={{fontSize:12,color:"#F2EDE4"}}>{manager}</div>
                          <div style={{fontSize:10,color:"#555"}}>{count} meeting{count!==1?"s":""}</div>
                        </div>
                        {count>=3&&<Badge color="#E8622A">High involvement</Badge>}
                        {count===2&&<Badge color="#D4882A">Repeat</Badge>}
                      </div>
                    ))}
                    {managerList.length>0&&managerList.some(([,c])=>c>=3)&&(
                      <div style={{marginTop:12,padding:"10px 12px",background:"#2A1008",borderRadius:6,border:"1px solid #E8622A33"}}>
                        <div style={{fontSize:11,color:"#E8622A",fontWeight:600,marginBottom:3}}>Pattern alert</div>
                        <div style={{fontSize:11,color:"#888"}}>One or more managers appear in 3+ ER cases. Consider investigating management practice.</div>
                      </div>
                    )}
                  </Card>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                  {/* Risk trend by month */}
                  <Card>
                    <div style={{fontSize:12,fontWeight:600,color:"#F2EDE4",marginBottom:14}}>Risk profile over time</div>
                    {months.length===0&&<div style={{fontSize:12,color:"#444"}}>No risk data yet — complete meeting reviews to see trends</div>}
                    {months.map(month=>{
                      const data = riskByMonth[month];
                      const total = data.HIGH+data.MEDIUM+data.LOW;
                      return(
                        <div key={month} style={{marginBottom:12}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                            <span style={{fontSize:11,color:"#888"}}>{month}</span>
                            <div style={{display:"flex",gap:8}}>
                              {data.HIGH>0&&<span style={{fontSize:10,color:"#E8622A"}}>{data.HIGH}H</span>}
                              {data.MEDIUM>0&&<span style={{fontSize:10,color:"#D4882A"}}>{data.MEDIUM}M</span>}
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
                    <div style={{fontSize:12,fontWeight:600,color:"#F2EDE4",marginBottom:6}}>Repeat ER cases</div>
                    <div style={{fontSize:11,color:"#555",marginBottom:14}}>Employees with 2 or more formal meetings</div>
                    {repeatCases.length===0&&<div style={{fontSize:12,color:"#444"}}>No repeat cases — a positive sign</div>}
                    {repeatCases.map(c=>{
                      const formalCount = c.meetings.filter(m=>MEETING_TYPES.find(t=>t.label===m.type&&t.group==="formal")).length;
                      const highRisk = c.meetings.some(m=>m.riskScore?.rating==="HIGH");
                      return(
                        <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid #1a1a1a"}}>
                          <div>
                            <div style={{fontSize:13,color:"#F2EDE4",fontWeight:500,marginBottom:1}}>{c.employeeName}</div>
                            <div style={{fontSize:10,color:"#555"}}>{formalCount} formal meetings</div>
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
                    <div style={{fontSize:12,fontWeight:600,color:"#F2EDE4",marginBottom:6}}>Case resolution times</div>
                    <div style={{fontSize:11,color:"#555",marginBottom:14}}>Days from first to last meeting per case · Average: {avgResolution} days</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                      {resolutionTimes.sort((a,b)=>b.days-a.days).map(r=>(
                        <div key={r.name} style={{background:"#0D0D0F",borderRadius:7,padding:"10px 14px",minWidth:140}}>
                          <div style={{fontSize:12,color:"#F2EDE4",fontWeight:500,marginBottom:3}}>{r.name}</div>
                          <div style={{fontSize:20,color:r.days>avgResolution*1.5?"#E8622A":"#7C5CFC",fontWeight:700,fontFamily:"Inter,sans-serif"}}>{r.days}<span style={{fontSize:11,color:"#555",fontWeight:400}}>d</span></div>
                          <div style={{fontSize:10,color:"#444"}}>{r.meetings} meetings</div>
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
                <h2 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Redundancy &amp; consultation</h2>
                <p style={{fontSize:13,color:"#555",margin:0}}>Individual and collective redundancy processes. Legally guided, document-ready.</p>
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
                    <div style={{fontSize:15,color:"#555",marginBottom:6}}>No redundancy cases</div>
                    <div style={{fontSize:12,color:"#444",marginBottom:20}}>Start a new individual or collective redundancy process.</div>
                  </Card>
                )}
                {redundancyCases.map(r=>(
                  <button key={r.id} onClick={()=>{setActiveRedundancy(r);setRedundancyStep(r.status||"pool");setRedundancyAiOutput("");}}
                    style={{width:"100%",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:10,padding:"16px 20px",textAlign:"left",marginBottom:10,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"border-color 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="#2A2A35"}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                        <span style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:15,color:"#F2EDE4",fontWeight:600}}>{r.reason}</span>
                        <Badge color={r.type==="collective"?"#E8622A":"#7C5CFC"}>{r.type}</Badge>
                      </div>
                      <div style={{fontSize:11,color:"#555"}}>{r.atRiskEmployees.length} at-risk · Created {new Date(r.createdAt).toLocaleDateString("en-GB")} · {r.createdBy}</div>
                    </div>
                    <Badge color={r.status==="complete"?"#7C5CFC":"#D4882A"}>{r.status||"setup"}</Badge>
                  </button>
                ))}

                {/* New case form */}
                <Card>
                  <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",margin:"0 0 14px",fontWeight:600}}>Start new redundancy process</h3>
                  <div style={{marginBottom:14}}>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:6}}>Process type</label>
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
                          style={{background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:8,padding:"16px",textAlign:"left",cursor:"pointer",transition:"border-color 0.15s"}}
                          onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC"}
                          onMouseLeave={e=>e.currentTarget.style.borderColor="#2A2A35"}>
                          <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:14,color:"#F2EDE4",fontWeight:600,marginBottom:6}}>{opt.title}</div>
                          <div style={{fontSize:11,color:"#555",lineHeight:1.6}}>{opt.sub}</div>
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
                <div style={{display:"flex",gap:0,marginBottom:24,background:"#1C1C22",borderRadius:8,overflow:"hidden",border:"1px solid #2A2A35"}}>
                  {steps.map((s,i)=>(
                    <button key={s} onClick={()=>setRedundancyStep(s)}
                      style={{flex:1,padding:"10px 8px",background:redundancyStep===s?"#7C5CFC18":"none",border:"none",borderRight:i<steps.length-1?"1px solid #2A2A35":"none",color:redundancyStep===s?"#A98FFF":"#555",fontSize:12,fontWeight:redundancyStep===s?600:400,cursor:"pointer"}}>
                      {stepLabels[s]}
                    </button>
                  ))}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:20,alignItems:"start"}}>
                  <div>
                    {/* SETUP STEP */}
                    {redundancyStep==="setup"&&(
                      <Card>
                        <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#7C5CFC",margin:"0 0 14px",fontWeight:600}}>Case details</h3>
                        <div style={{background:"#0D0D0F",borderRadius:8,padding:"14px 16px",marginBottom:16}}>
                          <div style={{fontSize:11,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:8}}>CASE SUMMARY</div>
                          <div style={{fontSize:13,color:"#F2EDE4",marginBottom:4}}><span style={{color:"#555"}}>Type:</span> {activeRedundancy.type} redundancy</div>
                          <div style={{fontSize:13,color:"#F2EDE4",marginBottom:4}}><span style={{color:"#555"}}>Reason:</span> {activeRedundancy.reason}</div>
                          <div style={{fontSize:13,color:"#F2EDE4",marginBottom:4}}><span style={{color:"#555"}}>Pool:</span> {activeRedundancy.poolDescription}</div>
                          <div style={{fontSize:13,color:"#F2EDE4"}}><span style={{color:"#555"}}>Created:</span> {new Date(activeRedundancy.createdAt).toLocaleDateString("en-GB")} by {activeRedundancy.createdBy}</div>
                        </div>

                        {activeRedundancy.type==="collective"&&(
                          <div style={{marginBottom:16}}>
                            <div style={{fontSize:11,color:"#E8622A",fontWeight:700,letterSpacing:1,marginBottom:10}}>COLLECTIVE CONSULTATION REQUIREMENTS</div>
                            {[
                              {label:"Number of redundancies",k:"count",type:"number",ph:"e.g. 25"},
                              {label:"HR1 form submitted to BEIS",k:"hrOneSubmitted",type:"checkbox"},
                              {label:"Employee representatives elected",k:"repElected",type:"checkbox"},
                              {label:"Consultation start date",k:"consultationStartDate",type:"date"},
                            ].map(f=>(
                              <div key={f.k} style={{marginBottom:10}}>
                                <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:4}}>{f.label}</label>
                                {f.type==="checkbox"
                                  ?<input type="checkbox" checked={activeRedundancy.collectiveInfo?.[f.k]||false}
                                    onChange={e=>updateRedundancyCase({collectiveInfo:{...activeRedundancy.collectiveInfo,[f.k]:e.target.checked}})}
                                    style={{accentColor:"#7C5CFC",width:16,height:16}} />
                                  :<input type={f.type||"text"} placeholder={f.ph} value={activeRedundancy.collectiveInfo?.[f.k]||""}
                                    onChange={e=>updateRedundancyCase({collectiveInfo:{...activeRedundancy.collectiveInfo,[f.k]:e.target.value}})}
                                    style={{background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#F2EDE4",outline:"none",width:"100%",boxSizing:"border-box"}} />}
                              </div>
                            ))}
                            <div style={{background:"#2A1008",borderRadius:7,padding:"10px 14px",border:"1px solid #E8622A33"}}>
                              <div style={{fontSize:11,color:"#E8622A",fontWeight:600,marginBottom:3}}>Legal requirement</div>
                              <div style={{fontSize:11,color:"#888",lineHeight:1.6}}>
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
                            <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:0,fontWeight:600}}>Selection criteria</h3>
                            <span style={{fontSize:11,color:Math.abs(activeRedundancy.selectionCriteria.reduce((t,c)=>t+c.weight,0)-100)<1?"#7C5CFC":"#E8622A",fontWeight:600}}>
                              Total: {activeRedundancy.selectionCriteria.reduce((t,c)=>t+c.weight,0)}% {Math.abs(activeRedundancy.selectionCriteria.reduce((t,c)=>t+c.weight,0)-100)>1?"(must equal 100%)":"✓"}
                            </span>
                          </div>
                          {activeRedundancy.selectionCriteria.map(c=>(
                            <div key={c.id} style={{background:"#0D0D0F",borderRadius:7,padding:"12px 14px",marginBottom:8}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                                <div style={{fontSize:13,color:"#F2EDE4",fontWeight:500}}>{c.criterion}</div>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  <input type="number" min="0" max="100" value={c.weight}
                                    onChange={e=>updateRedundancyCase({selectionCriteria:activeRedundancy.selectionCriteria.map(x=>x.id===c.id?{...x,weight:parseInt(e.target.value)||0}:x)})}
                                    style={{width:56,background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:5,padding:"4px 8px",fontSize:12,color:"#F2EDE4",outline:"none",textAlign:"center"}} />
                                  <span style={{fontSize:11,color:"#555"}}>%</span>
                                </div>
                              </div>
                              <div style={{fontSize:11,color:"#555"}}>{c.description}</div>
                            </div>
                          ))}
                          <div style={{background:"#0D0D0F",borderRadius:7,padding:"10px 12px",border:"1px solid #2A2A35",marginTop:8}}>
                            <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:4}}>LEGAL NOTE</div>
                            <div style={{fontSize:11,color:"#555",lineHeight:1.6}}>Criteria must be objective and measurable. Avoid criteria that could be indirectly discriminatory (e.g. part-time working, recent maternity leave). Disability-related absences must be excluded from attendance scoring.</div>
                          </div>
                        </Card>

                        {/* At-risk employees */}
                        <Card>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                            <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:0,fontWeight:600}}>At-risk employees</h3>
                            <Btn onClick={()=>{
                              const name=window.prompt("Employee name:");
                              if(!name) return;
                              const role=window.prompt("Job title:");
                              const dept=window.prompt("Department:");
                              const emp={id:Date.now().toString(),name,role:role||"",department:dept||"",scores:{},totalScore:0,selected:null,consultationMeetings:[],outcome:"",redundancyPay:""};
                              updateRedundancyCase({atRiskEmployees:[...activeRedundancy.atRiskEmployees,emp]});
                            }} style={{padding:"6px 14px",fontSize:12}}>+ Add employee</Btn>
                          </div>
                          {activeRedundancy.atRiskEmployees.length===0&&<div style={{fontSize:12,color:"#444",padding:"20px 0",textAlign:"center"}}>No employees added yet — add all employees in the selection pool</div>}
                          {activeRedundancy.atRiskEmployees.map(emp=>(
                            <div key={emp.id} style={{background:"#0D0D0F",borderRadius:8,padding:"14px",marginBottom:10,border:"1px solid #2A2A35"}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                                <div>
                                  <div style={{fontSize:13,color:"#F2EDE4",fontWeight:600,marginBottom:2}}>{emp.name}</div>
                                  <div style={{fontSize:11,color:"#555"}}>{emp.role}{emp.department?" · "+emp.department:""}</div>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  <div style={{fontSize:18,fontWeight:700,color:"#7C5CFC",fontFamily:"Inter,sans-serif"}}>{emp.totalScore||0}</div>
                                  <div style={{fontSize:10,color:"#555"}}>/ 5.0</div>
                                  {emp.selected!==null&&<Badge color={emp.selected?"#E8622A":"#7C5CFC"}>{emp.selected?"At risk":"Retained"}</Badge>}
                                </div>
                              </div>
                              {/* Scoring grid */}
                              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8,marginBottom:10}}>
                                {activeRedundancy.selectionCriteria.map(c=>(
                                  <div key={c.id} style={{background:"#1C1C22",borderRadius:5,padding:"8px 10px"}}>
                                    <div style={{fontSize:9,color:"#555",marginBottom:5,fontWeight:600,letterSpacing:0.3}}>{c.criterion.slice(0,20)}</div>
                                    <div style={{display:"flex",gap:3}}>
                                      {[1,2,3,4,5].map(s=>(
                                        <button key={s} onClick={()=>scoreEmployee(emp.id,c.id,s)}
                                          style={{width:22,height:22,borderRadius:3,border:"1px solid",borderColor:(emp.scores?.[c.id]||0)>=s?"#7C5CFC":"#2A2A35",background:(emp.scores?.[c.id]||0)>=s?"#7C5CFC22":"none",color:(emp.scores?.[c.id]||0)>=s?"#A98FFF":"#555",fontSize:10,cursor:"pointer"}}>
                                          {s}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div style={{display:"flex",gap:8}}>
                                <button onClick={()=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(e=>e.id===emp.id?{...e,selected:true}:e)})}
                                  style={{background:"#E8622A18",border:"1px solid #E8622A44",borderRadius:5,padding:"4px 12px",fontSize:11,color:"#E8622A",cursor:"pointer"}}>At risk</button>
                                <button onClick={()=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(e=>e.id===emp.id?{...e,selected:false}:e)})}
                                  style={{background:"#7C5CFC18",border:"1px solid #7C5CFC33",borderRadius:5,padding:"4px 12px",fontSize:11,color:"#A98FFF",cursor:"pointer"}}>Retained</button>
                                <button onClick={()=>generateRedundancyLetter("at-risk",emp)}
                                  style={{background:"none",border:"1px solid #2A2A35",borderRadius:5,padding:"4px 12px",fontSize:11,color:"#888",cursor:"pointer"}}>At-risk letter</button>
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
                        <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:"0 0 14px",fontWeight:600}}>Consultation meetings</h3>
                        <p style={{fontSize:12,color:"#555",margin:"0 0 16px",lineHeight:1.6}}>
                          {activeRedundancy.type==="collective"
                            ?"Collective consultation must happen before individual consultation. Hold meaningful consultation — employees must be able to influence the outcome."
                            :"Individual consultation must be meaningful. Consider all representations made. Keep records of all meetings."}
                        </p>
                        {activeRedundancy.atRiskEmployees.filter(e=>e.selected).map(emp=>(
                          <div key={emp.id} style={{background:"#0D0D0F",borderRadius:8,padding:"14px",marginBottom:12,border:"1px solid #2A2A35"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                              <div style={{fontSize:13,color:"#F2EDE4",fontWeight:600}}>{emp.name}</div>
                              <div style={{display:"flex",gap:8}}>
                                <button onClick={()=>generateRedundancyLetter("consultation-invite",emp)}
                                  style={{background:"none",border:"1px solid #2A2A35",borderRadius:5,padding:"4px 10px",fontSize:11,color:"#888",cursor:"pointer"}}>Invite letter</button>
                                <button onClick={()=>generateRedundancyLetter("alternative-roles",emp)}
                                  style={{background:"none",border:"1px solid #2A2A35",borderRadius:5,padding:"4px 10px",fontSize:11,color:"#888",cursor:"pointer"}}>Alt roles letter</button>
                              </div>
                            </div>
                            <div style={{fontSize:11,color:"#555",marginBottom:8}}>{emp.consultationMeetings?.length||0} consultation meeting{(emp.consultationMeetings?.length||0)!==1?"s":""} recorded</div>
                            <textarea placeholder={`Notes from consultation with ${emp.name}...`}
                              value={emp.consultationNotes||""}
                              onChange={e=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(x=>x.id===emp.id?{...x,consultationNotes:e.target.value}:x)})}
                              rows={3}
                              style={{width:"100%",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:6,padding:"8px 10px",fontSize:12,color:"#F2EDE4",resize:"vertical",outline:"none",boxSizing:"border-box"}} ></textarea>
                          </div>
                        ))}
                        {activeRedundancy.atRiskEmployees.filter(e=>e.selected).length===0&&(
                          <div style={{fontSize:12,color:"#444",textAlign:"center",padding:"20px 0"}}>No at-risk employees selected yet — go back to the Selection step</div>
                        )}
                        {activeRedundancy.atRiskEmployees.filter(e=>e.selected).length>0&&<Btn onClick={()=>setRedundancyStep("outcome")} style={{marginTop:8}}>Continue to outcome →</Btn>}
                      </Card>
                    )}

                    {/* OUTCOME STEP */}
                    {redundancyStep==="outcome"&&(
                      <Card>
                        <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#7C5CFC",margin:"0 0 14px",fontWeight:600}}>Outcome letters</h3>
                        {activeRedundancy.atRiskEmployees.filter(e=>e.selected).map(emp=>(
                          <div key={emp.id} style={{background:"#0D0D0F",borderRadius:8,padding:"14px",marginBottom:10,border:"1px solid #2A2A35"}}>
                            <div style={{fontSize:13,color:"#F2EDE4",fontWeight:600,marginBottom:8}}>{emp.name}</div>
                            <div style={{marginBottom:10}}>
                              <label style={{display:"block",fontSize:10,color:"#555",fontWeight:600,letterSpacing:0.8,textTransform:"uppercase",marginBottom:4}}>Statutory redundancy pay</label>
                              <input placeholder="e.g. £3,450 (1.5 weeks × £2,300/week × 1 year)" value={emp.redundancyPay||""}
                                onChange={e=>updateRedundancyCase({atRiskEmployees:activeRedundancy.atRiskEmployees.map(x=>x.id===emp.id?{...x,redundancyPay:e.target.value}:x)})}
                                style={{width:"100%",background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:5,padding:"7px 10px",fontSize:12,color:"#F2EDE4",outline:"none",boxSizing:"border-box"}} />
                            </div>
                            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                              <button onClick={()=>generateRedundancyLetter("redundancy-confirmed",emp)}
                                style={{background:"#7C5CFC",border:"none",borderRadius:5,padding:"6px 14px",fontSize:12,color:"#fff",fontWeight:600,cursor:"pointer"}}>Redundancy letter</button>
                              <button onClick={()=>generateRedundancyLetter("appeal-invite",emp)}
                                style={{background:"none",border:"1px solid #2A2A35",borderRadius:5,padding:"6px 12px",fontSize:12,color:"#888",cursor:"pointer"}}>Appeal invite</button>
                            </div>
                          </div>
                        ))}
                        <Btn variant="blue" onClick={()=>updateRedundancyCase({status:"complete"})} style={{marginTop:12}}>Mark case complete</Btn>
                      </Card>
                    )}
                  </div>

                  {/* AI advice panel */}
                  <Card style={{background:"#141418",position:"sticky",top:70}}>
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
                        <div style={{fontSize:12,color:"#444",lineHeight:1.8,marginBottom:16}}>
                          Click "Get AI advice" for jurisdiction-specific legal guidance on your redundancy process — consultation requirements, selection risks, equality considerations, and common pitfalls.
                        </div>
                        <div style={{borderTop:"1px solid #2A2A35",paddingTop:14}}>
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
                              <div style={{fontSize:11,color:"#F2EDE4",fontWeight:500}}>{l}</div>
                              <div style={{fontSize:10,color:"#555",marginTop:1}}>{v}</div>
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
                <h2 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Mental health &amp; wellbeing</h2>
                <p style={{fontSize:13,color:"#555",margin:0}}>Confidential wellbeing case notes. Completely separate from disciplinary and performance records.</p>
              </div>
              <div style={{display:"flex",gap:8}}>
                {activeWellbeing&&<Btn variant="ghost" onClick={()=>{setActiveWellbeing(null);setWellbeingView("list");}}>← All employees</Btn>}
                <Btn onClick={()=>setWellbeingView(wellbeingView==="new"?"list":"new")}>{wellbeingView==="new"?"Cancel":"+ Add note"}</Btn>
              </div>
            </div>

            {/* Confidentiality notice */}
            <div style={{background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:8,padding:"10px 14px",marginBottom:20,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#7C5CFC",flexShrink:0}}/>
              <div style={{fontSize:11,color:"#555",lineHeight:1.5}}>These notes are confidential and are not linked to any disciplinary, performance, or ER case file. Access should be restricted to HR only. Notes may be relevant to reasonable adjustment obligations under the Equality Act 2010.</div>
            </div>

            {/* Overdue follow-ups */}
            {overdueFollowUps.length>0&&(
              <div style={{background:"#2A1E08",border:"1px solid #D4882A33",borderRadius:8,padding:"12px 16px",marginBottom:16}}>
                <div style={{fontSize:11,color:"#D4882A",fontWeight:600,marginBottom:8}}>Overdue follow-ups ({overdueFollowUps.length})</div>
                {overdueFollowUps.map(n=>(
                  <div key={n.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0"}}>
                    <span style={{fontSize:12,color:"#C4BDAF"}}>{n.employeeName} — {n.followUpDate}</span>
                    <button onClick={()=>toggleFollowUpDone(n.id)} style={{background:"none",border:"1px solid #2A2A35",borderRadius:4,padding:"2px 10px",fontSize:11,color:"#7C5CFC",cursor:"pointer"}}>Mark done</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add note form */}
            {wellbeingView==="new"&&(
              <Card style={{marginBottom:20}}>
                <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",margin:"0 0 16px",fontWeight:600}}>Add wellbeing note</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Employee name *</label>
                    <input placeholder="e.g. James Wilson" value={wellbeingForm.employeeName} onChange={e=>setWellbeingForm(p=>({...p,employeeName:e.target.value}))}
                      style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 12px",fontSize:13,color:"#F2EDE4",outline:"none",boxSizing:"border-box"}} />
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Note type</label>
                    <select value={wellbeingForm.type} onChange={e=>setWellbeingForm(p=>({...p,type:e.target.value}))}
                      style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 12px",fontSize:13,color:"#F2EDE4",outline:"none"}}>
                      {Object.entries(WELLBEING_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Date</label>
                    <DateInput value={wellbeingForm.date} onChange={e=>setWellbeingForm(p=>({...p,date:e.target.value}))} />
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>HR manager</label>
                    <input placeholder="Your name" value={wellbeingForm.manager} onChange={e=>setWellbeingForm(p=>({...p,manager:e.target.value}))}
                      style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 12px",fontSize:13,color:"#F2EDE4",outline:"none",boxSizing:"border-box"}} />
                  </div>
                </div>
                <div style={{marginBottom:14}}>
                  <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Conversation notes *</label>
                  <textarea placeholder="What was discussed? What did the employee share? What was observed? How did they seem?" value={wellbeingForm.content} onChange={e=>setWellbeingForm(p=>({...p,content:e.target.value}))}
                    rows={5}
                    style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 12px",fontSize:13,color:"#F2EDE4",resize:"vertical",outline:"none",boxSizing:"border-box"}} ></textarea>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Support offered</label>
                    <input placeholder="e.g. EAP referral, flexible working, OH referral" value={wellbeingForm.supportOffered} onChange={e=>setWellbeingForm(p=>({...p,supportOffered:e.target.value}))}
                      style={{width:"100%",background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:6,padding:"9px 12px",fontSize:13,color:"#F2EDE4",outline:"none",boxSizing:"border-box"}} />
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:10,fontWeight:600,color:"#555",letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>Follow-up date</label>
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
                  <div style={{fontSize:10,color:"#555",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Employees ({allEmployees.length})</div>
                  {allEmployees.length===0&&<div style={{fontSize:12,color:"#444"}}>No wellbeing notes yet</div>}
                  {allEmployees.map(emp=>{
                    const empNotes = wellbeingNotes.filter(n=>n.employeeName===emp);
                    const hasOverdue = empNotes.some(n=>!n.followUpDone&&n.followUpDate&&new Date(n.followUpDate.split("/").reverse().join("-"))<new Date());
                    return(
                      <button key={emp} onClick={()=>{setActiveWellbeing(emp);setWellbeingView("employee");}}
                        style={{width:"100%",background:activeWellbeing===emp?"#7C5CFC18":"none",border:"1px solid",borderColor:activeWellbeing===emp?"#7C5CFC33":"transparent",borderRadius:7,padding:"10px 12px",marginBottom:4,textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontSize:13,color:"#F2EDE4",fontWeight:activeWellbeing===emp?600:400}}>{emp}</div>
                          <div style={{fontSize:10,color:"#555",marginTop:2}}>{empNotes.length} note{empNotes.length!==1?"s":""}</div>
                        </div>
                        {hasOverdue&&<div style={{width:7,height:7,borderRadius:"50%",background:"#D4882A"}}/>}
                      </button>
                    );
                  })}
                </Card>

                {/* Resources */}
                <Card style={{background:"#141418"}}>
                  <div style={{fontSize:10,color:"#555",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Crisis resources</div>
                  {WELLBEING_RESOURCES.map(r=>(
                    <div key={r.name} style={{padding:"7px 0",borderBottom:"1px solid #1a1a1a"}}>
                      <div style={{fontSize:12,color:"#F2EDE4",fontWeight:500}}>{r.name}</div>
                      <div style={{fontSize:11,color:"#7C5CFC",marginTop:1}}>{r.contact}</div>
                      <div style={{fontSize:10,color:"#444",marginTop:1}}>{r.note}</div>
                    </div>
                  ))}
                </Card>
              </div>

              {/* Notes view */}
              <div>
                {!activeWellbeing&&wellbeingView!=="new"&&(
                  <Card style={{textAlign:"center",padding:"40px 20px",background:"#141418"}}>
                    <div style={{fontSize:14,color:"#555",marginBottom:8}}>Select an employee to view their wellbeing history</div>
                    <div style={{fontSize:12,color:"#444"}}>Or click "+ Add note" to log a new wellbeing conversation</div>
                  </Card>
                )}

                {activeWellbeing&&employeeNotes.length>0&&(
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <div style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:18,color:"#F2EDE4",fontWeight:600}}>{activeWellbeing}</div>
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
                              <span style={{fontSize:11,color:"#555"}}>{note.date}</span>
                              {note.manager&&<span style={{fontSize:11,color:"#444"}}>{note.manager}</span>}
                            </div>
                            {note.confidential&&<span style={{fontSize:9,color:"#555",border:"1px solid #2A2A35",borderRadius:3,padding:"1px 6px",letterSpacing:0.5}}>CONFIDENTIAL</span>}
                          </div>
                          <div style={{fontSize:13,color:"#C4BDAF",lineHeight:1.7,marginBottom:10,whiteSpace:"pre-wrap"}}>{note.content}</div>
                          {note.supportOffered&&(
                            <div style={{fontSize:11,color:"#555",marginBottom:8}}>
                              <span style={{color:"#888",fontWeight:600}}>Support offered: </span>{note.supportOffered}
                            </div>
                          )}
                          {note.followUpDate&&(
                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#0D0D0F",borderRadius:6,padding:"8px 12px"}}>
                              <div>
                                <span style={{fontSize:11,color:isOverdue?"#D4882A":"#555"}}>Follow-up: {note.followUpDate}</span>
                                {isOverdue&&<span style={{fontSize:10,color:"#D4882A",marginLeft:8}}>overdue</span>}
                              </div>
                              <button onClick={()=>toggleFollowUpDone(note.id)}
                                style={{background:note.followUpDone?"#7C5CFC22":"none",border:"1px solid",borderColor:note.followUpDone?"#7C5CFC":"#2A2A35",borderRadius:5,padding:"3px 10px",fontSize:11,color:note.followUpDone?"#A98FFF":"#666",cursor:"pointer"}}>
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
                  <Card style={{textAlign:"center",padding:"32px",background:"#141418"}}>
                    <div style={{fontSize:13,color:"#555",marginBottom:12}}>No notes yet for {activeWellbeing}</div>
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
          <h2 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Settings</h2>
          <p style={{fontSize:13,color:"#666",margin:"0 0 28px"}}>All data saved in your browser.</p>

          {/* Word template */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",margin:"0 0 4px"}}>Word letter template</h3><p style={{fontSize:12,color:"#666",margin:0,lineHeight:1.6}}>Upload your .docx with header/footer. Enables Word export on letters.</p></div>
              <Badge color="#1C5AA0">WORD</Badge>
            </div>
            {wordTemplate?<div style={{background:"#0D0D0F",borderRadius:7,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#F2EDE4"}}>{wordTemplate.name}</span><Btn variant="danger" onClick={()=>{setWordTemplate(null);lsSet("compass_word_template",null);}} style={{padding:"2px 10px",fontSize:11}}>Remove</Btn></div>:<div style={{background:"#0D0D0F",border:"2px dashed #2A2A35",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#444"}}>No template uploaded</div>}
            <input ref={wordTemplateRef} type="file" accept=".docx" onChange={handleWordTemplateUpload} style={{display:"none"}} />
            <Btn variant="blue" onClick={()=>wordTemplateRef.current?.click()}>{wordTemplate?"Replace":"Upload .docx template"} →</Btn>
          </Card>

          {/* Letterhead */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",margin:"0 0 4px"}}>Letterhead image</h3><p style={{fontSize:12,color:"#666",margin:0,lineHeight:1.6}}>PNG or JPG — appears at top of PDF letters.</p></div>
              <Badge>PDF</Badge>
            </div>
            {letterhead?<div style={{background:"#fff",borderRadius:7,padding:12,marginBottom:12,position:"relative"}}><img src={letterhead} alt="Letterhead" style={{width:"100%",maxHeight:100,objectFit:"contain",objectPosition:"left"}}/><button onClick={()=>{setLetterhead(null);lsSet("compass_letterhead",null);}} style={{position:"absolute",top:6,right:6,background:"#1C1C22",border:"1px solid #2A2A35",borderRadius:5,padding:"3px 8px",fontSize:11,color:"#E8622A",cursor:"pointer"}}>Remove</button></div>:<div style={{background:"#0D0D0F",border:"2px dashed #2A2A35",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#444"}}>No letterhead uploaded</div>}
            <input ref={letterheadRef} type="file" accept="image/*" onChange={handleLetterheadUpload} style={{display:"none"}} />
            <Btn onClick={()=>letterheadRef.current?.click()}>{letterhead?"Replace":"Upload letterhead"} →</Btn>
          </Card>

          {/* E-signature */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",margin:"0 0 4px"}}>E-signature</h3><p style={{fontSize:12,color:"#666",margin:0,lineHeight:1.6}}>Draw or type your signature. Applied to all PDF letters.</p></div>
            </div>
            {signature?<div style={{background:"#fff",borderRadius:7,padding:"12px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              {signature.type==="typed"?<div style={{fontFamily:"'Brush Script MT',cursive",fontSize:28,color:"#1C1C22"}}>{signature.data}</div>:<img src={signature.data} alt="Sig" style={{maxHeight:45,maxWidth:160}}/>}
              <Btn variant="danger" onClick={()=>{setSignature(null);lsSet("compass_signature",null);}} style={{padding:"3px 10px",fontSize:11}}>Remove</Btn>
            </div>:<div style={{background:"#0D0D0F",border:"2px dashed #2A2A35",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#444"}}>No signature saved</div>}
            <Btn onClick={()=>setShowSigPad(true)}>{signature?"Update":"Create"} signature →</Btn>
          </Card>

          {/* Policies */}
          <Card style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",margin:"0 0 4px"}}>Company policies</h3><p style={{fontSize:12,color:"#666",margin:0,lineHeight:1.6}}>Upload HR policies (.docx, .txt). Compass references them in all AI outputs.</p></div>
              <Badge color="#7C5CFC">AI</Badge>
            </div>
            {policies.length>0&&(
              <div style={{marginBottom:14}}>
                {policies.map(p=>(
                  <div key={p.id} style={{background:"#0D0D0F",border:"1px solid #2A2A35",borderRadius:7,padding:"9px 12px",marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <span style={{fontSize:12,color:"#F2EDE4",fontWeight:600}}>{p.name}</span>
                      <span style={{fontSize:10,color:"#444",marginLeft:8,fontFamily:"JetBrains Mono,monospace"}}>{p.size}</span>
                    </div>
                    <Btn variant="danger" onClick={()=>{const u=policies.filter(x=>x.id!==p.id);setPolicies(u);lsSet("compass_policies",u);}} style={{padding:"2px 10px",fontSize:11}}>Remove</Btn>
                  </div>
                ))}
              </div>
            )}
            {policies.length===0&&<div style={{background:"#0D0D0F",border:"2px dashed #2A2A35",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:14,fontSize:12,color:"#444"}}>No policies uploaded</div>}
            <input ref={policyFileRef} type="file" multiple accept=".txt,.md,.docx" onChange={handlePolicyUpload} style={{display:"none"}} />
            <Btn onClick={()=>policyFileRef.current?.click()} disabled={policyProcessing}>{policyProcessing?"Processing...":"+ Upload policies →"}</Btn>
            {policies.length>0&&<div style={{marginTop:12,fontSize:11,color:"#7C5CFC"}}>✓ Active in: prep, note structuring, letter drafting, risk scoring</div>}
          </Card>

          {/* Team members */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",margin:"0 0 4px"}}>Team members</h3><p style={{fontSize:12,color:"#666",margin:0,lineHeight:1.6}}>Manage who can access Compass. Each user has role-based permissions.</p></div>
            </div>
            {users.length>0&&(
              <div style={{marginBottom:14}}>
                {users.map(u=>(
                  <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
                    <div>
                      <div style={{fontSize:13,color:"#F2EDE4",fontWeight:currentUser?.id===u.id?600:400}}>{u.name}{currentUser?.id===u.id&&" (you)"}</div>
                      <div style={{fontSize:11,color:"#555",marginTop:1}}>{u.role} {u.email?"· "+u.email:""}</div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <div style={{fontSize:10,color:"#444"}}>
                        {ROLE_PERMS[u.role]?.viewAll?"All cases":"Assigned only"} ·{" "}
                        {ROLE_PERMS[u.role]?.edit?"Can edit":"Read only"}
                      </div>
                      <button onClick={()=>saveUsers(users.filter(x=>x.id!==u.id))} style={{background:"none",border:"1px solid #2A2A35",borderRadius:5,padding:"3px 8px",fontSize:11,color:"#E8622A",cursor:"pointer"}}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <UserAddForm onAdd={(name,role,email)=>addUser(name,role,email)} />
            <div style={{marginTop:12,background:"#0D0D0F",borderRadius:7,padding:"10px 14px"}}>
              <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:6}}>PERMISSIONS</div>
              {Object.entries(ROLE_PERMS).map(([role,p])=>(
                <div key={role} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#555",padding:"3px 0"}}>
                  <span style={{color:"#888",fontWeight:500}}>{role}</span>
                  <span>{p.viewAll?"All cases":"Assigned"} · {p.edit?"Edit":"Read"} · {p.delete?"Delete":"No delete"} · {p.viewRisk?"Risk":"No risk"}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Notifications */}
          <Card style={{marginBottom:12}}>
            <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",margin:"0 0 4px"}}>Deadline reminders</h3>
            <p style={{fontSize:12,color:"#666",margin:"0 0 14px",lineHeight:1.6}}>Get browser notifications for upcoming and overdue deadlines.</p>
            {dueSoon.length>0?(
              <div style={{marginBottom:14}}>
                {dueSoon.slice(0,5).map((d,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1a1a1a",fontSize:12}}>
                    <div>
                      <span style={{color:d.overdue?"#E8622A":"#F2EDE4"}}>{d.caseName}</span>
                      <span style={{color:"#555",marginLeft:8}}>{d.step}</span>
                    </div>
                    <span style={{color:d.overdue?"#E8622A":"#888",fontFamily:"JetBrains Mono,monospace"}}>{d.overdue?`${Math.abs(d.daysLeft)}d overdue`:`${d.daysLeft}d`}</span>
                  </div>
                ))}
              </div>
            ):<div style={{fontSize:12,color:"#444",marginBottom:14}}>No upcoming deadlines in the next 7 days</div>}
            <Btn onClick={requestNotifications} disabled={notifGranted}>{notifGranted?"Notifications enabled":"Enable browser notifications"}</Btn>
          </Card>

          {/* Audit trail */}
          <Card style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div><h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",margin:"0 0 4px"}}>Audit trail</h3><p style={{fontSize:12,color:"#666",margin:0}}>Every action timestamped and logged.</p></div>
              <span style={{fontSize:11,color:"#555"}}>{auditLog.length} entries</span>
            </div>
            <div style={{maxHeight:240,overflowY:"auto"}}>
              {auditLog.slice(0,50).map((e,i)=>(
                <div key={i} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid #1a1a1a",alignItems:"flex-start"}}>
                  <span style={{fontSize:10,color:"#444",fontFamily:"JetBrains Mono,monospace",flexShrink:0,marginTop:1}}>{new Date(e.ts).toLocaleString("en-GB",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                  <div>
                    <span style={{fontSize:11,color:"#F2EDE4",fontWeight:500}}>{e.action}</span>
                    {e.detail&&<span style={{fontSize:11,color:"#555",marginLeft:6}}>{e.detail}</span>}
                    {e.user&&e.user!=="HR Manager"&&<span style={{fontSize:10,color:"#7C5CFC",marginLeft:6}}>· {e.user}</span>}
                  </div>
                </div>
              ))}
              {auditLog.length===0&&<div style={{fontSize:12,color:"#444"}}>No actions logged yet</div>}
            </div>
          </Card>

          {/* GDPR / Data */}
          <Card style={{marginBottom:20}}>
            <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",margin:"0 0 4px"}}>Data &amp; privacy</h3>
            <p style={{fontSize:12,color:"#666",margin:"0 0 14px",lineHeight:1.6}}>All data is stored locally in your browser. You are responsible for UK GDPR compliance when processing employee personal data.</p>
            <div style={{background:"#0D0D0F",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
              <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:8}}>DATA INVENTORY</div>
              {[
                {l:"Case files & meetings",v:cases.length+" cases, "+cases.reduce((t,c)=>t+c.meetings.length,0)+" meetings"},
                {l:"Policies uploaded",v:policies.length+" documents"},
                {l:"Whistleblower reports",v:whistleReports.length+" reports"},
                {l:"Audit log entries",v:auditLog.length+" entries"},
                {l:"Storage used",v:Math.round(JSON.stringify(localStorage).length/1024)+"kb"},
              ].map(({l,v})=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#555",padding:"3px 0"}}>
                  <span>{l}</span><span style={{color:"#888"}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <Btn variant="secondary" onClick={exportAllData}>Export all data</Btn>
              <Btn variant="danger" onClick={deleteAllData} style={{color:"#E8622A"}}>Delete all data</Btn>
              <button onClick={()=>{setGdprAccepted(false);lsSet("compass_gdpr",false);setShowGdpr(true);}} style={{background:"none",border:"none",color:"#555",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>View privacy notice</button>
            </div>
          </Card>

          {/* Help / Onboarding */}
          <Card style={{marginBottom:20}}>
            <h3 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:16,color:"#F2EDE4",margin:"0 0 4px"}}>Help &amp; onboarding</h3>
            <p style={{fontSize:12,color:"#666",margin:"0 0 14px"}}>Rewatch the getting started guide.</p>
            <Btn onClick={()=>{setOnboardStep(0);setShowOnboard(true);}}>Restart tour</Btn>
          </Card>

          <Btn variant="ghost" onClick={()=>setScreen(SCREENS.HOME)}>← Back to home</Btn>
        </div>
      )}
    </div>
  );
}
