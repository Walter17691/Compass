// Organisational ER Intelligence (Phase 6, OP16, §13) — organisational
// risk map. Deliberately NOT a single blended numeric "risk score" per
// site — combining case volume (a count), duration (days), and
// bottleneck presence (a boolean) into one fake unified number would
// misrepresent precision this data doesn't support. Instead this
// produces independent, real flags per site, each traceable back to a
// genuine metric already computed elsewhere in this phase (OP4's site
// intelligence, OP10's process bottlenecks by location, OP15's logged
// organisational events) — never using protected characteristics as an
// input, per the spec's own hard constraint.
//
// SCOPE NOTE: the spec's own category list ("Process risk, Management
// capability, Employee relations volume, Case delay, Appeal
// vulnerability, Policy confusion, Operational change, Workforce
// communication") is framed as "potential categories," not a required
// checklist. Only four are implemented as real PER-SITE flags here,
// because only four have genuine site-level data behind them: ER
// volume and Case delay (OP4's own site breakdown), Process risk
// (OP10's bottleneck-by-location), and Operational change (OP15's
// org_events.affectedLocations). Management capability (managerInsights.js
// is explicitly org-wide only, by design — never broken down by site
// or manager), Appeal vulnerability (OP11), Policy confusion (OP13),
// and Workforce communication (no real per-site signal exists for this
// anywhere in the app) stay covered organisation-wide elsewhere in
// Insights, not force-fit into a fabricated per-site number.
import { computePctChange } from './trendDetection';

const VOLUME_MULTIPLIER = 1.5; // flag a site at >=150% of the average per-site case count
const DURATION_INCREASE_PCT = 20; // same threshold trendDetection.js's own SIGNIFICANT_INCREASE_PCT uses
const MIN_DURATION_SAMPLE = 3;
// Organisational ER Intelligence (Phase 6, OP17, §24) — data-quality
// floor for the volume flag specifically: without this, an org with
// only a couple of sites and single-digit case counts could see "150%
// of average" trip on noise (e.g. 2 cases vs an average of 1). The
// other three flags already carry their own real floor (MIN_DURATION_SAMPLE,
// or simply requiring a genuine bottleneck/logged event to exist).
const MIN_VOLUME_SAMPLE = 3;

export function computeSiteRiskFlags({ locationCounts, locationDurations, companyAvgDuration, bottlenecks, orgEvents }) {
  const sites = Object.keys(locationCounts || {}).filter(s => s !== "Not specified");
  if (!sites.length) return [];

  const counts = sites.map(s => locationCounts[s]);
  const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;

  const bottleneckedSites = new Set();
  (bottlenecks || []).forEach(b => (b.byLocation || []).forEach(l => { if (l.location !== "Not specified") bottleneckedSites.add(l.location); }));

  const eventSites = new Set();
  (orgEvents || []).forEach(ev => (ev.affectedLocations || []).forEach(loc => eventSites.add(loc)));

  return sites.map(site => {
    const flags = [];
    const count = locationCounts[site];
    if (avgCount > 0 && count >= MIN_VOLUME_SAMPLE && count >= avgCount * VOLUME_MULTIPLIER) {
      flags.push({ category: "er_volume", label: "Elevated case volume", detail: `${count} cases vs an average of ${Math.round(avgCount * 10) / 10} per site` });
    }

    const duration = locationDurations?.[site];
    if (duration && duration.count >= MIN_DURATION_SAMPLE && companyAvgDuration) {
      const pct = computePctChange(duration.avg_days, companyAvgDuration);
      if (pct >= DURATION_INCREASE_PCT) {
        flags.push({ category: "case_delay", label: "Above-average case duration", detail: `${duration.avg_days}d vs a company average of ${companyAvgDuration}d (+${pct}%)` });
      }
    }

    if (bottleneckedSites.has(site)) {
      flags.push({ category: "process_risk", label: "Process bottleneck", detail: "At least one process stage is running longer than target at this site" });
    }

    if (eventSites.has(site)) {
      flags.push({ category: "operational_change", label: "Recent organisational change logged", detail: "An organisational event has been logged affecting this site" });
    }

    return { site, caseCount: count, flags };
  }).sort((a, b) => b.flags.length - a.flags.length);
}
