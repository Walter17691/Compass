import { useEffect, useState } from 'react';
import { authedFetch } from '../lib/authedFetch';

const stageLabel = stage => {
  const labels = { open: "Open", investigation: "Investigation", inv_report: "Awaiting next step", disciplinary: "Disciplinary", outcome: "Outcome issued", appeal: "Appeal", closed: "Closed" };
  return labels[stage] || stage || "In progress";
};

export function PortalCaseList({ userId, onOpenCase }) {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    authedFetch(`/api/portal/case-list`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setCases(d.cases || []); })
      .catch(() => setError("Couldn't load your cases — please try again."));
  }, [userId]);

  return (
    <div>
      <h2 style={{ fontFamily: "DM Serif Display,Georgia,serif", fontSize: 22, color: "#1C1820", margin: "0 0 4px", fontWeight: 400 }}>My cases</h2>
      <p style={{ fontSize: 13, color: "#9B9098", margin: "0 0 24px" }}>Status of any HR matters involving you.</p>

      {error && <div style={{ background: "#FFF0ED", border: "1px solid #F5C6BB", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C84B2F" }}>{error}</div>}

      {cases === null && !error && <div style={{ fontSize: 13, color: "#9B9098" }}>Loading…</div>}

      {cases && cases.length === 0 && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 12, padding: "40px", textAlign: "center", color: "#9B9098", fontSize: 13 }}>
          No cases on file for you right now.
        </div>
      )}

      {cases && cases.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cases.map(cs => (
            <button key={cs.id} onClick={() => onOpenCase(cs.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 10, padding: "14px 18px", cursor: "pointer", textAlign: "left", fontFamily: "DM Sans,system-ui,sans-serif" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#7C5CFC"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#E8E0D0"}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1C1820", textTransform: "capitalize" }}>{cs.caseType || "HR matter"}</div>
                <div style={{ fontSize: 12, color: "#9B9098", marginTop: 2 }}>Received {cs.dateReceived || "—"}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#7C5CFC", background: "#EDE8FF", borderRadius: 20, padding: "3px 10px" }}>{stageLabel(cs.stage)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
