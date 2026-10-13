import { useEffect, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Leaf } from 'lucide-react';
import { AppDB, localContext } from './data/db';
import { supabase } from './data/supabase';
import type { Context, Member } from './domain/model';
import { Auth, HouseholdSetup } from './components/Auth';
import { Workspace } from './features/Workspace';

function readCachedHousehold(
  key: string,
): { ctx: { householdId: string; name: string }; members: Member[] } | null {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const value = JSON.parse(cached) as {
      ctx?: { householdId?: unknown; name?: unknown };
      members?: unknown;
    };
    if (
      typeof value.ctx?.householdId !== 'string' ||
      typeof value.ctx.name !== 'string' ||
      !Array.isArray(value.members) ||
      !value.members.every(
        (member) =>
          member &&
          typeof member === 'object' &&
          typeof (member as Member).userId === 'string' &&
          typeof (member as Member).name === 'string' &&
          ['owner', 'member'].includes((member as Member).role),
      )
    ) {
      localStorage.removeItem(key);
      return null;
    }
    return {
      ctx: { householdId: value.ctx.householdId, name: value.ctx.name },
      members: value.members as Member[],
    };
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export default function App() {
  const [local, setLocal] = useState(() => localStorage.getItem('hverdagsro-mode') === 'local');
  const [session, setSession] = useState<Session | null>(null),
    [ctx, setCtx] = useState<Context | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [loading, setLoading] = useState(!!supabase),
    [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setCtx(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const loadHousehold = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true);
    setError('');
    try {
      if (!navigator.onLine) {
        const data = readCachedHousehold(`hverdagsro-household:${session.user.id}`);
        if (data) {
          setCtx({ ...data.ctx, userId: session.user.id, local: false });
          setMembers(data.members);
          return;
        }
      }
      const { data, error } = await supabase.rpc('my_household');
      if (error) throw error;
      if (data) {
        setCtx({ userId: session.user.id, householdId: data.id, name: data.name, local: false });
        setMembers(data.members);
        localStorage.setItem(
          `hverdagsro-household:${session.user.id}`,
          JSON.stringify({
            ctx: { userId: session.user.id, householdId: data.id, name: data.name, local: false },
            members: data.members,
          }),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Husstanden kunne ikke hentes.');
    } finally {
      setLoading(false);
    }
  }, [session]);
  useEffect(() => {
    if (!local) void loadHousehold();
  }, [local, loadHousehold]);
  if (local)
    return (
      <Workspace
        ctx={localContext}
        members={[{ userId: localContext.userId, name: 'Dig', role: 'owner' }]}
        onExit={async () => {
          localStorage.removeItem('hverdagsro-mode');
          setLocal(false);
        }}
      />
    );
  if (loading)
    return (
      <main className="loading">
        <Leaf size={32} />
        <p>Finder ro i hverdagen …</p>
      </main>
    );
  if (error)
    return (
      <main className="setup-page">
        <h1>Vi kunne ikke få forbindelse</h1>
        <p role="alert">{error}</p>
        <button className="button primary" onClick={() => void loadHousehold()}>
          Prøv igen
        </button>
        <button
          className="button secondary"
          onClick={() => {
            localStorage.setItem('hverdagsro-mode', 'local');
            setLocal(true);
          }}
        >
          Åbn lokal afprøvning
        </button>
      </main>
    );
  if (!session)
    return (
      <Auth
        onLocal={() => {
          localStorage.setItem('hverdagsro-mode', 'local');
          setLocal(true);
        }}
      />
    );
  if (!ctx) return <HouseholdSetup onReady={() => void loadHousehold()} />;
  return (
    <Workspace
      key={ctx.userId + ctx.householdId}
      ctx={ctx}
      members={members}
      onExit={async () => {
        const db = new AppDB(`${ctx.userId}-${ctx.householdId}`);
        if ((await db.outbox.count()) || (await db.conflicts.count())) {
          db.close();
          throw new Error('Synkroniser og løs konflikter før udlogning.');
        }
        await db.delete();
        localStorage.removeItem(`hverdagsro-household:${ctx.userId}`);
        const { error } = await supabase!.auth.signOut();
        if (error) throw error;
      }}
    />
  );
}
