import { COLOR, TYPE, FONT, RADIUS } from '../../styles/tokens';

// Phase 2B — shared quiet empty/loading state (Cases/People and
// anywhere else a list can be genuinely empty). Text-only, no icon —
// matches the "no emoji, no decorative iconography" rule already
// established for this product.
export function EmptyState({ title, message, action }) {
  return (
    <div style={{textAlign:"center",padding:"64px 20px",background:COLOR.surface,borderRadius:RADIUS.surface,border:`1px solid ${COLOR.border}`}}>
      {title && <div style={{...TYPE.pageTitle,fontFamily:FONT.serif,fontWeight:400,color:COLOR.ink,marginBottom:8}}>{title}</div>}
      {message && <div style={{fontSize:14,color:COLOR.inkFaint,marginBottom:action?20:0}}>{message}</div>}
      {action}
    </div>
  );
}
