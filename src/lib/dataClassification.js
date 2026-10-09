// NEW-44 (second pass) — what every live table IS, as machine-checkable data.
//
// WHY THIS EXISTS SEPARATELY FROM dataInventory.js. That module answers one
// question — "does Delete all data erase this table, and in what order?" — and
// the first NEW-44 pass made that question impossible to skip. It still cannot
// answer the three questions a reviewer actually asks when a new durable table
// lands:
//
//     is this customer data?        what does DSAR owe it?   what retains it?
//
// Those answers lived in prose comments. Prose is not a gate: a developer can
// add `public.case_decisions`, classify it as deleted, and ship it having said
// nothing about disclosure — and no test would notice.
//
// This is NOT a second inventory. dataInventory.js remains authoritative for
// deletion and for deletion ORDER; this module carries attributes keyed by the
// same table names, and src/test/dataClassification.test.js asserts the two are
// in exact 1:1 correspondence. Neither can grow a table the other lacks.
//
// ┌─ CLASSIFICATION IS NOT ENFORCEMENT ─────────────────────────────────────┐
// │ A `dsar` value says what Compass OWES, not what it currently DOES, and    │
// │ the two differ today — which is why `included_not_wired` exists as a      │
// │ distinct value rather than being rounded to either neighbour. Marking a   │
// │ table `included` when no code reads it would be a lie in the one place a  │
// │ reviewer would trust; marking it `internal_withheld` would endorse the    │
// │ gap as a decision. Every `included_not_wired` entry must name its defect, │
// │ and a test enforces that.                                                 │
// └─────────────────────────────────────────────────────────────────────────┘

export const DATA_CLASS = Object.freeze({
  // Rows that exist because a customer put them there, or that describe their
  // people. The only class "Delete all data" is about.
  CUSTOMER: 'customer',
  // The tenant/account/platform layer: who the organisation is, who may sign
  // in, who operates Compass. A tenant action must not erase these.
  PLATFORM: 'platform',
  // Operational machinery with no HR content.
  INFRASTRUCTURE: 'infrastructure',
});

// What a subject access request owes this table. Deliberately five values: the
// fifth records an obligation Compass accepts and has not yet implemented.
export const DSAR_DISPOSITION = Object.freeze({
  INCLUDED: 'included',                         // read by the DSAR compiler today
  INCLUDED_NOT_WIRED: 'included_not_wired',     // owed, NOT yet read — must cite a defect
  INTERNAL_WITHHELD: 'internal_withheld',       // held, deliberately not disclosed
  NOT_PERSONAL_DATA: 'not_personal_data',       // reference/config, no data subject
  NOT_APPLICABLE: 'not_applicable',             // empty fossil, or outside the employee relationship
});

// ┌─ RETENTION, STATED HONESTLY ────────────────────────────────────────────┐
// │ There is exactly ONE truthful retention value for every table in this    │
// │ schema, and it is "not enforced".                                        │
// │                                                                          │
// │ organisations.data_retention_years is stored and editable in Settings     │
// │ (src/App.jsx:3092) and NO code anywhere reads it to delete anything —     │
// │ there is no retention sweep in src/ or api/. A configurable retention     │
// │ period that deletes nothing is worse than none, because it reads as a     │
// │ control. That is filed separately (NEW-46) and is E3 work.                │
// │                                                                          │
// │ So this field exists to make the absence VISIBLE and to stop a future     │
// │ entry quietly claiming a rule that nothing implements. A test asserts no  │
// │ entry claims enforcement while no sweep exists.                           │
// └─────────────────────────────────────────────────────────────────────────┘
export const RETENTION = Object.freeze({
  NOT_ENFORCED: 'not_enforced',
});

export const RETENTION_ENFORCEMENT_IMPLEMENTED = false;

