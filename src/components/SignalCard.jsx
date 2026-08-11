import { Btn } from './Primitives';
import { WarningIcon, InfoIcon } from './Icons';
import { signalTypeMeta, SIGNAL_STATUSES } from '../lib/caseSignals';

function statusLabel(status) {
  return SIGNAL_STATUSES.find(s => s.id === status)?.label || status;
}

// Generic disposition card for any case_signal — Next Best Action,
// Contradiction Detection, Unanswered Questions, and Procedural Guardrails
// all render through this one component rather than four near-identical
// ones (see caseSignals.js). Standard actions (dismiss / not relevant /
// resolved / ask why) are always available where a handler is passed;
// extraActions carries whatever's specific to the signal's type — e.g.
// "Create task" for a next_action signal, "Link to allegation" for an
// inconsistency.
export function SignalCard({ signal, onDismiss, onMarkNotRelevant, onMarkResolved, resolvedLabel="Mark resolved", onAskWhy, extraActions = [] }) {
  const meta = signalTypeMeta(signal.type);
  const Icon = signal.type === "process_risk" ? WarningIcon : InfoIcon;
  const isOpen = signal.status === "open";

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px"}}>
      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
        <div style={{flexShrink:0,width:26,height:26,borderRadius:"50%",background:meta.color+"18",display:"flex",alignItems:"center",justifyContent:"center",marginTop:1}}>
          <Icon size={14} color={meta.color} />
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:10,fontWeight:700,color:meta.color,textTransform:"uppercase",letterSpacing:0.5}}>{meta.label}</span>
            {!isOpen && <span style={{fontSize:10,color:"#9B9098"}}>{statusLabel(signal.status)}</span>}
          </div>
          <div style={{fontSize:14,color:"#1A1535",fontWeight:600,marginTop:3}}>{signal.title}</div>
          {signal.reasoning && <div style={{fontSize:13,color:"#6B6375",marginTop:4,lineHeight:1.6}}>{signal.reasoning}</div>}

          {isOpen && (
            <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
              {extraActions.map((a, i) => (
                <Btn key={i} variant="secondary" style={{padding:"6px 12px",fontSize:12}} onClick={a.onClick}>{a.label}</Btn>
              ))}
              {onMarkResolved && <Btn variant="secondary" style={{padding:"6px 12px",fontSize:12}} onClick={onMarkResolved}>{resolvedLabel}</Btn>}
              {onMarkNotRelevant && <Btn variant="ghost" style={{padding:"6px 12px",fontSize:12}} onClick={onMarkNotRelevant}>Not relevant</Btn>}
              {onDismiss && <Btn variant="ghost" style={{padding:"6px 12px",fontSize:12}} onClick={onDismiss}>Dismiss</Btn>}
              {onAskWhy && <Btn variant="ghost" style={{padding:"6px 12px",fontSize:12}} onClick={onAskWhy}>Ask why</Btn>}
            </div>
          )}
          {!isOpen && onAskWhy && (
            <div style={{marginTop:10}}>
              <Btn variant="ghost" style={{padding:"6px 12px",fontSize:12}} onClick={onAskWhy}>Ask why</Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
