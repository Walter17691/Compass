import { useState, useRef, useEffect } from 'react';
import { usePopoverPosition } from '../hooks/usePopoverPosition';
import { FONT, COLOR, RADIUS } from '../styles/tokens';

const PlusIcon = ({size=14, style}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={style}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;

// IA & User Journey pass, §7 — one universal Create control, replacing
// the New case / New meeting / New task / Raise a concern / Save email
// buttons that used to live scattered one-per-screen. Every action here
// calls a handler App.jsx already had (see the createMenuProps built at
// the <AppSidebar> call site) — this component only decides what's
// offered and how it's grouped, never what happens when clicked.
//
// When mounted while the user is inside a case (isInCase), a "This case"
// group appears first with case-scoped actions (Start meeting / Add
// evidence / Add task) ahead of the global ones — the same contextual-
// creation idea the brief asks for (§7), without a second, separate "+"
// control competing with this one inside the case workspace itself.
export function CreateMenu({ onNewCase, onNewMeeting, onRaiseConcern, onNewTask, onAddEmail, isInCase, activeCaseName, onAddEvidence, onAddCaseTask, onStartCaseMeeting, onAfterAction, compact=false }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popoverStyle = usePopoverPosition(btnRef, show, { minHeight: 280 });

  useEffect(() => {
    if (!show) return;
    // Phase C keyboard defect fix — Escape used to only call setShow(false);
    // if focus had moved into the popover (e.g. onto "New case"), closing it
    // removed the focused element from the DOM with nothing to receive
    // focus, so it fell back to document.body. That's invisible in a
    // static sidebar, but the rail's :focus-within-driven collapse made it
    // visible: losing focus collapsed the rail out from under the user.
    // Returning focus to the trigger on Escape is keyboard-only — outside
    // mousedown closes the same way it always did, with no forced focus.
    const onKeyDown = e => { if (e.key === "Escape") { setShow(false); btnRef.current?.focus(); } };
    const onClickOutside = e => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onClickOutside); };
  }, [show]);

  const run = (fn) => { fn?.(); setShow(false); onAfterAction?.(); };

  const globalItems = [
    { l:"New case", fn:onNewCase },
    { l:"Start a meeting", fn:onNewMeeting },
    { l:"Raise a concern", fn:onRaiseConcern },
    { l:"New task", fn:onNewTask },
    { l:"Add email to a case", fn:onAddEmail },
  ];
  const caseItems = [
    { l:"Start meeting for this case", fn:onStartCaseMeeting },
    { l:"Add evidence", fn:onAddEvidence },
    { l:"Add task", fn:onAddCaseTask },
  ];

  return (
    // Expanded rail composition pass — this wrapper had no explicit
    // width, so as a shrink-wrapped flex child containing a width:100%
    // button (compact's own .rail-row toggle), the browser resolved its
    // width from the button's own min/max-content rather than the
    // sidebar's actual open content width — the root cause of Create
    // measuring ~90px instead of matching every other row on the shared
    // grid. Fixed via .rail-row-wrap (defined in AppSidebar.jsx's own
    // <style> block, since compact only ever renders inside the rail):
    // 48px at rest — the same width the shrink-wrapped div used to
    // resolve to by coincidence, which is what let the utility cluster's
    // alignItems:"center" land it on the shared x=36 rest axis; a plain
    // unconditional width:100% here broke exactly that. 100% on open,
    // same toggle every other row already uses. Scoped to compact only;
    // every other CreateMenu call site (mobile sheet, elsewhere in the
    // app) is untouched.
    <div style={{position:"relative"}} className={compact?"rail-row-wrap":undefined} ref={ref}>
      {/* Home UX Polish pass, §8 — was a solid-filled purple button, the
          same visual weight as a primary "Submit"-style CTA; that read as
          more dominant than a persistent, always-visible utility should
          be. A tinted/outlined treatment (same purple-on-tint pattern
          the sidebar's own active nav state and Ask Compass's nav item
          already use) keeps it clearly discoverable without competing
          with the actual content of the page for attention. */}
      {/* Phase C (expanding sidebar rail) — `compact` only ever changes
          this trigger's own alignment/label-wrapping, never its handlers,
          items, or popover. Default false everywhere except the new
          desktop rail call site, so the existing sidebar-224px and
          mobile-sheet triggers render byte-for-byte as before. Centered
          text would overflow/misalign at the rail's 72px resting width
          (justifyContent:"center" tries to center content wider than the
          box); flex-start keeps the icon pinned to the fixed left edge
          regardless of width, with the label simply clipped by the
          rail's own overflow:hidden until it opens — see AppSidebar.jsx's
          .rail-label rule, which this button's label participates in via
          plain CSS descendant matching, not a prop threaded from here.
          Phase C closed-rail alignment correction — `compact` also wraps
          the icon in the same 48×48 centred box every other rail row
          uses (via the shared .rail-row class, applied only when
          compact), and bumps the icon from 13px to 20px to match. The
          default (mobile-sheet) rendering is completely untouched.
          Phase C closed-rail geometry polish — this trigger always has a
          1px border, so `minHeight:48` let the icon box's own fixed
          height force it to 50px tall (see AppSidebar.jsx's RAIL_HIT
          comment for the full explanation); a firm `height:48` plus the
          icon box filling `height:"100%"` instead of a fixed 48 fixes it
          the same way as every other rail row. */}
      <button ref={btnRef} onClick={()=>setShow(v=>!v)} aria-expanded={show} aria-haspopup="true"
        className={compact?"rail-row":undefined}
        style={{display:"flex",alignItems:"center",justifyContent:compact?"flex-start":"center",gap:compact?0:6,width:compact?undefined:"100%",background:COLOR.purpleTint,border:`1px solid ${COLOR.purple}33`,color:COLOR.purpleDeep,padding:compact?0:"8px 14px",height:compact?48:undefined,borderRadius:RADIUS.surface,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap"}}>
        {compact
          ? <span style={{width:48,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><PlusIcon size={20} style={{flexShrink:0}}/></span>
          : <PlusIcon size={13} style={{flexShrink:0}}/>}
        <span className={compact?"rail-label":undefined}>{compact?"":" "}Create</span>
      </button>
      {show&&popoverStyle&&(
        <div role="menu" aria-label="Create" style={{...popoverStyle,width:240,maxWidth:"calc(100vw - 24px)",background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:250,padding:"8px"}}>
          {isInCase&&(
            <div style={{marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.06em",textTransform:"uppercase",padding:"4px 8px"}}>
                {activeCaseName ? `In ${activeCaseName}'s case` : "In this case"}
              </div>
              {caseItems.map(item=>(
                <button key={item.l} onClick={()=>run(item.fn)}
                  style={{display:"flex",width:"100%",textAlign:"left",background:"none",border:"none",color:COLOR.ink,padding:"8px 8px",borderRadius:RADIUS.surface,fontSize:13,cursor:"pointer",fontFamily:FONT.sans}}>
                  {item.l}
                </button>
              ))}
              <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,margin:"6px 0"}}/>
            </div>
          )}
          {globalItems.map(item=>(
            <button key={item.l} onClick={()=>run(item.fn)}
              style={{display:"flex",width:"100%",textAlign:"left",background:"none",border:"none",color:COLOR.ink,padding:"8px 8px",borderRadius:RADIUS.surface,fontSize:13,cursor:"pointer",fontFamily:FONT.sans}}>
              {item.l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
