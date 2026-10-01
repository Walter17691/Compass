import { MDRenderer } from '../MDRenderer';
import { FONT } from '../../styles/tokens';

// Two features over the same case-scoped context (src/lib/caseContext.js,
// App.jsx's sendCaseChat/generateCaseOverview): a structured, regenerated-
// on-demand overview, and free-form Q&A. Neither persists anything —
// AI-generated content here is explicitly never presented as established
// fact or a recommended sanction (enforced in the system prompts, not
// just this UI), so there's nothing that needs to survive a refresh.
// Phase 23 — Explainability retrofit adds onAskWhy/overviewSources: the
// overview predates the case_signals/WhySourcesModal primitive (Phase 0)
// and rendered as unsourced prose until now. Reuses that same modal via
// the caller (CaseViewScreen's existing whySignal state/resolveSignalRef)
// rather than inventing a second explainability UI — sourceRefs is
// exactly the allegations/meetings that actually fed the case record at
// generation time (App.jsx's generateCaseOverview), not re-derived live.
export function AIAssistantTab({ cs, chatHistory, chatInput, setChatInput, chatProcessing, sendChat, overview, overviewLoading, generateOverview, overviewSources, onAskWhy }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:12,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",background:"#FFFFFF",borderBottom:"1px solid #E3E5EE",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#7A2FD8"}}>AI case overview</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {overview && !overviewLoading && (
              <button onClick={()=>onAskWhy?.({title:"AI case overview", reasoning:"Generated from this case's own record — the allegations and meetings listed below — as of when you last generated it. Regenerating refreshes both the overview and this source list.", sourceRefs:overviewSources||[]})} style={{fontSize:11,background:"none",border:"1px solid #E8EAF2",borderRadius:6,padding:"5px 12px",color:"#7A2FD8",cursor:"pointer",fontFamily:FONT.sans,fontWeight:600}}>Ask why</button>
            )}
            <button onClick={generateOverview} disabled={overviewLoading} style={{fontSize:11,background:overviewLoading?"#E8EAF2":"#7A2FD8",border:"none",borderRadius:6,padding:"5px 12px",color:"#fff",cursor:overviewLoading?"not-allowed":"pointer",fontFamily:FONT.sans,fontWeight:600}}>{overviewLoading?"Generating…":overview?"Regenerate":"Generate overview"}</button>
          </div>
        </div>
        <div style={{padding:"16px"}}>
          {!overview && !overviewLoading && <div style={{fontSize:13,color:"#8A8EA3"}}>Generates a structured, neutral summary of established/disputed facts and outstanding questions from what's recorded on this case. It never decides an allegation or recommends a sanction — only the next procedural step.</div>}
          {overviewLoading && <div style={{fontSize:13,color:"#8A8EA3"}}>Reading the case record…</div>}
          {overview && !overviewLoading && (
            <div style={{fontSize:13,color:"#0F1224",lineHeight:1.6}}>
              <MDRenderer text={overview}/>
              <div style={{fontSize:11,color:"#8A8EA3",marginTop:12,fontStyle:"italic"}}>AI-generated from the case record above — verify against the source before relying on it.</div>
            </div>
          )}
        </div>
      </div>

      <div style={{background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:12,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",background:"#FFFFFF",borderBottom:"1px solid #E3E5EE"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#7A2FD8"}}>Ask Compass about {cs.employeeName}'s case</div>
        </div>
        <div style={{padding:"16px"}}>
          {chatHistory.length===0 && <div style={{fontSize:13,color:"#8A8EA3",marginBottom:12}}>Ask a question about this case — Compass answers only from what's recorded here, not the final decision.</div>}
          {chatHistory.map((m,i) => (
            <div key={i} style={{marginBottom:10,display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
              <div style={{maxWidth:"85%",background:m.role==="user"?"#7A2FD8":"#F3EDFD",color:m.role==="user"?"#fff":"#0F1224",borderRadius:10,padding:"8px 12px",fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.content}</div>
            </div>
          ))}
          {chatProcessing && <div style={{fontSize:13,color:"#8A8EA3",marginBottom:10}}>Thinking…</div>}
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <input aria-label="Ask about this case" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!chatProcessing)sendChat();}} placeholder="e.g. What evidence supports the first allegation?" style={{flex:1,fontSize:13,border:"1px solid #E8EAF2",borderRadius:8,padding:"9px 12px",color:"#0F1224",outline:"none",fontFamily:FONT.sans}}/>
            <button onClick={sendChat} disabled={chatProcessing||!chatInput.trim()} style={{fontSize:13,background:chatProcessing||!chatInput.trim()?"#E8EAF2":"#7A2FD8",border:"none",borderRadius:8,padding:"9px 18px",color:"#fff",fontWeight:600,cursor:chatProcessing||!chatInput.trim()?"not-allowed":"pointer",fontFamily:FONT.sans}}>Ask</button>
          </div>
        </div>
      </div>
    </div>
  );
}
