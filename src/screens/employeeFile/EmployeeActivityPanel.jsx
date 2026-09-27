import { useState } from 'react';
import { COLOR, TYPE, FONT, SPACE, RADIUS } from '../../styles/tokens';
import {
  ACTIVITY_TYPES, RECORD_TYPES, recordTypeLabel, usesConcernLifecycle,
} from '../../lib/employeeActivities';

// ─────────────────────────────────────────────────────────────────────────
// Employee File → Activity. Phase E1.6.
//
// One chronology, not a database table dump. A reader should be able to answer
// what happened, when, what kind of thing it was, who handled it, and whether
// anything is still open — without being shown machinery.
//
// The intelligence sits in the ordering and the grouping. An open concern carries
// its own chronology inline because that is the one case where several entries
// describe one matter; everything else is a single line.
// ─────────────────────────────────────────────────────────────────────────

const field = {
  width: "100%", fontSize: 13, border: `1px solid ${COLOR.borderStrong}`, borderRadius: RADIUS.surface,
  padding: `${SPACE.sm}px ${SPACE.md}px`, fontFamily: FONT.sans, color: COLOR.ink,
  background: COLOR.surface, outline: "none", boxSizing: "border-box",
};
const label = { ...TYPE.metadata, color: COLOR.inkSoft, display: "block", marginBottom: SPACE.xs };

const primaryBtn = {
  ...TYPE.metadata, fontWeight: 700, background: COLOR.purple, border: "none",
  borderRadius: RADIUS.button, padding: "8px 14px", color: COLOR.paper,
  cursor: "pointer", fontFamily: FONT.sans,
};
const quietBtn = {
  ...TYPE.metadata, background: "none", border: `1px solid ${COLOR.border}`,
  borderRadius: RADIUS.button, padding: "8px 14px", color: COLOR.inkSoft,
  cursor: "pointer", fontFamily: FONT.sans,
};

// ── Start, or record something that already happened ───────────────────────
//
// Both modes, one form. The difference that matters is the date, so the date is
// what changes — not a second screen with its own duplicate model. The mode is
// stated in words so a retrospective record never looks like a scheduled one.
export function StartActivityForm({ onCreate, onCancel, defaultType = "conversation", busy = false }) {
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState("record");   // record | start
  const [activityType, setActivityType] = useState(defaultType);
  const [title, setTitle] = useState("");
  const [occurredOn, setOccurredOn] = useState(today);
  const [note, setNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const isConcern = usesConcernLifecycle(activityType);
  const chosen = ACTIVITY_TYPES.find(t => t.id === activityType);

  return (
    <section style={{ border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card,
                      padding: SPACE.lg, background: COLOR.surface, maxWidth: 620 }}>
      <div style={{ ...TYPE.rowName, color: COLOR.ink, marginBottom: SPACE.md }}>
        {mode === "record" ? "Record something that happened" : "Start an activity"}
      </div>

      {/* Two modes, said plainly. A manager writing up yesterday's conversation
          and a manager about to hold one are doing different things, and the
          record must not later look like a calendar invitation that never was. */}
      <div role="radiogroup" aria-label="When did this happen" style={{ display: "flex", gap: SPACE.sm, marginBottom: SPACE.lg, flexWrap: "wrap" }}>
        {[["record", "It already happened"], ["start", "It is happening now or next"]].map(([id, text]) => (
          <button key={id} type="button" role="radio" aria-checked={mode === id}
            onClick={() => { setMode(id); if (id === "start") setOccurredOn(today); }}
            style={{ ...quietBtn, borderColor: mode === id ? COLOR.purple : COLOR.border,
                     color: mode === id ? COLOR.ink : COLOR.inkFaint,
                     fontWeight: mode === id ? 700 : 500 }}>
            {text}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: SPACE.md }}>
        <div>
          <label htmlFor="activity-type" style={label}>What kind of activity</label>
          <select id="activity-type" value={activityType} onChange={e => setActivityType(e.target.value)} style={field}>
            {ACTIVITY_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="activity-date" style={label}>
            {mode === "record" ? "Date it happened" : "Date"}
          </label>
          <input id="activity-date" type="date" value={occurredOn} max={mode === "record" ? today : undefined}
            onChange={e => setOccurredOn(e.target.value)}
            onClick={e => e.currentTarget.showPicker?.()}
            style={{ ...field, colorScheme: "light", cursor: "pointer" }} />
        </div>
      </div>

      {chosen?.blurb && (
        <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: `${SPACE.sm}px 0 0`, lineHeight: 1.6 }}>
          {chosen.blurb}
        </p>
      )}

      {isConcern && (
        <div style={{ marginTop: SPACE.md }}>
          <label htmlFor="activity-title" style={label}>What is the concern about</label>
          <input id="activity-title" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Timekeeping" style={field} />
        </div>
      )}

      <div style={{ marginTop: SPACE.md }}>
        <label htmlFor="activity-note" style={label}>
          {mode === "record" ? "What was discussed" : "Purpose or context"}
        </label>
        <textarea id="activity-note" value={note} onChange={e => setNote(e.target.value)} rows={4}
          style={{ ...field, resize: "vertical" }} />
      </div>

      <div style={{ marginTop: SPACE.md, maxWidth: 240 }}>
        <label htmlFor="activity-followup" style={label}>Follow up by (optional)</label>
        <input id="activity-followup" type="date" value={followUpDate}
          onChange={e => setFollowUpDate(e.target.value)}
          onClick={e => e.currentTarget.showPicker?.()}
          style={{ ...field, colorScheme: "light", cursor: "pointer" }} />
      </div>

      <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.lg, flexWrap: "wrap" }}>
        <button type="button" disabled={busy || !occurredOn}
          onClick={() => onCreate?.({ mode, activityType, title, occurredOn, note, followUpDate })}
          style={{ ...primaryBtn, background: (busy || !occurredOn) ? COLOR.border : COLOR.purple,
                   cursor: (busy || !occurredOn) ? "default" : "pointer" }}>
          {busy ? "Saving…" : mode === "record" ? "Record it" : "Start it"}
        </button>
        <button type="button" onClick={onCancel} style={quietBtn}>Cancel</button>
      </div>
    </section>
  );
}

