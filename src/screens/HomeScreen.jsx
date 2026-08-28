import { SCREENS } from '../constants';
import { daysBetween } from '../lib/dateMath';
import { getCurrentRisk } from '../lib/caseStage';
import { openReferrals } from '../lib/concernReferrals';
import { topOpenSignalsOrgWide, signalTypeMeta } from '../lib/caseSignals';
import { requiresApproval } from '../lib/approvals';
import { computeStageBottlenecks } from '../lib/processDashboard';

// Phase 20 — a case with no activity in this many days surfaces in the
// "Needs attention" strip as stale, separate from actions/overdue items
// which are keyed off explicit dated deadlines rather than plain inactivity.
const STALE_DAYS = 14;

// The nav/logo shell is rendered once by AppSidebar (App.jsx), mounted
// unconditionally above every screen including this one — Home used to
// render its own separate copy here, which had drifted out of sync with
// the shared one (different height, padding, logo size) and caused a
// visible layout jump on every navigation away from Home.
export function HomeScreen({ cases, getCaseStage, currentUser, getNextStep, setMeetingSetup, setScreen, setShowCasePrompt, dueSoon, dashSearch, setDashSearch, dashFilter, setDashFilter, setActiveCaseId, setActiveCaseStage, fmtDate, caseSignals=[], concernReferrals=[], isHR, hrReviewRequests=[], processTemplates=[] }) {
  const freshMeetingSetup = () => ({employee:"", employeeJobTitle:"", manager:currentUser?.name||"", chairJobTitle:"", type:"", date:new Date().toISOString().split("T")[0], linkedCaseId:null, linkedCaseName:null, representative:"", representativeRole:"colleague", participants:[]});
  return(
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 32px"}}>

        {/* ── Greeting + primary actions ──
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
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:16}}>
          <div>
            <div style={{fontSize:11,color:"#9B9098",letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase()}</div>
            <h1 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:32,fontWeight:400,color:"#1C1820",margin:0,letterSpacing:"-0.5px"}}>
              Good {new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening"}{currentUser?.name?", "+currentUser.name.split(" ")[0]:""}
            </h1>
            <p style={{fontSize:13,color:"#9B9098",margin:"5px 0 0"}}>
              {(()=>{
                const active=cases.filter(cs=>getCaseStage(cs)!=="closed").length;
                const actions=cases.filter(cs=>getCaseStage(cs)!=="closed"&&getNextStep(cs)?.action).length;
                if(active===0) return "No active cases — create one to get started.";
                const closedThisMonth=cases.filter(cs=>{if(getCaseStage(cs)!=="closed")return false;const d=new Date(cs.updatedAt||cs.createdAt||0);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).length;
                return active+" active case"+(active!==1?"s":"")+(actions>0?" · "+actions+" requiring action":"")+(closedThisMonth>0?" · "+closedThisMonth+" closed this month":"");
              })()}
            </p>
          </div>
          <div style={{display:"flex",gap:10,flexShrink:0,marginTop:4}}>
            <button onClick={()=>{setMeetingSetup(freshMeetingSetup());setScreen(SCREENS.HOME+"_meeting");}} style={{fontSize:13,background:"#FFFFFF",border:"1.5px solid #7C5CFC",borderRadius:9,padding:"10px 20px",cursor:"pointer",color:"#7C5CFC",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Start meeting</button>
            <button onClick={()=>setShowCasePrompt(true)} style={{fontSize:13,background:"#7C5CFC",border:"none",borderRadius:9,padding:"10px 20px",cursor:"pointer",color:"#fff",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>+ New case</button>
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
          const ATTENTION_ROW_LIMIT=6;
          const rows=[
            ...overdue.map((d,i)=>({key:"od"+i,rank:0,color:"#C84B2F",clickable:false,label:`${d.label||d.employeeName} · Overdue`})),
            ...highRisk.map(cs=>({key:"risk"+cs.id,rank:0,color:"#C84B2F",clickable:true,label:`${cs.employeeName} · HIGH risk`,onClick:()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}})),
            ...actions.map(cs=>({key:"act"+cs.id,rank:1,color:"#E8622A",clickable:true,label:`${cs.employeeName} · ${getNextStep(cs)?.label}`,onClick:()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}})),
            ...appealsOutstanding.map(cs=>({key:"appeal"+cs.id,rank:2,color:"#5B3FD4",clickable:true,label:`${cs.employeeName} · Appeal outstanding`,onClick:()=>{setActiveCaseId(cs.id);setActiveCaseStage("appeal");setScreen(SCREENS.CASE_VIEW);}})),
          ].sort((a,b)=>a.rank-b.rank).slice(0,ATTENTION_ROW_LIMIT);

          const summaryParts=[
            pendingSigs>0&&{label:`${pendingSigs} pending signature${pendingSigs!==1?"s":""}`},
            staleCases.length>0&&{label:`${staleCases.length} case${staleCases.length!==1?"s":""} with no recent activity`},
            openReferralsCount>0&&{label:`${openReferralsCount} referral${openReferralsCount!==1?"s":""} awaiting triage`,onClick:()=>setScreen(SCREENS.CONCERNS)},
            proceduralWarnings>0&&{label:`${proceduralWarnings} procedural warning${proceduralWarnings!==1?"s":""}`},
            appealsNearingDeadline>0&&{label:`${appealsNearingDeadline} appeal${appealsNearingDeadline!==1?"s":""} nearing deadline`},
            outcomesAwaitingApproval>0&&{label:`${outcomesAwaitingApproval} outcome${outcomesAwaitingApproval!==1?"s":""} awaiting approval`},
            investigationsOverrunning>0&&{label:`${investigationsOverrunning} investigation${investigationsOverrunning!==1?"s":""} overrunning`},
          ].filter(Boolean);

          return (
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,marginBottom:24,overflow:"hidden"}}>
              <div style={{padding:"14px 18px",borderBottom:rows.length>0?"1px solid #E8E0D0":"none",fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase"}}>Needs attention</div>
              {rows.map((r,i)=>{
                const Tag=r.clickable?"button":"div";
                return (
                  <Tag key={r.key} type={r.clickable?"button":undefined} onClick={r.onClick} title={r.label}
                    style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 18px",border:"none",background:"none",cursor:r.clickable?"pointer":"default",textAlign:"left",font:"inherit",fontFamily:"DM Sans,system-ui,sans-serif",borderBottom:i<rows.length-1?"1px solid #F5F1EA":"none"}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:r.color,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0,fontSize:12,fontWeight:r.rank===0?700:600,color:"#1C1820",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>
                    {r.clickable&&<span style={{color:"#C4BAB0",fontSize:14,flexShrink:0}}>›</span>}
                  </Tag>
                );
              })}
              {summaryParts.length>0&&(
                <div style={{padding:"10px 18px",fontSize:12,fontWeight:500,color:"#6B6375",lineHeight:1.7,borderTop:rows.length>0?"1px solid #F5F1EA":"none"}}>
                  {summaryParts.map((p,i)=>(
                    <span key={i} style={{fontWeight:500}}>
                      {p.onClick?(
                        <button onClick={p.onClick} style={{font:"inherit",fontWeight:500,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",padding:0}}>{p.label}</button>
                      ):p.label}
                      {i<summaryParts.length-1&&<span style={{color:"#C4BAB0"}}> · </span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Main grid ── */}
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 320px",gap:20,alignItems:"start"}}>

          {/* ── Left ── */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Cases header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820",fontWeight:400}}>Active cases</div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{position:"relative"}}>
                  <svg style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"#9B9098",pointerEvents:"none"}} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input aria-label="Search cases" value={dashSearch} onChange={e=>setDashSearch(e.target.value)} placeholder="Search cases…" style={{paddingLeft:28,paddingRight:10,paddingTop:7,paddingBottom:7,fontSize:12,border:"1px solid #E8E0D0",borderRadius:7,background:"#FFFFFF",color:"#1C1820",fontFamily:"DM Sans,system-ui,sans-serif",outline:"none",width:160}}/>
                </div>
                {["active","investigation","disciplinary","closed"].map(s=>(
                  <button key={s} onClick={()=>setDashFilter(s)} style={{fontSize:11,padding:"5px 11px",borderRadius:20,border:"1px solid",borderColor:dashFilter===s?"#7C5CFC":"#E8E0D0",background:dashFilter===s?"#EDE8FF":"#FFFFFF",color:dashFilter===s?"#7C5CFC":"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:dashFilter===s?600:400,whiteSpace:"nowrap"}}>
                    {s.charAt(0).toUpperCase()+s.slice(1)}
                  </button>
                ))}
                <button onClick={()=>setScreen(SCREENS.CASES)} style={{fontSize:12,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,whiteSpace:"nowrap"}}>View all →</button>
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

            {/* Today's meetings — Phase 7.5C — this used to be a full
                7-day mini-calendar grid plus Connect Google/Outlook
                Calendar buttons, duplicating the dedicated "Calendar" nav
                destination (a real month view) and Settings → Integrations
                (which already has the real connect/disconnect controls).
                Reduced to what Home actually needs answered — "do I have
                anything today" — with everything else one click away via
                the destinations that already own it. */}
            {(()=>{
              const today=new Date();
              const caseMeetings=cases.flatMap(cs=>(cs.meetings||[]).map(m=>({...m,employeeName:cs.employeeName,caseId:cs.id})));
              const todayMeetings=caseMeetings.filter(m=>{
                if(!m.date)return false;
                const parts=m.date.split("/");
                if(parts.length===3){const md=new Date(parts[2],parts[1]-1,parts[0]);return md.toDateString()===today.toDateString();}
                return false;
              });
              return (
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                  <div style={{padding:"14px 18px",borderBottom:"1px solid #E8E0D0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1C1820",fontWeight:400}}>Today</div>
                    <button onClick={()=>setScreen(SCREENS.CALENDAR)} style={{fontSize:12,color:"#7C5CFC",background:"none",border:"none",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Calendar →</button>
                  </div>
                  <div style={{padding:"12px 18px"}}>
                    {todayMeetings.length>0?(
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {todayMeetings.map((m,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",background:"#FDFAF5",borderRadius:8}}>
                            <div style={{width:3,height:28,background:"#7C5CFC",borderRadius:2,flexShrink:0}}/>
                            <div style={{flex:1}}>
                              <div style={{fontSize:12,fontWeight:600,color:"#1C1820"}}>{m.employeeName}</div>
                              <div style={{fontSize:11,color:"#9B9098"}}>{m.type||"Meeting"}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ):(
                      <div style={{fontSize:12,color:"#9B9098"}}>No meetings logged today.</div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Right column ── */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Secondary assistance (Level 3) — Phase 7.5C merges what
                used to be three separate bordered cards (Compass
                Recommendations, Potential Bottlenecks, and a "Quick
                links"/"Suggested for you" block) into one container.
                Quick links is gone outright, not just visually folded in:
                it was a second, weaker "AI suggests you click into a
                case" list duplicating Compass Recommendations' own
                purpose in the same column, and its policy suggestions are
                still one click away via Settings → Policies — nothing it
                offered is actually lost, only the redundant second
                container. Recommendations and Bottlenecks stay two real,
                different signals, just sharing one outer card with a
                divider instead of each getting its own border/corners/
                header treatment — content, ranking and AI logic for both
                are completely untouched, this is presentation only. */}
            {(()=>{
              const recommendations=topOpenSignalsOrgWide(caseSignals,["next_action","process_risk"],5);
              const bottlenecks=computeStageBottlenecks(cases, processTemplates);
              if(recommendations.length===0&&bottlenecks.length===0) return null;
              return (
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                  {recommendations.length>0&&(
                    <>
                      <div style={{padding:"12px 18px",borderBottom:"1px solid #E8E0D0"}}>
                        <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>AI-prioritised</div>
                        <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:15,color:"#1C1820",fontWeight:400}}>Compass Recommendations</div>
                      </div>
                      <div style={{padding:"4px 0"}}>
                        {recommendations.map((sig,i)=>{
                          const cs=cases.find(c=>c.id===sig.caseId);
                          const meta=signalTypeMeta(sig.type);
                          return (
                            <button key={sig.id} onClick={()=>{if(!cs) return; setActiveCaseId(cs.id); setActiveCaseStage("investigation"); setScreen(SCREENS.CASE_VIEW);}} style={{width:"100%",display:"flex",alignItems:"flex-start",gap:10,padding:"10px 18px",border:"none",background:"none",cursor:cs?"pointer":"default",textAlign:"left",fontFamily:"DM Sans,system-ui,sans-serif",borderBottom:i<recommendations.length-1?"1px solid #F5F1EA":"none",transition:"background 0.1s"}}
                              onMouseEnter={e=>{if(cs) e.currentTarget.style.background="#FDFAF5";}}
                              onMouseLeave={e=>e.currentTarget.style.background="none"}>
                              <div style={{width:6,height:6,borderRadius:"50%",background:meta.color,flexShrink:0,marginTop:5}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:12,color:"#1C1820",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sig.title}</div>
                                <div style={{fontSize:10,color:"#9B9098",marginTop:1}}>{cs?.employeeName||"Unknown case"} · {meta.label}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {bottlenecks.length>0&&(
                    <>
                      <div style={{padding:"12px 18px",borderBottom:"1px solid #E8E0D0",borderTop:recommendations.length>0?"1px solid #E8E0D0":"none"}}>
                        <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>Running long</div>
                        <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:15,color:"#1C1820",fontWeight:400}}>Potential Bottlenecks</div>
                      </div>
                      <div style={{padding:"4px 0"}}>
                        {bottlenecks.slice(0,5).map((b,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 18px",borderBottom:i<Math.min(bottlenecks.length,5)-1?"1px solid #F5F1EA":"none"}}>
                            <div style={{width:6,height:6,borderRadius:"50%",background:"#E8622A",flexShrink:0}}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:12,color:"#1C1820",fontWeight:500}}>{b.processType} · {b.stage}</div>
                              <div style={{fontSize:10,color:"#9B9098",marginTop:1}}>{b.caseCount} case{b.caseCount!==1?"s":""} · avg {b.avgDays}d (target {b.targetDays}d)</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{padding:"8px 18px",borderTop:"1px solid #F5F1EA",fontSize:10,color:"#9B9098"}}>Guideline only, not a statutory deadline.</div>
                    </>
                  )}
                </div>
              );
            })()}

          </div>
        </div>
      </div>
    </div>
  );
}
