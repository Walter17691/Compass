import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { CompassLockup } from './components/CompassLogo'
import { COLOR, FONT } from './styles/tokens'
import { authedFetch } from './lib/authedFetch.js'
import { safeJson } from './lib/safeJson.js'

// NEW-6/NEW-8/NEW-11 remediation — this is the one screen a
// ?teamInvite=TOKEN link ever routes to, rendered from main.jsx BEFORE
// the ordinary logged-out/OrgSetup branching so the invitation's context
// survives regardless of the browser's current auth state:
//   Scenario A — logged out, no Compass account: create a password here,
//     locked to the invited email (see AccountActivation below).
//   Scenario B — logged out, already has a Compass account: sign in here,
//     same locked-email form, password-only.
//   Scenario C — logged in as the invited email: accept directly.
//   Scenario D — logged in as a different email: explain the mismatch,
//     never silently drop the caller into their own, unrelated Home.
// The account-activation form never lets the invited email be edited —
// the authenticated/verified account that ultimately accepts MUST match
// the invitation's own email, enforced server-side by accept_team_invite
// (auth.jwt()->>'email'), not merely by this form's own restriction.
const STATUS_MESSAGES = {
  expired: 'This invitation has expired. Ask the person who invited you to send a new one.',
  revoked: 'This invitation has been revoked.',
  accepted: 'This invitation has already been used.',
}

