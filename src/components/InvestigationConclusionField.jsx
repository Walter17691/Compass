import { useState } from 'react';
import {
  INVESTIGATION_CONCLUSION_VALUES,
  INVESTIGATION_CONCLUSION_COPY,
  conclusionLabel,
  conclusionMeaning,
} from '../lib/investigationConclusion';

// ─────────────────────────────────────────────────────────────────────────
// THE INVESTIGATION CONCLUSION, FOR ONE ALLEGATION.
//
// Placed at the END of the investigation work for the allegation — after the
// evidence, the accounts, the investigator's assessment and the outstanding
// uncertainty — because it is the conclusion OF that work. Putting it above any
// of them would invite the answer before the material that supports it.
//
// PROGRESSIVE DISCLOSURE, because Slice 1 removed density from this screen on
// purpose and this must not quietly put it back. Until the user chooses to
// conclude there is one line and one button. The three choices and the reasoning
// box appear only when they are being used, and collapse back to a summary
// afterwards. No always-visible panel, no intelligence, no distributions.
//
// WHAT THE COPY MUST NEVER DO. "Case to answer" is not a finding. Each option
// states only what does or does not follow for the process, and the word
// substantiated appears nowhere in this component.
// ─────────────────────────────────────────────────────────────────────────

const INK = "#0F1224", SOFT = "#4A4E63", QUIET = "#8A8EA3";
const LINE = "#E3E5EE", PURPLE = "#7A2FD8", WASH = "#F8F7FC";

