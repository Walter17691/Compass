import { Btn, Card } from '../../components/Primitives';
import { COLOR, FONT } from '../../styles/tokens';

const FAQS = [
  { q: "What do the case status labels mean?", a: "Open — logged, no meeting yet. In progress — an investigation meeting has been held. Awaiting action — investigation report done, next step (e.g. a disciplinary hearing) not yet booked. Disciplinary — a disciplinary hearing has been held. Closed — the case is resolved." },
  { q: "How do I stop a DSAR request showing as overdue?", a: "Overdue DSARs stay in every screen's banner until their status is set to Completed. Open the request in HR Processes → DSAR and update its status dropdown once it's actually been responded to." },
  { q: "Why can't I see cases from another location?", a: "Cases are scoped to the location(s) you're assigned to under Settings → Locations, so managers only see their own site's cases. An HR Director or Manager with no location restriction sees every case in the org." },
  { q: "Where do uploaded policies/letterhead/signature live?", a: "They're stored in this browser, not synced to the cloud — if you set them up on one device, a colleague on a different device won't see them until they upload their own copy there too." },
];

export function HelpSection({ setOnboardStep, setShowOnboard }) {
  return (
    <>
      <Card style={{marginBottom:16}}>
        <h3 style={{fontFamily:FONT.serif,fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Help &amp; onboarding</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 14px"}}>Rewatch the getting started guide.</p>
        <Btn onClick={()=>{setOnboardStep(0);setShowOnboard(true);}}>Restart tour</Btn>
      </Card>

      <Card style={{marginBottom:16}}>
        <h3 style={{fontFamily:FONT.serif,fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Frequently asked questions</h3>
        <div style={{marginTop:10}}>
          {FAQS.map((f,i)=>(
            <div key={i} style={{padding:"12px 0",borderTop:i>0?"1px solid #E8E0D0":"none"}}>
              <div style={{fontSize:13,fontWeight:600,color:"#1A1535",marginBottom:4}}>{f.q}</div>
              <div style={{fontSize:12,color:"#6B6375",lineHeight:1.6}}>{f.a}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 style={{fontFamily:FONT.serif,fontSize:16,color:"#1A1535",margin:"0 0 4px"}}>Still stuck?</h3>
        <p style={{fontSize:12,color:"#6B6375",margin:"0 0 12px"}}>Email us and we'll get back to you.</p>
        <a href="mailto:hello@compasshruk.com" style={{display:"inline-block",fontSize:13,color:COLOR.purple,fontWeight:600,textDecoration:"none",background:COLOR.purpleTint,borderRadius:8,padding:"10px 20px"}}>hello@compasshruk.com</a>
      </Card>
    </>
  );
}
