import { useEffect, useRef } from 'react';
import { usePopoverPosition } from '../hooks/usePopoverPosition';
import { CompassLogo } from '../components/CompassLogo';
import { FONT, COLOR, RADIUS } from '../styles/tokens';

// Home Composition Review, follow-up fix — this is a genuinely distinct
// destination from the "Ask Compass" nav item (GlobalAssistantScreen):
// that screen is organisation-wide, answering from real case data ("how
// many active cases", a named employee's case); this widget is a
// stateless UK-employment-law/ACAS/best-practice quick reference (its own
// canned prompts below never touch org data). Distinct purpose, so it
// stays — but a page-level position:fixed launcher, however it was
// styled, was structurally guaranteed to sit on top of whatever scrollable
// content happened to be under it at a given scroll position (confirmed:
// it clipped the last visible Active Cases row at short viewport
// heights). No amount of restyling that button fixes that — it's a
// placement problem, not a colour/shadow one, and "increase page padding
// to leave it room" was explicitly ruled out as a fix here.
// The actual fix: stop floating it over content at all. It now renders
// as a normal in-flow icon button inside AppSidebar's own persistent
// footer (same tier as ActivityBell, right next to it), which by
// construction never has page content rendered underneath it — sidebar
// and main content are separate layout regions, not overlapping ones.
// The response panel reuses ActivityBell's own already-proven
// usePopoverPosition hook (real available-space measurement against the
// viewport, flips up/left near an edge) instead of a hardcoded
// bottom-right offset, and gets the same outside-click/Escape dismissal
// every other popover in this app already has.
// No longer gated to the Home screen — now that it's part of the
// sidebar's persistent chrome rather than a per-screen floating overlay,
// restricting it to one screen would just make it appear/disappear
// inconsistently while navigating; it's available everywhere the sidebar
// is, same as Search/Settings/ActivityBell already are.
export function AskCompassWidget({ showAskCompass, setShowAskCompass, askCompassHistory, setAskCompassHistory, askCompass, askCompassProcessing, setAskCompassProcessing, askCompassInput, setAskCompassInput }) {
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popoverStyle = usePopoverPosition(btnRef, showAskCompass, { minHeight: 320 });

  useEffect(() => {
    if (!showAskCompass) return;
    const onKeyDown = e => { if (e.key === "Escape") setShowAskCompass(false); };
    const onClickOutside = e => { if (ref.current && !ref.current.contains(e.target)) setShowAskCompass(false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onClickOutside); };
  }, [showAskCompass, setShowAskCompass]);

  return(
    <div style={{position:"relative"}} ref={ref}>
      <button ref={btnRef} onClick={()=>setShowAskCompass(v=>!v)} aria-label="Ask Compass — quick HR reference" title="Ask Compass — quick HR reference" style={{position:"relative",background:showAskCompass?COLOR.purpleTint:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"5px 10px",fontSize:13,cursor:"pointer",color:COLOR.inkSoft,fontFamily:FONT.sans,display:"flex",alignItems:"center"}}>
        <CompassLogo size={18}/>
      </button>
      {showAskCompass&&popoverStyle&&(
        <div role="dialog" aria-label="Ask Compass" style={{...popoverStyle,width:360,maxWidth:"calc(100vw - 24px)",background:COLOR.surface,borderRadius:RADIUS.surface,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",border:`1px solid ${COLOR.border}`,zIndex:250,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* 10/10 pass, item 7 (quiet expert assistance) — the gradient
              header + circular chat-bubble avatar read as consumer-AI-
              chatbot theatrics, out of step with every other popover in
              the product (ActivityBell, the portal-error indicator) and
              with GlobalAssistantScreen's own already-plain treatment of
              the exact same feature. Same title/subtitle copy, same
              close control — just no gradient, no icon avatar. */}
          <div style={{padding:"14px 16px",borderBottom:`1px solid ${COLOR.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
            <div>
              <div style={{fontFamily:FONT.serif,fontSize:15,color:COLOR.ink,fontWeight:400}}>Ask Compass</div>
              <div style={{fontSize:10,color:COLOR.inkFaint}}>UK employment law · ACAS · Best practice</div>
            </div>
            <button onClick={()=>setShowAskCompass(false)} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:COLOR.inkFaint,fontSize:20,lineHeight:1,padding:4,flexShrink:0}}>×</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:14,display:"flex",flexDirection:"column",gap:8,minHeight:160}}>
            {askCompassHistory.length===0&&(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <div style={{fontSize:12,color:COLOR.inkFaint,marginBottom:4}}>Ask me anything about UK employment law, ACAS guidance, or HR best practice.</div>
                {/* Design System Convergence pass, Phase 6 — trimmed from
                    4 to the requested max of 3; "Dismissal on zero-hours
                    contract?" (the most narrowly specific of the four)
                    dropped in favour of the three broadest, most
                    frequently useful topics. Every remaining prompt is
                    exactly the same stateless law/ACAS/best-practice
                    question this widget already answers — nothing new
                    promised. */}
                {["ACAS disciplinary process?","Reasonable adjustments?","How long should an investigation take?"].map((q,i)=>(
                  <button key={i} onClick={()=>{setAskCompassHistory([{role:"user",content:q}]);askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}} style={{textAlign:"left",fontSize:12,color:COLOR.inkSoft,background:COLOR.paper,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"8px 12px",cursor:"pointer",fontFamily:FONT.sans,lineHeight:1.4}}>{q}</button>
                ))}
              </div>
            )}
            {askCompassHistory.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"85%",fontSize:12,lineHeight:1.6,padding:"8px 12px",borderRadius:10,background:m.role==="user"?COLOR.purple:COLOR.borderFaint,color:m.role==="user"?"#fff":COLOR.ink}}>{m.role==="assistant"?(()=>{
                  const txt = m.content.replace(/^#{1,6} /gm,"").replace(/\*\*(.+?)\*\*/g,"$1").replace(/\*(.+?)\*/g,"$1");
                  return txt.split("\n").map((line,j)=>{
                    if(!line.trim()) return <div key={j} style={{height:6}}/>;
                    if(/^\d+\./.test(line.trim())) return <div key={j} style={{marginBottom:4,paddingLeft:8,borderLeft:`2px solid ${COLOR.purple}22`}}>{line.trim()}</div>;
                    if(line.trim().startsWith("- ")||line.trim().startsWith("• ")) return <div key={j} style={{marginBottom:3,paddingLeft:8,display:"flex",gap:6}}><span style={{color:COLOR.purple,flexShrink:0}}>·</span><span>{line.trim().slice(2)}</span></div>;
                    if(line.trim()==="---") return <hr key={j} style={{border:"none",borderTop:`1px solid ${COLOR.border}`,margin:"8px 0"}}/>;
                    return <div key={j} style={{marginBottom:4}}>{line.trim()}</div>;
                  });
                })():m.content}</div>
              </div>
            ))}
            {askCompassProcessing&&<div style={{fontSize:12,color:COLOR.inkFaint,fontStyle:"italic"}}>Thinking…</div>}
          </div>
          <div style={{padding:"10px 14px",borderTop:`1px solid ${COLOR.border}`,display:"flex",gap:8,flexShrink:0}}>
            <input value={askCompassInput} onChange={e=>setAskCompassInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&askCompassInput.trim()){const q=askCompassInput.trim();setAskCompassInput("");setAskCompassHistory(h=>[...h,{role:"user",content:q}]);askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}}} placeholder="Ask an HR question…" aria-label="Ask an HR question" style={{flex:1,fontSize:13,border:`1.5px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"8px 12px",background:COLOR.paper,color:COLOR.ink,fontFamily:FONT.sans,outline:"none",minWidth:0}}/>
            <button onClick={()=>{if(askCompassInput.trim()){const q=askCompassInput.trim();setAskCompassInput("");setAskCompassHistory(h=>[...h,{role:"user",content:q}]);askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}}} aria-label="Send" style={{background:COLOR.purple,border:"none",borderRadius:RADIUS.surface,padding:"8px 14px",cursor:"pointer",color:"#fff",fontSize:14,fontWeight:600,flexShrink:0}}>→</button>
          </div>
          {askCompassHistory.length>0&&<div style={{padding:"6px 14px 10px",borderTop:`1px solid ${COLOR.borderFaint}`,display:"flex",justifyContent:"flex-end",flexShrink:0}}><button onClick={()=>setAskCompassHistory([])} style={{fontSize:11,color:COLOR.inkFaint,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans}}>Clear chat</button></div>}
        </div>
      )}
    </div>
  );
}
