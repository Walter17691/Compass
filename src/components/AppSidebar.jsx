import { useState, useRef, useEffect } from 'react';
import { SCREENS } from '../constants';
import { CompassLogo } from './CompassLogo';
import { ActivityBell } from './ActivityBell';
import { OrgSwitcher } from './OrgSwitcher';
import { MenuIcon, AskCompassIcon } from './Icons';
import { AskCompassWidget } from '../screens/AskCompassWidget';
import { CreateMenu } from './CreateMenu';
import { usePopoverPosition } from '../hooks/usePopoverPosition';
import { FONT, COLOR, SPACE, RADIUS } from '../styles/tokens';

const SearchIcon = ({size=15}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const ChevronIcon = ({size=10, expanded}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{transform:expanded?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.12s",flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>;

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

// Design System Convergence pass, Phase 1 — replaces the old full-width
// "Overdue actions" banner that used to sit above page content on every
// screen except Home/Case View, permanently occupying vertical space and
// duplicating Home's own Needs Attention section. Same dueSoon/overdue
// data (App.jsx passes the exact same array this used to filter), same
// destination on click (Home, where the full list already lives with
// real context) — now a small persistent icon in nav chrome, reusing the
// identical popover/dismiss pattern LoadIssueIndicator already
// established, rather than inventing a second notification mechanism.
function OverdueIndicator({ dueSoon, setScreen }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popoverStyle = usePopoverPosition(btnRef, show);
  const overdue = (dueSoon||[]).filter(d=>d.overdue);

  useEffect(() => {
    if (!show) return;
    const onKeyDown = e => { if (e.key === "Escape") setShow(false); };
    const onClickOutside = e => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onClickOutside); };
  }, [show]);

  if (!overdue.length) return null;
  const message = `${overdue.length} overdue action${overdue.length!==1?"s":""} across your cases.`;

  return (
    <div style={{position:"relative"}} ref={ref} role="status" aria-live="polite" aria-label={message}>
      <button ref={btnRef} onClick={()=>setShow(v=>!v)} aria-label={`Overdue actions — ${overdue.length}, click for details`} title={message}
        style={{position:"relative",background:show?COLOR.redTint:"none",border:`1px solid ${COLOR.red}66`,borderRadius:6,padding:"5px 10px",fontSize:13,cursor:"pointer",color:COLOR.red,fontFamily:FONT.sans,display:"flex",alignItems:"center",gap:5}}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3"/>
          <line x1="8" y1="4.8" x2="8" y2="8.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          <circle cx="8" cy="11" r="0.9" fill="currentColor"/>
        </svg>
        <span style={{fontSize:11,fontWeight:700}}>{overdue.length}</span>
      </button>
      {show&&popoverStyle&&(
        <div role="dialog" aria-label="Overdue actions" style={{...popoverStyle,width:300,maxWidth:"calc(100vw - 24px)",background:COLOR.surface,border:`1px solid ${COLOR.red}44`,borderRadius:RADIUS.surface,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:250,padding:"12px 14px"}}>
          <div style={{...{fontSize:11,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.06em",textTransform:"uppercase"},marginBottom:8}}>Overdue actions</div>
          <div style={{display:"flex",flexDirection:"column",gap:2,marginBottom:10}}>
            {overdue.slice(0,3).map((d,i)=>(
              <div key={i} style={{display:"flex",alignItems:"baseline",gap:6,padding:"4px 0"}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:COLOR.red,flexShrink:0}}/>
                <span style={{fontSize:12,color:COLOR.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.employeeName} — {d.label}</span>
                <span style={{fontSize:11,color:COLOR.red,flexShrink:0,marginLeft:"auto"}}>{d.daysOverdue}d</span>
              </div>
            ))}
            {overdue.length>3&&<div style={{fontSize:11,color:COLOR.inkFaint,marginTop:2}}>+{overdue.length-3} more</div>}
          </div>
          <button onClick={()=>{setScreen(SCREENS.HOME);setShow(false);}} style={{fontSize:12,fontWeight:600,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,padding:0}}>View all in Home →</button>
        </div>
      )}
    </div>
  );
}

const NavButton = ({s, l, screen, goToScreen, indent}) => {
  const active = screen===s;
  return (
    <button onClick={()=>goToScreen(s)}
      style={{display:"flex",alignItems:"center",width:"100%",textAlign:"left",background:active?COLOR.purpleTint:"none",border:"none",color:active?COLOR.purple:COLOR.inkSoft,padding:indent?"8px 14px 8px 28px":"9px 14px",borderRadius:RADIUS.surface,fontSize:indent?13:13.5,fontWeight:active?600:400,cursor:"pointer",fontFamily:FONT.sans}}>
      {l}
    </button>
  );
};

// Home Experience Redesign, §10 — a permanent purple-tinted background
// regardless of screen made Ask Compass look selected on every other
// screen too, including Home itself. Only the current destination may
// carry selected-state background treatment (same COLOR.purpleTint/
// COLOR.purple pairing every other NavButton already uses for "active"),
// so this now matches that exactly. The one thing that stays permanent —
// Ask Compass's distinctive "flagship capability" accent — is the purple
// icon colour and the semibold weight, neither of which reads as
// "currently selected."
const AskCompassNavButton = ({ screen, goToScreen }) => {
  const active = screen===SCREENS.ASK_COMPASS;
  return (
    <button onClick={()=>goToScreen(SCREENS.ASK_COMPASS)}
      style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",background:active?COLOR.purpleTint:"none",border:"none",color:active?COLOR.purple:COLOR.inkSoft,padding:"9px 14px",borderRadius:RADIUS.surface,fontSize:13.5,fontWeight:600,cursor:"pointer",fontFamily:FONT.sans}}>
      <AskCompassIcon size={14} color={COLOR.purple}/> Ask Compass
    </button>
  );
};

// Home + Sidebar Product Experience pass, Part 1 — "More" removed
// entirely. The same destinations that used to live behind it (Work/
// Intelligence/HR Processes/Organisation) are now inline collapsible
// sections in the sidebar itself: the whole heading row is clickable, a
// chevron communicates state, and no accordion card/extra container
// wraps the revealed items — they're just indented NavButtons in the
// same list. Deliberately NOT styled with the active-state background
// treatment every leaf NavButton gets, even when one of its children is
// the current destination — a category heading isn't itself a
// destination, and making it look "selected" would blur that distinction
// (the brief's own explicit requirement).
function SidebarGroup({ label, items, screen, goToScreen, expanded, onToggle }) {
  if (items.length === 0) return null;
  const groupId = `sidebar-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <button onClick={onToggle} aria-expanded={expanded} aria-controls={groupId}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",textAlign:"left",background:"none",border:"none",color:COLOR.inkFaint,padding:"8px 14px",cursor:"pointer",fontFamily:FONT.sans}}>
        <span style={{fontSize:10.5,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>{label}</span>
        <ChevronIcon expanded={expanded}/>
      </button>
      {expanded&&(
        <div id={groupId} style={{display:"flex",flexDirection:"column",gap:1}}>
          {items.map(item=><NavButton key={item.s} {...item} screen={screen} goToScreen={goToScreen} indent/>)}
        </div>
      )}
    </div>
  );
}

// Left sidebar — the single shell mounted above every screen, replacing
// AppHeader.jsx's top nav bar (kept as one mount point for the same
// reason AppHeader was unified in the first place: nothing left to drift
// out of sync between screens).
//
// IA & User Journey pass — radically reduced from 8-9 permanent
// destinations (plus a collapsible HR Processes group and a separate
// Utilities row) to the five the brief names as genuinely frequent
// (Home/Cases/Ask Compass/Tasks/People), everything else regrouped
// behind one "More" secondary destination. No route, permission gate, or
// handler changed anywhere in this file — every item below still points
// at the exact same screen/component it always did; only which control
// reaches it, and how much permanent visual weight it gets, changed.
// onOpenCommandBar is still accepted (App.jsx still passes it) but no
// longer rendered here — IA & User Journey pass, §6/§31 removed the
// labeled "Command Bar" row from visible navigation since a normal HR
// user had no reason to understand what it was for. The ⌘K shortcut that
// opens it is wired independently at the App.jsx document-keydown level
// (see the `metaKey||ctrlKey` handler there) and needs nothing from this
// component to keep working.
export function AppSidebar({ screen, setScreen, isMobile, showMobileNav, setShowMobileNav, meetingType, caseInfo, org, availableOrgs, switchOrg, onJoinAnotherOrg, currentUser, auditLog, onSignOut, isHR, dataLoadIssues=[], loadBannerDismissed, onRetryLoad, onDismissLoadBanner, dueSoon=[], askCompassProps, createMenuProps }) {
  const goToScreen = (s) => { setScreen(s); setShowMobileNav(false); };

  // Home Experience Redesign, §10 — "56 total cases" is database
  // information, not navigation information; a raw record count doesn't
  // tell a user anything actionable. Plain "Cases" now, same as every
  // other primary destination — a meaningful current-user attention
  // badge here is a separate, later decision, not something to
  // approximate with the total count in the meantime.
  const primaryItems = [
    {s:SCREENS.HOME, l:"Home"},
    {s:SCREENS.CASES, l:"Cases"},
  ];
  const primaryItemsAfterAsk = [
    {s:SCREENS.TASKS, l:"Tasks"},
    {s:SCREENS.PEOPLE, l:"People"},
  ];

  // Home + Sidebar Product Experience pass, Part 1 — same semantic
  // groupings the old "More" popover used, now rendered as inline
  // collapsible sections instead of behind a second click. Work = other
  // frequent-but-not-daily destinations; Intelligence = Insights (Reports
  // already lives inside Insights as one of its own tabs, so it needs no
  // separate entry here); HR Processes = the three genuine confidential/
  // statutory processes (Save email to case was never a process — it's
  // an action, reachable from the Create menu instead); Organisation =
  // admin/config, gated to isHR exactly like Settings' own Billing/Team &
  // access/Organisation sections already are internally. Every
  // permission gate below is byte-for-byte the same as before — only the
  // container (inline sections vs. a popover) changed. `.filter(g=>
  // g.items.length>0)` is what satisfies "groups with zero accessible
  // destinations should not appear" — HR Processes simply never gets
  // built for a non-HR user, same as before.
  const sidebarGroups = [
    { label:"Work", items: [
      {s:SCREENS.CALENDAR, l:"Calendar"},
      isHR ? {s:SCREENS.HR_DELEGATED_WORK, l:"Delegated Work"} : {s:SCREENS.MANAGER_PORTAL, l:"My People Actions"},
      {s:SCREENS.CONCERNS, l:isHR?"Concerns":"Raise a concern"},
    ]},
    { label:"Intelligence", items: [
      {s:SCREENS.INSIGHTS, l:"Insights"},
    ]},
    ...(isHR ? [{ label:"HR Processes", items: [
      {s:SCREENS.REDUNDANCY, l:"Redundancy"},
      {s:SCREENS.WELLBEING, l:"Wellbeing"},
      {s:SCREENS.DSAR, l:"DSAR"},
    ]}] : []),
    { label:"Organisation", items: [
      {s:SCREENS.SETTINGS, l:"Settings"},
    ]},
  ].filter(g=>g.items.length>0);
  const groupLabelForScreen = (s) => sidebarGroups.find(g=>g.items.some(i=>i.s===s))?.label;

  // Which groups are currently expanded. Initialises to just whichever
  // group owns the current destination (everything else starts
  // collapsed, per the brief); persists across navigation for as long as
  // this component stays mounted, which is the whole session — AppSidebar
  // is mounted once at the App.jsx root and never remounts between
  // screens, so this needs no extra persistence mechanism to survive
  // "during navigation." The effect below additionally expands (never
  // collapses) the owning group whenever the active screen changes, so
  // navigating into a still-collapsed group's destination (e.g. via a
  // deep link, not this component's own click) still reveals it.
  const [expandedGroups, setExpandedGroups] = useState(() => {
    const owner = groupLabelForScreen(screen);
    return owner ? new Set([owner]) : new Set();
  });
  useEffect(() => {
    const owner = groupLabelForScreen(screen);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time, prop-driven sync on a genuine external value change (the active screen changing via any route, not just this component's own clicks), same shape as CaseViewScreen.jsx's own initialTab effect and this file's pre-existing changesBannerDismissed-style patterns elsewhere in the app.
    if (owner) setExpandedGroups(prev => prev.has(owner) ? prev : new Set(prev).add(owner));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);
  const toggleGroup = (label) => setExpandedGroups(prev => {
    const next = new Set(prev);
    next.has(label) ? next.delete(label) : next.add(label);
    return next;
  });

  const moreItemsFlat = sidebarGroups.flatMap(g=>g.items);
  const allNavItems = [...primaryItems, {s:SCREENS.ASK_COMPASS,l:"Ask Compass"}, ...primaryItemsAfterAsk, ...moreItemsFlat, {s:SCREENS.SEARCH, l:"Search"}];

  // Phase 6.5 hardening (production regression suite) — a failed
  // org-data fetch previously left every affected screen showing its
  // normal "No X yet" empty state, with zero visible signal that
  // anything had gone wrong. Deliberately not auto-dismissing like a
  // toast — a data-load failure needs the user to actually do something
  // (retry), not just be transiently informed.
  const showLoadIssue = dataLoadIssues.length>0 && !loadBannerDismissed;

  const sidebarBody = (
    <>
      <button onClick={()=>goToScreen(SCREENS.HOME)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",padding:"4px 14px 12px",cursor:"pointer",width:"100%"}}>
        <CompassLogo size={30}/>
        <span style={{fontFamily:FONT.serif,fontSize:17,color:COLOR.ink,letterSpacing:"-0.2px"}}>Compass</span>
      </button>

      {/* IA & User Journey pass, §7 — universal Create pattern. One
          learned control instead of the New case/New meeting/New task/
          Raise concern/Add note buttons previously scattered one-per-
          screen; every action inside still calls the exact same
          existing handler each of those buttons already called. */}
      <div style={{padding:"0 6px 10px"}}>
        <CreateMenu {...createMenuProps} />
      </div>

      {/* IA & User Journey pass, §13 — kept as its own visible row (not
          folded into More) since it's a distinct, universal, always-
          relevant capability, not a specialised destination — "Search =
          find something" per the brief's own conceptual split from Ask
          Compass. Same SearchScreen/runSearch this always was. */}
      <button onClick={()=>goToScreen(SCREENS.SEARCH)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",background:screen===SCREENS.SEARCH?COLOR.purpleTint:COLOR.paper,border:`1px solid ${COLOR.borderFaint}`,color:COLOR.inkFaint,padding:"8px 12px",borderRadius:RADIUS.surface,fontSize:13,fontWeight:400,cursor:"pointer",fontFamily:FONT.sans,marginBottom:10}}>
        <SearchIcon size={13}/> Search
      </button>

      <nav style={{display:"flex",flexDirection:"column",gap:2,flex:1,overflowY:"auto",paddingBottom:12}}>
        {primaryItems.map(item=><NavButton key={item.s} {...item} screen={screen} goToScreen={goToScreen}/>)}
        <AskCompassNavButton screen={screen} goToScreen={goToScreen}/>
        {primaryItemsAfterAsk.map(item=><NavButton key={item.s} {...item} screen={screen} goToScreen={goToScreen}/>)}

        <div style={{marginTop:SPACE.sm,paddingTop:SPACE.sm,borderTop:`1px solid ${COLOR.borderFaint}`,display:"flex",flexDirection:"column",gap:2}}>
          {sidebarGroups.map(g=>(
            <SidebarGroup key={g.label} label={g.label} items={g.items} screen={screen} goToScreen={goToScreen}
              expanded={expandedGroups.has(g.label)} onToggle={()=>toggleGroup(g.label)}/>
          ))}
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
            <OverdueIndicator dueSoon={dueSoon} setScreen={setScreen}/>
            {askCompassProps&&<AskCompassWidget {...askCompassProps}/>}
            <ActivityBell auditLog={auditLog} orgId={org?.id}/>
            {onSignOut&&<button onClick={onSignOut} title="Sign out" style={{background:"none",border:`1px solid ${COLOR.border}`,color:COLOR.inkFaint,borderRadius:RADIUS.surface,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:FONT.sans}}>Sign out</button>}
          </div>
        </div>
      </div>
    </>
  );

  if (isMobile) {
    // IA & User Journey pass, §21 — same reduced primary set, same
    // grouped More content, just rendered as one flat list on the
    // existing mobile hamburger sheet rather than the desktop's
    // separate nav-row + popover split. Deliberately not a new bottom
    // tab bar in this pass (§21: "do not build a completely separate
    // mobile information architecture") — the same five-destination
    // model is what a future bottom nav would read from directly.
    return (
      <header style={{background:"#FFFFFF",borderBottom:"1px solid #EDE5D8",position:"sticky",top:0,zIndex:99}}>
        <div style={{padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <button onClick={()=>goToScreen(SCREENS.HOME)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",padding:0,cursor:"pointer"}}>
            <CompassLogo size={28}/>
            <span style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:16,color:"#1A1535"}}>Compass</span>
          </button>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {meetingType&&<span style={{background:"#EDE8FF",color:"#7C5CFC",borderRadius:12,padding:"2px 10px",fontSize:11,fontWeight:600}}>{caseInfo?.employee||meetingType.label}</span>}
            {showLoadIssue&&<LoadIssueIndicator dataLoadIssues={dataLoadIssues} onRetryLoad={onRetryLoad} onDismissLoadBanner={onDismissLoadBanner}/>}
            <OverdueIndicator dueSoon={dueSoon} setScreen={setScreen}/>
            {askCompassProps&&<AskCompassWidget {...askCompassProps}/>}
            <ActivityBell auditLog={auditLog} orgId={org?.id}/>
            <button onClick={()=>setShowMobileNav(v=>!v)} aria-label="Menu" style={{background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",cursor:"pointer",color:"#6B6375",display:"flex",alignItems:"center"}}><MenuIcon size={16}/></button>
          </div>
        </div>
        {showMobileNav&&(
          <nav style={{borderTop:"1px solid #EDE5D8",display:"flex",flexDirection:"column",padding:"6px 0",maxHeight:"70vh",overflowY:"auto"}}>
            <div style={{padding:"6px 16px 10px"}}><CreateMenu {...createMenuProps} onAfterAction={()=>setShowMobileNav(false)} /></div>
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
