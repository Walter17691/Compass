import { useMemo, useState } from 'react';
import { findPossibleDuplicates } from '../lib/employeeRecords';
import { COLOR, TYPE, FONT, SPACE, RADIUS } from '../styles/tokens';

// ─────────────────────────────────────────────────────────────────────────
// Create an employee WITHOUT leaving the journey you are in.
//
// The dead end this replaces: EmployeeSelect has always offered
// `Add "[name]" as a new employee`, but both case-creation paths wired that
// callback to `setScreen(SCREENS.SETTINGS)` plus a toast telling the adviser to
// go and do it in Settings. Settings → Employee data only ever exposed CSV
// import/export, so the action promised an operation Compass did not provide —
// and the redirect discarded every value already typed into the case form.
//
// This renders INSIDE the current screen. That is the whole fix for state
// preservation: case type, owner, priority, description and evidence are React
// state in the hosting component, so nothing needs saving or restoring as long
// as nothing navigates away.
//
// DELIBERATELY LIGHTWEIGHT. Name and location only. Creating a case is not the
// moment to fill in an HRIS record, and every other field on the canonical
// model is nullable and reachable later from the Employee File.
//
// LOCATION SEMANTICS ARE COPIED FROM PeopleScreen, not reinvented: a location
// manager may only create into a location they are authorised for and may never
// create an unassigned employee; HR may, but has to choose that option
// explicitly rather than reach it by leaving a field alone. RLS enforces both —
// this only decides what the form offers, so it never presents a choice the
// database is going to refuse.
// ─────────────────────────────────────────────────────────────────────────

const UNASSIGNED = "__unassigned__";

export function EmployeeCreateInline({
  initialName = "",
  employeeRecords = [],
  locations = [],
  authorisedLocationIds = null,   // non-null => location manager, scoped
  isHR = false,
  onCreate,                       // (name, locationId) => Promise<{ok, employee}>
  onCreated,                      // (employee) => void  — selection happens here
  onCancel,
  idPrefix = "inline-employee",
}) {
  const [name, setName] = useState(initialName);
  const [locationId, setLocationId] = useState("");
  const [saving, setSaving] = useState(false);

  const assignable = authorisedLocationIds
    ? locations.filter(l => authorisedLocationIds.includes(l.id))
    : locations;
  const mayLeaveUnassigned = isHR;

  // Advisory only. The database's UNIQUE(org_id, name) is the boundary; this
  // just gives the adviser a chance to notice before they hit it. Employee
  // number and work email are matched too even though neither is constrained,
  // because a likely duplicate is worth seeing either way.
  const duplicates = useMemo(
    () => (name.trim() ? findPossibleDuplicates(employeeRecords, { name: name.trim() }) : []),
    [employeeRecords, name]
  );

  const canSave = !!name.trim() && !!locationId && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    const chosen = locationId === UNASSIGNED ? null : locationId;
    const res = await onCreate?.(name.trim(), chosen);
    setSaving(false);
    // The failure message is the caller's to show — it owns the result codes.
    // Staying open with the typed name intact is deliberate: a duplicate name
    // is something the adviser needs to look at, not retype.
    if (res?.ok) onCreated?.(res.employee);
  };

  const field = {
    width: "100%", fontSize: 13, border: `1px solid ${COLOR.borderStrong}`,
    borderRadius: RADIUS.surface, padding: `${SPACE.sm}px ${SPACE.md}px`,
    fontFamily: FONT.sans, color: COLOR.ink, background: COLOR.surface,
    outline: "none", boxSizing: "border-box",
  };
  const label = { ...TYPE.metadata, color: COLOR.inkSoft, display: "block", marginBottom: SPACE.xs };

  return (
    <div style={{ border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card,
                  padding: SPACE.md, marginTop: SPACE.sm, background: COLOR.surface }}>
      <div style={{ ...TYPE.rowContext, color: COLOR.ink, marginBottom: SPACE.sm }}>Add a new employee</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: SPACE.md }}>
        <div>
          <label htmlFor={`${idPrefix}-name`} style={label}>Full name</label>
          <input id={`${idPrefix}-name`} value={name} onChange={e => setName(e.target.value)} style={field} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-location`} style={label}>Location</label>
          <select id={`${idPrefix}-location`} value={locationId}
                  onChange={e => setLocationId(e.target.value)}
                  style={{ ...field, color: locationId ? COLOR.ink : COLOR.inkQuiet }}>
            <option value="">Choose a location…</option>
            {assignable.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            {/* HR only, and worded so choosing it is a decision rather than the
                result of leaving a field alone. */}
            {mayLeaveUnassigned && (
              <option value={UNASSIGNED}>No location yet — HR only until one is assigned</option>
            )}
          </select>
        </div>
      </div>

      {duplicates.length > 0 && (
        <div role="status" style={{ ...TYPE.metadata, color: COLOR.amber, marginTop: SPACE.sm, lineHeight: 1.5 }}>
          {duplicates.length === 1
            ? `There is already an employee called “${duplicates[0].employee.name}”. Check whether this is the same person — Compass will not merge two people with the same name.`
            : `${duplicates.length} existing employees match that name. Check whether this is the same person.`}
        </div>
      )}

      <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.md, flexWrap: "wrap" }}>
        <button type="button" onClick={submit} disabled={!canSave}
          style={{ ...TYPE.metadata, fontWeight: 700, background: canSave ? COLOR.purple : COLOR.border,
                   border: "none", borderRadius: RADIUS.button, padding: "8px 14px",
                   color: COLOR.paper, cursor: canSave ? "pointer" : "default", fontFamily: FONT.sans }}>
          {saving ? "Adding…" : "Add employee"}
        </button>
        <button type="button" onClick={onCancel}
          style={{ ...TYPE.metadata, background: "none", border: `1px solid ${COLOR.border}`,
                   borderRadius: RADIUS.button, padding: "8px 14px", color: COLOR.inkSoft,
                   cursor: "pointer", fontFamily: FONT.sans }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
