/* Schermata Ottimizza: scelta degli eroi, domande all'utente, piano consigliato,
   applicazione del piano e suo annullamento. */
import { HEROES_PER_MISSION, OPTIMIZER_MAX_CHOICES } from "./config.js";
import { EROI, MAT } from "./data.js";
import { buildDepKey, diffActions, findChallenger, orderBuilds, searchPlans } from "./optimizer.js";
import { transformIfPot } from "./recipes.js";
import { normalize } from "./schema.js";
import { KEY, LS, S } from "./store.js";
import { applyOps, canonState, diffState, save, stateSig } from "./sync.js";
import { $, askConfirm, closeDyn, goScreen, heroCardHtml, infoModal, openModal, toast } from "./ui.js";
import { esc, isPlainObj } from "./util.js";

let currentPlan = null; /* piano mostrato (null anche per "nessuna azione consigliata") */
let planSig = null; /* firma dello stato su cui è stato calcolato; null = nessun piano mostrato */
let planStaleNotice = false; /* avviso "piano non più valido" */
let optCtx = null; /* elaborazione in corso: scelte fatte e firma dello stato di partenza */
let choiceA = null;
let choiceB = null;

function clearPlan() {
  currentPlan = null;
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
  if (keepPlan) showPlan(currentPlan);
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
  optCtx = { include: new Set(), exclude: new Set(), step: 0, sig: stateSig(S.state) };
  optimizerLoop();
}

function optimizerLoop() {
  const plans = searchPlans(S.state, optCtx.include, optCtx.exclude);
  if (!plans.length) {
    showPlan(null);
    return;
  }
  const challenger = findChallenger(S.state, plans);
  if (!challenger || optCtx.step >= OPTIMIZER_MAX_CHOICES) {
    showPlan(plans[0]);
    return;
  }
  optCtx.step++;
  showChoicePopup(plans[0], challenger.plan, challenger.tipo);
}

function planOptionHtml(pl, idx) {
  const items = pl.actions.map((a) => `<li>· ${esc(a.label)}</li>`).join("");
  const n = pl.actions.length;
  return `<div class="opt-card" role="button" tabindex="0" data-action="chooseOption" data-idx="${idx}">
    <b>${idx === 0 ? "A" : "B"} · ${n} azion${n === 1 ? "e" : "i"}</b>
    <ul>${items}</ul>
    <div class="val">Valore ${esc(pl.value)} · spesa netta 🪙 ${esc(pl.spend)} · restano 🪙 ${esc(pl.coinsAfter)}</div></div>`;
}