// ┌─ SECURITY POSTURE ──────────────────────────────────────────────────────┐
// │ RLS is enabled on 43/43 live tables. TEN of them have RLS enabled with   │
// │ ZERO POLICIES, which denies every client outright and leaves the table    │
// │ reachable only through the service-role key or a SECURITY DEFINER         │
// │ function. That is frequently the CORRECT posture — it is strictly tighter │
// │ than any policy — but "no policies" and "we forgot to write policies"     │
// │ are indistinguishable by inspection.                                     │
// │                                                                          │
// │ Six were documented as deliberate in baseline_schema_2026-08-06.sql.      │
// │ FOUR were not: customer_contracts, team_invites, platform_admins and      │
// │ graph_mail_connections. Their posture is safe; the DECISION was unstated, │
// │ which is NEW-44's own failure pattern one layer down.                    │
// │                                                                          │
// │ So posture is now declared, and a zero-policy table with no declaration   │
// │ fails CI. NO CLIENT POLICY WAS ADDED to satisfy any test — that would     │
// │ broaden access to satisfy a gate, which is backwards.                     │
// └─────────────────────────────────────────────────────────────────────────┘
export const SECURITY_POSTURE = Object.freeze({
  // Reachable by clients under RLS policies.
  POLICIES: 'rls_policies',
  // RLS enabled, zero policies: all client access denied. Reached only via the
  // service-role key or a SECURITY DEFINER function. Requires a reason.
  SERVICE_ROLE_ONLY: 'service_role_only',
});

// An independent live reading of RLS state (pg_class.relrowsecurity and
// pg_policies), taken 2026-10-03. Recorded so the posture test has something to
// check that is not the declaration itself; re-verified against the live
// database by scripts/schema-drift-check.mjs, which is the half that notices
// RLS being switched off or a policy being dropped.
// ┌─ TABLES THIS REPOSITORY DECLARES BUT PRODUCTION DOES NOT YET HAVE ──────┐
// │ The single source of truth for "proposed, not deployed". Every gate that │
// │ would otherwise assert a production fact about one of these names reads   │
// │ this list instead, so the pending state cannot be lost in a comment.     │
// │                                                                          │
// │ A name here means: the migration corpus creates the table, the           │
// │ classification and RLS entries below describe the posture MEASURED on an  │
// │ isolated Supabase branch with the migration applied, and NO reading has   │
// │ been taken against production. On deployment, re-read pg_class and        │
// │ pg_policies against production, confirm the entries below match, and      │
// │ remove the name from this list. If a slice is abandoned, delete the name  │
// │ together with its migration file and its entries below.                   │
// └─────────────────────────────────────────────────────────────────────────┘
export const PENDING_PRODUCTION_SCHEMA = Object.freeze([
  // B3.1 — supabase/investigation_report_versions_2026-10-09.sql.
  // Posture below ({ rls: true, policies: 2 }) was measured on branch
  // cjijgutnwpqovyjzdvrq, not on production. Remove this entry once the
  // migration is applied and the live posture is confirmed.
  'investigation_report_versions',
]);

