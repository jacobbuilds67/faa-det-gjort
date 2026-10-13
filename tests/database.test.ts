import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { firstPeriod, nextPeriod, allMonths, type Recurrence } from '../src/domain/recurrence';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
let pg: PGlite;
let home: string;
let foreignHome: string;
let location: string;
let otherLocation: string;
let legacyTask: string;
const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  eve = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
async function user(id: string) {
  await pg.query("select set_config('test.uid',$1,false)", [id]);
}
async function rpc(name: string, args: unknown[] = [], types: string[] = []) {
  return (
    await pg.query<{ v: any }>(
      `select public.${name}(${args.map((_, i) => `$${i + 1}${types[i] ? `::${types[i]}` : ''}`).join(',')}) as v`,
      args,
    )
  ).rows[0].v;
}
function command(overrides: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    entity: 'task',
    entityId: id,
    baseVersion: 0,
    payload: {
      id,
      householdId: home,
      title: 'Vask bilen',
      description: '',
      estimate: 45,
      priority: 'medium',
      categoryId: null,
      assigneeId: null,
      archived: false,
      locationIds: [location],
      startDate: '',
      deadline: '',
    },
    ...overrides,
  };
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;",
  );
  await pg.exec(
    readFileSync(new URL('../supabase/migrations/001_foundation.sql', import.meta.url), 'utf8'),
  );
  await pg.exec(
    readFileSync(new URL('../supabase/migrations/002_queue_and_time.sql', import.meta.url), 'utf8'),
  );
  await pg.query('insert into auth.users values ($1,$2),($3,$4),($5,$6)', [
    alice,
    'alice@example.test',
    bob,
    'bob@example.test',
    eve,
    'eve@example.test',
  ]);
  await pg.exec('set role authenticated');
  await user(alice);
  home = await rpc('create_household', ['Vores hjem']);
  location = (await rpc('household_snapshot', [home])).locations[0].id;
  await user(eve);
  foreignHome = await rpc('create_household', ['Anden husstand']);
  otherLocation = (await rpc('household_snapshot', [foreignHome])).locations[0].id;
  await user(alice);
  const legacy = command();
  legacyTask = legacy.entityId;
  await rpc('apply_command', [home, JSON.stringify(legacy)], ['uuid', 'jsonb']);
  await rpc(
    'apply_command',
    [
      home,
      JSON.stringify({
        id: crypto.randomUUID(),
        entity: 'work',
        entityId: legacyTask,
        baseVersion: 0,
        action: 'complete',
        at: Date.now(),
        payload: { id: legacyTask, householdId: home },
      }),
    ],
    ['uuid', 'jsonb'],
  );
  await pg.exec('reset role');
  await pg.exec(
    readFileSync(new URL('../supabase/migrations/003_recurrence.sql', import.meta.url), 'utf8'),
  );
  await pg.exec(
    readFileSync(new URL('../supabase/migrations/004_projects.sql', import.meta.url), 'utf8'),
  );
  await pg.exec('set role authenticated');
});
afterAll(async () => {
  await pg?.close();
});
describe('SQL migration and household access', () => {
  it('creates default locations and normalized occurrence', async () => {
    const c = command();
    await rpc('apply_command', [home, JSON.stringify(c)], ['uuid', 'jsonb']);
    const snapshot = await rpc('household_snapshot', [home]);
    expect(snapshot.locations).toHaveLength(4);
    expect(snapshot.tasks.some((t: any) => t.id === c.entityId)).toBe(true);
    const rows = await pg.query('select * from public.task_occurrences where task_id=$1', [
      c.entityId,
    ]);
    expect(rows.rows).toHaveLength(1);
  });
  it('is idempotent when a command is retried', async () => {
    const c = command();
    const first = await rpc('apply_command', [home, JSON.stringify(c)], ['uuid', 'jsonb']);
    const second = await rpc('apply_command', [home, JSON.stringify(c)], ['uuid', 'jsonb']);
    expect(second).toEqual(first);
    expect(second.version).toBe(1);
  });
  it('preserves competing edits as a conflict', async () => {
    const c = command();
    await rpc('apply_command', [home, JSON.stringify(c)], ['uuid', 'jsonb']);
    const result = await rpc(
      'apply_command',
      [
        home,
        JSON.stringify({
          ...c,
          id: crypto.randomUUID(),
          payload: { ...c.payload, title: 'Offline ændring' },
        }),
      ],
      ['uuid', 'jsonb'],
    );
    expect(result.conflict).toBe(true);
    expect(result.current.title).toBe('Vask bilen');
    const records = await pg.query('select * from public.sync_conflicts');
    expect(records.rows.length).toBeGreaterThan(0);
  });
  it('updates a task and preserves history', async () => {
    const c = command();
    await rpc('apply_command', [home, JSON.stringify(c)], ['uuid', 'jsonb']);
    const result = await rpc(
      'apply_command',
      [
        home,
        JSON.stringify({
          ...c,
          id: crypto.randomUUID(),
          baseVersion: 1,
          payload: { ...c.payload, title: 'Vask begge biler' },
        }),
      ],
      ['uuid', 'jsonb'],
    );
    expect(result.record.title).toBe('Vask begge biler');
    expect(result.version).toBe(2);
    expect(
      (await pg.query('select * from public.task_history where task_id=$1', [c.entityId])).rows,
    ).toHaveLength(2);
  });
  it('rejects household crossing in foreign keys', async () => {
    const c = command();
    await expect(
      rpc(
        'apply_command',
        [home, JSON.stringify({ ...c, payload: { ...c.payload, locationIds: [otherLocation] } })],
        ['uuid', 'jsonb'],
      ),
    ).rejects.toThrow();
    expect(
      (await pg.query('select * from public.tasks where id=$1', [c.entityId])).rows,
    ).toHaveLength(0);
  });
  it('prevents direct table writes', async () => {
    await expect(pg.query("update public.tasks set title='Bypass'")).rejects.toThrow();
  });
  it('rejects invalid time estimates', async () => {
    const c = command();
    await expect(
      rpc(
        'apply_command',
        [home, JSON.stringify({ ...c, payload: { ...c.payload, estimate: 0 } })],
        ['uuid', 'jsonb'],
      ),
    ).rejects.toThrow();
  });
  it('does not reveal another household in snapshot or RLS reads', async () => {
    await expect(rpc('household_snapshot', [foreignHome])).rejects.toThrow();
    expect(
      (await pg.query('select * from public.locations where household_id=$1', [foreignHome])).rows,
    ).toHaveLength(0);
  });
  it('lets an invited second user join and share tasks', async () => {
    await rpc('invite_member', [home, 'bob@example.test']);
    await user(bob);
    const h = await rpc('my_household');
    expect(h.id).toBe(home);
    expect(h.members).toHaveLength(2);
    expect((await rpc('household_snapshot', [home])).tasks.length).toBeGreaterThan(0);
    await expect(rpc('invite_member', [home, 'unauthorized@example.test'])).rejects.toThrow();
    await user(alice);
  });
  it('does not expose authenticated RPCs to anonymous role', async () => {
    await pg.exec('set role anon');
    await expect(rpc('household_snapshot', [home])).rejects.toThrow();
    await pg.exec('set role authenticated');
  });
});

