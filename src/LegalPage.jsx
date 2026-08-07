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

const PAGE_TITLES = { privacy: "Privacy Policy", terms: "Terms of Service", dpa: "Data Processing Agreement" }

export default function LegalPage({ page }) {
  const isPrivacy = page === 'privacy'
  const isDpa = page === 'dpa'
  return (
    <div style={{minHeight: "100vh", background: C.bg, fontFamily: "DM Sans, system-ui, sans-serif", padding: "60px 20px"}}>
      <div style={{maxWidth: 680, margin: "0 auto"}}>
        <div style={{textAlign: "center", marginBottom: 32}}>
          <div style={{display: "flex", justifyContent: "center", marginBottom: 16}}><CompassLogo size={48}/></div>
          <div style={{fontFamily: "DM Serif Display, Georgia, serif", fontSize: 28, color: C.text}}>{PAGE_TITLES[page] || "Terms of Service"}</div>
          <p style={{fontSize: 12, color: C.subtle, marginTop: 6}}>Last updated: 7 August 2026</p>
        </div>

        <div style={{background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 12, padding: "16px 20px", marginBottom: 24, fontSize: 12.5, color: C.warnText, lineHeight: 1.7}}>
          <strong>This is a working draft, not a finished legal document.</strong> It's written to accurately describe what Compass actually does today, but it has not yet been reviewed by a solicitor and should not be treated as final until it has{isDpa?" — a DPA is a contract both parties rely on, so this one especially shouldn't be signed or relied upon before proper legal review":""}. Bracketed fields like [Company legal name] are placeholders — fill them in with your registered details before relying on this.
        </div>

        <div style={{background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32}}>
          {isDpa ? (
            <>
              <P>This Data Processing Agreement ("DPA") forms part of the agreement between <strong>[Company legal name]</strong> ("Compass", "Processor") and the organisation that has signed up to use Compass ("Customer", "Controller"), and applies whenever Compass processes personal data on the Customer's behalf in the course of providing the Service. Where anything in this DPA conflicts with the main Terms of Service, this DPA controls for matters of data protection.</P>

              <H>1. Definitions</H>
              <P>"UK GDPR", "personal data", "processing", "controller", "processor", "data subject", "personal data breach", and "special category data" have the meanings given in the UK GDPR and the Data Protection Act 2018. "Sub-processor" means any processor engaged by Compass to process personal data on the Customer's behalf in connection with this DPA.</P>

              <H>2. Subject matter, duration, nature and purpose of processing</H>
              <P>Compass processes personal data on the Customer's behalf for the duration of the Customer's subscription to the Service, for the purpose of providing HR case-management functionality — see Annex 1 for full details of the processing, and the Privacy Policy for the categories of data subject and personal data involved. In summary: employee and case data the Customer enters is processed to store, organise, and (where the Customer chooses to use AI-assisted features) draft correspondence and risk assessments from it.</P>

              <H>3. Compass's obligations as Processor</H>
              <P>Compass shall:</P>
              <P>(a) process personal data only on the Customer's documented instructions — including regarding international transfers — as set out in this DPA and the Customer's ordinary use of the Service's features, unless required to do otherwise by UK law, in which case Compass will inform the Customer of that legal requirement before processing (unless the law prohibits this on important grounds of public interest);</P>
              <P>(b) ensure that anyone authorised to process the personal data (including Compass's own staff) has committed to confidentiality or is under an appropriate statutory obligation of confidentiality;</P>
              <P>(c) implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk, as described in Annex 3;</P>
              <P>(d) not engage a sub-processor without the Customer's prior general or specific written authorisation — Compass's current sub-processors are listed in Annex 2, and this constitutes the Customer's general authorisation for those specifically. Compass will give the Customer reasonable notice of any intended addition or replacement of a sub-processor, giving the Customer the opportunity to object;</P>
              <P>(e) taking into account the nature of the processing, assist the Customer by appropriate technical and organisational measures, insofar as this is possible, with the Customer's obligation to respond to requests from data subjects exercising their UK GDPR rights;</P>
              <P>(f) assist the Customer in ensuring compliance with its obligations relating to security of processing, breach notification, and (where applicable) data protection impact assessments, taking into account the nature of processing and the information available to Compass;</P>
              <P>(g) at the Customer's choice, delete or return all personal data to the Customer after the end of the provision of Services, and delete existing copies unless UK law requires storage of the personal data (see clause 6, Data Return and Deletion);</P>
              <P>(h) make available to the Customer all information reasonably necessary to demonstrate compliance with the obligations in this clause, and allow for and contribute to audits, including inspections, conducted by the Customer or an auditor mandated by the Customer, subject to reasonable notice, confidentiality, and no more than once per 12-month period (except following a personal data breach).</P>

              <H>4. Sub-processors</H>
              <P>The Customer authorises Compass to engage the sub-processors listed in Annex 2 for the purposes described there. Compass remains liable to the Customer for a sub-processor's performance of its data protection obligations, and imposes data protection terms on each sub-processor that are no less protective than those in this DPA.</P>

              <H>5. International transfers</H>
              <P>Where a sub-processor is located outside the UK, Compass ensures the transfer is protected by an adequacy decision, the UK International Data Transfer Addendum to the EU Standard Contractual Clauses, or another lawful transfer mechanism recognised under UK GDPR.</P>

              <H>6. Data return and deletion</H>
              <P>The Customer can export its own data or permanently delete its organisation's data at any time from Settings, without needing to contact Compass. On termination of the Customer's subscription, Compass will delete the Customer's personal data within [30] days, except where UK law requires Compass to retain it for longer (for example, financial records relating to payment).</P>

              <H>7. Personal data breaches</H>
              <P>Compass will notify the Customer without undue delay, and in any event within 72 hours of becoming aware, after confirming a personal data breach affecting the Customer's data, providing the information reasonably available to Compass to help the Customer meet its own breach notification obligations.</P>

              <H>8. Liability</H>
              <P>Each party's liability arising out of or in connection with this DPA is subject to the limitations and exclusions of liability set out in the Terms of Service.</P>

              <H>9. Term and governing law</H>
              <P>This DPA takes effect on the date the Customer starts using the Service and continues for as long as Compass processes personal data on the Customer's behalf. It's governed by the law of England and Wales.</P>

              <H>Annex 1 — Details of processing</H>
              <P><strong>Subject matter:</strong> provision of the Compass HR case-management Service.</P>
              <P><strong>Duration:</strong> for the term of the Customer's subscription, plus any post-termination retention period described in clause 6.</P>
              <P><strong>Categories of data subjects:</strong> the Customer's employees (including former employees and job applicants where relevant), the Customer's HR/management staff using the Service, and — where the Customer invites them — employees given access to the Employee Portal.</P>
              <P><strong>Types of personal data:</strong> names, job titles, email addresses, employment dates, meeting notes and transcripts, disciplinary/grievance/redundancy case details, evidence descriptions, investigation reports, correspondence, and — where the Customer chooses to enter it — special category data that may arise incidentally in case notes (for example, health information relevant to a sickness absence case). The Customer is responsible for ensuring it has a lawful basis for entering any special category data.</P>
              <P><strong>Processing operations:</strong> storage, retrieval, organisation, AI-assisted drafting (letters, meeting summaries, risk assessments), and transmission (e.g. by email) as directed by the Customer's use of the Service's features.</P>

              <H>Annex 2 — Sub-processors</H>
              <P><strong>Supabase</strong> — database, authentication, and file storage hosting.</P>
              <P><strong>Anthropic</strong> — processes case content submitted by the Customer to generate AI-assisted drafts (letters, summaries, risk assessments) when the Customer uses those features.</P>
              <P><strong>Resend</strong> — sends transactional emails on Compass's behalf (invites, signature requests, notifications).</P>
              <P><strong>Stripe</strong> — processes subscription payment data. Compass does not receive or store card details.</P>
              <P><strong>Vercel</strong> — application hosting and serverless compute.</P>

              <H>Annex 3 — Technical and organisational security measures</H>
              <P>Access to Customer data is scoped by organisation using row-level database security, so one Customer's data is not accessible to another. Administrative access to production systems is limited and logged. Data in transit is encrypted (HTTPS/TLS). Authentication is handled by a dedicated auth provider rather than custom-built credential storage. Payment card data is never handled or stored directly by Compass. [This annex should be reviewed and expanded with your solicitor to reflect your full security posture, including any policies not visible from the codebase alone — e.g. staff access controls, incident response process, and backup/recovery procedures.]</P>
            </>
          ) : isPrivacy ? (
            <>
              <P>This policy explains what personal data Compass HR ("Compass", "we") processes, why, and what rights you and your organisation have over it. Compass is provided by <strong>[Company legal name]</strong>, a company registered in England and Wales (company number <strong>[00000000]</strong>), registered office <strong>[Registered address]</strong>. Contact us at <strong>privacy@compasshruk.com</strong>.</P>

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
              <P><strong>Billing data:</strong> Compass requires an active paid subscription — Stripe processes and stores payment details directly, and we never see or store your card details ourselves, only a subscription status and Stripe's own customer/subscription reference IDs.</P>

              <H>Why we process it</H>
              <P>To provide the service your organisation has signed up for — this is a matter of performing our contract with your organisation, and/or your organisation's legitimate interest in managing its employment relationships lawfully and consistently with the ACAS Code of Practice.</P>

              <H>Who we share it with</H>
              <P>We use a small number of subprocessors to run the service: <strong>Supabase</strong> (database and authentication hosting), <strong>Anthropic</strong> (meeting notes and case content are sent to Anthropic's Claude API to generate draft letters, summaries, and risk assessments), <strong>Resend</strong> (sending emails — invites, signature requests, outcome letters), <strong>Stripe</strong> (subscription payment processing), and <strong>Vercel</strong> (application hosting). Where a subprocessor is based outside the UK, we rely on their standard contractual clauses or equivalent safeguards for the transfer. We do not sell personal data, and we do not use your case data to train any AI model.</P>

              <H>How long we keep it</H>
              <P>For as long as your organisation's account is active, or until you delete it. Any organisation can export all of its data or permanently delete it at any time from Settings — this isn't something you need to contact us for.</P>

              <H>Your rights</H>
              <P>Under UK GDPR you can ask to access, correct, delete, restrict, or receive a copy of your personal data. If your data is held by an organisation using Compass (e.g. your employer), start with them — they're the data controller and are best placed to respond, and Compass's own DSAR tooling exists to help them do that within the statutory one-month deadline. You can also contact us directly at <strong>privacy@compasshruk.com</strong>, and you have the right to complain to the <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" style={{color:C.accent}}>Information Commissioner's Office</a>.</P>

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
              <P>Your organisation is responsible for the accuracy of information it enters and for keeping account credentials secure. Compass has no free plan or trial — access requires an active paid subscription, billed via Stripe per active location on a monthly basis. You can manage or cancel your subscription at any time from Settings; access continues until the end of the paid period.</P>

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
