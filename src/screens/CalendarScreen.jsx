import { useState } from 'react';

// Process Intelligence (P16, §5) — the same computeDueSoon output the
// overdue banner/Settings list/digest cron already read (lib/deadlines.js),
// just visualised as a month grid instead of a flat list. Not a second
// source of truth, and not a wider deadline window either —
// computeDueSoon's own 14-day cutoff is unchanged, so months beyond that
// genuinely show nothing; the caption below says so rather than leaving
// an unexplained empty grid.
const CATEGORY_COLOR = {
  next_step:"#7C5CFC", outcome:"#C84B2F", appeal:"#B87520", investigation:"#1C5AA0",
  grievance:"#4A7C6F", signature:"#9B59B6", dsar:"#E8622A", task:"#6B6375",
  wellbeing:"#4A6FA5", leaver:"#888888", redundancy:"#D4882A",
  fit_note:"#1A7A4A", probation:"#7C5CFC", oh_referral:"#4A6FA5", suspension:"#C84B2F",
};

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }

export function CalendarScreen({ dueSoon = [], setScreen, screens, setActiveCaseId, setActiveCaseStage }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);

  const today = new Date();
  const viewMonth = new Date(today.getFullYear(), today.getMonth()+monthOffset, 1);
  const totalDays = daysInMonth(viewMonth);
  const leadingBlanks = (viewMonth.getDay()+6)%7; // Monday-first grid
  const todayKey = today.toLocaleDateString("en-GB");

  const byDate = {};
  dueSoon.forEach(d => { (byDate[d.deadlineDate] = byDate[d.deadlineDate]||[]).push(d); });

  const cells = [...Array(leadingBlanks).fill(null), ...Array(totalDays).keys()].map((v,i)=> i<leadingBlanks ? null : v+1);

  const dateKey = (day) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day).toLocaleDateString("en-GB");
  const selectedItems = selectedDate ? (byDate[selectedDate]||[]) : [];

  const openCase = (item) => {
    if(!item.caseId) return;
    setActiveCaseId(item.caseId);
    setActiveCaseStage("investigation");
    setScreen(screens.CASE_VIEW);
  };

  return (
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #E8E0D0",padding:"16px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:22,color:"#1A1535",margin:0,fontWeight:400}}>Calendar</h2>
          <p style={{fontSize:13,color:"#9B9098",margin:"2px 0 0"}}>Deadlines and reminders due within the next 14 days — months further out will show nothing yet.</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>setMonthOffset(m=>m-1)} style={{fontSize:13,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>←</button>
          <div style={{fontSize:14,fontWeight:600,color:"#1A1535",minWidth:140,textAlign:"center"}}>{viewMonth.toLocaleDateString("en-GB",{month:"long",year:"numeric"})}</div>
          <button onClick={()=>setMonthOffset(m=>m+1)} style={{fontSize:13,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>→</button>
        </div>
      </div>

      <div style={{maxWidth:900,margin:"0 auto",padding:"28px 24px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,background:"#E8E0D0",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
          {WEEKDAYS.map(d=>(
            <div key={d} style={{background:"#FDFAF5",padding:"8px",fontSize:11,fontWeight:700,color:"#9B9098",textAlign:"center",textTransform:"uppercase"}}>{d}</div>
          ))}
          {cells.map((day,i)=>{
            if(day===null) return <div key={i} style={{background:"#FFFFFF",minHeight:90}}/>;
            const key = dateKey(day);
            const items = byDate[key]||[];
            const isToday = key===todayKey;
            return (
              <div key={i} onClick={()=>items.length&&setSelectedDate(key)} style={{background:"#FFFFFF",minHeight:90,padding:6,cursor:items.length?"pointer":"default",boxSizing:"border-box",outline:isToday?"2px solid #7C5CFC":"none",outlineOffset:-2}}>
                <div style={{fontSize:11,color:isToday?"#7C5CFC":"#9B9098",fontWeight:isToday?700:400,marginBottom:4}}>{day}</div>
                {items.slice(0,3).map((it,idx)=>(
                  <div key={idx} title={it.label} style={{fontSize:10,color:"#FFFFFF",background:CATEGORY_COLOR[it.category]||"#6B6375",borderRadius:4,padding:"1px 5px",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.employeeName}</div>
                ))}
                {items.length>3&&<div style={{fontSize:10,color:"#9B9098"}}>+{items.length-3} more</div>}
              </div>
            );
          })}
        </div>

        {selectedDate&&(
          <div style={{marginTop:20,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>{selectedDate}</div>
              <button onClick={()=>setSelectedDate(null)} aria-label="Close" style={{background:"none",border:"none",color:"#9B9098",cursor:"pointer",fontSize:16}}>×</button>
            </div>
            {selectedItems.map((it,i)=>(
              <div key={i} onClick={()=>openCase(it)} style={{padding:"8px 10px",borderRadius:8,marginBottom:6,background:it.overdue?"#FEF0EB":"#FDFAF5",cursor:it.caseId?"pointer":"default"}}>
                <div style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>{it.employeeName}</div>
                <div style={{fontSize:12,color:"#6B6375"}}>{it.label}</div>
                {it.overdue&&<div style={{fontSize:11,color:"#C84B2F",marginTop:2}}>{it.daysOverdue} day{it.daysOverdue===1?"":"s"} overdue</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
