import { describe, expect, it } from 'vitest';
import { parseQuickTask } from '../src/domain/quickAdd';
import { localContext as ctx } from '../src/data/db';

const named = (id: string, name: string) => ({ id, householdId: ctx.householdId, name, independent: false, version: 0, updatedAt: '2026-10-13T10:00:00.000Z' });
const home = named('00000000-0000-4000-8000-000000000010', 'Hjemme');
const summer = named('00000000-0000-4000-8000-000000000011', 'Sommerhus');
const car = named('00000000-0000-4000-8000-000000000012', 'Bil');

describe('quick task parser', () => {
  it('extracts title, location, duration, category and weekly recurrence', () => {
    const result = parseQuickTask('Vask bilen hjemme, 45 minutter, bil, hver uge.', ctx, [home, summer], [car], Date.parse('2026-10-13T10:00:00Z'));
    expect(result.task.title).toBe('Vask bilen');
    expect(result.task.estimate).toBe(45);
    expect(result.task.locationIds).toEqual([home.id]);
    expect(result.task.categoryId).toBe(car.id);
    expect(result.task.recurrence).toMatchObject({ kind: 'interval', unit: 'week', every: 1, anchor: '2026-10-13' });
    expect(result.warnings).toEqual([]);
  });

  it('keeps safe defaults and explains uncertain fields', () => {
    const result = parseQuickTask('Ordne papirerne', ctx, [home], [], Date.parse('2026-10-13T10:00:00Z'));
    expect(result.task.title).toBe('Ordne papirerne');
    expect(result.task.estimate).toBe(30);
    expect(result.task.locationIds).toEqual([home.id]);
    expect(result.warnings).toHaveLength(2);
  });

  it('understands hours and explicit priority', () => {
    const result = parseQuickTask('Klip hækken sommerhus 2 timer høj prioritet', ctx, [home, summer], []);
    expect(result.task.title).toBe('Klip hækken');
    expect(result.task.estimate).toBe(120);
    expect(result.task.priority).toBe('high');
    expect(result.task.locationIds).toEqual([summer.id]);
  });
});
