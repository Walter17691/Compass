import { useMemo, useState } from 'react';
import { findPossibleDuplicates } from '../lib/employeeRecords';
import { COLOR, TYPE, FONT, SPACE, RADIUS } from '../styles/tokens';

// ─────────────────────────────────────────────────────────────────────────
// THE ONE employee selector. Phase E0.5A.
//
// Both case-creation paths use this component, so they cannot develop divergent
// identity semantics — which is exactly what happened before: the "+ New case"
// modal upserted an employee record by (org_id, name) while IntakeScreen created
// none at all, and both took the name as free text with a datalist sourced from
// existing CASES rather than the employee roster.
//
// ┌─ WHAT THIS COMPONENT RETURNS ───────────────────────────────────────────┐
// │ An employee's UUID. Never a name.                                        │
// │                                                                          │
// │ onChange(employeeId, employee) fires only when a human has picked a       │
// │ specific person from the roster. Typing alone selects nothing — even if   │
// │ the text exactly matches one employee — because "the string matched" is   │
// │ the mistake this whole programme is correcting.                           │
// └─────────────────────────────────────────────────────────────────────────┘
//
// It searches the canonical roster (employee_records), not cases, so an employee
// who has never had a case is findable — 396 production employees are currently
// unreachable for exactly that reason.
// ─────────────────────────────────────────────────────────────────────────

// Enough to tell two people apart, and nothing more. Job title, location and
// employee number are shown when present and silently omitted when not — a
// roster row with only a name is still selectable, because refusing it would
// block real work over missing optional metadata.
function describeEmployee(e) {
  return [e.jobTitle, e.location, e.employeeNumber ? `#${e.employeeNumber}` : null]
    .filter(Boolean).join(" · ");
}

const norm = v => (typeof v === "string" ? v.trim().toLowerCase() : "");

