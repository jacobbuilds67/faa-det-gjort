import { useState } from 'react';
import { Leaf, ArrowRight } from 'lucide-react';
import { supabase } from '../data/supabase';
export function Auth({ onLocal }: { onLocal: () => void }) {
  const [email, setEmail] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-mark">
            <Leaf />
          </span>
          hverdagsro<span className="brand-dot">.</span>
        </div>
        <p className="eyebrow">PLADS TIL DET, DER BETYDER NOGET</p>
        <h1>
          Lidt tid.
          <br />
          Lidt mere ro.
        </h1>
        <p>
          Et fælles sted til alle de små ting.
          <br />
          Hjemme, i sommerhuset og indimellem.
        </p>
        <div className="auth-decoration">
          <Leaf size={160} strokeWidth={0.5} />
        </div>
      </section>
      <section className="auth-form">
        <p className="eyebrow">VELKOMMEN INDENFOR</p>
        <h2>Hverdagen er lettere sammen.</h2>
        <p className="muted">Log ind med et link i din indbakke. Ingen adgangskode at huske.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!supabase) return;
            setBusy(true);
            setError('');
            try {
              const { error } = await supabase.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: window.location.origin },
              });
              if (error) throw error;
              setMessage('Tjek din indbakke – vi har sendt et loginlink.');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Login mislykkedes.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            E-mail
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dig@eksempel.dk"
              disabled={!supabase}
            />
          </label>
          <button className="button primary" disabled={!supabase || busy}>
            {busy ? 'Sender …' : 'Send loginlink'}
            <ArrowRight size={18} />
          </button>
        </form>
        {!supabase && (
          <p className="setup-note">
            Login bliver tilgængeligt, når Supabase er tilsluttet. Du kan allerede afprøve
            opgaveregisteret lokalt.
          </p>
        )}
        {message && (
          <p role="status" className="success">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="auth-divider">eller begynd her</div>
        <button className="button secondary" onClick={onLocal}>
          Prøv på denne enhed <ArrowRight size={18} />
        </button>
        <p className="small muted">
          Lokal afprøvning gemmes i denne browser og deles ikke med andre enheder.
        </p>
      </section>
    </main>
  );
}
export function HouseholdSetup({ onReady }: { onReady: () => void }) {
  const [name, setName] = useState('Vores husstand'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="setup-page">
      <Leaf size={36} />
      <h1>Et fælles sted til jeres hverdag.</h1>
      <p>Opret en husstand. Du kan invitere en anden under Indstillinger.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const { error } = await supabase!.rpc('create_household', { p_name: name });
            if (error) throw error;
            onReady();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Kunne ikke oprette husstanden.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Husstandens navn
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="button primary" disabled={busy}>
          Opret husstand
        </button>
      </form>
      <button className="text-button" onClick={onReady}>
        Jeg er blevet inviteret – kontrollér igen
      </button>
      <button className="text-button" onClick={() => void supabase!.auth.signOut()}>
        Log ud
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  );
}
