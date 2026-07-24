import { SCREENS, MEETING_TYPES } from '../constants';
import { Card, Badge, Btn } from '../components/Primitives';

export function DashboardScreen({ cases, setScreen }) {
  const allM = cases.flatMap(c=>c.meetings.map(m=>({...m,employeeName:c.employeeName})));
  const open = cases.filter(c=>!c.meetings[c.meetings.length-1]?.record?.toLowerCase().includes("case closed"));
  const rC={HIGH:0,MEDIUM:0,LOW:0};
  allM.forEach(m=>{ if(m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN") rC[m.riskScore.rating]=(rC[m.riskScore.rating]||0)+1; });
  const byType = MEETING_TYPES.map(t=>({label:t.label,count:allM.filter(m=>m.type===t.label).length})).filter(t=>t.count>0);
  const recent = [...allM].sort((a,b)=>new Date(b.savedAt)-new Date(a.savedAt)).slice(0,8);
  const rColors={HIGH:"#E8622A",MEDIUM:"#D4882A",LOW:"#7C5CFC"};

  return(
    <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 20px"}}>
      <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Dashboard</h2>
      <p style={{fontSize:13,color:"#6B6375",margin:"0 0 28px"}}>Overview of all HR cases and activity</p>

      {cases.length===0&&(
        <Card style={{textAlign:"center",padding:"50px 20px"}}>
          <div style={{fontSize:32,marginBottom:12}}>⬛</div>
          <div style={{fontSize:15,color:"#6B6375",marginBottom:6}}>No data yet</div>
          <div style={{fontSize:12,color:"#5A5570"}}>Complete your first meeting and save it to a case file to see your dashboard.</div>
        </Card>
      )}

      {cases.length>0&&(
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
            {[{l:"Total cases",v:cases.length,c:"#7C5CFC"},{l:"Open cases",v:open.length,c:"#7C5CFC"},{l:"Total meetings",v:allM.length,c:"#D4882A"},{l:"High risk",v:rC.HIGH||0,c:"#E8622A"}].map(s=>(
              <Card key={s.l}>
                <div style={{fontSize:30,fontWeight:700,color:s.c,fontFamily:"DM Sans,system-ui,sans-serif"}}>{s.v}</div>
                <div style={{fontSize:11,color:"#6B6880",marginTop:3}}>{s.l}</div>
              </Card>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card>
              <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:14}}>Risk distribution</div>
              {Object.entries(rC).map(([r,c])=>{
                const total=Object.values(rC).reduce((a,b)=>a+b,0)||1;
                return c>0?(
                  <div key={r} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:11,color:rColors[r],fontWeight:600}}>{r}</span>
                      <span style={{fontSize:11,color:"#6B6880"}}>{c}</span>
                    </div>
                    <div style={{background:"#FDFAF5",borderRadius:3,height:5}}>
                      <div style={{background:rColors[r],borderRadius:3,height:5,width:`${Math.round(c/total*100)}%`}}/>
                    </div>
                  </div>
                ):null;
              })}
              {Object.values(rC).every(v=>v===0)&&<div style={{fontSize:11,color:"#5A5570"}}>No risk scores yet</div>}
            </Card>
            <Card>
              <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:14}}>Meetings by type</div>
              {byType.length===0&&<div style={{fontSize:11,color:"#5A5570"}}>No meetings yet</div>}
              {byType.map(t=>(
                <div key={t.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
                  <span style={{fontSize:11,color:"#3D3560"}}>{t.label}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{background:"#FDFAF5",borderRadius:3,height:4,width:70}}>
                      <div style={{background:"#7C5CFC",borderRadius:3,height:4,width:(t.count/Math.max(...byType.map(x=>x.count))*70)+"px"}}/>
                    </div>
                    <span style={{fontSize:11,color:"#7C5CFC",fontWeight:600,width:14,textAlign:"right"}}>{t.count}</span>
                  </div>
                </div>
              ))}
            </Card>
          </div>

          <Card style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:14}}>Recent meetings</div>
            {recent.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #1a1a1a"}}>
                <div>
                  <div style={{fontSize:14,color:"#1A1535",fontWeight:500,marginBottom:2}}>{m.employeeName}</div>
                  <div style={{fontSize:10,color:"#5A5570"}}>{m.type} · {m.date}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {m.riskScore?.rating&&m.riskScore.rating!=="UNKNOWN"&&<Badge color={rColors[m.riskScore.rating]}>{m.riskScore.rating}</Badge>}
                  <Btn variant="ghost" onClick={()=>setScreen(SCREENS.CASES)} style={{padding:"3px 10px",fontSize:10}}>View</Btn>
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <div style={{fontSize:12,fontWeight:600,color:"#1A1535",marginBottom:14}}>Active cases</div>
            {open.length===0&&<div style={{fontSize:11,color:"#5A5570"}}>No open cases</div>}
            {open.map(c=>{
              const last=c.meetings[c.meetings.length-1];
              const high=c.meetings.some(m=>m.riskScore?.rating==="HIGH");
              return(
                <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #1a1a1a"}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                      <span style={{fontSize:14,color:"#1A1535",fontWeight:600}}>{c.employeeName}</span>
                      {high&&<Badge color="#E8622A">HIGH RISK</Badge>}
                    </div>
                    <div style={{fontSize:10,color:"#5A5570"}}>{c.meetings.length} meeting{c.meetings.length!==1?"s":""} · Last: {last?.type} on {last?.date}</div>
                  </div>
                  <Btn onClick={()=>setScreen(SCREENS.CASES)} style={{padding:"5px 14px",fontSize:11}}>Open →</Btn>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}
