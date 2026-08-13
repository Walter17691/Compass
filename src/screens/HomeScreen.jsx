import { SCREENS } from '../constants';
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
export function HomeScreen({ cases, getCaseStage, currentUser, getNextStep, setMeetingSetup, setScreen, setShowCasePrompt, dueSoon, dashSearch, setDashSearch, dashFilter, setDashFilter, setActiveCaseId, setActiveCaseStage, fmtDate, showToast, calendarConnected, connectGoogleCalendar, disconnectGoogleCalendar, setSettingsSection, caseSignals=[], concernReferrals=[], isHR, hrReviewRequests=[], processTemplates=[] }) {
  const freshMeetingSetup = () => ({employee:"", employeeJobTitle:"", manager:currentUser?.name||"", chairJobTitle:"", type:"", date:new Date().toISOString().split("T")[0], linkedCaseId:null, linkedCaseName:null, representative:"", representativeRole:"colleague", participants:[]});
  return(
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 32px"}}>

        {/* ── Greeting + primary actions ── */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:16}}>
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
                return active+" active case"+(active!==1?"s":"")+(actions>0?" · "+actions+" requiring action":"");
              })()}
            </p>
          </div>
          <div style={{display:"flex",gap:10,flexShrink:0,marginTop:4}}>
            <button onClick={()=>{setMeetingSetup(freshMeetingSetup());setScreen(SCREENS.HOME+"_meeting");}} style={{fontSize:13,background:"#FFFFFF",border:"1.5px solid #7C5CFC",borderRadius:9,padding:"10px 20px",cursor:"pointer",color:"#7C5CFC",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Start meeting</button>
            <button onClick={()=>setShowCasePrompt(true)} style={{fontSize:13,background:"#7C5CFC",border:"none",borderRadius:9,padding:"10px 20px",cursor:"pointer",color:"#fff",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>+ New case</button>
          </div>
        </div>

        {/* ── Priority strip ── */}
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
          return (
            <div style={{background:"#FFF8F0",border:"1.5px solid #E8622A44",borderRadius:12,padding:"12px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#E8622A",letterSpacing:"0.5px",textTransform:"uppercase",flexShrink:0}}>Needs attention</div>
              {actions.slice(0,3).map((cs,i)=>(
                <button key={i} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}} title={`${cs.employeeName} · ${getNextStep(cs)?.label}`} style={{fontSize:12,color:"#E8622A",background:"#FFFFFF",border:"1px solid #E8622A44",borderRadius:20,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,whiteSpace:"nowrap",maxWidth:"calc(100vw - 64px)",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {cs.employeeName} · {getNextStep(cs)?.label}
                </button>
              ))}
              {pendingSigs>0&&<span style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",borderRadius:20,padding:"5px 12px",fontWeight:500}}>{pendingSigs} pending signature{pendingSigs!==1?"s":""}</span>}
              {overdue.slice(0,3).map((d,i)=>(
                <span key={"od"+i} title={`${d.label||d.employeeName} · Overdue`} style={{fontSize:12,color:"#C84B2F",background:"#FFF0ED",borderRadius:20,padding:"5px 12px",fontWeight:500,whiteSpace:"nowrap",maxWidth:"calc(100vw - 64px)",overflow:"hidden",textOverflow:"ellipsis",display:"inline-block"}}>
                  {d.label||d.employeeName} · Overdue
                </span>
              ))}
              {highRisk.slice(0,3).map((cs,i)=>(
                <button key={"risk"+i} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}} title={`${cs.employeeName} · HIGH risk`} style={{fontSize:12,color:"#C84B2F",background:"#FEF0EB",border:"1px solid #C84B2F44",borderRadius:20,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,whiteSpace:"nowrap",maxWidth:"calc(100vw - 64px)",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {cs.employeeName} · HIGH risk
                </button>
              ))}
              {appealsOutstanding.slice(0,3).map((cs,i)=>(
                <button key={"appeal"+i} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("appeal");setScreen(SCREENS.CASE_VIEW);}} title={`${cs.employeeName} · Appeal outstanding`} style={{fontSize:12,color:"#5B3FD4",background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:20,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,whiteSpace:"nowrap",maxWidth:"calc(100vw - 64px)",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {cs.employeeName} · Appeal outstanding
                </button>
              ))}
              {staleCases.slice(0,3).map((cs,i)=>{
                const lastUpdated=cs.updatedAt||cs.createdAt;
                const daysAgo=Math.floor((Date.now()-new Date(lastUpdated))/(1000*60*60*24));
                return (
                  <button key={"stale"+i} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}} title={`${cs.employeeName} · No activity in ${daysAgo} days`} style={{fontSize:12,color:"#6B6375",background:"#F5F1EA",border:"1px solid #E8E0D0",borderRadius:20,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,whiteSpace:"nowrap",maxWidth:"calc(100vw - 64px)",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {cs.employeeName} · No activity in {daysAgo}d
                  </button>
                );
              })}
              {openReferralsCount>0&&(
                <button onClick={()=>setScreen(SCREENS.CONCERNS)} style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:20,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,whiteSpace:"nowrap"}}>
                  {openReferralsCount} referral{openReferralsCount!==1?"s":""} awaiting triage
                </button>
              )}
              {proceduralWarnings>0&&(
                <span title="Open procedural guardrail warnings across all cases" style={{fontSize:12,color:"#B8850F",background:"#FFF6E0",borderRadius:20,padding:"5px 12px",fontWeight:500,whiteSpace:"nowrap"}}>
                  {proceduralWarnings} procedural warning{proceduralWarnings!==1?"s":""}
                </span>
              )}
              {appealsNearingDeadline>0&&(
                <span title="Appeals with a deadline coming up" style={{fontSize:12,color:"#5B3FD4",background:"#F5F3FF",borderRadius:20,padding:"5px 12px",fontWeight:500,whiteSpace:"nowrap"}}>
                  {appealsNearingDeadline} appeal{appealsNearingDeadline!==1?"s":""} nearing deadline
                </span>
              )}
              {outcomesAwaitingApproval>0&&(
                <span title="Outcomes prepared and awaiting approval sign-off" style={{fontSize:12,color:"#1A7A4A",background:"#EAF7EE",borderRadius:20,padding:"5px 12px",fontWeight:500,whiteSpace:"nowrap"}}>
                  {outcomesAwaitingApproval} outcome{outcomesAwaitingApproval!==1?"s":""} awaiting approval
                </span>
              )}
              {investigationsOverrunning>0&&(
                <span title="Investigations running longer than the target timescale" style={{fontSize:12,color:"#C84B2F",background:"#FFF0ED",borderRadius:20,padding:"5px 12px",fontWeight:500,whiteSpace:"nowrap"}}>
                  {investigationsOverrunning} investigation{investigationsOverrunning!==1?"s":""} overrunning
                </span>
              )}
            </div>
          );
        })()}

        {/* ── Stat cards ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:28}}>
          {(()=>{
            const active=cases.filter(cs=>getCaseStage(cs)!=="closed").length;
            const actions=cases.filter(cs=>getCaseStage(cs)!=="closed"&&getNextStep(cs)?.action).length;
            const pendingSigs=cases.reduce((a,cs)=>a+(cs.evidence||[]).filter(e=>e.signStatus==="pending"&&e.signId).length,0);
            const closedInMonth=(monthsAgo)=>cases.filter(cs=>{if(getCaseStage(cs)!=="closed")return false;const d=new Date(cs.updatedAt||cs.createdAt||0);const n=new Date();n.setMonth(n.getMonth()-monthsAgo);return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).length;
            const closedMonth=closedInMonth(0);
            const closedLastMonth=closedInMonth(1);
            const closedDelta=closedMonth-closedLastMonth;
            const updatedWeek=cases.filter(cs=>{const d=new Date(cs.updatedAt||cs.createdAt||0);return getCaseStage(cs)!=="closed"&&(Date.now()-d)<7*24*60*60*1000;}).length;
            return [
              {label:"Active cases",value:active,sub:updatedWeek>0?updatedWeek+" updated this week":"No updates this week",accent:"#7C5CFC"},
              {label:"Awaiting action",value:actions,sub:actions>0?"Review next steps below":"All up to date",accent:"#E8622A"},
              {label:"Pending signatures",value:pendingSigs,sub:pendingSigs>0?"Awaiting employee sign-off":"None outstanding",accent:"#1A7A4A"},
              {label:"Closed this month",value:closedMonth,sub:closedLastMonth>0?(closedDelta>0?"↑":closedDelta<0?"↓":"→")+Math.abs(closedDelta)+" vs last month":"No closures last month",accent:"#6B6375"},
            ].map(s=>(
              <div key={s.label} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>{s.label}</div>
                <div style={{fontSize:30,fontWeight:700,color:s.accent,fontFamily:"DM Serif Display,Georgia,serif",marginBottom:4,lineHeight:1}}>{s.value}</div>
                <div style={{fontSize:11,color:"#9B9098"}}>{s.sub}</div>
              </div>
            ));
          })()}
        </div>

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
                  <input value={dashSearch} onChange={e=>setDashSearch(e.target.value)} placeholder="Search cases…" style={{paddingLeft:28,paddingRight:10,paddingTop:7,paddingBottom:7,fontSize:12,border:"1px solid #E8E0D0",borderRadius:7,background:"#FFFFFF",color:"#1C1820",fontFamily:"DM Sans,system-ui,sans-serif",outline:"none",width:160}}/>
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
                      const daysAgo=lastUpdated?Math.floor((Date.now()-new Date(lastUpdated))/(1000*60*60*24)):null;
                      return (
                        <div key={cs.id}
                          onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}}
                          style={{display:"flex",alignItems:"center",padding:"13px 18px",borderBottom:i<visible.length-1||filtered.length>CASE_PREVIEW_LIMIT?"1px solid #F5F1EA":"none",cursor:"pointer",transition:"background 0.1s"}}
                          onMouseEnter={e=>e.currentTarget.style.background="#FDFAF5"}
                          onMouseLeave={e=>e.currentTarget.style.background="none"}>
                          <div style={{width:36,height:36,borderRadius:"50%",background:"#EDE8FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#7C5CFC",flexShrink:0,marginRight:14}}>
                            {(cs.employeeName||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,color:"#1C1820",marginBottom:1}}>{cs.employeeName}</div>
                            <div style={{fontSize:12,color:"#9B9098"}}>{cs.caseType||"HR Matter"}{next?" · "+next.label:""}</div>
                          </div>
                          <div style={{marginRight:16}}>
                            <span style={{fontSize:11,fontWeight:600,color:st.color,background:st.bg,borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap"}}>{st.label}</span>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0,minWidth:80}}>
                            <div style={{fontSize:11,color:"#9B9098",marginBottom:1}}>Last updated</div>
                            <div style={{fontSize:11,color:"#1C1820",fontWeight:500}}>{daysAgo===null?"—":daysAgo===0?"Today":daysAgo===1?"Yesterday":fmtDate(lastUpdated)}</div>
                          </div>
                          <div style={{marginLeft:12,color:"#C4BAB0",fontSize:16,flexShrink:0}}>›</div>
                        </div>
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

            {/* Calendar */}
            {(()=>{
              const today=new Date();
              const weekStart=new Date(today);
              weekStart.setDate(today.getDate()-today.getDay()+1);
              const weekDays=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);return d;});
              const caseMeetings=cases.flatMap(cs=>(cs.meetings||[]).map(m=>({...m,employeeName:cs.employeeName,caseId:cs.id})));
              const getMeetingsForDay=(d)=>caseMeetings.filter(m=>{
                if(!m.date)return false;
                const parts=m.date.split("/");
                if(parts.length===3){const md=new Date(parts[2],parts[1]-1,parts[0]);return md.toDateString()===d.toDateString();}
                return false;
              });
              const todayMeetings=getMeetingsForDay(today);
              return (
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                  <div style={{padding:"14px 18px",borderBottom:"1px solid #E8E0D0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>This week</div>
                      <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1C1820",fontWeight:400}}>Calendar</div>
                    </div>
                    <button onClick={()=>{setMeetingSetup(freshMeetingSetup());setScreen(SCREENS.HOME+"_meeting");}} style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Schedule meeting</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                    {weekDays.map((d,i)=>{
                      const isToday=d.toDateString()===today.toDateString();
                      const dayMeetings=getMeetingsForDay(d);
                      return (
                        <div key={i} style={{padding:"10px 6px",textAlign:"center",borderRight:i<6?"1px solid #F5F1EA":"none",borderBottom:"1px solid #F5F1EA",background:isToday?"#EDE8FF":"none",minHeight:70}}>
                          <div style={{fontSize:10,fontWeight:600,color:isToday?"#7C5CFC":"#9B9098",letterSpacing:"0.5px",marginBottom:3}}>{d.toLocaleDateString("en-GB",{weekday:"short"}).toUpperCase()}</div>
                          <div style={{fontSize:16,fontWeight:700,color:isToday?"#7C5CFC":"#1C1820",marginBottom:4}}>{d.getDate()}</div>
                          {dayMeetings.slice(0,2).map((m,j)=>(
                            <div key={j} onClick={e=>{e.stopPropagation();setActiveCaseId(m.caseId);setScreen(SCREENS.CASE_VIEW);}} style={{fontSize:9,background:isToday?"#7C5CFC":"#EDE8FF",color:isToday?"#fff":"#7C5CFC",borderRadius:3,padding:"2px 4px",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer",fontWeight:500}}>{m.employeeName}</div>
                          ))}
                          {dayMeetings.length>2&&<div style={{fontSize:9,color:"#9B9098"}}>+{dayMeetings.length-2} more</div>}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{padding:"12px 18px"}}>
                    {todayMeetings.length>0?(
                      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
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
                      <div style={{fontSize:12,color:"#9B9098",padding:"6px 0",marginBottom:8}}>No meetings logged today.</div>
                    )}
                    <div style={{display:"flex",gap:8,paddingTop:8,borderTop:"1px solid #F5F1EA"}}>
                      {calendarConnected?(
                        <button onClick={disconnectGoogleCalendar} style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Google Calendar connected — Disconnect</button>
                      ):(
                        <button onClick={connectGoogleCalendar} style={{fontSize:11,color:"#6B6375",background:"#F5F1EA",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Connect Google Calendar</button>
                      )}
                      <button onClick={()=>showToast("Outlook integration coming soon")} style={{fontSize:11,color:"#6B6375",background:"#F5F1EA",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Connect Outlook</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Right column ── */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Compass Recommendations — the highest-priority open signals
                org-wide (next_action/process_risk), already AI-written when
                each one was created (Next Best Action, Guardrails). Capped
                small deliberately — this is a shortlist, not another full
                list view; the case workspace's own Copilot banner is where
                the complete picture for any one case lives. */}
            {(()=>{
              const recommendations=topOpenSignalsOrgWide(caseSignals,["next_action","process_risk"],5);
              if(recommendations.length===0) return null;
              return (
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                  <div style={{padding:"14px 18px",borderBottom:"1px solid #E8E0D0"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>AI-prioritised</div>
                    <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1C1820",fontWeight:400}}>Compass Recommendations</div>
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
                </div>
              );
            })()}

            {/* Potential Bottlenecks (P17, §18) — average time-in-stage vs.
                a single advisory target, using P17's own stage-transition
                tracking (withStageTransitionStamp, hooked into saveCases).
                Same card styling as Compass Recommendations/Quick links
                above/below it. */}
            {(()=>{
              const bottlenecks=computeStageBottlenecks(cases, processTemplates);
              if(bottlenecks.length===0) return null;
              return (
                <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
                  <div style={{padding:"14px 18px",borderBottom:"1px solid #E8E0D0"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>Running long</div>
                    <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1C1820",fontWeight:400}}>Potential Bottlenecks</div>
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
                </div>
              );
            })()}

            {/* Quick links — context-aware */}
            <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden"}}>
              <div style={{padding:"14px 18px",borderBottom:"1px solid #E8E0D0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>Suggested for you</div>
                  <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1C1820",fontWeight:400}}>Quick links</div>
                </div>
              </div>
              <div style={{padding:"4px 0"}}>
                {(()=>{
                  // Every suggestion below used to route to setScreen(SETTINGS)
                  // regardless of which one was clicked — landing on the
                  // Billing tab no matter what, whether you clicked "Disciplinary
                  // outcome letter" or "ACAS Code of Practice" (which had no
                  // real content behind it at all). Each suggestion now carries
                  // the actual case it's about, so clicking it opens that case
                  // — where Case Copilot's own next-step banner already
                  // recommends the exact matching action — instead of a
                  // disconnected settings page.
                  const activeCases = cases.filter(cs=>getCaseStage(cs)!=="closed");
                  const findCase = (...needles) => activeCases.find(cs=>{
                    const t = (cs.caseType||"").toLowerCase();
                    return needles.some(n=>t.includes(n));
                  });
                  const investigationCase = activeCases.find(cs=>getCaseStage(cs)==="investigation");
                  const misconductCase = findCase("misconduct","disciplinary");
                  const grievanceCase = findCase("grievance");
                  const redundancyCase = findCase("redundancy");
                  const performanceCase = findCase("performance");

                  const suggested = [];
                  const addCase = (cs, label, type, reason) => cs && suggested.push({label, type, reason, caseId:cs.id});

                  addCase(investigationCase, "Continue investigation", "CASE", "Active investigation");
                  addCase(misconductCase, "Disciplinary Policy", "POLICY", "Misconduct case open");
                  addCase(misconductCase, "Continue disciplinary case", "CASE", "Misconduct case open");
                  addCase(grievanceCase, "Grievance Policy", "POLICY", "Grievance case open");
                  addCase(grievanceCase, "Continue grievance case", "CASE", "Grievance case open");
                  addCase(redundancyCase, "Redundancy Policy", "POLICY", "Redundancy case open");
                  addCase(performanceCase, "Performance management policy", "POLICY", "PIP case open");
                  addCase(performanceCase, "Continue performance case", "CASE", "PIP case open");

                  if(suggested.length===0) {
                    // No active case to point at — the only honest destination
                    // is the policy library itself, not a specific action.
                    suggested.push(
                      {label:"Disciplinary Policy",type:"POLICY",reason:"Set up your policy library",caseId:null},
                      {label:"Grievance Policy",type:"POLICY",reason:"Set up your policy library",caseId:null},
                      {label:"Redundancy Policy",type:"POLICY",reason:"Set up your policy library",caseId:null},
                    );
                  }

                  const openSuggestion = (item) => {
                    if(item.caseId) { setActiveCaseId(item.caseId); setActiveCaseStage("investigation"); setScreen(SCREENS.CASE_VIEW); }
                    else { setSettingsSection("policies"); setScreen(SCREENS.SETTINGS); }
                  };

                  return suggested.slice(0,5).map((item,i)=>(
                    <button key={i} onClick={()=>openSuggestion(item)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 18px",border:"none",background:"none",cursor:"pointer",textAlign:"left",fontFamily:"DM Sans,system-ui,sans-serif",borderBottom:i<Math.min(suggested.length,5)-1?"1px solid #F5F1EA":"none",transition:"background 0.1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#FDFAF5"}
                      onMouseLeave={e=>e.currentTarget.style.background="none"}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,color:"#1C1820",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.label}</div>
                        <div style={{fontSize:10,color:"#9B9098",marginTop:1}}>{item.type} · {item.reason}</div>
                      </div>
                      <span style={{color:"#C4BAB0",fontSize:14,flexShrink:0}}>›</span>
                    </button>
                  ));
                })()}
                <button onClick={()=>{setSettingsSection("policies");setScreen(SCREENS.SETTINGS);}} style={{width:"100%",padding:"10px 18px",border:"none",background:"none",cursor:"pointer",textAlign:"center",fontSize:12,color:"#7C5CFC",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>View all policies & templates →</button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
