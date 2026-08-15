import { useEffect, useRef } from 'react';

// Integrations & Workflow Automation (Phase 5, IP6, §25) — Command Bar.
// Centred palette (Cmd/Ctrl+K), unlike AskCompassWidget's corner-docked
// chat bubble — this is a one-shot "type an instruction, review the
// plan, confirm" flow, not an ongoing conversation, so it doesn't need
// AskCompassWidget's persistent history/minimize shape.
export function CommandBarModal({ show, onClose, input, setInput, processing, plan, error, onSubmit, onConfirm }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (show) inputRef.current?.focus();
  }, [show]);

  if (!show) return null;

  const resolvedActions = (plan?.actions || []).filter(a => a.resolved);
  const unresolvedActions = (plan?.actions || []).filter(a => !a.resolved);

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(26,21,53,0.35)",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"12vh"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:520,maxWidth:"90vw",background:"#FFFFFF",borderRadius:16,boxShadow:"0 12px 48px rgba(0,0,0,0.2)",border:"1px solid #E8E0D0",overflow:"hidden"}}>
        <form onSubmit={e=>{e.preventDefault(); if(input.trim() && !processing) onSubmit(input.trim());}} style={{display:"flex",alignItems:"center",gap:10,padding:"14px 18px",borderBottom:(processing||plan||error)?"1px solid #E8E0D0":"none"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} placeholder="Tell Compass what to do…" aria-label="Command Bar instruction"
            style={{flex:1,border:"none",outline:"none",fontSize:15,color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif",background:"transparent"}}/>
          <button type="button" onClick={onClose} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:"#9B9098",fontSize:18,lineHeight:1,padding:2}}>×</button>
        </form>

        {processing && <div style={{padding:"14px 18px",fontSize:13,color:"#9B9098",fontStyle:"italic"}}>Working out what to do…</div>}

        {error && !processing && <div style={{padding:"14px 18px",fontSize:13,color:"#C84B2F"}}>{error}</div>}

        {!processing && !error && plan && (
          <div style={{padding:"14px 18px",display:"flex",flexDirection:"column",gap:10}}>
            {resolvedActions.length > 0 && (
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Compass will</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {resolvedActions.map((a,i)=>(
                    <div key={i} style={{fontSize:13,color:"#1A1535",background:"#F5F3FF",border:"1px solid #E8E0FF",borderRadius:8,padding:"8px 12px"}}>{a.summary}</div>
                  ))}
                </div>
              </div>
            )}
            {unresolvedActions.map((a,i)=>(
              <div key={i} style={{fontSize:12,color:"#C84B2F"}}>{a.summary}</div>
            ))}
            {plan.clarification && <div style={{fontSize:12,color:"#9B9098"}}>{plan.clarification}</div>}
            {resolvedActions.length === 0 && !plan.clarification && unresolvedActions.length === 0 && (
              <div style={{fontSize:12,color:"#9B9098"}}>Compass couldn't work out an action from that — try naming the employee and what to do.</div>
            )}
            {resolvedActions.length > 0 && (
              <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:2}}>
                <button type="button" onClick={onClose} style={{fontSize:12,color:"#6B6375",background:"none",border:"1px solid #E8E0D0",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Cancel</button>
                <button type="button" onClick={onConfirm} style={{fontSize:12,fontWeight:600,color:"#fff",background:"#7C5CFC",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Confirm</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
