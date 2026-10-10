import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  buildReportWorkspace, describeReportState, REPORT_LIFECYCLE,
} from '../lib/investigationReportWorkspace.js';
import { InvestigationReportTab } from '../components/caseTabs/InvestigationReportTab.jsx';
import { fetchCaseReportVersions, REPORT_VERSION_GATEWAY_FAILURE } from '../lib/reportVersionGateway.js';
import { caseWorkspaceDestinations, destinationForLegacyTab, hasInvestigationSignal } from '../lib/caseWorkspace.js';

// ═══════════════════════════════════════════════════════════════════════════
// B3.2-0 — THE READ-ONLY INVESTIGATION REPORT WORKSPACE.
//
// The single property worth defending in this slice: the workspace never
// states something the record does not say. Every section can be empty, and
// an empty section has to read as an absence that was checked — not as a gap,
// not as a default, and never as a conclusion nobody reached.
//
// The three shapes that would be easiest to get wrong, and are therefore
// tested hardest: an investigation with no named subject, an investigation
// completed by document review with no interview, and a legacy report with no
// version history behind it.
// ═══════════════════════════════════════════════════════════════════════════

const caseWith = (over = {}) => ({
  id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct',
  meetings: [], evidence: [], ...over,
});

const matter = (over = {}) => ({
  id: 'alg_1', caseId: 'c1', title: 'Missing stock count',
  investigationConclusion: null, ...over,
});

const version = (over = {}) => ({
  id: 'v1', caseId: 'c1', versionNo: 1, source: 'generated',
  createdAt: '2026-07-01T09:00:00Z', authorKind: 'user',
  adoptedAt: null, adoptionBasis: null, isCurrent: false, supersededAt: null, ...over,
});

// ── the model ────────────────────────────────────────────────────────────
describe('B3.2-0 model — matters and their human-recorded positions', () => {
  it('surfaces a matter with no recorded position AS having none', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [matter()] });
    expect(m.matters).toHaveLength(1);
    expect(m.matters[0].position).toBeNull();
    expect(m.matters[0].positionLabel).toBeNull();
    expect(m.positionsRecorded).toBe(0);
    expect(m.positionsOutstanding).toBe(1);
  });

  it('NEVER infers a conclusion — an unconcluded matter is not "no case to answer"', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [matter()] });
    expect(JSON.stringify(m.matters[0])).not.toContain('no_case_to_answer');
    expect(JSON.stringify(m.matters[0])).not.toContain('case_to_answer');
  });

  it('surfaces each of the three permitted positions with its own meaning', () => {
    for (const p of ['case_to_answer', 'no_case_to_answer', 'further_investigation_required']) {
      const m = buildReportWorkspace({ cs: caseWith(), allegations: [matter({ investigationConclusion: p })] });
      expect(m.matters[0].position, p).toBe(p);
      expect(m.matters[0].positionLabel, p).toBeTruthy();
      expect(m.matters[0].positionMeaning, p).toBeTruthy();
    }
  });

  it('carries the investigator\'s own words rather than a summary', () => {
    const m = buildReportWorkspace({
      cs: caseWith(),
      allegations: [matter({
        investigationConclusion: 'case_to_answer',
        investigationConclusionReasoning: 'The rota contradicts the account given.',
        outstandingUncertainty: 'The second till roll was never produced.',
      })],
    });
    expect(m.matters[0].reasoning).toBe('The rota contradicts the account given.');
    expect(m.matters[0].outstandingUncertainty).toBe('The second till roll was never produced.');
  });

  it('reports no matters as an absence, not an error', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [] });
    expect(m.mattersAbsent).toBe(true);
    expect(m.matters).toEqual([]);
  });

  it('does not borrow another case\'s matters', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [matter({ id: 'alg_9', caseId: 'c9' })] });
    expect(m.matters).toEqual([]);
  });
});

