import { Btn, Card } from '../../components/Primitives';
import { ROLES, TEAM_INVITE_ROLES, LOCATION_SCOPED_ROLES, ROLE_DESCRIPTIONS, roleLabel, canManageDirectorTier } from '../../lib/roles';
import { FONT } from '../../styles/tokens';

export function TeamAccessSection({ isHR, currentUserRole, locations, teamMembers, editingMember, setEditingMember, removeMember, updateMemberRole, assignLocations, inviteForm, setInviteForm, inviting, inviteMember, pendingInvites, revokeInvite, resendInvite, resendingInviteId }) {
  if(!isHR) return null;
  const inviteRoleIsLocationScoped = LOCATION_SCOPED_ROLES.has(inviteForm.role);
  const canSendInvite = !inviting && inviteForm.name.trim() && inviteForm.email.trim() && inviteForm.role
    && (!inviteRoleIsLocationScoped || (inviteForm.locationIds||[]).length>0);

  return (
    <>
      <Card style={{marginBottom:20}}>
        <div style={{fontFamily:FONT.serif,fontSize:16,color:"#1A1535",marginBottom:4}}>Team members</div>
        <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Invite team members to your workspace. They'll receive an email with a link to join.</p>

        <div style={{marginBottom:16}}>
          {teamMembers.map(m=>{
            // NEW-9 remediation — an hr_manager editing an existing
            // hr_director's row would have every change (role or
            // location) rejected server-side anyway
            // (protect_org_member_privilege_columns); showing a working-
            // looking form that silently fails on save is worse than not
            // offering it, so it's replaced with a plain explanation.
            const canEditThisMember = canManageDirectorTier(currentUserRole, m.role);
            return (
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
                  {canEditThisMember&&<button onClick={()=>setEditingMember(editingMember===m.id?null:m.id)}
                    style={{background:"none",border:"1px solid #E8E0D0",borderRadius:4,padding:"3px 8px",color:"#7C5CFC",cursor:"pointer",fontSize:11}}>
                    {editingMember===m.id?"Done":"Edit access"}
                  </button>}
                  <button onClick={()=>removeMember(m)}
                    style={{background:"none",border:"none",color:"#C84B2F",cursor:"pointer",fontSize:11}}>Remove</button>
                </div>
              </div>
              {editingMember===m.id&&!canEditThisMember&&(
                <div style={{background:"#F5F1EA",borderRadius:8,padding:"10px 14px",marginTop:4,fontSize:12,color:"#6B6880"}}>
                  Only an HR Director can change an HR Director's access.
                </div>
              )}
              {editingMember===m.id&&canEditThisMember&&(
                <div style={{background:"#F5F1EA",borderRadius:8,padding:"10px 14px",marginTop:4}}>
                  <div style={{fontSize:10,color:"#6B6880",marginBottom:8,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>Role</div>
                  <select aria-label={`Role for ${m.name||"Unknown"}`} value={m.role} onChange={e=>updateMemberRole(m.id,e.target.value)}
                    style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#1A1535",outline:"none",marginBottom:locations.length>0?12:0}}>
                    {ROLES.filter(r=>r.id!=="hr_director"||currentUserRole==="hr_director").map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  {/* Phase 6.5 hardening (closes independent audit finding
                      6.1) — the role selector above used to be nested
                      inside this same locations.length>0 gate, so "Edit
                      access" rendered nothing at all (button flipped to
                      "Done", nothing appeared) in any org with no
                      locations configured yet — the default state of
                      every brand-new org. Only the location-access
                      block, which is genuinely meaningless with zero
                      locations to assign, stays conditional. */}
                  {locations.length>0&&(<>
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
                  </>)}
                </div>
              )}
            </div>
          );})}
          {teamMembers.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No team members yet</div>}
        </div>

        <div style={{borderTop:"1px solid #E8E0D0",paddingTop:16}}>
          <div style={{fontSize:11,color:"#6B6375",marginBottom:12,fontWeight:600}}>Invite new member</div>
          <input aria-label="Full name" placeholder="Full name" value={inviteForm.name} onChange={e=>setInviteForm(p=>({...p,name:e.target.value}))}
            style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:8,boxSizing:"border-box"}}/>
          <input aria-label="Email address" placeholder="Email address" type="email" value={inviteForm.email} onChange={e=>setInviteForm(p=>({...p,email:e.target.value}))}
            style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:8,boxSizing:"border-box"}}/>
          {/* NEW-8 remediation — the invitation now carries its own
              intended access level, applied atomically when it's
              accepted (see api/accept-team-invite.js), instead of every
              invitee silently joining as Location Manager pending a
              manual follow-up correction. hr_director is never offered
              here — see TEAM_INVITE_ROLES's own comment. */}
          <select aria-label="Access level" value={inviteForm.role} onChange={e=>setInviteForm(p=>({...p,role:e.target.value,locationIds:[]}))}
            style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:4,boxSizing:"border-box"}}>
            <option value="">Select access level…</option>
            {TEAM_INVITE_ROLES.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          {inviteForm.role&&<p style={{fontSize:11,color:"#6B6880",margin:"0 0 8px"}}>{ROLE_DESCRIPTIONS[inviteForm.role]}</p>}
          {inviteRoleIsLocationScoped&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#6B6880",marginBottom:8,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>Locations</div>
              {locations.length===0
                ? <p style={{fontSize:11,color:"#C84B2F",margin:0}}>No locations are configured yet — add one under Settings → Locations before inviting a Location Manager.</p>
                : <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                    {locations.map(l=>(
                      <label key={l.id} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:"#1A1535"}}>
                        <input type="checkbox"
                          checked={(inviteForm.locationIds||[]).includes(l.id)}
                          onChange={e=>{
                            const current = inviteForm.locationIds||[];
                            setInviteForm(p=>({...p,locationIds:e.target.checked?[...current,l.id]:current.filter(x=>x!==l.id)}));
                          }}
                          style={{accentColor:"#7C5CFC"}}/>
                        {l.name}
                      </label>
                    ))}
                  </div>}
            </div>
          )}
          <Btn onClick={inviteMember} disabled={!canSendInvite} style={{width:"100%"}}>
            {inviting?"Sending invite...":"Send invite"}
          </Btn>
        </div>
      </Card>

      {/* NEW-8 remediation — Team & access previously had no way to
          represent a pending invitation at all (nothing was ever
          recorded per invitation, only the org's own permanent shared
          code existed). */}
      {pendingInvites&&pendingInvites.length>0&&(
        <Card style={{marginBottom:20}}>
          <div style={{fontFamily:FONT.serif,fontSize:16,color:"#1A1535",marginBottom:4}}>Pending invitations</div>
          <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Not yet accepted. Resend if the link was lost, or revoke to cancel it.</p>
          {pendingInvites.map(inv=>(
            <div key={inv.id} style={{padding:"10px 0",borderBottom:"1px solid #F5F1EA",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:14,color:"#1A1535"}}>{inv.name} <span style={{color:"#6B6880",fontWeight:400}}>· {inv.email}</span></div>
                <div style={{fontSize:11,color:inv.expired?"#C84B2F":"#6B6880"}}>
                  {inv.roleLabel}
                  {inv.locationIds?.length>0&&" · "+locations.filter(l=>inv.locationIds.includes(l.id)).map(l=>l.name).join(", ")}
                  {" · Invited "}{new Date(inv.createdAt).toLocaleDateString("en-GB")}
                  {inv.expired&&" · Expired"}
                </div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>resendInvite(inv.id)} disabled={resendingInviteId===inv.id}
                  style={{background:"none",border:"1px solid #E8E0D0",borderRadius:4,padding:"3px 8px",color:"#7C5CFC",cursor:"pointer",fontSize:11}}>
                  {resendingInviteId===inv.id?"Resending…":"Resend"}
                </button>
                <button onClick={()=>revokeInvite(inv.id)}
                  style={{background:"none",border:"none",color:"#C84B2F",cursor:"pointer",fontSize:11}}>Revoke</button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
