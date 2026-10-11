# Database

## Implementeret schema

`users` refererer til `auth.users`. `households` og `household_members` definerer fællesskabet. `household_invites` indeholder tidsbegrænsede, e-mailbundne invitationer, der indløses ved login. Version 1's UI vælger én husstand; flere husstande pr. konto kræver senere valggrænseflade.

`tasks` indeholder opgavens basisdata. `task_locations` normaliserer mange-til-mange-relationen. `task_occurrences` indeholder datoer og livscyklus. Et partielt unikt indeks tillader kun én åben/igangværende/pauset forekomst pr. opgave. Fase 2 opretter en enkelt åben forekomst og har endnu ingen afslutningshandling.

`locations` og `categories` har navne, versioner og unikke navne pr. husstand. Lokationsuafhængighed er en egenskab, ikke et bestemt tekstnavn. `task_history` gemmer før/efter ved opgavemutationer. `processed_commands` sikrer idempotens. `sync_conflicts` bevarer konfliktkommando, serverversion og senere resolution med den lokale version.

Lokalt bruges Task som læseprojektion med `locationIds`, `startDate` og `deadline`. Serveren konverterer projektionen til de normaliserede tabeller i samme transaktion. Dette er ikke et løfte om, at lokal og central fysisk datamodel er identiske.

## Adgang

Alle tabeller har RLS. `anon` har ingen adgang til forretningsdata. `authenticated` har alene SELECT og eksplicit tilladte RPC-kald; direkte DML er tilbagekaldt.

Husstandsmedlemmer kan læse fælles data. Kun ejeren kan invitere. Kommandoer og konflikter er kun læsbare af ophavsbrugeren i en husstand, brugeren stadig tilhører. Profiler vises kun for sig selv og fælles husstandsmedlemmer.

SECURITY DEFINER-funktioner har tom search_path og fuldt kvalificerede objektreferencer. Hver mutation kontrollerer auth.uid(), medlemskab, identitet, baseversion, relationer og databegrænsninger. Kompositte fremmednøgler forhindrer lokationer, kategorier og ansvarlige på tværs af husstande. Ingen frontendservice-nøgle.

## RPC

- `my_household`: indløser gyldige invitationer og returnerer husstand/medlemmer.
- `create_household`: opretter standarddata atomisk, idempotent for eksisterende medlem.
- `invite_member`: ejerregistreret invitation, gyldig i syv dage; ingen afsendelse af mail.
- `household_snapshot`: medlemsbeskyttet snapshot af opgaver/lokationer/kategorier.
- `apply_command`: task/location/category-mutation med versionskontrol og idempotens.
- `record_conflict_resolution`: gemmer brugerens løsning og begge versioner til audit.

## Migrationer og næste tabeller

Migration 001 er testet i isoleret PostgreSQL/PGlite med et lille Supabase Auth-testshim; den er ikke kørt mod et eksternt Supabase-projekt. Anvend den kun én gang i et rent testmiljø. Fremtidige ændringer får nye nummererede migrationer. Redigér ikke allerede anvendte migrationer. Datamigrationer og Dexie-opgraderinger skal have tests med eksisterende data.

De kommende faser tilføjer RecurrenceRules, Projects, TaskDependencies, TaskQueues, TaskQueueItems, TimeEntries, Notifications, UserPreferences på serveren og cursorbaseret ChangeLog. De er bevidst ikke oprettet som ubrugte tomme tabeller i fase 2.
