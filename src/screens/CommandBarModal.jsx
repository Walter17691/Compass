import { useRef, useState } from 'react';
import { useModalA11y } from '../hooks/useModalA11y';

// Integrations & Workflow Automation (Phase 5, IP6/IP7, §25-26) — Command
// Bar + multi-step workflows. Centred palette (Cmd/Ctrl+K), unlike
// AskCompassWidget's corner-docked chat bubble — this is a one-shot
// "type an instruction, review the plan, confirm" flow, not an ongoing
// conversation, so it doesn't need AskCompassWidget's persistent
// history/minimize shape.
//
// IP7 — a single instruction can resolve to several independent steps
// (e.g. "create a task for Sarah Jones to review evidence and open James
// Smith's case"); each one gets its own checkbox rather than an
// all-or-nothing Confirm, so a plan that got one step half-right doesn't
// have to be thrown away and retyped just to drop that one step.
export function CommandBarModal({ show, onClose, input, setInput, processing, plan, error, onSubmit, onConfirm }) {
  const [excludedIndices, setExcludedIndices] = useState(new Set());
  // React's own recommended "reset state when a prop changes" pattern —
  // adjusting state directly during render, guarded by a comparison —
  // rather than a useEffect keyed on `plan`, which would setState
  // synchronously inside an effect on every new plan and trip
  // react-hooks/set-state-in-effect for no real benefit over this.
  const [lastPlan, setLastPlan] = useState(plan);
  if (plan !== lastPlan) {
    setLastPlan(plan);
    setExcludedIndices(new Set());
  }

  // Phase 6.5 hardening (accessibility pass) — replaces a bare useEffect
  // that only moved focus to the input on open: this modal had no
  // role="dialog", no Escape handling, and no Tab trap at all, despite
  // being reachable from anywhere via Cmd/Ctrl+K. useModalA11y's own
  // initial-focus already lands on this same input (it's the first
  // focusable element in the container), so nothing is lost.
  const containerRef = useRef(null);
  useModalA11y(containerRef, onClose, show);

  if (!show) return null;

  const resolvedActions = (plan?.actions || []).filter(a => a.resolved);
  const unresolvedActions = (plan?.actions || []).filter(a => !a.resolved);
  const selectedActions = resolvedActions.filter((_, i) => !excludedIndices.has(i));

  const toggleStep = (i) => {
    setExcludedIndices(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- mouse-only click-outside-to-dismiss convenience; useModalA11y (Escape/focus-trap) and the real Close button below are the actual keyboard paths.
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(26,21,53,0.35)",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"12vh"}}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- stops the backdrop's own onClick(onClose) firing when a click lands on the dialog content itself; not a control in its own right. */}
      <div role="dialog" aria-modal="true" aria-label="Command Bar" ref={containerRef} tabIndex={-1} onClick={e=>e.stopPropagation()} style={{width:520,maxWidth:"90vw",background:"#FFFFFF",borderRadius:16,boxShadow:"0 12px 48px rgba(0,0,0,0.2)",border:"1px solid #E8E0D0",overflow:"hidden"}}>
        <form onSubmit={e=>{e.preventDefault(); if(input.trim() && !processing) onSubmit(input.trim());}} style={{display:"flex",alignItems:"center",gap:10,padding:"14px 18px",borderBottom:(processing||plan||error)?"1px solid #E8E0D0":"none"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Tell Compass what to do…" aria-label="Command Bar instruction"
            style={{flex:1,border:"none",outline:"none",fontSize:15,color:"#1A1535",fontFamily:"DM Sans,system-ui,sans-serif",background:"transparent"}}/>
          <button type="button" onClick={onClose} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:"#9B9098",fontSize:18,lineHeight:1,padding:2}}>×</button>
        </form>

        {processing && <div style={{padding:"14px 18px",fontSize:13,color:"#9B9098",fontStyle:"italic"}}>Working out what to do…</div>}

        {error && !processing && <div style={{padding:"14px 18px",fontSize:13,color:"#C84B2F"}}>{error}</div>}

        {!processing && !error && plan && (
          <div style={{padding:"14px 18px",display:"flex",flexDirection:"column",gap:10}}>
            {resolvedActions.length > 0 && (
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Compass will{resolvedActions.length>1?" — each step below can be turned off":""}</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {resolvedActions.map((a,i)=>(
                    <label key={i} style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:13,color:excludedIndices.has(i)?"#9B9098":"#1A1535",background:excludedIndices.has(i)?"#F5F1EA":"#F5F3FF",border:`1px solid ${excludedIndices.has(i)?"#E8E0D0":"#E8E0FF"}`,borderRadius:8,padding:"8px 12px",cursor:"pointer",textDecoration:excludedIndices.has(i)?"line-through":"none"}}>
                      <input type="checkbox" checked={!excludedIndices.has(i)} onChange={()=>toggleStep(i)} style={{marginTop:2,flexShrink:0,cursor:"pointer"}}/>
                      <span>{a.summary}</span>
                    </label>
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
                <button type="button" disabled={selectedActions.length===0} onClick={()=>onConfirm(selectedActions)} style={{fontSize:12,fontWeight:600,color:"#fff",background:selectedActions.length===0?"#C4B8F8":"#7C5CFC",border:"none",borderRadius:8,padding:"7px 14px",cursor:selectedActions.length===0?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{resolvedActions.length>1?`Confirm ${selectedActions.length} of ${resolvedActions.length}`:"Confirm"}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
