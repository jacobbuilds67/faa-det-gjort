import { matchesLocation, type NamedEntity, type Task } from './model';

/** All weights live here. No random input, network access, mutation or implicit clock. */
export const SUGGESTION_WEIGHTS = Object.freeze({
  priority: Object.freeze({ high: 60, medium: 30, low: 10 }),
  overdueBase: 50,
  overduePerDay: 2,
  overdueCap: 80,
  dueToday: 45,
  dueWithinThreeDays: 30,
  dueWithinSevenDays: 15,
  recurringDue: 10,
  timeFit: 20,
});

export type ExecutionState = {
  status: 'open' | 'running' | 'paused' | 'completed' | 'skipped';
  spentMinutes: number;
  remainingOverride: number | null;
  dependencyIds: string[];
  recurring: boolean;
  recurrenceDue: boolean;
  heldByOtherUser: boolean;
};
export type Suggestion = {
  task: Task;
  remainingMinutes: number;
  score: number;
  reasons: string[];
  breakdown: { priority: number; deadline: number; recurrence: number; timeFit: number };
};
export type SuggestionInput = {
  tasks: readonly Task[];
  locations: NamedEntity[];
  locationId: string;
  availableMinutes: number;
  asOfDate: string;
  /** Provided by the occurrence/queue adapters as those phases are delivered. */
  execution?: Readonly<Record<string, Partial<ExecutionState>>>;
};
function calendarDay(value: string) {
  const timestamp = Date.parse(`${value}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Prioritering kræver en gyldig kalenderdato.');
  }
  return timestamp / 86400000;
}
export function suggestTasks(input: SuggestionInput): Suggestion[] {
  if (!Number.isFinite(input.availableMinutes) || input.availableMinutes <= 0) return [];
  const day = calendarDay(input.asOfDate);
  const taskIds = new Set(input.tasks.map((task) => task.id));
  const suggestions: Suggestion[] = [];
  for (const task of input.tasks) {
    const state = input.execution?.[task.id];
    const status = state?.status ?? 'open';
    if (task.archived || !['open', 'paused'].includes(status) || state?.heldByOtherUser) continue;
    if (task.startDate && calendarDay(task.startDate) > day) continue;
    if (!matchesLocation(task, input.locationId, input.locations)) continue;
    if (state?.recurring && state.recurrenceDue !== true) continue;
    // Missing predecessors fail closed. A skipped predecessor is not completed work.
    if (
      state?.dependencyIds?.some(
        (id) => !taskIds.has(id) || input.execution?.[id]?.status !== 'completed',
      )
    )
      continue;
    const remaining = state?.remainingOverride ?? task.estimate - (state?.spentMinutes ?? 0);
    // Do not pretend unfinished work with an exhausted estimate takes zero minutes.
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > input.availableMinutes)
      continue;
    const reasons: string[] = [];
    const priority = SUGGESTION_WEIGHTS.priority[task.priority];
    if (task.priority === 'high') reasons.push('Høj prioritet');
    let deadline = 0;
    if (task.deadline) {
      const daysUntil = calendarDay(task.deadline) - day;
      if (daysUntil < 0) {
        deadline = Math.min(
          SUGGESTION_WEIGHTS.overdueCap,
          SUGGESTION_WEIGHTS.overdueBase - daysUntil * SUGGESTION_WEIGHTS.overduePerDay,
        );
        reasons.push(`Deadline overskredet med ${-daysUntil} ${daysUntil === -1 ? 'dag' : 'dage'}`);
      } else if (daysUntil === 0) {
        deadline = SUGGESTION_WEIGHTS.dueToday;
        reasons.push('Deadline i dag');
      } else if (daysUntil <= 3) {
        deadline = SUGGESTION_WEIGHTS.dueWithinThreeDays;
        reasons.push(daysUntil === 1 ? 'Deadline i morgen' : `Deadline om ${daysUntil} dage`);
      } else if (daysUntil <= 7) {
        deadline = SUGGESTION_WEIGHTS.dueWithinSevenDays;
        reasons.push('Deadline inden for en uge');
      }
    }
    const recurrence = state?.recurring ? SUGGESTION_WEIGHTS.recurringDue : 0;
    if (recurrence) reasons.push('Tid til en tilbagevendende opgave');
    const timeFit = (SUGGESTION_WEIGHTS.timeFit * remaining) / input.availableMinutes;
    reasons.push(
      remaining === input.availableMinutes
        ? 'Passer præcis til din tid'
        : `Giver ${Math.round((input.availableMinutes - remaining) * 10) / 10} minutter til overs`,
    );
    suggestions.push({
      task,
      remainingMinutes: remaining,
      score: priority + deadline + recurrence + timeFit,
      reasons,
      breakdown: { priority, deadline, recurrence, timeFit },
    });
  }
  return suggestions.sort(
    (a, b) =>
      b.score - a.score ||
      compare(a.task.deadline || '9999-12-31', b.task.deadline || '9999-12-31') ||
      compare(
        a.task.startDate || a.task.createdAt.slice(0, 10),
        b.task.startDate || b.task.createdAt.slice(0, 10),
      ) ||
      compare(a.task.id, b.task.id),
  );
}
function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
