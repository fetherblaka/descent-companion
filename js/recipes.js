/* Ricette: form di inserimento/modifica e azioni sulle singole ricette. */
import { EROI, HERO_SHORTCUTS, MAT, MATERIALI, MAX_STELLE } from "./data.js";
import { cleanOrphanPrereqs } from "./schema.js";
import { S } from "./store.js";
import { save } from "./sync.js";
import { $, askConfirm, closeDyn, formStarsHtml, heroCardHtml, numModal, openModal, toast } from "./ui.js";
import { esc, ownValue, uid } from "./util.js";

const NEW_RECIPE_STARS = 2;
let formStars = NEW_RECIPE_STARS; /* priorità scelta nel form aperto */
let formHeroes = []; /* eroi selezionati nel form aperto */
/* stato delle checkbox dei modali di conferma: il modale viene rimosso prima che
   la conferma venga eseguita, quindi il valore va conservato qui */
let chkCoins = true;
let chkMats = false;

const materialName = (m) => ownValue(MAT, m)?.nome ?? m;

/* tocco sulle stelle: ritoccare l'ultima stella accesa scende di uno (fino a 0) */
export function setStelle(id, k) {
  const r = ownValue(S.state.ricette, id);
  if (!r) return;
  r.stelle = r.stelle === k ? k - 1 : k;
  save();
}

export function editCosto(id) {
  const r = ownValue(S.state.ricette, id);
  if (!r) return;
  /* la ricetta si rilegge alla conferma: nel frattempo un aggiornamento remoto può aver sostituito lo stato */
  numModal("Costo di acquisto — " + esc(r.nome), r.costo, (n) => {
    const cur = ownValue(S.state.ricette, id);
    if (cur) {
      cur.costo = n;
      save();
    }
  });
}

/* ── Form ── */

export function openRecipeForm(id, newStato) {
  const r = id ? ownValue(S.state.ricette, id) : null;
  const showCosto = r ? r.stato === "mercato" : newStato === "mercato";
  const pot = r ? r.pot : false;
  const preTipo = r && r.prereq ? r.prereq.tipo : "posseduta";
  const preId = r && r.prereq && r.prereq.id ? r.prereq.id : "";
  const others = Object.values(S.state.ricette).filter((x) => x.id !== id);
  const preOpts = others
    .map(
      (x) =>
        `<option value="${esc(x.id)}" ${x.id === preId ? "selected" : ""}>${esc(x.nome)}${x.pot ? " +" : ""}</option>`,
    )
    .join("");
  const sub = r
    ? ""
    : newStato === "mercato"
      ? "Inserita nel Mercato della campagna in corso."
      : "Inserita direttamente tra le vostre ricette (acquistata).";
  const shortcut = (kind, label) =>
    `<button type="button" class="btn" data-action="fHeroShortcut" data-kind="${kind}">${label}</button>`;
  const option = (value, label, extra = "") =>
    `<option value="${value}" ${preTipo === value ? "selected" : ""} ${extra}>${label}</option>`;
  const costoField = showCosto
    ? `<label for="f-costo">Costo di acquisto (monete)</label>
       <input type="number" id="f-costo" min="0" inputmode="numeric" value="${r ? esc(r.costo) : ""}" placeholder="45">`
    : "";
  const matRows = r
    ? Object.entries(r.materiali)
        .map(([m, q]) => matRowHtml(m, q))
        .join("")
    : "";

  openModal(
    "modal-recipe",
    `<h3>${r ? "Modifica ricetta" : "Nuova ricetta"}</h3>
    <p class="sub">${sub}</p>
    <label for="f-nome">Nome</label>
    <input type="text" id="f-nome" value="${r ? esc(r.nome) : ""}" placeholder="es. Martello delle Ere">
    ${costoField}
    <p class="field-label" id="f-stars-label">Priorità</p>
    <div id="f-stars" class="stars pick big" role="group" aria-labelledby="f-stars-label"></div>
    <p class="hint form-note">tocca — ritocca l'ultima stella per scendere fino a 0 (= mai)</p>
    <div class="checkline spaced">
      <input type="checkbox" id="f-pot" ${pot ? "checked" : ""} data-change="togglePotUI">
      <label for="f-pot" class="strong">Versione potenziata <b class="pot-mark">+</b></label>
    </div>
    <div id="f-prereq" class="prereq-box"${pot ? "" : " hidden"}>
      <label for="f-prereq-tipo">Versione normale</label>
      <select id="f-prereq-tipo" data-change="togglePotUI">
        ${option("posseduta", "Già posseduta")}
        ${option("mancante", "Non posseduta — blocca la costruzione")}
        ${option("ricetta", "È una ricetta nell'app…", others.length ? "" : "disabled")}
      </select>
      <select id="f-prereq-id" class="prereq-id" aria-label="Ricetta normale collegata"${pot && preTipo === "ricetta" ? "" : " hidden"}>${preOpts}</select>
    </div>
    <p class="field-label" id="f-heroes-label">Eroi</p>
    <div class="shortcut-row" role="group" aria-label="Selezione rapida degli eroi">
      ${shortcut("all", "Tutti")}${shortcut("leggera", "Arm. leggera")}${shortcut("media", "Arm. media")}${shortcut("pesante", "Arm. pesante")}
    </div>
    <div id="f-heroes" class="heroes-grid form-heroes" role="group" aria-labelledby="f-heroes-label"></div>
    <p class="field-label" id="f-mats-label">Materiali per la costruzione</p>
    <div id="f-mats" role="group" aria-labelledby="f-mats-label">${matRows}</div>
    <button class="btn" data-action="addMatRow">+ Aggiungi materiale</button>
    <div class="btn-row form-actions">
      <button class="btn" data-action="closeModal" data-target="modal-recipe">Annulla</button>
      <button class="btn gold" data-action="saveRecipe" data-id="${esc(id || "")}" data-stato="${esc(newStato || "")}">Salva ricetta</button>
    </div>`,
    { dismiss: "esc" },
  );
  formStars = r ? r.stelle : NEW_RECIPE_STARS;
  formHeroes = r ? [...r.eroi] : [];
  drawFormStars();
  drawFormHeroes();
}

