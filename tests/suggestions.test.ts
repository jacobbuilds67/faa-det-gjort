import { describe, it, expect } from 'vitest';
import { suggestTasks, SUGGESTION_WEIGHTS, type SuggestionInput } from '../src/domain/suggestions';
import type { Task, NamedEntity } from '../src/domain/model';
const home = '11111111-1111-4111-8111-111111111111',
  summer = '22222222-2222-4222-8222-222222222222',
  independent = '33333333-3333-4333-8333-333333333333';
const locations = [
  { id: home, independent: false },
  { id: summer, independent: false },
  { id: independent, independent: true },
] as NamedEntity[];
const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  householdId: home,
  title: id,
  description: '',
  estimate: 30,
  priority: 'medium',
  locationIds: [home],
  categoryId: null,
  startDate: '',
  deadline: '',
  assigneeId: null,
  archived: false,
  createdBy: home,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 0,
  ...overrides,
});
const input = (tasks: Task[], overrides: Partial<SuggestionInput> = {}): SuggestionInput => ({
  tasks,
  locations,
  locationId: home,
  availableMinutes: 30,
  asOfDate: '2026-10-11',
  ...overrides,
});
describe('deterministic suggestions', () => {
  it('filters by time, location and future start', () => {
    expect(
      suggestTasks(
        input([
          task('ok'),
          task('long', { estimate: 31 }),
          task('away', { locationIds: [summer] }),
          task('future', { startDate: '2026-10-12' }),
        ]),
      ).map((s) => s.task.id),
    ).toEqual(['ok']);
  });
  it('includes independent tasks', () =>
    expect(suggestTasks(input([task('a', { locationIds: [independent] })]))).toHaveLength(1));
  it('ranks high priority ahead without changing source objects', () => {
    const a = task('a', { priority: 'low' }),
      b = task('b', { priority: 'high' }),
      before = JSON.stringify([a, b]);
    expect(suggestTasks(input([a, b])).map((s) => s.task.id)).toEqual(['b', 'a']);
    expect(JSON.stringify([a, b])).toBe(before);
  });
  it('overdue work can outrank a high priority task with no deadline', () => {
    expect(
      suggestTasks(
        input([
          task('high', { priority: 'high' }),
          task('late', { priority: 'low', deadline: '2026-09-01' }),
        ]),
      )[0].task.id,
    ).toBe('late');
  });
  it('caps overdue urgency and applies one deadline bonus only', () => {
    expect(
      suggestTasks(input([task('late', { deadline: '2020-01-01' })]))[0].breakdown.deadline,
    ).toBe(80);
  });
  it.each([
    ['2026-10-11', 45],
    ['2026-10-12', 30],
    ['2026-10-14', 30],
    ['2026-10-15', 15],
    ['2026-10-18', 15],
    ['2026-10-19', 0],
  ] as const)('gives %s the specified bonus', (deadline, bonus) => {
    expect(suggestTasks(input([task('a', { deadline })]))[0].breakdown.deadline).toBe(bonus);
  });
  it('rejects completed, skipped, running and archived work', () => {
    expect(
      suggestTasks(
        input([task('done'), task('skip'), task('busy'), task('archive', { archived: true })], {
          execution: {
            done: { status: 'completed' },
            skip: { status: 'skipped' },
            busy: { status: 'running' },
          },
        }),
      ),
    ).toEqual([]);
  });
  it('uses the remaining duration of paused work', () => {
    const s = suggestTasks(
      input([task('a', { estimate: 60 })], {
        execution: { a: { status: 'paused', spentMinutes: 40 } },
      }),
    )[0];
    expect(s.remainingMinutes).toBe(20);
  });
  it('does not suggest unfinished work with exhausted estimates', () => {
    expect(
      suggestTasks(input([task('a')], { execution: { a: { spentMinutes: 30 } } })),
    ).toHaveLength(0);
  });
  it('uses an explicit remaining-time correction', () => {
    expect(
      suggestTasks(
        input([task('a')], { execution: { a: { spentMinutes: 50, remainingOverride: 15 } } }),
      )[0].remainingMinutes,
    ).toBe(15);
  });
  it('rejects a dependency that is incomplete, missing or skipped', () => {
    for (const status of ['open', 'skipped'] as const) {
      expect(
        suggestTasks(
          input([task('a'), task('b')], {
            execution: { a: { status }, b: { dependencyIds: ['a'] } },
          }),
        ).some((s) => s.task.id === 'b'),
      ).toBe(false);
    }
    expect(
      suggestTasks(input([task('b')], { execution: { b: { dependencyIds: ['missing'] } } })),
    ).toHaveLength(0);
  });
  it('unblocks a task once its predecessor is completed', () => {
    expect(
      suggestTasks(
        input([task('a'), task('b')], {
          execution: { a: { status: 'completed' }, b: { dependencyIds: ['a'] } },
        }),
      ).map((s) => s.task.id),
    ).toEqual(['b']);
  });
  it('excludes a task claimed by another user', () =>
    expect(
      suggestTasks(input([task('a')], { execution: { a: { heldByOtherUser: true } } })),
    ).toHaveLength(0));
  it('requires recurring work to be due', () => {
    expect(
      suggestTasks(
        input([task('a')], { execution: { a: { recurring: true, recurrenceDue: false } } }),
      ),
    ).toHaveLength(0);
    expect(
      suggestTasks(
        input([task('a')], { execution: { a: { recurring: true, recurrenceDue: true } } }),
      )[0].breakdown.recurrence,
    ).toBe(SUGGESTION_WEIGHTS.recurringDue);
  });
  it('breaks a tie by deadline, start date and ID regardless of input order', () => {
    const tasks = [task('z'), task('a')];
    expect(suggestTasks(input(tasks)).map((s) => s.task.id)).toEqual(['a', 'z']);
    expect(suggestTasks(input(tasks.reverse())).map((s) => s.task.id)).toEqual(['a', 'z']);
  });
  it('uses calendar days across daylight saving boundaries', () => {
    expect(
      suggestTasks(input([task('a', { deadline: '2026-10-25' })], { asOfDate: '2026-10-26' }))[0]
        .breakdown.deadline,
    ).toBe(52);
  });
  it('returns nothing for invalid available time', () => {
    for (const n of [0, -1, NaN, Infinity])
      expect(suggestTasks(input([task('a')], { availableMinutes: n }))).toHaveLength(0);
  });
  it('rejects invalid scoring dates explicitly', () =>
    expect(() => suggestTasks(input([], { asOfDate: '2026-02-30' }))).toThrow());
});
