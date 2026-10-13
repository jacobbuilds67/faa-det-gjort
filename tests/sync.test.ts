import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/data/supabase', () => ({ supabase: { rpc } }));
import { AppDB, initialize, localContext } from '../src/data/db';
import { saveTask } from '../src/data/repository';
import { saveProject } from '../src/data/projectRepository';
import { synchronize, resolveConflict } from '../src/data/sync';
import type { Task } from '../src/domain/model';
let db: AppDB;
let task: Task;
beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true });
  rpc.mockReset();
  db = new AppDB(crypto.randomUUID());
  await initialize(db, localContext);
  const loc = (await db.locations.toArray())[0];
  task = {
    id: crypto.randomUUID(),
    householdId: localContext.householdId,
    title: 'Lokal titel',
    description: '',
    estimate: 30,
    priority: 'medium',
    locationIds: [loc.id],
    categoryId: null,
    startDate: '',
    deadline: '',
    assigneeId: null,
    archived: false,
    createdBy: localContext.userId,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 0,
  };
});
afterEach(async () => {
  await db.delete();
  vi.unstubAllGlobals();
});
describe('sync persistence', () => {
  it('synchronizes a project as a versioned entity', async () => {
    const now = new Date().toISOString();
    const project = { id: crypto.randomUUID(), householdId: localContext.householdId, name: 'Male udhus', description: '', archived: false, version: 0, createdAt: now, updatedAt: now };
    await saveProject(db, { ...localContext, local: false }, project);
    rpc
      .mockResolvedValueOnce({ data: { tasks: [], locations: [], categories: [], projects: [], works: [], history: [], queues: [] } })
      .mockResolvedValueOnce({ data: { conflict: false, version: 1, record: { ...project, version: 1 } } });
    await synchronize(db, localContext.householdId);
    expect((await db.projects.get(project.id))?.version).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });
  it('does not replace an offline edit with a server snapshot', async () => {
    await saveTask(db, { ...localContext, local: false }, task);
    rpc
      .mockResolvedValueOnce({
        data: { tasks: [{ ...task, title: 'Server titel' }], locations: [], categories: [] },
      })
      .mockResolvedValueOnce({ error: new Error('Netværksfejl') });
    await expect(synchronize(db, localContext.householdId)).rejects.toThrow();
    expect((await db.tasks.get(task.id))?.title).toBe('Lokal titel');
    expect(await db.outbox.count()).toBe(1);
  });
  it('retains a conflict and does not drop the outgoing command', async () => {
    await saveTask(db, { ...localContext, local: false }, task);
    rpc
      .mockResolvedValueOnce({ data: { tasks: [], locations: [], categories: [] } })
      .mockResolvedValueOnce({
        data: { conflict: true, current: { ...task, title: 'Server titel', version: 1 } },
      });
    await synchronize(db, localContext.householdId);
    expect(await db.conflicts.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
    expect((await db.tasks.get(task.id))?.title).toBe('Lokal titel');
  });
  it('rebases multiple consecutive edits after acknowledgement', async () => {
    await saveTask(db, { ...localContext, local: false }, task);
    await saveTask(
      db,
      { ...localContext, local: false },
      { ...(await db.tasks.get(task.id))!, title: 'Ny lokal titel' },
    );
    const versions: number[] = [];
    rpc.mockImplementation(async (name: string, args: any) => {
      if (name === 'household_snapshot')
        return { data: { tasks: [], locations: [], categories: [] } };
      versions.push(args.p_command.baseVersion);
      return {
        data: {
          conflict: false,
          version: args.p_command.baseVersion + 1,
          record: { ...args.p_command.payload, version: args.p_command.baseVersion + 1 },
        },
      };
    });
    await synchronize(db, localContext.householdId);
    expect(versions).toEqual([0, 1]);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.tasks.get(task.id))?.title).toBe('Ny lokal titel');
  });
  it('archives both versions before resolving', async () => {
    await saveTask(db, { ...localContext, local: false }, task);
    const command = (await db.outbox.toArray())[0];
    const conflict = {
      id: command.id,
      command,
      server: { ...task, title: 'Server titel', version: 1 },
      reason: 'Konflikt',
    };
    await db.conflicts.add(conflict);
    rpc.mockResolvedValue({ error: null });
    await resolveConflict(db, conflict, 'server');
    expect((await db.tasks.get(task.id))?.title).toBe('Server titel');
    expect(await db.outbox.count()).toBe(0);
    expect(await db.conflicts.count()).toBe(0);
    expect((await db.preferences.get(`resolved-conflict:${conflict.id}`))?.value).toContain(
      'Lokal titel',
    );
    expect(rpc.mock.calls[0][0]).toBe('record_conflict_resolution');
  });
  it('does not resolve if audit persistence fails', async () => {
    await saveTask(db, { ...localContext, local: false }, task);
    const command = (await db.outbox.toArray())[0];
    const conflict = { id: command.id, command, server: task, reason: 'Konflikt' };
    await db.conflicts.add(conflict);
    rpc.mockResolvedValue({ error: new Error('Ingen forbindelse') });
    await expect(resolveConflict(db, conflict, 'server')).rejects.toThrow();
    expect(await db.conflicts.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
  });
});

