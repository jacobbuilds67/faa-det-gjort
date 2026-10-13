import type { Member, NamedEntity, Task } from './model';
import { addDays, householdDate } from './recurrence';
import { elapsedSeconds, type WorkState } from './work';

export type ReminderKind = 'current' | 'deadline' | 'overdue';
export type Reminder = { id: string; taskId: string; kind: ReminderKind; title: string; detail: string; fingerprint: string };

export function remindersFor(tasks: Task[], works: WorkState[], enabled: ReminderKind[], date = householdDate()): Reminder[] {
  const result: Reminder[] = [];
  for (const task of tasks) {
    const work = works.find((value) => value.taskId === task.id);
    if (task.archived || ['completed', 'skipped'].includes(work?.status ?? '')) continue;
    const deadline = work?.plannedDeadline ?? task.deadline;
    const start = work?.plannedStart ?? task.startDate;
    if (enabled.includes('overdue') && deadline && deadline < date) {
      result.push({ id: `${task.id}:overdue`, taskId: task.id, kind: 'overdue', title: task.title, detail: `Deadline var ${formatDate(deadline)}. Opgaven bliver stående.`, fingerprint: `${task.id}:overdue:${deadline}` });
    } else if (enabled.includes('deadline') && deadline && deadline >= date && deadline <= addDays(date, 3)) {
      result.push({ id: `${task.id}:deadline`, taskId: task.id, kind: 'deadline', title: task.title, detail: deadline === date ? 'Deadline er i dag.' : `Deadline ${formatDate(deadline)}.`, fingerprint: `${task.id}:deadline:${deadline}` });
    }
    if (enabled.includes('current') && task.recurrence && start && start <= date) {
      result.push({ id: `${task.id}:current`, taskId: task.id, kind: 'current', title: task.title, detail: 'En ny tilbagevendende forekomst er aktuel.', fingerprint: `${task.id}:current:${work?.occurrenceId ?? start}` });
    }
  }
  const order: Record<ReminderKind, number> = { overdue: 0, deadline: 1, current: 2 };
  return result.sort((a, b) => order[a.kind] - order[b.kind] || a.title.localeCompare(b.title, 'da'));
}

export type StatsFilters = { from: string; to: string; userId: string; locationId: string };
export type Breakdown = { id: string; label: string; minutes: number; count: number };
export type Statistics = {
  completed: number;
  skipped: number;
  minutes: number;
  active: number;
  overdue: number;
  byMonth: Breakdown[];
  byLocation: Breakdown[];
  byCategory: Breakdown[];
  history: Array<{ work: WorkState; task: Task }>;
};

export function statisticsFor(
  tasks: Task[],
  works: WorkState[],
  history: WorkState[],
  locations: NamedEntity[],
  categories: NamedEntity[],
  filters: StatsFilters,
  date = householdDate(),
): Statistics {
  const rows = history
    .filter((work) => {
      if (!work.completedAt) return false;
      const day = householdDate(work.completedAt);
      if (day < filters.from || day > filters.to) return false;
      if (filters.userId !== 'all' && work.completedBy !== filters.userId) return false;
      const task = work.taskSnapshot ?? tasks.find((value) => value.id === work.taskId);
      return !!task && (filters.locationId === 'all' || task.locationIds.includes(filters.locationId));
    })
    .map((work) => ({ work, task: (work.taskSnapshot ?? tasks.find((value) => value.id === work.taskId))! }))
    .sort((a, b) => (b.work.completedAt ?? 0) - (a.work.completedAt ?? 0));
  const completed = rows.filter(({ work }) => work.status === 'completed');
  const breakdown = (keys: (row: (typeof completed)[number]) => Array<{ id: string; label: string; share: number }>) => {
    const map = new Map<string, Breakdown>();
    for (const row of completed) {
      const minutes = elapsedSeconds(row.work, row.work.completedAt ?? Date.now()) / 60;
      for (const key of keys(row)) {
        const value = map.get(key.id) ?? { id: key.id, label: key.label, minutes: 0, count: 0 };
        value.minutes += minutes * key.share;
        value.count += 1;
        map.set(key.id, value);
      }
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  };
  const current = tasks.filter((task) => !task.archived && !['completed', 'skipped'].includes(works.find((work) => work.taskId === task.id)?.status ?? ''));
  return {
    completed: completed.length,
    skipped: rows.filter(({ work }) => work.status === 'skipped').length,
    minutes: completed.reduce((sum, { work }) => sum + elapsedSeconds(work, work.completedAt ?? Date.now()) / 60, 0),
    active: current.length,
    overdue: current.filter((task) => {
      const deadline = works.find((work) => work.taskId === task.id)?.plannedDeadline ?? task.deadline;
      return !!deadline && deadline < date;
    }).length,
    byMonth: breakdown(({ work }) => [{ id: householdDate(work.completedAt!).slice(0, 7), label: new Intl.DateTimeFormat('da-DK', { month: 'short', year: 'numeric' }).format(new Date(work.completedAt!)), share: 1 }]),
    byLocation: breakdown(({ task }) => {
      const ids = task.locationIds.length ? task.locationIds : ['none'];
      return ids.map((id) => ({ id, label: locations.find((value) => value.id === id)?.name ?? 'Uden lokation', share: 1 / ids.length }));
    }),
    byCategory: breakdown(({ task }) => [{ id: task.categoryId ?? 'none', label: categories.find((value) => value.id === task.categoryId)?.name ?? 'Uden kategori', share: 1 }]),
    history: rows,
  };
}

export function periodRange(kind: 'week' | 'month' | 'year', date = householdDate()) {
  const current = new Date(`${date}T12:00:00Z`);
  if (kind === 'week') {
    const mondayOffset = (current.getUTCDay() + 6) % 7;
    return { from: addDays(date, -mondayOffset), to: addDays(date, 6 - mondayOffset) };
  }
  if (kind === 'month') {
    const from = `${date.slice(0, 7)}-01`;
    const next = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
    return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
  }
  return { from: `${date.slice(0, 4)}-01-01`, to: `${date.slice(0, 4)}-12-31` };
}

export function memberName(id: string | null, members: Member[], ownId: string) {
  return members.find((member) => member.userId === id)?.name ?? (id === ownId ? 'Dig' : 'Et medlem');
}

const formatDate = (date: string) => new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00Z`));
