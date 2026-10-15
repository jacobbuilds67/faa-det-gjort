# Få det Gjort

Dansk, offline opgaveapp til hjemmet. Appen kræver ingen konto eller fælles database. Opgaver, projekter, kø, timere, historik og indstillinger gemmes i browserens IndexedDB.

## Kom i gang

På denne Mac kan start-lokalt.command åbnes fra Finder. Ved en almindelig installation kræves Node.js 22+ og pnpm:

    pnpm install --frozen-lockfile
    pnpm dev

Appen åbner direkte i det lokale arbejdsrum. Åbn ikke index.html som en fil; Vite skal bygge eller servere appen.

## Familiebackup

Under **Indstillinger → Familiebackup** kan hele familiens datasæt eksporteres som én JSON-fil. Filen kan gemmes som sikkerhedskopi, gendanne alle lokale data efter tydelig bekræftelse eller flettes på en anden enhed.

Ved fletning tilføjes manglende poster. Når samme post findes på begge enheder, bruges den senest ændrede version. Nyere lokale rettelser bevares. Standardlokationer, kategorier og projekter med samme navn matches, så de ikke fordobles. Hver browser har sin egen brugeridentitet og personlige kø; kendte familiemedlemmer følger med i backupen.

En backup fra den tidligere Supabase-udgave kan importeres direkte. Importen flytter posterne til det lokale familie-id, så eksisterende data kan bevares ved skiftet til GitHub Pages.

Delingen er manuel. Der er ingen automatisk realtidssynkronisering, og ingen personlige data sendes til GitHub.

## Funktioner

- Opgaver, prioritet, estimat, lokationer, kategorier, datoer og ansvarlig.
- Forslag efter tid, sted, prioritet og deadline.
- Personlig kø, timer, pauser, afslutning og tidsrettelse.
- Gentagelser, sæsonperioder, overspringning og historik.
- Projekter, delopgaver og afhængigheder.
- Påmindelser og statistik.
- Installerbar PWA, der virker offline efter første besøg.
- Familiebackup med kontrolleret fletning og fuld gendannelse.
- JM MicroApps-branding.

## Test

    pnpm test
    pnpm build
    pnpm exec playwright install chromium
    pnpm test:e2e
    pnpm release:check

## GitHub Pages

.github/workflows/pages.yml bygger, tester og udgiver dist ved push til main. I repositoryets **Settings → Pages** vælges **GitHub Actions** som kilde. Vite bruger relative aktivstier, så PWA, logo og service worker virker under projektadressen https://jacobbuilds67.github.io/faa-det-gjort/.

GitHub Pages hoster kun de statiske appfiler. Brugerens IndexedDB og eksporterede backupfiler bliver på brugerens egne enheder.

## Dokumentation

- [Arkitektur](ARCHITECTURE.md)
- [Lokal datamodel](DATABASE.md)
- [Forretningsregler](BUSINESS_RULES.md)
- [Test](TESTING.md)
- [Udgivelse](RELEASE_CHECKLIST.md)
- [Brugervejledning](USER_GUIDE.md)
