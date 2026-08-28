import { useState, useRef, useEffect } from 'react';
import { SCREENS } from '../constants';
import { CompassLogo } from './CompassLogo';
import { ActivityBell } from './ActivityBell';
import { OrgSwitcher } from './OrgSwitcher';
import { MenuIcon } from './Icons';
import { AskCompassWidget } from '../screens/AskCompassWidget';
import { usePopoverPosition } from '../hooks/usePopoverPosition';
import { FONT, COLOR, SPACE, RADIUS } from '../styles/tokens';

const SearchIcon = ({size=15}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;

// Home Composition Review, final refinement (item 4) — this used to be a
// permanently-expanded red card sitting in the sidebar's own in-flow
// layout (see the git history on this file for the original), which made
// it one of the most visually dominant things in the sidebar any time a
// background fetch failed — worse than the problem it was warning about.
// Same underlying signal (dataLoadIssues), same Retry/Dismiss actions,
// same "never silently swallow the error" requirement — now a small,
// permanently-visible status icon (not hidden behind a generic menu, not
// requiring the user to already suspect something's wrong) that expands
// into the full message + actions on click, reusing the exact
// popover-positioning/outside-click/Escape pattern ActivityBell and
// AskCompassWidget already use. role="status" + aria-live stays on the
// trigger itself (not just the opened popover), so a screen reader still
// gets a proactive announcement of the real message the moment it mounts
// — "restrained" only changes how much space it takes on screen, not
// whether the error is discoverable or accessible.
function LoadIssueIndicator({ dataLoadIssues, onRetryLoad, onDismissLoadBanner }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popoverStyle = usePopoverPosition(btnRef, show);
  const message = `Couldn't load ${dataLoadIssues.length===1?dataLoadIssues[0]:`${dataLoadIssues.length} kinds of data`} — this may be a connection problem, not that there's nothing there.`;

  useEffect(() => {
    if (!show) return;
    const onKeyDown = e => { if (e.key === "Escape") setShow(false); };
    const onClickOutside = e => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onClickOutside); };
  }, [show]);

  // role="status"/aria-live live on this wrapping div (a non-interactive
  // element) rather than the button itself — a screen reader still gets
  // a proactive announcement of the full message the moment this mounts,
  // without assigning a non-interactive live-region role to an
  // interactive control (jsx-a11y/no-interactive-element-to-noninteractive-role).
  return (
    <div style={{position:"relative"}} ref={ref} role="status" aria-live="polite" aria-label={message}>
      <button ref={btnRef} onClick={()=>setShow(v=>!v)} aria-label="Data load issue — click for details" title={message}
        style={{position:"relative",background:show?COLOR.redTint:"none",border:`1px solid ${COLOR.red}66`,borderRadius:6,padding:"5px 10px",fontSize:13,cursor:"pointer",color:COLOR.red,fontFamily:FONT.sans,display:"flex",alignItems:"center"}}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3"/>
          <line x1="8" y1="4.8" x2="8" y2="8.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          <circle cx="8" cy="11" r="0.9" fill="currentColor"/>
        </svg>
      </button>
      {show&&popoverStyle&&(
        <div role="dialog" aria-label="Data load issue" style={{...popoverStyle,width:280,maxWidth:"calc(100vw - 24px)",background:COLOR.surface,border:`1px solid ${COLOR.red}44`,borderRadius:RADIUS.surface,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:250,padding:"12px 14px"}}>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:COLOR.red,flexShrink:0,marginTop:4}}/>
            <span style={{fontSize:12,color:COLOR.ink,lineHeight:1.5}}>{message}</span>
          </div>
          <div style={{display:"flex",gap:12}}>
            <button onClick={onRetryLoad} style={{fontSize:12,fontWeight:600,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,padding:0}}>Retry</button>
            <button onClick={()=>{onDismissLoadBanner?.();setShow(false);}} aria-label="Dismiss" style={{fontSize:12,color:COLOR.inkFaint,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,padding:0}}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Home Composition Review, item 7 — the sidebar predates the Calm
// Intelligence tokens entirely (every value here was a raw hex/px
// literal), which is exactly why it read as visually dense and
// disconnected from the rest of the now-redesigned product: a different
// grey, a different row rhythm, a different active-state treatment than
// anything else in the app. Onto the same COLOR/SPACE scale now — same
// nav items, same routes, same gating, presentation only. `quiet` gives
// the HR Processes sub-items and the Utilities row a visibly lighter
// weight than the primary work destinations above them, without shrinking
// them so far they become hard to read or click.
const NavButton = ({s, l, indent, quiet, screen, goToScreen}) => {
  const active = screen===s;
  return (
    <button onClick={()=>goToScreen(s)}
      style={{display:"flex",alignItems:"center",width:"100%",textAlign:"left",background:active?COLOR.purpleTint:"none",border:"none",color:active?COLOR.purple:(quiet?COLOR.inkFaint:COLOR.inkSoft),padding:indent?"6px 14px 6px 28px":"8px 14px",borderRadius:RADIUS.surface,fontSize:quiet?12.5:13,fontWeight:active?600:400,cursor:"pointer",fontFamily:FONT.sans}}>
      {l}
    </button>
  );
};

// Left sidebar — the single shell mounted above every screen, replacing
// AppHeader.jsx's top nav bar (kept as one mount point for the same
// reason AppHeader was unified in the first place: nothing left to drift
// out of sync between screens). Meetings/Tasks/Documents are already
// real top-level destinations by this point (Phases 3/6), which is why
// this phase — converting the nav shell itself — was sequenced last.
export function AppSidebar({ screen, setScreen, cases, getCaseStage, isMobile, showMobileNav, setShowMobileNav, meetingType, caseInfo, org, availableOrgs, switchOrg, onJoinAnotherOrg, currentUser, auditLog, onSignOut, isHR, onOpenCommandBar, dataLoadIssues=[], loadBannerDismissed, onRetryLoad, onDismissLoadBanner, askCompassProps }) {
  // Home Composition Review, final refinement (item 3) — collapsed by
  // default now; every route/gate below is untouched, this only changes
  // the sidebar's initial visual density. The disclosure control (the
  // "HR Processes" header button + chevron) already existed and still
  // reveals Redundancy/Wellbeing/DSAR/Save email to case in one click.
  const [processesOpen, setProcessesOpen] = useState(false);
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
    // Organisational ER Intelligence (Phase 6, OP1) — one Insights
    // destination replacing the former separate Performance Insights
    // (Manager Enablement, MP20, §24, isHR-only) and Reports (open to
    // every role) rows. Not itself isHR-gated — Reports must stay as
    // widely reachable as it was before — InsightsScreen gates its own
    // Manager Insights/Risk Map/Improvement Initiatives tabs internally,
    // same as ManagerInsightsScreen was gated before this move.
    {s:SCREENS.INSIGHTS, l:"Insights"},
    {s:SCREENS.ASK_COMPASS, l:"Ask Compass"},
    {s:SCREENS.CASES, l:"Cases"+(activeCaseCount>0?" ("+activeCaseCount+")":"")},
    {s:SCREENS.TASKS, l:"Tasks"},
    {s:SCREENS.CALENDAR, l:"Calendar"},
    {s:SCREENS.PEOPLE, l:"People"},
    // The one destination every org member can reach regardless of role —
    // ConcernsScreen itself renders an intake-only view for non-HR and a
    // full triage queue for HR (concern_referrals_2026-08-12.sql's RLS
    // backs this, not just the label here).
    {s:SCREENS.CONCERNS, l:isHR?"Concerns":"Raise a concern"},
  ];
  const moduleItems = [
    // Phase 7.5C — Onboarding/Offboarding nav entries removed: outside
    // Compass's intended product scope (Employee Relations case
    // management and organisational ER intelligence). The underlying
    // starter_instances/leaver_instances tables and their RLS (Phase 6.5
    // hardening, HR-only write) are untouched — DSAR compilation still
    // reads real historical records from them.
    // Phase 6.5 hardening (closes Prompt 16 audit finding H1, HIGH) —
    // redundancy cases hold selection-criteria scores, at-risk employee
    // names and redundancy pay for people who often don't yet know
    // they're at risk. This nav item had no gate at all — every org
    // member, regardless of role, could reach it. RLS (see
    // supabase/redundancy_cases_2026-08-27.sql) is the real boundary;
    // this hides the link to match, same as Wellbeing/DSAR below.
    ...(isHR?[{s:SCREENS.REDUNDANCY, l:"Redundancy"}]:[]),
    // Wellbeing notes are confidential and RLS-restricted to HR staff (see
    // supabase/wellbeing_notes_2026-08-09.sql) — a non-HR role has no
    // database access to them, so don't even show the link.
    ...(isHR ? [{s:SCREENS.WELLBEING, l:"Wellbeing"}] : []),
    // DSAR requests are RLS-restricted to HR staff (see
    // supabase/dsar_hr_only_access_2026-08-22.sql) — same reasoning as
    // Wellbeing above.
    ...(isHR ? [{s:SCREENS.DSAR, l:"DSAR"}] : []),
    {s:SCREENS.SAVE_EMAIL, l:"Save email to case"},
  ];
  const allNavItems = [...primaryItems, ...moduleItems, {s:SCREENS.SEARCH, l:"Search"}, {s:SCREENS.SETTINGS, l:"Settings"}];

  // Phase 6.5 hardening (production regression suite) — a failed
  // org-data fetch previously left every affected screen showing its
  // normal "No X yet" empty state, with zero visible signal that
  // anything had gone wrong. Deliberately not auto-dismissing like a
  // toast — a data-load failure needs the user to actually do something
  // (retry), not just be transiently informed. See LoadIssueIndicator
  // above for how this now renders — this flag just decides whether it
  // mounts at all.
  const showLoadIssue = dataLoadIssues.length>0 && !loadBannerDismissed;

  // Home Composition Review, item 7 — four legible tiers instead of one
  // flat list: primary work destinations (unchanged size/weight, the
  // items someone opens many times a day), HR Processes as a genuinely
  // quieter secondary group (smaller label + smaller, lighter rows,
  // still one click away — nothing hidden), Utilities visually matched to
  // HR Processes' own quiet weight rather than sharing the primary
  // items' full size, and Account at the bottom unchanged (org switcher/
  // identity/sign-out already read as their own tier via the divider
  // above them). No item removed, renamed, or regated.
  const sidebarBody = (
    <>
      <button onClick={()=>goToScreen(SCREENS.HOME)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",padding:"4px 14px 16px",cursor:"pointer",width:"100%"}}>
        <CompassLogo size={30}/>
        <span style={{fontFamily:FONT.serif,fontSize:17,color:COLOR.ink,letterSpacing:"-0.2px"}}>Compass</span>
      </button>

      <nav style={{display:"flex",flexDirection:"column",gap:2,flex:1,overflowY:"auto",paddingBottom:12}}>
        {primaryItems.map(item=><NavButton key={item.s} {...item} screen={screen} goToScreen={goToScreen}/>)}

        <button onClick={()=>setProcessesOpen(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",color:COLOR.inkFaint,padding:"14px 14px 4px",fontSize:11,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",cursor:"pointer",fontFamily:FONT.sans}}>
          HR Processes
          <span style={{fontSize:10,transform:processesOpen?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.15s"}}>▾</span>
        </button>
        {processesOpen&&moduleItems.map(item=><NavButton key={item.s} {...item} indent quiet screen={screen} goToScreen={goToScreen}/>)}

        <div style={{marginTop:SPACE.md,paddingTop:SPACE.md,borderTop:`1px solid ${COLOR.borderFaint}`,display:"flex",flexDirection:"column",gap:2}}>
          <button onClick={()=>goToScreen(SCREENS.SEARCH)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",background:screen===SCREENS.SEARCH?COLOR.purpleTint:"none",border:"none",color:screen===SCREENS.SEARCH?COLOR.purple:COLOR.inkFaint,padding:"6px 14px",borderRadius:RADIUS.surface,fontSize:12.5,fontWeight:screen===SCREENS.SEARCH?600:400,cursor:"pointer",fontFamily:FONT.sans}}>
            <SearchIcon size={13}/> Search
          </button>
          {onOpenCommandBar&&(
            <button onClick={onOpenCommandBar} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",textAlign:"left",background:"none",border:"none",color:COLOR.inkFaint,padding:"6px 14px",borderRadius:RADIUS.surface,fontSize:12.5,fontWeight:400,cursor:"pointer",fontFamily:FONT.sans}}>
              <span>Command Bar</span>
              <span style={{fontSize:10,color:COLOR.inkFaint,border:`1px solid ${COLOR.border}`,borderRadius:4,padding:"1px 5px"}}>⌘K</span>
            </button>
          )}
          <NavButton s={SCREENS.SETTINGS} l="Settings" quiet screen={screen} goToScreen={goToScreen}/>
        </div>
      </nav>

      <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,paddingTop:SPACE.md,display:"flex",flexDirection:"column",gap:SPACE.sm}}>
        <div style={{padding:"0 14px"}}><OrgSwitcher org={org} availableOrgs={availableOrgs} switchOrg={switchOrg} onJoinAnotherOrg={onJoinAnotherOrg}/></div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px"}}>
          <div style={{minWidth:0}}>
            {currentUser?.name&&<div style={{fontSize:12,color:COLOR.inkSoft,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser.name}</div>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            {showLoadIssue&&<LoadIssueIndicator dataLoadIssues={dataLoadIssues} onRetryLoad={onRetryLoad} onDismissLoadBanner={onDismissLoadBanner}/>}
            {askCompassProps&&<AskCompassWidget {...askCompassProps}/>}
            <ActivityBell auditLog={auditLog} orgId={org?.id}/>
            {onSignOut&&<button onClick={onSignOut} title="Sign out" style={{background:"none",border:`1px solid ${COLOR.border}`,color:COLOR.inkFaint,borderRadius:RADIUS.surface,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:FONT.sans}}>Sign out</button>}
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
            {onOpenCommandBar&&<button onClick={onOpenCommandBar} aria-label="Command Bar" style={{background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",cursor:"pointer",color:"#6B6375",display:"flex",alignItems:"center"}}><SearchIcon size={14}/></button>}
            {showLoadIssue&&<LoadIssueIndicator dataLoadIssues={dataLoadIssues} onRetryLoad={onRetryLoad} onDismissLoadBanner={onDismissLoadBanner}/>}
            {askCompassProps&&<AskCompassWidget {...askCompassProps}/>}
            <ActivityBell auditLog={auditLog} orgId={org?.id}/>
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
    <aside style={{width:224,flexShrink:0,height:"100vh",position:"sticky",top:0,background:COLOR.surface,borderRight:`1px solid ${COLOR.borderFaint}`,display:"flex",flexDirection:"column",padding:"16px 8px"}}>
      {sidebarBody}
    </aside>
  );
}
