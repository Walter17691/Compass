// Phase 2A (Compass Design Vision, docs/DESIGN/COMPASS_DESIGN_VISION.md) —
// the "Design Tokens" section made real. Deliberately a plain values
// module, not a CSS-in-JS/styled-components layer — matches this
// codebase's existing convention of inline style objects built from
// literals everywhere else (App.jsx, HomeScreen.jsx, CaseViewScreen.jsx,
// etc.). Importing named constants into that same pattern is the
// smallest possible step that still gets consistency, without
// introducing a new styling paradigm mid-product.
//
// Visual Identity pass — canonical revision per the written Compass
// design specification (rail-rest_2.png / rail-open_2.png references).
// This REPLACES the previous identity's values (ink #11111B, violet
// #5B3DF5/#4B2BEF, warm paper #FCFBFF) with the approved palette below.
// Every existing call site keeps the same token NAMES (COLOR.purple,
// COLOR.ink, TYPE.identity, etc.) — only the values they resolve to
// changed — so this is a high-leverage, centralised swap rather than a
// per-file migration.

// Archivo only, everywhere: hierarchy comes from weight/size/tracking,
// never from mixing families. FONT.serif and FONT.sans deliberately
// resolve to the same string — kept as two named roles only so every
// existing call site importing either keeps working unchanged.
// FONT.mono also now resolves to Archivo: IBM Plex Mono must not remain
// the metadata interface font per the design spec (dates/times/labels
// use Archivo like everything else). The Google Fonts load for IBM Plex
// Mono has been dropped entirely — nothing in the token system
// references it any more (see index.css for the one remaining place it
// might still linger: none — confirmed removed).
export const FONT = {
  serif: '"Archivo",system-ui,sans-serif',
  sans: '"Archivo",system-ui,sans-serif',
  mono: '"Archivo",system-ui,sans-serif',
};

