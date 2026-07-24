import { supabase } from '../supabase';
import { AddRoleForm } from '../components/AddRoleForm';

export function OrgSettingsModal({ setShowOrgSettings, orgRoles, loadOrgRoles, org, orgMembers, loadOrgMembers, showToast }) {
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#FFFFFF",borderRadius:16,padding:28,width:"100%",maxWidth:560,maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820"}}>Organisation Settings</div>
          <button onClick={()=>setShowOrgSettings(false)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9B9098"}}>×</button>
        </div>
        <div style={{marginBottom:24}}>
          <div style={{fontSize:12,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Job Titles & Access Levels</div>
          <div style={{fontSize:12,color:"#6B6375",marginBottom:12}}>Define the roles in your organisation. Higher access level = more senior. Users with access level 5+ can appoint disciplinary officers.</div>
          {orgRoles.map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"8px 12px",background:"#FDFAF5",borderRadius:8,border:"1px solid #E8E0D0"}}>
              <div style={{flex:1,fontSize:13,color:"#1C1820"}}>{r.title}</div>
              <div style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",borderRadius:4,padding:"2px 8px"}}>Level {r.access_level}</div>
              <button onClick={async()=>{await supabase.from("org_roles").delete().eq("id",r.id);loadOrgRoles();}} style={{background:"none",border:"none",color:"#C84B2F",cursor:"pointer",fontSize:12}}>Remove</button>
            </div>
          ))}
          <AddRoleForm onAdd={async(title,level)=>{await supabase.from("org_roles").insert({org_id:org.id,title,access_level:parseInt(level)});loadOrgRoles();}}/>
        </div>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Team Members</div>
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
        </div>
      </div>
    </div>
  );
}
