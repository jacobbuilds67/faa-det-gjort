import type { Task, NamedEntity, Conflict, Command } from '../domain/model';
import { AppDB } from './db';
import { supabase } from './supabase';
const running = new WeakSet<AppDB>();
export async function synchronize(db: AppDB, householdId: string) {
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request(`sync:${db.name}`, { ifAvailable: true }, async (lock) => {
      if (lock) await runSync(db, householdId);
    });
  return runSync(db, householdId);
}
async function runSync(db: AppDB, householdId: string) {
  if (!supabase || running.has(db) || !navigator.onLine) return;
  running.add(db);
  try {
    // A full RLS-protected snapshot is adequate for the first two-person release.
    // Never replace entities with pending local changes or unresolved conflicts.
    const { data: snapshot, error: readError } = await supabase.rpc('household_snapshot', {
      p_household: householdId,
    });
    if (readError) throw readError;
    await db.transaction(
      'rw',
      [db.tasks, db.locations, db.categories, db.outbox, db.conflicts],
      async () => {
        const blocked = new Set([
          ...(await db.outbox.toArray()).map((c) => c.entityId),
          ...(await db.conflicts.toArray()).map((c) => c.command.entityId),
        ]);
        for (const [table, rows] of [
          [db.tasks, snapshot.tasks],
          [db.locations, snapshot.locations],
          [db.categories, snapshot.categories],
        ] as const) {
          for (const row of (rows ?? []) as (Task & NamedEntity)[])
            if (!blocked.has(row.id)) await table.put(row);
        }
      },
    );
    for (const initial of await db.outbox.orderBy('createdAt').toArray()) {
      const command = await db.outbox.get(initial.id);
      if (!command) continue;
      if ((await db.conflicts.toArray()).some((c) => c.command.entityId === command.entityId))
        continue;
      const { data, error } = await supabase.rpc('apply_command', {
        p_household: householdId,
        p_command: command,
      });
      if (error) throw error;
      await db.transaction(
        'rw',
        [db.tasks, db.locations, db.categories, db.outbox, db.conflicts],
        async () => {
          if (data.conflict) {
            await db.conflicts.put({
              id: command.id,
              command,
              server: data.current,
              reason: 'En anden enhed har ændret oplysningerne.',
            });
            return;
          }
          await db.outbox.delete(command.id);
          const later = (await db.outbox.where('entityId').equals(command.entityId).toArray()).sort(
            (a, b) => a.createdAt.localeCompare(b.createdAt),
          );
          for (const c of later)
            await db.outbox.update(c.id, {
              baseVersion: data.version,
              payload: { ...c.payload, version: data.version },
            });
          const table =
            command.entity === 'task'
              ? db.tasks
              : command.entity === 'location'
                ? db.locations
                : db.categories;
          const value = later.length
            ? { ...later[later.length - 1].payload, version: data.version }
            : data.record;
          await table.put(value);
        },
      );
    }
  } finally {
    running.delete(db);
  }
}
export async function resolveConflict(db: AppDB, conflict: Conflict, choice: 'server' | 'local') {
  if (!supabase || !navigator.onLine)
    throw new Error('Forbind til internettet for at gemme konfliktens løsninger sikkert.');
  const conflictTable =
    conflict.command.entity === 'task'
      ? db.tasks
      : conflict.command.entity === 'location'
        ? db.locations
        : db.categories;
  const localCopy = await conflictTable.get(conflict.command.entityId);
  const { error } = await supabase.rpc('record_conflict_resolution', {
    p_id: conflict.id,
    p_resolution: { choice, local: localCopy, server: conflict.server },
  });
  if (error) throw error;
  await db.transaction(
    'rw',
    [db.tasks, db.locations, db.categories, db.outbox, db.conflicts, db.preferences],
    async () => {
      const c = conflict.command,
        table =
          c.entity === 'task' ? db.tasks : c.entity === 'location' ? db.locations : db.categories;
      const local = await table.get(c.entityId);
      // Record the rejected values in a persistent, resolved conflict archive.
      await db.preferences.put({
        key: `resolved-conflict:${conflict.id}`,
        value: JSON.stringify({ ...conflict, local, choice, resolvedAt: new Date().toISOString() }),
      });
      await db.outbox.where('entityId').equals(c.entityId).delete();
      if (choice === 'server') {
        if (conflict.server) await table.put(conflict.server as Task & NamedEntity);
        else await table.delete(c.entityId);
      } else if (local) {
        const next: Command = {
          ...c,
          id: crypto.randomUUID(),
          baseVersion: conflict.server?.version ?? 0,
          payload: { ...local, version: conflict.server?.version ?? 0 },
          createdAt: new Date().toISOString(),
        };
        await db.outbox.add(next);
      }
      await db.conflicts.delete(conflict.id);
    },
  );
}
