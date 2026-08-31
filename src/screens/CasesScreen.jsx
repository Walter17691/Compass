import { useState } from 'react';
import { SCREENS } from '../constants';
import { getCurrentRisk } from '../lib/caseStage';
import { matchesCaseFilters } from '../lib/caseFilters';
import { computeDueSoon } from '../lib/deadlines';
import { LockIcon } from '../components/Icons';
import { useLoadMore } from '../hooks/useLoadMore';
import { PageHeader } from '../components/design/PageHeader';
import { DataRow, RowChevron } from '../components/design/DataRow';
import { EmptyState } from '../components/design/EmptyState';
import { FONT, COLOR, TYPE, SPACE, RADIUS, BUTTON, CONTENT_MAX_WIDTH } from '../styles/tokens';

const RISK_STYLE = {
  HIGH: { color: COLOR.red, bg: COLOR.redTint },
  MEDIUM: { color: COLOR.amber, bg: COLOR.amberTint },
};

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const STAGE_LABEL = { intake:"Intake", investigation:"Investigation", inv_report:"Investigation report", disciplinary:"Disciplinary", hearing:"Grievance hearing", outcome:"Outcome", appeal:"Appeal", closed:"Closed" };

const selectStyle = {fontSize:12,border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"6px 10px",background:COLOR.surface,color:COLOR.ink,fontFamily:FONT.sans};