// ── The chronology inside one activity ────────────────────────────────────
function ActivityChronology({ entry, onAddRecord, onResolve, busy }) {
  const [adding, setAdding] = useState(false);
  const [recordType, setRecordType] = useState("follow_up");
  const [body, setBody] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [occurredOn, setOccurredOn] = useState(today);

  return (
    <div style={{ marginTop: SPACE.md, paddingLeft: SPACE.md, borderLeft: `2px solid ${COLOR.borderFaint}` }}>
      {entry.records.map(r => (
        <div key={r.id} style={{ marginBottom: SPACE.sm }}>
          <div style={{ ...TYPE.metadata, color: COLOR.inkSoft, fontWeight: 600 }}>
            {recordTypeLabel(r.recordType)}
            <span style={{ color: COLOR.inkQuiet, fontWeight: 400 }}>
              {" · "}{(r.occurredAt || "").slice(0, 10)}
            </span>
          </div>
          {r.body && (
            <div style={{ ...TYPE.metadata, color: COLOR.inkFaint, lineHeight: 1.6, overflowWrap: "anywhere" }}>{r.body}</div>
          )}
        </div>
      ))}

      {adding ? (
        <div style={{ marginTop: SPACE.sm }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: SPACE.sm }}>
            <div>
              <label htmlFor={`rt-${entry.id}`} style={label}>Entry</label>
              <select id={`rt-${entry.id}`} value={recordType} onChange={e => setRecordType(e.target.value)} style={field}>
                {RECORD_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`rd-${entry.id}`} style={label}>Date</label>
              <input id={`rd-${entry.id}`} type="date" value={occurredOn} max={today}
                onChange={e => setOccurredOn(e.target.value)}
                onClick={e => e.currentTarget.showPicker?.()}
                style={{ ...field, colorScheme: "light", cursor: "pointer" }} />
            </div>
          </div>
          {recordType === "letter_of_concern" && (
            // The one place a person could mistake this for a sanction, so it is
            // said at the point of entry rather than in a policy document.
            <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: `${SPACE.sm}px 0 0`, lineHeight: 1.6 }}>
              A Letter of Concern is informal management action. It is not a formal disciplinary
              warning and does not appear under current warnings.
            </p>
          )}
          <div style={{ marginTop: SPACE.sm }}>
            <label htmlFor={`rb-${entry.id}`} style={label}>Detail</label>
            <textarea id={`rb-${entry.id}`} value={body} onChange={e => setBody(e.target.value)} rows={3}
              style={{ ...field, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.sm, flexWrap: "wrap" }}>
            <button type="button" disabled={busy}
              onClick={async () => {
                const ok = await onAddRecord?.(entry.id, { recordType, occurredOn, body });
                if (ok) { setAdding(false); setBody(""); setRecordType("follow_up"); }
              }}
              style={primaryBtn}>Add entry</button>
            <button type="button" onClick={() => setAdding(false)} style={quietBtn}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.sm, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setAdding(true)}
            style={{ ...TYPE.metadata, fontWeight: 700, background: "none", border: "none", padding: 0,
                     color: COLOR.purple, cursor: "pointer", fontFamily: FONT.sans }}>
            + Add an entry
          </button>
          {entry.isConcern && entry.open && (
            <button type="button" disabled={busy} onClick={() => onResolve?.(entry.id)}
              style={{ ...TYPE.metadata, fontWeight: 700, background: "none", border: "none", padding: 0,
                       color: COLOR.purple, cursor: "pointer", fontFamily: FONT.sans }}>
              Mark resolved
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── The Activity tab ──────────────────────────────────────────────────────
export function EmployeeActivityPanel({
  file, onCreateActivity, onAddRecord, onResolveConcern, onOpenCase, fmtDate, busy = false,
}) {
  const [starting, setStarting] = useState(false);
  const entries = file?.activityEntries || [];
  const openConcerns = (file?.openConcerns || []).length;

  return (
    <div>
      {starting ? (
        <div style={{ marginBottom: SPACE.lg }}>
          <StartActivityForm busy={busy}
            onCreate={async (input) => { const ok = await onCreateActivity?.(input); if (ok) setStarting(false); }}
            onCancel={() => setStarting(false)} />
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: SPACE.md, marginBottom: SPACE.lg, flexWrap: "wrap" }}>
          <p style={{ ...TYPE.metadata, color: COLOR.inkQuiet, margin: 0, lineHeight: 1.6, maxWidth: 520 }}>
            This is the authorised record of management activity for this employee — conversations,
            concerns, and the formal processes and meetings already on file.
          </p>
          <button type="button" onClick={() => setStarting(true)} style={{ ...primaryBtn, flexShrink: 0 }}>
            Record an activity
          </button>
        </div>
      )}

      {openConcerns > 0 && (
        <p style={{ ...TYPE.metadata, color: COLOR.inkSoft, margin: `0 0 ${SPACE.md}px` }}>
          {openConcerns === 1 ? "1 open management concern" : `${openConcerns} open management concerns`}
        </p>
      )}

      {entries.length === 0 ? (
        <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card,
                      padding: `${SPACE.xl}px ${SPACE.lg}px`, maxWidth: 620 }}>
          <div style={{ ...TYPE.rowName, color: COLOR.ink }}>Nothing recorded yet</div>
          <p style={{ ...TYPE.rowContext, color: COLOR.inkFaint, margin: `${SPACE.sm}px 0 0`, lineHeight: 1.6 }}>
            Conversations, concerns, meetings and formal processes will appear here as they are recorded.
          </p>
        </div>
      ) : (
        <div style={{ border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
          {entries.map((entry, i) => (
            <div key={`${entry.kind}:${entry.id}`}
              style={{ padding: `${SPACE.md}px ${SPACE.lg}px`, background: COLOR.surface,
                       borderTop: i === 0 ? "none" : `1px solid ${COLOR.borderFaint}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                            gap: SPACE.md, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <div style={{ ...TYPE.rowName, color: COLOR.ink, overflowWrap: "anywhere" }}>
                    {entry.typeLabel}{entry.title ? ` — ${entry.title}` : ""}
                  </div>
                  <div style={{ ...TYPE.metadata, color: COLOR.inkFaint, marginTop: 2 }}>
                    {[
                      entry.occurredAt ? (fmtDate ? fmtDate(entry.occurredAt) : String(entry.occurredAt).slice(0, 10)) : null,
                      entry.stateLabel,
                      entry.managerName || null,
                      // Stated, never hidden: this was written up after the event.
                      entry.recordedLater ? "recorded later" : null,
                      entry.hasLetterOfConcern ? "Letter of Concern on file" : null,
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {entry.kind !== "activity" && entry.caseId && onOpenCase && (
                  <button type="button" onClick={() => onOpenCase(entry.caseId)}
                    style={{ ...TYPE.metadata, background: "none", border: "none", padding: 0,
                             color: COLOR.purple, cursor: "pointer", fontFamily: FONT.sans, flexShrink: 0 }}>
                    Open case
                  </button>
                )}
                {entry.kind === "process" && onOpenCase && (
                  <button type="button" onClick={() => onOpenCase(entry.id)}
                    style={{ ...TYPE.metadata, background: "none", border: "none", padding: 0,
                             color: COLOR.purple, cursor: "pointer", fontFamily: FONT.sans, flexShrink: 0 }}>
                    Open case
                  </button>
                )}
              </div>

              {/* Progressive disclosure: only an activity has an inner chronology,
                  and only a concern usually has more than one entry in it. */}
              {entry.kind === "activity" && (entry.isConcern || entry.records.length > 0) && (
                <ActivityChronology entry={entry} busy={busy}
                  onAddRecord={onAddRecord} onResolve={onResolveConcern} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
