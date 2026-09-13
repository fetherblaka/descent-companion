/* Salvataggio locale e sincronizzazione con il server.
   Al server si inviano solo le differenze rispetto all'ultimo stato allineato
   ("synced"), percorso per percorso: modifiche concorrenti a campi diversi da
   dispositivi diversi non si sovrascrivono. I contatori (monete, materiali,
   magazzino) viaggiano come incrementi in una transaction, così due "+1"
   simultanei valgono +2. Quando arriva un aggiornamento remoto, le modifiche
   locali non ancora inviate vengono riapplicate sopra i dati remoti. */
import { REMOTE_CHECK_TIMEOUT_MS, SAVE_DEBOUNCE_MS, gamePath } from "./config.js";
import { renderAll } from "./render.js";
import { normalize } from "./schema.js";
import { KEY, LS, S, rememberGame } from "./store.js";
import { toast, updateSyncPill } from "./ui.js";
import { isPlainObj, parseJSON } from "./util.js";

let synced = null; /* forma canonica dell'ultimo stato allineato col server */
let saveTimer = null;
let pushing = false; /* scritture in corso: gli eventi locali che generano vanno ignorati */
let remotePath = null; /* partita ascoltata sul server */
let unsubscribe = null;

/* ── Confronto e differenze ── */

/* copia profonda con chiavi ordinate e senza null né oggetti/array vuoti: la
   stessa forma in cui Firebase restituisce i dati */
export function canonState(v) {
  if (Array.isArray(v)) return v.map(canonState);
  if (isPlainObj(v)) {
    const o = {};
    Object.keys(v)
      .sort()
      .forEach((k) => {
        const c = canonState(v[k]);
        if (c != null && !(typeof c === "object" && !Object.keys(c).length)) o[k] = c;
      });
    return o;
  }
  return v;
}

/* firma dello stato: l'eco di Firebase (che scarta null e oggetti vuoti) non conta come modifica */
export const stateSig = (s) => JSON.stringify(canonState(s));

const isCounterPath = (p) =>
  (p.length === 1 && p[0] === "monete") || (p.length === 2 && (p[0] === "materiali" || p[0] === "magazzino"));

/* operazioni che portano da a a b: {path, delta} per i contatori,
   {path, value} per il resto (value null = elimina) */
export function diffState(a, b) {
  const ops = [];
  const walk = (x, y, path) => {
    if (isPlainObj(x) && isPlainObj(y)) {
      new Set([...Object.keys(x), ...Object.keys(y)]).forEach((k) => walk(x[k], y[k], [...path, k]));
      return;
    }
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (isCounterPath(path) && typeof x === "number" && typeof y === "number") ops.push({ path, delta: y - x });
    else ops.push({ path, value: y === undefined ? null : y });
  };
  walk(canonState(a), canonState(b), []);
  return ops;
}

export function applyOps(base, ops) {
  const out = canonState(base);
  ops.forEach(({ path, value, delta }) => {
    let o = out;
    for (const k of path.slice(0, -1)) {
      if (!isPlainObj(o[k])) o[k] = {};
      o = o[k];
    }
    const k = path[path.length - 1];
    if (delta !== undefined) o[k] = Math.max(0, (typeof o[k] === "number" ? o[k] : 0) + delta);
    else if (value == null) delete o[k];
    else o[k] = canonState(value);
  });
  return out;
}

/* ── Scrittura ── */

const syncFailed = (e) => toast("Sincronizzazione non riuscita: " + (e?.message || e));

function whilePushing(fn) {
  pushing = true;
  try {
    fn();
  } finally {
    pushing = false;
  }
}

export function save(rerender = true) {
  LS.set(KEY.state(S.gameCode), JSON.stringify(S.state));
  if (!S.sandbox && remotePath) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushRemote, SAVE_DEBOUNCE_MS);
  }
  if (rerender) renderAll();
}

function pushRemote() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!remotePath || !S.fb || S.sandbox || !synced) return;
  const ops = diffState(synced, S.state);
  if (!ops.length) return;
  synced = canonState(S.state);
  const updates = {};
  const counters = [];
  ops.forEach((op) => {
    if (op.delta !== undefined) counters.push(op);
    else updates[op.path.join("/")] = op.value;
  });
  const { fb } = S;
  const path = remotePath;
  whilePushing(() => {
    if (Object.keys(updates).length) fb.update(path, updates).catch(syncFailed);
    counters.forEach((op) => {
      fb.transaction(`${path}/${op.path.join("/")}`, (cur) =>
        Math.max(0, (typeof cur === "number" ? cur : 0) + op.delta),
      ).catch(syncFailed);
    });
  });
}

/* partita che non esiste ancora sul server (appena creata): la si scrive intera */
function pushFull() {
  if (!remotePath || !S.fb || S.sandbox) return;
  synced = canonState(S.state);
  const { fb } = S;
  whilePushing(() => fb.set(remotePath, S.state).catch(syncFailed));
}

/* ── Lettura ── */

function onRemoteValue(code, snap) {
  if (code !== S.gameCode) return;
  S.online = true;
  updateSyncPill();
  if (pushing) return;
  if (!snap.exists()) {
    pushFull();
    return;
  }
  const pending = synced ? diffState(synced, S.state) : [];
  const base = normalize(snap.val());
  synced = canonState(base);
  const next = pending.length ? normalize(applyOps(base, pending)) : base;
  /* l'eco delle proprie scritture non cambia nulla: lo stato resta lo stesso oggetto */
  if (stateSig(next) === stateSig(S.state)) return;
  S.state = next;
  LS.set(KEY.state(code), JSON.stringify(S.state));
  renderAll();
}

export function attachGame(code) {
  if (saveTimer) pushRemote(); /* modifiche in sospeso della partita precedente */
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  remotePath = null;
  S.gameCode = code;
  LS.set(KEY.code, code);
  rememberGame(code);
  S.state = normalize(parseJSON(LS.get(KEY.state(code))));
  synced = canonState(S.state);
  if (S.fb && !S.sandbox) {
    remotePath = gamePath(code);
    unsubscribe = S.fb.listen(
      remotePath,
      (snap) => onRemoteValue(code, snap),
      () => {
        S.online = false;
        updateSyncPill();
      },
    );
  }
  renderAll();
}

/* true/false = la partita esiste o no sul server; null = nessun server (modalità
   locale); undefined = verifica impossibile (server non raggiungibile) */
export function remoteExists(code) {
  if (!S.fb) return Promise.resolve(null);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(undefined), REMOTE_CHECK_TIMEOUT_MS));
  return Promise.race([S.fb.exists(gamePath(code)), timeout]).catch(() => undefined);
}

/* se la pagina va in background o si chiude, le modifiche in attesa partono subito */
export function installSyncFlush() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && saveTimer) pushRemote();
  });
  window.addEventListener("pagehide", () => {
    if (saveTimer) pushRemote();
  });
}
