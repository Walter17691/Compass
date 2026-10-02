import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileSubjectData } from '../lib/dsarCompile.js';
import { DSAR_COLUMNS, fetchDsarMeetings, GATEWAY_FAILURE } from '../lib/meetingTableGateway.js';
import { classifyTable, ORG_SCOPED_TABLES } from '../lib/dataInventory.js';

// ─────────────────────────────────────────────────────────────────────────
// Phase E2A — MEETING AUTHORITY CLOSURE + DSAR INTEGRATION.
//
// Two things, and they are connected only by the word "meeting":
//
//   1. AUTHORITY. public.meetings is the target canonical meeting entity.
//      cases.meetings is historical/formal compatibility state. That direction is
//      pinned here so it cannot drift back by accident, and a third store is
//      forbidden outright.
//
//   2. DSAR. E2 fixed the compiler's identity model and left it unexercised,
//      because DsarScreen never passed meetings in. That is the production gap
//      these tests aim at — deliberately at the SCREEN, not just the compiler.
// ─────────────────────────────────────────────────────────────────────────

const read = f => readFileSync(f, 'utf8');
const stripJs = src => src.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

// Whitespace-normalised, because markdown wraps prose at 80 columns and an
// assertion that happens to straddle a line break fails for a reason that has
// nothing to do with what the document says.
const adr = read('docs/ARCHITECTURE_DECISIONS.md').replace(/\s+/g, ' ');
const dsarScreenRaw = read('src/screens/DsarScreen.jsx');
const dsarScreen = stripJs(dsarScreenRaw);
const compiler = stripJs(read('src/lib/dsarCompile.js'));
const gatewayRaw = read('src/lib/meetingTableGateway.js');
const gateway = stripJs(gatewayRaw);
const storeRaw = read('src/lib/meetingStore.js');
const appCode = stripJs(read('src/App.jsx'));

const DANA = 'emp-dana';
const OTHER = 'emp-other';

