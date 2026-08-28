import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { ORG_EVENT_TYPES, orgEventTypeLabel, describeEventCorrelation } from '../lib/orgEvents';
import { COLOR, TYPE, FONT, RADIUS, SPACE } from '../styles/tokens';

// Phase 2C — the correlation statement (describeEventCorrelation) is
// rendered directly, in the same spot the "Explore correlation" toggle
// reveals — never split from its own non-causal wording ("temporal
// correlation worth reviewing"), so there's no separate caveat to pair
// it with; it's already one sentence.
function CorrelationView({ eventId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('org_event_correlation', { p_event_id: eventId, p_window_days: 42 });
      if (cancelled) return;
      if (rpcError) { console.error("org_event_correlation", rpcError); setError(true); }
      else setData(data);
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  if (error) return <div style={{fontSize:12,color:COLOR.inkFaint}}>Couldn't load correlation data right now.</div>;
  if (!data) return <div style={{fontSize:12,color:COLOR.inkFaint}}>Loading…</div>;
  return <div style={{fontSize:12,color:COLOR.ink}}>{describeEventCorrelation(data)}</div>;
}

// Organisational ER Intelligence (Phase 6, OP15, §11) — organisational
// change correlation. HR-only logging (org_events_2026-08-19.sql's own
// RLS enforces this server-side too — isHR here only gates the UI
// controls, same pattern ThemeTaxonomyManager already established).
// Any org member can view the list; only HR can log or explore
// correlation, since exploring surfaces real case-volume numbers.
export function OrgEventsPanel({ orgEvents, isHR, onAddEvent }) {
  const [eventDate, setEventDate] = useState("");
  const [eventType, setEventType] = useState(ORG_EVENT_TYPES[0].id);
  const [description, setDescription] = useState("");
  const [affectedLocations, setAffectedLocations] = useState("");
  const [exploringEventId, setExploringEventId] = useState(null);

  const sorted = [...(orgEvents || [])].sort((a,b) => new Date(b.eventDate) - new Date(a.eventDate));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:SPACE.md}}>
      <div>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:4}}>Organisational events</div>
        <div style={{fontSize:12,color:COLOR.inkFaint,maxWidth:560}}>A timeline of logged organisational changes, each paired with any observed case-volume correlation — a temporal pattern worth reviewing, never a proven cause.</div>
      </div>

      {sorted.length === 0 && <div style={{fontSize:13,color:COLOR.inkFaint}}>No organisational events logged yet.</div>}
      {sorted.map((ev,i) => (
            <div key={ev.id} style={{padding:"12px 0",borderBottom:i<sorted.length-1?`1px solid ${COLOR.borderFaint}`:"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
                <div>
                  <span style={{fontSize:11,fontWeight:700,color:COLOR.amber,textTransform:"uppercase",letterSpacing:0.4}}>{orgEventTypeLabel(ev.eventType)}</span>
                  <span style={{fontSize:11,color:COLOR.inkFaint,marginLeft:8}}>{ev.eventDate}</span>
                </div>
                {isHR && (
                  <button onClick={()=>setExploringEventId(id => id===ev.id?null:ev.id)} style={{fontSize:11,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"3px 10px",color:COLOR.purple,cursor:"pointer",fontFamily:FONT.sans}}>
                    {exploringEventId===ev.id?"Hide correlation":"Explore correlation"}
                  </button>
                )}
              </div>
              <div style={{fontSize:13,color:COLOR.ink,marginTop:6}}>{ev.description}</div>
              {ev.affectedLocations?.length > 0 && <div style={{fontSize:11,color:COLOR.inkFaint,marginTop:4}}>Affected: {ev.affectedLocations.join(", ")}</div>}
              {exploringEventId===ev.id && (
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${COLOR.borderFaint}`}}>
                  <CorrelationView eventId={ev.id}/>
                </div>
              )}
            </div>
      ))}

      {isHR && (
        <div style={{background:COLOR.paper,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"16px 18px"}}>
          <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:10}}>Log an event</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
            <input type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)} aria-label="Event date" style={{fontSize:13,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"7px 10px",fontFamily:FONT.sans}}/>
            <select value={eventType} onChange={e=>setEventType(e.target.value)} aria-label="Event type" style={{fontSize:13,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"7px 10px",fontFamily:FONT.sans}}>
              {ORG_EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description" aria-label="Description" rows={2} style={{width:"100%",fontSize:13,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"7px 10px",fontFamily:FONT.sans,marginBottom:8,resize:"vertical",boxSizing:"border-box"}}/>
          <input value={affectedLocations} onChange={e=>setAffectedLocations(e.target.value)} placeholder="Affected locations (comma-separated, optional)" aria-label="Affected locations (comma-separated, optional)" style={{width:"100%",fontSize:13,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"7px 10px",fontFamily:FONT.sans,marginBottom:10,boxSizing:"border-box"}}/>
          <button
            onClick={()=>{
              if(!eventDate.trim()||!description.trim()) return;
              const locations = affectedLocations.split(",").map(s=>s.trim()).filter(Boolean);
              onAddEvent({ eventDate, eventType, description: description.trim(), affectedLocations: locations });
              setEventDate(""); setDescription(""); setAffectedLocations("");
            }}
            disabled={!eventDate.trim()||!description.trim()}
            style={{fontSize:12,background:COLOR.purple,border:"none",borderRadius:RADIUS.surface,padding:"8px 16px",color:"#fff",fontWeight:600,cursor:eventDate.trim()&&description.trim()?"pointer":"default",opacity:eventDate.trim()&&description.trim()?1:0.5,fontFamily:FONT.sans}}
          >
            Log event
          </button>
        </div>
      )}
    </div>
  );
}