// The live RLS reading. Every entry EXCEPT those named in
// PENDING_PRODUCTION_SCHEMA above was read from production on 2026-10-03.
export const RECORDED_RLS_2026_10_03 = Object.freeze({
  allegations: { rls: true, policies: 1 },
  api_rate_limits: { rls: true, policies: 0 },
  audit_log: { rls: true, policies: 1 },
  calendar_connections: { rls: true, policies: 0 },
  calendar_synced_events: { rls: true, policies: 0 },
  case_access: { rls: true, policies: 5 },
  case_decisions: { rls: true, policies: 2 },

  case_signals: { rls: true, policies: 1 },
  case_tasks: { rls: true, policies: 1 },
  case_themes: { rls: true, policies: 1 },
  case_views: { rls: true, policies: 3 },
  cases: { rls: true, policies: 7 },
  concern_referrals: { rls: true, policies: 4 },
  customer_contracts: { rls: true, policies: 0 },
  dsar_requests: { rls: true, policies: 1 },
  employee_activities: { rls: true, policies: 3 },
  employee_activity_records: { rls: true, policies: 3 },
  employee_employment_events: { rls: true, policies: 3 },
  employee_portal_accounts: { rls: true, policies: 0 },
  employee_portal_invites: { rls: true, policies: 0 },
  employee_records: { rls: true, policies: 4 },
  er_executive_briefs: { rls: true, policies: 2 },
  graph_mail_connections: { rls: true, policies: 0 },
  hr_review_requests: { rls: true, policies: 3 },
  improvement_initiatives: { rls: true, policies: 4 },
  integration_events: { rls: true, policies: 1 },
  // IR-REPORT-01b/B2. Two policies: one SELECT (HR or the case's CURRENT
  // investigator) and one RESTRICTIVE INSERT `with check (false)`. There is
  // deliberately no UPDATE or DELETE policy at all — that absence is half of
  // append-only, and investigation_finding_revisions_append_only_trg is the
  // other half (a policy denial is invisible; the trigger is loud, and is the
  // only thing in front of a caller that bypasses RLS).
  investigation_finding_revisions: { rls: true, policies: 2 },
  // B3.1 — one PERMISSIVE SELECT (HR or the case's current investigator) and
  // one PERMISSIVE INSERT gated on the same population. There is deliberately
  // no UPDATE or DELETE policy: the only mutation path is
  // adopt_investigation_report_version(), which is SECURITY DEFINER, and
  // investigation_report_versions_immutability_trg refuses everything else.
  investigation_report_versions: { rls: true, policies: 2 },
  leaver_instances: { rls: true, policies: 4 },
  locations: { rls: true, policies: 4 },
  manager_capability_insights: { rls: true, policies: 1 },
  meetings: { rls: true, policies: 6 },
  meetings_legacy_unused: { rls: true, policies: 1 },
  org_events: { rls: true, policies: 4 },
  org_members: { rls: true, policies: 3 },
  org_roles: { rls: true, policies: 4 },
  organisation_themes: { rls: true, policies: 3 },
  organisations: { rls: true, policies: 3 },
  platform_admins: { rls: true, policies: 0 },
  process_templates: { rls: true, policies: 4 },
  profiles: { rls: true, policies: 1 },
  redundancy_cases: { rls: true, policies: 1 },
  signing_requests: { rls: true, policies: 0 },
  starter_instances: { rls: true, policies: 4 },
  team_invites: { rls: true, policies: 0 },
  wellbeing_notes: { rls: true, policies: 1 },
});

const t = (purpose, dataClass, flags, dsar, extra = {}) => ({
  purpose, dataClass, dsar, retention: RETENTION.NOT_ENFORCED,
  orgScoped: !!flags.org, personRelated: !!flags.person, caseRelated: !!flags.case_,
  ...extra,
});

const C = DATA_CLASS.CUSTOMER, P = DATA_CLASS.PLATFORM, I = DATA_CLASS.INFRASTRUCTURE;
const D = DSAR_DISPOSITION;

