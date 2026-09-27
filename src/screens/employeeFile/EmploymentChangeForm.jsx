import { useState } from 'react';
import { COLOR, TYPE, FONT, SPACE, RADIUS } from '../../styles/tokens';
import {
  CHANGEABLE_EVENT_TYPES, DOCUMENTATION_STATUSES, EMPLOYMENT_EVENT_TYPES, asDateOnly,
} from '../../lib/employmentEvents';

// ─────────────────────────────────────────────────────────────────────────
// Recording an employment change, and marking a leaver. Phase E1.7.
//
// The manager is not asked to edit raw fields and then separately remember to
// write history. They say what is changing, to what, and from when — and Compass
// keeps the old value, the new value and the effective date together.
//
// The distinction that matters is stated in plain words rather than explained:
//   * Correct employee details — fix something recorded wrongly.
//   * Record employment change — the employment itself is changing.
// ─────────────────────────────────────────────────────────────────────────

const field = {
  width: "100%", fontSize: 13, border: `1px solid ${COLOR.borderStrong}`, borderRadius: RADIUS.surface,
  padding: `${SPACE.sm}px ${SPACE.md}px`, fontFamily: FONT.sans, color: COLOR.ink,
  background: COLOR.surface, outline: "none", boxSizing: "border-box",
};
const label = { ...TYPE.metadata, color: COLOR.inkSoft, display: "block", marginBottom: SPACE.xs };
const primaryBtn = {
  ...TYPE.metadata, fontWeight: 700, background: COLOR.purple, border: "none",
  borderRadius: RADIUS.button, padding: "8px 16px", color: COLOR.paper,
  cursor: "pointer", fontFamily: FONT.sans,
};
const quietBtn = {
  ...TYPE.metadata, background: "none", border: `1px solid ${COLOR.border}`,
  borderRadius: RADIUS.button, padding: "8px 16px", color: COLOR.inkSoft,
  cursor: "pointer", fontFamily: FONT.sans,
};

const CURRENT_VALUE_OF = {
  job_title_changed: e => e?.jobTitle || "",
  department_changed: e => e?.department || "",
  manager_changed: e => e?.manager || "",
  working_pattern_changed: e => e?.workingPattern || "",
};

export function EmploymentChangeForm({
  employee, effectiveEmployee, locations = [], canChangeLocation = false,
  onRecord, onCancel, busy = false,
}) {
  const today = asDateOnly(new Date());
  // Only the changes this Compass can actually represent. A Location Manager is
  // not offered a transfer at all while that product decision is open, rather
  // than being offered one the database will refuse.
  const offered = CHANGEABLE_EVENT_TYPES.filter(t => t.kind !== "location" || canChangeLocation);
  const [eventType, setEventType] = useState(offered[0]?.id || "job_title_changed");
  const [newText, setNewText] = useState("");
  const [newLocationId, setNewLocationId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [documentationStatus, setDocumentationStatus] = useState("not_required");

  const type = EMPLOYMENT_EVENT_TYPES.find(t => t.id === eventType);
  const isLocation = type?.kind === "location";
  const base = effectiveEmployee || employee;
  const currentValue = isLocation
    ? (locations.find(l => l.id === base?.locationId)?.name || "Not assigned")
    : (CURRENT_VALUE_OF[eventType]?.(base) || "Not recorded");
  const ready = effectiveDate && (isLocation ? !!newLocationId : !!newText.trim());
  const isFuture = effectiveDate > today;

  return (
    <section style={{ maxWidth: 620 }}>
      <h2 style={{ ...TYPE.sectionHeading, color: COLOR.ink, margin: `0 0 ${SPACE.xs}px` }}>Record employment change</h2>
      <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: `0 0 ${SPACE.lg}px`, lineHeight: 1.6 }}>
        Use this when the employee's employment is actually changing. To fix something that was
        recorded incorrectly, use Correct employee details instead.
      </p>

      <div>
        <label htmlFor="ee-type" style={label}>What is changing?</label>
        <select id="ee-type" value={eventType} onChange={e => { setEventType(e.target.value); setNewText(""); setNewLocationId(""); }} style={field}>
          {offered.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {/* The current value is shown, not asked for: Compass already knows it, and
          it is what the event will record as the OLD value. */}
      <div style={{ marginTop: SPACE.md }}>
        <div style={label}>Current value</div>
        <div style={{ ...TYPE.rowContext, color: COLOR.ink }}>{currentValue}</div>
      </div>

      <div style={{ marginTop: SPACE.md }}>
        <label htmlFor="ee-new" style={label}>{type?.question || "New value"}</label>
        {isLocation ? (
          <select id="ee-new" value={newLocationId} onChange={e => setNewLocationId(e.target.value)}
            style={{ ...field, color: newLocationId ? COLOR.ink : COLOR.inkQuiet }}>
            <option value="">Choose a location…</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        ) : (
          <input id="ee-new" value={newText} onChange={e => setNewText(e.target.value)} style={field} />
        )}
      </div>

      <div style={{ marginTop: SPACE.md, maxWidth: 240 }}>
        <label htmlFor="ee-date" style={label}>Effective from</label>
        <input id="ee-date" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
          onClick={e => e.currentTarget.showPicker?.()}
          style={{ ...field, colorScheme: "light", cursor: "pointer" }} />
      </div>

      {isFuture && (
        // Said explicitly, because the whole point of effective dating is that
        // nothing changes yet — and a manager must not leave this screen thinking
        // it has.
        <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: `${SPACE.sm}px 0 0`, lineHeight: 1.6 }}>
          This is a future change. The employee's current details stay as they are until {effectiveDate}.
        </p>
      )}

      <div style={{ marginTop: SPACE.md, maxWidth: 320 }}>
        <label htmlFor="ee-doc" style={label}>Has the relevant documentation been sent?</label>
        <select id="ee-doc" value={documentationStatus} onChange={e => setDocumentationStatus(e.target.value)} style={field}>
          {DOCUMENTATION_STATUSES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.lg, flexWrap: "wrap" }}>
        <button type="button" disabled={busy || !ready}
          onClick={() => onRecord?.({ eventType, newText: newText.trim(), newLocationId, effectiveDate, documentationStatus })}
          style={{ ...primaryBtn, background: (busy || !ready) ? COLOR.border : COLOR.purple,
                   cursor: (busy || !ready) ? "default" : "pointer" }}>
          {busy ? "Recording…" : "Record change"}
        </button>
        <button type="button" onClick={onCancel} style={quietBtn}>Cancel</button>
      </div>
    </section>
  );
}

