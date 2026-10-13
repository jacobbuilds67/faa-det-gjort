import { describe, it, expect } from 'vitest';
import {
  allMonths,
  validateRecurrence,
  firstPeriod,
  nextPeriod,
  addInterval,
  householdDate,
  type Recurrence,
} from '../src/domain/recurrence';
const weekly: Recurrence = {
  kind: 'interval',
  mode: 'calendar',
  unit: 'week',
  every: 1,
  anchor: '2026-01-05',
  months: allMonths,
};
describe('recurrence calendar rules', () => {
  it('does not replace an overdue first occurrence', () => {
    expect(firstPeriod(weekly).startDate).toBe('2026-01-05');
    expect(nextPeriod(weekly, firstPeriod(weekly), '2026-01-26').period.startDate).toBe(
      '2026-02-02',
    );
  });
  it('retains calendar weekdays when completed early', () => {
    expect(nextPeriod(weekly, firstPeriod(weekly), '2026-01-02').period.startDate).toBe(
      '2026-01-12',
    );
  });
  it('counts completion intervals from completion including skips', () => {
    expect(
      nextPeriod({ ...weekly, mode: 'completion' }, firstPeriod(weekly), '2026-01-07').period
        .startDate,
    ).toBe('2026-01-14');
  });
  it('clamps month end without shifting the anchor', () => {
    const r = { ...weekly, unit: 'month' as const, anchor: '2025-01-31' };
    const feb = nextPeriod(r, firstPeriod(r), '2025-01-31').period;
    expect(feb.startDate).toBe('2025-02-28');
    expect(nextPeriod(r, feb, '2025-02-28').period.startDate).toBe('2025-03-31');
    expect(addInterval('2024-02-29', 1, 'year')).toBe('2025-02-28');
  });
  it('selects weekdays and active months', () => {
    const r: Recurrence = {
      kind: 'weekdays',
      anchor: '2026-03-01',
      days: [1, 4],
      every: 1,
      months: [4, 5, 6, 7, 8, 9, 10],
    };
    expect(firstPeriod(r).startDate).toBe('2026-04-02');
    expect(nextPeriod(r, firstPeriod(r), '2026-04-02').period.startDate).toBe('2026-04-06');
  });
  it('opens September after late June completion and records held-back seasons', () => {
    const r: Recurrence = {
      kind: 'season',
      anchor: '2026-06-01',
      periods: [
        { start: '06-01', end: '06-30' },
        { start: '09-01', end: '09-30' },
      ],
    };
    expect(firstPeriod(r).startDate).toBe('2026-06-01');
    expect(nextPeriod(r, firstPeriod(r), '2026-09-15').period.startDate).toBe('2026-09-01');
    const late = nextPeriod(r, firstPeriod(r), '2027-07-01');
    expect(late.period.startDate).toBe('2027-09-01');
    expect(late.missed.map((p) => p.startDate)).toEqual(['2026-09-01', '2027-06-01']);
  });
  it('supports seasons crossing New Year and rejects overlaps', () => {
    const r: Recurrence = {
      kind: 'season',
      anchor: '2026-01-01',
      periods: [{ start: '11-01', end: '02-28' }],
    };
    expect(firstPeriod(r)).toEqual({ startDate: '2025-11-01', deadline: '2026-02-28' });
    expect(() =>
      validateRecurrence({ ...r, periods: [...r.periods, { start: '01-01', end: '03-01' }] }),
    ).toThrow('overlappe');
  });
  it('rejects empty selections and uses Copenhagen date across UTC midnight', () => {
    expect(() => validateRecurrence({ ...weekly, months: [] })).toThrow();
    expect(householdDate(Date.parse('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
  });
});
