/* Rendering delle schermate Inventario, Mercato, Ricette e Altro
   (la schermata Ottimizza è in plan.js). */
import { LOCAL_ONLY } from "./config.js";
import { ACTION_KEYS, ACTION_LABEL, MATERIALI, SFIDANTI_MAX } from "./data.js";
import { renderOttimizza } from "./plan.js";
import { KEY, LS, S } from "./store.js";
import { $, goScreen, matChips, starsHtml, updateSyncPill } from "./ui.js";
import { esc, ownValue } from "./util.js";
import { APP_VERSION } from "./version.js";

const byName = (a, b) => a.nome.localeCompare(b.nome);
const byStarsThenName = (a, b) => b.stelle - a.stelle || byName(a, b);

function matRows(kind) {
  const src = kind === "own" ? S.state.materiali : S.state.magazzino;
  const group = (ess) =>
    MATERIALI.filter((m) => m.ess === ess)
      .map((m) => {
        const what = kind === "own" ? m.nome : `${m.nome} nel magazzino`;
        const qty = esc(src[m.id] || 0);
        return `
      <div class="mat-row">
        <span class="mat-name${m.ess ? " ess" : ""}">${m.nome}</span>
        <div class="stepper">
          <button data-action="bump" data-kind="${kind}" data-mat="${m.id}" data-delta="-1" aria-label="Diminuisci ${what}">−</button>
          <span role="button" tabindex="0" aria-label="${what}: ${qty}, modifica" data-action="editNum" data-kind="${kind}" data-mat="${m.id}">${qty}</span>
          <button data-action="bump" data-kind="${kind}" data-mat="${m.id}" data-delta="1" aria-label="Aumenta ${what}">+</button>
        </div>
      </div>`;
      })
      .join("");
  return `<div class="card">${group(false)}</div><div class="card">${group(true)}</div>`;
}

function renderInventario() {
  const monete = esc(S.state.monete);
  $("scr-inv").innerHTML = `
    <h2>Monete</h2>
    <div class="card row">
      <span class="coins-big" role="button" tabindex="0" aria-label="Monete: ${monete}, modifica" data-action="editNum" data-kind="coins">🪙 ${monete}</span>
      <div class="stepper">
        <button data-action="bumpCoins" data-delta="-1" aria-label="Diminuisci monete">−</button>
        <span role="button" tabindex="0" aria-label="Monete: ${monete}, modifica" data-action="editNum" data-kind="coins">${monete}</span>
        <button data-action="bumpCoins" data-delta="1" aria-label="Aumenta monete">+</button>
      </div>
    </div>
    <h2>Materiali posseduti</h2>
    <p class="hint">Tocca − / + per aggiornare dopo la missione, oppure il numero per inserirlo direttamente.</p>
    ${matRows("own")}`;
}

const nomeHtml = (r) => esc(r.nome) + (r.pot ? '<span class="pot-mark"> +</span>' : "");

function prereqHint(r) {
  if (!r.pot || !r.prereq || r.stato === "costruita") return "";
  if (r.prereq.tipo === "mancante") {
    return `<p class="hint hint-inline warn">⚠ versione normale non posseduta — costruzione esclusa dai consigli</p>`;
  }
  if (r.prereq.tipo === "ricetta") {
    const N = S.state.ricette[r.prereq.id];
    if (N && N.stato !== "costruita") return `<p class="hint hint-inline">richiede costruita: ${esc(N.nome)}</p>`;
  }
  return "";
}

