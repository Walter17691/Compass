// Pure helpers for concern referrals — Phase 14 of the reasoning-layer
// build-out (first of the scale/commercialisation wave). Same flat,
// cross-case-listable-entity shape as allegations.js/caseTasks.js; the
// caller (App.jsx) owns persistence (Supabase) and which org is active.
// See supabase/concern_referrals_2026-08-12.sql for the RLS shape: any
// org member can submit one, but only HR roles can triage it.

export const REFERRAL_STATUSES = [
  { id: "new", label: "New", color: "#7C5CFC", bg: "#EDE8FF" },
  { id: "more_info_requested", label: "More info requested", color: "#B87520", bg: "#FEF5E7" },
  { id: "returned_to_manager", label: "Returned to manager", color: "#6B6375", bg: "#F5F1EA" },
  { id: "handled_informally", label: "Handled informally", color: "#1A7A4A", bg: "#E8F5EE" },
  { id: "case_opened", label: "Formal case opened", color: "#C84B2F", bg: "#FEF0EB" },
  { id: "closed", label: "Closed", color: "#6B6375", bg: "#F5F1EA" },
];

// A referral still needs HR attention until it's been given one of the
// five triage dispositions — "new" is the only status that counts as
// genuinely untouched.
const OPEN_STATUS = "new";

export function referralStatusMeta(status) {
  return REFERRAL_STATUSES.find(s => s.id === status) || REFERRAL_STATUSES[0];
}

export function openReferrals(referrals) {
  return (referrals || []).filter(r => r.status === OPEN_STATUS);
}

export function addConcernReferral(referrals, fields) {
  const employeeName = (fields?.employeeName || "").trim();
  const description = (fields?.description || "").trim();
  if (!employeeName || !description) return referrals;
  const referral = {
    id: "ref_" + Date.now(),
    employeeName,
    concernType: fields.concernType || "other",
    description,
    // Manager Enablement (Phase 4, MP4, §2) — witnesses/evidence are new;
    // involvesSafetyOrWelfare keeps its original field name (avoids
    // churning every existing reader) but is now specifically "is anyone
    // currently at risk?" — immediateSafetyConcern is the new, genuinely
    // separate "is there an immediate operational or safety concern?"
    // question the spec asks for alongside it.
    witnesses: (fields.witnesses || "").trim(),
    discussedWithEmployee: !!fields.discussedWithEmployee,
    involvesSafetyOrWelfare: !!fields.involvesSafetyOrWelfare,
    immediateSafetyConcern: !!fields.immediateSafetyConcern,
    mayNeedFormalProcess: !!fields.mayNeedFormalProcess,
    evidenceDescription: (fields.evidenceDescription || "").trim(),
    evidenceFiles: fields.evidenceFiles || [],
    submittedBy: fields.submittedBy || null,
    submittedByName: fields.submittedByName || "",
    status: OPEN_STATUS,
    hrNotes: "",
    linkedCaseId: null,
    createdAt: new Date().toISOString(),
  };
  return [...(referrals || []), referral];
}

export function updateConcernReferral(referrals, referralId, fields) {
  return (referrals || []).map(r => r.id === referralId ? { ...r, ...fields } : r);
}

export function setReferralStatus(referrals, referralId, status, extraFields = {}) {
  if (!REFERRAL_STATUSES.some(s => s.id === status)) return referrals;
  return updateConcernReferral(referrals, referralId, { status, ...extraFields });
}
