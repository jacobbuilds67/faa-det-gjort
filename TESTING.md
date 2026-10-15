# Test

Vitest dækker domæneregler, gentagelser, forslag, kø, tid, projekter, hurtig oprettelse, statistik og familiebackup. Backup-testene kontrollerer fuld gendannelse, fletning efter ændringstid, anden bruger i samme familie og afvisning af ugyldige relationer.

Playwright kører de vigtigste forløb på desktop og mobil: opgaver, projekter, kø, timer, gentagelser, påmindelser, statistik, sikker visning af tekst, responsivt layout, kold offlinegenåbning samt eksport og gendannelse af backup.

Kør:

    pnpm test
    pnpm build
    pnpm test:e2e
    pnpm release:check

Automatiske tests kan ikke kontrollere browserens faktiske lagerpolitik, deling gennem Mail/AirDrop eller installation på enhver fysisk enhed. Afprøv derfor eksport, filoverførsel, fletning og offlinegenåbning på de telefoner og computere, familien bruger.
