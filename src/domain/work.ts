import type { Recurrence, Period } from './recurrence';
import type { Task } from './model';
export type WorkAction =
  'start' | 'pause' | 'complete' | 'skip' | 'correct' | 'remaining' | 'skipOccurrence';
export type Interval = { id: string; userId: string; startedAt: number; stoppedAt: number | null };
export type WorkState = {
  occurrenceId?: string;
  plannedStart?: string;
  plannedDeadline?: string;
  ruleSnapshot?: Recurrence | null;
  taskSnapshot?: Task;
  missedPeriods?: Period[];
  id: string;
  taskId: string;
  householdId: string;
  name: string;
  status: 'open' | 'running' | 'paused' | 'completed' | 'skipped';
  actorId: string | null;
  intervals: Interval[];
  adjustmentSeconds: number;
  remainingMinutes: number | null;
  completedAt: number | null;
  completedBy: string | null;
  version: number;
  updatedAt: string;
};
export type QueueState = {
  occurrenceIds?: Record<string, string>;
  id: string;
  householdId: string;
  ownerId: string;
  name: string;
  items: string[];
  budgetMinutes: number;
  version: number;
  updatedAt: string;
};
export type WorkEvent = {
  id: string;
  workId: string;
  actorId: string;
  action: WorkAction;
  at: number;
  before: WorkState;
  after: WorkState;
};
export function freshWork(task: Task): WorkState {
  return {
    occurrenceId: task.id,
    plannedStart: task.startDate,
    plannedDeadline: task.deadline,
    ruleSnapshot: task.recurrence ?? null,
    id: task.id,
    taskId: task.id,
    householdId: task.householdId,
    name: task.title,
    status: 'open',
    actorId: null,
    intervals: [],
    adjustmentSeconds: 0,
    remainingMinutes: null,
    completedAt: null,
    completedBy: null,
    version: 0,
    updatedAt: task.updatedAt,
  };
}
export function rawSeconds(work: WorkState, at = Date.now()) {
  return work.intervals.reduce(
    (sum, i) => sum + Math.max(0, ((i.stoppedAt ?? at) - i.startedAt) / 1000),
    0,
  );
}
export function elapsedSeconds(work: WorkState, at = Date.now()) {
  return Math.max(0, rawSeconds(work, at) + work.adjustmentSeconds);
}
export function remainingMinutes(task: Task, work?: WorkState, at = Date.now()) {
  if (work?.remainingMinutes != null) {
    const active = work.intervals.find((i) => i.stoppedAt === null);
    return Math.max(
      0,
      work.remainingMinutes - (active ? Math.max(0, at - active.startedAt) / 60000 : 0),
    );
  }
  return Math.max(0, task.estimate - (work ? elapsedSeconds(work, at) / 60 : 0));
}
export function timerLabel(seconds: number) {
  const n = Math.floor(Math.max(0, seconds));
  return `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
export function transition(
  work: WorkState,
  action: WorkAction,
  userId: string,
  at: number,
  value?: number,
): WorkState {
  if (!Number.isFinite(at) || at < 0) throw new Error('Ugyldigt tidspunkt.');
  const next = structuredClone(work);
  next.updatedAt = new Date(at).toISOString();
  const terminal = ['completed', 'skipped'].includes(work.status);
  if (action === 'correct') {
    if (work.status === 'running') throw new Error('Sæt timeren på pause før tidskorrektion.');
    if (value === undefined || !Number.isFinite(value) || value < 0 || value > 525600)
      throw new Error('Tiden skal være mellem 0 og 525.600 minutter.');
    next.adjustmentSeconds = value * 60 - rawSeconds(work, at);
    return next;
  }
  if (terminal) throw new Error('Opgaven er allerede afsluttet.');
  if (action === 'remaining') {
    if (work.status === 'running') throw new Error('Sæt timeren på pause før resttiden ændres.');
    if (value === undefined || !Number.isFinite(value) || value < 1 || value > 10080)
      throw new Error('Resttid skal være mellem 1 og 10.080 minutter.');
    next.remainingMinutes = value;
    return next;
  }
  if (work.status === 'running' && work.actorId !== userId)
    throw new Error('En anden bruger arbejder på opgaven.');
  const close = () => {
    const last = next.intervals.at(-1);
    if (last && last.stoppedAt === null) {
      if (at < last.startedAt)
        throw new Error('Enhedens ur er gået baglæns. Ret tidspunktet før du fortsætter.');
      last.stoppedAt = at;
    }
  };
  if (action === 'start') {
    if (work.status === 'running') throw new Error('Timeren kører allerede.');
    const last = work.intervals.at(-1);
    if (last && at < (last.stoppedAt ?? last.startedAt))
      throw new Error('Enhedens ur er gået baglæns.');
    next.status = 'running';
    next.actorId = userId;
    next.intervals.push({ id: crypto.randomUUID(), userId, startedAt: at, stoppedAt: null });
  } else if (action === 'pause') {
    if (work.status !== 'running') throw new Error('Timeren kører ikke.');
    close();
    next.status = 'paused';
  } else if (action === 'complete' || action === 'skipOccurrence') {
    close();
    next.status = action === 'skipOccurrence' ? 'skipped' : 'completed';
    next.actorId = userId;
    next.completedAt = at;
    next.completedBy = userId;
  } else if (action === 'skip') {
    close();
    if (work.status === 'running') next.status = 'paused';
  }
  // A manual remaining estimate decreases only by the interval just worked.
  if (work.status === 'running' && next.remainingMinutes !== null) {
    const last = work.intervals.at(-1)!;
    next.remainingMinutes = Math.max(0, next.remainingMinutes - (at - last.startedAt) / 60000);
  }
  return next;
}
