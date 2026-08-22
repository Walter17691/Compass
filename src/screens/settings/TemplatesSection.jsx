import { useState } from 'react';
import { Btn, Card } from '../../components/Primitives';
import { CrossIcon } from '../../components/Icons';

const OWNERS = ["HR", "Line Manager", "IT", "Facilities", "Payroll"];

// Onboarding/offboarding had a real "templates" data model (name, phases,
// tasks, a templateId picker on the create form) but no UI ever let an org
// create a second template or edit the default one — saveStarterTemplates/
// saveLeaverTemplates existed and were never called. Every org was
// permanently stuck with one fixed 21-task "Standard Employee Onboarding"
// checklist, the same way redundancy selection criteria used to be fixed.
// Templates are copied into an instance's tasks at creation time (see
// createStarterInstance/createLeaverInstance in App.jsx), so editing or
// deleting a template never touches already-created checklists.
function TemplateEditor({ kind, templates, saveTemplates, promptDialog, confirmDialog }) {
  const [expandedId, setExpandedId] = useState(templates[0]?.id || null);

  const updateTemplate = (id, updates) => saveTemplates(templates.map(t => t.id === id ? { ...t, ...updates } : t));

  const addTemplate = async () => {
    const values = await promptDialog({
      title: `New ${kind} template`,
      fields: [{ key: "name", label: "Template name", placeholder: `e.g. ${kind === "onboarding" ? "Warehouse Onboarding" : "Senior Leaver Offboarding"}`, required: true }],
      confirmLabel: "Create template",
    });
    if (!values) return;
    const t = { id: "tpl" + Date.now(), name: values.name, createdAt: new Date().toISOString(), phases: [{ id: "ph" + Date.now(), label: "Phase 1", tasks: [] }] };
    saveTemplates([...templates, t]);
    setExpandedId(t.id);
  };

  const duplicateTemplate = (tpl) => {
    const copy = { ...tpl, id: "tpl" + Date.now(), name: tpl.name + " (copy)", createdAt: new Date().toISOString(), phases: tpl.phases.map(ph => ({ ...ph, id: "ph" + Date.now() + Math.random(), tasks: ph.tasks.map(t => ({ ...t, id: t.id + "_" + Date.now() })) })) };
    saveTemplates([...templates, copy]);
    setExpandedId(copy.id);
  };

  const removeTemplate = async (id) => {
    if (templates.length <= 1) return;
    const ok = await confirmDialog({ title: "Delete template?", message: "Checklists already created from it keep their own copy of the tasks — this only removes it from the picker for new ones.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    saveTemplates(templates.filter(t => t.id !== id));
  };

  const addPhase = (tpl) => updateTemplate(tpl.id, { phases: [...tpl.phases, { id: "ph" + Date.now(), label: "New phase", tasks: [] }] });
  const removePhase = (tpl, phaseId) => updateTemplate(tpl.id, { phases: tpl.phases.filter(ph => ph.id !== phaseId) });
  const updatePhase = (tpl, phaseId, updates) => updateTemplate(tpl.id, { phases: tpl.phases.map(ph => ph.id === phaseId ? { ...ph, ...updates } : ph) });

  const addTask = (tpl, phaseId) => updatePhase(tpl, phaseId, { tasks: [...tpl.phases.find(ph => ph.id === phaseId).tasks, { id: "t" + Date.now(), task: "New task", owner: "HR", day: 0 }] });
  const removeTask = (tpl, phaseId, taskId) => { const ph = tpl.phases.find(p => p.id === phaseId); updatePhase(tpl, phaseId, { tasks: ph.tasks.filter(t => t.id !== taskId) }); };
  const updateTask = (tpl, phaseId, taskId, updates) => { const ph = tpl.phases.find(p => p.id === phaseId); updatePhase(tpl, phaseId, { tasks: ph.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) }); };

  return (
    <div>
      {templates.map(tpl => {
        const taskCount = tpl.phases.reduce((n, ph) => n + ph.tasks.length, 0);
        const expanded = expandedId === tpl.id;
        return (
          <Card key={tpl.id} style={{ marginBottom: 12, padding: expanded ? 20 : 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <button onClick={() => setExpandedId(expanded ? null : tpl.id)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1535" }}>{tpl.name}</div>
                <div style={{ fontSize: 11, color: "#9B9098", marginTop: 2 }}>{tpl.phases.length} phase{tpl.phases.length !== 1 ? "s" : ""} · {taskCount} task{taskCount !== 1 ? "s" : ""}</div>
              </button>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Btn variant="ghost" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => duplicateTemplate(tpl)}>Duplicate</Btn>
                {templates.length > 1 && <Btn variant="danger" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => removeTemplate(tpl.id)}>Delete</Btn>}
              </div>
            </div>

            {expanded && (
              <div style={{ marginTop: 16, borderTop: "1px solid #E8E0D0", paddingTop: 16 }}>
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor={`template-name-${tpl.id}`} style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#6B6880", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>Template name</label>
                  <input id={`template-name-${tpl.id}`} value={tpl.name} onChange={e => updateTemplate(tpl.id, { name: e.target.value })}
                    style={{ width: "100%", background: "#FDFAF5", border: "1px solid #E8E0D0", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#1A1535", outline: "none", boxSizing: "border-box" }} />
                </div>

                {tpl.phases.map((ph,phIdx) => (
                  <div key={ph.id} style={{ background: "#FDFAF5", border: "1px solid #E8E0D0", borderRadius: 8, padding: 12, marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <input aria-label={`Phase ${phIdx+1} name`} value={ph.label} onChange={e => updatePhase(tpl, ph.id, { label: e.target.value })}
                        style={{ flex: 1, background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 5, padding: "6px 10px", fontSize: 12, fontWeight: 600, color: "#1A1535", outline: "none" }} />
                      <button onClick={() => removePhase(tpl, ph.id)} aria-label="Remove phase" style={{ background: "none", border: "none", color: "#9B9098", cursor: "pointer", display: "flex", padding: 4 }}><CrossIcon size={12} /></button>
                    </div>
                    {ph.tasks.map((t,tIdx) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <input aria-label={`Phase ${phIdx+1} task ${tIdx+1} name`} value={t.task} onChange={e => updateTask(tpl, ph.id, t.id, { task: e.target.value })} placeholder="Task"
                          style={{ flex: 1, background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 5, padding: "6px 10px", fontSize: 12, color: "#1A1535", outline: "none" }} />
                        <select aria-label={`Phase ${phIdx+1} task ${tIdx+1} owner`} value={t.owner} onChange={e => updateTask(tpl, ph.id, t.id, { owner: e.target.value })}
                          style={{ width: 110, background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 5, padding: "6px 6px", fontSize: 11, color: "#1A1535", outline: "none" }}>
                          {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <input aria-label={`Phase ${phIdx+1} task ${tIdx+1} day offset`} type="number" value={t.day} onChange={e => updateTask(tpl, ph.id, t.id, { day: parseInt(e.target.value) || 0 })} title="Day offset from start/last day (negative = before)"
                          style={{ width: 56, background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 5, padding: "6px 6px", fontSize: 11, color: "#1A1535", outline: "none", textAlign: "center" }} />
                        <button onClick={() => removeTask(tpl, ph.id, t.id)} aria-label="Remove task" style={{ background: "none", border: "none", color: "#9B9098", cursor: "pointer", display: "flex", padding: 4, flexShrink: 0 }}><CrossIcon size={11} /></button>
                      </div>
                    ))}
                    <button onClick={() => addTask(tpl, ph.id)} style={{ width: "100%", background: "none", border: "1px dashed #E8E0D0", borderRadius: 6, padding: "6px", fontSize: 11, color: "#7C5CFC", cursor: "pointer", marginTop: 4 }}>+ Add task</button>
                  </div>
                ))}
                <Btn variant="ghost" style={{ width: "100%" }} onClick={() => addPhase(tpl)}>+ Add phase</Btn>
              </div>
            )}
          </Card>
        );
      })}
      <Btn onClick={addTemplate}>+ New {kind} template</Btn>
    </div>
  );
}

export function TemplatesSection({ starterTemplates, saveStarterTemplates, leaverTemplates, saveLeaverTemplates, promptDialog, confirmDialog }) {
  const [tab, setTab] = useState("onboarding");
  return (
    <Card>
      <h3 style={{ fontFamily: "DM Serif Display,Georgia,serif", fontSize: 16, color: "#1A1535", margin: "0 0 4px" }}>Checklist templates</h3>
      <p style={{ fontSize: 12, color: "#6B6375", margin: "0 0 16px" }}>Every org used to be stuck with one fixed onboarding and one fixed offboarding checklist — add role-specific variants, or edit the default, here. Day offsets count from the starter's start date, or the leaver's last working day.</p>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #E8E0D0" }}>
        {[["onboarding", "Onboarding"], ["offboarding", "Offboarding"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: tab === id ? "2px solid #7C5CFC" : "2px solid transparent", color: tab === id ? "#7C5CFC" : "#6B6375", fontWeight: tab === id ? 600 : 400, fontSize: 13, cursor: "pointer", fontFamily: "DM Sans,system-ui,sans-serif" }}>
            {label}
          </button>
        ))}
      </div>
      {tab === "onboarding"
        ? <TemplateEditor kind="onboarding" templates={starterTemplates} saveTemplates={saveStarterTemplates} promptDialog={promptDialog} confirmDialog={confirmDialog} />
        : <TemplateEditor kind="offboarding" templates={leaverTemplates} saveTemplates={saveLeaverTemplates} promptDialog={promptDialog} confirmDialog={confirmDialog} />}
    </Card>
  );
}
