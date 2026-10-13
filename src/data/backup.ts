import { z } from 'zod';
import type { Table } from 'dexie';
import type { Context, Member, Task, Project, NamedEntity, Command, Conflict } from '../domain/model';
import { taskSchema } from '../domain/model';
import type { WorkState, QueueState, WorkEvent } from '../domain/work';
import { AppDB } from './db';

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const namedSchema = z.object({
  id: uuid,
  householdId: uuid,
  name: z.string().min(1).max(80),
  independent: z.boolean(),
  version: z.number().int().nonnegative(),
  updatedAt: iso,
});
const projectSchema = z.object({
  id: uuid,
  householdId: uuid,
  name: z.string().min(1).max(120),
  description: z.string().max(3000),
  archived: z.boolean(),
  version: z.number().int().nonnegative(),
  createdAt: iso,
  updatedAt: iso,
});
const intervalSchema = z.object({
  id: uuid,
  userId: uuid,
  startedAt: z.number().finite().nonnegative(),
  stoppedAt: z.number().finite().nonnegative().nullable(),
});
const workSchema: z.ZodTypeAny = z.object({
  occurrenceId: uuid.optional(),
  plannedStart: z.string().optional(),
  plannedDeadline: z.string().optional(),
  ruleSnapshot: z.unknown().optional(),
  taskSnapshot: taskSchema.optional(),
  missedPeriods: z.array(z.object({ startDate: z.string(), deadline: z.string() })).optional(),
  id: uuid,
  taskId: uuid,
  householdId: uuid,
  name: z.string(),
  status: z.enum(['open', 'running', 'paused', 'completed', 'skipped']),
  actorId: uuid.nullable(),
  intervals: z.array(intervalSchema),
  adjustmentSeconds: z.number().finite(),
  remainingMinutes: z.number().finite().nullable(),
  completedAt: z.number().finite().nonnegative().nullable(),
  completedBy: uuid.nullable(),
  version: z.number().int().nonnegative(),
  updatedAt: iso,
});
const queueSchema = z.object({
  occurrenceIds: z.record(z.string(), uuid).optional(),
  id: uuid,
  householdId: uuid,
  ownerId: uuid,
  name: z.string(),
  items: z.array(uuid),
  budgetMinutes: z.number().int().min(1).max(10080),
  version: z.number().int().nonnegative(),
  updatedAt: iso,
});
const actionSchema = z.enum([
  'start',
  'pause',
  'complete',
  'skip',
  'correct',
  'remaining',
  'skipOccurrence',
]);
const commandSchema = z.object({
  id: uuid,
  entity: z.enum(['task', 'location', 'category', 'work', 'queue', 'history', 'project']),
  completion: workSchema.optional(),
  occurrenceId: uuid.optional(),
  nextOccurrenceId: uuid.optional(),
  action: actionSchema.optional(),
  at: z.number().finite().optional(),
  value: z.number().finite().optional(),
  entityId: uuid,
  baseVersion: z.number().int().nonnegative(),
  payload: z.object({ id: uuid, householdId: uuid, version: z.number().int().nonnegative() }).passthrough(),
  createdAt: iso,
});
const conflictSchema = z.object({
  id: uuid,
  command: commandSchema,
  server: z.unknown().nullable(),
  reason: z.string(),
});
const eventSchema = z.object({
  id: uuid,
  workId: uuid,
  actorId: uuid,
  action: actionSchema,
  at: z.number().finite().nonnegative(),
  before: workSchema,
  after: workSchema,
});
const backupSchema = z.object({
  format: z.literal('faa-det-gjort-backup'),
  version: z.literal(1),
  exportedAt: iso,
  household: z.object({
    id: uuid,
    name: z.string().min(1),
    userId: uuid,
    local: z.boolean(),
    members: z.array(z.object({ userId: uuid, name: z.string(), role: z.enum(['owner', 'member']) })),
  }),
  data: z.object({
    tasks: z.array(taskSchema).max(100000),
    projects: z.array(projectSchema).max(100000),
    locations: z.array(namedSchema).max(100000),
    categories: z.array(namedSchema).max(100000),
    works: z.array(workSchema).max(100000),
    history: z.array(workSchema).max(100000),
    queues: z.array(queueSchema).max(100000),
    workEvents: z.array(eventSchema).max(500000),
    outbox: z.array(commandSchema).max(100000),
    conflicts: z.array(conflictSchema).max(100000),
    preferences: z.array(z.object({ key: z.string().min(1).max(500), value: z.string().max(5000000) })).max(100000),
  }),
});

