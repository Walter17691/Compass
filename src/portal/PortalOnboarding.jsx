import { useEffect, useState } from 'react';
import { authedFetch } from '../lib/authedFetch';

export function PortalOnboarding({ userId }) {
  const [loading, setLoading] = useState(true);
  const [starter, setStarter] = useState(null); // null = confirmed no checklist assigned
  const [error, setError] = useState(null);

  const load = () => {
    authedFetch(`/api/portal/onboarding`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setStarter(d.starter); setLoading(false); })
      .catch(() => { setError("Couldn't load your onboarding checklist — please try again."); setLoading(false); });
  };

  useEffect(load, [userId]);

  const toggleTask = async (taskId, currentlyDone) => {
    // Optimistic update so the checkbox feels instant.
    setStarter(s => ({ ...s, tasks: s.tasks.map(t => t.id === taskId ? { ...t, done: !currentlyDone } : t) }));
    try {
      const res = await authedFetch('/api/portal/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, done: !currentlyDone }),
      });
      const d = await res.json();
      if (d.error) { setError(d.error); load(); }
    } catch { setError("Couldn't save that — please try again."); load(); }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "DM Serif Display,Georgia,serif", fontSize: 22, color: "#1C1820", margin: "0 0 4px", fontWeight: 400 }}>Onboarding</h2>
      <p style={{ fontSize: 13, color: "#9B9098", margin: "0 0 24px" }}>Your getting-started checklist.</p>

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
              <button onClick={() => toggleTask(t.id, t.done)}
                style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid", borderColor: t.done ? "#7C5CFC" : "#E8E0D0", background: t.done ? "#7C5CFC" : "none", flexShrink: 0, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                {t.done && <span style={{ color: "#fff", fontSize: 10 }}>✓</span>}
              </button>
              <div>
                <div style={{ fontSize: 13, color: t.done ? "#9B9098" : "#1C1820", textDecoration: t.done ? "line-through" : "none" }}>{t.task}</div>
                {t.dueDate && <div style={{ fontSize: 11, color: "#9B9098", marginTop: 2 }}>Due {t.dueDate}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
