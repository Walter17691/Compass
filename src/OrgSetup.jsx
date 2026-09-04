import { useState } from 'react'
import { supabase } from './supabase'
import { CompassLogo } from './components/CompassLogo'

const V = "#7C5CFC"
const BG = "#FDFAF5"
const CARD = "#FFFFFF"
const BORDER = "#E8E0D0"
const TEXT = "#1C1820"
const MUTED = "#6B6375"

export default function OrgSetup({ user, onComplete, onCancel }) {
  const pendingInvite = localStorage.getItem('compass_pending_invite') || ''
  const [mode, setMode] = useState(pendingInvite ? 'join' : null) // 'create' or 'join'
  const [orgName, setOrgName] = useState('')
  const [userName, setUserName] = useState(user?.user_metadata?.name || '')
  const [inviteCode, setInviteCode] = useState(pendingInvite)
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

      localStorage.removeItem('compass_pending_invite')
      onComplete({ org, member: { role: 'hr_director', name: userName.trim() } })
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  const handleJoin = async () => {
    if(!inviteCode.trim()||!userName.trim()) return
    setLoading(true); setError(null)
    try {
      // Validating the invite code and inserting the membership row both
      // happen server-side inside this function - the client never gets a
      // path to insert itself into an org without a code that actually
      // matched. See supabase/join_org_by_code_2026-07-23.sql for why.
      // Always joins as location_manager (the RPC no longer accepts a
      // caller-supplied role — see org_members_privilege_escalation_fix
      // _2026-08-04.sql) — an existing HR Director/Manager grants more
      // afterward via Settings' "Edit access".
      const { data, error: rpcErr } = await supabase.rpc('join_org_with_invite_code', {
        p_invite_code: inviteCode.trim(),
        p_name: userName.trim(),
      })
      if(rpcErr) throw rpcErr
      const joined = Array.isArray(data) ? data[0] : data
      if(!joined) throw new Error('Invalid invite code')

      const org = { id: joined.org_id, name: joined.org_name, invite_code: joined.org_invite_code }
      localStorage.removeItem('compass_pending_invite')
      onComplete({ org, member: { role: 'location_manager', name: userName.trim() } })
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
          <p style={{fontSize:13,color:MUTED,margin:0}}>{onCancel?"Create a new workspace or join one with an invite code":"Set up your team workspace to get started"}</p>
        </div>

        {!mode?(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <button onClick={()=>setMode('create')}
              style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"20px 24px",cursor:"pointer",textAlign:"left",fontFamily:"Archivo, system-ui, sans-serif"}}>
              <div style={{fontSize:16,color:TEXT,fontWeight:600,marginBottom:4,fontFamily:"Archivo, system-ui, sans-serif"}}>Create a new team</div>
              <div style={{fontSize:13,color:MUTED}}>Start a new Compass workspace for your organisation</div>
            </button>
            <button onClick={()=>setMode('join')}
              style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"20px 24px",cursor:"pointer",textAlign:"left",fontFamily:"Archivo, system-ui, sans-serif"}}>
              <div style={{fontSize:16,color:TEXT,fontWeight:600,marginBottom:4,fontFamily:"Archivo, system-ui, sans-serif"}}>Join an existing team</div>
              <div style={{fontSize:13,color:MUTED}}>Enter an invite code from your HR Director</div>
            </button>
          </div>
        ) : (
          <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:28}}>
            <button onClick={()=>{setMode(null);setError(null);}} style={{background:"none",border:"none",color:MUTED,fontSize:13,cursor:"pointer",marginBottom:16,padding:0,fontFamily:"Archivo, system-ui, sans-serif"}}>← Back</button>
            <h2 style={{color:TEXT,fontSize:16,fontWeight:600,margin:"0 0 20px",fontFamily:"Archivo, system-ui, sans-serif"}}>
              {mode==='create'?'Create your team':'Join a team'}
            </h2>

            {error&&<div style={{background:"#FFF0ED",border:"1px solid #C84B2F44",borderRadius:6,padding:"10px 12px",fontSize:12,color:"#C84B2F",marginBottom:12}}>{error}</div>}

            {pendingInvite&&mode==='join'&&(
              <div style={{background:"#E8F5EE",border:"1px solid #1A7A4A44",borderRadius:6,padding:"10px 12px",fontSize:12,color:"#1A7A4A",marginBottom:12}}>
                You followed an invite link — your invite code is filled in below.
              </div>
            )}

            <label htmlFor="org-setup-user-name" style={{display:"block",fontSize:10,fontWeight:600,color:MUTED,marginBottom:6}}>Your name</label>
            <input id="org-setup-user-name" placeholder="e.g. Sarah Jones" value={userName} onChange={e=>setUserName(e.target.value)} style={inp}/>

            {mode==='create'?(
              <>
                <label htmlFor="org-setup-org-name" style={{display:"block",fontSize:10,fontWeight:600,color:MUTED,marginBottom:6}}>Organisation name</label>
                <input id="org-setup-org-name" placeholder="e.g. Acme Ltd HR Team" value={orgName} onChange={e=>setOrgName(e.target.value)} style={inp}/>
              </>
            ):(
              <>
                <label htmlFor="org-setup-invite-code" style={{display:"block",fontSize:10,fontWeight:600,color:MUTED,marginBottom:6}}>Invite code</label>
                <input id="org-setup-invite-code" placeholder="e.g. ABC123" value={inviteCode} onChange={e=>setInviteCode(e.target.value)} style={{...inp,textTransform:"uppercase",letterSpacing:2}}/>
                <div style={{fontSize:11,color:MUTED,margin:"-6px 0 12px"}}>You'll join as a Location Manager — an HR Director can grant broader access afterward from Settings.</div>
              </>
            )}

            <button
              onClick={mode==='create'?handleCreate:handleJoin}
              disabled={loading}
              style={{width:"100%",background:V,border:"none",borderRadius:6,padding:"12px",fontSize:14,color:"#fff",fontWeight:600,cursor:"pointer",opacity:loading?0.7:1,fontFamily:"Archivo, system-ui, sans-serif"}}>
              {loading?'Setting up...':(mode==='create'?'Create team':'Join team')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
