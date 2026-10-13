import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDB, initialize, localContext as ctx } from '../src/data/db';
import { addExamples, saveTask } from '../src/data/repository';
import { saveProject } from '../src/data/projectRepository';
import { actOnWork, changeQueue } from '../src/data/workRepository';
import { createBackup, importBackup, parseBackup, serializeBackup } from '../src/data/backup';

let source: AppDB;
let target: AppDB;
beforeEach(async () => {
  source = new AppDB(crypto.randomUUID());
  target = new AppDB(crypto.randomUUID());
  await initialize(source, ctx);
});
afterEach(async () => {
  await source.delete();
  await target.delete();
});

describe('backup and restore', () => {
  it('restores projects, tasks, queue, time, history and preferences exactly', async () => {
    await addExamples(source, ctx);
    const [task, queuedTask] = await source.tasks.toArray();
    const now = new Date().toISOString();
    const project = { id: crypto.randomUUID(), householdId: ctx.householdId, name: 'Male udhus', description: '', archived: false, version: 0, createdAt: now, updatedAt: now };
    await saveProject(source, ctx, project);
    await saveTask(source, ctx, { ...task, projectId: project.id });
    await changeQueue(source, ctx, (queue) => ({ ...queue, items: [task.id, queuedTask.id] }));
    await actOnWork(source, ctx, task.id, 'start', undefined, 1_000);
    await actOnWork(source, ctx, task.id, 'complete', undefined, 61_000);
    const backup = parseBackup(serializeBackup(await createBackup(source, ctx, [{ userId: ctx.userId, name: 'Dig', role: 'owner' }])), ctx);
    await importBackup(target, ctx, backup, 'replace');
    expect(await target.tasks.count()).toBe(5);
    expect((await target.tasks.get(task.id))?.projectId).toBe(project.id);
    expect(await target.projects.count()).toBe(1);
    expect((await target.works.get(task.id))?.status).toBe('completed');
    expect(await target.history.count()).toBe(1);
    expect(await target.workEvents.count()).toBe(2);
    expect((await target.queues.get(ctx.userId))?.items).toEqual([queuedTask.id]);
    expect((await target.preferences.get('initialized'))?.value).toBe('true');
  });

  it('merges only missing IDs and preserves an existing local edit', async () => {
    await addExamples(source, ctx);
    const backup = await createBackup(source, ctx, []);
    await importBackup(target, ctx, backup, 'merge');
    const task = (await target.tasks.toArray())[0];
    await target.tasks.update(task.id, { title: 'Bevar denne titel' });
    await importBackup(target, ctx, backup, 'merge');
    expect((await target.tasks.get(task.id))?.title).toBe('Bevar denne titel');
    expect(await target.tasks.count()).toBe(5);
  });

  it('rejects malformed, cross-household and incomplete backup files', async () => {
    expect(() => parseBackup('{nej', ctx)).toThrow('JSON');
    await addExamples(source, ctx);
    const backup = await createBackup(source, ctx, []);
    expect(() => parseBackup(JSON.stringify({ ...backup, household: { ...backup.household, id: crypto.randomUUID() } }), ctx)).toThrow('anden husstand');
    expect(() => parseBackup(JSON.stringify({ ...backup, household: { ...backup.household, userId: crypto.randomUUID() } }), ctx)).toThrow('anden bruger');
    const broken = structuredClone(backup);
    broken.data.locations = [];
    expect(() => parseBackup(JSON.stringify(broken), ctx)).toThrow('manglende lokation');
  });
});
