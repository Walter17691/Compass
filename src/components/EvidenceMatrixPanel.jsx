import { evidenceForAllegation, allegationStatusMeta } from '../lib/allegations';
import { Btn } from './Primitives';

const cellStyle = { padding:"10px 12px", verticalAlign:"top", fontSize:12, color:"#1A1535", borderBottom:"1px solid #F5F1EA" };
const headStyle = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:700, color:"#9B9098", textTransform:"uppercase", letterSpacing:0.5, borderBottom:"1px solid #E8E0D0" };

function EvidenceChip({ ev, onOpen }) {
  return (
    <button onClick={()=>onOpen(ev)} title="Open original evidence"
      style={{display:"block",width:"100%",textAlign:"left",fontSize:11,background:"#FDFAF5",border:"1px solid #EDE5D8",borderRadius:5,padding:"3px 7px",marginBottom:3,color:"#1A1535",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
      {ev.name}
    </button>
  );
}

// The grid view AllegationsPanel's per-allegation cards don't provide — one
// row per allegation across every column the spec asks for, so a case's
// evidence position is visible at a glance rather than by expanding each
// allegation in turn. Reads the exact same underlying data (allegation
// fields, evidence stance links via evidenceForAllegation) — this is a
// view over that data, not a second source of truth. AI suggestions are
// proposals only; accepting one calls the same linkEvidenceToAllegation()
// path the manual "Link existing evidence" dropdown already uses.
export function EvidenceMatrixPanel({ cs, allegations, suggestions, suggestionsLoading, onGenerateSuggestions, onAcceptSuggestion, onRejectSuggestion, onOpenEvidence }) {
  if (!allegations.length) return null;
  const evidence = cs.evidence || [];
  const unlinkedCount = evidence.filter(ev => !ev.allegationId).length;

  return (
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:0.5,textTransform:"uppercase"}}>Evidence matrix</div>
        {unlinkedCount>0 && (
          <button onClick={()=>onGenerateSuggestions(cs)} disabled={suggestionsLoading}
            style={{fontSize:11,background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 10px",color:"#6B6375",cursor:suggestionsLoading?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
            {suggestionsLoading?"Reviewing evidence…":`Suggest links for ${unlinkedCount} unlinked item${unlinkedCount===1?"":"s"}`}
          </button>
        )}
      </div>

      {suggestions.length>0 && (
        <div style={{background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:8,padding:12,marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:600,color:"#5B3FD4",marginBottom:8}}>Suggested links — confirm or reject each one</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {suggestions.map((s,i)=>{
              const ev = evidence.find(e=>e.id===s.evidenceId);
              const allegation = allegations.find(a=>a.id===s.allegationId);
              if (!ev || !allegation) return null;
              return (
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,background:"#FFFFFF",borderRadius:6,padding:"8px 10px"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12,color:"#1A1535"}}><b>{ev.name}</b> {s.stance} <b>{allegation.title}</b></div>
                    {s.reasoning && <div style={{fontSize:11,color:"#9B9098",marginTop:1}}>{s.reasoning}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <Btn variant="secondary" style={{padding:"4px 10px",fontSize:11}} onClick={()=>onAcceptSuggestion(cs,s)}>Accept</Btn>
                    <Btn variant="ghost" style={{padding:"4px 10px",fontSize:11}} onClick={()=>onRejectSuggestion(cs,s)}>Reject</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,overflow:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:720}}>
          <thead>
            <tr>
              <th style={headStyle}>Allegation</th>
              <th style={headStyle}>Supporting evidence</th>
              <th style={headStyle}>Contrary evidence</th>
              <th style={headStyle}>Context</th>
              <th style={headStyle}>Employee response</th>
              <th style={headStyle}>Witness evidence</th>
              <th style={headStyle}>Investigator's finding</th>
              <th style={headStyle}>Outstanding uncertainty</th>
              <th style={headStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {allegations.map(a=>{
              const linked = evidenceForAllegation(evidence, a.id);
              const supporting = linked.filter(ev=>ev.stance==="supports");
              const contrary = linked.filter(ev=>ev.stance==="contradicts");
              const context = linked.filter(ev=>ev.stance==="context");
              const statusMeta = allegationStatusMeta(a.status);
              const missing = linked.length===0;
              return (
                <tr key={a.id}>
                  <td style={{...cellStyle,fontWeight:600,minWidth:160}}>{a.title}</td>
                  <td style={{...cellStyle,minWidth:140}}>
                    {supporting.map((ev,i)=><EvidenceChip key={i} ev={ev} onOpen={onOpenEvidence}/>)}
                    {supporting.length===0 && <span style={{color:"#C84B2F",fontSize:11}}>Missing evidence</span>}
                  </td>
                  <td style={{...cellStyle,minWidth:140}}>{contrary.map((ev,i)=><EvidenceChip key={i} ev={ev} onOpen={onOpenEvidence}/>)}</td>
                  <td style={{...cellStyle,minWidth:140}}>{context.map((ev,i)=><EvidenceChip key={i} ev={ev} onOpen={onOpenEvidence}/>)}</td>
                  <td style={{...cellStyle,minWidth:160,color:a.employeeResponse?"#1A1535":"#9B9098"}}>{a.employeeResponse||"Not recorded"}</td>
                  <td style={{...cellStyle,minWidth:160,color:a.witnessEvidence?"#1A1535":"#9B9098"}}>{a.witnessEvidence||"Not recorded"}</td>
                  <td style={{...cellStyle,minWidth:160,color:a.investigatorFinding?"#1A1535":"#9B9098"}}>{a.investigatorFinding||"Not recorded"}</td>
                  <td style={{...cellStyle,minWidth:160,color:a.outstandingUncertainty?"#C84B2F":"#9B9098"}}>{a.outstandingUncertainty||"None recorded"}</td>
                  <td style={cellStyle}><span style={{fontSize:10,fontWeight:600,color:statusMeta.color,background:statusMeta.bg,borderRadius:4,padding:"2px 8px",whiteSpace:"nowrap"}}>{statusMeta.label}</span>{missing&&<div style={{fontSize:10,color:"#C84B2F",marginTop:3}}>No evidence linked</div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
