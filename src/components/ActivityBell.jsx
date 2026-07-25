import { useState, useRef, useEffect } from 'react';
import { ls, lsSet } from '../lib/storage';

// Self-contained so it can drop into both the shared header (App.jsx) and
// HomeScreen's separate nav without threading half a dozen props through
// two different component trees.
export function ActivityBell({ auditLog }) {
  const [show, setShow] = useState(false);
  const [lastSeen, setLastSeen] = useState(() => ls("compass_last_seen_activity", null));
  const ref = useRef(null);

  useEffect(() => {
    if(!show) return;
    const onKeyDown = e => { if(e.key==="Escape") setShow(false); };
    const onClickOutside = e => { if(ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onClickOutside); };
  }, [show]);

  const feed = auditLog.filter(a => a.action !== "Session started").slice(0, 20);
  const unreadCount = feed.filter(a => !lastSeen || new Date(a.ts) > new Date(lastSeen)).length;
  const toggle = () => {
    setShow(v => !v);
    const now = new Date().toISOString();
    setLastSeen(now);
    lsSet("compass_last_seen_activity", now);
  };

  return (
    <div style={{position:"relative"}} ref={ref}>
      <button onClick={toggle} aria-label={`Activity${unreadCount?` (${unreadCount} unread)`:""}`} style={{position:"relative",background:show?"#F5F3FF":"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"5px 10px",fontSize:13,cursor:"pointer",color:"#6B6375"}}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{display:"block"}}>
          <path d="M8 1.5c-2.2 0-4 1.8-4 4v2.5c0 .6-.2 1.2-.6 1.7L2.5 11h11l-.9-1.3c-.4-.5-.6-1.1-.6-1.7V5.5c0-2.2-1.8-4-4-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          <path d="M6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        {unreadCount>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#C84B2F",color:"#fff",borderRadius:"50%",minWidth:15,height:15,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,padding:"0 3px"}}>{unreadCount>9?"9+":unreadCount}</span>}
      </button>
      {show&&(
        <div role="menu" aria-label="Recent activity" style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",width:320,maxWidth:"calc(100vw - 24px)",maxHeight:400,overflowY:"auto",zIndex:250}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid #EDE5D8",fontSize:11,fontWeight:600,color:"#7C5CFC",letterSpacing:0.5,textTransform:"uppercase"}}>Recent activity</div>
          {feed.length===0&&<div style={{padding:"20px 14px",fontSize:12,color:"#9B9098",textAlign:"center"}}>Nothing yet</div>}
          {feed.map(a=>(
            <div key={a.id} style={{padding:"10px 14px",borderBottom:"1px solid #F5F1EA"}}>
              <div style={{fontSize:12,color:"#1A1535"}}>{a.action}{a.detail&&<span style={{color:"#6B6375"}}> — {a.detail}</span>}</div>
              <div style={{fontSize:10,color:"#9B9098",marginTop:2}}>{a.user} · {new Date(a.ts).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
