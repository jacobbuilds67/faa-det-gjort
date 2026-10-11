import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
let pg: PGlite;
let home: string;
let foreignHome: string;
let location: string;
let otherLocation: string;
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
