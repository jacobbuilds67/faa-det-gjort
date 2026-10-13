# Teststrategi og gennemført kontrol

Kontrol udført 13. oktober 2026 for fase 2–9.

## Automatiseret

| Område                                | Resultat         |
| ------------------------------------- | ---------------- |
| TypeScript og produktionsbuild        | Bestået          |
| Domæneregler, Vitest                  | 16 tests bestået |
| Forslagsmotor, Vitest                 | 23 tests bestået |
| Gentagelser, Vitest                   | 8 tests bestået  |
| Dexie/repository                      | 12 tests bestået |
| Sync med simuleret RPC                | 11 tests bestået |
| Kø, timer og Dexie-opgraderinger      | 11 tests bestået |
| SQL, migrationer og adgang i PGlite   | 18 tests bestået |
| Backupformat og atomisk import        | 3 tests bestået  |
| Hurtig oprettelse og indsigt          | 6 tests bestået  |
| Playwright, desktop og mobilstørrelse | 42 tests bestået |

I alt 108 Vitest-tests og 42 browserforløb. Browserforløbene bruger isolerede Chrome-kontekster på desktop og iPhone 13-størrelse. Det er ikke en test på fysisk iPhone eller Safari. E2E kører mod produktionsbygningen på port 4173.

Fase 9 tilføjer ti browserkontroller på tværs af desktop og mobil. De gennemgår alle hovedsider for navngivne kontroller, entydige ID'er, korrekt hovedoverskrift, springlink, synligt tastaturfokus og vandret overløb. Derudover kontrolleres reduceret bevægelse, sikker tekstvisning af et aktivt XSS-testinput, browserens sikkerhedsmetadata og et buildbudget på 550 kB JavaScript og 60 kB CSS.

Produktionsbygningen er 508,51 kB JavaScript og 39,58 kB CSS før transportkomprimering; JavaScript er 153,30 kB gzip. `pnpm audit --prod --audit-level high` fandt ingen kendte sårbarheder den 13. oktober 2026.

## Dækning

Domæne og repository kontrollerer oprettelse, validering, filtre, deterministisk score, lokale transaktioner og genåbning. Kø/timer kontrollerer flere arbejdsintervaller, tidsrettelse, restestimat, én timer pr. bruger, ingen automatisk opgavestart, personlig kø og bevaring af data ved opgradering fra Dexie version 1 og 2.

Gentagelser testes for faste og udførelsesbaserede intervaller, månedsslut, skudår, aktive måneder, ugedage, perioder over nytår, overlappende sæsoner og Copenhagen-dato. Paritetstests sammenligner browserens og PostgreSQL's første/næste perioder og holdte sæsonperioder.

PGlite kører de faktiske SQL-migrationer med simuleret auth.users/auth.uid() og anon/authenticated-roller. Migration 003 testes med en eksisterende afsluttet fase-4-opgave. Testene kontrollerer husstandsadgang, personlige køer, ingen direkte writes, idempotens, ugyldige regler, versionskonflikter, gamle forekomst-ID'er, dobbelt afslutning, audit og historiske tidskorrektioner. Dette erstatter ikke Supabase Auth, HTTP/PostgREST, mail eller en ekstern instans.

Sync-testene dækker snapshotbeskyttelse, netværksfejl, rebase uden sammenblanding af task/work, konfliktarkivering, afslutning efterfulgt af historisk rettelse og bevaring af et afvist offlineforløb før lokal oprydning. Det samlede offlineforløb opretter, starter og afslutter uden RPC, går online og sender kommandoerne i rækkefølge.

Backup-testene kontrollerer komplet eksport/gendannelse af projekter, opgaver, kø, arbejde, historik, hændelser og indstillinger, sikker fletning uden overskrivning samt afvisning af ugyldig fil, forkert husstand og brudte referencer. Browserforløbet downloader en rigtig backup, ændrer databasen, gennemser importen og kræver bekræftelse før fuld erstatning.

