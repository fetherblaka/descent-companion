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

export function closeDyn(id) {
  const e = $(id);
  if (e) e.remove();
}

/* apre un modale, chiudendo prima un'eventuale copia con lo stesso id */
export function openModal(id, html, modalClass = "") {
  closeDyn(id);
  $("modals").insertAdjacentHTML(
    "beforeend",
    `<div class="overlay open" id="${id}"><div class="modal${modalClass ? " " + modalClass : ""}">${html}</div></div>`,
  );
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
    `<div class="modal-icon">✅</div>
    <h3>${title}</h3><p class="sub">${sub}</p>
    <button class="btn gold big" id="dyn-info-ok">${btnLabel}</button>`,
    "center",
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
    <input type="number" id="dyn-num-in" class="num-input" min="0" inputmode="numeric" value="${esc(cur)}">
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

/* recipeId: se presente, le stelle sono cliccabili e impostano la priorità di quella ricetta */
export function starsHtml(n, recipeId) {
  let h = `<span class="stars${recipeId ? " pick" : ""}">`;
  for (let k = 1; k <= MAX_STELLE; k++) {
    const click = recipeId ? ` data-action="setStelle" data-id="${esc(recipeId)}" data-k="${k}"` : "";
    h += `<span class="${k <= n ? "" : "off"}"${click}>★</span>`;
  }
  return h + "</span>";
}

export function matChips(reqs) {
  return Object.entries(reqs || {})
    .filter(([, q]) => q > 0)
    .map(([m, q]) => `<span class="chip">${esc(q)}× ${esc(ownValue(MAT, m)?.nome ?? m)}</span>`)
    .join("");
}

export function goScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.scr === id));
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