describe('B3.2-0 model — evidence provenance', () => {
  const evidence = [
    { id: 'e1', allegationId: 'alg_1', name: 'Till roll', type: 'document', stance: 'supports' },
    { id: 'e2', allegationId: 'alg_1', name: 'Rota', type: 'document', stance: null },
    { id: 'e3', allegationId: null, name: 'CCTV still', type: 'image' },
  ];

  it('links evidence to its matter and reports an unrecorded stance as unrecorded', () => {
    const m = buildReportWorkspace({ cs: caseWith({ evidence }), allegations: [matter()] });
    expect(m.matters[0].evidence.map(e => e.id)).toEqual(['e1', 'e2']);
    expect(m.matters[0].evidence[0].stance).toBe('supports');
    expect(m.matters[0].evidence[1].stance).toBeNull();
  });

  it('does not drop evidence that is attached to no matter', () => {
    const m = buildReportWorkspace({ cs: caseWith({ evidence }), allegations: [matter()] });
    expect(m.unlinkedEvidence.map(e => e.id)).toEqual(['e3']);
  });

  it('handles a case with no evidence at all', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [matter()] });
    expect(m.matters[0].evidence).toEqual([]);
    expect(m.unlinkedEvidence).toEqual([]);
  });
});

describe('B3.2-0 model — meetings, signatures and disputes', () => {
  it('reports no investigation meetings as a legitimate state, not a gap', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [] });
    expect(m.meetingsAbsent).toBe(true);
    expect(m.investigationMeetings).toEqual([]);
  });

  it('only counts investigation meetings, and not a disciplinary one', () => {
    const cs = caseWith({ meetings: [
      { id: 'm1', type: 'Investigation Meeting', record: 'notes' },
      { id: 'm2', type: 'Disciplinary Hearing', record: 'notes' },
    ] });
    const m = buildReportWorkspace({ cs, allegations: [] });
    expect(m.investigationMeetings.map(x => x.id)).toEqual(['m1']);
  });

  it('reports a signature status ONLY where a signature was actually requested', () => {
    const cs = caseWith({ meetings: [
      { id: 'm1', type: 'Investigation Meeting', record: 'x' },
      { id: 'm2', type: 'Investigation Meeting', record: 'x', signId: 's1', signStatus: 'signed' },
    ] });
    const m = buildReportWorkspace({ cs, allegations: [] });
    // No request means no status — NOT "unsigned", which would be a claim.
    expect(m.investigationMeetings[0].signatureRequested).toBe(false);
    expect(m.investigationMeetings[0].signatureStatus).toBeNull();
    expect(m.investigationMeetings[1].signatureRequested).toBe(true);
    expect(m.investigationMeetings[1].signatureStatus).toBe('signed');
  });

  it('surfaces a disputed note with the proposed correction', () => {
    const cs = caseWith({ meetings: [{
      id: 'm1', type: 'Investigation Meeting', record: 'x', signId: 's1',
      responseType: 'disputed', proposedCorrection: 'I did not say that.',
    }] });
    const m = buildReportWorkspace({ cs, allegations: [] });
    expect(m.disputes).toHaveLength(1);
    expect(m.disputes[0].proposedCorrection).toBe('I did not say that.');
  });

  it('does not report a dispute where none was recorded', () => {
    const cs = caseWith({ meetings: [{ id: 'm1', type: 'Investigation Meeting', record: 'x' }] });
    expect(buildReportWorkspace({ cs, allegations: [] }).disputes).toEqual([]);
  });
});

describe('B3.2-0 model — an investigation with no named subject', () => {
  it('reports the absence rather than treating it as missing data', () => {
    const m = buildReportWorkspace({ cs: caseWith({ employeeName: '' }), allegations: [] });
    expect(m.subjectAbsent).toBe(true);
    expect(m.subject).toBeNull();
  });

  it('treats whitespace-only and undefined the same way', () => {
    for (const name of ['   ', undefined, null]) {
      expect(buildReportWorkspace({ cs: caseWith({ employeeName: name }), allegations: [] }).subjectAbsent).toBe(true);
    }
  });

  it('CONTROL — a named subject is reported as named', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [] });
    expect(m.subjectAbsent).toBe(false);
    expect(m.subject).toBe('Sam Employee');
  });
});

