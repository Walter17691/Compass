import { useState, useEffect } from 'react'
import Login from './Login.jsx'
import { CompassLockup } from './components/CompassLogo'
import { COLOR, FONT } from './styles/tokens'
import { authedFetch } from './lib/authedFetch.js'
import { safeJson } from './lib/safeJson.js'

// NEW-6/NEW-8 remediation — this is the one screen a ?teamInvite=TOKEN
// link ever routes to, rendered from main.jsx BEFORE the ordinary
// logged-out/OrgSetup branching so the invitation's context survives
// regardless of the browser's current auth state (Scenario A: logged
// out — sign in/up inline, below; Scenario B: logged in as the invited
// email — accept directly; Scenario C: logged in as a different email —
// explain the mismatch and offer to sign out, never silently consuming
// the invitation or silently dropping the caller into their own,
// unrelated Home screen).
export default function TeamInviteAccept({ token, user, onLogin, onAccepted, onDismiss, onSignOut }) {
  const [status, setStatus] = useState('loading') // loading | ready | accepting | error
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Nothing to fetch while logged out — the render below returns the
    // embedded-login view before ever reading `status` in that case, so
    // no state update is needed here at all.
    if (!user) return
    let cancelled = false
    authedFetch(`/api/team/accept-team-invite?token=${encodeURIComponent(token)}`)
      .then(r => safeJson(r).then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return
        if (!ok) { setError(d.error || 'This invitation could not be found.'); setStatus('error'); return }
        setInvite(d)
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) { setError('Something went wrong loading this invitation.'); setStatus('error') } })
    return () => { cancelled = true }
  }, [user, token])

  const accept = async () => {
    setStatus('accepting')
    try {
      const r = await authedFetch('/api/team/accept-team-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      const d = await safeJson(r)
      if (!r.ok || !d.success) { setError(d.error || 'Could not accept this invitation.'); setStatus('error'); return }
      onAccepted({ org: { id: d.orgId, name: d.orgName } })
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  const wrap = (children) => (
    <div style={{ minHeight: '100vh', background: COLOR.rail, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT.sans }}>
      <div style={{ marginBottom: 28 }}><CompassLockup size={40} /></div>
      <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.border}`, borderRadius: 16, padding: 32, width: '100%', maxWidth: 440, textAlign: 'center' }}>
        {children}
      </div>
    </div>
  )

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: COLOR.rail }}>
        <div style={{ paddingTop: 40, textAlign: 'center' }}>
          <CompassLockup size={40} />
          <p style={{ fontSize: 14, color: COLOR.inkSoft, marginTop: 16 }}>You've been invited to join a team on Compass HR.<br/>Sign in or create an account to continue.</p>
        </div>
        <Login onLogin={onLogin} />
      </div>
    )
  }

  if (status === 'loading') {
    return wrap(<span className="pu" style={{ color: COLOR.purple, fontSize: 24 }}>●</span>)
  }

  if (status === 'error') {
    return wrap(<>
      <h3 style={{ fontFamily: FONT.serif, fontSize: 18, color: COLOR.ink, marginBottom: 12 }}>Invitation unavailable</h3>
      <p style={{ fontSize: 13, color: COLOR.inkSoft, marginBottom: 20 }}>{error}</p>
      <button onClick={onDismiss} style={{ background: COLOR.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Continue to Compass</button>
    </>)
  }

  const userEmail = (user.email || '').trim().toLowerCase()
  const invitedEmail = (invite?.invitedEmail || '').trim().toLowerCase()
  const emailMatches = userEmail && invitedEmail && userEmail === invitedEmail

  if (!emailMatches) {
    return wrap(<>
      <h3 style={{ fontFamily: FONT.serif, fontSize: 18, color: COLOR.ink, marginBottom: 12 }}>Different account signed in</h3>
      <p style={{ fontSize: 13, color: COLOR.inkSoft, marginBottom: 8 }}>You are currently signed in as <strong>{user.email}</strong>.</p>
      <p style={{ fontSize: 13, color: COLOR.inkSoft, marginBottom: 20 }}>This invitation was sent to <strong>{invite?.invitedEmail}</strong>. Sign out and continue with the invited account.</p>
      <button onClick={onSignOut} style={{ background: COLOR.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sign out</button>
    </>)
  }

  return wrap(<>
    <h3 style={{ fontFamily: FONT.serif, fontSize: 18, color: COLOR.ink, marginBottom: 12 }}>You're invited to join {invite.orgName}</h3>
    <p style={{ fontSize: 13, color: COLOR.inkSoft, marginBottom: 20 }}>You'll join as <strong>{invite.roleLabel}</strong>.</p>
    <button onClick={accept} disabled={status === 'accepting'} style={{ background: COLOR.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}>
      {status === 'accepting' ? 'Joining…' : 'Accept invitation'}
    </button>
    <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: COLOR.inkSoft, fontSize: 13, cursor: 'pointer' }}>Not now</button>
  </>)
}
