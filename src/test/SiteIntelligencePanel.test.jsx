import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteIntelligencePanel } from '../components/SiteIntelligencePanel.jsx';

const overview = {
  cases_by_location: { Manchester: 5, London: 2, 'Not specified': 3 },
  cases_by_location_type: {
    Manchester: { misconduct: 3, grievance: 2 },
    London: { misconduct: 2 },
    'Not specified': { capability: 3 },
  },
  avg_duration_by_location: {
    Manchester: { avg_days: 14.5, count: 4 },
    London: { avg_days: 9, count: 1 },
  },
  avg_case_duration_days: 12,
};

// Organisational ER Intelligence (Phase 6, OP4, §5)
describe('SiteIntelligencePanel', () => {
  it('lists sites sorted by case volume, most first', () => {
    render(<SiteIntelligencePanel overview={overview}/>);
    const names = screen.getAllByText(/Manchester|London|Not specified/).map(el => el.textContent);
    expect(names[0]).toBe('Manchester');
  });

  it('shows a duration and the company average when the site has enough measured cases', () => {
    render(<SiteIntelligencePanel overview={overview}/>);
    expect(screen.getByText(/14\.5d/)).toBeInTheDocument();
    expect(screen.getByText(/company average 12d/)).toBeInTheDocument();
  });

  it('shows a data-quality caveat instead of a duration when a site has too few measured cases', () => {
    render(<SiteIntelligencePanel overview={overview}/>);
    expect(screen.getByText(/Only 1 closed cases with measurable duration available/)).toBeInTheDocument();
  });

  it('shows a data-quality caveat for a site with no duration data at all', () => {
    render(<SiteIntelligencePanel overview={overview}/>);
    expect(screen.getByText(/No closed cases with measurable duration available/)).toBeInTheDocument();
  });

  it('shows an empty state when there is no site data', () => {
    render(<SiteIntelligencePanel overview={{ cases_by_location: {} }}/>);
    expect(screen.getByText('No site data available yet.')).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (closes Prompt 16 audit finding H18, HIGH) — a
// per-site case-type bar reading "1" or "2" is a direct re-identification
// risk at a small site; individual type bars below the sample floor must
// be held back, not fabricated away or left showing raw small counts.
describe('SiteIntelligencePanel — case-type sample floor (Prompt 16 audit, H18)', () => {
  it('shows a case-type bar with 3+ cases (Manchester: misconduct)', () => {
    render(<SiteIntelligencePanel overview={overview}/>);
    expect(screen.getByText('misconduct')).toBeInTheDocument();
  });

  it('hides a case-type bar under the sample floor (Manchester: grievance, count 2)', () => {
    render(<SiteIntelligencePanel overview={overview}/>);
    expect(screen.queryByText('grievance')).not.toBeInTheDocument();
  });

  it('notes a suppressed count when at least one type bar is shown but another is held back', () => {
    render(<SiteIntelligencePanel overview={overview}/>);
    expect(screen.getByText(/1 type with under 3 cases not shown/)).toBeInTheDocument();
  });

  it('shows a data-quality caveat instead of the type breakdown when every type at a site is below the floor (London: misconduct, count 2)', () => {
    render(<SiteIntelligencePanel overview={overview}/>);
    expect(screen.getByText(/Only 2 cases at this site available/)).toBeInTheDocument();
  });
});
