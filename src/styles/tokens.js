// Phase 2A (Compass Design Vision, docs/DESIGN/COMPASS_DESIGN_VISION.md) —
// the "Design Tokens" section made real. These are the EXISTING brand
// values (warm paper, DM Serif Display/DM Sans, the purple/red/amber/
// green already used throughout the app) formalised into one shared,
// named source — not a new palette. Deliberately NOT applied as a
// global find-and-replace: introduced here, then adopted screen-by-screen
// as each one is actually redesigned (Home, Case Workspace shell,
// Overview this phase), so a token change can never silently regress a
// screen nobody has visually re-verified yet.
//
// Deliberately a plain values module, not a CSS-in-JS/styled-components
// layer — matches this codebase's existing convention of inline style
// objects built from literals everywhere else (App.jsx, HomeScreen.jsx,
// CaseViewScreen.jsx, etc.). Importing named constants into that same
// pattern is the smallest possible step that still gets consistency,
// without introducing a new styling paradigm mid-product.

export const FONT = {
  serif: '"DM Serif Display",Georgia,serif',
  sans: '"DM Sans",system-ui,sans-serif',
};

// One 6-level scale, replacing the ~9 ad hoc heading sizes found across
// Home/Case Workspace during the design review. Each entry is a ready-to-
// spread style fragment.
export const TYPE = {
  identity:       { fontFamily: FONT.serif, fontSize: 26, fontWeight: 400, letterSpacing: "-0.2px" },
  pageTitle:      { fontFamily: FONT.sans,  fontSize: 20, fontWeight: 600 },
  sectionHeading: { fontFamily: FONT.sans,  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" },
  body:           { fontFamily: FONT.sans,  fontSize: 13, fontWeight: 400 },
  metadata:       { fontFamily: FONT.sans,  fontSize: 12, fontWeight: 500 },
  micro:          { fontFamily: FONT.sans,  fontSize: 11, fontWeight: 600 },
};

// One consistent rhythm. Existing ad hoc padding/margin/gap values across
// Home/Case Workspace collapse onto this scale as each is touched.
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

// Two radii only: a real surface, and a true pill for status badges.
export const RADIUS = { surface: 8, pill: 999 };

export const COLOR = {
  paper: "#FDFAF5",
  surface: "#FFFFFF",
  border: "#E8E0D0",
  borderFaint: "#F1EBDD",

  ink: "#1C1820",
  inkSoft: "#6B6375",
  inkFaint: "#9B9098",
  inkQuiet: "#C4BAB0",

  // The one brand accent — interactive/primary only, never decorative.
  purple: "#7C5CFC",
  purpleDeep: "#5B3FD4",
  purpleTint: "#EDE8FF",

  // Semantic only — urgency/status, never a category colour.
  red: "#C84B2F",
  redTint: "#FFF0ED",
  amber: "#B8850F",
  amberTint: "#FFF6E0",
  green: "#1A7A4A",
  greenTint: "#E8F5EE",
};

// Caps primary reading content on very large monitors (1920px+) so rows/
// text don't stretch uncomfortably wide; unaffected at 1440 and below,
// where the existing layouts already fit inside this comfortably.
export const CONTENT_MAX_WIDTH = 1200;

// Button hierarchy — primary (filled), secondary (outline), tertiary
// (text-only), destructive (red outline), each a ready style fragment.
// Deliberately separate from src/components/Primitives.jsx's own Btn —
// that component is shared by 40+ files well outside this phase's scope
// (Settings sections, modals, RedundancyScreen, etc.); changing its
// output would ripple into all of them. These tokens are for the
// screens actually being redesigned this phase; Primitives.jsx is
// candidate for migrating onto these same tokens in a later phase, once
// its own consumers are in scope.
export const BUTTON = {
  primary: {
    background: COLOR.purple, border: "none", color: "#fff",
    borderRadius: RADIUS.surface, fontWeight: 600, cursor: "pointer",
    fontFamily: FONT.sans,
  },
  secondary: {
    background: COLOR.surface, border: `1px solid ${COLOR.border}`, color: COLOR.inkSoft,
    borderRadius: RADIUS.surface, fontWeight: 600, cursor: "pointer",
    fontFamily: FONT.sans,
  },
  tertiary: {
    background: "none", border: "none", color: COLOR.purple,
    fontWeight: 600, cursor: "pointer", fontFamily: FONT.sans, padding: 0,
  },
  destructive: {
    background: "none", border: `1px solid ${COLOR.red}44`, color: COLOR.red,
    borderRadius: RADIUS.surface, fontWeight: 600, cursor: "pointer",
    fontFamily: FONT.sans,
  },
};
