import 'fake-indexeddb/auto';
import { beforeEach, afterEach, it, expect } from 'vitest';
import { AppDB, initialize, localContext as ctx } from '../src/data/db';
import { addExamples, saveTask } from '../src/data/repository';
import { actOnWork, changeQueue } from '../src/data/workRepository';
import { elapsedSeconds, remainingMinutes, transition } from '../src/domain/work';
let db: AppDB;
let ids: string[];
beforeEach(async () => {
  db = new AppDB(crypto.randomUUID());
  await initialize(db, ctx);
  await addExamples(db, ctx);
  ids = (await db.tasks.toArray()).map((t) => t.id);
});
afterEach(async () => {
  await db.delete();
});
it('persists a deduplicated ordered queue and budget after reopening', async () => {
  await changeQueue(db, ctx, (q) => ({ ...q, items: [ids[1], ids[0], ids[1]], budgetMinutes: 45 }));
  const scope = db.name.replace('hverdagsro-', '');
  db.close();
  db = new AppDB(scope);
  expect((await db.queues.get(ctx.userId))?.items).toEqual([ids[1], ids[0]]);
  expect((await db.queues.get(ctx.userId))?.budgetMinutes).toBe(45);
});
it('counts timestamp intervals across restart, pauses and resumes, then corrects time', async () => {
  const at = Date.now();
  await actOnWork(db, ctx, ids[0], 'start', undefined, at);
  const scope = db.name.replace('hverdagsro-', '');
  db.close();
  db = new AppDB(scope);
  expect(elapsedSeconds((await db.works.get(ids[0]))!, at + 180000)).toBe(180);
  await actOnWork(db, ctx, ids[0], 'pause', undefined, at + 180000);
  await actOnWork(db, ctx, ids[0], 'correct', 1, at + 200000);
  await actOnWork(db, ctx, ids[0], 'start', undefined, at + 300000);
  await actOnWork(db, ctx, ids[0], 'complete', undefined, at + 360000);
  expect(elapsedSeconds((await db.works.get(ids[0]))!)).toBe(120);
  expect(await db.workEvents.count()).toBe(5);
  await actOnWork(db, ctx, ids[0], 'correct', 45, at + 400000);
  expect(elapsedSeconds((await db.works.get(ids[0]))!)).toBe(2700);
});
it('does not start the next task and removes completed work from all queues', async () => {
  const other = { ...ctx, userId: crypto.randomUUID() };
  for (const c of [ctx, other]) await changeQueue(db, c, (q) => ({ ...q, items: ids.slice(0, 2) }));
  await actOnWork(db, ctx, ids[0], 'complete');
  for (const q of await db.queues.toArray()) expect(q.items).toEqual([ids[1]]);
  expect(await db.works.get(ids[1])).toBeUndefined();
  await expect(actOnWork(db, other, ids[0], 'complete')).rejects.toThrow('afsluttet');
});
it('serializes competing starts and rolls back failures', async () => {
  const result = await Promise.allSettled(
    ids.slice(0, 2).map((id) => actOnWork(db, ctx, id, 'start')),
  );
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await db.workEvents.count()).toBe(1);
  const w = (await db.works.toArray())[0];
  await expect(
    actOnWork(db, { ...ctx, userId: crypto.randomUUID() }, w.id, 'pause'),
  ).rejects.toThrow('anden bruger');
  await expect(
    saveTask(db, ctx, { ...(await db.tasks.get(w.id))!, archived: true }),
  ).rejects.toThrow('pause');
});
it('keeps skipped work available and stores a decreasing explicit remaining estimate', async () => {
  const at = Date.now();
  await changeQueue(db, ctx, (q) => ({ ...q, items: [ids[0]] }));
  await actOnWork(db, ctx, ids[0], 'remaining', 10, at);
  await actOnWork(db, ctx, ids[0], 'start', undefined, at);
  const t = (await db.tasks.get(ids[0]))!;
  expect(remainingMinutes(t, (await db.works.get(ids[0]))!, at + 120000)).toBe(8);
  await actOnWork(db, ctx, ids[0], 'skip', undefined, at + 120000);
  const w = (await db.works.get(ids[0]))!;
  expect(w.status).toBe('paused');
  expect(w.remainingMinutes).toBe(8);
  expect((await db.queues.get(ctx.userId))?.items).toEqual([]);
  expect(() => transition(w, 'start', ctx.userId, at)).toThrow('baglæns');
});
it('queues action metadata atomically without mixing task and work identities', async () => {
  const c = { ...ctx, local: false };
  await actOnWork(db, c, ids[0], 'start');
  const command = (await db.outbox.toArray())[0];
  expect(command.entity).toBe('work');
  expect(command.action).toBe('start');
  expect(command.at).toBeTypeOf('number');
  await expect(actOnWork(db, c, ids[0], 'remaining', 4)).rejects.toThrow('pause');
  expect(await db.outbox.count()).toBe(1);
});
it('blocks a dependent task until its predecessor is completed', async () => {
  const successor = (await db.tasks.get(ids[1]))!;
  await saveTask(db, ctx, { ...successor, dependencyIds: [ids[0]] });
  await expect(actOnWork(db, ctx, ids[1], 'start')).rejects.toThrow('Afslut først');
  await expect(actOnWork(db, ctx, ids[1], 'complete')).rejects.toThrow('Afslut først');
  await actOnWork(db, ctx, ids[0], 'complete');
  await expect(actOnWork(db, ctx, ids[1], 'start')).resolves.toBeUndefined();
});

