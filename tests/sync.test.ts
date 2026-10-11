import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/data/supabase', () => ({ supabase: { rpc } }));
import { AppDB, initialize, localContext } from '../src/data/db';
import { saveTask } from '../src/data/repository';
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
