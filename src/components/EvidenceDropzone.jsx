import { useState } from 'react';

// Presentational drag-and-drop / click-to-browse target — forwards the
// native FileList to onFilesSelected and leaves reading/validation to the
// caller (src/lib/evidenceUpload.js's readEvidenceFiles), since what
// happens with the files differs by context (write straight to an
// existing case vs. stage locally until a new case is created).
export function EvidenceDropzone({ onFilesSelected, label = "Drop files or click to upload", hint = "Images, PDFs, docs, video — max 15MB each" }) {
  const [dragOver, setDragOver] = useState(false);
  // Phase 6.5 hardening (accessibility pass) — was style={{display:"none"}}
  // on the input: that removes an element from the tab order entirely, so
  // a keyboard-only user had no way to reach this control at all (a mouse
  // user could click the wrapping <label>, which natively forwards the
  // click, but Tab skipped straight past it). The standard
  // visually-hidden-but-focusable technique keeps it out of the visual
  // layout without removing it from the accessibility tree, and `focused`
  // reuses the exact same border/background highlight already built for
  // drag-over — same visual language, just a second trigger for it.
  const [focused, setFocused] = useState(false);
  const highlighted = dragOver || focused;

  return (
    <label
      style={{display:"flex",alignItems:"center",justifyContent:"center",border:"2px dashed",borderColor:highlighted?"#7C5CFC":"#E8E0D0",borderRadius:8,padding:"16px",cursor:"pointer",background:highlighted?"#F5F3FF":"#FDFAF5",transition:"all 0.15s"}}
      onDragOver={e=>{e.preventDefault();setDragOver(true);}}
      onDragLeave={()=>setDragOver(false)}
      onDrop={e=>{e.preventDefault();setDragOver(false);onFilesSelected(e.dataTransfer.files);}}
    >
      <input type="file" multiple aria-label={label} onChange={e=>onFilesSelected(e.target.files)} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        style={{position:"absolute",width:1,height:1,padding:0,margin:-1,overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap",border:0}}/>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:13,color:"#6B6375",fontWeight:500}}>{label}</div>
        <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{hint}</div>
      </div>
    </label>
  );
}
