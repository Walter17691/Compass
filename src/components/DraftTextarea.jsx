import { useState, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// A TEXTAREA THAT COMMITS ON BLUR, NOT ON EVERY KEYSTROKE.
//
// Extracted from AllegationsPanel in IR-REPORT-01a so the investigator's own
// findings workspace can reuse it rather than carry a second copy. The logic
// below is not boilerplate — it is a hardening fix (Phase 6.5, P0, Cluster 7),
// and a divergent second implementation would quietly lose part of it:
//
//   * these fields used to call onCommit (patchAllegation, a full-row upsert)
//     on every keystroke via onChange. Committing on blur cuts write volume
//     from one-per-character to one-per-field-edit, and shrinks the window the
//     paired optimistic-concurrency guard (saveAllegationToDB) must protect.
//   * it also commits on UNMOUNT, so collapsing the row without a natural blur
//     event does not drop the last edit.
//   * it syncs from the incoming value only when that value actually changes,
//     so an unrelated re-render never clobbers an in-progress edit.
//
// Behaviour is identical to the version it replaces; this is a move, not a
// rewrite. Both call sites now share one implementation.
// ─────────────────────────────────────────────────────────────────────────
export function DraftTextarea({ value, onCommit, ...rest }) {
  const [draft, setDraft] = useState(value || "");
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  useEffect(() => { draftRef.current = draft; onCommitRef.current = onCommit; });

  useEffect(() => {
    if (value !== valueRef.current) { setDraft(value || ""); valueRef.current = value; }
  }, [value]);

  useEffect(() => () => {
    if (draftRef.current !== (valueRef.current || "")) onCommitRef.current(draftRef.current);
  }, []);

  const commit = () => { if (draft !== (value || "")) { onCommit(draft); valueRef.current = draft; } };

  return <textarea {...rest} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} />;
}
