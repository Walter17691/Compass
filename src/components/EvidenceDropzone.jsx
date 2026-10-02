import { useState } from 'react';
import { COLOR, TYPE, RADIUS } from '../styles/tokens';

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

  // Wave B.2 brand correction — this resting state was cream (#FDFAF5) behind a
  // beige dashed border (#E8E0D0), left over from the pre-token palette. It was
  // the last warm surface in the Case View and became conspicuous once everything
  // around it moved to white and cool neutrals.
  //
  // Resting: white on a cool neutral dashed border — an empty target, which is
  // what it is. Highlighted (drag-over OR keyboard focus, one shared treatment by
  // design): the Compass purple border over the barely-there purple tint, enough
  // to say "release here" without turning the area into a purple block.
  //
  // There are no uploading/success/error/disabled states to style: this component
  // only forwards the FileList, and rejection is surfaced by the caller as a toast
  // (readEvidenceFiles' onReject). Semantic colour therefore belongs there, not here.
  const borderColor = highlighted ? COLOR.purple : COLOR.border;
  const background  = highlighted ? COLOR.purpleTint : COLOR.surface;

  return (
    <label
      style={{display:"flex",alignItems:"center",justifyContent:"center",border:"2px dashed",
              borderColor,borderRadius:RADIUS.card,padding:"16px",cursor:"pointer",
              background,transition:"border-color 0.15s, background 0.15s"}}
      onDragOver={e=>{e.preventDefault();setDragOver(true);}}
      onDragLeave={()=>setDragOver(false)}
      onDrop={e=>{e.preventDefault();setDragOver(false);onFilesSelected(e.dataTransfer.files);}}
    >
      <input type="file" multiple aria-label={label} onChange={e=>onFilesSelected(e.target.files)} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        style={{position:"absolute",width:1,height:1,padding:0,margin:-1,overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap",border:0}}/>
      <div style={{textAlign:"center"}}>
        <div style={{...TYPE.rowContext,color:highlighted?COLOR.purple:COLOR.inkSoft,fontWeight:500}}>{label}</div>
        <div style={{...TYPE.metadata,color:COLOR.inkQuiet,marginTop:2}}>{hint}</div>
      </div>
    </label>
  );
}
