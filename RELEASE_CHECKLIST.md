# Pilot og idriftsættelse

Fase 2–9 er teknisk afsluttet. Denne checkliste fører version 0.9.1 gennem en lukket pilot, før den eventuelt mærkes 1.0.0.

## 1. Supabase-testprojekt

- Opret et separat Supabase-projekt i EU-regionen.
- Anvend migrationerne `001_foundation.sql` til `004_projects.sql` i nummerorden.
- Aktivér e-mail-login, sæt appens lokale og senere offentlige adresser under Auth URL Configuration, og konfigurér en mailafsender.
- Kopiér kun projektets URL og **publishable key** til `.env`. Brug aldrig secret key eller service-role key i frontend.
- Kør `pnpm release:check` og derefter `pnpm verify`.

## 2. Lukket to-bruger-pilot

- Opret en ny testhusstand med bruger A, og registrér bruger B via Indstillinger.
- Kontrollér fælles oprettelse, redigering, afslutning og historik på to enheder.
- Kontrollér, at hver bruger beholder sin egen kø.
- Redigér samme opgave offline på begge enheder, gå online, og gennemfør konfliktvalget.
- Eksportér en backup på enhed A og gendan den i et rent browsermiljø for samme bruger og husstand.

## 3. Fysiske enheder

- iPhone/iPad Safari: installation, kold offlineåbning, rotation, tastatur og systemnotifikationer.
- Android Chrome: installation, kold offlineåbning og systemnotifikationer.
- Desktop Chrome/Safari: tastaturnavigation, zoom til 200 procent og backupdownload/import.
- VoiceOver eller TalkBack: overskrifter, knapper, dialog og statusbeskeder.

## 4. Vercel-pilot

- Forbind repositoryet til Vercel. `vercel.json` indeholder buildvalg og sikkerhedsheaders.
- Opret `VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY` som projektvariabler i Vercel.
- Deploy først som preview, tilføj previewadressen i Supabase Auth og gentag de kritiske brugerforløb.
- Kontrollér HTTPS, manifest, service worker, sikkerhedsheaders og offlineåbning på den offentlige adresse.

## 5. Godkendelse til 1.0

Version 1.0.0 sættes først, når to-bruger-piloten, de fysiske enheder, backupgendannelse og previewdeployment er godkendt. Gem resultater og eventuelle kendte begrænsninger i `QUALITY_REPORT.md`.
