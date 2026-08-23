import { useRef, useState } from 'react';
import { Btn } from './Primitives';
import { useModalA11y } from '../hooks/useModalA11y';

// In-app replacement for window.prompt() — collects one or more fields in a
// single styled form instead of chaining native prompt() popups (which are
// unstyled, block all other interaction, and lose everything already typed
// if the user cancels partway through a sequence).
export function PromptModal({ title, message, fields, confirmLabel="Save", cancelLabel="Cancel", onConfirm, onCancel }) {
  const [values, setValues] = useState(()=>Object.fromEntries(fields.map(f=>[f.key, f.defaultValue||""])));
  const isValidEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const canConfirm = fields.every(f=>{
    const v = values[f.key]?.trim();
    if(f.required && !v) return false;
    if(v && f.type==="email" && !isValidEmail(v)) return false;
    return true;
  });
  const containerRef = useRef(null);
  useModalA11y(containerRef, onCancel);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="prompt-modal-title" ref={containerRef} tabIndex={-1}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:4000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:440}}>
        {title && <h3 id="prompt-modal-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:8,fontWeight:400}}>{title}</h3>}
        {message && <p style={{fontSize:13,color:"#6B6375",marginBottom:20,lineHeight:1.6}}>{message}</p>}
        <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:24}}>
          {fields.map((f)=>(
            <div key={f.key}>
              <label htmlFor={`prompt-modal-${f.key}`} style={{display:"block",fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:6}}>
                {f.label}{f.required&&<span style={{color:"#C84B2F"}}> *</span>}
              </label>
              <input id={`prompt-modal-${f.key}`} type={f.type||"text"} value={values[f.key]||""} placeholder={f.placeholder||""}
                onChange={e=>setValues(v=>({...v,[f.key]:e.target.value}))}
                onKeyDown={e=>{ if(e.key==="Enter"&&canConfirm) onConfirm(values); }}
                style={{width:"100%",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#1A1535",outline:"none",boxSizing:"border-box",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <Btn variant="ghost" onClick={onCancel}>{cancelLabel}</Btn>
          <Btn variant="primary" onClick={()=>onConfirm(values)} disabled={!canConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}