describe('phase 4 queue and timestamp synchronization', () => {
  it('syncs personal queues and completion, preserves audit, and rejects second completion', async () => {
    await user(alice);
    await rpc('invite_member', [home, 'bob@example.test']);
    await user(bob);
    await rpc('my_household');
    await user(alice);
    const c = command();
    await rpc('apply_command', [home, JSON.stringify(c)], ['uuid', 'jsonb']);
    const apply = (cmd: unknown) =>
      rpc('apply_command', [home, JSON.stringify(cmd)], ['uuid', 'jsonb']);
    const queue = (owner: string) => ({
      id: crypto.randomUUID(),
      entity: 'queue',
      entityId: owner,
      baseVersion: 0,
      payload: {
        id: owner,
        ownerId: owner,
        householdId: home,
        items: [c.entityId],
        budgetMinutes: 30,
      },
    });
    const qa = queue(alice);
    await apply(qa);
    await user(bob);
    await apply(queue(bob));
    expect((await rpc('household_snapshot', [home])).queues.map((q: any) => q.ownerId)).toEqual([
      bob,
    ]);
    expect((await pg.query('select * from public.task_queues')).rows).toHaveLength(1);
    await expect(apply({ ...qa, id: crypto.randomUUID() })).rejects.toThrow('personlig');
    await user(alice);
    const at = Date.now();
    const work = (action: string, baseVersion: number, value?: number, atTime = at) => ({
      id: crypto.randomUUID(),
      entity: 'work',
      entityId: c.entityId,
      baseVersion,
      action,
      at: atTime,
      value,
      payload: { id: c.entityId, householdId: home },
    });
    const start = work('start', 0);
    const first = await apply(start);
    expect(first.record.status).toBe('running');
    expect(await apply(start)).toEqual(first);
    await user(bob);
    expect((await apply(work('complete', 0))).conflict).toBe(true);
    await user(alice);
    const finish = await apply(work('complete', 1, undefined, at + 180000));
    expect(finish.record.intervals[0].stoppedAt).toBe(at + 180000);
    expect((await rpc('household_snapshot', [home])).queues[0].items).toEqual([]);
    await user(bob);
    const snap = await rpc('household_snapshot', [home]);
    expect(snap.queues[0].items).toEqual([]);
    expect(snap.works.find((w: any) => w.id === c.entityId).completedBy).toBe(alice);
    expect((await apply(work('complete', 2))).conflict).toBe(true);
    const corrected = await apply(work('correct', 2, 45, at + 200000));
    expect(corrected.record.adjustmentSeconds).toBe(2520);
    const history = await pg.query('select kind from public.task_history where task_id=$1', [
      c.entityId,
    ]);
    expect(history.rows.map((r: any) => r.kind)).toEqual([
      'created',
      'start',
      'complete',
      'correct',
    ]);
    await expect(pg.query('update public.time_entries set stopped_at=0')).rejects.toThrow();
    await expect(
      rpc('apply_registry_command', [home, JSON.stringify(command())], ['uuid', 'jsonb']),
    ).rejects.toThrow();
    await user(alice);
  });
});

