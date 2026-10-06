import { useRef, useState, useEffect } from 'react';
import { MDRenderer } from './MDRenderer';
import { useModalA11y } from '../hooks/useModalA11y';
import { snapshotDivergence } from '../lib/signedSnapshot';
import { confirmationSemantics, confirmationSemanticsFor, provenanceLine } from '../lib/confirmationSemantics';
import { fmtSignatureInstant } from '../lib/meetingTiming';

// ─────────────────────────────────────────────────────────────────────────
// WHAT THE PARTICIPANT ACTUALLY SIGNED.
//
// ┌─ THE DEFECT THIS FIXES ─────────────────────────────────────────────────┐
// │ This modal rendered `meeting.record` — the CURRENT, mutable meeting text │
// │ — under the heading "Signed copy", with "Signed by X on Y" beneath it.   │
// │ Because a COMPLETED meeting can still be re-saved (the save path permits │
// │ COMPLETED -> COMPLETED), any later edit was presented, by Compass's own  │
// │ initiative, as the text the employee had signed. That is not a display   │
// │ bug; it is the product asserting something untrue about a person's       │
// │ agreement.                                                              │
// │                                                                         │
// │ The authoritative artefact already existed: signing_requests.document,   │
// │ written once when the request is created and never patched by any code   │
// │ path. So this reads THAT, and no second source of truth was invented.   │
// └─────────────────────────────────────────────────────────────────────────┘
//
// IT NEVER FALLS BACK TO THE CURRENT TEXT. If the snapshot cannot be loaded, the
// modal says so and shows nothing. A silent fallback would reintroduce the exact
// defect under a different code path, and "we could not retrieve it" is the
// honest answer — the alternative is a confident lie.
//
// Where the record HAS moved on since signing, that is stated plainly rather
// than hidden: the signed copy is still the signed copy, and the reader is told
// the working record now differs.
// ─────────────────────────────────────────────────────────────────────────

const LOAD = { PENDING: 'pending', OK: 'ok', FAILED: 'failed', UNAVAILABLE: 'unavailable' };

