import { CompassLogo } from './components/CompassLogo'

const C = {
  bg: "#FDFAF5",
  card: "#FFFFFF",
  accent: "#7C5CFC",
  accentLight: "#EDE8FF",
  border: "#E8E0D0",
  text: "#1C1820",
  muted: "#6B6375",
  subtle: "#9B9098",
}

function Item({ title, children }) {
  return (
    <div style={{marginBottom: 22}}>
      <div style={{fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6, fontFamily: "Archivo, system-ui, sans-serif"}}>{title}</div>
      <div style={{fontSize: 13.5, color: C.muted, lineHeight: 1.7}}>{children}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, marginBottom: 20}}>
      <div style={{fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 20}}>{title}</div>
      {children}
    </div>
  )
}

export default function SecurityPage() {
  return (
    <div style={{minHeight: "100vh", background: C.bg, fontFamily: "Archivo, system-ui, sans-serif", padding: "60px 20px"}}>
      <div style={{maxWidth: 720, margin: "0 auto"}}>
        <div style={{textAlign: "center", marginBottom: 48}}>
          <div style={{display: "flex", justifyContent: "center", marginBottom: 16}}><CompassLogo size={52}/></div>
          <div style={{fontFamily: "Archivo, system-ui, sans-serif", fontSize: 30, color: C.text, marginBottom: 10}}>Security &amp; compliance</div>
          <p style={{fontSize: 14, color: C.muted, maxWidth: 480, margin: "0 auto", lineHeight: 1.7}}>
            Compass handles disciplinary, grievance and other employee relations records — data that matters and carries real legal weight. Here's what actually protects it, described plainly rather than in marketing language.
          </p>
        </div>

        <Section title="Data isolation">
          <Item title="Row-level security enforced at the database, not just the app">
            Every organisation's case files, employee records and audit trail are scoped by database policy — enforced by Postgres itself on every query, not something that depends on the application code getting it right. One organisation's data is never reachable from another's, even in the event of a bug in a screen or an API endpoint.
          </Item>
          <Item title="Every server request verifies who's actually calling">
            API requests are checked against the caller's real, server-verified identity — not a value the browser claims to be — before any read or write happens, and again against that caller's actual organisation membership before anything sensitive is returned.
          </Item>
        </Section>

        <Section title="Audit trail">
          <Item title="A shared, tamper-resistant record of who did what">
            Every significant action — case creation, letters generated, data exported, records deleted — is logged with who, what and when, stored centrally and visible to your whole organisation, not just the browser it happened in. Entries are append-only: nothing can quietly edit or remove what's already been logged.
          </Item>
        </Section>

        <Section title="UK GDPR tooling">
          <Item title="DSAR tracking with automatic statutory deadlines">
            Data Subject Access Requests are logged with their legal one-calendar-month response deadline calculated automatically, so nothing slips past the statutory window.
          </Item>
          <Item title="Full export and full deletion, on request">
            Any organisation can export all of its data at any time, or permanently delete it — both available directly in Settings, not something that requires contacting support.
          </Item>
        </Section>

        <Section title="Legal grounding">
          <Item title="ACAS Code of Practice built into every AI output">
            Every AI-generated letter, investigation report and outcome document is drafted against the ACAS Code of Practice and relevant UK employment legislation (ERA 1996, Equality Act) — not generic text.
          </Item>
          <Item title="Tribunal risk scoring">
            Cases can be flagged for potential legal exposure — unfair dismissal risk, discrimination flags, procedural gaps — before they become a real problem, with plain-language reasoning, not just a number.
          </Item>
        </Section>

        <Section title="Access control">
          <Item title="Role-based permissions">
            HR Directors, HR Managers and Location Managers see different levels of case access and different capabilities (who can delete a case, who can remove a team member) — enforced server-side, not just hidden in the UI.
          </Item>
        </Section>

        <div style={{textAlign: "center", fontSize: 12, color: C.subtle, lineHeight: 1.8, marginTop: 32}}>
          Compass is an actively developed product. We don't hold formal certifications like Cyber Essentials or ISO 27001 (yet) — if that's a requirement for your organisation, ask us directly rather than assuming.
          <br/><br/>
          <a href="/" style={{color: C.accent, textDecoration: "none", fontWeight: 600}}>← Back to Compass</a>
        </div>
      </div>
    </div>
  )
}
