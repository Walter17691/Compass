import { useState, useMemo, useRef, useEffect } from 'react';
import { SCREENS } from '../constants';
import { topOpenSignalsOrgWide, signalTypeMeta } from '../lib/caseSignals';
import { computeStageBottlenecks } from '../lib/processDashboard';
import { buildForYouFeed, humanizeDeadlineTitle } from '../lib/homeFeed';
import { requiresApproval } from '../lib/approvals';
import { AskCompassIcon } from '../components/Icons';
import { FONT, COLOR, SPACE, RADIUS, TYPE, CONTENT_MAX_WIDTH } from '../styles/tokens';

// Home Experience Redesign — up to 3 static interaction shortcuts, not
// AI-generated suggestions. Clicking one submits that exact question
// through the same onAskCompass flow as typing it and pressing Enter.
const STARTER_PROMPTS = ["What needs my attention?", "Summarise my open cases", "What's overdue?"];

const TYPE_LABEL = { ACTION_NEEDED: "Action needed", DEADLINE: "Deadline", APPROVAL: "Approval", FOLLOW_UP: "Follow-up" };

// Home Micro-Polish pass — Compass Noticed's reasoning is real, AI-
// written explanation text (already generated once at signal-creation
// time, never rewritten here) that can run to several sentences. Showing
// it in full by default let one long signal dominate the whole secondary
// rail; showing none of it lost the "why" the brief's own Part 8 asked
// for. This clamps the reasoning to a 3-line preview via CSS
// line-clamp (no truncation of the underlying string — the full text is
// always in the DOM, just visually clipped) and only offers a
// More/Less toggle when the text actually overflows that preview,
// measured directly via scrollHeight vs clientHeight rather than a
// length heuristic, so short reasoning never gets a dead-end "More".
// Title and the contextual action stay their own, more prominent
// buttons/text — this component owns only the reasoning + its own
// disclosure control, never the row's navigation.
function CompassNoticedItem({ sig, cs, meta, ctaLabel, onOpenCase }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const reasoningRef = useRef(null);
  const reasoningId = `compass-noticed-reasoning-${sig.id}`;

  useEffect(() => {
    const el = reasoningRef.current;
    if (!el) return;
    setCanExpand(el.scrollHeight > el.clientHeight + 1);
  }, [sig.reasoning]);

  return (
    <div style={{display:"flex",alignItems:"flex-start",gap:8,width:"100%",fontFamily:FONT.sans}}>
      <div style={{width:5,height:5,borderRadius:"50%",background:meta.color,flexShrink:0,marginTop:6}}/>
      <div style={{minWidth:0,flex:1}}>
        <div style={{fontSize:12.5,fontWeight:600,color:COLOR.ink}}>{sig.title}</div>
        {sig.reasoning&&(
          <div ref={reasoningRef} id={reasoningId} style={{fontSize:11.5,color:COLOR.inkFaint,marginTop:2,lineHeight:1.4,...(expanded?null:{display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical",overflow:"hidden"})}}>
            {sig.reasoning}
          </div>
        )}
        <div style={{fontSize:11,color:COLOR.inkQuiet,marginTop:2}}>{cs?.employeeName||"Unknown case"}</div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:4}}>
          {cs&&(
            <button onClick={onOpenCase} style={{fontSize:11.5,fontWeight:600,color:COLOR.purple,background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:FONT.sans}}>
              {ctaLabel}
            </button>
          )}
          {canExpand&&(
            <button onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded} aria-controls={reasoningId}
              aria-label={expanded?`Show less detail — ${sig.title}`:`Show more detail — ${sig.title}`}
              style={{fontSize:11,fontWeight:600,color:COLOR.inkQuiet,background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:FONT.sans}}>
              {expanded?"Less":"More"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Home Experience Redesign — a busy real org can genuinely have dozens of
// pending approvals/overdue items; the feed is already correctly
// prioritised (see lib/homeFeed.js), but showing all of them at once
// would turn "here's what matters right now" straight back into an
// endless queue. Same progressive-disclosure shape the old Needs
// Attention section already used: a capped initial view, everything else
// one click away via "View all," never actually hidden.
const INITIAL_FEED_ROWS = 5;

// Home UX Polish pass, §3 — a restrained left-border accent instead of a
// coloured card background or an icon: urgent/overdue rows get the same
// red already used for urgency everywhere else, approvals get the same
// purple already used for the CTA colour (not a new accent), every other
// row stays neutral. Three weights, two colours, both already in use
// elsewhere in the product — nothing new introduced.
const ROW_ACCENT = (item) => item.urgent ? COLOR.red : item.type==="APPROVAL" ? COLOR.purple : "transparent";

// Home Experience Redesign — this is the redesign of Home's COMPOSITION,
// not its data. Every number/decision below is sourced from getNextStep,
// dueSoon, hrReviewRequests + requiresApproval, caseSignals, and the
// existing case records — see src/lib/homeFeed.js for the deterministic,
// separately-unit-tested prioritisation logic. Nothing here calls AI or
// invents a new legal/statutory calculation; this file only decides how
// those existing facts are laid out and which one earns the user's
// attention first.
export function HomeScreen({ cases, getCaseStage, currentUser, getNextStep, setScreen, setShowCasePrompt, dueSoon, setActiveCaseId, setActiveCaseStage, fmtDate, caseSignals=[], concernReferrals=[], isHR, hrReviewRequests=[], processTemplates=[], onAskCompass }) {
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

  // §2 — one short, real-data sentence. No vanity stats. Part 3 of the
  // Home + Sidebar pass asks for real workload context in the literal
  // shape "3 things need your attention today" rather than a padded
  // "You have..." lead-in.
  const contextSentence = isQuietHome
    ? "Employee relations case management for your organisation."
    : feed.length===0
      ? "You're all caught up."
      : urgentCount>0
        ? `${urgentCount} urgent item${urgentCount!==1?"s":""} need${urgentCount===1?"s":""} your attention today.`
        : `${feed.length} thing${feed.length!==1?"s":""} need${feed.length===1?"s":""} your attention today.`;

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

  // Home + Sidebar Product Experience pass, Part 9 — "Your work" only
  // earns its space when it can show a real breakdown (overdue / awaiting
  // approval / due this week), each independently derivable from data
  // already computed above or on this screen. A bare "N open cases"
  // count told the user nothing they could act on, so the section is
  // hidden entirely rather than shown empty when none of the three apply.
  const overdueCount = dueSoon.filter(d=>d.overdue).length;
  const awaitingApprovalCount = hrReviewRequests.filter(r=>r.status==="pending" && requiresApproval(r.step)).length;
  const hasWorkBreakdown = overdueCount>0 || awaitingApprovalCount>0 || weekDeadlines>0;

  // §7 "Compass Noticed" — identical source/logic to the previous
  // "Compass intelligence" block; presentation and location only changed.
  // Part 8 — capped at 3 (was 5): each row is now taller (title +
  // reasoning + action), so fewer, more legible rows keep the rail
  // proportionate rather than turning it into a second feed.
  const recommendations = topOpenSignalsOrgWide(caseSignals,["next_action","process_risk"],3);
  const bottlenecks = computeStageBottlenecks(cases, processTemplates);
  const hasCompassNoticed = recommendations.length>0 || bottlenecks.length>0;

  // §8 Continue working — max 4, sorted by recency, subordinate to For You.
  const RECENT_LIMIT = 4;
  const recentCases = useMemo(() => cases
    .filter(cs=>getCaseStage(cs)!=="closed")
    .sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0))
    .slice(0, RECENT_LIMIT), [cases, getCaseStage]);

  const askBox = (
    <div style={{marginBottom:SPACE.xxl}}>
      <div style={{display:"flex",alignItems:"center",gap:12,width:"100%",background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"16px 20px",transition:"border-color 0.15s"}}
        onFocus={e=>e.currentTarget.style.borderColor=COLOR.purple} onBlur={e=>e.currentTarget.style.borderColor=COLOR.border}>
        <AskCompassIcon size={18} color={COLOR.purpleDeep}/>
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
        .home-v2-grid{display:grid;grid-template-columns:1fr 320px;grid-template-areas:"foryou today" "recent secondary";column-gap:${SPACE.xxl}px;row-gap:${SPACE.xxl}px;align-items:start;}
        .home-v2-foryou{grid-area:foryou;min-width:0;}
        .home-v2-today{grid-area:today;min-width:0;}
        .home-v2-recent{grid-area:recent;min-width:0;}
        .home-v2-secondary{grid-area:secondary;min-width:0;display:flex;flex-direction:column;gap:${SPACE.xl}px;}
        .home-v2-feed-row:hover{background:${COLOR.surface};}
        @media (max-width:900px){
          .home-v2-grid{grid-template-columns:1fr;grid-template-areas:"foryou" "today" "recent" "secondary";}
        }
      `}</style>

      <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"32px 32px"}}>

        {/* §2 Header — greeting + one real-data sentence. No creation
            buttons here: creation is the global + Create control now,
            not a second, Home-specific system. */}
        <div style={{marginBottom:SPACE.xl}}>
          <div style={{...TYPE.micro,color:COLOR.inkFaint,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:SPACE.xs}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase()}</div>
          <h1 style={{...TYPE.identity,color:COLOR.ink,margin:0}}>
            Good {new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening"}{currentUser?.name?", "+currentUser.name.split(" ")[0]:""}
          </h1>
          <p style={{...TYPE.metadata,color:COLOR.inkFaint,margin:"6px 0 0"}}>{contextSentence}</p>
        </div>

        {/* §3 Ask Compass — a genuine input, not a promotional banner.
            Submitting (Enter, the Ask button, or a starter prompt) hands
            off to the exact same sendGlobalChat flow the Ask Compass nav
            destination uses; nothing here re-implements the AI call. */}
        {askBox}

        {isQuietHome ? (
          // §15 Empty state — calm and intentional. No empty For You/
          // Recently Active/Today tables; one restrained onboarding link
          // reusing the exact existing case-creation handler.
          <div style={{textAlign:"center",padding:"40px 20px"}}>
            <div style={{fontSize:15,color:COLOR.inkSoft,marginBottom:16}}>You're all caught up.</div>
            <button onClick={()=>setShowCasePrompt(true)} style={{fontSize:13,fontWeight:600,color:"#fff",background:COLOR.purple,border:"none",borderRadius:RADIUS.surface,padding:"10px 22px",cursor:"pointer",fontFamily:FONT.sans}}>Create your first case →</button>
          </div>
        ) : (
          <div className="home-v2-grid">

            {/* §4 FOR YOU — the primary surface. Each row states what
                happened, who/what it relates to, when it matters, and
                the one real action available. Red is reserved for
                urgent/overdue rows only (§6) — everything else stays
                visually neutral, distinguished by its type label. */}
            <div className="home-v2-foryou">
              <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.sm}}>For you</div>
              {feed.length===0 ? (
                <div style={{fontSize:13,color:COLOR.inkFaint,padding:"12px 0"}}>Nothing needs your attention right now.</div>
              ) : (()=>{
                const visibleFeed = showAllFeed ? feed : feed.slice(0, INITIAL_FEED_ROWS);
                const hiddenCount = feed.length - visibleFeed.length;
                return (
                <div>
                  {visibleFeed.map((item,i)=>(
                    <div key={item.id} className="home-v2-feed-row" style={{display:"flex",alignItems:"stretch",gap:10,padding:"9px 6px 9px 10px",borderBottom:(i<visibleFeed.length-1||hiddenCount>0)?`1px solid ${COLOR.borderFaint}`:"none",borderRadius:RADIUS.surface}}>
                      <div style={{width:2,flexShrink:0,borderRadius:2,background:ROW_ACCENT(item)}}/>
                      <div style={{flex:1,minWidth:0,maxWidth:640}}>
                        <div style={{...TYPE.micro,color:item.urgent?COLOR.red:COLOR.inkFaint,letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>
                          {TYPE_LABEL[item.type]||item.type}{item.risk==="HIGH"&&<span> · High risk</span>}
                        </div>
                        <button onClick={()=>goToFeedItem(item)} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:FONT.sans}}>
                          <div style={{fontSize:13.5,fontWeight:600,color:COLOR.ink,lineHeight:1.35}}>{item.title}</div>
                          {(item.subject||item.timing)&&(
                            <div style={{fontSize:11.5,color:COLOR.inkFaint,marginTop:1}}>{item.subject}{item.subject&&item.timing?" · ":""}{item.timing}</div>
                          )}
                        </button>
                        {item.cta&&(
                          <button onClick={()=>goToFeedItem(item)} style={{marginTop:6,fontSize:11.5,fontWeight:600,color:COLOR.purple,background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:FONT.sans}}>{item.cta}</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {hiddenCount>0&&(
                    <button onClick={()=>setShowAllFeed(true)} style={{width:"100%",textAlign:"center",padding:"10px 0",background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,color:COLOR.purple,fontFamily:FONT.sans}}>View all ({feed.length}) →</button>
                  )}
                </div>
                );
              })()}
            </div>

            {/* §4 secondary rail — Today, redesigned as a compact agenda:
                state → event/action → person, for each of today's real
                meetings and deadlines. No fabricated times — meeting
                records don't carry a time-of-day field, only a date, so
                this deliberately doesn't invent one; a real time field
                would slot into the leading badge without restructuring
                anything else. Omitted entirely (no empty card) when
                there's genuinely nothing today or this week (§9). */}
            {hasToday&&(
              <div className="home-v2-today">
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:SPACE.sm}}>
                  <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>Today</div>
                  <button onClick={()=>setScreen(SCREENS.CALENDAR)} style={{fontSize:11,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500}}>Calendar →</button>
                </div>
                {(todayMeetings.length>0||todayDeadlines.length>0)&&(
                  <div style={{display:"flex",flexDirection:"column"}}>
                    {todayMeetings.map((m,i)=>(
                      <div key={"m"+i} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:(i<todayMeetings.length-1||todayDeadlines.length>0)?`1px solid ${COLOR.borderFaint}`:"none"}}>
                        <span style={{...TYPE.micro,color:COLOR.purple,fontWeight:700,textTransform:"uppercase",flexShrink:0,marginTop:1}}>Meeting</span>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:12.5,fontWeight:600,color:COLOR.ink}}>{m.type||"Meeting"}</div>
                          <div style={{fontSize:11.5,color:COLOR.inkFaint}}>{m.employeeName}</div>
                        </div>
                      </div>
                    ))}
                    {todayDeadlines.map((d,i)=>(
                      <div key={"d"+i} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:i<todayDeadlines.length-1?`1px solid ${COLOR.borderFaint}`:"none"}}>
                        <span style={{...TYPE.micro,color:COLOR.amber,fontWeight:700,textTransform:"uppercase",flexShrink:0,marginTop:1}}>Due</span>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:12.5,fontWeight:600,color:COLOR.ink}}>{humanizeDeadlineTitle(d)}</div>
                          <div style={{fontSize:11.5,color:COLOR.inkFaint}}>{d.employeeName}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {hasWeekSummary&&(
                  <div style={{marginTop:(todayMeetings.length>0||todayDeadlines.length>0)?SPACE.sm:0,paddingTop:(todayMeetings.length>0||todayDeadlines.length>0)?SPACE.sm:0,borderTop:(todayMeetings.length>0||todayDeadlines.length>0)?`1px solid ${COLOR.borderFaint}`:"none"}}>
                    <div style={{...TYPE.micro,color:COLOR.inkFaint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>This week</div>
                    <div style={{fontSize:12,color:COLOR.inkSoft}}>
                      {weekDeadlines>0&&`${weekDeadlines} deadline${weekDeadlines!==1?"s":""}`}
                      {weekDeadlines>0&&weekMeetings>0&&" · "}
                      {weekMeetings>0&&`${weekMeetings} meeting${weekMeetings!==1?"s":""}`}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Home + Sidebar Product Experience pass, Part 7 — "Continue
                working" (was "Recently active"): compact, subordinate to
                For You, never the full Cases table/filters (Cases owns
                that). Same data/logic, renamed to read as a return-to
                point ("what was I working on?") rather than an activity
                log. */}
            <div className="home-v2-recent">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:SPACE.sm}}>
                <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>Continue working</div>
                <button onClick={()=>setScreen(SCREENS.CASES)} style={{fontSize:11,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500}}>View all cases →</button>
              </div>
              <div style={{display:"flex",flexDirection:"column"}}>
                {recentCases.map((cs,i)=>{
                  const next=getNextStep(cs);
                  const lastUpdated=cs.updatedAt||cs.createdAt;
                  return (
                    <button key={cs.id} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}}
                      style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",background:"none",border:"none",padding:"10px 4px",cursor:"pointer",fontFamily:FONT.sans,borderBottom:i<recentCases.length-1?`1px solid ${COLOR.borderFaint}`:"none"}}>
                      <div style={{width:28,height:28,borderRadius:"50%",background:COLOR.purpleTint,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:COLOR.purpleDeep,flexShrink:0}}>
                        {(cs.employeeName||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:COLOR.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cs.employeeName}</div>
                        <div style={{fontSize:11.5,color:COLOR.inkFaint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cs.caseType||"HR Matter"}{next?" · "+next.label:""}</div>
                      </div>
                      <div style={{fontSize:11,color:COLOR.inkQuiet,flexShrink:0}}>{lastUpdated?fmtDate(lastUpdated):""}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Home + Sidebar Product Experience pass, Parts 8/9 —
                secondary rail. "Your work" now shows a real breakdown
                (overdue / awaiting approval / due this week) instead of
                a bare open-case count, and is omitted entirely when none
                of the three apply. "Compass noticed" now surfaces each
                signal's own reasoning (already AI-written at creation,
                previously discarded here) alongside a specific action,
                not just a title + employee name. */}
            <div className="home-v2-secondary">
              {hasWorkBreakdown&&(
                <div>
                  <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.sm}}>Your work</div>
                  <div style={{fontSize:12.5,color:COLOR.inkSoft,lineHeight:1.8}}>
                    {overdueCount>0&&<>{overdueCount} overdue</>}
                    {overdueCount>0&&(awaitingApprovalCount>0||weekDeadlines>0)&&" · "}
                    {awaitingApprovalCount>0&&<>{awaitingApprovalCount} awaiting approval</>}
                    {awaitingApprovalCount>0&&weekDeadlines>0&&" · "}
                    {weekDeadlines>0&&<>{weekDeadlines} due this week</>}
                  </div>
                </div>
              )}
              {hasCompassNoticed&&(
                <div>
                  <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.sm}}>Compass noticed</div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {recommendations.map((sig)=>{
                      const cs=cases.find(c=>c.id===sig.caseId);
                      const meta=signalTypeMeta(sig.type);
                      const ctaLabel = sig.type==="process_risk" ? "Review guardrail →" : "Review case →";
                      return (
                        <CompassNoticedItem key={sig.id} sig={sig} cs={cs} meta={meta} ctaLabel={ctaLabel}
                          onOpenCase={()=>{setActiveCaseId(cs.id); setActiveCaseStage("investigation"); setScreen(SCREENS.CASE_VIEW);}}/>
                      );
                    })}
                    {bottlenecks.slice(0,2).map((b,i)=>(
                      <div key={i} style={{fontSize:12.5,color:COLOR.ink}}>
                        {b.processType} · {b.stage} running long
                        <div style={{fontSize:11.5,color:COLOR.inkFaint,marginTop:1}}>avg {b.avgDays}d (target {b.targetDays}d)</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
