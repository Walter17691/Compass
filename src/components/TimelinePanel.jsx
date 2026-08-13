import { useState } from 'react';
import { buildCaseTimeline } from '../lib/caseTimeline';
import { computeStageProgress } from '../lib/processTimeline';
import { Btn } from './Primitives';

const TYPE_STYLE = {
  case: { color: "#6B6375", label: "Case" },
  meeting: { color: "#7C5CFC", label: "Meeting" },
  letter: { color: "#B87520", label: "Letter" },
  report: { color: "#7C5CFC", label: "Report" },
  outcome: { color: "#C84B2F", label: "Outcome" },
  allegation: { color: "#C84B2F", label: "Allegation" },
  audit: { color: "#9B9098", label: "Activity" },
};

const selectStyle = { fontSize:12, border:"1px solid #E8E0D0", borderRadius:6, padding:"5px 8px", color:"#6B6375", fontFamily:"DM Sans,system-ui,sans-serif" };

// Phase 8 of the reasoning-layer build-out (5 of 5 in the ER Intelligence
// MVP) — still purely a read view over buildCaseTimeline()'s merge, no
// new source of truth for the events themselves. What's new: click-
// through to the underlying source, filter by person/allegation, an
// inline edit/exclude override (persisted on the case's own
// timeline_overrides column, applied inside buildCaseTimeline itself so
// every caller sees the same result), a cached per-entry AI relevance
// note, and export.
export function TimelinePanel({ cs, allegations, auditLog, fmtDate, onOpenSource, onToggleExclude, onEditDescription, onGenerateRelevance, relevanceLoading, loadJsPDF }) {
  const [personFilter, setPersonFilter] = useState("");
  const [allegationFilter, setAllegationFilter] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [editText, setEditText] = useState("");

  const caseAllegations = (allegations || []).filter(a => a.caseId === cs.id);
  const stageProgress = computeStageProgress(cs);
  const allEntries = buildCaseTimeline(cs, allegations, auditLog, cs.timelineOverrides || {});
  const people = [...new Set(allEntries.map(e => e.actor).filter(Boolean))];

  const entries = allEntries.filter(e => {
    if (personFilter && e.actor !== personFilter) return false;
    if (allegationFilter) {
      const allegation = caseAllegations.find(a => a.id === allegationFilter);
      const matchesLink = e.allegationId === allegationFilter;
      const matchesText = allegation && e.description.toLowerCase().includes(allegation.title.toLowerCase());
      if (!matchesLink && !matchesText) return false;
    }
    return true;
  });

  const exportPdf = async () => {
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const M = 20, W = doc.internal.pageSize.getWidth(), maxW = W - M * 2;
    let y = 20;
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30); doc.text("Case chronology — " + (cs.employeeName || ""), M, y); y += 8;
    doc.setDrawColor(124, 92, 252); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 8;
    doc.setFontSize(10); doc.setTextColor(60);
    entries.forEach(e => {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold"); doc.text(fmtDate(e.date) + " — " + (TYPE_STYLE[e.type]?.label || e.type), M, y); y += 5.5;
      doc.setFont("helvetica", "normal");
      doc.splitTextToSize(e.description, maxW).forEach(line => { if (y > 280) { doc.addPage(); y = 20; } doc.text(line, M, y); y += 5; });
      if (e.relevance) { doc.setTextColor(120); doc.splitTextToSize("Relevance: " + e.relevance, maxW).forEach(line => { doc.text(line, M, y); y += 5; }); doc.setTextColor(60); }
      y += 3;
    });
    doc.save((cs.employeeName || "case") + "-chronology.pdf");
  };

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Timeline ({entries.length})</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {people.length>1 && (
            <select value={personFilter} onChange={e=>setPersonFilter(e.target.value)} style={selectStyle}>
              <option value="">All people</option>
              {people.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {caseAllegations.length>0 && (
            <select value={allegationFilter} onChange={e=>setAllegationFilter(e.target.value)} style={selectStyle}>
              <option value="">All allegations</option>
              {caseAllegations.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          )}
          {onGenerateRelevance && <button onClick={()=>onGenerateRelevance(cs)} disabled={relevanceLoading} style={{...selectStyle,background:"none",cursor:relevanceLoading?"not-allowed":"pointer"}}>{relevanceLoading?"Assessing relevance…":"Assess relevance"}</button>}
          {loadJsPDF && <Btn variant="secondary" style={{padding:"5px 10px",fontSize:12}} onClick={exportPdf}>Export</Btn>}
        </div>
      </div>

      {/* P3 — a stage-aware lens over the same case data below: where are
          we in the process, what's already done, what's still to come,
          and (where the process shape supports a real evidence check —
          see processTimeline.js) any stage the case has moved past
          without its own expected evidence on file. Purely derived, no
          new source of truth. */}
      <div style={{padding:"14px 16px",borderBottom:"1px solid #EDE5D8",background:"#FDFAF5"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>
          {stageProgress.processType.label} process
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:stageProgress.missingSteps.length?10:0}}>
          {stageProgress.completed.map(s=>(
            <span key={s.id} style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"#E8F5EE",color:"#1A7A4A",fontWeight:500}}>✓ {s.label}</span>
          ))}
          {stageProgress.current&&(
            <span style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"#7C5CFC",color:"#FFFFFF",fontWeight:700}}>{stageProgress.current.label}</span>
          )}
          {stageProgress.upcoming.map(s=>(
            <span key={s.id} style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"#F5F1EA",color:"#9B9098"}}>{s.label}</span>
          ))}
        </div>
        {stageProgress.missingSteps.length>0&&(
          <div style={{background:"#FEF5E7",border:"1px solid #F5E6C4",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#6B5218",lineHeight:1.6}}>
            Potential missing step{stageProgress.missingSteps.length>1?"s":""}: {stageProgress.missingSteps.join(", ")}
          </div>
        )}
      </div>

      <div style={{padding:"16px"}}>
        {entries.length===0 && <div style={{fontSize:13,color:"#9B9098"}}>Nothing recorded on this case yet.</div>}
        {entries.map((e, i) => {
          const meta = TYPE_STYLE[e.type] || TYPE_STYLE.audit;
          const isEditing = editingKey===e.key;
          return (
            <div key={e.key} style={{display:"flex",gap:12,paddingBottom:i<entries.length-1?14:0,marginBottom:i<entries.length-1?14:0,borderBottom:i<entries.length-1?"1px solid #F5F1EA":"none"}}>
              <div style={{flexShrink:0,width:8,height:8,borderRadius:"50%",background:meta.color,marginTop:5}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,fontWeight:700,color:meta.color,textTransform:"uppercase",letterSpacing:"0.4px"}}>{meta.label}</span>
                  <span style={{fontSize:11,color:"#9B9098"}}>{fmtDate(e.date)}</span>
                  {e.linkTo && onOpenSource && <button onClick={()=>onOpenSource(e.linkTo)} style={{fontSize:11,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0}}>Open source</button>}
                </div>
                {isEditing ? (
                  <div style={{marginTop:4,display:"flex",gap:6}}>
                    <input value={editText} onChange={ev=>setEditText(ev.target.value)} style={{flex:1,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 8px"}}/>
                    <Btn variant="secondary" style={{padding:"4px 10px",fontSize:11}} onClick={()=>{onEditDescription(cs,e.key,editText);setEditingKey(null);}}>Save</Btn>
                    <Btn variant="ghost" style={{padding:"4px 10px",fontSize:11}} onClick={()=>setEditingKey(null)}>Cancel</Btn>
                  </div>
                ) : (
                  <div style={{fontSize:13,color:"#1A1535",marginTop:2}}>{e.description}</div>
                )}
                {e.relevance && <div style={{fontSize:11,color:"#6B6375",marginTop:2,fontStyle:"italic"}}>{e.relevance}</div>}
                {e.actor && <div style={{fontSize:11,color:"#9B9098",marginTop:1}}>{e.actor}</div>}
                {!isEditing && (onEditDescription || onToggleExclude) && (
                  <div style={{display:"flex",gap:10,marginTop:4}}>
                    {onEditDescription && <button onClick={()=>{setEditingKey(e.key);setEditText(e.description);}} style={{fontSize:10,color:"#9B9098",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0}}>Edit</button>}
                    {onToggleExclude && <button onClick={()=>onToggleExclude(cs,e.key)} style={{fontSize:10,color:"#9B9098",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",padding:0}}>Exclude</button>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
