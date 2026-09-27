import { useState } from 'react';
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
  jobTitle, setJobTitle, startDate, setStartDate,
  canAssignLocation = false, onSetLocation,
  onSave, onDelete, onCancel,
}) {
  const hasAny = !!(employee?.jobTitle || employee?.startDate || employee?.location);
  const canonicalId = employee?.locationId || "";
  const [chosen, setChosen] = useState(canonicalId);
  const canonical = locations.find(l => l.id === canonicalId);
  // Legacy free text is shown only when it exists AND says something the
  // canonical value doesn't already say — otherwise it is noise.
  const legacy = (employee?.location || "").trim();
  const legacyWorthShowing = legacy && legacy.toLowerCase() !== (canonical?.name || "").toLowerCase();
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
      </div>

      {/* ── Canonical location — Phase E1.5 ──────────────────────────────────
          Deliberately OUTSIDE the form grid and not saved by the Save button.
          Location is the field that decides who can see this person, so it is
          its own audited operation (set_employee_location) rather than one input
          among three. HR only: a Location Manager editing someone in their own
          location must not be able to move them into or out of that scope.

          The legacy free-text value is shown as CONTEXT and never pre-selects
          anything. In Compass LTD all five legacy values happen to match a
          canonical location name exactly, which is precisely why auto-selecting
          would feel helpful and be wrong — the match is a coincidence of
          spelling, not a record of anyone's decision. A human confirms it. */}
      <section style={{ borderTop: `1px solid ${COLOR.borderFaint}`, paddingTop: SPACE.lg, marginBottom: SPACE.lg }}>
        <div style={{ ...TYPE.rowContext, color: COLOR.ink, marginBottom: SPACE.xs }}>Location</div>

        {legacyWorthShowing && (
          <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: `0 0 ${SPACE.md}px`, lineHeight: 1.6 }}>
            Previously recorded as free text: “{legacy}”. Compass won't treat that as a location on its own —
            choose the matching location below to make it count.
          </p>
        )}

        {canAssignLocation ? (
          <div style={{ display: "flex", gap: SPACE.sm, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <label htmlFor="employee-canonical-location" style={label}>Assigned location</label>
              <select id="employee-canonical-location" value={chosen} onChange={e => setChosen(e.target.value)}
                style={{ ...field, color: chosen ? COLOR.ink : COLOR.inkQuiet }}>
                <option value="">Not assigned</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            {chosen !== canonicalId && (
              <button type="button" onClick={() => onSetLocation?.(chosen || null)}
                style={{ ...TYPE.metadata, fontWeight: 700, background: COLOR.purple, border: "none",
                         borderRadius: RADIUS.button, padding: "8px 14px", color: COLOR.paper,
                         cursor: "pointer", fontFamily: FONT.sans, flexShrink: 0 }}>
                {chosen ? "Set location" : "Clear location"}
              </button>
            )}
          </div>
        ) : (
          <p style={{ ...TYPE.rowContext, color: canonical ? COLOR.ink : COLOR.inkFaint, margin: 0 }}>
            {canonical ? canonical.name : "Not assigned"}
          </p>
        )}

        {!canonical && canAssignLocation && (
          <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: `${SPACE.sm}px 0 0`, lineHeight: 1.6 }}>
            While no location is assigned, only HR can see this employee.
          </p>
        )}
      </section>

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
