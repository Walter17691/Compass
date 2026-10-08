// ─────────────────────────────────────────────────────────────────────────
// TURNING A MARKDOWN DOCUMENT INTO PDF STRUCTURE.
//
// ┌─ THE DEFECTS THIS CLOSES (PDF-01b) ─────────────────────────────────────┐
// │ Human UAT downloaded the 7-page investigation report and found:           │
// │                                                                         │
// │ 1. Literal ###, --- and * in the PDF. buildDocumentPDF had an ad-hoc      │
// │    regex chain covering ONLY ## , # , **bold** and -/* bullets:           │
// │                                                                         │
// │      .replace(/^## (.+)$/gm,"\n$1\n").replace(/^# (.+)$/gm,"\n$1\n")      │
// │      .replace(/\*\*(.+?)\*\*/g,"$1").replace(/^[-*] /gm,"  - ")           │
// │                                                                         │
// │    `### Background` matches NEITHER heading pattern (position 2 is `#`,    │
// │    not a space), so it survived verbatim. `---`, single-asterisk emphasis  │
// │    and `1.` ordered lists were never handled at all. Verified by running   │
// │    the real chain: ### => true, --- => true, * => true, 1. => true.       │
// │                                                                         │
// │    The browser preview looked right because it uses a DIFFERENT renderer  │
// │    — MDRenderer — which handles #..######, ---/***, bullets, ordered      │
// │    lists and both emphasis forms. Two renderers, one complete and one     │
// │    partial, is the whole reason preview and export disagreed.            │
// │                                                                         │
// │ 2. "Employee: — | Date: 2026-10-08 | Chair: —". generatePDF read          │
// │    caseInfo, which is the MEETING-SETUP context and defaults to           │
// │      { employee:"", date:<today>, manager:"" }                           │
// │    while openInvestigationReport deliberately does not set it. So the      │
// │    header showed two em-dashes and TODAY's date — not the report's own    │
// │    generation date of 2026-10-07. Worse than missing: misleading.        │
// │                                                                         │
// │ 3. "Letter_Letter_08-10-2026.pdf", from                                  │
// │      `${caseInfo.employee||"Letter"}_${meetingType?.label||"Letter"}_…`   │
// │    with both inputs absent on this route.                                 │
// └─────────────────────────────────────────────────────────────────────────┘
//
// NOTHING IS STRIPPED AND FLATTENED. The parser turns markers into typed
// blocks, and the renderer gives each block real PDF structure — heading sizes
// and weights, a drawn rule for ---, indented bullets with glyphs, spacing.
// Every character of prose survives, in order.
//
// SAFETY: text only ever reaches jsPDF's doc.text(), which draws glyphs. There
// is no HTML path, no innerHTML, and nothing is evaluated. Report content cannot
// become executable.
//
// TYPOGRAPHY, HONESTLY: Compass is Archivo, but jsPDF ships only helvetica,
// times and courier, and embedding a webfont would mean shipping a font binary
// through the lazy chunk. So the PDF keeps helvetica — as it always has — and
// adopts the Compass COLOUR values, which jsPDF does support. Archivo in PDFs is
// a deliberate deferral, recorded, not an oversight.
// ─────────────────────────────────────────────────────────────────────────

/** Compass colours, as jsPDF RGB triples. */
export const PDF_COLOR = Object.freeze({
  ink: [15, 18, 36],        // #0F1224 navy
  inkSoft: [74, 78, 99],
  inkFaint: [138, 142, 163],
  violet: [122, 47, 216],   // #7A2FD8
  rule: [232, 234, 242],    // #E8EAF2
});

export const BLOCK = Object.freeze({
  H1: 'h1', H2: 'h2', H3: 'h3', PARAGRAPH: 'p',
  BULLET: 'bullet', ORDERED: 'ordered', RULE: 'rule', SPACER: 'spacer',
});

