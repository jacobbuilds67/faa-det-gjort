# Kvalitetsrapport

Den lokale udgave fjerner login, ekstern database og automatisk serversynkronisering. Produktionsbygningen indeholder kun React, Dexie, ikoner og appens egne statiske filer.

Familiebackup validerer filformat og relationer før import. Fletning bruger nyeste ændring pr. post, matcher navngivne standarddata og deduplikerer tidshændelser. Fuld gendannelse ligger i en sammenfoldet sektion og kræver eksplicit markering.

PWA'en bruger relative stier og en scope-baseret service worker, så den kan hostes under GitHub Pages' repository-sti. JM MicroApps-logoet pakkes med offlinefilerne.

Seneste lokale kontrol: TypeScript og Vite-build bestod, 79 Vitest-tests bestod, og 42 Playwright-forløb bestod efter den afsluttende fulde kørsel.
