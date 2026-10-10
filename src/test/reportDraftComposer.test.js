import { describe, it, expect } from 'vitest';
import {
  REPORT_SECTIONS, REPORT_SECTION_IDS, emptyReportSections, normaliseSections,
  sectionsAreEmpty, emptySectionIds, composeReportBody, parseReportBody,
  bodyRoundTripsExactly,
} from '../lib/reportDraftComposer.js';

// ─────────────────────────────────────────────────────────────────────────
// B3.2-1 — THE INVESTIGATOR'S WORDING MUST SURVIVE A ROUND TRIP, OR THE
// EDITOR MUST ADMIT IT CANNOT.
//
// These are the tests that stop a report losing text. compose/parse is the
// only lossy-capable step in the slice, so it is tested as a property — every
// section shape in, the same text out — and the refusal cases are tested
// individually, because "exact: false" is the honest answer and silently
// redistributing somebody's document is the bug.
// ─────────────────────────────────────────────────────────────────────────

const filled = (over = {}) => ({
  matters: 'Two matters.\n\n1. Timekeeping\n2. Expenses',
  evidence: 'Clock-in export (HR system, 1–31 March).\nExpense claims #4411, #4418.',
  accounts: 'The employee said the clock was broken.\nTheir manager said it was not reported.',
  assessment: 'The two accounts conflict and nothing resolves which is right.',
  positions: '1. Timekeeping — a case to answer.\n2. Expenses — no case to answer.',
  uncertainties: 'Whether the fault was reported verbally. The helpdesk log would settle it.',
  summary: 'One matter has a case to answer; one does not.',
  ...over,
});

describe('B3.2-1 — the seven sections are a fixed, ordered format', () => {
  it('has exactly the seven sections the product brief names', () => {
    expect(REPORT_SECTION_IDS).toEqual([
      'matters', 'evidence', 'accounts', 'assessment', 'positions', 'uncertainties', 'summary',
    ]);
  });

  it('freezes the headings, because they are the on-disk format', () => {
    expect(Object.isFrozen(REPORT_SECTIONS)).toBe(true);
    for (const s of REPORT_SECTIONS) expect(Object.isFrozen(s)).toBe(true);
  });

  it('names the position vocabulary without turning it into a misconduct finding', () => {
    const positions = REPORT_SECTIONS.find(s => s.id === 'positions');
    expect(positions.help).toMatch(/case to answer/);
    expect(positions.help).toMatch(/no case to answer/);
    expect(positions.help).toMatch(/further investigation required/);
    expect(positions.help).toMatch(/not a finding of misconduct/i);
  });
});

describe('B3.2-1 — compose and parse are exact inverses', () => {
  it('round-trips a fully written report', () => {
    const s = filled();
    const body = composeReportBody(s);
    const back = parseReportBody(body);
    expect(back.exact).toBe(true);
    expect(back.sections).toEqual(s);
    expect(composeReportBody(back.sections)).toBe(body);
  });

  it('round-trips every single-section report', () => {
    for (const id of REPORT_SECTION_IDS) {
      const s = { ...emptyReportSections(), [id]: 'Only this section has text.' };
      const body = composeReportBody(s);
      const back = parseReportBody(body);
      expect(back.exact, id).toBe(true);
      expect(back.sections, id).toEqual(s);
    }
  });

  it('round-trips every contiguous and non-contiguous subset of two sections', () => {
    for (let i = 0; i < REPORT_SECTION_IDS.length; i += 1) {
      for (let j = i + 1; j < REPORT_SECTION_IDS.length; j += 1) {
        const a = REPORT_SECTION_IDS[i];
        const b = REPORT_SECTION_IDS[j];
        const s = { ...emptyReportSections(), [a]: `text for ${a}`, [b]: `text for ${b}` };
        const body = composeReportBody(s);
        const back = parseReportBody(body);
        expect(back.exact, `${a}+${b}`).toBe(true);
        expect(back.sections, `${a}+${b}`).toEqual(s);
      }
    }
  });

  it('keeps a mid-line ## as ordinary text, because only a line start is a heading', () => {
    const s = { ...emptyReportSections(), summary: 'We discussed ## issue 4 at length.' };
    const body = composeReportBody(s);
    const back = parseReportBody(body);
    expect(back.exact).toBe(true);
    expect(back.sections.summary).toBe('We discussed ## issue 4 at length.');
  });

  it('round-trips a section containing the author’s own Markdown heading', () => {
    // The case the reliability pass fixed. Typing a heading inside a section
    // is ordinary investigator behaviour and now survives exactly.
    const s = { ...emptyReportSections(), summary: 'Context.\n\n## My own heading\n\nMore.' };
    const body = composeReportBody(s);
    const back = parseReportBody(body);
    expect(back.exact).toBe(true);
    expect(back.sections).toEqual(s);
    expect(bodyRoundTripsExactly(body)).toBe(true);
  });

  it('splits — losslessly — when the author types one of OUR headings inside another section', () => {
    // The honest residual ambiguity. "## Overall summary" is a section marker,
    // so typing it inside Matters moves the text that follows into Summary.
    // NOT A LOSS: the round trip is still byte-exact, every word survives,
    // and the only consequence is that the text reopens in two boxes rather
    // than one. Asserted so the behaviour is known rather than discovered.
    const s = { ...emptyReportSections(), matters: 'Context.\n\n## Overall summary\n\nMore.' };
    const body = composeReportBody(s);
    const back = parseReportBody(body);
    expect(back.exact).toBe(true);
    expect(back.sections.matters).toBe('Context.');
    expect(back.sections.summary).toBe('More.');
    expect(composeReportBody(back.sections)).toBe(body);   // nothing lost
  });

  it('preserves awkward whitespace that contains no heading marker', () => {
    const awkward = 'Line one.\n\n\nLine four.\n  indented\n- a list\n\n**bold** text';
    const s = { ...emptyReportSections(), assessment: awkward };
    const body = composeReportBody(s);
    const back = parseReportBody(body);
    expect(back.exact).toBe(true);
    expect(back.sections.assessment).toBe(awkward);
  });

  it('omits an empty section rather than writing an empty heading', () => {
    const body = composeReportBody({ ...emptyReportSections(), summary: 'Only a summary.' });
    expect(body).toBe('## Overall summary\n\nOnly a summary.');
    expect(body).not.toMatch(/Matters under investigation/);
  });

  it('treats a whitespace-only section as empty', () => {
    const body = composeReportBody({ ...emptyReportSections(), matters: '   \n\n  ', summary: 'x' });
    expect(body).toBe('## Overall summary\n\nx');
  });

  it('composes nothing from nothing', () => {
    expect(composeReportBody(emptyReportSections())).toBe('');
    const back = parseReportBody('');
    expect(back.exact).toBe(true);
    expect(back.sections).toEqual(emptyReportSections());
  });
});

