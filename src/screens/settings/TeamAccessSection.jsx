import { Btn, Card } from '../../components/Primitives';
import { ROLES, roleLabel } from '../../lib/roles';

export function TeamAccessSection({ isHR, org, locations, teamMembers, editingMember, setEditingMember, removeMember, updateMemberRole, assignLocations, inviteForm, setInviteForm, inviting, inviteMember }) {
  if(!isHR) return null;
  return (
    <>
      {org?.invite_code&&(
        <Card style={{marginBottom:20}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Team invite code</div>
          <p style={{fontSize:12,color:"#6B6880",marginBottom:12}}>Share this code with team members to join your workspace.</p>
          <div style={{display:"flex",alignItems:"center",gap:10,background:"#F5F1EA",borderRadius:8,padding:"12px 16px"}}>
            <span style={{fontFamily:"JetBrains Mono,monospace",fontSize:20,color:"#7C5CFC",letterSpacing:4,fontWeight:700}}>{org.invite_code}</span>
            <button onClick={()=>navigator.clipboard.writeText(org.invite_code)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 10px",fontSize:11,color:"#6B6375",cursor:"pointer"}}>Copy</button>
          </div>
        </Card>
      )}

      <Card style={{marginBottom:20}}>
        <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Team members</div>
        <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Invite team members to your workspace. They will receive an email invite.</p>

        <div style={{marginBottom:16}}>
          {teamMembers.map(m=>(
            <div key={m.id} style={{padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div>
                  <div style={{fontSize:14,color:"#1A1535"}}>{m.name||"Unknown"}</div>
                  <div style={{fontSize:11,color:"#6B6880"}}>
                    {roleLabel(m.role)}
                    {(m.location_ids||[]).length>0&&" · "+locations.filter(l=>(m.location_ids||[]).includes(l.id)).map(l=>l.name).join(", ")}
                  </div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>setEditingMember(editingMember===m.id?null:m.id)}
                    style={{background:"none",border:"1px solid #E8E0D0",borderRadius:4,padding:"3px 8px",color:"#7C5CFC",cursor:"pointer",fontSize:11}}>
                    {editingMember===m.id?"Done":"Edit access"}
                  </button>
                  <button onClick={()=>removeMember(m)}
                    style={{background:"none",border:"none",color:"#C84B2F",cursor:"pointer",fontSize:11}}>Remove</button>
                </div>
              </div>
              {editingMember===m.id&&locations.length>0&&(
                <div style={{background:"#F5F1EA",borderRadius:8,padding:"10px 14px",marginTop:4}}>
                  <div style={{fontSize:10,color:"#6B6880",marginBottom:8,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>Role</div>
                  <select aria-label={`Role for ${m.name||"Unknown"}`} value={m.role} onChange={e=>updateMemberRole(m.id,e.target.value)}
                    style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#1A1535",outline:"none",marginBottom:12}}>
                    {ROLES.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  <div style={{fontSize:10,color:"#6B6880",marginBottom:8,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>Location access</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                    {locations.map(l=>(
                      <label key={l.id} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:"#1A1535"}}>
                        <input type="checkbox"
                          checked={(m.location_ids||[]).includes(l.id)}
                          onChange={e=>{
                            const current = m.location_ids||[];
                            const updated = e.target.checked?[...current,l.id]:current.filter(x=>x!==l.id);
                            assignLocations(m.id, updated);
                          }}
                          style={{accentColor:"#7C5CFC"}}/>
                        {l.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {teamMembers.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No team members yet</div>}
        </div>

        <div style={{borderTop:"1px solid #E8E0D0",paddingTop:16}}>
          <div style={{fontSize:11,color:"#6B6375",marginBottom:12,fontWeight:600}}>Invite new member</div>
          <input aria-label="Full name" placeholder="Full name" value={inviteForm.name} onChange={e=>setInviteForm(p=>({...p,name:e.target.value}))}
            style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:8,boxSizing:"border-box"}}/>
          <input aria-label="Email address" placeholder="Email address" type="email" value={inviteForm.email} onChange={e=>setInviteForm(p=>({...p,email:e.target.value}))}
            style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:8,boxSizing:"border-box"}}/>
          <select aria-label="Role" value={inviteForm.role} onChange={e=>setInviteForm(p=>({...p,role:e.target.value}))}
            style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:12}}>
            {ROLES.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          {locations.length>0&&(
            <div style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:10,fontWeight:600,color:"#6B6375",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Locations</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {locations.map(l=>(
                  <label key={l.id} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:"#1A1535"}}>
                    <input type="checkbox" checked={inviteForm.locationIds.includes(l.id)}
                      onChange={e=>{
                        setInviteForm(p=>({...p,locationIds:e.target.checked?[...p.locationIds,l.id]:p.locationIds.filter(x=>x!==l.id)}));
                      }}
                      style={{accentColor:"#7C5CFC"}}/>
                    {l.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <Btn onClick={inviteMember} disabled={inviting||!inviteForm.name.trim()||!inviteForm.email.trim()} style={{width:"100%"}}>
            {inviting?"Sending invite...":"Send invite"}
          </Btn>
        </div>
      </Card>
    </>
  );
}
