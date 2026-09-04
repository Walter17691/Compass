import { useState, useRef, useEffect } from 'react';
import { SCREENS } from '../constants';
import { CompassLogo } from './CompassLogo';
import { ActivityBell } from './ActivityBell';
import { MenuIcon, CheckIcon, HomeIcon, CasesIcon, TasksIcon, PeopleIcon, CalendarIcon, ClipboardIcon, FlagIcon, BarChartIcon, UsersMinusIcon, HeartIcon, ShieldIcon, GearIcon } from './Icons';
import { CreateMenu } from './CreateMenu';
import { usePopoverPosition } from '../hooks/usePopoverPosition';
import { FONT, COLOR, SPACE, RADIUS } from '../styles/tokens';

// Phase C keyboard/rendering defect fix — this component previously only
// destructured {size}, so the flexShrink:0 already being passed at its
// call site below was silently dropped: with nothing preventing it, the
// SVG shrank to width:0 inside the rail's tight 72px flex row (the same
// class of bug ChevronIcon and every new nav icon avoided by already
// forwarding `style`). Now consistent with those.
const SearchIcon = ({size=15, style}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={style}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const ChevronIcon = ({size=10, expanded}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{transform:expanded?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.12s",flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>;

// Sidebar footer composition pass, Part 5 — this used to be a permanent
// small icon+popover living in the account footer, which read as one
// more system control bolted onto identity rather than a genuine error
// state. Same underlying signal (dataLoadIssues), same Retry/Dismiss
// handlers, same "never silently swallow the error" requirement — now an
// in-flow, always-fully-visible notice (no click needed to reveal the
// message) styled with the exact colour pair the app's own global toast
// already uses for an error (see App.jsx's `toast.type==="error"` block:
// #FEF0EB/#C84B2F44) rather than inventing a second error-notice
// language. Rendered above the nav list, not in the footer — it exists
// for exactly as long as the problem does and takes zero layout space
// once resolved/dismissed, never a permanent navigation-adjacent icon.
// Phase C (expanding sidebar rail) — `railCompact` (default false, so the
// mobile header's own call site renders byte-for-byte as before) hides
// the message/actions at the rail's 72px resting width behind the same
// opacity/transform .rail-label treatment every other row uses, plus a
// max-height collapse (.rail-alert-collapse) so the invisible text
// doesn't still reserve a tall, wrapped-multi-line block of dead space
// while hidden. role="alert"/aria-live="assertive" are unconditional —
// a screen reader still gets the full message immediately regardless of
// the rail's visual state; only sighted-at-rest users see the small red
// dot until they open the rail, exactly like a "Late" pill would need
// hover context here — this genuinely can't be summarised into a dot
// with a day count the way §13's Running-out concept can.
function LoadIssueNotice({ dataLoadIssues, onRetryLoad, onDismissLoadBanner, railCompact=false }) {
  const message = `Couldn't load ${dataLoadIssues.length===1?dataLoadIssues[0]:`${dataLoadIssues.length} kinds of data`} — this may be a connection problem, not that there's nothing there.`;
  const hideClass = railCompact ? "rail-label rail-alert-collapse" : undefined;
  return (
    <div role="alert" aria-live="assertive" style={{background:"#FEF0EB",border:"1px solid #C84B2F44",borderRadius:RADIUS.surface,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:COLOR.red,flexShrink:0,marginTop:4}}/>
        <span className={hideClass} style={{fontSize:12,color:COLOR.ink,lineHeight:1.4,flex:1}}>{message}</span>
      </div>
      <div className={hideClass} style={{display:"flex",gap:14,paddingLeft:15}}>
        <button onClick={onRetryLoad} style={{fontSize:12,fontWeight:600,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,padding:0}}>Retry</button>
        <button onClick={onDismissLoadBanner} aria-label="Dismiss" style={{fontSize:12,color:COLOR.inkFaint,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,padding:0}}>Dismiss</button>
      </div>
    </div>
  );
}

// Phase C (expanding sidebar rail) — active treatment changed from a
// full purpleTint row fill to the approved system: white surface + ink
// text + violet icon + a subtle border, never a solid violet block. Icon
// colour rides on the button's own `color` (currentColor) rather than a
// separate prop, so active/inactive icon colour always matches the label
// colour with no extra wiring. Icons are new (this sidebar had none
// before); label text is unchanged and still the button's real
// accessible name — the icon is aria-hidden and contributes nothing to
// it, and wrapping the label in .rail-label (opacity/transform only,
// never display:none) is what lets the rail's resting width hide it
// visually without hiding it from assistive tech.
const NavButton = ({s, l, icon:Icon, screen, goToScreen, indent}) => {
  const active = screen===s;
  return (
    <button onClick={()=>goToScreen(s)}
      onMouseEnter={e=>{if(!active) e.currentTarget.style.background=COLOR.purpleTint;}}
      onMouseLeave={e=>{if(!active) e.currentTarget.style.background="none";}}
      style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",background:active?COLOR.surface:"none",border:active?`1px solid ${COLOR.border}`:"1px solid transparent",boxShadow:active?"0 1px 2px rgba(15,18,36,0.06)":"none",color:active?COLOR.ink:COLOR.inkSoft,padding:indent?"8px 14px 8px 28px":"9px 14px",borderRadius:RADIUS.surface,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap"}}>
      {Icon&&<Icon size={16} style={{flexShrink:0}}/>}
      <span className="rail-label">{l}</span>
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
      onMouseEnter={e=>{if(!active) e.currentTarget.style.background=COLOR.purpleTint;}}
      onMouseLeave={e=>{if(!active) e.currentTarget.style.background="none";}}
      style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",background:active?COLOR.surface:"none",border:active?`1px solid ${COLOR.border}`:"1px solid transparent",boxShadow:active?"0 1px 2px rgba(15,18,36,0.06)":"none",color:active?COLOR.ink:COLOR.inkSoft,padding:"9px 14px",borderRadius:RADIUS.surface,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap"}}>
      <CompassLogo size={16}/><span className="rail-label">Ask Compass</span>
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
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",textAlign:"left",background:"none",border:"none",color:COLOR.inkFaint,padding:"8px 14px",cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap"}}>
        <span className="rail-label" style={{fontSize:12,fontWeight:700,color:COLOR.inkFaint}}>{label}</span>
        <span className="rail-label" style={{display:"inline-flex",flexShrink:0}}><ChevronIcon expanded={expanded}/></span>
      </button>
      {expanded&&(
        <div id={groupId} style={{display:"flex",flexDirection:"column",gap:1}}>
          {items.map(item=><NavButton key={item.s} {...item} screen={screen} goToScreen={goToScreen} indent/>)}
        </div>
      )}
    </div>
  );
}

