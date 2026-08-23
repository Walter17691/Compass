import { useState } from 'react';
import { Btn, Card } from '../../components/Primitives';
import { CrossIcon } from '../../components/Icons';
import { PROCESS_TYPES } from '../../lib/processStages';
import { CASE_ROLES } from '../../lib/caseRoles';
import { POLICY_CATEGORIES } from '../../constants';
import { DEFAULT_STAGE_TARGET_DAYS } from '../../lib/processDashboard';

const OWNERS = ["HR", "Line Manager", "Investigator", "Employee"];

// Process Intelligence Phase 3 (P18, §15) — the first genuinely
// org-configurable ER process template. Each process type (P2's own
// registry, processStages.js) gets at most one template row, upserted on
// (org_id, process_type) rather than allowing several — the case-creation
// flow always resolves at most one template per process type it just
// created a case for, so a picker between several candidates would be a
// feature with nothing to select between.
//
// Required documents and suggested meetings are deliberately plain lists,
// not linked to anything else in the app (no auto-verification against
// uploaded evidence, no auto-scheduling) — this phase's job is giving an
// org somewhere real to define what a process should involve, not
// building a second Evidence Matrix. Default tasks are the one part that
// actually acts on its own: ProcessChecklistPanel copies them onto the
// case as real, working case tasks (createCaseTask) the moment the case
// is created.
function draftFromTemplate(tpl) {
  return {
    required_documents: (tpl?.required_documents || []).join("\n"),
    suggested_meetings: (tpl?.suggested_meetings || []).join("\n"),
    default_tasks: tpl?.default_tasks?.length ? tpl.default_tasks : [],
    suggested_role_ids: tpl?.suggested_role_ids || [],
    policy_category: tpl?.policy_category || "",
    target_days: tpl?.target_days || "",
  };
}

