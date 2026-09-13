/* Partita: inventario, impostazioni, eroi, creazione e collegamento. */
import { LOCAL_ONLY } from "./config.js";
import { CODE_RE, EROI, MAT, RANK_KEYS, SOGLIA_MAX, defaultMagazzino, newCode } from "./data.js";
import { KEY, LS, S } from "./store.js";
import { attachGame, remoteExists, save } from "./sync.js";
import { $, askConfirm, closeDyn, numModal, openModal, toast } from "./ui.js";
import { esc, ownValue } from "./util.js";

/* ── Inventario ── */

export function bump(kind, matId, delta) {
  if (!ownValue(MAT, matId)) return;
  const target = kind === "own" ? S.state.materiali : S.state.magazzino;
  target[matId] = Math.max(0, (target[matId] || 0) + delta);
  save();
}

export function bumpCoins(delta) {
  S.state.monete = Math.max(0, S.state.monete + delta);
  save();
}

export function editNum(kind, matId) {
  if (kind === "coins") {
    numModal("Monete", S.state.monete, (n) => {
      S.state.monete = n;
      save();
    });
    return;
  }
  const mat = ownValue(MAT, matId);
  if (!mat) return;
  const own = kind === "own";
  const current = (own ? S.state.materiali : S.state.magazzino)[matId] || 0;
  numModal(`${mat.nome} — ${own ? "posseduti" : "magazzino"}`, current, (n) => {
    (own ? S.state.materiali : S.state.magazzino)[matId] = n;
    save();
  });
}

export function resetMagazzino() {
  askConfirm("Reset del magazzino?", "I materiali base torneranno a 10, gli essenziali a 0.", "", "↺ Reset", () => {
    S.state.magazzino = defaultMagazzino();
    save();
    toast("Magazzino ripristinato");
  });
}

export function toggleHero(hero) {
  if (!EROI.includes(hero)) return;
  const sel = S.state.eroiSel;
  const i = sel.indexOf(hero);
  if (i >= 0) sel.splice(i, 1);
  else sel.push(hero);
  save();
}

/* ── Impostazioni ── */

export function setPeso(key, value) {
  const n = parseFloat(value);
  if (RANK_KEYS.includes(key) && !isNaN(n) && n >= 0) {
    S.state.impostazioni.pesi[key] = n;
    save(false);
  }
}

export function setSoglia(value) {
  const n = parseFloat(value);
  if (!isNaN(n) && n >= 0) {
    S.state.impostazioni.soglia = Math.min(SOGLIA_MAX, n);
    save(false);
  }
}

/* ── Partita condivisa ── */

export function copyCode() {
  navigator.clipboard
    .writeText(S.gameCode)
    .then(() => toast("Codice copiato"))
    .catch(() => prompt("Copia il codice:", S.gameCode));
}

function startNewGame() {
  const code = newCode();
  attachGame(code);
  save();
  toast("Nuova partita: " + code);
}

export function newGame() {
  if (S.sandbox) {
    toast("Non disponibile nella sandbox");
    return;
  }
  askConfirm(
    "Nuova partita?",
    "Verrà creato un nuovo codice con dati azzerati. La partita attuale resta raggiungibile con il suo codice.",
    "",
    "✓ Crea",
    startNewGame,
  );
}

export function firstRunModal() {
  openModal(
    "dyn-firstrun",
    `<h3>Benvenuto</h3>
    <p class="sub">Nessuna partita salvata su questo dispositivo. Inizia una nuova partita oppure collegati a una esistente digitandone il codice.</p>
    <button class="btn gold big" id="fr-new">✦ Inizia una nuova partita</button>
    <label>Oppure collega una partita esistente</label>
    <div class="inline"><input type="text" id="fr-code" placeholder="DSC-XXXX-XXXX"><button class="btn" id="fr-join">Collega</button></div>
    ${
      LOCAL_ONLY
        ? `<p class="hint firstrun-note">Ambiente di test: puoi anche caricare una partita reale in sola lettura.</p>
           <button class="btn" data-action="firstRunSandbox">🔒 Carica dati reali</button>`
        : ""
    }`,
  );
  $("fr-new").onclick = () => {
    closeDyn("dyn-firstrun");
    startNewGame();
  };
  const doJoin = () => {
    const code = readCode("fr-code");
    if (code) joinByCode(code, $("fr-join"), () => closeDyn("dyn-firstrun"));
  };
  $("fr-join").onclick = doJoin;
  $("fr-code").onkeydown = (e) => {
    if (e.key === "Enter") doJoin();
  };
}

export function joinGame() {
  if (S.sandbox) {
    toast("Non disponibile nella sandbox");
    return;
  }
  const code = readCode("join-code");
  if (code) joinByCode(code, $("join-btn"));
}

function readCode(inputId) {
  const code = ($(inputId).value || "").trim().toUpperCase();
  if (!code) {
    toast("Inserisci un codice");
    return null;
  }
  if (!CODE_RE.test(code)) {
    toast("Codice non valido: il formato è DSC-XXXX-XXXX");
    return null;
  }
  return code;
}

/* Un codice sbagliato non deve creare in silenzio una partita vuota sul server:
   prima di collegarsi si verifica che la partita esista. */
async function joinByCode(code, btn, onConnect) {
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
  }
  const exists = await remoteExists(code);
  if (btn) btn.disabled = false;
  const connect = () => {
    if (onConnect) onConnect();
    LS.del(KEY.state(code));
    attachGame(code);
    toast("Collegato a " + code);
  };
  if (exists === false) {
    toast(`Partita ${code} non trovata sul server`);
    return;
  }
  if (exists === undefined) {
    askConfirm(
      "Impossibile verificare il codice",
      `Il server non risponde. Se colleghi comunque ${esc(code)} e la partita non esiste, ne verrà creata una nuova vuota.`,
      "",
      "Collega comunque",
      connect,
      "danger",
    );
    return;
  }
  connect();
}
