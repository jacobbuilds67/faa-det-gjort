# Arkitektur

React-grænsefladen bruger domænefunktioner og Dexie-transaktioner oven på browserens IndexedDB. Live queries opdaterer visningen direkte, når lokale data ændres.

Der findes ingen login-, server- eller databaseforbindelse. Hver browser får en lokal brugeridentitet og en personlig kø. Alle øvrige poster tilhører det faste lokale familierum.

Familiebackup er appens transportlag mellem enheder:

1. Eksport validerer og serialiserer hele datasættet.
2. Import validerer format, relationer og familie-id.
3. Standardnavne matches og referencer omskrives ved behov.
4. Nye poster indsættes; en eksisterende post erstattes kun af en nyere ændringstid eller version.
5. Tids- og arbejdshændelser er uforanderlige og deduplikeres på id.

Vite bygger statiske filer. GitHub Actions tester og udgiver dem til GitHub Pages. Service workeren beregner sin basissti fra eget scope, så appen virker både lokalt og under repository-stien.
