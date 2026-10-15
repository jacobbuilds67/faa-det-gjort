# Få det Gjort – kort vejledning

1. Åbn appen. Den starter direkte med data gemt lokalt i browseren.
2. Klik **Ny opgave**, eller skriv en sætning i feltet **Skriv opgaven, som du tænker den**. Hurtig oprettelse fortolker eksempelvis “Vask bilen hjemme, 45 minutter, hver uge” og åbner altid formularen til gennemgang.
3. Klik **Opret opgave**. Opgaven er gemt i browseren og bevares, når du genåbner appen.
4. På **I dag** vælger du tid og lokation. Her vises op til fem opgaver i prioriteret rækkefølge. Hvert kort forklarer, hvorfor opgaven er relevant; din egen prioritet ændres ikke. Tryk **Se alle** for hele registeret.
5. Klik på en opgaves titel eller pil for at redigere. **Arkivér** skjuler den fra de aktive opgaver. I **Opgaver → Arkiv** kan den gendannes.
6. Under **Indstillinger** (eller **Mere** på mobil) kan du oprette og omdøbe lokationer og kategorier. En uafhængig lokation vises ved alle lokationsvalg, også efter omdøbning.

Appen starter uden opgaver. Knappen til eksempelopgaver er frivillig og vises kun i det tomme lokale register.

## Lokale data og familiebackup

“Gemt på denne enhed” betyder, at opgaverne ikke sendes til en server. Skriv dit navn under **Indstillinger**, så tidsregistrering og historik kan vise, hvem der arbejdede på opgaven.

Under **Indstillinger → Familiebackup** kan du hente en JSON-fil. Gem den som sikkerhedskopi eller send den til et familiemedlem. På den anden enhed vælges filen og derefter **Flet familiebackup**. Nye poster og nyere rettelser hentes, mens nyere lokale rettelser bevares.

Fletningen sker pr. opgave, projekt, kø og historikpost. Hvis Jacob har rettet én opgave, og Birgitte har oprettet en anden, kan begge ændringer derfor bevares. Delingen er manuel: eksportér og send en ny fil, når I vil udveksle de seneste ændringer.

**Gendan hele backupen** erstatter alle lokale data og kræver særskilt bekræftelse. Brug den kun ved ny enhed eller egentlig gendannelse.

**Del familiebackup** åbner enhedens delingsmenu med backupfilen klar. På iPhone, iPad og Mac vælges **Beskeder** og derefter modtageren. Hvis delingsmenuen ikke er tilgængelig, hentes filen, så den kan vedhæftes manuelt.

## Totalbackup

Totalbackuppen gemmer alt fra familiebackuppen sammen med denne enheds profil, identitet og medlemsliste. Brug **Eksportér totalbackup** som fuld sikkerhedskopi. Ved **Gendan totalbackup** erstattes hele den lokale app og siden genindlæses med den gendannede profil.

### Flyt fra den tidligere onlineudgave

1. Åbn den nuværende Vercel-udgave, mens den stadig er tilgængelig, og kontrollér at de seneste opgaver vises.
2. Gå til **Indstillinger → Backup og gendannelse**, og eksportér en backup.
3. Åbn GitHub Pages-udgaven og vælg backupfilen under **Familiebackup**.
4. Vælg **Gendan hele backupen** på den første enhed. Appen flytter automatisk data fra det gamle online familie-id til den lokale familie.
5. Skriv dit navn under Indstillinger, eksportér en ny familiebackup, og brug derefter **Flet familiebackup** på familiens øvrige enheder.

## Projekter og rækkefølge

Åbn **Projekter** og vælg **Nyt projekt**. Inde i projektet opretter **Ny delopgave** en almindelig opgave, som også kan findes i opgaveregisteret, prioriteres, sættes i kø og tidsregistreres. Projektet viser antal afsluttede delopgaver og procentvis fremdrift.

Under **Flere detaljer** i en opgave kan du vælge projekt og de opgaver, den skal vente på. En blokeret opgave mærkes med **Venter på**, udelades fra dagens forslag og kan ikke startes fra køen. Når forudsætningen afsluttes, bliver opgaven tilgængelig med det samme. Appen afviser en ændring, hvis den ville skabe en cirkel.

## Installation og offlinebrug

Efter første onlinebesøg kan appen genåbnes uden netværk. På computer og Android bruges browserens installationsknap eller **Indstillinger → Installér Få det Gjort**. På iPhone/iPad vælges **Del → Føj til hjemmeskærm**. Opgaver, kø, timer og afslutninger kræver ikke internet.

