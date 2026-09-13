/* Schermata Ottimizza: scelta degli eroi, confronti a due fra i piani candidati, piano
   consigliato, applicazione (intera o fino a uno step) e annullamento. */
import { HEROES_PER_MISSION } from "./config.js";
import { EROI, MAT } from "./data.js";
import { buildDepKey, candidatePlans, diffActions, executionOrder, planSteps } from "./optimizer.js";
import { transformIfPot } from "./recipes.js";
import { normalize } from "./schema.js";
import { KEY, LS, S } from "./store.js";
import { applyOps, canonState, diffState, save, stateSig } from "./sync.js";
import { showScreen } from "./render.js";
import { $, askConfirm, closeDyn, heroCardHtml, infoModal, openModal, toast } from "./ui.js";
import { esc, isPlainObj } from "./util.js";

let currentPlan = null; /* piano mostrato (null anche per "nessuna azione consigliata") */
let currentSteps = []; /* step di esecuzione del piano mostrato */
let planUpto = 0; /* step da applicare: i primi planUpto */
let planSig = null; /* firma dello stato su cui è stato calcolato; null = nessun piano mostrato */
let planStaleNotice = false; /* avviso "piano non più valido" */
/* elaborazione in corso: piani candidati, prossimo da confrontare, piano che ha vinto
   finora e firma dello stato di partenza */
let optCtx = null;

const fmtValue = (v) => Math.round(v * 100) / 100;
const isPurchase = (a) => a.tipo === "acquisto";

function clearPlan() {
  currentPlan = null;
  currentSteps = [];
  planUpto = 0;
  planSig = null;
}

/* quando si cambia partita (sandbox): nessun piano né avviso residuo */
export function resetPlanState() {
  clearPlan();
  planStaleNotice = false;
}

export function renderOttimizza() {
  const sel = S.state.eroiSel;
  const sig = stateSig(S.state);
  /* se i dati cambiano (modifica locale o da un altro dispositivo) mentre è aperta
     una scelta o è mostrato un piano, quel piano non è più valido */
  if (optCtx && optCtx.sig !== sig && $("modal-choice")) {
    closeDyn("modal-choice");
    optCtx = null;
    planStaleNotice = true;
  }
  const keepPlan = planSig !== null && planSig === sig;
  if (planSig !== null && !keepPlan) {
    clearPlan();
    planStaleNotice = true;
  }
  const ready = sel.length === HEROES_PER_MISSION;
  const heroes = EROI.map((h) => heroCardHtml(h, sel.includes(h), "toggleHero")).join("");
  $("scr-opt").innerHTML = `
    <div id="opt-step1">
      ${planStaleNotice ? `<p class="hint stale-notice warn">⚠ I dati sono cambiati: il piano precedente non è più valido, elaboralo di nuovo.</p>` : ""}
      <h2>Chi parte per la missione?</h2>
      <p class="hint">Seleziona i ${HEROES_PER_MISSION} eroi: le costruzioni suggerite riguarderanno solo loro. Gli acquisti valgono per tutti.</p>
      <div class="heroes-grid" role="group" aria-label="Eroi in missione">${heroes}</div>
      <p class="hint hero-count${ready ? "" : " warn"}">${sel.length} / ${HEROES_PER_MISSION} selezionati</p>
      <button class="btn gold big" id="btn-elab" ${ready ? "" : "disabled"} data-action="runOptimizer">⚡ Elabora consigli</button>
    </div>
    <div id="opt-plan"></div>`;
  if (keepPlan) showPlan(currentPlan, planUpto);
}

export function resetOptimizer() {
  clearPlan();
  optCtx = null;
  planStaleNotice = false;
  closeDyn("modal-choice");
  renderOttimizza();
}

