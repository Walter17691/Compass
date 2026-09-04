import { deriveDocumentsForCase } from '../../lib/caseDocuments';
import { fmtBytes } from '../../lib/evidenceUpload';
import { CORRESPONDENCE_TYPE_LABELS } from '../../lib/letterSend';
import { FONT } from '../../styles/tokens';

const KIND_LABEL = { letter: "Letter", report: "Report", evidence: "File" };
const KIND_COLOR = { letter: "#B87520", report: "#7C5CFC", evidence: "#6B6375" };

// Integrations & Workflow Automation (Phase 5, IP12, §6) — three new
// draft types (witness invitation, evidence request, OH consent
// request), populated from the same case/employee context every other
// letter type already reads (see handleLetter's letterInstructions,
// App.jsx) — no new grounding logic, just new instruction text and an
// entry point onto it. Labels come from lib/letterSend.js (not a local
// copy) — IP13's send-from-Compass workflow matches a completed task's
// name against these exact same strings, so they can never drift apart.
const CORRESPONDENCE_TYPES = Object.entries(CORRESPONDENCE_TYPE_LABELS).map(([id, label]) => ({ id, label }));

// Phase 7 of the gap-analysis build-out folds into this same tab, since
// it's the same "aggregate what already exists, no migration" scope —
// see src/lib/caseDocuments.js. Letters open in the existing Letter
// screen (same as everywhere else generated letters are viewed); evidence
// files download the same way the Evidence tab already does.
export function DocumentsTab({ cs, setLetterOutput, setScreen, screens, fmtDate, onGenerateHearingPack, hearingPackGenerating, hearingPackReady, onDismissHearingPackReady, onDraftCorrespondence }) {
  const docs = deriveDocumentsForCase(cs);
  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div style={{fontSize:14,fontWeight:700,color:"#7C5CFC"}}>Documents ({docs.length})</div>
        {onGenerateHearingPack&&(
          <button onClick={()=>onGenerateHearingPack(cs)} disabled={!!hearingPackGenerating} style={{fontSize:11,fontWeight:600,color:"#fff",background:hearingPackGenerating?"#C4B8F8":"#7C5CFC",border:"none",borderRadius:6,padding:"6px 12px",cursor:hearingPackGenerating?"not-allowed":"pointer",fontFamily:FONT.sans,flexShrink:0}}>{hearingPackGenerating?"Generating…":"Generate Hearing Pack"}</button>
        )}
      </div>
      {/* Human UAT remediation, Batch 2 hardening — the original UAT
          complaint was that a generated pack "should pop up when
          generated rather than just appearing below which is not
          obvious". This sits immediately below the Generate button (right
          where the user's attention already is) the moment generation
          finishes, and stays until dismissed or a fresh generation
          replaces it — unlike the toast alone, it doesn't disappear in a
          few seconds with no way to act on it. */}
      {hearingPackReady&&(
        <div style={{padding:"10px 16px",background:"#E8F5EE",borderBottom:"1px solid #D5EBDF",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div style={{fontSize:13,color:"#1A7A4A",fontWeight:600}}>Hearing pack ready</div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
            <button onClick={()=>window.open(hearingPackReady.dataUrl,"_blank")} style={{fontSize:11,fontWeight:600,color:"#fff",background:"#1A7A4A",border:"none",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontFamily:FONT.sans}}>Review</button>
            <button onClick={onDismissHearingPackReady} aria-label="Dismiss" style={{fontSize:13,color:"#6B6375",background:"none",border:"none",cursor:"pointer",padding:"2px 4px"}}>×</button>
          </div>
        </div>
      )}
      {onDraftCorrespondence&&(
        <div style={{padding:"12px 16px",borderBottom:"1px solid #F5F1EA",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:"#9B9098"}}>Draft:</span>
          {CORRESPONDENCE_TYPES.map(t=>(
            <button key={t.id} onClick={()=>onDraftCorrespondence(cs, t.id)} style={{fontSize:11,color:"#6B6375",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:FONT.sans}}>{t.label}</button>
          ))}
        </div>
      )}
      <div style={{padding:"16px"}}>
        {docs.length===0 && <div style={{fontSize:13,color:"#9B9098"}}>No letters or files on this case yet.</div>}
        {docs.map((d,i) => (
          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #F5F1EA",gap:12}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,color:"#1A1535",fontWeight:500}}>{d.label}</div>
              <div style={{display:"flex",gap:6,marginTop:2,alignItems:"center"}}>
                <span style={{fontSize:9,fontWeight:700,color:KIND_COLOR[d.kind],background:KIND_COLOR[d.kind]+"18",borderRadius:4,padding:"1px 6px"}}>{KIND_LABEL[d.kind]}</span>
                <span style={{fontSize:11,color:"#9B9098"}}>{fmtDate(d.date)}{d.size?" · "+fmtBytes(d.size):""}</span>
              </div>
            </div>
            {(d.kind==="letter"||d.kind==="report")&&(
              <button onClick={()=>{setLetterOutput(d.content);setScreen(screens.LETTER);}} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:4,padding:"4px 10px",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500,flexShrink:0}}>View</button>
            )}
            {d.kind==="evidence"&&d.dataUrl&&(
              <a href={d.dataUrl} download={d.label} style={{fontSize:11,color:"#7C5CFC",background:"#EDE8FF",borderRadius:4,padding:"4px 10px",textDecoration:"none",fontWeight:500,flexShrink:0}}>Download</a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
