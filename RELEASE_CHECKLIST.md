# Pilot og idriftsættelse

Fase 2–9 er teknisk afsluttet. Denne checkliste fører version 0.9.1 gennem en lukket pilot, før den eventuelt mærkes 1.0.0.

## 1. Supabase-testprojekt

- [x] Opret et separat Supabase-projekt i EU-regionen: **Få det Gjort Pilot**, West EU (Irland).
- [x] Anvend migrationerne `001_foundation.sql` til `005_security_hardening.sql` i nummerorden.
- [x] Aktivér e-mail-login. Brug `https://faa-det-gjort.vercel.app` som Site URL, og tillad både produktionsadressen og `http://127.0.0.1:5173` som redirectadresser.
- [x] Kopiér kun projektets URL og **publishable key** til `.env`. Secret/service-role key bruges ikke i frontend.
- [x] Verificér 18 applikationstabeller, RLS på alle 18 og Supabase Security Advisor uden fejl.
- [ ] Konfigurér en egnet mailafsender før almindelig brug.
- [x] Kør det første loginlink og opret pilothusstanden **Vores husstand** med den første ejer.
- [x] Kør `pnpm release:check`.

## 2. Lukket to-bruger-pilot

- [x] Opret pilothusstanden med bruger A, og registrér bruger B via Indstillinger.
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

- [x] Forbind det private repository `jacobbuilds67/faa-det-gjort` til Vercel. `vercel.json` indeholder buildvalg og sikkerhedsheaders.
- [x] Opret `VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY` som projektvariabler i Vercel.
- [x] Udgiv piloten på `https://faa-det-gjort.vercel.app`, og tilføj adressen i Supabase Auth.
- [x] Kontrollér HTTPS, HTTP 200 og CSP-, HSTS-, Permissions-Policy-, Referrer-Policy-, X-Content-Type-Options- og X-Frame-Options-headers på den offentlige adresse.
- [x] Kontrollér manifest, service worker og kold offlineåbning i automatiske desktop- og mobilprofiler.
- Gentag offlineåbning og de kritiske brugerforløb på de fysiske pilotenheder.

## 5. Godkendelse til 1.0

Version 1.0.0 sættes først, når to-bruger-piloten, de fysiske enheder, backupgendannelse og produktionsdeployment er godkendt. Gem resultater og eventuelle kendte begrænsninger i `QUALITY_REPORT.md`.
