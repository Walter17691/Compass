import { buildCaseTimeline } from '../lib/caseTimeline';

const TYPE_STYLE = {
  case: { color: "#6B6375", label: "Case" },
  meeting: { color: "#7C5CFC", label: "Meeting" },
  letter: { color: "#B87520", label: "Letter" },
  report: { color: "#7C5CFC", label: "Report" },
  outcome: { color: "#C84B2F", label: "Outcome" },
  allegation: { color: "#C84B2F", label: "Allegation" },
  audit: { color: "#9B9098", label: "Activity" },
};

// Purely a read view over buildCaseTimeline()'s merge — no writes happen
// here, and no new source of truth is introduced. This is Phase 2 of the
// gap-analysis build-out; it renders standalone above the existing
// stage-tab content rather than as a proper workspace tab, since the tab
// restructure itself (Overview/Timeline/Allegations/...) is a later,
// separate phase.
export function TimelinePanel({ cs, allegations, auditLog, fmtDate }) {
  const entries = buildCaseTimeline(cs, allegations, auditLog);

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Timeline ({entries.length})</div>
      </div>
      <div style={{padding:"16px"}}>
        {entries.length===0 && <div style={{fontSize:13,color:"#9B9098"}}>Nothing recorded on this case yet.</div>}
        {entries.map((e, i) => {
          const meta = TYPE_STYLE[e.type] || TYPE_STYLE.audit;
          return (
            <div key={i} style={{display:"flex",gap:12,paddingBottom:i<entries.length-1?14:0,marginBottom:i<entries.length-1?14:0,borderBottom:i<entries.length-1?"1px solid #F5F1EA":"none"}}>
              <div style={{flexShrink:0,width:8,height:8,borderRadius:"50%",background:meta.color,marginTop:5}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,fontWeight:700,color:meta.color,textTransform:"uppercase",letterSpacing:"0.4px"}}>{meta.label}</span>
                  <span style={{fontSize:11,color:"#9B9098"}}>{fmtDate(e.date)}</span>
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
