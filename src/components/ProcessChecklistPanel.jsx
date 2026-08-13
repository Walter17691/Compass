import { CASE_ROLES } from '../lib/caseRoles';
import { POLICY_CATEGORIES } from '../constants';

// Process Intelligence Phase 3 (P18, §15) — the read-only side of a
// process template: what this case's org-configured template (if any)
// says should happen, shown once and never re-derived from case data.
// Deliberately not cross-checked against evidence/meetings/case_access
// (no "3 of 5 documents provided" progress bar) — that would duplicate
// EvidenceMatrixPanel/CaseRolesPanel's own job rather than this panel's:
// surfacing what the template says, plainly. Renders nothing when the
// case's process type has no template configured at all, same as every
// other conditional panel on this tab (ApprovalsPanel, GuardrailsPanel).
export function ProcessChecklistPanel({ template }) {
  if (!template) return null;
  const hasDocs = template.required_documents?.length > 0;
  const hasMeetings = template.suggested_meetings?.length > 0;
  const hasRoles = template.suggested_role_ids?.length > 0;
  const policyLabel = POLICY_CATEGORIES.find(c => c.id === template.policy_category)?.label;
  if (!hasDocs && !hasMeetings && !hasRoles && !policyLabel && !template.target_days) return null;

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px",marginBottom:16}}>
      <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Process checklist</div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {hasDocs&&(
          <div>
            <div style={{fontSize:11,fontWeight:600,color:"#9B9098",marginBottom:6}}>Required documents</div>
            <ul style={{margin:0,paddingLeft:18,fontSize:13,color:"#1A1535",lineHeight:1.7}}>
              {template.required_documents.map((d,i)=><li key={i}>{d}</li>)}
            </ul>
          </div>
        )}
        {hasMeetings&&(
          <div>
            <div style={{fontSize:11,fontWeight:600,color:"#9B9098",marginBottom:6}}>Suggested meetings</div>
            <ul style={{margin:0,paddingLeft:18,fontSize:13,color:"#1A1535",lineHeight:1.7}}>
              {template.suggested_meetings.map((m,i)=><li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
        {hasRoles&&(
          <div>
            <div style={{fontSize:11,fontWeight:600,color:"#9B9098",marginBottom:6}}>Suggested roles to fill</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {template.suggested_role_ids.map(id=>{
                const role = CASE_ROLES.find(r=>r.id===id);
                return <span key={id} style={{fontSize:12,color:"#5B3FD4",background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:20,padding:"3px 10px"}}>{role?.label||id}</span>;
              })}
            </div>
          </div>
        )}
        {(policyLabel||template.target_days)&&(
          <div style={{fontSize:12,color:"#9B9098",paddingTop:hasDocs||hasMeetings||hasRoles?10:0,borderTop:hasDocs||hasMeetings||hasRoles?"1px solid #F5F1EA":"none"}}>
            {policyLabel&&<span>Linked policy: <strong style={{color:"#1A1535"}}>{policyLabel}</strong></span>}
            {policyLabel&&template.target_days&&<span> · </span>}
            {template.target_days&&<span>Target: <strong style={{color:"#1A1535"}}>{template.target_days} days per stage</strong></span>}
          </div>
        )}
      </div>
    </div>
  );
}
