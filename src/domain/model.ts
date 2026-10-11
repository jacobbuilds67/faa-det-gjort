import { z } from 'zod';
export const taskSchema = z
  .object({
    id: z.string().uuid(),
    householdId: z.string().uuid(),
    title: z.string().trim().min(1, 'Skriv en titel').max(160),
    description: z.string().max(5000),
    estimate: z.number().int().min(1).max(10080),
    priority: z.enum(['high', 'medium', 'low']),
    locationIds: z.array(z.string().uuid()).min(1, 'Vælg mindst én lokation'),
    categoryId: z.string().uuid().nullable(),
    startDate: z.string(),
    deadline: z.string(),
    assigneeId: z.string().uuid().nullable(),
    archived: z.boolean(),
    createdBy: z.string().uuid(),
    createdAt: z.string(),
    updatedAt: z.string(),
    version: z.number().int().nonnegative(),
  })
  .superRefine((t, ctx) => {
    for (const key of ['startDate', 'deadline'] as const) {
      const d = t[key];
      const parsed = new Date(d + 'T12:00:00Z');
      if (
        d &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(d) ||
          !Number.isFinite(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== d)
      )
        ctx.addIssue({ code: 'custom', path: [key], message: 'Ugyldig dato' });
    }
    if (t.startDate && t.deadline && t.deadline < t.startDate)
      ctx.addIssue({
        code: 'custom',
        path: ['deadline'],
        message: 'Deadline skal ligge efter startdatoen',
      });
  });
export type Task = z.infer<typeof taskSchema>;
export type NamedEntity = {
  id: string;
  householdId: string;
  name: string;
  independent: boolean;
  version: number;
  updatedAt: string;
};
export type Member = { userId: string; name: string; role: 'owner' | 'member' };
export type Context = { userId: string; householdId: string; name: string; local: boolean };
export type Command = {
  id: string;
  entity: 'task' | 'location' | 'category';
  entityId: string;
  baseVersion: number;
  payload: Task | NamedEntity;
  createdAt: string;
};
export type Conflict = {
  id: string;
  command: Command;
  server: Task | NamedEntity | null;
  reason: string;
};
export const priorityLabels = { high: 'Høj', medium: 'Mellem', low: 'Lav' };
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function isOverdue(task: Task, date = today()) {
  return !task.archived && !!task.deadline && task.deadline < date;
}
export function matchesLocation(task: Task, selected: string, locations: NamedEntity[]) {
  return (
    selected === 'all' ||
    task.locationIds.includes(selected) ||
    locations.some((l) => l.independent && task.locationIds.includes(l.id))
  );
}
export function duration(n: number) {
  return n >= 60 ? `${Math.floor(n / 60)} t.${n % 60 ? ` ${n % 60} min.` : ''}` : `${n} min.`;
}
