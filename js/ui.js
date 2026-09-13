/* Elementi di interfaccia condivisi: toast, modali, navigazione, indicatore di sync. */
import { INPUT_FOCUS_DELAY_MS, LOCAL_ONLY, TOAST_MS } from "./config.js";
import { MAT, MAX_STELLE } from "./data.js";
import { S } from "./store.js";
import { esc, ownValue } from "./util.js";

export const $ = (id) => document.getElementById(id);

let toastTimer = null;
export function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), TOAST_MS);
}

/* ── Modali ──
   Ogni modale è un dialog (role="dialog", aria-modal) intitolato dal suo h3.
   All'apertura il focus entra nel modale e il resto della pagina diventa inert;
   alla chiusura il focus torna all'elemento che l'aveva aperto.
   dismiss: "all" = si chiude con Esc e con un tocco sullo sfondo; "esc" = solo
   con Esc (form: un tocco accidentale non deve far perdere quanto scritto);
   "none" = solo con i suoi pulsanti. */
const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const PAGE_REGIONS = ["header", "#sbx-bar", "main", "nav"];

const overlays = () => [...$("modals").querySelectorAll(".overlay")];
export const topModal = () => overlays().at(-1) || null;

/* rende inert tutto ciò che sta sotto il modale in primo piano */
function syncInert() {
  const open = overlays();
  PAGE_REGIONS.forEach((sel) => document.querySelector(sel)?.toggleAttribute("inert", open.length > 0));
  open.forEach((o, i) => o.toggleAttribute("inert", i < open.length - 1));
}

export function closeDyn(id) {
  const overlay = $(id);
  if (!overlay) return;
  const back = overlay.returnFocus;
  overlay.remove();
  syncInert();
  if (back && back.isConnected) back.focus();
}

/* apre un modale, sostituendo un'eventuale copia con lo stesso id */
export function openModal(id, html, { modalClass = "", dismiss = "all" } = {}) {
  const previous = $(id);
  const opener = previous ? previous.returnFocus : document.activeElement;
  if (previous) previous.remove();
  $("modals").insertAdjacentHTML(
    "beforeend",
    `<div class="overlay open" id="${id}" data-dismiss="${dismiss}">
      <div class="modal${modalClass ? " " + modalClass : ""}" role="dialog" aria-modal="true" tabindex="-1">${html}</div>
    </div>`,
  );
  const overlay = $(id);
  const modal = overlay.firstElementChild;
  const title = modal.querySelector("h3");
  if (title) {
    title.id = `${id}-title`;
    modal.setAttribute("aria-labelledby", title.id);
  }
  overlay.returnFocus = opener;
  syncInert();
  modal.focus();
}

