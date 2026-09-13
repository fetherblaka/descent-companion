# Descent Companion

Web app di supporto alla campagna di Descent: inventario del gruppo, mercato, ricette e un ottimizzatore che suggerisce
quali ricette acquistare e costruire con le risorse disponibili. I dati di una partita sono condivisi fra più dispositivi
tramite Firebase Realtime Database.

## Funzionalità

- **Inventario**: monete e materiali posseduti.
- **Mercato**: magazzino dei materiali acquistabili e ricette in vendita, con priorità a stelle.
- **Ricette**: ricette acquistate e costruite, versioni potenziate collegate alla versione normale.
- **Ottimizza**: scelta dei 4 eroi in missione e piano consigliato (vendite, acquisti, costruzioni), applicabile
  all'inventario per intero o fino a uno step, e annullabile. Vedi [Ottimizzatore](#ottimizzatore).
- **Partita condivisa**: ogni partita ha un codice `DSC-XXXX-XXXX`; chi lo inserisce vede e modifica gli stessi dati.

## Ambienti

| Ambiente    | Dove                                                                                        | Firebase                               |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| Produzione  | [fetherblaka.github.io/descent-companion](https://fetherblaka.github.io/descent-companion/) | attivo                                 |
| Test locale | qualunque altro indirizzo (localhost, IP di rete locale), oppure `?local` nell'URL          | disattivato: dati solo nel dispositivo |

La regola è in [js/config.js](js/config.js) (`LOCAL_ONLY`): Firebase si attiva solo su `https://*.github.io`, quindi un
test locale non può scrivere sulla partita di produzione.

### Provare l'app in locale

L'app usa moduli ES, che il browser non carica aprendo `index.html` con doppio clic (`file://`). Serve un piccolo
server locale nella cartella del progetto:

```sh
python -m http.server 8000
```

e poi aprire <http://localhost:8000>. Per provare da telefono sulla stessa rete basta usare l'IP del computer
(es. `http://192.168.1.10:8000`): anche lì Firebase resta disattivato.

### Sandbox dati reali

In test locale, **Altro → Ambiente di test → Carica dati reali** legge una partita di produzione (una GET REST in sola
lettura) e ne crea una copia locale separata (chiavi `sbx_` in localStorage). La copia si può modificare liberamente:
nulla viene inviato al server. Le regole del database non permettono di elencare le partite, quindi il codice va
inserito oppure scelto fra quelli già noti al dispositivo.

## Struttura

Nessun build: il sito è composto dai soli file statici `index.html`, `css/` e `js/`.

| File                               | Contenuto                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| [index.html](index.html)           | struttura della pagina                                                        |
| [css/app.css](css/app.css)         | stili                                                                         |
| [js/main.js](js/main.js)           | avvio                                                                         |
| [js/config.js](js/config.js)       | configurazione Firebase, ambiente, tempi e limiti                             |
| [js/data.js](js/data.js)           | dati fissi di gioco (materiali, eroi, priorità) e stato di default            |
| [js/schema.js](js/schema.js)       | versione dello schema, migrazioni e validazione dei dati                      |
| [js/store.js](js/store.js)         | stato condiviso `S` e persistenza in localStorage                             |
| [js/firebase.js](js/firebase.js)   | caricamento dell'SDK Firebase (solo in produzione) e adattatore               |
| [js/sync.js](js/sync.js)           | salvataggio e sincronizzazione per differenze                                 |
| [js/render.js](js/render.js)       | schermate Inventario, Mercato, Ricette, Altro e aggiornamento delle schermate |
| [js/plan.js](js/plan.js)           | schermata Ottimizza, applicazione e annullamento del piano                    |
| [js/optimizer.js](js/optimizer.js) | algoritmo dell'ottimizzatore (puro, riceve lo stato)                          |
| [js/recipes.js](js/recipes.js)     | form e azioni sulle ricette                                                   |
| [js/game.js](js/game.js)           | inventario, impostazioni, creazione e collegamento della partita              |
| [js/sandbox.js](js/sandbox.js)     | sandbox dati reali                                                            |
| [js/ui.js](js/ui.js)               | toast, modali, navigazione, frammenti HTML condivisi                          |
| [js/events.js](js/events.js)       | collegamento degli eventi (`data-action` / `data-change`)                     |
| [js/version.js](js/version.js)     | versione mostrata nell'app (`dev` nel repository)                             |

## Sviluppo

Gli strumenti di sviluppo richiedono Node.js 20.19+ o 22.13+ (non servono per far girare l'app).

```sh
npm install
npm run lint           # ESLint
npm run format         # formatta con Prettier
npm run format:check   # verifica la formattazione
```

Convenzioni del codice:

- **Eventi**: nessun handler inline. Gli elementi dichiarano `data-action` (click) o `data-change` (change) con i
  parametri in altri attributi `data-*`; le azioni sono registrate in [js/events.js](js/events.js).
- **HTML generato**: ogni valore interpolato passa da `esc()`, anche i numeri: i dati arrivano da un database condiviso.
- **Accessibilità**: i controlli che non sono `<button>` hanno `role="button"` e `tabindex="0"`; i modali si aprono
  con `openModal()`, che gestisce focus, `inert` e chiusura.
- Testi dell'interfaccia e commenti in italiano.

## Ottimizzatore

- **Valore di un piano**: somma dei pesi delle sue azioni (impostazioni, una per classe: acquisto/costruzione × stelle).
- **Risorse**: monete più il valore di vendita dei materiali base; gli essenziali solo se è attiva l'impostazione
  **Vendi anche gli essenziali** (default spenta). I materiali mancanti
  per una costruzione si comprano dal magazzino, nei limiti della sua disponibilità.
- **Ricerca**: branch & bound in [js/optimizer.js](js/optimizer.js), con limite superiore dallo zaino frazionario (i
  costi dei materiali sono convessi). Il limite tiene conto anche delle unità disponibili di ogni materiale (rilassamento lagrangiano), che conta quando a
  mancare sono le essenze e non le monete. Oltre `OPTIMIZER_MAX_WORK` azioni esaminate ([js/config.js](js/config.js)) si tiene il
  miglior piano trovato e l'app lo segnala.
- **Candidati**: fino a **Sfidanti massimi** piani, compreso il migliore, con valore entro la soglia %. Ognuno è il
  miglior piano non contenuto nei precedenti (spazio diviso senza sovrapposizioni con il metodo di Lawler). Si
  confrontano a due, il piano scelto passa al confronto successivo: N candidati, N−1 scelte.
- **Esecuzione**: step dal peso più alto al più basso; un'azione segue quelle da cui dipende (acquisto della stessa
  ricetta, costruzione della versione normale). Le vendite
  avvengono nello step in cui le monete non bastano, un'unità alla volta dal materiale base più abbondante (gli essenziali, se abilitati,
  solo quando non resta nessun base vendibile) al netto di
  quanto serve alle costruzioni successive.

