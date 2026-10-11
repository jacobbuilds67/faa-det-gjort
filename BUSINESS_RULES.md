# Forretningsregler

## Implementeret

- Tidsestimat er heltal 1–10.080 minutter. Titel er trimmet og 1–160 tegn.
- Mindst én lokation; alle referencer skal eksistere i samme husstand.
- Deadline må ikke ligge før startdato. Overskredet er beregnet og medfører aldrig automatisk sletning.
- Arkivering er eksplicit og reversibel. Arkiv er adskilt fra afslutning og tæller ikke som udførelse.
- Forsiden filtrerer efter tilgængelig tid, aktuel startdato og lokation. Den viser højst fem opgaver; registeret viser alle matchende. Forsiden sorteres efter relevansscore. Registeret sorteres nyeste først.
- Lokationsuafhængige opgaver matcher alle lokationsfiltre.
- Grundprioriteten ændres kun af brugeren.
- Lokal prøvebrug er adskilt fra kontodata. Intet eksempelindhold oprettes uden brugerens handling.
- Forældede redigeringsformularer afvises lokalt. Serverversioner forhindrer tavs overskrivning fra andre enheder.
- Ingen hard delete af opgaver. Ingen automatisk opgavestart.

## Implementeret forslagsmotor

Prioritering: 60/30/10 grundpoint; én deadlinebonus (forsinket 50 + 2 pr. dag, højst 80; i dag 45; inden 3 dage 30; inden 7 dage 15); aktuel gentagelse +10; tidsmatch 20 × resttid/ledig tid. Tie-break: deadline, startdato, ID. Blokerede opgaver udelades. Opbrugt estimat kræver brugerens restestimat.

Driftsoplysninger om resttid, afslutning, afhængigheder og gentagelsesaktualitet leveres via et eksplicit interface. Reglerne er unit-testet; lagringsintegration leveres i fase 4–6. Der opfindes ingen igangværende opgaver eller gentagelser i brugerfladen.

## Godkendt mål for kommende faser – ikke implementeret endnu

Gentagelse: højst én åben forekomst. Fast kalender beholder anker. Næste forekomst ligger efter både den gamle planlagte dato og afslutningen. Udførelsesbaseret interval tæller fra afslutning, og ved overspringning fra overspringningsdato. Månedsultimo og skudår håndteres som kalenderdatoer, ikke faste timer.

Sæsoner: juni forsvinder ikke i september. Efter afslutning af juni i september kan september åbne. Passerede perioder, der blev holdt tilbage af en ældre åben forekomst, får særskilt historik, uden at blive registreret som udført eller bruger-sprunget-over.

Kø: personlig, vedvarende, refererer til forekomst. Afslutning fjerner den forekomst fra aktive køer med forklaring; næste opgave starter ikke automatisk.

Timer: tidsstemplede arbejdsintervaller. Korrektioner bevarer audit og opdaterer alle beregninger fra samme datakilde. Gentagelsesændringer må aldrig overskrive historiske udførelser.

Afhængigheder: ingen kredsløb; servervalidering atomisk. To helt offline personer kan fysisk starte samme arbejde; synkronisering må kun acceptere én afslutning og skal bevare begge personers registreringer til afklaring.
