# Få det Gjort – kort vejledning

1. Åbn appen og vælg **Prøv på denne enhed**, hvis login endnu ikke er tilsluttet.
2. Klik **Ny opgave**, eller skriv en sætning i feltet **Skriv opgaven, som du tænker den**. Hurtig oprettelse fortolker eksempelvis “Vask bilen hjemme, 45 minutter, hver uge” og åbner altid formularen til gennemgang.
3. Klik **Opret opgave**. Opgaven er gemt i browseren og bevares, når du genåbner appen.
4. På **I dag** vælger du tid og lokation. Her vises op til fem opgaver i prioriteret rækkefølge. Hvert kort forklarer, hvorfor opgaven er relevant; din egen prioritet ændres ikke. Tryk **Se alle** for hele registeret.
5. Klik på en opgaves titel eller pil for at redigere. **Arkivér** skjuler den fra de aktive opgaver. I **Opgaver → Arkiv** kan den gendannes.
6. Under **Indstillinger** (eller **Mere** på mobil) kan du oprette og omdøbe lokationer og kategorier. En uafhængig lokation vises ved alle lokationsvalg, også efter omdøbning.

Appen starter uden opgaver. Knappen til eksempelopgaver er frivillig og vises kun i det tomme lokale register.

## Lokal afprøvning og login

“Gemt på denne enhed” betyder præcis det: data deles ikke med andre browsere eller enheder. Under **Indstillinger → Backup og gendannelse** kan du hente en JSON-backup. Opbevar den et sikkert sted. Vælg en backupfil for at kontrollere indholdet; tilføj kun manglende data, eller markér den særskilte bekræftelse for at erstatte alle lokale data.

Når Supabase er konfigureret, logger du ind med et link sendt til din e-mail. Husstandens ejer kan registrere en invitation; den inviterede logger derefter selv ind med samme e-mail inden syv dage. Der sendes ikke automatisk en invitationsmail.

Ændringer fra andre enheder indlæses ved opstart, tilbagevenden til appen og normalt inden for cirka 20 sekunder, mens appen er åben og online. Netværksfejl vises, mens ændringer bevares lokalt.

Ved konflikt: Åbn Indstillinger, sammenlign din ændring med serverens, og vælg den ønskede version. Løsning kræver forbindelse. Begge versioner bevares i konfliktarkivet. Udlogning fra en rigtig konto kræver, at ventende ændringer og konflikter er håndteret, og rydder derefter lokale kontodata.

## Projekter og rækkefølge

Åbn **Projekter** og vælg **Nyt projekt**. Inde i projektet opretter **Ny delopgave** en almindelig opgave, som også kan findes i opgaveregisteret, prioriteres, sættes i kø og tidsregistreres. Projektet viser antal afsluttede delopgaver og procentvis fremdrift.

Under **Flere detaljer** i en opgave kan du vælge projekt og de opgaver, den skal vente på. En blokeret opgave mærkes med **Venter på**, udelades fra dagens forslag og kan ikke startes fra køen. Når forudsætningen afsluttes, bliver opgaven tilgængelig med det samme. Appen afviser en ændring, hvis den ville skabe en cirkel.

## Installation og offlinebrug

Efter første onlinebesøg kan appen genåbnes uden netværk. På computer og Android bruges browserens installationsknap eller **Indstillinger → Installér Få det Gjort**. På iPhone/iPad vælges **Del → Føj til hjemmeskærm**. Opgaver, kø, timer og afslutninger gemmes lokalt og synkroniseres automatisk, når forbindelsen vender tilbage. En konto skal være logget ind og husstanden hentet mindst én gang, før den kan bruges offline.

## Påmindelser, statistik og historik

På **I dag** vises relevante påmindelser om aktuelle gentagelser, deadlines inden for tre dage og forsinkede opgaver. Under **Indstillinger → Påmindelser** kan hver type slås til eller fra. Interne påmindelser kræver ingen browseradgang. Systemnotifikationer er frivillige, afhænger af browser/PWA-understøttelse og gentages ikke for samme hændelse.

Åbn **Statistik** for at vælge uge, måned, år eller en valgfri periode. Filtrér efter person og lokation. Her vises antal afslutninger, registreret tid, overspringninger, aktuelle/forsinkede opgaver samt fordeling over tid, lokationer og kategorier. Fanen **Historik** kan søges og filtreres; den viser planlagt dato, udførelsdato, bruger, estimat, faktisk tid og eventuel datoafvigelse. **Ret tid** opdaterer både historikken og statistikken.

## Din kø og timer

Tryk **Tilføj til kø** på et opgavekort. **Start nu** starter direkte og åbner køvisningen. Under **Min kø** kan du vælge en tidsramme, se samlet resttid og flytte opgaver med grebet eller op/ned-knapperne. Køen må gerne overstige tidsrammen.

**Start**, **Pause** og **Fortsæt** gemmer arbejdsintervaller. En kørende timer tæller også tiden, mens appen er lukket. Ved **Afslut** vises opgaven under **Udførelser og overspringninger** med udført af, dato og samlet tid. Den fjernes fra de aktive køer; næste opgave starter først, når du vælger Start.

**Ret tid** ændrer den samlede registrerede tid i minutter og gemmer en rettelse i historikken. Sæt først en kørende timer på pause. **Ret resttid** angiver, hvor meget arbejde der mangler, hvis det oprindelige estimat er opbrugt.

**Fjern fra kø** ændrer kun din plan, og stopper ikke en igangværende timer. **Spring over** pauser en eventuel timer og fjerner opgaven fra din kø, men lader engangsopgaven være tilgængelig. For en gentagelse bruges **Spring denne gang over** til at afslutte netop denne forekomst uden at tælle den som udført. Arbejde uden for køen kan stadig fortsættes i køvisningen.

Hvis to enheder har startet eller afsluttet samme opgave offline, gemmes konflikten. Vælg den fælles serverstatus under Indstillinger og ret om nødvendigt tiden bagefter. Den afviste lokale registrering bevares i konfliktarkivet; arbejdsstatus kan ikke overskrives med en gammel lokal kopi.

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
