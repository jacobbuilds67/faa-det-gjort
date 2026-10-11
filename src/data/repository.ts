import {
  taskSchema,
  type Task,
  type NamedEntity,
  type Context,
  type Command,
} from '../domain/model';
import { AppDB } from './db';
export async function saveTask(db: AppDB, ctx: Context, input: Task) {
  const task = taskSchema.parse(input);
  if (task.householdId !== ctx.householdId) throw new Error('Opgaven tilhører en anden husstand.');
  await db.transaction(
    'rw',
    [db.tasks, db.locations, db.categories, db.outbox, db.conflicts],
    async () => {
      for (const id of task.locationIds)
        if (!(await db.locations.get(id))) throw new Error('Lokationen findes ikke længere.');
      if (task.categoryId && !(await db.categories.get(task.categoryId)))
        throw new Error('Kategorien findes ikke længere.');
      if ((await db.conflicts.toArray()).some((c) => c.command.entityId === task.id))
        throw new Error('Løs konflikten før opgaven redigeres.');
      const current = await db.tasks.get(task.id);
      if (current && current.updatedAt !== input.updatedAt)
        throw new Error('Opgaven er ændret i et andet vindue. Luk og åbn den igen.');
      const saved = {
        ...task,
        updatedAt: new Date(
          Math.max(Date.now(), Date.parse(current?.updatedAt ?? '') + 1 || 0),
        ).toISOString(),
      };
      await db.tasks.put(saved);
      if (!ctx.local) await enqueue(db, 'task', saved);
    },
  );
}
async function enqueue(db: AppDB, entity: Command['entity'], payload: Task | NamedEntity) {
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
