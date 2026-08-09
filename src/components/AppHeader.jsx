import { SCREENS } from '../constants';
import { CompassLogo } from './CompassLogo';
import { ActivityBell } from './ActivityBell';
import { OrgSwitcher } from './OrgSwitcher';
import { NavModulesMenu } from './NavModulesMenu';
import { MenuIcon } from './Icons';

// Single header used on every screen, including Home — previously Home
// rendered its own separate copy (App.jsx's <header> was display:none
// there) and the two had drifted out of sync (different heights, padding,
// logo size, nav pill radius, active-tab colour), which is what caused a
// visible layout jump on every navigation away from Home. One component
// mounted unconditionally means there's nothing left to drift.
export function AppHeader({ screen, setScreen, cases, getCaseStage, isMobile, showMobileNav, setShowMobileNav, meetingType, caseInfo, org, availableOrgs, switchOrg, onJoinAnotherOrg, currentUser, auditLog, onSignOut, isHR }) {
  const goToScreen = (s) => setScreen(s);
  const primaryItems = [
    {s:SCREENS.HOME, l:"Home"},
    {s:SCREENS.CASES, l:"Cases"+(cases.filter(x=>getCaseStage(x)!=="closed").length>0?" ("+cases.filter(x=>getCaseStage(x)!=="closed").length+")":"")},
    {s:SCREENS.PEOPLE, l:"People"},
    {s:SCREENS.ERREPORT, l:"Reports"},
  ];
  const moduleItems = [
    {s:SCREENS.NEWSTARTER, l:"Onboarding"},
    {s:SCREENS.OFFBOARDING, l:"Offboarding"},
    {s:SCREENS.REDUNDANCY, l:"Redundancy"},
    // Wellbeing notes are confidential and RLS-restricted to HR staff (see
    // supabase/wellbeing_notes_2026-08-09.sql) — a location_manager org
    // member has no database access to them, so don't even show the tab.
    ...(isHR ? [{s:SCREENS.WELLBEING, l:"Wellbeing"}] : []),
    {s:SCREENS.DSAR, l:"DSAR"},
  ];
  const navItems = [...primaryItems, ...moduleItems, {s:SCREENS.SEARCH, l:"Search"}, {s:SCREENS.SETTINGS, l:"Settings"}];

  return (
    <header style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",position:"sticky",top:0,zIndex:99}}>
      <div style={{maxWidth:1440,margin:"0 auto",padding:"8px 24px",minHeight:52,display:"flex",flexWrap:"wrap",rowGap:6,alignItems:"center",justifyContent:"space-between"}}>

        {/* Logo */}
        <button onClick={()=>setScreen(SCREENS.HOME)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",padding:0,cursor:"pointer",flexShrink:0}}>
          <CompassLogo size={32}/>
          <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:17,color:"#1A1535",letterSpacing:"-0.2px"}}>Compass</span>
        </button>

        {/* Nav */}
        {isMobile ? (
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowMobileNav(v=>!v)} aria-label="Menu" style={{background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",cursor:"pointer",color:"#6B6375",display:"flex",alignItems:"center"}}><MenuIcon size={16} /></button>
            {showMobileNav&&(
              <nav style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",display:"flex",flexDirection:"column",minWidth:180,zIndex:200,overflow:"hidden"}}>
                {navItems.map(({s,l})=>(
                  <button key={s} onClick={()=>{goToScreen(s);setShowMobileNav(false);}}
                    style={{background:screen===s?"#F5F3FF":"none",border:"none",color:screen===s?"#7C5CFC":"#6B6375",padding:"10px 14px",fontSize:13,fontWeight:screen===s?600:400,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",textAlign:"left"}}>
                    {l}
                  </button>
                ))}
              </nav>
            )}
          </div>
        ) : (
          <nav style={{display:"flex",alignItems:"center",gap:2,flexWrap:"wrap",rowGap:4}}>
            {primaryItems.map(({s,l})=>(
              <button key={s} onClick={()=>goToScreen(s)}
                style={{background:screen===s?"#F5F3FF":"none",border:"none",color:screen===s?"#7C5CFC":"#6B6375",padding:"6px 14px",borderRadius:6,fontSize:13,fontWeight:screen===s?600:400,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",display:"flex",alignItems:"center",gap:5}}>
                {l}
              </button>
            ))}
            <NavModulesMenu items={moduleItems} activeScreen={screen} goToScreen={goToScreen}/>
            <button onClick={()=>goToScreen(SCREENS.SEARCH)} aria-label="Search" title="Search"
              style={{background:screen===SCREENS.SEARCH?"#F5F3FF":"none",border:"none",color:screen===SCREENS.SEARCH?"#7C5CFC":"#6B6375",padding:"6px 10px",borderRadius:6,cursor:"pointer",display:"flex",alignItems:"center"}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <button onClick={()=>goToScreen(SCREENS.SETTINGS)}
              style={{background:screen===SCREENS.SETTINGS?"#F5F3FF":"none",border:"none",color:screen===SCREENS.SETTINGS?"#7C5CFC":"#6B6375",padding:"6px 14px",borderRadius:6,fontSize:13,fontWeight:screen===SCREENS.SETTINGS?600:400,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Settings</button>
          </nav>
        )}

        {/* Meeting indicator */}
        {meetingType&&(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:"#9B9098"}}>{meetingType.label}</span>
            {caseInfo?.employee&&<span style={{background:"#EDE8FF",color:"#7C5CFC",borderRadius:12,padding:"2px 10px",fontSize:11,fontWeight:600}}>{caseInfo.employee}</span>}
          </div>
        )}

        {/* Right side */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {!isMobile&&<OrgSwitcher org={org} availableOrgs={availableOrgs} switchOrg={switchOrg} onJoinAnotherOrg={onJoinAnotherOrg}/>}
          {!isMobile&&currentUser?.name&&<span style={{fontSize:12,color:"#6B6375"}}>{currentUser.name}</span>}
          <ActivityBell auditLog={auditLog}/>
          {onSignOut&&<button onClick={onSignOut} style={{background:"none",border:"1px solid #E8E0D0",color:"#9B9098",borderRadius:6,padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Sign out</button>}
        </div>
      </div>
    </header>
  );
}
