import { Card } from '../../components/Primitives';
import { AUTOMATABLE_RULE_IDS, AUTOMATION_LEVELS, AUTOMATION_LEVEL_DESCRIPTION, automationLevelLabel, getAutomationLevel } from '../../lib/automationLevels';

// Only rules with a real, safe administrative action behind them appear
// here at all (lib/automationLevels.js's AUTOMATABLE_RULE_IDS) — the
// other three suggest-level rules (overdue tasks, unanswered questions,
// procedural risk) have no draftable/automatable artifact, so they stay
// Suggest-only with nothing to configure, by design.
const RULE_LABEL = {
  unsigned_meeting_record_stale: "Chase signature on stale meeting records",
};
const RULE_DETAIL = {
  unsigned_meeting_record_stale: "A meeting record sent for signature 5+ days ago and still unsigned.",
};

// Integrations & Workflow Automation (Phase 5, IP28, §22-23) — lets an
// org pick, per action, whether Compass just flags it (Suggest), drafts
// it for one-click approval (Prepare), or performs it automatically once
// (Automate). The rule itself — what it watches for and why — is always
// shown here regardless of level, so this never becomes a black box.
export function AutomationsSection({ automationLevels, saveAutomationLevel }) {
  return (
    <Card>
      <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Automations</h3>
      <p style={{fontSize:12,color:"#6B6375",margin:"0 0 20px",lineHeight:1.6}}>Compass can flag something for HR to review, draft the action for one-click approval, or — for a small set of genuinely low-risk administrative actions — perform it automatically. Automating a rule never changes what it watches for or why, only what happens once it fires.</p>

      {AUTOMATABLE_RULE_IDS.map(ruleId => {
        const level = getAutomationLevel(automationLevels, ruleId);
        return (
          <div key={ruleId} style={{padding:"14px 0",borderTop:"1px solid #F5F1EA"}}>
            <div style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>{RULE_LABEL[ruleId] || ruleId}</div>
            <div style={{fontSize:12,color:"#9B9098",marginTop:2,marginBottom:10}}>{RULE_DETAIL[ruleId]}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {AUTOMATION_LEVELS.map(l => (
                <button key={l} onClick={()=>saveAutomationLevel(ruleId, l)}
                  style={{fontSize:12,fontWeight:level===l?600:400,padding:"6px 14px",borderRadius:20,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",
                    background:level===l?"#7C5CFC":"#FFFFFF",color:level===l?"#fff":"#6B6375",border:level===l?"1px solid #7C5CFC":"1px solid #E8E0D0"}}>
                  {automationLevelLabel(l)}
                </button>
              ))}
            </div>
            <p style={{fontSize:11,color:"#9B9098",marginTop:8}}>{AUTOMATION_LEVEL_DESCRIPTION[level]}</p>
          </div>
        );
      })}
    </Card>
  );
}
