# Afsluttende kvalitetsrapport – fase 9

Den automatiske kontrol blev gennemført 13. oktober 2026 på produktionsbygningen af Få det Gjort 0.9.1. Vercel-deployment og Supabase-produktionsopsætning blev verificeret 15. oktober 2026.

## Resultat

| Område         | Gennemført kontrol                                                                                                      | Resultat                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Funktion       | Opgaver, forslag, kø, timer, gentagelser, projekter, historik, påmindelser og statistik                                 | Bestået                                       |
| Integration    | IndexedDB, repository, backup, SQL-migrationer og simuleret synkronisering                                              | 108 Vitest-tests bestået                      |
| End-to-end     | Samlede brugerforløb i produktionsbygningen                                                                             | 42 Playwright-forløb bestået                  |
| Offline        | Cachet appskal, kold genindlæsning, lokal oprettelse/arbejde og senere synkronisering                                   | Bestået                                       |
| Responsivitet  | Alle seks hovedsider i desktop- og iPhone 13-størrelse uden vandret overløb                                             | Bestået                                       |
| Tilgængelighed | Dansk dokument, hovedoverskrift, navngivne kontroller, entydige ID'er, springlink, tastaturfokus og reduceret bevægelse | Bestået                                       |
| Performance    | 742,10 kB JavaScript (214,07 kB gzip) og 39,58 kB CSS (9,46 kB gzip) i deployment-buildet                              | Vite-advarsel: hovedchunk over 500 kB          |
| Sikkerhed      | CSP, transportheaders, XSS-test, backupvalidering, RLS-gennemgang og produktionsaudit                                   | Bestået; ingen kendte afhængighedssårbarheder |

## Sikkerhedsbeslutninger

- Browseren må kun indlæse lokale scripts, styles og workers. Netværksforbindelser er begrænset til samme oprindelse og Supabase.
- Hemmelige servernøgler må ikke placeres i `VITE_`-variabler. Frontend bruger kun en offentlig publishable key, mens PostgreSQL RLS beskytter husstandsdata.
- Brugerinput vises som React-tekst. Et aktivt HTML/XSS-testinput blev gemt og genåbnet uden kodeudførelse.
- Backupfiler har en grænse på 20 MB og valideres for format, typer, relationer, husstand og bruger før import.
- Konfliktdata bevares, og arbejdsstatus kan ikke tvinges tilbage over serverens fælles version.

## Verifikationsgrænser

Fysiske iPhones, iPads og Android-enheder er ikke en del af den automatiske kørsel. Første rigtige loginmail og pilothusstanden er afprøvet, mens den anden eksterne konto og synkronisering mellem fysiske enheder endnu ikke er gennemført. En manuel WCAG 2.2 AA-gennemgang med VoiceOver/TalkBack og længere belastningstest bør udføres før version 1.0. Hovedchunkens størrelse bør samtidig reduceres med kodeopdeling og efterfølgende måling på fysiske enheder.

Supabase-pilotprojektet blev tilsluttet 13. oktober 2026. Alle fem migrationer blev anvendt, og en livekontrol viste 18 af 18 applikationstabeller med RLS. Security Advisor viste ingen fejl. De tilbageværende advarsler om SECURITY DEFINER gælder appens bevidst autoriserede RPC'er; direkte API-adgang til Supabases automatiske RLS-hjælpefunktion blev tilbagekaldt i migration 005.

Den 15. oktober 2026 blev commit `dcf9d95` deployet fra det private GitHub-repository til `https://faa-det-gjort.vercel.app`. Den offentlige side svarede med HTTP 200. Vercel leverede den konfigurerede CSP samt HSTS, Permissions-Policy, Referrer-Policy, X-Content-Type-Options og X-Frame-Options. Supabase Auth blev sat til produktionsadressen, mens localhost blev bevaret til udvikling.

## Gentag kontrollen

```sh
pnpm verify
pnpm audit --prod --audit-level high
```
