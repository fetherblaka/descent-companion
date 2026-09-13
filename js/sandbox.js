/* Sandbox dati reali (solo ambiente di test).
   Carica una partita dal database di produzione in una copia locale separata
   (chiavi "sbx_"): la si può modificare liberamente, nulla viene inviato al
   server. L'unico accesso a produzione è una GET REST: da qui non esiste, per
   costruzione, alcuna possibilità di scrittura. */
import { LOCAL_ONLY, SANDBOX_RECENT_MAX, firebaseConfig, gamePath } from "./config.js";
import { firstRunModal } from "./game.js";
import { resetPlanState } from "./plan.js";
import { renderAll } from "./render.js";
import { emptyState, normalize } from "./schema.js";
import { KEY, LS, S, cachedGameCodes, pruneSandboxLeftovers, readRaw, writeRaw } from "./store.js";
import { attachGame } from "./sync.js";
import { $, askConfirm, closeDyn, openModal, toast } from "./ui.js";
import { esc, ownValue, parseJSON } from "./util.js";

const DB_URL = String(firebaseConfig.databaseURL || "").replace(/\/+$/, "");
let found = {}; /* partite lette dal server nell'ultimo picker, per codice */

async function roGet(path) {
  if (!LOCAL_ONLY) throw new Error("disponibile solo in ambiente di test");
  if (!/^https:\/\//.test(DB_URL)) throw new Error("databaseURL non configurato");
  const url = `${DB_URL}/${String(path).split("/").filter(Boolean).map(encodeURIComponent).join("/")}.json`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403 ? "permesso negato dalle regole del database" : `HTTP ${res.status}`,
    );
  }
  return res.json();
}

/* le regole del database non permettono di elencare /partite: si propongono la
   partita locale e i codici già aperti su questo dispositivo */
function knownCodes() {
  const out = [];
  const add = (c) => {
    if (typeof c === "string" && c && !out.includes(c)) out.push(c);
  };
  add(S.sandbox ? S.prevGameCode : S.gameCode);
  const recent = parseJSON(readRaw(KEY.sandboxRecent), []);
  if (Array.isArray(recent)) recent.forEach(add);
  cachedGameCodes().forEach(add);
  return out;
}

function remember(code) {
  const prev = parseJSON(readRaw(KEY.sandboxRecent), []);
  const list = [code, ...(Array.isArray(prev) ? prev : []).filter((c) => c !== code)].slice(0, SANDBOX_RECENT_MAX);
  writeRaw(KEY.sandboxRecent, JSON.stringify(list));
}

function sandboxEnter(code, data) {
  if (!LOCAL_ONLY) return;
  if (!S.sandbox) S.prevGameCode = S.gameCode;
  S.sandbox = code;
  try {
    sessionStorage.setItem(KEY.sandboxSession, code);
  } catch {
    /* sessionStorage non disponibile: la sandbox non sopravvive al refresh */
  }
  LS.del(KEY.undo(code));
  S.gameCode = code;
  S.state = normalize(data);
  LS.set(KEY.code, code);
  LS.set(KEY.state(code), JSON.stringify(S.state));
  remember(code);
  resetPlanState();
  renderAll();
}

async function sandboxLoadCode(code) {
  try {
    const data = await roGet(gamePath(code));
    if (!data) {
      toast(`Partita ${code} non trovata`);
      return;
    }
    sandboxEnter(code, data);
    toast("Dati reali caricati (sola lettura)");
  } catch (e) {
    toast("Lettura fallita: " + e.message);
  }
}

