import { useState } from 'react';
import { SCREENS } from '../constants';
import { authedFetch } from '../lib/authedFetch';
import { useLoadMore } from '../hooks/useLoadMore';
import { COLOR, TYPE, FONT, RADIUS, SPACE } from '../styles/tokens';
import {
  DEFAULT_DATE_RANGE_ID, resolveDateRange, bucketGranularityForRange,
  buildEmployeeRecordsByName, applyReportFilters, caseLocationName,
  casesCreatedInRange, casesClosedInRange, computeDurationStats,
  computeOpenedClosedSeries, computeAgeingDistribution,
  breakdownByType, breakdownByStage, breakdownByOutcome, breakdownByLocation, breakdownByTheme,
} from '../lib/reportsAnalytics';
import { KpiCard } from '../components/reports/KpiCard';
import { BreakdownBarChart } from '../components/reports/BreakdownBarChart';
import { TrendLineChart } from '../components/reports/TrendLineChart';
import { ReportsFilterBar } from '../components/reports/ReportsFilterBar';

// Insights Visual Upgrade, Phase 1 — the Reports dashboard, rebuilt
// around the approved hierarchy (filters -> KPI row -> primary trend ->
// secondary breakdowns -> operational health -> decisions/distribution ->
// organisational patterns -> supporting detail), replacing the previous
// "AI narrative first, charts eventually" ordering the product review
// screenshotted in production. The Management Analysis (AI) section is
// NOT rendered here — InsightsScreen.jsx renders it as a separate,
// collapsed sibling below this component, since ExecutiveBriefPanel/
// PeriodicReviewPanel need org/user/memberName props this screen has
// never carried and there is no reason to newly thread them through here
// just to nest components that already fetch and own their own state.
//
// CURRENT STATE vs PERIOD, made explicit throughout (per the approved
// spec, §14): Open cases, Overdue actions, Cases by stage, and Case
// ageing never change when the date range changes — they describe right
// now. New cases, Closed cases, Case duration, the opened-vs-closed
// trend, and the type/outcome/location/theme breakdowns all describe
// activity within the selected period. Location/case-type filters apply
// to both kinds equally (a genuine, meaningful scope), only the date
// dimension is restricted to period metrics.
export function ErReportScreen({ cases, getCaseStage, employeeRecords, dueSoon, onViewCases, setReportNarrative, reportNarrative, setActiveCaseId, setActiveCaseStage, setScreen, setActivePerson, getNextStep, fmtDate, loadJsPDF, caseThemes, organisationThemes, isHR }) {
  const [dateRangeId, setDateRangeId] = useState(DEFAULT_DATE_RANGE_ID);
  const [location, setLocation] = useState("");
  const [caseType, setCaseType] = useState("");
  const [showAiSummary, setShowAiSummary] = useState(false);
  // Insights Visual Upgrade, Phase 1 — Final Polish, Change 2. Active
  // Cases is supporting detail, not the dashboard's purpose — collapsed
  // by default so a high-volume org's 150+ rows don't make Reports feel
  // endless. useLoadMore's own pagination state (activeCasesTable below)
  // is unaffected by this toggle: it's computed once at the top of the
  // component, not inside the collapsible branch, so hiding/showing the
  // table never resets "loaded more" progress.
  const [showActiveCases, setShowActiveCases] = useState(false);

  // Frozen once per mount — the same convention every other Insights
  // panel uses (OrganisationalIntelligenceOverview's trendNow,
  // TrendsPanel's own trendNow) so the displayed counts and any
  // drill-down click a moment later always agree with the exact instant
  // they were computed from.
  const [now] = useState(() => new Date());
  const { from, to, days } = resolveDateRange(dateRangeId, null, now);
  const granularity = bucketGranularityForRange(days);

  const employeeRecordsByName = buildEmployeeRecordsByName(employeeRecords);
  // CURRENT STATE base: location/case-type filtered, never date-bound.
  const currentCases = applyReportFilters(cases, employeeRecordsByName, { location, caseType });
  // PERIOD base: the same filters, further restricted to cases created
  // within the selected window — the base for the composition
  // breakdowns (type/outcome/location/theme), which genuinely do respond
  // to the date range (only stage/ageing are pinned to current-state,
  // per the approved spec's own explicit instruction).
  const periodCases = casesCreatedInRange(currentCases, from, to);

  const locationOptions = Object.keys(applyReportFilters(cases, employeeRecordsByName, { caseType }).reduce((acc, cs) => { acc[caseLocationName(cs, employeeRecordsByName)] = true; return acc; }, {})).sort();
  const caseTypeOptions = Array.from(new Set(applyReportFilters(cases, employeeRecordsByName, { location }).map(cs => cs.caseType).filter(Boolean))).sort();

  const viewCaseIds = (caseIds) => { if (caseIds?.length && onViewCases) onViewCases({ caseIds }); };

  // ── KPIs ──
  const openCaseIds = currentCases.filter(cs => getCaseStage(cs) !== "closed").map(cs => cs.id);
  const overdueCaseIdSet = new Set((dueSoon || []).filter(d => d.overdue && d.caseId).map(d => d.caseId));
  const currentCaseIdSet = new Set(currentCases.map(cs => cs.id));
  const overdueCaseIds = Array.from(overdueCaseIdSet).filter(id => currentCaseIdSet.has(id));
  const createdInRange = casesCreatedInRange(currentCases, from, to);
  const closedInRange = casesClosedInRange(currentCases, from, to, getCaseStage);
  const durationStats = computeDurationStats(currentCases, from, to, getCaseStage);
  const series = computeOpenedClosedSeries(currentCases, from, to, granularity, getCaseStage);

  // ── Breakdowns ──
  const typeBreakdown = breakdownByType(periodCases);
  const stageBreakdown = breakdownByStage(currentCases, getCaseStage); // CURRENT STATE — never date-scoped
  const outcomeBreakdown = breakdownByOutcome(periodCases);
  const locationBreakdown = breakdownByLocation(periodCases, employeeRecordsByName);
  const themeBreakdown = breakdownByTheme(periodCases, caseThemes, organisationThemes);
  const ageingDistribution = computeAgeingDistribution(currentCases, getCaseStage, now); // CURRENT STATE, open cases only

  // ── Secondary/compact facts (never a 6th KPI card, per the approved spec) ──
  const highRisk = currentCases.filter(cs => (cs.meetings || []).some(m => m.riskScore?.rating === "HIGH"));
  const appealCaseIds = currentCases.filter(cs => getCaseStage(cs) === "appeal").map(cs => cs.id);
  const slowInvestigations = currentCases.filter(cs => {
    if (getCaseStage(cs) === "closed" || cs.investigationReport) return false;
    const invMeetings = (cs.meetings || []).filter(m => (m.type || "").toLowerCase().includes("investigation"));
    if (!invMeetings.length) return false;
    const first = invMeetings[0];
    const start = new Date(first.savedAt || first.date || 0);
    return (now - start) / (1000 * 60 * 60 * 24) > 28;
  });
  const pendingSigs = currentCases.reduce((a, cs) => a + (cs.evidence || []).filter(e => e.signStatus === "pending" && e.signId).length, 0);

  // ── Repeat employees (unchanged from before — HR-only, never a
  // manager/individual league table; see this file's own prior history) ──
  const casesByEmployee = {};
  currentCases.forEach(cs => { casesByEmployee[cs.employeeName] = (casesByEmployee[cs.employeeName] || 0) + 1; });
  const repeatEmployees = Object.entries(casesByEmployee).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);

  const activeCases = currentCases.filter(cs => getCaseStage(cs) !== "closed");
  const activeCasesTable = useLoadMore(activeCases, 20);

  return (
    <div>
      {/* Insights Visual Upgrade, Phase 1 — Final Polish, Change 1. The
          KPI row's column count is the one piece of this dashboard that
          genuinely needs a real CSS breakpoint rather than JS-computed
          inline styles (inline `style` always beats a class, even inside
          a media query, so grid-template-columns has to live here, not
          on the div itself) — same technique HomeScreen.jsx/AppSidebar.jsx
          already use for their own responsive rules, no new dependency.
          Below 1240px the existing repeat(auto-fit,minmax(180px,1fr))
          is kept exactly as it already behaved (a balanced 3-then-2 at
          typical laptop widths) — only the two new tiers (5-across at
          genuinely wide desktop, 2/1 at tablet/mobile) are added. 1240px
          was chosen, not 1200 (CONTENT_MAX_WIDTH), because the KPI grid's
          own available width is CONTENT_MAX_WIDTH minus the Insights nav
          rail and its gap (~270px) — 1240px real viewport leaves enough
          room for five ~170px cards without cramping "OVERDUE ACTIONS",
          the longest label. */}
      <style>{`
        .reports-kpi-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:20px; }
        @media (max-width: 767px){ .reports-kpi-grid{ grid-template-columns:1fr; } }
        @media (min-width: 768px) and (max-width: 1023px){ .reports-kpi-grid{ grid-template-columns:repeat(2,1fr); } }
        @media (min-width: 1240px){ .reports-kpi-grid{ grid-template-columns:repeat(5,1fr); } }
      `}</style>

      {/* Header + toolbar — Download board report kept visible near the
          top as an export action (not narrative — a button doesn't
          dominate the page the way paragraphs did), per the approved
          spec's "preserve existing functionality" instruction. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: SPACE.lg, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ ...TYPE.sectionHeading, color: COLOR.inkFaint, margin: "0 0 4px", fontWeight: 700 }}>Reports</h2>
          <p style={{ fontSize: 13, color: COLOR.inkFaint, margin: 0 }}>Understand case activity, outcomes and emerging trends.</p>
        </div>
        <button onClick={async () => {
          const jsPDF = await loadJsPDF();
          const doc = new jsPDF({ unit: "mm", format: "a4" });
          const M = 20, W = doc.internal.pageSize.getWidth(), maxW = W - M * 2;
          let y = 20;
          doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(30); doc.text("Compass HR — Board Report", M, y); y += 6;
          doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(120); doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), M, y); y += 10;
          doc.setDrawColor(124, 92, 252); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 10;
          const stat = (label, value) => { doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(30); doc.text(label + ": ", M, y); doc.setFont("helvetica", "normal"); doc.text(String(value), M + doc.getTextWidth(label + ": "), y); y += 7; };
          stat("Open cases", openCaseIds.length);
          stat("New cases (" + days + "d)", createdInRange.length);
          stat("Closed cases (" + days + "d)", closedInRange.length);
          stat("Case duration", durationStats.value != null ? durationStats.value + "d (" + durationStats.stat + ")" : "Not enough data");
          stat("Overdue actions", overdueCaseIds.length);
          y += 4;
          if (typeBreakdown.visible.length) {
            doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("Cases by type", M, y); y += 6;
            doc.setFontSize(10); doc.setFont("helvetica", "normal");
            typeBreakdown.visible.forEach(e => { doc.text("• " + e.label.charAt(0).toUpperCase() + e.label.slice(1) + ": " + e.count, M + 2, y); y += 5.5; });
            y += 4;
          }
          if (outcomeBreakdown.visible.length) {
            doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("Disciplinary outcomes", M, y); y += 6;
            doc.setFontSize(10); doc.setFont("helvetica", "normal");
            outcomeBreakdown.visible.forEach(e => { doc.text("• " + e.label + ": " + e.count, M + 2, y); y += 5.5; });
            y += 4;
          }
          if (reportNarrative && reportNarrative !== "Generating...") {
            doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("Executive summary", M, y); y += 6;
            doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(60);
            const lines = doc.splitTextToSize(reportNarrative, maxW);
            lines.forEach(line => { if (y > 280) { doc.addPage(); y = 20; } doc.text(line, M, y); y += 5.5; });
          }
          doc.save("Compass_Board_Report_" + new Date().toLocaleDateString("en-GB").split("/").join("-") + ".pdf");
        }} style={{ fontSize: 13, background: COLOR.surface, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.surface, padding: "10px 20px", color: COLOR.ink, fontWeight: 600, cursor: "pointer", fontFamily: FONT.sans, flexShrink: 0 }}>
          Download board report
        </button>
      </div>

      <ReportsFilterBar
        dateRangeId={dateRangeId} onDateRangeChange={setDateRangeId}
        location={location} onLocationChange={setLocation} locationOptions={locationOptions}
        caseType={caseType} onCaseTypeChange={setCaseType} caseTypeOptions={caseTypeOptions}
      />

      {/* KPI row — exactly 5 cards, per the approved spec. Open/Overdue
          are current-state (their sub-line never mentions the date
          range); New/Closed/Duration are period (their sub-line states
          the range explicitly, so nobody mistakes them for current-state
          facts). */}
      <div className="reports-kpi-grid">
        <KpiCard label="Open cases" value={openCaseIds.length} sub="Right now" onClick={() => viewCaseIds(openCaseIds)} />
        <KpiCard label="New cases" value={createdInRange.length} sub={`Last ${days}d`} onClick={() => viewCaseIds(createdInRange.map(cs => cs.id))} />
        <KpiCard label="Closed cases" value={closedInRange.length} sub={`Last ${days}d`} onClick={() => viewCaseIds(closedInRange.map(cs => cs.id))} />
        <KpiCard
          label="Case duration"
          value={durationStats.value != null ? `${durationStats.value}d` : "—"}
          sub={durationStats.value != null ? `${durationStats.stat} · ${durationStats.sampleSize} closed cases` : `Not enough closed cases in the last ${days}d`}
          onClick={durationStats.value != null ? () => viewCaseIds(durationStats.caseIds) : undefined}
        />
        <KpiCard label="Overdue actions" value={overdueCaseIds.length} sub="Right now" accent={overdueCaseIds.length > 0 ? COLOR.red : COLOR.ink} onClick={() => viewCaseIds(overdueCaseIds)} />
      </div>

      {/* Secondary/compact facts — never a 6th KPI card, per the approved
          spec (§13: appeals must not clutter the primary row; high-risk
          likewise kept small and contextual, not a headline number). */}
      {(highRisk.length > 0 || appealCaseIds.length > 0 || slowInvestigations.length > 0 || pendingSigs > 2) && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 20, fontSize: 12.5 }}>
          {highRisk.length > 0 && <button onClick={() => viewCaseIds(highRisk.map(cs => cs.id))} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: COLOR.red, fontWeight: 600, fontFamily: FONT.sans }}>{highRisk.length} high-risk case{highRisk.length === 1 ? "" : "s"}</button>}
          {appealCaseIds.length > 0 && <button onClick={() => viewCaseIds(appealCaseIds)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: COLOR.inkSoft, fontWeight: 600, fontFamily: FONT.sans }}>{appealCaseIds.length} appeal{appealCaseIds.length === 1 ? "" : "s"} in progress</button>}
          {slowInvestigations.length > 0 && <button onClick={() => viewCaseIds(slowInvestigations.map(cs => cs.id))} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: COLOR.amber, fontWeight: 600, fontFamily: FONT.sans }}>{slowInvestigations.length} investigation{slowInvestigations.length === 1 ? "" : "s"} overrunning 28 days</button>}
          {pendingSigs > 2 && <span style={{ color: COLOR.purple, fontWeight: 600 }}>{pendingSigs} signatures pending</span>}
        </div>
      )}

      {/* Primary visual */}
      <div style={{ marginBottom: 20 }}>
        <TrendLineChart
          title="Trend — period"
          subtitle="Cases opened vs closed over time"
          series={series}
          onSelectBucket={(point) => viewCaseIds([...point.openedCaseIds, ...point.closedCaseIds])}
        />
      </div>

      {/* Secondary visuals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20, marginBottom: 20 }}>
        <BreakdownBarChart title="Breakdown — period" subtitle="Cases by type" entries={typeBreakdown.visible} suppressedCount={typeBreakdown.suppressedCount} suppressedLabel="types" emptyMessage="No cases opened in this period." onSelect={e => viewCaseIds(e.caseIds)} />
        <BreakdownBarChart title="Pipeline — current" subtitle="Cases by stage" entries={stageBreakdown.visible} suppressedCount={stageBreakdown.suppressedCount} suppressedLabel="stages" emptyMessage="No open cases." onSelect={e => viewCaseIds(e.caseIds)} />
      </div>

      {/* Operational health — full width */}
      <div style={{ marginBottom: 20 }}>
        <BreakdownBarChart
          title="Operational health — current, open cases only"
          subtitle="Case ageing"
          entries={ageingDistribution}
          emptyMessage="No open cases."
          onSelect={e => viewCaseIds(e.caseIds)}
          color={COLOR.inkSoft}
        />
      </div>

      {/* Decisions / distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20, marginBottom: 20 }}>
        <BreakdownBarChart title="Results — period" subtitle="Outcomes" entries={outcomeBreakdown.visible} suppressedCount={outcomeBreakdown.suppressedCount} suppressedLabel="outcomes" emptyMessage="No outcomes recorded in this period." onSelect={e => viewCaseIds(e.caseIds)} />
        <BreakdownBarChart title="Geography — period, distribution only" subtitle="Cases by location" entries={locationBreakdown.visible} suppressedCount={locationBreakdown.suppressedCount} suppressedLabel="locations" emptyMessage="No location data." onSelect={e => viewCaseIds(e.caseIds)} />
      </div>

      {/* Organisational patterns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20, marginBottom: 20 }}>
        <BreakdownBarChart title="Patterns — period, HR-confirmed only" subtitle="Top recurring themes" entries={themeBreakdown.visible} suppressedCount={themeBreakdown.suppressedCount} suppressedLabel="themes" emptyMessage="No recurring themes confirmed across 3+ cases in this period." onSelect={e => viewCaseIds(e.caseIds)} />

        {isHR && (
          <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.borderFaint}`, borderRadius: RADIUS.surface, padding: "20px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLOR.inkFaint, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 4 }}>Patterns — current</div>
            <div style={{ fontFamily: FONT.serif, fontSize: 18, fontWeight: 400, color: COLOR.ink, marginBottom: 16 }}>Repeat cases</div>
            {repeatEmployees.length === 0 ? (
              <div style={{ fontSize: 13, color: COLOR.inkFaint }}>No employees with multiple cases</div>
            ) : repeatEmployees.slice(0, 5).map(([name, count], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: i < repeatEmployees.length - 1 ? `1px solid ${COLOR.borderFaint}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: COLOR.purpleTint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: COLOR.purple, flexShrink: 0 }}>
                    {name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <button onClick={() => { setActivePerson(name); setScreen(SCREENS.PERSON_VIEW); }} style={{ fontSize: 12, color: COLOR.purple, background: "none", border: "none", cursor: "pointer", fontFamily: FONT.sans, fontWeight: 500, textAlign: "left" }}>{name}</button>
                </div>
                <span style={{ fontSize: 11, color: COLOR.amber, background: COLOR.amberTint, borderRadius: RADIUS.pill, padding: "2px 8px", fontWeight: 600 }}>{count} cases</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supporting detail — active cases table, now below the primary
          analytics rather than above it. Insights Visual Upgrade, Phase 1
          — Final Polish, Change 2: collapsed by default (a high-volume
          org's 150+ rows used to make the page enormous before ever
          reaching the AI section) — the count stays visible in the pill
          whether or not the table is expanded, so "how many active cases"
          never requires opening it. */}
      <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.borderFaint}`, borderRadius: RADIUS.surface, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "16px 20px", borderBottom: showActiveCases ? `1px solid ${COLOR.borderFaint}` : "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLOR.inkFaint, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 2 }}>Detail — current</div>
            <div style={{ fontFamily: FONT.serif, fontSize: 18, fontWeight: 400, color: COLOR.ink }}>Active cases</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: COLOR.purple, background: COLOR.purpleTint, borderRadius: RADIUS.pill, padding: "3px 10px", fontWeight: 600 }}>{activeCases.length} open</span>
            <button onClick={() => setShowActiveCases(s => !s)} aria-expanded={showActiveCases} style={{ fontSize: 13, color: COLOR.purple, background: "none", border: "none", cursor: "pointer", fontFamily: FONT.sans, fontWeight: 600, padding: 0 }}>
              {showActiveCases ? "Hide" : "View active cases"}
            </button>
          </div>
        </div>
        {showActiveCases && (
          <>
            <div style={{ overflowX: "auto", width: "100%", minWidth: 0, boxSizing: "border-box" }}>
              <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: COLOR.paper }}>
                    {["Employee", "Job title", "Case type", "Stage", "Opened", "Days open", "Next action"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: COLOR.inkFaint, letterSpacing: "0.5px", textTransform: "uppercase", borderBottom: `1px solid ${COLOR.borderFaint}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeCasesTable.visible.map((cs, i) => {
                    const stage = getCaseStage(cs);
                    const next = getNextStep(cs);
                    const opened = new Date(cs.dateReceived || cs.createdAt || 0);
                    const daysOpen = Math.round((now - opened) / (1000 * 60 * 60 * 24));
                    const rec = employeeRecordsByName[cs.employeeName] || {};
                    const stageColors = { open: COLOR.inkFaint, investigation: COLOR.inkSoft, disciplinary: COLOR.inkSoft, appeal: COLOR.inkSoft, closed: COLOR.green };
                    return (
                      <tr key={cs.id} style={{ borderBottom: i < activeCasesTable.visible.length - 1 || activeCasesTable.hasMore ? `1px solid ${COLOR.borderFaint}` : "none", cursor: "pointer" }}
                        onClick={() => { setActiveCaseId(cs.id); setActiveCaseStage("investigation"); setScreen(SCREENS.CASE_VIEW); }}
                        onMouseEnter={e => e.currentTarget.style.background = COLOR.paper}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: COLOR.purpleTint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: COLOR.purple, flexShrink: 0 }}>
                              {(cs.employeeName || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 500, color: COLOR.ink }}>{cs.employeeName}</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 16px", color: COLOR.inkSoft }}>{rec.jobTitle || cs.jobTitle || "—"}</td>
                        <td style={{ padding: "10px 16px", color: COLOR.inkSoft }}>{cs.caseType || "HR Matter"}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: stageColors[stage] || COLOR.inkFaint, background: COLOR.borderFaint, borderRadius: RADIUS.pill, padding: "2px 8px" }}>{stage.charAt(0).toUpperCase() + stage.slice(1)}</span>
                        </td>
                        <td style={{ padding: "10px 16px", color: COLOR.inkSoft, whiteSpace: "nowrap" }}>{cs.dateReceived ? fmtDate(cs.dateReceived) : "—"}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ color: daysOpen > 28 ? COLOR.red : daysOpen > 14 ? COLOR.amber : COLOR.ink, fontWeight: daysOpen > 28 ? 600 : 400 }}>{isNaN(daysOpen) || daysOpen < 0 ? "—" : daysOpen + "d"}</span>
                        </td>
                        <td style={{ padding: "10px 16px", color: COLOR.purple, fontSize: 11 }}>{next?.label || "—"}</td>
                      </tr>
                    );
                  })}
                  {activeCases.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: "32px", textAlign: "center", color: COLOR.inkFaint }}>No active cases</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {activeCasesTable.hasMore && (
              <button onClick={activeCasesTable.loadMore} style={{ width: "100%", padding: "12px", background: COLOR.paper, border: "none", borderTop: `1px solid ${COLOR.borderFaint}`, cursor: "pointer", fontSize: 12, color: COLOR.purple, fontWeight: 600, fontFamily: FONT.sans }}>
                Load more ({activeCasesTable.visible.length} of {activeCasesTable.total})
              </button>
            )}
          </>
        )}
      </div>

      {/* Legacy inline AI summary — kept (not rebuilt), moved below the
          deterministic dashboard and collapsed by default, per the
          approved spec ("Move management narrative BELOW the
          deterministic dashboard... Collapsed by default"). This is a
          separate, ephemeral (non-persisted) mechanism from
          ExecutiveBriefPanel/PeriodicReviewPanel — InsightsScreen.jsx
          renders those in their own Management Analysis section
          immediately below this component. */}
      <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.borderFaint}`, borderRadius: RADIUS.surface }}>
        <button onClick={() => setShowAiSummary(s => !s)} aria-expanded={showAiSummary} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", font: "inherit" }}>
          <span style={{ ...TYPE.sectionHeading, color: COLOR.inkFaint }}>Quick AI summary</span>
          <span style={{ fontSize: 13, color: COLOR.purple, fontWeight: 600 }}>{showAiSummary ? "Hide" : "Show"}</span>
        </button>
        {showAiSummary && (
          <div style={{ padding: "0 20px 20px" }}>
            <button onClick={async () => {
              const deltaText = `New cases (${days}d): ${createdInRange.length}. `;
              const themeText = themeBreakdown.visible.length ? "Recurring HR-tagged themes across cases in this period (theme: number of cases tagged): " + themeBreakdown.visible.map(t => t.label + ": " + t.count).join(", ") + ". " : "";
              const prompt = "You are a senior HR director. Write a concise executive summary of the following HR data for this organisation. Be factual and highlight key risks, patterns and recommendations. Data: Open cases: " + openCaseIds.length + ". Case types: " + typeBreakdown.visible.map(e => e.label + ": " + e.count).join(", ") + ". Outcomes: " + outcomeBreakdown.visible.map(e => e.label + ": " + e.count).join(", ") + ". High risk cases: " + highRisk.length + ". Slow investigations (>28 days): " + slowInvestigations.length + ". Repeat employees: " + repeatEmployees.length + ". Case duration: " + (durationStats.value ? durationStats.value + " days (" + durationStats.stat + ")" : "unknown") + ". " + deltaText + themeText + "If the theme or delta data points to a genuine pattern worth flagging, introduce it with wording like \"Compass has identified a correlation between…\" — never state or imply that a pattern was *caused* by a named manager, team, or individual; only describe what the aggregate, anonymised data shows. Write 3-4 paragraphs. No markdown.";
              setReportNarrative("Generating...");
              try {
                const r = await authedFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }) });
                const d = await r.json();
                setReportNarrative(d.content?.[0]?.text || "Unable to generate.");
              } catch { setReportNarrative("Error generating summary."); }
            }} style={{ fontSize: 13, background: COLOR.purple, border: "none", borderRadius: RADIUS.surface, padding: "10px 20px", color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: FONT.sans, marginBottom: 14 }}>
              Generate AI summary
            </button>
            {reportNarrative && (
              <div style={{ fontSize: 13, color: COLOR.ink, lineHeight: 1.8, maxWidth: "min(720px, 100%)" }}>
                {reportNarrative === "Generating..." ? <span style={{ color: COLOR.inkFaint, fontStyle: "italic" }}>Generating AI summary…</span> : reportNarrative}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
