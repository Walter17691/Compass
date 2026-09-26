import { COLOR, TYPE, FONT, SPACE, RADIUS } from '../../styles/tokens';

// ─────────────────────────────────────────────────────────────────────────
// Editing employment details. Phase E1.
//
// Carried over from Person View, which was the ONLY per-employee edit flow in
// the product — deleting that screen without this would have removed a real
// capability, not just a layout.
//
// It is a FOCUSED MODE, not a panel living on Overview. An Overview that is also
// a form is neither: the reader came to understand what is happening, and a page
// of inputs competing with that is exactly the clutter this phase is removing.
//
// Both writes are by canonical id (E0.5A.1): `employeeId: employee.id` on save
// and `deleteEmployeeRecord(employee.id)` on delete. Deleting by name would
// remove the wrong person the moment two employees in one organisation share
// one.
// ─────────────────────────────────────────────────────────────────────────

const field = {
  width: "100%", fontSize: 13, border: `1px solid ${COLOR.borderStrong}`, borderRadius: RADIUS.surface,
  padding: `${SPACE.sm}px ${SPACE.md}px`, fontFamily: FONT.sans, color: COLOR.ink,
  background: COLOR.surface, outline: "none", boxSizing: "border-box",
};
const label = { ...TYPE.metadata, color: COLOR.inkSoft, display: "block", marginBottom: SPACE.xs };

export function EmployeeDetailsEdit({
  employee, locations = [],
  jobTitle, setJobTitle, startDate, setStartDate, location, setLocation,
  onSave, onDelete, onCancel,
}) {
  const hasAny = !!(employee?.jobTitle || employee?.startDate || employee?.location);
  return (
    <section style={{ maxWidth: 620 }}>
      <h2 style={{ ...TYPE.sectionHeading, color: COLOR.ink, margin: `0 0 ${SPACE.lg}px` }}>Employment details</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: SPACE.lg, marginBottom: SPACE.lg }}>
        <div>
          <label htmlFor="employee-job-title" style={label}>Job title</label>
          <input id="employee-job-title" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
            placeholder="e.g. Sales Manager" style={field} />
        </div>
        <div>
          <label htmlFor="employee-start-date" style={label}>Start date</label>
          <input id="employee-start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            onClick={e => e.currentTarget.showPicker?.()} style={{ ...field, colorScheme: "light", cursor: "pointer" }} />
        </div>
        <div>
          <label htmlFor="employee-location" style={label}>Location</label>
          <select id="employee-location" value={location} onChange={e => setLocation(e.target.value)}
            style={{ ...field, color: location ? COLOR.ink : COLOR.inkQuiet }}>
            <option value="">Select…</option>
            {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            <option value="__other__">Other</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
        <button type="button" onClick={onSave}
          style={{ ...TYPE.metadata, fontWeight: 700, background: COLOR.purple, border: "none",
                   borderRadius: RADIUS.button, padding: "8px 16px", color: COLOR.paper,
                   cursor: "pointer", fontFamily: FONT.sans }}>
          Save
        </button>
        <button type="button" onClick={onCancel}
          style={{ ...TYPE.metadata, background: "none", border: `1px solid ${COLOR.border}`,
                   borderRadius: RADIUS.button, padding: "8px 16px", color: COLOR.inkSoft,
                   cursor: "pointer", fontFamily: FONT.sans }}>
          Cancel
        </button>
        {hasAny && (
          <button type="button" onClick={onDelete}
            style={{ ...TYPE.metadata, background: "none", border: `1px solid ${COLOR.border}`,
                     borderRadius: RADIUS.button, padding: "8px 16px", color: COLOR.red,
                     cursor: "pointer", fontFamily: FONT.sans, marginLeft: "auto" }}>
            Delete details
          </button>
        )}
      </div>
    </section>
  );
}
