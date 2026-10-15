import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Check, Edit3, CloudOff, Users, MapPin, Tags, Download, Upload, Smartphone, ShieldCheck, BellRing, RefreshCw, Share2, Archive } from 'lucide-react';
import type { Context, NamedEntity, Member } from '../domain/model';
import { AppDB } from '../data/db';
import { saveNamed } from '../data/repository';
import { mergeMembers, saveLocalMembers, saveLocalProfile } from '../data/localProfile';
import { backupFilename, backupSummary, createBackup, createTotalBackup, importBackup, parseBackup, parseTotalBackup, serializeBackup, totalBackupFilename, type Backup, type TotalBackup } from '../data/backup';

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareFile(file: File) {
  const data = { title: 'Få det Gjort – familiebackup', text: 'Her er den nyeste familiebackup fra Få det Gjort.', files: [file] };
  if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) return false;
  await navigator.share(data);
  return true;
}

function NamedList({ title, values, onSave }: { title: string; values: NamedEntity[]; onSave: (name: string, item?: NamedEntity) => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  return (
    <section className="settings-card">
      <h2>{title === 'Lokationer' ? <MapPin size={20} /> : <Tags size={20} />} {title}</h2>
      <div className="named-list">
        {values.map((value) => (
          <div key={value.id}>
            <span>{value.name}{value.independent && <small>Vises ved alle lokationer</small>}</span>
            <button className="icon-button" aria-label={`Rediger ${value.name}`} onClick={() => { setEditing(value.id); setName(value.name); }}><Edit3 size={16} /></button>
          </div>
        ))}
      </div>
      <form className="name-form" onSubmit={async (event) => {
        event.preventDefault();
        try {
          await onSave(name, values.find((value) => value.id === editing));
          setName(''); setEditing(null); setError('');
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke gemme.'); }
      }}>
        <input aria-label={editing ? 'Nyt navn' : `Ny ${title === 'Lokationer' ? 'lokation' : 'kategori'}`} required maxLength={80} placeholder={editing ? 'Nyt navn' : `Tilføj ${title === 'Lokationer' ? 'lokation' : 'kategori'}`} value={name} onChange={(event) => setName(event.target.value)} />
        <button className="icon-button filled" aria-label={editing ? 'Gem navn' : 'Tilføj'}>{editing ? <Check size={20} /> : <Plus size={20} />}</button>
        {editing && <button type="button" className="text-button" onClick={() => { setEditing(null); setName(''); }}>Annuller</button>}
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

export function Settings({
  db, ctx, locations, categories, members, installAvailable, installed, onInstall, onProfileChange, onMembersChange,
}: {
  db: AppDB; ctx: Context; locations: NamedEntity[]; categories: NamedEntity[]; members: Member[];
  installAvailable: boolean; installed: boolean; onInstall: () => Promise<void>;
  onProfileChange: (name: string) => void; onMembersChange: (members: Member[]) => void;
}) {
  const currentMember = members.find((member) => member.userId === ctx.userId);
  const [profileName, setProfileName] = useState(currentMember?.name ?? 'Dig');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [backup, setBackup] = useState<Backup | null>(null);
  const [totalBackup, setTotalBackup] = useState<TotalBackup | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const reminderPreferences = useLiveQuery(() => db.preferences.where('key').startsWith('reminder-').toArray(), [db]) ?? [];
  const reminderValue = (key: string, fallback: boolean) => {
    const value = reminderPreferences.find((entry) => entry.key === key)?.value;
    return value === undefined ? fallback : value === 'true';
  };
  const updateReminder = async (key: string, value: boolean) => {
    await db.preferences.put({ key, value: String(value) });
    setMessage('Påmindelsesvalg er gemt.');
  };
  const save = (entity: 'location' | 'category') => async (name: string, item?: NamedEntity) => {
    await saveNamed(db, ctx, entity, item ? { ...item, name } : { id: crypto.randomUUID(), householdId: ctx.householdId, name, independent: false, version: 0, updatedAt: new Date().toISOString() });
  };
  const applyBackup = async (mode: 'merge' | 'replace') => {
    if (!backup) return;
    setBackupBusy(true); setError('');
    try {
      const report = await importBackup(db, ctx, backup, mode);
      const nextMembers = mergeMembers(members, report.members);
      onMembersChange(nextMembers);
      setBackup(null);
      setMessage(mode === 'merge'
        ? `Familiebackup flettet: ${report.added} nye og ${report.updated} nyere poster blev hentet. ${report.kept} lokale poster blev bevaret.`
        : 'De lokale data er gendannet fra familiebackupen.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBackupBusy(false); }
  };
  const makeFamilyFile = async () => {
    const value = await createBackup(db, ctx, members);
    return new File([serializeBackup(value)], backupFilename(), { type: 'application/json' });
  };
  const restoreTotal = async () => {
    if (!totalBackup) return;
    setBackupBusy(true); setError('');
    try {
      const restoredContext = { ...ctx, userId: totalBackup.device.profile.userId };
      const targetName = `hverdagsro-${restoredContext.userId}-${restoredContext.householdId}`;
      const target = db.name === targetName ? db : new AppDB(`${restoredContext.userId}-${restoredContext.householdId}`);
      await importBackup(target, restoredContext, totalBackup.family, 'replace');
      if (target !== db) target.close();
      saveLocalProfile(totalBackup.device.profile);
      saveLocalMembers(totalBackup.device.members);
      if (db.name !== targetName) await db.delete(); else db.close();
      window.location.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBackupBusy(false); }
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
          <h2><Users size={20} /> {ctx.name}</h2>
          <p>Alle data gemmes lokalt i denne browser.</p>
          <span className="local-tag"><CloudOff size={16} /> Ingen fælles database</span>
          <form className="name-form" onSubmit={(event) => {
            event.preventDefault();
            const name = profileName.trim();
            if (!name) return;
            onProfileChange(name);
            setMessage('Dit navn på denne enhed er gemt.');
          }}>
            <label>Dit navn på denne enhed<input required maxLength={80} value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label>
            <button className="button secondary">Gem navn</button>
          </form>
          {members.length > 1 && <div className="named-list">{members.map((member) => <div key={member.userId}><span>{member.name}<small>{member.userId === ctx.userId ? 'Denne enhed' : 'Fra familiebackup'}</small></span></div>)}</div>}
        </section>
        <NamedList title="Lokationer" values={locations} onSave={save('location')} />
        <NamedList title="Kategorier" values={categories} onSave={save('category')} />
        <section className="settings-card sync-card">
          <h2><RefreshCw size={20} /> Del med familien</h2>
          <p className="muted">Tryk “Del familiebackup”, og vælg Beskeder/iMessage i Apples delingsmenu. På den anden enhed vælges filen og derefter “Flet familiebackup”. Nyeste ændring for hver opgave vinder.</p>
          <p className="small muted">Der er ingen automatisk synkronisering. Lav en ny backup, når I vil udveksle ændringer.</p>
          <button className="button primary" disabled={backupBusy} onClick={async () => {
            setBackupBusy(true); setError('');
            try {
              const file = await makeFamilyFile();
              if (await shareFile(file)) setMessage('Familiebackupen er sendt til delingsmenuen. Vælg Beskeder og modtager.');
              else { downloadFile(file); setMessage('Delingsmenuen er ikke tilgængelig her. Backupfilen er hentet og kan vedhæftes i Beskeder.'); }
            } catch (reason) {
              if (reason instanceof DOMException && reason.name === 'AbortError') setMessage('Deling blev annulleret.');
              else setError(reason instanceof Error ? reason.message : String(reason));
            } finally { setBackupBusy(false); }
          }}><Share2 size={16} /> Del familiebackup</button>
        </section>
        <section className="settings-card reminder-settings">
          <h2><BellRing size={20} /> Påmindelser</h2>
          <p className="muted">Interne påmindelser virker uden internet. Systemnotifikationer vises højst én gang pr. opgavehændelse.</p>
          <label className="setting-check"><input key={`internal-${reminderValue('reminder-internal', true)}`} type="checkbox" defaultChecked={reminderValue('reminder-internal', true)} onChange={(event) => void updateReminder('reminder-internal', event.target.checked)} /> Vis relevante påmindelser i appen</label>
          <fieldset><legend>Påmind mig når</legend>
            <label className="setting-check"><input key={`current-${reminderValue('reminder-current', true)}`} type="checkbox" defaultChecked={reminderValue('reminder-current', true)} onChange={(event) => void updateReminder('reminder-current', event.target.checked)} /> En gentagelse bliver aktuel</label>
            <label className="setting-check"><input key={`deadline-${reminderValue('reminder-deadline', true)}`} type="checkbox" defaultChecked={reminderValue('reminder-deadline', true)} onChange={(event) => void updateReminder('reminder-deadline', event.target.checked)} /> En deadline er højst tre dage væk</label>
            <label className="setting-check"><input key={`overdue-${reminderValue('reminder-overdue', true)}`} type="checkbox" defaultChecked={reminderValue('reminder-overdue', true)} onChange={(event) => void updateReminder('reminder-overdue', event.target.checked)} /> En opgave er forsinket</label>
          </fieldset>
          {'Notification' in window && Notification.permission === 'granted'
            ? <label className="setting-check"><input key={`system-${reminderValue('reminder-system', false)}`} type="checkbox" defaultChecked={reminderValue('reminder-system', false)} onChange={(event) => void updateReminder('reminder-system', event.target.checked)} /> Vis også systemnotifikationer</label>
            : 'Notification' in window && Notification.permission !== 'denied'
              ? <button className="button secondary" onClick={async () => { if (await Notification.requestPermission() === 'granted') { await updateReminder('reminder-system', true); setMessage('Systemnotifikationer er aktiveret.'); } }}><BellRing size={16} /> Aktivér systemnotifikationer</button>
              : <p className="small muted">Systemnotifikationer er ikke tilgængelige eller er blokeret i browseren.</p>}
        </section>
        <section className="settings-card backup-card">
          <h2><ShieldCheck size={20} /> Familiebackup</h2>
          <p className="muted">Filen indeholder opgaver, projekter, køer, historik og tidsregistrering. Den kan både bruges som sikkerhedskopi, til at udveksle ændringer og til at flytte data fra den tidligere onlineudgave.</p>
          <div className="settings-actions">
            <button className="button secondary" disabled={backupBusy} onClick={async () => {
              setBackupBusy(true); setError('');
              try {
                downloadFile(await makeFamilyFile());
                setMessage('Familiebackupen er oprettet. Send filen til den anden enhed eller gem den et sikkert sted.');
              } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
              finally { setBackupBusy(false); }
            }}><Download size={16} /> Eksportér familiebackup</button>
            <label className="button secondary file-button"><Upload size={16} /> Vælg familiebackup<input type="file" accept="application/json,.json" onChange={async (event) => {
              const file = event.target.files?.[0]; if (!file) return;
              setError(''); setMessage(''); setReplaceConfirmed(false);
              try { setBackup(parseBackup(await file.text(), ctx)); }
              catch (reason) { setBackup(null); setError(reason instanceof Error ? reason.message : String(reason)); }
              event.target.value = '';
            }} /></label>
          </div>
          {backup && <div className="import-review" role="status">
            <strong>Kontrollér før import</strong>
            <p>Backup fra {backupSummary(backup).memberName}, oprettet {new Date(backup.exportedAt).toLocaleString('da-DK')}: {backupSummary(backup).tasks} opgaver, {backupSummary(backup).projects} projekter, {backupSummary(backup).history} historikposter og {backupSummary(backup).workEvents} tidshændelser.</p>
            <button className="button primary" disabled={backupBusy} onClick={() => void applyBackup('merge')}>Flet familiebackup</button>
            <p className="small muted">Flet tilføjer nye poster og henter nyere rettelser. Nyere lokale rettelser bevares.</p>
            <details><summary>Gendan hele backupen</summary>
              <label className="replace-confirm"><input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} /> Jeg har kontrolleret filen og vil erstatte alle lokale data.</label>
              <button className="button danger" disabled={!replaceConfirmed || backupBusy} onClick={() => void applyBackup('replace')}>Erstat lokale data</button>
            </details>
            <button className="text-button" onClick={() => setBackup(null)}>Annuller import</button>
          </div>}
        </section>
        <section className="settings-card backup-card total-backup-card">
          <h2><Archive size={20} /> Totalbackup</h2>
          <p className="muted">En komplet kopi af denne enhed: alle familiedata, indstillinger, medlemmer, din profil og din personlige kø. Brug den ved flytning til en ny enhed eller efter nulstilling.</p>
          <div className="settings-actions">
            <button className="button secondary" disabled={backupBusy} onClick={async () => {
              setBackupBusy(true); setError('');
              try {
                const value = await createTotalBackup(db, ctx, members);
                downloadFile(new File([JSON.stringify(value, null, 2)], totalBackupFilename(), { type: 'application/json' }));
                setMessage('Totalbackuppen er oprettet. Gem filen et sikkert sted.');
              } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
              finally { setBackupBusy(false); }
            }}><Download size={16} /> Eksportér totalbackup</button>
            <label className="button secondary file-button"><Upload size={16} /> Vælg totalbackup<input type="file" accept="application/json,.json" onChange={async (event) => {
              const file = event.target.files?.[0]; if (!file) return;
              setError(''); setMessage(''); setReplaceConfirmed(false);
              try { setTotalBackup(parseTotalBackup(await file.text())); }
              catch (reason) { setTotalBackup(null); setError(reason instanceof Error ? reason.message : String(reason)); }
              event.target.value = '';
            }} /></label>
          </div>
          {totalBackup && <div className="import-review" role="status">
            <strong>Kontrollér totalbackuppen</strong>
            <p>Oprettet {new Date(totalBackup.exportedAt).toLocaleString('da-DK')} for {totalBackup.device.profile.name}: {backupSummary(totalBackup.family).tasks} opgaver, {backupSummary(totalBackup.family).projects} projekter og {totalBackup.device.members.length} familiemedlemmer.</p>
            <label className="replace-confirm"><input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} /> Jeg vil erstatte alt lokalt indhold og enhedsprofilen med totalbackuppen.</label>
            <button className="button danger" disabled={!replaceConfirmed || backupBusy} onClick={() => void restoreTotal()}>Gendan totalbackup</button>
            <button className="text-button" onClick={() => setTotalBackup(null)}>Annuller import</button>
          </div>}
        </section>
        <section className="settings-card install-card">
          <h2><Smartphone size={20} /> Installér appen</h2>
          <p className="muted">Den installerede app kan åbne og arbejde videre uden internet efter første indlæsning.</p>
          {installed ? <span className="local-tag"><Check size={16} /> Appen er installeret</span> : installAvailable ? <button className="button primary" onClick={() => void onInstall()}>Installér Få det Gjort</button> : <p className="small muted">På iPhone/iPad: vælg Del → Føj til hjemmeskærm. På computer og Android findes installationen i browserens menu.</p>}
        </section>
      </div>
    </>
  );
}
