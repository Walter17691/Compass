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