describe('B3.2-1 — parse refuses somebody else’s document rather than guessing', () => {
  const inexact = (body, why) => {
    const r = parseReportBody(body);
    expect(r.exact, why).toBe(false);
    expect(r.sections, why).toEqual(emptyReportSections());
    expect(r.raw, why).toBe(body);
  };

  it('refuses a legacy report with no headings at all', () => {
    inexact('INVESTIGATION REPORT\n\nThis is a report written before Compass had sections.', 'no headings');
  });

  it('KEEPS an unrecognised heading as ordinary text instead of refusing', () => {
    // Changed deliberately in the reliability pass. An investigator writing
    // "## Appendices" inside a section used to make the whole report
    // unparseable and throw the editor into raw mode for no reason they could
    // see. Their text was never lost, but that is the "unusable or confusing
    // document" outcome worth removing. It is safe because
    // bodyRoundTripsExactly still gates every load on byte-exact
    // recomposition — see the round-trip assertions above.
    const body = '## Matters under investigation\n\nx\n\n## Appendices\n\ny';
    const r = parseReportBody(body);
    expect(r.exact).toBe(true);
    expect(r.sections.matters).toBe('x\n\n## Appendices\n\ny');
    expect(composeReportBody(r.sections)).toBe(body);
  });

  it('refuses text before the first heading, which would otherwise be dropped', () => {
    inexact('A preamble nobody asked for.\n\n## Overall summary\n\nx', 'preamble');
  });

  it('refuses our headings in the wrong order, because reordering rewrites the document', () => {
    inexact('## Overall summary\n\nx\n\n## Matters under investigation\n\ny', 'out of order');
  });

  it('refuses a duplicated heading, which seven fields cannot represent', () => {
    inexact('## Overall summary\n\nx\n\n## Overall summary\n\ny', 'duplicate');
  });

  it('CONTROL — the same assertions pass for a document compose produced', () => {
    const body = composeReportBody(filled());
    const r = parseReportBody(body);
    expect(r.exact).toBe(true);
    expect(r.sections).not.toEqual(emptyReportSections());
  });
});

describe('B3.2-1 — bodyRoundTripsExactly gates loading a version into the editor', () => {
  it('accepts a body this editor wrote', () => {
    expect(bodyRoundTripsExactly(composeReportBody(filled()))).toBe(true);
  });

  it('rejects a legacy body, so the editor shows the real text instead of a rearrangement', () => {
    expect(bodyRoundTripsExactly('A legacy report with no headings.')).toBe(false);
  });

  it('rejects a body that parses but would not recompose identically', () => {
    // Extra blank lines between heading and text: parse strips them, so
    // recomposing would change the stored bytes.
    const body = '## Overall summary\n\n\n\nx';
    expect(parseReportBody(body).exact).toBe(true);
    expect(bodyRoundTripsExactly(body)).toBe(false);
  });

  it('is total on rubbish input', () => {
    for (const v of [null, undefined, 42, {}, []]) {
      expect(() => bodyRoundTripsExactly(v)).not.toThrow();
      expect(bodyRoundTripsExactly(v)).toBe(true); // normalises to '' → trivially exact
    }
  });
});

describe('B3.2-1 — emptiness is reported, never filled in', () => {
  it('knows an all-blank draft is empty', () => {
    expect(sectionsAreEmpty(emptyReportSections())).toBe(true);
    expect(sectionsAreEmpty({ ...emptyReportSections(), summary: '  ' })).toBe(true);
    expect(sectionsAreEmpty({ ...emptyReportSections(), summary: 'x' })).toBe(false);
  });

  it('lists which sections are outstanding, so an incomplete draft looks incomplete', () => {
    const ids = emptySectionIds({ ...emptyReportSections(), summary: 'x', matters: 'y' });
    expect(ids).toEqual(['evidence', 'accounts', 'assessment', 'positions', 'uncertainties']);
  });

  it('normalises any rubbish into seven strings without throwing', () => {
    for (const v of [null, undefined, 42, 'str', [], { matters: 7, summary: null }]) {
      const n = normaliseSections(v);
      expect(Object.keys(n).sort()).toEqual([...REPORT_SECTION_IDS].sort());
      for (const id of REPORT_SECTION_IDS) expect(typeof n[id]).toBe('string');
    }
  });

  it('invents no text for an empty section — every value is the empty string', () => {
    const e = emptyReportSections();
    for (const id of REPORT_SECTION_IDS) expect(e[id]).toBe('');
  });
});