// Phase 2B — filters split into two tiers (Compass Design Vision,
// Amendment 1, deferred from Phase 2A to this phase): Case type/Stage/
// Status/Search stay immediately visible as the genuinely-quick, high-
// frequency filters; Location/Owner/Priority/date-range move behind
// "More filters" since they're used less often. Every filter — and its
// underlying matchesCaseFilters predicate — is completely unchanged;
// only default visibility moved. `search` is a new, small, purely
// client-side employee-name filter (the same pattern PeopleScreen.jsx
// already uses) added because the Design Vision explicitly calls for a
// visible Search control here and none existed before this phase.
//
// Owner/priority/date-range filters only have real data to match against
// for cases created since those fields started being written — older
// cases won't match either, same as any additive-migration field.
export function CasesScreen({ cases, casesLoading, locations, orgMembers, setIntake, setScreen, getCaseStage, setActiveCaseId, setActiveCaseStage, getNextStep, getProceedingTitle, getCaseStatus, saveCases, confirmDialog, showToast, audit, currentUserId }) {
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  // IA & User Journey pass, §10 — Cases as a work inbox: All/Mine/Needs
  // attention/Closed as one quick top-level segment, alongside (not
  // replacing) the existing type/stage/status filters below. "Mine"
  // reuses the same ownerId a case is already stamped with at creation
  // (App.jsx sets ownerId to the creating user's own id); "Needs
  // attention" reuses getNextStep exactly as the row's own "Next: …" line
  // and attention-highlight already do — no new predicate invented for
  // either.
  const [segment, setSegment] = useState("all");
  const segmentCounts = {
    all: cases.length,
    mine: cases.filter(cs=>currentUserId&&cs.ownerId===currentUserId).length,
    attention: cases.filter(cs=>getCaseStage(cs)!=="closed"&&!!getNextStep(cs)).length,
    closed: cases.filter(cs=>getCaseStage(cs)==="closed").length,
  };
  const segmentedCases = cases.filter(cs => {
    if(segment==="mine") return currentUserId&&cs.ownerId===currentUserId;
    if(segment==="attention") return getCaseStage(cs)!=="closed"&&!!getNextStep(cs);
    if(segment==="closed") return getCaseStage(cs)==="closed";
    return true;
  });
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [filters, setFilters] = useState({ type:"", stage:"", status:"", locationId:"", ownerId:"", priority:"", from:"", to:"" });
  const setFilter = (key, value) => setFilters(f=>({...f, [key]:value}));
  const clearFilters = () => { setFilters({ type:"", stage:"", status:"", locationId:"", ownerId:"", priority:"", from:"", to:"" }); setSearch(""); };
  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search?1:0);
  const moreFilterKeys = ["locationId","ownerId","priority","from","to"];
  const moreFilterCount = moreFilterKeys.filter(k=>filters[k]).length;

  const caseTypes = [...new Set(cases.map(cs=>cs.caseType).filter(Boolean))].sort();
  const stages = [...new Set(cases.map(cs=>getCaseStage(cs)))].filter(Boolean);
  const owners = [...new Set(cases.map(cs=>cs.ownerId).filter(Boolean))];

  const filteredCases = segmentedCases
    .filter(cs => matchesCaseFilters(cs, filters, getCaseStage))
    .filter(cs => !search || (cs.employeeName||"").toLowerCase().includes(search.toLowerCase()));
  const toggleSelected = id => setSelected(s=>{const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n;});
  // Phase 6.5 hardening (closes Prompt 11 audit finding 5.10, MEDIUM) —
  // this used to close every selected case with no check at all,
  // silently taking any of them out of computeDueSoon's own
  // getCaseStage(cs)==="closed" exclusion — a case with a genuinely live
  // deadline (an outstanding ACAS appeal window, a signature still
  // pending) would stop being tracked anywhere the moment it closed,
  // with no indication that had even happened. computeDueSoon only
  // needs the selected cases themselves for every case-intrinsic
  // deadline type (outcome, appeal, investigation overrunning,
  // grievance acknowledgement, signature chase, fit note, probation,
  // suspension) — its other params are all optional and default to [].
  // Not a hard block: HR may have a real reason to bulk-close regardless
  // (e.g. correcting a mistake), so this makes the loss explicit and
  // informed rather than silent, the same "surface it, don't block it"
  // approach as the general readiness indicator (caseReadiness.js).
  const bulkClose = async () => {
    const chosen = cases.filter(c=>selected.has(c.id));
    const liveDeadlineCaseIds = new Set(computeDueSoon(chosen).map(d=>d.caseId).filter(Boolean));
    const warning = liveDeadlineCaseIds.size > 0
      ? ` ${liveDeadlineCaseIds.size} of these ${liveDeadlineCaseIds.size===1?"has":"have"} a live deadline (e.g. an outstanding appeal window or a signature still pending) that will stop being tracked once closed.`
      : "";
    const ok = await confirmDialog({title:`Close ${selected.size} case${selected.size!==1?"s":""}?`, message:`These will be marked closed. You can still view them, and reopen individually if needed.${warning}`, confirmLabel:"Close", danger:true});
    if(!ok) return;
    saveCases(cases.map(c=>selected.has(c.id)?{...c,stage:"closed",closedReason:"bulk_closed"}:c));
    showToast(`${selected.size} case${selected.size!==1?"s":""} closed`);
    setSelected(new Set());
  };
  // Phase 6.5 hardening (closes Prompt 11 audit finding 5.11, MEDIUM) —
  // this downloads the full, unredacted case JSON (meeting transcripts,
  // evidence, allegations, and whatever else a case carries) with no
  // audit trail at all — every other significant read/export action in
  // this app logs one. caseId left null (this spans potentially many
  // cases, not one) and the export's own size/employee list carried in
  // meta so the audit entry says what actually left the app, not just
  // that "an export happened."
  const bulkExport = () => {
    const chosen = cases.filter(c=>selected.has(c.id));
    downloadJson(chosen, `compass_cases_export_${new Date().toISOString().split("T")[0]}.json`);
    audit?.("Bulk case export", `${chosen.length} case${chosen.length!==1?"s":""} exported as JSON`, null, { dataUsed: chosen.map(c=>c.employeeName).join(", ") });
    showToast(`Exported ${chosen.length} case${chosen.length!==1?"s":""}`);
  };
  const allEmployees = [...new Set(filteredCases.map(cs=>cs.employeeName))];
  const { visible: employees, hasMore, loadMore, total } = useLoadMore(allEmployees, 15);
  return (
    <div style={{minHeight:"100vh",background:COLOR.paper,fontFamily:FONT.sans}}>
      <div style={{background:COLOR.surface,borderBottom:`1px solid ${COLOR.borderFaint}`,padding:"16px 28px"}}>
        <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto"}}>
          <PageHeader
            title="Cases"
            subtitle={`${cases.filter(cs=>getCaseStage(cs)!=="closed").length} active · ${cases.filter(cs=>getCaseStage(cs)==="closed").length} closed`}
            actions={<>
              {/* 10/10 pass — was the one screen in the product where
                  "+ New meeting" outranked "+ New case" (filled purple vs
                  outline); Home already established + New case as the
                  primary action / Start meeting as secondary, so this was
                  a real hierarchy inconsistency between the two screens
                  someone creating work from most often, not a deliberate
                  per-screen choice. Same handlers, same labels — only
                  which one is visually dominant changed. */}
              <button onClick={()=>setScreen(SCREENS.HOME+"_meeting")}
                style={{...BUTTON.secondary,fontSize:13,padding:"9px 18px"}}>+ New meeting</button>
              <button onClick={()=>{setIntake({employee:"",manager:"",issue:"",type:"",dateReceived:new Date().toISOString().split("T")[0],description:"",referredBy:"",urgent:false});setScreen(SCREENS.INTAKE);}}
                style={{...BUTTON.primary,fontSize:13,padding:"9px 18px"}}>+ New case</button>
            </>}
          />
        </div>
      </div>
      <div style={{maxWidth:CONTENT_MAX_WIDTH,margin:"0 auto",padding:"24px 28px"}}>
        {selected.size>0&&(
          <div style={{position:"sticky",top:0,zIndex:10,display:"flex",alignItems:"center",gap:12,background:COLOR.ink,borderRadius:RADIUS.surface,padding:"12px 16px",marginBottom:SPACE.lg}}>
            <span style={{fontSize:13,color:"#fff",fontWeight:500}}>{selected.size} selected</span>
            <button onClick={bulkExport} style={{fontSize:12,background:"none",border:"1px solid #FFFFFF44",borderRadius:6,padding:"6px 14px",color:"#fff",cursor:"pointer",fontFamily:FONT.sans}}>Export</button>
            <button onClick={bulkClose} style={{fontSize:12,background:"none",border:"1px solid #FFFFFF44",borderRadius:6,padding:"6px 14px",color:"#fff",cursor:"pointer",fontFamily:FONT.sans}}>Close</button>
            <button onClick={()=>setSelected(new Set())} style={{fontSize:12,background:"none",border:"none",color:COLOR.inkQuiet,cursor:"pointer",marginLeft:"auto",fontFamily:FONT.sans}}>Clear</button>
          </div>
        )}
        {cases.length===0&&casesLoading&&(
          <EmptyState message="Loading cases…"/>
        )}
        {cases.length===0&&!casesLoading&&(
          <EmptyState title="No cases yet" message="Create a case to start managing HR proceedings"
            action={<button onClick={()=>setScreen(SCREENS.INTAKE)} style={{...BUTTON.primary,fontSize:14,padding:"12px 28px"}}>Create first case →</button>}/>
        )}
        {cases.length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:SPACE.md}}>
            {[
              {id:"all",label:"All"},
              {id:"mine",label:"Mine"},
              {id:"attention",label:"Needs attention"},
              {id:"closed",label:"Closed"},
            ].map(s=>(
              <button key={s.id} onClick={()=>setSegment(s.id)}
                style={{fontSize:12.5,padding:"7px 14px",borderRadius:RADIUS.pill,border:"1px solid",borderColor:segment===s.id?COLOR.purple:COLOR.border,background:segment===s.id?COLOR.purpleTint:COLOR.surface,color:segment===s.id?COLOR.purple:COLOR.inkSoft,cursor:"pointer",fontFamily:FONT.sans,fontWeight:segment===s.id?600:400}}>
                {s.label} <span style={{opacity:0.7}}>({segmentCounts[s.id]})</span>
              </button>
            ))}
          </div>
        )}
        {cases.length>0&&(
          <div style={{marginBottom:SPACE.lg}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <input aria-label="Search cases" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by employee…"
                style={{...selectStyle,padding:"7px 12px",width:180}}/>
              <select aria-label="Filter by status" value={filters.status} onChange={e=>setFilter("status", e.target.value)} style={selectStyle}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
              <select aria-label="Filter by case type" value={filters.type} onChange={e=>setFilter("type", e.target.value)} style={selectStyle}>
                <option value="">All types</option>
                {caseTypes.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <select aria-label="Filter by stage" value={filters.stage} onChange={e=>setFilter("stage", e.target.value)} style={selectStyle}>
                <option value="">All stages</option>
                {stages.map(s=><option key={s} value={s}>{STAGE_LABEL[s]||s}</option>)}
              </select>
              <button onClick={()=>setShowMoreFilters(v=>!v)} style={{...BUTTON.tertiary,fontSize:12,padding:"6px 4px"}}>
                {showMoreFilters?"Hide filters":moreFilterCount>0?`More filters (${moreFilterCount})`:"More filters"}
              </button>
              {activeFilterCount>0&&<button onClick={clearFilters} style={{...BUTTON.tertiary,fontSize:12,padding:"6px 4px",color:COLOR.inkFaint}}>Clear filters ({activeFilterCount})</button>}
            </div>
            {/* 10/10 pass, item 8 (clear filter state) — "Clear filters (N)"
                said how many were active but not which ones, or let you
                remove just one; this is genuinely new (no prior chip
                summary existed), everything it reads/clears is the exact
                same filters/search state already wired above. */}
            {activeFilterCount>0&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginTop:8}}>
                {[
                  search&&{key:"search",label:`"${search}"`,onRemove:()=>setSearch("")},
                  filters.status&&{key:"status",label:filters.status==="active"?"Active":"Closed",onRemove:()=>setFilter("status","")},
                  filters.type&&{key:"type",label:filters.type,onRemove:()=>setFilter("type","")},
                  filters.stage&&{key:"stage",label:STAGE_LABEL[filters.stage]||filters.stage,onRemove:()=>setFilter("stage","")},
                  filters.locationId&&{key:"locationId",label:locations?.find(l=>l.id===filters.locationId)?.name||"Location",onRemove:()=>setFilter("locationId","")},
                  filters.ownerId&&{key:"ownerId",label:(orgMembers||[]).find(m=>m.user_id===filters.ownerId)?.name||"Owner",onRemove:()=>setFilter("ownerId","")},
                  filters.priority&&{key:"priority",label:filters.priority.charAt(0).toUpperCase()+filters.priority.slice(1)+" priority",onRemove:()=>setFilter("priority","")},
                  filters.from&&{key:"from",label:`From ${filters.from}`,onRemove:()=>setFilter("from","")},
                  filters.to&&{key:"to",label:`To ${filters.to}`,onRemove:()=>setFilter("to","")},
                ].filter(Boolean).map(chip=>(
                  <button key={chip.key} onClick={chip.onRemove} aria-label={`Remove filter: ${chip.label}`} style={{display:"flex",alignItems:"center",gap:5,fontSize:11.5,fontWeight:500,color:COLOR.purple,background:COLOR.purpleTint,border:"none",borderRadius:RADIUS.pill,padding:"4px 6px 4px 10px",cursor:"pointer",fontFamily:FONT.sans}}>
                    {chip.label}
                    <span aria-hidden="true" style={{fontSize:13,lineHeight:1}}>×</span>
                  </button>
                ))}
              </div>
            )}
            {showMoreFilters&&(
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginTop:10,paddingTop:10,borderTop:`1px solid ${COLOR.borderFaint}`}}>
                {locations?.length>0&&(
                  <select aria-label="Filter by location" value={filters.locationId} onChange={e=>setFilter("locationId", e.target.value)} style={selectStyle}>
                    <option value="">All locations</option>
                    {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                )}
                {owners.length>0&&(
                  <select aria-label="Filter by owner" value={filters.ownerId} onChange={e=>setFilter("ownerId", e.target.value)} style={selectStyle}>
                    <option value="">All owners</option>
                    {owners.map(id=><option key={id} value={id}>{(orgMembers||[]).find(m=>m.user_id===id)?.name || "Unknown"}</option>)}
                  </select>
                )}
                <select aria-label="Filter by priority" value={filters.priority} onChange={e=>setFilter("priority", e.target.value)} style={selectStyle}>
                  <option value="">All priorities</option>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
                <label style={{fontSize:12,color:COLOR.inkSoft,display:"flex",alignItems:"center",gap:4}}>
                  From <input type="date" value={filters.from} onChange={e=>setFilter("from", e.target.value)} style={{fontSize:12,border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"5px 8px",color:COLOR.ink}}/>
                </label>
                <label style={{fontSize:12,color:COLOR.inkSoft,display:"flex",alignItems:"center",gap:4}}>
                  To <input type="date" value={filters.to} onChange={e=>setFilter("to", e.target.value)} style={{fontSize:12,border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"5px 8px",color:COLOR.ink}}/>
                </label>
              </div>
            )}
          </div>
        )}
        {cases.length>0&&filteredCases.length===0&&(
          <EmptyState message={segment!=="all"&&activeFilterCount===0?"No cases in this view":"No cases match these filters"}
            action={<button onClick={()=>{clearFilters();setSegment("all");}} style={{...BUTTON.secondary,fontSize:13,padding:"8px 18px"}}>{segment!=="all"&&activeFilterCount===0?"Show all cases":"Clear filters"}</button>}/>
        )}
        {(()=>{
          return employees.map(emp=>{
            const empCases = filteredCases.filter(cs=>cs.employeeName===emp);
            const activeCount = empCases.filter(cs=>getCaseStage(cs)!=="closed").length;
            return(
              <div key={emp} style={{marginBottom:SPACE.xl}}>
                {/* Same-employee grouping (Compass Design Vision, §1) — a
                    light-touch header, not a nested card: initials in a
                    neutral (not decorative-purple) circle, name, and a
                    plain count line. */}
                <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:2,paddingBottom:6,borderBottom:`1px solid ${COLOR.border}`}}>
                  <span style={{fontSize:14,fontWeight:600,color:COLOR.ink}}>{emp}</span>
                  <span style={{...TYPE.metadata,color:COLOR.inkFaint}}>{empCases.length} proceeding{empCases.length!==1?"s":""}{activeCount>0?" · "+activeCount+" active":""}</span>
                </div>
                {empCases.map(cs=>{
                  const closed = getCaseStage(cs)==="closed";
                  const next = getNextStep(cs);
                  const risk = !closed ? getCurrentRisk(cs) : null;
                  const riskStyle = risk ? RISK_STYLE[risk] : null;
                  const status = getCaseStatus(cs);
                  return(
                    // A native <button> can't contain another interactive
                    // control (the selection checkbox), so the checkbox
                    // stays a sibling outside it — only the navigate-to-
                    // case content (everything else in the row) becomes
                    // the button, keyboard-reachable and Enter/Space-
                    // activatable for free, unlike the div+onClick this
                    // replaces.
                    <DataRow key={cs.id} attention={!closed&&!!next}>
                      <input type="checkbox" aria-label={`Select ${getProceedingTitle(cs)}`} checked={selected.has(cs.id)} onChange={()=>toggleSelected(cs.id)} style={{cursor:"pointer",flexShrink:0,marginLeft:10}}/>
                      <button type="button" onClick={()=>{setActiveCaseId(cs.id);setActiveCaseStage("investigation");setScreen(SCREENS.CASE_VIEW);}}
                        style={{flex:1,minWidth:0,padding:"12px 16px 12px 10px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,background:"none",border:"none",textAlign:"left",font:"inherit",color:"inherit"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:closed?400:600,color:closed?COLOR.inkFaint:COLOR.ink,marginBottom:3}}>{getProceedingTitle(cs)}</div>
                          <div style={{...TYPE.metadata,color:COLOR.inkFaint,display:"flex",gap:8,fontWeight:400}}>
                            <span>{(cs.meetings||[]).length} meeting{(cs.meetings||[]).length!==1?"s":""}</span>
                            {cs.urgent&&<span style={{color:COLOR.red,fontWeight:600}}>· URGENT</span>}
                            {cs.confidential&&<span style={{color:COLOR.amber,fontWeight:600,display:"inline-flex",alignItems:"center",gap:3}}>· <LockIcon size={10} />Confidential</span>}
                          </div>
                          {/* UAT Product Hierarchy pass, Part 7 — matches
                              CaseViewScreen's own Case Copilot banner
                              wording change: a recommendation, not an
                              instruction Compass is enforcing. */}
                          {next&&!closed&&<div style={{fontSize:11,color:COLOR.purple,fontWeight:500,marginTop:4}}>Suggested next step: {next.label}</div>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                          {riskStyle&&<span style={{fontSize:10,fontWeight:700,color:riskStyle.color,background:riskStyle.bg,borderRadius:4,padding:"2px 7px"}}>{risk} RISK</span>}
                          <span style={{fontSize:11,fontWeight:600,color:status.color,background:status.bg,borderRadius:RADIUS.pill,padding:"3px 10px"}}>{status.label}</span>
                          <RowChevron/>
                        </div>
                      </button>
                    </DataRow>
                  );
                })}
              </div>
            );
          });
        })()}
        {hasMore&&(
          <button onClick={loadMore} style={{width:"100%",padding:"12px",background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,cursor:"pointer",fontSize:13,color:COLOR.purple,fontWeight:600,fontFamily:FONT.sans}}>
            Load more ({employees.length} of {total})
          </button>
        )}
      </div>
    </div>
  );
}
