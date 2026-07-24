import { useEffect, useState } from 'react';

export function PortalCaseDetail({ userId, caseId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!caseId) return;
    fetch(`/api/portal/case-detail?userId=${encodeURIComponent(userId)}&caseId=${encodeURIComponent(caseId)}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError("Couldn't load this case — please try again."));
  }, [userId, caseId]);

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#6B6375", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 16, fontFamily: "DM Sans,system-ui,sans-serif" }}>← My cases</button>

      {error && <div style={{ background: "#FFF0ED", border: "1px solid #F5C6BB", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C84B2F" }}>{error}</div>}
      {!data && !error && <div style={{ fontSize: 13, color: "#9B9098" }}>Loading…</div>}

      {data && (
        <>
          <h2 style={{ fontFamily: "DM Serif Display,Georgia,serif", fontSize: 22, color: "#1C1820", margin: "0 0 4px", fontWeight: 400, textTransform: "capitalize" }}>{data.caseType || "HR matter"}</h2>
          <p style={{ fontSize: 13, color: "#9B9098", margin: "0 0 24px" }}>Current status: <span style={{ color: "#7C5CFC", fontWeight: 600 }}>{data.stage || "In progress"}</span></p>

          <div style={{ fontSize: 11, fontWeight: 600, color: "#9B9098", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 10 }}>Correspondence</div>
          {data.meetings && data.meetings.length === 0 && (
            <div style={{ background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 10, padding: "24px", textAlign: "center", color: "#9B9098", fontSize: 13 }}>
              No formal letters have been issued yet.
            </div>
          )}
          {data.meetings && data.meetings.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.meetings.map((m, i) => (
                <div key={i} style={{ background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 10, padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1C1820" }}>{m.type}</span>
                    <span style={{ fontSize: 12, color: "#9B9098" }}>{m.date}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#3D3560", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{m.letterOutput}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