## Dati

Ogni partita è salvata in `partite/<codice>` nel Realtime Database e in cache nel localStorage del dispositivo (ultime 5
partite aperte).

- **Sincronizzazione**: si inviano solo le differenze rispetto all'ultimo stato allineato. I contatori (monete,
  materiali, magazzino) viaggiano come incrementi in una transaction, gli altri campi come aggiornamenti per percorso:
  modifiche contemporanee da dispositivi diversi non si sovrascrivono.
- **Schema**: i dati hanno un campo `schemaVersion`. Tutto ciò che entra nell'app passa da `normalize()` in
  [js/schema.js](js/schema.js), che applica le migrazioni mancanti e valida tipi e intervalli.
- **Cambiare la forma dei dati**: aggiungere una migrazione in fondo a `MIGRATIONS` e incrementare `SCHEMA_VERSION`.
- **Regole del database**: sono gestite nella console Firebase e non sono versionate in questo repository.

## Rilascio

Il push di un tag `v*` (es. `v0.2.0`) avvia il workflow [deploy-pages.yml](.github/workflows/deploy-pages.yml), che:

1. copia nel sito solo i file elencati in `SITE_FILES` (`index.html css js`): documentazione e configurazioni di
   sviluppo non vengono pubblicate;
2. scrive il nome del tag in `js/version.js` nella copia pubblicata, così la versione appare in **Altro**;
3. pubblica su GitHub Pages.

Se l'app acquisisce nuovi file o cartelle, vanno aggiunti a `SITE_FILES`. Dopo un rilascio conviene ricaricare la pagina
su tutti i dispositivi, perché il browser può tenere in cache i file precedenti.

Le modifiche di ogni versione sono in [CHANGELOG.md](CHANGELOG.md).
