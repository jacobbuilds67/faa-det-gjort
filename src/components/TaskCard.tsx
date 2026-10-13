import { recurrenceLabel } from '../domain/recurrence';
import type { WorkState } from '../domain/work';
import type { Suggestion } from '../domain/suggestions';
import {
  Clock3,
  MapPin,
  ArrowUpRight,
  Leaf,
  House,
  Car,
  Wrench,
  ArchiveRestore,
} from 'lucide-react';
import {
  duration,
  isOverdue,
  priorityLabels,
  today,
  type Task,
  type NamedEntity,
} from '../domain/model';
export function TaskCard({
  work,
  queued,
  waitingFor,
  onStart,
  onAdd,
  task,
  suggestion,
  locations,
  categories,
  onEdit,
  onRestore,
}: {
  work?: WorkState;
  queued: boolean;
  waitingFor: string[];
  onStart: () => void;
  onAdd: () => void;
  task: Task;
  suggestion?: Suggestion;
  locations: NamedEntity[];
  categories: NamedEntity[];
  onEdit: () => void;
  onRestore: () => void;
}) {
  const category = categories.find((c) => c.id === task.categoryId)?.name ?? 'Uden kategori';
  const Icon =
    category === 'Have' ? Leaf : category === 'Bil' ? Car : category === 'Hus' ? House : Wrench;
  const overdue = isOverdue(task),
    planned = task.startDate && task.startDate > today();
  return (
    <article className="task-card">
      <div
        className={`task-illustration ${category === 'Have' ? 'garden' : category === 'Bil' ? 'car' : 'home'}`}
      >
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <div className="task-copy">
        <div className="task-title-line">
          <button className="task-title" onClick={onEdit}>
            {task.title}
          </button>
          <span className={`priority ${task.priority}`}>
            <i />
            {priorityLabels[task.priority]}
          </span>
        </div>
        <div className="task-meta">
          <span>
            <MapPin size={13} />
            {locations
              .filter((l) => task.locationIds.includes(l.id))
              .map((l) => l.name)
              .join(' · ')}
          </span>
          <span>
            <Clock3 size={13} />
            {duration(suggestion?.remainingMinutes ?? task.estimate)}
          </span>
          <span className="category-name">{category}</span>
        </div>
        {task.recurrence && (
          <p className="suggestion-reason">↻ {recurrenceLabel(task.recurrence)}</p>
        )}
        {suggestion && (
          <p className="suggestion-reason">{suggestion.reasons.slice(0, 2).join(' · ')}</p>
        )}
        {!!waitingFor.length && <p className="dependency-note">Venter på: {waitingFor.join(', ')}</p>}
        {task.deadline && (
          <p className={overdue ? 'deadline overdue' : 'deadline'}>
            {overdue ? 'Overskredet · ' : 'Deadline · '}
            {new Intl.DateTimeFormat('da', { day: 'numeric', month: 'short' }).format(
              new Date(task.deadline + 'T12:00:00'),
            )}
          </p>
        )}
        {planned && (
          <p className="deadline">
            Planlagt fra{' '}
            {new Intl.DateTimeFormat('da', { day: 'numeric', month: 'short' }).format(
              new Date(task.startDate + 'T12:00:00'),
            )}
          </p>
        )}
        {work?.status === 'completed' ? (
          <p className="suggestion-reason">✓ Afsluttet</p>
        ) : (
          !task.archived && (
            <div className="work-actions">
              <button className="text-button" disabled={queued} onClick={onAdd}>
                {queued ? 'I din kø' : 'Tilføj til kø'}
              </button>
              <button
                className="text-button"
                disabled={!!planned || work?.status === 'running' || waitingFor.length > 0}
                onClick={onStart}
              >
                {work?.status === 'running'
                  ? 'I gang'
                  : work?.status === 'paused'
                    ? 'Fortsæt'
                    : waitingFor.length ? 'Afventer' : 'Start nu'}
              </button>
            </div>
          )
        )}
      </div>
      <button
        className="icon-button task-action"
        aria-label={task.archived ? `Gendan ${task.title}` : `Rediger ${task.title}`}
        onClick={task.archived ? onRestore : onEdit}
      >
        {task.archived ? <ArchiveRestore size={20} /> : <ArrowUpRight size={20} />}
      </button>
    </article>
  );
}