export default function TeamInviteAccept({ token, user, onLogin, onAccepted, onDismiss, onSignOut }) {
  const [status, setStatus] = useState('loading') // loading | ready | accepting | joined | error
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState(null)
  const [joinedOrg, setJoinedOrg] = useState(null)

  useEffect(() => {
    // The GET status/preview check is intentionally public (no auth
    // required) — see api/team/_accept-team-invite.js's own header
    // comment — so a not-yet-signed-up invitee can see who invited them,
    // to which organisation, and at what role BEFORE creating an
    // account, rather than being asked to sign up blind.
    let cancelled = false
    authedFetch(`/api/team/accept-team-invite?token=${encodeURIComponent(token)}`)
      .then(r => safeJson(r).then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return
        if (!ok) { setError(d.error || 'This invitation could not be found.'); setStatus('error'); return }
        // NEW-11 remediation — a non-pending invite used to only surface
        // here once accept_team_invite itself rejected the POST, meaning
        // a genuinely new invitee could go through the entire create-a-
        // password journey only to be told "expired" at the very last
        // step. Checked upfront now, before any credential is collected.
        if (d.status && d.status !== 'pending') {
          setError(STATUS_MESSAGES[d.status] || 'This invitation is no longer available.')
          setStatus('error')
          return
        }
        setInvite(d)
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) { setError('Something went wrong loading this invitation.'); setStatus('error') } })
    return () => { cancelled = true }
  }, [token])

  const accept = async () => {
    setStatus('accepting')
    try {
      const r = await authedFetch('/api/team/accept-team-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      const d = await safeJson(r)
      // P1 fix (2026-09-12) — a failed accept attempt is NOT the same
      // state as "this invitation is permanently gone" (status==='error',
      // set only by the GET preview for a genuinely not-found/expired/
      // revoked/already-accepted invitation). Conflating the two was the
      // exact defect that let a real production accept failure (caused
      // by an unrelated server-side bug, since fixed) fall through
      // "Continue to Compass" straight into OrgSetup's founding-org flow
      // — a zero-org, still-invited account created a whole new
      // duplicate organisation and became its HR Director. A failed
      // accept attempt now keeps the invitation intact and offers Try
      // again, never treating a transient/server failure as license to
      // found an organisation.
      if (!r.ok || !d.success) { setError(d.error || 'Could not accept this invitation.'); setStatus('acceptError'); return }
      // NEW-11 remediation — an explicit "you're in" confirmation,
      // naming the org and role, rather than silently handing off
      // straight into Compass's ordinary Home screen with no
      // acknowledgement a brand-new member ever joined anything.
      setJoinedOrg({ id: d.orgId, name: d.orgName, roleLabel: invite?.roleLabel })
      setStatus('joined')
    } catch (e) {
      setError(e.message)
      setStatus('acceptError')
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

  // P1 fix (2026-09-12) — distinct from status==='error': the invitation
  // itself is still valid (it passed the GET preview check), only the
  // accept attempt itself failed. "Try again" re-attempts the same
  // explicit action rather than discarding the invitation — this screen
  // deliberately has no "Continue to Compass"/dismiss action that would
  // silently drop a still-invited, zero-org account into OrgSetup's
  // founding-org flow.
  if (status === 'acceptError') {
    return wrap(<>
      <h3 style={{ fontFamily: FONT.serif, fontSize: 18, color: COLOR.ink, marginBottom: 12 }}>Couldn't complete your invitation</h3>
      <p style={{ fontSize: 13, color: COLOR.inkSoft, marginBottom: 20 }}>{error}</p>
      <button onClick={accept} style={{ background: COLOR.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}>Try again</button>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: COLOR.inkSoft, fontSize: 13, cursor: 'pointer' }}>Not now</button>
    </>)
  }

  if (status === 'joined') {
    return wrap(<>
      <h3 style={{ fontFamily: FONT.serif, fontSize: 18, color: COLOR.ink, marginBottom: 12 }}>Welcome to {joinedOrg?.name}</h3>
      <p style={{ fontSize: 13, color: COLOR.inkSoft, marginBottom: 20 }}>You've joined as <strong>{joinedOrg?.roleLabel}</strong>.</p>
      <button onClick={() => onAccepted({ org: { id: joinedOrg.id, name: joinedOrg.name } })} style={{ background: COLOR.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Continue to Compass</button>
    </>)
  }

  if (!user) {
    return <AccountActivation invite={invite} onLogin={onLogin} wrap={wrap} />
  }

  const userEmail = (user.email || '').trim().toLowerCase()
  const invitedEmail = (invite?.invitedEmail || '').trim().toLowerCase()
  const emailMatches = userEmail && invitedEmail && userEmail === invitedEmail

  if (!emailMatches) {
    return wrap(<>
      <h3 style={{ fontFamily: FONT.serif, fontSize: 18, color: COLOR.ink, marginBottom: 12 }}>Different account signed in</h3>
      <p style={{ fontSize: 13, color: COLOR.inkSoft, marginBottom: 8 }}>This invitation was sent to <strong>{invite?.invitedEmail}</strong>.</p>
      <p style={{ fontSize: 13, color: COLOR.inkSoft, marginBottom: 20 }}>You are currently signed in as <strong>{user.email}</strong>. To accept this invitation, switch to the invited account.</p>
      <button onClick={onSignOut} style={{ background: COLOR.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sign out & continue</button>
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

const inputStyle = {
  width: '100%', background: COLOR.rail, border: `1.5px solid ${COLOR.borderStrong}`, borderRadius: 8,
  padding: '10px 13px', fontSize: 14, outline: 'none', color: COLOR.ink, boxSizing: 'border-box', fontFamily: FONT.sans,
}
const labelStyle = { fontSize: 12, fontWeight: 600, color: COLOR.inkSoft, display: 'block', marginBottom: 6, textAlign: 'left' }
const fieldWrap = { marginBottom: 14, textAlign: 'left' }

// NEW-11 remediation — the account-activation form the invited person
// actually uses. The invited email is shown but never editable: the
// person accepting MUST authenticate as that exact address (enforced
// server-side), so letting this field be freely typed would only ever
// produce a confusing dead end, never a working invitation. Because
// there's no safe way to check "does this email already have an
// account" without an enumeration-style endpoint, this defaults to the
// create-account tab (most invitees are new) with an explicit switch to
// sign-in — the same mode-switcher pattern already used in Login.jsx.
function AccountActivation({ invite, onLogin, wrap }) {
  const [mode, setMode] = useState('create') // create | signin
  const [name, setName] = useState(invite?.invitedName || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState(null)
  const email = invite?.invitedEmail || ''
  // Survives a refresh of the "check your email" interstitial — component
  // state alone would otherwise lose that reminder on reload (the actual
  // invitation token is already safe in its own localStorage key; this is
  // only the transient "we just sent you a confirmation email" UI note).
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(() => !!email && localStorage.getItem('compass_team_invite_awaiting_confirmation') === email)

  const handleCreateAccount = async () => {
    setAuthError(null)
    if (!name.trim()) { setAuthError('Please enter your name.'); return }
    if (password.length < 8) { setAuthError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setAuthError('Passwords do not match.'); return }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name: name.trim() } } })
    setLoading(false)
    if (error) {
      // Supabase's own duplicate-account error text varies by project
      // configuration; matching loosely on "already" is the same
      // tolerance Login.jsx's callers already assume elsewhere, and
      // nudges straight to the sign-in tab rather than a dead end.
      if (/already/i.test(error.message)) {
        setMode('signin')
        setAuthError('Looks like you already have a Compass account — sign in instead.')
        return
      }
      setAuthError(error.message)
      return
    }
    // A project with email confirmation required returns no session here
    // — Supabase's own confirmation email is the next step, independent
    // of the team-invite email already sent. A project with
    // confirmations disabled returns an active session immediately, so
    // this proceeds straight to the explicit "Accept invitation" step
    // with no interstitial at all. Either way, this form never needs to
    // know which mode the project is in.
    if (data?.session) { onLogin(data.user); return }
    localStorage.setItem('compass_team_invite_awaiting_confirmation', email)
    setAwaitingConfirmation(true)
  }

  const handleSignIn = async () => {
    setAuthError(null)
    if (!password) { setAuthError('Please enter your password.'); return }
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setAuthError(error.message); return }
    localStorage.removeItem('compass_team_invite_awaiting_confirmation')
    onLogin(data.user)
  }

  if (awaitingConfirmation) {
    return wrap(<>
      <h3 style={{ fontFamily: FONT.serif, fontSize: 18, color: COLOR.ink, marginBottom: 12 }}>Confirm your email</h3>
      <p style={{ fontSize: 13, color: COLOR.inkSoft, marginBottom: 20 }}>We've sent a confirmation link to <strong>{email}</strong>. Click it, then come back here — or just sign in below — to finish joining {invite?.orgName}.</p>
      <button onClick={() => { localStorage.removeItem('compass_team_invite_awaiting_confirmation'); setAwaitingConfirmation(false); setMode('signin'); setAuthError(null) }} style={{ background: COLOR.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>I've confirmed — sign in</button>
    </>)
  }

  const inviterLine = invite?.inviterName
    ? <><strong>{invite.inviterName}</strong> has invited you to join <strong>{invite?.orgName}</strong></>
    : <>You've been invited to join <strong>{invite?.orgName}</strong></>

  return wrap(<>
    <h3 style={{ fontFamily: FONT.serif, fontSize: 18, color: COLOR.ink, marginBottom: 8 }}>You're invited to Compass</h3>
    <p style={{ fontSize: 13, color: COLOR.inkSoft, marginBottom: 4 }}>{inviterLine} as <strong>{invite?.roleLabel}</strong>.</p>
    <p style={{ fontSize: 12, color: COLOR.inkQuiet, marginBottom: 20 }}>Invited email: {email}</p>

    {authError && (
      <div style={{ background: COLOR.redTint, border: `1px solid ${COLOR.red}33`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: COLOR.red, marginBottom: 16, textAlign: 'left' }}>{authError}</div>
    )}

    {mode === 'create' ? (
      <>
        <div style={fieldWrap}>
          <label htmlFor="activation-name" style={labelStyle}>Your name</label>
          <input id="activation-name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </div>
        <div style={fieldWrap}>
          <label htmlFor="activation-password" style={labelStyle}>Password</label>
          <input id="activation-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} />
        </div>
        <div style={fieldWrap}>
          <label htmlFor="activation-confirm-password" style={labelStyle}>Confirm password</label>
          <input id="activation-confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={handleCreateAccount} disabled={loading} style={{ width: '100%', background: COLOR.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 14 }}>
          {loading ? 'Please wait…' : 'Create account & join Compass'}
        </button>
        <div style={{ fontSize: 13, color: COLOR.inkSoft }}>
          Already have a Compass account?{' '}
          <button onClick={() => { setMode('signin'); setAuthError(null) }} style={{ background: 'none', border: 'none', color: COLOR.purple, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Sign in</button>
        </div>
      </>
    ) : (
      <>
        <div style={fieldWrap}>
          <label htmlFor="activation-signin-password" style={labelStyle}>Password</label>
          <input id="activation-signin-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={inputStyle} onKeyDown={e => e.key === 'Enter' && handleSignIn()} />
        </div>
        <button onClick={handleSignIn} disabled={loading} style={{ width: '100%', background: COLOR.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 14 }}>
          {loading ? 'Please wait…' : 'Sign in & continue'}
        </button>
        <div style={{ fontSize: 13, color: COLOR.inkSoft }}>
          New to Compass?{' '}
          <button onClick={() => { setMode('create'); setAuthError(null) }} style={{ background: 'none', border: 'none', color: COLOR.purple, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Create an account</button>
        </div>
      </>
    )}
  </>)
}