export function runOptimizer() {
  if (S.state.eroiSel.length !== HEROES_PER_MISSION) {
    toast(`Seleziona esattamente ${HEROES_PER_MISSION} eroi`);
    return;
  }
  planStaleNotice = false;
  /* fino a maxSfidanti piani entro la soglia, dal migliore: con N piani bastano N−1 scelte */
  const cands = candidatePlans(S.state, S.state.impostazioni.maxSfidanti);
  if (cands.length < 2) {
    optCtx = null;
    showPlan(cands[0] || null);
    return;
  }
  optCtx = { cands, next: 1, winner: cands[0], sig: stateSig(S.state) };
  showChoicePopup();
}

const soldUnits = (steps) => steps.reduce((s, x) => s + Object.values(x.sells).reduce((t, q) => t + q, 0), 0);

/* card di un piano nel confronto: solo le azioni che l'altro piano non ha */
function planOptionHtml(pl, other, idx) {
  const own = executionOrder(S.state, diffActions(pl, other));
  const items = own.map((a) => `<li>· ${esc(a.label)}</li>`).join("");
  const steps = planSteps(S.state, pl);
  const sold = soldUnits(steps);
  const coinsAfter = steps.length ? steps.at(-1).coinsAfter : S.state.monete;
  const n = own.length;
  return `<div class="opt-card" role="button" tabindex="0" data-action="chooseOption" data-idx="${idx}">
    <b>${idx === 0 ? "A" : "B"} · ${n} azion${n === 1 ? "e" : "i"}</b>
    <ul>${items}</ul>
    <div class="val">Valore ${esc(fmtValue(pl.value))}${sold ? ` · vende ${esc(sold)} materiali` : ""} · restano 🪙 ${esc(coinsAfter)}</div></div>`;
}

/* confronto fra il piano che ha vinto finora e il prossimo candidato */
function showChoicePopup() {
  const { cands, next, winner: a } = optCtx;
  const b = cands[next];
  const common = a.actions.length - diffActions(a, b).length;
  const commonNote = common
    ? ` ${common === 1 ? "L'azione" : `Le ${common} azioni`} in comune ai due piani non ${common === 1 ? "è mostrata" : "sono mostrate"}.`
    : "";
  openModal(
    "modal-choice",
    `<h3>Scelta ${next} di ${cands.length - 1} — piani quasi pari</h3>
    <p class="sub">${cands.length} piani con valore entro il ${esc(S.state.impostazioni.soglia)}% dal migliore: il piano scelto passa al confronto successivo.${commonNote}</p>
    ${planOptionHtml(a, b, 0)}${planOptionHtml(b, a, 1)}
    <button class="btn big" data-action="closeModal" data-target="modal-choice">✕ Interrompi elaborazione</button>`,
  );
}

export function chooseOption(idx) {
  if (!optCtx || optCtx.sig !== stateSig(S.state)) {
    closeDyn("modal-choice");
    optCtx = null;
    planStaleNotice = true;
    renderOttimizza();
    toast("I dati sono cambiati: elabora di nuovo il piano");
    return;
  }
  if (idx === 1) optCtx.winner = optCtx.cands[optCtx.next];
  optCtx.next++;
  closeDyn("modal-choice");
  if (optCtx.next < optCtx.cands.length) {
    showChoicePopup();
    return;
  }
  const { winner } = optCtx;
  optCtx = null;
  showPlan(winner);
}

function planStepsHtml(steps) {
  const st = S.state;
  const gain = (v) => `<span class="amt pos">+${esc(v)}</span>`;
  const cost = (v) => `<span class="amt neg">−${esc(v)}</span>`;
  return steps
    .map(({ action: a, sells, buys, coinsAfter }, i) => {
      const prep = [
        ...Object.entries(sells).map(([m, q]) => `<li>vendi ${esc(q)}× ${MAT[m].nome}${gain(q * MAT[m].vendi)}</li>`),
        ...Object.entries(buys).map(
          ([m, q]) => `<li>compra ${esc(q)}× ${MAT[m].nome} dal magazzino${cost(q * MAT[m].compra)}</li>`,
        ),
      ].join("");
      let sub = "";
      let amount = cost(a.r.costo);
      if (!isPurchase(a)) {
        const per = a.r.eroi.filter((h) => st.eroiSel.includes(h)).join(", ");
        const depNote = buildDepKey(st, a) ? " · dopo la costruzione della versione normale" : "";
        sub = `<br><span class="hint hint-flush">per ${esc(per)}${depNote}</span>`;
        amount = `<span class="amt build">⚒</span>`;
      }
      return `<div class="plan-step">
        <div class="plan-n">${i + 1}</div>
        <div class="plan-body"><b>${esc(a.label)}</b>${sub}${prep ? `<ul class="plan-prep">${prep}</ul>` : ""}
          <span class="hint hint-flush">restano 🪙 ${esc(coinsAfter)}</span></div>
        ${amount}</div>`;
    })
    .join("");
}

