import type { Context, Project } from '../domain/model';
import { AppDB } from './db';
import { enqueue } from './repository';

export async function saveProject(db: AppDB, ctx: Context, input: Project) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name || name.length > 120) throw new Error('Projektnavnet skal indeholde 1–120 tegn.');
  if (description.length > 3000) throw new Error('Projektbeskrivelsen må højst være 3.000 tegn.');
  if (input.householdId !== ctx.householdId) throw new Error('Projektet tilhører en anden husstand.');
  await db.transaction('rw', [db.projects, db.outbox, db.conflicts], async () => {
    if ((await db.conflicts.toArray()).some((c) => c.command.entity === 'project' && c.command.entityId === input.id))
      throw new Error('Løs projektets konflikt før du fortsætter.');
    const current = await db.projects.get(input.id);
    if ((await db.projects.toArray()).some((project) => project.id !== input.id && project.name.toLocaleLowerCase('da') === name.toLocaleLowerCase('da')))
      throw new Error('Projektnavnet findes allerede.');
    if (current && current.updatedAt !== input.updatedAt)
      throw new Error('Projektet er ændret i et andet vindue. Åbn det igen.');
    const value = {
      ...input,
      name,
      description,
      updatedAt: new Date(Math.max(Date.now(), Date.parse(current?.updatedAt ?? '') + 1 || 0)).toISOString(),
    };
    await db.projects.put(value);
    if (!ctx.local) await enqueue(db, 'project', value);
  });
}