it('upgrades a version 1 database without losing tasks or preferences', async () => {
  const { default: Dexie } = await import('dexie');
  const scope = crypto.randomUUID();
  const old = new Dexie(`hverdagsro-${scope}`);
  old.version(1).stores({
    tasks: 'id,householdId,archived',
    locations: 'id',
    categories: 'id',
    outbox: 'id,entityId,createdAt',
    conflicts: 'id',
    preferences: 'key',
  });
  const task = (await db.tasks.get(ids[0]))!;
  await old.table('tasks').put(task);
  await old.table('preferences').put({ key: 'location', value: 'saved-choice' });
  old.close();
  const upgraded = new AppDB(scope);
  try {
    expect(await upgraded.tasks.get(task.id)).toEqual(task);
    expect((await upgraded.preferences.get('location'))?.value).toBe('saved-choice');
    expect(await upgraded.works.count()).toBe(0);
  } finally {
    await upgraded.delete();
  }
});

it('keeps one overdue occurrence, advances completion intervals, and preserves editable history', async () => {
  const { allMonths, householdDate, addDays } = await import('../src/domain/recurrence');
  const at = Date.now(),
    date = householdDate(at);
  const t = (await db.tasks.get(ids[0]))!;
  await saveTask(db, ctx, {
    ...t,
    recurrence: {
      kind: 'interval',
      mode: 'completion',
      unit: 'day',
      every: 7,
      anchor: addDays(date, -21),
      months: allMonths,
    },
  });
  const old = (await db.works.get(t.id))!;
  expect(old.plannedStart).toBe(addDays(date, -21));
  await changeQueue(db, ctx, (q) => ({ ...q, items: [t.id] }));
  await actOnWork(db, ctx, t.id, 'complete', undefined, at);
  const next = (await db.works.get(t.id))!;
  expect(next.status).toBe('open');
  expect(next.plannedStart).toBe(addDays(date, 7));
  expect(next.occurrenceId).not.toBe(old.occurrenceId);
  expect(await db.history.count()).toBe(1);
  expect((await db.queues.get(ctx.userId))?.items).toEqual([]);
  await actOnWork(db, ctx, t.id, 'correct', 45, at, old.occurrenceId);
  expect(elapsedSeconds((await db.history.get(old.occurrenceId!))!)).toBe(2700);
  expect(elapsedSeconds((await db.works.get(t.id))!)).toBe(0);
  await expect(actOnWork(db, ctx, t.id, 'start', undefined, at)).rejects.toThrow('ikke aktuel');
});
it('skips a season explicitly and preserves the rule and title of previous execution', async () => {
  const t = (await db.tasks.get(ids[0]))!;
  await saveTask(db, ctx, {
    ...t,
    recurrence: {
      kind: 'season',
      anchor: '2026-06-01',
      periods: [
        { start: '06-01', end: '06-30' },
        { start: '09-01', end: '09-30' },
      ],
    },
  });
  await actOnWork(db, ctx, t.id, 'skipOccurrence', undefined, Date.parse('2026-09-15T12:00:00Z'));
  const history = (await db.history.toArray())[0];
  expect(history.status).toBe('skipped');
  expect((await db.works.get(t.id))?.plannedStart).toBe('2026-09-01');
  await saveTask(db, ctx, { ...(await db.tasks.get(t.id))!, title: 'Ny titel', recurrence: null });
  expect((await db.history.get(history.id))?.taskSnapshot?.title).toBe(t.title);
  expect((await db.history.get(history.id))?.ruleSnapshot?.kind).toBe('season');
});

it('upgrades phase-4 history and pins queues to their original occurrence', async () => {
  const { default: Dexie } = await import('dexie');
  const { freshWork } = await import('../src/domain/work');
  const scope = crypto.randomUUID();
  const old = new Dexie(`hverdagsro-${scope}`);
  old
    .version(1)
    .stores({
      tasks: 'id,householdId,archived',
      locations: 'id',
      categories: 'id',
      outbox: 'id,entityId,createdAt',
      conflicts: 'id',
      preferences: 'key',
    });
  old
    .version(2)
    .stores({ works: 'id,taskId,status', queues: 'id,ownerId', workEvents: 'id,workId,at' });
  const t = (await db.tasks.get(ids[0]))!;
  await old.table('tasks').put(t);
  await old.table('works').put({ ...freshWork(t), status: 'completed' });
  await old.table('queues').put({ id: ctx.userId, items: [t.id] });
  old.close();
  const upgraded = new AppDB(scope);
  try {
    expect((await upgraded.history.get(t.id))?.taskSnapshot?.title).toBe(t.title);
    expect((await upgraded.queues.get(ctx.userId))?.occurrenceIds?.[t.id]).toBe(t.id);
  } finally {
    await upgraded.delete();
  }
});
