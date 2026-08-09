import { useState } from 'react';

// Presentational drag-and-drop / click-to-browse target — forwards the
// native FileList to onFilesSelected and leaves reading/validation to the
// caller (src/lib/evidenceUpload.js's readEvidenceFiles), since what
// happens with the files differs by context (write straight to an
// existing case vs. stage locally until a new case is created).
export function EvidenceDropzone({ onFilesSelected, label = "Drop files or click to upload", hint = "Images, PDFs, docs, video — max 15MB each" }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <label
      style={{display:"flex",alignItems:"center",justifyContent:"center",border:"2px dashed",borderColor:dragOver?"#7C5CFC":"#E8E0D0",borderRadius:8,padding:"16px",cursor:"pointer",background:dragOver?"#F5F3FF":"#FDFAF5",transition:"all 0.15s"}}
      onDragOver={e=>{e.preventDefault();setDragOver(true);}}
      onDragLeave={()=>setDragOver(false)}
      onDrop={e=>{e.preventDefault();setDragOver(false);onFilesSelected(e.dataTransfer.files);}}
    >
      <input type="file" multiple onChange={e=>onFilesSelected(e.target.files)} style={{display:"none"}}/>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:13,color:"#6B6375",fontWeight:500}}>{label}</div>
        <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{hint}</div>
      </div>
    </label>
  );
}
