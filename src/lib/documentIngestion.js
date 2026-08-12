// Phase 7 of the reasoning-layer build-out — Intelligent Document
// Ingestion. Pure helpers only; the actual AI extraction call and the
// per-finding accept actions (which reuse existing write paths — case
// tasks, Phase 6's evidence-allegation linking, Phase 0's case_signals —
// rather than inventing new ones) live in App.jsx alongside every other
// AI call in this build-out.
//
// Only a subset of evidenceUpload.js's ALLOWED_EVIDENCE_TYPES can
// actually be read by Claude: images and PDFs go through natively as
// multimodal content, plain text/CSV/raw email (.eml) get decoded and
// sent as text. Word/Excel documents and video aren't parseable without
// a new dependency, so they're deliberately excluded here rather than
// half-supported.
const ANALYSABLE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "text/plain", "text/csv", "message/rfc822",
]);
const TEXT_TYPES = new Set(["text/plain", "text/csv", "message/rfc822"]);

// Vercel's serverless request body limit is well under evidence's own
// 15MB upload cap (evidenceUpload.js's MAX_EVIDENCE_SIZE) — analysis is
// capped separately and more tightly, on the ORIGINAL file size (ev.size,
// already stored by readEvidenceFiles), not the ~33%-larger base64 form
// this function will build.
export const MAX_ANALYSIS_BYTES = 4 * 1024 * 1024;

export function canAnalyseEvidence(ev) {
  if (!ev?.dataUrl) return false;
  if (!ANALYSABLE_TYPES.has(ev.type)) return false;
  if (ev.size && ev.size > MAX_ANALYSIS_BYTES) return false;
  return true;
}

// Splits a "data:<mediaType>;base64,<data>" URL into its parts. Returns
// null for anything that doesn't match that shape (e.g. a blob: URL, or
// no dataUrl at all) rather than throwing, so callers can fail soft.
export function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || "");
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

// atob() only handles Latin-1 — any non-ASCII character in the original
// text (a name with an accent, a curly quote) would come out corrupted
// without explicitly re-decoding the byte sequence as UTF-8.
export function decodeBase64Text(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

// Builds the Claude message content block(s) for one evidence item —
// text-based files are inlined as plain text (readable directly in the
// prompt), images/PDFs go through as real multimodal content blocks so
// Claude can actually see the document rather than being told its name.
export function buildAnalysisContent(ev) {
  const parsed = parseDataUrl(ev.dataUrl);
  if (!parsed) return null;
  if (TEXT_TYPES.has(ev.type)) {
    return { type: "text", text: `DOCUMENT "${ev.name}":\n${decodeBase64Text(parsed.base64)}`.slice(0, 20000) };
  }
  if (ev.type === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: parsed.base64 } };
  }
  return { type: "image", source: { type: "base64", media_type: ev.type, data: parsed.base64 } };
}
