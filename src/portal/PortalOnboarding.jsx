import { useEffect, useState } from 'react';
import { authedFetch } from '../lib/authedFetch';
import { CheckIcon } from '../components/Icons';

export function PortalOnboarding({ userId }) {
  const [loading, setLoading] = useState(true);
  const [starter, setStarter] = useState(null); // null = confirmed no checklist assigned
  const [error, setError] = useState(null);

  useEffect(() => {
    authedFetch(`/api/portal/onboarding`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setStarter(d.starter); setLoading(false); })
      .catch(() => { setError("Couldn't load your onboarding checklist — please try again."); setLoading(false); });
  }, [userId]);

  return (
    <div>
      <h2 style={{ fontFamily: "DM Serif Display,Georgia,serif", fontSize: 22, color: "#1C1820", margin: "0 0 4px", fontWeight: 400 }}>Onboarding</h2>
      <p style={{ fontSize: 13, color: "#9B9098", margin: "0 0 24px" }}>Progress on your getting-started checklist, managed by HR, your manager, IT, Facilities and Payroll.</p>

      {error && <div style={{ background: "#FFF0ED", border: "1px solid #F5C6BB", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C84B2F", marginBottom: 16 }}>{error}</div>}
      {loading && !error && <div style={{ fontSize: 13, color: "#9B9098" }}>Loading…</div>}

      {!loading && !starter && !error && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 12, padding: "40px", textAlign: "center", color: "#9B9098", fontSize: 13 }}>
          No onboarding checklist assigned to you yet.
        </div>
      )}

      {starter && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 12, overflow: "hidden" }}>
          {(starter.tasks || []).map((t, i) => (
            <div key={t.id} style={{ display: "flex", gap: 12, padding: "14px 18px", borderBottom: i < starter.tasks.length - 1 ? "1px solid #F5F1EA" : "none", alignItems: "flex-start" }}>
              {/* Status only, not a control — every task here is owned by
                  HR/Line Manager/IT/Facilities/Payroll (see OWNERS in
                  TemplatesSection.jsx), never the employee, so this is
                  never the employee's to check off themselves. */}
              <div title={t.done ? "Done" : "Not done yet"}
                style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid", borderColor: t.done ? "#7C5CFC" : "#E8E0D0", background: t.done ? "#7C5CFC" : "none", flexShrink: 0, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {t.done && <CheckIcon size={10} color="#fff" />}
              </div>
              <div>
                <div style={{ fontSize: 13, color: t.done ? "#9B9098" : "#1C1820", textDecoration: t.done ? "line-through" : "none" }}>{t.task}</div>
                <div style={{ fontSize: 11, color: "#9B9098", marginTop: 2 }}>{t.owner}{t.dueDate ? ` · Due ${t.dueDate}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
