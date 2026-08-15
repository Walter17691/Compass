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
});
