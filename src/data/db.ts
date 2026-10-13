import type { WorkState, QueueState, WorkEvent } from '../domain/work';
import Dexie, { type Table } from 'dexie';
import type { Task, NamedEntity, Command, Conflict, Context, Project } from '../domain/model';
export class AppDB extends Dexie {
  works!: Table<WorkState, string>;
  history!: Table<WorkState, string>;
  projects!: Table<Project, string>;
  queues!: Table<QueueState, string>;
  workEvents!: Table<WorkEvent, string>;
  tasks!: Table<Task, string>;
  locations!: Table<NamedEntity, string>;
  categories!: Table<NamedEntity, string>;
  outbox!: Table<Command, string>;
  conflicts!: Table<Conflict, string>;
  preferences!: Table<{ key: string; value: string }, string>;
  constructor(scope: string) {
    super(`hverdagsro-${scope}`);
    this.version(1).stores({
      tasks: 'id,householdId,archived',
      locations: 'id',
      categories: 'id',
      outbox: 'id,entityId,createdAt',
      conflicts: 'id',
      preferences: 'key',
    });
    this.version(2).stores({
      works: 'id,taskId,status',
      queues: 'id,ownerId',
      workEvents: 'id,workId,at',
    });
    this.version(3)
      .stores({ history: 'id,taskId,status,completedAt' })
      .upgrade(async (tx) => {
        for (const q of await tx.table('queues').toArray())
          await tx.table('queues').put({
            ...q,
            occurrenceIds: Object.fromEntries(q.items.map((id: string) => [id, id])),
          });
        const terminal = await tx.table('works').toArray();
        for (const w of terminal)
          if (['completed', 'skipped'].includes(w.status))
            await tx
              .table('history')
              .put({
                ...w,
                taskSnapshot: w.taskSnapshot ?? (await tx.table('tasks').get(w.taskId)),
                id: w.occurrenceId ?? w.id,
                occurrenceId: w.occurrenceId ?? w.id,
              });
      });
    this.version(4).stores({ projects: 'id,householdId,archived' });
  }
}
export const localContext: Context = {
  userId: '00000000-0000-4000-8000-000000000001',
  householdId: '00000000-0000-4000-8000-000000000002',
  name: 'Min husstand',
  local: true,
};
export async function initialize(db: AppDB, ctx: Context) {
  if (!ctx.local) return;
  await db.transaction('rw', [db.locations, db.categories, db.preferences], async () => {
    if (await db.preferences.get('initialized')) return;
    const make = (name: string, independent = false): NamedEntity => ({
      id: crypto.randomUUID(),
      householdId: ctx.householdId,
      name,
      independent,
      version: 0,
      updatedAt: new Date().toISOString(),
    });
    await db.locations.bulkAdd([
      make('Hjemme'),
      make('Sommerhus'),
      make('Andre steder'),
      make('Uafhængig af lokation', true),
    ]);
    await db.categories.bulkAdd(['Have', 'Hus', 'Bil', 'Vedligehold', 'Andet'].map((n) => make(n)));
    await db.preferences.put({ key: 'initialized', value: 'true' });
  });
}
