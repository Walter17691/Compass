import { SCREENS } from '../constants';
import { FONT, COLOR, TYPE, SPACE, RADIUS, CONTENT_MAX_WIDTH } from '../styles/tokens';

// Phase 22 of the reasoning-layer build-out — Global Compass AI. A new,
// additive entry point alongside (not replacing) the existing per-case
// AI Assistant tab and per-meeting Ask Compass widget — this one answers
// org-wide questions instead of a single case's own record. App.jsx's
// sendGlobalChat classifies the question first (stats vs a specific
// case vs general guidance) and routes it to a real scoped query before
// answering — never guesses a number, never invents case detail.
//
// Phase 2B — before a conversation exists, the old design filled a
// large bordered response box with nothing but the three example
// questions, reading as an unfinished/empty screen rather than an
// intentional one. That box is now only rendered once a real message
// exists; the initial state is plain intro text above a clean, always-
// bordered input row. The AI/human boundary copy and the chat
// interaction itself (message bubbles, "Open this case →"/"View in
// Insights →" drill-downs) are completely unchanged.
export function GlobalAssistantScreen({ chatHistory, chatInput, setChatInput, chatProcessing, sendChat, caseRef, setActiveCaseId, setActiveCaseStage, setScreen, insightsTab, setInsightsSection }) {
  const hasConversation = chatHistory.length > 0;
  return (
    <div style={{minHeight:"100vh",background:COLOR.paper,fontFamily:FONT.sans}}>
      <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"32px 32px"}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <div style={{marginBottom:20}}>
            <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:6}}>Organisation-wide</div>
            <h1 style={{...TYPE.identity,color:COLOR.ink,margin:0}}>Ask Compass</h1>
            <p style={{fontSize:13,color:COLOR.inkFaint,margin:"6px 0 0"}}>Ask about case counts and patterns across the organisation, a specific employee's case, or general HR process and policy questions. Compass never recommends a sanction or final decision, and only ever answers using cases you have access to.</p>
          </div>

          {!hasConversation && (
            <div style={{fontSize:13,color:COLOR.inkFaint,marginBottom:SPACE.lg}}>
              Try "How many active cases do we have?", "What's the mix of case types right now?", or "What's the status of Sarah Jones's case?"
            </div>
          )}

          {hasConversation && (
            <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"16px 20px",marginBottom:SPACE.md}}>
              {chatHistory.map((m,i) => (
                <div key={i} data-role={m.role} style={{marginBottom:10,display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"85%",background:m.role==="user"?COLOR.purple:COLOR.purpleTint,color:m.role==="user"?"#fff":COLOR.ink,borderRadius:10,padding:"9px 13px",fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.content}</div>
                </div>
              ))}
              {chatProcessing && <div style={{fontSize:13,color:COLOR.inkFaint}}>Thinking…</div>}
              {caseRef && !chatProcessing && (
                <button onClick={()=>{setActiveCaseId(caseRef);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}} style={{fontSize:12,color:COLOR.purple,background:COLOR.purpleTint,border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500,marginTop:4}}>Open this case →</button>
              )}
              {/* Organisational ER Intelligence (Phase 6, OP20, §20) — a
                  real drill-down into whichever Insights tab actually
                  grounded this answer (inferInsightsTab, lib/globalAnalytics.js),
                  not a generic "see more" link. */}
              {insightsTab && !chatProcessing && (
                <button onClick={()=>{setInsightsSection(insightsTab);setScreen(SCREENS.INSIGHTS);}} style={{fontSize:12,color:COLOR.purple,background:COLOR.purpleTint,border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500,marginTop:4}}>View in Insights →</button>
              )}
            </div>
          )}

          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"12px 14px",display:"flex",gap:8}}>
            <input aria-label="Ask Compass" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!chatProcessing)sendChat();}} placeholder="Ask Compass anything about your cases…" style={{flex:1,fontSize:13,border:"none",borderRadius:RADIUS.surface,padding:"6px 4px",color:COLOR.ink,outline:"none",fontFamily:FONT.sans,background:"none"}}/>
            <button onClick={sendChat} disabled={chatProcessing||!chatInput.trim()} style={{fontSize:13,background:chatProcessing||!chatInput.trim()?COLOR.border:COLOR.purple,border:"none",borderRadius:RADIUS.surface,padding:"9px 20px",color:"#fff",fontWeight:600,cursor:chatProcessing||!chatInput.trim()?"not-allowed":"pointer",fontFamily:FONT.sans}}>Ask</button>
          </div>
        </div>
      </div>
    </div>
  );
}
