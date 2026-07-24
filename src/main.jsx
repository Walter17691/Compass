import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Compass from './App.jsx'
import Login from './Login.jsx'
import OrgSetup from './OrgSetup.jsx'
import PortalSignup from './PortalSignup.jsx'
import { PortalApp } from './portal/PortalApp.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { supabase } from './supabase.js'

window.COMPASS_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

function Root() {
  const [user, setUser] = useState(null)
  const [org, setOrg] = useState(null)
  const [member, setMember] = useState(null)
  const [portalAccount, setPortalAccount] = useState(null) // null = not checked/not a portal user, { employeeName } = is one
  const [loading, setLoading] = useState(true)

  const loadOrg = async (u) => {
    if(!u) { setOrg(null); setMember(null); return; }
    try {
      const { data: memberData } = await supabase
        .from('org_members')
        .select('*, organisations(*)')
        .eq('user_id', u.id)
        .maybeSingle()

      if(memberData) {
        const { organisations, ...memberFields } = memberData
        setOrg(organisations)
        setMember(memberFields)
      }
      // No fallback org-join path here: joining always goes through
      // OrgSetup's invite-code flow (join_org_with_invite_code), which
      // validates the code server-side. A user_metadata-based path used to
      // live here, but user_metadata is client-writable via
      // supabase.auth.updateUser() by design, and nothing ever actually set
      // org_id on it - so it was a live, unauthenticated-equivalent way to
      // join any org with any role, never exercised by the app itself.
    } catch(e) { console.error("Load org error:", e) }
  }

  // Employee portal accounts have zero client-facing RLS policies by
  // design (see supabase/employee_portal_2026-07-25.sql) — the client
  // cannot query employee_portal_accounts directly, so this asks the
  // server instead. If a portal invite token is sitting in localStorage
  // (captured on first load, below), consume it first; otherwise just
  // check whether this user is already a linked portal account from a
  // previous session.
  const loadPortalStatus = async (u) => {
    if(!u) { setPortalAccount(null); return }
    try {
      const pendingToken = localStorage.getItem('compass_pending_portal_invite')
      if(pendingToken) {
        const res = await fetch('/api/portal/accept-invite', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: pendingToken, userId: u.id }),
        })
        const data = await res.json()
        localStorage.removeItem('compass_pending_portal_invite')
        if(res.ok && data.success) { setPortalAccount({ employeeName: data.employeeName }); return }
        // Fall through to a normal status check if acceptance failed
        // (expired/wrong-email/etc) — the user may still be an existing
        // portal account from before, or just a normal HR-staff user.
      }
      const statusRes = await fetch(`/api/portal/status?userId=${encodeURIComponent(u.id)}`)
      const status = await statusRes.json()
      setPortalAccount(status.isPortalUser ? { employeeName: status.employeeName } : null)
    } catch(e) { console.error("Load portal status error:", e) }
  }

  useEffect(() => {
    // Capture ?invite=CODE (HR-staff org join) and ?portalInvite=TOKEN
    // (employee portal) into localStorage immediately, before the user
    // signs up/confirms their email/logs in — the URL query string does
    // not survive the email-confirmation redirect, so the URL alone can't
    // carry this across signup. OrgSetup/loadPortalStatus read these back
    // from localStorage instead. Distinct param names since they drive
    // two entirely separate identity systems (HR staff vs. employees).
    const params = new URLSearchParams(window.location.search)
    const invite = params.get('invite')
    const portalInvite = params.get('portalInvite')
    if(invite) localStorage.setItem('compass_pending_invite', invite.trim())
    if(portalInvite) localStorage.setItem('compass_pending_portal_invite', portalInvite.trim())
    if(invite || portalInvite) {
      params.delete('invite'); params.delete('portalInvite')
      const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '')
      window.history.replaceState({}, '', newUrl)
    }
  }, [])

  useEffect(() => {
    const handleSession = async (u) => {
      setUser(u)
      await Promise.all([loadOrg(u), loadPortalStatus(u)])
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data: { session } }) => handleSession(session?.user ?? null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#0D0D0F",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#7C5CFC",fontSize:13}}>Loading...</div>
    </div>
  )

  const signOut = async () => { await supabase.auth.signOut(); setUser(null); setOrg(null); setMember(null); setPortalAccount(null) }

  if (!user) {
    // A pending portal invite means this person followed an employee
    // invite link — show PortalSignup, never OrgSetup's "create or join
    // a team" picker, which is for HR-staff org membership only.
    if(localStorage.getItem('compass_pending_portal_invite')) return <PortalSignup onLogin={setUser} />
    return <Login onLogin={setUser} />
  }

  if (portalAccount) return <PortalApp user={user} employeeName={portalAccount.employeeName} onSignOut={signOut} />

  if (!org) return <OrgSetup user={user} onComplete={({org, member})=>{setOrg(org);setMember(member);}} />

  return (
    <ErrorBoundary>
      <Compass
        user={user}
        org={org}
        member={member}
        onSignOut={signOut}
      />
    </ErrorBoundary>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
