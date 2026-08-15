const CATEGORY_LABEL = {
  signature: "Signature",
  task: "Task",
  review: "Review",
  risk: "Risk",
};

// Integrations & Workflow Automation (Phase 5, IP5, §22) — read-only
// display of evaluateAutomationRules' output. Deliberately has no accept/
// dismiss actions, unlike GuardrailsPanel/SignalCard: these suggestions
// are computed live on every render (lib/automationRules.js), not
// persisted case_signals rows, so there's nothing yet to mark resolved
// against — that's the point of this staying Suggest-level (later IP28
// adds real Prepare/Automate execution against an inventory of actions
// that doesn't exist yet).
export function AutomationSuggestionsPanel({ suggestions }) {
  if (!suggestions?.length) return null;

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden",marginBottom:16}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Suggested for this case</div>
      </div>
      <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:10}}>
        {suggestions.map(s=>(
          <div key={s.ruleId} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:0.5,color:"#7C5CFC",background:"#7C5CFC18",border:"1px solid #7C5CFC33",borderRadius:4,padding:"2px 7px",flexShrink:0,marginTop:2}}>{(CATEGORY_LABEL[s.category]||s.category).toUpperCase()}</span>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>{s.label}</div>
              <div style={{fontSize:11,color:"#9B9098",marginTop:2}}>{s.reason}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
