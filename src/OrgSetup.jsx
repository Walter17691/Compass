import { useState } from 'react'
import { supabase } from './supabase'
import { CompassLogo } from './components/CompassLogo'
import { COLOR } from './styles/tokens'

// NEW-7 remediation — this screen previously ran on the pre-Brand-v2.0
// palette (V/BG hardcoded to the old purple/cream values), the same gap
// Login.jsx's own "Brand v2.0 migration" comment already closed there —
// values-only swap onto the current tokens, no layout/behaviour change.
const V = COLOR.purple
const BG = COLOR.rail
const CARD = "#FFFFFF"
const BORDER = "#E8E0D0"
const TEXT = "#1C1820"
const MUTED = "#6B6375"

// Final security gate (Release 1.0 P1 invitation remediation) — the
// "Join an existing team" mode that used to live here (handleJoin,
// calling join_org_with_invite_code with a shared org-wide code) is
// removed: that RPC's EXECUTE grant is revoked for authenticated callers
// entirely (see supabase/team_invites_and_hr_director_boundary_2026-09-11
// .sql's own Part 3) because it was a full, permanent, "anyone who knows
// the code" bypass of every safeguard the new team_invites system
// provides — no recipient binding, no expiry, no revocation, no per-invite
// audit. Founding-member org creation below never used that RPC and is
// completely unaffected. Team members now always join through a real,
// per-invitation token (see TeamInviteAccept.jsx) — there is no remaining
// legitimate self-service "type in a code" path, so offering a button
// that would only ever fail with a permission error would be worse than
// removing it.
export default function OrgSetup({ user, onComplete, onCancel }) {
  const [orgName, setOrgName] = useState('')
  const [userName, setUserName] = useState(user?.user_metadata?.name || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const inp = {
    width:"100%", background:BG, border:`1.5px solid ${BORDER}`,
    borderRadius:8, padding:"11px 14px", fontSize:14,
    outline:"none", color:TEXT, boxSizing:"border-box", marginBottom:12,
    fontFamily:"Archivo, system-ui, sans-serif"
  }

  const handleCreate = async () => {
    if(!orgName.trim()||!userName.trim()) return
    setLoading(true); setError(null)
    try {
      // crypto.getRandomValues, not Math.random — invite codes are a bearer
      // credential for joining an org, so they need CSPRNG-quality entropy.
      const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O/1/I — avoids transcription errors
      const inviteCode = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => ALPHABET[b % ALPHABET.length]).join("")
      const { data: org, error: orgErr } = await supabase
        .from('organisations')
        .insert({ name: orgName.trim(), invite_code: inviteCode, created_by: user.id })
        .select().single()
      if(orgErr) throw orgErr

      const { error: memberErr } = await supabase
        .from('org_members')
        .insert({ org_id: org.id, user_id: user.id, role: 'hr_director', name: userName.trim() })
      if(memberErr) throw memberErr

      onComplete({ org, member: { role: 'hr_director', name: userName.trim() } })
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"Archivo, system-ui, sans-serif"}}>
      <div style={{width:"100%",maxWidth:440}}>
        {onCancel&&(
          <button onClick={onCancel} style={{background:"none",border:"none",color:MUTED,fontSize:13,cursor:"pointer",marginBottom:16,padding:0,fontFamily:"Archivo, system-ui, sans-serif"}}>← Back to Compass</button>
        )}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><CompassLogo size={48}/></div>
          <h1 style={{fontFamily:"Archivo, system-ui, sans-serif",fontSize:28,color:TEXT,margin:"0 0 8px",fontWeight:400}}>{onCancel?"Add another organisation":"Welcome to Compass"}</h1>
          <p style={{fontSize:13,color:MUTED,margin:0}}>{onCancel?"Create a new workspace for your organisation":"Set up your team workspace to get started"}</p>
        </div>

        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:28}}>
          <h2 style={{color:TEXT,fontSize:16,fontWeight:600,margin:"0 0 20px",fontFamily:"Archivo, system-ui, sans-serif"}}>Create your team</h2>

          {error&&<div style={{background:"#FFF0ED",border:"1px solid #C84B2F44",borderRadius:6,padding:"10px 12px",fontSize:12,color:"#C84B2F",marginBottom:12}}>{error}</div>}

          <label htmlFor="org-setup-user-name" style={{display:"block",fontSize:10,fontWeight:600,color:MUTED,marginBottom:6}}>Your name</label>
          <input id="org-setup-user-name" placeholder="e.g. Sarah Jones" value={userName} onChange={e=>setUserName(e.target.value)} style={inp}/>

          <label htmlFor="org-setup-org-name" style={{display:"block",fontSize:10,fontWeight:600,color:MUTED,marginBottom:6}}>Organisation name</label>
          <input id="org-setup-org-name" placeholder="e.g. Acme Ltd HR Team" value={orgName} onChange={e=>setOrgName(e.target.value)} style={inp}/>

          <button
            onClick={handleCreate}
            disabled={loading}
            style={{width:"100%",background:V,border:"none",borderRadius:6,padding:"12px",fontSize:14,color:"#fff",fontWeight:600,cursor:"pointer",opacity:loading?0.7:1,fontFamily:"Archivo, system-ui, sans-serif"}}>
            {loading?'Setting up...':'Create team'}
          </button>
        </div>
      </div>
    </div>
  )
}