// All 43 live public base tables (verified against pg_class 2026-10-03).
// `exclusionReason` is REQUIRED for any table Delete all data does not erase.
export const TABLE_CLASSIFICATION = {
  // ── case and employee content: actively erased ──
  cases: t('The formal HR process record.', C, { org: 1, person: 1, case_: 1 }, D.INCLUDED),
  meetings: t('Standalone meeting store — transcripts, prep packs, records.', C, { org: 1, person: 1, case_: 1 }, D.INCLUDED),
  starter_instances: t('Onboarding process instances.', C, { org: 1, person: 1 }, D.INCLUDED),
  dsar_requests: t('Subject access requests, themselves personal data.', C, { org: 1, person: 1 }, D.INCLUDED),
  hr_review_requests: t('HR sign-off requests on a case decision.', C, { org: 1, person: 1, case_: 1 }, D.INCLUDED),
  wellbeing_notes: t('Wellbeing notes about an employee.', C, { org: 1, person: 1 }, D.INCLUDED),
  concern_referrals: t('Concerns raised about or by an employee.', C, { org: 1, person: 1, case_: 1 }, D.INCLUDED),
  leaver_instances: t('Offboarding process instances.', C, { org: 1, person: 1 }, D.INCLUDED),
  case_tasks: t('Case and org-level actions; case_id is nullable.', C, { org: 1, case_: 1 }, D.INCLUDED),
  signing_requests: t('Signature/acknowledgement requests — the immutable issued document, the signature, the participant\'s own comments, and any decision to proceed without confirmation.', C,
    { org: 1, person: 1, case_: 1 }, D.INCLUDED,
    { dsarNote: 'PRE-V1 TRUST SLICE — rows are now projected per subject ROLE '
        + '(dsarSigningDisclosure.js) instead of being emitted raw. A row reaches a '
        + 'DSAR when the subject is either the signer (employee_name) or the sender '
        + '(manager_name), and those two are entitled to different things. The SIGNER '
        + 'receives the issued document, their own signature, their own decline reason '
        + 'and their own participant_comment. The SENDER receives the procedural facts '
        + 'only — that they sent it, when, and what happened — because the signer\'s '
        + 'document, handwriting and words are the other person\'s personal data. That '
        + 'was a real pre-existing leak: the manager-matched branch previously '
        + 'disclosed document, signature and decline_reason into a DSAR about the '
        + 'MANAGER, and a test asserted it. proceeded_at and proceeded_from_status are '
        + 'disclosed to both (a procedural fact about the subject\'s own process); '
        + 'proceed_reason is review-required, as HR reasoning is everywhere else; '
        + 'proceeded_by is withheld as an internal actor id, the same reasoning that '
        + 'already suppresses case_decisions.decided_by, and it is not even fetched by '
        + 'api/portal/_dsar-lookup.js. An unrecognised column is withheld AND '
        + 'reported, so a future column cannot be disclosed by default.' }),
  employee_records: t('The core PII record: job title, department, manager, employee number.', C, { org: 1, person: 1 }, D.INCLUDED),
  employee_portal_accounts: t("An employee's own access to their case data.", C, { org: 1, person: 1 }, D.INCLUDED),
  employee_portal_invites: t('Pending employee portal invitations.', C, { org: 1, person: 1 }, D.INCLUDED),
  case_views: t('Who viewed which case, and when.', C, { org: 1, person: 1, case_: 1 }, D.INCLUDED),
  improvement_initiatives: t('Performance/improvement initiatives.', C, { org: 1, person: 1 }, D.INCLUDED),
  manager_capability_insights: t('AI-derived manager capability analysis.', C, { org: 1, person: 1 }, D.INCLUDED),
  er_executive_briefs: t('AI-generated organisation-level ER briefings.', C, { org: 1 }, D.INTERNAL_WITHHELD,
    { dsarNote: 'Org-level aggregate analysis, not a record about one subject; not read by the DSAR compiler.' }),
  org_events: t('Organisational intelligence event log.', C, { org: 1, person: 1 }, D.INCLUDED),
  integration_events: t('Inbound/outbound integration activity log.', C, { org: 1 }, D.INTERNAL_WITHHELD,
    { dsarNote: 'Integration plumbing log; no subject narrative. Not read by the DSAR compiler.' }),
  organisation_themes: t('AI-derived org-wide theme taxonomy.', C, { org: 1 }, D.INCLUDED),
  employee_activities: t('Employee activity records (Phase E1.6).', C, { org: 1, person: 1 }, D.INCLUDED),
  employee_activity_records: t('Chronology entries under an employee activity.', C, { org: 1, person: 1 }, D.INCLUDED),
  employee_employment_events: t('Employment event history (Phase E1.7).', C, { org: 1, person: 1 }, D.INCLUDED),
  redundancy_cases: t('Redundancy process records.', C, { org: 1, person: 1, case_: 1 }, D.INCLUDED),

  // ── erased for free by a NOT NULL / CASCADE FK to `cases` ──
  allegations: t('Allegations under a case, with the investigation conclusion, disciplinary finding and appeal outcome.', C,
    { org: 1, person: 1, case_: 1 }, D.INCLUDED,
    { dsarNote: 'WAVE SLICE 2 — allegations now pass through a per-field allow-list '
        + '(dsarAllegationDisclosure.js) instead of being emitted as raw rows. Before '
        + 'that they were the only dsar:included source with no projection at all, so '
        + 'every column reached the download, including the internal auth.users ids in '
        + 'created_by, decided_by and appeal_decided_by. Now: the structured '
        + 'investigation_conclusion and its timestamp are disclosed (a procedural fact '
        + 'about the subject\'s own case); investigator_finding, outstanding_uncertainty '
        + 'and investigation_conclusion_reasoning are review-required, surfaced to the '
        + 'human reviewer with a reason, exactly as cases.outcome_notes already is; all '
        + 'four provenance id columns including investigation_conclusion_by are withheld '
        + 'as internal, the same reasoning that already suppresses '
        + 'case_decisions.decided_by; and an unrecognised column is withheld AND '
        + 'reported, so a future column cannot be disclosed by default. KNOWN '
        + 'ASYMMETRY, deliberately unchanged here: decision_reasoning — the '
        + 'disciplinary reasoning — is still auto-disclosed verbatim, while the same '
        + 'category of content is review-required at case level and suppressed on '
        + 'case_decisions. That is the disciplinary side of the allegation and belongs '
        + 'with the Slice 3 migration; it is reported as a finding, not fixed here.' }),
  case_signals: t('Risk/guardrail signals derived for a case.', C, { org: 1, case_: 1 }, D.INCLUDED),
  case_themes: t('Links a case to an organisation theme.', C, { org: 1, case_: 1 }, D.INTERNAL_WITHHELD,
    { dsarNote: 'The join between a case and the org taxonomy. organisation_themes IS disclosed; this link table is not read by the DSAR compiler. Flagged for review, not silently dropped.' }),
  case_access: t('Explicit per-user grants of access to a case.', C, { org: 1, case_: 1 }, D.INCLUDED),
  case_decisions: t('Authoritative decision-history events for a case (Wave D4.2/D4.3).', C,
    { org: 1, person: 1, case_: 1 }, D.INCLUDED,
    { dsarNote: 'WAVE D4.3 — flipped from included_not_wired to included only once '
        + 'compileSubjectData genuinely compiled it. Disclosed as the decision CHAIN, not a '
        + 'second copy of the current position: the case disclosure already carries the head. '
        + 'decided_by is withheld (an internal actor, as elsewhere in this compilation), '
        + 'outcome_notes is review-required exactly as cases.outcomeNotes already is, unknown '
        + 'decided_at stays null rather than being inferred, and a legacy_unmapped row is shown '
        + 'as the string actually recorded with no reinterpretation.' }),

  investigation_finding_revisions: t(
    'Append-only history of superseded investigator narratives on allegations '
    + '(investigator_finding, outstanding_uncertainty, witness_evidence): the previous and '
    + 'replacing wording, who changed it and when.', C,
    { org: 1, person: 1, case_: 1 }, D.INCLUDED,
    { dsarNote: 'IR-REPORT-01b/B2, decision A4 — superseded investigator narratives are '
        + 'POTENTIALLY DISCLOSABLE personal data, not internal working material to be withheld '
        + 'wholesale and not a table to omit silently. Wired into compileSubjectData, so '
        + 'included is truthful rather than aspirational (the standard this file set for '
        + 'case_decisions). Three constraints the wiring honours. (1) It is NOT an automatic '
        + 'disclosure of every draft: the compiled pack is the input to the documented human '
        + 'review, which reviewed_flagged_sections in supabase/dsar_2026-07-24.sql gates before '
        + 'any response goes out. (2) Superseded text is scanned for THIRD-PARTY mentions on the '
        + 'same terms as the live text — the three captured columns are already in '
        + 'ALLEGATION_FREE_TEXT_FIELDS, so an earlier draft naming a colleague is flagged for '
        + 'review exactly as the current wording is, never auto-redacted. (3) changed_by is '
        + 'withheld as an internal actor, consistent with decided_by on case_decisions; '
        + 'actor_kind IS disclosed, because whether a person or a system changed a record about '
        + 'the subject is the subject\'s own information. RETENTION IS THE OPEN QUESTION: this '
        + 'is a NEW category of retained personal data and nothing purges it (decision A3 '
        + 'forbids inventing a period); it is destroyed only with its case.' }),

  investigation_report_versions: t(
    'Immutable saved versions of the investigation report: the report body, who saved it and '
    + 'when, and for adopted versions who adopted it, on what basis and — for an HR exception — '
    + 'the written reason.', C,
    { org: 1, person: 1, case_: 1 }, D.INCLUDED_NOT_WIRED,
    { dsarDefect: 'B3.4',
      dsarNote: 'B3.1 — the investigation report is a document ABOUT the subject, so superseded '
        + 'and adopted versions are disclosable personal data on the same footing as the report '
        + 'already held in cases.investigation_report. Marked INCLUDED because the adopted '
        + 'current version is already disclosed today through that column; what this table adds '
        + 'is the superseded ones. INCLUDED_NOT_WIRED rather than INCLUDED, deliberately: B3.1 '
        + 'creates the store and nothing reads it yet, and the B2 review established that a '
        + 'manifest entry is not an integration — claiming INCLUDED here would record a '
        + 'disclosure obligation that no code performs. It flips to INCLUDED in B3.4, when '
        + 'compileSubjectData actually reads it. Three things that wiring must honour. '
        + '(1) NOT automatic release of '
        + 'every draft: superseded wording is listed with its version, author and date and '
        + 'flagged for a human disclosure decision, exactly as investigation_finding_revisions '
        + 'handles superseded narratives — a draft the investigating officer rejected is not a '
        + 'finding. (2) adoption_reason is an HR note about process, not about the subject, and '
        + 'is review-gated rather than released wholesale. (3) Superseded text is still SCANNED '
        + 'for third-party mentions, because a colleague named in a draft that was later '
        + 'rewritten must be flagged on the same terms as one named in the adopted text. '
        + 'RETENTION IS THE OPEN QUESTION, as for superseded narratives: superseded drafts are '
        + 'restricted case records, nothing purges them, the schedule is an outstanding '
        + 'governance dependency, and they are destroyed only with their case or organisation.' }),

  // ── audit ──
  audit_log: t('Immutable action log; the deletion event itself survives as one row.', C, { org: 1, person: 1, case_: 1 }, D.INCLUDED),

  // ── deliberately NOT erased: account / org structure and integration config ──
  org_members: t('Who belongs to the organisation and with what role.', P, { org: 1, person: 1 }, D.INCLUDED,
    { exclusionReason: 'Team membership. "Delete all data" has never claimed to dissolve the HR team; removing teammates is a separate, larger action.' }),
  org_roles: t('Role definitions available in the organisation.', P, { org: 1 }, D.NOT_PERSONAL_DATA,
    { exclusionReason: 'Role configuration, not case or employee content.' }),
  locations: t('Sites/locations used for employee and case scoping.', P, { org: 1 }, D.NOT_PERSONAL_DATA,
    { exclusionReason: 'Reference data. Also RESTRICT-referenced by four tables, so deleting it is a structural change, not an erasure.' }),
  process_templates: t('Customer-authored process recipes.', P, { org: 1 }, D.NOT_PERSONAL_DATA,
    { exclusionReason: 'Configuration the customer authored; not a record about a person.' }),
  calendar_connections: t('Google/Outlook calendar integration config and tokens.', P, { org: 1 }, D.INTERNAL_WITHHELD,
    { exclusionReason: 'Disconnecting an integration is a different action from erasing case data.',
      dsarNote: 'HR-staff integration credentials, not employee-subject data.' }),
  graph_mail_connections: t('Microsoft Graph mail integration config.', P, { org: 1 }, D.INTERNAL_WITHHELD,
    { exclusionReason: 'As calendar_connections — integration config, not case content.',
      dsarNote: 'HR-staff integration credentials, not employee-subject data.' }),
  customer_contracts: t("Compass's own commercial record of this customer.", P, { org: 1 }, D.NOT_APPLICABLE,
    { exclusionReason: 'An HR Director must not be able to erase their employer\'s signed-contract record from Settings. CASCADEs from organisations, so it goes when the organisation genuinely goes.',
      dsarNote: 'primary_contact_name/email is a commercial contact at the controller, not an employee data subject. See NEW-45.' }),
  team_invites: t('Pending teammate invitations: name, email, intended role.', P, { org: 1, person: 1 }, D.INCLUDED_NOT_WIRED,
    { exclusionReason: 'The org_members pipeline, and org_members is excluded — deleting pending invites would be the inconsistent choice.',
      dsarDefect: 'NEW-45',
      dsarNote: 'Holds a named person\'s name and email; org_members and employee_portal_invites ARE read by api/portal/_dsar-lookup.js and this is not. Owed, not yet wired.' }),

  // ── platform layer: no org_id, never touched by a tenant action ──
  organisations: t('The tenant row itself; its primary key IS the org id.', P, { person: 0 }, D.NOT_PERSONAL_DATA,
    { exclusionReason: 'Deleting the organisation is the real "delete the organisation" lever and a far bigger action than this button. Most org-scoped tables CASCADE from it.' }),
  profiles: t("A signed-in user's own account identity (name, role, company).", P, { person: 1 }, D.INCLUDED,
    { exclusionReason: 'Keyed to auth.users, not to an org. Erasing it would strip the acting HR Director\'s own identity while they remain an org_member.' }),
  platform_admins: t('Compass operator grants (granted/revoked by, when).', P, {}, D.NOT_APPLICABLE,
    { exclusionReason: 'A tenant-triggered write here would be a privilege-boundary change, which platform-admin isolation forbids.' }),

  // ── infrastructure ──
  api_rate_limits: t('Rate-limit counters, reachable only via check_rate_limit.', I, {}, D.INTERNAL_WITHHELD,
    { exclusionReason: 'No org dimension to scope a delete to; operational counters, no HR content.',
      dsarNote: 'rate_key embeds an auth user id (chat:${caller.id}) and rows never expire — a retention question, filed as NEW-46, not an erasure gap.' }),
  calendar_synced_events: t('Maps a Compass deadline to an external calendar event id.', I, {}, D.NOT_PERSONAL_DATA,
    { exclusionReason: 'connection_id NOT NULL CASCADE to calendar_connections, which is itself excluded — its lifecycle correctly follows that parent.' }),
  meetings_legacy_unused: t('Pre-4C.1 meeting store, renamed away. Must stay empty.', I, {}, D.NOT_APPLICABLE,
    { exclusionReason: 'A fossil holding 0 rows. It has case-content columns, no org_id and a NULLABLE cascade, so it could not be erased per-org if it ever filled — which is why scripts/schema-drift-check.mjs fails if its row count is not zero.' }),
};

