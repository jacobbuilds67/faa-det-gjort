import type { Table } from 'dexie';
import type { SyncedRecord, Conflict, Command } from '../domain/model';
import { AppDB } from './db';
import { supabase } from './supabase';
function entityTable(db: AppDB, entity: Command['entity']): Table<SyncedRecord, string> {
  return {
    task: db.tasks,
    location: db.locations,
    category: db.categories,
    work: db.works,
    history: db.history,
    queue: db.queues,
    project: db.projects,
  }[entity] as unknown as Table<SyncedRecord, string>;
}
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
      [
        db.tasks,
        db.locations,
        db.categories,
        db.projects,
        db.works,
        db.history,
        db.queues,
        db.outbox,
        db.conflicts,
      ],
      async () => {
        const blocked = new Set([
          ...(await db.outbox.toArray()).flatMap((c) =>
            c.entity === 'task'
              ? [`task:${c.entityId}`, `work:${c.entityId}`]
              : [`${c.entity}:${c.entityId}`],
          ),
          ...(await db.conflicts.toArray()).map((c) => `${c.command.entity}:${c.command.entityId}`),
        ]);
        for (const c of await db.outbox.toArray())
          if (c.entity === 'work' && c.occurrenceId) blocked.add(`history:${c.occurrenceId}`);
        if (snapshot.history) {
          const ids = new Set(snapshot.history.map((h: { id: string }) => h.id));
          for (const h of await db.history.toArray())
            if (!ids.has(h.id) && !blocked.has(`history:${h.id}`)) await db.history.delete(h.id);
        }
        for (const [entity, rows] of [
          ['task', snapshot.tasks],
          ['location', snapshot.locations],
          ['category', snapshot.categories],
          ['project', snapshot.projects],
          ['work', snapshot.works],
          ['history', snapshot.history],
          ['queue', snapshot.queues],
        ] as const) {
          for (const row of (rows ?? []) as SyncedRecord[])
            if (!blocked.has(`${entity}:${row.id}`)) await entityTable(db, entity).put(row);
        }
      },
    );
    for (const initial of await db.outbox.orderBy('createdAt').toArray()) {
      const command = await db.outbox.get(initial.id);
      if (!command) continue;
      if (
        (await db.conflicts.toArray()).some(
          (c) =>
            (c.command.entityId === command.entityId && c.command.entity === command.entity) ||
            (c.command.entity === 'task' &&
              command.entity === 'work' &&
              c.command.entityId === command.entityId) ||
            (c.command.entity === 'work' &&
              command.entity === 'history' &&
              'taskId' in command.payload &&
              command.payload.taskId === c.command.entityId),
        )
      )
        continue;
      const { data, error } = await supabase.rpc('apply_command', {
        p_household: householdId,
        p_command: command,
      });
      if (error) throw error;
      await db.transaction(
        'rw',
        [
          db.tasks,
          db.locations,
          db.categories,
          db.projects,
          db.works,
          db.history,
          db.queues,
          db.outbox,
          db.conflicts,
        ],
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
          const later = (await db.outbox.where('entityId').equals(command.entityId).toArray())
            .filter((c) => c.entity === command.entity)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          for (const c of later)
            await db.outbox.update(c.id, {
              baseVersion: data.version,
              payload: { ...c.payload, version: data.version },
            });
          const table = entityTable(db, command.entity);
          const value = later.length
            ? { ...later[later.length - 1].payload, version: data.version }
            : data.record;
          await table.put(value);
          for (const record of (data.history ?? []) as import('../domain/work').WorkState[]) {
            const pendingHistory = (await db.outbox.toArray()).filter(
              (c) => c.entity === 'history' && c.entityId === record.id,
            );
            for (const h of pendingHistory)
              await db.outbox.update(h.id, {
                baseVersion: record.version,
                payload: { ...h.payload, version: record.version },
              });
            await db.history.put(
              pendingHistory.length
                ? ({
                    ...pendingHistory.at(-1)!.payload,
                    version: record.version,
                  } as import('../domain/work').WorkState)
                : record,
            );
          }
          if (
            data.work &&
            !(await db.outbox.toArray()).some(
              (c) => c.entity === 'work' && c.entityId === data.work.id,
            )
          )
            await db.works.put(data.work);
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
  if (['work', 'history'].includes(conflict.command.entity) && choice === 'local')
    throw new Error(
      'Arbejdsstatus kan ikke overskrives. Bevar fælles status og korrigér tiden efter afklaring.',
    );
  const conflictTable = entityTable(db, conflict.command.entity);
  const localCopy = await conflictTable.get(conflict.command.entityId);
  const relatedCommands = (await db.outbox.toArray()).filter(
    (c) =>
      conflict.command.entity === 'work' &&
      ((c.entity === 'work' && c.entityId === conflict.command.entityId) ||
        (c.entity === 'history' &&
          'taskId' in c.payload &&
          c.payload.taskId === conflict.command.entityId)),
  );
  const { error } = await supabase.rpc('record_conflict_resolution', {
    p_id: conflict.id,
    p_resolution: { choice, local: localCopy, server: conflict.server, relatedCommands },
  });
  if (error) throw error;
  await db.transaction(
    'rw',
    [
      db.tasks,
      db.locations,
      db.categories,
      db.projects,
      db.works,
      db.history,
      db.queues,
      db.outbox,
      db.conflicts,
      db.preferences,
    ],
    async () => {
      const c = conflict.command;
      const table = entityTable(db, c.entity);
      const local = await table.get(c.entityId);
      // Record the rejected values in a persistent, resolved conflict archive.
      await db.preferences.put({
        key: `resolved-conflict:${conflict.id}`,
        value: JSON.stringify({
          ...conflict,
          local,
          choice,
          relatedCommands,
          resolvedAt: new Date().toISOString(),
        }),
      });
      await db.outbox
        .where('entityId')
        .equals(c.entityId)
        .filter((item) => item.entity === c.entity)
        .delete();
      if (c.entity === 'work' && choice === 'server')
        await db.outbox.bulkDelete(relatedCommands.map((c) => c.id));
      if (choice === 'server') {
        if (conflict.server) await table.put(conflict.server as SyncedRecord);
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