function recipeCardHtml(r, ctx) {
  const id = esc(r.id);
  const heroChips = r.eroi.map((h) => `<span class="chip hero">${esc(h)}</span>`).join("");
  const ignored = r.stelle === 0;
  const nome = esc(r.nome);
  const editBtns = `<button class="icon-btn" data-action="openRecipeForm" data-id="${id}" aria-label="Modifica ${nome}" title="Modifica">✎</button>
    <button class="icon-btn" data-action="deleteRecipe" data-id="${id}" aria-label="Elimina ${nome}" title="Elimina">🗑</button>`;
  let actions;
  let badge;
  if (ctx === "mercato") {
    badge = starsHtml(r.stelle, r.id);
    actions = ignored
      ? `<div class="btn-row">${editBtns}</div><p class="hint hint-block">0 stelle — ignorata dall'ottimizzatore</p>`
      : `<div class="btn-row"><button class="btn teal" data-action="markAcquistata" data-id="${id}">✓ Acquistata</button>${editBtns}</div>`;
  } else if (ctx === "acquistata") {
    badge = `<span class="badge owned">ACQUISTATA</span>`;
    actions = `<div class="btn-row"><button class="btn gold" data-action="markCostruita" data-id="${id}">⚒ Segna costruita</button>${editBtns}</div>`;
  } else {
    badge = `<span class="badge built">COSTRUITA</span>`;
    actions = `<div class="btn-row"><button class="btn danger" data-action="deleteRecipe" data-id="${id}">🗑 Elimina dall'app</button></div>`;
  }
  const starsLine = ctx === "mercato" ? "" : `${starsHtml(r.stelle, ctx === "costruita" ? null : r.id)}&nbsp;`;
  const coinChip =
    ctx === "mercato"
      ? `<span class="chip coin" role="button" tabindex="0" aria-label="Costo: ${esc(r.costo)} monete, modifica" data-action="editCosto" data-id="${id}">🪙 ${esc(r.costo)}</span>`
      : "";
  const classes = ["card", "recipe-card"];
  if (ignored && ctx === "mercato") classes.push("ignored");
  if (ctx === "costruita") classes.push("built");
  return `<div class="${classes.join(" ")}">
    <div class="row"><h3>${nomeHtml(r)}</h3>${badge}</div>
    <div class="meta">${starsLine}${coinChip}${matChips(r.materiali)}</div>
    <div>${heroChips}</div>${prereqHint(r)}${actions}</div>`;
}

function renderMercato() {
  const rs = Object.values(S.state.ricette)
    .filter((r) => r.stato === "mercato")
    .sort(byStarsThenName);
  $("scr-mkt").innerHTML = `
    <h2>Magazzino materiali</h2>
    <p class="hint">Quantità disponibili ora nel mercato. I materiali base partono da 10.</p>
    ${matRows("mkt")}
    <button class="btn" data-action="resetMagazzino">↺ Reset a default</button>
    <div class="section-head">
      <h2>Ricette nel mercato</h2>
      <button class="btn gold" data-action="openRecipeForm" data-stato="mercato">+ Nuova ricetta</button>
    </div>
    <p class="hint hint-after-head">Acquistabili solo in questa fase. Tocca le stelle per la priorità (ritocca l'ultima per scendere fino a 0).</p>
    ${rs.length ? rs.map((r) => recipeCardHtml(r, "mercato")).join("") : `<p class="empty">Nessuna ricetta nel mercato. Aggiungile con "+ Nuova ricetta".</p>`}`;
}

function renderRicette() {
  const all = Object.values(S.state.ricette);
  const acq = all.filter((r) => r.stato === "acquistata").sort(byStarsThenName);
  const cos = all.filter((r) => r.stato === "costruita").sort(byName);
  $("scr-own").innerHTML = `
    <div class="section-head top">
      <h2>Le nostre ricette</h2>
      <button class="btn gold" data-action="openRecipeForm" data-stato="acquistata">+ Nuova ricetta</button>
    </div>
    ${acq.length ? acq.map((r) => recipeCardHtml(r, "acquistata")).join("") : `<p class="empty">Nessuna ricetta acquistata.</p>`}
    ${cos.length ? `<h2>Costruite</h2>` + cos.map((r) => recipeCardHtml(r, "costruita")).join("") : ""}`;
}

function sandboxSection() {
  if (!LOCAL_ONLY) return "";
  const body = S.sandbox
    ? `<div class="summary-row"><span>Sandbox</span><b>${esc(S.sandbox)}</b></div>
      <p class="hint sbx-note">Copia locale dei dati reali: si può modificare liberamente, nulla viene inviato al server.</p>
      <div class="btn-row">
        <button class="btn" data-action="sandboxReload">↻ Ricarica dal server</button>
        <button class="btn danger" data-action="sandboxExit">✕ Esci dalla sandbox</button>
      </div>`
    : `<p class="hint sbx-intro">Firebase è disattivato: i dati restano su questo dispositivo. Puoi caricare una partita reale in sola lettura per provare l'app con dati veri.</p>
      <button class="btn big" data-action="sandboxPicker">🔒 Carica dati reali (sola lettura)</button>`;
  return `<h2>Ambiente di test</h2><div class="card">${body}</div>`;
}

