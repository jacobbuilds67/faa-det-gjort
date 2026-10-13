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
- Offlineændringer gemmes atomisk sammen med deres outboxkommando. Netværkstilbagekomst udløser synkronisering; konflikter bevarer både lokal kommando og serverversion.
- Backupimport accepterer kun det versionerede Få det Gjort-format fra samme husstand. Fletning overskriver ikke eksisterende ID'er. Erstatning kræver eksplicit bekræftelse og gennemføres atomisk.
- Hurtig tekstfortolkning må kun foreslå felter. Brugeren gennemser og godkender altid den almindelige validerede opgaveformular før gemning; usikre felter får en forklaring og sikre standarder.
- Interne påmindelser virker uden tilladelse. Systemnotifikationer er valgfri og vises højst én gang pr. opgavehændelse. En forsinket opgave forbliver aktiv.
- Statistik er afledt af bevaret historik. Overspringninger tæller ikke som udførte opgaver eller arbejdstid, og tidskorrektioner opdaterer visningen uden at omskrive opgavens estimat.

## Implementeret forslagsmotor

Prioritering: 60/30/10 grundpoint; én deadlinebonus (forsinket 50 + 2 pr. dag, højst 80; i dag 45; inden 3 dage 30; inden 7 dage 15); aktuel gentagelse +10; tidsmatch 20 × resttid/ledig tid. Tie-break: deadline, startdato, ID. Blokerede opgaver udelades. Opbrugt estimat kræver brugerens restestimat.

Driftsoplysninger om resttid, afslutning, afhængigheder og gentagelsesaktualitet leveres via et eksplicit interface. Status og resttid er koblet til vedvarende arbejdsdata, og projektafhængigheder filtrerer blokerede opgaver fra. Der opfindes ingen igangværende opgaver eller gentagelser i brugerfladen.

## Gentagelsesregler – implementeret i fase 5

Gentagelse: højst én åben forekomst. Fast kalender beholder anker. Næste forekomst ligger efter både den gamle planlagte dato og afslutningen. Udførelsesbaseret interval tæller fra afslutning, og ved overspringning fra overspringningsdato. Månedsultimo og skudår håndteres som kalenderdatoer, ikke faste timer.

Sæsoner: juni forsvinder ikke i september. Efter afslutning af juni i september kan september åbne. Passerede perioder, der blev holdt tilbage af en ældre åben forekomst, får særskilt historik, uden at blive registreret som udført eller bruger-sprunget-over.

Projektafhængigheder: en opgave kan først startes, når alle forudsætninger er afsluttet. Ingen selvreference eller kredsløb; klient- og servervalidering er atomisk. To helt offline personer kan fysisk starte samme arbejde; synkronisering må kun acceptere én afslutning og skal bevare begge personers registreringer til afklaring.

## Implementeret i fase 4

- Personlig kø med deduplikering, rækkefølge og budget 1–10.080 minutter. Budget er vejledende.
- Én kørende opgave pr. bruger; en anden brugers aktive opgave kan ikke overtages. Afsluttede opgaver kan ikke afsluttes igen.
- Timer bruger epoch-millisekunder og intervaller; genåbning genskaber tiden. Baglæns ur ved start/stop afvises.
- Pause bevarer tid og status. Afslutning fjerner opgaven fra køer og gemmer dato/bruger. Ingen automatisk start af næste opgave.
- Spring over i en engangskø betyder pause og fjernelse fra egen kø, ikke udført eller terminalt sprunget over. Opgaven kan vælges igen.
- Fjernelse fra kø stopper ikke en timer. Arkivering af aktivt arbejde kræver pause; arkiverede køelementer forbliver synlige.
- Ret tid angiver en ny samlet faktisk tid (0–525.600 minutter). Originale intervaller bevares, og differencen gemmes med audit. Senere arbejde lægges til den korrigerede total.
- Resttid er estimat minus faktisk tid, mindst nul, eller brugerens eksplicitte restestimat. Et eksplicit restestimat nedtælles ved arbejde og ændres separat fra tidskorrektion. Opbrugt resttid kræver nyt estimat før genstart.
- Arbejdskonflikter bevarer lokal registrering, men kan kun løses med fælles serverstatus; tiden kan derefter korrigeres eksplicit. To helt offline personer kan ikke forhindres i fysisk at udføre samme arbejde.

## Præcis kalenderadfærd

- Regeltyper: interval i dage/uger/måneder/år, valgte ugedage med ugeinterval samt flere årlige sæsonperioder. Intervaller/ugedage kan begrænses til bestemte måneder.
- Kalenderintervaller regnes altid fra ankeret: 31. januar → sidste dag i februar → 31. marts. Årlig 29. februar klemmes til 28. februar i almindelige år og vender tilbage til 29. februar i skudår.
- Udførelsesinterval regnes fra den seneste af afslutningsdato og den gamle planlagte dato. Ny regel med senere anker respekteres. Overspringning bruger samme beregning fra overspringningsdatoen.
- Kalenderens efterfølger ligger efter både planlagt dato og udførelsesdato. Sæsoner kan åbne en allerede påbegyndt periode, hvis den endnu ikke er udløbet. Helt passerede perioder gemmes særskilt som holdt tilbage i historikkens missedPeriods; de tæller hverken som udført eller bruger-sprunget-over.
- Regelændringer påvirker den næste forekomst. En åben forekomst uden arbejdsintervaller kan omplanlægges med den nye regel. Historiske snapshots og påbegyndte datoer bevares. Fjernelse af reglen lader det aktuelle arbejde afslutte uden en efterfølger.
- En afsluttet engangsopgave omdannes ikke til en ny gentagelse; brugeren opretter en ny opgave for at bevare en entydig historik.
- Datoer afledes i Europe/Copenhagen. Regelankre understøttes 1900–9500; ugyldige/umulige mønstre afvises efter en søgehorisont på 400 år.
