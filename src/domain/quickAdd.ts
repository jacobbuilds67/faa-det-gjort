import type { Context, NamedEntity, Task } from './model';
import { allMonths, householdDate, type Recurrence } from './recurrence';

export type QuickAddResult = {
  task: Task;
  detected: string[];
  warnings: string[];
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseQuickTask(
  input: string,
  ctx: Context,
  locations: NamedEntity[],
  categories: NamedEntity[],
  now = Date.now(),
): QuickAddResult {
  let title = input.trim();
  const detected: string[] = [];
  const warnings: string[] = [];
  const remove = (match: string) => {
    title = title.replace(match, ' ');
  };

  let estimate = 30;
  const duration = title.match(/\b(\d{1,4})\s*(min(?:ut(?:ter)?)?\.?|timer?|t(?:ime)?r?)\b/i);
  if (duration) {
    const amount = Number(duration[1]);
    const hours = /^t(?!.*min)/i.test(duration[2]);
    estimate = amount * (hours ? 60 : 1);
    if (estimate < 1 || estimate > 10080) {
      estimate = 30;
      warnings.push('Tidsangivelsen ligger uden for det tilladte interval. Kontrollér estimatet.');
    } else {
      detected.push(`${estimate} minutter`);
      remove(duration[0]);
    }
  } else {
    warnings.push('Ingen sikker varighed fundet. Standard er 30 minutter.');
  }

  let recurrence: Recurrence | null = null;
  const recurrenceMatch = title.match(/\b(?:hver|hvert)\s+(dag|uge|måned|år)\b|\b(dagligt|ugentligt|månedligt|årligt)\b/i);
  if (recurrenceMatch) {
    const word = (recurrenceMatch[1] || recurrenceMatch[2]).toLocaleLowerCase('da');
    const unit: Extract<Recurrence, { kind: 'interval' }>['unit'] = word.startsWith('dag')
      ? 'day'
      : word.startsWith('uge')
        ? 'week'
        : word.startsWith('måned')
          ? 'month'
          : 'year';
    recurrence = {
      kind: 'interval',
      mode: 'calendar',
      unit,
      every: 1,
      anchor: householdDate(now),
      months: allMonths,
    };
    detected.push(`Gentages ${word}`);
    remove(recurrenceMatch[0]);
  }

  const findNamed = (values: NamedEntity[]) =>
    [...values]
      .sort((a, b) => b.name.length - a.name.length)
      .find((value) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(value.name)}([^\\p{L}]|$)`, 'iu').test(title));
  const location = findNamed(locations);
  const fallbackLocation =
    locations.find((value) => value.name.toLocaleLowerCase('da') === 'hjemme') ?? locations[0];
  if (location) {
    detected.push(`Lokation: ${location.name}`);
    title = title.replace(new RegExp(`\\b${escapeRegExp(location.name)}\\b`, 'iu'), ' ');
  } else {
    warnings.push('Ingen sikker lokation fundet. Kontrollér lokationen i formularen.');
  }
  const category = findNamed(categories);
  if (category) {
    detected.push(`Kategori: ${category.name}`);
    title = title.replace(new RegExp(`\\b${escapeRegExp(category.name)}\\b`, 'iu'), ' ');
  }

  let priority: Task['priority'] = 'medium';
  const priorityMatch = title.match(/\b(høj|mellem|lav)\s+prioritet\b/i);
  if (priorityMatch) {
    priority = priorityMatch[1].toLocaleLowerCase('da') === 'høj' ? 'high' : priorityMatch[1].toLocaleLowerCase('da') === 'lav' ? 'low' : 'medium';
    detected.push(`${priorityMatch[1]} prioritet`);
    remove(priorityMatch[0]);
  }

  title = title
    .replace(/\s*,\s*/g, ' ')
    .replace(/[.;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) warnings.push('Der mangler en titel. Skriv den i formularen.');
  const at = new Date(now).toISOString();
  return {
    task: {
      id: crypto.randomUUID(),
      householdId: ctx.householdId,
      title,
      description: '',
      estimate,
      priority,
      locationIds: (location ?? fallbackLocation) ? [(location ?? fallbackLocation)!.id] : [],
      categoryId: category?.id ?? null,
      projectId: null,
      dependencyIds: [],
      startDate: '',
      deadline: '',
      recurrence,
      assigneeId: null,
      archived: false,
      createdBy: ctx.userId,
      createdAt: at,
      updatedAt: at,
      version: 0,
    },
    detected,
    warnings,
  };
}
