import { useMemo, useRef, useState, useEffect } from 'react';
import { BarChart3, CheckCircle2, Clock3, History, MapPin, Search, SkipForward } from 'lucide-react';
import type { Member, NamedEntity, Task } from '../domain/model';
import { duration } from '../domain/model';
import { memberName, periodRange, statisticsFor } from '../domain/insights';
import { elapsedSeconds, type WorkState } from '../domain/work';

type Props = {
  tasks: Task[];
  works: WorkState[];
  history: WorkState[];
  locations: NamedEntity[];
  categories: NamedEntity[];
  members: Member[];
  userId: string;
  onCorrect: (taskId: string, minutes: number, occurrenceId: string) => Promise<boolean>;
};

export function InsightsView(props: Props) {
  const [tab, setTab] = useState<'stats' | 'history'>('stats');
  const [preset, setPreset] = useState<'week' | 'month' | 'year' | 'custom'>('month');
  const initial = periodRange('month');
  const [from, setFrom] = useState(initial.from), [to, setTo] = useState(initial.to);
  const [userId, setUserId] = useState('all'), [locationId, setLocationId] = useState('all');
  const [query, setQuery] = useState(''), [status, setStatus] = useState('all');
  const [correction, setCorrection] = useState<{ work: WorkState; value: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (correction) dialog.current?.showModal(); else dialog.current?.close(); }, [correction]);
  const stats = useMemo(() => statisticsFor(props.tasks, props.works, props.history, props.locations, props.categories, { from, to, userId, locationId }), [props.tasks, props.works, props.history, props.locations, props.categories, from, to, userId, locationId]);
  const changePreset = (value: typeof preset) => {
    setPreset(value);
    if (value !== 'custom') {
      const range = periodRange(value);
      setFrom(range.from); setTo(range.to);
    }
  };
  const history = stats.history.filter(({ work, task }) =>
    (status === 'all' || work.status === status) && task.title.toLocaleLowerCase('da').includes(query.toLocaleLowerCase('da')),
  );
  return (
    <section className="insights-page">
      <div className="page-heading"><div><p className="eyebrow">FREMSKRIDT UDEN PRES</p><h1>Statistik og historik</h1><p className="muted">Se det, I har fået fra hånden – og ret tidligere registreringer.</p></div></div>
      <div className="insight-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'stats'} className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}><BarChart3 size={17}/> Statistik</button>
        <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={17}/> Historik</button>
      </div>
      <div className="insight-filters">
        <label>Periode<select aria-label="Statistikperiode" value={preset} onChange={(event) => changePreset(event.target.value as typeof preset)}><option value="week">Denne uge</option><option value="month">Denne måned</option><option value="year">Dette år</option><option value="custom">Valgfri periode</option></select></label>
        {preset === 'custom' && <><label>Fra<input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label><label>Til<input type="date" min={from} value={to} onChange={(event) => setTo(event.target.value)}/></label></>}
        <label>Person<select aria-label="Filtrér efter person" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="all">Alle</option>{props.members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
        <label>Lokation<select aria-label="Filtrér statistik efter lokation" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="all">Alle lokationer</option>{props.locations.filter((value) => !value.independent).map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      </div>
      {tab === 'stats' ? <>
        <div className="metric-grid">
          <article><CheckCircle2/><span>Afsluttede</span><strong>{stats.completed}</strong></article>
          <article><Clock3/><span>Registreret tid</span><strong>{duration(Math.round(stats.minutes))}</strong></article>
          <article><SkipForward/><span>Sprunget over</span><strong>{stats.skipped}</strong></article>
          <article><MapPin/><span>Aktuelle / forsinkede</span><strong>{stats.active} / {stats.overdue}</strong></article>
        </div>
        <div className="chart-grid">
          <Breakdown title="Udvikling over tid" values={stats.byMonth} mode="count" empty="Ingen afslutninger i perioden." />
          <Breakdown title="Tid på lokationer" values={stats.byLocation} mode="minutes" empty="Ingen registreret tid i perioden." />
          <Breakdown title="Tid på kategorier" values={stats.byCategory} mode="minutes" empty="Ingen kategoriseret tid i perioden." />
        </div>
      </> : <>
        <div className="history-tools">
          <label className="search"><Search size={17}/><input aria-label="Søg i historik" placeholder="Find en tidligere opgave …" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
          <select aria-label="Historikstatus" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Alle hændelser</option><option value="completed">Udført</option><option value="skipped">Sprunget over</option></select>
        </div>
        <div className="history-list">
          {history.map(({ work, task }) => {
            const minutes = elapsedSeconds(work, work.completedAt ?? Date.now()) / 60;
            const planned = work.plannedDeadline || work.plannedStart;
            const completedDay = work.completedAt ? new Date(work.completedAt).toISOString().slice(0, 10) : '';
            const variance = planned && completedDay ? Math.round((Date.parse(completedDay) - Date.parse(planned)) / 86400000) : 0;
            return <article key={work.id}>
              <div className={`history-icon ${work.status}`}><span>{work.status === 'completed' ? '✓' : '↷'}</span></div>
              <div><h3>{task.title}</h3><p>{work.status === 'completed' ? 'Udført' : 'Sprunget over'} af {memberName(work.completedBy, props.members, props.userId)} · {work.completedAt ? new Date(work.completedAt).toLocaleString('da-DK') : ''}</p><small>Planlagt {planned || 'uden dato'} · Estimat {task.estimate} min. · Faktisk {Math.round(minutes)} min.{variance ? ` · ${Math.abs(variance)} dag${Math.abs(variance) === 1 ? '' : 'e'} ${variance > 0 ? 'senere' : 'tidligere'}` : ''}</small>{work.missedPeriods?.map((period) => <small key={period.startDate}>Holdt tilbage: {period.startDate} – {period.deadline}</small>)}</div>
              <button className="text-button" onClick={() => setCorrection({ work, value: String(Math.round(minutes * 100) / 100) })}>Ret tid</button>
            </article>;
          })}
          {!history.length && <div className="empty-state"><h2>Ingen historik i perioden.</h2><p>Prøv en anden periode eller et andet filter.</p></div>}
        </div>
      </>}
      <dialog ref={dialog} className="work-edit" onCancel={() => setCorrection(null)}>{correction && <form onSubmit={async (event) => { event.preventDefault(); if (await props.onCorrect(correction.work.taskId, Number(correction.value), correction.work.occurrenceId ?? correction.work.id)) setCorrection(null); }}><h2>Ret samlet registreret tid</h2><label>Minutter<input autoFocus required type="number" min="0" max="525600" step="0.01" value={correction.value} onChange={(event) => setCorrection({ ...correction, value: event.target.value })}/></label><div className="work-actions"><button className="button primary">Gem tid</button><button type="button" className="button secondary" onClick={() => setCorrection(null)}>Annuller</button></div></form>}</dialog>
    </section>
  );
}

function Breakdown({ title, values, mode, empty }: { title: string; values: Array<{ id: string; label: string; minutes: number; count: number }>; mode: 'minutes' | 'count'; empty: string }) {
  const max = Math.max(1, ...values.map((value) => mode === 'minutes' ? value.minutes : value.count));
  return <section className="chart-card"><h2>{title}</h2>{values.length ? <div className="bar-list">{values.map((value) => { const amount = mode === 'minutes' ? value.minutes : value.count; return <div key={value.id}><span>{value.label}</span><div><i style={{ width: `${Math.max(4, amount / max * 100)}%` }}/></div><strong>{mode === 'minutes' ? duration(Math.round(amount)) : value.count}</strong></div>; })}</div> : <p className="muted">{empty}</p>}</section>;
}
