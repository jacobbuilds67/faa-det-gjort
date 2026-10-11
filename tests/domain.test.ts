import { describe, it, expect } from 'vitest';
import {
  taskSchema,
  matchesLocation,
  isOverdue,
  duration,
  type Task,
  type NamedEntity,
} from '../src/domain/model';
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
const task: Task = {
  id,
  householdId: id,
  title: 'Vask bilen',
  description: '',
  estimate: 45,
  priority: 'medium',
  locationIds: [id],
  categoryId: null,
  startDate: '',
  deadline: '',
  assigneeId: null,
  archived: false,
  createdBy: id,
  createdAt: '2026-10-11T10:00:00Z',
  updatedAt: '2026-10-11T10:00:00Z',
  version: 0,
};
describe('task validation', () => {
  it.each([0, -1, 1.5, 10081, NaN])('rejects invalid estimate %s', (estimate) =>
    expect(taskSchema.safeParse({ ...task, estimate }).success).toBe(false),
  );
  it('requires a location', () =>
    expect(taskSchema.safeParse({ ...task, locationIds: [] }).success).toBe(false));
  it('requires a nonempty title', () =>
    expect(taskSchema.safeParse({ ...task, title: '   ' }).success).toBe(false));
  it('rejects reversed date bounds', () =>
    expect(
      taskSchema.safeParse({ ...task, startDate: '2026-10-12', deadline: '2026-10-11' }).success,
    ).toBe(false));
  it('rejects calendar overflow', () =>
    expect(taskSchema.safeParse({ ...task, startDate: '2026-02-30' }).success).toBe(false));
  it('accepts no deadlines', () => expect(taskSchema.safeParse(task).success).toBe(true));
});
describe('filters', () => {
  it('keeps overdue tasks visible', () =>
    expect(isOverdue({ ...task, deadline: '2026-01-01' }, '2026-10-11')).toBe(true));
  it('does not treat today as overdue', () =>
    expect(isOverdue({ ...task, deadline: '2026-10-11' }, '2026-10-11')).toBe(false));
  it('includes independent tasks for any location', () =>
    expect(matchesLocation(task, other, [{ id, independent: true } as NamedEntity])).toBe(true));
  it('excludes mismatching locations', () => expect(matchesLocation(task, other, [])).toBe(false));
  it('includes tasks with multiple locations', () =>
    expect(matchesLocation({ ...task, locationIds: [id, other] }, other, [])).toBe(true));
  it('formats duration', () => expect(duration(90)).toBe('1 t. 30 min.'));
});
