# Teststrategi og gennemført kontrol

Kontrol udført 11. oktober 2026 for fase 2 og forslagsmotoren fra fase 3.

## Automatiseret

| Område | Resultat |
|---|---|
| TypeScript typekontrol | Bestået |
| Vite produktionsbuild | Bestået |
| Domæneregler, Vitest | 16 tests bestået |
| Forslagsmotor, Vitest | 23 tests bestået |
| Dexie/repository med fake-indexeddb | 10 tests bestået |
| Syncmotor med simuleret RPC | 5 tests bestået |
| SQL-migration og databaseadgang i PGlite | 10 tests bestået |
| Playwright, desktop + mobilstørrelse | 12 tests bestået |

PGlite kører den faktiske SQL-migration med simuleret `auth.users`/`auth.uid()` og rollerne `anon`/`authenticated`. Testene kalder RPC som authenticated og efterprøver RLS, ingen direkte writes, idempotens, referencer på tværs af husstande, historik og inviteret medlem. Dette erstatter ikke integrationstest af Supabase Auth, HTTP/PostgREST, mail eller en ekstern instans.

Sync-testene dækker beskyttelse af lokale ændringer mod snapshots, ventende kommandoer ved netværksfejl, konfliktbevarelse, rebase af flere ændringer samt audit før konfliktløsning.

Playwright bruger isolerede browserkontekster med desktop og iPhone 13-størrelse i Chrome. Scenarier: oprettelse, flere lokationer, genindlæsning, redigering, arkivering/gendannelse, tids-/lokationsfiltre, lokationshukommelse, oprettelse under netværksafbrydelse, lokations-/kategoriadministration, Escape fra dialog samt horisontal overflow. Mobilstørrelse er ikke en test på en fysisk iPhone eller Safari.

## Kommandoer

```sh
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Eller med installeret Chrome: `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`.

I alt 64 Vitest-tests og 12 Playwright-tests består på den seneste bygning. E2E bruger produktionsbygningen på port 4173, så Vites automatiske genindlæsning ikke afbryder tests. En tidligere udviklingsserverkørsel blev afbrudt af en genindlæsning; produktionskørslen består uden retries.

## Visuel kontrol

Kontrolleret i Codex-browseren ved 1440×1000 og 390×844: startside, opgavekort og dialog. Opret/rediger/genindlæs/arkivér er også afprøvet gennem den synlige brugerflade. Screenshots er afleveret ved siden af projektmappen.

## Ikke verificeret endnu

- Rigtige loginmails, udløbne sessioner, invitation og synkronisering mellem eksterne enheder.
- Fysisk iPhone/iPad, Safari og Android.
- Installérbar PWA, kold offline-opstart, browser-eviction og service-worker-opgraderinger.
- Kø, timer, gentagelse, sæsoner, projekter, backup og øvrige kommende funktioner.
- Fuld WCAG 2.2 AA-gennemgang og belastnings-/langtidstest.

## Accepttestplan fra masterprompten

1. Find efter tid: grundfiltre og score testet. Afhængigheds-/statusfiltrering er testet på motorens runtimeinterface; kobling til vedvarende kø-/projektdata kommer i fase 4–6.
2. Gem kø: fase 4.
3. Én forsinket bilvask: fase 5.
4. Afslut tilbagevendende opgave: fase 5.
5. Spring over: fase 5.
6. Timerkorrektion: fase 4.
7. Projektafhængighed: fase 6.
8. Offline opret/start/afslut/sync: lokal oprettelse testet; samlet forløb fase 7.
9. To brugere: medlemskab og databaseadgang isoleret testet; fuldt brugerforløb kræver rigtig Supabase.
10. Sæsonopgave: fase 5.
11. Konflikt: motor og SQL isoleret testet; fuldt to-enhedsforløb fase 7.
12. Backup/gendannelse: fase 7.
