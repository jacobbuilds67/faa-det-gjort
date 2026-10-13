import { remainingMinutes, type WorkState, type QueueState } from '../domain/work';
import {
  Leaf,
  MapPin,
  Check,
  ArrowRight,
  Search,
  SlidersHorizontal,
  Archive,
  Plus,
  ListMusic,
} from 'lucide-react';
import type { Task, NamedEntity, Context } from '../domain/model';
import type { Suggestion } from '../domain/suggestions';
import { TaskCard } from '../components/TaskCard';
type Props = {
  works: WorkState[];
  queue: QueueState;
  onStart: (id: string) => void;
  onAdd: (id: string) => void;
  page: 'today' | 'tasks';
  ctx: Context;
  tasks: Task[];
  locations: NamedEntity[];
  categories: NamedEntity[];
  location: string;
  changeLocation: (id: string) => void;
  minutes: number;
  setMinutes: (n: number) => void;
  visible: Task[];
  suggestions: Suggestion[];
  query: string;
  setQuery: (s: string) => void;
  priority: string;
  setPriority: (s: string) => void;
  archived: boolean;
  setArchived: (b: boolean) => void;
  ready: boolean;
  openTasks: Task[];
  overdue: number;
  go: (p: 'tasks' | 'queue') => void;
  setEditor: (t: Task | 'new') => void;
  handleSave: (t: Task) => Promise<void>;
  setError: (s: string) => void;
  onExamples: () => void;
};
export function TaskOverview({
  works,
  queue,
  onStart,
  onAdd,
  page,
  ctx,
  tasks,
  locations,
  categories,
  location,
  changeLocation,
  minutes,
  setMinutes,
  visible,
  suggestions,
  query,
  setQuery,
  priority,
  setPriority,
  archived,
  setArchived,
  ready,
  openTasks,
  overdue,
  go,
  setEditor,
  handleSave,
  setError,
  onExamples,
}: Props) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">
            {page === 'today'
              ? new Intl.DateTimeFormat('da', { weekday: 'long', day: 'numeric', month: 'long' })
                  .format(new Date())
                  .toUpperCase()
              : 'ET STED TIL DET HELE'}
          </p>
          <h1>{page === 'today' ? 'Gør lidt. Få ro.' : 'Dine opgaver'}</h1>
          <p className="muted">
            {page === 'today'
              ? 'Du behøver ikke nå det hele. Bare det, der passer til i dag.'
              : 'Små gøremål og gode intentioner. Samlet på ét sted.'}
          </p>
        </div>
        <label className="location-select">
          <MapPin size={17} />
          <select
            aria-label="Valgt lokation"
            value={location}
            onChange={(e) => changeLocation(e.target.value)}
          >
            <option value="all">Alle lokationer</option>
            {locations
              .filter((l) => !l.independent)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </label>
      </section>
      {page === 'today' && (
        <section className="time-hero">
          <div className="hero-content">
            <div className="hero-eyebrow">
              <span /> LIDT TID KAN GØRE EN FORSKEL
            </div>
            <h2>Hvor meget tid har du?</h2>
            <p>Find en opgave, der passer ind i din dag.</p>
            <div className="time-options">
              {[15, 30, 45, 60, 120].map((n) => (
                <button
                  key={n}
                  className={minutes === n ? 'time-option chosen' : 'time-option'}
                  aria-pressed={minutes === n}
                  onClick={() => setMinutes(n)}
                >
                  {n >= 60 ? n / 60 : n}
                  <span>{n >= 60 ? (n === 60 ? 'time' : 'timer') : 'min.'}</span>
                  {minutes === n && <Check size={13} />}
                </button>
              ))}
              <label className="custom-time">
                <input
                  type="number"
                  min="1"
                  max="10080"
                  aria-label="Valgfri tid i minutter"
                  value={[15, 30, 45, 60, 120].includes(minutes) ? '' : minutes}
                  onChange={(e) => {
                    if (Number(e.target.value) > 0) setMinutes(Number(e.target.value));
                  }}
                  placeholder="Anden"
                />
                <span>minutter</span>
              </label>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="plant-stem" />
            <div className="plant-leaf leaf-one" />
            <div className="plant-leaf leaf-two" />
            <div className="plant-leaf leaf-three" />
            <div className="plant-leaf leaf-four" />
            <div className="plant-pot" />
            <span className="art-spark">✧</span>
          </div>
        </section>
      )}
      <div className={page === 'today' ? 'content-grid' : 'task-register'}>
        <section className="tasks-section">
          <div className="section-heading">
            <div>
              <h2>
                {page === 'today' ? 'Plads til lidt fremdrift' : 'Opgaveregister'}{' '}
                <span className="count">{visible.length}</span>
              </h2>
              <p className="muted small">
                {page === 'today'
                  ? `Prioriteret til dine ${minutes} minutter. Du vælger selv.`
                  : 'Find, rediger og hold styr på det, der venter.'}
              </p>
            </div>
            {page === 'today' && (
              <button className="text-button" onClick={() => go('tasks')}>
                Se alle <ArrowRight size={16} />
              </button>
            )}
          </div>
          {page === 'tasks' && (
            <div className="filters">
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="Søg i opgaver"
                  placeholder="Find en opgave …"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="filter-priority">
                <SlidersHorizontal size={16} />
                <select
                  aria-label="Prioritet"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="all">Alle prioriteter</option>
                  <option value="high">Høj</option>
                  <option value="medium">Mellem</option>
                  <option value="low">Lav</option>
                </select>
              </label>
              <button
                className={`button secondary archive-toggle ${archived ? 'selected' : ''}`}
                aria-pressed={archived}
                onClick={() => setArchived(!archived)}
              >
                <Archive size={16} />
                Arkiv
              </button>
            </div>
          )}
          {!ready ? (
            <p className="muted">Henter dine opgaver …</p>
          ) : visible.length ? (
            <div className="task-list">
              {visible.slice(0, page === 'today' ? 5 : undefined).map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  work={works.find((w) => w.taskId === t.id)}
                  queued={queue.items.includes(t.id)}
                  waitingFor={(t.dependencyIds ?? []).map((id) => tasks.find((candidate) => candidate.id === id)).filter((candidate) => candidate && works.find((work) => work.taskId === candidate.id)?.status !== 'completed').map((candidate) => candidate!.title)}
                  onStart={() => onStart(t.id)}
                  onAdd={() => onAdd(t.id)}
                  suggestion={
                    page === 'today' ? suggestions.find((s) => s.task.id === t.id) : undefined
                  }
                  locations={locations}
                  categories={categories}
                  onEdit={() => setEditor(t)}
                  onRestore={() =>
                    void handleSave({ ...t, archived: false }).catch((e) => setError(String(e)))
                  }
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-symbol">
                <Leaf size={30} />
              </span>
              <h3>{tasks.length ? 'Her er der luft.' : 'Hvad vil du have fra hånden?'}</h3>
              <p>
                {tasks.length
                  ? 'Ingen opgaver passer til dine filtre. Prøv mere tid eller en anden lokation.'
                  : 'Skriv din første opgave ned. Så slipper du for at huske den.'}
              </p>
              <button
                className="button secondary"
                onClick={() => setEditor('new')}
                disabled={!locations.length}
              >
                <Plus size={17} />
                Opret en opgave
              </button>
              {ctx.local && !tasks.length && (
                <button className="text-button example-button" onClick={onExamples}>
                  Eller prøv med eksempelopgaver <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
          {page === 'today' && (
            <>
              <details className="suggestion-help">
                <summary>Sådan vælges dine forslag</summary>
                <p>
                  Vi tager hensyn til din lokation, ledige tid og opgavens startdato. Høj prioritet
                  og deadlines løfter en opgave frem, og vi ser på, hvor godt den passer til tiden.
                  Du bestemmer altid selv. Din valgte prioritet bliver ikke ændret.
                </p>
              </details>
              <div className="gentle-note">
                <Leaf size={16} />
                <span>En lille ting mindre at tænke på er også en god start.</span>
              </div>
            </>
          )}
        </section>
        {page === 'today' && (
          <aside className="right-column">
            <section className="queue-preview">
              <div className="section-heading">
                <h2>
                  <ListMusic size={20} /> Din næste stund
                </h2>
              </div>
              <div className="queue-lines" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h3>
                {queue.items.length
                  ? `Min kø · ${queue.items.length} opgaver`
                  : 'En ting ad gangen.'}
              </h3>
              {queue.items.length > 0 && (
                <p className="muted">
                  {Math.ceil(
                    queue.items.reduce((sum, id) => {
                      const t = tasks.find((t) => t.id === id);
                      return (
                        sum +
                        (t
                          ? remainingMinutes(
                              t,
                              works.find((w) => w.taskId === id),
                            )
                          : 0)
                      );
                    }, 0),
                  )}{' '}
                  min. i alt
                  <br />
                  Næste: {tasks.find((t) => t.id === queue.items[0])?.title}
                </p>
              )}
              <p className="muted">
                {queue.items.length
                  ? `${queue.items.length} opgaver venter i din personlige kø.`
                  : 'Saml opgaver i din egen kø og tag dem i dit tempo.'}
              </p>
              <button className="button secondary" onClick={() => go('queue')}>
                Åbn min kø <ArrowRight size={16} />
              </button>
            </section>
            <section className="overview-card">
              <p className="eyebrow">LIGE NU</p>
              <div>
                <span>Opgaver i dit overblik</span>
                <strong>{openTasks.length}</strong>
              </div>
              <div>
                <span>Overskredet deadline</span>
                <strong className={overdue ? 'terracotta' : ''}>{overdue}</strong>
              </div>
              <p>Intet forsvinder, fordi tiden går.</p>
            </section>
          </aside>
        )}
      </div>
    </>
  );
}
