import { useState } from 'react'
import { CompassLogo } from './components/CompassLogo'
import { LOCATION_PRICE_TIERS } from './lib/plan'
import { authedFetch } from './lib/authedFetch'

const BG = "#FDFAF5"
const CARD = "#FFFFFF"
const BORDER = "#E8E0D0"
const TEXT = "#1C1820"
const MUTED = "#6B6375"
const V = "#7C5CFC"

const inputStyle = {
  width:"100%", background:BG, border:`1px solid ${BORDER}`, borderRadius:8,
  padding:"10px 12px", fontSize:13, color:TEXT, outline:"none", boxSizing:"border-box",
  fontFamily:"DM Sans, system-ui, sans-serif", marginBottom:12,
}

// Compass has no free plan, no trial, and — per how comparable UK HR/
// compliance software (BrightHR, Citation, Peninsula) actually sells —
// no self-serve card checkout either. main.jsx renders this instead of
// <Compass/> whenever isSubscribed(org) is false. Two different org
// states land here, and get two different screens:
//   - Never been a Stripe customer (org.stripe_customer_id is null): a
//     brand-new org straight out of OrgSetup — show the lead-capture form.
//   - Was a paying customer, subscription has since lapsed (payment
//     failed, cancelled): there's already a relationship and a Stripe
//     customer on file, so send them straight to the billing portal to
//     fix it rather than asking them to book a call again.
export default function SubscribeGate({ org, syncing, onCancel, onSignOut }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [phone, setPhone] = useState("")
  const [preferredTime, setPreferredTime] = useState("")
  const [notes, setNotes] = useState("")

  const isLapsed = !!org?.stripe_customer_id

  const manageBilling = async () => {
    setLoading(true); setError(null)
    try {
      const res = await authedFetch(`/api/billing/manage?orgId=${encodeURIComponent(org.id)}`)
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else { setError(data.error || "Couldn't open billing — please try again"); setLoading(false) }
    } catch (e) { setError(e.message); setLoading(false) }
  }

  const requestCall = async () => {
    setLoading(true); setError(null)
    try {
      const res = await authedFetch('/api/billing/request-demo', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ orgId: org.id, phone, preferredTime, notes }),
      })
      const data = await res.json()
      if (data.success) setSubmitted(true)
      else { setError(data.error || "Couldn't send your request — please try again"); setLoading(false) }
    } catch (e) { setError(e.message); setLoading(false) }
  }

  if (syncing) return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"DM Sans, system-ui, sans-serif"}}>
      <CompassLogo size={48}/>
      <p style={{fontSize:14,color:MUTED,marginTop:20}}>Confirming your payment…</p>
    </div>
  )

  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"DM Sans, system-ui, sans-serif"}}>
      <div style={{width:"100%",maxWidth:480}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><CompassLogo size={48}/></div>

        {isLapsed ? (
          <>
            <div style={{textAlign:"center",marginBottom:28}}>
              <h1 style={{fontFamily:"DM Serif Display, Georgia, serif",fontSize:24,color:TEXT,margin:"0 0 6px"}}>{org?.name || "Your organisation"}'s subscription needs attention</h1>
              <p style={{fontSize:13,color:MUTED,margin:0}}>Your billing details or payment may need updating — sort it out below and you'll be straight back in.</p>
            </div>
            {error && <div style={{background:"#FDF0ED",border:"1px solid #F0C9BE",borderRadius:8,padding:"10px 14px",color:"#B0392A",fontSize:13,marginBottom:16}}>{error}</div>}
            <button onClick={manageBilling} disabled={loading}
              style={{width:"100%",background:V,color:"#fff",border:"none",borderRadius:10,padding:"14px",fontSize:15,fontWeight:600,cursor:loading?"default":"pointer",opacity:loading?0.7:1,marginBottom:10}}>
              {loading ? "Opening billing…" : "Manage subscription"}
            </button>
          </>
        ) : submitted ? (
          <div style={{textAlign:"center"}}>
            <h1 style={{fontFamily:"DM Serif Display, Georgia, serif",fontSize:24,color:TEXT,margin:"0 0 10px"}}>Thanks — we'll be in touch</h1>
            <p style={{fontSize:13,color:MUTED,margin:0}}>We've got your details for {org?.name || "your organisation"} and will reach out shortly to set up a call.</p>
          </div>
        ) : (
          <>
            <div style={{textAlign:"center",marginBottom:28}}>
              <h1 style={{fontFamily:"DM Serif Display, Georgia, serif",fontSize:24,color:TEXT,margin:"0 0 6px"}}>Let's set up {org?.name || "your organisation"}</h1>
              <p style={{fontSize:13,color:MUTED,margin:0}}>Compass is set up with a short call rather than self-serve checkout — priced per active location, so we can make sure you're on the right plan from the start.</p>
            </div>

            <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:24,marginBottom:20}}>
              {LOCATION_PRICE_TIERS.map((t, i) => (
                <div key={t.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:i>0?`1px solid ${BORDER}`:"none"}}>
                  <span style={{fontSize:13,color:TEXT}}>{t.label}</span>
                  <span style={{fontSize:13,color:V,fontWeight:600}}>£{t.pricePerLocation}/location/mo</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:`1px solid ${BORDER}`}}>
                <span style={{fontSize:13,color:TEXT}}>51+ locations</span>
                <span style={{fontSize:13,color:MUTED}}>Custom</span>
              </div>
            </div>

            <input style={inputStyle} placeholder="Phone number (optional)" value={phone} onChange={e=>setPhone(e.target.value)} />
            <input style={inputStyle} placeholder="Best time to call (optional)" value={preferredTime} onChange={e=>setPreferredTime(e.target.value)} />
            <textarea style={{...inputStyle,resize:"vertical",minHeight:70}} placeholder="Anything we should know before the call? (optional)" value={notes} onChange={e=>setNotes(e.target.value)} />

            {error && <div style={{background:"#FDF0ED",border:"1px solid #F0C9BE",borderRadius:8,padding:"10px 14px",color:"#B0392A",fontSize:13,marginBottom:16}}>{error}</div>}

            <button onClick={requestCall} disabled={loading}
              style={{width:"100%",background:V,color:"#fff",border:"none",borderRadius:10,padding:"14px",fontSize:15,fontWeight:600,cursor:loading?"default":"pointer",opacity:loading?0.7:1,marginBottom:10}}>
              {loading ? "Sending…" : "Request a call"}
            </button>
          </>
        )}

        <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:submitted?24:0}}>
          {onCancel && <button onClick={onCancel} style={{background:"none",border:"none",color:MUTED,fontSize:13,cursor:"pointer",padding:0}}>← Back</button>}
          {onSignOut && <button onClick={onSignOut} style={{background:"none",border:"none",color:MUTED,fontSize:13,cursor:"pointer",padding:0}}>Sign out</button>}
        </div>
      </div>
    </div>
  )
}