it('keeps a complete offline workflow queued and sends it in order when connection returns', async () => {
  const { actOnWork } = await import('../src/data/workRepository');
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  const remote = { ...localContext, local: false };
  await saveTask(db, remote, task);
  await actOnWork(db, remote, task.id, 'start', undefined, 10_000);
  await actOnWork(db, remote, task.id, 'complete', undefined, 70_000);
  await synchronize(db, localContext.householdId);
  expect(await db.outbox.count()).toBe(3);
  expect(rpc).not.toHaveBeenCalled();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  const sent: Array<[string, string | undefined, number]> = [];
  rpc.mockImplementation(async (name: string, args: any) => {
    if (name === 'household_snapshot')
      return { data: { tasks: [], locations: [], categories: [], projects: [], works: [], history: [], queues: [] } };
    const command = args.p_command;
    sent.push([command.entity, command.action, command.baseVersion]);
    return { data: { conflict: false, version: command.baseVersion + 1, record: { ...command.payload, version: command.baseVersion + 1 } } };
  });
  await synchronize(db, localContext.householdId);
  expect(sent).toEqual([
    ['task', undefined, 0],
    ['work', 'start', 0],
    ['work', 'complete', 1],
  ]);
  expect(await db.outbox.count()).toBe(0);
  expect((await db.works.get(task.id))?.status).toBe('completed');
});

it('rebases work actions separately from task edits with the same id', async () => {
  const { actOnWork } = await import('../src/data/workRepository');
  await saveTask(db, { ...localContext, local: false }, task);
  const at = Date.now();
  await actOnWork(db, { ...localContext, local: false }, task.id, 'start', undefined, at);
  await actOnWork(
    db,
    { ...localContext, local: false },
    task.id,
    'complete',
    undefined,
    at + 60000,
  );
  const versions: unknown[] = [];
  rpc.mockImplementation(async (name: string, args: any) => {
    if (name === 'household_snapshot')
      return { data: { tasks: [], locations: [], categories: [], works: [], queues: [] } };
    const c = args.p_command;
    versions.push([c.entity, c.baseVersion, c.action]);
    return {
      data: {
        conflict: false,
        version: c.baseVersion + 1,
        record: { ...c.payload, version: c.baseVersion + 1 },
      },
    };
  });
  await synchronize(db, localContext.householdId);
  expect(versions).toEqual([
    ['task', 0, undefined],
    ['work', 0, 'start'],
    ['work', 1, 'complete'],
  ]);
  expect((await db.works.get(task.id))?.status).toBe('completed');
  expect(await db.outbox.count()).toBe(0);
});
it('preserves rejected local time and refuses to overwrite shared work state', async () => {
  const { actOnWork } = await import('../src/data/workRepository');
  const { freshWork } = await import('../src/domain/work');
  await saveTask(db, localContext, task);
  await actOnWork(db, { ...localContext, local: false }, task.id, 'start');
  const command = (await db.outbox.toArray())[0];
  const conflict = {
    id: command.id,
    command,
    server: { ...freshWork(task), status: 'completed' as const, version: 2 },
    reason: 'Konflikt',
  };
  await db.conflicts.put(conflict);
  rpc.mockResolvedValue({ error: null });
  await expect(resolveConflict(db, conflict, 'local')).rejects.toThrow('overskrives');
  expect(await db.outbox.count()).toBe(1);
  await resolveConflict(db, conflict, 'server');
  expect((await db.works.get(task.id))?.status).toBe('completed');
  expect((await db.preferences.get(`resolved-conflict:${conflict.id}`))?.value).toContain(
    'startedAt',
  );
});

