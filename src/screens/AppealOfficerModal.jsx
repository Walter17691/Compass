import { useState, useRef } from 'react';
import { useModalA11y } from '../hooks/useModalA11y';

// Independent appeal officer workflow (2026-09-16) — deliberately a
// separate component from HandoffModal.jsx, not an extension of it. That
// modal is disciplinary-hearing-officer-only machinery; reusing it for
// appeals (as the pre-existing "Appoint appeal officer" button used to
// do) is exactly the bug this replaces — it silently granted
// case_access.role='disciplinary_officer' instead of 'appeal_manager',
// and unconditionally regressed cases.stage back to "disciplinary" even
// when the case was already in the "appeal" stage. This component never
// touches cases.stage at all.
//
// Authorization is enforced authoritatively by appoint_appeal_manager()/
// revoke_appeal_manager() (supabase/appeal_officer_workflow_2026-09-16.sql)
// — HR-only, with an independence-conflict check against
// allegations.decided_by. This component is UI only; every state
// transition below is what the RPC itself decided, surfaced honestly
// (including the INDEPENDENCE_CONFLICT case), not re-derived here.
export function AppealOfficerModal({ cases, activeCaseId, orgMembers, caseAccess, onClose, appointAppealManager, revokeAppealManager, confirmDialog, showToast }) {
  const cs = cases.find(x => x.id === activeCaseId);
  const currentAccess = caseAccess.find(a => a.caseId === cs?.id && a.role === 'appeal_manager');
  const currentOfficer = currentAccess ? orgMembers.find(m => m.user_id === currentAccess.userId) : null;

  const candidates = orgMembers.filter(m => m.user_id);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [mode, setMode] = useState(currentOfficer ? 'view' : 'select'); // view | select | conflict | unknown | submitting
  const [conflictMessage, setConflictMessage] = useState('');
  // Appeal Independence P1 (2026-09-18) — legacy-case path: no attribution
  // exists anywhere to check the proposed officer against at all (distinct
  // from 'conflict', where attribution exists and matches). Reuses the
  // same overrideReason state/textarea; appoint_appeal_manager() requires
  // it non-empty for this path too, just under a different mandatory-HR-
  // confirmation framing rather than an override framing.
  const [unknownMessage, setUnknownMessage] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const containerRef = useRef(null);
  useModalA11y(containerRef, onClose);

  const attemptAppoint = async (reason) => {
    const targetId = selectedUserId || candidates[0]?.user_id;
    if (!targetId) return;
    setSubmitting(true);
    const result = await appointAppealManager(cs.id, targetId, reason || null);
    setSubmitting(false);
    if (result.ok) {
      const name = candidates.find(m => m.user_id === targetId)?.name || 'the selected person';
      showToast(reason ? `${name} appointed as appeal officer (exceptional appointment recorded)` : `${name} appointed as appeal officer`);
      onClose();
      return;
    }
    if (result.error?.startsWith('INDEPENDENCE_CONFLICT')) {
      setConflictMessage(result.error.replace(/^INDEPENDENCE_CONFLICT:\s*/, ''));
      setMode('conflict');
      return;
    }
    if (result.error?.startsWith('INDEPENDENCE_UNKNOWN')) {
      setUnknownMessage(result.error.replace(/^INDEPENDENCE_UNKNOWN:\s*/, ''));
      setMode('unknown');
      return;
    }
    showToast("Couldn't appoint the appeal officer — " + (result.error || 'please try again'), 'error');
  };

  const handleRevoke = async () => {
    const ok = await confirmDialog({
      title: 'Revoke appeal officer',
      message: `${currentOfficer?.name || 'This person'} will immediately lose the ability to decide this case's appeal. This does not affect any other access they may hold.`,
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    await revokeAppealManager(cs.id);
    onClose();
  };

  if (!cs) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="appeal-officer-title" ref={containerRef} tabIndex={-1} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div id="appeal-officer-title" style={{ fontFamily: 'DM Serif Display,Georgia,serif', fontSize: 20, color: '#1C1820' }}>Appeal officer</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9B9098', lineHeight: 1, padding: 0, marginLeft: 12 }}>×</button>
        </div>

        {mode === 'view' && currentOfficer && (
          <>
            <div style={{ fontSize: 13, color: '#6B6375', marginBottom: 20 }}>
              <strong style={{ color: '#1C1820' }}>{currentOfficer.name}</strong> is appointed to decide this case's appeal. They can conduct the hearing, add appeal material, and record the appeal decision — nothing else changes about their role on this case.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={handleRevoke} style={{ fontSize: 13, padding: '9px 20px', border: '1px solid #F0D9D3', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#C84B2F' }}>Revoke</button>
              <button onClick={() => setMode('select')} style={{ fontSize: 13, padding: '9px 20px', background: '#7C5CFC', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Replace</button>
            </div>
          </>
        )}

        {mode === 'select' && (
          <>
            <div style={{ fontSize: 13, color: '#6B6375', marginBottom: 20 }}>
              {currentOfficer ? 'Choose who should replace the current appeal officer.' : "Appoint someone to hear and decide this case's appeal. ACAS guidance expects this to be someone who was not previously involved in the original decision, wherever possible."}
            </div>
            {candidates.length === 0 ? (
              <div style={{ fontSize: 13, color: '#C84B2F', background: '#FFF0ED', borderRadius: 8, padding: 12, marginBottom: 16 }}>No eligible team members found.</div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="appeal-officer-select" style={{ fontSize: 12, fontWeight: 600, color: '#1C1820', display: 'block', marginBottom: 6 }}>Select appeal officer</label>
                <select id="appeal-officer-select" value={selectedUserId || candidates[0]?.user_id || ''} onChange={e => setSelectedUserId(e.target.value)} style={{ width: '100%', fontSize: 13, border: '1px solid #E8E0D0', borderRadius: 8, padding: '10px 12px', background: '#fff', color: '#1C1820' }}>
                  {candidates.map(m => <option key={m.id} value={m.user_id}>{m.name}{m.job_title ? ` (${m.job_title})` : ''}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={currentOfficer ? () => setMode('view') : onClose} style={{ fontSize: 13, padding: '9px 20px', border: '1px solid #E8E0D0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#6B6375' }}>Cancel</button>
              <button disabled={submitting || candidates.length === 0} onClick={() => attemptAppoint(null)} style={{ fontSize: 13, padding: '9px 20px', background: '#7C5CFC', border: 'none', borderRadius: 8, color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Appointing…' : 'Appoint'}</button>
            </div>
          </>
        )}

        {mode === 'conflict' && (
          <>
            {/* Not a casual dismissible warning — this is an explicit HR
                exception workflow. appoint_appeal_manager() itself
                requires a non-empty reason to proceed and permanently
                records who appointed whom, that a conflict existed, and
                why, in audit_log. */}
            <div style={{ fontSize: 13, color: '#8A5A00', background: '#FFF7E0', border: '1px solid #F0DFA0', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              {conflictMessage}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="appeal-officer-override-reason" style={{ fontSize: 12, fontWeight: 600, color: '#1C1820', display: 'block', marginBottom: 6 }}>Reason for proceeding anyway</label>
              <textarea id="appeal-officer-override-reason" rows={3} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="Why is this the right appointment despite the conflict?" style={{ width: '100%', fontSize: 13, border: '1px solid #E8E0D0', borderRadius: 8, padding: '10px 12px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setMode('select'); setOverrideReason(''); }} style={{ fontSize: 13, padding: '9px 20px', border: '1px solid #E8E0D0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#6B6375' }}>Choose someone else</button>
              <button disabled={submitting || !overrideReason.trim()} onClick={() => attemptAppoint(overrideReason.trim())} style={{ fontSize: 13, padding: '9px 20px', background: '#C84B2F', border: 'none', borderRadius: 8, color: '#fff', cursor: (submitting || !overrideReason.trim()) ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: (submitting || !overrideReason.trim()) ? 0.6 : 1 }}>{submitting ? 'Appointing…' : 'Proceed exceptionally'}</button>
            </div>
          </>
        )}

        {mode === 'unknown' && (
          <>
            {/* Legacy case, no recorded decision-maker anywhere — not the
                same claim as 'conflict' (which asserts a known match).
                appoint_appeal_manager() still requires a non-empty reason
                here, recorded as an explicit HR confirmation rather than
                an override, and audited under its own distinct action
                string so it's never confused with a resolved conflict. */}
            <div style={{ fontSize: 13, color: '#6B6375', background: '#F5F2FF', border: '1px solid #E4DBFF', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              {unknownMessage}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="appeal-officer-unknown-reason" style={{ fontSize: 12, fontWeight: 600, color: '#1C1820', display: 'block', marginBottom: 6 }}>Confirmation</label>
              <textarea id="appeal-officer-unknown-reason" rows={3} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="Confirm how you verified this person was not involved in the original decision." style={{ width: '100%', fontSize: 13, border: '1px solid #E8E0D0', borderRadius: 8, padding: '10px 12px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setMode('select'); setOverrideReason(''); }} style={{ fontSize: 13, padding: '9px 20px', border: '1px solid #E8E0D0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#6B6375' }}>Choose someone else</button>
              <button disabled={submitting || !overrideReason.trim()} onClick={() => attemptAppoint(overrideReason.trim())} style={{ fontSize: 13, padding: '9px 20px', background: '#7C5CFC', border: 'none', borderRadius: 8, color: '#fff', cursor: (submitting || !overrideReason.trim()) ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: (submitting || !overrideReason.trim()) ? 0.6 : 1 }}>{submitting ? 'Appointing…' : 'Confirm and proceed'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