export function togglePotUI() {
  const pot = $("f-pot").checked;
  $("f-prereq").hidden = !pot;
  $("f-prereq-id").hidden = !(pot && $("f-prereq-tipo").value === "ricetta");
}

function drawFormStars(focusK) {
  $("f-stars").innerHTML = formStarsHtml(formStars);
  /* il ridisegno sostituisce le stelle: il focus da tastiera resta su quella premuta */
  if (focusK) $("f-stars").querySelector(`[data-k="${focusK}"]`)?.focus();
}

export function formStar(k) {
  if (!(k >= 1 && k <= MAX_STELLE)) return;
  formStars = formStars === k ? k - 1 : k;
  drawFormStars(k);
}

function drawFormHeroes(focusHero) {
  $("f-heroes").innerHTML = EROI.map((h) => heroCardHtml(h, formHeroes.includes(h), "fHeroToggle")).join("");
  if (focusHero) [...$("f-heroes").children].find((el) => el.dataset.hero === focusHero)?.focus();
}

export function fHeroToggle(hero) {
  const i = formHeroes.indexOf(hero);
  if (i >= 0) formHeroes.splice(i, 1);
  else if (EROI.includes(hero)) formHeroes.push(hero);
  drawFormHeroes(hero);
}

export function fHeroShortcut(kind) {
  formHeroes = [...(ownValue(HERO_SHORTCUTS, kind) || [])];
  drawFormHeroes();
}

function matRowHtml(matId, qty) {
  const opts = MATERIALI.map(
    (m) => `<option value="${m.id}" ${m.id === matId ? "selected" : ""}>${m.nome}</option>`,
  ).join("");
  return `<div class="inline mat-sel">
    <select aria-label="Materiale">${opts}</select>
    <input type="number" min="1" value="${esc(qty || 1)}" aria-label="Quantità">
    <button class="icon-btn" data-action="removeMatRow" aria-label="Rimuovi materiale" title="Rimuovi">🗑</button>
  </div>`;
}

export function addMatRow() {
  $("f-mats").insertAdjacentHTML("beforeend", matRowHtml(MATERIALI[0].id, 1));
}

export function removeMatRow(button) {
  const row = button.closest(".mat-sel");
  if (row) row.remove();
}