export function EmployeeSelect({
  employeeRecords = [],
  value = null,                 // the selected employee id, or null
  onChange,                     // (employeeId, employee) => void
  canCreateEmployee = false,    // HR only — see the E0 RLS decision
  onRequestCreate,              // opens the authorised creation route
  label = "Employee",
  disabled = false,
  inputId = "employee-select",
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(
    () => employeeRecords.find(e => e && e.id === value) || null,
    [employeeRecords, value]
  );

  // Ranked for a human to read: name matches first, then job title / location /
  // number, so typing "Manchester" or "1042" also finds someone.
  const matches = useMemo(() => {
    const q = norm(query);
    if (!q) return [];
    const scored = employeeRecords
      .filter(e => e && e.id)
      .map(e => {
        const name = norm(e.name);
        if (name === q) return { e, rank: 0 };
        if (name.startsWith(q)) return { e, rank: 1 };
        if (name.includes(q)) return { e, rank: 2 };
        if (norm(e.employeeNumber) === q) return { e, rank: 3 };
        if (`${norm(e.jobTitle)} ${norm(e.location)} ${norm(e.department)} ${norm(e.employeeNumber)}`.includes(q)) return { e, rank: 4 };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank || (a.e.name || "").localeCompare(b.e.name || ""));
    return scored.slice(0, 8).map(s => s.e);
  }, [employeeRecords, query]);

  // Shown when the text typed resembles someone already on the roster. Advisory:
  // it never picks, and the candidates each carry why they matched.
  const duplicateHints = useMemo(
    () => (canCreateEmployee && query.trim() ? findPossibleDuplicates(employeeRecords, { name: query }) : []),
    [canCreateEmployee, employeeRecords, query]
  );

  // Two people can legitimately share a display name. When the visible results
  // do, say so — the whole point is that the user picks the right row rather than
  // trusting the label.
  const sharedNames = useMemo(() => {
    const counts = new Map();
    matches.forEach(e => counts.set(norm(e.name), (counts.get(norm(e.name)) || 0) + 1));
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [matches]);

  if (selected) {
    return (
      <div>
        <label htmlFor={inputId} style={{ ...TYPE.metadata, color: COLOR.inkSoft, display: "block", marginBottom: SPACE.xs }}>{label}</label>
        <div id={inputId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: SPACE.md,
                     border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.surface, padding: `${SPACE.sm}px ${SPACE.md}px`, background: COLOR.surface }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...TYPE.rowName, color: COLOR.ink }}>{selected.name}</div>
            {describeEmployee(selected) && (
              <div style={{ ...TYPE.metadata, color: COLOR.inkFaint }}>{describeEmployee(selected)}</div>
            )}
          </div>
          {!disabled && (
            <button type="button" onClick={() => { onChange?.(null, null); setQuery(""); }}
              style={{ ...TYPE.metadata, background: "none", border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.chip,
                       padding: "4px 10px", color: COLOR.inkSoft, cursor: "pointer", fontFamily: FONT.sans, flexShrink: 0 }}>
              Change
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={inputId} style={{ ...TYPE.metadata, color: COLOR.inkSoft, display: "block", marginBottom: SPACE.xs }}>{label}</label>
      <input
        id={inputId}
        type="text"
        value={query}
        disabled={disabled}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by name, job title, location or employee number"
        autoComplete="off"
        style={{ width: "100%", padding: `${SPACE.sm}px ${SPACE.md}px`, border: `1px solid ${COLOR.borderStrong}`,
                 borderRadius: RADIUS.surface, fontSize: 14, fontFamily: FONT.sans, color: COLOR.ink, boxSizing: "border-box" }}
      />

      {query.trim() && matches.length > 0 && (
        <div role="listbox" aria-label="Matching employees"
          style={{ border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.surface, marginTop: SPACE.xs, overflow: "hidden" }}>
          {matches.map(e => (
            <button key={e.id} type="button" role="option" aria-selected="false"
              onClick={() => { onChange?.(e.id, e); setQuery(""); }}
              style={{ display: "block", width: "100%", textAlign: "left", background: COLOR.surface, border: "none",
                       borderBottom: `1px solid ${COLOR.borderFaint}`, padding: `${SPACE.sm}px ${SPACE.md}px`, cursor: "pointer", fontFamily: FONT.sans }}>
              <div style={{ ...TYPE.rowName, color: COLOR.ink }}>{e.name}</div>
              <div style={{ ...TYPE.metadata, color: COLOR.inkFaint }}>
                {describeEmployee(e) || "No further details on file"}
                {sharedNames.has(norm(e.name)) && " · another employee shares this name"}
              </div>
            </button>
          ))}
        </div>
      )}

      {query.trim() && matches.length === 0 && (
        <div style={{ ...TYPE.body, color: COLOR.inkSoft, marginTop: SPACE.sm }}>
          {/* No free-text fallback, for anyone. An employee who is not on the
              roster cannot be named into existence from a case form — that is
              precisely how 650 unreconciled subjects came to exist. */}
          No employee found for “{query.trim()}”.
          {canCreateEmployee
            ? " Check the spelling, or add them as a new employee."
            : " Check the spelling, or ask an HR Director or HR Manager to add them — then select them here."}
          {canCreateEmployee && onRequestCreate && (
            <div style={{ marginTop: SPACE.sm }}>
              <button type="button" onClick={() => onRequestCreate(query.trim())}
                style={{ ...TYPE.metadata, fontWeight: 700, background: COLOR.purple, color: COLOR.paper, border: "none",
                         borderRadius: RADIUS.button, padding: "7px 14px", cursor: "pointer", fontFamily: FONT.sans }}>
                Add “{query.trim()}” as a new employee
              </button>
            </div>
          )}
        </div>
      )}

      {duplicateHints.length > 0 && matches.length === 0 && (
        <div style={{ ...TYPE.metadata, color: COLOR.inkSoft, marginTop: SPACE.sm }}>
          Possible existing match — check before adding someone new.
        </div>
      )}
    </div>
  );
}
