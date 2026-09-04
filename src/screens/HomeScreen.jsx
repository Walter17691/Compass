import { useState, useMemo } from 'react';
import { SCREENS } from '../constants';
import { buildForYouFeed, humanizeDeadlineTitle } from '../lib/homeFeed';
import { CompassLogo } from '../components/CompassLogo';
import { Card } from '../components/Primitives';
import { FONT, COLOR, SPACE, RADIUS, TYPE, CONTENT_MAX_WIDTH } from '../styles/tokens';

// Home Experience Redesign — up to 3 static interaction shortcuts, not
// AI-generated suggestions. Clicking one submits that exact question
// through the same onAskCompass flow as typing it and pressing Enter.
const STARTER_PROMPTS = ["What needs my attention?", "Summarise my open cases", "What's overdue?"];

// Home Experience Redesign — a busy real org can genuinely have dozens of
// pending approvals/overdue items; the feed is already correctly
// prioritised (see lib/homeFeed.js), but showing all of them at once
// would turn "here's what matters right now" straight back into an
// endless queue. Same progressive-disclosure shape the old Needs
// Attention section already used: a capped initial view, everything else
// one click away via "View all," never actually hidden.
const INITIAL_FEED_ROWS = 5;

// Phase B (Home / Today experience) — a terse urgency pill replaces the
// old "Action needed"/"Deadline"/"Approval" category eyebrow. Every input
// here is a fact the feed item already carries (urgent, type, the
// daysLeft/daysOverdue lib/homeFeed.js now also passes through alongside
// its own humanised `timing` string) — no new date maths, no new
// severity classification invented for this. "Now" covers rows with no
// attached future date (a pending approval or an available next-step
// action is, by definition, work waiting today, not a countdown).
// "Tomorrow" reuses the exact daysLeft===1 breakpoint lib/deadlines.js
// already treats as its own bucket (see groupDueSoon's today/tomorrow/
// later split) rather than inventing a new one.
function urgencyPill(item) {
  if (item.urgent) return { label: "Late", bg: COLOR.redTint, fg: COLOR.red };
  if (item.type === "DEADLINE" && typeof item.daysLeft === "number") {
    if (item.daysLeft === 1) return { label: "Tomorrow", bg: COLOR.amberTint, fg: COLOR.amber };
    return { label: `${item.daysLeft} days`, bg: COLOR.neutralChipBg, fg: COLOR.neutralChipText };
  }
  if (item.type === "FOLLOW_UP") return { label: "Quiet", bg: COLOR.neutralChipBg, fg: COLOR.neutralChipText };
  return { label: "Now", bg: COLOR.purpleTint, fg: COLOR.purple };
}