// Sidebar footer redesign — a first-time HR user should be able to look
// at the bottom of the sidebar and immediately read "this is my
// account," not have to parse a row of unlabelled status icons. This
// single control now carries everything that's genuinely an account-
// identity or account-scoped action: who's signed in, which org they're
// in, switching/joining an org (previously OrgSwitcher's own standalone
// badge — absorbed here rather than kept as a second trigger), a
// shortcut into Settings, and Sign out. Organisation is deliberately
// secondary text under the name, not a separate beige badge — it reads
// as "part of who I am here," which is what it actually is, rather than
// a distinct clickable object competing for attention next to the name.
function AccountMenu({ currentUser, org, availableOrgs=[], switchOrg, onJoinAnotherOrg, onSignOut, onOpenSettings }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popoverStyle = usePopoverPosition(btnRef, show);

  useEffect(() => {
    if (!show) return;
    // Phase C keyboard defect fix — see CreateMenu.jsx's identical comment.
    // Escape now returns focus to this trigger; outside mousedown still
    // closes with no forced focus change.
    const onKeyDown = e => { if (e.key === "Escape") { setShow(false); btnRef.current?.focus(); } };
    const onClickOutside = e => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onClickOutside); };
  }, [show]);

  const initials = (currentUser?.name || "?").trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const menuItemStyle = {width:"100%",textAlign:"left",display:"flex",alignItems:"center",gap:6,background:"none",border:"none",borderRadius:RADIUS.surface,padding:"8px 10px",fontSize:13,color:COLOR.ink,cursor:"pointer",fontFamily:FONT.sans};

  return (
    <div style={{position:"relative",width:"100%"}} ref={ref}>
      {/* Sidebar footer composition pass, Part 1 — the entire row is the
          trigger (not a tiny appended control): avatar, name, org and
          chevron all sit inside one button so there's nothing to "miss."
          Hover/open feedback is a plain background swap on the row
          itself (the same direct-mutation-on-interaction technique
          HomeScreen's own Ask Compass input already uses for its focus
          border) rather than a bordered/pill treatment that would read
          as "yet another small control." */}
      <button ref={btnRef} onClick={()=>setShow(v=>!v)} aria-haspopup="true" aria-expanded={show} aria-label="Account menu"
        onMouseEnter={e=>{if(!show) e.currentTarget.style.background=COLOR.paper;}}
        onMouseLeave={e=>{if(!show) e.currentTarget.style.background="none";}}
        style={{display:"flex",alignItems:"center",gap:8,width:"100%",background:show?COLOR.paper:"none",border:"none",padding:"6px 8px",borderRadius:RADIUS.surface,cursor:"pointer",textAlign:"left"}}>
        <div style={{width:28,height:28,borderRadius:"50%",background:COLOR.purpleTint,color:COLOR.purpleDeep,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{initials}</div>
        <div className="rail-label" style={{minWidth:0,flex:1}}>
          <div title={currentUser?.name||undefined} style={{fontSize:13,fontWeight:600,color:COLOR.ink,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser?.name||"Account"}</div>
          {org?.name&&<div title={org.name} style={{fontSize:11,color:COLOR.inkFaint,lineHeight:1.3,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{org.name}</div>}
        </div>
        <svg className="rail-label" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          style={{color:COLOR.inkFaint,flexShrink:0,transform:show?"rotate(180deg)":"none",transition:"transform 0.12s"}}>
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>
      {show&&popoverStyle&&(
        <div role="menu" aria-label="Account" style={{...popoverStyle,minWidth:224,background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:250,padding:6}}>
          {availableOrgs.length>1&&(
            <>
              <div style={{padding:"6px 10px 2px",fontSize:11,fontWeight:700,color:COLOR.inkFaint}}>Organisation</div>
              {availableOrgs.map(o=>(
                <button key={o.id} onClick={()=>{switchOrg(o.id);setShow(false);}}
                  style={{...menuItemStyle,background:o.id===org.id?COLOR.purpleTint:"none",color:o.id===org.id?COLOR.purple:COLOR.ink,fontWeight:o.id===org.id?600:400}}>
                  <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.name}</span>
                  {o.id===org.id&&<CheckIcon size={11}/>}
                </button>
              ))}
              <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,margin:"4px 0"}}/>
            </>
          )}
          <button onClick={()=>{setShow(false);onJoinAnotherOrg();}} style={{...menuItemStyle,color:COLOR.inkSoft}}>+ Join another organisation</button>
          <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,margin:"4px 0"}}/>
          <button onClick={()=>{setShow(false);onOpenSettings();}} style={menuItemStyle}>Settings</button>
          {onSignOut&&<button onClick={()=>{setShow(false);onSignOut();}} style={{...menuItemStyle,color:COLOR.red}}>Sign out</button>}
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
export function AppSidebar({ screen, setScreen, isMobile, showMobileNav, setShowMobileNav, meetingType, caseInfo, org, availableOrgs, switchOrg, onJoinAnotherOrg, currentUser, auditLog, onSignOut, isHR, dataLoadIssues=[], loadBannerDismissed, onRetryLoad, onDismissLoadBanner, createMenuProps }) {
  const goToScreen = (s) => { setScreen(s); setShowMobileNav(false); };

  // Home Experience Redesign, §10 — "56 total cases" is database
  // information, not navigation information; a raw record count doesn't
  // tell a user anything actionable. Plain "Cases" now, same as every
  // other primary destination — a meaningful current-user attention
  // badge here is a separate, later decision, not something to
  // approximate with the total count in the meantime.
  const primaryItems = [
    {s:SCREENS.HOME, l:"Home", icon:HomeIcon},
    {s:SCREENS.CASES, l:"Cases", icon:CasesIcon},
  ];
  const primaryItemsAfterAsk = [
    {s:SCREENS.TASKS, l:"Tasks", icon:TasksIcon},
    {s:SCREENS.PEOPLE, l:"People", icon:PeopleIcon},
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
      {s:SCREENS.CALENDAR, l:"Calendar", icon:CalendarIcon},
      isHR ? {s:SCREENS.HR_DELEGATED_WORK, l:"Delegated Work", icon:ClipboardIcon} : {s:SCREENS.MANAGER_PORTAL, l:"My People Actions", icon:ClipboardIcon},
      {s:SCREENS.CONCERNS, l:isHR?"Concerns":"Raise a concern", icon:FlagIcon},
    ]},
    { label:"Intelligence", items: [
      {s:SCREENS.INSIGHTS, l:"Insights", icon:BarChartIcon},
    ]},
    ...(isHR ? [{ label:"HR Processes", items: [
      {s:SCREENS.REDUNDANCY, l:"Redundancy", icon:UsersMinusIcon},
      {s:SCREENS.WELLBEING, l:"Wellbeing", icon:HeartIcon},
      {s:SCREENS.DSAR, l:"DSAR", icon:ShieldIcon},
    ]}] : []),
    { label:"Organisation", items: [
      {s:SCREENS.SETTINGS, l:"Settings", icon:GearIcon},
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
      {/* Sidebar footer composition pass, Part 4 — Activity is a global
          application function (org-wide audit feed), not part of who's
          signed in, so it doesn't belong in the account row at all.
          Placed here, beside the Compass mark, it reads as "a global
          sidebar-shell control" rather than an account or navigation
          item — visually nowhere near Ask Compass (which lives further
          down the nav list, not in this header row), so there's no
          competition between the two. */}
      <div style={{display:"flex",flexDirection:"column",gap:8,padding:"4px 8px 12px"}}>
        <button onClick={()=>goToScreen(SCREENS.HOME)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",padding:"0 6px",cursor:"pointer",width:"100%"}}>
          <CompassLogo size={36}/>
          <span className="rail-label" style={{fontFamily:FONT.serif,fontSize:17,fontWeight:850,color:COLOR.ink,letterSpacing:"-0.055em"}}>Compass</span>
        </button>
        {/* Phase C (expanding sidebar rail) — Activity moved onto its own
            row directly below the tile, still left-aligned to the same
            gutter as every other row. A single header row with the tile
            on the left and Activity space-between on the right (its
            prior 224px layout) can't fit both inside the rail's 72px
            resting width without overlap; stacking keeps Activity's own
            component, handlers, and popover completely untouched — only
            where it sits changed. */}
        <div style={{padding:"0 6px"}}>
          <ActivityBell auditLog={auditLog} orgId={org?.id}/>
        </div>
      </div>

      {/* IA & User Journey pass, §7 — universal Create pattern. One
          learned control instead of the New case/New meeting/New task/
          Raise concern/Add note buttons previously scattered one-per-
          screen; every action inside still calls the exact same
          existing handler each of those buttons already called.
          `compact` (Phase C) only changes this trigger's own alignment —
          see CreateMenu.jsx. */}
      <div style={{padding:"0 6px 10px"}}>
        <CreateMenu {...createMenuProps} compact/>
      </div>

      {/* IA & User Journey pass, §13 — kept as its own visible row (not
          folded into More) since it's a distinct, universal, always-
          relevant capability, not a specialised destination — "Search =
          find something" per the brief's own conceptual split from Ask
          Compass. Same SearchScreen/runSearch this always was. */}
      <button onClick={()=>goToScreen(SCREENS.SEARCH)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",background:screen===SCREENS.SEARCH?COLOR.purpleTint:COLOR.paper,border:`1px solid ${COLOR.borderFaint}`,color:COLOR.inkFaint,padding:"8px 12px",borderRadius:RADIUS.surface,fontSize:13,fontWeight:400,cursor:"pointer",fontFamily:FONT.sans,marginBottom:10,whiteSpace:"nowrap"}}>
        <SearchIcon size={13} style={{flexShrink:0}}/> <span className="rail-label">Search</span>
      </button>

      {/* Sidebar footer composition pass, Part 5 — an in-flow notice
          only present for exactly as long as the underlying problem is,
          pushing the nav down slightly rather than living in fixed
          footer chrome. Genuinely rare (a background fetch actually
          failing), so this cost is negligible in practice. Phase C —
          railCompact keeps it in-flow (an earlier attempt at pulling it
          out via position:fixed instead made Home's own row unreachable
          underneath it — a real regression, reverted) and instead
          collapses its message/actions at rest via LoadIssueNotice's own
          rail-label/rail-alert-collapse treatment, leaving just the red
          dot visible until the rail opens. */}
      {showLoadIssue&&(
        <div style={{padding:"0 6px 10px"}}>
          <LoadIssueNotice dataLoadIssues={dataLoadIssues} onRetryLoad={onRetryLoad} onDismissLoadBanner={onDismissLoadBanner} railCompact/>
        </div>
      )}

      <nav style={{display:"flex",flexDirection:"column",gap:2,flex:1,minHeight:0,overflowY:"auto",paddingBottom:12}}>
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

      {/* Sidebar footer composition pass, Part 6 — the healthy-state
          footer now contains exactly one thing: account identity. */}
      <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,paddingTop:SPACE.sm,paddingBottom:2,flexShrink:0}}>
        <AccountMenu currentUser={currentUser} org={org} availableOrgs={availableOrgs} switchOrg={switchOrg}
          onJoinAnotherOrg={onJoinAnotherOrg} onSignOut={onSignOut} onOpenSettings={()=>goToScreen(SCREENS.SETTINGS)}/>
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
            <span style={{fontFamily:FONT.serif,fontSize:16,fontWeight:850,color:COLOR.ink,letterSpacing:"-0.055em"}}>Compass</span>
          </button>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {meetingType&&<span style={{background:COLOR.purpleTint,color:COLOR.purple,borderRadius:12,padding:"2px 10px",fontSize:11,fontWeight:600}}>{caseInfo?.employee||meetingType.label}</span>}
            <ActivityBell auditLog={auditLog} orgId={org?.id}/>
            <button onClick={()=>setShowMobileNav(v=>!v)} aria-label="Menu" style={{background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",cursor:"pointer",color:"#6B6375",display:"flex",alignItems:"center"}}><MenuIcon size={16}/></button>
          </div>
        </div>
        {showLoadIssue&&(
          <div style={{padding:"0 16px 10px"}}>
            <LoadIssueNotice dataLoadIssues={dataLoadIssues} onRetryLoad={onRetryLoad} onDismissLoadBanner={onDismissLoadBanner}/>
          </div>
        )}
        {showMobileNav&&(
          <nav style={{borderTop:"1px solid #EDE5D8",display:"flex",flexDirection:"column",padding:"6px 0",maxHeight:"70vh",overflowY:"auto"}}>
            <div style={{padding:"6px 16px 10px"}}><CreateMenu {...createMenuProps} onAfterAction={()=>setShowMobileNav(false)} /></div>
            {allNavItems.map(({s,l})=>(
              <button key={s} onClick={()=>goToScreen(s)}
                style={{background:screen===s?"#F5F3FF":"none",border:"none",color:screen===s?"#7C5CFC":"#6B6375",padding:"10px 16px",fontSize:13,fontWeight:screen===s?600:400,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",textAlign:"left"}}>
                {l}
              </button>
            ))}
            {/* Sidebar footer composition pass, §9 — reuses the exact
                same AccountMenu as desktop (org switching/Join another
                organisation/Settings/Sign out), so mobile isn't left
                with a lesser, name-plus-Sign-out-only account area. */}
            <div style={{borderTop:"1px solid #F5F1EA",marginTop:6,padding:"8px 10px 4px"}}>
              <AccountMenu currentUser={currentUser} org={org} availableOrgs={availableOrgs} switchOrg={switchOrg}
                onJoinAnotherOrg={onJoinAnotherOrg} onSignOut={onSignOut} onOpenSettings={()=>{setShowMobileNav(false);goToScreen(SCREENS.SETTINGS);}}/>
            </div>
          </nav>
        )}
      </header>
    );
  }

  // Phase C (expanding sidebar rail) — 72px resting / 248px on hover or
  // focus-within, overlaying the page rather than resizing it. The
  // in-flow spacer below is what actually reserves layout width for the
  // content column beside AppSidebar's mount point (App.jsx's own
  // flex:1 content div) — it never changes size, so main-content x never
  // moves regardless of rail state. The rail itself is position:fixed
  // (removed from normal flow entirely, so animating ITS width cannot
  // reflow anything) and sits on top of ordinary page content at z-index
  // 80 — above in-page sticky headers (z-index 10/99 elsewhere in the
  // app) but comfortably below every real popover/modal in the app
  // (CommandBarModal/Calendar dialog at 300, the smallest modals at
  // 500+, this sidebar's own Create/Account/Activity popovers at 250 —
  // all position:fixed already via usePopoverPosition, so they escape
  // this container's overflowX:hidden and continue to render above it
  // exactly as before). Hover and :focus-within share one CSS rule, so
  // a keyboard user tabbing into any rail control expands it exactly
  // like a mouse hover would (§17); because both states live on the
  // same contiguous box (icon column and label area are the same
  // element widening, not two separate regions), there is no seam for
  // the pointer to fall through while moving from the icon rail into
  // the revealed label area (§16). All transitions are wrapped in a
  // prefers-reduced-motion:no-preference query, so reduced-motion users
  // get the identical end state instantly rather than a disabled
  // feature (§19).
  return (
    <>
      <style>{`
        .app-rail{width:72px;overflowX:hidden;}
        .app-rail:hover,.app-rail:focus-within{width:248px;box-shadow:4px 0 24px rgba(15,18,36,0.10);}
        .rail-label{opacity:0;transform:translateX(-6px);display:inline-block;}
        .app-rail:hover .rail-label,.app-rail:focus-within .rail-label{opacity:1;transform:translateX(0);}
        .rail-alert-collapse{max-height:0;overflow:hidden;display:block;}
        .app-rail:hover .rail-alert-collapse,.app-rail:focus-within .rail-alert-collapse{max-height:120px;}
        @media (prefers-reduced-motion: no-preference){
          .app-rail{transition:width 220ms cubic-bezier(.2,.8,.2,1),box-shadow 220ms cubic-bezier(.2,.8,.2,1);}
          .rail-label{transition:opacity 180ms ease 40ms,transform 180ms ease 40ms;}
          .rail-alert-collapse{transition:max-height 220ms cubic-bezier(.2,.8,.2,1);}
        }
      `}</style>
      <div style={{width:72,flexShrink:0,height:"100vh"}}/>
      <aside className="app-rail" style={{position:"fixed",top:0,left:0,bottom:0,zIndex:80,background:COLOR.rail,borderRight:`1px solid ${COLOR.borderFaint}`,display:"flex",flexDirection:"column",padding:"16px 8px"}}>
        {sidebarBody}
      </aside>
    </>
  );
}
