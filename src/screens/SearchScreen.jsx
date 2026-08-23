import { SCREENS } from '../constants';
import { Card } from '../components/Primitives';
import { useLoadMore } from '../hooks/useLoadMore';

export function SearchScreen({ searchQuery, setSearchQuery, runSearch, searchResults, setScreen, setExpandedCases, cases, setViewMeeting, setViewCaseId, dueSoon, setActivePerson }) {
  const { visible: visibleResults, hasMore, loadMore, total } = useLoadMore(searchResults, 20);
  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"40px 20px"}}>
      <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 20px",fontWeight:600}}>Search</h2>
      <input
        aria-label="Search"
        placeholder="Search cases, records, letters, employees, evidence, DSARs..."
        value={searchQuery}
        onChange={e=>{setSearchQuery(e.target.value);runSearch(e.target.value);}}
        style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"14px 18px",fontSize:15,color:"#1A1535",outline:"none",marginBottom:24,boxSizing:"border-box"}} />

      {searchQuery&&searchResults.length===0&&(
        <div style={{textAlign:"center",padding:"40px 20px",color:"#5A5570",fontSize:13}}>No results found for "{searchQuery}"</div>
      )}

      {searchResults.length>0&&(
        <div>
          <div style={{fontSize:11,color:"#6B6880",marginBottom:12}}>{searchResults.length} result{searchResults.length!==1?"s":""}</div>
          {visibleResults.map((r,i)=>{
            const typeColors={case:"#7C5CFC",record:"#D4882A",letter:"#4A6FA5",transcript:"#888",evidence:"#1A7A4A",employee:"#B87520",dsar:"#C84B2F"};
            return(
              <button key={i} onClick={()=>{
                if(r.type==="employee") { setActivePerson(r.title); setScreen(SCREENS.PERSON_VIEW); return; }
                if(r.type==="dsar") { setScreen(SCREENS.DSAR); return; }
                setScreen(SCREENS.CASES);
                setExpandedCases(e=>({...e,[r.caseId]:true}));
                if(r.meetingId){
                  const cs = cases.find(c=>c.id===r.caseId);
                  const m = cs?.meetings.find(m=>m.id===r.meetingId);
                  if(m) { setViewMeeting({...m,employeeName:cs.employeeName,caseId:cs.id}); setViewCaseId(cs.id); }
                }
              }}
                style={{width:"100%",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"14px 16px",marginBottom:8,textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:14,transition:"border-color 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC44"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
                <div style={{width:40,height:40,borderRadius:6,background:typeColors[r.type]+"22",border:`1px solid ${typeColors[r.type]}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:9,fontWeight:700,color:typeColors[r.type],letterSpacing:0.5,textTransform:"uppercase"}}>{r.type}</span>
                </div>
                <div>
                  <div style={{fontSize:14,color:"#1A1535",fontWeight:500,marginBottom:2}}>{r.title}</div>
                  <div style={{fontSize:11,color:"#6B6880"}}>{r.sub}</div>
                  {r.type==="transcript"&&<div style={{fontSize:11,color:"#7C5CFC",marginTop:4,fontStyle:"italic"}}>Found in transcript</div>}
                  {r.type==="record"&&<div style={{fontSize:11,color:"#B87520",marginTop:4}}>Found in meeting record</div>}
                  {r.type==="letter"&&<div style={{fontSize:11,color:"#1A7A4A",marginTop:4}}>Found in letter</div>}
                  {r.type==="evidence"&&<div style={{fontSize:11,color:"#1A7A4A",marginTop:4}}>Evidence file</div>}
                  {r.type==="employee"&&<div style={{fontSize:11,color:"#B87520",marginTop:4}}>Employee record</div>}
                  {r.type==="dsar"&&<div style={{fontSize:11,color:"#C84B2F",marginTop:4}}>DSAR request</div>}
                </div>
              </button>
            );
          })}
          {hasMore&&(
            <button onClick={loadMore} style={{width:"100%",padding:"12px",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,cursor:"pointer",fontSize:13,color:"#7C5CFC",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>
              Load more ({visibleResults.length} of {total})
            </button>
          )}
        </div>
      )}

      {!searchQuery&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Card style={{background:"#F5F1EA"}}>
            <div style={{fontSize:11,color:"#6B6880",marginBottom:12,fontWeight:600,letterSpacing:0.5,textTransform:"uppercase"}}>Recent cases</div>
            {cases.slice(-5).reverse().map(c=>(
              <button key={c.id} type="button" onClick={()=>setScreen(SCREENS.CASES)} style={{display:"block",width:"100%",padding:"8px 0",border:"none",borderBottom:"1px solid #1a1a1a",background:"none",cursor:"pointer",textAlign:"left",font:"inherit",fontSize:12,color:"#3D3560"}}>{c.employeeName}</button>
            ))}
            {cases.length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No cases yet</div>}
          </Card>
          <Card style={{background:"#F5F1EA"}}>
            <div style={{fontSize:11,color:"#6B6880",marginBottom:12,fontWeight:600,letterSpacing:0.5,textTransform:"uppercase"}}>Overdue actions</div>
            {dueSoon.filter(d=>d.overdue).slice(0,5).map((d,i)=>(
              <div key={i} style={{padding:"8px 0",borderBottom:"1px solid #1a1a1a",fontSize:12}}>
                <div style={{color:"#C84B2F",marginBottom:1}}>{d.employeeName}</div>
                <div style={{color:"#6B6880",fontSize:10}}>{d.label} · {d.daysOverdue}d overdue</div>
              </div>
            ))}
            {dueSoon.filter(d=>d.overdue).length===0&&<div style={{fontSize:12,color:"#5A5570"}}>No overdue actions</div>}
          </Card>
        </div>
      )}
    </div>
  );
}
