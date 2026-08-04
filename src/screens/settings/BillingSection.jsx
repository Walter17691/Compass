import { Btn, Card, Badge } from '../../components/Primitives';
import { isPro } from '../../lib/plan';
import { authedFetch } from '../../lib/authedFetch';

export function BillingSection({ org, showToast }) {
  const goToBillingUrl = async (action) => {
    try {
      const res = await authedFetch(`/api/billing/${action}?orgId=${encodeURIComponent(org?.id||"")}`);
      const data = await res.json();
      if(data.url) window.location.href = data.url;
      else showToast(data.error||"Couldn't open billing — please try again", "error");
    } catch(e) { showToast("Couldn't open billing — please try again", "error"); }
  };
  return (
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535"}}>Billing</div>
        <Badge color={isPro(org)?"#1A7A4A":"#9B9098"}>{isPro(org)?"PRO":"FREE"}</Badge>
      </div>
      <p style={{fontSize:12,color:"#6B6880",marginBottom:16}}>
        {isPro(org)
          ? "Unlimited cases plus Portal, Calendar, DSAR tracking and the compliance digest."
          : "Free plan: 1 active case at a time, no Portal, Calendar, DSAR tracking or compliance digest. Upgrade to unlock the full platform."}
      </p>
      {isPro(org)
        ? <Btn variant="secondary" onClick={()=>goToBillingUrl("manage")}>Manage subscription</Btn>
        : <Btn onClick={()=>goToBillingUrl("checkout")}>Upgrade to Pro</Btn>
      }
    </Card>
  );
}
