# Changelog

Le modifiche rilevanti di ogni versione pubblicata. Le versioni corrispondono ai tag Git che avviano il deploy.

## [Non rilasciato]

## [1.0.0] - 2026-09-14

### Corretto

- L'ottimizzatore ignorava di fatto i pesi: i candidati venivano ordinati per una gerarchia fissa e limitati a 16,
  quindi con molte ricette proponeva sempre acquisti e costruzioni a 2-3 stelle.

### Modificato

- Nuovo algoritmo dell'ottimizzatore (branch & bound, senza enumerare le combinazioni): regge centinaia di ricette e
  sceglie il piano con la somma dei pesi più alta. Si vendono materiali base, sempre dal più abbondante, e solo
  quando le monete non bastano. Quando a mancare sono le essenze e non le monete, la ricerca tiene conto anche delle
  unità disponibili di ogni materiale e resta esatta anche su partite reali con decine di ricette.
- Sfidanti: si estraggono fino a **Sfidanti massimi** piani (compreso il migliore) con valore entro la soglia, nessuno
  contenuto in un altro; si confrontano a due e il piano scelto passa al confronto successivo, quindi con N piani bastano
  N−1 scelte. Nel confronto compaiono solo le azioni che i due piani non hanno in comune. Rimosso il confronto per
  "conflitto di priorità".
- Step del piano consigliato ordinati per peso, dal più alto (un'azione segue sempre quelle da cui dipende), con vendite
  e acquisti di materiali nello step in cui servono e le monete rimaste dopo ogni step.
- Nuovi default per le nuove partite: soglia 5%, pesi acquisto ★★★ 35, ★★ 16, ★ 5 e costruzione ★★★ 10, ★★ 4, ★ 1.
  Le partite esistenti mantengono soglia e pesi salvati.

### Aggiunto

- Applicazione del piano intera o fino a uno step scelto.
- Impostazione **Vendi anche gli essenziali** (default spenta): se attiva, il piano vende gli essenziali non necessari
  alle sue costruzioni, ma solo dopo aver esaurito i materiali base vendibili.
- Impostazione **Sfidanti massimi** (default 4): piani candidati al massimo per elaborazione, 0 o 1 = nessuna domanda.

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