export function saveRecipe(id, newStato) {
  const st = S.state;
  const nome = ($("f-nome").value || "").trim();
  if (!nome) {
    toast("Il nome è obbligatorio");
    return;
  }
  const existing = id ? ownValue(st.ricette, id) : null;
  const showCosto = id ? existing?.stato === "mercato" : newStato === "mercato";
  const costo = showCosto ? parseInt($("f-costo").value, 10) : 0;
  const eroi = [...new Set(formHeroes)];
  if (!eroi.length) {
    toast("Serve almeno un eroe");
    return;
  }
  const materiali = {};
  document.querySelectorAll("#f-mats .mat-sel").forEach((row) => {
    const m = row.querySelector("select").value;
    const q = parseInt(row.querySelector("input").value, 10);
    if (!isNaN(q) && q > 0) materiali[m] = (materiali[m] || 0) + q;
  });
  const pot = $("f-pot").checked;
  let prereq = null;
  if (pot) {
    const tipo = $("f-prereq-tipo").value;
    if (tipo === "ricetta") {
      const pid = $("f-prereq-id").value;
      if (pid) prereq = { tipo: "ricetta", id: pid };
      else {
        prereq = { tipo: "posseduta" };
        toast("Nessuna ricetta collegabile: impostata come già posseduta");
      }
    } else prereq = { tipo };
  }
  if (existing) {
    Object.assign(existing, { nome, eroi, materiali, stelle: formStars, pot, prereq });
    if (existing.stato === "mercato") existing.costo = isNaN(costo) ? 0 : Math.max(0, costo);
  } else {
    if (showCosto && (isNaN(costo) || costo < 0)) {
      toast("Costo di acquisto non valido");
      return;
    }
    const rid = uid();
    st.ricette[rid] = {
      id: rid,
      nome,
      costo: showCosto ? costo : 0,
      stelle: formStars,
      eroi,
      materiali,
      stato: newStato === "acquistata" ? "acquistata" : "mercato",
      pot,
      prereq,
    };
  }
  closeDyn("modal-recipe");
  save();
  toast("Ricetta salvata");
}

/* ── Azioni ── */

export function deleteRecipe(id) {
  const r = ownValue(S.state.ricette, id);
  if (!r) return;
  askConfirm(
    "Eliminare la ricetta?",
    esc(r.nome) + " verrà rimossa definitivamente.",
    "",
    "🗑 Elimina",
    () => {
      delete S.state.ricette[id];
      cleanOrphanPrereqs(S.state);
      save();
    },
    "danger",
  );
}

export function markAcquistata(id) {
  const r = ownValue(S.state.ricette, id);
  if (!r) return;
  askConfirm(
    "Segnare come acquistata?",
    esc(r.nome) + " uscirà dal Mercato e finirà tra le vostre ricette.",
    `<div class="checkline"><input type="checkbox" id="chk-coins" checked><label for="chk-coins">Scala ${esc(r.costo)} monete dall'inventario</label></div>`,
    "✓ Conferma",
    () => {
      const cur = ownValue(S.state.ricette, id); /* riletta: lo stato può essere stato sostituito */
      if (!cur) return;
      cur.stato = "acquistata";
      if (chkCoins) S.state.monete = Math.max(0, S.state.monete - cur.costo);
      save();
      toast("Ricetta acquistata");
    },
  );
  const chk = $("chk-coins");
  chkCoins = true;
  if (chk) chk.onchange = () => (chkCoins = chk.checked);
}

export function markCostruita(id) {
  const st = S.state;
  const r = ownValue(st.ricette, id);
  if (!r) return;
  const mats = Object.entries(r.materiali).filter(([, q]) => q > 0);
  const enough = mats.every(([m, q]) => (st.materiali[m] || 0) >= q);
  const linked = r.pot && r.prereq && r.prereq.tipo === "ricetta" ? ownValue(st.ricette, r.prereq.id) : null;
  const requires = mats.length
    ? " richiede: " + mats.map(([m, q]) => esc(q) + "× " + esc(materialName(m))).join(", ") + "."
    : "";
  const linkedNote = linked ? ` La versione normale collegata (${esc(linked.nome)}) verrà rimossa dall'app.` : "";
  const checkbox = mats.length
    ? `<div class="checkline"><input type="checkbox" id="chk-mats" ${enough ? "checked" : ""}><label for="chk-mats">Scala i materiali dall'inventario${enough ? "" : " (⚠ non tutti disponibili)"}</label></div>`
    : "";
  askConfirm(
    "Segnare come costruita?",
    esc(r.nome) + requires + linkedNote,
    checkbox,
    "⚒ Conferma",
    () => {
      const cur = ownValue(S.state.ricette, id); /* riletta: lo stato può essere stato sostituito */
      if (!cur) return;
      cur.stato = "costruita";
      if (chkMats) {
        Object.entries(cur.materiali)
          .filter(([, q]) => q > 0)
          .forEach(([m, q]) => {
            S.state.materiali[m] = Math.max(0, (S.state.materiali[m] || 0) - q);
          });
      }
      transformIfPot(cur);
      save();
      toast("Ricetta costruita");
    },
    "gold",
  );
  const chk = $("chk-mats");
  chkMats = enough && mats.length > 0;
  if (chk) chk.onchange = () => (chkMats = chk.checked);
}

/* quando viene costruita una potenziata collegata a una normale, la normale si trasforma e sparisce */
export function transformIfPot(r) {
  if (r.pot && r.prereq && r.prereq.tipo === "ricetta") {
    const N = ownValue(S.state.ricette, r.prereq.id);
    if (N) delete S.state.ricette[N.id];
    r.prereq = { tipo: "posseduta" };
    cleanOrphanPrereqs(S.state);
  }
}
