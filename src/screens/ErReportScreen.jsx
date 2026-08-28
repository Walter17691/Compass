import { SCREENS } from '../constants';
import { authedFetch } from '../lib/authedFetch';
import { useLoadMore } from '../hooks/useLoadMore';
import { themeFrequency } from '../lib/themes';
import { daysBetween } from '../lib/dateMath';
import { COLOR, TYPE, FONT, RADIUS, SPACE } from '../styles/tokens';

export function ErReportScreen({ cases, getCaseStage, employeeRecords, setReportNarrative, reportNarrative, setActiveCaseId, setActiveCaseStage, setScreen, setActivePerson, getNextStep, fmtDate, loadJsPDF, caseThemes, organisationThemes, isHR }) {
  // ── Core data calculations ──
  const activeCases = cases.filter(cs=>getCaseStage(cs)!=="closed");
  const activeCasesTable = useLoadMore(activeCases, 20);
  const closedCases = cases.filter(cs=>getCaseStage(cs)==="closed");
  const employeeRecordsMap = {};
  (employeeRecords||[]).forEach(r=>{employeeRecordsMap[r.name]=r;});

  // Case type breakdown
  const casesByType = {};
  cases.forEach(cs=>{const t=cs.caseType||"Other";casesByType[t]=(casesByType[t]||0)+1;});
  const caseTypeList = Object.entries(casesByType).sort((a,b)=>b[1]-a[1]);

  // Case stage breakdown
  const byStage = {open:0,investigation:0,disciplinary:0,hearing:0,closed:0,appeal:0};
  cases.forEach(cs=>{const s=getCaseStage(cs);if(byStage[s]!==undefined)byStage[s]++;});

  // Outcomes
  const outcomes = cases.filter(cs=>cs.outcome).map(cs=>cs.outcome);
  const outcomeCounts = {};
  outcomes.forEach(o=>{outcomeCounts[o]=(outcomeCounts[o]||0)+1;});
  const outcomeList = Object.entries(outcomeCounts).sort((a,b)=>b[1]-a[1]);

  // Location breakdown
  const byLocation = {};
  cases.forEach(cs=>{const l=cs.location||employeeRecordsMap[cs.employeeName]?.location||"Not specified";byLocation[l]=(byLocation[l]||0)+1;});
  const locationList = Object.entries(byLocation).sort((a,b)=>b[1]-a[1]);

  // Monthly case volume (last 6 months)
  const monthlyVolume = {};
  const now = new Date();
  for(let i=5;i>=0;i--){const d=new Date(now);d.setMonth(d.getMonth()-i);const k=d.toLocaleDateString("en-GB",{month:"short",year:"2-digit"});monthlyVolume[k]=0;}
  cases.forEach(cs=>{
    const d=new Date(cs.dateReceived||cs.createdAt||0);
    const k=d.toLocaleDateString("en-GB",{month:"short",year:"2-digit"});
    if(monthlyVolume[k]!==undefined) monthlyVolume[k]++;
  });
  const monthLabels = Object.keys(monthlyVolume);
  const monthValues = Object.values(monthlyVolume);
  const maxMonthVal = Math.max(...monthValues,1);

  // Resolution times
  const resTimes = closedCases.filter(cs=>(cs.meetings||[]).length>0).map(cs=>{
    const dates=(cs.meetings||[]).map(m=>new Date(m.savedAt||m.date||0)).filter(d=>!isNaN(d)).sort((a,b)=>a-b);
    if(dates.length<2) return null;
    return daysBetween(dates[0], dates[dates.length-1]);
  }).filter(Boolean);
  const avgResolution = resTimes.length?Math.round(resTimes.reduce((a,b)=>a+b,0)/resTimes.length):null;

  // Month-over-month deltas — only computed where the underlying data
  // genuinely supports an apples-to-apples comparison (no snapshot/
  // history table exists, so anything relying on "state as of N days ago"
  // beyond what a timestamp already tells us would just be fabricated).
  // Phase 6.5 hardening (Batch 12) — this raw ms-based DAY_MS diff is
  // deliberately kept for the *window-threshold* checks below (daysAgo
  // compared against fixed 30/60/28-day boundaries): those are rolling
  // elapsed-time windows, not calendar-day counts meant for display, and
  // the DST-driven fractional error (~1 hour either side) is negligible
  // against a 28+ day threshold. Only the actual calendar-day COUNTS
  // shown to the user (resolution time, days open) were switched to
  // dateMath.daysBetween — see those call sites below.
  const DAY_MS = 1000*60*60*24;
  const openedInWindow = (startDaysAgo, endDaysAgo) => cases.filter(cs=>{
    const d = new Date(cs.dateReceived||cs.createdAt||0);
    if(isNaN(d)) return false;
    const daysAgo = (now-d)/DAY_MS;
    return daysAgo>=endDaysAgo && daysAgo<startDaysAgo;
  }).length;
  const casesOpenedLast30 = openedInWindow(30,0);
  const casesOpenedPrev30 = openedInWindow(60,30);
  const casesDelta = casesOpenedPrev30>0 ? casesOpenedLast30-casesOpenedPrev30 : null;

  const resolutionInWindow = (startDaysAgo, endDaysAgo) => {
    const times = closedCases.filter(cs=>(cs.meetings||[]).length>0).map(cs=>{
      const dates=(cs.meetings||[]).map(m=>new Date(m.savedAt||m.date||0)).filter(d=>!isNaN(d)).sort((a,b)=>a-b);
      if(dates.length<2) return null;
      const closedDate = dates[dates.length-1];
      const daysAgo = (now-closedDate)/DAY_MS;
      if(daysAgo<endDaysAgo || daysAgo>=startDaysAgo) return null;
      return daysBetween(dates[0], closedDate);
    }).filter(t=>t!==null);
    return times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : null;
  };
  const avgResolutionLast30 = resolutionInWindow(30,0);
  const avgResolutionPrev30 = resolutionInWindow(60,30);
  const resolutionDelta = (avgResolutionLast30!=null && avgResolutionPrev30!=null) ? avgResolutionLast30-avgResolutionPrev30 : null;

  // High risk cases
  const highRisk = cases.filter(cs=>(cs.meetings||[]).some(m=>m.riskScore?.rating==="HIGH"));

  // ACAS compliance — cases with investigation > 28 days unresolved
  const slowInvestigations = cases.filter(cs=>{
    if(getCaseStage(cs)==="closed"||cs.investigationReport) return false;
    const invMeetings=(cs.meetings||[]).filter(m=>(m.type||"").toLowerCase().includes("investigation"));
    if(!invMeetings.length) return false;
    const first=invMeetings[0];
    const start=new Date(first.savedAt||first.date||0);
    return (now-start)/(1000*60*60*24)>28;
  });

  // Pending signatures
  const pendingSigs = cases.reduce((a,cs)=>a+(cs.evidence||[]).filter(e=>e.signStatus==="pending"&&e.signId).length,0);

  // Repeat cases — employees with 2+ cases
  const casesByEmployee = {};
  cases.forEach(cs=>{casesByEmployee[cs.employeeName]=(casesByEmployee[cs.employeeName]||0)+1;});
  const repeatEmployees = Object.entries(casesByEmployee).filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]);

  // Phase 18 — recurring themes, the second signal (alongside the
  // month-over-month deltas above) that gives "Generate AI summary"
  // genuine pattern-finding material instead of only headline counts.
  // Phase 6.5 hardening (Batch 5): counts HR-curated case_themes tags,
  // not raw case description/title text — the old raw-text extraction
  // had no defence against a real person's name appearing 2+ times
  // across different cases and surfacing as a "recurring theme," which
  // was especially risky here since this feeds straight into AI-
  // generated executive-summary prose below.
  const themeFrequencies = themeFrequency(caseThemes, organisationThemes);

  const StatBox = ({label,value,sub,accent=COLOR.ink})=>(
    <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"16px 18px"}}>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:8}}>{label}</div>
      <div style={{fontSize:26,fontWeight:700,color:accent,fontFamily:FONT.serif,marginBottom:4,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:COLOR.inkFaint}}>{sub}</div>}
    </div>
  );

  // Phase 2C — one neutral bar colour by default (case type/location/
  // pipeline-stage breakdowns are categories, not urgency states — the
  // old rainbow cycling through 5 arbitrary colours per case type
  // implied distinctions that don't exist). Callers still pass an
  // explicit `color` where it's genuinely semantic (none currently do).
  const BarRow = ({label,value,max,color=COLOR.inkQuiet,right})=>(
    <div style={{marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:12,color:COLOR.ink,fontWeight:500}}>{label}</span>
        <span style={{fontSize:12,color:COLOR.inkFaint}}>{right||value}</span>
      </div>
      <div style={{background:COLOR.borderFaint,borderRadius:3,height:6}}>
        <div style={{background:color,borderRadius:3,height:6,width:`${Math.round((value/max)*100)}%`,transition:"width 0.3s"}}/>
      </div>
    </div>
  );

  return(
    <div>

        {/* Header — restrained: this already renders inside Insights'
            own "Reports" tab (its own PageHeader), so this is a
            secondary, plain heading, not a second identity moment. */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:SPACE.xl,flexWrap:"wrap",gap:12}}>
          <div>
            <h2 style={{...TYPE.sectionHeading,color:COLOR.inkFaint,margin:"0 0 4px",fontWeight:700}}>HR Reports</h2>
            <p style={{fontSize:13,color:COLOR.inkFaint,margin:0}}>Organisation-wide employee relations overview · {cases.length} total cases</p>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={async()=>{
            // Phase 18 — the deltas below already existed (computed up top
            // for the stat cards) but never actually reached this prompt;
            // themeFrequencies is the other new signal. Both are real,
            // computed-not-invented pattern material — the wording
            // constraint stops the model turning "a correlation exists"
            // into "X caused Y" or naming anyone specific.
            const deltaText = casesDelta!=null ? "New cases this month vs last: "+(casesDelta>0?"+":"")+casesDelta+". " : "";
            const resDeltaText = resolutionDelta!=null ? "Average resolution time change vs last month: "+(resolutionDelta>0?"+":"")+resolutionDelta+" days. " : "";
            const themeText = themeFrequencies.length ? "Recurring HR-tagged themes across cases (theme: number of cases tagged): "+themeFrequencies.map(t=>t.name+": "+t.count).join(", ")+". " : "";
            const prompt = "You are a senior HR director. Write a concise executive summary of the following HR data for this organisation. Be factual and highlight key risks, patterns and recommendations. Data: Total cases: "+cases.length+". Active: "+activeCases.length+". Closed: "+closedCases.length+". Case types: "+caseTypeList.map(([t,n])=>t+": "+n).join(", ")+". Outcomes: "+outcomeList.map(([o,n])=>o+": "+n).join(", ")+". High risk cases: "+highRisk.length+". Slow investigations (>28 days): "+slowInvestigations.length+". Repeat employees: "+repeatEmployees.length+". Average resolution time: "+(avgResolution?avgResolution+" days":"unknown")+". "+deltaText+resDeltaText+themeText+"If the theme or delta data points to a genuine pattern worth flagging, introduce it with wording like \"Compass has identified a correlation between…\" — never state or imply that a pattern was *caused* by a named manager, team, or individual; only describe what the aggregate, anonymised data shows. Write 3-4 paragraphs. No markdown.";
            setReportNarrative("Generating...");
            try {
              const r = await authedFetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2000,messages:[{role:"user",content:prompt}]})});
              const d = await r.json();
              setReportNarrative(d.content?.[0]?.text||"Unable to generate.");
            } catch(e) { setReportNarrative("Error generating summary."); }
          }} style={{fontSize:13,background:COLOR.purple,border:"none",borderRadius:RADIUS.surface,padding:"10px 20px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:FONT.sans,flexShrink:0}}>
            Generate AI summary
          </button>
          <button onClick={async()=>{
            const jsPDF = await loadJsPDF();
            const doc = new jsPDF({unit:"mm",format:"a4"});
            const M=20, W=doc.internal.pageSize.getWidth(), maxW=W-M*2;
            let y=20;
            doc.setFontSize(18); doc.setFont("helvetica","bold"); doc.setTextColor(30); doc.text("Compass HR — Board Report",M,y); y+=6;
            doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(120); doc.text(new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}),M,y); y+=10;
            doc.setDrawColor(124,92,252); doc.setLineWidth(0.5); doc.line(M,y,W-M,y); y+=10;

            const stat = (label,value) => { doc.setFontSize(11); doc.setFont("helvetica","bold"); doc.setTextColor(30); doc.text(label+": ",M,y); doc.setFont("helvetica","normal"); doc.text(String(value),M+doc.getTextWidth(label+": "),y); y+=7; };
            stat("Total cases", cases.length+" ("+activeCases.length+" active, "+closedCases.length+" closed)");
            stat("High risk cases", highRisk.length);
            stat("Average resolution time", avgResolution?avgResolution+" days":"—");
            stat("Pending signatures", pendingSigs);
            y+=4;

            if(caseTypeList.length){
              doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.text("Cases by type",M,y); y+=6;
              doc.setFontSize(10); doc.setFont("helvetica","normal");
              caseTypeList.forEach(([type,count])=>{ doc.text("• "+type.charAt(0).toUpperCase()+type.slice(1)+": "+count,M+2,y); y+=5.5; });
              y+=4;
            }
            if(outcomeList.length){
              doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.text("Disciplinary outcomes",M,y); y+=6;
              doc.setFontSize(10); doc.setFont("helvetica","normal");
              outcomeList.forEach(([outcome,count])=>{ doc.text("• "+outcome+": "+count,M+2,y); y+=5.5; });
              y+=4;
            }
            if(reportNarrative&&reportNarrative!=="Generating..."){
              doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.text("Executive summary",M,y); y+=6;
              doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(60);
              const lines = doc.splitTextToSize(reportNarrative, maxW);
              lines.forEach(line=>{ if(y>280){doc.addPage();y=20;} doc.text(line,M,y); y+=5.5; });
            }
            doc.save("Compass_Board_Report_"+new Date().toLocaleDateString("en-GB").split("/").join("-")+".pdf");
          }} style={{fontSize:13,background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"10px 20px",color:COLOR.ink,fontWeight:600,cursor:"pointer",fontFamily:FONT.sans,flexShrink:0}}>
            Download board report
          </button>
          </div>
        </div>

        {/* AI narrative */}
        {reportNarrative&&(
          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"20px 24px",marginBottom:24}}>
            <div style={{fontSize:11,fontWeight:600,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>Executive summary</div>
            <div style={{fontSize:13,color:COLOR.ink,lineHeight:1.8,maxWidth:"min(720px, 100%)"}}>{reportNarrative==="Generating..."?<span style={{color:COLOR.inkFaint,fontStyle:"italic"}}>Generating AI summary…</span>:reportNarrative}</div>
            {themeFrequencies.length>0&&(
              <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${COLOR.borderFaint}`}}>
                <div style={{fontSize:10,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Recurring themes behind this summary</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {themeFrequencies.map(t=>(
                    <span key={t.themeId} style={{fontSize:11,color:COLOR.inkSoft,background:COLOR.paper,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.pill,padding:"3px 10px"}}>{t.name} · {t.count} case{t.count===1?"":"s"}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stat cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:24}}>
          <StatBox label="Total cases" value={cases.length} sub={activeCases.length+" active · "+closedCases.length+" closed"+(casesDelta!=null?" · "+(casesDelta>0?"↑":casesDelta<0?"↓":"→")+Math.abs(casesDelta)+" vs prior 30d":"")}/>
          <StatBox label="High risk" value={highRisk.length} sub={highRisk.length>0?"Requires attention":"No high risk cases"} accent={highRisk.length>0?COLOR.red:COLOR.ink}/>
          <StatBox label="Avg resolution" value={avgResolution?avgResolution+"d":"—"} sub={resTimes.length+" closed cases measured"+(resolutionDelta!=null?" · "+(resolutionDelta>0?"↑":resolutionDelta<0?"↓":"→")+Math.abs(resolutionDelta)+"d vs prior 30d":"")} accent={COLOR.ink}/>
          <StatBox label="Pending signatures" value={pendingSigs} sub={pendingSigs>0?"Awaiting employee sign-off":"All signed"} accent={pendingSigs>0?COLOR.amber:COLOR.ink}/>
        </div>

        {/* ACAS compliance alert */}
        {(slowInvestigations.length>0||pendingSigs>2)&&(
          <div style={{background:COLOR.amberTint,border:`1.5px solid ${COLOR.amber}44`,borderRadius:12,padding:"14px 20px",marginBottom:24,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{fontSize:12,fontWeight:700,color:COLOR.amber,textTransform:"uppercase",letterSpacing:"0.5px"}}>Compliance alerts</div>
            {slowInvestigations.map((cs,i)=>(
              <button key={i} onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}} style={{fontSize:12,color:COLOR.amber,background:COLOR.surface,border:`1px solid ${COLOR.amber}44`,borderRadius:20,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:500}}>
                {cs.employeeName} — investigation overrunning
              </button>
            ))}
            {pendingSigs>2&&<span style={{fontSize:12,color:COLOR.purple,background:COLOR.purpleTint,borderRadius:20,padding:"5px 12px",fontWeight:500}}>{pendingSigs} signatures pending</span>}
          </div>
        )}

        {/* Main grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:20,marginBottom:20}}>

          {/* Case volume by month */}
          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"20px"}}>
            <div style={{fontSize:11,fontWeight:600,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:4}}>Trend</div>
            <div style={{fontFamily:FONT.serif,fontSize:18,fontWeight:400,color:COLOR.ink,marginBottom:16}}>Cases opened per month</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:6,height:100}}>
              {monthLabels.map((m,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{width:"100%",background:COLOR.purple,borderRadius:"3px 3px 0 0",height:`${Math.max(4,Math.round((monthValues[i]/maxMonthVal)*80))}px`,opacity:0.7+0.3*(monthValues[i]/maxMonthVal)}}/>
                  <div style={{fontSize:9,color:COLOR.inkFaint,textAlign:"center"}}>{m}</div>
                  <div style={{fontSize:10,color:COLOR.purple,fontWeight:600}}>{monthValues[i]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Case type breakdown */}
          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"20px"}}>
            <div style={{fontSize:11,fontWeight:600,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:4}}>Breakdown</div>
            <div style={{fontFamily:FONT.serif,fontSize:18,fontWeight:400,color:COLOR.ink,marginBottom:16}}>Cases by type</div>
            {caseTypeList.length===0?<div style={{fontSize:13,color:COLOR.inkFaint}}>No data yet</div>:
              caseTypeList.map(([type,count],i)=>(
                <BarRow key={i} label={type.charAt(0).toUpperCase()+type.slice(1)} value={count} max={caseTypeList[0][1]} />
              ))
            }
          </div>

          {/* Outcomes */}
          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"20px"}}>
            <div style={{fontSize:11,fontWeight:600,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:4}}>Results</div>
            <div style={{fontFamily:FONT.serif,fontSize:18,fontWeight:400,color:COLOR.ink,marginBottom:16}}>Disciplinary outcomes</div>
            {outcomeList.length===0?(
              <div style={{fontSize:13,color:COLOR.inkFaint}}>No outcomes recorded yet</div>
            ):outcomeList.map(([outcome,count],i)=>(
              <BarRow key={i} label={outcome} value={count} max={outcomeList[0][1]}/>
            ))}
          </div>

          {/* Stage pipeline */}
          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"20px"}}>
            <div style={{fontSize:11,fontWeight:600,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:4}}>Pipeline</div>
            <div style={{fontFamily:FONT.serif,fontSize:18,fontWeight:400,color:COLOR.ink,marginBottom:16}}>Cases by stage</div>
            {[
              {label:"Open",value:byStage.open,color:COLOR.inkQuiet},
              {label:"Investigation",value:byStage.investigation,color:COLOR.inkQuiet},
              {label:"Disciplinary",value:byStage.disciplinary,color:COLOR.inkQuiet},
              {label:"Grievance hearing",value:byStage.hearing,color:COLOR.inkQuiet},
              {label:"Appeal",value:byStage.appeal,color:COLOR.inkQuiet},
              {label:"Closed",value:byStage.closed,color:COLOR.green},
            ].filter(s=>s.value>0).map((s,i)=>(
              <BarRow key={i} label={s.label} value={s.value} max={Math.max(...[byStage.open,byStage.investigation,byStage.disciplinary,byStage.hearing,byStage.appeal,byStage.closed],1)} color={s.color}/>
            ))}
          </div>

        </div>

        {/* Second row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:20,marginBottom:20}}>

          {/* Location breakdown */}
          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"20px"}}>
            <div style={{fontSize:11,fontWeight:600,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:4}}>Geography</div>
            <div style={{fontFamily:FONT.serif,fontSize:18,fontWeight:400,color:COLOR.ink,marginBottom:16}}>Cases by location</div>
            {locationList.length===0?<div style={{fontSize:13,color:COLOR.inkFaint}}>No location data</div>:
              locationList.map(([loc,count],i)=>(
                <BarRow key={i} label={loc} value={count} max={locationList[0][1]}/>
              ))
            }
          </div>

          {/* Repeat employees */}
          {/* Phase 6.5 hardening (product-principles review) — a "Manager
              caseload" panel used to render here: named managers in a
              sorted, ranked bar chart by raw case count. That's exactly
              the "worst manager" league table the phase's own
              cross-cutting constraint prohibits (see
              OrganisationalIntelligenceOverview.jsx's own cases_by_manager
              exclusion, which this older screen — Phase 18, predating
              Phase 6's OP-numbered discipline — never picked up). Case
              volume alone says nothing about support needs or process
              quality without team-size/complexity context this app
              doesn't have; removed rather than reworked, since Manager
              Insights already covers this org-wide, non-punitively. */}
          {/* Phase 6.5 hardening (closes Prompt 16 audit finding H2, HIGH) —
              unlike every other panel on this screen (aggregate counts,
              non-identifying stats), this one names individual employees
              by their own repeat-case history and links straight into
              their PersonView dossier. Reports itself stays open to every
              role by design (see InsightsScreen.jsx's own tab list — only
              Manager Insights/Org Events/Risk Map/Improvement Initiatives
              are isHR-gated, Reports deliberately isn't), so this one
              disciplinary-pattern panel is gated internally instead of the
              whole screen — same pattern already used for
              ThemeTaxonomyManager's write controls. */}
          {isHR && (
          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"20px"}}>
            <div style={{fontSize:11,fontWeight:600,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:4}}>Patterns</div>
            <div style={{fontFamily:FONT.serif,fontSize:18,fontWeight:400,color:COLOR.ink,marginBottom:16}}>Repeat cases</div>
            {repeatEmployees.length===0?(
              <div style={{fontSize:13,color:COLOR.inkFaint}}>No employees with multiple cases</div>
            ):repeatEmployees.slice(0,5).map(([name,count],i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:i<repeatEmployees.length-1?`1px solid ${COLOR.borderFaint}`:"none"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:COLOR.purpleTint,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:COLOR.purple,flexShrink:0}}>
                    {name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
                  </div>
                  <button onClick={()=>{setActivePerson(name);setScreen(SCREENS.PERSON_VIEW);}} style={{fontSize:12,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,fontWeight:500,textAlign:"left"}}>{name}</button>
                </div>
                <span style={{fontSize:11,color:COLOR.amber,background:COLOR.amberTint,borderRadius:RADIUS.pill,padding:"2px 8px",fontWeight:600}}>{count} cases</span>
              </div>
            ))}
          </div>
          )}

        </div>

        {/* Active cases table */}
        <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,overflow:"hidden",marginBottom:20}}>
          <div style={{padding:"16px 20px",borderBottom:`1px solid ${COLOR.borderFaint}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>Detail</div>
              <div style={{fontFamily:FONT.serif,fontSize:18,fontWeight:400,color:COLOR.ink}}>Active cases</div>
            </div>
            <span style={{fontSize:12,color:COLOR.purple,background:COLOR.purpleTint,borderRadius:RADIUS.pill,padding:"3px 10px",fontWeight:600}}>{activeCases.length} open</span>
          </div>
          <div style={{overflowX:"auto",width:"100%",minWidth:0,boxSizing:"border-box"}}>
            <table style={{width:"100%",minWidth:640,borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:COLOR.paper}}>
                  {["Employee","Job title","Case type","Stage","Opened","Days open","Next action"].map(h=>(
                    <th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:11,fontWeight:600,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",borderBottom:`1px solid ${COLOR.borderFaint}`,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeCasesTable.visible.map((cs,i)=>{
                  const stage=getCaseStage(cs);
                  const next=getNextStep(cs);
                  const opened=new Date(cs.dateReceived||cs.createdAt||0);
                  const daysOpen=daysBetween(opened, new Date());
                  const rec=employeeRecordsMap[cs.employeeName]||{};
                  const stageColors={open:COLOR.inkFaint,investigation:COLOR.inkSoft,disciplinary:COLOR.inkSoft,appeal:COLOR.inkSoft,closed:COLOR.green};
                  return (
                    <tr key={cs.id} style={{borderBottom:i<activeCasesTable.visible.length-1||activeCasesTable.hasMore?`1px solid ${COLOR.borderFaint}`:"none",cursor:"pointer"}}
                      onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}}
                      onMouseEnter={e=>e.currentTarget.style.background=COLOR.paper}
                      onMouseLeave={e=>e.currentTarget.style.background="none"}>
                      <td style={{padding:"10px 16px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:28,height:28,borderRadius:"50%",background:COLOR.purpleTint,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:COLOR.purple,flexShrink:0}}>
                            {(cs.employeeName||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
                          </div>
                          <span style={{fontWeight:500,color:COLOR.ink}}>{cs.employeeName}</span>
                        </div>
                      </td>
                      <td style={{padding:"10px 16px",color:COLOR.inkSoft}}>{rec.jobTitle||cs.jobTitle||"—"}</td>
                      <td style={{padding:"10px 16px",color:COLOR.inkSoft}}>{cs.caseType||"HR Matter"}</td>
                      <td style={{padding:"10px 16px"}}>
                        <span style={{fontSize:11,fontWeight:600,color:stageColors[stage]||COLOR.inkFaint,background:COLOR.borderFaint,borderRadius:RADIUS.pill,padding:"2px 8px"}}>{stage.charAt(0).toUpperCase()+stage.slice(1)}</span>
                      </td>
                      <td style={{padding:"10px 16px",color:COLOR.inkSoft,whiteSpace:"nowrap"}}>{cs.dateReceived?fmtDate(cs.dateReceived):"—"}</td>
                      <td style={{padding:"10px 16px"}}>
                        <span style={{color:daysOpen>28?COLOR.red:daysOpen>14?COLOR.amber:COLOR.ink,fontWeight:daysOpen>28?600:400}}>{isNaN(daysOpen)||daysOpen<0?"—":daysOpen+"d"}</span>
                      </td>
                      <td style={{padding:"10px 16px",color:COLOR.purple,fontSize:11}}>{next?.label||"—"}</td>
                    </tr>
                  );
                })}
                {activeCases.length===0&&(
                  <tr><td colSpan={7} style={{padding:"32px",textAlign:"center",color:COLOR.inkFaint}}>No active cases</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {activeCasesTable.hasMore&&(
            <button onClick={activeCasesTable.loadMore} style={{width:"100%",padding:"12px",background:COLOR.paper,border:"none",borderTop:`1px solid ${COLOR.borderFaint}`,cursor:"pointer",fontSize:12,color:COLOR.purple,fontWeight:600,fontFamily:FONT.sans}}>
              Load more ({activeCasesTable.visible.length} of {activeCasesTable.total})
            </button>
          )}
        </div>

    </div>
  );
}
