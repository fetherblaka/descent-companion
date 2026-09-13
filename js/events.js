/* Collegamento degli eventi.
   Nessun handler inline: gli elementi dichiarano data-action (click) o
   data-change (change) e i parametri in altri data-*. I parametri arrivano da
   dataset, già decodificati e mai interpretati come codice, quindi i dati remoti
   (nomi, id) non possono iniettare script. */
import {
  bump,
  bumpCoins,
  copyCode,
  editNum,
  joinGame,
  newGame,
  resetMagazzino,
  setPeso,
  setSoglia,
  toggleHero,
} from "./game.js";
import { chooseOption, confirmApplyPlan, resetOptimizer, runOptimizer, undoApply } from "./plan.js";
import {
  addMatRow,
  deleteRecipe,
  editCosto,
  fHeroShortcut,
  fHeroToggle,
  formStar,
  markAcquistata,
  markCostruita,
  openRecipeForm,
  removeMatRow,
  saveRecipe,
  setStelle,
  togglePotUI,
} from "./recipes.js";
import { sandboxExit, sandboxPick, sandboxPickManual, sandboxPicker, sandboxReload } from "./sandbox.js";
import { closeDyn, goScreen } from "./ui.js";
import { ownValue } from "./util.js";

const CLICK_ACTIONS = {
  goScreen: (d) => goScreen(d.scr),
  closeModal: (d) => closeDyn(d.target),
  bump: (d) => bump(d.kind, d.mat, Number(d.delta)),
  bumpCoins: (d) => bumpCoins(Number(d.delta)),
  editNum: (d) => editNum(d.kind, d.mat),
  editCosto: (d) => editCosto(d.id),
  setStelle: (d) => setStelle(d.id, Number(d.k)),
  markAcquistata: (d) => markAcquistata(d.id),
  markCostruita: (d) => markCostruita(d.id),
  openRecipeForm: (d) => openRecipeForm(d.id || null, d.stato),
  deleteRecipe: (d) => deleteRecipe(d.id),
  resetMagazzino: () => resetMagazzino(),
  toggleHero: (d) => toggleHero(d.hero),
  runOptimizer: () => runOptimizer(),
  resetOptimizer: () => resetOptimizer(),
  chooseOption: (d) => chooseOption(Number(d.idx)),
  confirmApplyPlan: () => confirmApplyPlan(),
  copyCode: () => copyCode(),
  newGame: () => newGame(),
  joinGame: () => joinGame(),
  undoApply: () => undoApply(),
  sandboxPicker: () => sandboxPicker(),
  sandboxPick: (d) => sandboxPick(d.code),
  sandboxPickManual: () => sandboxPickManual(),
  sandboxReload: () => sandboxReload(),
  sandboxExit: () => sandboxExit(),
  firstRunSandbox: () => {
    closeDyn("dyn-firstrun");
    sandboxPicker();
  },
  formStar: (d) => formStar(Number(d.k)),
  fHeroToggle: (d) => fHeroToggle(d.hero),
  fHeroShortcut: (d) => fHeroShortcut(d.kind),
  addMatRow: () => addMatRow(),
  removeMatRow: (d, el) => removeMatRow(el),
  saveRecipe: (d) => saveRecipe(d.id || "", d.stato || ""),
};

const CHANGE_ACTIONS = {
  setPeso: (d, el) => setPeso(d.key, el.value),
  setSoglia: (d, el) => setSoglia(el.value),
  togglePotUI: () => togglePotUI(),
};

export function installEvents() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const fn = ownValue(CLICK_ACTIONS, el.dataset.action);
    if (fn) fn(el.dataset, el);
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-change]");
    if (!el) return;
    const fn = ownValue(CHANGE_ACTIONS, el.dataset.change);
    if (fn) fn(el.dataset, el);
  });
}
