// Integrations & Workflow Automation (Phase 5, IP25, §17) — document
// storage adapter interface + reference stub. No specific storage
// platform (SharePoint, OneDrive, Google Drive) is named in the spec,
// and none has a working API this app can actually call yet — per the
// spec's own instruction not to hard-code an integration with no real
// API behind it, this is the modular contract a future real connector
// would implement, plus one reference stub satisfying it with clearly-
// fake example data. Registered in IP1's Integration Centre already —
// INTEGRATION_CATALOG's existing "document_storage" entry (lib/
// integrations.js) falls through to the generic Requires Administrator
// stub status automatically, same as "hris" did before IP19, so no
// change was needed there.
//
// "Reference-or-store-without-duplication" (the spec's own phrasing):
// a real connector either stores a NEW document remotely and hands back
// a reference, or wraps an ALREADY-remote document (a pasted SharePoint
// link, say) into the same reference shape — neither path ever copies
// the file's actual bytes into Compass's own evidence storage, which is
// a deliberately separate, already-working system (evidenceUpload.js)
// this doesn't touch or replace.
export const DOCUMENT_RECORD_FIELDS = [
  "id", "name", "url", "version", "source", "uploadedBy", "uploadedAt", "caseId", "classification",
];

// Every real adapter implements storeDocument() (upload a new file,
// returning a reference to where it now lives remotely) and
// referenceDocument() (wrap an existing remote document's URL into the
// same canonical shape, without fetching or duplicating its content).
export function createDocumentStorageAdapter({ id, name, storeDocument, referenceDocument }) {
  if (!id || !name || typeof storeDocument !== "function" || typeof referenceDocument !== "function") {
    throw new Error("createDocumentStorageAdapter requires id, name, storeDocument(), and referenceDocument()");
  }
  return { id, name, storeDocument, referenceDocument };
}

// Reference stub — a working example of the contract above, not a real
// vendor connection. Returns obviously-fake references (note the
// "Example"-prefixed values and .invalid URL) so nobody mistakes this
// for a live document if it's ever called directly.
export const exampleStubAdapter = createDocumentStorageAdapter({
  id: "example-stub",
  name: "Example document storage (stub — not a real connection)",
  storeDocument: async ({ file, caseId, uploadedBy, classification } = {}) => ({
    id: `example-doc-${Date.now()}`,
    name: file?.name || "Example Document.pdf",
    url: "https://example-storage.invalid/documents/example-doc",
    version: 1,
    source: "example-stub",
    uploadedBy: uploadedBy || "Example Uploader",
    uploadedAt: new Date().toISOString(),
    caseId: caseId || null,
    classification: classification || "unclassified",
  }),
  referenceDocument: async ({ url, name, caseId, uploadedBy, classification } = {}) => ({
    id: `example-ref-${Date.now()}`,
    name: name || "Example Referenced Document",
    url: url || "https://example-storage.invalid/documents/example-ref",
    version: 1,
    source: "example-stub",
    uploadedBy: uploadedBy || "Example Uploader",
    uploadedAt: new Date().toISOString(),
    caseId: caseId || null,
    classification: classification || "unclassified",
  }),
});
