import { COLOR, TYPE } from '../../styles/tokens';

// Phase 2B — the shared structured-list row (Cases/People) replacing
// per-item bordered cards. Deliberately a plain <div>, not a <button>:
// several callers (Cases) need a sibling interactive control (a
// selection checkbox) alongside the row's own click target, and a
// native <button> can't contain another interactive element. Callers
// put their own <button> (or other control) inside `children` for the
// actual click/keyboard behaviour; DataRow only supplies the shared
// row chrome (padding, divider, hover).
export function DataRow({ children, attention = false }) {
  return (
    <div style={{
      display:"flex",alignItems:"center",gap:12,
      borderBottom:`1px solid ${COLOR.borderFaint}`,
      borderLeft: attention ? `2px solid ${COLOR.purple}` : "2px solid transparent",
      transition:"background 0.1s",
    }}>
      {children}
    </div>
  );
}

// Small trailing chevron — the row's own "this opens something" affordance.
export function RowChevron() {
  return <span style={{color:COLOR.inkQuiet,fontSize:16,flexShrink:0}}>›</span>;
}

export function RowPrimary({ children }) {
  return <div style={{fontSize:13,fontWeight:600,color:COLOR.ink,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{children}</div>;
}

export function RowSecondary({ children }) {
  return <div style={{...TYPE.metadata,color:COLOR.inkFaint,display:"flex",gap:6,flexWrap:"wrap"}}>{children}</div>;
}
