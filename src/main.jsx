import { StrictMode, Suspense, lazy, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Login from './Login.jsx'
import SecurityPage from './SecurityPage.jsx'
import LegalPage from './LegalPage.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import SubscribeGate from './SubscribeGate.jsx'
import { supabase } from './supabase.js'
import { authedFetch } from './lib/authedFetch.js'
import { isSubscribed } from './lib/plan.js'

// These are mutually exclusive top-level views — a session only ever
// renders one of them, so splitting them out keeps (say) an HR user's
// initial load from paying for the employee portal's code, and vice versa.
const Compass = lazy(() => import('./App.jsx'))
const OrgSetup = lazy(() => import('./OrgSetup.jsx'))
const PortalSignup = lazy(() => import('./PortalSignup.jsx'))
const PortalApp = lazy(() => import('./portal/PortalApp.jsx').then(m => ({ default: m.PortalApp })))

const LoadingFallback = () => (
  <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#FDFAF5'}}>
    <span className="pu" style={{color:'#7C5CFC',fontSize:24}}>●</span>
  </div>
)

// Named export so tests can render Root() directly without triggering the
// createRoot(...).render(...) bootstrap side effect at the bottom of this
// file (that line still runs exactly as before for the real app — this is
// purely additive).
export function Root() {
  const [user, setUser] = useState(null)
  // One user can belong to more than one org (e.g. an HR consultancy
  // running cases for several clients from one login) — memberships holds
  // every org_members row for this user, each paired with its org.
  // activeOrgId picks which one is "current"; org/member below are just
  // that membership's fields, so the rest of the app (which only ever
  // needs the single active org) doesn't need to change at all.
  const [memberships, setMemberships] = useState([])
  const [activeOrgId, setActiveOrgId] = useState(() => localStorage.getItem('compass_active_org'))
  const [portalAccount, setPortalAccount] = useState(null) // null = not checked/not a portal user, { employeeName } = is one
  const [loading, setLoading] = useState(true)
  const [addingOrg, setAddingOrg] = useState(false) // true while an existing user is joining/creating an additional org via the switcher

  const active = memberships.find(m => m.organisations.id === activeOrgId) || memberships[0] || null
  const org = active?.organisations ?? null
  const member = active ? (({ organisations, ...rest }) => rest)(active) : null

  const switchOrg = (orgId) => {
    setActiveOrgId(orgId)
    localStorage.setItem('compass_active_org', orgId)
    // The remounted Compass instance re-derives its initial screen/case
    // from the URL (App.jsx's readNavFromUrl), which the switch itself
    // doesn't touch — left alone, a deep link into a specific case would
    // survive the switch and the new (correctly org-scoped, RLS-safe)
    // instance would just show "Case not found" for an id that belongs
    // to the org just left. Not a data leak either way, just avoidable.
    const params = new URLSearchParams(window.location.search)
    if (params.has('screen') || params.has('case')) {
      params.delete('screen'); params.delete('case')
      const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '')
      window.history.replaceState({}, '', newUrl)
    }
  }

  const loadOrg = async (u) => {
    if(!u) { setMemberships([]); return; }
    try {
      const { data } = await supabase
        .from('org_members')
        .select('*, organisations(*)')
        .eq('user_id', u.id)

      setMemberships(data || [])
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
        const res = await authedFetch('/api/portal/accept-invite', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: pendingToken }),
        })
        const data = await res.json()
        localStorage.removeItem('compass_pending_portal_invite')
        if(res.ok && data.success) { setPortalAccount({ employeeName: data.employeeName }); return }
        // Fall through to a normal status check if acceptance failed
        // (expired/wrong-email/etc) — the user may still be an existing
        // portal account from before, or just a normal HR-staff user.
      }
      const statusRes = await authedFetch(`/api/portal/status`)
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

  // Stripe redirects back here after checkout, but the webhook that
  // actually marks the org subscribed can lag the redirect by a second or
  // two — poll briefly rather than showing SubscribeGate again right after
  // someone just paid. Each successful loadOrg re-renders with fresh
  // memberships regardless of whether this loop "knows" it succeeded, so
  // this only controls how long the "confirming payment" state shows.
  const [billingSyncing, setBillingSyncing] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('billing') !== 'success' || !user) return
    params.delete('billing')
    const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '')
    window.history.replaceState({}, '', newUrl)

    setBillingSyncing(true)
    let cancelled = false
    const poll = async (attempt) => {
      await loadOrg(user)
      if (cancelled) return
      if (attempt >= 5) { setBillingSyncing(false); return }
      setTimeout(() => poll(attempt + 1), 1500)
    }
    poll(1)
    return () => { cancelled = true }
  }, [user])

  // Public — reachable without logging in, for a prospect evaluating the
  // product (or a link from the marketing site) to see it.
  if (window.location.pathname === '/security') return <SecurityPage/>
  if (window.location.pathname === '/privacy') return <LegalPage page="privacy"/>
  if (window.location.pathname === '/terms') return <LegalPage page="terms"/>
  if (window.location.pathname === '/dpa') return <LegalPage page="dpa"/>

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <span className="pu" style={{color:"#7C5CFC",fontSize:24}}>●</span>
    </div>
  )

  const signOut = async () => { await supabase.auth.signOut(); setUser(null); setMemberships([]); setPortalAccount(null) }

  if (!user) {
    // A pending portal invite means this person followed an employee
    // invite link — show PortalSignup, never OrgSetup's "create or join
    // a team" picker, which is for HR-staff org membership only.
    if(localStorage.getItem('compass_pending_portal_invite')) return <Suspense fallback={<LoadingFallback/>}><PortalSignup onLogin={setUser} /></Suspense>
    return <Login onLogin={setUser} />
  }

  if (portalAccount) return <Suspense fallback={<LoadingFallback/>}><PortalApp user={user} employeeName={portalAccount.employeeName} onSignOut={signOut} /></Suspense>

  // Joining/creating an org always goes through OrgSetup, whether this is
  // the user's first org or a second one added later via "Join another
  // organisation" (see the org switcher in App.jsx) — re-loading
  // memberships afterward picks up the new row and switchOrg makes it active.
  if (!org || addingOrg) return (
    <Suspense fallback={<LoadingFallback/>}>
      <OrgSetup
        user={user}
        onComplete={({org})=>{ setAddingOrg(false); loadOrg(user).then(()=>switchOrg(org.id)) }}
        onCancel={org ? () => setAddingOrg(false) : undefined}
      />
    </Suspense>
  )

  // No free plan, no trial — every org needs an active Stripe subscription
  // before it can use Compass at all. Catches both a brand-new org that
  // just finished OrgSetup and an existing one whose subscription lapsed.
  if (!isSubscribed(org)) return (
    <SubscribeGate org={org} syncing={billingSyncing} onSignOut={signOut} />
  )

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback/>}>
        {/* key={org.id} is load-bearing, not decorative: it forces React to
            fully unmount and remount Compass on every org switch, rather
            than re-rendering the same instance with new props. Compass owns
            ~30 independent useState lists (cases, allegations, employee
            records, wellbeing notes, currentUser, orgWebhookUrl, ...) with
            no reset logic of its own — without this key, all of it would
            silently survive a switch and render one org's data under
            another org's identity. Any in-flight requests from the
            discarded instance become orphaned closures: their eventual
            setState calls land on an unmounted component and are inert,
            they can't leak into the new instance's state. */}
        <Compass
          key={org.id}
          user={user}
          org={org}
          member={member}
          availableOrgs={memberships.map(m => m.organisations)}
          switchOrg={switchOrg}
          onJoinAnotherOrg={() => setAddingOrg(true)}
          onSignOut={signOut}
        />
      </Suspense>
    </ErrorBoundary>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
