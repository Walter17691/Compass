import { Card } from '../../components/Primitives';
import { AddRoleForm } from '../../components/AddRoleForm';
import { supabase } from '../../supabase';

// Was previously its own popup (OrgSettingsModal) reached only from a
// separate header button — merged in as a regular section so job titles/
// access levels live alongside every other org-configuration setting
// instead of behind a second, disconnected entry point.
export function OrganisationSection({ org, orgRoles, loadOrgRoles, orgMembers, loadOrgMembers, showToast }) {
  return (
    <Card>
      <div style={{fontSize:12,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Job titles & access levels</div>
      <div style={{fontSize:12,color:"#6B6375",marginBottom:12}}>Define the roles in your organisation. Higher access level = more senior. Users with access level 5+ can appoint disciplinary officers.</div>
      {orgRoles.map(r=>(
        <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"8px 12px",background:"#FDFAF5",borderRadius:8,border:"1px solid #E8E0D0"}}>
          <div style={{flex:1,fontSize:13,color:"#1C1820"}}>{r.title}</div>
          <div style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",borderRadius:4,padding:"2px 8px"}}>Level {r.access_level}</div>
          <button onClick={async()=>{await supabase.from("org_roles").delete().eq("id",r.id);loadOrgRoles();}} style={{background:"none",border:"none",color:"#C84B2F",cursor:"pointer",fontSize:12}}>Remove</button>
        </div>
      ))}
      <AddRoleForm onAdd={async(title,level)=>{await supabase.from("org_roles").insert({org_id:org.id,title,access_level:parseInt(level)});loadOrgRoles();}}/>

      <div style={{fontSize:12,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",margin:"24px 0 12px"}}>Team members</div>
      {orgMembers.map(m=>(
        <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"8px 12px",background:"#FDFAF5",borderRadius:8,border:"1px solid #E8E0D0"}}>
          <div style={{flex:1}}><div style={{fontSize:13,color:"#1C1820"}}>{m.name}</div><div style={{fontSize:11,color:"#9B9098"}}>{m.job_title||m.role}</div></div>
          <select defaultValue={m.access_level||5} onChange={async e=>{await supabase.from("org_members").update({access_level:parseInt(e.target.value)}).eq("id",m.id);loadOrgMembers();showToast("Access level updated");}} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 8px",background:"#fff",color:"#1C1820"}}>
            {[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>Level {n}</option>)}
          </select>
          <select defaultValue={m.job_title||""} onChange={async e=>{await supabase.from("org_members").update({job_title:e.target.value}).eq("id",m.id);loadOrgMembers();showToast("Job title updated");}} style={{fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"4px 8px",background:"#fff",color:"#1C1820"}}>
            <option value="">No title</option>
            {orgRoles.map(r=><option key={r.id} value={r.title}>{r.title}</option>)}
          </select>
        </div>
      ))}
    </Card>
  );
}
