import { useState } from 'react';
import { SCREENS } from '../constants';
import { CompassLogo } from '../components/CompassLogo';
import { ActivityBell } from '../components/ActivityBell';
import { getCurrentRisk } from '../lib/caseStage';

export function HomeScreen({ cases, getCaseStage, org, setShowOrgSettings, onSignOut, currentUser, auditLog, getNextStep, setMeetingType, setCaseInfo, setScreen, setShowCasePrompt, dueSoon, policies, dashSearch, setDashSearch, dashFilter, setDashFilter, setActiveCaseId, setActiveCaseStage, fmtDate, showToast, calendarConnected, connectGoogleCalendar, disconnectGoogleCalendar, isMobile, requirePro }) {
  const [showMobileNav, setShowMobileNav] = useState(false);
  const goToScreen = (s) => {
    if(s===SCREENS.DSAR) { requirePro('dsar', ()=>setScreen(s)); return; }
    setScreen(s);
  };
  const navItems = [
    {label:"Home", s:SCREENS.HOME},
    {label:"Cases", s:SCREENS.CASES, badge:cases.filter(x=>getCaseStage(x)!=="closed").length||null},
    {label:"People", s:SCREENS.PEOPLE},
    {label:"Reports", s:SCREENS.ERREPORT},
    {label:"DSAR", s:SCREENS.DSAR},
    {label:"Search", s:SCREENS.SEARCH},
    {label:"Settings", s:SCREENS.SETTINGS},
  ];
  return(
    <div style={{minHeight:"100vh",background:"#FDFAF5",fontFamily:"DM Sans,system-ui,sans-serif"}}>

      {/* ── Top bar (home-specific, replaces main header) ── */}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #E8E0D0",padding:"10px 32px",minHeight:56,display:"flex",flexWrap:"wrap",rowGap:8,alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:32}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <CompassLogo size={30}/>
            <div>
              <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:18,color:"#1C1820",fontWeight:400,letterSpacing:"-0.3px",lineHeight:1.1}}>Compass</div>
              <div style={{fontSize:8,color:"#9B9098",letterSpacing:"1.5px",textTransform:"uppercase",lineHeight:1}}>HR Intelligence</div>
            </div>
          </div>
          {isMobile?(
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowMobileNav(v=>!v)} aria-label="Menu" style={{background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:16,color:"#6B6375"}}>☰</button>
              {showMobileNav&&(
                <nav style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",display:"flex",flexDirection:"column",minWidth:180,zIndex:200,overflow:"hidden"}}>
                  {navItems.map((item,i)=>(
                    <button key={i} onClick={()=>{goToScreen(item.s);setShowMobileNav(false);}} style={{display:"flex",alignItems:"center",gap:5,fontSize:13,padding:"10px 14px",border:"none",background:item.s===SCREENS.HOME?"#EDE8FF":"none",color:item.s===SCREENS.HOME?"#7C5CFC":"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:item.s===SCREENS.HOME?600:400,textAlign:"left"}}>
                      {item.label}
                      {item.badge>0&&<span style={{fontSize:10,background:"#7C5CFC",color:"#fff",borderRadius:10,padding:"1px 6px",fontWeight:700}}>{item.badge}</span>}
                    </button>
                  ))}
                </nav>
              )}
            </div>
          ):(
            <nav style={{display:"flex",gap:2}}>
              {navItems.map((item,i)=>(
                <button key={i} onClick={()=>goToScreen(item.s)} style={{display:"flex",alignItems:"center",gap:5,fontSize:13,padding:"6px 12px",borderRadius:7,border:"none",background:item.s===SCREENS.HOME?"#EDE8FF":"none",color:item.s===SCREENS.HOME?"#7C5CFC":"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:item.s===SCREENS.HOME?600:400}}>
                  {item.label}
                  {item.badge>0&&<span style={{fontSize:10,background:"#7C5CFC",color:"#fff",borderRadius:10,padding:"1px 6px",fontWeight:700}}>{item.badge}</span>}
                </button>
              ))}
            </nav>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {!isMobile&&org?.name&&<span style={{fontSize:11,color:"#9B9098",background:"#F5F1EA",borderRadius:6,padding:"3px 8px"}}>{org.name}</span>}
          <ActivityBell auditLog={auditLog}/>
          {!isMobile&&<button onClick={()=>setShowOrgSettings(true)} style={{fontSize:12,color:"#6B6375",background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Org Settings</button>}
          {onSignOut&&<button onClick={onSignOut} style={{fontSize:12,color:"#6B6375",background:"none",border:"1px solid #E8E0D0",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Sign out</button>}
        </div>
      </div>

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
            <button onClick={()=>{setMeetingType(null);setCaseInfo(p=>({...p,employee:"",employeeJobTitle:"",manager:currentUser?.name||"",chairJobTitle:"",date:new Date().toISOString().split("T")[0]}));setScreen(SCREENS.BRIEF);}} style={{fontSize:13,background:"#FFFFFF",border:"1.5px solid #7C5CFC",borderRadius:9,padding:"10px 20px",cursor:"pointer",color:"#7C5CFC",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Start meeting</button>
            <button onClick={()=>setShowCasePrompt(true)} style={{fontSize:13,background:"#7C5CFC",border:"none",borderRadius:9,padding:"10px 20px",cursor:"pointer",color:"#fff",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>+ New case</button>
          </div>
        </div>

        {/* ── Priority strip ── */}
        {(()=>{
          const actions=cases.filter(cs=>getCaseStage(cs)!=="closed"&&getNextStep(cs)?.action);
          const pendingSigs=cases.reduce((a,cs)=>a+(cs.evidence||[]).filter(e=>e.signStatus==="pending"&&e.signId).length,0);
          const overdue=dueSoon.filter(d=>d.overdue);
          const highRisk=cases.filter(cs=>getCaseStage(cs)!=="closed"&&getCurrentRisk(cs)==="HIGH");
          if(actions.length===0&&pendingSigs===0&&overdue.length===0&&highRisk.length===0) return null;
          return (
            <div style={{background:"#FFF8F0",border:"1.5px solid #E8622A44",borderRadius:12,padding:"12px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#E8622A",letterSpacing:"0.5px",textTransform:"uppercase",flexShrink:0}}>Needs attention</div>
              {actions.slice(0,3).map((cs,i)=>(
                <button key={i} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}} style={{fontSize:12,color:"#E8622A",background:"#FFFFFF",border:"1px solid #E8622A44",borderRadius:20,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,whiteSpace:"nowrap"}}>
                  {cs.employeeName} · {getNextStep(cs)?.label}
                </button>
              ))}
              {pendingSigs>0&&<span style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",borderRadius:20,padding:"5px 12px",fontWeight:500}}>{pendingSigs} pending signature{pendingSigs!==1?"s":""}</span>}
              {overdue.length>0&&<span style={{fontSize:12,color:"#C84B2F",background:"#FFF0ED",borderRadius:20,padding:"5px 12px",fontWeight:500}}>{overdue.length} overdue deadline{overdue.length!==1?"s":""}</span>}
              {highRisk.slice(0,3).map((cs,i)=>(
                <button key={"risk"+i} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}} style={{fontSize:12,color:"#C84B2F",background:"#FEF0EB",border:"1px solid #C84B2F44",borderRadius:20,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500,whiteSpace:"nowrap"}}>
                  {cs.employeeName} · HIGH risk
                </button>
              ))}
            </div>
          );
        })()}

        {/* ── Stat cards ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:28}}>
          {(()=>{
            const active=cases.filter(cs=>getCaseStage(cs)!=="closed").length;
            const actions=cases.filter(cs=>getCaseStage(cs)!=="closed"&&getNextStep(cs)?.action).length;
            const pendingSigs=cases.reduce((a,cs)=>a+(cs.evidence||[]).filter(e=>e.signStatus==="pending"&&e.signId).length,0);
            const closedMonth=cases.filter(cs=>{if(getCaseStage(cs)!=="closed")return false;const d=new Date(cs.updatedAt||cs.createdAt||0);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).length;
            const updatedWeek=cases.filter(cs=>{const d=new Date(cs.updatedAt||cs.createdAt||0);return getCaseStage(cs)!=="closed"&&(Date.now()-d)<7*24*60*60*1000;}).length;
            const overdueCount=dueSoon.filter(d=>d.overdue).length;
            return [
              {label:"Active cases",value:active,sub:updatedWeek>0?updatedWeek+" updated this week":"No updates this week",accent:"#7C5CFC"},
              {label:"Awaiting action",value:actions,sub:actions>0?"Review next steps below":"All up to date",accent:"#E8622A"},
              {label:"Pending signatures",value:pendingSigs,sub:pendingSigs>0?"Awaiting employee sign-off":"None outstanding",accent:"#1A7A4A"},
              {label:"Closed this month",value:closedMonth,sub:overdueCount>0?overdueCount+" deadline"+(overdueCount!==1?"s":"")+" overdue":"No overdue deadlines",accent:"#6B6375"},
            ].map(s=>(
              <div key={s.label} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>{s.label}</div>
                <div style={{fontSize:30,fontWeight:700,color:s.accent,fontFamily:"DM Serif Display,Georgia,serif",marginBottom:4,lineHeight:1}}>{s.value}</div>
                <div style={{fontSize:11,color:"#9B9098"}}>{s.sub}</div>
              </div>
            ));
          })()}
        </div>

        {/* ── Resources strip ── */}
        <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
          {(()=>{
            const links = policies.length>0
              ? policies.slice(0,4).map(p=>({label:p.name||p.title||"Policy",type:"POLICY"}))
              : [{label:"Disciplinary Policy",type:"POLICY"},{label:"Grievance Policy",type:"POLICY"},{label:"ACAS Code of Practice",type:"GUIDE"},{label:"Invitation to hearing",type:"TEMPLATE"}];
            return links.map((item,i)=>(
              <button key={i} onClick={()=>setScreen(SCREENS.SETTINGS)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:8,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",transition:"border-color 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#7C5CFC"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="#E8E0D0"}>
                <div style={{width:4,height:4,borderRadius:"50%",background:"#E8622A",flexShrink:0}}/>
                <span style={{fontSize:11,color:"#6B6375",fontWeight:500}}>{item.type}</span>
                <span style={{fontSize:12,color:"#1C1820",fontWeight:600}}>{item.label}</span>
              </button>
            ));
          })()}
          <button onClick={()=>setScreen(SCREENS.SETTINGS)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:"none",border:"1px dashed #E8E0D0",borderRadius:8,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontSize:12,color:"#9B9098"}}>View all →</button>
        </div>

        {/* ── Deadlines strip ── */}
        {dueSoon.length>0&&(
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",flexShrink:0}}>Deadlines</span>
            {dueSoon.slice(0,4).map((d,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:"#FFFFFF",border:"1px solid",borderColor:d.overdue?"#E8622A44":"#E8E0D0",borderRadius:8}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:d.overdue?"#C84B2F":d.daysLeft<=3?"#E8622A":"#7C5CFC",flexShrink:0}}/>
                <span style={{fontSize:12,color:"#1C1820",fontWeight:500}}>{d.label||d.employeeName}</span>
                <span style={{fontSize:11,color:d.overdue?"#C84B2F":"#9B9098"}}>· {d.overdue?"Overdue":d.daysLeft===0?"Today":"In "+d.daysLeft+"d"}</span>
              </div>
            ))}
          </div>
        )}

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
                return filtered.map((cs,i)=>{
                  const next=getNextStep(cs);
                  const stage=getCaseStage(cs);
                  const st=statusMap[cs.stage||stage]||statusMap.open;
                  const lastUpdated=cs.updatedAt||cs.createdAt;
                  const daysAgo=lastUpdated?Math.floor((Date.now()-new Date(lastUpdated))/(1000*60*60*24)):null;
                  return (
                    <div key={cs.id}
                      onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}}
                      style={{display:"flex",alignItems:"center",padding:"13px 18px",borderBottom:i<filtered.length-1?"1px solid #F5F1EA":"none",cursor:"pointer",transition:"background 0.1s"}}
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
                });
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
                    <button onClick={()=>{setMeetingType(null);setCaseInfo(p=>({...p,employee:"",manager:currentUser?.name||"",date:new Date().toISOString().split("T")[0]}));setScreen(SCREENS.BRIEF);}} style={{fontSize:12,color:"#7C5CFC",background:"#EDE8FF",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Schedule meeting</button>
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
                        <button onClick={disconnectGoogleCalendar} style={{fontSize:11,color:"#1A7A4A",background:"#E8F5EE",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>Google Calendar connected ✓ — Disconnect</button>
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
                  const activeCaseTypes = cases.filter(cs=>getCaseStage(cs)!=="closed").map(cs=>(cs.caseType||"").toLowerCase());
                  const hasMisconduct = activeCaseTypes.some(t=>t.includes("misconduct")||t.includes("disciplinary"));
                  const hasGrievance = activeCaseTypes.some(t=>t.includes("grievance"));
                  const hasInvestigation = cases.some(cs=>getCaseStage(cs)==="investigation");
                  const hasRedundancy = activeCaseTypes.some(t=>t.includes("redundancy"));
                  const hasPerformance = activeCaseTypes.some(t=>t.includes("performance"));

                  const suggested = [];

                  if(hasInvestigation) {
                    suggested.push({label:"Investigation report template",type:"TEMPLATE",reason:"Active investigation"});
                    suggested.push({label:"Witness statement form",type:"TEMPLATE",reason:"Active investigation"});
                  }
                  if(hasMisconduct) {
                    suggested.push({label:"Disciplinary Policy",type:"POLICY",reason:"Misconduct case open"});
                    suggested.push({label:"Invitation to disciplinary hearing",type:"TEMPLATE",reason:"Misconduct case open"});
                    suggested.push({label:"Disciplinary outcome letter",type:"TEMPLATE",reason:"Misconduct case open"});
                  }
                  if(hasGrievance) {
                    suggested.push({label:"Grievance Policy",type:"POLICY",reason:"Grievance case open"});
                    suggested.push({label:"Grievance hearing invitation",type:"TEMPLATE",reason:"Grievance case open"});
                  }
                  if(hasRedundancy) {
                    suggested.push({label:"Redundancy Policy",type:"POLICY",reason:"Redundancy case open"});
                    suggested.push({label:"At risk letter",type:"TEMPLATE",reason:"Redundancy case open"});
                  }
                  if(hasPerformance) {
                    suggested.push({label:"Performance Improvement Plan",type:"TEMPLATE",reason:"PIP case open"});
                    suggested.push({label:"Performance management policy",type:"POLICY",reason:"PIP case open"});
                  }
                  if(suggested.length===0) {
                    suggested.push(
                      {label:"Disciplinary Policy",type:"POLICY",reason:"Most used"},
                      {label:"Grievance Policy",type:"POLICY",reason:"Most used"},
                      {label:"ACAS Code of Practice",type:"GUIDE",reason:"Most used"},
                      {label:"Invitation to hearing",type:"TEMPLATE",reason:"Most used"},
                      {label:"Outcome letter",type:"TEMPLATE",reason:"Most used"}
                    );
                  }

                  return suggested.slice(0,5).map((item,i)=>(
                    <button key={i} onClick={()=>setScreen(SCREENS.SETTINGS)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 18px",border:"none",background:"none",cursor:"pointer",textAlign:"left",fontFamily:"DM Sans,system-ui,sans-serif",borderBottom:i<Math.min(suggested.length,5)-1?"1px solid #F5F1EA":"none",transition:"background 0.1s"}}
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
                <button onClick={()=>setScreen(SCREENS.SETTINGS)} style={{width:"100%",padding:"10px 18px",border:"none",background:"none",cursor:"pointer",textAlign:"center",fontSize:12,color:"#7C5CFC",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>View all policies & templates →</button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
