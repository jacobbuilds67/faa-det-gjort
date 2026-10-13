import { z } from 'zod';
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v + 'T12:00:00Z')) &&
      new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v,
    'Ugyldig dato',
  )
  .refine((v) => v >= '1900-01-01' && v <= '9500-01-01', 'Vælg en dato mellem 1900 og 9500');
const months = z.array(z.number().int().min(1).max(12)).min(1).max(12);
const md = z
  .string()
  .regex(/^\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse('2000-' + v + 'T12:00:00Z')) &&
      new Date('2000-' + v + 'T12:00:00Z').toISOString().slice(5, 10) === v,
    'Ugyldig månedsdag',
  );
export const recurrenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('interval'),
    mode: z.enum(['calendar', 'completion']),
    unit: z.enum(['day', 'week', 'month', 'year']),
    every: z.number().int().min(1).max(365),
    anchor: date,
    months,
  }),
  z.object({
    kind: z.literal('weekdays'),
    anchor: date,
    every: z.number().int().min(1).max(52),
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    months,
  }),
  z.object({
    kind: z.literal('season'),
    anchor: date,
    periods: z
      .array(z.object({ start: md, end: md }))
      .min(1)
      .max(12),
  }),
]);
export type Recurrence = z.infer<typeof recurrenceSchema>;
export type Period = { startDate: string; deadline: string };
export const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(s + 'T12:00:00Z');
export function householdDate(at = Date.now()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));
}
export function addDays(s: string, n: number) {
  const d = day(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export function addInterval(s: string, n: number, unit: 'day' | 'week' | 'month' | 'year') {
  if (unit === 'day' || unit === 'week') return addDays(s, n * (unit === 'week' ? 7 : 1));
  const d = day(s),
    date = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n * (unit === 'year' ? 12 : 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(date, last));
  return iso(d);
}
function annual(year: number, md: string) {
  const month = Number(md.slice(0, 2)),
    date = Number(md.slice(3));
  return `${year}-${md.slice(0, 2)}-${String(Math.min(date, new Date(Date.UTC(year, month, 0)).getUTCDate())).padStart(2, '0')}`;
}
function seasons(rule: Extract<Recurrence, { kind: 'season' }>, year: number) {
  return rule.periods
    .map((p) => ({
      startDate: annual(year, p.start),
      deadline: annual(year + (p.end < p.start ? 1 : 0), p.end),
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}
export function validateRecurrence(value: unknown): Recurrence {
  const r = recurrenceSchema.parse(value);
  if (r.kind === 'season') {
    const list = [...seasons(r, 2000), ...seasons(r, 2001), ...seasons(r, 2002)].sort((a, b) =>
      a.startDate.localeCompare(b.startDate),
    );
    if (list.some((p, i) => i > 0 && p.startDate <= list[i - 1].deadline))
      throw new Error('Sæsonperioder må ikke overlappe hinanden.');
  }
  firstPeriod(r);
  return r;
}
function scheduled(
  rule: Exclude<Recurrence, { kind: 'season' }>,
  after: string,
  inclusive = false,
): Period {
  const threshold = inclusive ? addDays(after, -1) : after;
  if (rule.kind === 'interval') {
    // Always offset from the original anchor: Jan 31 -> Feb 28 -> Mar 31.
    for (let n = 0; n <= 146400; n++) {
      const candidate = addInterval(rule.anchor, n * rule.every, rule.unit);
      if (
        candidate.length !== 10 ||
        Number(candidate.slice(0, 4)) > Number(after.slice(0, 4)) + 400
      )
        break;
      if (candidate > threshold && rule.months.includes(Number(candidate.slice(5, 7))))
        return { startDate: candidate, deadline: candidate };
    }
  } else {
    const anchorDay = day(rule.anchor);
    const monday = addDays(rule.anchor, -((anchorDay.getUTCDay() + 6) % 7));
    for (
      let candidate = after < rule.anchor ? rule.anchor : after, n = 0;
      n < 146400;
      n++, candidate = addDays(candidate, 1)
    ) {
      const d = day(candidate),
        weekday = ((d.getUTCDay() + 6) % 7) + 1;
      const weeks = Math.floor((d.getTime() - day(monday).getTime()) / 604800000);
      if (
        candidate > threshold &&
        weeks % rule.every === 0 &&
        rule.days.includes(weekday) &&
        rule.months.includes(d.getUTCMonth() + 1)
      )
        return { startDate: candidate, deadline: candidate };
    }
  }
  throw new Error(
    'Gentagelsen giver ingen dato inden for 400 år. Vælg andre måneder eller et kortere interval.',
  );
}
export function firstPeriod(rule: Recurrence): Period {
  if (rule.kind === 'season') {
    for (let y = Number(rule.anchor.slice(0, 4)) - 1; y <= Number(rule.anchor.slice(0, 4)) + 1; y++)
      for (const p of seasons(rule, y)) if (p.deadline >= rule.anchor) return p;
    throw new Error('Ugyldig sæsonperiode.');
  }
  if (rule.kind === 'interval' && rule.mode === 'completion') {
    return scheduled({ ...rule, mode: 'calendar' }, rule.anchor, true);
  }
  return scheduled(rule, rule.anchor, true);
}
export function nextPeriod(
  rule: Recurrence,
  previous: Period,
  finishedDate: string,
): { period: Period; missed: Period[] } {
  if (rule.kind === 'season') {
    const missed: Period[] = [];
    const endYear =
      Math.max(
        Number(previous.startDate.slice(0, 4)),
        Number(finishedDate.slice(0, 4)),
        Number(rule.anchor.slice(0, 4)),
      ) + 1;
    for (let y = Number(previous.startDate.slice(0, 4)); y <= endYear; y++)
      for (const p of seasons(rule, y)) {
        if (p.startDate <= previous.startDate || p.deadline < rule.anchor) continue;
        if (p.deadline < finishedDate) {
          missed.push(p);
          continue;
        }
        return { period: p, missed };
      }
    throw new Error('Næste sæson kunne ikke beregnes.');
  }
  if (rule.kind === 'interval' && rule.mode === 'completion') {
    const base = finishedDate > previous.startDate ? finishedDate : previous.startDate;
    const due = addInterval(base, rule.every, rule.unit);
    const candidate = due < rule.anchor ? rule.anchor : due;
    return { period: scheduled({ ...rule, anchor: candidate }, candidate, true), missed: [] };
  }
  return {
    period: scheduled(
      rule,
      [previous.startDate, finishedDate, addDays(rule.anchor, -1)].sort().at(-1)!,
    ),
    missed: [],
  };
}
export function recurrenceLabel(rule: Recurrence) {
  if (rule.kind === 'season')
    return `${rule.periods.length} årlig${rule.periods.length === 1 ? '' : 'e'} sæson${rule.periods.length === 1 ? '' : 'er'}`;
  if (rule.kind === 'weekdays') return 'Faste ugedage';
  const units = { day: 'dag', week: 'uge', month: 'måned', year: 'år' };
  return `Hver ${rule.every}. ${units[rule.unit]}${rule.mode === 'completion' ? ' efter udførelse' : ''}`;
}