function TemplateEditor({ processType, template, saveProcessTemplate }) {
  const [draft, setDraft] = useState(() => draftFromTemplate(template));
  const [dirty, setDirty] = useState(false);

  const update = (fields) => { setDraft(d => ({ ...d, ...fields })); setDirty(true); };

  const addTask = () => update({ default_tasks: [...draft.default_tasks, { name: "", owner: "HR", dayOffset: 0 }] });
  const updateTask = (i, fields) => update({ default_tasks: draft.default_tasks.map((t, j) => j === i ? { ...t, ...fields } : t) });
  const removeTask = (i) => update({ default_tasks: draft.default_tasks.filter((_, j) => j !== i) });

  const toggleRole = (roleId) => update({
    suggested_role_ids: draft.suggested_role_ids.includes(roleId)
      ? draft.suggested_role_ids.filter(r => r !== roleId)
      : [...draft.suggested_role_ids, roleId],
  });

  const save = () => {
    saveProcessTemplate(processType.id, {
      required_documents: draft.required_documents.split("\n").map(s => s.trim()).filter(Boolean),
      suggested_meetings: draft.suggested_meetings.split("\n").map(s => s.trim()).filter(Boolean),
      default_tasks: draft.default_tasks.filter(t => t.name?.trim()),
      suggested_role_ids: draft.suggested_role_ids,
      policy_category: draft.policy_category || null,
      // The number input's own min="1" isn't hard-enforced (this isn't a
      // <form> submit, so nothing blocks a directly-typed "0" or
      // negative value from reaching here) — clamp to null rather than
      // persist a target that isn't a real target, and that
      // ProcessChecklistPanel's own truthy check used to render as a
      // bare "0" instead of hiding the line entirely.
      target_days: Number(draft.target_days) > 0 ? Number(draft.target_days) : null,
    });
    setDirty(false);
  };

  const labelStyle = { display: "block", fontSize: 10, fontWeight: 600, color: "#6B6880", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 };
  const inputStyle = { width: "100%", background: "#FDFAF5", border: "1px solid #E8E0D0", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#1A1535", outline: "none", boxSizing: "border-box", fontFamily: "DM Sans,system-ui,sans-serif" };

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid #E8E0D0", paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label htmlFor={`required-documents-${processType.id}`} style={labelStyle}>Required documents <span style={{ fontWeight: 400, textTransform: "none" }}>(one per line)</span></label>
        <textarea id={`required-documents-${processType.id}`} rows={3} value={draft.required_documents} onChange={e => update({ required_documents: e.target.value })} placeholder={"e.g. Investigation report\nSigned meeting notes"} style={{ ...inputStyle, resize: "vertical" }} />
      </div>

      <div>
        <label htmlFor={`suggested-meetings-${processType.id}`} style={labelStyle}>Suggested meetings <span style={{ fontWeight: 400, textTransform: "none" }}>(one per line)</span></label>
        <textarea id={`suggested-meetings-${processType.id}`} rows={3} value={draft.suggested_meetings} onChange={e => update({ suggested_meetings: e.target.value })} placeholder={"e.g. Investigation meeting\nDisciplinary hearing"} style={{ ...inputStyle, resize: "vertical" }} />
      </div>

      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ ...labelStyle, padding: 0 }}>Default tasks <span style={{ fontWeight: 400, textTransform: "none" }}>(created automatically on every new case of this type)</span></legend>
        {draft.default_tasks.map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <input aria-label={`Task ${i + 1} name`} value={t.name} onChange={e => updateTask(i, { name: e.target.value })} placeholder="Task" style={{ flex: 1, background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 5, padding: "6px 10px", fontSize: 12, color: "#1A1535", outline: "none" }} />
            <select aria-label={`Task ${i + 1} owner`} value={t.owner} onChange={e => updateTask(i, { owner: e.target.value })} style={{ width: 110, background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 5, padding: "6px 6px", fontSize: 11, color: "#1A1535", outline: "none" }}>
              {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <input aria-label={`Task ${i + 1} day offset`} type="number" value={t.dayOffset} onChange={e => updateTask(i, { dayOffset: parseInt(e.target.value) || 0 })} title="Days after the case is created"
              style={{ width: 56, background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 5, padding: "6px 6px", fontSize: 11, color: "#1A1535", outline: "none", textAlign: "center" }} />
            <button onClick={() => removeTask(i)} aria-label="Remove task" style={{ background: "none", border: "none", color: "#9B9098", cursor: "pointer", display: "flex", padding: 4, flexShrink: 0 }}><CrossIcon size={11} /></button>
          </div>
        ))}
        <button onClick={addTask} style={{ width: "100%", background: "none", border: "1px dashed #E8E0D0", borderRadius: 6, padding: "6px", fontSize: 11, color: "#7C5CFC", cursor: "pointer", marginTop: 4 }}>+ Add default task</button>
      </fieldset>

      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ ...labelStyle, padding: 0 }}>Suggested roles to fill</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CASE_ROLES.map(role => (
            <label key={role.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#1A1535", background: "#FDFAF5", border: "1px solid #E8E0D0", borderRadius: 20, padding: "4px 10px", cursor: "pointer" }}>
              <input type="checkbox" checked={draft.suggested_role_ids.includes(role.id)} onChange={() => toggleRole(role.id)} />
              {role.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor={`policy-category-${processType.id}`} style={labelStyle}>Linked policy</label>
          <select id={`policy-category-${processType.id}`} value={draft.policy_category} onChange={e => update({ policy_category: e.target.value })} style={inputStyle}>
            <option value="">None</option>
            {POLICY_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ width: 160 }}>
          <label htmlFor={`target-days-${processType.id}`} style={labelStyle}>Target days per stage</label>
          <input id={`target-days-${processType.id}`} type="number" min="1" value={draft.target_days} onChange={e => update({ target_days: e.target.value })} placeholder={String(DEFAULT_STAGE_TARGET_DAYS)} style={inputStyle} />
        </div>
      </div>

      <div>
        <Btn onClick={save} disabled={!dirty}>{dirty ? "Save template" : "Saved"}</Btn>
      </div>
    </div>
  );
}

export function ProcessTemplatesSection({ processTemplates, saveProcessTemplate }) {
  const [expandedId, setExpandedId] = useState(null);

  return (
    <Card>
      <h3 style={{ fontFamily: "DM Serif Display,Georgia,serif", fontSize: 16, color: "#1A1535", margin: "0 0 4px" }}>Process templates</h3>
      <p style={{ fontSize: 12, color: "#6B6375", margin: "0 0 16px" }}>Define required documents, suggested meetings, default tasks, suggested roles, a linked policy, and a target timescale for each process type. Default tasks are created automatically on every new case of that type; everything else appears as a checklist on the case itself.</p>
      {PROCESS_TYPES.map(processType => {
        const template = processTemplates.find(t => t.process_type === processType.id) || null;
        const taskCount = template?.default_tasks?.length || 0;
        const expanded = expandedId === processType.id;
        return (
          <Card key={processType.id} style={{ marginBottom: 12, padding: expanded ? 20 : 16 }}>
            <button onClick={() => setExpandedId(expanded ? null : processType.id)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1535" }}>{processType.label}</div>
              <div style={{ fontSize: 11, color: "#9B9098", marginTop: 2 }}>
                {template ? `${taskCount} default task${taskCount !== 1 ? "s" : ""} · target ${template.target_days || DEFAULT_STAGE_TARGET_DAYS}d` : "No template set — using defaults"}
              </div>
            </button>
            {expanded && <TemplateEditor processType={processType} template={template} saveProcessTemplate={saveProcessTemplate} />}
          </Card>
        );
      })}
    </Card>
  );
}
