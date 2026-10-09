import { splitMeetingRecord } from './meetingRecordSections.js';

// ─────────────────────────────────────────────────────────────────────────
// A DSAR IS NOT A SEARCH WARRANT.
//
// A subject access request gives an individual access to THEIR OWN personal
// data, subject to lawful exemptions and third-party protection. It does not
// give them every case or document in which their name appears.
//
// ┌─ WHAT THIS MODULE WAS WRITTEN TO STOP ──────────────────────────────────┐
// │ Four places disclosed other people's records wholesale, because the      │
// │ filter that FOUND the rows was mistaken for a decision about what to     │
// │ DISCLOSE from them.                                                      │
// │                                                                          │
// │ 1. actedAsStaff.cases — src/lib/dsarCompile.js destructured out only     │
// │    `evidence` and emitted the rest. `meetings` survived, which is the     │
// │    whole JSONB array: every meeting `record` UNSPLIT (so `## HR Advisor  │
// │    Notes` included), every `transcript`, `letterOutput`, `signature`,     │
// │    `prediction`, `riskScore`, `reviewDraft` — plus the other employee's   │
// │    name, email, `description`, `outcome`, `outcomeNotes` and              │
// │    `investigationReport`. It bypassed disclosableCase entirely. A         │
// │    manager's own DSAR therefore returned the complete case files of       │
// │    everyone they had ever managed, and the screen told the reviewer they  │
// │    were "included in the download below" with no review flag.            │
// │                                                                          │
// │ 2. actedAsStaff.wellbeingNotes — another employee's confidential          │
// │    wellbeing content, because the subject was recorded as their manager. │
// │                                                                          │
// │ 3. actedAsStaff.hrReviewRequests — `record_snapshot`, a point-in-time    │
// │    copy of a meeting record about someone else.                          │
// │                                                                          │
// │ 4. redundancyCases — one name matching inside `atRiskEmployees` emitted  │
// │    the entire row: every pooled employee's name and selection scores,    │
// │    plus `aiAdvice`.                                                      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// THE FIX IS NOT SUPPRESSION. Each function below still discloses the
// subject's own personal data — that they held a role on a case, which case,
// when, what they themselves wrote. What it removes is the OTHER person's
// record, which was never the requester's to receive. Where a field is
// genuinely arguable it is REVIEW-FLAGGED, not dropped: the reviewer decides,
// and the existing reviewed_flagged_sections attestation covers it.
//
// Shape and vocabulary deliberately copied from dsarCaseDisclosure.js:
// allow-list in, `withheldAsThirdPartyData` / `reviewRequired` /
// `unrecognisedFieldsWithheld` out, fail-closed on anything unrecognised. Two
// DSAR standards for the same content would be a worse defect than the one
// this closes.
// ─────────────────────────────────────────────────────────────────────────

const isPlainText = v => typeof v === 'string' && v.trim() !== '';

// ─────────────────────────────────────────────────────────────────────────
// FOUR DISPOSITIONS, NOT TWO.
//
// The first cut of this module emitted `withheldAsThirdPartyData` as a bare
// list of field NAMES. Reviewed against the product decision, that was wrong in
// two ways:
//
//   1. It read as PERMANENT SUPPRESSION. A field name in a withheld list gives
//      the HR Director nothing to act on — no source record to retrieve, no
//      basis recorded, no route to release it if release is right.
//
//   2. It over-suppressed the REQUESTER'S OWN data. The sharp case: a meeting
//      record on a case the requester INVESTIGATED contains their own words and
//      their own conduct as well as the other employee's record. That is mixed
//      personal data, and "third party, withheld" is the wrong answer for it.
//      The right answer is "review this source record and extract what belongs
//      to the requester".
//
// So every decision now carries one of four dispositions, and withheld items
// carry a SOURCE REFERENCE and a BASIS:
//
//   INCLUDED        — safe to disclose; it is the requester's own data.
//   REVIEW_REQUIRED — the HR Director must look at the named source record and
//                     decide: release, redact, or withhold. Used for anything
//                     MIXED, and for anything arguable.
//   THIRD_PARTY     — another individual's personal data. Not disclosed
//                     automatically; disclosing it would reveal information
//                     about someone else, so UK GDPR Art 15(4) requires that
//                     the rights and freedoms of that person be weighed first.
//   LEGAL_WITHHELD  — withheld on a recorded justification, stated per item.
//
// This is a disposition vocabulary, not a workspace. No new screen, no new
// table, no new workflow.
// ─────────────────────────────────────────────────────────────────────────
export const DISCLOSURE_BASIS = Object.freeze({
  INCLUDED: 'included',
  REVIEW_REQUIRED: 'review_required',
  THIRD_PARTY: 'third_party_not_automatically_disclosed',
  LEGAL_WITHHELD: 'withheld_legal_justification',
});

