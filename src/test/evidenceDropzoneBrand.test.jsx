import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EvidenceDropzone } from '../components/EvidenceDropzone.jsx';
import { COLOR } from '../styles/tokens.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B.2 BRAND CORRECTION — the last warm surface in the Case View.
//
// The dropzone's resting state was cream (#FDFAF5) behind a beige dashed border
// (#E8E0D0), left from the pre-token palette. It became conspicuous once
// everything around it moved to white and cool neutrals.
//
// ┌─ WHY THE PREVIOUS SWEEP MISSED IT, AND WHY THESE TESTS LOOK LIKE THIS ──┐
// │ 1. My production audit queried document.querySelectorAll('div,span,li,  │
// │    button'). The dropzone is a <label>. Proven on production: that      │
// │    selector returned 0 cream elements; '*' returned exactly one — this. │
// │ 2. The audit only read backgroundColor, never border colours. The beige │
// │    dashed border would have survived even with <label> in the selector. │
// │ 3. The source sweep covered twenty Case View components verified as     │
// │    Case-View-only. EvidenceDropzone is a shared GRANDCHILD of one of    │
// │    them, so it was never in the list.                                   │
// │                                                                          │
// │ All three are the same mistake: enumerating a set by hand instead of     │
// │ deriving it. So these assert COMPUTED styles — background AND border —   │
// │ against the tokens, rather than a hand-listed set of forbidden hexes.    │
// └─────────────────────────────────────────────────────────────────────────┘
//
// SHARED COMPONENT. Three call sites: the Case View's Evidence destination,
// App.jsx's own evidence flow, and ConcernsScreen. All three are ordinary
// Compass UI and all three should speak the same visual language, so the fix is
// deliberately at the component rather than at the Case View call site.
// ─────────────────────────────────────────────────────────────────────────

const WARM = [
  'rgb(253, 250, 245)',  // #FDFAF5 cream
  'rgb(232, 224, 208)',  // #E8E0D0 beige
  'rgb(237, 229, 216)',  // #EDE5D8 beige
  'rgb(245, 241, 234)',  // #F5F1EA cream
  'rgb(254, 245, 231)',  // #FEF5E7 amber — decorative use is not allowed here
];
const zone = () => screen.getByText('Drop files or click to upload').closest('label');
const hex = h => {
  const n = parseInt(h.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('EvidenceDropzone — resting state speaks Compass, not cream', () => {
  it('its background is a cool surface, not warm', () => {
    render(<EvidenceDropzone onFilesSelected={() => {}} />);
    const bg = getComputedStyle(zone()).backgroundColor;
    expect(WARM, `background was ${bg}`).not.toContain(bg);
    expect(bg).toBe(hex(COLOR.surface));
  });

  it('its BORDER is a cool neutral, not beige', () => {
    // The property the previous audit never looked at.
    render(<EvidenceDropzone onFilesSelected={() => {}} />);
    const bc = getComputedStyle(zone()).borderTopColor;
    expect(WARM, `border was ${bc}`).not.toContain(bc);
    expect(bc).toBe(hex(COLOR.border));
  });

  it('it stays a dashed target rather than becoming another filled card', () => {
    render(<EvidenceDropzone onFilesSelected={() => {}} />);
    expect(getComputedStyle(zone()).borderTopStyle).toBe('dashed');
    // No compensating shadow or gradient for the removed beige.
    const s = getComputedStyle(zone());
    expect(s.boxShadow === '' || s.boxShadow === 'none').toBe(true);
    expect(s.backgroundImage === '' || s.backgroundImage === 'none').toBe(true);
  });

  it('no warm hex survives in the rendered component at all', () => {
    const { container } = render(<EvidenceDropzone onFilesSelected={() => {}} />);
    const everything = [...container.querySelectorAll('*'), ...container.children];
    everything.forEach(el => {
      const s = getComputedStyle(el);
      [s.backgroundColor, s.borderTopColor, s.borderLeftColor, s.color].forEach(v => {
        if (v) expect(WARM, `${el.tagName}: ${v}`).not.toContain(v);
      });
    });
  });
});

describe('EvidenceDropzone — the states it actually has', () => {
  // There are no uploading/success/error/disabled states in this component: it
  // only forwards the FileList. Rejection is surfaced by the caller as a toast
  // (readEvidenceFiles' onReject), which is where semantic colour belongs.
  it('keyboard focus highlights it in Compass purple', () => {
    render(<EvidenceDropzone onFilesSelected={() => {}} />);
    fireEvent.focus(screen.getByLabelText('Drop files or click to upload'));
    expect(getComputedStyle(zone()).borderTopColor).toBe(hex(COLOR.purple));
    expect(getComputedStyle(zone()).backgroundColor).toBe(hex(COLOR.purpleTint));
  });

  it('blur returns it to the cool resting state', () => {
    render(<EvidenceDropzone onFilesSelected={() => {}} />);
    const input = screen.getByLabelText('Drop files or click to upload');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(getComputedStyle(zone()).backgroundColor).toBe(hex(COLOR.surface));
    expect(getComputedStyle(zone()).borderTopColor).toBe(hex(COLOR.border));
  });

  it('drag-over highlights, and is a TINT not a purple block', () => {
    render(<EvidenceDropzone onFilesSelected={() => {}} />);
    fireEvent.dragOver(zone());
    expect(getComputedStyle(zone()).borderTopColor).toBe(hex(COLOR.purple));
    // The barely-there tint, never the solid brand purple as a fill.
    expect(getComputedStyle(zone()).backgroundColor).toBe(hex(COLOR.purpleTint));
    expect(getComputedStyle(zone()).backgroundColor).not.toBe(hex(COLOR.purple));
  });

  it('drag-leave returns it to resting', () => {
    render(<EvidenceDropzone onFilesSelected={() => {}} />);
    fireEvent.dragOver(zone());
    fireEvent.dragLeave(zone());
    expect(getComputedStyle(zone()).backgroundColor).toBe(hex(COLOR.surface));
  });

  it('dropping still forwards the files — styling did not break behaviour', () => {
    const files = [];
    render(<EvidenceDropzone onFilesSelected={f => files.push(f)} />);
    fireEvent.drop(zone(), { dataTransfer: { files: ['a.pdf'] } });
    expect(files).toHaveLength(1);
    expect(getComputedStyle(zone()).backgroundColor).toBe(hex(COLOR.surface));
  });

  it('the input stays focusable for keyboard users', () => {
    // Phase 6.5 accessibility fix — visually hidden, never display:none.
    render(<EvidenceDropzone onFilesSelected={() => {}} />);
    const input = screen.getByLabelText('Drop files or click to upload');
    expect(getComputedStyle(input).display).not.toBe('none');
    input.focus();
    expect(input).toHaveFocus();
  });
});
