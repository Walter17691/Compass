import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Compass from './App.jsx'
import Login from './Login.jsx'
import OrgSetup from './OrgSetup.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { supabase } from './supabase.js'

window.COMPASS_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

function Root() {
  const [user, setUser] = useState(null)
  const [org, setOrg] = useState(null)
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadOrg = async (u) => {
    if(!u) { setOrg(null); setMember(null); setLoading(false); return; }
    try {
      const { data: memberData } = await supabase
        .from('org_members')
        .select('*, organisations(*)')
        .eq('user_id', u.id)
        .maybeSingle()

      if(memberData) {
        setOrg(memberData.organisations)
        setMember({ role: memberData.role, name: memberData.name })
      }
      // No fallback org-join path here: joining always goes through
      // OrgSetup's invite-code flow (join_org_with_invite_code), which
      // validates the code server-side. A user_metadata-based path used to
      // live here, but user_metadata is client-writable via
      // supabase.auth.updateUser() by design, and nothing ever actually set
      // org_id on it - so it was a live, unauthenticated-equivalent way to
      // join any org with any role, never exercised by the app itself.
    } catch(e) { console.error("Load org error:", e) }
    setLoading(false)
  }

  useEffect(() => {
    // Capture ?invite=CODE into localStorage immediately, before the user
    // signs up/confirms their email/logs in — the URL query string does not
    // survive the email-confirmation redirect, so the URL alone can't carry
    // this across signup. OrgSetup reads it from localStorage instead.
    const params = new URLSearchParams(window.location.search)
    const invite = params.get('invite')
    if(invite) {
      localStorage.setItem('compass_pending_invite', invite.trim())
      params.delete('invite')
      const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '')
      window.history.replaceState({}, '', newUrl)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      loadOrg(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      loadOrg(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#0D0D0F",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#7C5CFC",fontSize:13}}>Loading...</div>
    </div>
  )

  if (!user) return <Login onLogin={setUser} />

  if (!org) return <OrgSetup user={user} onComplete={({org, member})=>{setOrg(org);setMember(member);}} />

  return (
    <ErrorBoundary>
      <Compass
        user={user}
        org={org}
        member={member}
        onSignOut={async () => { await supabase.auth.signOut(); setUser(null); setOrg(null); setMember(null); }}
      />
    </ErrorBoundary>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
