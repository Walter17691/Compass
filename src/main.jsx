import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Compass from './App.jsx'
import Login from './Login.jsx'
import OrgSetup from './OrgSetup.jsx'
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
      } else {
        // Check if user was invited - look up by org_id in user metadata
        const orgId = u.user_metadata?.org_id
        if(orgId) {
          const { data: org } = await supabase
            .from('organisations')
            .select('*')
            .eq('id', orgId)
            .maybeSingle()
          
          if(org) {
            // Create member record
            const role = u.user_metadata?.role || 'hr_manager'
            const name = u.user_metadata?.name || u.email
            await supabase.from('org_members').insert({
              org_id: orgId,
              user_id: u.id,
              role,
              name
            })
            setOrg(org)
            setMember({ role, name })
          }
        }
      }
    } catch(e) { console.error("Load org error:", e) }
    setLoading(false)
  }

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

  return <Compass 
    user={user} 
    org={org} 
    member={member}
    onSignOut={async () => { await supabase.auth.signOut(); setUser(null); setOrg(null); setMember(null); }} 
  />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