describe('B3.2-0 model — report history and legacy compatibility', () => {
  it('reports no versions as no versions', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [] });
    expect(m.versionsAbsent).toBe(true);
    expect(m.currentAdopted).toBeNull();
    expect(describeReportState(m)).toMatch(/No investigation report has been saved/);
  });

  it('identifies the current adopted version', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [], versions: [
      version({ id: 'v1', versionNo: 1, adoptedAt: '2026-07-02T09:00:00Z', supersededAt: '2026-07-03T09:00:00Z' }),
      version({ id: 'v2', versionNo: 2, adoptedAt: '2026-07-03T09:00:00Z', isCurrent: true }),
    ] });
    expect(m.currentAdopted.versionNo).toBe(2);
    expect(m.adoptedCount).toBe(2);
    expect(describeReportState(m)).toMatch(/Version 2 is the adopted/);
  });

  it('says so when versions exist but none is adopted', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [], versions: [version()] });
    expect(m.currentAdopted).toBeNull();
    expect(describeReportState(m)).toMatch(/none has been adopted/);
  });

  it('a LEGACY report is legacy: no versions, no adoption, nothing invented', () => {
    const m = buildReportWorkspace({
      cs: caseWith({ investigationReport: '## Executive Summary\nLegacy text' }), allegations: [],
    });
    expect(m.legacyOnly).toBe(true);
    expect(m.versions).toEqual([]);
    expect(m.adoptedCount).toBe(0);
    expect(m.currentAdopted).toBeNull();
    expect(describeReportState(m)).toMatch(/legacy record/);
    expect(describeReportState(m)).toMatch(/none has been invented/);
  });

  it('a legacy report plus real versions is NOT legacy-only', () => {
    const m = buildReportWorkspace({
      cs: caseWith({ investigationReport: 'legacy' }), allegations: [], versions: [version()],
    });
    expect(m.legacyOnly).toBe(false);
  });

  it('distinguishes "could not read" from "there are none"', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [], versionsUnreadable: true });
    expect(m.versionsUnreadable).toBe(true);
    expect(describeReportState(m)).toMatch(/could not read/);
    expect(describeReportState(m)).not.toMatch(/No investigation report has been saved/);
  });

  it('distinguishes "still loading" from both', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [], versionsLoading: true });
    expect(describeReportState(m)).toMatch(/Loading/);
  });
});

describe('B3.2-0 model — it is read-only and total', () => {
  it('declares itself read-only and exposes the full lifecycle', () => {
    const m = buildReportWorkspace({ cs: caseWith(), allegations: [] });
    expect(m.readOnly).toBe(true);
    expect(m.lifecycle.map(s => s.id)).toEqual(['draft', 'save_version', 'adopt', 'submit', 'hr_review']);
    expect(REPORT_LIFECYCLE).toHaveLength(5);
  });

  it('never throws on malformed or absent input', () => {
    for (const bad of [undefined, {}, { cs: null }, { cs: {}, allegations: 'nonsense' },
                       { cs: { meetings: 'nope', evidence: 42 } }, { versions: 'nope' }]) {
      expect(() => buildReportWorkspace(bad)).not.toThrow();
    }
  });
});

