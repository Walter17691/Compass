import { useEffect, useState } from 'react'

const C = {
  bg: "#FDFAF5",
  card: "#FFFFFF",
  accent: "#7C5CFC",
  border: "#E8E0D0",
  text: "#1C1820",
  muted: "#6B6375",
  subtle: "#9B9098",
  errBg: "#FFF0ED",
  errBorder: "#F5C6BB",
  errText: "#C84B2F",
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

// Reached from the "Review and Sign" link in the email api/send-for-signature.js
// sends (appUrl + "/sign/" + signId) — this recipient is an external employee
// or manager, not a logged-in Compass user, so this page must work with no
// session at all. api/signing.js is built for exactly that: the sign_id
// itself (an unguessable crypto.randomUUID()) is the whole access-control
// boundary, and its GET/POST handlers already accept unauthenticated calls.
export default function SignPage({ signId }) {
  const [state, setState] = useState('loading') // loading | error | ready | signed | submitting
  const [error, setError] = useState('')
  const [doc, setDoc] = useState(null)
  const [typedName, setTypedName] = useState('')

  useEffect(() => {
    fetch(`/api/signing?signId=${encodeURIComponent(signId)}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { setError(d.error || "This signing link isn't valid."); setState('error'); return }
        setDoc(d)
        setState(d.status === 'signed' ? 'signed' : 'ready')
      })
      .catch(() => { setError("Couldn't load this document — please try again."); setState('error') })
  }, [signId])

  const submit = async () => {
    if (!typedName.trim()) return
    setState('submitting')
    try {
      const res = await fetch('/api/signing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signId, signature: typedName.trim(), signedAt: new Date().toISOString() }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to submit your signature.'); setState('ready'); return }
      setState('signed')
    } catch {
      setError("Couldn't submit your signature — please try again.")
      setState('ready')
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "DM Sans, system-ui, sans-serif", padding: "60px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><CompassLogo size={48}/></div>
          <div style={{ fontFamily: "DM Serif Display, Georgia, serif", fontSize: 26, color: C.text }}>Compass HR</div>
        </div>

        {state === 'loading' && (
          <div style={{ textAlign: "center", color: C.subtle, fontSize: 13 }}>Loading document…</div>
        )}

        {state === 'error' && (
          <div style={{ background: C.errBg, border: `1px solid ${C.errBorder}`, borderRadius: 12, padding: "20px 24px", fontSize: 13.5, color: C.errText, textAlign: "center" }}>
            {error}
          </div>
        )}

        {doc && (state === 'ready' || state === 'submitting' || state === 'signed') && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "28px 32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18, flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "DM Serif Display, Georgia, serif" }}>{doc.meeting_type || "Meeting record"}</span>
              <span style={{ fontSize: 12, color: C.subtle }}>{doc.meeting_date}</span>
            </div>
            <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 420, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px 18px", marginBottom: 22 }}>
              {doc.document}
            </div>

            {state === 'signed' ? (
              <div style={{ textAlign: "center", color: C.accent, fontSize: 13.5, fontWeight: 600 }}>
                ✓ Signed{doc.employee_name ? ` by ${doc.employee_name}` : ''}. Thank you — no further action is needed.
              </div>
            ) : (
              <>
                <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: C.muted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
                  Type your full name to sign
                </label>
                <input value={typedName} onChange={e => setTypedName(e.target.value)} placeholder="Full name"
                  style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none", color: C.text, marginBottom: 14, boxSizing: "border-box" }} />
                {error && <div style={{ fontSize: 12.5, color: C.errText, marginBottom: 10 }}>{error}</div>}
                <button onClick={submit} disabled={state === 'submitting' || !typedName.trim()}
                  style={{ background: C.accent, border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 13, color: "#fff", fontWeight: 600, cursor: state === 'submitting' ? "not-allowed" : "pointer", opacity: state === 'submitting' ? 0.6 : 1 }}>
                  {state === 'submitting' ? "Submitting…" : "Confirm signature"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
