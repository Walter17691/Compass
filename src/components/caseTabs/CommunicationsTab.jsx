import { buildCommunicationsView } from '../../lib/communications';

const TYPE_STYLE = {
  meeting: { color: "#7C5CFC", label: "Meeting" },
  letter: { color: "#B87520", label: "Letter" },
  email: { color: "#5E627A", label: "Email" },
};

const SIGNATURE_BADGE_STYLE = {
  sent: { color: "#B87520", bg: "#FEF5E7" },
  opened: { color: "#B87520", bg: "#FEF5E7" },
  signed: { color: "#1A7A4A", bg: "#E8F5EE" },
  acknowledged: { color: "#1A7A4A", bg: "#E8F5EE" },
  declined: { color: "#C84B2F", bg: "#FEF0EB" },
  expired: { color: "#6B6375", bg: "#F5F1EA" },
};

// Integrations & Workflow Automation (Phase 5, IP31, §28) — a unified
// per-case view of every email, letter, and meeting invitation, with
// each one's signature/acknowledgement status shown alongside it where
// one exists. Pure read view over lib/communications.js's own merge of
// caseTimeline.js's existing entries — no new source of truth, and
// reuses CaseViewScreen's existing openTimelineSource for "Open source"
// (a meeting or letter is opened the same way whether reached from here
// or from the Timeline tab).
export function CommunicationsTab({ cs, allegations, auditLog, fmtDate, onOpenSource }) {
  const entries = buildCommunicationsView(cs, allegations, auditLog);

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#7C5CFC"}}>Communications ({entries.length})</div>
      </div>
      <div style={{padding:"16px"}}>
        {entries.length===0 && <div style={{fontSize:13,color:"#9B9098"}}>No emails, letters or meeting invitations recorded on this case yet.</div>}
        {entries.map((e, i) => {
          const meta = TYPE_STYLE[e.type] || TYPE_STYLE.email;
          const sigStyle = e.signatureStatus && SIGNATURE_BADGE_STYLE[e.signatureStatus];
          return (
            <div key={e.key} style={{display:"flex",gap:12,paddingBottom:i<entries.length-1?14:0,marginBottom:i<entries.length-1?14:0,borderBottom:i<entries.length-1?"1px solid #F5F1EA":"none"}}>
              <div style={{flexShrink:0,width:8,height:8,borderRadius:"50%",background:meta.color,marginTop:5}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,fontWeight:700,color:meta.color}}>{meta.label}</span>
                  <span style={{fontSize:11,color:"#9B9098"}}>{fmtDate(e.date)}</span>
                  {sigStyle&&<span style={{fontSize:10,fontWeight:600,color:sigStyle.color,background:sigStyle.bg,borderRadius:4,padding:"1px 7px"}}>{e.signatureStatusLabel}</span>}
                  {e.linkTo && onOpenSource && <button onClick={()=>onOpenSource(e.linkTo)} style={{fontSize:11,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0}}>Open source</button>}
                </div>
                <div style={{fontSize:13,color:"#1A1535",marginTop:2}}>{e.description}</div>
                {e.actor && <div style={{fontSize:11,color:"#9B9098",marginTop:1}}>{e.actor}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
