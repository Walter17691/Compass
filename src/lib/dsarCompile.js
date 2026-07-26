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
export function compileSubjectData(employeeName, { cases = [], employeeRecords = [], starterInstances = [] } = {}) {
  const employeeRecord = employeeRecords.find(r => r.name === employeeName) || null;
  const subjectCases = cases.filter(c => c.employeeName === employeeName);
  const onboarding = starterInstances.filter(s => s.name === employeeName);

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
    cases: casesForExport,
    onboarding,
    flaggedThirdPartyMentions: flagged,
    evidenceRequiringReview,
    compiledAt: new Date().toISOString(),
  };
}
