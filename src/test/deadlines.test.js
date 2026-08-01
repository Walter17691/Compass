import { describe, it, expect } from 'vitest';
import { computeDueSoon } from '../lib/deadlines.js';

describe('computeDueSoon', () => {
  it('reports the actual number of days overdue, not always zero', () => {
    const dsarRequests = [{ id: '1', employeeName: 'Jane Doe', dueDate: '2025-01-01' }];
    const today = new Date('2025-01-31');
    const [d] = computeDueSoon([], dsarRequests, today);
    expect(d.overdue).toBe(true);
    expect(d.daysOverdue).toBe(30);
  });

  it('leaves daysOverdue at zero for items that are not yet due', () => {
    const dsarRequests = [{ id: '1', employeeName: 'Jane Doe', dueDate: '2025-02-10' }];
    const today = new Date('2025-01-31');
    const [d] = computeDueSoon([], dsarRequests, today);
    expect(d.overdue).toBe(false);
    expect(d.daysOverdue).toBe(0);
    expect(d.daysLeft).toBe(10);
  });

  it('sorts the most overdue item first among overdue items', () => {
    const dsarRequests = [
      { id: '1', employeeName: 'Barely overdue', dueDate: '2025-01-29' },
      { id: '2', employeeName: 'Very overdue', dueDate: '2025-01-01' },
    ];
    const today = new Date('2025-01-31');
    const [first, second] = computeDueSoon([], dsarRequests, today);
    expect(first.employeeName).toBe('Very overdue');
    expect(second.employeeName).toBe('Barely overdue');
  });
});
