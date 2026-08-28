import { useState } from 'react';
import { SCREENS } from '../constants';
import { daysBetween } from '../lib/dateMath';
import { getCurrentRisk } from '../lib/caseStage';
import { openReferrals } from '../lib/concernReferrals';
import { topOpenSignalsOrgWide, signalTypeMeta } from '../lib/caseSignals';
import { requiresApproval } from '../lib/approvals';
import { computeStageBottlenecks } from '../lib/processDashboard';
import { FONT, COLOR, SPACE, RADIUS, TYPE, BUTTON, CONTENT_MAX_WIDTH } from '../styles/tokens';

// Phase 20 — a case with no activity in this many days surfaces in the
// "Needs attention" strip as stale, separate from actions/overdue items
// which are keyed off explicit dated deadlines rather than plain inactivity.
const STALE_DAYS = 14;

// Home Composition Review — 1200 (CONTENT_MAX_WIDTH) is the shell's own
// maximum, not a mandate that every screen's content spans it. Home's
// actual working content (greeting/actions, the case list, Today) reads
// as a working column, not a grid, so it's capped narrower here — flush
// left within the same outer shell below, not re-centered — so Home's
// left edge still lines up with every other screen's, and only the
// unused width past the column goes quiet instead of stretching rows and
// pulling the header actions out to a distant far edge.
const HOME_CONTENT_WIDTH = 880;

