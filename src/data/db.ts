import Dexie, { type Table } from 'dexie';
import type { Task, NamedEntity, Command, Conflict, Context } from '../domain/model';
export class AppDB extends Dexie {
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
