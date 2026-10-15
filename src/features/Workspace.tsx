import { QueueView } from './QueueView';
import { InsightsView } from './InsightsView';
import { actOnWork, changeQueue, defaultQueue } from '../data/workRepository';
import { elapsedSeconds, timerLabel, type QueueState, type WorkAction } from '../domain/work';
import { useEffect, useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Leaf,
  Sun,
  LayoutList,
  ListMusic,
  Layers,
  ChartNoAxesColumnIncreasing,
  Settings as SettingsIcon,
  Plus,
  ArrowRight,
  CloudOff,
  Check,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { AppDB, initialize } from '../data/db';
import { saveTask, addExamples } from '../data/repository';
import { saveProject } from '../data/projectRepository';
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
import { ProjectsView } from './ProjectsView';
import { QuickAdd } from '../components/QuickAdd';
import { ReminderPanel } from '../components/ReminderPanel';
import { remindersFor, type ReminderKind } from '../domain/insights';
type Page = 'today' | 'tasks' | 'queue' | 'projects' | 'insights' | 'settings';
const nav = [
  { id: 'today', label: 'I dag', icon: Sun },
  { id: 'tasks', label: 'Opgaver', icon: LayoutList },
  { id: 'queue', label: 'Min kø', icon: ListMusic },
  { id: 'projects', label: 'Projekter', icon: Layers },
  { id: 'insights', label: 'Statistik', icon: ChartNoAxesColumnIncreasing },
  { id: 'settings', label: 'Indstillinger', icon: SettingsIcon },
] as const;
export function Workspace({
  ctx,
  members,
  onProfileChange,
  onMembersChange,
}: {
  ctx: Context;
  members: Member[];
  onProfileChange: (name: string) => void;
  onMembersChange: (members: Member[]) => void;
}) {
  type InstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  const db = useMemo(
    () => new AppDB(`${ctx.userId}-${ctx.householdId}`),
    [ctx.userId, ctx.householdId],
  );
  const [page, setPage] = useState<Page>('today'),
    [ready, setReady] = useState(false),
    [editor, setEditor] = useState<Task | 'new' | null>(null),
    [quickDraft, setQuickDraft] = useState<Task | null>(null),
    [initialProjectId, setInitialProjectId] = useState<string | null>(null),
    [query, setQuery] = useState(''),
    [location, setLocation] = useState('all'),
    [minutes, setMinutes] = useState(30),
    [priority, setPriority] = useState('all'),
    [archived, setArchived] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null),
    [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches),
    [mobileMenu, setMobileMenu] = useState(false);
  const storedTasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [],
    locations = useLiveQuery(() => db.locations.toArray(), [db]) ?? [],
    categories = useLiveQuery(() => db.categories.toArray(), [db]) ?? [],
    projects = useLiveQuery(() => db.projects.toArray(), [db]) ?? [];
  const preferences = useLiveQuery(() => db.preferences.toArray(), [db]) ?? [];
  const works = useLiveQuery(() => db.works.toArray(), [db]) ?? [];
  const rawQueue =
    useLiveQuery(() => db.queues.get(ctx.userId), [db, ctx.userId]) ?? defaultQueue(ctx);
  const tasks = storedTasks.map((t) => {
    const w = works.find((w) => w.taskId === t.id);
    return w
      ? {
          ...t,
          startDate: w.plannedStart ?? t.startDate,
          deadline: w.plannedDeadline ?? t.deadline,
        }
      : t;
  });
  const history = useLiveQuery(() => db.history.toArray(), [db]) ?? [];
  const preferenceEnabled = (key: string, fallback: boolean) => {
    const value = preferences.find((entry) => entry.key === key)?.value;
    return value === undefined ? fallback : value === 'true';
  };
  const reminderKinds = (['current', 'deadline', 'overdue'] as ReminderKind[]).filter((kind) =>
    preferenceEnabled(`reminder-${kind}`, true),
  );
  const reminders = remindersFor(tasks, works, reminderKinds);
  const queue = {
    ...rawQueue,
    items: rawQueue.items.filter((id) => {
      const w = works.find((w) => w.taskId === id);
      return (
        !['completed', 'skipped'].includes(w?.status ?? '') &&
        (!rawQueue.occurrenceIds?.[id] || rawQueue.occurrenceIds[id] === (w?.occurrenceId ?? id))
      );
    }),
  };
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const complete = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', complete);
    return () => {
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', complete);
    };
  }, []);
  useEffect(() => {
    let active = true;
    initialize(db, ctx)
      .then(async () => {
        const p = await db.preferences.get('location');
        if (active) {
          setLocation(p?.value ?? 'all');
          setReady(true);
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      active = false;
      db.close();
    };
  }, [db, ctx]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (
      !preferenceEnabled('reminder-system', false) ||
      !('Notification' in window) ||
      Notification.permission !== 'granted' ||
      document.visibilityState === 'visible'
    ) return;
    void (async () => {
      for (const reminder of reminders) {
        const key = `reminder-sent:${reminder.fingerprint}`;
        if (await db.preferences.get(key)) continue;
        try {
          const registration = 'serviceWorker' in navigator
            ? await navigator.serviceWorker.getRegistration()
            : undefined;
          if (registration) {
            await registration.showNotification(reminder.title, {
              body: reminder.detail,
              tag: reminder.fingerprint,
              icon: `${import.meta.env.BASE_URL}pwa-icon.svg`,
            });
          } else {
            new Notification(reminder.title, { body: reminder.detail, tag: reminder.fingerprint });
          }
          await db.preferences.put({ key, value: new Date().toISOString() });
        } catch {
          // Interne påmindelser forbliver tilgængelige, hvis platformen afviser systemvisningen.
        }
      }
    })();
  }, [db, reminders, preferences]);
  const changeLocation = (id: string) => {
    setLocation(id);
    void db.preferences.put({ key: 'location', value: id }).catch((e) => setError(String(e)));
  };
  const openTasks = tasks.filter(
      (t) => !t.archived && !works.some((w) => w.taskId === t.id && w.status === 'completed'),
    ),
    overdue = openTasks.filter((t) => isOverdue(t)).length;
  const suggestions = suggestTasks({
    tasks,
    locations,
    locationId: location,
    availableMinutes: minutes,
    asOfDate: today(),
    execution: Object.fromEntries(
      tasks.map((t) => {
        const w = works.find((value) => value.taskId === t.id);
        return [
        t.id,
        {
          status: w?.status ?? 'open',
          dependencyIds: t.dependencyIds ?? [],
          recurring: !!t.recurrence,
          recurrenceDue: !w?.plannedStart || w.plannedStart <= today(),
          spentMinutes: w ? elapsedSeconds(w, now) / 60 : 0,
          remainingOverride: w?.remainingMinutes ?? null,
          heldByOtherUser: w?.status === 'running' && w.actorId !== ctx.userId,
        },
      ] as const;
      }),
    ),
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
    if (t.archived && works.some((w) => w.taskId === t.id && w.status === 'running'))
      throw new Error('Sæt opgaven på pause før den arkiveres.');
    await saveTask(db, ctx, t);
    setNotice('Opgaven er gemt');
  };
  const handleProjectSave = async (project: import('../domain/model').Project) => {
    await saveProject(db, ctx, project);
    setNotice('Projektet er gemt');
  };
  const updateQueue = async (change: (q: QueueState) => QueueState) => {
    try {
      await changeQueue(db, ctx, change);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const action = async (id: string, act: WorkAction, value?: number, occurrenceId?: string) => {
    try {
      await actOnWork(db, ctx, id, act, value, Date.now(), occurrenceId);
      setError('');
      if (act === 'skipOccurrence')
        setNotice('Denne forekomst er sprunget over. Næste dato er beregnet.');
      if (['complete', 'skipOccurrence', 'skip'].includes(act))
        document.getElementById('main')?.focus({ preventScroll: true });
      if (act === 'complete') setNotice('Godt klaret. Den næste opgave venter, til du er klar.');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const active = works.find((w) => w.status === 'running' && w.actorId === ctx.userId);
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
          Få det Gjort<span className="brand-dot">.</span>
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
            <small>Lokalt familierum</small>
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
              {id === 'projects' && projects.filter((project) => !project.archived).length > 0 && <small>{projects.filter((project) => !project.archived).length}</small>}
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
            {(members.find((m) => m.userId === ctx.userId)?.name ?? 'D')[0].toUpperCase()}
          </span>
          <span>
            {members.find((m) => m.userId === ctx.userId)?.name ?? 'Dig'}
            <small>Min lokale profil</small>
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
              <CloudOff size={15} />
              <span>Gemt på denne enhed</span>
            </span>
            <button
              className="button primary compact"
              onClick={() => { setInitialProjectId(null); setQuickDraft(null); setEditor('new'); }}
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
          {active && page !== 'queue' && (
            <div className="active-work">
              <div>
                <strong>{tasks.find((t) => t.id === active.taskId)?.title}</strong>
                <span className="timer">{timerLabel(elapsedSeconds(active, now))}</span>
              </div>
              <button
                className="button secondary compact"
                onClick={() => void action(active.taskId, 'pause')}
              >
                Pause
              </button>
              <button className="text-button" onClick={() => go('queue')}>
                Åbn kø og timer →
              </button>
            </div>
          )}
          {page === 'settings' ? (
            <Settings
              db={db}
              ctx={ctx}
              locations={locations}
              categories={categories}
              members={members}
              installAvailable={!!installPrompt}
              installed={installed}
              onInstall={async () => {
                if (!installPrompt) return;
                await installPrompt.prompt();
                const choice = await installPrompt.userChoice;
                if (choice.outcome === 'accepted') setInstalled(true);
                setInstallPrompt(null);
              }}
              onProfileChange={onProfileChange}
              onMembersChange={onMembersChange}
            />
          ) : page === 'queue' ? (
            <QueueView
              history={history}
              members={members}
              tasks={tasks}
              works={works}
              queue={queue}
              userId={ctx.userId}
              now={now}
              onQueue={updateQueue}
              onAction={action}
            />
          ) : page === 'projects' ? (
            <ProjectsView householdId={ctx.householdId} projects={projects} tasks={tasks} works={works} onSave={handleProjectSave} onNewTask={(projectId) => { setInitialProjectId(projectId); setEditor('new'); }} onEditTask={(task) => { setInitialProjectId(null); setEditor(storedTasks.find((value) => value.id === task.id) ?? task); }}/>
          ) : page === 'insights' ? (
            <InsightsView tasks={tasks} works={works} history={history} locations={locations} categories={categories} members={members} userId={ctx.userId} onCorrect={(taskId, value, occurrenceId) => action(taskId, 'correct', value, occurrenceId)} />
          ) : (
            <>
              {page === 'today' && (
                <QuickAdd ctx={ctx} locations={locations} categories={categories} onReview={(task) => { setInitialProjectId(null); setQuickDraft(task); setEditor('new'); }}/>
              )}
              {page === 'today' && preferenceEnabled('reminder-internal', true) && (
                <ReminderPanel reminders={reminders} onOpen={(taskId) => { const task = storedTasks.find((value) => value.id === taskId); if (task) { setQuickDraft(null); setEditor(task); } }}/>
              )}
              <TaskOverview
                works={works}
                queue={queue}
                onStart={(id) => {
                  void action(id, 'start').then((ok) => {
                    if (ok) go('queue');
                  });
                }}
                onAdd={(id) => {
                  void updateQueue((q) => ({ ...q, items: [...q.items, id] }));
                }}
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
                setEditor={(t) => { setInitialProjectId(null); setQuickDraft(null); setEditor(t === 'new' ? t : (storedTasks.find((s) => s.id === t.id) ?? t)); }}
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
            <span className="jm-brand">
              <img src={`${import.meta.env.BASE_URL}jm-microapps-logo.png`} alt="JM MicroApps" width="1536" height="1024" />
            </span>
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
          draft={editor === 'new' ? quickDraft ?? undefined : undefined}
          locations={locations}
          categories={categories}
          members={members}
          projects={projects}
          tasks={storedTasks}
          initialProjectId={initialProjectId}
          ctx={ctx}
          onSave={handleSave}
          onClose={() => { setEditor(null); setQuickDraft(null); setInitialProjectId(null); }}
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
