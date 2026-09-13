/* Backup della partita, al massimo BACKUP_MAX: un nuovo backup oltre il limite elimina il
   più vecchio.
   Dove: nel database, in partite/<codice>/backups/<ts> (le regole permettono l'accesso
   solo sotto la partita), condivisi fra i dispositivi. In ambiente di test e nella
   sandbox non si scrive sul server: i backup restano nel localStorage del dispositivo.
   Il nodo backups non fa parte dello stato: normalize() lo scarta e la sincronizzazione
   per differenze non lo tocca mai. Il ripristino arriva al server per differenze, come
   ogni altra modifica. */
import { BACKUP_MAX, gamePath } from "./config.js";
import { resetPlanState } from "./plan.js";
import { renderAll } from "./render.js";
import { normalize } from "./schema.js";
import { KEY, LS, S } from "./store.js";
import { canonState, save } from "./sync.js";
import { askConfirm, toast } from "./ui.js";
import { esc, isPlainObj, parseJSON } from "./util.js";

const remoteDb = () => (S.fb && !S.sandbox ? S.fb : null);
const backupsPath = (code) => `${gamePath(code)}/backups`;

/* backup validi di un nodo { ts: backup }, dal più recente */
function parseBackups(node) {
  if (!isPlainObj(node)) return [];
  return Object.values(node)
    .filter((b) => isPlainObj(b) && Number.isFinite(Number(b.ts)) && isPlainObj(b.state))
    .map((b) => ({ ...b, ts: Number(b.ts) }))
    .sort((a, b) => b.ts - a.ts);
}

/* ── Lettura ──
   Si ascolta il nodo dei backup della partita aperta; cambiando partita o modalità
   (sandbox) l'ascolto si sposta. */
let watched = null; /* { key, list, loaded, error, unsubscribe } */

const readLocal = () => {
  const node = parseJSON(LS.get(KEY.backups(S.gameCode)), {});
  return isPlainObj(node) ? node : {}; /* formato non riconosciuto: si riparte da vuoto */
};

function watchBackups() {
  const key = `${remoteDb() ? "db" : "local"}:${S.sandbox ? "sbx:" : ""}${S.gameCode}`;
  if (watched && watched.key === key) return watched;
  if (watched?.unsubscribe) watched.unsubscribe();
  const w = { key, list: [], loaded: false, error: null, unsubscribe: null };
  watched = w;
  const db = remoteDb();
  if (!S.gameCode || !db) {
    w.list = S.gameCode ? parseBackups(readLocal()) : [];
    w.loaded = true;
    return w;
  }
  /* la prima risposta può arrivare subito, anche durante il render: si ridisegna dopo */
  const refresh = () => setTimeout(renderAll, 0);
  w.unsubscribe = db.listen(
    backupsPath(S.gameCode),
    (snap) => {
      if (watched !== w) return;
      w.list = parseBackups(snap.val());
      w.loaded = true;
      w.error = null;
      /* più di BACKUP_MAX (due dispositivi insieme): si eliminano i più vecchi */
      const extra = w.list.slice(BACKUP_MAX);
      if (extra.length) writeBackups(Object.fromEntries(extra.map((b) => [b.ts, null]))).catch(() => {});
      refresh();
    },
    (e) => {
      if (watched !== w) return;
      w.loaded = true;
      w.error = e?.message || "lettura non riuscita";
      refresh();
    },
  );
  return w;
}

/* stato dell'elenco per l'interfaccia: { list, loaded, error, remote } */
export function backupsStatus() {
  const w = watchBackups();
  return { list: w.list.slice(0, BACKUP_MAX), loaded: w.loaded, error: w.error, remote: !!remoteDb() };
}

/* ── Scrittura: aggiornamento a più percorsi, { ts: backup | null } ── */
function writeBackups(updates) {
  const db = remoteDb();
  if (db) return db.update(backupsPath(S.gameCode), updates);
  const node = readLocal();
  Object.entries(updates).forEach(([ts, b]) => (b === null ? delete node[ts] : (node[ts] = b)));
  if (!LS.set(KEY.backups(S.gameCode), JSON.stringify(node))) return Promise.reject(new Error("spazio esaurito"));
  if (watched) watched.list = parseBackups(node);
  renderAll();
  return Promise.resolve();
}

const writeFailed = (what) => (e) => toast(`${what} non riuscito: ${e?.message || e}`);

export const fmtBackupDate = (ts) => new Date(ts).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

/* riepilogo in chiaro (non ancora passato da esc) */
export function backupSummary(b) {
  const ricette = Number.isFinite(b.ricette)
    ? b.ricette
    : isPlainObj(b.state.ricette)
      ? Object.keys(b.state.ricette).length
      : 0;
  const monete = Number(b.monete ?? b.state.monete) || 0;
  return `🪙 ${monete} · ${ricette} ricett${ricette === 1 ? "a" : "e"}`;
}

export function createBackup() {
  if (!S.gameCode) return;
  const w = watchBackups();
  if (!w.loaded) {
    toast("Elenco dei backup in caricamento: riprova tra un attimo");
    return;
  }
  /* ts univoco anche per due backup nello stesso millisecondo */
  const ts = Math.max(Date.now(), (w.list[0]?.ts ?? 0) + 1);
  const updates = {
    [ts]: { ts, monete: S.state.monete, ricette: Object.keys(S.state.ricette).length, state: canonState(S.state) },
  };
  const dropped = w.list.slice(BACKUP_MAX - 1);
  dropped.forEach((b) => (updates[b.ts] = null));
  /* con il database l'elenco si aggiorna subito (anche offline): l'errore arriva dopo */
  writeBackups(updates)
    .then(() => toast(dropped.length ? "Backup creato: eliminato il più vecchio" : "Backup creato"))
    .catch(writeFailed("Backup"));
}

export function restoreBackup(ts) {
  const backup = watchBackups().list.find((b) => b.ts === ts);
  if (!backup) {
    toast("Backup non trovato");
    return;
  }
  const shared = !!remoteDb();
  askConfirm(
    "Ripristinare il backup?",
    `La partita tornerà com'era il ${esc(fmtBackupDate(ts))}: le modifiche successive andranno perse${shared ? ", anche sugli altri dispositivi collegati" : ""}.`,
    `<div class="card summary-card"><div class="summary-row"><span>Backup</span><b>${esc(backupSummary(backup))}</b></div></div>`,
    "↩ Ripristina",
    () => {
      S.state = normalize(backup.state);
      /* l'annullamento dell'ultimo piano si riferisce a uno stato che non esiste più */
      LS.del(KEY.undo(S.gameCode));
      resetPlanState();
      save();
      toast("Backup ripristinato");
    },
    "danger",
  );
}

export function deleteBackup(ts) {
  if (!watchBackups().list.some((b) => b.ts === ts)) return;
  askConfirm(
    "Eliminare il backup?",
    `Il backup del ${esc(fmtBackupDate(ts))} verrà eliminato${remoteDb() ? " per tutti i dispositivi della partita" : " da questo dispositivo"}.`,
    "",
    "🗑 Elimina",
    () =>
      writeBackups({ [ts]: null })
        .then(() => toast("Backup eliminato"))
        .catch(writeFailed("Eliminazione")),
    "danger",
  );
}
