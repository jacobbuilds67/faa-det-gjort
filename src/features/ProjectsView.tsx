import { useEffect, useRef, useState } from 'react';
import { Archive, CheckCircle2, ChevronRight, FolderKanban, Plus, RotateCcw } from 'lucide-react';
import type { Project, Task } from '../domain/model';
import type { WorkState } from '../domain/work';

type Props = {
  householdId: string;
  projects: Project[];
  tasks: Task[];
  works: WorkState[];
  onSave: (project: Project) => Promise<void>;
  onNewTask: (projectId: string) => void;
  onEditTask: (task: Task) => void;
};

export function ProjectsView({ householdId, projects, tasks, works, onSave, onNewTask, onEditTask }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<Project | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const visible = projects.filter((project) => project.archived === showArchived);
  const current = projects.find((project) => project.id === selected) ?? visible[0];
  const projectTasks = current ? tasks.filter((task) => task.projectId === current.id) : [];
  const completed = projectTasks.filter((task) => works.find((work) => work.taskId === task.id)?.status === 'completed').length;
  return (
    <section className="projects-page">
      <div className="page-heading">
        <div><p className="eyebrow">FRA IDÉ TIL FREMSKRIDT</p><h1>Projekter</h1><p className="muted">Saml delopgaver, se rækkefølgen og gør næste skridt tydeligt.</p></div>
        <button className="button primary" onClick={() => setEditor('new')}><Plus size={17}/> Nyt projekt</button>
      </div>
      <div className="project-toolbar"><button className={`button secondary ${showArchived ? 'selected' : ''}`} onClick={() => { setShowArchived(!showArchived); setSelected(null); }}><Archive size={16}/> Arkiverede projekter</button></div>
      <div className="project-layout">
        <aside className="project-list" aria-label="Projektliste">
          {visible.map((project) => {
            const ownTasks = tasks.filter((task) => task.projectId === project.id);
            const done = ownTasks.filter((task) => works.find((work) => work.taskId === task.id)?.status === 'completed').length;
            return <button key={project.id} className={current?.id === project.id ? 'project-list-item active' : 'project-list-item'} onClick={() => setSelected(project.id)}><FolderKanban size={20}/><span><strong>{project.name}</strong><small>{done} af {ownTasks.length} delopgaver</small></span><ChevronRight size={16}/></button>;
          })}
          {!visible.length && <div className="empty-state compact"><FolderKanban size={30}/><p>{showArchived ? 'Ingen arkiverede projekter.' : 'Opret et projekt og saml delopgaverne.'}</p></div>}
        </aside>
        {current && <article className="project-detail">
          <header><div><h2>{current.name}</h2><p className="muted">{current.description || 'Ingen beskrivelse endnu.'}</p></div><button className="text-button" onClick={() => setEditor(current)}>Rediger projekt</button></header>
          <div className="project-progress"><div><span>{projectTasks.length ? Math.round(completed / projectTasks.length * 100) : 0}%</span><small>{completed} af {projectTasks.length} afsluttet</small></div><progress max={Math.max(1, projectTasks.length)} value={completed}>{completed}</progress></div>
          <div className="section-heading"><h2>Delopgaver</h2>{!current.archived && <button className="button secondary compact" onClick={() => onNewTask(current.id)}><Plus size={16}/> Ny delopgave</button>}</div>
          <div className="project-task-list">{projectTasks.map((task) => {
            const status = works.find((work) => work.taskId === task.id)?.status;
            const dependencies = (task.dependencyIds ?? []).map((id) => tasks.find((value) => value.id === id)?.title).filter(Boolean);
            const blocked = (task.dependencyIds ?? []).some((id) => works.find((work) => work.taskId === id)?.status !== 'completed');
            return <button key={task.id} className="project-task" onClick={() => onEditTask(task)}><CheckCircle2 className={status === 'completed' ? 'done' : ''} size={21}/><span><strong>{task.title}</strong><small>{status === 'completed' ? 'Afsluttet' : blocked ? `Venter på: ${dependencies.join(', ')}` : 'Klar til at blive udført'}</small></span><ChevronRight size={16}/></button>;
          })}{!projectTasks.length && <p className="muted">Projektet har ingen delopgaver endnu.</p>}</div>
        </article>}
      </div>
      {editor && <ProjectDialog householdId={householdId} value={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSave={async (project) => { await onSave(project); setSelected(project.id); setEditor(null); }}/>} 
    </section>
  );
}

function ProjectDialog({ householdId, value, onSave, onClose }: { householdId: string; value?: Project; onSave: (project: Project) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(value?.name ?? '');
  const [description, setDescription] = useState(value?.description ?? '');
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const project: Project = value ?? { id: crypto.randomUUID(), householdId, name: '', description: '', archived: false, version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  return <dialog ref={dialog} className="editor project-editor" onCancel={onClose} aria-labelledby="project-title"><form onSubmit={async (event) => { event.preventDefault(); try { await onSave({ ...project, name, description }); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } }}><header><h2 id="project-title">{value ? 'Rediger projekt' : 'Nyt projekt'}</h2></header><label>Projektnavn<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)}/></label><label>Beskrivelse<textarea rows={4} maxLength={3000} value={description} onChange={(event) => setDescription(event.target.value)}/></label>{error && <p className="error" role="alert">{error}</p>}<footer>{value && <button type="button" className="text-button archive-link" onClick={async () => { try { await onSave({ ...project, name, description, archived: !project.archived }); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } }}>{project.archived ? <><RotateCcw size={15}/> Gendan</> : <><Archive size={15}/> Arkivér</>}</button>}<button type="button" className="button secondary" onClick={onClose}>Annuller</button><button className="button primary">Gem projekt</button></footer></form></dialog>;
}