it('keeps pause/resume intervals ordered even at equal timestamps and rejects a second timer', async () => {
  await user(alice);
  const c = command(),
    second = command();
  const apply = (v: unknown) => rpc('apply_command', [home, JSON.stringify(v)], ['uuid', 'jsonb']);
  await apply(c);
  await apply(second);
  const at = Date.now();
  let base = 0;
  const w = (action: string, atTime: number, value?: number, entityId = c.entityId) => ({
    id: crypto.randomUUID(),
    entity: 'work',
    entityId,
    baseVersion: base,
    action,
    at: atTime,
    value,
    payload: { id: entityId, householdId: home },
  });
  await apply(w('remaining', at, 10));
  base++;
  await apply(w('start', at));
  base++;
  const other = { ...w('start', at, undefined, second.entityId), baseVersion: 0 };
  expect((await apply(other)).conflict).toBe(true);
  await apply(w('pause', at));
  base++;
  await apply(w('start', at));
  base++;
  const paused = await apply(w('pause', at + 120000));
  base++;
  expect(paused.record.remainingMinutes).toBe(8);
  expect(paused.record.intervals).toHaveLength(2);
  expect(paused.record.intervals.every((i: any) => i.stoppedAt !== null)).toBe(true);
  const corrected = await apply(w('correct', at + 120001, 1));
  base++;
  expect(corrected.record.adjustmentSeconds).toBe(-60);
  const resumed = await apply(w('start', at + 120002));
  base++;
  expect(resumed.record.status).toBe('running');
  await apply(w('complete', at + 180002));
});

it('creates seasonal successors atomically and keeps immutable, correctable history', async () => {
  await user(alice);
  const c = command();
  (c.payload as any).recurrence = {
    kind: 'season',
    anchor: '2026-06-01',
    periods: [
      { start: '06-01', end: '06-30' },
      { start: '09-01', end: '09-30' },
    ],
  };
  const apply = (v: unknown) => rpc('apply_command', [home, JSON.stringify(v)], ['uuid', 'jsonb']);
  const created = await apply(c);
  expect(created.work.plannedStart).toBe('2026-06-01');
  expect(created.record.recurrence.kind).toBe('season');
  const nextId = crypto.randomUUID();
  const finish = {
    id: crypto.randomUUID(),
    entity: 'work',
    entityId: c.entityId,
    baseVersion: 0,
    action: 'skipOccurrence',
    occurrenceId: c.entityId,
    nextOccurrenceId: nextId,
    at: Date.parse('2026-09-15T12:00:00Z'),
    payload: { id: c.entityId, householdId: home },
  };
  const result = await apply(finish);
  expect(result.record.status).toBe('open');
  expect(result.record.occurrenceId).toBe(nextId);
  expect(result.record.plannedStart).toBe('2026-09-01');
  expect(result.history[0].status).toBe('skipped');
  expect(await apply(finish)).toEqual(result);
  expect((await apply({ ...finish, id: crypto.randomUUID(), baseVersion: 1 })).conflict).toBe(true);
  const correction = await apply({
    id: crypto.randomUUID(),
    entity: 'history',
    entityId: c.entityId,
    baseVersion: 1,
    action: 'correct',
    value: 45,
    payload: { id: c.entityId, householdId: home },
  });
  expect(correction.record.adjustmentSeconds).toBe(2700);
  const edit = {
    ...c,
    id: crypto.randomUUID(),
    baseVersion: 1,
    payload: { ...c.payload, title: 'Ny titel', recurrence: null },
  };
  await apply(edit);
  const snapshot = await rpc('household_snapshot', [home]);
  expect(snapshot.history.find((w: any) => w.id === c.entityId).taskSnapshot.title).toBe(
    'Vask bilen',
  );
  expect(snapshot.works.filter((w: any) => w.taskId === c.entityId)).toHaveLength(1);
  const rows = await pg.query('select * from public.task_occurrences where task_id=$1', [
    c.entityId,
  ]);
  expect(rows.rows).toHaveLength(2);
});

