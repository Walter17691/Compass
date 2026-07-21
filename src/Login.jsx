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
      <circle cx="50" cy="50" r="44" stroke={C.accent} strokeWidth="9" fill="none" />
      <ellipse cx="50" cy="50" rx="8" ry="30" transform="rotate(-40 50 50)" fill={C.accent} />
      <circle cx="50" cy="50" r="5.5" fill={C.bg} />
    </svg>
  )
}

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [keepLoggedIn, setKeepLoggedIn] = useState(true)
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
    if (!name || !email || !password) { setError('Please fill in all fields.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError(null)
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, company } }
    })
    if (error) { setError(error.message); setLoading(false); return; }
    setMessage('Check your email to confirm your account, then sign in.')
    setMode('login')
    setLoading(false)
  }

  const handleReset = async () => {
    if (!email) { setError('Enter your email address first.'); return; }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })
    if (error) { setError(error.message); setLoading(false); return; }
    setMessage('Password reset link sent — check your email.')
    setLoading(false)
  }

  const inp = (extra = {}) => ({
    width: "100%",
    background: C.bg,
    border: `1.5px solid ${C.border}`,
    borderRadius: 8,
    padding: "11px 14px",
    fontSize: 14,
    outline: "none",
    color: C.text,
    boxSizing: "border-box",
    fontFamily: "DM Sans, system-ui, sans-serif",
    transition: "border-color 0.15s",
    ...extra
  })

  const label = {
    fontSize: 12,
    fontWeight: 600,
    color: C.muted,
    display: "block",
    marginBottom: 6,
    letterSpacing: "0.3px"
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      fontFamily: "DM Sans, system-ui, sans-serif"
    }}>
      {/* Subtle background pattern */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, #EDE8FF44 0%, transparent 70%)",
        zIndex: 0
      }} />

      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <CompassLogo size={52} />
          </div>
          <div style={{
            fontFamily: "DM Serif Display, Georgia, serif",
            fontSize: 30,
            color: C.text,
            fontWeight: 400,
            letterSpacing: "-0.5px",
            marginBottom: 4
          }}>Compass</div>
          <div style={{
            fontSize: 12,
            color: C.subtle,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            fontWeight: 500
          }}>UK HR Intelligence</div>
        </div>

        {/* Card */}
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 4px 24px rgba(124,92,252,0.07)"
        }}>
          <div style={{
            fontSize: 17,
            fontWeight: 700,
            color: C.text,
            marginBottom: 24,
            fontFamily: "DM Serif Display, Georgia, serif"
          }}>
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset password'}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: C.errorBg, border: `1px solid #F5C6BB`,
              borderRadius: 8, padding: "10px 14px",
              fontSize: 13, color: C.error, marginBottom: 16
            }}>{error}</div>
          )}

          {/* Success message */}
          {message && (
            <div style={{
              background: C.successBg, border: `1px solid #A8D5B5`,
              borderRadius: 8, padding: "10px 14px",
              fontSize: 13, color: C.success, marginBottom: 16
            }}>{message}</div>
          )}

          {/* Signup fields */}
          {mode === 'signup' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Your name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith"
                  style={inp()}
                  onFocus={e => e.target.style.borderColor = C.accent}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Company name</label>
                <input
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="Acme Ltd"
                  style={inp()}
                  onFocus={e => e.target.style.borderColor = C.accent}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>
            </>
          )}

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={inp()}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e => e.target.style.borderColor = C.border}
              onKeyDown={e => e.key === 'Enter' && mode === 'login' && handleLogin()}
            />
          </div>

          {/* Password */}
          {mode !== 'reset' && (
            <div style={{ marginBottom: 8 }}>
              <label style={label}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                  style={inp({ paddingRight: 44 })}
                  onFocus={e => e.target.style.borderColor = C.accent}
                  onBlur={e => e.target.style.borderColor = C.border}
                  onKeyDown={e => e.key === 'Enter' && mode === 'login' && handleLogin()}
                />
                <button
                  onClick={() => setShowPassword(p => !p)}
                  style={{
                    position: "absolute", right: 12, top: "50%",
                    transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: C.subtle, padding: 4, display: "flex", alignItems: "center"
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Forgot password + Keep logged in */}
          {mode === 'login' && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12, color: C.muted }}>
                <input
                  type="checkbox"
                  checked={keepLoggedIn}
                  onChange={e => setKeepLoggedIn(e.target.checked)}
                  style={{ accentColor: C.accent, width: 14, height: 14 }}
                />
                Keep me signed in
              </label>
              <button
                onClick={() => { setMode('reset'); setError(null); setMessage(null); }}
                style={{ background: "none", border: "none", fontSize: 12, color: C.accent, cursor: "pointer", fontFamily: "DM Sans, system-ui, sans-serif", fontWeight: 500 }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {mode !== 'login' && <div style={{ marginBottom: 20 }} />}

          {/* Primary button */}
          <button
            onClick={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleReset}
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? "#B8A9F8" : C.accent,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "13px 0",
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "DM Sans, system-ui, sans-serif",
              letterSpacing: "0.2px",
              transition: "background 0.15s",
              marginBottom: 16
            }}
          >
            {loading ? "Please wait…" : mode === 'login' ? "Sign in" : mode === 'signup' ? "Create account" : "Send reset link"}
          </button>

          {/* Mode switcher */}
          <div style={{ textAlign: "center", fontSize: 13, color: C.muted }}>
            {mode === 'login' && (
              <>
                Don't have an account?{' '}
                <button onClick={() => { setMode('signup'); setError(null); setMessage(null); }} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "DM Sans, system-ui, sans-serif" }}>Create one</button>
              </>
            )}
            {mode === 'signup' && (
              <>
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); setError(null); setMessage(null); }} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "DM Sans, system-ui, sans-serif" }}>Sign in</button>
              </>
            )}
            {mode === 'reset' && (
              <button onClick={() => { setMode('login'); setError(null); setMessage(null); }} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "DM Sans, system-ui, sans-serif" }}>← Back to sign in</button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: C.subtle }}>
          Secure · GDPR compliant · UK employment law aligned
        </div>
      </div>
    </div>
  )
}
