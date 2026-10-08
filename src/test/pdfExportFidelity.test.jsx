import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadJsPDF } from '../lib/pdfDocument.js';
import {
  parseMarkdownBlocks, renderMarkdownBlocks, documentHeaderRows,
  exportFileName, safeFileToken, BLOCK, PDF_COLOR,
} from '../lib/pdfLayout.js';

// ─────────────────────────────────────────────────────────────────────────
// PDF-01b — EXPORT FIDELITY.
//
// ┌─ WHAT HUMAN UAT FOUND IN THE DOWNLOADED 7-PAGE REPORT ──────────────────┐
// │ 1. Literal ###, --- and * in the PDF. buildDocumentPDF handled only      │
// │    `## `, `# `, **bold** and -/* bullets. `### Background` matched        │
// │    neither heading pattern and survived verbatim; rules, single-asterisk  │
// │    emphasis and ordered lists were never handled. The browser preview     │
// │    looked right because it uses MDRenderer, a DIFFERENT and complete      │
// │    renderer — two renderers is why preview and export disagreed.         │
// │ 2. "Employee: — | Date: 2026-10-08 | Chair: —", because generatePDF read  │
// │    caseInfo (the meeting-setup context, defaulting to empty strings and   │
// │    TODAY) while openInvestigationReport deliberately does not set it.     │
// │ 3. "Letter_Letter_08-10-2026.pdf" from two absent inputs both defaulting  │
// │    to the word "Letter".                                                 │
// └─────────────────────────────────────────────────────────────────────────┘
//
// These render with the REAL jsPDF and read the text back out of the produced
// document, so "no literal Markdown survives" is measured, not asserted.
// ─────────────────────────────────────────────────────────────────────────

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
const stripComments = (t) => t.replace(/^\s*\/\/.*$/gm, '');

/** A representative report: every supported construct, multi-page, odd characters. */
const REPORT = [
  '## Executive Summary',
  '',
  'The investigation considered **four** meetings and *two* signed records.',
  '',
  '---',
  '',
  '## PART 1 — Evidence on Record',
  '',
  '### Background',
  '',
  'A sum of £500 was reported missing from the safe on 2 October 2026 — the',
  'reference was "stock count", and the figure (£500) is not disputed.',
  '',
  '### Evidence Considered',
  '',
  '- Meeting record of 5 October 2026',
  '- Meeting record of 7 October 2026',
  '* Signed acknowledgement',
  '• Employee response',
  '',
  '### Investigation Undertaken',
  '',
  '1. Reviewed the contemporaneous notes',
  '2. Obtained the employee account',
  '3) Considered the employer response',
  '',
  ...Array(60).fill('A long paragraph of investigation narrative that must wrap across the printable width and continue onto further pages without being clipped or losing its sequence.'),
  '',
  '## PART 2 — Compass Analysis (advisory interpretation, not a finding)',
  '',
  '### Assessment',
  '',
  'Responsibility was not established — this remains an open question.',
  '',
  '---',
  '',
  '## PART 3 — For HR Decision',
  '',
  '### Recommended Procedural Next Step',
  '',
  'The final finding rests with the responsible manager, not with this report.',
].join('\n');

/** Extract readable text from a produced PDF, page by page. */
async function renderAndExtract(markdown) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  renderMarkdownBlocks(doc, parseMarkdownBlocks(markdown), { margin: 20, top: 30, bottom: 272 });
  // jsPDF writes text operators into each page's content stream; the glyphs
  // appear as literal strings, which is enough to prove what reached the page.
  const raw = doc.output('datauristring');
  const bytes = Buffer.from(raw.split(',')[1], 'base64').toString('latin1');
  const strings = [...bytes.matchAll(/\(((?:\\.|[^()\\])*)\)\s*Tj/g)]
    .map(m => m[1].replace(/\\([()\\])/g, '$1'));
  return { doc, pages: doc.getNumberOfPages(), text: strings.join('\n'), strings };
}