/* il Tab resta dentro il modale in primo piano */
export function trapFocus(overlay, e) {
  const modal = overlay.firstElementChild;
  const items = [...modal.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  if (!items.length) {
    e.preventDefault();
    modal.focus();
    return;
  }
  const first = items[0];
  const last = items.at(-1);
  const active = document.activeElement;
  const inside = items.includes(active);
  if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

export function askConfirm(title, sub, bodyHtml, okLabel, okFn, okClass = "teal") {
  openModal(
    "dyn-confirm",
    `<h3>${title}</h3><p class="sub">${sub}</p>${bodyHtml || ""}
    <div class="btn-row modal-actions">
      <button class="btn" data-action="closeModal" data-target="dyn-confirm">Annulla</button>
      <button class="btn ${okClass}" id="dyn-ok">${okLabel}</button>
    </div>`,
  );
  $("dyn-ok").onclick = () => {
    closeDyn("dyn-confirm");
    okFn();
  };
}

export function infoModal(title, sub, btnLabel, fn) {
  openModal(
    "dyn-info",
    `<div class="modal-icon" aria-hidden="true">✅</div>
    <h3>${title}</h3><p class="sub">${sub}</p>
    <button class="btn gold big" id="dyn-info-ok">${btnLabel}</button>`,
    { modalClass: "center" },
  );
  $("dyn-info-ok").onclick = () => {
    closeDyn("dyn-info");
    if (fn) fn();
  };
}

export function numModal(title, cur, onOk) {
  openModal(
    "dyn-num",
    `<h3>${title}</h3>
    <input type="number" id="dyn-num-in" class="num-input" min="0" inputmode="numeric" value="${esc(cur)}" aria-labelledby="dyn-num-title">
    <div class="btn-row modal-actions">
      <button class="btn" data-action="closeModal" data-target="dyn-num">Annulla</button>
      <button class="btn gold" id="dyn-num-ok">✓ OK</button>
    </div>`,
  );
  const input = $("dyn-num-in");
  setTimeout(() => {
    input.focus();
    input.select();
  }, INPUT_FOCUS_DELAY_MS);
  const ok = () => {
    const n = parseInt(input.value, 10);
    if (isNaN(n) || n < 0) {
      toast("Valore non valido");
      return;
    }
    closeDyn("dyn-num");
    onOk(n);
  };
  $("dyn-num-ok").onclick = ok;
  input.onkeydown = (e) => {
    if (e.key === "Enter") ok();
  };
}

/* ── Frammenti ── */

const starsWord = (k) => `${k} stell${k === 1 ? "a" : "e"}`;

/* recipeId: se presente, le stelle sono pulsanti che impostano la priorità di quella ricetta */
export function starsHtml(n, recipeId) {
  const label = `Priorità: ${n} su ${MAX_STELLE}`;
  let h = recipeId
    ? `<span class="stars pick" role="group" aria-label="${label}">`
    : `<span class="stars" role="img" aria-label="${label}">`;
  for (let k = 1; k <= MAX_STELLE; k++) {
    const control = recipeId
      ? ` role="button" tabindex="0" aria-label="Imposta ${starsWord(k)}" data-action="setStelle" data-id="${esc(recipeId)}" data-k="${k}"`
      : "";
    h += `<span class="${k <= n ? "" : "off"}"${control}>★</span>`;
  }
  return h + "</span>";
}

export function formStarsHtml(n) {
  let h = "";
  for (let k = 1; k <= MAX_STELLE; k++) {
    h += `<span class="${k <= n ? "" : "off"}" role="button" tabindex="0" aria-label="Imposta ${starsWord(k)}" aria-pressed="${k <= n}" data-action="formStar" data-k="${k}">★</span>`;
  }
  return h;
}

export function matChips(reqs) {
  return Object.entries(reqs || {})
    .filter(([, q]) => q > 0)
    .map(([m, q]) => `<span class="chip">${esc(q)}× ${esc(ownValue(MAT, m)?.nome ?? m)}</span>`)
    .join("");
}

/* card eroe selezionabile (schermata Ottimizza e form ricetta) */
export function heroCardHtml(hero, selected, action) {
  return `<div class="hero-card${selected ? " sel" : ""}" role="button" tabindex="0" aria-pressed="${selected}" data-action="${action}" data-hero="${esc(hero)}">${esc(hero)}</div>`;
}

export function goScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelectorAll("nav button").forEach((b) => {
    const active = b.dataset.scr === id;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("main").scrollTop = 0;
}

export function updateSyncPill() {
  const pill = $("sync-pill");
  const bar = $("sbx-bar");
  pill.classList.remove("on", "ro");
  if (S.sandbox) {
    pill.textContent = "🔒 dati reali";
    pill.classList.add("ro");
    bar.innerHTML = `🔒 <b>Sandbox</b> — copia in sola lettura di ${esc(S.sandbox)}: nulla viene scritto sul server.`;
    bar.hidden = false;
    return;
  }
  bar.hidden = true;
  if (S.fb && S.online) {
    pill.textContent = "● sincronizzata";
    pill.classList.add("on");
  } else if (S.fb) {
    pill.textContent = "◌ connessione…";
  } else {
    pill.textContent = LOCAL_ONLY ? "◌ test locale" : "◌ locale";
  }
}
