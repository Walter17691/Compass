import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { INITIATIVE_STATUSES, addMilestone, toggleMilestone, removeMilestone, describeMilestoneProgress } from '../lib/improvementInitiatives';
import { tasksForInitiative } from '../lib/caseTasks';
import { activeThemes } from '../lib/themes';
import { daysSince, findMetricTrendEntry, hasEnoughDataForImpact, describeImpact, MIN_DAYS_SINCE_COMPLETION } from '../lib/impactTracking';
import { COLOR, TYPE, FONT, RADIUS, SPACE } from '../styles/tokens';

const STATUS_COLOR = { active: COLOR.purple, completed: COLOR.green, abandoned: COLOR.inkFaint };
const STATUS_LABEL = { active: "Active", completed: "Completed", abandoned: "Abandoned" };
const inputStyle = { fontSize: 13, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.surface, padding: "7px 10px", fontFamily: FONT.sans, color: COLOR.ink };

// Organisational ER Intelligence (Phase 6, OP23, §19) — impact tracking.
// Reuses org_trend_detection() (OP7's RPC) with p_period_days set to the
// real number of days since this initiative's completedAt — see
// impactTracking.js's own header for why that's a genuine reuse of the
// existing trend engine rather than a new RPC. Visible to everyone (not
// HR-gated) once a metric is set and the initiative is completed, same
// org-wide-read pattern as the initiative itself.
function ImpactView({ orgId, initiative }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const days = daysSince(initiative.completedAt);

  useEffect(() => {
    if (!orgId || days === null || days < MIN_DAYS_SINCE_COMPLETION) return;
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('org_trend_detection', { p_org_id: orgId, p_period_days: Math.max(days, 1) });
      if (cancelled) return;
      if (rpcError) { console.error("org_trend_detection", rpcError); setError(true); }
      else setData(data);
    })();
    return () => { cancelled = true; };
  }, [orgId, initiative.completedAt, days]);

  if (days === null) return null;
  if (days < MIN_DAYS_SINCE_COMPLETION) return <div style={{fontSize:12,color:COLOR.inkFaint}}>Not enough time has passed since completion to assess impact yet ({days} of {MIN_DAYS_SINCE_COMPLETION} days).</div>;
  if (error) return <div style={{fontSize:12,color:COLOR.inkSoft}}>Couldn't load impact data right now.</div>;
  if (!data) return <div style={{fontSize:12,color:COLOR.inkSoft}}>Loading impact…</div>;

  const entry = findMetricTrendEntry(data, initiative.metricKind, initiative.metricValue);
  if (!hasEnoughDataForImpact(entry)) return <div style={{fontSize:12,color:COLOR.inkFaint}}>Not enough case volume before completion to assess impact.</div>;

  const label = initiative.metricKind === "theme" ? (entry.themeName || initiative.metricValue) : initiative.metricValue;
  return <div style={{fontSize:13,color:COLOR.ink,lineHeight:1.6}}>{describeImpact(label, entry, days)}</div>;
}

