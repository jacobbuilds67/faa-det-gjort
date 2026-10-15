import { z } from 'zod';
import type { Table } from 'dexie';
import type { Context, Member, Task, Project, NamedEntity, Command, Conflict } from '../domain/model';
import { taskSchema } from '../domain/model';
import type { WorkState, QueueState, WorkEvent } from '../domain/work';
import { AppDB } from './db';

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const namedSchema = z.object({ id: uuid, householdId: uuid, name: z.string().min(1).max(80), independent: z.boolean(), version: z.number().int().nonnegative(), updatedAt: iso });
const projectSchema = z.object({ id: uuid, householdId: uuid, name: z.string().min(1).max(120), description: z.string().max(3000), archived: z.boolean(), version: z.number().int().nonnegative(), createdAt: iso, updatedAt: iso });
const intervalSchema = z.object({ id: uuid, userId: uuid, startedAt: z.number().finite().nonnegative(), stoppedAt: z.number().finite().nonnegative().nullable() });
const workSchema: z.ZodTypeAny = z.object({
  occurrenceId: uuid.optional(), plannedStart: z.string().optional(), plannedDeadline: z.string().optional(), ruleSnapshot: z.unknown().optional(), taskSnapshot: taskSchema.optional(), missedPeriods: z.array(z.object({ startDate: z.string(), deadline: z.string() })).optional(),
  id: uuid, taskId: uuid, householdId: uuid, name: z.string(), status: z.enum(['open', 'running', 'paused', 'completed', 'skipped']), actorId: uuid.nullable(), intervals: z.array(intervalSchema), adjustmentSeconds: z.number().finite(), remainingMinutes: z.number().finite().nullable(), completedAt: z.number().finite().nonnegative().nullable(), completedBy: uuid.nullable(), version: z.number().int().nonnegative(), updatedAt: iso,
});
const queueSchema = z.object({ occurrenceIds: z.record(z.string(), uuid).optional(), id: uuid, householdId: uuid, ownerId: uuid, name: z.string(), items: z.array(uuid), budgetMinutes: z.number().int().min(1).max(10080), version: z.number().int().nonnegative(), updatedAt: iso });
const actionSchema = z.enum(['start', 'pause', 'complete', 'skip', 'correct', 'remaining', 'skipOccurrence']);
const commandSchema = z.object({ id: uuid, entity: z.enum(['task', 'location', 'category', 'work', 'queue', 'history', 'project']), completion: workSchema.optional(), occurrenceId: uuid.optional(), nextOccurrenceId: uuid.optional(), action: actionSchema.optional(), at: z.number().finite().optional(), value: z.number().finite().optional(), entityId: uuid, baseVersion: z.number().int().nonnegative(), payload: z.object({ id: uuid, householdId: uuid, version: z.number().int().nonnegative() }).passthrough(), createdAt: iso });
const conflictSchema = z.object({ id: uuid, command: commandSchema, server: z.unknown().nullable(), reason: z.string() });
const eventSchema = z.object({ id: uuid, workId: uuid, actorId: uuid, action: actionSchema, at: z.number().finite().nonnegative(), before: workSchema, after: workSchema });
const memberSchema = z.object({ userId: uuid, name: z.string().min(1).max(80), role: z.enum(['owner', 'member']) });
const backupSchema = z.object({
  format: z.literal('faa-det-gjort-backup'), version: z.literal(1), exportedAt: iso,
  household: z.object({ id: uuid, name: z.string().min(1), userId: uuid, local: z.boolean(), members: z.array(memberSchema) }),
  data: z.object({ tasks: z.array(taskSchema).max(100000), projects: z.array(projectSchema).max(100000), locations: z.array(namedSchema).max(100000), categories: z.array(namedSchema).max(100000), works: z.array(workSchema).max(100000), history: z.array(workSchema).max(100000), queues: z.array(queueSchema).max(100000), workEvents: z.array(eventSchema).max(500000), outbox: z.array(commandSchema).max(100000), conflicts: z.array(conflictSchema).max(100000), preferences: z.array(z.object({ key: z.string().min(1).max(500), value: z.string().max(5000000) })).max(100000) }),
});

