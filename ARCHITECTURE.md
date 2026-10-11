# Arkitektur

## Lag

React → domænevalidering → Dexie-transaktion (data + outbox) → Supabase RPC → PostgreSQL.
UI læser altid fra IndexedDB via live queries. Lokal prøvebrug har egen afgrænset database og ingen serverkommandoer. Kontodatabaser navngives efter bruger og husstand. Login bruger Supabase Auth og offentlig publishable key.

- `src/App.tsx`: autentifikation og husstandsvalg.
- `src/features/Workspace.tsx`: applikationsskal og kobling til lokale data.
- `src/features/TaskOverview.tsx`: startside og register.
- `src/components/`: editor, kort, login og indstillinger.
- `src/domain/suggestions.ts`: ren, deterministisk prioritering med eksplicit dato og runtimeinterface.
- `src/domain/model.ts`: typer, Zod-validering og grundlæggende visningsregler.
- `src/data/db.ts`: lokalt schema og standarddata.
- `src/data/repository.ts`: atomiske lokale ændringer; ingen serverkald i transaktioner.
- `src/data/sync.ts`: idempotente kommandoer, snapshots, konflikter og rebase af lokale følgehendelser.
- `supabase/migrations`: normaliseret servermodel og autoriserede RPC'er.

## Beslutning: gradvis synkroniseringsleverance

Designoplæggets mål er en vedvarende, transaktionelt ordnet ændringslog pr. husstand. Fase 2 bruger fulde autoriserede snapshots ved opstart, synlig side, netværkstilbagekomst og hvert 20. sekund. For to brugere er det en enkel, testbar første transport. Outbox, kommando-ID'er, versionskontrol og datalag bevares, når snapshottransporten erstattes i fase 7.

Et snapshot overskriver aldrig entiteter med ventende kommandoer eller konflikter. Serveren serialiserer mutationer med lås på husstanden. Web Locks forhindrer samtidige synkroniseringskørsler fra flere faner, når API'et er tilgængeligt. Serverens idempotens gælder også uden denne API.

Kommandoerne bevarer lokal rækkefølge med monotont stigende lokale oprettelsestider. Efter serverkvittering rebases senere lokale ændringer af samme entitet til den accepterede version. Netværksfejl lader outbox stå urørt. Et mistet svar kan genforsøges med samme kommando-ID.

Versionskonflikter bevarer lokal værdi, oprindelig kommando og serverværdi. Valget kræver forbindelse, så serverens konfliktarkiv gemmer begge versioner inden lokal afklaring. Et lokalt auditarkiv bevares også i preferences. Andre entiteter kan fortsat synkroniseres.

## Offlinegrænse i fase 2

Opret/rediger i en allerede indlæst app virker uden netværk. Appens filer caches endnu ikke af en service worker. Kold offline-opstart er derfor en senere PWA-leverance. Et tidligere indlæst kontomedlemskab kan bruges fra lokal cache uden netværk; det er aldrig autorisation til serveradgang. RLS/RPC kontrollerer medlemskab ved hvert serverkald.

Fase 7 skal bl.a. implementere servercursor, tombstones, genoptagelige snapshots, indhentning af konfliktarkiv på andre enheder, fuld migrering/import/eksport, genautentifikation efter udløbet session og kontrolleret håndtering af tilbagekaldt medlemskab. Tilbagekaldelse kan ikke opdages på en helt offline enhed.

## Design

Farver er samlet i CSS-variabler. Skovgrøn dominerer handlinger; terrakotta og salvie bruges sparsomt. Systemskrifter kræver ingen ekstern fonttjeneste. Planteillustrationen er CSS. Dialogen er native HTML dialog med tastaturfokus og Escape. Layout har desktopsidebar, mobilbundnavigation og reduced-motion-regel.

Mørkt tema, samlet WCAG-audit og systematisk fokusretur ved alle navigationsskift er kommende forbedringer; nuværende responsive tests er ikke en WCAG-certificering.

## Næste leverancer

3. Score og forklaringer er leveret. Runtimeadaptere til kø, forekomster og afhængigheder tilkobles i fase 4–6.
4. Personlige køer, timerintervaller og korrektioner.
5. Versionerede gentagelser og historiske forekomster.
6. Projekter og kredsløbsfri afhængigheder.
7. Fuldt offline/PWA-, sync- og backupforløb.
8. Påmindelser, statistik og regelbaseret tekstindtastning.
9. Samlet accepttest, sikkerheds- og performancekontrol på faktiske enheder.
