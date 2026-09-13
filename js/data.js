/* Dati fissi di gioco e valori di default. */

export const MATERIALI = [
  { id: "MAT_METAL", nome: "Metalli", compra: 5, vendi: 4, ess: false },
  { id: "MAT_LEATHER", nome: "Pelle", compra: 5, vendi: 4, ess: false },
  { id: "MAT_CURIOS", nome: "Curiosità", compra: 5, vendi: 4, ess: false },
  { id: "MAT_MINERALS", nome: "Minerali", compra: 5, vendi: 4, ess: false },
  { id: "MAT_BONE", nome: "Ossa", compra: 5, vendi: 4, ess: false },
  { id: "MAT_HERBS", nome: "Erba", compra: 5, vendi: 4, ess: false },
  { id: "MAT_CLOTH", nome: "Stoffa", compra: 5, vendi: 4, ess: false },
  { id: "MAT_AQUOS", nome: "Aquos", compra: 25, vendi: 19, ess: true },
  { id: "MAT_MORTOS", nome: "Mortos", compra: 30, vendi: 22, ess: true },
  { id: "MAT_TERROS", nome: "Terros", compra: 25, vendi: 19, ess: true },
  { id: "MAT_LUMOS", nome: "Lumos", compra: 30, vendi: 22, ess: true },
  { id: "MAT_ANEMOS", nome: "Anemos", compra: 25, vendi: 19, ess: true },
  { id: "MAT_TOXOS", nome: "Toxos", compra: 30, vendi: 22, ess: true },
  { id: "MAT_VIGOS", nome: "Vigos", compra: 30, vendi: 22, ess: true },
  { id: "MAT_UMBROS", nome: "Umbros", compra: 30, vendi: 22, ess: true },
  { id: "MAT_FORTUNOS", nome: "Fortunos", compra: 30, vendi: 22, ess: true },
  { id: "MAT_IGNOS", nome: "Ignos", compra: 25, vendi: 19, ess: true },
];
export const MAT = Object.fromEntries(MATERIALI.map((m) => [m.id, m]));

export const EROI = ["Vaerix", "Brynn", "Syrus", "Galaden", "Sorte", "Kehli"];
export const HERO_SHORTCUTS = {
  all: [...EROI],
  leggera: ["Vaerix", "Sorte", "Syrus"],
  media: ["Vaerix", "Galaden", "Sorte", "Kehli"],
  pesante: ["Brynn", "Kehli"],
};

export const RECIPE_STATI = ["mercato", "acquistata", "costruita"];
export const PREREQ_TIPI = ["posseduta", "mancante", "ricetta"];
export const MAX_STELLE = 3;

/* rank 1 = priorità massima; l'ordine delle chiavi è quello mostrato nelle impostazioni */
export const RANK = { acq3: 1, acq2: 2, cos3: 3, acq1: 4, cos2: 5, cos1: 6 };
export const RANK_KEYS = Object.keys(RANK);
export const RANK_LABEL = {
  acq3: "Acquisto ★★★",
  acq2: "Acquisto ★★",
  cos3: "Costruzione ★★★",
  acq1: "Acquisto ★",
  cos2: "Costruzione ★★",
  cos1: "Costruzione ★",
};
export const SOGLIA_MAX = 100; /* soglia dei piani "quasi pari", in % */

/* magazzino di default: materiali base a MAGAZZINO_BASE, essenziali a 0 */
export const MAGAZZINO_BASE = 10;
export function defaultMagazzino() {
  return Object.fromEntries(MATERIALI.map((m) => [m.id, m.ess ? 0 : MAGAZZINO_BASE]));
}
export function defaultState() {
  return {
    monete: 0,
    materiali: Object.fromEntries(MATERIALI.map((m) => [m.id, 0])),
    magazzino: defaultMagazzino(),
    ricette: {},
    eroiSel: ["Vaerix", "Brynn", "Syrus", "Galaden"],
    impostazioni: { pesi: { acq3: 8, acq2: 5, cos3: 4, acq1: 3, cos2: 2, cos1: 1 }, soglia: 10 },
  };
}

/* codici partita: DSC-XXXX-XXXX con alfabeto senza caratteri ambigui (niente I, L, O, 0, 1) */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^DSC-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;
export function newCode() {
  const block = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  return `DSC-${block()}-${block()}`;
}
