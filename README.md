# Hverdagsro

Dansk, offline-orienteret opgave-app. **Leverance: fase 2 samt forslagsmotoren fra fase 3.** Appen er endnu ikke den færdige løsning fra masterprompten.

## Kom i gang

På denne Mac kan du dobbeltklikke `start-lokalt.command` i Finder. Den bruger den eksisterende Codex-runtime, hvis Node/pnpm ikke findes globalt.

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
```

Alternativt kan E2E-test bruge en installeret Chrome: `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`.

## Hvad er implementeret?

- Responsiv dansk brugerflade, desktopsidebar og mobilnavigation.
- Oprettelse/redigering, positivt tidsestimat, flere lokationer, kategori, prioritet, ansvarlig, beskrivelse og datoer.
- Søgning, tids-/lokationsfilter, beregnet forsinkelse, arkivering og gendannelse.
- Deterministisk forslagsmotor med centrale vægte for prioritet, deadlines og tidsmatch samt forklaringer på hvert forslag.
- Administration af lokationer og kategorier.
- IndexedDB med atomisk ændringskø og vedvarende lokationsvalg.
- Supabase-loginlink, husstandsoprettelse, registrering af invitationer og medlemskab.
- SQL-migration med RLS, normaliserede opgaver/lokationer/forekomster og audithistorik.
- Grundlæggende snapshotsynkronisering, versionskonflikter og eksplicit valg med bevarede konfliktdata.

## Tilslut Supabase

Der er ikke oprettet et eksternt projekt eller anvendt nøgler i denne leverance.

1. Opret et separat Supabase-testprojekt.
2. Anvend `supabase/migrations/001_foundation.sql` via migrationsværktøjet eller SQL-editoren. Migrationen forudsætter Supabase Auth, rollerne `anon`/`authenticated` og et tomt applikationsschema uden tabellerne i migrationen.
3. Kopiér `.env.example` til `.env`. Indsæt projektets URL og **publishable key**. Brug aldrig secret key eller service-role key i en `VITE_`-variabel.
4. Tillad udviklingsadressen (fx `http://127.0.0.1:5173`) og senere produktionsadressen under Auth URL Configuration. Aktivér e-mail-login. Konfigurér en egnet mailafsender før almindelig brug.
5. Genstart Vite. Log ind via e-mail, opret husstanden, og registrér den anden brugers e-mail under Indstillinger. Personen skal selv åbne appen og logge ind med den registrerede e-mail inden syv dage. **Appen sender ikke invitationsmail.**
6. Afprøv to faktiske konti og enheder, herunder afbrudte forbindelser og konflikter, før løsningen bruges til reelle husstandsdata.

Officiel dokumentation: [Supabase passwordless e-mail](https://supabase.com/docs/guides/auth/auth-email-passwordless), [API-nøgler](https://supabase.com/docs/guides/getting-started/api-keys), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Deployment

Frontend kan hostes uafhængigt på Vercel eller anden statisk hosting:

- Installationskommando: `pnpm install --frozen-lockfile`
- Buildkommando: `pnpm build`
- Outputmappe: `dist`
- Indstil de to offentlige Supabase-variabler i buildmiljøet.
- Brug HTTPS. Ingen hemmelige servernøgler er nødvendige i frontend.

Intet er deployet, og ChatGPT Sites anvendes ikke som hosting. Projektet leveres med lokal Git-versionsstyring. Forbind den valgte hostingkonto og et eventuelt GitHub-repository, når ekstern opsætning er klar; intet er pushet til GitHub.

## Afgrænsning

Forslagsmotoren er implementeret og testet. Runtimefiltrering for pause/resttid, igangværende arbejde, gentagelser og afhængigheder har et testet domæneinterface, men kobles først til vedvarende forekomster og kø-/projektdata i fase 4–6. Direkte start og tilføjelse til kø kommer med fase 4. Kø, timer, gentagelser, projekter, statistik, import/eksport og påmindelser er ikke implementeret. Kø og projekter viser ærlige informationssider.

Der er endnu ingen service worker eller installationsmanifest. Den åbnede app kan gemme uden netværk, men kold opstart/genindlæsning uden internet er ikke understøttet endnu. Synkronisering bruger fulde snapshots og polling; cursorbaseret ændringslog, Realtime, konflikter på øvrige domæner og komplet offline-recovery hører til de næste faser.

## Dokumentation

- [Arkitektur](ARCHITECTURE.md)
- [Database og adgang](DATABASE.md)
- [Forretningsregler](BUSINESS_RULES.md)
- [Test og verifikationsgrænser](TESTING.md)
- [Dansk brugervejledning](USER_GUIDE.md)