/** The recorded justification for not disclosing another individual's data. */
const THIRD_PARTY_BASIS =
  'Another individual\'s personal data. Disclosing it would reveal information about '
  + 'someone other than the requester, so under UK GDPR Art 15(4) their rights and '
  + 'freedoms must be weighed before any release. Not withheld permanently — the '
  + 'source record is named so the reviewer can assess it.';


// ── 1. A case the subject worked ON, rather than a case ABOUT the subject ──
//
// Disclosed: that they held the role, on which case, and when. This IS their
// personal data — it is a record of their own professional activity — and it is
// what makes the disclosure honest rather than silent.
const STAFF_CASE_DISCLOSE = Object.freeze([
  'id', 'caseType', 'stage', 'dateReceived', 'createdAt', 'updatedAt',
]);

// The other employee's identity. Very likely already known to the subject —
// they managed them — but it is still another person's personal data, and
// whether to confirm it belongs to a human, not to a filter.
const STAFF_CASE_REVIEW_REQUIRED = Object.freeze(['employeeName', 'email']);

// The other employee's record. None of this is the requester's personal data.
const STAFF_CASE_WITHHELD_THIRD_PARTY = Object.freeze([
  'employeeId', 'description', 'outcome', 'outcomeIssuedAt', 'outcomeNotes',
  'investigationReport', 'investigationReportDate', 'appealText',
  // `meetings` is NOT here any more — it is review-required with source
  // references, because it is mixed rather than purely third-party.
  'evidence', 'vaultDocs',
  'ohProcess', 'fitNoteEndDate', 'ohReferralDate', 'ohReportReceivedDate',
  'suspensionReviewDate', 'probationReviewDate',
  'warningDurationMonths', 'warningExpiresAt',
  'estimatedWeeklyPay', 'estimatedAgeAtDismissal',
  'hrReviewStatus', 'hrReviewComments', 'hrReviewedAt', 'hrReviewedBy',
  'nextSteps', 'timelineOverrides', 'priority', 'urgency',
  'investigationPaused', 'confidential', 'prediction', 'riskScore',
]);

// Role/plumbing columns. The subject's OWN role is reported as `rolesHeld`
// below rather than by echoing these raw.
const STAFF_CASE_OMIT_TECHNICAL = Object.freeze([
  'manager', 'investigatingManager', 'disciplinaryOfficer', 'disciplinaryDecidedBy',
  'disciplinaryOfficerId', 'disciplinaryOfficerEmail',
  'locationId', 'ownerId', 'assignedTo', 'createdBy', 'userId', 'handoffDate',
  'orgId', 'employeeEmail',
]);

/**
 * One case the subject acted as staff on → what may be disclosed.
 *
 * `rolesHeld` is computed by the caller (it is the reason the row matched) and
 * is the single most useful fact here: the subject learns they are recorded as
 * the investigating manager on case X, which is their data, without receiving
 * X's case file.
 */