it('keeps pending recurring completion history until acknowledgement and rebases a following correction', async () => {
  const { actOnWork } = await import('../src/data/workRepository');
  const { allMonths } = await import('../src/domain/recurrence');
  const ctx = { ...localContext, local: false };
  await saveTask(db, localContext, {
    ...task,
    recurrence: {
      kind: 'interval',
      mode: 'completion',
      unit: 'day',
      every: 7,
      anchor: '2026-01-01',
      months: allMonths,
    },
  });
  const at = Date.parse('2026-01-21T12:00:00Z');
  await actOnWork(db, ctx, task.id, 'complete', undefined, at);
  await actOnWork(db, ctx, task.id, 'correct', 45, at, task.id);
  const next = (await db.works.get(task.id))!;
  const completed = (await db.outbox.toArray()).find((c) => c.action === 'complete')!.completion!;
  const versions: number[] = [];
  rpc.mockImplementation(async (name: string, args: any) => {
    if (name === 'household_snapshot')
      return {
        data: { tasks: [], locations: [], categories: [], works: [], history: [], queues: [] },
      };
    const c = args.p_command;
    versions.push(c.baseVersion);
    if (c.entity === 'work')
      return {
        data: {
          conflict: false,
          version: 1,
          record: { ...next, version: 1 },
          history: [{ ...completed, id: task.id, version: 1 }],
        },
      };
    return { data: { conflict: false, version: 2, record: { ...c.payload, version: 2 } } };
  });
  await synchronize(db, localContext.householdId);
  expect(versions).toEqual([0, 1]);
  expect((await db.history.get(task.id))?.adjustmentSeconds).toBe(2700);
  expect((await db.works.get(task.id))?.status).toBe('open');
});
it('archives dependent commands before removing a rejected recurring branch', async () => {
  const { actOnWork } = await import('../src/data/workRepository');
  const { freshWork } = await import('../src/domain/work');
  const { allMonths } = await import('../src/domain/recurrence');
  const ctx = { ...localContext, local: false };
  await saveTask(db, localContext, {
    ...task,
    recurrence: {
      kind: 'interval',
      mode: 'completion',
      unit: 'day',
      every: 7,
      anchor: '2026-01-01',
      months: allMonths,
    },
  });
  const at = Date.parse('2026-01-21T12:00:00Z');
  await actOnWork(db, ctx, task.id, 'complete', undefined, at);
  await actOnWork(db, ctx, task.id, 'correct', 45, at, task.id);
  const command = (await db.outbox.toArray()).find((c) => c.action === 'complete')!;
  const conflict = {
    id: command.id,
    command,
    server: { ...freshWork(task), version: 3 },
    reason: 'Konflikt',
  };
  await db.conflicts.put(conflict);
  rpc.mockResolvedValue({ error: null });
  await resolveConflict(db, conflict, 'server');
  expect(await db.outbox.count()).toBe(0);
  const archived = JSON.parse(
    (await db.preferences.get(`resolved-conflict:${conflict.id}`))!.value,
  );
  expect(archived.relatedCommands).toHaveLength(2);
  expect(archived.command.completion.status).toBe('completed');
  rpc.mockResolvedValue({
    data: { tasks: [], locations: [], categories: [], works: [], history: [], queues: [] },
  });
  await synchronize(db, localContext.householdId);
  expect(await db.history.count()).toBe(0);
});
