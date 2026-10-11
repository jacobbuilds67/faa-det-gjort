import { useState } from 'react';
import { Plus, Check, Edit3, CloudOff, Users, MapPin, Tags } from 'lucide-react';
import type { Context, NamedEntity, Member, Conflict } from '../domain/model';
import { AppDB } from '../data/db';
import { saveNamed } from '../data/repository';
import { supabase } from '../data/supabase';
import { resolveConflict } from '../data/sync';
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
  onExit,
  onSync,
}: {
  db: AppDB;
  ctx: Context;
  locations: NamedEntity[];
  categories: NamedEntity[];
  members: Member[];
  conflicts: Conflict[];
  onExit: () => Promise<void>;
  onSync: () => void;
}) {
  const [email, setEmail] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
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
          {message && <p role="status">{message}</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="text-button" onClick={() => void onExit()}>
            {ctx.local ? 'Tilbage til login' : 'Log ud'}
          </button>
        </section>
        <NamedList title="Lokationer" values={locations} onSave={save('location')} />
        <NamedList title="Kategorier" values={categories} onSave={save('category')} />
        <section className="settings-card">
          <p className="eyebrow">UNDER UDVIKLING · FASE 2</p>
          <h2>Et solidt fundament</h2>
          <p className="muted">
            Opgaveregister, lokationer, kategorier og husstand er første leverance. Kø, timer,
            gentagelser og projekter følger i de næste faser.
          </p>
          <p className="small muted">
            Arkiverede opgaver kan altid gendannes i opgaveregisteret. Lokal lagring erstatter ikke
            en backup.
          </p>
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
