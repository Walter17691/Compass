import { useState } from 'react';
import { SCREENS } from '../constants';
import { useLoadMore } from '../hooks/useLoadMore';
import { PageHeader } from '../components/design/PageHeader';
import { DataRow, RowChevron } from '../components/design/DataRow';
import { EmptyState } from '../components/design/EmptyState';
import { FONT, COLOR, TYPE, SPACE, RADIUS, CONTENT_MAX_WIDTH } from '../styles/tokens';

const RISK_COLOR = { HIGH: COLOR.red, MEDIUM: COLOR.amber };

// Phase 2B — calm structured list (Compass Design Vision §2), replacing
// the previous repeated bordered-card layout. People stays deliberately
// scoped to Compass's own ER use case (meeting history), not a general
// HRIS directory — same fields as before, just presented as rows.
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
    <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"32px 28px"}}>
      <PageHeader
        title="People"
        subtitle="All employees with meeting history"
        actions={
          <input aria-label="Search people" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people…"
            style={{padding:"8px 12px",fontSize:13,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,background:COLOR.surface,color:COLOR.ink,fontFamily:FONT.sans,outline:"none",width:200}}/>
        }
      />
      <div>
        {people.map(p=>(
          // "New meeting" is a real, separate control that must NOT
          // trigger the row's own navigation — a native <button> can't
          // nest another interactive control, so only the navigate-to-
          // person content is the button; "New meeting" stays a sibling,
          // now a small tertiary text action rather than a filled
          // purple button so a list of many people doesn't read as many
          // competing primary CTAs (Compass Design Vision §2) — but
          // still always visible, never hover-only.
          <DataRow key={p.name}>
            <button type="button" onClick={()=>{setActivePerson(p.name);setScreen(SCREENS.PERSON_VIEW);}}
              style={{flex:1,minWidth:0,padding:"14px 4px",cursor:"pointer",background:"none",border:"none",textAlign:"left",font:"inherit",color:"inherit",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:COLOR.ink,marginBottom:2}}>{p.name}</div>
                <div style={{...TYPE.metadata,color:COLOR.inkFaint,fontWeight:400,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <span>{p.meetings.length} meeting{p.meetings.length!==1?"s":""} · Last: {p.lastDate||"Unknown"}</span>
                  {p.meetings.slice(0,3).map((m,i)=>(
                    <span key={i} style={{fontSize:11,color:COLOR.inkFaint}}>· {m.type}</span>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                {p.lastRisk&&<span style={{fontSize:11,fontWeight:600,color:RISK_COLOR[p.lastRisk]||COLOR.inkFaint}}>{p.lastRisk} RISK</span>}
                <RowChevron/>
              </div>
            </button>
            <button type="button" onClick={()=>{setCaseInfo(p2=>({...p2,employee:p.name}));setMeetingSetup(s=>({...s,employee:p.name}));setScreen(SCREENS.HOME);}}
              style={{fontSize:12,background:"none",border:"none",padding:"5px 8px",color:COLOR.purple,cursor:"pointer",fontWeight:600,fontFamily:FONT.sans,flexShrink:0,marginRight:4}}>+ New meeting</button>
          </DataRow>
        ))}
        {people.length===0&&<EmptyState message={search?"No people match your search.":"No people yet — start a meeting to create records"}/>}
        {hasMore&&(
          <button onClick={loadMore} style={{width:"100%",padding:"12px",background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,cursor:"pointer",fontSize:13,color:COLOR.purple,fontWeight:600,fontFamily:FONT.sans,marginTop:SPACE.sm}}>
            Load more ({people.length} of {total})
          </button>
        )}
      </div>
    </div>
  );
}
