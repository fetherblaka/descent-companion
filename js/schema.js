/* Schema dei dati salvati: versione, migrazioni e validazione.
   Ogni dato che entra nell'app (cache locale, server, sandbox, annullamento)
   passa da normalize(), che applica le migrazioni mancanti e riporta ogni campo
   a un tipo e un intervallo validi, scartando ciò che non è riconosciuto. */
import {
  EROI,
  MAT,
  MATERIALI,
  MAX_STELLE,
  PREREQ_TIPI,
  RECIPE_STATI,
  SFIDANTI_MAX,
  SOGLIA_MAX,
  defaultState,
} from "./data.js";
import { isPlainObj, ownValue } from "./util.js";

export const SCHEMA_VERSION = 3;

/* Firebase restituisce gli array con buchi come oggetti: si accettano entrambi */
const listOf = (v) => (Array.isArray(v) ? v : isPlainObj(v) ? Object.values(v) : []);
/* quantità: intero ≥ 0 */
const count = (v, def = 0) => {
  if (v == null) return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : def;
};
/* pesi e soglia: numero ≥ 0 */
const nonNegative = (v, def) => {
  if (v == null) return def;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};
const knownHeroes = (v) => [...new Set(listOf(v).filter((h) => EROI.includes(h)))];

/* ── Migrazioni ──
   MIGRATIONS[n] porta i dati dalla versione n alla n+1, modificandoli sul posto.
   Per cambiare la forma dei dati: aggiungere una migrazione in fondo e
   incrementare SCHEMA_VERSION. */
const renameHero = (h) => (h === "Kheli" ? "Kehli" : h);
const MIGRATIONS = [
  /* 0 → 1: dati senza versione (fino a v0.0.5). Grafia dell'eroe: Kheli → Kehli */
  (s) => {
    if (s.eroiSel != null) s.eroiSel = listOf(s.eroiSel).map(renameHero);
    if (isPlainObj(s.ricette)) {
      Object.values(s.ricette).forEach((r) => {
        if (isPlainObj(r) && r.eroi != null) r.eroi = listOf(r.eroi).map(renameHero);
      });
    }
  },
  /* 1 → 2: nuova impostazione maxSfidanti (piani candidati per elaborazione). La soglia
     salvata non si tocca: i nuovi default (soglia 5%, pesi) valgono solo per le partite nuove. */
  (s) => {
    if (isPlainObj(s.impostazioni) && s.impostazioni.maxSfidanti == null) {
      s.impostazioni = { ...s.impostazioni, maxSfidanti: defaultState().impostazioni.maxSfidanti };
    }
  },
  /* 2 → 3: nuova impostazione vendiEssenziali (vendita degli essenziali nel piano), spenta */
  (s) => {
    if (isPlainObj(s.impostazioni) && s.impostazioni.vendiEssenziali == null) {
      s.impostazioni = { ...s.impostazioni, vendiEssenziali: false };
    }
  },
];

function migrate(raw) {
  const s = isPlainObj(raw) ? { ...raw } : {};
  let version = Number.isInteger(s.schemaVersion) && s.schemaVersion > 0 ? s.schemaVersion : 0;
  for (; version < SCHEMA_VERSION; version++) MIGRATIONS[version](s);
  /* dati scritti da una versione più recente dell'app: la versione non si retrocede */
  s.schemaVersion = version;
  return s;
}

/* ── Validazione ── */
function validPrereq(p) {
  if (!isPlainObj(p) || !PREREQ_TIPI.includes(p.tipo)) return null;
  if (p.tipo !== "ricetta") return { tipo: p.tipo };
  return typeof p.id === "string" ? { tipo: "ricetta", id: p.id } : { tipo: "posseduta" };
}

/* null se la ricetta è incompleta (es. resti di una modifica arrivata su una
   ricetta che un altro dispositivo aveva eliminato) */
function validRecipe(id, r) {
  if (!isPlainObj(r) || typeof r.nome !== "string" || !RECIPE_STATI.includes(r.stato)) return null;
  const materiali = {};
  if (isPlainObj(r.materiali)) {
    for (const [m, q] of Object.entries(r.materiali)) {
      if (ownValue(MAT, m) && count(q) > 0) materiali[m] = count(q);
    }
  }
  return {
    id,
    nome: r.nome,
    costo: count(r.costo),
    stelle: Math.min(MAX_STELLE, count(r.stelle)),
    eroi: knownHeroes(r.eroi),
    materiali,
    stato: r.stato,
    pot: r.pot === true,
    prereq: validPrereq(r.prereq),
  };
}

/* un prerequisito che punta a una ricetta non più presente equivale a "già
   posseduta" (è già così che lo trattano ottimizzatore e interfaccia): lo si
   rende esplicito, così nei dati non restano riferimenti pendenti */
export function cleanOrphanPrereqs(s) {
  Object.values(s.ricette).forEach((r) => {
    if (r.prereq && r.prereq.tipo === "ricetta" && !ownValue(s.ricette, r.prereq.id)) r.prereq = { tipo: "posseduta" };
  });
}

export function normalize(raw) {
  const s = migrate(raw);
  const d = defaultState();
  const counts = (src, defs) =>
    Object.fromEntries(MATERIALI.map((m) => [m.id, count(isPlainObj(src) ? src[m.id] : null, defs[m.id])]));

  const ricette = {};
  if (isPlainObj(s.ricette)) {
    for (const [id, r] of Object.entries(s.ricette)) {
      const valid = id !== "__proto__" && validRecipe(id, r);
      if (valid) ricette[id] = valid;
    }
  }
  const eroiSel = knownHeroes(s.eroiSel);
  const imp = isPlainObj(s.impostazioni) ? s.impostazioni : {};
  const pesi = isPlainObj(imp.pesi) ? imp.pesi : {};

  const out = {
    schemaVersion: s.schemaVersion,
    monete: count(s.monete, d.monete),
    materiali: counts(s.materiali, d.materiali),
    magazzino: counts(s.magazzino, d.magazzino),
    ricette,
    /* nessun eroe valido: Firebase non salva gli array vuoti, si torna al default */
    eroiSel: eroiSel.length ? eroiSel : d.eroiSel,
    impostazioni: {
      pesi: Object.fromEntries(Object.entries(d.impostazioni.pesi).map(([k, def]) => [k, nonNegative(pesi[k], def)])),
      soglia: Math.min(SOGLIA_MAX, nonNegative(imp.soglia, d.impostazioni.soglia)),
      maxSfidanti: Math.min(SFIDANTI_MAX, count(imp.maxSfidanti, d.impostazioni.maxSfidanti)),
      vendiEssenziali: imp.vendiEssenziali === true,
    },
  };
  cleanOrphanPrereqs(out);
  return out;
}

export const emptyState = () => normalize({});
