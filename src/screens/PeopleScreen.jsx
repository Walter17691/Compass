import { useState } from 'react';
import { SCREENS } from '../constants';
import { useLoadMore } from '../hooks/useLoadMore';

export function PeopleScreen({ cases, setActivePerson, setScreen, setCaseInfo, setMeetingSetup }) {
  const [search, setSearch] = useState("");
  const allPeople = [...new Set(cases.map(c=>c.employeeName))].map(name=>{
    const empCases = cases.filter(c=>c.employeeName===name);
    const meetings = empCases.flatMap(c=>c.meetings||[]).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const lastRisk = meetings.find(m=>m.riskScore?.rating)?.riskScore?.rating;
    return {name, meetings, lastRisk, lastDate:meetings[0]?.date};
  }).sort((a,b)=>new Date(b.lastDate)-new Date(a.lastDate));
  const filteredPeople = search
    ? allPeople.filter(p=>p.name?.toLowerCase().includes(search.toLowerCase()))
    : allPeople;
  const { visible: people, hasMore, loadMore, total } = useLoadMore(filteredPeople, 20);

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"32px 20px"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,marginBottom:24,flexWrap:"wrap"}}>
        <div>
          <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>People</h2>
          <p style={{fontSize:13,color:"#9B9098",margin:0}}>All employees with meeting history</p>
        </div>
        <input aria-label="Search people" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people…"
          style={{padding:"8px 12px",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,background:"#FFFFFF",color:"#1C1820",fontFamily:"DM Sans,system-ui,sans-serif",outline:"none",width:200}}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {people.map(p=>(
          <div key={p.name} onClick={()=>{setActivePerson(p.name);setScreen(SCREENS.PERSON_VIEW);}}
            style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px 20px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535",marginBottom:4}}>{p.name}</div>
              <div style={{fontSize:12,color:"#9B9098"}}>{p.meetings.length} meeting{p.meetings.length!==1?"s":""} · Last: {p.lastDate||"Unknown"}</div>
              <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                {p.meetings.slice(0,3).map((m,i)=>(
                  <span key={i} style={{fontSize:11,background:"#F5F1EA",border:"1px solid #E8E0D0",borderRadius:4,padding:"2px 8px",color:"#6B6375"}}>{m.type}</span>
                ))}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
              {p.lastRisk&&<span style={{fontSize:11,fontWeight:600,color:p.lastRisk==="HIGH"?"#F04E37":p.lastRisk==="MEDIUM"?"#F59E0B":"#22C55E",background:p.lastRisk==="HIGH"?"rgba(240,78,55,0.1)":p.lastRisk==="MEDIUM"?"rgba(245,158,11,0.1)":"rgba(34,197,94,0.1)",padding:"3px 8px",borderRadius:4}}>{p.lastRisk} RISK</span>}
              <button onClick={e=>{e.stopPropagation();setCaseInfo(p2=>({...p2,employee:p.name}));setMeetingSetup(s=>({...s,employee:p.name}));setScreen(SCREENS.HOME);}}
                style={{fontSize:11,background:"#7C5CFC",border:"none",borderRadius:5,padding:"4px 10px",color:"#fff",cursor:"pointer",fontWeight:500}}>New meeting</button>
            </div>
          </div>
        ))}
        {people.length===0&&<div style={{textAlign:"center",padding:"60px 20px",color:"#9B9098",fontSize:13}}>{search?"No people match your search.":"No people yet — start a meeting to create records"}</div>}
        {hasMore&&(
          <button onClick={loadMore} style={{width:"100%",padding:"12px",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,cursor:"pointer",fontSize:13,color:"#7C5CFC",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>
            Load more ({people.length} of {total})
          </button>
        )}
      </div>
    </div>
  );
}
