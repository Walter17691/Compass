import { useState } from 'react'
import { supabase } from './supabase'

const C = {
  bg: "#FDFAF5",
  card: "#FFFFFF",
  accent: "#7C5CFC",
  accentLight: "#EDE8FF",
  border: "#E8E0D0",
  text: "#1C1820",
  muted: "#6B6375",
  subtle: "#9B9098",
  error: "#C84B2F",
  errorBg: "#FFF0ED",
  success: "#1A7A4A",
  successBg: "#E8F5EE",
}

function CompassLogo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="48" fill={C.accent}/>
      <polygon points="50,16 56,50 50,58 44,50" fill={C.bg}/>
      <polygon points="50,84 44,50 50,42 56,50" fill="rgba(253,250,245,0.28)"/>
      <circle cx="50" cy="50" r="5" fill={C.accent} stroke={C.bg} strokeWidth="2"/>
    </svg>
  )
}

// Signup/login for employees following a portal invite link. Deliberately
// separate from Login.jsx -- this must never route through OrgSetup.jsx's
// "create or join a team" picker, which is exclusively for HR-staff org
// membership. main.jsx decides which of the two to render based on whether
// a pending portal invite token is present.
export default function PortalSignup({ onLogin }) {
  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const handleLogin = async () => {
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true); setError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return; }
    onLogin(data.user)
    setLoading(false)
  }

  const handleSignup = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return; }
    setMessage('Check your email to confirm your account, then sign in below.')
    setMode('login')
    setLoading(false)
  }

  const inp = (extra = {}) => ({
    width: "100%", background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 8,
    padding: "11px 14px", fontSize: 14, outline: "none", color: C.text, boxSizing: "border-box",
    fontFamily: "DM Sans, system-ui, sans-serif", transition: "border-color 0.15s", ...extra
  })
  const label = { fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6, letterSpacing: "0.3px" }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "DM Sans, system-ui, sans-serif" }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 60% at 50% 0%, #EDE8FF44 0%, transparent 70%)", zIndex: 0 }} />
      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><CompassLogo size={56} /></div>
          <div style={{ fontFamily: "DM Serif Display, Georgia, serif", fontSize: 32, color: C.text, fontWeight: 400, letterSpacing: "-0.5px", marginBottom: 6 }}>Compass</div>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 6, fontStyle: "italic" }}>Your employee portal</div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, boxShadow: "0 4px 24px rgba(124,92,252,0.07)" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 8, fontFamily: "DM Serif Display, Georgia, serif" }}>
            {mode === 'signup' ? "Set up your account" : "Welcome back"}
          </div>
          {mode === 'signup' && (
            <div style={{ background: C.accentLight, border: "1px solid #D4C9F5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.accent, marginBottom: 20, lineHeight: 1.5 }}>
              Use the same email address your employer sent your invite to — signing up with a different one won't work.
            </div>
          )}
          {mode === 'login' && <div style={{ marginBottom: 20 }} />}

          {error && <div style={{ background: C.errorBg, border: `1px solid #F5C6BB`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.error, marginBottom: 16 }}>{error}</div>}
          {message && <div style={{ background: C.successBg, border: `1px solid #A8D5B5`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.success, marginBottom: 16 }}>{message}</div>}

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="portal-signup-email" style={label}>Email address</label>
            <input id="portal-signup-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={inp()}
              onFocus={e => e.target.style.borderColor = C.accent} onBlur={e => e.target.style.borderColor = C.border}
              onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleSignup())} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="portal-signup-password" style={label}>Password</label>
            <input id="portal-signup-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'} style={inp()}
              onFocus={e => e.target.style.borderColor = C.accent} onBlur={e => e.target.style.borderColor = C.border}
              onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleSignup())} />
          </div>

          <button
            onClick={mode === 'login' ? handleLogin : handleSignup}
            disabled={loading}
            style={{ width: "100%", background: loading ? "#B8A9F8" : C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "13px 0", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "DM Sans, system-ui, sans-serif", marginBottom: 16 }}
          >
            {loading ? "Please wait…" : mode === 'login' ? "Sign in" : "Create account"}
          </button>

          <div style={{ textAlign: "center", fontSize: 13, color: C.muted }}>
            {mode === 'login' ? (
              <>New here? <button onClick={() => { setMode('signup'); setError(null); setMessage(null); }} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "DM Sans, system-ui, sans-serif" }}>Set up your account</button></>
            ) : (
              <>Already set up? <button onClick={() => { setMode('login'); setError(null); setMessage(null); }} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "DM Sans, system-ui, sans-serif" }}>Sign in</button></>
            )}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: C.subtle }}>
          Secure · GDPR compliant · UK employment law aligned
        </div>
      </div>
    </div>
  )
}
