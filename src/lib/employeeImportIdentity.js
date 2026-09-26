// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — employee import identity. Phase E0.5A.1.
//
// Decides, for each imported row, WHICH canonical employee it refers to — or
// refuses to decide.
//
// ┌─ THE TRANSITIONAL CONTRACT ─────────────────────────────────────────────┐
// │ 1. An explicit Compass employee id, valid for this organisation          │
// │    → UPDATE that employee. The only unambiguous signal there is.         │
// │                                                                          │
// │ 2. No id, and exactly ONE existing employee answers to the name          │
// │    → UPDATE that employee. Safe only because UNIQUE(org_id, name) still  │
// │      guarantees "one", and it is re-checked here rather than assumed.    │
// │                                                                          │
// │ 3. No id, and NO existing employee answers to the name                   │
// │    → CREATE.                                                             │
// │                                                                          │
// │ 4. No id, and MORE THAN ONE employee answers to the name                 │
// │    → BLOCK the row and report it for human reconciliation.               │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Case 4 cannot occur in production today — the unique constraint forbids it. It
// is implemented anyway, because the alternative is an importer whose safety
// depends on a constraint that the roadmap intends to remove. The day duplicate
// names are permitted, this importer stops rather than silently overwriting one
// of two real people.
//
// employee_number and work_email are deliberately NOT used to merge. They are
// duplicate-detection aids for humans (see findPossibleDuplicates); neither is
// unique in the schema, and an organisation may reuse or omit an employee number.
// Guessing identity from a non-unique attribute is the mistake this whole
// programme is correcting — surfacing a possible match is the safe version, and
// that belongs in a reconciliation UX, not in a bulk upsert.
// ─────────────────────────────────────────────────────────────────────────

const norm = v => (typeof v === "string" ? v.trim().toLowerCase() : "");

export const IMPORT_RESOLUTION = Object.freeze({
  UPDATE_BY_ID: "update_by_id",
  UPDATE_BY_NAME: "update_by_name",
  CREATE: "create",
  // Refused. Reported to the user; nothing is written for this row.
  BLOCKED_AMBIGUOUS_NAME: "blocked_ambiguous_name",
  BLOCKED_UNKNOWN_ID: "blocked_unknown_id",
  BLOCKED_NO_NAME: "blocked_no_name",
});

// Resolve one imported row against the current roster.
//
// Returns { resolution, employeeId?, reason? } and never mutates anything.
export function resolveImportedEmployee(existingRecords, row) {
  const records = Array.isArray(existingRecords) ? existingRecords : [];
  const suppliedId = typeof row?.employeeId === "string" ? row.employeeId.trim() : "";

  if (suppliedId) {
    const match = records.find(e => e && e.id === suppliedId);
    // An id that is not in this org's roster is refused rather than treated as a
    // create: a mistyped or cross-tenant id must never quietly become a new
    // employee, and the roster the caller passes is already org-scoped by RLS.
    if (!match) {
      return { resolution: IMPORT_RESOLUTION.BLOCKED_UNKNOWN_ID, reason: `Compass employee id "${suppliedId}" is not in this organisation` };
    }
    return { resolution: IMPORT_RESOLUTION.UPDATE_BY_ID, employeeId: match.id };
  }

  const name = typeof row?.name === "string" ? row.name.trim() : "";
  if (!name) return { resolution: IMPORT_RESOLUTION.BLOCKED_NO_NAME, reason: "The row has no employee name" };

  const byName = records.filter(e => e && norm(e.name) === norm(name));
  if (byName.length > 1) {
    return {
      resolution: IMPORT_RESOLUTION.BLOCKED_AMBIGUOUS_NAME,
      reason: `${byName.length} employees are called "${name}" — import cannot tell which one this row is`,
    };
  }
  if (byName.length === 1) return { resolution: IMPORT_RESOLUTION.UPDATE_BY_NAME, employeeId: byName[0].id || null };
  return { resolution: IMPORT_RESOLUTION.CREATE };
}

export function isBlockedResolution(resolution) {
  return resolution === IMPORT_RESOLUTION.BLOCKED_AMBIGUOUS_NAME
    || resolution === IMPORT_RESOLUTION.BLOCKED_UNKNOWN_ID
    || resolution === IMPORT_RESOLUTION.BLOCKED_NO_NAME;
}

// Partition a whole import into what may be written and what a human must look
// at. Nothing is written for a blocked row — not a partial update, not a create.
export function planEmployeeImport(existingRecords, rows) {
  const applied = [];
  const blocked = [];
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const outcome = resolveImportedEmployee(existingRecords, row);
    if (isBlockedResolution(outcome.resolution)) {
      // The row NUMBER is reported, not just the name: with an ambiguous name,
      // naming the person is exactly what cannot be done unambiguously.
      blocked.push({ row: index + 1, name: row?.name || "", ...outcome });
    } else {
      applied.push({ row: index + 1, ...row, ...outcome });
    }
  });
  return { applied, blocked };
}

// One honest sentence for the user. Never claims a blocked row was imported.
export function describeImportPlan({ applied, blocked }, skippedNoName = 0) {
  const parts = [`Imported ${applied.length} employee${applied.length === 1 ? "" : "s"}`];
  if (blocked.length > 0) {
    parts.push(`${blocked.length} row${blocked.length === 1 ? "" : "s"} need${blocked.length === 1 ? "s" : ""} checking before they can be imported`);
  }
  if (skippedNoName > 0) {
    parts.push(`skipped ${skippedNoName} row${skippedNoName === 1 ? "" : "s"} with no name`);
  }
  return parts.join(", ");
}