// ── the panel ────────────────────────────────────────────────────────────
describe('B3.2-0 panel — what the investigator sees', () => {
  const show = (over = {}) =>
    render(<InvestigationReportTab model={buildReportWorkspace(over)} fmtDate={d => d || ''} />);

  it('states plainly that it is read-only and that the legacy route is unchanged', () => {
    show({ cs: caseWith(), allegations: [] });
    expect(screen.getByText(/read-only view/i)).toBeInTheDocument();
    expect(screen.getByText(/Conclude investigation/)).toBeInTheDocument();
  });

  it('offers NO interactive control at all — no button, link or input', () => {
    show({ cs: caseWith(), allegations: [matter({ investigationConclusion: 'case_to_answer' })],
           versions: [version({ adoptedAt: '2026-07-02T09:00:00Z', isCurrent: true })] });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(document.querySelectorAll('input,textarea,select')).toHaveLength(0);
  });

  it('shows the lifecycle with every future step inert', () => {
    show({ cs: caseWith(), allegations: [] });
    for (const label of ['Draft', 'Save version', 'Adopt', 'Submit to HR', 'HR Review']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Shown as steps, never as controls.
    expect(screen.queryByRole('button', { name: /Adopt|Submit/ })).not.toBeInTheDocument();
  });

  it('renders the four required empty states in words', () => {
    show({ cs: caseWith({ employeeName: '' }), allegations: [] });
    expect(screen.getByText(/No employee is named on this case/)).toBeInTheDocument();
    expect(screen.getByText(/No matters have been recorded/)).toBeInTheDocument();
    expect(screen.getByText(/No investigation meetings are recorded/)).toBeInTheDocument();
    expect(screen.getByText(/No report versions have been saved/)).toBeInTheDocument();
  });

  it('renders the legacy-only empty state as a legacy record', () => {
    show({ cs: caseWith({ investigationReport: 'legacy text' }), allegations: [] });
    // Twice, deliberately: once as the headline status at the top of the
    // workspace and once in the report-history section, so a reader who
    // scrolls straight to the history still learns it is a legacy record.
    expect(screen.getAllByText(/created before Compass recorded report versions/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/invented/).length).toBeGreaterThan(0);
  });

  it('does NOT render the legacy report body in this slice', () => {
    show({ cs: caseWith({ investigationReport: 'SECRET LEGACY BODY TEXT' }), allegations: [] });
    expect(document.body.textContent).not.toContain('SECRET LEGACY BODY TEXT');
  });

  it('marks a matter with no position, rather than leaving it blank', () => {
    show({ cs: caseWith(), allegations: [matter()] });
    expect(screen.getByText('No position recorded')).toBeInTheDocument();
  });

  it('shows the adopted version and the HR-exception basis where one applies', () => {
    show({ cs: caseWith(), allegations: [], versions: [
      version({ adoptedAt: '2026-07-02T09:00:00Z', isCurrent: true, adoptionBasis: 'hr_exception' }),
    ] });
    expect(screen.getByText(/Adopted · current/)).toBeInTheDocument();
    expect(screen.getByText(/Adopted under HR exception/)).toBeInTheDocument();
  });

  it('warns rather than claiming an absence when the history could not be read', () => {
    show({ cs: caseWith(), allegations: [], versionsUnreadable: true });
    expect(screen.getAllByText(/could not read the saved report versions/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No report versions have been saved/)).not.toBeInTheDocument();
  });

  it('survives being handed no model at all', () => {
    render(<InvestigationReportTab model={null} />);
    expect(screen.getByText(/No investigation report information is available/)).toBeInTheDocument();
  });
});

// ── navigation: WHEN the destination appears ─────────────────────────────
//
// The first cut showed this on all 2,963 cases. The correction is a
// visibility predicate built from investigation SIGNALS, never from
// case_type — which matters because case_type is free text that is empty on
// 566 production cases, including 45 of the 50 that hold a real report.
describe('B3.2-0 navigation — the destination follows investigation signals, not labels', () => {
  const dests = over => caseWorkspaceDestinations({
    cs: { id: 'c1', caseType: 'misconduct', meetings: [], ...(over.cs || {}) },
    allegations: over.allegations || [], caseAccess: over.caseAccess || [],
    hasReportVersion: over.hasReportVersion || false,
    evidence: [], meetings: (over.cs && over.cs.meetings) || [],
  });
  const shows = over => [...dests(over).primary, ...dests(over).secondary].map(d => d.id).includes('inv_report');

  it('EACH of the five signals is sufficient on its own', () => {
    expect(shows({ cs: { investigationReport: 'legacy text' } }), 'legacy report').toBe(true);
    expect(shows({ hasReportVersion: true }), 'report version').toBe(true);
    expect(shows({ allegations: [{ id: 'a1', caseId: 'c1', investigationConclusion: 'case_to_answer' }] }), 'conclusion').toBe(true);
    expect(shows({ caseAccess: [{ caseId: 'c1', role: 'investigator' }] }), 'investigator').toBe(true);
    expect(shows({ cs: { stage: 'investigation' } }), 'stage').toBe(true);
    expect(shows({ cs: { meetings: [{ id: 'm1', type: 'Investigation Meeting' }] } }), 'meeting').toBe(true);
  });

  it('a DESK-BASED investigation with no meeting still qualifies', () => {
    // Investigator assigned, documents only, nobody interviewed.
    expect(shows({ cs: { meetings: [] }, caseAccess: [{ caseId: 'c1', role: 'investigator' }] })).toBe(true);
    expect(shows({ cs: { stage: 'investigation', meetings: [] } })).toBe(true);
  });

  it('an investigation with NO NAMED EMPLOYEE qualifies on the same terms', () => {
    for (const employeeName of ['', '   ', undefined]) {
      expect(shows({ cs: { employeeName, stage: 'investigation' } }), String(employeeName)).toBe(true);
    }
  });

  it('an investigation INSIDE a grievance or any other process qualifies', () => {
    for (const caseType of ['grievance', 'capability', 'probation', 'absence', '', undefined]) {
      expect(shows({ cs: { caseType, stage: 'investigation' } }), String(caseType)).toBe(true);
      expect(shows({ cs: { caseType }, caseAccess: [{ caseId: 'c1', role: 'investigator' }] }), String(caseType)).toBe(true);
    }
  });

  it('an ORDINARY case with no investigation signal does NOT gain the tab', () => {
    for (const caseType of ['probation', 'absence', 'capability', 'long-term sickness',
                            'flexible working', 'informal', 'grievance', 'misconduct', '', undefined]) {
      expect(shows({ cs: { caseType, stage: 'intake', meetings: [] } }), String(caseType)).toBe(false);
    }
  });

  it('ALLEGATIONS ALONE are not an investigation signal', () => {
    // Raising an issue is not investigating it. 843 production cases have an
    // allegation; using that would re-admit a third of the estate.
    expect(shows({ allegations: [{ id: 'a1', caseId: 'c1', title: 'An issue' }] })).toBe(false);
  });

  it('a findings signal counts only where a human actually recorded something', () => {
    const blank = { id: 'a1', caseId: 'c1', investigatorFinding: '   ', outstandingUncertainty: '', witnessEvidence: null };
    expect(shows({ allegations: [blank] })).toBe(false);
    expect(shows({ allegations: [{ ...blank, investigatorFinding: 'The rota contradicts it.' }] })).toBe(true);
    expect(shows({ allegations: [{ ...blank, outstandingUncertainty: 'Till roll never produced.' }] })).toBe(true);
    expect(shows({ allegations: [{ ...blank, witnessEvidence: 'Two colleagues confirm.' }] })).toBe(true);
  });

  it('another case\'s investigator grant does not qualify THIS case', () => {
    expect(shows({ caseAccess: [{ caseId: 'c9', role: 'investigator' }] })).toBe(false);
  });

  it('a non-investigator case_access role does not qualify the case', () => {
    for (const role of ['notetaker', 'appeal_manager', 'case_owner']) {
      expect(shows({ caseAccess: [{ caseId: 'c1', role }] }), role).toBe(false);
    }
  });

  it('a DISCIPLINARY meeting alone is not an investigation signal', () => {
    expect(shows({ cs: { meetings: [{ id: 'm1', type: 'Disciplinary Hearing' }] } })).toBe(false);
  });

  it('never reads case_type: identical signals give identical answers across every type', () => {
    const types = ['misconduct', 'grievance', 'probation', 'capability', 'absence',
                   'long-term sickness', 'flexible working', 'informal', 'investigation', '', undefined];
    const withSignal = types.map(caseType => shows({ cs: { caseType, stage: 'investigation' } }));
    const without = types.map(caseType => shows({ cs: { caseType, stage: 'intake' } }));
    expect(new Set(withSignal)).toEqual(new Set([true]));
    expect(new Set(without)).toEqual(new Set([false]));
  });

  it('the predicate itself is defensive about malformed input', () => {
    // Asserted against hasInvestigationSignal directly rather than through
    // caseWorkspaceDestinations: that builder does `(meetings || []).filter`
    // and throws on a non-array, which is pre-existing behaviour shared by
    // every caller and is not this slice's to change. What must be true is
    // that the predicate THIS slice adds never throws and never guesses.
    for (const bad of [undefined, {}, { cs: null }, { cs: { meetings: 'nope' } },
                       { allegations: 'nope' }, { caseAccess: 'nope' },
                       { cs: { meetings: [null, 42] }, allegations: [null] }]) {
      expect(() => hasInvestigationSignal(bad)).not.toThrow();
      expect(hasInvestigationSignal(bad)).toBe(false);
    }
  });

  it('resolves a deep link to the destination', () => {
    expect(destinationForLegacyTab('inv_report')).toBe('inv_report');
  });

  it('every OTHER destination is unaffected by the predicate', () => {
    const ids = [...dests({}).primary, ...dests({}).secondary].map(d => d.id);
    expect(ids).toEqual(expect.arrayContaining(['investigation', 'meetings', 'documents', 'record', 'compass', 'tasks', 'people']));
  });
});

// ── the case-scoped gateway read ─────────────────────────────────────────
describe('B3.2-0 gateway — the case-scoped read is read-only and complete', () => {
  function pagingClient(rows, { serverCap = 1000, failOnPage = null } = {}) {
    const calls = [];
    const b = {
      select: () => b, eq: () => b, order: () => b,
      range: (from, to) => {
        calls.push([from, to]);
        if (failOnPage !== null && calls.length === failOnPage) {
          return Promise.resolve({ data: null, error: { code: 'XX000', message: 'lost' } });
        }
        const width = Math.min(to - from + 1, serverCap);
        return Promise.resolve({ data: rows.slice(from, from + width), error: null });
      },
    };
    return { from: () => b, calls };
  }
  const row = n => ({ id: `v-${n}`, case_id: 'c1', version_no: n, source: 'generated',
    created_at: '2026-07-01T09:00:00Z', author_kind: 'user', adopted_at: null,
    adoption_basis: null, is_current: false, superseded_at: null });

  it('refuses without a case id rather than reading the whole table', async () => {
    for (const caseId of [undefined, null, '', '  ', 42]) {
      const r = await fetchCaseReportVersions(pagingClient([]), { caseId });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(REPORT_VERSION_GATEWAY_FAILURE.NO_CASE);
    }
  });

  it('scopes the query to the CASE, not the organisation', async () => {
    const captured = [];
    const b = { select: () => b, eq: (c, v) => { captured.push([c, v]); return b; }, order: () => b,
                range: () => Promise.resolve({ data: [], error: null }) };
    await fetchCaseReportVersions({ from: () => b }, { caseId: 'c1' });
    expect(captured).toContainEqual(['case_id', 'c1']);
    expect(captured.some(([c]) => c === 'org_id')).toBe(false);
  });

  it('never selects the report body, and still withholds adopted_by', async () => {
    const cols = [];
    const b = { select: c => { cols.push(c); return b; }, eq: () => b, order: () => b,
                range: () => Promise.resolve({ data: [], error: null }) };
    await fetchCaseReportVersions({ from: () => b }, { caseId: 'c1' });
    // The body is never pulled into a LIST read. B3.2-1 needs the text of one
    // chosen version and fetches exactly that, via fetchReportVersionBody.
    expect(cols[0]).not.toMatch(/\bbody\b/);
    // Nothing in B3.2-1 adopts anything, so no screen needs the adopter.
    expect(cols[0]).not.toMatch(/adopted_by/);
    // created_by IS now selected, and that is a deliberate reversal of the
    // B3.2-0 decision. B3.2-0 withheld it because nothing displayed it;
    // B3.2-1 displays it, because an immutable version history whose rows do
    // not say who wrote them is not an audit trail — and "version 3, 14:02"
    // with no author is exactly the ambiguity two investigators working the
    // same case need resolved. The DSAR read is unchanged and still withholds
    // internal actors; that is asserted separately in reportVersionsDsar.
    expect(cols[0]).toMatch(/created_by/);
    // CONTROL: it does select what it needs, so the assertions above are not
    // passing against an empty column list.
    expect(cols[0]).toMatch(/version_no/);
    expect(cols[0]).toMatch(/adopted_at/);
  });

  it('pages beyond the server cap', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1));
    const client = pagingClient(rows, { serverCap: 1000 });
    const r = await fetchCaseReportVersions(client, { caseId: 'c1' });
    expect(r.ok).toBe(true);
    expect(r.versions).toHaveLength(2500);
    expect(client.calls.length).toBeGreaterThan(1);
  });

  it('discards partial rows when a later page fails', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1));
    const r = await fetchCaseReportVersions(pagingClient(rows, { serverCap: 1000, failOnPage: 2 }), { caseId: 'c1' });
    expect(r.ok).toBe(false);
    expect(r.versions).toBeUndefined();
  });

  it('reports dropped malformed rows rather than quietly shortening the history', async () => {
    const r = await fetchCaseReportVersions(pagingClient([row(1), { case_id: 'c1' }]), { caseId: 'c1' });
    expect(r.ok).toBe(true);
    expect(r.versions).toHaveLength(1);
    expect(r.droppedRows).toBe(1);
  });

  it('exposes NO write of any kind', async () => {
    const mod = await import('../lib/reportVersionGateway.js');
    // B3.2-1 added fetchReportVersionBody — a THIRD read on the same choke
    // point, for the text of one chosen version. The write that B3.2-1 needed
    // went into src/lib/reportDraftGateway.js instead of here, precisely so
    // this assertion keeps meaning what it says rather than being relaxed the
    // first time it fired.
    expect(Object.keys(mod).sort()).toEqual([
      'REPORT_VERSION_GATEWAY_FAILURE', 'REPORT_VERSION_STATE',
      'classifyReportVersion', 'fetchCaseReportVersions', 'fetchDsarReportVersions',
      'fetchReportVersionBody',
    ]);
    // And the property behind the list, asserted directly so that adding an
    // export cannot smuggle in a verb: every export is a read or a constant.
    for (const name of Object.keys(mod)) {
      expect(name, `${name} looks like a write`).not.toMatch(/save|insert|update|delete|upsert|write|adopt|submit/i);
    }
  });
});