export function disclosableStaffRoleCase(caseObj, { rolesHeld = [] } = {}) {
  if (!caseObj || typeof caseObj !== 'object') return null;

  const out = {};
  STAFF_CASE_DISCLOSE.forEach(k => { if (caseObj[k] !== undefined) out[k] = caseObj[k]; });
  out.rolesHeld = [...rolesHeld].sort();

  const withheld = [];
  STAFF_CASE_WITHHELD_THIRD_PARTY.forEach(k => {
    const v = caseObj[k];
    const empty = v === undefined || v === null || v === ''
      || (Array.isArray(v) && v.length === 0);
    if (!empty) withheld.push({ field: k, basis: DISCLOSURE_BASIS.THIRD_PARTY, reason: THIRD_PARTY_BASIS });
  });

  const reviewRequired = [];
  STAFF_CASE_REVIEW_REQUIRED.forEach(k => {
    if (isPlainText(caseObj[k])) {
      reviewRequired.push({
        field: k,
        basis: DISCLOSURE_BASIS.REVIEW_REQUIRED,
        reason: 'Identifies the other employee whose case this is. The requester is recorded as '
          + `${out.rolesHeld.join(' and ') || 'staff'} on it. Decide whether naming that employee is appropriate in this response.`,
      });
    }
  });

  // ── MIXED RECORDS ARE REVIEW-REQUIRED, NOT WITHHELD ─────────────────────
  //
  // A meeting on a case the requester chaired or investigated records THEIR
  // words and THEIR conduct as well as the other employee's account. Treating
  // the array as third-party data would suppress the requester's own personal
  // data, which is the opposite of what a DSAR owes them.
  //
  // The text is still not emitted — that is what the containment fix was for —
  // but each meeting is named so the HR Director can retrieve the source record
  // and extract the requester's own contribution from it.
  const sourceRecords = (Array.isArray(caseObj.meetings) ? caseObj.meetings : [])
    .filter(Boolean)
    .map(m => ({
      kind: 'meeting',
      meetingId: m.id ?? null,
      meetingType: m.type ?? null,
      date: m.date ?? m.schedule?.date ?? null,
      hasRecord: isPlainText(m.record),
      hasTranscript: Array.isArray(m.transcript) && m.transcript.length > 0,
    }));
  if (sourceRecords.length > 0) {
    reviewRequired.push({
      field: 'meetings',
      basis: DISCLOSURE_BASIS.REVIEW_REQUIRED,
      reason: `${sourceRecords.length} meeting record(s) on this case. MIXED personal data: the requester is `
        + `recorded as ${out.rolesHeld.join(' and ') || 'staff'}, so these record their own words and conduct `
        + 'alongside the other employee\'s account. Retrieve each record listed in sourceRecords and release the '
        + 'requester\'s own contribution, redacting the other employee\'s. The text is deliberately not reproduced here.',
      sourceRecords,
    });
  }

  const known = new Set([
    ...STAFF_CASE_DISCLOSE, ...STAFF_CASE_REVIEW_REQUIRED,
    ...STAFF_CASE_WITHHELD_THIRD_PARTY, ...STAFF_CASE_OMIT_TECHNICAL,
  ]);
  const unrecognised = Object.keys(caseObj).filter(k => !known.has(k));

  return {
    ...out,
    sourceRecords,
    withheldAsThirdPartyData: withheld,
    reviewRequired,
    unrecognisedFieldsWithheld: unrecognised,
  };
}

// ── 2. Another employee's wellbeing note, where the subject is the manager ──
const STAFF_NOTE_DISCLOSE = Object.freeze(['id', 'date', 'createdAt']);
const STAFF_NOTE_WITHHELD_THIRD_PARTY = Object.freeze([
  'content', 'employeeName', 'employeeId', 'category', 'followUpDate', 'createdBy',
]);
const STAFF_NOTE_OMIT_TECHNICAL = Object.freeze(['manager', 'orgId']);

/**
 * The FACT that a wellbeing note names the subject as the employee's manager is
 * the subject's own data. The note's content is the other employee's, and
 * wellbeing content is the most sensitive category this product holds — so it
 * is withheld outright rather than review-flagged.
 */
export function disclosableStaffRoleWellbeingNote(note) {
  if (!note || typeof note !== 'object') return null;
  const out = {};
  STAFF_NOTE_DISCLOSE.forEach(k => { if (note[k] !== undefined) out[k] = note[k]; });

  const withheld = STAFF_NOTE_WITHHELD_THIRD_PARTY
    .filter(k => {
      const v = note[k];
      return !(v === undefined || v === null || v === '');
    })
    .map(k => ({ field: k, basis: DISCLOSURE_BASIS.THIRD_PARTY, reason: THIRD_PARTY_BASIS }));

  // A REVIEW PATH, not a dead end. The first cut returned reviewRequired: []
  // here, which made this the one source with no route to release — and that is
  // over-suppression, because a wellbeing note naming the requester as the
  // manager may also record the requester's OWN management actions. The content
  // is still not emitted; the reviewer is told the record exists and why it is
  // held back, and can assess it.
  const reviewRequired = isPlainText(note.content) ? [{
    field: 'content',
    basis: DISCLOSURE_BASIS.REVIEW_REQUIRED,
    reason: 'A wellbeing note about another employee, on which the requester is recorded as the manager. '
      + 'Health information is the most sensitive category Compass holds, so it is not disclosed '
      + 'automatically — but it may also record the requester\'s own management actions. Assess whether any '
      + 'part is the requester\'s own personal data before withholding the note entirely.',
    sourceRecords: [{ kind: 'wellbeingNote', noteId: note.id ?? null, date: note.date ?? null }],
  }] : [];

  const known = new Set([
    ...STAFF_NOTE_DISCLOSE, ...STAFF_NOTE_WITHHELD_THIRD_PARTY, ...STAFF_NOTE_OMIT_TECHNICAL,
  ]);
  return {
    ...out,
    recordedAs: 'manager',
    withheldAsThirdPartyData: withheld,
    reviewRequired,
    unrecognisedFieldsWithheld: Object.keys(note).filter(k => !known.has(k)),
  };
}

