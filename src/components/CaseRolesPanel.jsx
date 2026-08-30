import { ASSIGNABLE_ROLES, currentRoleHolder } from '../lib/caseRoles';

// Process Intelligence Phase 3 (P8) — the only NEW case-role assignment
// UI this phase adds. Investigator, Case Owner and Hearing Manager
// already have their own dedicated, working flows elsewhere
// (CaseViewScreen's investigator select, ReassignCaseModal, HandoffModal)
// and aren't duplicated here — this covers exactly the roles that had no
// UI at all before this phase (caseRoles.js's ASSIGNABLE_ROLES).
// 10/10 pass, Part A — no longer its own card; OverviewTab now wraps
// this in a collapsible Layer 3 disclosure (heading lives there).
export function CaseRolesPanel({ cs, caseAccess, orgMembers, assignCaseRole }) {
  return (
    <div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {ASSIGNABLE_ROLES.map(role=>{
          const holder = currentRoleHolder(caseAccess, orgMembers, cs.id, role.id);
          return (
            <div key={role.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
              <div style={{fontSize:13,color:"#1A1535"}}>
                <span style={{fontWeight:600}}>{role.label}</span>
                <span style={{color:"#9B9098",marginLeft:8}}>{holder ? holder.name : "Unassigned"}</span>
              </div>
              <select defaultValue="" onChange={e=>{ if(e.target.value){ assignCaseRole(cs.id, e.target.value, role.id); e.target.value=""; } }}
                aria-label={"Assign "+role.label}
                style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"5px 8px",color:"#6B6375",background:"#FFFFFF",fontFamily:"DM Sans,system-ui,sans-serif",cursor:"pointer"}}>
                <option value="" disabled>{holder ? "Reassign…" : "Assign…"}</option>
                {(orgMembers||[]).filter(m=>m.user_id).map(m=><option key={m.id} value={m.user_id}>{m.name}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