export function InvestigationConclusionField({
  allegation,
  canRecord = false,
  onRecord,              // (conclusion, reasoning) => Promise<boolean>
  fmtDate,
  orgMembers,
}) {
  const current = allegation?.investigationConclusion || null;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(current || "");
  const [reasoning, setReasoning] = useState(allegation?.investigationConclusionReasoning || "");
  const [saving, setSaving] = useState(false);

  const canSave = !!choice && !!reasoning.trim() && !saving;
  const amending = !!current;

  const begin = () => {
    setChoice(current || "");
    setReasoning(allegation?.investigationConclusionReasoning || "");
    setOpen(true);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await onRecord?.(choice, reasoning.trim());
    setSaving(false);
    // Stays open on failure so the typed reasoning is not lost — a refusal or a
    // conflict is something to read and respond to, not retype.
    if (ok) setOpen(false);
  };

  const recordedBy = (() => {
    if (!allegation?.investigationConclusionBy || !orgMembers) return "";
    const m = orgMembers.find(x => x.user_id === allegation.investigationConclusionBy);
    return m ? ` by ${m.name}` : "";
  })();

  const labelStyle = { fontSize: 11, fontWeight: 700, color: SOFT, display: "block", marginBottom: 6 };

  // ── Not being edited ────────────────────────────────────────────────────
  if (!open) {
    if (!current) {
      return (
        <div style={{ marginBottom: 12 }}>
          {canRecord ? (
            <button type="button" onClick={begin}
              style={{ fontSize: 12, fontWeight: 700, background: "none", border: `1px solid ${PURPLE}`,
                       borderRadius: 6, padding: "7px 13px", color: PURPLE, cursor: "pointer" }}>
              Record investigation conclusion
            </button>
          ) : (
            <div style={{ fontSize: 12, color: QUIET }}>
              <span style={{ fontWeight: 700, color: SOFT }}>Investigation conclusion: </span>
              Not yet recorded
            </div>
          )}
        </div>
      );
    }
    return (
      <div style={{ marginBottom: 12, background: WASH, border: `1px solid ${LINE}`, borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: SOFT, marginBottom: 4 }}>Investigation conclusion</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 3 }}>{conclusionLabel(current)}</div>
        <div style={{ fontSize: 11, color: QUIET, lineHeight: 1.5, marginBottom: 8 }}>{conclusionMeaning(current)}</div>
        {allegation.investigationConclusionReasoning && (
          <div style={{ fontSize: 12, color: INK, lineHeight: 1.55, whiteSpace: "pre-wrap", marginBottom: 8 }}>
            {allegation.investigationConclusionReasoning}
          </div>
        )}
        {allegation.investigationConclusionAt && (
          <div style={{ fontSize: 11, color: QUIET }}>
            Recorded {fmtDate ? fmtDate(allegation.investigationConclusionAt)
                              : new Date(allegation.investigationConclusionAt).toLocaleDateString("en-GB")}{recordedBy}
          </div>
        )}
        {canRecord && (
          <button type="button" onClick={begin}
            style={{ marginTop: 8, fontSize: 11, fontWeight: 700, background: "none", border: `1px solid ${LINE}`,
                     borderRadius: 6, padding: "5px 11px", color: SOFT, cursor: "pointer" }}>
            Amend conclusion
          </button>
        )}
      </div>
    );
  }

  // ── Being recorded or amended ───────────────────────────────────────────
  return (
    <div style={{ marginBottom: 12, background: WASH, border: `1px solid ${PURPLE}`, borderRadius: 8, padding: 12 }}>
      <div id={`conclusion-legend-${allegation.id}`} style={{ ...labelStyle, marginBottom: 3 }}>
        {amending ? "Amend the investigation conclusion" : "Investigation conclusion"}
      </div>
      <div style={{ fontSize: 11, color: QUIET, lineHeight: 1.5, marginBottom: 10 }}>
        This records what the investigation concluded about whether the allegation should be considered at a
        disciplinary hearing. It is not a decision on the allegation itself.
      </div>

      <div role="radiogroup" aria-labelledby={`conclusion-legend-${allegation.id}`} style={{ marginBottom: 12 }}>
        {/* The option's accessible NAME is the choice itself ("Case to answer");
            the explanation is attached with aria-describedby rather than folded
            into the name, so a screen reader announces the choice and then the
            explanation instead of one long run-on label. */}
        {INVESTIGATION_CONCLUSION_VALUES.map(v => {
          const selected = choice === v;
          const id = `conclusion-${allegation.id}-${v}`;
          return (
            <div key={v}
              style={{ marginBottom: 7, background: selected ? "#FFFFFF" : "none",
                       border: `1px solid ${selected ? PURPLE : LINE}`, borderRadius: 6, padding: "9px 11px" }}>
              <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <input type="radio" id={id} name={`conclusion-${allegation.id}`}
                  value={v} checked={selected} onChange={() => setChoice(v)}
                  aria-describedby={`${id}-desc`}
                  style={{ marginTop: 2, accentColor: PURPLE, flexShrink: 0 }} />
                <label htmlFor={id}
                  style={{ fontSize: 12.5, fontWeight: 700, color: INK, cursor: "pointer" }}>
                  {INVESTIGATION_CONCLUSION_COPY[v].label}
                </label>
              </div>
              <div id={`${id}-desc`}
                style={{ fontSize: 11, color: QUIET, lineHeight: 1.5, marginTop: 3, paddingLeft: 22 }}>
                {INVESTIGATION_CONCLUSION_COPY[v].meaning}
              </div>
            </div>
          );
        })}
      </div>

      <label htmlFor={`conclusion-reasoning-${allegation.id}`} style={labelStyle}>
        Reasoning for this conclusion
      </label>
      <textarea id={`conclusion-reasoning-${allegation.id}`} rows={3} value={reasoning}
        onChange={e => setReasoning(e.target.value)}
        placeholder="Briefly, what in the investigation leads to this conclusion?"
        style={{ width: "100%", fontSize: 13, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 10px",
                 color: INK, background: "#FFFFFF", outline: "none", resize: "vertical", boxSizing: "border-box",
                 fontFamily: "inherit" }} />

      {amending && (
        <div role="status" style={{ fontSize: 11, color: SOFT, marginTop: 8, lineHeight: 1.5 }}>
          Amending is recorded. The previous conclusion and this change are both kept in the case's audit trail.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={save} disabled={!canSave}
          style={{ fontSize: 12, fontWeight: 700, background: canSave ? PURPLE : LINE, border: "none",
                   borderRadius: 6, padding: "7px 13px", color: "#FFFFFF",
                   cursor: canSave ? "pointer" : "default" }}>
          {saving ? "Saving…" : amending ? "Save amended conclusion" : "Save conclusion"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          style={{ fontSize: 12, background: "none", border: `1px solid ${LINE}`, borderRadius: 6,
                   padding: "7px 13px", color: SOFT, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
