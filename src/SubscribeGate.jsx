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

// Compass has no free plan and no trial — every org needs an active
// subscription before it can use the product at all. main.jsx renders
// this instead of <Compass/> whenever isSubscribed(org) is false, whether
// that's a brand-new org that just finished OrgSetup, or an existing one
// whose subscription lapsed (payment failed, cancelled, etc).
export default function SubscribeGate({ org, syncing, onCancel, onSignOut }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const subscribe = async () => {
    setLoading(true); setError(null)
    try {
      const res = await authedFetch(`/api/billing/checkout?orgId=${encodeURIComponent(org.id)}`)
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else { setError(data.error || "Couldn't start checkout — please try again"); setLoading(false) }
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
        <div style={{textAlign:"center",marginBottom:28}}>
          <h1 style={{fontFamily:"DM Serif Display, Georgia, serif",fontSize:24,color:TEXT,margin:"0 0 6px"}}>Subscribe to activate {org?.name || "your organisation"}</h1>
          <p style={{fontSize:13,color:MUTED,margin:0}}>Priced per active location — add or remove locations any time and your subscription adjusts automatically.</p>
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
            <span style={{fontSize:13,color:MUTED}}>Custom — contact us</span>
          </div>
        </div>

        {error && <div style={{background:"#FDF0ED",border:"1px solid #F0C9BE",borderRadius:8,padding:"10px 14px",color:"#B0392A",fontSize:13,marginBottom:16}}>{error}</div>}

        <button onClick={subscribe} disabled={loading}
          style={{width:"100%",background:V,color:"#fff",border:"none",borderRadius:10,padding:"14px",fontSize:15,fontWeight:600,cursor:loading?"default":"pointer",opacity:loading?0.7:1,marginBottom:10}}>
          {loading ? "Redirecting to checkout…" : "Subscribe with Stripe"}
        </button>

        <div style={{display:"flex",justifyContent:"center",gap:16}}>
          {onCancel && <button onClick={onCancel} style={{background:"none",border:"none",color:MUTED,fontSize:13,cursor:"pointer",padding:0}}>← Back</button>}
          {onSignOut && <button onClick={onSignOut} style={{background:"none",border:"none",color:MUTED,fontSize:13,cursor:"pointer",padding:0}}>Sign out</button>}
        </div>
      </div>
    </div>
  )
}
