import { validateRecurrence, firstPeriod } from '../domain/recurrence';
import { freshWork } from '../domain/work';
import {
  taskSchema,
  type Task,
  type NamedEntity,
  type Context,
  type Command,
  type SyncedRecord,
} from '../domain/model';
import { AppDB } from './db';
export async function saveTask(db: AppDB, ctx: Context, input: Task) {
  const task = taskSchema.parse(input);
  if (task.recurrence) task.recurrence = validateRecurrence(task.recurrence);
  if (task.householdId !== ctx.householdId) throw new Error('Opgaven tilhører en anden husstand.');
  await db.transaction(
    'rw',
    [db.tasks, db.locations, db.categories, db.projects, db.works, db.outbox, db.conflicts],
    async () => {
      for (const id of task.locationIds)
        if (!(await db.locations.get(id))) throw new Error('Lokationen findes ikke længere.');
      if (task.categoryId && !(await db.categories.get(task.categoryId)))
        throw new Error('Kategorien findes ikke længere.');
      if (task.projectId && !(await db.projects.get(task.projectId)))
        throw new Error('Projektet findes ikke længere.');
      const dependencies = [...new Set(task.dependencyIds ?? [])];
      if (dependencies.includes(task.id)) throw new Error('En opgave kan ikke afhænge af sig selv.');
      for (const id of dependencies) {
        const dependency = await db.tasks.get(id);
        if (!dependency || dependency.householdId !== ctx.householdId)
          throw new Error('En afhængighed findes ikke længere.');
      }
      const all = await db.tasks.toArray();
      const graph = new Map(all.map((value) => [value.id, value.id === task.id ? dependencies : (value.dependencyIds ?? [])]));
      graph.set(task.id, dependencies);
      const visit = (id: string, path = new Set<string>()): boolean => {
        if (path.has(id)) return true;
        const next = new Set(path).add(id);
        return (graph.get(id) ?? []).some((dependency) => visit(dependency, next));
      };
      if (visit(task.id)) throw new Error('Afhængigheder må ikke danne en cirkel.');
      if ((await db.conflicts.toArray()).some((c) => c.command.entityId === task.id))
        throw new Error('Løs konflikten før opgaven redigeres.');
      if (task.archived && (await db.works.get(task.id))?.status === 'running')
        throw new Error('Sæt opgaven på pause før den arkiveres.');
      const current = await db.tasks.get(task.id);
      if (current && current.updatedAt !== input.updatedAt)
        throw new Error('Opgaven er ændret i et andet vindue. Luk og åbn den igen.');
      const saved = {
        ...task,
        dependencyIds: dependencies,
        updatedAt: new Date(
          Math.max(Date.now(), Date.parse(current?.updatedAt ?? '') + 1 || 0),
        ).toISOString(),
      };
      const work = await db.works.get(task.id);
      const changed =
        JSON.stringify(current?.recurrence ?? null) !== JSON.stringify(task.recurrence ?? null);
      if (changed && work && ['completed', 'skipped'].includes(work.status))
        throw new Error(
          'En afsluttet engangsopgave bevarer sin historik. Opret en ny opgave med gentagelse.',
        );
      if (
        task.recurrence &&
        (!work || (changed && work.status === 'open' && !work.intervals.length))
      ) {
        const period = firstPeriod(task.recurrence);
        await db.works.put({
          ...freshWork(saved),
          ...work,
          plannedStart: period.startDate,
          plannedDeadline: period.deadline,
          ruleSnapshot: task.recurrence,
        });
      }
      if (!task.recurrence && changed && work && work.status === 'open' && !work.intervals.length)
        await db.works.put({
          ...work,
          plannedStart: task.startDate,
          plannedDeadline: task.deadline,
          ruleSnapshot: null,
        });
      await db.tasks.put(saved);
      if (!ctx.local) await enqueue(db, 'task', saved);
    },
  );
}
export async function enqueue(
  db: AppDB,
  entity: Command['entity'],
  payload: SyncedRecord,
  metadata: Partial<
    Pick<Command, 'action' | 'at' | 'value' | 'occurrenceId' | 'nextOccurrenceId' | 'completion'>
  > = {},
) {
  // Keep every command. The sync engine re-bases subsequent local edits after acknowledgement.
  const last = await db.outbox.orderBy('createdAt').last();
  const createdAt = new Date(
    Math.max(Date.now(), Date.parse(last?.createdAt ?? '') + 1 || 0),
  ).toISOString();
  await db.outbox.add({
    id: crypto.randomUUID(),
    entity,
    entityId: payload.id,
    baseVersion: payload.version,
    payload,
    createdAt,
    ...metadata,
  });
}
export async function saveNamed(
  db: AppDB,
  ctx: Context,
  entity: 'location' | 'category',
  input: NamedEntity,
) {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new Error('Navnet skal indeholde 1–80 tegn.');
  if (input.householdId !== ctx.householdId) throw new Error('Forkert husstand.');
  await db.transaction('rw', [db.locations, db.categories, db.outbox, db.conflicts], async () => {
    if ((await db.conflicts.toArray()).some((c) => c.command.entityId === input.id))
      throw new Error('Løs først konflikten for dette navn.');
    const table = entity === 'location' ? db.locations : db.categories;
    if (
      (await table.toArray()).some(
        (l) => l.id !== input.id && l.name.toLocaleLowerCase('da') === name.toLocaleLowerCase('da'),
      )
    )
      throw new Error('Navnet findes allerede.');
    const current = await table.get(input.id);
    if (current && current.updatedAt !== input.updatedAt)
      throw new Error('Navnet er ændret i et andet vindue. Prøv igen.');
    const value = {
      ...input,
      name,
      updatedAt: new Date(
        Math.max(Date.now(), Date.parse(current?.updatedAt ?? '') + 1 || 0),
      ).toISOString(),
    };
    await table.put(value);
    if (!ctx.local) await enqueue(db, entity, value);
  });
}
export async function addExamples(db: AppDB, ctx: Context) {
  const locations = await db.locations.toArray(),
    categories = await db.categories.toArray();
  const home = locations.find((l) => l.name === 'Hjemme') || locations[0],
    summer = locations.find((l) => l.name === 'Sommerhus') || home;
  for (const [title, estimate, category, location, priority] of [
    ['Giv krukkerne lidt kærlighed', 15, 'Have', home, 'low'],
    ['Rens filteret i emhætten', 30, 'Hus', home, 'medium'],
    ['Vask bilen', 45, 'Bil', home, 'medium'],
    ['Gør terrassen klar til efteråret', 60, 'Have', summer, 'high'],
    ['Sortér skuffen i entréen', 20, 'Hus', home, 'low'],
  ] as const) {
    const now = new Date().toISOString();
    await saveTask(db, ctx, {
      id: crypto.randomUUID(),
      householdId: ctx.householdId,
      title,
      description: '',
      estimate,
      priority,
      locationIds: [location.id],
      categoryId: categories.find((c) => c.name === category)?.id ?? null,
      startDate: '',
      deadline: '',
      assigneeId: null,
      archived: false,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
  }
}
