import { useId } from 'react';
import { COLOR } from '../styles/tokens';

// Canonical Compass mark — exact geometry from the written design
// specification (three tapered strokes, heavy -> medium -> fine, grouped
// and rotated together to a fixed -45 degree bearing). Reproduced
// verbatim from the supplied paths; do not redraw, re-taper, or add a
// fourth stroke. Tile: 23% corner radius (rx=23 on a 0-100 viewBox),
// signature gradient fill, white mark only — the strokes themselves
// never receive a gradient.
export function CompassLogo({ size = 36 }) {
  const s = size;
  const gradId = `compassGradient-${useId()}`;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none" aria-hidden="true" style={{flexShrink:0}}>
      <defs>
        <linearGradient id={gradId} x1="6" y1="6" x2="94" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={COLOR.gradientStart}/>
          <stop offset="52%" stopColor={COLOR.gradientMid}/>
          <stop offset="100%" stopColor={COLOR.gradientEnd}/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="23" fill={`url(#${gradId})`}/>
      <g transform="rotate(-45 50 50)" fill="#FFFFFF">
        <path d="M27 12 L37 42 L37 84 L17 84 L17 42 Z"/>
        <path d="M51 12 L57.5 42 L57.5 84 L44.5 84 L44.5 42 Z"/>
        <path d="M70 12 L74 42 L74 84 L66 84 L66 42 Z"/>
      </g>
    </svg>
  );
}
