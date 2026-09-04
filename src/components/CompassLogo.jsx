import { COLOR, FONT } from '../styles/tokens';

// Brand v2.0 migration — the previous three-stroke "sweep" mark is
// retired. Canonical geometry below is reproduced verbatim from the
// supplied master paths (a compass-rose point: tall north tip, short
// south tail, split into two faces along the NW-SE diagonal, fixed
// 45-degree left turn) — do not redraw, retrace, or approximate.
const MARK_PATHS = {
  lit: "M12.52 12.52 L42.58 64.50 L71.92 71.92 Z",
  shaded: "M12.52 12.52 L71.92 71.92 L64.50 42.58 Z",
};

// v2.0 spec §3 — only these four colour pairs exist. No other mark
// treatment is permitted (no outline/shadow/stretch/gradient-in-face).
const VARIANTS = {
  // In product, on white or the rail's #F7F8FC — the default everywhere
  // inside the application (sidebar, Home, Ask Compass, sign-in, docs).
  product:   { lit: "#E4E0F2", shaded: COLOR.purple },
  // Gradient tile / app-icon only — the mark as it sits on the violet
  // gradient tile (favicon, dock, Teams/Slack listing).
  tile:      { lit: "rgba(255,255,255,.55)", shaded: "#FFFFFF" },
  // Marketing backdrop only — no violet in the backdrop.
  marketing: { lit: "#F3F1F9", shaded: "#E4E0F2" },
  // One-colour / ink — monochrome contexts (audit PDF, etc).
  ink:       { lit: "#8A8EA3", shaded: "#0F1224" },
};

// v2.0 spec §4 — the tile is the front door; once inside, the mark
// stands on its own. This wrapper exists ONLY for genuine app-icon
// contexts (favicon, browser tab, phone home screen, dock, Teams/Slack
// listing, app listing) — never for anything rendered inside the product.
export const APP_ICON_GRADIENT = `linear-gradient(147deg, ${COLOR.gradientStart} 0%, ${COLOR.gradientMid} 52%, ${COLOR.gradientEnd} 100%)`;

// Master artwork lives on a 0-100 canvas, but the visible needle only
// occupies roughly 12.52-71.92 of it — centred on neither axis of the
// full canvas (bounding-box centre sits at 42.22, not 50). The v2.0
// sidebar/product rendering crops to this trim box instead of shrinking
// the untrimmed 100×100 artwork, which is what actually lands the
// visible artwork's own bounding-box centre on the rendered box's
// centre (verified: (6.52+65.92)/2 / 72 ≈ 50.3% of the trimmed box,
// vs 42.22% untrimmed) — a viewBox crop, not a translate hack. Path
// data is completely unchanged either way.
const TRIM_VIEWBOX = "6 6 72 72";
const MASTER_VIEWBOX = "0 0 100 100";

// Canonical mark, no tile. This is what every in-product consumer uses.
// trimBox selects the sidebar/product crop above; the master (untrimmed)
// viewBox remains the default for every other context.
export function CompassLogo({ size = 36, variant = "product", trimBox = false, style }) {
  const { lit, shaded } = VARIANTS[variant];
  return (
    <svg width={size} height={size} viewBox={trimBox ? TRIM_VIEWBOX : MASTER_VIEWBOX} fill="none" aria-hidden="true" style={{flexShrink:0, ...style}}>
      <path d={MARK_PATHS.lit} fill={lit}/>
      <path d={MARK_PATHS.shaded} fill={shaded}/>
    </svg>
  );
}

// App-icon-only variant: the gradient tile (23% corner radius, signature
// gradient, inset highlight) with the mark in the tile colour pair on
// top. Below 32px the gradient reads as mud per the spec, so callers at
// 16px must pass tileBackground="flat" for a solid #7A2FD8 tile instead.
// Mark size/centring is not independently designed here — it's the exact
// ratio measured out of the canonical compass-icon-gradient.svg /
// compass-icon-flat.svg master assets (`translate(96 96) scale(3.2)` on
// a 512 tile → the mark's own 100-unit canvas rendered at 62.5% of the
// tile, centred): 100*3.2/512 = 0.625. That construction places the
// mark's own untrimmed canvas — not its visible triangle bounding box —
// at the tile's exact centre; the triangles' own bounding box (they
// don't fill their canvas symmetrically) lands at ~45.1% of the tile
// width, verified both analytically and by rendering the canonical SVG
// live. No offset is applied beyond what the shipped asset itself uses.
export function CompassAppIcon({ size = 32, tileBackground = "gradient" }) {
  const markSize = size * 0.625;
  return (
    <div style={{
      width: size, height: size, borderRadius: "23%",
      background: tileBackground === "flat" ? COLOR.purple : APP_ICON_GRADIENT,
      boxShadow: "inset 0 1.5px 0 rgba(255,255,255,.30), 0 2px 5px rgba(30,16,80,.16)",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <CompassLogo size={markSize} variant="tile"/>
    </div>
  );
}

// Canonical lockup: mark + wordmark, baseline aligned. v2.0 spec §6 gives
// exact ratios off the mark size — gap = 40% of mark width, wordmark cap
// height ≈ 78% of mark height. Archivo's cap-height sits at ~0.72 of its
// em box (no exact metrics table was supplied), so font-size is derived
// as (0.78 × size) / 0.72 — flagged here as the one interpolated value in
// an otherwise exact-value spec, same as tokens.js's own precedent for
// values without a literal spec entry.
export function CompassLockup({ size = 36, variant = "product", trimBox = false, wordColor = COLOR.ink, style }) {
  const gap = Math.round(size * 0.4);
  const wordSize = Math.round((size * 0.78) / 0.72);
  return (
    <span style={{display:"inline-flex", alignItems:"baseline", gap, flexShrink:0, ...style}}>
      <CompassLogo size={size} variant={variant} trimBox={trimBox}/>
      <span style={{
        fontFamily: FONT.sans, fontSize: wordSize, fontWeight: 850,
        fontStretch: "100%", letterSpacing: "-0.055em", color: wordColor,
        lineHeight: 1, whiteSpace: "nowrap",
      }}>
        Compass
      </span>
    </span>
  );
}
