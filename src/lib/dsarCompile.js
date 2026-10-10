import { classifyIdentityByName, IDENTITY } from './employeeRecords.js';
import { MEETING_SUBJECT_KIND } from './standaloneMeetings.js';
import { splitMeetingRecord } from './meetingRecordSections.js';
import { disclosableCase, summariseCaseDisclosure, MEETING_WITHHELD_INTERNAL } from './dsarCaseDisclosure.js';
import { disclosableAllegation, summariseAllegationDisclosure } from './dsarAllegationDisclosure.js';
import { disclosableSigningRequest, summariseSigningDisclosure } from './dsarSigningDisclosure.js';
import { classifyReportVersion, REPORT_VERSION_STATE } from './reportVersionGateway.js';
import {
  disclosableStaffRoleCase, disclosableStaffRoleWellbeingNote, disclosableStaffRoleHrReview,
  disclosableOwnHrReview, disclosableRedundancyCase, disclosableStaffRoleEmployeeRecord,
  summariseThirdPartyContainment,
} from './dsarThirdPartyContainment.js';

// Every free-text allegation field that can mention a person. Used by BOTH
// third-party scans — the subject's own allegations, and the subject appearing
// inside other people's — because this list was previously written out twice by
// hand and a new column added to one copy but not the other would silently stop
// being scanned for third-party mentions. investigationConclusionReasoning is
// here from the day it exists, which is the point of having one list.
const ALLEGATION_FREE_TEXT_FIELDS = Object.freeze([
  'description', 'peopleInvolved', 'employeeResponse', 'witnessEvidence',
  'investigatorFinding', 'outstandingUncertainty', 'decisionReasoning',
  'appealReasoning', 'investigationConclusionReasoning',
]);
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
// ─────────────────────────────────────────────────────────────────────────
// NEW-44 governance closure — THE DSAR SOURCE MANIFEST.
//
// Maps every data input this compiler declares to the public table it comes
// from. It exists because the correspondence between "a table is classified
// dsar: included" and "this function actually reads it" was true but unproven:
// the NEW-44 audit verified 28 ⟺ 28 BY HAND, which means it could drift in
// either direction the moment someone edited one side.
//
// src/test/governanceClosure.test.js locks three things together:
//
//   1. the parameter names PARSED OUT OF THIS FUNCTION'S OWN SIGNATURE
//   2. the keys of this manifest
//   3. the tables classified `dsar: included` in dataClassification.js
//
// Forgetting any one of the three fails CI, and (1) is read from the source
// rather than restated, so this manifest cannot quietly describe a signature
// that no longer exists.
//
// NOT INCLUDED HERE, DELIBERATELY: `canonicalEmployeeId`,
// `meetingFetchFailed` and `findingRevisionFetchFailed` are not data sources —
// the first is the subject's identity and the other two are failure flags. They
// are named in the test's own exclusion list so that adding a further
// non-source parameter is a decision somebody has to make explicitly.
//
// A MANIFEST ENTRY IS NOT AN INTEGRATION. The B2 review found
// investigation_finding_revisions listed here, classified dsar: included,
// covered by 21 passing tests — and fetched by nothing at all, because every
// test handed the parameter in directly. The three-way lock above cannot see
// that: it ties the manifest to this signature and to the classification, none
// of which knows whether a caller supplies the argument. The gap is closed by
// src/lib/findingRevisionGateway.js plus a blob-level wiring test in
// src/test/DsarScreen.test.jsx, which is the only assertion shape that would
// have caught it.
//
// This manifest changes NO disclosure behaviour. Whether a given table's rows
// reach the subject, and whether internal material is withheld, is decided
// exactly where it was before — disclosableCase, summariseCaseDisclosure,
// splitMeetingRecord and MEETING_WITHHELD_INTERNAL are untouched.
// ─────────────────────────────────────────────────────────────────────────
export const DSAR_SUBJECT_SOURCES = Object.freeze({
  cases: 'cases',
  employeeRecords: 'employee_records',
  starterInstances: 'starter_instances',
  leaverInstances: 'leaver_instances',
  wellbeingNotes: 'wellbeing_notes',
  concernReferrals: 'concern_referrals',
  caseDecisions: 'case_decisions',
  findingRevisions: 'investigation_finding_revisions',
  reportVersions: 'investigation_report_versions',
  allegations: 'allegations',
  caseSignals: 'case_signals',
  caseTasks: 'case_tasks',
  hrReviewRequests: 'hr_review_requests',
  auditLog: 'audit_log',
  signingRequests: 'signing_requests',
  portalAccounts: 'employee_portal_accounts',
  dsarRequests: 'dsar_requests',
  orgMembers: 'org_members',
  profiles: 'profiles',
  caseViews: 'case_views',
  portalInvites: 'employee_portal_invites',
  orgEvents: 'org_events',
  improvementInitiatives: 'improvement_initiatives',
  managerCapabilityInsights: 'manager_capability_insights',
  organisationThemes: 'organisation_themes',
  caseAccess: 'case_access',
  redundancyCases: 'redundancy_cases',
  standaloneMeetings: 'meetings',
  employeeActivities: 'employee_activities',
  employeeActivityRecords: 'employee_activity_records',
  employmentEvents: 'employee_employment_events',
});

