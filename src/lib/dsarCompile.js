// Compiles everything Compass holds about one named individual, for a UK
// GDPR/DPA 2018 Subject Access Request. Pure/client-side — the data is
// already loaded into the app, so this needs no new API route.
//
// Third-party mentions inside free-text meeting records/transcripts are
// FLAGGED for HR review, never auto-redacted: stripping text
// algorithmically risks either missing a name variant (leaking a third
// party's data) or mutilating the subject's own legitimate record
// (over-redacting). A human has to look at each flagged line before the
// response goes out — see reviewed_flagged_sections in
// supabase/dsar_2026-07-24.sql, which gates the DSAR request's status.
// Phase 6.5 hardening (Batch 5) — added wellbeingNotes, concernReferrals,
// allegations, caseSignals, hrReviewRequests and auditLog. A DSAR response
// must cover everything Compass holds about the named individual, not
// just what happens to be embedded on the case object itself (meetings/
// evidence) — these six live in their own tables/state, keyed by
// employeeName (wellbeing notes, concern referrals — both about the
// subject, not necessarily submitted by them) or by caseId (allegations,
// case signals, HR review requests, audit log — scoped to the subject's
// own cases, the same boundary subjectCases itself already draws).
//
// Phase 6.5 hardening (data-lifecycle review) — added caseTasks (the
// "tasks" category the wider data-inventory review names explicitly),
// and signingRequests/portalAccount — passed in already-fetched, since
// both live in tables with zero client-facing RLS (see
// api/portal/_dsar-lookup.js) and simply can't be queried from here the
// way every other category can.
//
// Phase 6.5 hardening (Prompt 14, Section 6 continued — closes
// independent audit finding 4.3). Two kinds of gap, fixed together:
//
// 1. Whole tables never wired in: dsarRequests (a DSAR record naming
//    someone is itself their own personal data — Compass was omitting a
//    DSAR about a person from that same person's own DSAR), org_members/
//    profiles/case_views/employee_portal_invites (a person can be the
//    subject of their own DSAR as an internal user — a manager or
//    investigator — not only as a case's named employee; profiles/
//    case_views have no client-facing RLS path to another user's row at
//    all, so they arrive pre-fetched via api/portal/_dsar-lookup.js the
//    same way signingRequests/portalAccounts already do), and the
//    Organisational Intelligence surface (org_events,
//    improvement_initiatives, manager_capability_insights,
//    organisation_themes) — org-wide AI-generated narrative text that
//    could name an individual even though none of these tables have a
//    subject-identifying column to filter by, so they're scanned for the
//    subject's own name the same defensive way flaggedThirdPartyMentions
//    already scans meeting records for OTHER people's names.
//
// 2. Structured person-columns missed on records that already get
//    included by case/table, but only cover "employee who is the case
//    subject" — never "the same person acting as a manager,
//    investigating manager, or disciplinary officer on someone ELSE's
//    case," which is exactly the DSAR most likely to come from a
//    disgruntled manager, not a disgruntled employee. actedAsStaff below
//    covers cases.manager/investigating_manager/disciplinary_officer,
//    employee_records.manager, wellbeing_notes.manager, and
//    hr_review_requests.requested_by_name/reviewed_by_name — every case
//    matched here deliberately EXCLUDES the subject's own cases (already
//    covered by subjectCases) to avoid double-listing the same record.
//    audit_log.user_name (every action the subject personally took,
//    regardless of whose case it was on) is folded into the existing
//    subjectAuditLog filter directly rather than a separate section,
//    since it's the same shape of record either way.
export function compileSubjectData(employeeName, { cases = [], employeeRecords = [], starterInstances = [], leaverInstances = [], wellbeingNotes = [], concernReferrals = [], allegations = [], caseSignals = [], caseTasks = [], hrReviewRequests = [], auditLog = [], signingRequests = [], portalAccounts = [], dsarRequests = [], orgMembers = [], profiles = [], caseViews = [], portalInvites = [], orgEvents = [], improvementInitiatives = [], managerCapabilityInsights = [], organisationThemes = [], caseAccess = [] } = {}) {
  const matchingEmployeeRecords = employeeRecords.filter(r => r.name === employeeName);
  const employeeRecord = matchingEmployeeRecords[0] || null;
  const subjectCases = cases.filter(c => c.employeeName === employeeName);
  const subjectCaseIds = new Set(subjectCases.map(c => c.id));
  const onboarding = starterInstances.filter(s => s.name === employeeName);
  const offboarding = leaverInstances.filter(s => s.name === employeeName);
  const subjectWellbeingNotes = wellbeingNotes.filter(n => n.employeeName === employeeName);
  const subjectConcernReferrals = concernReferrals.filter(r => r.employeeName === employeeName);
  const subjectAllegations = allegations.filter(a => subjectCaseIds.has(a.caseId));
  const subjectCaseSignals = caseSignals.filter(s => subjectCaseIds.has(s.caseId));
  const subjectCaseTasks = caseTasks.filter(t => subjectCaseIds.has(t.caseId));
  // hr_review_requests isn't remapped to camelCase at load time
  // (App.jsx's loadHrReviews keeps the raw DB row shape) — case_id here,
  // not caseId, matching every other consumer of this state.
  const subjectHrReviewRequests = hrReviewRequests.filter(r => subjectCaseIds.has(r.case_id));
  // Phase 6.5 hardening (Prompt 14, Section 6 — closes independent audit
  // finding 4.4) — case-linked audit rows were the only ones ever
  // included, but many audit() calls concerning this exact subject carry
  // no caseId at all (employee record edits, onboarding/offboarding,
  // portal access grants/revokes — audit(action, employeeName) with no
  // case in scope). Matching a.detail === employeeName (an exact match,
  // not a substring search) catches these without the false-positive risk
  // a loose "name appears somewhere in this text" search would carry —
  // consistent with this file's own third-party-mention philosophy above:
  // precise matches get included automatically, anything less certain
  // stays a human-review decision, not a silent guess either way.
  // a.user is App.jsx's own camelCase mapping of audit_log.user_name —
  // every action the subject personally took, on any case, not only
  // their own.
  const subjectAuditLog = auditLog.filter(a => (a.caseId && subjectCaseIds.has(a.caseId)) || a.detail === employeeName || a.user === employeeName);

  const subjectDsarRequests = dsarRequests.filter(d => d.employeeName === employeeName);
  const subjectOrgMembership = orgMembers.filter(m => m.name === employeeName);
  const subjectUserIds = new Set(subjectOrgMembership.map(m => m.user_id).filter(Boolean));
  const subjectProfiles = profiles.filter(p => subjectUserIds.has(p.id));
  const subjectCaseViews = caseViews.filter(v => subjectUserIds.has(v.user_id));
  const subjectPortalInvites = portalInvites.filter(i => i.employee_name === employeeName);

  // Phase 6.5 hardening (Prompt 16 audit, H14) — case_access records a
  // real, individual decision about the subject ("granted investigator
  // access to case X on <date> by <granter>") that lived in no other
  // table this compiler already covers — case.manager/investigatingManager/
  // disciplinaryOfficer below only capture the older direct-column roles,
  // not the newer assignable ones (notetaker/appeal_manager/
  // employee_manager/approver/investigator/disciplinary_officer) that
  // only ever exist as case_access rows. Matched via subjectUserIds, the
  // same org-member-name-to-user-id resolution already used for
  // subjectProfiles/subjectCaseViews above — not scoped to "someone
  // else's case only" the way actedAsStaff is, since a grant on the
  // subject's own case is still the subject's own personal data too.
  const subjectCaseAccess = caseAccess.filter(a => subjectUserIds.has(a.userId));

  // Records that name the subject as staff (manager / investigating
  // manager / disciplinary officer / HR reviewer) on someone ELSE's
  // case or record — the exact gap the audit's own framing names:
  // "misses the subject whenever they aren't the case subject."
  // Excludes the subject's own cases (already covered by subjectCases)
  // so a case never appears twice.
  const actedAsStaff = {
    cases: cases
      .filter(c => c.employeeName !== employeeName && (c.manager === employeeName || c.investigatingManager === employeeName || c.disciplinaryOfficer === employeeName))
      .map(({ evidence, ...meta }) => meta),
    employeeRecords: employeeRecords.filter(r => r.name !== employeeName && r.manager === employeeName),
    wellbeingNotes: wellbeingNotes.filter(n => n.employeeName !== employeeName && n.manager === employeeName),
    // hr_review_requests isn't remapped to camelCase — see the comment
    // on subjectHrReviewRequests above.
    hrReviewRequests: hrReviewRequests.filter(r => !subjectCaseIds.has(r.case_id) && (r.requested_by_name === employeeName || r.reviewed_by_name === employeeName)),
  };

  // Phase 6.5 hardening (data-lifecycle review) — a name is not a stable
  // identity. If more than one employee_records row shares this exact
  // name, or the subject's own cases carry more than one distinct
  // employee_email between them, that's a real signal this org has two
  // different real people who happen to share a name — silently merging
  // both into one export would hand one person's confidential case/
  // wellbeing history to whoever requested the other's. Surfaced, never
  // auto-resolved (there's no reliable signal to pick the "right" one
  // from a name alone) — same "flag for a human, don't guess" posture as
  // flaggedThirdPartyMentions below.
  const distinctCaseEmails = new Set(subjectCases.map(c => (c.employeeEmail || '').trim().toLowerCase()).filter(Boolean));
  const possibleNameCollision = matchingEmployeeRecords.length > 1 || distinctCaseEmails.size > 1;

  const otherNames = new Set();
  employeeRecords.forEach(r => { if (r.name && r.name !== employeeName) otherNames.add(r.name); });
  cases.forEach(c => { if (c.employeeName && c.employeeName !== employeeName) otherNames.add(c.employeeName); });
  const otherNamesList = [...otherNames].filter(n => n && n.trim().length > 1);

  const flagged = [];
  const scanText = (text, location) => {
    if (!text) return;
    otherNamesList.forEach(name => {
      const idx = text.indexOf(name);
      if (idx === -1) return;
      flagged.push({ ...location, mentionedName: name, snippet: text.slice(Math.max(0, idx - 40), idx + name.length + 40) });
    });
  };

  subjectCases.forEach(c => {
    (c.meetings || []).forEach(m => {
      scanText(m.record, { caseId: c.id, meetingId: m.id, field: 'record', meetingType: m.type, date: m.date });
      (m.transcript || []).forEach((u, i) => scanText(u.text, { caseId: c.id, meetingId: m.id, field: `transcript[${i}]`, meetingType: m.type, date: m.date }));
    });
  });

  subjectWellbeingNotes.forEach(n => scanText(n.content, { field: 'wellbeingNote.content', wellbeingNoteId: n.id, date: n.date }));
  subjectConcernReferrals.forEach(r => {
    scanText(r.description, { field: 'concernReferral.description', concernReferralId: r.id });
    scanText(r.witnesses, { field: 'concernReferral.witnesses', concernReferralId: r.id });
    scanText(r.evidenceDescription, { field: 'concernReferral.evidenceDescription', concernReferralId: r.id });
  });
  subjectAllegations.forEach(a => {
    ['description', 'peopleInvolved', 'employeeResponse', 'witnessEvidence', 'investigatorFinding', 'outstandingUncertainty', 'decisionReasoning', 'appealReasoning'].forEach(field => {
      scanText(a[field], { field: `allegation.${field}`, caseId: a.caseId, allegationId: a.id });
    });
  });
  // signingRequests/portalAccounts are already scoped to this employeeName
  // server-side (api/portal/_dsar-lookup.js filters by org_id+employee_name
  // directly) — filtered again here defensively, matching every other
  // category's own belt-and-braces re-check rather than trusting the
  // caller passed in exactly the right slice.
  // Phase 6.5 hardening (Prompt 16 audit, H16) — a signing_requests row
  // also names a manager_name signatory (the person who chaired/approved
  // the meeting, not the employee it's about); a DSAR from that manager
  // was previously invisible here since only employee_name was ever
  // matched, even though the document, their own name, and their own
  // signature/decline are just as much their personal data.
  const subjectSigningRequests = signingRequests.filter(s => s.employee_name === employeeName || s.manager_name === employeeName);
  const subjectPortalAccounts = portalAccounts.filter(p => p.employee_name === employeeName);
  subjectSigningRequests.forEach(s => scanText(s.document, { field: 'signingRequest.document', signId: s.sign_id }));

  // Organisational Intelligence surface (org_events, improvement
  // initiatives, manager capability insights, organisation themes) —
  // org-wide AI-generated narrative text with no subject-identifying
  // column to filter these tables by at all. By design (see the
  // Organisational Intelligence phase's own "never score or rank an
  // individual" constraint) this content shouldn't name anyone — this is
  // the defensive backstop for if it ever does anyway, scanning for the
  // SUBJECT's own name rather than otherNamesList (the reverse direction
  // from flaggedThirdPartyMentions above: here the subject is the one
  // who might be mentioned, not the one whose record is being scanned).
  const subjectMentionsInOrgNarratives = [];
  const makeSubjectScanner = (target) => (text, location) => {
    if (!text) return;
    const idx = text.indexOf(employeeName);
    if (idx === -1) return;
    target.push({ ...location, snippet: text.slice(Math.max(0, idx - 40), idx + employeeName.length + 40) });
  };
  const scanForSubject = makeSubjectScanner(subjectMentionsInOrgNarratives);
  orgEvents.forEach(e => scanForSubject(e.description, { field: 'orgEvent.description', orgEventId: e.id, date: e.eventDate }));
  improvementInitiatives.forEach(i => {
    scanForSubject(i.title, { field: 'improvementInitiative.title', initiativeId: i.id });
    scanForSubject(i.problemIdentified, { field: 'improvementInitiative.problemIdentified', initiativeId: i.id });
  });
  managerCapabilityInsights.forEach(m => scanForSubject(m.suggested_response, { field: 'managerCapabilityInsight.suggestedResponse', insightId: m.id, date: m.created_at }));
  organisationThemes.forEach(t => scanForSubject(t.description, { field: 'organisationTheme.description', themeId: t.id }));

  // Phase 6.5 hardening (Prompt 16 audit, H15) — a pure witness/third
  // party who has never been a case subject falls through every filter
  // above (subjectCases/subjectWellbeingNotes/subjectConcernReferrals/
  // subjectAllegations are all empty for them — none of those filters
  // match on anything but the case's own employeeName), even though
  // their name and their own account of events can be recorded,
  // verbatim, inside someone ELSE's case as witness testimony — real
  // personal data about them under UK GDPR regardless of whose case it's
  // filed under. This is the same reverse-scan technique as
  // subjectMentionsInOrgNarratives above, just pointed at case content
  // instead — and, like flaggedThirdPartyMentions, surfaced for human
  // review rather than bundled in as if it were the subject's own
  // structured record, since disclosing it means redacting the actual
  // case subject's own confidential details first. Scoped to OTHER
  // people's cases only (subjectCaseIds excluded) — a mention of the
  // subject's own name inside their own case is already covered in full
  // above, not a third-party disclosure.
  const subjectMentionsAsThirdParty = [];
  const scanForSubjectAsThirdParty = makeSubjectScanner(subjectMentionsAsThirdParty);
  const otherCases = cases.filter(c => !subjectCaseIds.has(c.id));
  otherCases.forEach(c => {
    (c.meetings || []).forEach(m => {
      scanForSubjectAsThirdParty(m.record, { caseId: c.id, meetingId: m.id, field: 'record', meetingType: m.type, date: m.date });
      (m.transcript || []).forEach((u, i) => scanForSubjectAsThirdParty(u.text, { caseId: c.id, meetingId: m.id, field: `transcript[${i}]`, meetingType: m.type, date: m.date }));
    });
  });
  const otherCaseIds = new Set(otherCases.map(c => c.id));
  allegations.filter(a => otherCaseIds.has(a.caseId)).forEach(a => {
    ['description', 'peopleInvolved', 'employeeResponse', 'witnessEvidence', 'investigatorFinding', 'outstandingUncertainty', 'decisionReasoning', 'appealReasoning'].forEach(field => {
      scanForSubjectAsThirdParty(a[field], { field: `allegation.${field}`, caseId: a.caseId, allegationId: a.id });
    });
  });
  concernReferrals.filter(r => r.employeeName !== employeeName).forEach(r => {
    scanForSubjectAsThirdParty(r.description, { field: 'concernReferral.description', concernReferralId: r.id });
    scanForSubjectAsThirdParty(r.witnesses, { field: 'concernReferral.witnesses', concernReferralId: r.id });
    scanForSubjectAsThirdParty(r.evidenceDescription, { field: 'concernReferral.evidenceDescription', concernReferralId: r.id });
  });

  // Evidence files (photos, PDFs, CCTV, witness statements) are binary/opaque
  // content that can't be text-scanned for third-party mentions the way
  // meeting records/transcripts are above. Rather than silently bundling raw
  // file bytes into the response package unreviewed, list them as metadata
  // only — a human must open each file, check it for other people's data,
  // and attach it to the response manually.
  const evidenceRequiringReview = [];
  subjectCases.forEach(c => {
    (c.evidence || []).forEach(ev => {
      evidenceRequiringReview.push({ caseId: c.id, name: ev.name, type: ev.type, date: ev.date, size: ev.size });
    });
  });
  const casesForExport = subjectCases.map(c => ({ ...c, evidence: (c.evidence || []).map(({ dataUrl, ...meta }) => meta) }));

  return {
    employeeName,
    employeeRecord,
    possibleNameCollision,
    cases: casesForExport,
    onboarding,
    offboarding,
    wellbeingNotes: subjectWellbeingNotes,
    concernReferrals: subjectConcernReferrals,
    allegations: subjectAllegations,
    caseSignals: subjectCaseSignals,
    caseTasks: subjectCaseTasks,
    hrReviewRequests: subjectHrReviewRequests,
    auditLog: subjectAuditLog,
    signingRequests: subjectSigningRequests,
    portalAccounts: subjectPortalAccounts,
    dsarRequests: subjectDsarRequests,
    orgMembership: subjectOrgMembership,
    profiles: subjectProfiles,
    caseViews: subjectCaseViews,
    portalInvites: subjectPortalInvites,
    caseAccessGrants: subjectCaseAccess,
    actedAsStaff,
    flaggedThirdPartyMentions: flagged,
    subjectMentionsInOrgNarratives,
    subjectMentionsAsThirdParty,
    evidenceRequiringReview,
    compiledAt: new Date().toISOString(),
  };
}
