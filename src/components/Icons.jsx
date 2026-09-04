// Small shared SVG icons, replacing emoji glyphs (✓ ✕ ⚠ 💡 🔒 ☰) that
// were previously used as inline UI icons — bundled here the same way
// Primitives.jsx bundles Badge/Btn/Card/SectionTitle, rather than one file
// per icon, since none of these has enough surface area to justify its own.
// All default to currentColor so they inherit color from the parent style.

// Home UX Polish pass, §9 — Ask Compass previously used a plain chat-
// bubble glyph in the sidebar nav and the account-tier widget, but a
// different sparkle/spark glyph on Home's own input — three different
// icons for one capability. This is now the one shared glyph for every
// Ask Compass surface (nav, Home input, the account-tier widget).
export function AskCompassIcon({ size = 15, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
    </svg>
  );
}

export function CheckIcon({ size = 12, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function CrossIcon({ size = 12, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function WarningIcon({ size = 15, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function InfoIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function LockIcon({ size = 11, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function MenuIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

// Phase C (expanding sidebar rail) — nav-item icon set. The desktop
// sidebar had no per-item icons at all before this (every nav row was
// text-only); the rail's 72px resting width needs one to stay
// "understandable and reachable" per destination. All 16px/1.6-stroke/
// round-cap/round-join/currentColor, matching the design spec's icon
// system exactly, and aria-hidden at every call site (the visible label
// text remains the button's real accessible name — these add no name of
// their own).
export function HomeIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function CasesIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <path d="M3 8a1 1 0 0 1 1-1h4.5l2 2H20a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

export function TasksIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="m8.5 12 2.2 2.2L16 9" />
    </svg>
  );
}

export function PeopleIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 6.2a3 3 0 0 1 0 5.6" />
      <path d="M17 14.5c2.2.4 3.8 1.8 3.8 5.5" />
    </svg>
  );
}

export function CalendarIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6.5" />
      <line x1="16" y1="3" x2="16" y2="6.5" />
    </svg>
  );
}

export function ClipboardIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <rect x="5.5" y="4.5" width="13" height="17" rx="2" />
      <path d="M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5V6H9Z" />
      <line x1="8.5" y1="11" x2="15.5" y2="11" />
      <line x1="8.5" y1="14.5" x2="15.5" y2="14.5" />
      <line x1="8.5" y1="18" x2="13" y2="18" />
    </svg>
  );
}

export function FlagIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <path d="M5 21V4" />
      <path d="M5 4.5c1.4-1 4-1 5.5 0s4.1 1 5.5 0v9c-1.4 1-4 1-5.5 0s-4.1-1-5.5 0Z" />
    </svg>
  );
}

export function BarChartIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <line x1="5" y1="20" x2="5" y2="13" />
      <line x1="12" y1="20" x2="12" y2="6" />
      <line x1="19" y1="20" x2="19" y2="10" />
    </svg>
  );
}

export function UsersMinusIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <line x1="16" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function HeartIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <path d="M12 20.2s-7.5-4.6-9.7-9.3C.8 7.3 2.7 4 6.2 4c2 0 3.4 1 5.8 3.4C14.4 5 15.8 4 17.8 4c3.5 0 5.4 3.3 3.9 6.9-2.2 4.7-9.7 9.3-9.7 9.3Z" />
    </svg>
  );
}

export function ShieldIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <path d="M12 3.5 19.5 6.5V11c0 5-3.2 8.5-7.5 9.5-4.3-1-7.5-4.5-7.5-9.5V6.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

export function GearIcon({ size = 16, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6M17.7 17.7l-1.6-1.6M7.9 7.9 6.3 6.3" />
    </svg>
  );
}
