const C = {
  bg: "#FDFAF5",
  card: "#FFFFFF",
  accent: "#7C5CFC",
  border: "#E8E0D0",
  text: "#1C1820",
  muted: "#6B6375",
  subtle: "#9B9098",
  warnBg: "#FEF5E7",
  warnBorder: "#F0D9A8",
  warnText: "#8A5E10",
}

function CompassLogo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="48" fill={C.accent}/>
      <polygon points="50,16 56,50 50,58 44,50" fill={C.bg}/>
      <polygon points="50,84 44,50 50,42 56,50" fill="rgba(253,250,245,0.28)"/>
      <circle cx="50" cy="50" r="5" fill={C.accent} stroke={C.bg} strokeWidth="2"/>
    </svg>
  )
}

function H({ children }) {
  return <div style={{fontSize: 16, fontWeight: 700, color: C.text, margin: "26px 0 10px", fontFamily: "DM Serif Display, Georgia, serif"}}>{children}</div>
}

function P({ children }) {
  return <p style={{fontSize: 13.5, color: C.muted, lineHeight: 1.8, margin: "0 0 10px"}}>{children}</p>
}

export default function LegalPage({ page }) {
  const isPrivacy = page === 'privacy'
  return (
    <div style={{minHeight: "100vh", background: C.bg, fontFamily: "DM Sans, system-ui, sans-serif", padding: "60px 20px"}}>
      <div style={{maxWidth: 680, margin: "0 auto"}}>
        <div style={{textAlign: "center", marginBottom: 32}}>
          <div style={{display: "flex", justifyContent: "center", marginBottom: 16}}><CompassLogo size={48}/></div>
          <div style={{fontFamily: "DM Serif Display, Georgia, serif", fontSize: 28, color: C.text}}>{isPrivacy ? "Privacy Policy" : "Terms of Service"}</div>
          <p style={{fontSize: 12, color: C.subtle, marginTop: 6}}>Last updated: 25 July 2026</p>
        </div>

        <div style={{background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 12, padding: "16px 20px", marginBottom: 24, fontSize: 12.5, color: C.warnText, lineHeight: 1.7}}>
          <strong>This is a working draft, not a finished legal document.</strong> It's written to accurately describe what Compass actually does today, but it has not yet been reviewed by a solicitor and should not be treated as final until it has. Bracketed fields like [Company legal name] are placeholders — fill them in with your registered details before relying on this.
        </div>

        <div style={{background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32}}>
          {isPrivacy ? (
            <>
              <P>This policy explains what personal data Compass HR ("Compass", "we") processes, why, and what rights you and your organisation have over it. Compass is provided by <strong>[Company legal name]</strong>, a company registered in England and Wales (company number <strong>[00000000]</strong>), registered office <strong>[Registered address]</strong>. Contact us at <strong>[privacy@yourdomain]</strong>.</P>

              <H>Who this applies to, and who's the data controller</H>
              <P>Compass is used by organisations ("Customers") to manage HR case files — disciplinary, grievance, and related employee relations matters. Where your employer or an organisation you work for uses Compass to manage your case, that organisation is the <strong>data controller</strong> for your personal data, and Compass acts as their <strong>data processor</strong> — we process it on their instructions, not our own. If you're an HR user signed up with your own organisation, the same applies to your employees' data.</P>

              <H>What we collect</H>
              <P><strong>Account data:</strong> name, email address, and a hashed password, via our authentication provider (Supabase Auth).</P>
              <P><strong>Organisation data:</strong> your company name, team members, roles, and office locations.</P>
              <P><strong>Case data entered by your organisation:</strong> employee names, job titles, meeting notes and transcripts, evidence descriptions, disciplinary/grievance case details, investigation reports, outcome letters, wellbeing notes, and (where used) redundancy scoring inputs such as weekly pay and age. This is the core content your organisation puts into the product to do its job.</P>
              <P><strong>Audit trail:</strong> a record of significant actions (who did what, when) across your organisation, kept for accountability.</P>
              <P><strong>Data Subject Access Request (DSAR) records:</strong> if your organisation logs a DSAR, we store the request details and calculated statutory deadline.</P>
              <P><strong>Optional integrations:</strong> if your organisation connects Google or Microsoft Calendar, we store an access token and synced event metadata. If your organisation connects a Slack or Microsoft Teams webhook for deadline notifications, we store that URL.</P>
              <P><strong>Employee Portal accounts:</strong> if your organisation invites an employee to the self-service portal, we store their name, email, and the case-related information they're permitted to see.</P>
              <P><strong>Billing data:</strong> if your organisation upgrades to a paid plan, Stripe processes and stores payment details directly — we never see or store your card details ourselves, only a subscription status and Stripe's own customer/subscription reference IDs.</P>

              <H>Why we process it</H>
              <P>To provide the service your organisation has signed up for — this is a matter of performing our contract with your organisation, and/or your organisation's legitimate interest in managing its employment relationships lawfully and consistently with the ACAS Code of Practice.</P>

              <H>Who we share it with</H>
              <P>We use a small number of subprocessors to run the service: <strong>Supabase</strong> (database and authentication hosting), <strong>Anthropic</strong> (meeting notes and case content are sent to Anthropic's Claude API to generate draft letters, summaries, and risk assessments), <strong>Resend</strong> (sending emails — invites, signature requests, outcome letters), <strong>Stripe</strong> (payment processing, Pro plan only), and <strong>Vercel</strong> (application hosting). Where a subprocessor is based outside the UK, we rely on their standard contractual clauses or equivalent safeguards for the transfer. We do not sell personal data, and we do not use your case data to train any AI model.</P>

              <H>How long we keep it</H>
              <P>For as long as your organisation's account is active, or until you delete it. Any organisation can export all of its data or permanently delete it at any time from Settings — this isn't something you need to contact us for.</P>

              <H>Your rights</H>
              <P>Under UK GDPR you can ask to access, correct, delete, restrict, or receive a copy of your personal data. If your data is held by an organisation using Compass (e.g. your employer), start with them — they're the data controller and are best placed to respond, and Compass's own DSAR tooling exists to help them do that within the statutory one-month deadline. You can also contact us directly at <strong>[privacy@yourdomain]</strong>, and you have the right to complain to the <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" style={{color:C.accent}}>Information Commissioner's Office</a>.</P>

              <H>Cookies and local storage</H>
              <P>We use browser local storage to keep you signed in and remember your preferences (like which organisation you last had active) — not third-party advertising or tracking cookies.</P>

              <H>Changes to this policy</H>
              <P>If we make material changes, we'll update the date at the top of this page.</P>
            </>
          ) : (
            <>
              <P>These terms govern use of Compass HR (the "Service"), provided by <strong>[Company legal name]</strong>, a company registered in England and Wales (company number <strong>[00000000]</strong>). By creating an account or using the Service, your organisation agrees to these terms.</P>

              <H>What Compass is</H>
              <P>Compass is a case-management platform for HR employee relations work — disciplinary, grievance, redundancy, and related processes — including AI-assisted drafting of meeting records, letters, and risk assessments. It's intended for business use by organisations managing their own employees, not for consumer use.</P>

              <H>AI-generated content is a draft, not advice</H>
              <P>Letters, meeting records, risk scores, and other AI-generated outputs are starting points drafted with reference to the ACAS Code of Practice and UK employment legislation — they are not a substitute for advice from a qualified employment solicitor, and your organisation remains responsible for reviewing and approving anything before it's sent or relied upon. Tribunal risk estimates are indicative only and are explicitly not legal advice.</P>

              <H>Accounts and plans</H>
              <P>Your organisation is responsible for the accuracy of information it enters and for keeping account credentials secure. The Free plan is limited to one active case and excludes certain features (Portal, Calendar, DSAR tracking, the compliance digest); the Pro plan removes these limits and is billed via Stripe on a subscription basis. You can cancel a Pro subscription at any time from Settings; access continues until the end of the paid period.</P>

              <H>Your data, your ownership</H>
              <P>Your organisation owns the data it puts into Compass. We process it on your behalf as described in our Privacy Policy, and you can export or permanently delete it at any time from Settings.</P>

              <H>Acceptable use</H>
              <P>Don't use Compass for any unlawful purpose, to process personal data you're not entitled to process, or to attempt to disrupt or gain unauthorised access to the Service.</P>

              <H>Availability and liability</H>
              <P>We aim to keep the Service available and reliable but don't currently offer a formal uptime guarantee or service level agreement. To the fullest extent permitted by law, our liability for any claim relating to the Service is limited to the fees your organisation paid in the 12 months before the claim arose, except where liability cannot legally be limited (such as death, personal injury, or fraud).</P>

              <H>Termination</H>
              <P>Either party can stop using/providing the Service at any time. If your organisation's account is terminated, you can export your data beforehand; we'll retain it only as long as reasonably necessary to comply with our own legal obligations, then delete it.</P>

              <H>Governing law</H>
              <P>These terms are governed by the law of England and Wales, and any dispute will be handled by the courts of England and Wales.</P>

              <H>Changes to these terms</H>
              <P>If we make material changes, we'll update the date at the top of this page.</P>
            </>
          )}
        </div>

        <div style={{textAlign: "center", fontSize: 12, color: C.subtle, marginTop: 24}}>
          <a href="/" style={{color: C.accent, textDecoration: "none", fontWeight: 600}}>← Back to Compass</a>
        </div>
      </div>
    </div>
  )
}
