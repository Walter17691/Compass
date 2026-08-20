import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { ORG_EVENT_TYPES, orgEventTypeLabel, describeEventCorrelation } from '../lib/orgEvents';

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

  if (error) return <div style={{fontSize:12,color:"#6B6375"}}>Couldn't load correlation data right now.</div>;
  if (!data) return <div style={{fontSize:12,color:"#6B6375"}}>Loading…</div>;
  return <div style={{fontSize:12,color:"#1A1535"}}>{describeEventCorrelation(data)}</div>;
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
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Organisational events</div>

      {sorted.length === 0 && <div style={{fontSize:13,color:"#6B6375"}}>No organisational events logged yet.</div>}
      {sorted.map(ev => (
        <div key={ev.id} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"14px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
            <div>
              <span style={{fontSize:11,fontWeight:700,color:"#B87520",textTransform:"uppercase",letterSpacing:0.4}}>{orgEventTypeLabel(ev.eventType)}</span>
              <span style={{fontSize:11,color:"#9B9098",marginLeft:8}}>{ev.eventDate}</span>
            </div>
            {isHR && (
              <button onClick={()=>setExploringEventId(id => id===ev.id?null:ev.id)} style={{fontSize:11,background:"none",border:"1px solid #E0D8FF",borderRadius:6,padding:"3px 10px",color:"#7C5CFC",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                {exploringEventId===ev.id?"Hide correlation":"Explore correlation"}
              </button>
            )}
          </div>
          <div style={{fontSize:13,color:"#1A1535",marginTop:6}}>{ev.description}</div>
          {ev.affectedLocations?.length > 0 && <div style={{fontSize:11,color:"#9B9098",marginTop:4}}>Affected: {ev.affectedLocations.join(", ")}</div>}
          {exploringEventId===ev.id && (
            <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #F5F1EA"}}>
              <CorrelationView eventId={ev.id}/>
            </div>
          )}
        </div>
      ))}

      {isHR && (
        <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px 18px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:0.4,textTransform:"uppercase",marginBottom:10}}>Log an event</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
            <input type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"7px 10px",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
            <select value={eventType} onChange={e=>setEventType(e.target.value)} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"7px 10px",fontFamily:"DM Sans,system-ui,sans-serif"}}>
              {ORG_EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description" rows={2} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"7px 10px",fontFamily:"DM Sans,system-ui,sans-serif",marginBottom:8,resize:"vertical"}}/>
          <input value={affectedLocations} onChange={e=>setAffectedLocations(e.target.value)} placeholder="Affected locations (comma-separated, optional)" style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"7px 10px",fontFamily:"DM Sans,system-ui,sans-serif",marginBottom:10}}/>
          <button
            onClick={()=>{
              if(!eventDate.trim()||!description.trim()) return;
              const locations = affectedLocations.split(",").map(s=>s.trim()).filter(Boolean);
              onAddEvent({ eventDate, eventType, description: description.trim(), affectedLocations: locations });
              setEventDate(""); setDescription(""); setAffectedLocations("");
            }}
            disabled={!eventDate.trim()||!description.trim()}
            style={{fontSize:12,background:"#7C5CFC",border:"none",borderRadius:8,padding:"8px 16px",color:"#fff",fontWeight:600,cursor:eventDate.trim()&&description.trim()?"pointer":"default",opacity:eventDate.trim()&&description.trim()?1:0.5,fontFamily:"DM Sans,system-ui,sans-serif"}}
          >
            Log event
          </button>
        </div>
      )}
    </div>
  );
}