## Påmindelser, statistik og historik

På **I dag** vises relevante påmindelser om aktuelle gentagelser, deadlines inden for tre dage og forsinkede opgaver. Under **Indstillinger → Påmindelser** kan hver type slås til eller fra. Interne påmindelser kræver ingen browseradgang. Systemnotifikationer er frivillige, afhænger af browser/PWA-understøttelse og gentages ikke for samme hændelse.

Åbn **Statistik** for at vælge uge, måned, år eller en valgfri periode. Filtrér efter person og lokation. Her vises antal afslutninger, registreret tid, overspringninger, aktuelle/forsinkede opgaver samt fordeling over tid, lokationer og kategorier. Fanen **Historik** kan søges og filtreres; den viser planlagt dato, udførelsdato, bruger, estimat, faktisk tid og eventuel datoafvigelse. **Ret tid** opdaterer både historikken og statistikken.

## Din kø og timer

Tryk **Tilføj til kø** på et opgavekort. **Start nu** starter direkte og åbner køvisningen. Under **Min kø** kan du vælge en tidsramme, se samlet resttid og flytte opgaver med grebet eller op/ned-knapperne. Køen må gerne overstige tidsrammen.

**Start**, **Pause** og **Fortsæt** gemmer arbejdsintervaller. En kørende timer tæller også tiden, mens appen er lukket. Ved **Afslut** vises opgaven under **Udførelser og overspringninger** med udført af, dato og samlet tid. Den fjernes fra de aktive køer; næste opgave starter først, når du vælger Start.

**Ret tid** ændrer den samlede registrerede tid i minutter og gemmer en rettelse i historikken. Sæt først en kørende timer på pause. **Ret resttid** angiver, hvor meget arbejde der mangler, hvis det oprindelige estimat er opbrugt.

**Fjern fra kø** ændrer kun din plan, og stopper ikke en igangværende timer. **Spring over** pauser en eventuel timer og fjerner opgaven fra din kø, men lader engangsopgaven være tilgængelig. For en gentagelse bruges **Spring denne gang over** til at afslutte netop denne forekomst uden at tælle den som udført. Arbejde uden for køen kan stadig fortsættes i køvisningen.

Hvis samme opgave ændres på to enheder, vælger familiebackupen den version, der har det nyeste ændringstidspunkt. Eksportér gerne en backup før større rettelser.

## Gentagelser og sæsoner

I opgavevinduet vælger du **Gentag opgaven**:

- **Med fast interval:** dage, uger, måneder eller år. Vælg **Efter fast kalender** for at fastholde mønstret eller **Efter seneste udførelse** for at regne fra den dato, du afslutter. Årligt interval fra en bestemt dato giver en fast årlig kalenderdato.
- **Bestemte ugedage:** vælg eksempelvis mandag og torsdag, eventuelt hver anden uge.
- **Årlige sæsonperioder:** vælg måned og dag, eksempelvis 1.–30. juni og 1.–30. september. Appen viser perioden i almindelig tekst, og den gentages hvert år. Perioder kan gå over nytår, men må ikke overlappe.

Under **Aktive måneder** kan du begrænse et interval eller ugedage til eksempelvis april–oktober. Datoen **Gentagelse fra** angiver, hvornår reglen begynder. Datoer i Flere detaljer styres af gentagelsen.

En forsinket forekomst bliver stående, indtil du afslutter den eller vælger **Spring denne gang over**. Der oprettes aldrig flere åbne forekomster af samme opgave. Den næste forekomst oprettes med sin planlagte dato, men bliver hverken startet eller føjet til din kø automatisk.

Ved **Efter seneste udførelse** tælles intervallet fra afslutningsdatoen; ved overspringning fra overspringningsdatoen. En tidlig afslutning flytter ikke næste dato til før den gamle planlagte dato. Ved faste kalendere findes næste dato efter både den gamle planlagte dato og afslutningen.

Sæsoner behandles særskilt: afslutter du en forsinket juniopgave i september, bliver septemberopgaven aktuel. Hvis flere hele sæsonperioder er passeret, mens den gamle opgave stod åben, vises de i historikken som holdt tilbage — aldrig som udført.

Historikken gemmer titel, estimat, planlagte datoer og gentagelsesregel fra forekomsten. Du kan rette tiden på en ældre udførelse uden at ændre næste forekomst. Regelændringer bevarer arbejde, der er startet, og tidligere udførelser. En åben forekomst, som endnu ikke er startet, kan få datoer efter den nye regel.