// The approved Archivo hierarchy (design spec §5). Existing key names
// preserved for every current consumer; values updated to the spec
// table. Two tiers not covered by an exact spec entry (pageTitle — this
// app's ordinary section/screen header, distinct from the big "identity"
// hero heading — and micro) were interpolated to the same weight/
// tracking spirit as the tiers around them, not invented from nothing;
// called out in the Phase A report rather than presented as spec-exact.
export const TYPE = {
  // "identity" = the design spec's "Page title" role — the big hero/
  // greeting heading (rail-rest_2.png's "Good morning, Walter"; this
  // app's greeting and employee/case-name headings).
  identity:       { fontFamily: FONT.serif, fontSize: 34, lineHeight: "1.08", fontWeight: 800, letterSpacing: "-0.035em" },
  // Ordinary screen/section header (e.g. "Settings", "Cases") — not an
  // exact spec entry; interpolated at the same 700-weight/tight-tracking
  // character as every other tier, size left where it already was.
  pageTitle:      { fontFamily: FONT.sans,  fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" },
  // Spec's "Section title". No longer uppercase/wide-tracked — the spec
  // is explicit ("No uppercase tracked-label styling. Sentence case
  // throughout."), which reverses this token's previous eyebrow-label
  // treatment.
  sectionHeading: { fontFamily: FONT.sans,  fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" },
  // Spec's "Row name".
  rowName:        { fontFamily: FONT.sans,  fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.02em" },
  // Spec's "Row context".
  rowContext:     { fontFamily: FONT.sans,  fontSize: 13, fontWeight: 500 },
  // Spec's "Body".
  body:           { fontFamily: FONT.sans,  fontSize: 14, lineHeight: "1.5", fontWeight: 400 },
  // Spec's "Metadata".
  metadata:       { fontFamily: FONT.sans,  fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" },
  // Not an exact spec entry (spec has no "micro" tier below metadata);
  // left at its previous size, weight only nudged to the shared 600.
  micro:          { fontFamily: FONT.sans,  fontSize: 11, fontWeight: 600 },
  // Spec's "Button" (secondary weight; primary buttons use 700 — see
  // BUTTON below), "Pill", "Nav", and "Big figures" roles, added new
  // since nothing in the token system named them explicitly before.
  button:         { fontFamily: FONT.sans,  fontSize: 13.5, fontWeight: 600 },
  pill:           { fontFamily: FONT.sans,  fontSize: 11.5, fontWeight: 700 },
  nav:            { fontFamily: FONT.sans,  fontSize: 14, fontWeight: 600 },
  bigFigure:      { fontFamily: FONT.sans,  fontSize: 34, fontWeight: 800, letterSpacing: "-0.05em", fontVariantNumeric: "tabular-nums" },
};

// One consistent rhythm. Existing ad hoc padding/margin/gap values across
// Home/Case Workspace collapse onto this scale as each is touched.
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

// surface = general small-element radius (inputs, misc chrome — no exact
// spec entry, left at its previous value). card/button/chip are the
// spec's exact §6-8 values. pill stays 999 (true stadium shape) for the
// handful of consumers that want a fully round pill rather than the
// spec's low-radius "chip" tag (badges/status tags use `chip`, per §8 —
// despite the spec calling that role "pill", a 24px-tall/7px-radius
// shape is a rounded-rect chip, not a stadium; kept the true-999 token
// under its old name since existing consumers of RADIUS.pill expect a
// fully round shape, e.g. avatar-adjacent dots).
export const RADIUS = { surface: 8, pill: 999, card: 14, button: 10, chip: 7 };

export const COLOR = {
  // ── Ink scale ──
  ink: "#0F1224",
  inkSoft: "#4A4E63",   // spec's ink2
  inkFaint: "#5E627A",  // spec's ink3
  inkQuiet: "#8A8EA3",  // spec's placeholder

  // ── Surfaces ──
  paper: "#FFFFFF",       // spec's "ground" — page background is now plain white, not an off-white paper tone
  surface: "#FFFFFF",
  rail: "#F7F8FC",        // sidebar/rail surface only
  border: "#E8EAF2",
  borderStrong: "#E3E5EE", // inputs / secondary borders
  borderFaint: "#F0F1F7",  // spec's "hair" — internal row dividers

  // ── Violet — the one brand accent, interactive/primary only, never
  // decorative. Ordinary interaction colour is #7A2FD8; there is no
  // separate "deep" tier in the new spec (the old purpleDeep is folded
  // into the same value) and no blue application accent anywhere —
  // the indigo below exists ONLY as a signature-gradient stop. ──
  purple: "#7A2FD8",
  purpleDeep: "#7A2FD8",
  purpleTint: "#F3EDFD",
  violetOnInk: "#B27CF0", // violet text/icons on a dark/ink surface — not yet used anywhere, added for spec completeness
  // Rarely-needed barely-there wash; kept only because a couple of
  // pre-existing call sites reference it. Sidebar/rail surfaces use
  // COLOR.rail (a neutral, not a violet tint) per the design spec.
  purpleSubtle: "#F7F8FC",

  // Signature gradient stops (Compass logo tile, primary-button fill).
  // The indigo start (#4F2BE8) must NEVER be used standalone anywhere
  // else — see the gradient helper below.
  gradientStart: "#4F2BE8",
  gradientMid: "#7A2FD8",
  gradientEnd: "#A83CC0",

  // ── Semantic — urgency/compliance only, never a category colour ──
  red: "#C2261B",
  redTint: "#FCEBE9",
  amber: "#8A5A00",
  amberTint: "#FBF3E4",
  green: "#0B6B4A",
  greenTint: "#E8F5EE",

  // Visual Identity pass (final spec compliance correction) — blue/
  // blueTint REMOVED entirely, per the design spec's explicit "there is
  // no blue" rule. Confirmed zero remaining consumers of this token
  // before deletion (it was already unused — the actual visible blue was
  // a separate raw hex, #2E6BA8/#1C5AA0/#4A6FA5, hardcoded directly in
  // ~10 files: the global toast's "info" state, several category-colour
  // maps in Calendar/Search/Wellbeing/Timeline/Communications, a Btn
  // variant, and two eyebrow labels — each mapped individually to the
  // approved neutral/violet/red/amber/green palette rather than a
  // mechanical repo-wide substitution).

  // Neutral (non-semantic) chip — "6 days"/"12 days"-style tags in the
  // reference that carry no urgency meaning.
  neutralChipBg: "#F1F2F7",
  neutralChipText: "#4A4E63",
};

// The approved signature gradient (design spec §1/§3) — logo tile and
// primary-button fill ONLY. Never a text/border/decorative colour, never
// applied to large surfaces.
export const GRADIENT = `linear-gradient(147deg, ${COLOR.gradientStart} 0%, ${COLOR.gradientMid} 52%, ${COLOR.gradientEnd} 100%)`;

// Caps primary reading content on very large monitors (1920px+) so rows/
// text don't stretch uncomfortably wide; unaffected at 1440 and below,
// where the existing layouts already fit inside this comfortably.
export const CONTENT_MAX_WIDTH = 1200;

// Button hierarchy — primary (signature gradient fill), secondary
// (outline), tertiary (text-only), destructive (red outline), each a
// ready style fragment, per design spec §7. Deliberately separate from
// src/components/Primitives.jsx's own Btn — that component is shared by
// 40+ files well outside this phase's scope; changing its own output is
// handled directly in Primitives.jsx itself (below) rather than here.
export const BUTTON = {
  primary: {
    background: GRADIENT, border: "none", color: "#fff",
    borderRadius: RADIUS.button, fontWeight: 700, cursor: "pointer",
    fontFamily: FONT.sans, height: 42, padding: "0 18px", fontSize: 13.5,
  },
  secondary: {
    background: COLOR.surface, border: `1px solid ${COLOR.borderStrong}`, color: COLOR.ink,
    borderRadius: RADIUS.button, fontWeight: 600, cursor: "pointer",
    fontFamily: FONT.sans, height: 42, padding: "0 18px", fontSize: 13.5,
  },
  tertiary: {
    background: "none", border: "none", color: COLOR.purple,
    fontWeight: 700, cursor: "pointer", fontFamily: FONT.sans, padding: 0, fontSize: 13.5,
  },
  destructive: {
    background: "none", border: `1px solid ${COLOR.red}44`, color: COLOR.red,
    borderRadius: RADIUS.button, fontWeight: 600, cursor: "pointer",
    fontFamily: FONT.sans,
  },
};