// ═══════════════════════════════════════════════════════════════════════════
describe('E2A — the authority question has one answer', () => {
  it('public.meetings is recorded as the TARGET canonical meeting entity', () => {
    expect(adr).toMatch(/`?public\.meetings`?\*{0,2} is the target canonical meeting entity/i);
  });

  it('cases.meetings is recorded as compatibility state, not a rival authority', () => {
    expect(adr).toMatch(/`?cases\.meetings`? jsonb\*{0,2} is historical and formal compatibility state/i);
    expect(adr).toMatch(/are not migrated\*{0,2}\s+until their parent cases carry canonical identity/i);
  });

  it('a meeting still has exactly ONE authoritative home, keyed on a marker', () => {
    // This is what stops the two stores being a dual-authority problem: they own
    // disjoint sets, and the rule is a function rather than a convention.
    expect(storeRaw).toMatch(/A meeting has exactly ONE authoritative storage home/);
    expect(storeRaw).toMatch(/No dual-write\. No shadow copy\./);
    expect(storeRaw).toContain('export function meetingHome');
  });

  it('no third meeting store exists anywhere', () => {
    // The failure mode is not "the wrong store wins" — it is a third one
    // appearing because neither existing one fitted.
    const forbidden = [
      'employee_meetings', 'formal_meetings', 'case_meeting_records',
      'meeting_records', 'meetings_v2', 'canonical_meetings',
    ];
    const surfaces = [
      'src/App.jsx', 'src/lib/meetingStore.js', 'src/lib/meetingWrites.js',
      'src/lib/standaloneMeetingWrites.js', 'src/lib/meetingTableGateway.js',
      'src/lib/dataInventory.js',
    ].map(read).join('\n');
    forbidden.forEach(t => expect(surfaces, t).not.toContain(t));
  });

  it('the dead pre-E2 meetings table is not code-reachable', () => {
    // public.meetings_legacy_unused is not a rival store and never was: it is the
    // PRE-4C meetings table, renamed by supabase/standalone_meetings_2026-09-25.sql
    // to free the name for the canonical one, and kept so that migration's rollback
    // can rename it back. 0 rows, no inbound foreign keys, no view dependencies.
    //
    // Recorded here because a table called "meetings_*" is exactly what a
    // no-third-store rule must account for rather than trip over. It stays, and
    // what is asserted is that no application code can reach it.
    // NEW-44 amended this assertion, and the amendment is the interesting part.
    // src/lib/dataInventory.js USED to be in the list below, and NEW-44 added
    // the string 'meetings_legacy_unused' to it — as a classification entry, in
    // UNUSED_LEGACY_TABLES, because a table that exists and is classified
    // nowhere is precisely the failure NEW-44 was raised for.
    //
    // So the substring check started failing while the property it exists to
    // protect — stated one line up, "no application code can reach it" — was
    // never violated: a metadata registry naming a table is not a code path
    // reaching it. dataInventory.js is a list of names by definition; asserting
    // a name is absent from the inventory of names is asserting the table is
    // unclassified, which is the bug, not the fix.
    //
    // The registry is therefore checked by what it SAYS rather than by whether
    // a word appears in it, and the access surfaces keep the blunt check.
    const accessSurfaces = [
      'src/App.jsx', 'src/lib/meetingStore.js', 'src/lib/meetingWrites.js',
      'src/lib/standaloneMeetingWrites.js', 'src/lib/meetingTableGateway.js',
      'src/lib/meetingDiscovery.js', 'src/screens/DsarScreen.jsx',
    ].map(read).join('\n');
    expect(accessSurfaces).not.toContain('meetings_legacy_unused');

    // Nothing reads, writes or deletes it anywhere in the application, which is
    // the property that actually matters and is now asserted directly rather
    // than inferred from a filename list.
    const everySource = stripJs([
      'src/App.jsx', 'src/lib/meetingStore.js', 'src/lib/meetingWrites.js',
      'src/lib/standaloneMeetingWrites.js', 'src/lib/meetingTableGateway.js',
      'src/lib/meetingDiscovery.js', 'src/screens/DsarScreen.jsx',
      'src/lib/dataInventory.js', 'api/delete-org-data.js',
    ].map(read).join('\n'));
    for (const access of [
      "from('meetings_legacy_unused')", 'from("meetings_legacy_unused")',
      'meetings_legacy_unused?', 'rest/v1/meetings_legacy_unused',
    ]) expect(everySource, access).not.toContain(access);

    // And it is classified as the fossil it is: never swept by
    // api/delete-org-data.js, never mistaken for the canonical store.
    expect(classifyTable('meetings_legacy_unused')).toBe('unused_legacy');
    expect(ORG_SCOPED_TABLES).not.toContain('meetings_legacy_unused');
  });

  it('the table is still reached through exactly one module', () => {
    expect(gateway).toContain('export const MEETINGS_TABLE');
    ['src/App.jsx', 'src/screens/DsarScreen.jsx', 'src/lib/meetingWrites.js']
      .forEach(p => expect(read(p), p).not.toContain("from('meetings')"));
  });

  it('no historical migration and no name reconciliation happened', () => {
    const e2 = read('supabase/canonical_meeting_parentage_2026-09-28.sql');
    expect(e2).not.toMatch(/^\s*update public\.meetings/mi);
    expect(e2).not.toMatch(/jsonb_array_elements/);
    // Nothing anywhere turns a name into an employee parent.
    expect(appCode).not.toMatch(/backfillEmployee|reconcileEmployee|migrateCasesToEmployee/);
    expect(appCode).not.toMatch(/employee_id[^\n]{0,40}=[^\n]{0,40}employee_name/);
  });

  it('legacy formal meetings remain readable where they live', () => {
    // Compatibility is the point: historical cases must keep working untouched.
    expect(read('src/components/caseTabs/MeetingsTab.jsx')).toMatch(/cs\.meetings\|\|\[\]/);
  });

  it('a NEW meeting can never be born legacy_unreconciled', () => {
    const mig = read('supabase/canonical_meeting_parentage_2026-09-28.sql')
      .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    const insert = mig.slice(mig.indexOf('for insert'), mig.indexOf('for select'));
    expect(insert).toMatch(/subject_kind in \('employee', 'process_witness'\)/);
    expect(insert).not.toContain("'legacy_unreconciled'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E2A — the DSAR gap is closed in the PRODUCTION flow', () => {
  it('the screen fetches meetings and passes them to the compiler', () => {
    // E2 fixed the compiler and left it unreachable. This is the actual fix.
    expect(dsarScreen).toContain('fetchDsarMeetings');
    expect(dsarScreen).toMatch(/const meetingResult = await fetchDsarMeetings\(supabase, \{ orgId \}\)/);
    expect(dsarScreen).toMatch(/^\s*standaloneMeetings,$/m);
  });

  it('through the authenticated client, so RLS applies', () => {
    // Completeness is not a reason to widen access. The existing privileged
    // endpoint is left doing exactly what it did.
    expect(dsarScreen).toContain("import { supabase } from '../supabase'");
    expect(gateway).toMatch(/\.from\(MEETINGS_TABLE\)/);
    expect(gateway).not.toMatch(/service_role|SERVICE_ROLE|serviceRole/);
    // The dsar-lookup endpoint is untouched and does not learn about meetings.
    expect(read('api/portal/[...action].js')).not.toContain('meetings');
  });

  it('a failed read is reported, never silently read as "there were none"', () => {
    expect(dsarScreen).toMatch(/meetingFetchFailed = true/);
    const failed = compileSubjectData('Dana Keys', { meetingFetchFailed: true });
    expect(failed.standaloneMeetingsDisposition.readFailed).toBe(true);
    expect(failed.standaloneMeetingsDisposition.note).toContain('could not read');
  });

  it('the gateway refuses without an organisation or a client', async () => {
    expect((await fetchDsarMeetings(null, { orgId: 'o' })).reason).toBe(GATEWAY_FAILURE.NO_CLIENT);
    expect((await fetchDsarMeetings({}, {})).reason).toBe(GATEWAY_FAILURE.NO_ORG);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E2A — DSAR identity', () => {
  const compile = (standaloneMeetings, canonicalEmployeeId = DANA) =>
    compileSubjectData('Dana Keys', { canonicalEmployeeId, standaloneMeetings });

  const meeting = (over = {}) => ({
    id: 'm', subjectKind: 'employee', employeeId: DANA, employeeName: 'Dana Keys',
    transcript: [], ...over,
  });

  it('identity is employee_id, and the basis says so', () => {
    const out = compile([meeting()]);
    expect(out.standaloneMeetings.map(m => m.id)).toEqual(['m']);
    expect(out.identityBasisByCollection.standaloneMeetings).toBe('employee_id');
  });

  it('Dana Keys A is not Dana Keys B', () => {
    // Same display name, different people. The whole programme in one assertion.
    const out = compile([
      meeting({ id: 'a', employeeId: DANA }),
      meeting({ id: 'b', employeeId: OTHER }),
    ]);
    expect(out.standaloneMeetings.map(m => m.id)).toEqual(['a']);
  });

  it('a canonical meeting is never claimed by name', () => {
    // No canonical subject id => an employee-owned row cannot be confirmed theirs.
    const out = compile([meeting()], null);
    expect(out.standaloneMeetings).toEqual([]);
    expect(out.standaloneMeetingsDisposition.canonicallyAttributable).toBe(false);
  });

  it('a witness interview is not the witness\'s own record', () => {
    const out = compile([
      meeting({ id: 'w', subjectKind: 'process_witness', employeeId: null, witness: { name: 'Dana Keys' } }),
    ]);
    expect(out.standaloneMeetings).toEqual([]);
    expect(out.standaloneMeetingsDisposition.witnessInterviewsExcluded).toBe(1);
  });

  it('...but a witness interview that NAMES them is still surfaced for a human', () => {
    const out = compile([
      meeting({
        id: 'w', subjectKind: 'process_witness', employeeId: null,
        witness: { name: 'Someone Else' }, record: 'Dana Keys was mentioned as present.',
      }),
    ]);
    expect(out.standaloneMeetings).toEqual([]);
    expect(JSON.stringify(out.subjectMentionsAsThirdParty)).toContain('w');
  });

  it('legacy compatibility applies ONLY to legacy rows', () => {
    const out = compile([
      meeting({ id: 'legacy', subjectKind: 'legacy_unreconciled', employeeId: null }),
      meeting({ id: 'canonical-other', employeeId: OTHER }),
    ]);
    // The legacy row is matched by name because it has nothing else. The
    // canonical row belonging to someone else is NOT, despite the same name.
    expect(out.standaloneMeetings.map(m => m.id)).toEqual(['legacy']);
    expect(out.standaloneMeetingsDisposition.legacyUnreconciled).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E2A — what of a meeting is disclosed', () => {
  const full = {
    id: 'm', subjectKind: 'employee', employeeId: DANA, employeeName: 'Dana Keys',
    status: 'completed', meetingTypeId: 'informal',
    record: 'What we discussed.\n\n## HR Advisor Notes\nHandle this carefully, she may raise a grievance.',
    transcript: [{ speaker: 'Dana', text: 'I want to explain what happened.' }],
    summary: 'A supportive conversation.',
    advisorNotes: 'Internal: watch for escalation.',
    reviewDraft: { draft: 'unfinished internal analysis' },
    risk: { score: 8, prediction: 'likely tribunal' },
  };
  const out = compileSubjectData('Dana Keys', { canonicalEmployeeId: DANA, standaloneMeetings: [full] });
  const disclosed = out.standaloneMeetings[0];

  it('discloses the employee\'s own words and the record of what happened', () => {
    expect(disclosed.transcript[0].text).toContain('I want to explain');
    expect(disclosed.summary).toBe('A supportive conversation.');
    expect(disclosed.record).toContain('What we discussed.');
  });

  it('withholds Compass\'s internal analysis of the person', () => {
    const serialised = JSON.stringify(disclosed);
    // The HR advisory section inside the record...
    expect(serialised).not.toContain('may raise a grievance');
    // ...and the internal fields entirely.
    expect(serialised).not.toContain('watch for escalation');
    expect(serialised).not.toContain('unfinished internal analysis');
    expect(serialised).not.toContain('likely tribunal');
    expect(disclosed.advisorNotes).toBeUndefined();
    expect(disclosed.reviewDraft).toBeUndefined();
    expect(disclosed.risk).toBeUndefined();
  });

  it('reports what it withheld rather than withholding silently', () => {
    // Wave 0 renamed this to the one vocabulary both meeting formats share —
    // `record.hrAdvisorNotes` means the same thing whether the meeting is a row
    // in public.meetings or a jsonb entry inside a case.
    expect(disclosed.withheldAsInternalAnalysis.sort())
      .toEqual(['advisorNotes', 'record.hrAdvisorNotes', 'reviewDraft', 'risk']);
    expect(out.standaloneMeetingsDisposition.internalAnalysisWithheld)
      .toEqual([{ meetingId: 'm', withheld: disclosed.withheldAsInternalAnalysis }]);
    // And the reviewer is told, because a silent redaction is a decision nobody
    // made on purpose.
    expect(dsarScreenRaw).toContain('has been held back');
  });

  it('uses the boundary the product already draws, not a new one', () => {
    expect(compiler).toContain('splitMeetingRecord');
  });

  it('fetches the internal fields so the withholding is a RULE, not an absence', () => {
    // If they were never fetched, nobody could see that a decision was made — and
    // a future "let's include everything" change would look harmless.
    ['advisor_notes', 'review_draft', 'record', 'transcript', 'summary']
      .forEach(c => expect(DSAR_COLUMNS, c).toContain(c));
  });
});
