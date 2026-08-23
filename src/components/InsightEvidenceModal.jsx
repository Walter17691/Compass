import { useRef } from 'react';
import { Btn } from './Primitives';
import { useModalA11y } from '../hooks/useModalA11y';

// Organisational ER Intelligence (Phase 6, OP17, §23) — "Show Evidence"
// for org-level insights. Visually consistent with WhySourcesModal (same
// dialog shell, "Why Compass is saying this" framing), but a genuinely
// different data shape: WhySourcesModal resolves a case_signal's
// source_refs back into ONE case's own meetings/evidence/allegations —
// the right shape for a single case's signal. An org-wide trend/early-
// signal/root-cause/event-correlation statement isn't backed by case
// source_refs at all; it's backed by aggregate metrics, a time period,
// a comparison period, and (where relevant) the themes involved — §23's
// own required list ("underlying metrics, time period, comparison
// period, themes used, confidence or data limitations"). Rather than
// force that shape through WhySourcesModal's resolveRef/sourceRefs
// abstraction (built for case references, not aggregate numbers), this
// is a small, purpose-built sibling component for exactly this shape.
export function InsightEvidenceModal({ title, metrics = [], period, comparisonPeriod, themesUsed = [], confidenceNote, onClose }) {
  const containerRef = useRef(null);
  useModalA11y(containerRef, onClose);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="insight-evidence-title" ref={containerRef} tabIndex={-1}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:4000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:480,maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Show evidence</div>
        <h3 id="insight-evidence-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:17,color:"#1A1535",marginBottom:18,fontWeight:400}}>{title}</h3>

        {metrics.length > 0 && (
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
            {metrics.map(m => (
              <div key={m.label} style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                <span style={{color:"#6B6375"}}>{m.label}</span>
                <span style={{color:"#1A1535",fontWeight:600}}>{m.value}</span>
              </div>
            ))}
          </div>
        )}

        {(period || comparisonPeriod) && (
          <div style={{fontSize:12,color:"#6B6375",marginBottom:themesUsed.length||confidenceNote?10:16}}>
            {period && <div>Period: {period}</div>}
            {comparisonPeriod && <div>Compared with: {comparisonPeriod}</div>}
          </div>
        )}

        {themesUsed.length > 0 && (
          <div style={{marginBottom:confidenceNote?10:16}}>
            <div style={{fontSize:10,fontWeight:700,color:"#9B9098",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Themes used</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {themesUsed.map(t => (
                <span key={t} style={{fontSize:11,color:"#6B6375",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:20,padding:"3px 10px"}}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {confidenceNote && (
          <p style={{fontSize:12,color:"#B87520",lineHeight:1.6,marginBottom:16}}>{confidenceNote}</p>
        )}

        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  );
}
