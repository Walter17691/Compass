import { useState, useEffect } from 'react';
import { MEETING_TYPES } from '../constants';
import { buildEventTimes, parseAttendees, suggestAttendees, checkNoticePeriod } from '../lib/meetingScheduling';
import { CASE_TYPE_TO_POLICY_CATEGORY } from '../lib/hearingPack';
import { getProcessType } from '../lib/processStages';

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

const EMPTY_SCHEDULE_FORM = { caseId: "", meetingType: "investigation", date: "", startTime: "", durationMinutes: 60, attendees: "", description: "" };

// Integrations & Workflow Automation (Phase 5, IP15/IP16, §9-10) — real
// scheduling, calling IP3's create-event primitive on every calendar the
// user has connected (App.jsx's scheduleMeeting). Every MEETING_TYPES
// entry is selectable, not a narrowed subset. IP16 layers in three
// "smart" additions once a case, date and time are picked: attendee/role
// suggestions, a policy notice-period check, and an availability check
// against the organiser's own connected calendar.
function ScheduleMeetingModal({ cases, policies = [], caseAccess = [], orgMembers = [], organiserEmail, onClose, onSubmit, scheduling, onCheckAvailability, availabilityCheck, availabilityChecking, clearAvailabilityCheck }) {
  const [form, setForm] = useState(EMPTY_SCHEDULE_FORM);
  const canSubmit = form.date && form.startTime && !scheduling;
  const cs = cases.find(c=>c.id===form.caseId) || null;
  const times = buildEventTimes({ date: form.date, startTime: form.startTime, durationMinutes: form.durationMinutes });

  // Re-checks whenever the proposed slot actually changes — clearing
  // first so a stale result from the previous slot never lingers under
  // the new one while the fresh check is still in flight.
  useEffect(() => {
    clearAvailabilityCheck?.();
    if (times) onCheckAvailability?.(times);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date, form.startTime, form.durationMinutes]);

  const attendeeSuggestion = cs ? suggestAttendees(cs, { caseAccess, orgMembers, organiserEmail, meetingTypeId: form.meetingType }) : null;
  const newSuggestedEmails = (attendeeSuggestion?.emails || []).filter(e => !parseAttendees(form.attendees).includes(e));

  const relevantCategory = cs ? CASE_TYPE_TO_POLICY_CATEGORY[getProcessType(cs.caseType).id] : null;
  const clauseTexts = relevantCategory ? policies.filter(p => p.category === relevantCategory).flatMap(p => (p.clauses || []).map(c => c.text)) : [];
  const noticeCheck = times ? checkNoticePeriod(clauseTexts, { meetingISO: times.startISO }) : null;

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(26,21,53,0.35)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:24,width:"100%",maxWidth:460,boxSizing:"border-box"}}>
        <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1A1535",margin:"0 0 16px",fontWeight:400}}>Schedule a meeting</h3>

        <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Case (optional)</label>
        <select value={form.caseId} onChange={e=>setForm(f=>({...f,caseId:e.target.value}))} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 12px",color:"#1A1535",marginBottom:12,boxSizing:"border-box"}}>
          <option value="">No linked case</option>
          {cases.map(c=><option key={c.id} value={c.id}>{c.employeeName} — {c.caseType||"HR matter"}</option>)}
        </select>

        <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Meeting type</label>
        <select value={form.meetingType} onChange={e=>setForm(f=>({...f,meetingType:e.target.value}))} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 12px",color:"#1A1535",marginBottom:12,boxSizing:"border-box"}}>
          {MEETING_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <div style={{flex:1}}>
            <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Date</label>
            <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 12px",color:"#1A1535",boxSizing:"border-box"}}/>
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Start time</label>
            <input type="time" value={form.startTime} onChange={e=>setForm(f=>({...f,startTime:e.target.value}))} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 12px",color:"#1A1535",boxSizing:"border-box"}}/>
          </div>
          <div style={{width:110}}>
            <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Duration</label>
            <select value={form.durationMinutes} onChange={e=>setForm(f=>({...f,durationMinutes:Number(e.target.value)}))} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 12px",color:"#1A1535",boxSizing:"border-box"}}>
              {[15,30,45,60,90,120].map(m=><option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>

        {noticeCheck?.violated&&(
          <div style={{background:"#FDF3E8",border:"1px solid #E8C088",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#8A5A1E"}}>
            Policy requires {noticeCheck.requiredText} — this meeting is only {Math.max(0,Math.round(noticeCheck.actualHours))} hour{Math.round(noticeCheck.actualHours)===1?"":"s"} away.
          </div>
        )}
        {times&&availabilityChecking&&(
          <div style={{fontSize:12,color:"#9B9098",marginBottom:12}}>Checking your calendar…</div>
        )}
        {times&&!availabilityChecking&&availabilityCheck?.checked&&(
          availabilityCheck.conflicts.length>0 ? (
            <div style={{background:"#FEF0EB",border:"1px solid #F0C4B4",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#8A3B1E"}}>
              Clashes with {availabilityCheck.conflicts.length} event{availabilityCheck.conflicts.length===1?"":"s"} on your calendar: {availabilityCheck.conflicts.map(c=>c.title).join(", ")}
            </div>
          ) : (
            <div style={{fontSize:11,color:"#1A7A4A",marginBottom:12}}>No conflicts on your calendar</div>
          )
        )}

        <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Attendees (optional)</label>
        <input value={form.attendees} onChange={e=>setForm(f=>({...f,attendees:e.target.value}))} placeholder="sarah@company.com, rep@union.org" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 12px",color:"#1A1535",marginBottom:8,boxSizing:"border-box"}}/>
        {attendeeSuggestion&&(newSuggestedEmails.length>0||attendeeSuggestion.roleNotes.length>0)&&(
          <div style={{background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:8,padding:"8px 12px",marginBottom:12}}>
            {newSuggestedEmails.length>0&&(
              <button onClick={()=>setForm(f=>({...f,attendees:[...parseAttendees(f.attendees),...newSuggestedEmails].join(", ")}))} style={{fontSize:11,color:"#5B3FD4",background:"none",border:"1px solid #DDD9F5",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",marginBottom:attendeeSuggestion.roleNotes.length?6:0}}>+ Add {newSuggestedEmails.join(", ")}</button>
            )}
            {attendeeSuggestion.roleNotes.map((note,i)=>(
              <div key={i} style={{fontSize:11,color:"#6B6375"}}>{note}</div>
            ))}
          </div>
        )}

        <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Description (optional)</label>
        <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"9px 12px",color:"#1A1535",marginBottom:16,resize:"vertical",boxSizing:"border-box",fontFamily:"DM Sans,system-ui,sans-serif"}}/>

        <div style={{display:"flex",gap:10}}>
          <button onClick={async()=>{ if(await onSubmit(form)) onClose(); }} disabled={!canSubmit} style={{flex:1,fontSize:13,background:!canSubmit?"#E8E0D0":"#7C5CFC",border:"none",borderRadius:8,padding:"10px 18px",color:"#fff",fontWeight:600,cursor:!canSubmit?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{scheduling?"Scheduling…":"Schedule"}</button>
          <button onClick={onClose} style={{flex:1,fontSize:13,background:"none",border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 18px",color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function CalendarScreen({ dueSoon = [], setScreen, screens, setActiveCaseId, setActiveCaseStage, cases = [], onScheduleMeeting, meetingScheduling, policies, caseAccess, orgMembers, organiserEmail, onCheckAvailability, availabilityCheck, availabilityChecking, clearAvailabilityCheck }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

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
          {onScheduleMeeting&&<button onClick={()=>setShowScheduleModal(true)} style={{fontSize:13,background:"#7C5CFC",border:"none",borderRadius:8,padding:"7px 14px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>+ Schedule meeting</button>}
        </div>
      </div>

      {showScheduleModal&&(
        <ScheduleMeetingModal cases={cases} policies={policies} caseAccess={caseAccess} orgMembers={orgMembers} organiserEmail={organiserEmail}
          onClose={()=>setShowScheduleModal(false)} onSubmit={onScheduleMeeting} scheduling={meetingScheduling}
          onCheckAvailability={onCheckAvailability} availabilityCheck={availabilityCheck} availabilityChecking={availabilityChecking} clearAvailabilityCheck={clearAvailabilityCheck}/>
      )}

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
