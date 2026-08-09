import { MDRenderer } from '../MDRenderer';

// Two features over the same case-scoped context (src/lib/caseContext.js,
// App.jsx's sendCaseChat/generateCaseOverview): a structured, regenerated-
// on-demand overview, and free-form Q&A. Neither persists anything —
// AI-generated content here is explicitly never presented as established
// fact or a recommended sanction (enforced in the system prompts, not
// just this UI), so there's nothing that needs to survive a refresh.
export function AIAssistantTab({ cs, chatHistory, chatInput, setChatInput, chatProcessing, sendChat, overview, overviewLoading, generateOverview }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>AI case overview</div>
          <button onClick={generateOverview} disabled={overviewLoading} style={{fontSize:11,background:overviewLoading?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:6,padding:"5px 12px",color:"#fff",cursor:overviewLoading?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>{overviewLoading?"Generating…":overview?"Regenerate":"Generate overview"}</button>
        </div>
        <div style={{padding:"16px"}}>
          {!overview && !overviewLoading && <div style={{fontSize:13,color:"#9B9098"}}>Generates a structured, neutral summary of established/disputed facts and outstanding questions from what's recorded on this case. It never decides an allegation or recommends a sanction — only the next procedural step.</div>}
          {overviewLoading && <div style={{fontSize:13,color:"#9B9098"}}>Reading the case record…</div>}
          {overview && !overviewLoading && (
            <div style={{fontSize:13,color:"#1A1535",lineHeight:1.6}}>
              <MDRenderer text={overview}/>
              <div style={{fontSize:11,color:"#9B9098",marginTop:12,fontStyle:"italic"}}>AI-generated from the case record above — verify against the source before relying on it.</div>
            </div>
          )}
        </div>
      </div>

      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Ask Compass about {cs.employeeName}'s case</div>
        </div>
        <div style={{padding:"16px"}}>
          {chatHistory.length===0 && <div style={{fontSize:13,color:"#9B9098",marginBottom:12}}>Ask a question about this case — Compass answers only from what's recorded here, not the final decision.</div>}
          {chatHistory.map((m,i) => (
            <div key={i} style={{marginBottom:10,display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
              <div style={{maxWidth:"85%",background:m.role==="user"?"#7C5CFC":"#F5F3FF",color:m.role==="user"?"#fff":"#1A1535",borderRadius:10,padding:"8px 12px",fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.content}</div>
            </div>
          ))}
          {chatProcessing && <div style={{fontSize:13,color:"#9B9098",marginBottom:10}}>Thinking…</div>}
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!chatProcessing)sendChat();}} placeholder="e.g. What evidence supports the first allegation?" style={{flex:1,fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 12px",color:"#1A1535",outline:"none",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
            <button onClick={sendChat} disabled={chatProcessing||!chatInput.trim()} style={{fontSize:13,background:chatProcessing||!chatInput.trim()?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:8,padding:"9px 18px",color:"#fff",fontWeight:600,cursor:chatProcessing||!chatInput.trim()?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Ask</button>
          </div>
        </div>
      </div>
    </div>
  );
}
