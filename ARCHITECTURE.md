# Arkitektur

## Lag

React → domænevalidering → Dexie-transaktion (data + outbox) → Supabase RPC → PostgreSQL.
UI læser altid fra IndexedDB via live queries. Lokal prøvebrug har egen afgrænset database og ingen serverkommandoer. Kontodatabaser navngives efter bruger og husstand. Login bruger Supabase Auth og offentlig publishable key.

- `src/App.tsx`: autentifikation og husstandsvalg.
- `src/features/Workspace.tsx`: applikationsskal og kobling til lokale data.
- `src/features/TaskOverview.tsx`: startside og register.
- `src/components/`: editor, kort, login og indstillinger.
- `src/domain/suggestions.ts`: ren, deterministisk prioritering med eksplicit dato og runtimeinterface.
- `src/domain/quickAdd.ts`: lokal, deterministisk fortolkning af titel, tid, lokation, kategori, prioritet og enkel gentagelse.
- `src/domain/insights.ts`: rene beregninger til påmindelser, statistik, filtre og historik.
- `src/domain/model.ts`: typer, Zod-validering og grundlæggende visningsregler.
- `src/data/db.ts`: lokalt schema og standarddata.
- `src/data/repository.ts`: atomiske lokale ændringer; ingen serverkald i transaktioner.
- `src/data/sync.ts`: idempotente kommandoer, snapshots, konflikter og rebase af lokale følgehendelser.
- `src/data/backup.ts`: valideret, atomisk eksport/import med referencekontrol.
- `public/service-worker.js`: versioneret cache af den byggede appskal og offline-navigation.
- `supabase/migrations`: normaliseret servermodel og autoriserede RPC'er.

## Beslutning: gradvis synkroniseringsleverance

Designoplæggets mål er en vedvarende, transaktionelt ordnet ændringslog pr. husstand. Den nuværende transport bruger fulde autoriserede snapshots ved opstart, synlig side, netværkstilbagekomst og hvert 20. sekund. For to brugere er det en enkel, testbar transport. Outbox, kommando-ID'er, versionskontrol og datalag kan bevares, når snapshottransporten senere erstattes af en cursorbaseret ændringslog.

Et snapshot overskriver aldrig entiteter med ventende kommandoer eller konflikter. Serveren serialiserer mutationer med lås på husstanden. Web Locks forhindrer samtidige synkroniseringskørsler fra flere faner, når API'et er tilgængeligt. Serverens idempotens gælder også uden denne API.

Kommandoerne bevarer lokal rækkefølge med monotont stigende lokale oprettelsestider. Efter serverkvittering rebases senere lokale ændringer af samme entitet til den accepterede version. Netværksfejl lader outbox stå urørt. Et mistet svar kan genforsøges med samme kommando-ID.

Versionskonflikter bevarer lokal værdi, oprindelig kommando og serverværdi. Valget kræver forbindelse, så serverens konfliktarkiv gemmer begge versioner inden lokal afklaring. Et lokalt auditarkiv bevares også i preferences. Andre entiteter kan fortsat synkroniseres.

## Offline og installation i fase 7

Opret/rediger/start/pause/afslut virker uden netværk. Service workeren cacher den versionerede produktionsskal, så appen kan genåbnes koldt efter første onlinebesøg. IndexedDB er fortsat datakilden. En `online`-hændelse udløser synkronisering af outbox og efterfølgende snapshot. Et tidligere indlæst kontomedlemskab kan bruges fra lokal cache uden netværk; det er aldrig autorisation til serveradgang. RLS/RPC kontrollerer medlemskab ved hvert serverkald.

Backupformatet har navn og versionsnummer, kontrollerer størrelsesgrænser, dubletter, husstand og referencer og importerer i én Dexie-transaktion. Fletning tilføjer kun manglende ID'er; fuld erstatning kræver et særskilt brugercheck. Tilbagekaldelse af medlemskab og en udløbet session kan ikke opdages på en helt offline enhed.

## Design

Farver er samlet i CSS-variabler. Skovgrøn dominerer handlinger; terrakotta og salvie bruges sparsomt. Systemskrifter kræver ingen ekstern fonttjeneste. Planteillustrationen er CSS. Dialogen er native HTML dialog med tastaturfokus og Escape. Layout har desktopsidebar, mobilbundnavigation og reduced-motion-regel.

Mørkt tema, samlet WCAG-audit og systematisk fokusretur ved alle navigationsskift er kommende forbedringer; nuværende responsive tests er ikke en WCAG-certificering.

## Næste leverancer

3. Score og forklaringer er leveret. Runtimeadapteren bruger arbejdsstatus, resttid og afhængigheder.
4. Personlige køer, timerintervaller og korrektioner er leveret og testet lokalt.
5. Versionerede gentagelser, sæsoner og historiske forekomster er leveret.
6. Projekter, delopgaver, fremdrift og kredsløbsfri afhængigheder er leveret.
7. Fuldt offline/PWA-, sync- og backupforløb er leveret.
8. Påmindelser, statistik, forbedret historik og regelbaseret tekstindtastning er leveret.
9. Samlet accepttest, sikkerheds- og performancekontrol er leveret på automatiserede desktop- og mobilprofiler. Fysiske enheder står tilbage før offentlig lancering.