// ── 2b. Another employee's HRIS record, where the subject is the manager ───
//
// Caught by this module's OWN adversarial test, not by review. The first cut of
// this fix left `actedAsStaff.employeeRecords` raw, on the reasoning that
// `employee_records.manager` is "a single name field with no narrative
// content". The row around it is not: name, job title, department, employee
// number, start date, working pattern, probation end date and employment
// status are all the OTHER employee's personal data, and none of it becomes the
// requester's because they are recorded as the manager.
//
// What IS theirs is the management relationship itself. That is disclosed.
const STAFF_RECORD_DISCLOSE = Object.freeze(['id']);
const STAFF_RECORD_REVIEW_REQUIRED = Object.freeze(['name']);
const STAFF_RECORD_WITHHELD_THIRD_PARTY = Object.freeze([
  'jobTitle', 'location', 'department', 'employeeNumber', 'email',
  'startDate', 'endDate', 'workingPattern', 'probationEndDate',
  'employmentStatus', 'salary', 'dateOfBirth', 'nationalInsuranceNumber',
  'personalEmail', 'phone', 'address', 'notes',
]);
const STAFF_RECORD_OMIT_TECHNICAL = Object.freeze(['manager', 'orgId', 'createdAt', 'updatedAt']);

export function disclosableStaffRoleEmployeeRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const out = {};
  STAFF_RECORD_DISCLOSE.forEach(k => { if (record[k] !== undefined) out[k] = record[k]; });

  const withheld = STAFF_RECORD_WITHHELD_THIRD_PARTY
    .filter(k => {
      const v = record[k];
      return !(v === undefined || v === null || v === '');
    })
    .map(k => ({ field: k, basis: DISCLOSURE_BASIS.THIRD_PARTY, reason: THIRD_PARTY_BASIS }));

  const reviewRequired = [];
  STAFF_RECORD_REVIEW_REQUIRED.forEach(k => {
    if (isPlainText(record[k])) {
      reviewRequired.push({
        field: k,
        reason: 'Names the employee the requester is recorded as managing. The management relationship is the requester\'s own data; whether to name the employee is a decision for the reviewer.',
      });
    }
  });

  const known = new Set([
    ...STAFF_RECORD_DISCLOSE, ...STAFF_RECORD_REVIEW_REQUIRED,
    ...STAFF_RECORD_WITHHELD_THIRD_PARTY, ...STAFF_RECORD_OMIT_TECHNICAL,
  ]);
  return {
    ...out,
    recordedAs: 'manager',
    withheldAsThirdPartyData: withheld,
    reviewRequired,
    unrecognisedFieldsWithheld: Object.keys(record).filter(k => !known.has(k)),
  };
}

// ── 3. An HR review request the subject requested or reviewed ──────────────
//
// Role-dependent, the way dsarSigningDisclosure.js already splits signer from
// manager. If the subject WROTE the review comments they are the subject's own
// words and are theirs. If they merely requested the review, the reviewer's
// comments are somebody else's.
//
// `record_snapshot` is withheld either way: it is a point-in-time copy of a
// meeting record about the OTHER employee, and it is the field that re-leaked
// the advisor notes splitMeetingRecord exists to remove.
const STAFF_REVIEW_DISCLOSE = Object.freeze([
  'id', 'case_id', 'status', 'created_at', 'reviewed_at', 'meeting_id', 'meeting_type',
]);
const STAFF_REVIEW_WITHHELD_THIRD_PARTY = Object.freeze(['record_snapshot']);
const STAFF_REVIEW_OMIT_TECHNICAL = Object.freeze([
  'org_id', 'requested_by', 'reviewed_by', 'requested_by_name', 'reviewed_by_name',
]);

