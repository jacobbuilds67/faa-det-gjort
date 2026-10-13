# Database

## Implementeret schema

`users` refererer til `auth.users`. `households` og `household_members` definerer fællesskabet. `household_invites` indeholder tidsbegrænsede, e-mailbundne invitationer, der indløses ved login. Version 1's UI vælger én husstand; flere husstande pr. konto kræver senere valggrænseflade.

`tasks` indeholder opgavens basisdata og en valgfri projektreference. `task_locations` og `task_dependencies` normaliserer relationerne. `projects` indeholder projektets navn, beskrivelse, arkivstatus og version. `task_occurrences` indeholder datoer og livscyklus. Et partielt unikt indeks tillader kun én åben/igangværende/pauset forekomst pr. opgave.

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
- `household_snapshot`: medlemsbeskyttet snapshot af opgaver/lokationer/kategorier/arbejdsstatus samt brugerens egen kø.
- `apply_command`: task/location/category/work/queue/history-mutation med versionskontrol og idempotens.
- `record_conflict_resolution`: gemmer brugerens løsning og begge versioner til audit.

## Migrationer og næste tabeller

Migration 001 er testet i isoleret PostgreSQL/PGlite med et lille Supabase Auth-testshim; den er ikke kørt mod et eksternt Supabase-projekt. Anvend den kun én gang i et rent testmiljø. Fremtidige ændringer får nye nummererede migrationer. Redigér ikke allerede anvendte migrationer. Datamigrationer og Dexie-opgraderinger skal have tests med eksisterende data.

Migration 004 tilføjer Projects og TaskDependencies. De kommende faser tilføjer Notifications, UserPreferences og cursorbaseret ChangeLog, når funktionerne tages i brug.

## Migration 002 – kø og tidsregistrering

Køres efter 001. Eksisterende opgaver og forekomst-ID’er bevares. `task_occurrences` udvides med arbejdsstatus, version, aktør, tidskorrektion, restestimat og afslutningsoplysninger. `time_entries` gemmer tidsstemplede intervaller med bruger. Et unikt indeks tillader højst én aktiv timer pr. bruger og ét åbent interval pr. forekomst.

`task_queues` har sammensat nøgle (husstand, bruger). `task_queue_items` gemmer rækkefølge og opgavereferencer normaliseret. RLS viser kun egen kø. Fase 4's lokale WorkState.id er task_id; den faktiske forekomst-ID på serveren ændres ikke. Fase 5 tilføjer særskilt occurrenceId og historik til dette interface.

Serveren fortolker arbejdshandlingen, tidspunktet og en eventuel korrektion; den accepterer ikke klientens liste af intervaller som autoritativ. Statuskonflikter og versionskonflikter arkiveres. Afslutning rydder opgaven ud af alle køer atomisk. Afledt fjernelse øger ikke køens redigeringsversion: senere køkommandoer filtrerer altid afsluttede opgaver fra og kan derfor ikke genindsætte dem. Eksplicitte køredigeringer har almindelig versionskontrol.

Arbejdshandlinger og rettelser gemmes i `task_history` med før/efter. De tidligere RPC-implementationer er private hjælpefunktioner uden EXECUTE for brugerne. Snapshot og mutationer kontrollerer fortsat medlemskab.

Dexie version 2 tilføjer works, queues og workEvents til den eksisterende database uden at ændre dens navn eller fjerne version 1-data. Migrationerne er testet lokalt med PGlite, ikke anvendt på en ekstern Supabase-instans.

## Migration 003 – gentagelser

Køres efter 001 og 002. `recurrence_rules` gemmer validerede regeldefinitioner i versioner pr. opgave. Definitionerne er JSONB, mens relation, version, husstand og dato er særskilte kolonner. Regler med ugyldige intervalværdier, tomme måneds-/ugedagsvalg eller overlappende sæsoner afvises atomisk. Kun autoriserede RPC'er kan ændre dem.

Forekomster får `public_id`, `is_current`, `rule_snapshot`, `task_snapshot` og `missed_periods`. Et unikt indeks sikrer én aktuel projektion; det eksisterende partielle indeks sikrer én åben forekomst. Historik og time_entries beholder deres oprindelige interne ID’er. Gamle afslutninger får en kopi af de opgaveoplysninger, der er tilgængelige ved migrationen, så efterfølgende redigeringer ikke ændrer dem.

`task_queue_items.occurrence_id` refererer til public_id. Første public_id er task_id for bagudkompatibilitet; efterfølgere får nye UUID’er. En køkommando med en gammel forekomst kan ikke indsætte efterfølgeren. Alle offentlige mutationer kontrollerer både forekomstidentitet og version; historiske tidskorrektioner har separat versionskontrol.

Dexie version 3 tilføjer history og migrerer afsluttet arbejde og gamle køreferencer uden at rydde brugerdata. Synkronisering mod en konto kræver migration 003; databasefunktioner fra de tidligere faser er private hjælpefunktioner. Migration og opgradering er testet med eksisterende afslutninger.

## Migration 004 – projekter og afhængigheder

Køres efter 003. `projects` har versioner og RLS. `tasks.project_id` knytter en almindelig opgave til et projekt, mens `task_dependencies` gemmer den rettede graf med kompositte fremmednøgler inden for samme husstand. Serverkommandoen erstatter afhængigheder atomisk og afviser selvreference, manglende opgaver og kredsløb. Start af en blokeret opgave giver en versionskonflikt i stedet for at omgå rækkefølgen.

Dexie version 4 tilføjer projekter uden at omskrive eksisterende opgaver. Task-projektionen bærer `projectId` og `dependencyIds`; snapshot og outbox synkroniserer projekter som en selvstændig entitet.

## Lokal backup i fase 7

JSON-backuppen serialiserer husstands- og brugeroplysninger samt alle lokale tabeller: opgaver, projekter, lokationer, kategorier, aktuelle og historiske forekomster, køer, arbejdshændelser, outbox, konflikter og indstillinger. Schemaet valideres med Zod før en mutation. Bruger, husstand, dublet-ID'er og alle kendte referencer kontrolleres. Erstatning rydder og genindsætter tabellerne i samme Dexie-transaktion; en valideringsfejl efterlader databasen uændret.
