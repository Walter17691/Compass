import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadJsPDF, runPdfExport, PDF_FAILURE_MESSAGE } from '../lib/pdfDocument.js';
import { documentCapabilities, INVESTIGATION_REPORT_DOC } from '../lib/investigationReportDocument.js';

// ─────────────────────────────────────────────────────────────────────────
// PDF-01 — PDF EXPORT WITHOUT A THIRD-PARTY SCRIPT, AND WITHOUT HANGING.
//
// ┌─ THE DEFECT THIS CLOSES ────────────────────────────────────────────────┐
// │ jsPDF was fetched by injecting a cdnjs.cloudflare.com <script>. The       │
// │ production CSP is `script-src 'self' 'unsafe-inline'`, so the browser    │
// │ refused it. The loader's Promise executor took only `resolve` and had no  │
// │ onerror, so a blocked script left it PENDING FOREVER: no catch ran and no │
// │ loading flag ever cleared. Every PDF feature in Compass had been dead in  │
// │ production since the CSP landed on 2026-08-06.                           │
// │                                                                         │
// │ Five call sites shared it, not three as my first diagnosis said:          │
// │   buildDocumentPDF (letters + investigation report + record attachment)   │
// │   exportPDF (org-wide cases export)                                      │
// │   generateHearingPackPDF (disciplinary hearing pack)                     │
// │   ErReportScreen board report                                            │
// │   TimelinePanel case chronology                                          │
// │ Three of the five had NO loading state and NO error handling at all.      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// These tests exercise the REAL local dependency. loadJsPDF is not mocked —
// mocking it would mock away the exact thing being protected.
// ─────────────────────────────────────────────────────────────────────────

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
const stripComments = (t) => t.replace(/^\s*\/\/.*$/gm, '');