export function disclosableStaffRoleHrReview(row, { asReviewer = false } = {}) {
  if (!row || typeof row !== 'object') return null;
  const out = {};
  STAFF_REVIEW_DISCLOSE.forEach(k => { if (row[k] !== undefined) out[k] = row[k]; });
  out.recordedAs = asReviewer ? 'reviewer' : 'requester';

  const withheld = STAFF_REVIEW_WITHHELD_THIRD_PARTY
    .filter(k => isPlainText(row[k]))
    .map(k => ({ field: k, basis: DISCLOSURE_BASIS.THIRD_PARTY, reason: THIRD_PARTY_BASIS }));
  const reviewRequired = [];

  if (isPlainText(row.comments)) {
    if (asReviewer) {
      // Their own words, written by them, about someone else's record. Theirs
      // to receive — but it quotes another person's case, so a human decides.
      reviewRequired.push({
        field: 'comments',
        reason: 'Review comments the requester wrote themselves. Their own words, but recorded against another employee\'s case — confirm no third-party detail is carried across.',
      });
    } else {
      withheld.push({ field: 'comments', basis: DISCLOSURE_BASIS.THIRD_PARTY, reason: THIRD_PARTY_BASIS });
    }
  }

  const known = new Set([
    ...STAFF_REVIEW_DISCLOSE, ...STAFF_REVIEW_WITHHELD_THIRD_PARTY,
    ...STAFF_REVIEW_OMIT_TECHNICAL, 'comments',
  ]);
  return {
    ...out,
    withheldAsThirdPartyData: withheld,
    reviewRequired,
    unrecognisedFieldsWithheld: Object.keys(row).filter(k => !known.has(k)),
  };
}

// ── 4. The subject's OWN case: hr_review_requests.record_snapshot ──────────
//
// Here the subject IS the case subject, so the record is about them — but it is
// a copy of the generated meeting record, which carries the `## HR Advisor
// Notes` section. The meeting path splits that out (splitMeetingRecord);
// this path emitted it raw, which re-leaked exactly what Wave 0 removed.
//
// So: split it, disclose the employee-facing half (theirs), withhold the
// internal half, and say so. `comments` is HR's own commentary on their record
// and is review-required, matching cases.outcomeNotes.
export function disclosableOwnHrReview(row) {
  if (!row || typeof row !== 'object') return null;
  const out = {};
  ['id', 'case_id', 'status', 'created_at', 'reviewed_at', 'meeting_id', 'meeting_type']
    .forEach(k => { if (row[k] !== undefined) out[k] = row[k]; });

  const withheld = [];
  const reviewRequired = [];

  if (isPlainText(row.record_snapshot)) {
    const { employeeFacing, internal } = splitMeetingRecord(row.record_snapshot);
    if (isPlainText(employeeFacing)) out.recordSnapshot = employeeFacing;
    if (isPlainText(internal)) withheld.push('record_snapshot.internalSection');
  }

  if (isPlainText(row.comments)) {
    reviewRequired.push({
      field: 'comments',
      reason: 'HR\'s own commentary on this record, written during review. The record itself is included; decide whether this commentary should be disclosed.',
    });
  }

  const known = new Set([
    'id', 'case_id', 'status', 'created_at', 'reviewed_at', 'meeting_id', 'meeting_type',
    'record_snapshot', 'comments',
    'org_id', 'requested_by', 'reviewed_by', 'requested_by_name', 'reviewed_by_name',
  ]);
  return {
    ...out,
    withheldAsInternalAnalysis: withheld,
    reviewRequired,
    unrecognisedFieldsWithheld: Object.keys(row).filter(k => !known.has(k)),
  };
}

// ── 5. A redundancy pool the subject was in ────────────────────────────────
//
// The subject's own at-risk entry — their scores, their selection outcome,
// their redundancy pay — is derived personal data about them and is disclosed
// in full. The POOL is not: every other pooled employee's name and score is
// their data, not the requester's, and `aiAdvice` is generated advice to the
// employer about the exercise.
const REDUNDANCY_REVIEW_REQUIRED = Object.freeze([
  'reason', 'poolDescription', 'selectionCriteria', 'collectiveInfo',
]);

