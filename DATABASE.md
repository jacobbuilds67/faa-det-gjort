# Lokal datamodel

Data ligger i IndexedDB via Dexie. Databasen indeholder opgaver, projekter, lokationer, kategorier, aktive arbejdsforløb, historik, personlige køer, tidshændelser og lokale præferencer.

Alle delte poster har et UUID, familie-id, versionsnummer og ændringstidspunkt. Opgaver kan referere til lokationer, kategori, projekt og andre opgaver. Backupvalideringen afviser manglende relationer, dublerede id'er og blandede familier.

Browserens lager er oprindelsen til data. Rydning af webstedsdata sletter derfor den lokale kopi. Brug familiebackup regelmæssigt og før browserskift eller nulstilling.
