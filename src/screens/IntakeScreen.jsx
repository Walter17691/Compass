import { SCREENS } from '../constants';
import { CompassLogo } from '../components/CompassLogo';

export function IntakeScreen({ setScreen, intake, setIntake, cases, saveCases, caseLimitReached, onCaseLimitBlocked }) {
  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>

      {/* Header */}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",padding:"16px 32px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <CompassLogo size={32}/>
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
                onClick={e=>e.currentTarget.showPicker?.()}
                style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box",colorScheme:"light",cursor:"pointer"}}
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
            if(caseLimitReached) { onCaseLimitBlocked?.(); return; }
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
  );
}