export function disclosableRedundancyCase(row, { employeeName } = {}) {
  if (!row || typeof row !== 'object') return null;
  const pool = Array.isArray(row.atRiskEmployees) ? row.atRiskEmployees : [];
  const norm = v => (typeof v === 'string' ? v.trim().toLowerCase() : '');
  const mine = pool.filter(e => e && norm(e.name) === norm(employeeName));

  const out = {
    id: row.id,
    type: row.type,
    status: row.status,
    createdAt: row.createdAt,
    // Theirs in full: their own scoring and outcome.
    ownAtRiskEntry: mine.length === 1 ? mine[0] : mine,
    // The SIZE of the pool is a fact about the exercise applied to them, and
    // it is what makes "you were one of N" answerable without naming the N.
    poolSize: pool.length,
  };

  const withheld = [];
  if (pool.length > mine.length) {
    withheld.push({
      field: 'atRiskEmployees.otherEmployees',
      basis: DISCLOSURE_BASIS.THIRD_PARTY,
      reason: `${pool.length - mine.length} other pooled employee(s), with their names and selection scores. ` + THIRD_PARTY_BASIS,
    });
  }
  if (isPlainText(row.aiAdvice)) {
    withheld.push({
      field: 'aiAdvice',
      basis: DISCLOSURE_BASIS.LEGAL_WITHHELD,
      reason: 'Generated advice to the EMPLOYER about how to run the redundancy exercise, including how to '
        + 'weight criteria. Advice to the employer about a process, not a record about the requester. Withheld '
        + 'as internal management material; release only on a deliberate decision.',
    });
  }

  const reviewRequired = [];
  REDUNDANCY_REVIEW_REQUIRED.forEach(k => {
    const v = row[k];
    const present = Array.isArray(v) ? v.length > 0 : isPlainText(v);
    if (present) {
      reviewRequired.push({
        field: k,
        basis: DISCLOSURE_BASIS.REVIEW_REQUIRED,
        reason: 'Describes the redundancy exercise the requester was pooled in. Directly relevant to them, and may also describe or name other pooled employees — review before disclosing.',
        sourceRecords: [{ kind: 'redundancyCase', redundancyCaseId: row.id ?? null }],
      });
    }
  });

  const known = new Set([
    'id', 'type', 'status', 'createdAt', 'updatedAt', 'orgId',
    'atRiskEmployees', 'aiAdvice', ...REDUNDANCY_REVIEW_REQUIRED,
  ]);
  return {
    ...out,
    withheldAsThirdPartyData: withheld,
    reviewRequired,
    unrecognisedFieldsWithheld: Object.keys(row).filter(k => !known.has(k)),
  };
}

/**
 * Roll every containment decision up for the reviewer's single banner, in the
 * shape summariseCaseDisclosure already produces.
 *
 * A flag that never reaches that banner is a flag nobody acts on — which is the
 * standard DsarScreen sets for itself, and the standard these four sources were
 * failing before this module existed.
 */
export function summariseThirdPartyContainment({
  staffRoleCases = [], staffRoleWellbeingNotes = [], staffRoleHrReviews = [],
  staffRoleEmployeeRecords = [], ownHrReviews = [], redundancyCases = [],
} = {}) {
  const thirdParty = new Set();
  const legal = [];
  const internal = new Set();
  const unrecognised = new Set();
  const review = [];

  const absorb = (rows, label) => rows.forEach(r => {
    if (!r) return;
    (r.withheldAsThirdPartyData || []).forEach(w => {
      const field = typeof w === 'string' ? w : w.field;
      thirdParty.add(`${label}.${field}`);
      if (w && w.basis === DISCLOSURE_BASIS.LEGAL_WITHHELD) {
        legal.push({ source: label, recordId: r.id ?? null, field, reason: w.reason });
      }
    });
    (r.withheldAsInternalAnalysis || []).forEach(f => internal.add(`${label}.${f}`));
    (r.unrecognisedFieldsWithheld || []).forEach(f => unrecognised.add(`${label}.${f}`));
    (r.reviewRequired || []).forEach(x => review.push({ source: label, recordId: r.id ?? null, ...x }));
  });

  absorb(staffRoleCases, 'actedAsStaff.cases');
  absorb(staffRoleWellbeingNotes, 'actedAsStaff.wellbeingNotes');
  absorb(staffRoleEmployeeRecords, 'actedAsStaff.employeeRecords');
  absorb(staffRoleHrReviews, 'actedAsStaff.hrReviewRequests');
  absorb(ownHrReviews, 'hrReviewRequests');
  absorb(redundancyCases, 'redundancyCases');

  return {
    thirdPartyFieldsWithheld: [...thirdParty].sort(),
    // Withholdings carrying a recorded justification, listed individually so
    // the basis travels with the item rather than being implied by a category.
    legallyWithheld: legal,
    internalFieldsWithheld: [...internal].sort(),
    unrecognisedFieldsWithheld: [...unrecognised].sort(),
    reviewRequired: review,
  };
}
