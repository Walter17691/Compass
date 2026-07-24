import { useEffect, useState } from 'react';

export function PortalSignatures({ userId }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [signingId, setSigningId] = useState(null);
  const [typedName, setTypedName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    fetch(`/api/portal/signatures?userId=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setPending(d.pending || []); })
      .catch(() => setError("Couldn't load your documents — please try again."));
  };

  useEffect(load, [userId]);

  const submitSignature = async (signId) => {
    if (!typedName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/signatures', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, signId, signature: typedName.trim() }),
      });
      const d = await res.json();
      if (d.error) { setError(d.error); setSubmitting(false); return; }
      setSigningId(null); setTypedName(''); setError(null);
      load();
    } catch { setError("Couldn't submit your signature — please try again."); }
    setSubmitting(false);
  };

  return (
    <div>
      <h2 style={{ fontFamily: "DM Serif Display,Georgia,serif", fontSize: 22, color: "#1C1820", margin: "0 0 4px", fontWeight: 400 }}>Documents to sign</h2>
      <p style={{ fontSize: 13, color: "#9B9098", margin: "0 0 24px" }}>Anything that needs your signature appears here.</p>

      {error && <div style={{ background: "#FFF0ED", border: "1px solid #F5C6BB", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C84B2F", marginBottom: 16 }}>{error}</div>}
      {pending === null && !error && <div style={{ fontSize: 13, color: "#9B9098" }}>Loading…</div>}

      {pending && pending.length === 0 && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 12, padding: "40px", textAlign: "center", color: "#9B9098", fontSize: 13 }}>
          Nothing waiting for your signature right now.
        </div>
      )}

      {pending && pending.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pending.map(p => (
            <div key={p.sign_id} style={{ background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1C1820" }}>{p.meeting_type || "Document"}</span>
                <span style={{ fontSize: 12, color: "#9B9098" }}>{p.meeting_date}</span>
              </div>
              <div style={{ fontSize: 13, color: "#3D3560", lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: 12, maxHeight: 200, overflowY: "auto" }}>{p.document}</div>
              {signingId === p.sign_id ? (
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#6B6880", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>Type your full name to sign</label>
                  <input value={typedName} onChange={e => setTypedName(e.target.value)} placeholder="Full name"
                    style={{ width: "100%", background: "#FDFAF5", border: "1px solid #E8E0D0", borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none", color: "#1A1535", marginBottom: 10, boxSizing: "border-box" }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => submitSignature(p.sign_id)} disabled={submitting || !typedName.trim()}
                      style={{ background: "#7C5CFC", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12, color: "#fff", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer" }}>
                      {submitting ? "Submitting…" : "Confirm signature"}
                    </button>
                    <button onClick={() => { setSigningId(null); setTypedName(''); }} style={{ background: "none", border: "1px solid #E8E0D0", borderRadius: 6, padding: "8px 16px", fontSize: 12, color: "#6B6375", cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setSigningId(p.sign_id)} style={{ background: "#7C5CFC", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12, color: "#fff", fontWeight: 600, cursor: "pointer" }}>Sign document</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
