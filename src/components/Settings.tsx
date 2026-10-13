import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Check, Edit3, CloudOff, Users, MapPin, Tags, Download, Upload, RefreshCw, Smartphone, ShieldCheck, BellRing } from 'lucide-react';
import type { Context, NamedEntity, Member, Conflict } from '../domain/model';
import { AppDB } from '../data/db';
import { saveNamed } from '../data/repository';
import { supabase } from '../data/supabase';
import { resolveConflict } from '../data/sync';
import { backupFilename, backupSummary, createBackup, importBackup, parseBackup, serializeBackup, type Backup } from '../data/backup';
function NamedList({
  title,
  values,
  onSave,
}: {
  title: string;
  values: NamedEntity[];
  onSave: (name: string, item?: NamedEntity) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(''),
    [error, setError] = useState('');
  return (
    <section className="settings-card">
      <h2>
        {title === 'Lokationer' ? <MapPin size={20} /> : <Tags size={20} />} {title}
      </h2>
      <div className="named-list">
        {values.map((v) => (
          <div key={v.id}>
            <span>
              {v.name}
              {v.independent && <small>Vises ved alle lokationer</small>}
            </span>
            <button
              className="icon-button"
              aria-label={`Rediger ${v.name}`}
              onClick={() => {
                setEditing(v.id);
                setName(v.name);
              }}
            >
              <Edit3 size={16} />
            </button>
          </div>
        ))}
      </div>
      <form
        className="name-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onSave(
              name,
              values.find((v) => v.id === editing),
            );
            setName('');
            setEditing(null);
            setError('');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Kunne ikke gemme.');
          }
        }}
      >
        <input
          aria-label={
            editing ? 'Nyt navn' : `Ny ${title === 'Lokationer' ? 'lokation' : 'kategori'}`
          }
          required
          maxLength={80}
          placeholder={
            editing ? 'Nyt navn' : `Tilføj ${title === 'Lokationer' ? 'lokation' : 'kategori'}`
          }
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="icon-button filled" aria-label={editing ? 'Gem navn' : 'Tilføj'}>
          {editing ? <Check size={20} /> : <Plus size={20} />}
        </button>
        {editing && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setEditing(null);
              setName('');
            }}
          >
            Annuller
          </button>
        )}
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function Settings({
  db,
  ctx,
  locations,
  categories,
  members,
  conflicts,
  pending,
  online,
  syncing,
  installAvailable,
  installed,
  onInstall,
  onExit,
  onSync,
}: {
  db: AppDB;
  ctx: Context;
  locations: NamedEntity[];
  categories: NamedEntity[];
  members: Member[];
  conflicts: Conflict[];
  pending: number;
  online: boolean;
  syncing: boolean;
  installAvailable: boolean;
  installed: boolean;
  onInstall: () => Promise<void>;
  onExit: () => Promise<void>;
  onSync: () => Promise<void>;
}) {
  const [email, setEmail] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [backup, setBackup] = useState<Backup | null>(null),
    [replaceConfirmed, setReplaceConfirmed] = useState(false),
    [backupBusy, setBackupBusy] = useState(false);
  const lastSync = useLiveQuery(() => db.preferences.get('last-sync'), [db]);
  const reminderPreferences = useLiveQuery(
    () => db.preferences.where('key').startsWith('reminder-').toArray(),
    [db],
  ) ?? [];
  const reminderValue = (key: string, fallback: boolean) =>
    reminderPreferences.find((value) => value.key === key)?.value !== undefined
      ? reminderPreferences.find((value) => value.key === key)?.value === 'true'
      : fallback;
  const setReminderValue = (key: string, value: boolean) =>
    db.preferences.put({ key, value: String(value) });
  const updateReminder = async (key: string, value: boolean) => {
    await setReminderValue(key, value);
    setMessage('Påmindelsesvalg er gemt.');
  };
  const save = (entity: 'location' | 'category') => async (name: string, item?: NamedEntity) => {
    await saveNamed(
      db,
      ctx,
      entity,
      item
        ? { ...item, name }
        : {
            id: crypto.randomUUID(),
            householdId: ctx.householdId,
            name,
            independent: false,
            version: 0,
            updatedAt: new Date().toISOString(),
          },
    );
    onSync();
  };
  return (
    <>
      <div className="page-heading settings-heading">
        <p className="eyebrow">JERES HVERDAG, JERES RAMMER</p>
        <h1>Indstillinger</h1>
        <p className="muted">Gør plads til de steder og ting, der fylder hos jer.</p>
        {message && <p role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="settings-grid">
        <section className="settings-card household-card">
          <h2>
            <Users size={20} /> {ctx.name}
          </h2>
          {ctx.local ? (
            <>
              <p>Du arbejder lokalt på denne enhed.</p>
              <p className="muted">
                Opgaverne gemmes i browseren. De flyttes ikke automatisk til en husstand med login.
              </p>
              <span className="local-tag">
                <CloudOff size={16} /> Kun på denne enhed
              </span>
            </>
          ) : (
            <>
              <div className="named-list">
                {members.map((m) => (
                  <div key={m.userId}>
                    <span>
                      {m.name}
                      <small>{m.role === 'owner' ? 'Ejer' : 'Medlem'}</small>
                    </span>
                  </div>
                ))}
              </div>
              {members.find((m) => m.userId === ctx.userId)?.role === 'owner' && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setError('');
                    try {
                      const { error } = await supabase!.rpc('invite_member', {
                        p_household: ctx.householdId,
                        p_email: email,
                      });
                      if (error) throw error;
                      setMessage(
                        'Invitationen er registreret. Bed personen logge ind med denne e-mail. Appen sender ikke en invitationsmail.',
                      );
                      setEmail('');
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Kunne ikke invitere.');
                    }
                  }}
                >
                  <label>
                    Inviter til husstanden
                    <input
                      type="email"
                      required
                      placeholder="E-mailadresse"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <button className="button secondary">Opret invitation</button>
                </form>
              )}
            </>
          )}
          <button className="text-button" onClick={() => void onExit()}>
            {ctx.local ? 'Tilbage til login' : 'Log ud'}
          </button>
        </section>
        <NamedList title="Lokationer" values={locations} onSave={save('location')} />
        <NamedList title="Kategorier" values={categories} onSave={save('category')} />
        <section className="settings-card sync-card">
          <h2><RefreshCw size={20}/> Synkronisering</h2>
          <p className="muted">{ctx.local ? 'Lokal afprøvning synkroniseres ikke med andre enheder.' : !online ? 'Offline. Dine ændringer ligger sikkert i den lokale kø.' : syncing ? 'Synkroniserer ændringer …' : pending ? `${pending} ændring(er) venter på serveren.` : 'Alle lokale ændringer er sendt.'}</p>
          {!ctx.local && <><button className="button secondary" disabled={!online || syncing} onClick={() => void onSync()}><RefreshCw size={16}/> Synkronisér nu</button><p className="small muted">{lastSync ? `Senest kontrolleret ${new Date(lastSync.value).toLocaleString('da-DK')}.` : 'Ikke synkroniseret i denne browser endnu.'}</p></>}
        </section>
        <section className="settings-card reminder-settings">
          <h2><BellRing size={20}/> Påmindelser</h2>
          <p className="muted">Interne påmindelser virker uden browseradgang. Systemnotifikationer vises højst én gang pr. opgavehændelse.</p>
          <label className="setting-check"><input key={`internal-${reminderValue('reminder-internal', true)}`} type="checkbox" defaultChecked={reminderValue('reminder-internal', true)} onChange={(event) => void updateReminder('reminder-internal', event.target.checked)}/> Vis relevante påmindelser i appen</label>
          <fieldset>
            <legend>Påmind mig når</legend>
            <label className="setting-check"><input key={`current-${reminderValue('reminder-current', true)}`} type="checkbox" defaultChecked={reminderValue('reminder-current', true)} onChange={(event) => void updateReminder('reminder-current', event.target.checked)}/> En gentagelse bliver aktuel</label>
            <label className="setting-check"><input key={`deadline-${reminderValue('reminder-deadline', true)}`} type="checkbox" defaultChecked={reminderValue('reminder-deadline', true)} onChange={(event) => void updateReminder('reminder-deadline', event.target.checked)}/> En deadline er højst tre dage væk</label>
            <label className="setting-check"><input key={`overdue-${reminderValue('reminder-overdue', true)}`} type="checkbox" defaultChecked={reminderValue('reminder-overdue', true)} onChange={(event) => void updateReminder('reminder-overdue', event.target.checked)}/> En opgave er forsinket</label>
          </fieldset>
          {'Notification' in window && Notification.permission === 'granted' ? (
            <label className="setting-check"><input key={`system-${reminderValue('reminder-system', false)}`} type="checkbox" defaultChecked={reminderValue('reminder-system', false)} onChange={(event) => void updateReminder('reminder-system', event.target.checked)}/> Vis også systemnotifikationer</label>
          ) : 'Notification' in window && Notification.permission !== 'denied' ? (
            <button className="button secondary" onClick={async () => { const permission = await Notification.requestPermission(); if (permission === 'granted') { await setReminderValue('reminder-system', true); setMessage('Systemnotifikationer er aktiveret.'); } }}><BellRing size={16}/> Aktivér systemnotifikationer</button>
          ) : <p className="small muted">Systemnotifikationer er ikke tilgængelige eller er blokeret i browseren. Påmindelser i appen virker stadig.</p>}
        </section>
        <section className="settings-card backup-card">
          <h2><ShieldCheck size={20}/> Backup og gendannelse</h2>
          <p className="muted">Gem opgaver, projekter, kø, historik, tidsregistrering og lokale synkroniseringsdata i én JSON-fil.</p>
          <div className="settings-actions">
            <button className="button secondary" disabled={backupBusy} onClick={async () => {
              setBackupBusy(true); setError('');
              try {
                const value = await createBackup(db, ctx, members);
                const url = URL.createObjectURL(new Blob([serializeBackup(value)], { type: 'application/json' }));
                const link = document.createElement('a'); link.href = url; link.download = backupFilename(); link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setMessage('Backupfilen er oprettet. Opbevar den et sikkert sted.');
              } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
              finally { setBackupBusy(false); }
            }}><Download size={16}/> Eksportér backup</button>
            <label className="button secondary file-button"><Upload size={16}/> Vælg backupfil<input type="file" accept="application/json,.json" onChange={async (event) => {
              const file = event.target.files?.[0]; if (!file) return;
              setError(''); setMessage(''); setReplaceConfirmed(false);
              try { setBackup(parseBackup(await file.text(), ctx)); }
              catch (reason) { setBackup(null); setError(reason instanceof Error ? reason.message : String(reason)); }
              event.target.value = '';
            }}/></label>
          </div>
          {backup && <div className="import-review" role="status">
            <strong>Kontrollér før import</strong>
            <p>Backup fra {new Date(backup.exportedAt).toLocaleString('da-DK')}: {backupSummary(backup).tasks} opgaver, {backupSummary(backup).projects} projekter, {backupSummary(backup).history} historikposter og {backupSummary(backup).workEvents} tidshændelser.</p>
            <button className="button secondary" disabled={backupBusy} onClick={async () => { setBackupBusy(true); try { await importBackup(db, ctx, backup, 'merge'); setBackup(null); setMessage('Manglende data er importeret. Eksisterende poster blev bevaret.'); await onSync(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBackupBusy(false); } }}>Tilføj kun manglende</button>
            <label className="replace-confirm"><input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)}/> Jeg har kontrolleret filen og vil erstatte alle lokale data.</label>
            <button className="button danger" disabled={!replaceConfirmed || backupBusy} onClick={async () => { setBackupBusy(true); try { await importBackup(db, ctx, backup, 'replace'); setBackup(null); setMessage('De lokale data er gendannet fra backupfilen.'); await onSync(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBackupBusy(false); } }}>Erstat lokale data</button>
            <button className="text-button" onClick={() => setBackup(null)}>Annuller import</button>
          </div>}
        </section>
        <section className="settings-card install-card">
          <h2><Smartphone size={20}/> Installér appen</h2>
          <p className="muted">Den installerede app kan åbne og arbejde videre uden internet efter første indlæsning.</p>
          {installed ? <span className="local-tag"><Check size={16}/> Appen er installeret</span> : installAvailable ? <button className="button primary" onClick={() => void onInstall()}>Installér Få det Gjort</button> : <p className="small muted">På iPhone/iPad: vælg Del → Føj til hjemmeskærm. På computer og Android findes installationen i browserens menu, når siden kører via HTTPS eller lokalt.</p>}
        </section>
      </div>
      {conflicts.length > 0 && (
        <section className="settings-card">
          <h2>Ændringer, der skal afklares</h2>
          <p>Begge versioner bevares i konfliktarkivet, også efter dit valg.</p>
          {conflicts.map((c) => (
            <div className="conflict" key={c.id}>
              <h3>
                {'title' in c.command.payload ? c.command.payload.title : c.command.payload.name}
              </h3>
              <p>{c.reason}</p>
              {['work', 'history'].includes(c.command.entity) && (
                <p>
                  Bevar den fælles arbejdsstatus. Du kan bagefter rette tiden manuelt; din lokale
                  registrering gemmes i konfliktarkivet.
                </p>
              )}
              <div className="form-grid">
                <details>
                  <summary>Din ændring</summary>
                  <pre>{JSON.stringify(c.command.payload, null, 2)}</pre>
                </details>
                <details>
                  <summary>På serveren</summary>
                  <pre>{JSON.stringify(c.server, null, 2)}</pre>
                </details>
              </div>
              <button
                className="button secondary"
                onClick={() =>
                  void resolveConflict(db, c, 'server')
                    .then(onSync)
                    .catch((e) => setError(String(e)))
                }
              >
                Brug serverens version
              </button>
              <button
                title={
                  ['work', 'history'].includes(c.command.entity)
                    ? 'Bevar fælles status; ret derefter tiden manuelt. Din lokale registrering gemmes i konfliktarkivet.'
                    : undefined
                }
                disabled={['work', 'history'].includes(c.command.entity)}
                className="button primary"
                onClick={() =>
                  void resolveConflict(db, c, 'local')
                    .then(onSync)
                    .catch((e) => setError(String(e)))
                }
              >
                Behold min version
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
