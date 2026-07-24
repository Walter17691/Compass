import { useState } from 'react';
import { PortalCaseList } from './PortalCaseList';
import { PortalCaseDetail } from './PortalCaseDetail';
import { PortalSignatures } from './PortalSignatures';
import { PortalOnboarding } from './PortalOnboarding';

const navBtnStyle = active => ({
  fontSize: 13, padding: "6px 14px", borderRadius: 7, border: "none",
  background: active ? "#EDE8FF" : "none", color: active ? "#7C5CFC" : "#6B6375",
  cursor: "pointer", fontFamily: "DM Sans,system-ui,sans-serif", fontWeight: active ? 600 : 400,
});

export function PortalApp({ user, employeeName, onSignOut }) {
  const [view, setView] = useState('cases'); // 'cases' | 'caseDetail' | 'signatures' | 'onboarding'
  const [activeCaseId, setActiveCaseId] = useState(null);

  return (
    <div style={{ minHeight: "100vh", background: "#FDFAF5", fontFamily: "DM Sans,system-ui,sans-serif" }}>
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid #E8E0D0", padding: "0 32px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ fontFamily: "DM Serif Display,Georgia,serif", fontSize: 18, color: "#1C1820" }}>Compass</div>
          <nav style={{ display: "flex", gap: 2 }}>
            <button onClick={() => setView('cases')} style={navBtnStyle(view === 'cases' || view === 'caseDetail')}>My cases</button>
            <button onClick={() => setView('signatures')} style={navBtnStyle(view === 'signatures')}>Documents to sign</button>
            <button onClick={() => setView('onboarding')} style={navBtnStyle(view === 'onboarding')}>Onboarding</button>
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {employeeName && <span style={{ fontSize: 12, color: "#9B9098" }}>{employeeName}</span>}
          <button onClick={onSignOut} style={{ fontSize: 12, color: "#6B6375", background: "none", border: "1px solid #E8E0D0", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: "DM Sans,system-ui,sans-serif" }}>Sign out</button>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>
        {view === 'cases' && (
          <PortalCaseList userId={user.id} onOpenCase={id => { setActiveCaseId(id); setView('caseDetail'); }} />
        )}
        {view === 'caseDetail' && (
          <PortalCaseDetail userId={user.id} caseId={activeCaseId} onBack={() => setView('cases')} />
        )}
        {view === 'signatures' && <PortalSignatures userId={user.id} />}
        {view === 'onboarding' && <PortalOnboarding userId={user.id} />}
      </div>
    </div>
  );
}
