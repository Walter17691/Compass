import { useState } from 'react';
import { SCREENS } from '../constants';
import { CompassLogo } from './CompassLogo';
import { ActivityBell } from './ActivityBell';
import { OrgSwitcher } from './OrgSwitcher';
import { MenuIcon } from './Icons';

const SearchIcon = ({size=15}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;

const NavButton = ({s, l, indent, screen, goToScreen}) => (
  <button onClick={()=>goToScreen(s)}
    style={{display:"flex",alignItems:"center",width:"100%",textAlign:"left",background:screen===s?"#F5F3FF":"none",border:"none",color:screen===s?"#7C5CFC":"#6B6375",padding:indent?"7px 14px 7px 28px":"9px 14px",borderRadius:8,fontSize:13,fontWeight:screen===s?600:400,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
    {l}
  </button>
);

// Left sidebar — the single shell mounted above every screen, replacing
// AppHeader.jsx's top nav bar (kept as one mount point for the same
// reason AppHeader was unified in the first place: nothing left to drift
// out of sync between screens). Meetings/Tasks/Documents are already
// real top-level destinations by this point (Phases 3/6), which is why
// this phase — converting the nav shell itself — was sequenced last.
export function AppSidebar({ screen, setScreen, cases, getCaseStage, isMobile, showMobileNav, setShowMobileNav, meetingType, caseInfo, org, availableOrgs, switchOrg, onJoinAnotherOrg, currentUser, auditLog, onSignOut, isHR }) {
  const [processesOpen, setProcessesOpen] = useState(true);
  const goToScreen = (s) => { setScreen(s); setShowMobileNav(false); };
  const activeCaseCount = cases.filter(x=>getCaseStage(x)!=="closed").length;

  const primaryItems = [
    {s:SCREENS.HOME, l:"Home"},
    // Manager Enablement (Phase 4, MP16, §1) — "My People Actions", a
    // manager-appropriate front door onto data every other phase in this
    // track already produces (assigned cases, tasks, HR responses,
    // concerns submitted). HR runs the full Cases/Tasks/Concerns screens
    // directly and has no need for a narrowed aggregate view of their own.
    ...(isHR ? [] : [{s:SCREENS.MANAGER_PORTAL, l:"My People Actions"}]),
    // Manager Enablement (Phase 4, MP18, §14) — the HR-facing counterpart
    // to My People Actions: what's been delegated out, and to whom,
    // rather than a manager's own view of it.
    ...(isHR ? [{s:SCREENS.HR_DELEGATED_WORK, l:"Delegated Work"}] : []),
    {s:SCREENS.ASK_COMPASS, l:"Ask Compass"},
    {s:SCREENS.CASES, l:"Cases"+(activeCaseCount>0?" ("+activeCaseCount+")":"")},
    {s:SCREENS.TASKS, l:"Tasks"},
    {s:SCREENS.CALENDAR, l:"Calendar"},
    {s:SCREENS.PEOPLE, l:"People"},
    {s:SCREENS.ERREPORT, l:"Reports"},
    // The one destination every org member can reach regardless of role —
    // ConcernsScreen itself renders an intake-only view for non-HR and a
    // full triage queue for HR (concern_referrals_2026-08-12.sql's RLS
    // backs this, not just the label here).
    {s:SCREENS.CONCERNS, l:isHR?"Concerns":"Raise a concern"},
  ];
  const moduleItems = [
    {s:SCREENS.NEWSTARTER, l:"Onboarding"},
    {s:SCREENS.OFFBOARDING, l:"Offboarding"},
    {s:SCREENS.REDUNDANCY, l:"Redundancy"},
    // Wellbeing notes are confidential and RLS-restricted to HR staff (see
    // supabase/wellbeing_notes_2026-08-09.sql) — a non-HR role has no
    // database access to them, so don't even show the link.
    ...(isHR ? [{s:SCREENS.WELLBEING, l:"Wellbeing"}] : []),
    {s:SCREENS.DSAR, l:"DSAR"},
    {s:SCREENS.SAVE_EMAIL, l:"Save email to case"},
  ];
  const allNavItems = [...primaryItems, ...moduleItems, {s:SCREENS.SEARCH, l:"Search"}, {s:SCREENS.SETTINGS, l:"Settings"}];

  const sidebarBody = (
    <>
      <button onClick={()=>goToScreen(SCREENS.HOME)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",padding:"4px 14px 16px",cursor:"pointer",width:"100%"}}>
        <CompassLogo size={30}/>
        <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:17,color:"#1A1535",letterSpacing:"-0.2px"}}>Compass</span>
      </button>

      <nav style={{display:"flex",flexDirection:"column",gap:2,flex:1,overflowY:"auto",paddingBottom:12}}>
        {primaryItems.map(item=><NavButton key={item.s} {...item} screen={screen} goToScreen={goToScreen}/>)}

        <button onClick={()=>setProcessesOpen(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",color:"#9B9098",padding:"12px 14px 4px",fontSize:11,fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
          HR Processes
          <span style={{fontSize:10,transform:processesOpen?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.15s"}}>▾</span>
        </button>
        {processesOpen&&moduleItems.map(item=><NavButton key={item.s} {...item} indent screen={screen} goToScreen={goToScreen}/>)}

        <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #F5F1EA",display:"flex",flexDirection:"column",gap:2}}>
          <button onClick={()=>goToScreen(SCREENS.SEARCH)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",background:screen===SCREENS.SEARCH?"#F5F3FF":"none",border:"none",color:screen===SCREENS.SEARCH?"#7C5CFC":"#6B6375",padding:"9px 14px",borderRadius:8,fontSize:13,fontWeight:screen===SCREENS.SEARCH?600:400,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
            <SearchIcon/> Search
          </button>
          <NavButton s={SCREENS.SETTINGS} l="Settings" screen={screen} goToScreen={goToScreen}/>
        </div>
      </nav>

      <div style={{borderTop:"1px solid #F5F1EA",paddingTop:12,display:"flex",flexDirection:"column",gap:8}}>
        <div style={{padding:"0 14px"}}><OrgSwitcher org={org} availableOrgs={availableOrgs} switchOrg={switchOrg} onJoinAnotherOrg={onJoinAnotherOrg}/></div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px"}}>
          <div style={{minWidth:0}}>
            {currentUser?.name&&<div style={{fontSize:12,color:"#6B6375",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser.name}</div>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <ActivityBell auditLog={auditLog}/>
            {onSignOut&&<button onClick={onSignOut} title="Sign out" style={{background:"none",border:"1px solid #E8E0D0",color:"#9B9098",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Sign out</button>}
          </div>
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <header style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",position:"sticky",top:0,zIndex:99}}>
        <div style={{padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <button onClick={()=>goToScreen(SCREENS.HOME)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",padding:0,cursor:"pointer"}}>
            <CompassLogo size={28}/>
            <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535"}}>Compass</span>
          </button>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {meetingType&&<span style={{background:"#EDE8FF",color:"#7C5CFC",borderRadius:12,padding:"2px 10px",fontSize:11,fontWeight:600}}>{caseInfo?.employee||meetingType.label}</span>}
            <ActivityBell auditLog={auditLog}/>
            <button onClick={()=>setShowMobileNav(v=>!v)} aria-label="Menu" style={{background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",cursor:"pointer",color:"#6B6375",display:"flex",alignItems:"center"}}><MenuIcon size={16}/></button>
          </div>
        </div>
        {showMobileNav&&(
          <nav style={{borderTop:"1px solid #EDE5D8",display:"flex",flexDirection:"column",padding:"6px 0",maxHeight:"70vh",overflowY:"auto"}}>
            {allNavItems.map(({s,l})=>(
              <button key={s} onClick={()=>goToScreen(s)}
                style={{background:screen===s?"#F5F3FF":"none",border:"none",color:screen===s?"#7C5CFC":"#6B6375",padding:"10px 16px",fontSize:13,fontWeight:screen===s?600:400,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",textAlign:"left"}}>
                {l}
              </button>
            ))}
            <div style={{padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:"1px solid #F5F1EA",marginTop:6,paddingTop:12}}>
              {currentUser?.name&&<span style={{fontSize:12,color:"#6B6375"}}>{currentUser.name}</span>}
              {onSignOut&&<button onClick={onSignOut} style={{background:"none",border:"1px solid #E8E0D0",color:"#9B9098",borderRadius:6,padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Sign out</button>}
            </div>
          </nav>
        )}
      </header>
    );
  }

  return (
    <aside style={{width:224,flexShrink:0,height:"100vh",position:"sticky",top:0,background:"#FFFFFF",borderRight:"1px solid #EDE5D8",display:"flex",flexDirection:"column",padding:"16px 8px"}}>
      {sidebarBody}
    </aside>
  );
}
