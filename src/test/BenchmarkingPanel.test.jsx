import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BenchmarkingPanel } from '../components/BenchmarkingPanel.jsx';

const overview = {
  avg_duration_by_department: {
    'Customer Service': { avg_days: 8, count: 5 },
    'Warehouse': { avg_days: 17, count: 1 },
  },
  avg_case_duration_days: 11,
  cases_by_type: { misconduct: 4 },
};

let nextId = 0;
function closedCase(outcome) {
  return { id: 'c'+(nextId++), stage: 'closed', caseType: 'misconduct', outcome };
}

// Organisational ER Intelligence (Phase 6, OP5, §14)
describe('BenchmarkingPanel', () => {
  it('shows a department avg duration against the company average when the sample is large enough', () => {
    render(<BenchmarkingPanel overview={overview} cases={[]}/>);
    expect(screen.getByText(/8d · company avg 11d/)).toBeInTheDocument();
  });

  it('shows a data-quality caveat for a department with too few measured cases', () => {
    render(<BenchmarkingPanel overview={overview} cases={[]}/>);
    expect(screen.getByText(/Only 1 closed cases in Warehouse with measurable duration available/)).toBeInTheDocument();
  });

  it('shows the sanction distribution for a case type with enough closed, outcomed cases', () => {
    const cases = [closedCase('Final written warning'), closedCase('Final written warning'), closedCase('Dismissal')];
    render(<BenchmarkingPanel overview={overview} cases={cases}/>);
    expect(screen.getByText('misconduct')).toBeInTheDocument();
    expect(screen.getByText('Final written warning')).toBeInTheDocument();
    expect(screen.getByText(/67% \(2\)/)).toBeInTheDocument();
  });

  it('shows a data-quality caveat for a case type with too few closed, outcomed cases', () => {
    const cases = [closedCase('Dismissal')];
    render(<BenchmarkingPanel overview={overview} cases={cases}/>);
    expect(screen.getByText(/Only 1 closed misconduct cases with a recorded outcome available/)).toBeInTheDocument();
  });

  it('shows empty states when there is no data at all', () => {
    render(<BenchmarkingPanel overview={{}} cases={[]}/>);
    expect(screen.getByText('No department data available yet.')).toBeInTheDocument();
    expect(screen.getByText('No case types recorded yet.')).toBeInTheDocument();
  });
});
