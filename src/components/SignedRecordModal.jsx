import { useRef } from 'react';
import { MDRenderer } from './MDRenderer';
import { useModalA11y } from '../hooks/useModalA11y';

// Human UAT remediation, Batch 2, Part 9 — a signed meeting record's
// actual signature (App.jsx's signature-sync effect already syncs
// m.signature down from signing_requests) had nowhere to be seen inside
// Compass at all. The MeetingsTab badge/caption already said who signed
// it and when (Batch 1, Issue 2), and "View notes" opened the plain
// record text (ReviewScreen) — but the drawn signature itself, and any
// visual confirmation this specific document was the one actually
// signed, was only ever viewable on the external, unauthenticated
// /sign/[id] link (public/sign.html) — which api/signing.js's own
// isPastPublicViewWindow deliberately makes unusable again a limited
// time after it was actioned, for the signer's privacy. That left no
// durable way for HR to retrieve what an employee actually signed once
// that window passed. This is a dedicated, always-available, read-only
// view inside the case itself — not a second editable copy of the
// record (ReviewScreen's "View notes" still owns that), and not a
// second signature-status source of truth (still reads the exact same
// m.signStatus/m.signedAt/m.signerName/m.signature fields MeetingsTab's
// own badge already reads).
export function SignedRecordModal({ meeting, fmtDate, onClose }) {
  const containerRef = useRef(null);
  useModalA11y(containerRef, onClose);
  const acknowledged = meeting.signStatus === 'acknowledged';
  const cleanRecord = (meeting.record || '').replace(/^## /gm, '').replace(/^# /gm, '').replace(/\*\*/g, '');
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="signed-record-title" ref={containerRef} tabIndex={-1}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:4000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:640,maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#1A7A4A",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{acknowledged ? "Acknowledged copy" : "Signed copy"}</div>
        <h3 id="signed-record-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:6,fontWeight:400}}>{meeting.type || "Meeting"} — {fmtDate(meeting.date)}</h3>
        <p style={{fontSize:13,color:"#6B6375",marginBottom:20}}>
          {acknowledged ? "Acknowledged" : "Signed"}{meeting.signerName ? ` by ${meeting.signerName}` : ""}{meeting.signedAt ? ` on ${fmtDate(meeting.signedAt)}` : ""}
        </p>

        <div style={{background:"#FDFAF5",border:"1px solid #EDE5D8",borderRadius:8,padding:16,marginBottom:20,fontSize:13,color:"#1A1535",lineHeight:1.7,maxHeight:320,overflowY:"auto"}}>
          <MDRenderer text={cleanRecord}/>
        </div>

        {!acknowledged && meeting.signature && (
          <div style={{marginBottom:20,padding:16,background:"#FDFAF5",borderRadius:8,border:"1px solid #EDE5D8"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#9B9098",letterSpacing:0.5,textTransform:"uppercase",marginBottom:8}}>Employee signature</div>
            <img src={meeting.signature} alt={`${meeting.signerName || "Employee"}'s signature`} style={{maxWidth:280,background:"#fff",borderRadius:4,padding:8,border:"1px solid #E8E0D0"}}/>
          </div>
        )}

        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{fontSize:13,color:"#6B6375",background:"none",border:"1px solid #E8E0D0",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Close</button>
        </div>
      </div>
    </div>
  );
}
