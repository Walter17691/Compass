import { useState, useRef, useEffect } from 'react';
import { ls, lsSet } from '../lib/storage';
import { usePopoverPosition } from '../hooks/usePopoverPosition';
import { FONT, COLOR, TYPE, RADIUS } from '../styles/tokens';

// Phase 2B — token-only visual pass (Compass Design Vision §6). The
// popover-positioning logic (usePopoverPosition, Phase 7.5C) and every
// interactive behaviour (open/close, Escape, outside click, unread-seen
// cursor) are completely untouched — only colours/fonts/spacing below
// moved onto the shared tokens. No "needs attention vs recent activity"
// split was added here: auditLog entries carry no real signal for which
// past actions still need attention (they're a plain completed-action
// log, not a task/deadline list), and the Design Vision is explicit that
// a category should never be fabricated where the data doesn't
// genuinely support it.

// Self-contained so it can drop into both the shared header (App.jsx) and
// HomeScreen's separate nav without threading half a dozen props through
// two different component trees. orgId namespaces the "last seen" cursor
// per org (Phase 6.5 hardening) — without it, switching orgs would carry
// one org's dismissal timestamp into another's activity feed, silently
// mismarking real unread items as seen or vice versa. Compass itself
// already fully remounts on org switch (see main.jsx's key={org.id}), so
// this component gets a fresh mount either way; the namespacing is what
// makes the freshly-read cursor the *correct* org's cursor.
export function ActivityBell({ auditLog, orgId }) {
  const [show, setShow] = useState(false);
  const lastSeenKey = `${orgId || "noorg"}:compass_last_seen_activity`;
  const [lastSeen, setLastSeen] = useState(() => ls(lastSeenKey, null));
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popoverStyle = usePopoverPosition(btnRef, show);

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
    lsSet(lastSeenKey, now);
  };

  return (
    <div style={{position:"relative"}} ref={ref}>
      <button ref={btnRef} onClick={toggle} aria-label={`Activity${unreadCount?` (${unreadCount} unread)`:""}`} title={`Activity${unreadCount?` (${unreadCount} unread)`:""}`} style={{position:"relative",background:show?COLOR.purpleTint:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"5px 10px",fontSize:13,cursor:"pointer",color:COLOR.inkSoft,fontFamily:FONT.sans}}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{display:"block"}}>
          <path d="M8 1.5c-2.2 0-4 1.8-4 4v2.5c0 .6-.2 1.2-.6 1.7L2.5 11h11l-.9-1.3c-.4-.5-.6-1.1-.6-1.7V5.5c0-2.2-1.8-4-4-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          <path d="M6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        {unreadCount>0&&<span style={{position:"absolute",top:-4,right:-4,background:COLOR.red,color:"#fff",borderRadius:"50%",minWidth:15,height:15,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,padding:"0 3px"}}>{unreadCount>9?"9+":unreadCount}</span>}
      </button>
      {show&&popoverStyle&&(
        <div role="menu" aria-label="Recent activity" style={{...popoverStyle,background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",width:320,maxWidth:"calc(100vw - 24px)",overflowY:"auto",zIndex:250}}>
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${COLOR.borderFaint}`,...TYPE.sectionHeading,color:COLOR.inkFaint}}>Recent activity</div>
          {feed.length===0&&<div style={{padding:"20px 14px",fontSize:12,color:COLOR.inkFaint,textAlign:"center"}}>Nothing yet</div>}
          {feed.map(a=>(
            <div key={a.id} style={{padding:"9px 14px",borderBottom:`1px solid ${COLOR.borderFaint}`}}>
              <div style={{fontSize:12,color:COLOR.ink}}>{a.action}{a.detail&&<span style={{color:COLOR.inkSoft}}> — {a.detail}</span>}</div>
              <div style={{fontSize:10,color:COLOR.inkFaint,marginTop:2}}>{a.user} · {new Date(a.ts).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