// ── Mark as leaver ─────────────────────────────────────────────────────────
//
// Nothing is deleted and nothing is moved. The copy says so, because "mark as
// leaver" is exactly the kind of action a user fears is destructive.
export function MarkAsLeaverForm({ employee, onRecord, onCancel, busy = false }) {
  const today = asDateOnly(new Date());
  const [leavingDate, setLeavingDate] = useState(today);
  const [note, setNote] = useState("");
  const [documentationStatus, setDocumentationStatus] = useState("not_required");
  const isFuture = leavingDate > today;

  return (
    <section style={{ maxWidth: 620 }}>
      <h2 style={{ ...TYPE.sectionHeading, color: COLOR.ink, margin: `0 0 ${SPACE.xs}px` }}>Mark as leaver</h2>
      <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: `0 0 ${SPACE.lg}px`, lineHeight: 1.6 }}>
        {employee?.name || "This employee"} stays in People until their last day. Their Employee File and
        full history are kept, and from that date they appear in Archive. Nothing is deleted.
      </p>

      <div style={{ maxWidth: 240 }}>
        <label htmlFor="leaver-date" style={label}>Last day of employment</label>
        <input id="leaver-date" type="date" value={leavingDate} onChange={e => setLeavingDate(e.target.value)}
          onClick={e => e.currentTarget.showPicker?.()}
          style={{ ...field, colorScheme: "light", cursor: "pointer" }} />
      </div>

      {isFuture && (
        <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: `${SPACE.sm}px 0 0`, lineHeight: 1.6 }}>
          They remain a current employee until {leavingDate}.
        </p>
      )}

      <div style={{ marginTop: SPACE.md }}>
        <label htmlFor="leaver-note" style={label}>Note (optional)</label>
        <textarea id="leaver-note" value={note} onChange={e => setNote(e.target.value)} rows={3}
          style={{ ...field, resize: "vertical" }} />
      </div>

      <div style={{ marginTop: SPACE.md, maxWidth: 320 }}>
        <label htmlFor="leaver-doc" style={label}>Has the relevant documentation been sent?</label>
        <select id="leaver-doc" value={documentationStatus} onChange={e => setDocumentationStatus(e.target.value)} style={field}>
          {DOCUMENTATION_STATUSES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.lg, flexWrap: "wrap" }}>
        <button type="button" disabled={busy || !leavingDate}
          onClick={() => onRecord?.({ leavingDate, note: note.trim(), documentationStatus })}
          style={{ ...primaryBtn, background: (busy || !leavingDate) ? COLOR.border : COLOR.purple,
                   cursor: (busy || !leavingDate) ? "default" : "pointer" }}>
          {busy ? "Recording…" : "Mark as leaver"}
        </button>
        <button type="button" onClick={onCancel} style={quietBtn}>Cancel</button>
      </div>
    </section>
  );
}