// Home Experience Redesign — this is the redesign of Home's COMPOSITION,
// not its data. Every number/decision below is sourced from getNextStep,
// dueSoon, hrReviewRequests + requiresApproval, caseSignals, and the
// existing case records — see src/lib/homeFeed.js for the deterministic,
// separately-unit-tested prioritisation logic. Nothing here calls AI or
// invents a new legal/statutory calculation; this file only decides how
// those existing facts are laid out and which one earns the user's
// attention first.
export function HomeScreen({ cases, getCaseStage, currentUser, getNextStep, setScreen, setShowCasePrompt, dueSoon, setActiveCaseId, setActiveCaseStage, concernReferrals=[], isHR, hrReviewRequests=[], onAskCompass }) {
  const [askInput, setAskInput] = useState("");
  const submitAsk = (overrideQuestion) => {
    const question = (overrideQuestion ?? askInput).trim();
    if(!question) return;
    setAskInput("");
    onAskCompass?.(question);
  };

  const activeCaseCount = cases.filter(cs=>getCaseStage(cs)!=="closed").length;
  const isQuietHome = activeCaseCount===0;
  const [showAllFeed, setShowAllFeed] = useState(false);

  // §5 prioritisation — reuses getNextStep/dueSoon/hrReviewRequests/
  // requiresApproval exactly as they already existed; see lib/homeFeed.js.
  const feed = useMemo(() => buildForYouFeed({
    cases, getCaseStage, getNextStep, dueSoon, concernReferrals, hrReviewRequests, isHR,
  }), [cases, getCaseStage, getNextStep, dueSoon, concernReferrals, hrReviewRequests, isHR]);
  const urgentCount = feed.filter(f=>f.urgent).length;

  // §A/§K — one quiet line under the greeting: today's date, then the
  // same real feed count/urgency facts already computed above (no new
  // calculation), in one sentence rather than a separate date line plus
  // a separate status line. A brand-new org with zero matters gets its
  // own distinct copy (§K) rather than a reused, not-yet-true "caught up".
  const dateLabel = new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  const contextSentence = isQuietHome
    ? "Nothing needs you yet · Compass starts counting from the first matter you log."
    : `${dateLabel} · ${
        feed.length===0
          ? "You're all caught up."
          : `${feed.length} thing${feed.length!==1?"s":""} need${feed.length===1?"s":""} you today${
              urgentCount>0 ? ` · ${urgentCount===1?"one is":`${urgentCount} are`} already late` : ""
            }`
      }`;

  const goToFeedItem = (item) => {
    if(item.caseId) { setActiveCaseId(item.caseId); setActiveCaseStage("investigation"); setScreen(SCREENS.CASE_VIEW); return; }
    if(item.screen==="dsar") setScreen(SCREENS.DSAR);
    else if(item.screen==="wellbeing") setScreen(SCREENS.WELLBEING);
    else if(item.screen==="redundancy") setScreen(SCREENS.REDUNDANCY);
    else if(item.screen==="concerns") setScreen(SCREENS.CONCERNS);
  };

  // §9 Today — the relevant subset only (today's meetings + today's
  // deadlines), never the full calendar/task list. daysLeft===0 items are
  // deliberately excluded from the For You feed above so they only ever
  // appear here, once.
  const todayMeetings = useMemo(() => {
    const today = new Date();
    return cases.flatMap(cs=>(cs.meetings||[]).map(m=>({...m,employeeName:cs.employeeName,caseId:cs.id})))
      .filter(m=>{
        if(!m.date) return false;
        const parts=m.date.split("/");
        if(parts.length!==3) return false;
        const md=new Date(parts[2],parts[1]-1,parts[0]);
        return md.toDateString()===today.toDateString();
      });
  }, [cases]);
  const todayDeadlines = dueSoon.filter(d=>!d.overdue && d.daysLeft===0);

  // §5 This week — one extremely compact line beneath Today, not another
  // dashboard component. Same 7-day horizon idea as the feed's own
  // "upcoming" tier, counted independently since a deadline due today
  // isn't itself "this week" in the sense meant here (it's already shown
  // above, in Today).
  const weekMeetings = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate()+7);
    return cases.flatMap(cs=>cs.meetings||[]).filter(m=>{
      if(!m.date) return false;
      const parts=m.date.split("/");
      if(parts.length!==3) return false;
      const md=new Date(parts[2],parts[1]-1,parts[0]);
      return md>=today && md<weekEnd;
    }).length;
  }, [cases]);
  const weekDeadlines = dueSoon.filter(d=>!d.overdue && d.daysLeft>=0 && d.daysLeft<=7).length;
  const hasWeekSummary = weekMeetings>0 || weekDeadlines>0;
  const hasToday = todayMeetings.length>0 || todayDeadlines.length>0 || hasWeekSummary;

  const askBox = (
    <div style={{marginBottom:SPACE.xxl}}>
      <div style={{display:"flex",alignItems:"center",gap:12,width:"100%",background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"16px 20px",transition:"border-color 0.15s"}}
        onFocus={e=>e.currentTarget.style.borderColor=COLOR.purple} onBlur={e=>e.currentTarget.style.borderColor=COLOR.border}>
        <CompassLogo size={22}/>
        <input aria-label="Ask Compass" value={askInput} onChange={e=>setAskInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();submitAsk();}}}
          placeholder="Ask Compass about your people, cases or HR work…"
          style={{flex:1,fontSize:15,border:"none",background:"none",color:COLOR.ink,outline:"none",fontFamily:FONT.sans,minWidth:0}}/>
        {askInput.trim() && (
          <button onClick={()=>submitAsk()} style={{flexShrink:0,fontSize:12,fontWeight:600,color:"#fff",background:COLOR.purpleDeep,border:"none",borderRadius:RADIUS.surface,padding:"7px 16px",cursor:"pointer",fontFamily:FONT.sans}}>Ask →</button>
        )}
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
        {STARTER_PROMPTS.map(p=>(
          <button key={p} onClick={()=>submitAsk(p)} style={{fontSize:12,color:COLOR.inkFaint,background:"none",border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.pill,padding:"5px 12px",cursor:"pointer",fontFamily:FONT.sans}}>{p}</button>
        ))}
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:COLOR.paper,fontFamily:FONT.sans}}>
      <style>{`
        .home-v2-feed-row:hover{background:${COLOR.surface};}
        @media (max-width: 767px){ .home-masthead-mark{display:none;} }
      `}</style>

      <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"32px 32px",position:"relative"}}>

        {/* Home decorative brand-mark pass — a purely decorative backdrop,
            not a second visible logo. Reuses CompassLogo's existing
            "marketing" colour variant verbatim (no violet) and the exact
            v2.0 path geometry — nothing redrawn or approximated. The clip
            window is its own absolutely-positioned, zero-flow-height box,
            so it adds nothing to this column's layout height regardless of
            crop size — greeting/Ask Compass/feed are unaffected. The
            window itself stays pinned at top:0/right:0 (never negative) so
            its own box can never exceed the column's viewport-safe bounds;
            only the mark INSIDE it reaches toward the true corner via its
            own negative offset (an earlier version put the negative offset
            on the window itself and produced real horizontal overflow at
            1024px). .home-masthead-mark's media query hides it below
            tablet width.
            Recomposition pass — the natural bottom tip sits only ~90-115px
            above Ask Compass (that gap is fixed by the card's own page
            position), while the full mark at 600-700px is ~360-415px tall.
            That vertical budget is far smaller than the mark's height, so
            *some* horizontal slice through the mark's broad middle is
            unavoidable at the window's top edge — proved by hand from the
            mark's own vertex coordinates. What's controllable is where that
            slice falls relative to the page edges: right is pushed only as
            far as keeps the true SE tip on-page (beyond roughly -0.28*size
            the tip itself runs off the right edge), and the window is
            narrowed to roughly where the mark's own left boundary already
            reaches by mid-crop — so the window's left edge does the
            cropping instead of floating uselessly in white space, leaving
            just a narrow diagonal wedge entering near the corner rather
            than a wide flat band spanning most of the window's width. */}
        <div className="home-masthead-mark" aria-hidden="true" style={{position:"absolute",top:0,right:0,width:170,height:100,overflow:"hidden",pointerEvents:"none",userSelect:"none"}}>
          <CompassLogo variant="marketing" size={650} style={{position:"absolute",top:-375,right:-155}}/>
        </div>

        {/* §A/§2 Header — greeting + one real-data sentence, no separate
            date line (the date now lives inside that one sentence — see
            contextSentence above). No creation buttons here: creation is
            the global + Create control now (src/components/CreateMenu.jsx,
            reached from the sidebar), not a second, Home-specific one —
            Home UX Polish, §8 already deliberately toned that control down
            to a persistent utility rather than a page-dominating CTA, so
            duplicating "New matter"/"Start meeting" here would reintroduce
            the second front door that pass removed. */}
        <div style={{marginBottom:SPACE.xl}}>
          <h1 style={{...TYPE.identity,color:COLOR.ink,margin:0}}>
            {isQuietHome
              ? `Welcome${currentUser?.name?", "+currentUser.name.split(" ")[0]:""}`
              : <>Good {new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening"}{currentUser?.name?", "+currentUser.name.split(" ")[0]:""}</>}
          </h1>
          <p style={{...TYPE.metadata,color:COLOR.inkFaint,margin:"6px 0 0"}}>{contextSentence}</p>
        </div>

        {/* §3 Ask Compass — a genuine input, not a promotional banner.
            Submitting (Enter, the Ask button, or a starter prompt) hands
            off to the exact same sendGlobalChat flow the Ask Compass nav
            destination uses; nothing here re-implements the AI call. */}
        {askBox}

        {isQuietHome ? (
          // §15/§K Empty state — calm and intentional. No empty For You/
          // Recently Active/Today tables; one restrained onboarding action
          // reusing the exact existing case-creation handler. The "nothing
          // needs you yet" message already lives in the header sentence
          // above, so this block doesn't repeat it — it only offers the
          // one real, existing way to begin.
          <div style={{textAlign:"center",padding:"32px 20px"}}>
            <button onClick={()=>setShowCasePrompt(true)} style={{fontSize:13,fontWeight:600,color:"#fff",background:COLOR.purple,border:"none",borderRadius:RADIUS.surface,padding:"10px 22px",cursor:"pointer",fontFamily:FONT.sans}}>Create your first case →</button>
          </div>
        ) : (
          <div>

            {/* §C/§D/§E Needs you today — the one dominant work card, rows
                not cards. Each row states an urgency pill, who/what it
                relates to, plain-language context, and the one real
                action available. Same ordering §4 already implemented
                (lib/homeFeed.js's own rank: overdue/high-risk, then
                decisions needing you, then upcoming deadlines, then
                quiet follow-ups) — untouched here, only the row's visual
                treatment changed. "All N matters" opens the real, full
                Cases list — a genuinely different destination from "View
                all (N)" below, which only expands this same prioritised
                feed in place; the two labels are deliberately distinct
                so neither overstates what it does. */}
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:SPACE.sm}}>
                <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>Needs you today</div>
                <button onClick={()=>setScreen(SCREENS.CASES)} style={{fontSize:11,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500}}>All {activeCaseCount} matter{activeCaseCount!==1?"s":""} →</button>
              </div>
              <Card style={{padding:"6px 14px"}}>
                {feed.length===0 ? (
                  <div style={{fontSize:13,color:COLOR.inkFaint,padding:"12px 4px"}}>Nothing needs your attention right now.</div>
                ) : (()=>{
                  const visibleFeed = showAllFeed ? feed : feed.slice(0, INITIAL_FEED_ROWS);
                  const hiddenCount = feed.length - visibleFeed.length;
                  return (
                  <div>
                    {visibleFeed.map((item,i)=>{
                      const pill = urgencyPill(item);
                      return (
                      <div key={item.id} className="home-v2-feed-row" style={{display:"flex",alignItems:"center",gap:12,padding:"11px 6px",borderBottom:(i<visibleFeed.length-1||hiddenCount>0)?`1px solid ${COLOR.borderFaint}`:"none",borderRadius:RADIUS.surface}}>
                        <span style={{...TYPE.pill,display:"inline-flex",alignItems:"center",justifyContent:"center",height:24,padding:"0 9px",borderRadius:RADIUS.chip,background:pill.bg,color:pill.fg,flexShrink:0,whiteSpace:"nowrap"}}>{pill.label}</span>
                        <button onClick={()=>goToFeedItem(item)} style={{flex:1,minWidth:0,maxWidth:640,textAlign:"left",background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:FONT.sans}}>
                          <div style={{fontSize:13.5,fontWeight:600,color:COLOR.ink,lineHeight:1.35}}>{item.title}{item.risk==="HIGH"&&<span style={{color:COLOR.red}}> · High risk</span>}</div>
                          {(item.subject||item.timing)&&(
                            <div style={{fontSize:11.5,color:COLOR.inkFaint,marginTop:1}}>{item.subject}{item.subject&&item.timing?" · ":""}{item.timing}</div>
                          )}
                        </button>
                        {item.cta&&(
                          <button onClick={()=>goToFeedItem(item)} style={{flexShrink:0,fontSize:11.5,fontWeight:600,color:COLOR.purple,background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap"}}>{item.cta}</button>
                        )}
                      </div>
                      );
                    })}
                    {hiddenCount>0&&(
                      <button onClick={()=>setShowAllFeed(true)} style={{width:"100%",textAlign:"center",padding:"10px 0",background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,color:COLOR.purple,fontFamily:FONT.sans}}>View all ({feed.length}) →</button>
                    )}
                  </div>
                  );
                })()}
              </Card>
            </div>

            {/* Phase B, final simplification pass — Today is the one
                secondary section that survived the audit: unlike
                Continue Working/Your Work (removed below), it holds
                genuinely unique, time-bound information not shown
                anywhere else on Home — today's meetings/deadlines are
                deliberately excluded from the feed above (daysLeft===0
                items, §9) specifically so they'd only ever appear once,
                here. Deliberately NOT a Card: no border, no shadow, no
                background — quiet rows with hairline dividers only, so
                Needs You Today remains the one dominant surface on the
                page. No fabricated meeting times — meeting records only
                ever carry a date, never a time-of-day. */}
            {hasToday&&(
              <div style={{marginTop:SPACE.xxl}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:SPACE.sm}}>
                  <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>Today</div>
                  <button onClick={()=>setScreen(SCREENS.CALENDAR)} style={{fontSize:11,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500}}>View calendar →</button>
                </div>
                {(todayMeetings.length>0||todayDeadlines.length>0)&&(
                  <div>
                    {todayMeetings.map((m,i)=>(
                      <div key={"m"+i} style={{display:"flex",alignItems:"baseline",gap:10,padding:"8px 2px",borderBottom:(i<todayMeetings.length-1||todayDeadlines.length>0)?`1px solid ${COLOR.borderFaint}`:"none"}}>
                        <span style={{...TYPE.micro,color:COLOR.purple,fontWeight:700,flexShrink:0,width:52}}>Meeting</span>
                        <span style={{fontSize:13,color:COLOR.ink}}>{m.type||"Meeting"} — {m.employeeName}</span>
                      </div>
                    ))}
                    {todayDeadlines.map((d,i)=>(
                      <div key={"d"+i} style={{display:"flex",alignItems:"baseline",gap:10,padding:"8px 2px",borderBottom:i<todayDeadlines.length-1?`1px solid ${COLOR.borderFaint}`:"none"}}>
                        <span style={{...TYPE.micro,color:COLOR.amber,fontWeight:700,flexShrink:0,width:52}}>Due</span>
                        <span style={{fontSize:13,color:COLOR.ink}}>{humanizeDeadlineTitle(d)} — {d.employeeName}</span>
                      </div>
                    ))}
                  </div>
                )}
                {hasWeekSummary&&(
                  <div style={{marginTop:SPACE.xs,paddingTop:SPACE.xs,fontSize:12,color:COLOR.inkFaint}}>
                    This week: {weekDeadlines>0&&`${weekDeadlines} deadline${weekDeadlines!==1?"s":""}`}
                    {weekDeadlines>0&&weekMeetings>0&&" · "}
                    {weekMeetings>0&&`${weekMeetings} meeting${weekMeetings!==1?"s":""}`}
                  </div>
                )}
              </div>
            )}

            {/* UAT Product Hierarchy pass, Part 1 (Compass noticed) and
                Phase B final simplification pass (Continue Working / Your
                Work) — all three removed from Home. Compass noticed
                duplicated Needs You Today/case-level guardrails (caseSignals
                is untouched, still renders inside every case's own
                Overview — see OverviewTab.jsx). Continue Working was a
                recency-sorted case list that either repeated cases already
                surfaced above by urgency, or surfaced cases with no live
                next step at all — a "what was I recently doing" activity
                lens, not a "what do I need to do now" one; any case is
                still reachable via Cases' own search-by-employee (Cases
                has no recency sort, so the specific "most recently
                touched" quick-glance is a real, disclosed trade-off, not
                a false equivalence — see the Phase B report). Your Work
                was a static overdue/
                awaiting-approval/due-this-week count already restating
                exactly what the pills above it show item-by-item — a
                workload-reporting widget, not an operational one; the
                same breakdown belongs to (and remains available in)
                Insights. No calculation, handler, or navigation target
                was deleted — only this page's duplicate presentation of
                them. */}

          </div>
        )}
      </div>
    </div>
  );
}