export async function sandboxPicker() {
  if (!LOCAL_ONLY) {
    toast("Disponibile solo in ambiente di test");
    return;
  }
  openModal(
    "dyn-sbx",
    `<h3>Dati reali</h3>
    <p class="sub">Carica una partita dal database di produzione in una copia locale di prova: potrai usarla come vuoi, l'app non scriverà nulla sul server.</p>
    <div id="sbx-list"><p class="hint">Lettura in corso…</p></div>
    <label for="sbx-code">Codice partita</label>
    <div class="inline">
      <input type="text" id="sbx-code" placeholder="DSC-XXXX-XXXX">
      <button class="btn" data-action="sandboxPickManual">Carica</button>
    </div>
    <div class="btn-row modal-actions">
      <button class="btn" data-action="closeModal" data-target="dyn-sbx">Annulla</button>
    </div>`,
  );
  const codes = knownCodes();
  if (!codes.length) {
    if ($("sbx-list")) {
      $("sbx-list").innerHTML =
        `<p class="hint">Nessun codice noto su questo dispositivo: inseriscine uno qui sotto.</p>`;
    }
    return;
  }
  const games = [];
  for (const c of codes.slice(0, SANDBOX_RECENT_MAX)) {
    try {
      const g = await roGet(gamePath(c));
      if (g) games.push([c, g]);
    } catch {
      /* codice non leggibile: si salta */
    }
  }
  if (!$("sbx-list")) return;
  found = Object.fromEntries(games);
  $("sbx-list").innerHTML = games.length
    ? games
        .map(([c, g]) => {
          const nr = Object.keys(g.ricette || {}).length;
          const eroi = Array.isArray(g.eroiSel) ? g.eroiSel.join(", ") : "";
          return `<div class="opt-card" role="button" tabindex="0" data-action="sandboxPick" data-code="${esc(c)}"><b>${esc(c)}</b>
            <div class="val">🪙 ${esc(g.monete || 0)} · ${nr} ricette · ${esc(eroi)}</div></div>`;
        })
        .join("")
    : `<p class="hint">Nessuna partita trovata sul server per i codici noti.</p>`;
}

export function sandboxPick(code) {
  closeDyn("dyn-sbx");
  const data = ownValue(found, code);
  if (data) {
    sandboxEnter(code, data);
    toast("Dati reali caricati (sola lettura)");
  } else sandboxLoadCode(code);
}

export function sandboxPickManual() {
  const code = ($("sbx-code").value || "").trim().toUpperCase();
  if (!code) {
    toast("Inserisci un codice");
    return;
  }
  closeDyn("dyn-sbx");
  sandboxLoadCode(code);
}

export function sandboxReload() {
  if (!S.sandbox) return;
  const code = S.sandbox;
  askConfirm(
    "Ricaricare i dati reali?",
    "La copia di prova verrà sostituita con i dati attuali sul server: le modifiche fatte nella sandbox andranno perse.",
    "",
    "↻ Ricarica",
    () => sandboxLoadCode(code),
  );
}

export function sandboxExit() {
  if (!S.sandbox) return;
  const code = S.sandbox;
  LS.del(KEY.state(code));
  LS.del(KEY.undo(code));
  LS.del(KEY.code);
  S.sandbox = null;
  try {
    sessionStorage.removeItem(KEY.sandboxSession);
  } catch {
    /* sessionStorage non disponibile */
  }
  S.gameCode = S.prevGameCode || LS.get(KEY.code) || null;
  S.prevGameCode = null;
  resetPlanState();
  if (S.gameCode) attachGame(S.gameCode);
  else {
    S.state = emptyState();
    renderAll();
    firstRunModal();
  }
  toast("Sandbox chiusa");
}

/* all'avvio: la sandbox sopravvive a un refresh della pagina, ma mai a una sessione
   nuova. Restituisce true se è stata ripristinata una sandbox. */
export function restoreSandboxSession() {
  let code = null;
  try {
    code = LOCAL_ONLY ? sessionStorage.getItem(KEY.sandboxSession) : null;
  } catch {
    /* sessionStorage non disponibile */
  }
  if (!code) {
    pruneSandboxLeftovers();
    return false;
  }
  S.prevGameCode = S.gameCode;
  S.sandbox = code;
  const copy = parseJSON(LS.get(KEY.state(code)));
  if (copy) {
    S.gameCode = code;
    S.state = normalize(copy);
    renderAll();
  } else {
    S.sandbox = null;
    S.prevGameCode = null;
    renderAll();
    sandboxLoadCode(code);
  }
  return true;
}