export type Backup = {
  format: 'faa-det-gjort-backup'; version: 1; exportedAt: string;
  household: { id: string; name: string; userId: string; local: boolean; members: Member[] };
  data: { tasks: Task[]; projects: Project[]; locations: NamedEntity[]; categories: NamedEntity[]; works: WorkState[]; history: WorkState[]; queues: QueueState[]; workEvents: WorkEvent[]; outbox: Command[]; conflicts: Conflict[]; preferences: Array<{ key: string; value: string }> };
};
export type ImportMode = 'merge' | 'replace';
export type ImportReport = { added: number; updated: number; kept: number; members: Member[] };

export async function createBackup(db: AppDB, ctx: Context, members: Member[]): Promise<Backup> {
  const [tasks, projects, locations, categories, works, history, queues, workEvents, preferences] = await Promise.all([
    db.tasks.toArray(), db.projects.toArray(), db.locations.toArray(), db.categories.toArray(), db.works.toArray(), db.history.toArray(), db.queues.toArray(), db.workEvents.toArray(), db.preferences.toArray(),
  ]);
  return backupSchema.parse({
    format: 'faa-det-gjort-backup', version: 1, exportedAt: new Date().toISOString(),
    household: { id: ctx.householdId, name: ctx.name, userId: ctx.userId, local: true, members },
    data: { tasks, projects, locations, categories, works, history, queues, workEvents, outbox: [], conflicts: [], preferences },
  }) as Backup;
}

export const serializeBackup = (backup: Backup) => JSON.stringify(backup, null, 2);
export const backupFilename = (date = new Date()) => `faa-det-gjort-familiebackup-${date.toISOString().slice(0, 10)}.json`;

