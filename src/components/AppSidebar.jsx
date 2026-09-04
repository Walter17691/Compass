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
  // Phase C closed-rail alignment correction — at rest this used to keep
  // its full card padding/background even with the message/actions
  // already collapsed, so it read as an oversized standalone card next
  // to the now-uniform 48×48 rows around it. `rail-alert-box` (only when
  // railCompact) moves that same padding/background/border into a CSS
  // rule that only applies once the rail is open (see AppSidebar.jsx's
  // <style> block), so at rest it's exactly a 48×48 slot with a small
  // centred dot — same signal, same role/aria-live, just not a card.
  return (
    <div role="alert" aria-live="assertive" className={railCompact ? "rail-alert-box" : undefined}
      style={railCompact ? undefined : {background:"#FEF0EB",border:"1px solid #C84B2F44",borderRadius:RADIUS.surface,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
        <div className={railCompact ? "rail-alert-dot" : undefined} style={{width:7,height:7,borderRadius:"50%",background:COLOR.red,flexShrink:0,marginTop:railCompact?undefined:4}}/>
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
// Phase C closed-rail alignment correction — every row now carries its
// icon inside a fixed 48×48 box (RAIL_HIT below) instead of a bare icon
// next to a label whose own width used to be "invisible but still full-
// width" at rest (opacity:0 alone doesn't collapse layout size). Two
// changes work together to fix that: the label now also collapses to
// max-width:0 at rest (see .rail-label), and the row itself carries
// .rail-row (48px at rest, 100% once open) instead of a hardcoded
// width:"100%" — so at rest a row's true rendered width is exactly the
// 48×48 icon box, nothing wider, and the active white surface (which
// paints the button itself) can never exceed that. The parent containers
// centre each 48px-wide row via alignItems:"center" rather than manual
// margin math, which is what lines every icon up on the same x=36 axis.
// Phase C closed-rail geometry polish — the outer row previously used
// minHeight:48 with a hardcoded 48×48 icon box inside it. min-height is
// only a floor: the icon box's own fixed 48px height was a harder
// content requirement, so on any row with a border (every ordinary nav
// row, Search, Create — border-box, per index.css's global reset,
// includes the border *within* a declared size, but only when that size
// is a firm constraint the browser must respect, not a floor a child can
// grow past) the button grew to 48(content) + 2(1px border × 2) = 50px
// tall — the icon-only rows without a border (Compass tile, Account,
// which set border:"none") were never affected, which is exactly why
// only some rows measured 50 and others measured 48. Fixing it needs two
// changes together: a firm `height` (not minHeight) on the row, which
// border-box then correctly treats as inclusive of the border; and the
// icon box filling that row's real content height (`height:"100%"`)
// instead of asserting its own fixed 48, so it can never force the row
// past its declared size again. Width stays a fixed RAIL_HIT regardless
// (not 100%) so the icon never drifts from the left edge as the row
// widens on open — only its label reveals to the right of it.
const RAIL_HIT = 48;
// Phase C closed-rail geometry polish — the previous inter-cluster gap
// came from THREE different sources stacked together and never kept in
// sync (a cluster's own bottom padding + a separator's own top margin +
// the next cluster's own top padding), which is exactly why the two
// group transitions measured differently (13px vs 28px) even though
// both were "supposed" to be the same gap. Cluster containers now carry
// zero vertical padding of their own — GROUP_GAP is the single value
// that defines every major-group transition, applied as a symmetric
// margin on the separator itself and nowhere else, so there's exactly
// one place spacing between groups is ever set. Intra-group spacing
// stays the smaller, separate INTRA_GAP (each cluster's own flex gap).
// Expanded-rail composition pass — GROUP_GAP trimmed from 8 to 7 so the
// one remaining major-transition separator (utility cluster -> primary
// nav) lands its effective gap (7+1px hairline+7) at 15px, inside the
// requested 12-16px "between utility cluster and primary nav" band
// rather than just outside it at 17px.
const GROUP_GAP = 7;
const INTRA_GAP = 4;
const railIconBoxStyle = {width:RAIL_HIT, height:"100%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0};
// height:"100%" above only resolves correctly when the box's direct
// parent has a *definite* height to be a percentage of — true for every
// icon box whose parent is one of the RAIL_HIT-height buttons. The
// Activity wrapper (whose parent is the header cluster's own auto-height
// flex column, an indefinite containing block) uses .rail-activity-slot
// instead, a CSS class rather than this JS style object, since it also
// needs a rest-vs-open width toggle railIconBoxStyle doesn't provide.

// Brand v2.0 migration — RAIL_MARK_SIZE (36px, trim-box) is the frozen,
// approved CLOSED-rail mark: unchanged and untouched by this pass.
const RAIL_MARK_SIZE = 36;

// Expanded rail composition pass — the open rail previously reused this
// same 36px mark for the OPEN lockup too, computing its wordmark at
// ~39px (round(36*.78/.72)) via the exact v2.0 ratio formula. The ratio
// math was correct, but a 39px bold wordmark reads as a hero logo, not a
// navigation brand header, in a 248px-wide rail sitting directly above
// 14px nav rows. The v2.0 lockup RULES (gap = 40% of mark width, Archivo
// 850/-0.055em/sentence case) are a function of mark size, not a fixed
// px target — so the fix is a smaller mark for the open-lockup instance
// specifically, run through the exact same formulas, not a shortcut that
// breaks the relationship. The closed-rail mark (RAIL_MARK_SIZE, above)
// is a separate, untouched rendering — see .rail-rest-mark below.
const OPEN_MARK_SIZE = 22;
const OPEN_LOCKUP_GAP = Math.round(OPEN_MARK_SIZE * 0.4);
const openWordmarkStyle = {fontFamily:FONT.sans, fontSize:Math.round((OPEN_MARK_SIZE*0.78)/0.72), fontWeight:850, fontStretch:"100%", letterSpacing:"-0.055em", color:COLOR.ink, lineHeight:1};

// Same canonical lockup ratios, mobile header's own mark size (unchanged
// from before this migration — the spec doesn't give a distinct mobile
// value, only rest/open desktop ones).
const MOBILE_MARK_SIZE = 28;
const MOBILE_LOCKUP_GAP = Math.round(MOBILE_MARK_SIZE * 0.4);
const mobileWordmarkStyle = {fontFamily:FONT.sans, fontSize:Math.round((MOBILE_MARK_SIZE*0.78)/0.72), fontWeight:850, fontStretch:"100%", letterSpacing:"-0.055em", color:COLOR.ink};

const NavButton = ({s, l, icon:Icon, screen, goToScreen, indent}) => {
  const active = screen===s;
  return (
    <button onClick={()=>goToScreen(s)}
      onMouseEnter={e=>{if(!active) e.currentTarget.style.background=COLOR.purpleTint;}}
      onMouseLeave={e=>{if(!active) e.currentTarget.style.background="none";}}
      className="rail-row"
      style={{display:"flex",alignItems:"center",gap:0,textAlign:"left",background:active?COLOR.surface:"none",border:active?`1px solid ${COLOR.border}`:"1px solid transparent",boxShadow:active?"0 1px 2px rgba(15,18,36,0.06)":"none",color:active?COLOR.ink:COLOR.inkSoft,padding:indent?"0 14px 0 20px":0,borderRadius:RADIUS.surface,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap",height:indent?36:RAIL_HIT}}>
      {Icon&&(indent
        ? <Icon size={16} style={{flexShrink:0,marginRight:10}}/>
        : <span style={railIconBoxStyle}><Icon size={20} style={{flexShrink:0}}/></span>)}
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
      className="rail-row"
      style={{display:"flex",alignItems:"center",gap:0,textAlign:"left",background:active?COLOR.surface:"none",border:active?`1px solid ${COLOR.border}`:"1px solid transparent",boxShadow:active?"0 1px 2px rgba(15,18,36,0.06)":"none",color:active?COLOR.ink:COLOR.inkSoft,padding:0,borderRadius:RADIUS.surface,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap",height:RAIL_HIT}}>
      <span style={railIconBoxStyle}><CompassLogo size={20}/></span><span className="rail-label">Ask Compass</span>
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
    // Expanded rail composition pass — this div previously had no
    // explicit width, so as a non-stretching flex child of its parent's
    // alignItems:"center" wrapper, it shrank to its own content width
    // and centred as an island instead of sitting on the shared left
    // axis — the root cause of group headers reading as "floating in
    // the middle." width:"100%" alone fixes it regardless of the
    // parent's own alignItems value.
    <div style={{width:"100%"}}>
      <button onClick={onToggle} aria-expanded={expanded} aria-controls={groupId}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",textAlign:"left",background:"none",border:"none",color:COLOR.inkSoft,padding:"8px 8px 8px 0",cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap"}}>
        <span className="rail-label" style={{fontSize:13,fontWeight:600,color:COLOR.inkSoft}}>{label}</span>
        <span className="rail-label" style={{display:"inline-flex",flexShrink:0}}><ChevronIcon expanded={expanded}/></span>
      </button>
      {expanded&&(
        <div id={groupId} style={{display:"flex",flexDirection:"column",gap:4,marginTop:4}}>
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
    <div style={{position:"relative",width:"100%",display:"flex",flexDirection:"column",alignItems:"center"}} ref={ref}>
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
        className="rail-row"
        style={{display:"flex",alignItems:"center",gap:0,background:show?COLOR.paper:"none",border:"none",padding:0,borderRadius:RADIUS.surface,cursor:"pointer",textAlign:"left",height:RAIL_HIT}}>
        <span style={railIconBoxStyle}><div style={{width:28,height:28,borderRadius:"50%",background:COLOR.purpleTint,color:COLOR.purpleDeep,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{initials}</div></span>
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
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:INTRA_GAP,padding:0}}>
        {/* Expanded rail composition pass — the resting mark (36px,
            trim-box, frozen/protected) and the open-state lockup (a
            smaller 22px mark + wordmark, see OPEN_MARK_SIZE above) are
            now two separate instances toggled the same way every other
            row's icon-vs-label pair is: .rail-rest-mark collapses to
            width:0 on open (see <style> below) while this row's own
            .rail-label reveals — so at rest nothing here changed at all
            (same element, same size, same axis), and at open the small
            lockup starts flush at the row's own left edge instead of
            appearing after an invisible 48px gap. */}
        <button onClick={()=>goToScreen(SCREENS.HOME)} className="rail-row" style={{display:"flex",alignItems:"center",gap:0,background:"none",border:"none",padding:0,cursor:"pointer",height:RAIL_HIT}}>
          <span className="rail-rest-mark"><CompassLogo size={RAIL_MARK_SIZE} trimBox/></span>
          <span className="rail-label" style={{display:"inline-flex",alignItems:"baseline",gap:OPEN_LOCKUP_GAP}}>
            <CompassLogo size={OPEN_MARK_SIZE} trimBox/>
            <span style={openWordmarkStyle}>Compass</span>
          </span>
        </button>
        {/* Phase C (expanding sidebar rail) — Activity moved onto its own
            row directly below the tile, still left-aligned to the same
            gutter as every other row. A single header row with the tile
            on the left and Activity space-between on the right (its
            prior 224px layout) can't fit both inside the rail's 72px
            resting width without overlap; stacking keeps Activity's own
            component, handlers, and popover completely untouched — only
            where it sits changed. Phase C alignment correction — wrapped
            in the same 48×48 slot as every other control so its icon
            centres on the same x=36 axis; ActivityBell's own trigger
            (padding/icon size/unread badge, all separately tested) is
            untouched, only where it sits changed. Expanded rail
            composition pass — that fixed 48×48 slot previously never
            grew on open, so the cluster's own alignItems:"center" was
            centring Activity in
            the middle of the open rail instead of on the shared left
            axis. .rail-activity-slot below reuses the exact same
            rest-vs-open width toggle every other row uses, so Activity
            joins the same grid while staying visually the same small,
            quiet, cardless icon it always was — ActivityBell itself is
            still completely untouched. */}
        <span className="rail-activity-slot">
          <ActivityBell auditLog={auditLog} orgId={org?.id}/>
        </span>
      </div>

      {/* Composition pass — with the separator between header and
          utility clusters removed (separators reduced to sparing use),
          this marginTop is the only thing distinguishing "identity"
          (logo/Activity) from "utility actions" (Create/Search) as two
          related-but-distinct clusters — deliberately more than
          INTRA_GAP's 4px (same-cluster spacing) but less than the one
          remaining separator's ~15px (a genuine major transition). */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:INTRA_GAP,padding:0,marginTop:SPACE.sm}}>
        {/* IA & User Journey pass, §7 — universal Create pattern. One
            learned control instead of the New case/New meeting/New task/
            Raise concern/Add note buttons previously scattered one-per-
            screen; every action inside still calls the exact same
            existing handler each of those buttons already called.
            `compact` (Phase C) only changes this trigger's own alignment —
            see CreateMenu.jsx. */}
        <CreateMenu {...createMenuProps} compact/>

        {/* IA & User Journey pass, §13 — kept as its own visible row (not
            folded into More) since it's a distinct, universal, always-
            relevant capability, not a specialised destination — "Search =
            find something" per the brief's own conceptual split from Ask
            Compass. Same SearchScreen/runSearch this always was. */}
        <button onClick={()=>goToScreen(SCREENS.SEARCH)} className="rail-row" style={{display:"flex",alignItems:"center",gap:0,textAlign:"left",background:screen===SCREENS.SEARCH?COLOR.purpleTint:COLOR.paper,border:`1px solid ${COLOR.borderFaint}`,color:COLOR.inkFaint,padding:0,borderRadius:RADIUS.surface,fontSize:13,fontWeight:400,cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap",height:RAIL_HIT}}>
          <span style={railIconBoxStyle}><SearchIcon size={20} style={{flexShrink:0}}/></span><span className="rail-label">Search</span>
        </button>

        {/* Sidebar footer composition pass, Part 5 — an in-flow notice
            only present for exactly as long as the underlying problem is,
            pushing the nav down slightly rather than living in fixed
            footer chrome. Genuinely rare (a background fetch actually
            failing), so this cost is negligible in practice. Phase C —
            railCompact keeps it in-flow (an earlier attempt at pulling it
            out via position:fixed instead made Home's own row unreachable
            underneath it — a real regression, reverted) and collapses to
            a compact status dot at rest (see LoadIssueNotice/rail-alert-
            box), never an oversized standalone card. */}
        {showLoadIssue&&(
          <LoadIssueNotice dataLoadIssues={dataLoadIssues} onRetryLoad={onRetryLoad} onDismissLoadBanner={onDismissLoadBanner} railCompact/>
        )}
      </div>

      {/* Expanded rail composition pass — separators reduced to sparing
          use per the composition review: this is now the ONLY separator
          above the account divider (the header->utility one above was
          removed). .rail-hr gives it the same 48px-at-rest / 100%-at-open
          width toggle every row already uses, so it spans the shared
          content grid once open instead of staying a small fixed-width
          stub floating in a much wider rail. */}
      <div className="rail-hr" style={{height:1,background:COLOR.borderFaint,margin:`${GROUP_GAP}px auto`}}/>

      <nav style={{display:"flex",flexDirection:"column",alignItems:"center",gap:INTRA_GAP,flex:1,minHeight:0,overflowY:"auto",paddingBottom:12}}>
        {primaryItems.map(item=><NavButton key={item.s} {...item} screen={screen} goToScreen={goToScreen}/>)}
        <AskCompassNavButton screen={screen} goToScreen={goToScreen}/>
        {primaryItemsAfterAsk.map(item=><NavButton key={item.s} {...item} screen={screen} goToScreen={goToScreen}/>)}

        {/* Composition pass — the border here was a second separator on
            top of the one above (removed, per "use separators sparingly");
            pure marginTop now carries the primary-nav -> grouped-nav
            transition (16px, matching the requested 16-20px band) with
            nothing to draw. gap bumped 2->6 so consecutive group headers
            read as siblings in the same list, not stacked almost flush. */}
        <div style={{width:"100%",marginTop:SPACE.lg,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
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
      <header style={{background:COLOR.surface,borderBottom:`1px solid ${COLOR.borderFaint}`,position:"sticky",top:0,zIndex:99}}>
        <div style={{padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <button onClick={()=>goToScreen(SCREENS.HOME)} style={{display:"flex",alignItems:"center",gap:MOBILE_LOCKUP_GAP,background:"none",border:"none",padding:0,cursor:"pointer"}}>
            <CompassLogo size={MOBILE_MARK_SIZE} trimBox/>
            <span style={mobileWordmarkStyle}>Compass</span>
          </button>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {meetingType&&<span style={{background:COLOR.purpleTint,color:COLOR.purple,borderRadius:12,padding:"2px 10px",fontSize:11,fontWeight:600}}>{caseInfo?.employee||meetingType.label}</span>}
            <ActivityBell auditLog={auditLog} orgId={org?.id}/>
            <button onClick={()=>setShowMobileNav(v=>!v)} aria-label="Menu" style={{background:"none",border:`1px solid ${COLOR.borderStrong}`,borderRadius:6,padding:"6px 10px",cursor:"pointer",color:COLOR.inkFaint,display:"flex",alignItems:"center"}}><MenuIcon size={16}/></button>
          </div>
        </div>
        {showLoadIssue&&(
          <div style={{padding:"0 16px 10px"}}>
            <LoadIssueNotice dataLoadIssues={dataLoadIssues} onRetryLoad={onRetryLoad} onDismissLoadBanner={onDismissLoadBanner}/>
          </div>
        )}
        {showMobileNav&&(
          <nav style={{borderTop:`1px solid ${COLOR.borderFaint}`,display:"flex",flexDirection:"column",padding:"6px 0",maxHeight:"70vh",overflowY:"auto"}}>
            <div style={{padding:"6px 16px 10px"}}><CreateMenu {...createMenuProps} onAfterAction={()=>setShowMobileNav(false)} /></div>
            {allNavItems.map(({s,l})=>(
              <button key={s} onClick={()=>goToScreen(s)}
                style={{background:screen===s?COLOR.purpleTint:"none",border:"none",color:screen===s?COLOR.purple:COLOR.inkFaint,padding:"10px 16px",fontSize:13,fontWeight:screen===s?600:400,cursor:"pointer",fontFamily:FONT.sans,textAlign:"left"}}>
                {l}
              </button>
            ))}
            {/* Sidebar footer composition pass, §9 — reuses the exact
                same AccountMenu as desktop (org switching/Join another
                organisation/Settings/Sign out), so mobile isn't left
                with a lesser, name-plus-Sign-out-only account area. */}
            <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,marginTop:6,padding:"8px 10px 4px"}}>
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
        .app-rail{width:72px;padding:16px 8px;overflowX:hidden;}
        /* Expanded rail composition pass — the one shared internal grid:
           every row/cluster below is width:100% of the aside's own
           content box (either via .rail-row's rest/open toggle or a
           plain width:"100%" set directly), so this single padding bump
           is what actually establishes the "approximately 16-20px"
           internal inset requested for the open state — one change,
           inherited by every already-100%-wide element, rather than a
           per-row override scattered across the file. Left at 16px/8px
           at rest (unchanged, protects the closed-rail x=36 axis, which
           depends on the existing 8px value to centre a 48px row inside
           a 56px content width). */
        .app-rail:hover,.app-rail:focus-within{width:248px;padding:16px 16px;box-shadow:4px 0 24px rgba(15,18,36,0.10);}
        /* Phase C closed-rail alignment correction — max-width:0 (not just
           opacity:0) is what actually collapses a label's layout size at
           rest; opacity alone still reserves its full text width, which
           is exactly what was pushing icons off-centre and rows to
           inconsistent widths before. 200px comfortably fits every real
           label in this sidebar without clipping once revealed. */
        .rail-label{opacity:0;transform:translateX(-6px);display:inline-block;max-width:0;overflow:hidden;white-space:nowrap;}
        .app-rail:hover .rail-label,.app-rail:focus-within .rail-label{opacity:1;transform:translateX(0);max-width:200px;}
        /* Every ordinary row is exactly 48px (the icon box) at rest and
           the rail's full content width once open — this is what keeps
           each row's own background (including the active white surface)
           from ever exceeding 48×48 at rest, and what centres every icon
           on the same x=36 axis via the parent's alignItems:"center". */
        .rail-row{width:48px;}
        .app-rail:hover .rail-row,.app-rail:focus-within .rail-row{width:100%;}
        /* CreateMenu's compact trigger sits inside its own position:relative
           wrapper (needed for popover positioning), one level outside
           .rail-row itself — same rest/open toggle, applied to that
           wrapper instead, so Create's row matches everyone else's width
           at both rail states. See CreateMenu.jsx. */
        .rail-row-wrap{width:48px;}
        .app-rail:hover .rail-row-wrap,.app-rail:focus-within .rail-row-wrap{width:100%;}
        /* Expanded rail composition pass — the Compass row's resting
           mark: unchanged 48px icon slot at rest, collapses to width:0
           on open so the open-lockup (a .rail-label, revealed the same
           way every other row's label is) starts flush at the row's own
           left edge instead of after an invisible reserved icon column. */
        .rail-rest-mark{width:48px;height:100%;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;}
        .app-rail:hover .rail-rest-mark,.app-rail:focus-within .rail-rest-mark{width:0;}
        /* Same rest/open toggle as .rail-row, but justify-content flips
           to flex-start on open instead of relying on width:100% alone —
           Activity's own trigger is much narrower than the row, so
           without this it centres inside the open row rather than
           sitting on the shared left axis (the root cause of Activity
           reading as randomly placed in the expanded rail). */
        .rail-activity-slot{width:48px;height:48px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .app-rail:hover .rail-activity-slot,.app-rail:focus-within .rail-activity-slot{width:100%;justify-content:flex-start;}
        /* Same toggle again, for the one remaining separator — spans the
           shared content grid once open instead of staying a fixed 48px
           stub off to the side of a much wider rail. */
        .rail-hr{width:48px;}
        .app-rail:hover .rail-hr,.app-rail:focus-within .rail-hr{width:100%;}
        .rail-alert-collapse{max-height:0;overflow:hidden;display:block;}
        .app-rail:hover .rail-alert-collapse,.app-rail:focus-within .rail-alert-collapse{max-height:120px;}
        /* The load-issue notice's own chrome only applies once the rail
           is open; at rest it's a plain 48×48 slot holding just the
           small dot. Composition pass — this used to be a bordered/
           tinted card (background/border/padding) that read as an
           oversized panel next to the disciplined nav rows around it;
           it's now a plain width:100% block on the same shared grid as
           everything else, no card chrome, so it reads as a compact
           inline notice instead of competing with navigation for
           attention. The message/Retry/Dismiss content itself (and its
           own font sizes/gaps) is unchanged — see LoadIssueNotice, whose
           mobile (non-railCompact) rendering is a completely separate
           style branch untouched by this rule. */
        .rail-alert-box{width:48px;height:48px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .app-rail:hover .rail-alert-box,.app-rail:focus-within .rail-alert-box{width:100%;height:auto;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;background:none;border:none;border-radius:0;padding:0;gap:6px;}
        .rail-alert-dot{margin-top:0;}
        .app-rail:hover .rail-alert-dot,.app-rail:focus-within .rail-alert-dot{margin-top:4px;}
        @media (prefers-reduced-motion: no-preference){
          .app-rail{transition:width 220ms cubic-bezier(.2,.8,.2,1),padding 220ms cubic-bezier(.2,.8,.2,1),box-shadow 220ms cubic-bezier(.2,.8,.2,1);}
          .rail-label{transition:opacity 180ms ease 40ms,transform 180ms ease 40ms,max-width 220ms cubic-bezier(.2,.8,.2,1);}
          .rail-row{transition:width 220ms cubic-bezier(.2,.8,.2,1);}
          .rail-row-wrap{transition:width 220ms cubic-bezier(.2,.8,.2,1);}
          .rail-rest-mark{transition:width 220ms cubic-bezier(.2,.8,.2,1);}
          .rail-activity-slot{transition:width 220ms cubic-bezier(.2,.8,.2,1);}
          .rail-hr{transition:width 220ms cubic-bezier(.2,.8,.2,1);}
          .rail-alert-collapse{transition:max-height 220ms cubic-bezier(.2,.8,.2,1);}
        }
      `}</style>
      <div style={{width:72,flexShrink:0,height:"100vh"}}/>
      <aside className="app-rail" style={{position:"fixed",top:0,left:0,bottom:0,zIndex:80,background:COLOR.rail,borderRight:`1px solid ${COLOR.borderFaint}`,display:"flex",flexDirection:"column"}}>
        {sidebarBody}
      </aside>
    </>
  );
}