// ── The declared service-role-only exceptions, each with its reason ────────
//
// A table named here asserts: RLS enabled, NO client policies, all access via
// the service-role key or a SECURITY DEFINER function, DELIBERATELY. The reason
// is required — the map's values ARE the declaration, so an entry cannot exist
// without one.
//
// The first six were already documented as intentional in
// baseline_schema_2026-08-06.sql; that prose is now machine-checkable. The last
// four are the undocumented ones NEW-44's audit found. Their posture is
// unchanged — only the record of the decision is new.
export const SERVICE_ROLE_ONLY_TABLES = Object.freeze({
  api_rate_limits:
    'Touched only by the SECURITY DEFINER check_rate_limit function, which bypasses RLS as its owner. '
    + 'Zero policies blocks any direct client read/write even if someone learns the table name.',
  calendar_connections:
    'Holds OAuth tokens for a tenant calendar integration. All reads/writes go through api/calendar/* '
    + 'with the service-role key; a client must never be able to read a refresh token.',
  calendar_synced_events:
    'Written only by api/calendar/_sync.js. No client has any reason to read the deadline-to-event map, '
    + 'and its parent calendar_connections is itself client-denied.',
  employee_portal_accounts:
    'An employee portal identity. Reached only via api/portal/*, which authenticates the employee '
    + 'separately from the HR user session — an org member must not read portal credentials directly.',
  employee_portal_invites:
    'Carries an invitation token hash. Same boundary as employee_portal_accounts: api/portal/* only.',
  signing_requests:
    'Holds signature material and the document text sent for signature. api/signing.js owns every '
    + 'transition; a client-side policy would expose a signing surface that the token flow controls.',
  // ── NEW-44 governance closure: the four the audit found undeclared ──
  graph_mail_connections:
    'Microsoft Graph mail integration tokens. Identical boundary to calendar_connections — service-role '
    + 'only, because a client-readable policy would expose a mail refresh token.',
  customer_contracts:
    'Compass\'s own commercial record OF the customer. No tenant user — including an HR Director — has '
    + 'any product reason to read or write their own contract row, so no policy is the correct posture '
    + 'rather than a missing one.',
  team_invites:
    'Carries an invitation token_hash. Invites are created and accepted through api/team/* with the '
    + 'service-role key; a client-readable policy would expose a token that grants organisation access.',
  platform_admins:
    'Compass operator grants. Client-denied BY DESIGN and load-bearing for platform-admin isolation: '
    + 'membership is read only through SECURITY DEFINER helpers, never by a tenant query, so no tenant '
    + 'can enumerate or infer who operates the platform.',
});