function showPlan(pl, upto) {
  currentPlan = pl;
  currentSteps = pl ? planSteps(S.state, pl) : [];
  const total = currentSteps.length;
  planUpto = upto >= 1 && upto <= total ? upto : total;
  planSig = stateSig(S.state);
  $("opt-step1").hidden = true;
  const el = $("opt-plan");
  if (!total) {
    el.innerHTML = `<h2>Piano consigliato</h2>
      <p class="empty">Nessuna azione consigliata con le risorse attuali.<br>Controlla monete, magazzino, pesi e priorità (le ricette a 0 stelle sono ignorate).</p>
      <button class="btn big" data-action="resetOptimizer">↺ Ricomincia</button>`;
    return;
  }
  const options = currentSteps
    .map((_, i) => {
      const k = total - i;
      return `<option value="${k}">${k === total ? `Tutto il piano (${total} step)` : `Fino allo step ${k}`}</option>`;
    })
    .join("");
  el.innerHTML = `<h2>Piano consigliato</h2>
    <p class="hint">Ordine di esecuzione al tavolo: dal peso più alto al più basso (un'azione segue quelle da cui dipende), con vendite e acquisti di materiali quando servono. Valore totale del piano: <b class="text-gold">${esc(fmtValue(pl.value))} punti</b>.</p>
    ${pl.exact ? "" : `<p class="hint warn">⚠ Ricerca fermata al limite di calcolo: il piano è valido ma potrebbe non essere il migliore.</p>`}
    <div class="card" id="plan-steps">${planStepsHtml(currentSteps)}</div>
    <div class="card">
      <label for="plan-upto">Da applicare</label>
      <select id="plan-upto" class="plan-upto" data-change="setPlanUpto">${options}</select>
      <div class="summary-row"><span>Monete: prima → dopo</span><b id="plan-coins"></b></div>
      <div class="summary-row"><span>Azioni</span><b id="plan-count"></b></div>
    </div>
    <button class="btn teal big" data-action="confirmApplyPlan">✓ Applica (aggiorna inventario)</button>
    <button class="btn big" data-action="resetOptimizer">↺ Ricomincia</button>`;
  updateUptoView();
}

/* scelta di quanti step applicare: gli step esclusi restano visibili ma attenuati */
export function setPlanUpto(value) {
  const k = parseInt(value, 10);
  if (!(k >= 1 && k <= currentSteps.length)) return;
  planUpto = k;
  updateUptoView();
}

function updateUptoView() {
  document
    .querySelectorAll("#plan-steps .plan-step")
    .forEach((step, i) => step.classList.toggle("skipped", i >= planUpto));
  $("plan-upto").value = String(planUpto);
  const done = currentSteps.slice(0, planUpto);
  const nAcquisti = done.filter((s) => isPurchase(s.action)).length;
  $("plan-coins").textContent = `${S.state.monete} → 🪙 ${done.at(-1).coinsAfter}`;
  $("plan-count").textContent = `${nAcquisti} acquisti · ${done.length - nAcquisti} costruzioni`;
}