export type Backup = {
  format: 'faa-det-gjort-backup';
  version: 1;
  exportedAt: string;
  household: { id: string; name: string; userId: string; local: boolean; members: Member[] };
  data: {
    tasks: Task[];
    projects: Project[];
    locations: NamedEntity[];
    categories: NamedEntity[];
    works: WorkState[];
    history: WorkState[];
    queues: QueueState[];
    workEvents: WorkEvent[];
    outbox: Command[];
    conflicts: Conflict[];
    preferences: Array<{ key: string; value: string }>;
  };
};
export type ImportMode = 'merge' | 'replace';

export async function createBackup(db: AppDB, ctx: Context, members: Member[]): Promise<Backup> {
  const [tasks, projects, locations, categories, works, history, queues, workEvents, outbox, conflicts, preferences] = await Promise.all([
    db.tasks.toArray(), db.projects.toArray(), db.locations.toArray(), db.categories.toArray(),
    db.works.toArray(), db.history.toArray(), db.queues.toArray(), db.workEvents.toArray(),
    db.outbox.toArray(), db.conflicts.toArray(), db.preferences.toArray(),
  ]);
  return backupSchema.parse({
    format: 'faa-det-gjort-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    household: { id: ctx.householdId, name: ctx.name, userId: ctx.userId, local: ctx.local, members },
    data: { tasks, projects, locations, categories, works, history, queues, workEvents, outbox, conflicts, preferences },
  }) as Backup;
}

export function serializeBackup(backup: Backup) {
  return JSON.stringify(backup, null, 2);
}

export function backupFilename(date = new Date()) {
  return `faa-det-gjort-backup-${date.toISOString().slice(0, 10)}.json`;
}

export function parseBackup(text: string, ctx: Context): Backup {
  if (text.length > 20_000_000) throw new Error('Backupfilen er større end 20 MB.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Filen indeholder ikke gyldig JSON.');
  }
  const result = backupSchema.safeParse(raw);
  if (!result.success) throw new Error('Backupfilen har et ugyldigt eller ukendt format.');
  const backup = result.data as Backup;
  if (backup.household.id !== ctx.householdId)
    throw new Error('Backupfilen tilhører en anden husstand.');
  if (backup.household.userId !== ctx.userId)
    throw new Error('Backupfilen tilhører en anden bruger i husstanden.');
  validateRelations(backup);
  return backup;
}

function validateRelations(backup: Backup) {
  const { data } = backup, householdId = backup.household.id;
  const every = [data.tasks, data.projects, data.locations, data.categories, data.works, data.history, data.queues];
  if (every.some((rows) => rows.some((row) => row.householdId !== householdId)))
    throw new Error('Backupfilen blander data fra flere husstande.');
  for (const rows of every) {
    const ids = rows.map((row) => row.id);
    if (new Set(ids).size !== ids.length) throw new Error('Backupfilen indeholder dublerede ID’er.');
  }
  const tasks = new Set(data.tasks.map((row) => row.id));
  const projects = new Set(data.projects.map((row) => row.id));
  const locations = new Set(data.locations.map((row) => row.id));
  const categories = new Set(data.categories.map((row) => row.id));
  for (const task of data.tasks) {
    if (task.locationIds.some((id) => !locations.has(id))) throw new Error('En opgave henviser til en manglende lokation.');
    if (task.categoryId && !categories.has(task.categoryId)) throw new Error('En opgave henviser til en manglende kategori.');
    if (task.projectId && !projects.has(task.projectId)) throw new Error('En opgave henviser til et manglende projekt.');
    if ((task.dependencyIds ?? []).some((id) => !tasks.has(id))) throw new Error('En opgave henviser til en manglende afhængighed.');
  }
  if ([...data.works, ...data.history].some((work) => !tasks.has(work.taskId)))
    throw new Error('Backupfilen indeholder arbejdstid uden den tilhørende opgave.');
  if (data.queues.some((queue) => queue.items.some((id) => !tasks.has(id))))
    throw new Error('Backupfilen indeholder en kø med en manglende opgave.');
  if (data.outbox.some((command) => command.payload.householdId !== householdId))
    throw new Error('Backupfilen indeholder en ugyldig synkroniseringskommando.');
}

