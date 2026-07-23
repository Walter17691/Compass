export function CompassLogo({ size = 36 }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none" style={{flexShrink:0}}>
      <circle cx="50" cy="50" r="48" fill="#7C5CFC"/>
      <polygon points="50,16 56,50 50,58 44,50" fill="#FDFAF5"/>
      <polygon points="50,84 44,50 50,42 56,50" fill="rgba(253,250,245,0.28)"/>
      <circle cx="50" cy="50" r="5" fill="#7C5CFC" stroke="#FDFAF5" stroke-width="2"/>
    </svg>
  );
}
