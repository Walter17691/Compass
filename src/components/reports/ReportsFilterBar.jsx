import { COLOR, FONT, RADIUS } from '../../styles/tokens';
import { DATE_RANGE_PRESETS } from '../../lib/reportsAnalytics';

const selectStyle = {
  fontSize: 13, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.surface, padding: "8px 12px",
  color: COLOR.ink, background: COLOR.surface, fontFamily: FONT.sans, cursor: "pointer",
};

// Insights Visual Upgrade, Phase 1 — the one global filter bar for
// Reports. Deliberately only 3 controls (date/location/case type), per
// the approved spec — no stage/outcome filter yet (Phase 1 is bounded).
// Location/case-type options are derived from whatever actually appears
// in the currently-loaded `cases` (via the caller), never a separate
// fetch — this also means the dropdown can never offer a location/type
// that doesn't actually exist in this org's own case data.
export function ReportsFilterBar({ dateRangeId, onDateRangeChange, location, onLocationChange, locationOptions = [], caseType, onCaseTypeChange, caseTypeOptions = [] }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
      <select aria-label="Date range" value={dateRangeId} onChange={e => onDateRangeChange(e.target.value)} style={selectStyle}>
        {DATE_RANGE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <select aria-label="Location" value={location} onChange={e => onLocationChange(e.target.value)} style={selectStyle}>
        <option value="">All locations</option>
        {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
      <select aria-label="Case type" value={caseType} onChange={e => onCaseTypeChange(e.target.value)} style={selectStyle}>
        <option value="">All case types</option>
        {caseTypeOptions.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
      </select>
    </div>
  );
}
