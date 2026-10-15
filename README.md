# Få det Gjort

Dansk, offline-orienteret opgave-app. **Leverance: fase 2–9: opgaver, forslag, kø, timer, gentagelser, projekter, offlinebrug, backup, påmindelser, statistik og afsluttende kvalitetssikring.**

## Kom i gang

På denne Mac kan du dobbeltklikke `start-lokalt.command` i Finder. Den starter den lokale server og åbner automatisk appen på `http://127.0.0.1:5173/`. Åbn ikke `index.html` direkte som en fil; den er kildekode til Vite-buildet og kan ikke starte appen alene. Scriptet bruger den eksisterende Codex-runtime, hvis Node/pnpm ikke findes globalt.

Ved almindelig installation er kravene Node.js 22+ og pnpm. Versionslåsen er `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Åbn den adresse, Vite viser. Vælg **Prøv på denne enhed** for lokal afprøvning uden konto. Browseren starter uden opgaver; eksempelopgaver tilføjes kun på dit valg. Lokale prøveopgaver overføres ikke automatisk til en senere konto.

```sh
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm verify
```

Før en ekstern pilot: opret `.env` med de to offentlige Supabase-værdier, og kør `pnpm release:check`. Den samlede rækkefølge står i [pilot- og idriftsættelseschecklisten](RELEASE_CHECKLIST.md).

Alternativt kan E2E-test bruge en installeret Chrome: `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`.

## Hvad er implementeret?

- Responsiv dansk brugerflade, desktopsidebar og mobilnavigation.
- Oprettelse/redigering, positivt tidsestimat, flere lokationer, kategori, prioritet, ansvarlig, beskrivelse og datoer.
- Søgning, tids-/lokationsfilter, beregnet forsinkelse, arkivering og gendannelse.
- Deterministisk forslagsmotor med centrale vægte for prioritet, deadlines og tidsmatch samt forklaringer på hvert forslag.
- Personlig, vedvarende kø med touch/musetræk, op/ned-knapper og tidsramme.
- Direkte start, pause, genoptagelse, afslutning og manuel korrektion med audit.
- Fælles afslutningsoversigt med bruger og dato. Næste opgave starter aldrig automatisk.
- Gentagelser med faste kalenderintervaller eller interval efter udførelse, ugedage, aktive måneder og årlige sæsonperioder.
- Én åben forekomst, eksplicit overspringning og bevaret historik med individuel tidsrettelse.
- Projekter med beskrivelse, arkivering, almindelige opgaver som delopgaver og beregnet fremdrift.
- Afhængigheder mellem opgaver med tydelig ventestatus, filtrering fra forslag og kredsløbsvalidering.
- Administration af lokationer og kategorier.
- IndexedDB med atomisk ændringskø og vedvarende lokationsvalg.
- Installerbar PWA med cachet appskal og kold genåbning uden netværk.
- Automatisk synkronisering efter netværket vender tilbage samt bevarede konfliktversioner.
- Valideret JSON-backup af husstand, bruger, opgaver, projekter, lokationer, gentagelser, kø, historik og tid. Import kan flette manglende data eller erstatte efter eksplicit bekræftelse.
- Hurtig tekstbaseret oprettelse med lokal regelmotor og obligatorisk gennemgang i den almindelige formular.
- Interne påmindelser om aktuelle gentagelser, nært forestående deadlines og forsinkede opgaver samt valgfrie, deduplikerede PWA-systemnotifikationer.
- Separat statistik- og historikside med periode-, person- og lokationsfiltre, tidsfordelinger, udvikling over tid og rettelse af historisk tid.
- Supabase-loginlink, husstandsoprettelse, registrering af invitationer og medlemskab.
- SQL-migration med RLS, normaliserede opgaver/lokationer/forekomster og audithistorik.
- Grundlæggende snapshotsynkronisering, versionskonflikter og eksplicit valg med bevarede konfliktdata.
- Browserbaseret sikkerhedspolitik, sikker visning af brugerinput, robust læsning af lokale sessionsdata og reproducerbare fase 9-kvalitetskontroller.

## Tilslut Supabase

Pilotprojektet **Få det Gjort Pilot** er oprettet i Supabase-organisationen **JM MicroApps** i West EU (Irland). Projektets offentlige URL og publishable key ligger kun i den ignorerede lokale `.env`; secret/service-role key bruges ikke af appen.

1. Brug det separate Supabase-pilotprojekt eller opret et nyt testprojekt.
2. Anvend migrationerne `001_foundation.sql` til `005_security_hardening.sql` i den rækkefølge. De forudsætter Supabase Auth, rollerne `anon`/`authenticated` og et tomt applikationsschema før migration 001.
3. Kopiér `.env.example` til `.env`. Indsæt projektets URL og **publishable key**. Brug aldrig secret key eller service-role key i en `VITE_`-variabel.
4. Tillad udviklingsadressen (fx `http://127.0.0.1:5173`) og senere produktionsadressen under Auth URL Configuration. Aktivér e-mail-login. Konfigurér en egnet mailafsender før almindelig brug.
5. Genstart Vite. Log ind via e-mail, opret husstanden, og registrér den anden brugers e-mail under Indstillinger. Personen skal selv åbne appen og logge ind med den registrerede e-mail inden syv dage. **Appen sender ikke invitationsmail.**
6. Afprøv to faktiske konti og enheder, herunder afbrudte forbindelser og konflikter, før løsningen bruges til reelle husstandsdata.

Officiel dokumentation: [Supabase passwordless e-mail](https://supabase.com/docs/guides/auth/auth-email-passwordless), [API-nøgler](https://supabase.com/docs/guides/getting-started/api-keys), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Deployment

Pilotversionen er udgivet på [faa-det-gjort.vercel.app](https://faa-det-gjort.vercel.app/) fra det private GitHub-repository `jacobbuilds67/faa-det-gjort`. Push til `main` udløser nye Vercel-deployments.

Den reproducerbare Vercel-konfiguration er:

- Installationskommando: `pnpm install --frozen-lockfile`
- Buildkommando: `pnpm build`
- Outputmappe: `dist`
- Indstil de to offentlige Supabase-variabler i buildmiljøet.
- Brug HTTPS. Ingen hemmelige servernøgler er nødvendige i frontend.

Supabase Auth bruger produktionsadressen som Site URL. Både `http://127.0.0.1:5173` og `https://faa-det-gjort.vercel.app/**` er tilladte redirectadresser. ChatGPT Sites anvendes ikke som hosting.

## Afgrænsning

Forslagsmotoren bruger gemt arbejdsstatus, resttid og opgaveafhængigheder. Påmindelser, statistik og regelbaseret hurtigindtastning er implementeret uden eksterne AI- eller notifikationstjenester. Projekter og deres delopgaver indgår i den versionerede synkroniseringsmodel.

Service worker og installationsmanifest gør appskallen tilgængelig offline efter første onlinebesøg. Kontoopsætning, første login og første hentning kræver fortsat forbindelse. Synkronisering bruger fulde snapshots og polling; en cursorbaseret ændringslog og Realtime er senere transportoptimeringer.

## Dokumentation

- [Arkitektur](ARCHITECTURE.md)
- [Database og adgang](DATABASE.md)
- [Forretningsregler](BUSINESS_RULES.md)
- [Test og verifikationsgrænser](TESTING.md)
- [Afsluttende kvalitetsrapport](QUALITY_REPORT.md)
- [Pilot og idriftsættelse](RELEASE_CHECKLIST.md)
- [Dansk brugervejledning](USER_GUIDE.md)
