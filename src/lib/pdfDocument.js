// ─────────────────────────────────────────────────────────────────────────
// ONE SAFE WAY TO GET jsPDF, AND ONE SAFE WAY TO RUN AN EXPORT.
//
// ┌─ THE DEFECT THIS CLOSES (PDF-01) ───────────────────────────────────────┐
// │ jsPDF was fetched at runtime by injecting a third-party CDN script:      │
// │                                                                         │
// │   const loadJsPDF = () => new Promise(resolve => {        // only resolve │
// │     if(window.jspdf){ resolve(window.jspdf.jsPDF); return; }             │
// │     const s = document.createElement("script");                          │
// │     s.src = "https://cdnjs.cloudflare.com/.../jspdf.umd.min.js";          │
// │     s.onload = () => resolve(window.jspdf.jsPDF);        // no onerror    │
// │     document.head.appendChild(s);                        // no timeout    │
// │   });                                                                   │
// │                                                                         │
// │ Production CSP is `script-src 'self' 'unsafe-inline'` — cdnjs is NOT an   │
// │ allowed origin, so the browser refused the script. A blocked script fires │
// │ onerror, which nothing handled, so the promise NEVER SETTLED: every       │
// │ `await loadJsPDF()` hung, no catch ran, and every loading flag stayed on. │
// │ Human UAT saw "Generating..." forever with no error.                      │
// │                                                                         │
// │ Every PDF feature in Compass had therefore been dead in production since  │
// │ commit 18bdd77 ("add baseline security headers and a CSP", 2026-08-06).    │
// │ The CSP was right. Loading executable third-party script at runtime was   │
// │ the bug.                                                                 │
// └─────────────────────────────────────────────────────────────────────────┘
//
// THE FIX IS A LOCAL DEPENDENCY, NOT A CSP EXEMPTION. jspdf@2.5.1 — the exact
// version the CDN served, so PDF output is unchanged — imported dynamically so
// its ~350kB only loads for someone who actually exports a PDF, and served from
// our own origin so `script-src 'self'` covers it. No external origin is added,
// nothing is transmitted anywhere, and PDF generation stays entirely client-side.
//
// There is exactly ONE loader. The CDN injector is deleted, not left alongside.
// ─────────────────────────────────────────────────────────────────────────

/** What the user is told when an export cannot be produced. One string. */
export const PDF_FAILURE_MESSAGE = "We couldn't prepare the PDF. Please try again.";

/**
 * The jsPDF constructor, from the local dependency.
 *
 * Dynamically imported, so it is a lazily-fetched chunk from our own origin
 * rather than part of the initial bundle. Unlike the loader it replaces, this
 * REJECTS on failure — a chunk that cannot be fetched produces a rejected
 * promise, which is what lets every caller's catch and finally actually run.
 *
 * No timeout is added. A timeout was only ever needed to paper over a promise
 * that could not reject; a dynamic import settles either way, so a timer here
 * would be a second failure mode rather than a safeguard.
 */
export async function loadJsPDF() {
  const mod = await import('jspdf');
  const jsPDF = mod?.jsPDF || mod?.default?.jsPDF || mod?.default;
  if (typeof jsPDF !== 'function') {
    // Defensive: a module that resolved without the constructor would otherwise
    // fail later as "jsPDF is not a constructor", far from the real cause.
    throw new Error('jsPDF did not load correctly');
  }
  return jsPDF;
}

/**
 * Run a PDF export with the loading/error invariant guaranteed.
 *
 * START   -> setBusy(true)
 * SUCCESS -> setBusy(false)
 * FAILURE -> onError(PDF_FAILURE_MESSAGE) and setBusy(false)
 *
 * The invariant lives HERE, in one place, because it previously had to hold at
 * five independent call sites and held at none of them: three had no loading
 * state and no error handling at all, and the two that did reset their flag
 * AFTER the try/catch rather than in a `finally` — which a never-settling
 * promise skipped entirely.
 *
 * The real error is logged for diagnosis; the user sees one plain sentence, with
 * no implementation detail. `finally` means the control is never left disabled,
 * so a retry is always possible.
 */
export async function runPdfExport(build, { setBusy, onError, label = 'PDF' } = {}) {
  try {
    setBusy?.(true);
    await build();
    return { ok: true };
  } catch (error) {
    console.error(`${label} export failed:`, error);
    onError?.(PDF_FAILURE_MESSAGE);
    return { ok: false, error };
  } finally {
    setBusy?.(false);
  }
}
