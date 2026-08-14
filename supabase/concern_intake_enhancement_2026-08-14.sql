-- Manager Enablement & Delegation (Phase 4, MP4, §2 + §4) — the concern
-- intake form gains witnesses and evidence capture, and the original
-- single "does this involve a safety or welfare risk?" checkbox gets its
-- intended second half back: involves_safety_or_welfare stays as-is
-- (going forward read as "is anyone currently at risk?"), and
-- immediate_safety_concern is the genuinely separate "is there an
-- immediate operational or safety concern?" question the spec asks for
-- alongside it. evidence_files mirrors how case evidence already works
-- (readEvidenceFiles, src/lib/evidenceUpload.js) — inline base64 data
-- URIs in the jsonb array, no separate Storage bucket.
ALTER TABLE public.concern_referrals
  ADD COLUMN IF NOT EXISTS witnesses text,
  ADD COLUMN IF NOT EXISTS immediate_safety_concern boolean,
  ADD COLUMN IF NOT EXISTS evidence_description text,
  ADD COLUMN IF NOT EXISTS evidence_files jsonb NOT NULL DEFAULT '[]';