// The nav/logo shell is rendered once by AppSidebar (App.jsx), mounted
// unconditionally above every screen including this one — Home used to
// render its own separate copy here, which had drifted out of sync with
// the shared one (different height, padding, logo size) and caused a
// visible layout jump on every navigation away from Home.
export function HomeScreen({ cases, getCaseStage, currentUser, getNextStep, setMeetingSetup, setScreen, setShowCasePrompt, dueSoon, dashSearch, setDashSearch, dashFilter, setDashFilter, setActiveCaseId, setActiveCaseStage, fmtDate, caseSignals=[], concernReferrals=[], isHR, hrReviewRequests=[], processTemplates=[] }) {
  const freshMeetingSetup = () => ({employee:"", employeeJobTitle:"", manager:currentUser?.name||"", chairJobTitle:"", type:"", date:new Date().toISOString().split("T")[0], linkedCaseId:null, linkedCaseName:null, representative:"", representativeRole:"colleague", participants:[]});
  // Home Composition Review — the two Home "states" (§9): a quiet/new
  // account with nothing active to work on vs. a busy one. Hoisted once
  // here since it now also decides whether the Active Cases filter row
  // (a user can't meaningfully filter a list that's already empty) and
  // the compact "Your work" prompt render, not just the greeting subtitle.
  const activeCaseCount = cases.filter(cs=>getCaseStage(cs)!=="closed").length;
  const isQuietHome = activeCaseCount===0;
  // Home Composition Review, final refinement (item 1) — Needs Attention's
  // own row list, not the summary line beneath it, is what was making the
  // section vertically dominant on a busy org (up to 6 real rows). Starts
  // collapsed to the top 3 — the sort/rank logic below is untouched, so
  // "top 3" is still genuinely the 3 highest-priority items, not just the
  // first 3 in whatever order they happened to be built.
  const [showAllAttention, setShowAllAttention] = useState(false);
  return(
    <div style={{minHeight:"100vh",background:COLOR.paper,fontFamily:FONT.sans}}>

      <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"32px 32px"}}>
        <div style={{maxWidth:HOME_CONTENT_WIDTH}}>

        {/* ── Greeting (Phase 2A, Calm Intelligence) ── quiet editorial
            identity moment — one size (TYPE.identity, 26px), matching the
            Case Workspace header's own identity size so there is exactly
            one "this is the primary thing" heading size across the whole
            product, not a separate larger one just for Home.
            Phase 7.5C — the four stat-card tiles that used to sit below
            this (Active cases / Awaiting action / Pending signatures /
            Closed this month) were almost entirely restating numbers
            already visible elsewhere on this same screen: active-case and
            awaiting-action counts were already in this subtitle, pending
            signatures was already one of the Needs Attention chips below.
            Only "closed this month" was genuinely not shown anywhere else,
            so that's the one figure folded into this line instead of
            losing it outright — the other three tiles were pure
            duplication, not information, so they're gone rather than
            moved. */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingBottom:SPACE.lg,marginBottom:SPACE.xl,borderBottom:`1px solid ${COLOR.borderFaint}`,flexWrap:"wrap",gap:SPACE.lg}}>
          <div>
            <div style={{...TYPE.micro,color:COLOR.inkFaint,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:SPACE.xs}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase()}</div>
            <h1 style={{...TYPE.identity,color:COLOR.ink,margin:0}}>
              Good {new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening"}{currentUser?.name?", "+currentUser.name.split(" ")[0]:""}
            </h1>
            <p style={{...TYPE.metadata,color:COLOR.inkFaint,margin:"5px 0 0"}}>
              {(()=>{
                const actions=cases.filter(cs=>getCaseStage(cs)!=="closed"&&getNextStep(cs)?.action).length;
                if(isQuietHome) return "No active cases — create one to get started.";
                const closedThisMonth=cases.filter(cs=>{if(getCaseStage(cs)!=="closed")return false;const d=new Date(cs.updatedAt||cs.createdAt||0);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).length;
                return activeCaseCount+" active case"+(activeCaseCount!==1?"s":"")+(actions>0?" · "+actions+" requiring action":"")+(closedThisMonth>0?" · "+closedThisMonth+" closed this month":"");
              })()}
            </p>
          </div>
          {/* Home Composition Review, final refinement (item 2) —
              alignItems:center (was flex-start) so the button pair sits
              against the whole 3-line greeting block rather than pinned
              to just its top edge, which is what read as "floating"
              beside empty space next to the subtitle line. The bottom
              border above closes the header into one visually bounded
              unit instead of relying on whitespace alone to say "these
              belong together." No change to which action is primary. */}
          <div style={{display:"flex",gap:SPACE.sm,flexShrink:0}}>
            <button onClick={()=>{setMeetingSetup(freshMeetingSetup());setScreen(SCREENS.HOME+"_meeting");}} style={{fontSize:13,background:COLOR.surface,border:`1.5px solid ${COLOR.purple}`,borderRadius:RADIUS.surface,padding:"10px 20px",cursor:"pointer",color:COLOR.purple,fontFamily:FONT.sans,fontWeight:600}}>Start meeting</button>
            <button onClick={()=>setShowCasePrompt(true)} style={{fontSize:13,background:COLOR.purple,border:"none",borderRadius:RADIUS.surface,padding:"10px 20px",cursor:"pointer",color:"#fff",fontFamily:FONT.sans,fontWeight:600}}>+ New case</button>
          </div>
        </div>

        {/* ── Needs attention (Level 1) ──
            Phase 7.5C — previously up to 11 independent categories each
            rendered as their own row of pill-shaped chips (worst case:
            actions/overdue/highRisk/appealsOutstanding/staleCases each
            listing up to 3 individual chips, plus 6 more aggregate-count
            chips — over 20 separate bordered elements simultaneously on a
            busy org). No category was removed and no new severity was
            invented: every count/filter below is identical to before.
            What changed is presentation — the case-specific, genuinely
            "go do this" categories (actions/overdue/highRisk/
            appealsOutstanding, the ones that were already coloured
            orange/red/purple rather than the muted grey staleCases used)
            merge into one capped, severity-sorted list of real rows
            (reusing the same row layout as the Active Cases list below,
            not a new primitive); staleCases demotes to a count alongside
            the other aggregate-only categories, since an individual name
            for a quiet case is far less actionable than "overdue" or
            "HIGH risk" and every one of those cases is still one click
            away in Active Cases regardless. The aggregate categories
            collapse from separate bordered/padded pill chips into one
            plain text line — same counts, same click-through where one
            existed (openReferrals), just without a border and background
            each. */}
        {(()=>{
          const actions=cases.filter(cs=>getCaseStage(cs)!=="closed"&&getNextStep(cs)?.action);
          const pendingSigs=cases.reduce((a,cs)=>a+(cs.evidence||[]).filter(e=>e.signStatus==="pending"&&e.signId).length,0);
          const overdue=dueSoon.filter(d=>d.overdue);
          const highRisk=cases.filter(cs=>getCaseStage(cs)!=="closed"&&getCurrentRisk(cs)==="HIGH");
          const appealsOutstanding=cases.filter(cs=>getCaseStage(cs)==="appeal");
          const staleCases=cases.filter(cs=>{
            if(getCaseStage(cs)==="closed") return false;
            const lastUpdated=cs.updatedAt||cs.createdAt;
            if(!lastUpdated) return false;
            return (Date.now()-new Date(lastUpdated))>STALE_DAYS*24*60*60*1000;
          });
          const openReferralsCount=isHR?openReferrals(concernReferrals).length:0;
          // Process Intelligence (P17, §18) — each of these four reuses an
          // existing computed source (P6's process_risk signals, P16's own
          // dueSoon appeal/investigation categories, P9's approval requests)
          // rather than any new deterministic logic of its own.
          const proceduralWarnings=caseSignals.filter(s=>s.type==="process_risk"&&s.status==="open").length;
          const appealsNearingDeadline=dueSoon.filter(d=>d.category==="appeal").length;
          const outcomesAwaitingApproval=hrReviewRequests.filter(r=>r.status==="pending"&&requiresApproval(r.step)).length;
          const investigationsOverrunning=dueSoon.filter(d=>d.category==="investigation").length;
          if(actions.length===0&&pendingSigs===0&&overdue.length===0&&highRisk.length===0&&appealsOutstanding.length===0&&staleCases.length===0&&openReferralsCount===0&&proceduralWarnings===0&&appealsNearingDeadline===0&&outcomesAwaitingApproval===0&&investigationsOverrunning===0) return null;

          // Existing colour already encoded urgency (red = overdue/HIGH
          // risk, orange = action required, purple = appeal outstanding) —
          // reused here as the sort/merge key rather than adding a new one.
          // Home Composition Review, final refinement (item 1) — the
          // 6-item cap and the sort itself are exactly what they were;
          // INITIAL_ATTENTION_ROWS only changes how many of that already-
          // prioritised, already-capped list render before the user asks
          // for more. Every item stays reachable via "View all" — nothing
          // above this line changed.
          const ATTENTION_ROW_LIMIT=6;
          const INITIAL_ATTENTION_ROWS=3;
          const allRows=[
            ...overdue.map((d,i)=>({key:"od"+i,rank:0,color:"#C84B2F",clickable:false,label:`${d.label||d.employeeName} · Overdue`})),
            ...highRisk.map(cs=>({key:"risk"+cs.id,rank:0,color:"#C84B2F",clickable:true,label:`${cs.employeeName} · HIGH risk`,onClick:()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}})),
            ...actions.map(cs=>({key:"act"+cs.id,rank:1,color:"#E8622A",clickable:true,label:`${cs.employeeName} · ${getNextStep(cs)?.label}`,onClick:()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}})),
            ...appealsOutstanding.map(cs=>({key:"appeal"+cs.id,rank:2,color:"#5B3FD4",clickable:true,label:`${cs.employeeName} · Appeal outstanding`,onClick:()=>{setActiveCaseId(cs.id);setActiveCaseStage("appeal");setScreen(SCREENS.CASE_VIEW);}})),
          ].sort((a,b)=>a.rank-b.rank).slice(0,ATTENTION_ROW_LIMIT);
          const rows=showAllAttention?allRows:allRows.slice(0,INITIAL_ATTENTION_ROWS);
          const hiddenAttentionCount=allRows.length-rows.length;

          const summaryParts=[
            pendingSigs>0&&{label:`${pendingSigs} pending signature${pendingSigs!==1?"s":""}`},
            staleCases.length>0&&{label:`${staleCases.length} case${staleCases.length!==1?"s":""} with no recent activity`},
            openReferralsCount>0&&{label:`${openReferralsCount} referral${openReferralsCount!==1?"s":""} awaiting triage`,onClick:()=>setScreen(SCREENS.CONCERNS)},
            proceduralWarnings>0&&{label:`${proceduralWarnings} procedural warning${proceduralWarnings!==1?"s":""}`},
            appealsNearingDeadline>0&&{label:`${appealsNearingDeadline} appeal${appealsNearingDeadline!==1?"s":""} nearing deadline`},
            outcomesAwaitingApproval>0&&{label:`${outcomesAwaitingApproval} outcome${outcomesAwaitingApproval!==1?"s":""} awaiting approval`},
            investigationsOverrunning>0&&{label:`${investigationsOverrunning} investigation${investigationsOverrunning!==1?"s":""} overrunning`},
          ].filter(Boolean);

          // Phase 2A (Calm Intelligence) — the outer bordered card is
          // gone: this is the single strongest section on the page and a
          // box around it was never doing hierarchy work, just visual
          // noise. A section heading + a closing rule is enough to
          // separate it from Active Cases below. Row content, severity
          // colour/weight, and every click handler are byte-for-byte
          // unchanged from Phase 7.5C — presentation of the wrapper only.
          return (
            <div style={{marginBottom:SPACE.xxl,paddingBottom:SPACE.lg,borderBottom:`1px solid ${COLOR.border}`}}>
              <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.sm}}>Needs attention</div>
              {rows.map((r,i)=>{
                const Tag=r.clickable?"button":"div";
                return (
                  <Tag key={r.key} type={r.clickable?"button":undefined} onClick={r.onClick} title={r.label}
                    style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 0",border:"none",background:"none",cursor:r.clickable?"pointer":"default",textAlign:"left",font:"inherit",fontFamily:FONT.sans,borderBottom:(i<rows.length-1||hiddenAttentionCount>0)?`1px solid ${COLOR.borderFaint}`:"none"}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:r.color,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0,fontSize:12,fontWeight:r.rank===0?700:600,color:COLOR.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>
                    {r.clickable&&<span style={{color:COLOR.inkQuiet,fontSize:14,flexShrink:0}}>›</span>}
                  </Tag>
                );
              })}
              {hiddenAttentionCount>0&&(
                <button onClick={()=>setShowAllAttention(true)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:4,padding:"8px 0",border:"none",background:"none",cursor:"pointer",fontSize:12,color:COLOR.purple,fontFamily:FONT.sans,fontWeight:500,borderBottom:summaryParts.length>0?`1px solid ${COLOR.borderFaint}`:"none"}}>
                  View all ({allRows.length}) →
                </button>
              )}
              {summaryParts.length>0&&(
                <div style={{paddingTop:10,fontSize:12,fontWeight:500,color:COLOR.inkSoft,lineHeight:1.7,borderTop:rows.length>0?`1px solid ${COLOR.borderFaint}`:"none",marginTop:rows.length>0?4:0}}>
                  {summaryParts.map((p,i)=>(
                    <span key={i} style={{fontWeight:500}}>
                      {p.onClick?(
                        <button onClick={p.onClick} style={{font:"inherit",fontWeight:500,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",padding:0}}>{p.label}</button>
                      ):p.label}
                      {i<summaryParts.length-1&&<span style={{color:COLOR.inkQuiet}}> · </span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Active Cases (Phase 2A) ── single-column composition, not a
            two-column dashboard grid: Needs Attention above, Active Cases
            here at full width so it's unmistakably the dominant working
            surface, secondary content (Today / Compass intelligence)
            stacked quietly below it — never beside it competing for the
            same horizontal attention. */}
        <div style={{display:"flex",flexDirection:"column",gap:SPACE.lg}}>

            {/* Home Composition Review, item 1 + 5 — a genuinely quiet
                account (no active cases at all, not "this search/filter
                happens to match nothing") gets a compact, intentional
                prompt sized to its own content, not the populated list's
                bordered box forced empty. Filters/search are real
                controls over a real list — with no active cases there is
                nothing to filter, so they don't render at all here
                (still fully reachable the moment a case exists, and
                always reachable via Cases in the nav regardless).
                filtered-to-empty-by-search stays exactly as it was, one
                line inside the same bordered list below, since that IS a
                meaningful state (real cases exist, this view just
                doesn't match any). */}
            {isQuietHome ? (
              <div style={{padding:"18px 0 6px"}}>
                <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.sm}}>Your work</div>
                <div style={{fontSize:15,fontWeight:600,color:COLOR.ink,marginBottom:4}}>No active cases yet.</div>
                <div style={{...TYPE.body,color:COLOR.inkSoft,marginBottom:SPACE.md,maxWidth:420,lineHeight:1.5}}>Create your first case to start managing the process in Compass.</div>
                <button onClick={()=>setShowCasePrompt(true)} style={{...BUTTON.primary,fontSize:13,padding:"9px 20px"}}>+ New case</button>
              </div>
            ) : (
            <>
            {/* Cases header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div style={{...TYPE.pageTitle,color:COLOR.ink}}>Active cases</div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{position:"relative"}}>
                  <svg style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:COLOR.inkFaint,pointerEvents:"none"}} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input aria-label="Search cases" value={dashSearch} onChange={e=>setDashSearch(e.target.value)} placeholder="Search cases…" style={{paddingLeft:28,paddingRight:10,paddingTop:7,paddingBottom:7,fontSize:12,border:`1px solid ${COLOR.border}`,borderRadius:7,background:COLOR.surface,color:COLOR.ink,fontFamily:FONT.sans,outline:"none",width:160}}/>
                </div>
                {["active","investigation","disciplinary","closed"].map(s=>(
                  <button key={s} onClick={()=>setDashFilter(s)} style={{fontSize:11,padding:"5px 11px",borderRadius:20,border:"1px solid",borderColor:dashFilter===s?COLOR.purple:COLOR.border,background:dashFilter===s?COLOR.purpleTint:COLOR.surface,color:dashFilter===s?COLOR.purple:COLOR.inkSoft,cursor:"pointer",fontFamily:FONT.sans,fontWeight:dashFilter===s?600:400,whiteSpace:"nowrap"}}>
                    {s.charAt(0).toUpperCase()+s.slice(1)}
                  </button>
                ))}
                <button onClick={()=>setScreen(SCREENS.CASES)} style={{fontSize:12,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500,whiteSpace:"nowrap"}}>View all →</button>
              </div>
            </div>

            {/* Cases list */}
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
              {(()=>{
                const filtered=cases.filter(cs=>{
                  const stage=getCaseStage(cs);
                  const matchStage=dashFilter==="active"?stage!=="closed":dashFilter==="closed"?stage==="closed":cs.stage===dashFilter||stage===dashFilter;
                  const matchSearch=!dashSearch||cs.employeeName?.toLowerCase().includes(dashSearch.toLowerCase())||cs.caseType?.toLowerCase().includes(dashSearch.toLowerCase());
                  return matchStage&&matchSearch;
                });
                if(filtered.length===0) return (
                  <div style={{padding:"40px",textAlign:"center"}}>
                    <div style={{fontSize:14,color:"#9B9098",marginBottom:8}}>{dashSearch?"No cases match your search.":"No active cases."}</div>
                    {!dashSearch&&<button onClick={()=>setShowCasePrompt(true)} style={{fontSize:13,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Create a case</button>}
                  </div>
                );
                const statusMap={
                  open:{label:"Open",color:"#6B6375",bg:"#F5F1EA"},
                  investigation:{label:"In progress",color:"#E8622A",bg:"#FFF0EB"},
                  inv_report:{label:"Awaiting action",color:"#7C5CFC",bg:"#EDE8FF"},
                  disciplinary:{label:"Disciplinary",color:"#C84B2F",bg:"#FFF0ED"},
                  closed:{label:"Closed",color:"#1A7A4A",bg:"#E8F5EE"},
                };
                // Home is a daily-glance dashboard, not the full case list —
                // every other section here caps itself (top 3 actions, top 5
                // quick links, 4 stat cards); this one used to render every
                // matching case with no limit, which is what made the page
                // balloon to 20+ screens tall for orgs with many cases. The
                // full, unlimited list already lives one click away via
                // "View all" (both above the list and here at the bottom).
                const CASE_PREVIEW_LIMIT = 6;
                const visible = filtered.slice(0, CASE_PREVIEW_LIMIT);
                return (
                  <>
                    {visible.map((cs,i)=>{
                      const next=getNextStep(cs);
                      const stage=getCaseStage(cs);
                      const st=statusMap[cs.stage||stage]||statusMap.open;
                      const lastUpdated=cs.updatedAt||cs.createdAt;
                      const daysAgo=lastUpdated?daysBetween(lastUpdated, Date.now()):null;
                      return (
                        <button key={cs.id} type="button"
                          onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}}
                          style={{width:"100%",display:"flex",alignItems:"center",padding:"13px 18px",border:"none",background:"none",cursor:"pointer",transition:"background 0.1s",textAlign:"left",font:"inherit",color:"inherit",borderBottom:i<visible.length-1||filtered.length>CASE_PREVIEW_LIMIT?"1px solid #F5F1EA":"none"}}
                          onMouseEnter={e=>e.currentTarget.style.background="#FDFAF5"}
                          onMouseLeave={e=>e.currentTarget.style.background="none"}>
                          <div style={{width:36,height:36,borderRadius:"50%",background:"#EDE8FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#7C5CFC",flexShrink:0,marginRight:14}}>
                            {(cs.employeeName||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
                          </div>
                          {/* Phase 7.5B (P0 polish) — this is the only
                              flexible column in the row; every sibling
                              (avatar, badge, timestamp, chevron) is
                              flexShrink:0, so a long employee name/case
                              type is the only thing that ever truncates,
                              via a real ellipsis rather than an
                              unprotected sibling getting compressed
                              until its own content visually overlaps the
                              next column — the confirmed bug this fixes.
                              title= preserves the untruncated name on
                              hover; nothing here changes what identity
                              info is available, only how it wraps. */}
                          <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
                            <div title={cs.employeeName} style={{fontSize:13,fontWeight:600,color:"#1C1820",marginBottom:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{cs.employeeName}</div>
                            <div title={(cs.caseType||"HR Matter")+(next?" · "+next.label:"")} style={{fontSize:12,color:"#9B9098",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{cs.caseType||"HR Matter"}{next?" · "+next.label:""}</div>
                          </div>
                          <div style={{marginRight:16,flexShrink:0}}>
                            <span style={{fontSize:11,fontWeight:600,color:st.color,background:st.bg,borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap"}}>{st.label}</span>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0,minWidth:80}}>
                            <div style={{fontSize:11,color:"#9B9098",marginBottom:1}}>Last updated</div>
                            <div style={{fontSize:11,color:"#1C1820",fontWeight:500}}>{daysAgo===null?"—":daysAgo===0?"Today":daysAgo===1?"Yesterday":fmtDate(lastUpdated)}</div>
                          </div>
                          <div style={{marginLeft:12,color:"#C4BAB0",fontSize:16,flexShrink:0}}>›</div>
                        </button>
                      );
                    })}
                    {filtered.length>CASE_PREVIEW_LIMIT&&(
                      <button onClick={()=>setScreen(SCREENS.CASES)} style={{width:"100%",padding:"12px 18px",border:"none",background:"none",cursor:"pointer",textAlign:"center",fontSize:12,color:"#7C5CFC",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>
                        View all {filtered.length} cases →
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
            </>
            )}

            {/* Today (Phase 2A) — quieter, ambient, no card.
                Home Composition Review, item 4 — an empty Today used to
                spend the same two-row shape (heading row, then a second
                row just for "No meetings logged today.") as the populated
                case: real content earns a second row, an empty one
                collapses onto the heading's own row instead, so it costs
                no more vertical space than the label itself. Populated
                still expands naturally exactly as before. */}
            {(()=>{
              const today=new Date();
              const caseMeetings=cases.flatMap(cs=>(cs.meetings||[]).map(m=>({...m,employeeName:cs.employeeName,caseId:cs.id})));
              const todayMeetings=caseMeetings.filter(m=>{
                if(!m.date)return false;
                const parts=m.date.split("/");
                if(parts.length===3){const md=new Date(parts[2],parts[1]-1,parts[0]);return md.toDateString()===today.toDateString();}
                return false;
              });
              const hasToday=todayMeetings.length>0;
              return (
                <div style={{marginTop:SPACE.xl}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:hasToday?SPACE.sm:0}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,minWidth:0}}>
                      <span style={{...TYPE.sectionHeading,color:COLOR.inkFaint,flexShrink:0}}>Today</span>
                      {!hasToday&&<span style={{fontSize:12.5,color:COLOR.inkFaint}}>No meetings today.</span>}
                    </div>
                    <button onClick={()=>setScreen(SCREENS.CALENDAR)} style={{fontSize:12,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500,flexShrink:0}}>Calendar →</button>
                  </div>
                  {hasToday&&(
                    <div style={{display:"flex",flexDirection:"column",gap:2}}>
                      {todayMeetings.map((m,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",fontSize:12.5}}>
                          <div style={{width:6,height:6,borderRadius:"50%",background:COLOR.purple,flexShrink:0}}/>
                          <span style={{fontWeight:600,color:COLOR.ink}}>{m.employeeName}</span>
                          <span style={{color:COLOR.inkFaint}}>· {m.type||"Meeting"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Compass intelligence (Phase 2A, Calm Intelligence) — the
                single largest visual change on Home. Was a bordered card
                sharing a whole right column with the case list, visually
                co-equal with the user's own workload; now a quiet, ambient
                aside stacked below it — a small dot and one line per
                item, no box, no header treatment competing with "Active
                cases" above. Content, ranking, and AI logic are completely
                unchanged (topOpenSignalsOrgWide / computeStageBottlenecks,
                same as Phase 7.5C) — this is presentation only. */}
            {(()=>{
              const recommendations=topOpenSignalsOrgWide(caseSignals,["next_action","process_risk"],5);
              const bottlenecks=computeStageBottlenecks(cases, processTemplates);
              if(recommendations.length===0&&bottlenecks.length===0) return null;
              return (
                <div style={{marginTop:SPACE.xl,paddingTop:SPACE.lg,borderTop:`1px solid ${COLOR.border}`}}>
                  <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.sm}}>Compass intelligence</div>
                  {recommendations.map((sig)=>{
                    const cs=cases.find(c=>c.id===sig.caseId);
                    const meta=signalTypeMeta(sig.type);
                    return (
                      <button key={sig.id} onClick={()=>{if(!cs) return; setActiveCaseId(cs.id); setActiveCaseStage("investigation"); setScreen(SCREENS.CASE_VIEW);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"5px 0",border:"none",background:"none",cursor:cs?"pointer":"default",textAlign:"left",fontFamily:FONT.sans,fontSize:12.5}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:meta.color,flexShrink:0}}/>
                        <span style={{color:COLOR.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sig.title}</span>
                        <span style={{color:COLOR.inkFaint,flexShrink:0}}>· {cs?.employeeName||"Unknown case"}</span>
                      </button>
                    );
                  })}
                  {bottlenecks.slice(0,3).map((b,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",fontSize:12.5}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:COLOR.amber,flexShrink:0}}/>
                      <span style={{color:COLOR.ink}}>{b.processType} · {b.stage} running long</span>
                      <span style={{color:COLOR.inkFaint}}>· avg {b.avgDays}d (target {b.targetDays}d)</span>
                    </div>
                  ))}
                </div>
              );
            })()}

        </div>
        </div>
      </div>
    </div>
  );
}