it('migrates an existing completed occurrence without losing its identity or audit', async () => {
  await user(alice);
  const snapshot = await rpc('household_snapshot', [home]);
  const h = snapshot.history.find((w: any) => w.taskId === legacyTask);
  expect(h.id).toBe(legacyTask);
  expect(h.status).toBe('completed');
  expect(h.completedBy).toBe(alice);
  expect(h.taskSnapshot.title).toBe('Vask bilen');
  expect(
    (await pg.query('select * from public.task_history where task_id=$1', [legacyTask])).rows,
  ).toHaveLength(2);
});
it('matches browser date calculations on the server for intervals, weekdays and seasons', async () => {
  await user(alice);
  const cases: Array<{ rule: Recurrence; finished: string }> = [
    {
      rule: {
        kind: 'interval',
        mode: 'calendar',
        every: 1,
        unit: 'month',
        anchor: '2025-01-31',
        months: allMonths,
      },
      finished: '2025-02-28',
    },
    {
      rule: {
        kind: 'interval',
        mode: 'calendar',
        every: 1,
        unit: 'year',
        anchor: '2024-02-29',
        months: allMonths,
      },
      finished: '2025-02-28',
    },
    {
      rule: {
        kind: 'interval',
        mode: 'completion',
        every: 7,
        unit: 'day',
        anchor: '2026-01-01',
        months: allMonths,
      },
      finished: '2026-01-28',
    },
    {
      rule: {
        kind: 'interval',
        mode: 'completion',
        every: 1,
        unit: 'week',
        anchor: '2026-10-25',
        months: [4, 5, 6, 7, 8, 9, 10],
      },
      finished: '2026-10-30',
    },
    {
      rule: {
        kind: 'weekdays',
        anchor: '2026-03-01',
        every: 2,
        days: [1, 4],
        months: [4, 5, 6, 7, 8, 9, 10],
      },
      finished: '2026-05-11',
    },
    {
      rule: {
        kind: 'season',
        anchor: '2026-06-01',
        periods: [
          { start: '06-01', end: '06-30' },
          { start: '09-01', end: '09-30' },
        ],
      },
      finished: '2027-07-01',
    },
    {
      rule: { kind: 'season', anchor: '2026-01-01', periods: [{ start: '11-01', end: '02-28' }] },
      finished: '2026-02-28',
    },
  ];
  for (const { rule, finished } of cases) {
    const c = command();
    (c.payload as any).recurrence = rule;
    const apply = (v: unknown) =>
      rpc('apply_command', [home, JSON.stringify(v)], ['uuid', 'jsonb']);
    const first = await apply(c);
    const expectedFirst = firstPeriod(rule);
    expect({ startDate: first.work.plannedStart, deadline: first.work.plannedDeadline }).toEqual(
      expectedFirst,
    );
    const result = await apply({
      id: crypto.randomUUID(),
      entity: 'work',
      entityId: c.entityId,
      baseVersion: 0,
      action: 'complete',
      occurrenceId: c.entityId,
      nextOccurrenceId: crypto.randomUUID(),
      at: Date.parse(finished + 'T12:00:00Z'),
      payload: { id: c.entityId, householdId: home },
    });
    const expected = nextPeriod(rule, expectedFirst, finished);
    expect({
      startDate: result.record.plannedStart,
      deadline: result.record.plannedDeadline,
    }).toEqual(expected.period);
    expect(result.history[0].missedPeriods).toEqual(expected.missed);
  }
});
it('does not let an old queue item or old completion attach to a successor', async () => {
  await user(alice);
  const c = command();
  (c.payload as any).recurrence = {
    kind: 'interval',
    mode: 'calendar',
    every: 7,
    unit: 'day',
    anchor: '2026-01-01',
    months: allMonths,
  };
  const apply = (v: unknown) => rpc('apply_command', [home, JSON.stringify(v)], ['uuid', 'jsonb']);
  await apply(c);
  await apply({
    id: crypto.randomUUID(),
    entity: 'work',
    entityId: c.entityId,
    baseVersion: 0,
    action: 'complete',
    occurrenceId: c.entityId,
    nextOccurrenceId: crypto.randomUUID(),
    at: Date.parse('2026-01-01T12:00:00Z'),
    payload: { id: c.entityId, householdId: home },
  });
  const snapshot = await rpc('household_snapshot', [home]);
  const q = snapshot.queues[0];
  const stale = await apply({
    id: crypto.randomUUID(),
    entity: 'queue',
    entityId: alice,
    baseVersion: q.version,
    payload: { ...q, items: [c.entityId], occurrenceIds: { [c.entityId]: c.entityId } },
  });
  expect(stale.record.items).toEqual([]);
  const wrong = await apply({
    id: crypto.randomUUID(),
    entity: 'work',
    entityId: c.entityId,
    baseVersion: 1,
    action: 'complete',
    occurrenceId: c.entityId,
    nextOccurrenceId: crypto.randomUUID(),
    at: Date.now(),
    payload: { id: c.entityId, householdId: home },
  });
  expect(wrong.conflict).toBe(true);
});