export function postureFor(table) {
  const name = String(table || '').toLowerCase();
  return SERVICE_ROLE_ONLY_TABLES[name]
    ? SECURITY_POSTURE.SERVICE_ROLE_ONLY
    : SECURITY_POSTURE.POLICIES;
}

export function serviceRoleReasonFor(table) {
  return SERVICE_ROLE_ONLY_TABLES[String(table || '').toLowerCase()] || null;
}

export function classificationFor(table) {
  const meta = TABLE_CLASSIFICATION[String(table || '').toLowerCase()];
  if (!meta) return null;
  return { ...meta, securityPosture: postureFor(table), serviceRoleReason: serviceRoleReasonFor(table) };
}

export function classifiedTableNames() {
  return Object.keys(TABLE_CLASSIFICATION).sort();
}

export function tablesWithDataClass(dataClass) {
  return Object.entries(TABLE_CLASSIFICATION)
    .filter(([, meta]) => meta.dataClass === dataClass)
    .map(([name]) => name).sort();
}

// Every DSAR obligation Compass has accepted and not yet implemented. Returned
// as data so it appears in a test failure rather than only in a register.
export function unwiredDsarObligations() {
  return Object.entries(TABLE_CLASSIFICATION)
    .filter(([, meta]) => meta.dsar === DSAR_DISPOSITION.INCLUDED_NOT_WIRED)
    .map(([name, meta]) => ({ table: name, defect: meta.dsarDefect || null }));
}
