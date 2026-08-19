import { useEffect, useRef, useState } from 'react';
import { Btn } from './Primitives';
import { getAutomationLevel, automationLevelLabel } from '../lib/automationLevels';

const CATEGORY_LABEL = {
  signature: "Signature",
  task: "Task",
  review: "Review",
  risk: "Risk",
};

// Integrations & Workflow Automation (Phase 5, IP5 + IP28, §22-23) —
// IP5's read-only display, now honouring the org's own automation level
// per rule (lib/automationLevels.js). Only unsigned_meeting_record_stale
// has a real action wired up (resendSignatureReminder, App.jsx) — every
// other suggestion always renders Suggest-level, regardless of what an
// org's automation_levels config says, since getAutomationLevel refuses
// to elevate a rule outside AUTOMATABLE_RULE_IDS. The rule itself always
// stays visible here (label/reason), at every level — Prepare/Automate
// change what happens next, never what HR gets told.
export function AutomationSuggestionsPanel({ suggestions, automationLevels, cs, onResendReminder }) {
  const [sending, setSending] = useState({});
  const autoFiredRef = useRef(new Set());

  // Integrations & Workflow Automation (Phase 5, IP30, §29) — level is
  // passed through so the audit entry can record whether this was
  // AI-prepared (Automate, no human click) or HR-approved (Prepare,
  // this exact click is the approval) — the automation-provenance
  // fields the spec asks for on top of the existing generic log.
  const resend = async (ruleId, meetings, level) => {
    if (!onResendReminder || !cs) return;
    setSending(s => ({ ...s, [ruleId]: true }));
    for (const m of meetings) await onResendReminder(cs, m, { level });
    setSending(s => ({ ...s, [ruleId]: false }));
  };

  // Automate: fire once per unique set of meetings a suggestion names —
  // resendSignatureReminder stamps reminderSentAt on success, which
  // removes those meetings from this rule's own "stale" filter on the
  // next evaluation (lib/automationRules.js's recentlyReminded), so the
  // suggestion naturally stops re-appearing rather than needing this
  // effect to track "done" state itself. autoFiredRef only guards
  // against firing twice before that re-evaluation lands.
  useEffect(() => {
    (suggestions || []).forEach(s => {
      if (!s.meetings?.length || !onResendReminder || !cs) return;
      if (getAutomationLevel(automationLevels, s.ruleId) !== "automate") return;
      const key = s.ruleId + "::" + s.meetings.map(m => m.id).join(",");
      if (autoFiredRef.current.has(key)) return;
      autoFiredRef.current.add(key);
      resend(s.ruleId, s.meetings, "automate");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, automationLevels, cs?.id]);

  if (!suggestions?.length) return null;

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden",marginBottom:16}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Suggested for this case</div>
      </div>
      <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:10}}>
        {suggestions.map(s=>{
          const level = getAutomationLevel(automationLevels, s.ruleId);
          return (
          <div key={s.ruleId} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:0.5,color:"#7C5CFC",background:"#7C5CFC18",border:"1px solid #7C5CFC33",borderRadius:4,padding:"2px 7px",flexShrink:0,marginTop:2}}>{(CATEGORY_LABEL[s.category]||s.category).toUpperCase()}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>{s.label}</div>
              <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{s.reason}</div>
              {level==="prepare"&&s.meetings?.length>0&&(
                <Btn variant="secondary" onClick={()=>resend(s.ruleId, s.meetings, "prepare")} disabled={!!sending[s.ruleId]} style={{fontSize:11,padding:"5px 12px",marginTop:6}}>
                  {sending[s.ruleId]?"Sending…":"Send reminder"}
                </Btn>
              )}
              {level==="automate"&&s.meetings?.length>0&&(
                <div style={{fontSize:11,color:"#5B3FD4",marginTop:4}}>{sending[s.ruleId]?"Sending reminder automatically…":"Compass will send a reminder automatically"}</div>
              )}
              {level!=="suggest"&&<div style={{fontSize:10,color:"#B8AEDB",marginTop:2}}>{automationLevelLabel(level)} level</div>}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
