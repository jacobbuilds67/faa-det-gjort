import { RecurrenceEditor } from './RecurrenceEditor';
import { useRef, useEffect, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { Task, NamedEntity, Member, Context, Project } from '../domain/model';
import { priorityLabels } from '../domain/model';
export function TaskEditor({
  task,
  draft,
  locations,
  categories,
  members,
  projects,
  tasks,
  initialProjectId,
  ctx,
  onSave,
  onClose,
  onArchive,
}: {
  task?: Task;
  draft?: Task;
  locations: NamedEntity[];
  categories: NamedEntity[];
  members: Member[];
  projects: Project[];
  tasks: Task[];
  initialProjectId?: string | null;
  ctx: Context;
  onSave: (t: Task) => Promise<void>;
  onClose: () => void;
  onArchive?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState<Task>(
    () =>
      task ?? draft ?? {
        id: crypto.randomUUID(),
        householdId: ctx.householdId,
        title: '',
        description: '',
        estimate: 30,
        priority: 'medium',
        locationIds: locations
          .filter((l) => l.name === 'Hjemme')
          .slice(0, 1)
          .map((l) => l.id),
        categoryId: null,
        projectId: initialProjectId ?? null,
        dependencyIds: [],
        startDate: '',
        deadline: '',
        assigneeId: null,
        archived: false,
        createdBy: ctx.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 0,
      },
  );
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const set = <K extends keyof Task>(key: K, v: Task[K]) =>
    setValue((old) => ({ ...old, [key]: v }));
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="editor-title" className="editor">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setBusy(true);
          try {
            await onSave(value);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Opgaven kunne ikke gemmes.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <header>
          <div>
            <p className="eyebrow">LIDT MERE OVERBLIK</p>
            <h2 id="editor-title">{task ? 'Rediger opgave' : draft ? 'Gennemse den fortolkede opgave' : 'Hvad vil du have gjort?'}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Luk" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        <label>
          Opgavens titel
          <input
            autoFocus
            required
            maxLength={160}
            value={value.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Fx vaske bilen"
          />
        </label>
        <fieldset>
          <legend>Hvor lang tid tager det?</legend>
          <div className="chips">
            {[15, 30, 45, 60, 90, 120].map((n) => (
              <button
                key={n}
                type="button"
                className={value.estimate === n ? 'chip selected' : 'chip'}
                onClick={() => set('estimate', n)}
              >
                {n} min.
              </button>
            ))}
          </div>
          <label className="inline-field">
            Eller vælg antal minutter
            <input
              type="number"
              required
              min="1"
              max="10080"
              value={value.estimate || ''}
              onChange={(e) => set('estimate', Number(e.target.value))}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>
            Hvor kan det gøres? <span>Vælg gerne flere</span>
          </legend>
          <div className="location-checks">
            {locations.map((l) => (
              <label key={l.id}>
                <input
                  type="checkbox"
                  checked={value.locationIds.includes(l.id)}
                  onChange={(e) =>
                    set(
                      'locationIds',
                      e.target.checked
                        ? [...value.locationIds, l.id]
                        : value.locationIds.filter((id) => id !== l.id),
                    )
                  }
                />
                {l.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <label>
            Prioritet
            <select
              value={value.priority}
              onChange={(e) => set('priority', e.target.value as Task['priority'])}
            >
              {Object.entries(priorityLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kategori
            <select
              value={value.categoryId ?? ''}
              onChange={(e) => set('categoryId', e.target.value || null)}
            >
              <option value="">Uden kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <RecurrenceEditor value={value.recurrence} onChange={(v) => set('recurrence', v)} />
        <details open={!!task?.description || !!task?.deadline || !!task?.startDate || !!value.projectId || !!value.dependencyIds?.length}>
          <summary>
            Flere detaljer <ChevronDown size={16} />
          </summary>
          <label>
            Beskrivelse
            <textarea
              rows={3}
              maxLength={5000}
              value={value.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Det, der er godt at huske …"
            />
          </label>
          {value.recurrence && (
            <p className="muted small">Gentagelsens regel bestemmer datoerne for hver forekomst.</p>
          )}
          <div className="form-grid">
            <label>
              Tidligst relevant
              <input
                type="date"
                disabled={!!value.recurrence}
                value={value.startDate}
                onChange={(e) => set('startDate', e.target.value)}
              />
            </label>
            <label>
              Deadline
              <input
                type="date"
                min={value.startDate || undefined}
                disabled={!!value.recurrence}
                value={value.deadline}
                onChange={(e) => set('deadline', e.target.value)}
              />
            </label>
          </div>
          <label>
            Ansvarlig
            <select
              value={value.assigneeId ?? ''}
              onChange={(e) => set('assigneeId', e.target.value || null)}
            >
              <option value="">Ingen bestemt</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Projekt
            <select value={value.projectId ?? ''} onChange={(e) => set('projectId', e.target.value || null)}>
              <option value="">Uden projekt</option>
              {projects.filter((project) => !project.archived || project.id === value.projectId).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <fieldset className="dependency-editor">
            <legend>Skal vente på</legend>
            <p className="muted small">Opgaven bliver først klar, når de valgte opgaver er afsluttet.</p>
            <div className="dependency-list">
              {tasks.filter((candidate) => candidate.id !== value.id && !candidate.archived).map((candidate) => (
                <label key={candidate.id}>
                  <input type="checkbox" checked={(value.dependencyIds ?? []).includes(candidate.id)} onChange={(e) => set('dependencyIds', e.target.checked ? [...(value.dependencyIds ?? []), candidate.id] : (value.dependencyIds ?? []).filter((id) => id !== candidate.id))}/>
                  <span>{candidate.title}<small>{projects.find((project) => project.id === candidate.projectId)?.name ?? 'Uden projekt'}</small></span>
                </label>
              ))}
              {!tasks.some((candidate) => candidate.id !== value.id && !candidate.archived) && <span className="muted small">Der er ingen andre opgaver at vælge endnu.</span>}
            </div>
          </fieldset>
        </details>
        {error && (
          <p className="error" role="alert">
            {error.startsWith('[')
              ? 'Kontrollér felterne. Vælg mindst én lokation og et gyldigt tidsestimat.'
              : error}
          </p>
        )}
        <footer>
          {task && !task.archived && (
            <button type="button" className="text-button archive-link" onClick={onArchive}>
              Arkivér
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Annuller
          </button>
          <button disabled={busy} className="button primary">
            {busy ? 'Gemmer …' : task ? 'Gem ændringer' : draft ? 'Godkend og opret' : 'Opret opgave'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