## Påmindelser og indsigt

Påmindelser afledes af lokale Task- og WorkState-projektioner og kræver ingen separat serverentitet. Brugerens valg og fingeraftryk for allerede viste systemnotifikationer ligger i preferences og indgår i backup. Interne påmindelser er altid fallback. Systemnotifikationer kræver en udtrykkelig brugerhandling og anvender service workerens `showNotification`, når platformen understøtter det.

Statistik beregnes fra historiske WorkState-snapshots i stedet for at gemme afledte totaler. Tidskorrektioner slår derfor direkte igennem. Ved flere lokationer fordeles tiden ligeligt, så lokationssummer ikke overstiger den samlede tid. Hurtig tekstindtastning er en lokal regelmotor; den gemmer aldrig direkte, men åbner den eksisterende validerede editor med et udkast.

## Kvalitet og sikkerhed i fase 9

Den afsluttende kontrol ligger som automatiserede domæne-, database-, synkroniserings- og browserforløb. `pnpm verify` bygger produktionspakken og kører hele regressionspakken. Browserkontrollen måler et fast buildbudget og gennemgår de seks hovedsider på både desktop- og mobilprofil.

`index.html` begrænser scripts, forbindelser, billeder, formularmål og workers med Content Security Policy. Reacts tekst-rendering kombineres med en eksplicit XSS-browsertest. Backupimport valideres fortsat med Zod, størrelse, bruger, husstand og relationer før en atomisk import. Et beskadiget lokalt husstandscache-element slettes og må ikke kunne blokere opstarten.

## Produktnavn og eksisterende data

Appens navn er Få det Gjort. De eksisterende IndexedDB- og localStorage-nøgler beholder præfikset `hverdagsro`, så navneskiftet ikke afbryder adgangen til allerede gemte opgaver og indstillinger.

## Kø og arbejdsdata

`domain/work.ts` beregner elapsed/resttid og tilstandsovergange. `data/workRepository.ts` gemmer handling, arbejdsstatus, audit, køoprydning og outbox atomisk. `features/QueueView.tsx` viser kø, arbejdsvisning og afslutninger. UI-tick opdaterer kun visningen; lagringen afhænger ikke af tick eller baggrundskørsel.

Sync identificerer poster med både entitetstype og ID, fordi en engangsopgave og dens lokale arbejdsprojektion deler ID. Genafsendelse af start/pause/afslut er idempotent, og senere lokale handlinger får den senest accepterede baseversion. Serveren beregner selv intervallerne ud fra handlingerne.

## Gentagelser og forekomstidentitet

`domain/recurrence.ts` validerer regler og beregner perioder med eksplicit kalenderdato. Kalenderaritmetik bruger UTC-datoer; udførelsesdatoen afledes i Europe/Copenhagen. PostgreSQL har samme regler, og paritetstests sammenligner første/næste dato samt holdte sæsonperioder. Ingen baggrundstimer opretter gentagelser: den eneste næste åbne forekomst oprettes atomisk ved afslutning/overspringning.

Den aktuelle lokale arbejdsprojektion bevarer task_id som nøgle, mens `occurrenceId` identificerer den konkrete forekomst. Afsluttede forekomster gemmes særskilt i Dexie history med forekomst-ID som nøgle. Serveren har normaliserede forekomstrækker med eksisterende interne UUID’er og et stabilt public_id. Køelementer medsendes med deres forekomst-ID og kan ikke følge en gammel opgave ind i dens efterfølger.

En offline afslutningskommando indeholder den lokalt beregnede historik og ID for efterfølgeren. Serveren beregner selv datoer og arbejdsintervaller, kontrollerer forekomst/version og kvitterer med autoritative aktuelle data og historik. Afviste forløb og deres tidsrettelser bevares i konfliktarkivet før afklaring; snapshot fjerner derefter kun de lokale, afviste historikprojektioner. Ventende afslutningshistorik er beskyttet mod snapshotoverskrivning.

## Projekter og afhængigheder

Et projekt er en selvstændig, versioneret entitet. En delopgave er en almindelig Task med `projectId`, så kø, timer, gentagelser og prioritering genbruger samme forløb. Fremdrift beregnes fra delopgavernes arbejdsstatus og gemmes ikke som et tal, der kan blive forældet.

`dependencyIds` er opgavens lokale læseprojektion af serverens normaliserede `task_dependencies`. Repository og SQL-migration 004 validerer samme husstand, selvreference og kredsløb atomisk. Forslagsmotoren udelader ventende opgaver, køen viser årsagen, og både lokal og central arbejdsmutation afviser start, indtil alle forudsætninger er afsluttet.