export function compileSubjectData(employeeName, { canonicalEmployeeId = null, cases = [], employeeRecords = [], starterInstances = [], leaverInstances = [], wellbeingNotes = [], concernReferrals = [], allegations = [], caseSignals = [], caseTasks = [], hrReviewRequests = [], auditLog = [], signingRequests = [], portalAccounts = [], dsarRequests = [], orgMembers = [], profiles = [], caseViews = [], portalInvites = [], orgEvents = [], improvementInitiatives = [], managerCapabilityInsights = [], organisationThemes = [], caseAccess = [], redundancyCases = [], standaloneMeetings = [], meetingFetchFailed = false,
    employeeActivities = [], employeeActivityRecords = [], employmentEvents = [],
    caseDecisions = [],
    findingRevisions = [], findingRevisionFetchFailed = false,
    reportVersions = [], reportVersionFetchFailed = false,
    failedPortalCollections = [],
  } = {}) {
  // ── Phase E0.5B — CANONICAL IDENTITY TAKES PRECEDENCE OVER THE NAME ───────
  //
  // Once a case has been explicitly reconciled to a canonical employee, that
  // employee's DSAR must be assembled from employee_id, NOT from every record
  // that happens to share their display name.
  //
  // ┌─ THE TRANSITION RULE THAT MATTERS MOST ────────────────────────────────┐
  // │ A partially reconciled employee has:                                    │
  // │     case A → employee_id = UUID   (confirmed to be theirs)              │
  // │     case B → employee_id = NULL   (same name, NOT confirmed)            │
  // │                                                                         │
  // │ Case B must NOT be silently included because the name matches — that is  │
  // │ how one person's package comes to contain another person's history. And  │
  // │ it must NOT be silently dropped either: it is reported as still          │
  // │ requiring reconciliation, so nobody mistakes exclusion for absence.     │
  // └────────────────────────────────────────────────────────────────────────┘
  //
  // NOTE ON REACH. Only public.cases carries employee_id today. Every other
  // collection here (wellbeing notes, concern referrals, standalone meetings,
  // starters/leavers, signing requests, portal accounts, org membership) is
  // still name-keyed because those tables have no employee column at all. So
  // canonicalisation is genuinely id-based for cases and everything derived
  // from subjectCaseIds, and remains name-based elsewhere. That is a real
  // limitation, stated rather than papered over, and it is why `identityBasis`
  // is reported per-collection below.
  const norm = v => (typeof v === "string" ? v.trim().toLowerCase() : "");
  const nameMatchesSubject = v => norm(v) === norm(employeeName);

  // Normalised, unlike the historical exact-equality match this replaces. The
  // identity GATE (classifyIdentityByName) has always normalised, so exact
  // matching here could classify a subject RESOLVED while finding zero roster
  // rows — exporting nothing while reporting success. Fail-open by arithmetic.
  const matchingEmployeeRecords = employeeRecords.filter(r => nameMatchesSubject(r?.name));
  const employeeRecord =
    (canonicalEmployeeId && matchingEmployeeRecords.find(r => r.id === canonicalEmployeeId))
    || matchingEmployeeRecords[0]
    || null;

  // Phase E1.6 — Employee Activities are selected by CANONICAL ID ONLY.
  //
  // Every other collection here still has a name-matching fallback for legacy
  // rows that were written before canonical identity existed. Activities have no
  // such history: employee_id is NOT NULL from the first row, so there is nothing
  // a name fallback could rescue and everything it could wrongly attach. Two
  // employees sharing a name therefore stay completely separate in a DSAR.
  const subjectActivities = canonicalEmployeeId
    ? employeeActivities.filter(a => a?.employeeId === canonicalEmployeeId)
    : [];
  const subjectActivityIds = new Set(subjectActivities.map(a => a.id));
  const subjectActivityRecords = canonicalEmployeeId
    ? employeeActivityRecords.filter(r => r?.employeeId === canonicalEmployeeId && subjectActivityIds.has(r.activityId))
    : [];

  // Phase E1.7 — employment events, by CANONICAL ID ONLY, for the same reason as
  // activities: employee_id is NOT NULL from the first row, so a name fallback
  // could rescue nothing and could wrongly attach a same-named colleague's
  // promotion, transfer or leaving date to this subject.
  const subjectEmploymentEvents = canonicalEmployeeId
    ? employmentEvents.filter(e => e?.employeeId === canonicalEmployeeId)
    : [];

  const nameMatchedCases = cases.filter(c => nameMatchesSubject(c?.employeeName));
  // Records that share the name but are NOT confirmed to be this person.
  // Reported as metadata only — id, type, stage, dates. No case content leaves
  // this bucket, because it may well belong to somebody else.
  const unreconciledSameNameCases = canonicalEmployeeId
    ? nameMatchedCases.filter(c => !c.employeeId).map(c => ({
        id: c.id, caseType: c.caseType, stage: c.stage, createdAt: c.createdAt, employeeName: c.employeeName,
      }))
    : [];
  // Same name, but confirmed to be a DIFFERENT canonical employee. Excluded
  // outright and counted only — naming them would disclose the other person.
  const otherEmployeeSameNameCount = canonicalEmployeeId
    ? nameMatchedCases.filter(c => c.employeeId && c.employeeId !== canonicalEmployeeId).length
    : 0;

  const subjectCases = canonicalEmployeeId
    ? cases.filter(c => c.employeeId === canonicalEmployeeId)
    : nameMatchedCases;
  const subjectCaseIds = new Set(subjectCases.map(c => c.id));
  // Phase 4C.1 — meetings that live in public.meetings rather than inside a
  // case (see lib/meetingStore.js). A standalone meeting's transcript and record
  // are unambiguously the named employee's personal data, so omitting them would
  // make every DSAR response incomplete the moment standalone meetings can be
  // saved. This is wired in the SAME slice that creates the table, deliberately:
  // there must be no window in which Compass can store this content but not
  // disclose it.
  //
  // Matched on employeeName, the same boundary wellbeingNotes and
  // concernReferrals already use — a standalone meeting has no case to inherit
  // the subject from, so the meeting's own employee_name IS the link. Note this
  // is the DSAR compiler's established pattern, not a new inference: it is not
  // being used to grant access (RLS does that, and never reads a name), only to
  // decide what to disclose to a subject who has asked.
  // ── Phase E2 — a standalone meeting's subject is its employee_id, or nobody.
  //
  // Two corrections, and they have to land together.
  //
  // 1. WITNESS PARTICIPATION IS NOT OWNERSHIP. A witness interview stores the
  //    witness's name in employee_name (that is what the field meant on that
  //    path before E2), so the name rule below returned another employee's
  //    investigation as part of the WITNESS's own personal data. subject_kind
  //    settles it: a process_witness meeting belongs to the process, never to
  //    the person interviewed, so it is never their own record.
  //
  // 2. NO NAME FALLBACK where an id exists. An employee-owned meeting always
  //    carries employee_id, so if we do not know the subject's canonical id we
  //    cannot claim the meeting is theirs — two same-named employees must not
  //    inherit each other's conversations.
  //
  // Legacy pre-E2 rows keep the historical name behaviour exactly, so a DSAR for
  // an unreconciled subject still returns what it always did.
  const isSubjectsOwnStandaloneMeeting = m => {
    if (m?.subjectKind === MEETING_SUBJECT_KIND.PROCESS_WITNESS) return false;
    if (m?.subjectKind === MEETING_SUBJECT_KIND.EMPLOYEE) {
      return !!canonicalEmployeeId && m?.employeeId === canonicalEmployeeId;
    }
    return nameMatchesSubject(m?.employeeName);
  };
  const ownedStandaloneMeetings = standaloneMeetings.filter(isSubjectsOwnStandaloneMeeting);

  // ── Phase E2A — WHAT OF A MEETING IS THE EMPLOYEE'S PERSONAL DATA ────────
  //
  // A meeting row carries both the employee's own record and Compass's internal
  // analysis of it, in the same object. Disclosing the row wholesale would hand
  // over the second with the first.
  //
  // The split is not invented here: splitMeetingRecord already draws the
  // employee-facing / internal boundary that the signature path uses, and
  // stripAdvisorNotes is the read-time projection built on it. This applies that
  // same rule at the disclosure boundary.
  //
  // DISCLOSED — their own words and the record of what happened to them:
  //   transcript, summary, the employee-facing part of `record`, and the
  //   parentage/lifecycle metadata (type, dates, status, case link).
  //
  // WITHHELD — Compass's internal analysis and working material:
  //   advisor_notes (an HR advisory note about how to handle them),
  //   review_draft (an unfinished internal analysis, not a record of the
  //   meeting), risk (a generated risk score/prediction about the person), and
  //   the internal half of `record`.
  //
  // Withheld items are REPORTED, not silently dropped, so a DPO can see that a
  // deliberate classification was applied and decide differently if they judge
  // an exemption does not apply.
  const classifyMeetingForDisclosure = m => {
    const { employeeFacing, internal } = splitMeetingRecord(m?.record || "");
    // Wave 0 — the SAME vocabulary the historical jsonb transformer uses, so a
    // field is internal because of what it is, not because of which store it is
    // in. `record.hrAdvisorNotes` is named identically in both.
    const withheld = [];
    if (internal) withheld.push('record.hrAdvisorNotes');
    MEETING_WITHHELD_INTERNAL.forEach(k => {
      const v = m?.[k];
      const empty = v === undefined || v === null || v === ''
        || (Array.isArray(v) && v.length === 0)
        || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
      if (!empty && !withheld.includes(k)) withheld.push(k);
    });
    return {
      id: m?.id, meetingTypeId: m?.meetingTypeId ?? null, status: m?.status ?? null,
      subjectKind: m?.subjectKind ?? null, employeeId: m?.employeeId ?? null,
      caseId: m?.caseId ?? null,
      startedAt: m?.startedAt ?? null, endedAt: m?.endedAt ?? null,
      scheduledFor: m?.schedule?.date ?? null,
      record: employeeFacing || null,
      transcript: Array.isArray(m?.transcript) ? m.transcript : [],
      summary: m?.summary ?? null,
      withheldAsInternalAnalysis: withheld,
    };
  };
  const subjectStandaloneMeetings = ownedStandaloneMeetings.map(classifyMeetingForDisclosure);
  const onboarding = starterInstances.filter(s => s.name === employeeName);
  const offboarding = leaverInstances.filter(s => s.name === employeeName);
  // ── Phase E0.6 — canonical routes where one now exists ───────────────────
  //
  // wellbeing_notes and concern_referrals gained employee_id. Where the subject
  // is canonically identified, selection uses the id and a same-name row that has
  // NOT been attributed is NOT swept in — the same rule as cases. Where no
  // canonical id is known the historical name behaviour is unchanged, so a DSAR
  // for an unreconciled subject still returns what it always did.
  const canonicalOrLegacy = (rows, nameOf) => {
    if (!canonicalEmployeeId) return rows.filter(r => nameMatchesSubject(nameOf(r)));
    return rows.filter(r => r?.employeeId === canonicalEmployeeId);
  };
  // Same-name rows left unattributed. Metadata only, and reported rather than
  // silently dropped: the record exists, it simply has not been confirmed to be
  // this person's.
  const unattributedSameName = (rows, nameOf, describe) => (
    canonicalEmployeeId
      ? rows.filter(r => r && !r.employeeId && nameMatchesSubject(nameOf(r))).map(describe)
      : []
  );

  const subjectWellbeingNotes = canonicalOrLegacy(wellbeingNotes, n => n?.employeeName);
  const subjectConcernReferrals = canonicalOrLegacy(concernReferrals, r => r?.employeeName);
  const unattributedWellbeingNotes = unattributedSameName(
    wellbeingNotes, n => n?.employeeName,
    n => ({ id: n.id, type: n.type, date: n.date, employeeName: n.employeeName })
  );
  const unattributedConcernReferrals = unattributedSameName(
    concernReferrals, r => r?.employeeName,
    r => ({ id: r.id, concernType: r.concernType, status: r.status, createdAt: r.createdAt, employeeName: r.employeeName })
  );
  const subjectAllegations = allegations.filter(a => subjectCaseIds.has(a.caseId));

  // ── WAVE D4.3 — authoritative decision history ──────────────────────────
  //
  // Derived through the case, which is the authoritative parent — the same
  // boundary subjectCases already draws, so a decision on a case this subject
  // does not own cannot appear, and nor can one from another organisation.
  //
  // WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT DUPLICATE. The case
  // disclosure already carries the CURRENT position (outcome, outcomeIssuedAt,
  // warning duration and expiry, with outcomeNotes review-required). Repeating
  // the head here would make a subject read the same sanction twice and wonder
  // whether they were sanctioned twice. So this is the CHAIN: each decision
  // event, in order, with whether it has since been superseded.
  //
  // decided_by is NOT disclosed. It identifies an internal actor, and no
  // existing DSAR policy requires naming the decision-maker to the subject —
  // the same reasoning that keeps internal attribution out of the rest of this
  // compilation.
  //
  // Unknown provenance stays unknown: decidedAt is null on 135 of the 137
  // backfilled decisions and is reported as null, never inferred from
  // created_at or from the case.
  //
  // legacy_unmapped is presented as the string that was actually recorded, with
  // no interpretation. It is the subject's own record; reading it as one of the
  // six sanctions would be Compass deciding what their employer meant.
  const decisionsForSubject = (Array.isArray(caseDecisions) ? caseDecisions : [])
    .filter(d => d && subjectCaseIds.has(d.caseId));
  const supersededIds = new Set(decisionsForSubject.map(d => d.supersedesDecisionId).filter(Boolean));
  const subjectCaseDecisions = decisionsForSubject.map(d => ({
    caseId: d.caseId,
    decisionType: d.decisionType,
    outcome: d.outcome === 'legacy_unmapped' ? null : d.outcome,
    recordedAs: d.outcome === 'legacy_unmapped' ? (d.outcomeSourceText || null) : null,
    decidedAt: d.decidedAt || null,
    appealEffect: d.appealEffect || null,
    warningDurationMonths: d.warningDurationMonths || null,
    warningExpiresAt: d.warningExpiresAt || null,
    superseded: supersededIds.has(d.id),
    // Review-required, exactly as cases.outcomeNotes already is: this is HR's
    // own reasoning, and a decision row must not become a side door around the
    // human review that the case-level field requires.
    reasoningRequiresReview: !!d.outcomeNotes,
  }));
  // ── IR-REPORT-01b/B2 — superseded investigator narratives ─────────────────
  //
  // Decision A4: these ARE potentially disclosable personal data, the table is
  // NOT silently omitted, and yet every draft is NOT automatically disclosed.
  // Those three only reconcile one way, and it is the way this file already
  // handles HR's own reasoning (case_decisions.reasoningRequiresReview,
  // cases.outcomeNotes): emit the EXISTENCE and the metadata, flag the text for
  // the human review that reviewed_flagged_sections gates, and do not pour the
  // raw wording into the pack automatically.
  //
  // The superseded TEXT is still scanned for third-party mentions below —
  // scanning reads the raw input, so withholding the text from the output
  // costs nothing in third-party protection. An earlier draft that named a
  // colleague is flagged exactly as the current wording is.
  //
  // changed_by is withheld (an internal actor, as decided_by is on
  // case_decisions). actorKind IS disclosed: whether a person or a system
  // altered a record about the subject is the subject's own information, and it
  // is the whole point of recording it.
  const revisionsForSubject = (Array.isArray(findingRevisions) ? findingRevisions : [])
    .filter(r => r && subjectCaseIds.has(r.caseId));
  const subjectFindingRevisions = revisionsForSubject.map(r => ({
    caseId: r.caseId,
    allegationId: r.allegationId || null,
    field: r.field || null,
    changedAt: r.changedAt || null,
    // The authoritative order. changed_at alone cannot provide one, because
    // two edits in a single transaction share it — see the migration's §1.
    seq: r.seq ?? null,
    actorKind: r.actorKind || null,
    // What changed, without reproducing it: a reviewer can see that wording was
    // replaced, and whether there is anything to release, before deciding.
    supersededTextRequiresReview: !!(r.previousValue && String(r.previousValue).trim()),
    replacementTextRequiresReview: !!(r.newValue && String(r.newValue).trim()),
  }));

  // ── B3.4 — SAVED INVESTIGATION REPORT VERSIONS ───────────────────────────
  //
  // An investigation report is a document ABOUT the subject, so its saved
  // versions are their personal data. They are NOT all the same thing, and
  // flattening them would be the error: the current official document, one
  // that was official and has been replaced, and a draft that was never
  // adopted carry entirely different weight for a reviewer.
  //
  // The WORDING IS NOT REPRODUCED, in any state. That is not blanket
  // withholding — nothing here is dropped, every version is listed and
  // counted, and each one carries a flag saying there is text to decide about.
  // It is the treatment cases.investigationReport itself already gets
  // (CASE_REVIEW_REQUIRED, "often full of third-party statements, Compass does
  // not record whether it was shared, so it must not assume") and the
  // treatment B2 gave superseded investigator wording. Releasing a draft
  // automatically would disclose an account the investigator reconsidered
  // before it was ever official; withholding every draft by default would hide
  // the fact that it exists. Both remove the decision from the person
  // answerable for it, so the decision is surfaced instead.
  //
  // created_by/adopted_by are withheld as internal actors (as changed_by and
  // decided_by are). author_kind and adoption_basis ARE disclosed: whether a
  // person or a system wrote a document about the subject, and whether it
  // became official through the assigned investigator or an HR exception, is
  // provenance about them.
  //
  // adoption_reason is HR's own written justification for overriding the
  // normal rule. It is review-flagged rather than reproduced, exactly as
  // outcomeNotes is — the same judgement, for the same reason.
  const versionsForSubject = (Array.isArray(reportVersions) ? reportVersions : [])
    .filter(v => v && subjectCaseIds.has(v.caseId));
  const subjectReportVersions = versionsForSubject.map(v => ({
    caseId: v.caseId,
    versionNo: v.versionNo ?? null,
    state: classifyReportVersion(v),
    // 'generated' or 'edited' — whether a human rewrote it matters to a reader.
    source: v.source || null,
    createdAt: v.createdAt || null,
    authorKind: v.authorKind || null,
    adoptedAt: v.adoptedAt || null,
    adoptionBasis: v.adoptionBasis || null,
    supersededAt: v.supersededAt || null,
    bodyRequiresReview: !!(v.body && String(v.body).trim()),
    adoptionReasonRequiresReview: !!(v.adoptionReason && String(v.adoptionReason).trim()),
  }));

  const subjectCaseSignals = caseSignals.filter(s => subjectCaseIds.has(s.caseId));
  const subjectCaseTasks = caseTasks.filter(t => subjectCaseIds.has(t.caseId));
  // hr_review_requests isn't remapped to camelCase at load time
  // (App.jsx's loadHrReviews keeps the raw DB row shape) — case_id here,
  // not caseId, matching every other consumer of this state.
  // SECURITY FIX. record_snapshot is a copy of the generated meeting record and
  // carries the `## HR Advisor Notes` section. This path emitted it raw, which
  // re-leaked precisely what splitMeetingRecord exists to remove on the meeting
  // path. Now split: the employee-facing half is disclosed (it is about them),
  // the internal half is withheld and reported.
  const subjectHrReviewRequests = hrReviewRequests
    .filter(r => subjectCaseIds.has(r.case_id))
    .map(disclosableOwnHrReview)
    .filter(Boolean);
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

  // Phase 6.5 hardening (closes Prompt 16 audit finding H1's own DSAR/
  // export completeness gap, alongside giving redundancy cases a real DB
  // table at all) — atRiskEmployees is a jsonb array, not a queryable
  // column, so this is matched client-side the same way actedAsStaff
  // matches free-text manager columns above.
  // SECURITY FIX. A single name match inside atRiskEmployees previously emitted
  // the whole row: every pooled employee's name and selection scores, plus
  // aiAdvice. The subject's OWN entry is derived personal data about them and is
  // disclosed in full; the rest of the pool is not theirs.
  const subjectRedundancyCases = redundancyCases
    .filter(r => (r.atRiskEmployees||[]).some(e => e.name === employeeName))
    .map(r => disclosableRedundancyCase(r, { employeeName }))
    .filter(Boolean);

  // Records that name the subject as staff (manager / investigating
  // manager / disciplinary officer / HR reviewer) on someone ELSE's
  // case or record — the exact gap the audit's own framing names:
  // "misses the subject whenever they aren't the case subject."
  // Excludes the subject's own cases (already covered by subjectCases)
  // so a case never appears twice.
  // ── THE SUBJECT AS STAFF ON SOMEONE ELSE'S RECORD ────────────────────────
  //
  // SECURITY FIX. This previously emitted the matched rows almost verbatim —
  // `.map(({ evidence, ...meta }) => meta)` stripped only the file bytes, so
  // `meetings` survived with every unsplit record, transcript and advisor-notes
  // section, alongside the other employee's name, outcome, outcomeNotes and
  // investigationReport. It bypassed disclosableCase entirely, and a manager's
  // own DSAR returned the complete case files of everyone they had managed.
  //
  // The filter that FINDS these rows is correct and unchanged — being named as
  // the investigating manager on a case IS the subject's personal data, and
  // omitting it would be the opposite error. What changed is that finding a row
  // is no longer treated as a decision to disclose its contents. Each row is
  // projected by src/lib/dsarThirdPartyContainment.js: the subject's own
  // involvement is disclosed, the other person's record is withheld, and the
  // arguable fields are review-flagged rather than dropped.
  const staffRoleMatches = cases
    .filter(c => c.employeeName !== employeeName
      && (c.manager === employeeName || c.investigatingManager === employeeName || c.disciplinaryOfficer === employeeName))
    .map(c => ({
      row: c,
      rolesHeld: [
        c.manager === employeeName ? 'manager' : null,
        c.investigatingManager === employeeName ? 'investigatingManager' : null,
        c.disciplinaryOfficer === employeeName ? 'disciplinaryOfficer' : null,
      ].filter(Boolean),
    }));
  const staffRoleCases = staffRoleMatches
    .map(({ row, rolesHeld }) => disclosableStaffRoleCase(row, { rolesHeld }))
    .filter(Boolean);
  const staffRoleWellbeingNotes = wellbeingNotes
    .filter(n => n.employeeName !== employeeName && n.manager === employeeName)
    .map(disclosableStaffRoleWellbeingNote)
    .filter(Boolean);
  // hr_review_requests isn't remapped to camelCase — see the comment
  // on subjectHrReviewRequests above.
  const staffRoleHrReviews = hrReviewRequests
    .filter(r => !subjectCaseIds.has(r.case_id)
      && (r.requested_by_name === employeeName || r.reviewed_by_name === employeeName))
    .map(r => disclosableStaffRoleHrReview(r, { asReviewer: r.reviewed_by_name === employeeName }))
    .filter(Boolean);

  // Projected too. The first cut of this fix left these raw, reasoning that
  // employee_records.manager is "a single name field with no narrative
  // content" — but the ROW is the other employee's HRIS record. The module's
  // own adversarial test caught it.
  const staffRoleEmployeeRecords = employeeRecords
    .filter(r => r.name !== employeeName && r.manager === employeeName)
    .map(disclosableStaffRoleEmployeeRecord)
    .filter(Boolean);

  const actedAsStaff = {
    cases: staffRoleCases,
    employeeRecords: staffRoleEmployeeRecords,
    wellbeingNotes: staffRoleWellbeingNotes,
    hrReviewRequests: staffRoleHrReviews,
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

  // ── Phase E0 — the identity gate ──────────────────────────────────────────
  //
  // The detector above was inert in production, in BOTH of its conditions:
  //   * `matchingEmployeeRecords.length > 1` cannot fire at all, because
  //     employee_records enforces UNIQUE(org_id, name);
  //   * the email fallback cannot fire either, because 0 of 2,960 production
  //     cases carry an employee_email.
  // And it was advisory only — DsarScreen rendered the download button
  // unconditionally with the warning below it.
  //
  // So the one safeguard against handing one person's confidential history to
  // another was, in practice, unreachable. classifyIdentityByName is written to
  // work the moment two employees CAN share a name, and the export is now gated
  // on it rather than merely annotated.
  //
  // UNRECONCILED (no canonical employee at all) is reported but does NOT block:
  // 650 of 2,939 production subjects are name-only today, and refusing every one
  // of them would break DSAR for most of the customer base while reconciliation
  // is outstanding. AMBIGUOUS blocks, because that is the case where Compass
  // would be guessing between real people.
  const identityStatus = classifyIdentityByName(employeeRecords, employeeName, {
    emailEvidence: [...distinctCaseEmails],
  });
  // E0.5A — fails closed on BOTH unsafe states. AMBIGUOUS means Compass would be
  // guessing between real people; UNRECONCILED means it cannot establish which
  // canonical employee these name-matched records belong to at all. Neither is a
  // basis for disclosing somebody's employment history. Only RESOLVED exports.
  const identityRequiresReconciliation =
    identityStatus === IDENTITY.AMBIGUOUS || identityStatus === IDENTITY.UNRECONCILED;
  const canonicalEmployeeIds = matchingEmployeeRecords.map(r => r.id).filter(Boolean);

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

  // Standalone meetings get the identical third-party treatment — flagged for
  // human review, never auto-redacted. caseId is null here by definition, so the
  // location carries standalone:true rather than a case that does not exist;
  // a reviewer must be able to find the source of a flagged line.
  // The RAW owned meetings, deliberately — not the classified export.
  //
  // Two different jobs. Classification decides what is DISCLOSED; this scan finds
  // other people's names in the subject's content so a human can weigh a
  // third-party disclosure. Scanning the classified objects instead lost
  // `schedule`, and with it the date a reviewer needs to locate a flagged line —
  // and it would also have stopped scanning the internal section, where a third
  // party can be named just as easily.
  ownedStandaloneMeetings.forEach(m => {
    scanText(m.record, { standalone: true, meetingId: m.id, field: 'record', meetingType: m.meetingTypeId, date: m.schedule?.date || m.startedAt });
    scanText(m.summary, { standalone: true, meetingId: m.id, field: 'summary', meetingType: m.meetingTypeId, date: m.schedule?.date || m.startedAt });
    (m.transcript || []).forEach((u, i) => scanText(u.text, { standalone: true, meetingId: m.id, field: `transcript[${i}]`, meetingType: m.meetingTypeId, date: m.schedule?.date || m.startedAt }));
  });

  subjectWellbeingNotes.forEach(n => scanText(n.content, { field: 'wellbeingNote.content', wellbeingNoteId: n.id, date: n.date }));
  subjectConcernReferrals.forEach(r => {
    scanText(r.description, { field: 'concernReferral.description', concernReferralId: r.id });
    scanText(r.witnesses, { field: 'concernReferral.witnesses', concernReferralId: r.id });
    scanText(r.evidenceDescription, { field: 'concernReferral.evidenceDescription', concernReferralId: r.id });
  });
  subjectAllegations.forEach(a => {
    ALLEGATION_FREE_TEXT_FIELDS.forEach(field => {
      scanText(a[field], { field: `allegation.${field}`, caseId: a.caseId, allegationId: a.id });
    });
  });
  // EVIDENCE TEXT is scanned, which it previously was not. A witness statement
  // or pasted email held on the subject's own case is the most likely place a
  // third party's own account appears, and it was disclosed verbatim with no
  // scan at all. Scanning reads the raw input, so flagging costs nothing now
  // that the text itself is review-gated rather than auto-released.
  subjectCases.forEach(c => {
    (Array.isArray(c.evidence) ? c.evidence : []).forEach(ev => {
      if (!ev) return;
      scanText(ev.record, {
        field: 'evidence.record', caseId: c.id,
        evidenceId: ev.id ?? null, evidenceName: ev.name ?? null,
      });
    });
  });

  // SUPERSEDED narrative text is scanned on the same terms as the live text.
  // The three captured columns are already members of ALLEGATION_FREE_TEXT_FIELDS,
  // so a colleague named in a draft that was later rewritten is flagged for
  // human review exactly as a colleague named in the current wording is. Not
  // scanning this would mean a third party's data could be released from an old
  // draft precisely because it had been edited out of the live record.
  revisionsForSubject.forEach(r => {
    scanText(r.previousValue, {
      field: `findingRevision.${r.field}.superseded`,
      caseId: r.caseId, allegationId: r.allegationId || null, seq: r.seq ?? null,
    });
    scanText(r.newValue, {
      field: `findingRevision.${r.field}.replacement`,
      caseId: r.caseId, allegationId: r.allegationId || null, seq: r.seq ?? null,
    });
  });
  // B3.4 — every saved report body is scanned, in EVERY state, on the same
  // terms as the live report. An investigation report is the single most
  // third-party-dense document on a case: it quotes witnesses by name. A
  // colleague named in a draft the investigator later rewrote, or in a version
  // that was adopted and then superseded, must be flagged precisely because
  // that wording is no longer visible in the current document — which is the
  // same reasoning B2 applied to superseded narratives one block above.
  //
  // The state is carried into the field path so a reviewer can see WHICH
  // document a flagged mention came from, not merely that one exists.
  versionsForSubject.forEach(v => {
    const state = classifyReportVersion(v);
    scanText(v.body, {
      field: `reportVersion.${state}.body`,
      caseId: v.caseId, allegationId: null, versionNo: v.versionNo ?? null,
    });
    // HR's written reason for adopting under exception names people too.
    scanText(v.adoptionReason, {
      field: `reportVersion.${state}.adoptionReason`,
      caseId: v.caseId, allegationId: null, versionNo: v.versionNo ?? null,
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
  // Pre-V1 Trust Slice — projected per subject ROLE, not emitted raw.
  //
  // The filter is unchanged (the sender is still a legitimate subject of their
  // own sending), but the two roles no longer receive the same thing: a sender
  // gets the procedural facts, while the signer's document, signature, decline
  // reason and comments stay with the signer. See dsarSigningDisclosure.js.
  const subjectSigningRows = signingRequests.filter(s => s.employee_name === employeeName || s.manager_name === employeeName);
  const subjectSigningRequests = subjectSigningRows.map(s => disclosableSigningRequest(s, {
    // Signer wins when the same person is both, which is the safe direction:
    // they are entitled to everything in that row either way.
    subjectIsSigner: s.employee_name === employeeName,
  })).filter(Boolean);
  const signingDisclosure = summariseSigningDisclosure(subjectSigningRequests);
  const subjectPortalAccounts = portalAccounts.filter(p => p.employee_name === employeeName);
  // Scans the RAW rows deliberately: the scan's job is to notice other people
  // named in the document, and it must still do that for a row whose document
  // the projection above withholds from this subject.
  subjectSigningRows.forEach(s => scanText(s.document, { field: 'signingRequest.document', signId: s.sign_id }));
  subjectSigningRows.forEach(s => scanText(s.participant_comment, { field: 'signingRequest.participantComment', signId: s.sign_id }));

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
  // Phase 4C.1 — the mirror case: the subject named inside SOMEONE ELSE's
  // standalone meeting. Same rule as another person's case record: it is a
  // third-party disclosure decision for a human, not an automatic inclusion.
  // Everything NOT established above as the subject's own meeting. Defined as the
  // exact complement on purpose: this used to be `employeeName !== employeeName`,
  // and once ownership stopped being a name comparison, a witness interview that
  // happened to share the subject's name would have fallen out of BOTH sets and
  // disappeared from the response entirely.
  standaloneMeetings.filter(m => !isSubjectsOwnStandaloneMeeting(m)).forEach(m => {
    scanForSubjectAsThirdParty(m.record, { standalone: true, meetingId: m.id, field: 'record', meetingType: m.meetingTypeId, date: m.schedule?.date || m.startedAt });
    scanForSubjectAsThirdParty(m.summary, { standalone: true, meetingId: m.id, field: 'summary', meetingType: m.meetingTypeId, date: m.schedule?.date || m.startedAt });
    (m.transcript || []).forEach((u, i) => scanForSubjectAsThirdParty(u.text, { standalone: true, meetingId: m.id, field: `transcript[${i}]`, meetingType: m.meetingTypeId, date: m.schedule?.date || m.startedAt }));
  });

  const otherCaseIds = new Set(otherCases.map(c => c.id));
  allegations.filter(a => otherCaseIds.has(a.caseId)).forEach(a => {
    ALLEGATION_FREE_TEXT_FIELDS.forEach(field => {
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
  // ── WAVE 0 — an intentional disclosure projection, not `{ ...case }` ─────
  //
  // This line used to be a spread with evidence dataUrls removed, which meant the
  // downloaded package carried whatever the case object happened to hold —
  // including, for 378 of 890 historical meetings, the "## HR Advisor Notes"
  // section of the record, plus `prediction` (887), `riskScore` (52),
  // `unresolvedSuggestions` (321) and `reviewDraft`.
  //
  // Now every disclosed field is named. Anything unrecognised is withheld AND
  // reported, so the next internal field added to a case cannot appear in the next
  // DSAR download by default.
  const casesForExport = subjectCases.map(disclosableCase).filter(Boolean);
  const caseDisclosure = summariseCaseDisclosure(casesForExport);
  // Slice 2 — allegations now go through a per-field allow-list like cases and
  // meetings already did, rather than being emitted raw. See
  // dsarAllegationDisclosure.js for what moves and why.
  const disclosedAllegations = subjectAllegations.map(disclosableAllegation).filter(Boolean);
  const allegationDisclosure = summariseAllegationDisclosure(disclosedAllegations);

  return {
    employeeName,
    employeeRecord,
    possibleNameCollision,
    // Phase E0 — identity provenance travels WITH the compiled package, so a
    // reviewer can see on what basis these records were gathered.
    identityStatus,
    identityRequiresReconciliation,
    canonicalEmployeeIds,
    // ── Phase E0.5B provenance ────────────────────────────────────────────
    // On what basis were the CASES in this package selected? A package that
    // does not say whether it was assembled from a canonical identity or from
    // a display name cannot be audited later.
    caseIdentityBasis: canonicalEmployeeId ? "employee_id" : "employee_name",
    canonicalEmployeeId: canonicalEmployeeId || null,
    // ── Phase E0.6 — per-collection identity basis ────────────────────────
    // Superseding E0.5B's single flag. Three collections now have a canonical
    // route; the rest are still name-keyed because their tables have no employee
    // column. Stated per collection so the limitation is visible in the artefact
    // itself rather than known only to whoever wrote the compiler.
    identityBasisByCollection: {
      cases: canonicalEmployeeId ? "employee_id" : "employee_name",
      wellbeingNotes: canonicalEmployeeId ? "employee_id" : "employee_name",
      // Always employee_id, with no name alternative — see subjectActivities.
      employeeActivities: "employee_id",
      employeeActivityRecords: "employee_id",
      employmentEvents: "employee_id",
      concernReferrals: canonicalEmployeeId ? "employee_id" : "employee_name",
      // Derived through their case, which is the authoritative parent.
      allegations: "case_id", caseTasks: "case_id", caseSignals: "case_id", hrReviewRequests: "case_id",
      caseDecisions: "case_id", findingRevisions: "case_id", reportVersions: "case_id",
      // No employee column exists on these tables at all.
      onboarding: "employee_name", offboarding: "employee_name",
      signingRequests: "employee_name", portalAccounts: "employee_name",
      orgMembership: "employee_name", redundancyCases: "employee_name",
      // E2: canonical where the row is canonical. A legacy pre-E2 row still has
      // only a name, so the basis genuinely differs per row and the honest
      // summary says both.
      standaloneMeetings: canonicalEmployeeId ? "employee_id" : "employee_name",
    },
    // Kept for compatibility with readers written against E0.5B.
    nonCaseIdentityBasis: "employee_name",
    // Same-name rows in the newly-parented collections that have NOT been
    // attributed to this employee. Metadata only, and reported rather than
    // silently dropped — the record exists, it just is not confirmed as theirs.
    unattributedWellbeingNotes,
    unattributedConcernReferrals,
    // ── The standalone-meeting position after E2, stated rather than hidden ──
    //
    // E2 gave public.meetings a canonical employee_id, so a meeting held outside
    // a case IS now attributable — by id, never by name.
    //
    // Two things are still deliberately NOT claimed:
    //   * a PRE-E2 legacy row carries no id, so it is matched by name exactly as
    //     before and cannot be confirmed as this subject's;
    //   * a WITNESS INTERVIEW is never the witness's own record, however its
    //     employee_name reads. It belongs to the process. Where such a meeting
    //     names this subject it is reported through the third-party mentions
    //     above, for a human to decide, rather than bundled in as their own.
    standaloneMeetingsDisposition: {
      // The BASIS is now canonical where a canonical subject exists. This is the
      // part E2 fixed: attribution is by employee_id, and a witness interview is
      // never the witness's own record however its employee_name reads.
      basis: canonicalEmployeeId ? "employee_id" : "employee_name",
      canonicallyAttributable: !!canonicalEmployeeId,
      included: ownedStandaloneMeetings.length,
      // Supplied to the compiler but NOT this subject's own — a witness
      // interview, another employee's meeting, or an unreconciled legacy row.
      // Reported so exclusion is never mistaken for the records not existing.
      excludedCount: standaloneMeetings.length - ownedStandaloneMeetings.length,
      witnessInterviewsExcluded: standaloneMeetings.filter(
        m => m?.subjectKind === MEETING_SUBJECT_KIND.PROCESS_WITNESS
      ).length,
      legacyUnreconciled: standaloneMeetings.filter(
        m => m?.subjectKind === MEETING_SUBJECT_KIND.LEGACY
      ).length,
      // ── STILL TRUE, AND STILL THE HONEST HEADLINE ────────────────────────
      //
      // E2 gave public.meetings a canonical employee_id, so the compiler CAN
      // now attribute a meeting correctly. What it cannot do is attribute
      // meetings it was never given, and DsarScreen still does not pass them
      // (recorded at E0.6, unchanged here — wiring a new data source into the
      // DSAR package is its own decision, with its own authorisation question).
      //
      // So this flag means what it always meant: the package must not be
      // described as a complete meeting history.
      // TRUE whenever the package cannot be described as a complete meeting
      // history — nothing was supplied, or the read failed. A failed read is NOT
      // the same fact as "there were none", and a DSAR that conflated them would
      // certify completeness it does not have.
      excluded: standaloneMeetings.length === 0,
      readFailed: !!meetingFetchFailed,
      // What was fetched but deliberately not disclosed, per meeting. Reported so
      // the classification is visible to the person answering the request.
      internalAnalysisWithheld: subjectStandaloneMeetings
        .filter(m => m.withheldAsInternalAnalysis.length > 0)
        .map(m => ({ meetingId: m.id, withheld: m.withheldAsInternalAnalysis })),
      note: meetingFetchFailed
        ? "Compass could not read meetings held outside a case while compiling this package, so none are included and completeness cannot be confirmed for them. Re-compile before responding."
        : standaloneMeetings.length === 0
        ? "No meetings held outside a case were found for this organisation, so none are included. This package is complete for cases and case-owned records."
        : (canonicalEmployeeId
          ? "Meetings held outside a case are attributed by canonical employee reference, never by name. Interviews where this person attended as a witness belong to the process being investigated, not to this person's own record, and are reported under third-party mentions rather than included here. Meetings recorded before Phase E2 carry no canonical reference and are matched by name only."
          : "This subject has no canonical employee record, so meetings held outside a case are matched by name only and cannot be confirmed as theirs. This package may be incomplete for meetings held outside a case."),
    },
    // Same-name records deliberately EXCLUDED. Metadata only — these may
    // belong to somebody else, so no content is carried here. Reported so that
    // exclusion can never be mistaken for the records not existing.
    unreconciledSameNameCases,
    unreconciledSameNameCount: unreconciledSameNameCases.length,
    otherEmployeeSameNameCount,
    cases: casesForExport,
    // What was held back from the CASES above, what needs a human decision, and
    // what Compass did not recognise. Reported rather than silent: a redaction
    // nobody can see is a decision nobody made.
    caseDisclosure,
    // Phase 4C.1 — a top-level category, not folded into `cases`, because these
    // meetings genuinely have no case and presenting them under one would
    // misrepresent the record to both the subject and the reviewer.
    standaloneMeetings: subjectStandaloneMeetings,
    onboarding,
    offboarding,
    wellbeingNotes: subjectWellbeingNotes,
    employeeActivities: subjectActivities,
    employeeActivityRecords: subjectActivityRecords,
    employmentEvents: subjectEmploymentEvents,
    concernReferrals: subjectConcernReferrals,
    caseDecisions: subjectCaseDecisions,
    findingRevisions: subjectFindingRevisions,
    // IR-REPORT-01b/B2 — the same honesty the meeting disposition applies.
    // "No revisions were recorded" and "Compass could not read the revision
    // history" are different facts, and a package that conflated them would
    // certify a complete narrative history it does not have. Before the B2
    // migration is applied the table does not exist, which is reported as
    // not-yet-available rather than as an absence of rewrites.
    findingRevisionDisposition: {
      excluded: subjectFindingRevisions.length === 0,
      readFailed: !!findingRevisionFetchFailed,
      note: findingRevisionFetchFailed
        ? "Compass could not read the investigation revision history while compiling this package, so no superseded investigator wording is included and completeness cannot be confirmed for it. Re-compile before responding."
        : subjectFindingRevisions.length === 0
        ? "No investigator finding, outstanding uncertainty or witness evidence summary on this subject's cases has been rewritten since revision recording began, so there is no superseded wording to consider."
        : "Superseded investigator wording exists for this subject and is listed with the field, the issue, the order of the change and whether a person or a system made it. The wording ITSELF is not reproduced here: each entry is flagged for a disclosure decision, so a reviewer releases, redacts or withholds it deliberately. Earlier drafts were scanned for third-party mentions on the same terms as the live text.",
    },
    // ── COLLECTION COMPLETENESS, AS ONE ANSWERABLE FACT ──────────────────
    //
    // Each gateway already reports its own read failure, and each disposition
    // says so in prose. What did not exist was a single field a reader — or
    // the download button — could consult to answer "was everything actually
    // collected?". Three separate dispositions buried in a large JSON file is
    // not an answer anybody checks.
    //
    // It matters because of what sits downstream: responseStatus could read
    // `approved_for_release` on a package assembled while an entire category
    // failed to load. The attestation was about the FLAGGED SECTIONS a human
    // reviewed; it was never a statement that collection succeeded, and
    // nothing stopped the two being conflated at the point of export.
    //
    // Derived, not stored: it is computed from the same flags the dispositions
    // use, so the two cannot drift apart.
    collectionComplete: !meetingFetchFailed && !findingRevisionFetchFailed
      && !reportVersionFetchFailed
      && (Array.isArray(failedPortalCollections) ? failedPortalCollections.length === 0 : true),
    incompleteCollections: [
      ...(meetingFetchFailed ? ['meetings'] : []),
      ...(findingRevisionFetchFailed ? ['investigationFindingRevisions'] : []),
      ...(reportVersionFetchFailed ? ['investigationReportVersions'] : []),
      // The five collections only /api/portal/dsar-lookup can reach. Named
      // individually rather than as one "portal lookup" entry, because a
      // reviewer needs to know WHICH of the subject's records are missing —
      // "signing requests could not be read" and "case views could not be
      // read" are different facts with different weight, and the endpoint
      // can now fail for one while succeeding for the rest.
      ...(Array.isArray(failedPortalCollections) ? failedPortalCollections : []),
    ],
    reportVersions: subjectReportVersions,
    // B3.4 — the same honesty the meeting and revision dispositions apply, with
    // one addition they do not need: a COUNT PER STATE. "Three saved versions"
    // tells a reviewer nothing useful; "one current, one replaced, one never
    // adopted" tells them what decisions they are actually facing.
    reportVersionDisposition: {
      excluded: subjectReportVersions.length === 0,
      readFailed: !!reportVersionFetchFailed,
      counts: {
        currentAdopted: subjectReportVersions.filter(v => v.state === REPORT_VERSION_STATE.CURRENT_ADOPTED).length,
        historicallyAdopted: subjectReportVersions.filter(v => v.state === REPORT_VERSION_STATE.HISTORICALLY_ADOPTED).length,
        drafts: subjectReportVersions.filter(v => v.state === REPORT_VERSION_STATE.DRAFT).length,
        unexpected: subjectReportVersions.filter(v => v.state === REPORT_VERSION_STATE.UNEXPECTED).length,
      },
      note: reportVersionFetchFailed
        ? "Compass could not read the saved investigation report versions while compiling this package, so none are included and completeness cannot be confirmed for them. Re-compile before responding."
        : subjectReportVersions.length === 0
        ? "No investigation report on this subject's cases has been saved as a version. Any investigation report held on a case itself is listed with the case and is flagged there for a disclosure decision in the usual way."
        : "Saved investigation report versions exist for this subject. Each is listed with its version number, whether it is the current adopted report, a previously adopted report that has been replaced, or a draft that was never adopted, together with when it was saved, whether a person or a system authored it, and — where adopted — on what basis. The WORDING ITSELF is not reproduced in any state: each version is flagged so a reviewer releases, redacts or withholds it deliberately. A draft is not automatically exempt and is not automatically released. Every version's text, adopted or not, was scanned for third-party mentions on the same terms as the live report. The meetings, evidence and signature or dispute provenance a report refers to are disclosed in their own categories of this package, not restated here.",
    },
    allegations: disclosedAllegations,
    allegationDisclosure,
    caseSignals: subjectCaseSignals,
    caseTasks: subjectCaseTasks,
    hrReviewRequests: subjectHrReviewRequests,
    auditLog: subjectAuditLog,
    signingRequests: subjectSigningRequests,
    signingDisclosure,
    portalAccounts: subjectPortalAccounts,
    dsarRequests: subjectDsarRequests,
    orgMembership: subjectOrgMembership,
    profiles: subjectProfiles,
    caseViews: subjectCaseViews,
    portalInvites: subjectPortalInvites,
    caseAccessGrants: subjectCaseAccess,
    redundancyCases: subjectRedundancyCases,
    actedAsStaff,
    // Every containment decision the four projected sources made, in the shape
    // summariseCaseDisclosure already produces, so DsarScreen can merge it into
    // the one banner reviewers read.
    thirdPartyContainment: summariseThirdPartyContainment({
      staffRoleCases, staffRoleWellbeingNotes, staffRoleHrReviews, staffRoleEmployeeRecords,
      ownHrReviews: subjectHrReviewRequests,
      redundancyCases: subjectRedundancyCases,
    }),
    flaggedThirdPartyMentions: flagged,
    subjectMentionsInOrgNarratives,
    subjectMentionsAsThirdParty,
    evidenceRequiringReview,
    compiledAt: new Date().toISOString(),
  };
}