function InitiativeCard({ orgId, initiative, isHR, caseTasks, cases, organisationThemes, onUpdate, expanded, onToggleExpand }) {
  const [milestoneLabel, setMilestoneLabel] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [outcomeDraft, setOutcomeDraft] = useState(initiative.outcome || "");
  const linkedActions = tasksForInitiative(caseTasks, initiative.id);
  const caseTypeOptions = [...new Set((cases||[]).map(c=>c.caseType).filter(Boolean))].sort();
  const themeOptions = activeThemes(organisationThemes);
  const showImpact = initiative.status === "completed" && initiative.metricKind && initiative.metricValue;

  return (
    <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"14px 16px",marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:COLOR.ink}}>{initiative.title}</div>
          <div style={{fontSize:11,color:COLOR.inkFaint,marginTop:2}}>
            <span style={{color:STATUS_COLOR[initiative.status]||COLOR.inkFaint,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4}}>{STATUS_LABEL[initiative.status]||initiative.status}</span>
            {initiative.owner && ` · ${initiative.owner}`}
            {initiative.targetCompletion && ` · Target: ${initiative.targetCompletion}`}
          </div>
        </div>
        <button onClick={onToggleExpand} style={{fontSize:11,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"3px 10px",color:COLOR.purple,cursor:"pointer",fontFamily:FONT.sans,flexShrink:0}}>{expanded?"Hide details":"View details"}</button>
      </div>
      <div style={{fontSize:13,color:COLOR.ink,lineHeight:1.6,marginTop:8}}>{initiative.problemIdentified}</div>
      {initiative.supportingInsights?.length > 0 && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
          {initiative.supportingInsights.map((s,i) => <span key={i} style={{fontSize:11,color:COLOR.purple,background:COLOR.purpleTint,borderRadius:6,padding:"2px 8px"}}>{s}</span>)}
        </div>
      )}
      {!expanded && <div style={{fontSize:12,color:COLOR.inkSoft,marginTop:8}}>{describeMilestoneProgress(initiative.milestones)}</div>}
      {!expanded && showImpact && <div style={{fontSize:12,color:COLOR.green,marginTop:4}}>Impact tracked — view details for the current comparison.</div>}

      {expanded && (
        <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${COLOR.borderFaint}`}}>
          <div style={{fontSize:10,fontWeight:700,color:COLOR.inkFaint,letterSpacing:0.4,textTransform:"uppercase",marginBottom:8}}>Milestones</div>
          {(initiative.milestones||[]).length === 0 && <div style={{fontSize:12,color:COLOR.inkFaint,marginBottom:8}}>No milestones set yet.</div>}
          {(initiative.milestones||[]).map(m => (
            <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <input aria-label={`Mark "${m.label}" done`} type="checkbox" checked={m.done} disabled={!isHR} onChange={()=>onUpdate(initiative.id,{milestones:toggleMilestone(initiative.milestones,m.id)})} style={{cursor:isHR?"pointer":"default"}}/>
              <span style={{fontSize:12,color:COLOR.ink,textDecoration:m.done?"line-through":"none",opacity:m.done?0.6:1,flex:1}}>{m.label}{m.targetDate?` — ${m.targetDate}`:""}</span>
              {isHR && <button onClick={()=>onUpdate(initiative.id,{milestones:removeMilestone(initiative.milestones,m.id)})} style={{fontSize:11,color:COLOR.red,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans}}>Remove</button>}
            </div>
          ))}
          {isHR && (
            <div style={{display:"flex",gap:6,marginTop:8,marginBottom:16,flexWrap:"wrap"}}>
              <input aria-label="New milestone" value={milestoneLabel} onChange={e=>setMilestoneLabel(e.target.value)} placeholder="New milestone" style={{...inputStyle,flex:"2 1 160px"}}/>
              <input aria-label="New milestone target date" type="date" value={milestoneDate} onChange={e=>setMilestoneDate(e.target.value)} style={{...inputStyle,flex:"1 1 130px"}}/>
              <button
                onClick={()=>{ if(!milestoneLabel.trim()) return; onUpdate(initiative.id,{milestones:addMilestone(initiative.milestones,milestoneLabel,milestoneDate)}); setMilestoneLabel(""); setMilestoneDate(""); }}
                disabled={!milestoneLabel.trim()}
                style={{fontSize:12,background:milestoneLabel.trim()?COLOR.purple:COLOR.border,border:"none",borderRadius:RADIUS.surface,padding:"7px 14px",color:"#fff",fontWeight:600,cursor:milestoneLabel.trim()?"pointer":"default",fontFamily:FONT.sans}}
              >Add milestone</button>
            </div>
          )}

          <div style={{fontSize:10,fontWeight:700,color:COLOR.inkFaint,letterSpacing:0.4,textTransform:"uppercase",marginBottom:8}}>Linked actions ({linkedActions.length})</div>
          {linkedActions.length === 0 && <div style={{fontSize:12,color:COLOR.inkFaint,marginBottom:8}}>No actions linked yet — link one when creating an action from an Insights card.</div>}
          {linkedActions.map(t => (
            <div key={t.id} style={{fontSize:12,color:COLOR.ink,padding:"4px 0",borderBottom:`1px solid ${COLOR.borderFaint}`}}>
              {t.name}{t.owner?` · ${t.owner}`:""}{t.dueDate?` · Due ${t.dueDate}`:""} {t.status==="done" && <span style={{color:COLOR.green}}>(done)</span>}
            </div>
          ))}

          {isHR && (
            <div style={{marginTop:16}}>
              <label htmlFor={`initiative-metric-kind-${initiative.id}`} style={{fontSize:11,color:COLOR.inkFaint,display:"block",marginBottom:4}}>Metric this initiative addresses (for impact tracking)</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                <select id={`initiative-metric-kind-${initiative.id}`} value={initiative.metricKind||""} onChange={e=>onUpdate(initiative.id,{metricKind:e.target.value||null,metricValue:null})} style={inputStyle}>
                  <option value="">Not set</option>
                  <option value="case_type">Case type</option>
                  <option value="theme">Theme</option>
                </select>
                {initiative.metricKind==="case_type" && (
                  <select aria-label="Case type value" value={initiative.metricValue||""} onChange={e=>onUpdate(initiative.id,{metricKind:"case_type",metricValue:e.target.value||null})} style={inputStyle}>
                    <option value="">Select a case type…</option>
                    {caseTypeOptions.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                  </select>
                )}
                {initiative.metricKind==="theme" && (
                  <select aria-label="Theme value" value={initiative.metricValue||""} onChange={e=>onUpdate(initiative.id,{metricKind:"theme",metricValue:e.target.value||null})} style={inputStyle}>
                    <option value="">Select a theme…</option>
                    {themeOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>

              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
                <label htmlFor={`initiative-status-${initiative.id}`} style={{fontSize:11,color:COLOR.inkFaint}}>Status</label>
                <select id={`initiative-status-${initiative.id}`} value={initiative.status} onChange={e=>onUpdate(initiative.id,{status:e.target.value})} style={inputStyle}>
                  {INITIATIVE_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <label htmlFor={`initiative-outcome-${initiative.id}`} style={{fontSize:11,color:COLOR.inkFaint,display:"block",marginBottom:4}}>Outcome</label>
              <textarea id={`initiative-outcome-${initiative.id}`} value={outcomeDraft} onChange={e=>setOutcomeDraft(e.target.value)} placeholder="What happened once this was implemented…" rows={2} style={{...inputStyle,width:"100%",boxSizing:"border-box",resize:"vertical",marginBottom:8}}/>
              <button onClick={()=>onUpdate(initiative.id,{outcome:outcomeDraft})} disabled={outcomeDraft===(initiative.outcome||"")} style={{fontSize:12,background:outcomeDraft===(initiative.outcome||"")?COLOR.border:COLOR.purple,border:"none",borderRadius:RADIUS.surface,padding:"6px 14px",color:"#fff",fontWeight:600,cursor:outcomeDraft===(initiative.outcome||"")?"default":"pointer",fontFamily:FONT.sans}}>Save outcome</button>
            </div>
          )}

          {showImpact && (
            <div style={{marginTop:16,paddingTop:12,borderTop:`1px solid ${COLOR.borderFaint}`}}>
              <div style={{fontSize:10,fontWeight:700,color:COLOR.inkFaint,letterSpacing:0.4,textTransform:"uppercase",marginBottom:8}}>Impact</div>
              <ImpactView orgId={orgId} initiative={initiative}/>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Organisational ER Intelligence (Phase 6, OP22, §18) — Improvement
// Initiatives. HR-only create/edit at the RLS layer too
// (improvement_initiatives_2026-08-20.sql) — isHR here only gates UI
// controls, same pattern OrgEventsPanel/ThemeTaxonomyManager already
// established. Any org member can see what's underway; only HR manages
// it. Linked actions are org-level case_tasks (OP21) carrying this
// initiative's id — created from an Insights card's "Create action"
// control, not from here, so this panel only ever displays them.
export function ImprovementInitiativesPanel({ orgId, improvementInitiatives, isHR, onAdd, onUpdate, caseTasks, cases, organisationThemes }) {
  const [expandedId, setExpandedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [problemIdentified, setProblemIdentified] = useState("");
  const [supportingInsights, setSupportingInsights] = useState("");
  const [owner, setOwner] = useState("");
  const [targetCompletion, setTargetCompletion] = useState("");

  const sorted = [...(improvementInitiatives || [])].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  const submit = () => {
    if (!title.trim() || !problemIdentified.trim()) return;
    onAdd({
      title: title.trim(),
      problemIdentified: problemIdentified.trim(),
      supportingInsights: supportingInsights.split(",").map(s => s.trim()).filter(Boolean),
      owner, targetCompletion,
    });
    setTitle(""); setProblemIdentified(""); setSupportingInsights(""); setOwner(""); setTargetCompletion(""); setShowForm(false);
  };

  return (
    <div>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:6}}>Improvement initiatives</div>
      <div style={{fontSize:12,color:COLOR.inkSoft,marginBottom:SPACE.md,maxWidth:560}}>A real, HR-owned response to a pattern surfaced elsewhere in Insights — the problem identified, an owner, milestones, and (once implemented) what actually happened.</div>

      {sorted.length === 0 && <div style={{fontSize:13,color:COLOR.inkSoft,marginBottom:16}}>No improvement initiatives yet.</div>}
      {sorted.map(i => (
        <InitiativeCard key={i.id} orgId={orgId} initiative={i} isHR={isHR} caseTasks={caseTasks} cases={cases} organisationThemes={organisationThemes} onUpdate={onUpdate} expanded={expandedId===i.id} onToggleExpand={()=>setExpandedId(id=>id===i.id?null:i.id)}/>
      ))}

      {isHR && (showForm ? (
        <div style={{background:COLOR.paper,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"16px 18px"}}>
          <div style={{fontSize:11,fontWeight:700,color:COLOR.inkFaint,letterSpacing:0.4,textTransform:"uppercase",marginBottom:10}}>New initiative</div>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title" aria-label="Initiative title" style={{...inputStyle,width:"100%",boxSizing:"border-box",marginBottom:8}}/>
          <textarea value={problemIdentified} onChange={e=>setProblemIdentified(e.target.value)} placeholder="Problem identified" aria-label="Problem identified" rows={2} style={{...inputStyle,width:"100%",boxSizing:"border-box",resize:"vertical",marginBottom:8}}/>
          <input value={supportingInsights} onChange={e=>setSupportingInsights(e.target.value)} placeholder="Supporting insights (comma-separated, optional)" aria-label="Supporting insights (comma-separated, optional)" style={{...inputStyle,width:"100%",boxSizing:"border-box",marginBottom:8}}/>
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            <input value={owner} onChange={e=>setOwner(e.target.value)} placeholder="Owner" aria-label="Owner" style={{...inputStyle,flex:1,minWidth:120}}/>
            <input type="date" value={targetCompletion} onChange={e=>setTargetCompletion(e.target.value)} aria-label="Target completion date" style={{...inputStyle,flex:1,minWidth:150}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={submit} disabled={!title.trim()||!problemIdentified.trim()} style={{fontSize:12,background:title.trim()&&problemIdentified.trim()?COLOR.purple:COLOR.border,border:"none",borderRadius:RADIUS.surface,padding:"8px 16px",color:"#fff",fontWeight:600,cursor:title.trim()&&problemIdentified.trim()?"pointer":"default",fontFamily:FONT.sans}}>Create initiative</button>
            <button onClick={()=>setShowForm(false)} style={{fontSize:12,background:"none",border:"none",color:COLOR.inkFaint,cursor:"pointer",fontFamily:FONT.sans}}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={()=>setShowForm(true)} style={{fontSize:12,background:COLOR.purple,border:"none",borderRadius:RADIUS.surface,padding:"8px 16px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:FONT.sans}}>+ New initiative</button>
      ))}
    </div>
  );
}