Browserforløbene kontrollerer oprettelse/redigering/arkivering, filtre, lokations-/kategoriadministration, netværksafbrydelse, køens rækkefølge og genåbning, muse- og touchtræk, pause/genoptagelse, tidsrettelse og afslutning. Gentagelsesforløbene opretter og afslutter gentagelser, retter tidligere tid, genåbner appen, ændrer titel og springer en forsinket sæsonforekomst over. Historiske titler og tider bevares.

Projektforløbet opretter et projekt og to delopgaver, binder B til A, kontrollerer tydelig ventestatus og låst start i køen, afslutter A og ser B blive frigivet. Fremdriften skifter fra 0 til 50 procent og bevares efter genåbning. Repository- og SQL-testene afviser kredsløb atomisk; SQL-testen kontrollerer desuden projektsnapshot og serverens startblokering.

PWA-forløbet kontrollerer manifestet, venter på en aktiv service worker og verificerer de byggede JS/CSS-ressourcer i Cache Storage. Derefter oprettes en opgave, forbindelsen afbrydes, siden genindlæses koldt, og opgaven vises fra IndexedDB på både desktop og mobilstørrelse.

Fase 8-testene kontrollerer fortolkning af minutter/timer, lokation, kategori, prioritet og ugentlig gentagelse samt tydelige standarder ved usikker tekst. Påmindelser testes for prioriteret forsinkelse, nært forestående deadline og aktuel gentagelse. Statistik testes for periode, bruger, lokation, historiske snapshots og udelukkelse af overspringninger fra arbejdstid. Browserflowene gennemser hurtigoprettelsen før gemning, bevarer påmindelsesvalg, afslutter og korrigerer arbejde samt kontrollerer statistik og søgbar historik på desktop og mobil.

## Kommandoer

```sh
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:quality
pnpm verify
```

Installeret Chrome kan bruges med `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`.

## Visuel kontrol

Startside og editor er tidligere kontrolleret i Codex-browseren ved 1440×1000 og 390×844. Kø, gentagelseshistorik, projektvisning og fase 8-historik er gennemset på Playwright-screenshots i desktop- og mobilstørrelse. Billeder ligger i `../outputs/hverdagsro/` som `queue-*`, `recurrence-*`, `projects-*` og `phase8-*`.

## Ikke verificeret endnu

- Rigtige loginmails, udløbne sessioner og synkronisering mellem eksterne enheder.
- Fysisk iPhone/iPad, Safari og Android.
- Fysisk installation fra browserens installationsdialog, browser-eviction og langtidsopgradering af service worker.
- Systemnotifikationer på fysisk iPhone/iPad og Android, herunder operativsystemets baggrundsbegrænsninger.
- Backup på tværs af fysiske browsere/enheder og meget store datasæt tæt på filgrænsen.
- Fuld manuel WCAG 2.2 AA-gennemgang med skærmlæsere samt belastnings-/langtidstest. Fase 9 automatiserer de centrale struktur-, tastatur-, bevægelses- og responsive kontroller.

## Accepttestplan fra masterprompten

1. Find efter tid: filtre, score, vedvarende arbejdsstatus/resttid og projektafhængigheder testet.
2. Gem kø: rækkefølge, tidsramme og genåbning består.
3. Én forsinket bilvask: domæne, repository og browser testet.
4. Afslut tilbagevendende opgave: næste dato, historik og idempotens testet.
5. Spring over: særskilt status, efterfølger og historik testet.
6. Timerkorrektion: aktuel og historisk tid samt genåbning testet.
7. Projektafhængighed: bestået i repository, SQL og browser på desktop/mobil.
8. Offline opret/start/afslut/sync: samlet lokal/simuleret transport testet; ekstern Supabase kræver et tilsluttet testprojekt.
9. To brugere: databaseadgang, køer og afslutning isoleret testet; fuldt brugerforløb kræver Supabase.
10. Sæsonopgave: juni/september, forsinkelse og holdte perioder testet.
11. Konflikt: motor, bevaring og SQL testet; det fysiske to-enhedsforløb i det tilsluttede Supabase-pilotprojekt mangler endnu.
12. Backup/gendannelse: komplet eksport, validering, gennemgang, fletning og bekræftet erstatning testet.
