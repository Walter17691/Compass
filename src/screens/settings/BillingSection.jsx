import { Btn, Card, Badge } from '../../components/Primitives';
import { LOCATION_PRICE_TIERS, pricePerLocationFor, estimateMonthlyPrice } from '../../lib/plan';
import { authedFetch } from '../../lib/authedFetch';

export function BillingSection({ org, locations, showToast }) {
  const locationCount = Math.max(1, (locations||[]).length);
  const rate = pricePerLocationFor(locationCount);
  const monthlyPrice = estimateMonthlyPrice(locationCount);

  const goToBillingUrl = async (action) => {
    try {
      const res = await authedFetch(`/api/billing/${action}?orgId=${encodeURIComponent(org?.id||"")}`);
      const data = await res.json();
      if(data.url) window.location.href = data.url;
      else showToast(data.error||"Couldn't open billing — please try again", "error");
    } catch(e) { console.error("Billing redirect error:", e); showToast("Couldn't open billing — please try again", "error"); }
  };
  return (
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535"}}>Billing</div>
        <Badge color="#1A7A4A">ACTIVE</Badge>
      </div>
      <p style={{fontSize:12,color:"#6B6880",marginBottom:12}}>
        {(locations||[]).length===0
          ? `Priced per active location. You have no locations recorded yet — billed at the 1-location rate (£${LOCATION_PRICE_TIERS[0].pricePerLocation}/month) until you add some in Settings → Locations.`
          : `${locationCount} location${locationCount===1?"":"s"} × £${rate}/month = £${monthlyPrice}/month. Adding or removing a location updates this automatically.`}
      </p>
      <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 14px",marginBottom:16}}>
        {LOCATION_PRICE_TIERS.map((t,i)=>(
          <div key={t.label} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:i>0?"1px solid #E8E0D0":"none"}}>
            <span style={{fontSize:12,color:t.maxLocations>=locationCount&&(LOCATION_PRICE_TIERS[i-1]?.maxLocations||0)<locationCount?"#1A1535":"#9B9098",fontWeight:t.maxLocations>=locationCount&&(LOCATION_PRICE_TIERS[i-1]?.maxLocations||0)<locationCount?600:400}}>{t.label}</span>
            <span style={{fontSize:12,color:"#6B6880"}}>£{t.pricePerLocation}/location</span>
          </div>
        ))}
      </div>
      <Btn variant="secondary" onClick={()=>goToBillingUrl("manage")}>Manage subscription</Btn>
    </Card>
  );
}
