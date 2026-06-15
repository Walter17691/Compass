import { useState } from 'react'
import { supabase } from './supabase'

const V = "#7C5CFC"
const BG = "#0D0D0F"
const CARD = "#1C1C22"
const BORDER = "#2A2A35"
const TEXT = "#F2EDE4"

function CompassLogo({ size=40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="28" stroke={V} strokeWidth="4"/>
      <line x1="32" y1="8" x2="32" y2="56" stroke={V} strokeWidth="2" opacity="0.3"/>
      <line x1="8" y1="32" x2="56" y2="32" stroke={V} strokeWidth="2" opacity="0.3"/>
      <polygon points="32,12 36,32 32,36 28,32" fill={V}/>
      <polygon points="32,52 36,32 32,28 28,32" fill="#444"/>
    </svg>
  )
}

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return; }
    onLogin(data.user)
    setLoading(false)
  }

  const handleSignup = async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, company } }
    })
    if (error) { setError(error.message); setLoading(false); return; }
    setMessage('Check your email to confirm your account, then log in.')
    setMode('login')
    setLoading(false)
  }

  const handleReset = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) { setError(error.message); setLoading(false); return; }
    setMessage('Password reset email sent.')
    setLoading(false)
  }

  const inp = {
    width:"100%", background:BG, border:`1px solid ${BORDER}`,
    borderRadius:6, padding:"10px 12px", fontSize:14,
    outline:"none", color:TEXT, boxSizing:"border-box", marginBottom:12
  }

  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><CompassLogo size={48}/></div>
          <div style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:V,marginBottom:8,fontWeight:600}}>UK HR Intelligence</div>
          <h1 style={{fontFamily:"Playfair Display,Georgia,serif",fontSize:28,color:TEXT,margin:0,fontWeight:400}}>Compass</h1>
        </div>

        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:28}}>
          <h2 style={{color:TEXT,fontSize:16,fontWeight:600,margin:"0 0 20px"}}>
            {mode==='login'?'Sign in':mode==='signup'?'Create account':'Reset password'}
          </h2>

          {error && <div style={{background:"#2A1008",border:"1px solid #E8622A44",borderRadius:6,padding:"10px 12px",fontSize:12,color:"#E8622A",marginBottom:12}}>{error}</div>}
          {message && <div style={{background:"#0A1A0A",border:"1px solid #7C5CFC44",borderRadius:6,padding:"10px 12px",fontSize:12,color:V,marginBottom:12}}>{message}</div>}

          {mode==='signup' && (
            <>
              <input placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} style={inp}/>
              <input placeholder="Company name" value={company} onChange={e=>setCompany(e.target.value)} style={inp}/>
            </>
          )}

          <input placeholder="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inp}/>

          {mode!=='reset' && (
            <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{...inp,marginBottom:20}}/>
          )}

          <button
            onClick={mode==='login'?handleLogin:mode==='signup'?handleSignup:handleReset}
            disabled={loading}
            style={{width:"100%",background:V,border:"none",borderRadius:6,padding:"12px",fontSize:14,color:"#fff",fontWeight:600,cursor:"pointer",marginBottom:16,opacity:loading?0.7:1}}>
            {loading?'Please wait...':(mode==='login'?'Sign in':mode==='signup'?'Create account':'Send reset email')}
          </button>

          <div style={{fontSize:12,color:"#555",textAlign:"center",display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
            {mode==='login' && <>
              <button onClick={()=>{setMode('signup');setError(null);setMessage(null);}} style={{background:"none",border:"none",color:V,cursor:"pointer",fontSize:12}}>Create account</button>
              <span>·</span>
              <button onClick={()=>{setMode('reset');setError(null);setMessage(null);}} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:12}}>Forgot password?</button>
            </>}
            {mode!=='login' && <button onClick={()=>{setMode('login');setError(null);setMessage(null);}} style={{background:"none",border:"none",color:V,cursor:"pointer",fontSize:12}}>Back to sign in</button>}
          </div>
        </div>

        <p style={{fontSize:11,color:"#333",textAlign:"center",marginTop:20}}>
          Compass provides AI-assisted guidance. Always verify against current UK employment law.
        </p>
      </div>
    </div>
  )
}
