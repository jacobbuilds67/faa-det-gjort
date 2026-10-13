import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { AppDB, initialize, localContext } from '../src/data/db';
import { saveTask, saveNamed, addExamples } from '../src/data/repository';
import type { Task } from '../src/domain/model';
import { saveProject } from '../src/data/projectRepository';
let db: AppDB;
beforeEach(async () => {
  db = new AppDB(crypto.randomUUID());
  await initialize(db, localContext);
});
afterEach(async () => {
  await db.delete();
});
async function task(): Promise<Task> {
  const l = (await db.locations.toArray())[0];
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    householdId: localContext.householdId,
    title: 'Prøve',
    description: '',
    estimate: 30,
    priority: 'medium',
    locationIds: [l.id],
    categoryId: null,
    startDate: '',
    deadline: '',
    assigneeId: null,
    archived: false,
    createdBy: localContext.userId,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
}
describe('offline repository', () => {
  it('initializes only once', async () => {
    await initialize(db, localContext);
    expect(await db.locations.count()).toBe(4);
    expect(await db.categories.count()).toBe(5);
  });
  it('saves locally without claiming cloud sync', async () => {
    await saveTask(db, localContext, await task());
    expect(await db.tasks.count()).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });
  it('persists across database reopening', async () => {
    const t = await task();
    await saveTask(db, localContext, t);
    const name = db.name;
    db.close();
    db = new AppDB(name.replace('hverdagsro-', ''));
    expect((await db.tasks.get(t.id))?.title).toBe('Prøve');
  });
  it('writes task and command atomically', async () => {
    await saveTask(db, { ...localContext, local: false }, await task());
    expect(await db.tasks.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
  });
  it('rejects unknown location without a partial write', async () => {
    await expect(
      saveTask(
        db,
        { ...localContext, local: false },
        { ...(await task()), locationIds: [crypto.randomUUID()] },
      ),
    ).rejects.toThrow();
    expect(await db.tasks.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
  it('rejects another household', async () => {
    await expect(
      saveTask(db, localContext, { ...(await task()), householdId: crypto.randomUUID() }),
    ).rejects.toThrow();
  });
  it('detects stale editor rather than overwriting', async () => {
    const t = await task();
    await saveTask(db, localContext, t);
    const current = (await db.tasks.get(t.id))!;
    await db.tasks.update(t.id, { updatedAt: '2099-01-01T00:00:00Z' });
    await expect(saveTask(db, localContext, { ...current, title: 'Stale' })).rejects.toThrow(
      'andet vindue',
    );
  });
  it('archives and restores without deleting', async () => {
    const t = await task();
    await saveTask(db, localContext, t);
    await saveTask(db, localContext, { ...(await db.tasks.get(t.id))!, archived: true });
    expect((await db.tasks.get(t.id))?.archived).toBe(true);
    await saveTask(db, localContext, { ...(await db.tasks.get(t.id))!, archived: false });
    expect(await db.tasks.count()).toBe(1);
    expect((await db.tasks.get(t.id))?.archived).toBe(false);
  });
  it('blocks duplicate location names ignoring case', async () => {
    const l = (await db.locations.toArray())[0];
    await expect(
      saveNamed(db, localContext, 'location', {
        ...l,
        id: crypto.randomUUID(),
        name: l.name.toUpperCase(),
      }),
    ).rejects.toThrow('allerede');
  });
  it('adds examples only when requested', async () => {
    expect(await db.tasks.count()).toBe(0);
    await addExamples(db, localContext);
    expect(await db.tasks.count()).toBe(5);
  });
  it('saves projects and links ordinary tasks as subtasks', async () => {
    const now = new Date().toISOString();
    const project = { id: crypto.randomUUID(), householdId: localContext.householdId, name: 'Nyt køkken', description: 'En rolig plan', archived: false, version: 0, createdAt: now, updatedAt: now };
    await saveProject(db, localContext, project);
    const t = await task();
    await saveTask(db, localContext, { ...t, projectId: project.id });
    expect((await db.projects.get(project.id))?.name).toBe('Nyt køkken');
    expect((await db.tasks.get(t.id))?.projectId).toBe(project.id);
  });
  it('rejects missing projects and circular dependency chains atomically', async () => {
    const a = await task(), b = { ...(await task()), title: 'Anden' };
    await saveTask(db, localContext, a);
    await saveTask(db, localContext, { ...b, dependencyIds: [a.id] });
    await expect(saveTask(db, localContext, { ...(await db.tasks.get(a.id))!, dependencyIds: [b.id] })).rejects.toThrow('cirkel');
    expect((await db.tasks.get(a.id))?.dependencyIds).toEqual([]);
    await expect(saveTask(db, localContext, { ...(await task()), projectId: crypto.randomUUID() })).rejects.toThrow('Projektet');
  });
});
