import { describe, it, expect } from 'vitest';
import { buildHearingPackSections } from '../lib/hearingPack.js';

const baseCase = {
  id: 'c1',
  employeeName: 'Sarah Jones',
  caseType: 'misconduct',
  dateReceived: '2026-07-01',
  evidence: [],
  meetings: [],
};

describe('buildHearingPackSections', () => {
  it('produces a case summary from the case record', () => {
    const sections = buildHearingPackSections(baseCase, {});
    expect(sections.caseSummary).toEqual({ employeeName: 'Sarah Jones', caseType: 'misconduct', stage: null });
  });

  it('includes only allegations belonging to this case, with their linked evidence', () => {
    const allegations = [
      { id: 'a1', caseId: 'c1', title: 'Late arrivals', description: 'Repeated lateness', employeeResponse: 'Disputes the dates', witnessEvidence: 'Manager confirms' },
      { id: 'a2', caseId: 'other-case', title: 'Unrelated', description: '' },
    ];
    const cs = { ...baseCase, evidence: [{ name: 'Clock-in log', type: 'Document', date: '2026-07-02', allegationId: 'a1' }] };
    const sections = buildHearingPackSections(cs, { allegations });
    expect(sections.allegations).toHaveLength(1);
    expect(sections.allegations[0]).toMatchObject({ title: 'Late arrivals', employeeResponse: 'Disputes the dates', witnessEvidence: 'Manager confirms' });
    expect(sections.allegations[0].evidence).toEqual([{ name: 'Clock-in log', type: 'Document', date: '2026-07-02' }]);
  });

  it('includes the investigation report only when one exists', () => {
    expect(buildHearingPackSections(baseCase, {}).investigationReport).toBeNull();
    const cs = { ...baseCase, investigationReport: 'Findings text', investigationReportDate: '2026-07-10' };
    expect(buildHearingPackSections(cs, {}).investigationReport).toEqual({ text: 'Findings text', date: '2026-07-10' });
  });

  it('lists every meeting record on the case', () => {
    const cs = { ...baseCase, meetings: [
      { id: 'm1', type: 'Investigation', date: '2026-07-05', signStatus: 'signed', record: 'Notes' },
      { id: 'm2', type: 'Disciplinary', date: '2026-07-12', record: '' },
    ] };
    const sections = buildHearingPackSections(cs, {});
    expect(sections.meetings).toEqual([
      { type: 'Investigation', date: '2026-07-05', signStatus: 'signed', record: 'Notes' },
      { type: 'Disciplinary', date: '2026-07-12', signStatus: 'pending', record: null },
    ]);
  });

  it('collects correspondence only from meetings that have a drafted letter', () => {
    const cs = { ...baseCase, meetings: [
      { id: 'm1', type: 'Disciplinary', date: '2026-07-12', letterOutput: 'Invitation text' },
      { id: 'm2', type: 'Investigation', date: '2026-07-05' },
    ] };
    const sections = buildHearingPackSections(cs, {});
    expect(sections.correspondence).toEqual([{ meetingType: 'Disciplinary', date: '2026-07-12', text: 'Invitation text' }]);
  });

  it('lists all case evidence', () => {
    const cs = { ...baseCase, evidence: [{ name: 'CCTV clip', type: 'Video', date: '2026-07-03', addedBy: 'HR Manager' }] };
    const sections = buildHearingPackSections(cs, {});
    expect(sections.evidence).toEqual([{ name: 'CCTV clip', type: 'Video', date: '2026-07-03', addedBy: 'HR Manager' }]);
  });

  // Task's own required scenario: with several evidence items and several
  // allegations, each allegation's evidence section must include the
  // correct document (matched by id via evidenceForAllegation), and
  // reordering the evidence array must not corrupt which document lands
  // under which allegation.
  it('includes the correct linked document per allegation among several, and survives evidence reordering', () => {
    const allegations = [
      { id: 'a1', caseId: 'c1', title: 'Late arrivals', description: '' },
      { id: 'a2', caseId: 'c1', title: 'Missing till float', description: '' },
    ];
    const evidence = [
      { id: 'evA', name: 'Clock-in log', type: 'Document', date: '2026-07-02', allegationId: 'a1' },
      { id: 'evB', name: 'Till reconciliation', type: 'Document', date: '2026-07-04', allegationId: 'a2' },
      { id: 'evC', name: 'Unrelated memo', type: 'Document', date: '2026-07-05' },
    ];
    const cs = { ...baseCase, evidence };
    const sections = buildHearingPackSections(cs, { allegations });
    const byTitle = t => sections.allegations.find(a => a.title === t);
    expect(byTitle('Late arrivals').evidence).toEqual([{ name: 'Clock-in log', type: 'Document', date: '2026-07-02' }]);
    expect(byTitle('Missing till float').evidence).toEqual([{ name: 'Till reconciliation', type: 'Document', date: '2026-07-04' }]);

    // Reordering evidence (e.g. after a delete/re-add elsewhere in the
    // app) must produce the exact same associations, matched by id, not
    // by position.
    const reordered = { ...cs, evidence: [evidence[2], evidence[1], evidence[0]] };
    const reorderedSections = buildHearingPackSections(reordered, { allegations });
    const reorderedByTitle = t => reorderedSections.allegations.find(a => a.title === t);
    expect(reorderedByTitle('Late arrivals').evidence).toEqual([{ name: 'Clock-in log', type: 'Document', date: '2026-07-02' }]);
    expect(reorderedByTitle('Missing till float').evidence).toEqual([{ name: 'Till reconciliation', type: 'Document', date: '2026-07-04' }]);
  });

  it('includes only policies whose category matches the case type', () => {
    const policies = [
      { name: 'Disciplinary Policy', category: 'disciplinary', clauses: [{ heading: 'Notice', text: '5 days notice' }] },
      { name: 'Grievance Policy', category: 'grievance', clauses: [] },
    ];
    const sections = buildHearingPackSections(baseCase, { policies });
    expect(sections.policies).toEqual([{ name: 'Disciplinary Policy', clauses: [{ heading: 'Notice', text: '5 days notice' }] }]);
  });

  it('excludes timeline entries the user has already marked excluded', () => {
    const cs = { ...baseCase, timelineOverrides: { excluded: ['case-opened'] } };
    const sections = buildHearingPackSections(cs, {});
    expect(sections.chronology.find(e => e.description?.includes('Case opened'))).toBeUndefined();
  });

  it('includes the case-opened chronology entry when nothing is excluded', () => {
    const sections = buildHearingPackSections(baseCase, {});
    expect(sections.chronology.some(e => e.description?.includes('Case opened'))).toBe(true);
  });

  // Phase 6.5 hardening (closes Prompt 11 audit finding 4.8, MEDIUM)
  describe('auditHistoryMayBeIncomplete (Prompt 11 audit, 4.8)', () => {
    it('flags a case opened before audit_log reliably carried case_id', () => {
      expect(buildHearingPackSections(baseCase, {}).auditHistoryMayBeIncomplete).toBe(true);
    });

    it('does not flag a case opened after the cutoff', () => {
      const recentCase = { ...baseCase, dateReceived: '2026-08-22' };
      expect(buildHearingPackSections(recentCase, {}).auditHistoryMayBeIncomplete).toBe(false);
    });
  });
});