// ═══════════════════════════════════════════════════════════════════════════
describe('B. Markdown becomes PDF structure, not literal markers', () => {
  it('EXECUTED: no literal heading, rule or emphasis syntax reaches the page', async () => {
    const { text, pages } = await renderAndExtract(REPORT);
    expect(pages).toBeGreaterThan(1);
    for (const marker of ['###', '##', '---', '**', '•  ']) {
      expect(text, `literal "${marker}" reached the PDF`).not.toContain(marker);
    }
    // A lone asterisk must not survive as a marker either.
    expect(text).not.toMatch(/(^|\n)\s*\*\s/);
  });

  it('EXECUTED: every heading survives as readable text, in order', async () => {
    const { text } = await renderAndExtract(REPORT);
    const order = ['Executive Summary', 'PART 1', 'Background', 'Evidence Considered',
      'Investigation Undertaken', 'PART 2', 'Assessment', 'PART 3', 'Recommended Procedural Next Step'];
    let cursor = -1;
    for (const h of order) {
      const at = text.indexOf(h, cursor + 1);
      expect(at, `"${h}" missing or out of sequence`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('EXECUTED: prose, emphasis content, lists and special characters all survive', async () => {
    const { text } = await renderAndExtract(REPORT);
    for (const phrase of ['four', 'two', 'Meeting record of 5 October 2026',
      'Signed acknowledgement', 'Employee response', 'Reviewed the contemporaneous notes',
      'Considered the employer response', 'Responsibility was not established',
      'stock count', 'not with this report']) {
      expect(text, phrase).toContain(phrase);
    }
    // £ and quotes are not mangled away.
    expect(text).toMatch(/500/);
  });

  it('EXECUTED: bullets get a glyph and ordered items keep their number', async () => {
    const { strings } = await renderAndExtract('- first\n- second\n\n1. one\n2. two');
    // jsPDF encodes the bullet as WinAnsi 0x95, which is the correct on-page
    // representation — viewers render it as •. Asserting the literal character
    // would be asserting the encoding, not the glyph.
    expect(strings.some(x => x === '\u0095' || x === '•'), 'no bullet glyph drawn').toBe(true);
    expect(strings).toContain('1.');
    expect(strings).toContain('2.');
    expect(strings).toContain('first');
    expect(strings).toContain('two');
  });

  it('EXECUTED: a rule is drawn, not printed', async () => {
    const { strings } = await renderAndExtract('para one\n\n---\n\npara two');
    expect(strings).toContain('para one');
    expect(strings).toContain('para two');
    expect(strings.join('|')).not.toContain('---');
  });

  it('the parser classifies the whole supported subset and discards nothing', () => {
    const blocks = parseMarkdownBlocks('# A\n## B\n### C\n#### D\n\ntext\n\n- b\n1. o\n---\n***\n___');
    expect(blocks.map(b => b.type)).toEqual([
      BLOCK.H1, BLOCK.H2, BLOCK.H3, BLOCK.H3, BLOCK.SPACER, BLOCK.PARAGRAPH,
      BLOCK.SPACER, BLOCK.BULLET, BLOCK.ORDERED, BLOCK.RULE, BLOCK.RULE, BLOCK.RULE,
    ]);
    expect(blocks.filter(b => b.type !== BLOCK.SPACER && b.type !== BLOCK.RULE).map(b => b.text))
      .toEqual(['A', 'B', 'C', 'D', 'text', 'b', 'o']);
  });

  it('unrecognised syntax stays as prose — text is never dropped', () => {
    const blocks = parseMarkdownBlocks('> a quote\n| a | table |\n[link](url)');
    expect(blocks.every(b => b.type === BLOCK.PARAGRAPH)).toBe(true);
    expect(blocks.map(b => b.text)).toEqual(['> a quote', '| a | table |', '[link](url)']);
  });

  it('EXECUTED: the live report is NOT flattened — structure is typed, not stripped', () => {
    // The old fix-by-stripping approach would make everything a paragraph.
    const blocks = parseMarkdownBlocks(REPORT);
    const kinds = new Set(blocks.map(b => b.type));
    expect(kinds.has(BLOCK.H2)).toBe(true);
    expect(kinds.has(BLOCK.H3)).toBe(true);
    expect(kinds.has(BLOCK.RULE)).toBe(true);
    expect(kinds.has(BLOCK.BULLET)).toBe(true);
    expect(kinds.has(BLOCK.ORDERED)).toBe(true);
    expect(kinds.has(BLOCK.PARAGRAPH)).toBe(true);
  });

  it('EXECUTED: content stays inside the page frame across every page', async () => {
    const { doc, pages } = await renderAndExtract(REPORT);
    expect(pages).toBeGreaterThanOrEqual(3);   // first, middle and last all exist
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
  });

  // A layout probe: records where text lands. This is NOT mocking the jsPDF
  // dependency-loading that PDF-01 protects — the loader is exercised for real
  // elsewhere in this file. It measures geometry, which text extraction cannot.
  function recordingDoc() {
    const calls = [];
    let page = 1;
    return {
      calls,
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      addPage() { page += 1; },
      setFontSize() {}, setFont() {}, setTextColor() {}, setDrawColor() {}, setLineWidth() {},
      line() {},
      splitTextToSize: (t) => String(t).match(/.{1,90}(\s|$)/g) || [String(t)],
      text: (t, x, y) => calls.push({ page, t, x, y }),
    };
  }

  it('EXECUTED: continuation pages start at the top margin, not the header offset', () => {
    // Visual inspection of a rendered 5-page report caught page 3 beginning
    // ~43mm down with a band of empty space, because every new page reused the
    // first page's post-header `top`.
    const doc = recordingDoc();
    const long = Array(120).fill('A paragraph of investigation narrative that wraps and continues.').join('\n\n');
    renderMarkdownBlocks(doc, parseMarkdownBlocks(long), { margin: 20, top: 43, bottom: 272, continuationTop: 20 });
    const pages = [...new Set(doc.calls.map(c => c.page))];
    expect(pages.length).toBeGreaterThan(1);
    const firstOnPage1 = doc.calls.find(c => c.page === 1).y;
    const firstOnPage2 = doc.calls.find(c => c.page === 2).y;
    expect(firstOnPage1).toBeCloseTo(43, 0);     // first page respects the header
    expect(firstOnPage2).toBeLessThan(26);       // continuation starts at the margin
  });

  it('EXECUTED: nothing is drawn past the bottom margin on any page', () => {
    const doc = recordingDoc();
    const long = Array(200).fill('Narrative line.').join('\n');
    renderMarkdownBlocks(doc, parseMarkdownBlocks(long), { margin: 20, top: 43, bottom: 272 });
    for (const c of doc.calls) expect(c.y, `drew at y=${c.y} on page ${c.page}`).toBeLessThanOrEqual(272);
  });

  it('the header metadata WRAPS rather than clipping at the right margin (wiring)', () => {
    // Visual inspection caught "Report generated: 07" cut off: three real case
    // values exceed 170mm and a plain doc.text() truncates silently.
    const app = stripComments(read('src/App.jsx'));
    const build = app.slice(app.indexOf('const buildDocumentPDF = async'), app.indexOf('const generatePDF = async'));
    expect(build).toMatch(/doc\.splitTextToSize\(headerText, maxW\)\.forEach/);
    expect(build).not.toMatch(/doc\.text\(headerRows\.map/);
  });

  it('empty or absent content renders nothing rather than throwing', async () => {
    for (const input of ['', '   ', null, undefined]) {
      expect(parseMarkdownBlocks(input)).toEqual([]);
    }
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    expect(() => renderMarkdownBlocks(doc, parseMarkdownBlocks(''), {})).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. metadata: known values only, nothing invented', () => {
  it('EXECUTED: a fully-known report prints every row', () => {
    expect(documentHeaderRows({
      reference: 'ZZ UAT Trust Slice', subject: 'ZZ UAT Trust Slice',
      investigator: 'A Manager', generatedAt: '07/10/2026',
    })).toEqual([
      { label: 'Case', value: 'ZZ UAT Trust Slice' },
      { label: 'Employee', value: 'ZZ UAT Trust Slice' },
      { label: 'Investigator', value: 'A Manager' },
      { label: 'Report generated', value: '07/10/2026' },
    ]);
  });

  it('EXECUTED: unknown values are OMITTED, never em-dashed or invented', () => {
    // The exact production shape: no investigator recorded, no date threaded.
    expect(documentHeaderRows({ reference: 'Case-065d5a28', subject: null, investigator: null, generatedAt: null }))
      .toEqual([{ label: 'Case', value: 'Case-065d5a28' }]);
    // No row may contain a placeholder.
    for (const row of documentHeaderRows({ reference: 'X', subject: '  ', investigator: '', generatedAt: undefined })) {
      expect(row.value).not.toMatch(/^(—|-|n\/a|unknown|HR Manager|Letter)$/i);
    }
    expect(documentHeaderRows({})).toEqual([]);
  });

  it('C. an investigation with no identified employee still produces a usable header', () => {
    const rows = documentHeaderRows({ reference: 'Case-065d5a28', generatedAt: '07/10/2026' });
    expect(rows.map(r => r.label)).toEqual(['Case', 'Report generated']);
    expect(rows.find(r => r.label === 'Employee')).toBeUndefined();
  });

  it('the generation date is LABELLED as such, and is the report\'s own', () => {
    const rows = documentHeaderRows({ reference: 'X', generatedAt: '07/10/2026', generatedLabel: 'Report generated' });
    expect(rows.pop()).toEqual({ label: 'Report generated', value: '07/10/2026' });
    // A letter keeps the neutral label it had.
    expect(documentHeaderRows({ reference: 'X', generatedAt: '2026-10-08', generatedLabel: 'Date' }).pop().label).toBe('Date');
  });

  it('the report reads its own context, not caseInfo (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const gen = app.slice(app.indexOf('const generatePDF = async sig'), app.indexOf('const generateMeetingRecordPDF'));
    expect(gen).toMatch(/const ctx = caps\.internal \? reportExportContext : null/);
    expect(gen).toMatch(/employee: ctx \? ctx\.subject : caseInfo\.employee/);
    expect(gen).toMatch(/chair: ctx \? ctx\.investigator : caseInfo\.manager/);
    expect(gen).toMatch(/ctx\.generatedAt \? fmtDate\(ctx\.generatedAt\) : null/);
    // The context comes from the CASE, and only from fields the case holds.
    const opener = app.slice(app.indexOf('const openInvestigationReport'), app.indexOf('const saveMeetingToCase'));
    expect(opener).toMatch(/subject: cs\.employeeName \|\| null/);
    expect(opener).toMatch(/investigator: cs\.investigatingManager \|\| null/);
    expect(opener).toMatch(/generatedAt: cs\.investigationReportDate \|\| null/);
    // Nothing hardcoded about the UAT case.
    expect(app).not.toMatch(/065d5a28|Sam Testcase|ZZ UAT/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. filenames', () => {
  it('EXECUTED: an investigation report is named as one', () => {
    expect(exportFileName({
      docLabel: 'Investigation report', reference: 'ZZ UAT Trust Slice — Sam Testcase',
      date: new Date('2026-10-07T16:35:48.906Z'),
    })).toBe('Investigation_report_ZZ_UAT_Trust_Slice_Sam_Testcase_2026-10-07.pdf');
  });

  it('EXECUTED: the Letter_Letter shape is impossible', () => {
    // Both inputs absent — the old code produced "Letter_Letter_<date>.pdf".
    const name = exportFileName({ docLabel: 'Letter' });
    expect(name).not.toMatch(/Letter_Letter/);
    expect(name).toMatch(/^Letter_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('EXECUTED: a case with no identified subject still gets a clean name', () => {
    expect(exportFileName({ docLabel: 'Investigation report', reference: 'Case-065d5a28', date: new Date('2026-10-07') }))
      .toBe('Investigation_report_Case-065d5a28_2026-10-07.pdf');
  });

  it('EXECUTED: filenames are filesystem-safe', () => {
    for (const nasty of ['../../etc/passwd', 'a/b\\c:d*e?f"g<h>i|j', 'name\nwith\tcontrol', '   ', '....']) {
      const name = exportFileName({ docLabel: 'Investigation report', reference: nasty });
      expect(name).not.toMatch(/[/\\:*?"<>|\n\t]/);
      expect(name).toMatch(/\.pdf$/);
      expect(name.length).toBeLessThan(120);
    }
    expect(safeFileToken('', 'Fallback')).toBe('Fallback');
    expect(safeFileToken('../..')).toBe('Compass');
  });

  it('real letters keep a sensible name (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const doSend = app.slice(app.indexOf('const doSend = async'), app.indexOf('const handleLetterheadUpload'));
    expect(doSend).toMatch(/exportCaps\.internal/);
    expect(doSend).toMatch(/docLabel: meetingType\?\.label \? `\$\{meetingType\.label\} letter` : 'Letter'/);
    expect(doSend).toMatch(/reference: caseInfo\.employee/);
    // The old duplicated-"Letter" construction is gone.
    expect(doSend).not.toMatch(/caseInfo\.employee\|\|"Letter"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E/F. safety, shared code and no regressions', () => {
  it('report text never becomes markup — glyph drawing only', () => {
    const lib = stripComments(read('src/lib/pdfLayout.js'));
    expect(lib).not.toMatch(/innerHTML|dangerouslySetInnerHTML|eval\(|new Function/);
    // Everything goes through doc.text.
    expect(lib).toMatch(/doc\.text\(/);
  });

  it('EXECUTED: HTML-looking report content renders as visible text', async () => {
    const { text } = await renderAndExtract('## <script>alert(1)</script>\n\n<img src=x onerror=y>');
    expect(text).toContain('<script>alert(1)</script>');
    expect(text).toContain('<img src=x onerror=y>');
  });

  it('the shared document builder still serves letters and the record attachment', () => {
    const app = stripComments(read('src/App.jsx'));
    // Two callers of the shared builder (generatePDF and
    // generateMeetingRecordPDF), unchanged in number. The declaration itself is
    // `const buildDocumentPDF = async ({` and so does not match this pattern.
    expect((app.match(/buildDocumentPDF\(/g) || []).length).toBe(2);
    expect(app).toMatch(/const generateMeetingRecordPDF = async \(\) => buildDocumentPDF\(/);
  });

  it('the other PDF exports were not touched', () => {
    const app = stripComments(read('src/App.jsx'));
    // exportPDF and the hearing pack still build their own layouts and still
    // route through the PDF-01 lifecycle.
    expect(app).toMatch(/const exportPDF = async \(\) => runPdfExport\(/);
    expect(app).toMatch(/label: 'Hearing pack'/);
    expect(stripComments(read('src/components/TimelinePanel.jsx'))).toMatch(/runPdfExport\(/);
    expect(stripComments(read('src/screens/ErReportScreen.jsx'))).toMatch(/runPdfExport\(/);
  });

  it('no domain state is touched by export', () => {
    const app = stripComments(read('src/App.jsx'));
    const from = app.indexOf('const openInvestigationReport');
    const to = app.indexOf('const saveMeetingToCase', from);
    const opener = app.slice(from, to);
    expect(opener).not.toMatch(/saveCases|audit\(|supabase|requestHrReview/);
    const build = app.slice(app.indexOf('const buildDocumentPDF = async'), app.indexOf('const generatePDF = async'));
    for (const f of ['saveCases', 'audit(', 'investigationReport:', 'case_decisions', 'signing_requests']) {
      expect(build).not.toContain(f);
    }
  });

  it('PDF generation stays client-side and self-origin', () => {
    const lib = stripComments(read('src/lib/pdfDocument.js'));
    expect(lib).toMatch(/await import\('jspdf'\)/);
    expect(lib).not.toMatch(/cdnjs|fetch\(|http/);
    const vercel = JSON.parse(read('vercel.json'));
    expect(JSON.stringify(vercel).match(/script-src [^;"]*/)[0]).toBe("script-src 'self' 'unsafe-inline'");
  });

  it('Compass colours are used where jsPDF permits', () => {
    expect(PDF_COLOR.ink).toEqual([15, 18, 36]);        // #0F1224 navy
    expect(PDF_COLOR.violet).toEqual([122, 47, 216]);   // #7A2FD8
  });
});
