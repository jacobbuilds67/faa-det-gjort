import { describe, expect, it } from 'vitest';
import { remindersFor, statisticsFor } from '../src/domain/insights';
import type { Task } from '../src/domain/model';
import type { WorkState } from '../src/domain/work';
import { localContext as ctx } from '../src/data/db';

const task = (overrides: Partial<Task> = {}): Task => ({ id: crypto.randomUUID(), householdId: ctx.householdId, title: 'Vask bilen', description: '', estimate: 45, priority: 'medium', locationIds: ['00000000-0000-4000-8000-000000000010'], categoryId: '00000000-0000-4000-8000-000000000011', projectId: null, dependencyIds: [], startDate: '', deadline: '', assigneeId: null, archived: false, createdBy: ctx.userId, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', version: 0, ...overrides });
const work = (source: Task, overrides: Partial<WorkState> = {}): WorkState => ({ id: source.id, occurrenceId: source.id, taskId: source.id, householdId: ctx.householdId, name: source.title, status: 'completed', actorId: ctx.userId, intervals: [{ id: crypto.randomUUID(), userId: ctx.userId, startedAt: Date.parse('2026-10-10T10:00:00Z'), stoppedAt: Date.parse('2026-10-10T10:30:00Z') }], adjustmentSeconds: 0, remainingMinutes: null, completedAt: Date.parse('2026-10-10T10:30:00Z'), completedBy: ctx.userId, version: 1, updatedAt: '2026-10-10T10:30:00.000Z', taskSnapshot: source, ...overrides });
const location = { id: '00000000-0000-4000-8000-000000000010', householdId: ctx.householdId, name: 'Hjemme', independent: false, version: 0, updatedAt: '2026-10-01T00:00:00.000Z' };
const category = { ...location, id: '00000000-0000-4000-8000-000000000011', name: 'Bil' };

describe('reminders and statistics', () => {
  it('prioritizes overdue, near deadlines and current recurrences without dropping tasks', () => {
    const overdue = task({ title: 'Forsinket', deadline: '2026-10-12' });
    const near = task({ title: 'Snart', deadline: '2026-10-15' });
    const recurring = task({ title: 'Gentagelse', recurrence: { kind: 'interval', mode: 'calendar', unit: 'week', every: 1, anchor: '2026-10-13', months: [1,2,3,4,5,6,7,8,9,10,11,12] } });
    const reminders = remindersFor([near, recurring, overdue], [work(recurring, { status: 'open', completedAt: null, completedBy: null, plannedStart: '2026-10-13', intervals: [] })], ['current', 'deadline', 'overdue'], '2026-10-13');
    expect(reminders.map((value) => value.kind)).toEqual(['overdue', 'deadline', 'current']);
  });

  it('calculates period, user and location filtered totals from immutable snapshots', () => {
    const source = task();
    const stats = statisticsFor([source], [], [work(source)], [location], [category], { from: '2026-10-01', to: '2026-10-31', userId: ctx.userId, locationId: location.id }, '2026-10-13');
    expect(stats.completed).toBe(1);
    expect(stats.minutes).toBe(30);
    expect(stats.byLocation[0]).toMatchObject({ label: 'Hjemme', minutes: 30 });
    expect(stats.byCategory[0]).toMatchObject({ label: 'Bil', minutes: 30 });
    expect(stats.byMonth[0].count).toBe(1);
  });

  it('excludes skipped occurrences from worked-time totals', () => {
    const source = task();
    const stats = statisticsFor([source], [], [work(source, { status: 'skipped' })], [location], [category], { from: '2026-10-01', to: '2026-10-31', userId: 'all', locationId: 'all' });
    expect(stats.completed).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(stats.minutes).toBe(0);
  });
});
