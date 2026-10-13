import { householdDate, nextPeriod } from '../domain/recurrence';
import type { Context } from '../domain/model';
import {
  freshWork,
  transition,
  remainingMinutes,
  type QueueState,
  type WorkAction,
} from '../domain/work';
import { AppDB } from './db';
import { enqueue } from './repository';
export const defaultQueue = (ctx: Context): QueueState => ({
  id: ctx.userId,
  householdId: ctx.householdId,
  ownerId: ctx.userId,
  name: 'Min kø',
  items: [],
  budgetMinutes: 120,
  version: 0,
  updatedAt: new Date().toISOString(),
});
export async function changeQueue(
  db: AppDB,
  ctx: Context,
  change: (queue: QueueState) => QueueState,
) {
  await db.transaction('rw', [db.queues, db.tasks, db.works, db.outbox, db.conflicts], async () => {
    if (
      (await db.conflicts.toArray()).some(
        (c) => c.command.entity === 'queue' && c.command.entityId === ctx.userId,
      )
    )
      throw new Error('Løs køens konflikt før du ændrer rækkefølgen.');
    const current = (await db.queues.get(ctx.userId)) ?? defaultQueue(ctx);
    const queue = change(structuredClone(current));
    if (
      queue.id !== ctx.userId ||
      queue.ownerId !== ctx.userId ||
      queue.householdId !== ctx.householdId
    )
      throw new Error('Køen tilhører en anden bruger.');
    if (
      !Number.isInteger(queue.budgetMinutes) ||
      queue.budgetMinutes < 1 ||
      queue.budgetMinutes > 10080
    )
      throw new Error('Vælg en tidsramme mellem 1 og 10.080 minutter.');
    queue.items = [...new Set(queue.items)];
    const valid: string[] = [];
    const occurrenceIds: Record<string, string> = {};
    for (const id of queue.items) {
      const work = await db.works.get(id);
      const task = await db.tasks.get(work?.taskId ?? id);
      if (!task || task.householdId !== ctx.householdId)
        throw new Error('Opgaven findes ikke i denne husstand.');
      if (['completed', 'skipped'].includes(work?.status ?? '')) continue;
      if (task.archived && !current.items.includes(id))
        throw new Error('Gendan opgaven før den tilføjes til køen.');
      const expected = current.items.includes(id) ? current.occurrenceIds?.[id] : undefined;
      const actual = work?.occurrenceId ?? id;
      if (expected && expected !== actual) continue;
      occurrenceIds[id] = actual;
      valid.push(id);
    }
    queue.items = valid;
    queue.occurrenceIds = occurrenceIds;
    queue.updatedAt = new Date().toISOString();
    await db.queues.put(queue);
    if (!ctx.local) await enqueue(db, 'queue', queue);
  });
}
export async function actOnWork(
  db: AppDB,
  ctx: Context,
  taskId: string,
  action: WorkAction,
  value?: number,
  at = Date.now(),
  occurrenceId?: string,
) {
  await db.transaction(
    'rw',
    [db.tasks, db.works, db.history, db.queues, db.workEvents, db.outbox, db.conflicts],
    async () => {
      const task = await db.tasks.get(taskId);
      if (!task || task.householdId !== ctx.householdId) throw new Error('Opgaven findes ikke.');
      if ((await db.conflicts.toArray()).some((c) => c.command.entityId === taskId))
        throw new Error('Løs opgavens konflikt før du fortsætter.');
      const current = (await db.works.get(taskId)) ?? freshWork(task);
      const historical =
        occurrenceId !== undefined && occurrenceId !== (current.occurrenceId ?? current.id);
      if (historical && action !== 'correct')
        throw new Error('Kun tidsrettelse er tilladt på historiske forekomster.');
      const work = historical ? await db.history.get(occurrenceId!) : current;
      if (!work) throw new Error('Forekomsten findes ikke.');
      if (
        (await db.conflicts.toArray()).some(
          (c) => c.command.entity === 'history' && c.command.entityId === work.id,
        )
      )
        throw new Error('Løs historikkens konflikt før tiden rettes.');
      if (action === 'skipOccurrence' && !task.recurrence)
        throw new Error('Kun gentagelser kan springes over som forekomst.');
      if (action === 'start') {
        if (task.archived) throw new Error('Gendan opgaven før den startes.');
        const date = householdDate(at);
        if ((work.plannedStart ?? task.startDate) > date)
          throw new Error('Opgaven er endnu ikke aktuel.');
        if (
          (await db.works.toArray()).some((w) => w.status === 'running' && w.actorId === ctx.userId)
        )
          throw new Error('Sæt din aktive opgave på pause først.');
        if (remainingMinutes(task, work, at) <= 0)
          throw new Error('Angiv et nyt restestimat i køen før du fortsætter.');
      }
      if (action === 'start' || action === 'complete') {
        const waiting = [];
        for (const dependencyId of task.dependencyIds ?? []) {
          const dependency = await db.tasks.get(dependencyId);
          const dependencyWork = await db.works.get(dependencyId);
          if (dependencyWork?.status !== 'completed') waiting.push(dependency?.title ?? 'en anden opgave');
        }
        if (waiting.length) throw new Error(`Afslut først: ${waiting.join(', ')}.`);
      }
      const next = transition(work, action, ctx.userId, at, value);
      let currentNext = next;
      let nextOccurrenceId: string | undefined;
      if (action === 'complete' || action === 'skipOccurrence') {
        next.taskSnapshot = structuredClone(task);
        if (task.recurrence) {
          const result = nextPeriod(
            task.recurrence,
            {
              startDate: work.plannedStart || task.startDate || householdDate(at),
              deadline: work.plannedDeadline || task.deadline,
            },
            householdDate(at),
          );
          next.missedPeriods = result.missed;
          nextOccurrenceId = crypto.randomUUID();
          currentNext = {
            ...freshWork(task),
            version: work.version,
            occurrenceId: nextOccurrenceId,
            plannedStart: result.period.startDate,
            plannedDeadline: result.period.deadline,
            updatedAt: new Date(at).toISOString(),
          };
        }
        await db.history.put({ ...next, id: next.occurrenceId ?? next.id });
      }
      if (historical) await db.history.put(next);
      else {
        await db.works.put(currentNext);
        if (action === 'correct' && ['completed', 'skipped'].includes(next.status))
          await db.history.put({ ...next, id: next.occurrenceId ?? next.id });
      }
      await db.workEvents.add({
        id: crypto.randomUUID(),
        workId: work.id,
        actorId: ctx.userId,
        action,
        at,
        before: work,
        after: next,
      });
      if (action === 'complete' || action === 'skipOccurrence' || action === 'skip') {
        for (const q of await db.queues.toArray()) {
          if (action === 'skip' && q.ownerId !== ctx.userId) continue;
          await db.queues.put({ ...q, items: q.items.filter((id) => id !== work.id) });
        }
      }
      if (!ctx.local)
        await enqueue(db, historical ? 'history' : 'work', historical ? next : currentNext, {
          action,
          at,
          value,
          occurrenceId: work.occurrenceId ?? work.id,
          nextOccurrenceId,
          completion: action === 'complete' || action === 'skipOccurrence' ? next : undefined,
        });
    },
  );
}
