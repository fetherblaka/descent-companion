/* Stato condiviso dell'app e persistenza su localStorage. */
import { RECENT_GAMES_MAX } from "./config.js";
import { CODE_RE } from "./data.js";
import { emptyState } from "./schema.js";
import { toast } from "./ui.js";
import { parseJSON } from "./util.js";

/* unico contenitore dello stato mutabile condiviso fra i moduli */
export const S = {
  state: emptyState(),
  gameCode: null /* codice della partita aperta */,
  sandbox: null /* codice della partita reale caricata nella sandbox di test, se attiva */,
  prevGameCode: null /* partita locale da ripristinare uscendo dalla sandbox */,
  fb: null /* adattatore Firebase (null = modalità locale) */,
  online: false,
};

const STATE_PREFIX = "descent_state_";
const UNDO_PREFIX = "descent_undo_";
const BACKUP_PREFIX = "descent_backup_"; /* non rimossi dalla pulizia delle partite non recenti */
const SANDBOX_PREFIX = "sbx_";
export const KEY = {
  code: "descent_code",
  state: (code) => STATE_PREFIX + code,
  undo: (code) => UNDO_PREFIX + code,
  backups: (code) => BACKUP_PREFIX + code,
  recentGames: "descent_recent_codes",
  sandboxRecent: "descent_sbx_recent",
  sandboxSession: "descent_sbx_code",
};

/* ── Accesso diretto (chiavi esatte) ── */
export function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeRaw(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* archiviazione non disponibile */
  }
}
function removeRaw(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* archiviazione non disponibile */
  }
}
export function storageKeys() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
  } catch {
    /* archiviazione non disponibile */
  }
  return keys;
}

/* ── Accesso della partita ──
   Con la sandbox di test attiva ogni chiave va su un prefisso separato ("sbx_"),
   così la copia dei dati reali non tocca le partite locali. */
const partitionKey = (k) => (S.sandbox ? SANDBOX_PREFIX + k : k);
let storageWarned = false;
export const LS = {
  get: (k) => readRaw(partitionKey(k)),
  set(k, v) {
    try {
      localStorage.setItem(partitionKey(k), v);
      return true;
    } catch {
      if (!storageWarned) {
        storageWarned = true;
        toast("Salvataggio locale non riuscito: spazio esaurito o archiviazione bloccata");
      }
      return false;
    }
  },
  del: (k) => removeRaw(partitionKey(k)),
};

/* codici delle partite presenti nella cache locale (fuori dalla sandbox) */
export const cachedGameCodes = () =>
  storageKeys()
    .filter((k) => k.startsWith(STATE_PREFIX))
    .map((k) => k.slice(STATE_PREFIX.length));

/* ── Pulizia ──
   Si tiene in cache solo le ultime RECENT_GAMES_MAX partite aperte: le altre
   restano sul server e si ricaricano collegandosi di nuovo. */
export function rememberGame(code) {
  if (S.sandbox) return;
  let recent = parseJSON(LS.get(KEY.recentGames));
  /* prima volta: si parte dalle partite già in cache */
  if (!Array.isArray(recent)) recent = cachedGameCodes().filter((c) => CODE_RE.test(c));
  recent = [code, ...recent.filter((c) => c !== code)].slice(0, RECENT_GAMES_MAX);
  LS.set(KEY.recentGames, JSON.stringify(recent));
  storageKeys().forEach((k) => {
    const prefix = [STATE_PREFIX, UNDO_PREFIX].find((p) => k.startsWith(p));
    if (prefix && !recent.includes(k.slice(prefix.length))) removeRaw(k);
  });
}

/* copie della sandbox rimaste da sessioni precedenti (la sandbox non sopravvive alla sessione) */
export function pruneSandboxLeftovers() {
  storageKeys()
    .filter((k) => k.startsWith(SANDBOX_PREFIX))
    .forEach(removeRaw);
}
