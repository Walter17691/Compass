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
export function compileSubjectData(employeeName, { cases = [], employeeRecords = [], starterInstances = [], leaverInstances = [], wellbeingNotes = [], concernReferrals = [], allegations = [], caseSignals = [], caseTasks = [], hrReviewRequests = [], auditLog = [], signingRequests = [], portalAccounts = [] } = {}) {
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
  const subjectAuditLog = auditLog.filter(a => (a.caseId && subjectCaseIds.has(a.caseId)) || a.detail === employeeName);

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
  const subjectSigningRequests = signingRequests.filter(s => s.employee_name === employeeName);
  const subjectPortalAccounts = portalAccounts.filter(p => p.employee_name === employeeName);
  subjectSigningRequests.forEach(s => scanText(s.document, { field: 'signingRequest.document', signId: s.sign_id }));

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
    flaggedThirdPartyMentions: flagged,
    evidenceRequiringReview,
    compiledAt: new Date().toISOString(),
  };
}
