import { useEffect, useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Leaf,
  Sun,
  LayoutList,
  ListMusic,
  Layers,
  Settings as SettingsIcon,
  Plus,
  ArrowRight,
  CloudOff,
  Cloud,
  Check,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { AppDB, initialize } from '../data/db';
import { saveTask, addExamples } from '../data/repository';
import { synchronize } from '../data/sync';
import { suggestTasks } from '../domain/suggestions';
import {
  today,
  matchesLocation,
  isOverdue,
  type Context,
  type Member,
  type Task,
} from '../domain/model';
import { TaskEditor } from '../components/TaskEditor';
import { TaskOverview } from './TaskOverview';
import { Settings } from '../components/Settings';
type Page = 'today' | 'tasks' | 'queue' | 'projects' | 'settings';
const nav = [
  { id: 'today', label: 'I dag', icon: Sun },
  { id: 'tasks', label: 'Opgaver', icon: LayoutList },
  { id: 'queue', label: 'Min kø', icon: ListMusic },
  { id: 'projects', label: 'Projekter', icon: Layers },
  { id: 'settings', label: 'Indstillinger', icon: SettingsIcon },
] as const;
export function Workspace({
  ctx,
  members,
  onExit,
}: {
  ctx: Context;
  members: Member[];
  onExit: () => Promise<void>;
}) {
  const db = useMemo(
    () => new AppDB(`${ctx.userId}-${ctx.householdId}`),
    [ctx.userId, ctx.householdId],
  );
  const [page, setPage] = useState<Page>('today'),
    [ready, setReady] = useState(false),
    [editor, setEditor] = useState<Task | 'new' | null>(null),
    [query, setQuery] = useState(''),
    [location, setLocation] = useState('all'),
    [minutes, setMinutes] = useState(30),
    [priority, setPriority] = useState('all'),
    [archived, setArchived] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [online, setOnline] = useState(navigator.onLine),
    [syncing, setSyncing] = useState(false),
    [mobileMenu, setMobileMenu] = useState(false);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [],
    locations = useLiveQuery(() => db.locations.toArray(), [db]) ?? [],
    categories = useLiveQuery(() => db.categories.toArray(), [db]) ?? [],
    pending = useLiveQuery(() => db.outbox.count(), [db]) ?? 0,
    conflicts = useLiveQuery(() => db.conflicts.toArray(), [db]) ?? [];
  const sync = useCallback(async () => {
    if (ctx.local) return;
    setSyncing(true);
    try {
      await synchronize(db, ctx.householdId);
      setError('');
    } catch (e) {
      setError(
        `Ændringerne er gemt lokalt. Synkronisering: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSyncing(false);
    }
  }, [db, ctx.local, ctx.householdId]);
  useEffect(() => {
    let active = true;
    initialize(db, ctx)
      .then(async () => {
        const p = await db.preferences.get('location');
        if (active) {
          setLocation(p?.value ?? 'all');
          setReady(true);
          void sync();
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      active = false;
      db.close();
    };
  }, [db, ctx, sync]);
  useEffect(() => {
    const connect = () => {
        setOnline(navigator.onLine);
        if (navigator.onLine) void sync();
      },
      focus = () => {
        if (document.visibilityState === 'visible') void sync();
      };
    window.addEventListener('online', connect);
    window.addEventListener('offline', connect);
    document.addEventListener('visibilitychange', focus);
    const interval = setInterval(() => void sync(), 20000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', connect);
      window.removeEventListener('offline', connect);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [sync]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  const changeLocation = (id: string) => {
    setLocation(id);
    void db.preferences.put({ key: 'location', value: id }).catch((e) => setError(String(e)));
  };
  const openTasks = tasks.filter((t) => !t.archived),
    overdue = openTasks.filter((t) => isOverdue(t)).length;
  const suggestions = suggestTasks({
    tasks,
    locations,
    locationId: location,
    availableMinutes: minutes,
    asOfDate: today(),
  });
  const visible =
    page === 'today'
      ? suggestions.map((s) => s.task)
      : tasks
          .filter(
            (t) =>
              t.archived === archived &&
              matchesLocation(t, location, locations) &&
              t.title.toLocaleLowerCase('da').includes(query.toLocaleLowerCase('da')) &&
              (priority === 'all' || t.priority === priority),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const go = (p: Page) => {
    setPage(p);
    setQuery('');
    setPriority('all');
    setMobileMenu(false);
  };
  const handleSave = async (t: Task) => {
    await saveTask(db, ctx, t);
    setNotice('Opgaven er gemt');
    void sync();
  };
  const exit = async () => {
    try {
      await onExit();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Spring til indhold
      </a>
      <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            go('today');
          }}
        >
          <span className="brand-mark">
            <Leaf size={23} />
          </span>
          hverdagsro<span className="brand-dot">.</span>
        </a>
        <button
          className="icon-button mobile-close"
          aria-label="Luk menu"
          onClick={() => setMobileMenu(false)}
        >
          <X />
        </button>
        <div className="household-label">
          <span className="avatar">
            <HouseIcon />
          </span>
          <div>
            {ctx.name}
            <small>{ctx.local ? 'Dit lokale rum' : `${members.length} i husstanden`}</small>
          </div>
        </div>
        <p className="nav-label">DIT OVERBLIK</p>
        <nav aria-label="Hovednavigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? 'nav-item active' : 'nav-item'}
              onClick={() => go(id)}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === 'tasks' && <small>{openTasks.length}</small>}
              {(id === 'queue' || id === 'projects') && (
                <span className="soon-dot" title="Kommer i næste fase" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="seed">
            <Leaf size={24} />
          </span>
          <p>
            Små skridt.
            <br />
            Mere overskud.
          </p>
          <small>Der er også en dag i morgen.</small>
        </div>
        <button className="profile" onClick={() => go('settings')}>
          <span className="avatar profile-avatar">
            {ctx.local
              ? 'D'
              : (members.find((m) => m.userId === ctx.userId)?.name ?? 'D')[0].toUpperCase()}
          </span>
          <span>
            {ctx.local ? 'Din hverdag' : members.find((m) => m.userId === ctx.userId)?.name}
            <small>{ctx.local ? 'Lokal afprøvning' : 'Min konto'}</small>
          </span>
          <ChevronRight size={16} />
        </button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Åbn menu"
              onClick={() => setMobileMenu(true)}
            >
              <Menu />
            </button>
            <span>Mit overblik</span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="sync-status">
              {ctx.local || !online ? <CloudOff size={15} /> : <Cloud size={15} />}
              <span>
                {ctx.local
                  ? 'Gemt på denne enhed'
                  : !online
                    ? 'Offline'
                    : syncing
                      ? 'Synkroniserer …'
                      : pending
                        ? `${pending} afventer`
                        : 'Forbundet'}
              </span>
            </span>
            <button
              className="button primary compact"
              onClick={() => setEditor('new')}
              disabled={!ready || !locations.length}
            >
              <Plus size={18} />
              <span>Ny opgave</span>
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {error && (
            <div className="error banner" role="alert">
              {error}
              <button className="text-button" onClick={() => setError('')}>
                Luk
              </button>
            </div>
          )}
          {conflicts.length > 0 && (
            <button className="conflict-banner" onClick={() => go('settings')}>
              {conflicts.length} ændring(er) kræver dit valg. Åbn konflikter →
            </button>
          )}
          {page === 'settings' ? (
            <Settings
              db={db}
              ctx={ctx}
              locations={locations}
              categories={categories}
              members={members}
              conflicts={conflicts}
              onExit={exit}
              onSync={() => void sync()}
            />
          ) : page === 'queue' || page === 'projects' ? (
            <section className="coming-page">
              <span className="empty-symbol">
                {page === 'queue' ? <ListMusic size={38} /> : <Layers size={38} />}
              </span>
              <p className="eyebrow">NÆSTE KAPITEL</p>
              <h1>
                {page === 'queue'
                  ? 'Din kø får snart sin plads.'
                  : 'Fra små opgaver til større projekter.'}
              </h1>
              <p>
                {page === 'queue'
                  ? 'Den personlige kø og timeren bygges i fase 4. Indtil da kan du samle og organisere opgaverne.'
                  : 'Projektforløb og afhængigheder bygges i fase 6. Opgaveregisteret er klar allerede nu.'}
              </p>
              <button className="button primary" onClick={() => go('tasks')}>
                Se dine opgaver <ArrowRight size={17} />
              </button>
            </section>
          ) : (
            <>
              <TaskOverview
                page={page}
                ctx={ctx}
                tasks={tasks}
                locations={locations}
                categories={categories}
                location={location}
                changeLocation={changeLocation}
                minutes={minutes}
                setMinutes={setMinutes}
                visible={visible}
                suggestions={suggestions}
                query={query}
                setQuery={setQuery}
                priority={priority}
                setPriority={setPriority}
                archived={archived}
                setArchived={setArchived}
                ready={ready}
                openTasks={openTasks}
                overdue={overdue}
                go={go}
                setEditor={setEditor}
                handleSave={handleSave}
                setError={setError}
                onExamples={() =>
                  void addExamples(db, ctx)
                    .then(() => setNotice('Fem eksempelopgaver er tilføjet'))
                    .catch((e) => setError(String(e)))
                }
              />
            </>
          )}
          <footer className="page-footer">
            <span className="jm-brand"><img src="/jm-microapps-logo.png" alt="JM MicroApps" width="1536" height="1024" /></span>
            <span>Lidt ad gangen er også fremad.</span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobilnavigation">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => go(id)}
            className={page === id ? 'active' : ''}
            aria-current={page === id ? 'page' : undefined}
          >
            <Icon size={21} />
            <span>{id === 'settings' ? 'Mere' : label}</span>
          </button>
        ))}
      </nav>
      {editor && (
        <TaskEditor
          task={editor === 'new' ? undefined : editor}
          locations={locations}
          categories={categories}
          members={members}
          ctx={ctx}
          onSave={handleSave}
          onClose={() => setEditor(null)}
          onArchive={() => {
            if (editor !== 'new') {
              const t = editor;
              void handleSave({ ...t, archived: true })
                .then(() => setEditor(null))
                .catch((e) => setError(String(e)));
            }
          }}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
    </div>
  );
}
function HouseIcon() {
  return <Leaf size={18} />;
}