it('syncs projects, enforces dependency order, and rejects dependency cycles atomically', async () => {
  await user(alice);
  const projectId = crypto.randomUUID();
  const projectCommand = {
    id: crypto.randomUUID(), entity: 'project', entityId: projectId, baseVersion: 0,
    payload: { id: projectId, householdId: home, name: 'Male udhus', description: 'Fem rolige trin', archived: false },
  };
  const projectResult = await rpc('apply_command', [home, JSON.stringify(projectCommand)], ['uuid', 'jsonb']);
  expect(projectResult.record.name).toBe('Male udhus');
  const a = command(), b = command();
  (a.payload as any).title = 'Vask træværk';
  (a.payload as any).projectId = projectId;
  (b.payload as any).title = 'Slib træværk';
  (b.payload as any).projectId = projectId;
  (b.payload as any).dependencyIds = [a.entityId];
  await rpc('apply_command', [home, JSON.stringify(a)], ['uuid', 'jsonb']);
  await rpc('apply_command', [home, JSON.stringify(b)], ['uuid', 'jsonb']);
  const work = (entityId: string, action: string, baseVersion: number) => ({
    id: crypto.randomUUID(), entity: 'work', entityId, baseVersion, action, at: Date.now(), payload: { id: entityId, householdId: home },
  });
  expect((await rpc('apply_command', [home, JSON.stringify(work(b.entityId, 'start', 0))], ['uuid', 'jsonb'])).conflict).toBe(true);
  await rpc('apply_command', [home, JSON.stringify(work(a.entityId, 'complete', 0))], ['uuid', 'jsonb']);
  expect((await rpc('apply_command', [home, JSON.stringify(work(b.entityId, 'start', 0))], ['uuid', 'jsonb'])).record.status).toBe('running');
  const cycle = { ...a, id: crypto.randomUUID(), baseVersion: 1, payload: { ...a.payload, dependencyIds: [b.entityId] } };
  await expect(rpc('apply_command', [home, JSON.stringify(cycle)], ['uuid', 'jsonb'])).rejects.toThrow('cirkel');
  const snapshot = await rpc('household_snapshot', [home]);
  expect(snapshot.projects.some((project: any) => project.id === projectId)).toBe(true);
  expect(snapshot.tasks.find((task: any) => task.id === a.entityId).dependencyIds).toEqual([]);
  expect(snapshot.tasks.find((task: any) => task.id === b.entityId).dependencyIds).toEqual([a.entityId]);
});

it('rejects invalid recurrence rules atomically and keeps helpers private', async () => {
  await user(alice);
  for (const recurrence of [
    {
      kind: 'interval',
      mode: 'calendar',
      unit: 'day',
      every: 0,
      anchor: '2026-01-01',
      months: allMonths,
    },
    { kind: 'weekdays', anchor: '2026-01-01', every: 1, days: [], months: allMonths },
    {
      kind: 'season',
      anchor: '2026-01-01',
      periods: [
        { start: '06-01', end: '06-30' },
        { start: '06-15', end: '07-01' },
      ],
    },
  ]) {
    const c = command();
    (c.payload as any).recurrence = recurrence;
    await expect(
      rpc('apply_command', [home, JSON.stringify(c)], ['uuid', 'jsonb']),
    ).rejects.toThrow();
    expect(
      (await pg.query('select id from public.tasks where id=$1', [c.entityId])).rows,
    ).toHaveLength(0);
  }
  await expect(
    rpc(
      'recurrence_period',
      [JSON.stringify({ kind: 'season' }), null, null],
      ['jsonb', 'date', 'date'],
    ),
  ).rejects.toThrow('permission denied');
});
