import { useState } from 'react';
import {
  RESOLUTION, RESOLUTIONS, RESOLUTION_LABEL,
  resolutionCarriesAddendum, validateResolution,
} from '../lib/employeeResponse';

// ─────────────────────────────────────────────────────────────────────────
// THE EMPLOYER'S REVIEW OF A CHALLENGED RECORD.
//
// ┌─ THE RULE THIS FORM EXISTS TO ENFORCE ──────────────────────────────────┐
// │ An employee saying the notes are inaccurate must not automatically alter  │
// │ the record. Equally, the manager must not simply be able to dismiss the   │
// │ response and make it disappear.                                         │
// │                                                                         │
// │ So this form offers exactly FOUR conclusions and no fifth. There is no    │
// │ "dismiss", no "ignore", no delete. Every outcome is recorded, every       │
// │ outcome names an actor and a time, and EVERY outcome needs a written      │
// │ rationale — including a full acceptance, which earlier carried an         │
// │ exception (see resolutionNeedsReason for why that was withdrawn).        │
// └─────────────────────────────────────────────────────────────────────────┘
//
// IT WRITES NOTHING ITSELF. It collects an intention and hands it to the server,
// which re-validates with the same module and applies the resolution against
// `response_resolution is null` so a second submission cannot overwrite the
// first. Nothing here can touch `document` or the employee's own words: those
// columns are not in the patch the server builds.
//
// NO REDESIGN. The surfaces borrow the panel/notice tones already used in this
// modal. TRUST-SIG-03 deliberately introduces no new visual language — the
// off-brand cream tones here are inherited, recorded as a separate cleanup.
// ─────────────────────────────────────────────────────────────────────────

const ORDER = [
  RESOLUTION.CORRECTION_ACCEPTED,
  RESOLUTION.PARTIALLY_ACCEPTED,
  RESOLUTION.ORIGINAL_RETAINED,
  RESOLUTION.ADDENDUM_ADDED,
];

const HELP = Object.freeze({
  [RESOLUTION.CORRECTION_ACCEPTED]: 'The employee is right. Their correction is adopted and added to the record. Say what you accepted.',
  [RESOLUTION.PARTIALLY_ACCEPTED]: 'Some of it is adopted. Say which parts, and why the rest is not.',
  [RESOLUTION.ORIGINAL_RETAINED]: 'The record stands as written. Say why — the employee is entitled to know.',
  [RESOLUTION.ADDENDUM_ADDED]: 'Nothing in the record was wrong, but something is added for clarity.',
});

const ADDENDUM_LABEL = Object.freeze({
  // This used to read "leave blank to adopt their wording as written above",
  // which promised something the code deliberately does not do: a blank addendum
  // stores NULL, it does not copy the employee's words into employer-authored
  // record text. Saying otherwise invited exactly the promotion the brief forbids.
  [RESOLUTION.CORRECTION_ACCEPTED]: 'The correction in your own words, as it will appear on the record (optional — their proposed wording stays on the record as their proposal either way)',
  [RESOLUTION.PARTIALLY_ACCEPTED]: 'What is added to the record (optional)',
  [RESOLUTION.ADDENDUM_ADDED]: 'The clarification to add to the record',
});

const box = {
  padding: 16, borderRadius: 8, border: '1px solid #EDE5D8', background: '#FDFAF5', marginBottom: 20,
};
const label = {
  fontSize: 10, fontWeight: 700, color: '#7A5C1A', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10,
};
const area = {
  width: '100%', minHeight: 76, padding: 10, fontSize: 13, fontFamily: 'inherit', lineHeight: 1.6,
  color: '#1A1535', background: '#fff', border: '1px solid #E4DCD0', borderRadius: 6, resize: 'vertical',
};

export function ResponseReviewForm({ onSubmit, busy = false }) {
  const [resolution, setResolution] = useState('');
  const [reason, setReason] = useState('');
  const [addendum, setAddendum] = useState('');
  const [error, setError] = useState('');

  const takesAddendum = resolutionCarriesAddendum(resolution);

  function submit() {
    const check = validateResolution({ resolution, reason, addendum });
    if (!check.ok) { setError(check.error); return; }
    setError('');
    onSubmit({ resolution, reason: reason.trim(), addendum: takesAddendum ? addendum.trim() : '' });
  }

  return (
    <div style={box}>
      <div style={label}>Review the employee&apos;s response</div>
      <p style={{ fontSize: 12, color: '#6B6370', lineHeight: 1.6, margin: '0 0 14px' }}>
        Whatever you conclude, the record above is kept exactly as it was issued and the
        employee&apos;s response is kept exactly as they wrote it. Your conclusion is recorded
        alongside both, with your name and the time.
      </p>

      <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
        <legend style={{ fontSize: 12, fontWeight: 600, color: '#1A1535', marginBottom: 8 }}>
          How is this response resolved?
        </legend>
        {ORDER.map((r) => (
          <label
            key={r}
            htmlFor={`resolution-${r}`}
            style={{
              display: 'block', padding: '10px 12px', marginBottom: 6, cursor: 'pointer',
              background: resolution === r ? '#fff' : 'transparent',
              border: `1px solid ${resolution === r ? '#C9BEAE' : '#E8E0D4'}`, borderRadius: 6,
            }}
          >
            <input
              type="radio" id={`resolution-${r}`} name="resolution" value={r}
              checked={resolution === r}
              onChange={() => { setResolution(r); setError(''); }}
              style={{ marginRight: 8 }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1535' }}>{RESOLUTION_LABEL[r]}</span>
            <span style={{ display: 'block', fontSize: 11, color: '#6B6370', marginTop: 4, marginLeft: 22 }}>
              {HELP[r]}
            </span>
          </label>
        ))}
      </fieldset>

      {RESOLUTIONS.includes(resolution) && (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="resolution-reason" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1A1535', marginBottom: 6 }}>
            Why have you reached this conclusion?
          </label>
          <textarea
            id="resolution-reason" style={area} value={reason}
            onChange={(e) => { setReason(e.target.value); setError(''); }}
          />
        </div>
      )}

      {takesAddendum && (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="resolution-addendum" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1A1535', marginBottom: 6 }}>
            {ADDENDUM_LABEL[resolution]}
          </label>
          <textarea
            id="resolution-addendum" style={area} value={addendum}
            onChange={(e) => { setAddendum(e.target.value); setError(''); }}
          />
          <div style={{ fontSize: 11, color: '#9B9098', marginTop: 6 }}>
            This is added to the record as an addendum. It does not change the original text.
          </div>
        </div>
      )}

      {error && (
        <div role="alert" style={{ fontSize: 12, color: '#8A2C2C', marginBottom: 10 }}>{error}</div>
      )}

      <button
        type="button" onClick={submit} disabled={busy}
        style={{
          padding: '10px 18px', fontSize: 13, fontWeight: 600, color: '#fff',
          background: busy ? '#9B9098' : '#1A1535', border: 0, borderRadius: 6,
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        {busy ? 'Recording…' : 'Record this conclusion'}
      </button>
    </div>
  );
}
