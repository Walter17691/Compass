import { useEffect, useRef } from 'react';
import { usePopoverPosition } from '../hooks/usePopoverPosition';
import { FONT, COLOR } from '../styles/tokens';

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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
      {showAskCompass&&popoverStyle&&(
        <div role="dialog" aria-label="Ask Compass" style={{...popoverStyle,width:360,maxWidth:"calc(100vw - 24px)",background:"#FFFFFF",borderRadius:16,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",border:"1px solid #E8E0D0",zIndex:250,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid #E8E0D0",display:"flex",alignItems:"center",justifyContent:"space-between",background:"linear-gradient(135deg,#EDE8FF 0%,#FDFAF5 100%)",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:"#7C5CFC",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div>
                <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:15,color:"#1C1820",fontWeight:400}}>Ask Compass</div>
                <div style={{fontSize:10,color:"#9B9098"}}>UK employment law · ACAS · Best practice</div>
              </div>
            </div>
            <button onClick={()=>setShowAskCompass(false)} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:"#9B9098",fontSize:20,lineHeight:1,padding:4,flexShrink:0}}>×</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:14,display:"flex",flexDirection:"column",gap:8,minHeight:160}}>
            {askCompassHistory.length===0&&(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <div style={{fontSize:12,color:"#9B9098",marginBottom:4}}>Ask me anything about UK employment law, ACAS guidance, or HR best practice.</div>
                {["ACAS disciplinary process?","Dismissal on zero-hours contract?","Reasonable adjustments?","How long should an investigation take?"].map((q,i)=>(
                  <button key={i} onClick={()=>{setAskCompassHistory([{role:"user",content:q}]);askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}} style={{textAlign:"left",fontSize:12,color:"#6B6375",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"8px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",lineHeight:1.4}}>{q}</button>
                ))}
              </div>
            )}
            {askCompassHistory.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"85%",fontSize:12,lineHeight:1.6,padding:"8px 12px",borderRadius:10,background:m.role==="user"?"#7C5CFC":"#F5F1EA",color:m.role==="user"?"#fff":"#1C1820"}}>{m.role==="assistant"?(()=>{
                  const txt = m.content.replace(/^#{1,6} /gm,"").replace(/\*\*(.+?)\*\*/g,"$1").replace(/\*(.+?)\*/g,"$1");
                  return txt.split("\n").map((line,j)=>{
                    if(!line.trim()) return <div key={j} style={{height:6}}/>;
                    if(/^\d+\./.test(line.trim())) return <div key={j} style={{marginBottom:4,paddingLeft:8,borderLeft:"2px solid #7C5CFC22"}}>{line.trim()}</div>;
                    if(line.trim().startsWith("- ")||line.trim().startsWith("• ")) return <div key={j} style={{marginBottom:3,paddingLeft:8,display:"flex",gap:6}}><span style={{color:"#7C5CFC",flexShrink:0}}>·</span><span>{line.trim().slice(2)}</span></div>;
                    if(line.trim()==="---") return <hr key={j} style={{border:"none",borderTop:"1px solid #E8E0D0",margin:"8px 0"}}/>;
                    return <div key={j} style={{marginBottom:4}}>{line.trim()}</div>;
                  });
                })():m.content}</div>
              </div>
            ))}
            {askCompassProcessing&&<div style={{fontSize:12,color:"#9B9098",fontStyle:"italic"}}>Thinking…</div>}
          </div>
          <div style={{padding:"10px 14px",borderTop:"1px solid #E8E0D0",display:"flex",gap:8,flexShrink:0}}>
            <input value={askCompassInput} onChange={e=>setAskCompassInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&askCompassInput.trim()){const q=askCompassInput.trim();setAskCompassInput("");setAskCompassHistory(h=>[...h,{role:"user",content:q}]);askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}}} placeholder="Ask an HR question…" aria-label="Ask an HR question" style={{flex:1,fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"8px 12px",background:"#FDFAF5",color:"#1C1820",fontFamily:"DM Sans,system-ui,sans-serif",outline:"none",minWidth:0}}/>
            <button onClick={()=>{if(askCompassInput.trim()){const q=askCompassInput.trim();setAskCompassInput("");setAskCompassHistory(h=>[...h,{role:"user",content:q}]);askCompass(q,askCompassHistory,setAskCompassHistory,setAskCompassProcessing);}}} aria-label="Send" style={{background:"#7C5CFC",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",color:"#fff",fontSize:14,fontWeight:600,flexShrink:0}}>→</button>
          </div>
          {askCompassHistory.length>0&&<div style={{padding:"6px 14px 10px",borderTop:"1px solid #F5F1EA",display:"flex",justifyContent:"flex-end",flexShrink:0}}><button onClick={()=>setAskCompassHistory([])} style={{fontSize:11,color:"#9B9098",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Clear chat</button></div>}
        </div>
      )}
    </div>
  );
}
