# Changelog

Le modifiche rilevanti di ogni versione pubblicata. Le versioni corrispondono ai tag Git che avviano il deploy.

## [Non rilasciato]

## [0.1.1] - 2026-09-13

### Aggiunto

- Versione dell'app visibile in **Altro** (scritta dal workflow di deploy).
- Uso completo da tastiera: controlli attivabili con Invio e Spazio, focus visibile e mantenuto dopo ogni modifica.
- Modali accessibili: dialog con titolo, focus intrappolato, sfondo inerte, chiusura con Esc e con tocco sullo sfondo
  (non per il form ricetta e per il benvenuto).
- Etichette collegate a tutti i campi e nomi accessibili per i pulsanti con sole icone.
- README, CHANGELOG e istruzioni per Claude Code.

### Modificato

- Dopo ogni modifica viene ridisegnata solo la schermata visibile; le altre si aggiornano quando vengono aperte.

## [0.1.0] - 2026-09-13

### Modificato

- Codice diviso in `css/app.css` e moduli ES in `js/`. Il test locale richiede un server (`python -m http.server`):
  l'apertura diretta del file non funziona più.
- SDK Firebase modulare 12.19.0 al posto della versione compat 10.
- Stili inline sostituiti da classi CSS; costanti con nome per tempi, limiti e chiavi; rimossi testi obsoleti.

### Aggiunto

- Versione dello schema dati (`schemaVersion`) con migrazioni e validazione di tutti i dati in ingresso.

## [0.0.5] - 2026-09-13

### Modificato

- Sincronizzazione per differenze: modifiche contemporanee da dispositivi diversi non si sovrascrivono, due "+1"
  simultanei valgono +2.
- L'annullamento del piano inverte solo le modifiche del piano, lasciando quelle arrivate dopo.
- Cache locale limitata alle ultime 5 partite; rimozione dei residui della sandbox e dei riferimenti a ricette eliminate.
- L'SDK Firebase viene scaricato solo in produzione; se la CDN non risponde l'app parte in modalità locale.

## [0.0.4] - 2026-09-13

### Aggiunto

- Sandbox dati reali in ambiente di test: copia locale in sola lettura di una partita di produzione.
- Verifica del codice partita prima di collegarsi.

### Corretto

- Un test da un indirizzo di rete locale non può più scrivere sulla partita di produzione.
- Il piano mostrato viene invalidato se i dati cambiano; niente modali duplicati.
- L'app non si blocca con dati locali corrotti; barra di navigazione sempre visibile.
- Dati provenienti dal server non possono iniettare codice nella pagina.

## [0.0.3] - 2026-09-10

### Aggiunto

- Modale al primo accesso: nuova partita o collegamento a una partita esistente.

## [0.0.2] - 2026-09-10

### Modificato

- Grafia dell'eroe corretta in Kehli.
- Magazzino del mercato con materiali base di default.
- Eroi associati a ogni ricetta.

## [0.0.1] - 2026-09-10

### Modificato

- Pubblicazione su GitHub Pages al push di un tag, al posto di Firebase Hosting.

## [0.0.0] - 2026-07-08

- Prima versione.
