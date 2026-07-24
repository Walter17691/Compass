import { SCREENS, MEETING_TYPES } from '../constants';
import { Btn } from '../components/Primitives';
import { MDRenderer } from '../components/MDRenderer';
import { DateInput } from '../components/DateInput';

export function PrepScreen({ isMobile, meetingType, setMeetingType, caseInfo, setCaseInfo, handlePrepare, aiProcessing, setScreen, bgDoc, setBgDoc, prepNotes }) {
  return (
    <div style={{maxWidth:560,margin:"0 auto",padding:isMobile?"24px 16px":"60px 20px",textAlign:"center"}}>
      <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:"#7C5CFC",marginBottom:12,fontWeight:600}}>Prepare first</div>
      <h1 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:30,color:"#1A1535",margin:"0 0 8px",fontWeight:400}}>Tell Compass about this meeting</h1>
      <p style={{fontSize:14,color:"#6B6880",margin:"0 0 32px",lineHeight:1.7}}>Compass will generate targeted questions and a prep pack.</p>

      <div style={{textAlign:"left",marginBottom:16}}>
        <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Meeting type <span style={{color:"#C84B2F"}}>*</span></label>
        <select value={meetingType?.id||""} onChange={e=>{const t=MEETING_TYPES.find(x=>x.id===e.target.value);setMeetingType(t);}}
          style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"14px 16px",fontSize:14,outline:"none",color:meetingType?"#1C1820":"#9B9098",boxSizing:"border-box"}}>
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
  );
}