export function parseBackup(text: string, _ctx: Context): Backup {
  if (text.length > 20_000_000) throw new Error('Backupfilen er større end 20 MB.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('Filen indeholder ikke gyldig JSON.'); }
  const result = backupSchema.safeParse(raw);
  if (!result.success) throw new Error('Backupfilen har et ugyldigt eller ukendt format.');
  const backup = result.data as Backup;
  validateRelations(backup);
  return backup;
}

function validateRelations(backup: Backup) {
  const { data } = backup, householdId = backup.household.id;
  const every = [data.tasks, data.projects, data.locations, data.categories, data.works, data.history, data.queues];
  if (every.some((rows) => rows.some((row) => row.householdId !== householdId))) throw new Error('Backupfilen blander data fra flere familier.');
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
  if ([...data.works, ...data.history].some((work) => !tasks.has(work.taskId))) throw new Error('Backupfilen indeholder arbejdstid uden den tilhørende opgave.');
  if (data.queues.some((queue) => queue.items.some((id) => !tasks.has(id)))) throw new Error('Backupfilen indeholder en kø med en manglende opgave.');
}

export function backupSummary(backup: Backup) {
  return {
    tasks: backup.data.tasks.length,
    projects: backup.data.projects.length,
    history: backup.data.history.length,
    workEvents: backup.data.workEvents.length,
    memberName: backup.household.members.find((member) => member.userId === backup.household.userId)?.name ?? 'Et familiemedlem',
  };
}

function newer(incoming: { updatedAt: string; version: number }, current: { updatedAt: string; version: number }) {
  const time = Date.parse(incoming.updatedAt) - Date.parse(current.updatedAt);
  return time > 0 || (time === 0 && incoming.version > current.version);
}

async function mergeRows<T extends { id: string; updatedAt: string; version: number }>(table: Table<T, string>, rows: T[], report: ImportReport) {
  const current = await table.bulkGet(rows.map((row) => row.id));
  const changes: T[] = [];
  rows.forEach((row, index) => {
    const existing = current[index];
    if (!existing) { report.added++; changes.push(row); }
    else if (newer(row, existing)) { report.updated++; changes.push(row); }
    else report.kept++;
  });
  if (changes.length) await table.bulkPut(changes);
}

async function normalizedFor(db: AppDB, backup: Backup): Promise<Backup> {
  const copy = structuredClone(backup);
  const maps = { locations: new Map<string, string>(), categories: new Map<string, string>(), projects: new Map<string, string>() };
  for (const key of ['locations', 'categories', 'projects'] as const) {
    const local = await db[key].toArray();
    for (const incoming of copy.data[key]) {
      const match = local.find((value) => value.name.localeCompare(incoming.name, 'da', { sensitivity: 'base' }) === 0);
      if (match && match.id !== incoming.id) maps[key].set(incoming.id, match.id);
    }
    copy.data[key] = copy.data[key].map((row) => ({ ...row, id: maps[key].get(row.id) ?? row.id })) as never;
  }
  copy.data.tasks = copy.data.tasks.map((task) => ({
    ...task,
    locationIds: [...new Set(task.locationIds.map((id) => maps.locations.get(id) ?? id))],
    categoryId: task.categoryId ? maps.categories.get(task.categoryId) ?? task.categoryId : null,
    projectId: task.projectId ? maps.projects.get(task.projectId) ?? task.projectId : task.projectId,
  }));
  return copy;
}

function moveToLocalFamily(backup: Backup, householdId: string): Backup {
  const copy = structuredClone(backup);
  copy.household = { ...copy.household, id: householdId, local: true };
  copy.data.locations = copy.data.locations.map((row) => ({ ...row, householdId }));
  copy.data.categories = copy.data.categories.map((row) => ({ ...row, householdId }));
  copy.data.projects = copy.data.projects.map((row) => ({ ...row, householdId }));
  copy.data.tasks = copy.data.tasks.map((row) => ({ ...row, householdId }));
  const moveWork = (row: WorkState): WorkState => ({
    ...row,
    householdId,
    taskSnapshot: row.taskSnapshot ? { ...row.taskSnapshot, householdId } : row.taskSnapshot,
  });
  copy.data.works = copy.data.works.map(moveWork);
  copy.data.history = copy.data.history.map(moveWork);
  copy.data.queues = copy.data.queues.map((row) => ({ ...row, householdId }));
  copy.data.workEvents = copy.data.workEvents.map((event) => ({
    ...event,
    before: moveWork(event.before),
    after: moveWork(event.after),
  }));
  return copy;
}

export async function importBackup(db: AppDB, ctx: Context, backup: Backup, mode: ImportMode): Promise<ImportReport> {
  validateRelations(backup);
  const localBackup = moveToLocalFamily(backup, ctx.householdId);
  const data = mode === 'merge' ? (await normalizedFor(db, localBackup)).data : localBackup.data;
  const report: ImportReport = { added: 0, updated: 0, kept: 0, members: backup.household.members };
  const tables = [db.tasks, db.projects, db.locations, db.categories, db.works, db.history, db.queues, db.workEvents, db.outbox, db.conflicts, db.preferences] as const;
  await db.transaction('rw', [...tables], async () => {
    if (mode === 'replace') {
      for (const table of tables) await table.clear();
      await db.locations.bulkPut(data.locations); await db.categories.bulkPut(data.categories); await db.projects.bulkPut(data.projects); await db.tasks.bulkPut(data.tasks); await db.works.bulkPut(data.works); await db.history.bulkPut(data.history); await db.queues.bulkPut(data.queues); await db.workEvents.bulkPut(data.workEvents); await db.preferences.bulkPut(data.preferences);
      report.added = data.locations.length + data.categories.length + data.projects.length + data.tasks.length + data.works.length + data.history.length + data.queues.length + data.workEvents.length;
      return;
    }
    await mergeRows(db.locations, data.locations, report); await mergeRows(db.categories, data.categories, report); await mergeRows(db.projects, data.projects, report); await mergeRows(db.tasks, data.tasks, report); await mergeRows(db.works, data.works, report); await mergeRows(db.history, data.history, report); await mergeRows(db.queues, data.queues, report);
    const existingEvents = await db.workEvents.bulkGet(data.workEvents.map((event) => event.id));
    const events = data.workEvents.filter((_, index) => !existingEvents[index]);
    report.added += events.length; report.kept += data.workEvents.length - events.length;
    if (events.length) await db.workEvents.bulkPut(events);
  });
  return report;
}