// ═══════════════════════════════════════════════════════════════════════════
describe('A/B. jsPDF comes from the local dependency, never a CDN', () => {
  it('A. jspdf is a declared application dependency, pinned to the CDN version', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies.jspdf).toBeTruthy();
    // 2.5.1 is exactly what the CDN served, so PDF output is unchanged.
    expect(pkg.dependencies.jspdf).toMatch(/2\.5\.1/);
  });

  it('A. EXECUTED: loadJsPDF resolves a real jsPDF constructor from node_modules', async () => {
    const jsPDF = await loadJsPDF();
    expect(typeof jsPDF).toBe('function');
    // And it genuinely constructs and produces output — not a stub.
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    expect(typeof doc.internal.pageSize.getWidth()).toBe('number');
    expect(typeof doc.output('datauristring')).toBe('string');
  });

  it('B. no PDF code injects a script or references the jsPDF CDN', () => {
    const lib = stripComments(read('src/lib/pdfDocument.js'));
    expect(lib).not.toMatch(/createElement\(["']script["']\)/);
    expect(lib).not.toMatch(/cdnjs|cloudflare/);
    expect(lib).toMatch(/await import\('jspdf'\)/);

    // And the old injector is GONE from App — not left as a second path.
    const app = stripComments(read('src/App.jsx'));
    expect(app).not.toMatch(/jspdf\.umd\.min\.js/);
    expect(app).not.toMatch(/window\.jspdf/);
    expect(app).not.toMatch(/const loadJsPDF = /);
    expect(app).toMatch(/import \{ loadJsPDF, runPdfExport \} from '\.\/lib\/pdfDocument'/);
  });

  it('B. the CSP is not weakened — script-src still allows only self', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const csp = JSON.stringify(vercel).match(/script-src [^;"]*/)[0];
    expect(csp).toBe("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/cdnjs|cloudflare|https:/);
  });

  it('there is exactly ONE jsPDF loading path in the app', () => {
    const sources = ['src/App.jsx', 'src/screens/ErReportScreen.jsx',
      'src/components/TimelinePanel.jsx', 'src/lib/pdfDocument.js'];
    const definitions = sources.filter(f => /(?:const|function)\s+loadJsPDF\s*[=(]/.test(stripComments(read(f))));
    expect(definitions).toEqual(['src/lib/pdfDocument.js']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C/D/E. every PDF consumer can acquire jsPDF and render', () => {
  // Reproduces each caller's actual rendering shape against the real library,
  // rather than asserting that a mock was called.
  it('C. a document PDF (letters / investigation report) builds', async () => {
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const maxW = doc.internal.pageSize.getWidth() - 40;
    doc.setFontSize(18); doc.text('Investigation report', 20, 15);
    doc.splitTextToSize('## Executive Summary\n\nThe investigation considered two meetings.', maxW)
      .forEach((l, i) => doc.text(l, 20, 30 + i * 5));
    expect(doc.output('datauristring')).toMatch(/^data:application\/pdf/);
  });

  it('D. a cases export builds, including multi-page growth', async () => {
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = 20;
    for (let i = 0; i < 120; i += 1) {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(`Case ${i}`, 20, y); y += 5;
    }
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(doc.output('datauristring')).toMatch(/^data:application\/pdf/);
  });

  it('E. a hearing pack builds, and can produce the datauristring + blob it persists', async () => {
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.text('Hearing pack', 20, 20);
    // handleGenerateHearingPack uses both of these.
    expect(doc.output('datauristring')).toMatch(/^data:application\/pdf/);
    expect(typeof doc.output('blob').size).toBe('number');
  });

  it('the real persisted report shape renders without throwing', async () => {
    // The structural shape of the live UAT report: ## / ### / --- / ** and ~15k
    // chars. Content is synthetic; the point is size and markup, not narrative.
    const body = ['## Executive Summary', '', '---', '', '## PART 1 — Evidence on Record',
      '### Background', '**bold** text', ...Array(300).fill('A paragraph of investigation narrative.')].join('\n');
    expect(body.length).toBeGreaterThan(10000);
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const maxW = doc.internal.pageSize.getWidth() - 40;
    let y = 20;
    for (const line of body.split('\n')) {
      for (const l of doc.splitTextToSize(line || ' ', maxW)) {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(l, 20, y); y += 5;
      }
    }
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F/G/H/I. the loading/error invariant', () => {
  it('H. success: busy goes true then false, and no error is raised', async () => {
    const calls = []; const errors = [];
    const result = await runPdfExport(async () => { calls.push('built'); },
      { setBusy: b => calls.push(`busy:${b}`), onError: e => errors.push(e) });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(['busy:true', 'built', 'busy:false']);
    expect(errors).toEqual([]);
  });

  it('F+G. failure: busy is RESET and a plain user-facing error is surfaced', async () => {
    const calls = []; const errors = [];
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runPdfExport(async () => { throw new Error('jsPDF did not load correctly'); },
      { setBusy: b => calls.push(`busy:${b}`), onError: e => errors.push(e) });
    expect(result.ok).toBe(false);
    expect(calls).toEqual(['busy:true', 'busy:false']);     // ← the invariant
    expect(errors).toEqual([PDF_FAILURE_MESSAGE]);
    expect(PDF_FAILURE_MESSAGE).toBe("We couldn't prepare the PDF. Please try again.");
    // No implementation detail leaks to the user, but it IS logged for diagnosis.
    expect(errors[0]).not.toMatch(/jsPDF|import|chunk|CSP|undefined/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('F. a NEVER-SETTLING build cannot be the shape any more — rejection is reached', async () => {
    // The original defect was a pending promise. A rejected one must reach the
    // finally; this is the behaviour the old loader could not produce.
    const calls = [];
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runPdfExport(() => Promise.reject(new Error('blocked')),
      { setBusy: b => calls.push(b) });
    expect(calls).toEqual([true, false]);
    spy.mockRestore();
  });

  it('F. a synchronous throw also resets busy', async () => {
    const calls = [];
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runPdfExport(() => { throw new Error('sync'); }, { setBusy: b => calls.push(b) });
    expect(calls).toEqual([true, false]);
    spy.mockRestore();
  });

  it('I. retry after a failure works — the control is never left disabled', async () => {
    const calls = [];
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let attempt = 0;
    const build = async () => { attempt += 1; if (attempt === 1) throw new Error('first fails'); };
    const first = await runPdfExport(build, { setBusy: b => calls.push(b) });
    const second = await runPdfExport(build, { setBusy: b => calls.push(b) });
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(calls).toEqual([true, false, true, false]);
    spy.mockRestore();
  });

  it('missing callbacks are tolerated — no export can throw for lack of a handler', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runPdfExport(async () => {})).resolves.toMatchObject({ ok: true });
    await expect(runPdfExport(async () => { throw new Error('x'); })).resolves.toMatchObject({ ok: false });
    spy.mockRestore();
  });

  it('all five call sites route through runPdfExport (wiring)', () => {
    const app = stripComments(read('src/App.jsx'));
    const er = stripComments(read('src/screens/ErReportScreen.jsx'));
    const tp = stripComments(read('src/components/TimelinePanel.jsx'));
    // App holds three: doSend download, doSend send, exportPDF, hearing pack.
    expect((app.match(/runPdfExport\(/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(er).toMatch(/runPdfExport\(/);
    expect(tp).toMatch(/runPdfExport\(/);
    // And no PDF site still clears its flag outside a finally.
    expect(app).not.toMatch(/catch\(e\)\{showToast\(e\.message, "error"\);\}\s*\n\s*setPdfGenerating\(false\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('J. IR-SURF-01 capability rules are unchanged', () => {
  it('the investigation report may still export, with no correspondence approval', () => {
    const caps = documentCapabilities(INVESTIGATION_REPORT_DOC);
    expect(caps.mayExport).toBe(true);
    expect(caps.exportRequiresApproval).toBe(false);
    // And still no correspondence.
    expect(caps.maySendToEmployee).toBe(false);
    expect(caps.mayApproveForSending).toBe(false);
  });

  it('a genuine letter still requires approval to export', () => {
    expect(documentCapabilities('outcome').exportRequiresApproval).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('no domain semantics were touched', () => {
  it('PDF export writes nothing to the report, the stage or any decision', () => {
    const app = stripComments(read('src/App.jsx'));
    // Anchors must be CODE, not comments: stripComments removes
    // "// ── Settings handlers ──", indexOf returned -1, and slice(start, -1)
    // handed back nearly the whole file — so the assertion matched everything.
    const from = app.indexOf('const doSend = async');
    const to = app.indexOf('const handleLetterheadUpload', from);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const doSend = app.slice(from, to);
    for (const f of ['investigationReport', 'investigationReportDate', 'stage:',
      'case_decisions', 'record_case_decision', 'requestHrReview', 'signing_requests']) {
      expect(doSend).not.toContain(f);
    }
  });

  it('report generation, replacement and HR review are untouched', () => {
    const app = stripComments(read('src/App.jsx'));
    expect(app).toMatch(/investigationReport:text,investigationReportDate:new Date\(\)\.toISOString\(\),stage:"inv_report"/);
    expect(app).toMatch(/planHrReviewRequest\(/);
    expect(app).toMatch(/reportAuditAction\(/);
  });
});
