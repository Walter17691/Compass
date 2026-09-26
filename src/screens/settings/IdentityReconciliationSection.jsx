import { useMemo, useState } from 'react';
import { Btn, Card } from '../../components/Primitives';
import { EmployeeSelect } from '../../components/EmployeeSelect';
import {
  RECONCILIATION, NO_CANDIDATE, EVIDENCE,
  groupLegacyForReview, summariseGroup, describeEvidence,
} from '../../lib/employeeReconciliation';
import { MIN_CORRECTION_REASON, correctionReasonIsUsable } from '../../lib/reconciliationWrites';

// ─────────────────────────────────────────────────────────────────────────
// THE RECONCILIATION WORKBENCH. Phase E0.5B.
//
// An administrative migration surface, not a redesign of People and not the
// Employee File. Its whole job is to let an authorised human answer one question
// per record: "which canonical employee is this historical case actually about?"
//
// ┌─ WHAT THIS SCREEN MAY AND MAY NOT DO ───────────────────────────────────┐
// │ It PROPOSES. The human DECIDES. Compass records the decision.             │
// │                                                                          │
// │ • Nothing is reconciled by opening, expanding or scrolling this screen.   │
// │ • A proposal is never pre-selected, pre-checked or defaulted.             │
// │ • "Matched on name" is shown as exactly that — one weak signal — never    │
// │   dressed up as corroboration Compass does not have.                     │
// │ • Grouping by display name is an ERGONOMIC convenience. Three cases in    │
// │   one group may legitimately belong to two different people, so every     │
// │   case carries its own control and its own decision.                     │
// └─────────────────────────────────────────────────────────────────────────┘
//
// There is deliberately no "reconcile all", no "accept all candidates" and no
// group-level assign. The batch action the brief permits was deferred on
// evidence: the only real customer organisation has 9 unreconciled cases and no
// repeated subject at all, so a batch control would carry risk for no work.
// ─────────────────────────────────────────────────────────────────────────

const PANEL = { background: "#FDFAF5", border: "1px solid #E8E0D0", borderRadius: 10, padding: "14px 16px" };
const META = { fontSize: 12, color: "#6B6375" };

// Enough to tell two people apart. Shared by the candidate rows and the
// correction panel so the two cannot describe the same person differently.
function describeEmployeeLine(e) {
  return [e.jobTitle, e.location, e.employeeNumber ? `#${e.employeeNumber}` : null]
    .filter(Boolean).join(" · ");
}

const STATE_LABEL = {
  [RECONCILIATION.CANDIDATE]: "Possible match — needs confirming",
  [RECONCILIATION.AMBIGUOUS]: "Several people could be this subject",
  [RECONCILIATION.CONFLICT]: "Evidence disagrees",
  [RECONCILIATION.UNRECONCILED]: "No match on the employee roster",
  [RECONCILIATION.RESOLVED]: "Reconciled",
};

function describeMatchedOn(evidence) {
  // Reads out every dimension, including the ones Compass could not compare.
  // An absent value must never look like agreement, so "no comparable value"
  // is said out loud rather than omitted.
  const rows = [
    ["Name", evidence.name],
    ["Work email", evidence.workEmail],
    ["Employee number", evidence.employeeNumber],
    ["Location", evidence.location],
  ];
  return rows.map(([label, outcome]) => ({
    label,
    outcome,
    text: outcome === EVIDENCE.MATCHES ? "matches"
        : outcome === EVIDENCE.DIFFERS ? "differs"
        : "no comparable value held",
  }));
}

function EvidencePanel({ legacyCase, employee, caseLocationName }) {
  const rows = describeMatchedOn(describeEvidence(legacyCase, employee, caseLocationName));
  return (
    <div style={{ ...META, marginTop: 6, lineHeight: 1.7 }}>
      {rows.map(r => (
        <div key={r.label}>
          <span style={{ color: r.outcome === EVIDENCE.MATCHES ? "#2E7D5B" : r.outcome === EVIDENCE.DIFFERS ? "#C84B2F" : "#9A94A8" }}>
            {r.outcome === EVIDENCE.MATCHES ? "✓" : r.outcome === EVIDENCE.DIFFERS ? "✕" : "—"}
          </span>{" "}
          {r.label}: {r.text}
        </div>
      ))}
    </div>
  );
}