/** Strip inline emphasis markers, keeping the emphasised words. */
function inlineText(line) {
  return line
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1$2')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/**
 * Parse the Markdown subset the report generator actually emits into blocks.
 *
 * Deliberately the SAME subset MDRenderer handles, so preview and export agree:
 * headings (one to six hashes), horizontal rules (three or more dashes,
 * asterisks or underscores), bullets, ordered items,
 * paragraphs, and blank lines as spacing. Anything unrecognised stays a
 * paragraph — text is never discarded.
 */
export function parseMarkdownBlocks(text) {
  if (typeof text !== 'string' || text.trim() === '') return [];
  const blocks = [];
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (!t) {
      // Collapse runs of blank lines into one spacer; never two in a row.
      if (blocks.length && blocks[blocks.length - 1].type !== BLOCK.SPACER) {
        blocks.push({ type: BLOCK.SPACER, text: '' });
      }
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { blocks.push({ type: BLOCK.RULE, text: '' }); continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(t);
    if (heading) {
      const level = heading[1].length;
      blocks.push({
        type: level <= 1 ? BLOCK.H1 : level === 2 ? BLOCK.H2 : BLOCK.H3,
        text: inlineText(heading[2]).trim(),
      });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(t);
    if (bullet) { blocks.push({ type: BLOCK.BULLET, text: inlineText(bullet[1]).trim() }); continue; }
    const ordered = /^(\d+)[.)]\s+(.*)$/.exec(t);
    if (ordered) {
      blocks.push({ type: BLOCK.ORDERED, ordinal: ordered[1], text: inlineText(ordered[2]).trim() });
      continue;
    }
    blocks.push({ type: BLOCK.PARAGRAPH, text: inlineText(t) });
  }
  // A trailing spacer prints nothing useful.
  while (blocks.length && blocks[blocks.length - 1].type === BLOCK.SPACER) blocks.pop();
  return blocks;
}

const STYLE = Object.freeze({
  [BLOCK.H1]: { size: 15, weight: 'bold', color: PDF_COLOR.violet, before: 7, after: 3.5, rule: true },
  [BLOCK.H2]: { size: 13, weight: 'bold', color: PDF_COLOR.violet, before: 6, after: 3, rule: false },
  [BLOCK.H3]: { size: 11, weight: 'bold', color: PDF_COLOR.ink, before: 4.5, after: 2, rule: false },
  [BLOCK.PARAGRAPH]: { size: 10.5, weight: 'normal', color: PDF_COLOR.ink, before: 0, after: 2.5, rule: false },
  [BLOCK.BULLET]: { size: 10.5, weight: 'normal', color: PDF_COLOR.ink, before: 0, after: 1.5, rule: false },
  [BLOCK.ORDERED]: { size: 10.5, weight: 'normal', color: PDF_COLOR.ink, before: 0, after: 1.5, rule: false },
});

/**
 * Draw parsed blocks, flowing across pages.
 *
 * Returns the final y. The caller owns the page frame (margins, footer); this
 * owns the body. A block that would cross the bottom margin starts a new page
 * rather than being clipped, and a heading never strands itself at the foot of a
 * page with its first line of body overleaf.
 */
export function renderMarkdownBlocks(doc, blocks, {
  margin = 20, top = 20, bottom = 272, lineHeight = 5.2, onNewPage = null,
  // Continuation pages start at a normal top margin, NOT at the first page's
  // post-header offset. Visual inspection of a rendered 5-page report caught
  // page 3 beginning ~43mm down with a band of empty space, because every new
  // page reused `top`.
  continuationTop = 20,
} = {}) {
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  let y = top;

  const newPage = () => { doc.addPage(); y = continuationTop; onNewPage?.(doc); };
  const room = need => { if (y + need > bottom) newPage(); };

  for (const [i, block] of blocks.entries()) {
    if (block.type === BLOCK.SPACER) { y += 2.5; continue; }

    if (block.type === BLOCK.RULE) {
      room(6);
      y += 2;
      doc.setDrawColor(...PDF_COLOR.rule); doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 4;
      continue;
    }

    const s = STYLE[block.type] || STYLE[BLOCK.PARAGRAPH];
    const indent = (block.type === BLOCK.BULLET || block.type === BLOCK.ORDERED) ? 6 : 0;
    const marker = block.type === BLOCK.BULLET ? '•'
      : block.type === BLOCK.ORDERED ? `${block.ordinal}.` : null;

    doc.setFontSize(s.size);
    doc.setFont('helvetica', s.weight);
    const lines = doc.splitTextToSize(block.text || ' ', maxW - indent);

    y += s.before;
    // Keep a heading with at least its first body line.
    const needed = lines.length * lineHeight + (s.rule ? 3 : 0)
      + (block.type === BLOCK.H1 || block.type === BLOCK.H2 || block.type === BLOCK.H3 ? lineHeight : 0);
    room(needed);

    doc.setTextColor(...s.color);
    lines.forEach((line, li) => {
      if (y + lineHeight > bottom) { newPage(); doc.setFontSize(s.size); doc.setFont('helvetica', s.weight); doc.setTextColor(...s.color); }
      if (marker && li === 0) {
        doc.text(marker, margin, y);
      }
      doc.text(line, margin + indent, y);
      y += lineHeight;
    });

    if (s.rule) {
      doc.setDrawColor(...PDF_COLOR.violet); doc.setLineWidth(0.4);
      doc.line(margin, y - lineHeight + 1.8, pageW - margin, y - lineHeight + 1.8);
      y += 1.5;
    }
    y += s.after;
    if (i === blocks.length - 1) break;
  }
  return y;
}

// ─────────────────────────────────────────────────────────────────────────
// DOCUMENT METADATA — KNOWN VALUES ONLY.
// ─────────────────────────────────────────────────────────────────────────

const clean = v => (typeof v === 'string' ? v.trim() : '');

/**
 * The header rows for a document, omitting anything not reliably known.
 *
 * A row is ABSENT rather than em-dashed, because "Chair: —" reads as a
 * statement about the case when it was only ever a statement about the UI's
 * state. Nothing is defaulted, inferred or invented: no today-date standing in
 * for a generation date, no "HR Manager" standing in for an investigator.
 *
 * An investigation with no identified subject therefore prints no subject row,
 * which is the truthful rendering of a fact-finding investigation.
 */
export function documentHeaderRows({ reference, subject, investigator, generatedAt, generatedLabel = 'Report generated' } = {}) {
  const rows = [];
  if (clean(reference)) rows.push({ label: 'Case', value: clean(reference) });
  if (clean(subject)) rows.push({ label: 'Employee', value: clean(subject) });
  if (clean(investigator)) rows.push({ label: 'Investigator', value: clean(investigator) });
  if (clean(generatedAt)) rows.push({ label: generatedLabel, value: clean(generatedAt) });
  return rows;
}

/** Filesystem-safe token: no separators, no reserved characters, bounded. */
export function safeFileToken(value, fallback = 'Compass') {
  const token = clean(value)
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 60);
  return token || fallback;
}

/**
 * A document's download filename.
 *
 * The old shape was `${employee||"Letter"}_${meetingType||"Letter"}_${date}` —
 * which produced "Letter_Letter_08-10-2026.pdf" whenever both inputs were
 * absent, as they are on the report route. Parts that are unknown are now
 * omitted rather than filled with the word "Letter".
 */
export function exportFileName({ docLabel, reference, date = new Date() } = {}) {
  const iso = date instanceof Date && !Number.isNaN(date.valueOf())
    ? date.toISOString().slice(0, 10)
    : String(date).slice(0, 10);
  const parts = [safeFileToken(docLabel, 'Document')];
  const ref = safeFileToken(reference, '');
  if (ref) parts.push(ref);
  parts.push(iso);
  return `${parts.join('_')}.pdf`;
}
