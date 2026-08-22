import { SCREENS } from '../constants';

// Phase 22 of the reasoning-layer build-out — Global Compass AI. A new,
// additive entry point alongside (not replacing) the existing per-case
// AI Assistant tab and per-meeting Ask Compass widget — this one answers
// org-wide questions instead of a single case's own record. App.jsx's
// sendGlobalChat classifies the question first (stats vs a specific
// case vs general guidance) and routes it to a real scoped query before
// answering — never guesses a number, never invents case detail.
export function GlobalAssistantScreen({ chatHistory, chatInput, setChatInput, chatProcessing, sendChat, caseRef, setActiveCaseId, setActiveCaseStage, setScreen, insightsTab, setInsightsSection }) {
  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
      <div style={{maxWidth:800,margin:"0 auto",padding:"32px 32px"}}>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,color:"#9B9098",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Organisation-wide</div>
          <h1 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:28,fontWeight:400,color:"#1C1820",margin:0}}>Ask Compass</h1>
          <p style={{fontSize:13,color:"#9B9098",margin:"6px 0 0"}}>Ask about case counts and patterns across the organisation, a specific employee's case, or general HR process and policy questions. Compass never recommends a sanction or final decision, and only ever answers using cases you have access to.</p>
        </div>

        <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"16px 20px",minHeight:200}}>
            {chatHistory.length===0 && (
              <div style={{fontSize:13,color:"#9B9098",marginBottom:12}}>
                Try "How many active cases do we have?", "What's the mix of case types right now?", or "What's the status of Sarah Jones's case?"
              </div>
            )}
            {chatHistory.map((m,i) => (
              <div key={i} data-role={m.role} style={{marginBottom:10,display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"85%",background:m.role==="user"?"#7C5CFC":"#F5F3FF",color:m.role==="user"?"#fff":"#1A1535",borderRadius:10,padding:"9px 13px",fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.content}</div>
              </div>
            ))}
            {chatProcessing && <div style={{fontSize:13,color:"#9B9098"}}>Thinking…</div>}
            {caseRef && !chatProcessing && (
              <button onClick={()=>{setActiveCaseId(caseRef);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}} style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,marginTop:4}}>Open this case →</button>
            )}
            {/* Organisational ER Intelligence (Phase 6, OP20, §20) — a
                real drill-down into whichever Insights tab actually
                grounded this answer (inferInsightsTab, lib/globalAnalytics.js),
                not a generic "see more" link. */}
            {insightsTab && !chatProcessing && (
              <button onClick={()=>{setInsightsSection(insightsTab);setScreen(SCREENS.INSIGHTS);}} style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,marginTop:4}}>View in Insights →</button>
            )}
          </div>
          <div style={{padding:"14px 20px",borderTop:"1px solid #F5F1EA",display:"flex",gap:8}}>
            <input aria-label="Ask Compass" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!chatProcessing)sendChat();}} placeholder="Ask Compass anything about your cases…" style={{flex:1,fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 13px",color:"#1A1535",outline:"none",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
            <button onClick={sendChat} disabled={chatProcessing||!chatInput.trim()} style={{fontSize:13,background:chatProcessing||!chatInput.trim()?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:8,padding:"10px 20px",color:"#fff",fontWeight:600,cursor:chatProcessing||!chatInput.trim()?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Ask</button>
          </div>
        </div>
      </div>
    </div>
  );
}
