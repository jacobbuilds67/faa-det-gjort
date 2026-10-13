import { useEffect, useRef, useState } from 'react';
import type { Task, Member } from '../domain/model';
import {
  elapsedSeconds,
  remainingMinutes,
  timerLabel,
  type QueueState,
  type WorkAction,
  type WorkState,
} from '../domain/work';

type Props = {
  members: Member[];
  history: WorkState[];
  tasks: Task[];
  works: WorkState[];
  queue: QueueState;
  userId: string;
  now: number;
  onQueue: (change: (q: QueueState) => QueueState) => Promise<void>;
  onAction: (
    id: string,
    action: WorkAction,
    value?: number,
    occurrenceId?: string,
  ) => Promise<boolean>;
};
export function QueueView({
  history,
  members,
  tasks,
  works,
  queue,
  userId,
  now,
  onQueue,
  onAction,
}: Props) {
  const [edit, setEdit] = useState<{
    id: string;
    action: 'correct' | 'remaining';
    value: string;
    occurrenceId?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setEditError('');
    if (edit) dialog.current?.showModal();
    else dialog.current?.close();
  }, [edit]);
  const items = queue.items
    .map((id) => tasks.find((t) => t.id === id))
    .filter(
      (t): t is Task =>
        !!t &&
        !['completed', 'skipped'].includes(works.find((w) => w.taskId === t.id)?.status ?? ''),
    );
  const total = items.reduce(
    (sum, t) =>
      sum +
      remainingMinutes(
        t,
        works.find((w) => w.taskId === t.id),
        now,
      ),
    0,
  );
  const move = (id: string, target: string) =>
    onQueue((q) => {
      const targetIndex = q.items.indexOf(target);
      const ids = q.items.filter((x) => x !== id);
      ids.splice(Math.max(0, targetIndex), 0, id);
      return { ...q, items: ids };
    });
  const shift = (id: string, delta: number) =>
    onQueue((q) => {
      const ids = [...q.items];
      const i = ids.indexOf(id),
        j = i + delta;
      if (i >= 0 && j >= 0 && j < ids.length) [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...q, items: ids };
    });
  const active = works.filter(
    (w) =>
      ['running', 'paused', 'open'].includes(w.status) &&
      !queue.items.includes(w.taskId) &&
      (w.status !== 'open' ||
        w.intervals.length > 0 ||
        w.adjustmentSeconds !== 0 ||
        w.remainingMinutes !== null),
  );
  const row = (task: Task, index?: number, historical?: WorkState) => {
    const w = historical ?? works.find((w) => w.taskId === task.id);
    const running = w?.status === 'running';
    const other = running && w.actorId !== userId;
    const done = w?.status === 'completed' || w?.status === 'skipped';
    const waitingFor = (task.dependencyIds ?? []).map((id) => tasks.find((candidate) => candidate.id === id)).filter((candidate) => candidate && works.find((work) => work.taskId === candidate.id)?.status !== 'completed').map((candidate) => candidate!.title);
    return (
      <article className="work-row" data-queue-id={task.id} key={historical?.id ?? task.id}>
        <div className="work-row-heading">
          {index !== undefined && (
            <button
              className="icon-button drag-handle"
              aria-label={`Træk ${task.title}`}
              onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
              onPointerUp={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                e.currentTarget.releasePointerCapture(e.pointerId);
                const target = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest('[data-queue-id]')
                  ?.getAttribute('data-queue-id');
                if (target && target !== task.id) void move(task.id, target);
              }}
            >
              ⠿
            </button>
          )}
          <div>
            <h3>{task.title}</h3>
            <p className="muted small">
              {done
                ? w?.status === 'skipped'
                  ? 'Sprunget over'
                  : 'Afsluttet'
                : other
                  ? 'En anden arbejder på opgaven'
                  : running
                    ? 'Timeren kører'
                    : w?.status === 'paused'
                      ? 'På pause'
                    : waitingFor.length ? `Venter på: ${waitingFor.join(', ')}` : 'Klar, når du er'}
              {task.archived ? ' · Arkiveret' : ''}
            </p>
          </div>
          <strong className="timer" aria-label={`Registreret tid for ${task.title}`}>
            {timerLabel(w ? elapsedSeconds(w, now) : 0)}
          </strong>
        </div>
        {done && w.plannedStart && (
          <p className="muted small">
            Planlagt {w.plannedStart}
            {w.plannedDeadline && w.plannedDeadline !== w.plannedStart
              ? ` – ${w.plannedDeadline}`
              : ''}{' '}
            · Estimat {task.estimate} min.
          </p>
        )}
        {done && (
          <p className="muted small">
            {w.status === 'skipped' ? 'Sprunget over af' : 'Udført af'}{' '}
            {members.find((m) => m.userId === w.completedBy)?.name ??
              (w.completedBy === userId ? 'dig' : 'et medlem')}{' '}
            · {w.completedAt ? new Date(w.completedAt).toLocaleString('da-DK') : ''}
          </p>
        )}
        {!done && (
          <p className="muted small">
            {w?.plannedStart ? `Planlagt fra ${w.plannedStart} · ` : ''}Ca.{' '}
            {Math.ceil(remainingMinutes(task, w, now))} min. tilbage
          </p>
        )}
        <div className="work-actions">
          {!done && !other && (
            <>
              <button
                className="button primary compact"
                disabled={busy || (!running && (task.archived || waitingFor.length > 0))}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onAction(task.id, running ? 'pause' : 'start');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {running ? 'Pause' : w?.status === 'paused' ? 'Fortsæt' : 'Start'}
              </button>
              <button
                className="button secondary compact"
                disabled={busy || waitingFor.length > 0}
                onClick={() => void onAction(task.id, 'complete')}
              >
                Afslut
              </button>
            </>
          )}
          {!running && (
            <button
              className="text-button"
              onClick={() =>
                setEdit({
                  id: task.id,
                  action: 'correct',
                  occurrenceId: w?.occurrenceId ?? w?.id,
                  value: String(Math.round(((w ? elapsedSeconds(w, now) : 0) / 60) * 100) / 100),
                })
              }
            >
              Ret tid
            </button>
          )}
          {!done && !running && (
            <button
              className="text-button"
              onClick={() =>
                setEdit({
                  id: task.id,
                  action: 'remaining',
                  value: String(Math.max(1, Math.ceil(remainingMinutes(task, w, now)))),
                })
              }
            >
              Ret resttid
            </button>
          )}
          {!done && task.recurrence && !other && (
            <button
              className="text-button"
              onClick={() => void onAction(task.id, 'skipOccurrence')}
            >
              Spring denne gang over
            </button>
          )}
          {index !== undefined && (
            <>
              <button
                className="icon-button"
                disabled={index === 0}
                aria-label={`Flyt ${task.title} op`}
                onClick={() => void shift(task.id, -1)}
              >
                ↑
              </button>
              <button
                className="icon-button"
                disabled={index === items.length - 1}
                aria-label={`Flyt ${task.title} ned`}
                onClick={() => void shift(task.id, 1)}
              >
                ↓
              </button>
              <button
                className="text-button"
                disabled={other}
                onClick={() => void onAction(task.id, 'skip')}
              >
                Spring over
              </button>
              <button
                className="text-button"
                onClick={() =>
                  void onQueue((q) => ({ ...q, items: q.items.filter((id) => id !== task.id) }))
                }
              >
                Fjern fra kø
              </button>
            </>
          )}
        </div>
      </article>
    );
  };
  return (
    <section className="queue-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EN TING AD GANGEN</p>
          <h1>Min kø</h1>
          <p className="muted">Din rækkefølge. Dit tempo. Du starter selv den næste opgave.</p>
        </div>
      </div>
      <div className="queue-summary">
        <label>
          Tidsramme{' '}
          <select
            aria-label="Køens tidsramme"
            value={queue.budgetMinutes}
            onChange={(e) => {
              const budgetMinutes = Number(e.target.value);
              void onQueue((q) => ({ ...q, budgetMinutes }));
            }}
          >
            {[15, 30, 45, 60, 90, 120, 180, 240].map((n) => (
              <option value={n} key={n}>
                {n} minutter
              </option>
            ))}
            {![15, 30, 45, 60, 90, 120, 180, 240].includes(queue.budgetMinutes) && (
              <option value={queue.budgetMinutes}>{queue.budgetMinutes} minutter</option>
            )}
          </select>
        </label>
        <strong>{Math.ceil(total)} min. i køen</strong>
        <span>
          {total > queue.budgetMinutes
            ? `${Math.ceil(total - queue.budgetMinutes)} min. over tidsrammen`
            : `${Math.floor(queue.budgetMinutes - total)} min. til overs`}
        </span>
      </div>
      {active.length > 0 && (
        <>
          <h2>Arbejde uden for køen</h2>
          {active
            .map((w) => tasks.find((t) => t.id === w.taskId))
            .filter((t): t is Task => !!t)
            .map((t) => row(t))}
        </>
      )}
      {items.length > 0 && (
        <p className="muted">
          Næste: <strong>{items[0].title}</strong>
        </p>
      )}
      <div className="work-list">{items.map((t, i) => row(t, i))}</div>
      {!items.length && (
        <div className="empty-state">
          <h2>Plads til din næste opgave.</h2>
          <p>Tilføj opgaver fra I dag eller Opgaver.</p>
        </div>
      )}
      {history.length > 0 && (
        <section className="work-history">
          <h2>Udførelser og overspringninger</h2>
          <p className="muted">Tidsrettelser gemmes i historikken.</p>
          {[...history]
            .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
            .map((w) => {
              const t = w.taskSnapshot ?? tasks.find((t) => t.id === w.taskId);
              return t ? (
                <div key={w.id}>
                  {row(t, undefined, w)}
                  {w.missedPeriods?.map((p) => (
                    <p className="muted small" key={p.startDate}>
                      Perioden {p.startDate} – {p.deadline} blev holdt tilbage af den ældre åbne
                      opgave. Ikke registreret som udført.
                    </p>
                  ))}
                </div>
              ) : null;
            })}
        </section>
      )}
      <dialog
        ref={dialog}
        className="work-edit"
        aria-labelledby="work-edit-title"
        onCancel={() => setEdit(null)}
      >
        {edit && (
          <>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  if (await onAction(edit.id, edit.action, Number(edit.value), edit.occurrenceId))
                    setEdit(null);
                  else
                    setEditError('Tiden kunne ikke gemmes. Luk vinduet og se fejlbeskeden øverst.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2 id="work-edit-title">
                {edit.action === 'correct' ? 'Ret samlet registreret tid' : 'Nyt restestimat'}
              </h2>
              {editError && <p role="alert">{editError}</p>}
              <label>
                Minutter
                <input
                  autoFocus
                  required
                  type="number"
                  min={edit.action === 'correct' ? 0 : 1}
                  max={edit.action === 'correct' ? 525600 : 10080}
                  step="0.01"
                  value={edit.value}
                  onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                />
              </label>
              <div className="work-actions">
                <button className="button primary" disabled={busy}>
                  Gem tid
                </button>
                <button type="button" className="button secondary" onClick={() => setEdit(null)}>
                  Annuller
                </button>
              </div>
            </form>
          </>
        )}
      </dialog>
    </section>
  );
}
