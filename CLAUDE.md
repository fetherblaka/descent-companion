# Istruzioni per Claude Code

## Ambienti e rilascio

- **Produzione = GitHub Pages**, pubblicata al push di un tag `v*`. Non fare commit, push o tag senza una richiesta
  esplicita.
- **Test locale**: `python -m http.server` e `http://localhost:8000`. Fuori da `https://*.github.io` Firebase è
  disattivato (`LOCAL_ONLY` in `js/config.js`). `file://` non funziona (moduli ES).
- Il workflow pubblica solo `SITE_FILES` (`index.html css js`): nuovi file dell'app vanno aggiunti lì.
- `js/version.js` resta `"dev"` nel repository; il tag viene scritto dal workflow nella sola copia pubblicata.

## Prima di consegnare una modifica

- `npm run lint` e `npm run format:check` devono passare.
- Aggiornare la sezione "Non rilasciato" di `CHANGELOG.md`.

## Architettura (dettagli nel README)

- Stato condiviso nell'oggetto `S` di `js/store.js`; dopo una modifica chiamare `save()` (salva, sincronizza,
  ridisegna la schermata visibile).
- Cambi di schermata con `showScreen()` (ridisegna se la schermata è da aggiornare).
- Sincronizzazione per differenze in `js/sync.js`: non scrivere mai l'intera partita per una modifica.
- Ogni dato in ingresso passa da `normalize()`; per cambiare la forma dei dati aggiungere una migrazione e incrementare
  `SCHEMA_VERSION` in `js/schema.js`.
- `js/optimizer.js` resta puro (riceve lo stato, niente DOM né salvataggi).

## Convenzioni

- Niente handler inline: `data-action` / `data-change` registrati in `js/events.js`.
- Ogni valore interpolato nell'HTML passa da `esc()`.
- Modali solo tramite `openModal()`; controlli non-`<button>` con `role="button"` e `tabindex="0"`.
- Interfaccia e commenti in italiano.