function renderImpostazioni() {
  const { pesi, soglia, maxSfidanti, vendiEssenziali } = S.state.impostazioni;
  const hasUndo = !!LS.get(KEY.undo(S.gameCode));
  let syncLabel;
  if (S.fb) syncLabel = S.online ? "attiva (Firebase)" : "in connessione…";
  else syncLabel = LOCAL_ONLY ? "disattivata — ambiente di test" : "non disponibile — solo locale";
  $("scr-set").innerHTML = `
    <h2>Pesi delle azioni</h2>
    <p class="hint">Valore di ogni azione: il piano consigliato è quello con la somma dei pesi più alta realizzabile con monete, materiali e magazzino. Gli step del piano seguono l'ordine dei pesi, dal più alto.</p>
    <div class="card settings-grid">
      ${ACTION_KEYS.map((k) => `<label for="peso-${k}">${ACTION_LABEL[k]}</label><input type="number" id="peso-${k}" min="0" value="${esc(pesi[k])}" data-change="setPeso" data-key="${k}">`).join("")}
    </div>
    <h2>Vendite nel piano</h2>
    <div class="card">
      <div class="checkline"><input type="checkbox" id="vendi-ess" ${vendiEssenziali ? "checked" : ""} data-change="setVendiEssenziali"><label for="vendi-ess">Vendi anche gli essenziali</label></div>
      <p class="hint hint-block">Il piano vende sempre prima i materiali base, dal più abbondante. Se attivo, quando i base vendibili sono finiti vende anche gli essenziali non necessari alle costruzioni del piano.</p>
    </div>
    <h2>Popup di scelta</h2>
    <div class="card settings-grid">
      <label for="soglia">Soglia piani equivalenti (%)</label><input type="number" id="soglia" min="0" max="100" value="${esc(soglia)}" data-change="setSoglia">
      <label for="max-sfidanti">Sfidanti massimi</label><input type="number" id="max-sfidanti" min="0" max="${SFIDANTI_MAX}" step="1" value="${esc(maxSfidanti)}" data-change="setMaxSfidanti">
    </div>
    <p class="hint">Sfidanti massimi: quanti piani, compreso il migliore, vengono estratti fra quelli con valore entro la soglia % dal migliore. Si confrontano a due e il piano scelto passa al confronto successivo: con N piani bastano N−1 scelte (0 o 1 = nessuna domanda).</p>
    <h2>Partita condivisa</h2>
    <div class="card">
      <div class="summary-row"><span>Codice partita</span><b>${esc(S.gameCode)}</b></div>
      <div class="summary-row"><span>Sincronizzazione</span><b>${syncLabel}</b></div>
      <div class="btn-row">
        <button class="btn" data-action="copyCode">⧉ Copia codice</button>
        <button class="btn" data-action="newGame">↻ Nuova partita</button>
      </div>
      <label for="join-code">Collega a una partita esistente</label>
      <div class="inline"><input type="text" id="join-code" placeholder="DSC-XXXX-XXXX"><button class="btn" id="join-btn" data-action="joinGame">Collega</button></div>
    </div>
    ${sandboxSection()}
    <h2>Sicurezza</h2>
    <div class="card">
      <button class="btn big" ${hasUndo ? "" : "disabled"} data-action="undoApply">↩ Annulla ultima applicazione piano</button>
      <p class="hint hint-block">Ripristina lo stato precedente all'ultimo "Applica piano" (salvato su questo dispositivo).</p>
    </div>
    <p class="app-version">Descent Companion ${esc(APP_VERSION)}</p>`;
}

/* ── Aggiornamento delle schermate ──
   Dopo ogni modifica si ridisegna solo la schermata visibile: le altre vengono
   segnate come da aggiornare e ridisegnate quando si aprono (vedi showScreen). */
const SCREENS = {
  "scr-inv": renderInventario,
  "scr-mkt": renderMercato,
  "scr-own": renderRicette,
  "scr-opt": renderOttimizza,
  "scr-set": renderImpostazioni,
};
const stale = new Set(Object.keys(SCREENS));

/* il render ricostruisce la schermata: chi usa la tastiera ritrova il focus
   sull'elemento equivalente (stessa azione e stessi parametri) */
const focusSignature = (el) => (el?.dataset?.action ? JSON.stringify(el.dataset) : null);

function renderScreen(id) {
  const screen = $(id);
  const signature = screen.contains(document.activeElement) ? focusSignature(document.activeElement) : null;
  stale.delete(id);
  SCREENS[id]();
  if (signature) {
    [...screen.querySelectorAll("[data-action]")].find((el) => focusSignature(el) === signature)?.focus();
  }
}

export function renderAll() {
  Object.keys(SCREENS).forEach((id) => stale.add(id));
  const current = document.querySelector(".screen.active")?.id;
  if (ownValue(SCREENS, current)) renderScreen(current);
  updateSyncPill();
}

export function showScreen(id) {
  if (!ownValue(SCREENS, id)) return;
  if (stale.has(id)) renderScreen(id);
  goScreen(id);
}