export function SignedRecordModal({ meeting, fmtDate, onClose, loadSignedSnapshot }) {
  const containerRef = useRef(null);
  useModalA11y(containerRef, onClose);

  // Whether a snapshot can be fetched at all is knowable at render time, so it is
  // the INITIAL state rather than something an effect sets synchronously and then
  // immediately corrects.
  const canLoad = !!meeting?.signId && typeof loadSignedSnapshot === 'function';
  const [state, setState] = useState(canLoad ? LOAD.PENDING : LOAD.UNAVAILABLE);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!canLoad) return undefined;
    (async () => {
      try {
        const res = await loadSignedSnapshot(meeting.signId);
        if (cancelled) return;
        // `restricted` is api/signing.js's public-window response shape; an
        // authenticated internal read should never hit it, but if it does, the
        // document genuinely is not in the payload and must not be invented.
        if (res && typeof res.document === 'string' && res.document.trim()) {
          setSnapshot(res);
          setState(LOAD.OK);
        } else {
          setState(LOAD.UNAVAILABLE);
        }
      } catch {
        if (!cancelled) setState(LOAD.FAILED);
      }
    })();
    return () => { cancelled = true; };
  }, [canLoad, meeting?.signId, loadSignedSnapshot]);

  // ONE exhaustive map, no ternary chain and no default that implies agreement.
  // The previous version fell through to "Signed copy" for `expired` and
  // `proceeded`, rendering silence as a signature — see confirmationSemantics.js.
  // TRUST-SIG-02 — comment-aware. A signature WITH a response must not read as
  // an unqualified one. The snapshot is preferred because it is the
  // authoritative row; the mirrored meeting fields are a convenience copy.
  const semantics = confirmationSemanticsFor(meeting.signStatus, snapshot || meeting);
  const heading = semantics.heading;
  // Gated on what Compass actually HOLDS, not on whether the state implies
  // agreement. Those were one flag; a signature with comments needs the image
  // shown while not reading as agreement, and `signed_externally` needs the
  // opposite — a real signature Compass does not hold.
  const showSignatureImage = semantics.signatureCaptured;

  // Provenance comes from the SNAPSHOT where the snapshot loaded, because that
  // row is the authoritative one; the mirrored meeting fields are a convenience
  // copy and could in principle lag.
  const signerName = snapshot?.employee_name || meeting.signerName;
  const signedAt = snapshot?.signed_at || meeting.signedAt;
  const signatureImg = snapshot?.signature || meeting.signature;
  const comment = snapshot?.participant_comment || meeting.participantComment || null;
  const commentAt = snapshot?.participant_comment_at || meeting.participantCommentAt || null;

  const divergence = state === LOAD.OK ? snapshotDivergence(snapshot.document, meeting.record) : null;

  const panel = { background: "#FDFAF5", border: "1px solid #EDE5D8", borderRadius: 8, padding: 16 };
  const notice = { fontSize: 12, lineHeight: 1.6, borderRadius: 8, padding: "10px 12px", marginBottom: 16 };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="signed-record-title" ref={containerRef} tabIndex={-1}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:4000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:640,maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{fontSize:11,fontWeight:700,color: semantics.impliesAgreement ? "#1A7A4A" : "#B87520",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{heading}</div>
        <h3 id="signed-record-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",marginBottom:6,fontWeight:400}}>{meeting.type || "Meeting"} — {fmtDate(meeting.date)}</h3>
        <p style={{fontSize:13,color:"#6B6375",marginBottom:20}}>
          {provenanceLine(meeting.signStatus, { name: signerName, at: signedAt, fmtDate, fmtInstant: fmtSignatureInstant })}
          {/* §4 — the comment and the signature arrive in ONE atomic submission
              (api/signing.js builds a single patch and both timestamps come from
              the same server clock), so presenting two dates implied two
              independently verified events. Where the instants differ the second
              IS a separate fact and is still shown. */}
          {commentAt && signedAt && commentAt !== signedAt
            ? ` — comments recorded ${fmtSignatureInstant(commentAt)}`
            : ""}
          {commentAt && (!signedAt || commentAt === signedAt)
            ? " — submitted with comments"
            : ""}
        </p>
        {/* The manager's own decision, shown SEPARATELY from participant
            provenance so "proceeded" can never read as something the
            participant did. proceeded_from_status keeps the chain legible:
            sent -> expired -> proceeded stays visible as a sequence. */}
        {meeting.proceededAt && (
          <p style={{fontSize:12,color:"#7A5C1A",background:"#FEF5E7",border:"1px solid #F5E6C4",borderRadius:8,padding:"8px 10px",marginBottom:16,lineHeight:1.6}}>
            Proceeded without participant confirmation on {fmtDate(meeting.proceededAt)}
            {meeting.proceededFromStatus ? ` — the request was ${confirmationSemantics(meeting.proceededFromStatus).stateLine.toLowerCase()} at the time` : ""}.
            {meeting.proceedReason ? ` Reason recorded: ${meeting.proceedReason}` : ""}
          </p>
        )}

        {state === LOAD.PENDING && (
          <div style={{...notice, background:"#F6F5FA", border:"1px solid #E8EAF2", color:"#4A4E63"}}>
            Retrieving the exact document that was issued…
          </div>
        )}

        {(state === LOAD.FAILED || state === LOAD.UNAVAILABLE) && (
          <div role="status" style={{...notice, background:"#FEF5E7", border:"1px solid #F5E6C4", color:"#7A5C1A"}}>
            <strong>The issued document could not be retrieved.</strong>{" "}
            {state === LOAD.FAILED
              ? "This is a connection problem — try again in a moment."
              : "Compass has no stored copy of the document for this request."}{" "}
            The current working record is deliberately not shown here instead: it may have
            changed since, and showing it would misrepresent what was issued.
          </div>
        )}

        {state === LOAD.OK && divergence?.diverged && (
          <div role="status" style={{...notice, background:"#FEF5E7", border:"1px solid #F5E6C4", color:"#7A5C1A"}}>
            <strong>The working record has changed since this was issued.</strong>{" "}
            The document below is unchanged — it is exactly what the participant received.
            The case file's current record now says something different.
          </div>
        )}

        {state === LOAD.OK && (
          <div style={{...panel, marginBottom:20, fontSize:13, color:"#1A1535", lineHeight:1.7, maxHeight:320, overflowY:"auto"}}>
            <MDRenderer text={snapshot.document}/>
          </div>
        )}

        {comment && (
          <div style={{...panel, marginBottom:20, borderColor:"#F5E6C4", background:"#FFFDF8"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#7A5C1A",letterSpacing:0.5,textTransform:"uppercase",marginBottom:8}}>
              {signerName ? `${signerName}'s comments` : "Participant's comments"}
              {commentAt ? ` — ${fmtSignatureInstant(commentAt)}` : ""}
            </div>
            <div style={{fontSize:13,color:"#1A1535",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{comment}</div>
            <div style={{fontSize:11,color:"#9B9098",marginTop:10}}>
              Recorded alongside the document above. The record itself was not changed by this comment.
            </div>
          </div>
        )}

        {showSignatureImage && signatureImg && (
          <div style={{marginBottom:20,padding:16,background:"#FDFAF5",borderRadius:8,border:"1px solid #EDE5D8"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#9B9098",letterSpacing:0.5,textTransform:"uppercase",marginBottom:8}}>Employee signature</div>
            <img src={signatureImg} alt={`${signerName || "Employee"}'s signature`} style={{maxWidth:280,background:"#fff",borderRadius:4,padding:8,border:"1px solid #E8E0D0"}}/>
          </div>
        )}

        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{fontSize:13,color:"#6B6375",background:"none",border:"1px solid #E8E0D0",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Close</button>
        </div>
      </div>
    </div>
  );
}