export function confirmApplyPlan() {
  if (!currentPlan || !currentSteps.length) return;
  const total = currentSteps.length;
  const done = currentSteps.slice(0, planUpto);
  const names = (purchase) =>
    done
      .filter((s) => isPurchase(s.action) === purchase)
      .map((s) => esc(s.action.r.nome) + (s.action.r.pot ? " +" : ""))
      .join(", ");
  const acq = names(true);
  const cos = names(false);
  askConfirm(
    planUpto === total ? "Applicare il piano?" : `Applicare il piano fino allo step ${esc(planUpto)}?`,
    "L'inventario, il mercato e le ricette verranno aggiornati automaticamente.",
    `<div class="card summary-card">
      <div class="summary-row"><span>Step da eseguire</span><b>${esc(planUpto)} di ${esc(total)}</b></div>
      <div class="summary-row"><span>Monete</span><b>${esc(S.state.monete)} → 🪙 ${esc(done.at(-1).coinsAfter)}</b></div>
      ${acq ? `<div class="summary-row"><span>Ricette acquistate</span><b>${acq}</b></div>` : ""}
      ${cos ? `<div class="summary-row"><span>Ricette costruite</span><b>${cos}</b></div>` : ""}
    </div>`,
    "✓ Conferma",
    applyPlan,
  );
}

function applyPlan() {
  if (!currentPlan || !currentSteps.length) return;
  const st = S.state;
  if (planSig !== stateSig(st)) {
    toast("I dati sono cambiati: elabora di nuovo il piano");
    renderOttimizza();
    return;
  }
  const before = canonState(st);
  currentSteps.slice(0, planUpto).forEach(({ action: a, sells, buys }) => {
    Object.entries(sells).forEach(([m, q]) => {
      st.materiali[m] = Math.max(0, (st.materiali[m] || 0) - q);
      st.magazzino[m] = (st.magazzino[m] || 0) + q;
      st.monete += q * MAT[m].vendi;
    });
    Object.entries(buys).forEach(([m, q]) => {
      st.monete -= q * MAT[m].compra;
      st.magazzino[m] = Math.max(0, (st.magazzino[m] || 0) - q);
      st.materiali[m] = (st.materiali[m] || 0) + q;
    });
    const r = st.ricette[a.r.id];
    if (!r) return;
    if (isPurchase(a)) {
      st.monete -= r.costo;
      r.stato = "acquistata";
      return;
    }
    Object.entries(r.materiali).forEach(([m, q]) => {
      st.materiali[m] = Math.max(0, (st.materiali[m] || 0) - q);
    });
    r.stato = "costruita";
    transformIfPot(r);
  });
  st.monete = Math.max(0, st.monete);
  /* per l'annullamento si conservano lo stato prima e dopo il piano: se ne potrà
     invertire solo l'effetto, senza toccare le modifiche arrivate dopo */
  LS.set(KEY.undo(S.gameCode), JSON.stringify({ before, after: canonState(st) }));
  clearPlan();
  save();
  infoModal(
    "Piano applicato",
    "Tutti i dati sono stati aggiornati" + (S.fb && S.online ? " e sincronizzati." : "."),
    "Vai all'inventario →",
    () => showScreen("scr-inv"),
  );
}

export function undoApply() {
  const key = KEY.undo(S.gameCode);
  const bak = parseUndo(LS.get(key));
  if (!bak) {
    LS.del(key);
    toast("Nessuna applicazione da annullare");
    return;
  }
  const legacy = !bak.before; /* formato precedente: istantanea completa dello stato */
  askConfirm(
    "Annullare l'ultima applicazione?",
    legacy
      ? "Lo stato tornerà a com'era prima dell'ultimo \"Applica piano\"."
      : "Vengono annullate solo le modifiche fatte dal piano: quelle arrivate dopo restano.",
    "",
    "↩ Ripristina",
    () => {
      /* si applica allo stato attuale l'inverso del piano (i contatori per differenza) */
      const revert = legacy ? diffState(S.state, bak) : diffState(bak.after, bak.before);
      S.state = normalize(applyOps(S.state, revert));
      LS.del(key);
      save();
      toast("Stato ripristinato");
    },
  );
}

function parseUndo(raw) {
  try {
    const v = JSON.parse(raw);
    return isPlainObj(v) ? v : null;
  } catch {
    return null;
  }
}