function showChoicePopup(a, b, tipo) {
  choiceA = a;
  choiceB = b;
  const title =
    tipo === "rango" ? "conflitto di priorità" : `piani quasi pari (< ${esc(S.state.impostazioni.soglia)}%)`;
  const sub =
    tipo === "rango"
      ? 'Più azioni "piccole" valgono più di una "grande": decidete voi.'
      : "Due strade con valore molto vicino: decidete voi.";
  openModal(
    "modal-choice",
    `<h3>Scelta ${optCtx.step} — ${title}</h3><p class="sub">${sub}</p>
    ${planOptionHtml(a, 0)}${planOptionHtml(b, 1)}
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
  const chosen = idx === 0 ? choiceA : choiceB;
  const other = idx === 0 ? choiceB : choiceA;
  diffActions(chosen, other).forEach((a) => optCtx.include.add(a.key));
  diffActions(other, chosen).forEach((a) => optCtx.exclude.add(a.key));
  closeDyn("modal-choice");
  optimizerLoop();
}

function planStepsHtml(pl) {
  const st = S.state;
  let n = 0;
  const step = (txt, sub, amountHtml) => {
    n++;
    const subHtml = sub ? `<br><span class="hint hint-flush">${sub}</span>` : "";
    return `<div class="plan-step"><div class="plan-n">${n}</div><div><b>${txt}</b>${subHtml}</div>${amountHtml}</div>`;
  };
  const gain = (v) => `<span class="amt pos">+${esc(v)}</span>`;
  const cost = (v) => `<span class="amt neg">−${esc(v)}</span>`;
  const steps = [];
  Object.entries(pl.sells).forEach(([m, q]) => {
    steps.push(step(`Vendi ${esc(q)}× ${MAT[m].nome}`, "per coprire le spese", gain(q * MAT[m].vendi)));
  });
  Object.entries(pl.buys).forEach(([m, q]) => {
    steps.push(step(`Compra ${esc(q)}× ${MAT[m].nome}`, "dal magazzino, per le costruzioni", cost(q * MAT[m].compra)));
  });
  pl.actions
    .filter((a) => a.tipo === "acquisto")
    .sort((a, b) => a.rank - b.rank)
    .forEach((a) => steps.push(step(esc(a.label), "", cost(a.r.costo))));
  orderBuilds(
    st,
    pl.actions.filter((a) => a.tipo === "costruzione"),
  ).forEach((a) => {
    const per = a.r.eroi.filter((h) => st.eroiSel.includes(h)).join(", ");
    const depNote = buildDepKey(st, a) ? " · dopo la costruzione della versione normale" : "";
    steps.push(step(esc(a.label), "per " + esc(per) + depNote, `<span class="amt build">⚒</span>`));
  });
  return steps.join("");
}

function showPlan(pl) {
  currentPlan = pl;
  planSig = stateSig(S.state);
  $("opt-step1").hidden = true;
  const el = $("opt-plan");
  if (!pl || !pl.actions.length) {
    el.innerHTML = `<h2>Piano consigliato</h2>
      <p class="empty">Nessuna azione consigliata con le risorse attuali.<br>Controlla monete, magazzino e priorità (le ricette a 0 stelle sono ignorate).</p>
      <button class="btn big" data-action="resetOptimizer">↺ Ricomincia</button>`;
    return;
  }
  const nAcquisti = pl.actions.filter((a) => a.tipo === "acquisto").length;
  el.innerHTML = `<h2>Piano consigliato</h2>
    <p class="hint">Ordine di esecuzione al tavolo. Valore totale del piano: <b class="text-gold">${esc(pl.value)} punti</b>.</p>
    <div class="card">${planStepsHtml(pl)}</div>
    <div class="card">
      <div class="summary-row"><span>Monete: prima → dopo</span><b>${esc(S.state.monete)} → 🪙 ${esc(pl.coinsAfter)}</b></div>
      <div class="summary-row"><span>Azioni</span><b>${nAcquisti} acquisti · ${pl.actions.length - nAcquisti} costruzioni</b></div>
    </div>
    <button class="btn teal big" data-action="confirmApplyPlan">✓ Applica piano (aggiorna inventario)</button>
    <button class="btn big" data-action="resetOptimizer">↺ Ricomincia</button>`;
}

export function confirmApplyPlan() {
  const pl = currentPlan;
  if (!pl) return;
  const nAz = pl.actions.length + Object.keys(pl.sells).length + Object.keys(pl.buys).length;
  const names = (tipo) =>
    pl.actions
      .filter((a) => a.tipo === tipo)
      .map((a) => esc(a.r.nome) + (a.r.pot ? " +" : ""))
      .join(", ");
  const acq = names("acquisto");
  const cos = names("costruzione");
  askConfirm(
    "Applicare il piano?",
    "L'inventario, il mercato e le ricette verranno aggiornati automaticamente.",
    `<div class="card summary-card">
      <div class="summary-row"><span>Azioni da eseguire</span><b>${nAz}</b></div>
      <div class="summary-row"><span>Monete</span><b>${esc(S.state.monete)} → 🪙 ${esc(pl.coinsAfter)}</b></div>
      ${acq ? `<div class="summary-row"><span>Ricette acquistate</span><b>${acq}</b></div>` : ""}
      ${cos ? `<div class="summary-row"><span>Ricette costruite</span><b>${cos}</b></div>` : ""}
    </div>`,
    "✓ Conferma",
    applyPlan,
  );
}

function applyPlan() {
  const pl = currentPlan;
  if (!pl) return;
  const st = S.state;
  if (planSig !== stateSig(st)) {
    toast("I dati sono cambiati: elabora di nuovo il piano");
    renderOttimizza();
    return;
  }
  const before = canonState(st);
  Object.entries(pl.sells).forEach(([m, q]) => {
    st.materiali[m] = Math.max(0, (st.materiali[m] || 0) - q);
    st.magazzino[m] = (st.magazzino[m] || 0) + q;
    st.monete += q * MAT[m].vendi;
  });
  Object.entries(pl.buys).forEach(([m, q]) => {
    st.monete -= q * MAT[m].compra;
    st.magazzino[m] = Math.max(0, (st.magazzino[m] || 0) - q);
    st.materiali[m] = (st.materiali[m] || 0) + q;
  });
  pl.actions
    .filter((a) => a.tipo === "acquisto")
    .forEach((a) => {
      st.monete -= a.r.costo;
      if (st.ricette[a.r.id]) st.ricette[a.r.id].stato = "acquistata";
    });
  orderBuilds(
    st,
    pl.actions.filter((a) => a.tipo === "costruzione"),
  ).forEach((a) => {
    const r = st.ricette[a.r.id];
    if (!r) return;
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
    () => goScreen("scr-inv"),
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
