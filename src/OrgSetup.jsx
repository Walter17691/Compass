import { useState } from 'react'
import { supabase } from './supabase'

const V = "#7C5CFC"
const BG = "#0D0D0F"
const CARD = "#1C1C22"
const BORDER = "#2A2A35"
const TEXT = "#F2EDE4"

function CompassLogo({ size=36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="45" stroke={V} strokeWidth="3" fill="none"/>
      <polygon points="50,14 54,50 50,50 46,50" transform="rotate(40 50 50)" fill={V}/>
      <polygon points="50,86 54,50 50,50 46,50" transform="rotate(40 50 50)" fill={V} opacity="0.2"/>
      <circle cx="50" cy="50" r="4" fill="#0D0D0F"/>
      <circle cx="50" cy="50" r="2" fill={V}/>
    </svg>
  )
}

export default function OrgSetup({ user, onComplete }) {
  const [mode, setMode] = useState(null) // 'create' or 'join'
  const [orgName, setOrgName] = useState('')
  const [userName, setUserName] = useState(user?.user_metadata?.name || '')
  const [role, setRole] = useState('hr_manager')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const inp = {
    width:"100%", background:BG, border:`1px solid ${BORDER}`,
    borderRadius:6, padding:"10px 12px", fontSize:14,
    outline:"none", color:TEXT, boxSizing:"border-box", marginBottom:12,
    fontFamily:"Playfair Display, Georgia, serif"
  }

  const handleCreate = async () => {
    if(!orgName.trim()||!userName.trim()) return
    setLoading(true); setError(null)
    try {
      const inviteCode = Math.random().toString(36).slice(2,8).toUpperCase()
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

  const handleJoin = async () => {
    if(!inviteCode.trim()||!userName.trim()) return
    setLoading(true); setError(null)
    try {
      const { data: org, error: orgErr } = await supabase
        .from('organisations')
        .select()
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .single()
      if(orgErr||!org) throw new Error('Invalid invite code')

      const { error: memberErr } = await supabase
        .from('org_members')
        .insert({ org_id: org.id, user_id: user.id, role, name: userName.trim() })
      if(memberErr) throw memberErr

      onComplete({ org, member: { role, name: userName.trim() } })
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:440}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><CompassLogo size={48}/></div>
          <h1 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:28,color:TEXT,margin:"0 0 8px",fontWeight:400}}>Welcome to Compass</h1>
          <p style={{fontSize:13,color:"#555",margin:0}}>Set up your team workspace to get started</p>
        </div>

        {!mode?(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <button onClick={()=>setMode('create')}
              style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"20px 24px",cursor:"pointer",textAlign:"left"}}>
              <div style={{fontSize:16,color:TEXT,fontWeight:600,marginBottom:4,fontFamily:"Playfair Display,Georgia,serif"}}>Create a new team</div>
              <div style={{fontSize:13,color:"#555"}}>Start a new Compass workspace for your organisation</div>
            </button>
            <button onClick={()=>setMode('join')}
              style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"20px 24px",cursor:"pointer",textAlign:"left"}}>
              <div style={{fontSize:16,color:TEXT,fontWeight:600,marginBottom:4,fontFamily:"Playfair Display,Georgia,serif"}}>Join an existing team</div>
              <div style={{fontSize:13,color:"#555"}}>Enter an invite code from your HR Director</div>
            </button>
          </div>
        ) : (
          <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:28}}>
            <button onClick={()=>{setMode(null);setError(null);}} style={{background:"none",border:"none",color:"#555",fontSize:13,cursor:"pointer",marginBottom:16,padding:0}}>← Back</button>
            <h2 style={{color:TEXT,fontSize:16,fontWeight:600,margin:"0 0 20px",fontFamily:"Playfair Display,Georgia,serif"}}>
              {mode==='create'?'Create your team':'Join a team'}
            </h2>

            {error&&<div style={{background:"#2A1008",border:"1px solid #E8622A44",borderRadius:6,padding:"10px 12px",fontSize:12,color:"#E8622A",marginBottom:12}}>{error}</div>}

            <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Your name</label>
            <input placeholder="e.g. Sarah Jones" value={userName} onChange={e=>setUserName(e.target.value)} style={inp}/>

            {mode==='create'?(
              <>
                <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Organisation name</label>
                <input placeholder="e.g. Acme Ltd HR Team" value={orgName} onChange={e=>setOrgName(e.target.value)} style={inp}/>
              </>
            ):(
              <>
                <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Role</label>
                <select value={role} onChange={e=>setRole(e.target.value)} style={{...inp,marginBottom:12}}>
                  <option value="hr_manager">HR Manager</option>
                  <option value="hr_director">HR Director</option>
                </select>
                <label style={{display:"block",fontSize:10,fontWeight:600,color:"#666",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Invite code</label>
                <input placeholder="e.g. ABC123" value={inviteCode} onChange={e=>setInviteCode(e.target.value)} style={{...inp,textTransform:"uppercase",letterSpacing:2}}/>
              </>
            )}

            <button
              onClick={mode==='create'?handleCreate:handleJoin}
              disabled={loading}
              style={{width:"100%",background:V,border:"none",borderRadius:6,padding:"12px",fontSize:14,color:"#fff",fontWeight:600,cursor:"pointer",opacity:loading?0.7:1,fontFamily:"Playfair Display,Georgia,serif"}}>
              {loading?'Setting up...':(mode==='create'?'Create team':'Join team')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