// One historical case: its own state, its own candidates, its own decision.
function CaseRow({ legacyCase, employeeRecords, canCreateEmployee, onRequestCreateEmployee, onReconcile, busyCaseId, locationNameFor, canCorrect = false, onCorrect }) {
  const [manualId, setManualId] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctingId, setCorrectingId] = useState(null);
  const [reason, setReason] = useState("");
  const cls = legacyCase.classification;
  const busy = busyCaseId === legacyCase.id;
  const candidates = (cls.candidateIds || [])
    .map(id => employeeRecords.find(e => e && e.id === id))
    .filter(Boolean);
  const caseLocationName = locationNameFor ? locationNameFor(legacyCase.locationId) : null;

  const describeCase = [legacyCase.caseType, legacyCase.stage,
    legacyCase.createdAt ? String(legacyCase.createdAt).slice(0, 10) : null].filter(Boolean).join(" · ");

  if (cls.state === RECONCILIATION.RESOLVED) {
    const emp = employeeRecords.find(e => e && e.id === cls.employeeId);
    const target = correctingId ? employeeRecords.find(e => e && e.id === correctingId) : null;
    return (
      <div style={{ ...PANEL, marginTop: 8, background: "#F4FAF6", borderColor: "#CFE6D8" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "#1A1535" }}>
              Reconciled to {emp ? emp.name : "an employee record"}
            </div>
            <div style={META}>{describeCase}</div>
            {/* The historical name is NOT rewritten, so say what it still reads. */}
            <div style={{ ...META, marginTop: 4 }}>Recorded on this case as “{legacyCase.employeeName || "(no name)"}”</div>
          </div>
          {/* HR DIRECTOR ONLY, and deliberately NOT styled as an ordinary
              "Edit": this moves a case between two people's Employee Files.
              An HR Manager sees the resolved identity above and no control. */}
          {canCorrect && !correcting && (
            <Btn variant="ghost" onClick={() => setCorrecting(true)}
              style={{ padding: "4px 10px", fontSize: 12, flexShrink: 0 }}>
              Correct employee identity
            </Btn>
          )}
        </div>

        {correcting && (
          <div style={{ borderTop: "1px solid #CFE6D8", marginTop: 10, paddingTop: 10 }}>
            <div style={{ ...META, lineHeight: 1.6, marginBottom: 10 }}>
              This changes which Employee File this historical case belongs to. The original decision and the
              correction will both remain in the audit history.
            </div>
            <div style={{ ...META, marginBottom: 8 }}>
              <strong>Current employee:</strong> {emp ? emp.name : "(unknown)"}
              {emp && describeEmployeeLine(emp) ? ` · ${describeEmployeeLine(emp)}` : ""}
            </div>
            <EmployeeSelect
              inputId={`correct-${legacyCase.id}`}
              employeeRecords={employeeRecords}
              value={correctingId}
              onChange={id => setCorrectingId(id)}
              label="New employee"
            />
            <div style={{ marginTop: 10 }}>
              <label htmlFor={`correct-reason-${legacyCase.id}`} style={{ ...META, display: "block", marginBottom: 4 }}>
                Reason for the correction
              </label>
              <textarea
                id={`correct-reason-${legacyCase.id}`}
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                placeholder="Why was the original identity wrong?"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #CFC7B8", borderRadius: 8,
                         fontSize: 13, fontFamily: "DM Sans,system-ui,sans-serif", boxSizing: "border-box" }}
              />
              {reason.trim().length > 0 && !correctionReasonIsUsable(reason) && (
                <div style={{ ...META, color: "#C84B2F" }}>
                  Give at least {MIN_CORRECTION_REASON} characters — this is kept in the audit history.
                </div>
              )}
            </div>
            {/* Explicit confirmation naming BOTH people, so the change cannot be
                made without reading who it moves the case from and to. */}
            {target && correctionReasonIsUsable(reason) && (
              <div style={{ ...META, marginTop: 10, color: "#1A1535" }}>
                Change this case from <strong>{emp ? emp.name : "(unknown)"}{emp?.employeeNumber ? ` #${emp.employeeNumber}` : ""}</strong>
                {" "}to <strong>{target.name}{target.employeeNumber ? ` #${target.employeeNumber}` : ""}</strong>?
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Btn variant="secondary"
                disabled={busy || !target || !correctionReasonIsUsable(reason)}
                onClick={() => onCorrect(legacyCase, target, reason)}
                style={{ padding: "6px 12px", fontSize: 12 }}>
                {busy ? "Saving…" : "Confirm correction"}
              </Btn>
              <Btn variant="ghost" onClick={() => { setCorrecting(false); setCorrectingId(null); setReason(""); }}
                style={{ padding: "6px 12px", fontSize: 12 }}>Cancel</Btn>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...PANEL, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#1A1535" }}>{describeCase || "Case"}</div>
          <div style={META}>{STATE_LABEL[cls.state]}</div>
        </div>
        {!dismissed && (
          <Btn variant="ghost" onClick={() => setDismissed(true)} style={{ padding: "4px 10px", fontSize: 12 }}>
            Leave unresolved
          </Btn>
        )}
      </div>

      {dismissed && (
        <div style={{ ...META, marginTop: 8 }}>
          {/* Honest about what this button did: nothing was written. There is no
              "deliberately unresolved" column, and inventing one to make a
              button feel decisive would be worse than saying so. */}
          Left unresolved. Nothing has been recorded — this case will appear here again next time.
        </div>
      )}

      {!dismissed && (
        <>
          {cls.state === RECONCILIATION.CONFLICT && (
            <div style={{ ...META, marginTop: 8, color: "#C84B2F" }}>
              Different pieces of evidence point at different employees. Compass will not choose between them.
            </div>
          )}
          {cls.state === RECONCILIATION.UNRECONCILED && cls.reason === NO_CANDIDATE.NO_NAME && (
            <div style={{ ...META, marginTop: 8 }}>
              This case has no employee name recorded, so there is nothing to match on. Search for the employee it concerns.
            </div>
          )}

          {candidates.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...META, fontWeight: 600, marginBottom: 6 }}>
                {candidates.length === 1 ? "Possible employee" : `${candidates.length} possible employees`}
              </div>
              {candidates.map(emp => (
                <div key={emp.id} style={{ borderTop: "1px solid #EFE8DA", paddingTop: 8, marginTop: 8 }}>
                  <div style={{ fontSize: 13, color: "#1A1535" }}>{emp.name}</div>
                  <div style={META}>{describeEmployeeLine(emp) || "No further details on file"}</div>
                  <EvidencePanel legacyCase={legacyCase} employee={emp} caseLocationName={caseLocationName} />
                  <Btn variant="secondary" disabled={busy}
                    onClick={() => onReconcile(legacyCase, emp)}
                    style={{ padding: "6px 12px", fontSize: 12, marginTop: 8 }}>
                    {busy ? "Saving…" : `Confirm this is ${emp.name}`}
                  </Btn>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: "1px solid #EFE8DA", paddingTop: 10, marginTop: 10 }}>
            <div style={{ ...META, marginBottom: 6 }}>
              {candidates.length > 0 ? "Or search for a different employee" : "Search for the employee this case concerns"}
            </div>
            <EmployeeSelect
              inputId={`reconcile-${legacyCase.id}`}
              employeeRecords={employeeRecords}
              value={manualId}
              canCreateEmployee={canCreateEmployee}
              onRequestCreate={onRequestCreateEmployee}
              onChange={id => setManualId(id)}
              label=""
            />
            {manualId && (
              <Btn variant="secondary" disabled={busy}
                onClick={() => onReconcile(legacyCase, employeeRecords.find(e => e && e.id === manualId))}
                style={{ padding: "6px 12px", fontSize: 12, marginTop: 8 }}>
                {busy ? "Saving…" : "Confirm this employee"}
              </Btn>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function IdentityReconciliationSection({
  cases = [], employeeRecords = [], locations = [],
  canCreateEmployee = false, onRequestCreateEmployee,
  reconcileCaseEmployee, busyCaseId = null,
  // HR DIRECTOR only. Passed separately from canCreateEmployee (which is HR)
  // precisely so the two authorities cannot be conflated by a later edit.
  canCorrectIdentity = false, correctCaseEmployee,
}) {
  const [expanded, setExpanded] = useState(null);
  const [showResolved, setShowResolved] = useState(false);

  const locationNameFor = useMemo(
    () => id => (locations.find(l => l && l.id === id)?.name) || null,
    [locations]
  );

  const groups = useMemo(() => groupLegacyForReview(cases, employeeRecords), [cases, employeeRecords]);
  const visible = useMemo(
    () => groups.filter(g => showResolved || !summariseGroup(g).allResolved),
    [groups, showResolved]
  );

  const totals = useMemo(() => {
    const acc = { total: 0, resolved: 0, candidate: 0, ambiguous: 0, conflict: 0, unreconciled: 0 };
    groups.forEach(g => {
      const s = summariseGroup(g);
      Object.keys(acc).forEach(k => { acc[k] += s[k] || 0; });
    });
    return acc;
  }, [groups]);

  return (
    <Card>
      <h3 style={{ fontFamily: "DM Serif Display,Georgia,serif", fontSize: 16, color: "#1A1535", margin: "0 0 4px" }}>
        Employee identity reconciliation
      </h3>
      <p style={{ ...META, margin: "0 0 14px", lineHeight: 1.6 }}>
        Historical cases record the employee as a name. This links each one to a canonical employee record, so a
        person&rsquo;s history is held together by their identity rather than by a matching string. Compass suggests
        possible matches; it never decides. Nothing changes until you confirm a specific employee, and confirming
        never alters what happened in the case &mdash; only who it belongs to.
      </p>

      <div style={{ ...META, marginBottom: 12, lineHeight: 1.7 }}>
        <div>{totals.total} historical case{totals.total === 1 ? "" : "s"} in view · {totals.resolved} reconciled</div>
        <div>
          {totals.candidate} with a possible match · {totals.unreconciled} with no match
          {totals.ambiguous > 0 && ` · ${totals.ambiguous} with several possible people`}
          {totals.conflict > 0 && ` · ${totals.conflict} where the evidence disagrees`}
        </div>
      </div>

      {totals.resolved > 0 && (
        <Btn variant="ghost" onClick={() => setShowResolved(v => !v)} style={{ padding: "4px 10px", fontSize: 12, marginBottom: 10 }}>
          {showResolved ? "Hide reconciled subjects" : "Show reconciled subjects"}
        </Btn>
      )}

      {visible.length === 0 && (
        <div style={META}>Every historical case in view has been reconciled.</div>
      )}

      {visible.map(group => {
        const s = summariseGroup(group);
        const open = expanded === group.key;
        return (
          <div key={group.key} style={{ borderTop: "1px solid #EFE8DA", paddingTop: 10, marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: "#1A1535" }}>{group.displayName || "(no employee name recorded)"}</div>
                <div style={META}>
                  {s.total} case{s.total === 1 ? "" : "s"}
                  {s.resolved > 0 && ` · ${s.resolved} reconciled`}
                  {s.candidate > 0 && ` · ${s.candidate} possible match`}
                  {s.ambiguous > 0 && ` · ${s.ambiguous} ambiguous`}
                  {s.conflict > 0 && ` · ${s.conflict} conflicting`}
                  {s.unreconciled > 0 && ` · ${s.unreconciled} no match`}
                </div>
              </div>
              <Btn variant="ghost" onClick={() => setExpanded(open ? null : group.key)} style={{ padding: "4px 10px", fontSize: 12 }}>
                {open ? "Close" : "Review"}
              </Btn>
            </div>

            {open && (
              <div style={{ marginTop: 4 }}>
                {group.cases.length > 1 && (
                  <div style={{ ...META, marginTop: 8, fontStyle: "italic" }}>
                    {/* The distinction the whole design rests on, said to the user
                        rather than only enforced in code. */}
                    These cases are grouped because they record the same name. That does not make them the same
                    person &mdash; confirm each one separately.
                  </div>
                )}
                {group.cases.map(c => (
                  <CaseRow key={c.id} legacyCase={c} employeeRecords={employeeRecords}
                    canCreateEmployee={canCreateEmployee} onRequestCreateEmployee={onRequestCreateEmployee}
                    onReconcile={reconcileCaseEmployee} busyCaseId={busyCaseId}
                    locationNameFor={locationNameFor}
                    canCorrect={canCorrectIdentity} onCorrect={correctCaseEmployee} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