export function backupSummary(backup: Backup) {
  return {
    tasks: backup.data.tasks.length,
    projects: backup.data.projects.length,
    history: backup.data.history.length,
    workEvents: backup.data.workEvents.length,
    pending: backup.data.outbox.length,
    conflicts: backup.data.conflicts.length,
  };
}

export async function importBackup(db: AppDB, ctx: Context, backup: Backup, mode: ImportMode) {
  if (backup.household.id !== ctx.householdId) throw new Error('Backupfilen tilhører en anden husstand.');
  if (backup.household.userId !== ctx.userId) throw new Error('Backupfilen tilhører en anden bruger i husstanden.');
  validateRelations(backup);
  const tables = [db.tasks, db.projects, db.locations, db.categories, db.works, db.history, db.queues, db.workEvents, db.outbox, db.conflicts, db.preferences] as const;
  await db.transaction('rw', [...tables], async () => {
    if (mode === 'replace') {
      for (const table of tables) await table.clear();
      await putAll(db, backup);
      return;
    }
    for (const [current, incoming, label] of [
      [await db.locations.toArray(), backup.data.locations, 'lokation'],
      [await db.categories.toArray(), backup.data.categories, 'kategori'],
      [await db.projects.toArray(), backup.data.projects, 'projekt'],
    ] as const) {
      if (incoming.some((row) => current.some((value) => value.id !== row.id && value.name.toLocaleLowerCase('da') === row.name.toLocaleLowerCase('da'))))
        throw new Error(`En ${label} har samme navn, men et andet ID. Brug Erstat lokale data efter kontrol.`);
    }
    await mergeMissing(db, backup);
  });
}

async function putAll(db: AppDB, backup: Backup) {
  const d = backup.data;
  await db.locations.bulkPut(d.locations);
  await db.categories.bulkPut(d.categories);
  await db.projects.bulkPut(d.projects);
  await db.tasks.bulkPut(d.tasks);
  await db.works.bulkPut(d.works);
  await db.history.bulkPut(d.history);
  await db.queues.bulkPut(d.queues);
  await db.workEvents.bulkPut(d.workEvents);
  await db.outbox.bulkPut(d.outbox);
  await db.conflicts.bulkPut(d.conflicts);
  await db.preferences.bulkPut(d.preferences);
}

async function mergeMissing(db: AppDB, backup: Backup) {
  const d = backup.data;
  const missing = async <T extends { id: string }>(table: Table<T, string>, rows: T[]) => {
    const existing = await table.bulkGet(rows.map((row) => row.id));
    await table.bulkPut(rows.filter((_, index) => !existing[index]));
  };
  await missing(db.locations, d.locations);
  await missing(db.categories, d.categories);
  await missing(db.projects, d.projects);
  await missing(db.tasks, d.tasks);
  await missing(db.works, d.works);
  await missing(db.history, d.history);
  await missing(db.queues, d.queues);
  await missing(db.workEvents, d.workEvents);
  await missing(db.outbox, d.outbox);
  await missing(db.conflicts, d.conflicts);
  const keys = new Set((await db.preferences.toArray()).map((value) => value.key));
  await db.preferences.bulkPut(d.preferences.filter((value) => !keys.has(value.key)));
}
