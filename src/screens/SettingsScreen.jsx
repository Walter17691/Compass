import { useState } from 'react';
import { SCREENS, ROLE_PERMS } from '../constants';
import { Btn, Card, Badge } from '../components/Primitives';
import { UserAddForm } from '../components/UserAddForm';
import { isPro } from '../lib/plan';

export function SettingsScreen({ isHR, exportCSV, exportPDF, org, user, locations, deleteLocation, addLocation, teamMembers, editingMember, setEditingMember, removeMember, updateMemberRole, assignLocations, inviteForm, setInviteForm, inviting, inviteMember, wordTemplate, setWordTemplate, lsSet, wordTemplateRef, handleWordTemplateUpload, letterhead, setLetterhead, letterheadRef, handleLetterheadUpload, signature, setSignature, setShowSigPad, policies, setPolicies, policyFileRef, handlePolicyUpload, policyProcessing, users, currentUser, saveUsers, addUser, dueSoon, requestNotifications, notifGranted, emailDigestOptIn, toggleEmailDigest, orgWebhookUrl, orgWebhookType, saveOrgWebhook, sendTestWebhook, employeeCsvFileRef, employeeCsvProcessing, handleEmployeeCsvImport, exportEmployeesCsv, auditLog, cases, exportAllData, deleteAllData, setGdprAccepted, setShowGdpr, setOnboardStep, setShowOnboard, setScreen }) {
  const [webhookUrlDraft, setWebhookUrlDraft] = useState(orgWebhookUrl||"");
  return(
    <div style={{maxWidth:680,margin:"0 auto",padding:"40px 20px"}}>
      <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Settings</h2>
      <p style={{fontSize:13,color:"#6B6375",margin:"0 0 28px"}}>All data saved in your browser.</p>

      {/* Billing */}
      <Card style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535"}}>Billing</div>
          <Badge color={isPro(org)?"#1A7A4A":"#9B9098"}>{isPro(org)?"PRO":"FREE"}</Badge>
        </div>
        <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>
          {isPro(org)
            ? "Unlimited cases plus Portal, Calendar, DSAR tracking and the compliance digest."
            : "Free plan: 1 active case at a time, no Portal, Calendar, DSAR tracking or compliance digest. Upgrade to unlock the full platform."}
        </p>
        {isPro(org)
          ? <Btn variant="secondary" onClick={()=>{window.location.href=`/api/billing/manage?orgId=${encodeURIComponent(org?.id||"")}&userId=${encodeURIComponent(user?.id||"")}`;}}>Manage subscription</Btn>
          : <Btn onClick={()=>{window.location.href=`/api/billing/checkout?orgId=${encodeURIComponent(org?.id||"")}&userId=${encodeURIComponent(user?.id||"")}`;}}>Upgrade to Pro</Btn>
        }
      </Card>

      {/* Data export */}
      {isHR&&(
        <Card style={{marginBottom:20}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Data export</div>
          <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Export all cases and meeting records for reporting or backup.</p>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={exportCSV} style={{flex:1}}>Export CSV</Btn>
            <Btn onClick={exportPDF} variant="ghost" style={{flex:1}}>Export PDF</Btn>
          </div>
          <div style={{fontSize:11,color:"#5A5570",marginTop:10}}>CSV includes all cases, meetings, risk scores and dates. PDF includes full case summaries.</div>
        </Card>
      )}

      {/* Invite code */}
      {isHR&&org?.invite_code&&(
        <Card style={{marginBottom:20}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Team invite code</div>
          <p style={{fontSize:12,color:"#6B6880",marginBottom:12}}>Share this code with team members to join your workspace.</p>
          <div style={{display:"flex",alignItems:"center",gap:10,background:"#F5F1EA",borderRadius:8,padding:"12px 16px"}}>
            <span style={{fontFamily:"JetBrains Mono,monospace",fontSize:20,color:"#7C5CFC",letterSpacing:4,fontWeight:700}}>{org.invite_code}</span>
            <button onClick={()=>navigator.clipboard.writeText(org.invite_code)} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"4px 10px",fontSize:11,color:"#6B6375",cursor:"pointer"}}>Copy</button>
          </div>
        </Card>
      )}

      {/* Locations */}
      {isHR&&(
        <Card style={{marginBottom:20}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Locations</div>
          <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Add office locations. Managers will be assigned to a location and will only see cases from their location.</p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
            {locations.map(l=>(
              <div key={l.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#F5F1EA",borderRadius:8,padding:"10px 14px"}}>
                <span style={{fontSize:14,color:"#1A1535"}}>{l.name}</span>
                <button onClick={()=>deleteLocation(l.id)} style={{background:"none",border:"none",color:"#C84B2F",cursor:"pointer",fontSize:12}}>Remove</button>
              </div>
            ))}
            {locations.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No locations added yet</div>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <input id="new-location-input" placeholder="e.g. London, Manchester..."
              style={{flex:1,background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535"}}/>
            <Btn onClick={()=>{
              const input = document.getElementById("new-location-input");
              if(input?.value.trim()){ addLocation(input.value.trim()); input.value=""; }
            }}>Add</Btn>
          </div>
        </Card>
      )}

      {/* Team members */}
      {isHR&&(
        <Card style={{marginBottom:20}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>Team members</div>
          <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>Invite team members to your workspace. They will receive an email invite.</p>

          {/* Current members */}
          <div style={{marginBottom:16}}>
            {teamMembers.map(m=>(
              <div key={m.id} style={{padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div>
                    <div style={{fontSize:14,color:"#1A1535"}}>{m.name||"Unknown"}</div>
                    <div style={{fontSize:11,color:"#6B6880"}}>
                      {m.role==="hr_director"?"HR Director":m.role==="hr_manager"?"HR Manager":"Location Manager"}
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
                    <select value={m.role} onChange={e=>updateMemberRole(m.id,e.target.value)}
                      style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#1A1535",outline:"none",marginBottom:12}}>
                      <option value="hr_director">HR Director</option>
                      <option value="hr_manager">HR Manager</option>
                      <option value="location_manager">Location Manager</option>
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

          {/* Invite form */}
          <div style={{borderTop:"1px solid #E8E0D0",paddingTop:16}}>
            <div style={{fontSize:11,color:"#6B6375",marginBottom:12,fontWeight:600}}>Invite new member</div>
            <input placeholder="Full name" value={inviteForm.name} onChange={e=>setInviteForm(p=>({...p,name:e.target.value}))}
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:8,boxSizing:"border-box"}}/>
            <input placeholder="Email address" type="email" value={inviteForm.email} onChange={e=>setInviteForm(p=>({...p,email:e.target.value}))}
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:8,boxSizing:"border-box"}}/>
            <select value={inviteForm.role} onChange={e=>setInviteForm(p=>({...p,role:e.target.value}))}
              style={{width:"100%",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",color:"#1A1535",marginBottom:12}}>
              <option value="hr_manager">HR Manager</option>
              <option value="hr_director">HR Director</option>
              <option value="location_manager">Location Manager</option>
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
      )}

      {/* Employee records (CSV import/export) */}
      <Card style={{marginBottom:12}}>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Employee records</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Import or export employee names, job titles, start dates and locations as a CSV — works with an export from any HRIS or payroll system (BambooHR, Xero, Sage, etc). Expected columns: Name, Job title, Start date, Location.</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Btn onClick={()=>employeeCsvFileRef.current?.click()} disabled={employeeCsvProcessing}>{employeeCsvProcessing?"Importing...":"Import from CSV"}</Btn>
          <Btn variant="secondary" onClick={exportEmployeesCsv}>Export to CSV</Btn>
        </div>
        <input ref={employeeCsvFileRef} type="file" accept=".csv" onChange={handleEmployeeCsvImport} style={{display:"none"}} />
      </Card>

      {/* Word template */}
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Word letter template</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Upload your .docx with header/footer. Enables Word export on letters.</p></div>
          <Badge color="#1C5AA0">WORD</Badge>
        </div>
        {wordTemplate?<div style={{background:"#FDFAF5",borderRadius:7,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#1A1535"}}>{wordTemplate.name}</span><Btn variant="danger" onClick={()=>{setWordTemplate(null);lsSet("compass_word_template",null);}} style={{padding:"2px 10px",fontSize:11}}>Remove</Btn></div>:<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#5A5570"}}>No template uploaded</div>}
        <input ref={wordTemplateRef} type="file" accept=".docx" onChange={handleWordTemplateUpload} style={{display:"none"}} />
        <Btn variant="blue" onClick={()=>wordTemplateRef.current?.click()}>{wordTemplate?"Replace":"Upload .docx template"} →</Btn>
      </Card>

      {/* Letterhead */}
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Letterhead image</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>PNG or JPG — appears at top of PDF letters.</p></div>
          <Badge>PDF</Badge>
        </div>
        {letterhead?<div style={{background:"#fff",borderRadius:7,padding:12,marginBottom:12,position:"relative"}}><img src={letterhead} alt="Letterhead" style={{width:"100%",maxHeight:100,objectFit:"contain",objectPosition:"left"}}/><button onClick={()=>{setLetterhead(null);lsSet("compass_letterhead",null);}} style={{position:"absolute",top:6,right:6,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 8px",fontSize:11,color:"#C84B2F",cursor:"pointer"}}>Remove</button></div>:<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#5A5570"}}>No letterhead uploaded</div>}
        <input ref={letterheadRef} type="file" accept="image/*" onChange={handleLetterheadUpload} style={{display:"none"}} />
        <Btn onClick={()=>letterheadRef.current?.click()}>{letterhead?"Replace":"Upload letterhead"} →</Btn>
      </Card>

      {/* E-signature */}
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>E-signature</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Draw or type your signature. Applied to all PDF letters.</p></div>
        </div>
        {signature?<div style={{background:"#fff",borderRadius:7,padding:"12px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {signature.type==="typed"?<div style={{fontFamily:"'Brush Script MT',cursive",fontSize:28,color:"#FFFFFF"}}>{signature.data}</div>:<img src={signature.data} alt="Sig" style={{maxHeight:45,maxWidth:160}}/>}
          <Btn variant="danger" onClick={()=>{setSignature(null);lsSet("compass_signature",null);}} style={{padding:"3px 10px",fontSize:11}}>Remove</Btn>
        </div>:<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:12,fontSize:12,color:"#5A5570"}}>No signature saved</div>}
        <Btn onClick={()=>setShowSigPad(true)}>{signature?"Update":"Create"} signature →</Btn>
      </Card>

      {/* Policies */}
      <Card style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Company policies</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Upload HR policies (.docx, .txt). Compass references them in all AI outputs.</p></div>
          <Badge color="#7C5CFC">AI</Badge>
        </div>
        {policies.length>0&&(
          <div style={{marginBottom:14}}>
            {policies.map(p=>(
              <div key={p.id} style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:7,padding:"9px 12px",marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <span style={{fontSize:12,color:"#1A1535",fontWeight:600}}>{p.name}</span>
                  <span style={{fontSize:10,color:"#5A5570",marginLeft:8,fontFamily:"JetBrains Mono,monospace"}}>{p.size}</span>
                </div>
                <Btn variant="danger" onClick={()=>{const u=policies.filter(x=>x.id!==p.id);setPolicies(u);lsSet("compass_policies",u);}} style={{padding:"2px 10px",fontSize:11}}>Remove</Btn>
              </div>
            ))}
          </div>
        )}
        {policies.length===0&&<div style={{background:"#FDFAF5",border:"2px dashed #E8E0D0",borderRadius:7,padding:"20px",textAlign:"center",marginBottom:14,fontSize:12,color:"#5A5570"}}>No policies uploaded</div>}
        <input ref={policyFileRef} type="file" multiple accept=".txt,.md,.docx" onChange={handlePolicyUpload} style={{display:"none"}} />
        <Btn onClick={()=>policyFileRef.current?.click()} disabled={policyProcessing}>{policyProcessing?"Processing...":"+ Upload policies →"}</Btn>
        {policies.length>0&&<div style={{marginTop:12,fontSize:11,color:"#7C5CFC"}}>✓ Active in: prep, note structuring, letter drafting, risk scoring</div>}
      </Card>

      {/* Team members */}
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Team members</h3><p style={{fontSize:12,color:"#6B6375",margin:0,lineHeight:1.6}}>Manage who can access Compass. Each user has role-based permissions.</p></div>
        </div>
        {users.length>0&&(
          <div style={{marginBottom:14}}>
            {users.map(u=>(
              <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
                <div>
                  <div style={{fontSize:14,color:"#1A1535",fontWeight:currentUser?.id===u.id?600:400}}>{u.name}{currentUser?.id===u.id&&" (you)"}</div>
                  <div style={{fontSize:11,color:"#6B6880",marginTop:1}}>{u.role} {u.email?"· "+u.email:""}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{fontSize:10,color:"#5A5570"}}>
                    {ROLE_PERMS[u.role]?.viewAll?"All cases":"Assigned only"} ·{" "}
                    {ROLE_PERMS[u.role]?.edit?"Can edit":"Read only"}
                  </div>
                  <button onClick={()=>saveUsers(users.filter(x=>x.id!==u.id))} style={{background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"3px 8px",fontSize:11,color:"#C84B2F",cursor:"pointer"}}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <UserAddForm onAdd={(name,role,email)=>addUser(name,role,email)} />
        <div style={{marginTop:12,background:"#FDFAF5",borderRadius:7,padding:"10px 14px"}}>
          <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:6}}>PERMISSIONS</div>
          {Object.entries(ROLE_PERMS).map(([role,p])=>(
            <div key={role} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6B6880",padding:"3px 0"}}>
              <span style={{color:"#6B6375",fontWeight:500}}>{role}</span>
              <span>{p.viewAll?"All cases":"Assigned"} · {p.edit?"Edit":"Read"} · {p.delete?"Delete":"No delete"} · {p.viewRisk?"Risk":"No risk"}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Notifications */}
      <Card style={{marginBottom:12}}>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Deadline reminders</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Get browser notifications for upcoming and overdue deadlines.</p>
        {dueSoon.length>0?(
          <div style={{marginBottom:14}}>
            {dueSoon.slice(0,5).map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1a1a1a",fontSize:12}}>
                <div>
                  <span style={{color:d.overdue?"#E8622A":"#1C1820"}}>{d.employeeName}</span>
                  <span style={{color:"#6B6880",marginLeft:8}}>{d.label}</span>
                </div>
                <span style={{color:d.overdue?"#E8622A":"#888",fontFamily:"JetBrains Mono,monospace"}}>{d.overdue?`${Math.abs(d.daysLeft)}d overdue`:`${d.daysLeft}d`}</span>
              </div>
            ))}
          </div>
        ):<div style={{fontSize:12,color:"#5A5570",marginBottom:14}}>No upcoming deadlines in the next 7 days</div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <Btn onClick={requestNotifications} disabled={notifGranted}>{notifGranted?"Notifications enabled":"Enable browser notifications"}</Btn>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#6B6375",cursor:"pointer",marginLeft:4}}>
            <input type="checkbox" checked={!!emailDigestOptIn} onChange={toggleEmailDigest} style={{cursor:"pointer"}}/>
            Email me a daily compliance digest
          </label>
        </div>
      </Card>

      {/* Team chat notifications */}
      <Card style={{marginBottom:12}}>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Team chat notifications</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Post the same overdue/near-term deadlines from the daily digest into a Slack or Teams channel via an incoming webhook.</p>
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <select value={orgWebhookType} onChange={e=>saveOrgWebhook(webhookUrlDraft, e.target.value)} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",background:"#fff",color:"#1A1535"}}>
            <option value="slack">Slack</option>
            <option value="teams">Microsoft Teams</option>
          </select>
          <input value={webhookUrlDraft} onChange={e=>setWebhookUrlDraft(e.target.value)} onBlur={()=>saveOrgWebhook(webhookUrlDraft, orgWebhookType)} placeholder="https://hooks.slack.com/services/..." style={{flex:1,minWidth:240,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"9px 12px",color:"#1A1535"}}/>
        </div>
        <Btn variant="secondary" onClick={sendTestWebhook} disabled={!webhookUrlDraft}>Send test message</Btn>
      </Card>

      {/* Audit trail */}
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div><h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Audit trail</h3><p style={{fontSize:12,color:"#6B6375",margin:0}}>Every action timestamped and logged.</p></div>
          <span style={{fontSize:11,color:"#6B6880"}}>{auditLog.length} entries</span>
        </div>
        <div style={{maxHeight:240,overflowY:"auto"}}>
          {auditLog.slice(0,50).map((e,i)=>(
            <div key={i} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid #1a1a1a",alignItems:"flex-start"}}>
              <span style={{fontSize:10,color:"#5A5570",fontFamily:"JetBrains Mono,monospace",flexShrink:0,marginTop:1}}>{new Date(e.ts).toLocaleString("en-GB",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
              <div>
                <span style={{fontSize:11,color:"#1A1535",fontWeight:500}}>{e.action}</span>
                {e.detail&&<span style={{fontSize:11,color:"#6B6880",marginLeft:6}}>{e.detail}</span>}
                {e.user&&e.user!=="HR Manager"&&<span style={{fontSize:10,color:"#7C5CFC",marginLeft:6}}>· {e.user}</span>}
              </div>
            </div>
          ))}
          {auditLog.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No actions logged yet</div>}
        </div>
      </Card>

      {/* GDPR / Data */}
      <Card style={{marginBottom:20}}>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Data &amp; privacy</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px",lineHeight:1.6}}>Case files and employee records are stored in the cloud, shared with your organisation. Policies, signature/letterhead and the audit log stay in this browser. You are responsible for UK GDPR compliance when processing employee personal data.</p>
        <div style={{background:"#FDFAF5",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:10,color:"#7C5CFC",fontWeight:700,letterSpacing:1,marginBottom:8}}>DATA INVENTORY</div>
          {[
            {l:"Case files & meetings",v:cases.length+" cases, "+cases.reduce((t,c)=>t+c.meetings.length,0)+" meetings"},
            {l:"Policies uploaded",v:policies.length+" documents"},
            {l:"Audit log entries",v:auditLog.length+" entries"},
            {l:"Storage used",v:Math.round(JSON.stringify(localStorage).length/1024)+"kb"},
          ].map(({l,v})=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6B6880",padding:"3px 0"}}>
              <span>{l}</span><span style={{color:"#6B6375"}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <Btn variant="secondary" onClick={exportAllData}>Export all data</Btn>
          <Btn variant="danger" onClick={deleteAllData} style={{color:"#C84B2F"}}>Delete all data</Btn>
          <button onClick={()=>{setGdprAccepted(false);lsSet("compass_gdpr",false);setShowGdpr(true);}} style={{background:"none",border:"none",color:"#6B6880",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>View privacy notice</button>
        </div>
      </Card>

      {/* Help / Onboarding */}
      <Card style={{marginBottom:20}}>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Help &amp; onboarding</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px"}}>Rewatch the getting started guide.</p>
        <Btn onClick={()=>{setOnboardStep(0);setShowOnboard(true);}}>Restart tour</Btn>
      </Card>

      <Btn variant="ghost" onClick={()=>setScreen(SCREENS.HOME)}>← Back to home</Btn>
    </div>
  );
}
