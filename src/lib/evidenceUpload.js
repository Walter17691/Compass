// Shared evidence-file handling — was duplicated implicitly by being
// inline-only in CaseViewScreen.jsx's investigation-stage upload; now
// also used by the "+ New case" modal's evidence step (a case doesn't
// exist yet at that point, so evidence is staged client-side and
// included in the case object on creation instead of written straight to
// an existing case's Supabase row).

export const MAX_EVIDENCE_SIZE = 15 * 1024 * 1024; // 15MB — dataUrl storage in a jsonb column, keep well under row/memory limits
export const ALLOWED_EVIDENCE_TYPES = ["image/jpeg","image/png","image/gif","image/webp","image/heic","application/pdf","video/mp4","video/quicktime","video/webm","text/plain","text/csv","message/rfc822","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

export function fmtBytes(n) {
  return n < 1024 * 1024 ? Math.round(n / 1024) + "KB" : (n / (1024 * 1024)).toFixed(1) + "MB";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = ev => resolve(ev.target.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Validates and reads a FileList/array into evidence objects. Rejected
// files (too large, unsupported type) are reported via onReject rather
// than thrown, so one bad file in a multi-file drop doesn't stop the
// rest from being added.
export async function readEvidenceFiles(files, { addedBy = "HR Manager", onReject } = {}) {
  const results = [];
  for (const f of Array.from(files)) {
    if (f.size > MAX_EVIDENCE_SIZE) { onReject?.(`${f.name} is too large (max 15MB) — link to it externally instead`); continue; }
    if (f.type && !ALLOWED_EVIDENCE_TYPES.includes(f.type)) { onReject?.(`${f.name}: file type not supported`); continue; }
    const dataUrl = await readFileAsDataUrl(f);
    results.push({ id: crypto.randomUUID(), name: f.name, type: f.type || "Document", size: f.size, date: new Date().toLocaleDateString("en-GB"), addedBy, dataUrl });
  }
  return results;
}

// Phase 6.5 hardening (P0, Cluster 8) — evidence items were previously
// referenced by their array position (documentFindings/ohReportFindings
// keys, allegation-linking, analyse/accept/dismiss handlers all took an
// index), so deleting one evidence item silently reassigned every later
// item's findings/allegation-link to the wrong document. readEvidenceFiles
// above now stamps a real id on every NEW item; this backfills a stable
// id onto any OLDER evidence item that predates that change, the single
// time any of that case's evidence next gets saved (via saveCases, the
// one funnel every evidence mutation already goes through — see its own
// withStageTransitionStamp comment for the established pattern this
// follows). Returns the exact same case reference when nothing needed
// backfilling, matching withStageTransitionStamp's own contract — saveCases'
// bulk-save path relies on reference equality to skip unchanged cases.
export function ensureEvidenceIds(cs) {
  if (!cs.evidence || !cs.evidence.length || cs.evidence.every(ev => ev.id)) return cs;
  return { ...cs, evidence: cs.evidence.map(ev => ev.id ? ev : { ...ev, id: crypto.randomUUID() }) };
}
