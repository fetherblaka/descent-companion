/* Ottimizzatore: algoritmo puro, riceve lo stato e non tocca interfaccia né salvataggi.

   Modello. Ogni ricetta con almeno una stella offre fino a due azioni: l'acquisto (se è
   nel mercato) e la costruzione (se riguarda un eroe in missione). Il valore di un piano
   è la somma dei pesi delle sue azioni, presi dalle impostazioni.
   Le risorse sono un unico bilancio in monete: monete possedute più il valore di
   vendita dei materiali vendibili posseduti (i base; gli essenziali solo se
   l'impostazione vendiEssenziali è attiva). Un acquisto consuma il suo costo; una
   costruzione consuma, per ogni materiale, il valore di vendita delle unità vendibili
   possedute che usa (non si potranno più vendere) e il prezzo delle unità mancanti
   comprate dal magazzino. Un piano che sta nelle sole monete non vende nulla;
   altrimenti si vendono prima i materiali base, poi eventualmente gli essenziali, i più
   abbondanti per primi.
   Il costo di un materiale cresce con la quantità richiesta (prima si usa quanto si
   possiede, poi si compra a prezzo pieno): è convesso, quindi il costo di un'azione
   aggiunta a un piano non è mai inferiore al suo costo su un piano vuoto.

   Ricerca. Nessuna enumerazione delle combinazioni: branch & bound sulle azioni
   ordinate per rendimento (peso / costo minimo). Il limite superiore di un ramo è il
   minore fra lo zaino frazionario sulle monete e un rilassamento lagrangiano che tiene
   conto anche delle unità disponibili di ogni materiale (le essenze scarse), entrambi
   validi per la convessità dei costi. Si esplora prima il ramo "includi"; oltre un
   numero massimo di nodi si tiene il migliore trovato (piano segnato come non esatto). */
import { OPTIMIZER_CHALLENGER_WORK, OPTIMIZER_MAX_WORK } from "./config.js";
import { MAT, MATERIALI } from "./data.js";

const EPS = 1e-9;
const LAGRANGE_ITERATIONS = 200; /* passi di ottimizzazione dei moltiplicatori alla radice */
const LAGRANGE_PROBE = 2000; /* nodi dopo cui si valuta se il limite lagrangiano è utile */
const LAGRANGE_MIN_PRUNE_RATE = 0.05; /* sotto questa quota di rami scartati si spegne */
const isBuild = (a) => a.tipo === "costruzione";
/* materiali che il piano può vendere: i base sempre, gli essenziali solo se abilitato */
const sellableFor = (state) => (m) => !m.ess || state.impostazioni.vendiEssenziali === true;

function buildEligible(state, r) {
  if (!r.eroi.some((h) => state.eroiSel.includes(h))) return false;
  if (r.pot && r.prereq && r.prereq.tipo === "mancante") return false;
  return true;
}

/* chiave dell'azione di costruzione da cui dipende (normale non ancora costruita), o null */
export function buildDepKey(state, a) {
  const r = a.r;
  if (r.pot && r.prereq && r.prereq.tipo === "ricetta") {
    const N = state.ricette[r.prereq.id];
    if (N && N.stato !== "costruita") return "B_" + N.id;
  }
  return null;
}

function candidates(state) {
  const pesi = state.impostazioni.pesi;
  const out = [];
  Object.values(state.ricette)
    .filter((r) => r.stelle > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome) || (a.id < b.id ? -1 : 1))
    .forEach((r) => {
      const suff = r.pot ? " +" : "";
      const stars = "★".repeat(r.stelle);
      if (r.stato === "mercato") {
        const classe = "acq" + r.stelle;
        out.push({
          key: "A_" + r.id,
          tipo: "acquisto",
          r,
          classe,
          peso: pesi[classe] || 0,
          label: `Acquista: ${r.nome}${suff} (${stars})`,
        });
      }
      if ((r.stato === "mercato" || r.stato === "acquistata") && buildEligible(state, r)) {
        const classe = "cos" + r.stelle;
        out.push({
          key: "B_" + r.id,
          tipo: "costruzione",
          r,
          classe,
          peso: pesi[classe] || 0,
          label: `Costruisci: ${r.nome}${suff} (${stars})`,
        });
      }
    });
  return out;
}

const MAT_INDEX = Object.fromEntries(MATERIALI.map((m, j) => [m.id, j]));

/* Prepara la ricerca: azioni utilizzabili con i vincoli (chiavi imposte e vietate),
   ordinate per rendimento, con le dipendenze di ciascuna. null se i vincoli non sono
   realizzabili. */
function buildModel(state, include, exclude) {
  const all = candidates(state);
  const index = new Map(all.map((c, i) => [c.key, i]));
  const own = MATERIALI.map((m) => state.materiali[m.id] || 0);
  const mag = MATERIALI.map((m) => state.magazzino[m.id] || 0);
  const sellable = sellableFor(state);
  /* costo di n unità del materiale j in una costruzione */
  const matCost = (j, n) => {
    const m = MATERIALI[j];
    const short = n - own[j];
    if (short > mag[j]) return Infinity;
    return (short > 0 ? short * m.compra : 0) + (sellable(m) ? Math.min(n, own[j]) * m.vendi : 0);
  };
  const budget = state.monete + MATERIALI.reduce((s, m, j) => s + (sellable(m) ? own[j] * m.vendi : 0), 0);
  const price = all.map((c) => (isBuild(c) ? 0 : c.r.costo));
  const mats = all.map((c) =>
    isBuild(c)
      ? Object.entries(c.r.materiali)
          .filter(([m, q]) => q > 0 && m in MAT_INDEX)
          .map(([m, q]) => [MAT_INDEX[m], q])
      : [],
  );
  const setCost = (ids) => {
    const need = new Map();
    let cost = 0;
    for (const i of ids) {
      cost += price[i];
      for (const [j, q] of mats[i]) need.set(j, (need.get(j) || 0) + q);
    }
    for (const [j, n] of need) cost += matCost(j, n);
    return cost;
  };

  /* chiusura: l'azione con tutte le azioni da cui dipende (acquisto prima della
     costruzione, normale prima della potenziata); null se una manca o è vietata */
  const deps = all.map((c) => {
    if (!isBuild(c)) return [];
    const d = [];
    if (c.r.stato === "mercato") d.push("A_" + c.r.id);
    const dep = buildDepKey(state, c);
    if (dep) d.push(dep);
    return d;
  });
  const closure = new Array(all.length);
  const visiting = new Set();
  const close = (i) => {
    if (closure[i] !== undefined) return closure[i];
    if (visiting.has(i)) return null; /* dipendenza circolare */
    if (exclude.has(all[i].key)) return (closure[i] = null);
    visiting.add(i);
    let set = [i];
    for (const k of deps[i]) {
      const j = index.get(k);
      const sub = j === undefined ? null : close(j);
      if (!sub) {
        set = null;
        break;
      }
      sub.forEach((x) => set.includes(x) || set.push(x));
    }
    visiting.delete(i);
    return (closure[i] = set);
  };

  /* candidati: azioni realizzabili da sole con tutto il bilancio, che valgono qualcosa
     o sono necessarie ad azioni che valgono qualcosa */
  const keep = new Set();
  all.forEach((c, i) => {
    const cl = close(i);
    if (!cl || setCost(cl) > budget) return;
    if (c.peso > EPS || include.has(c.key)) cl.forEach((x) => keep.add(x));
  });
  for (const k of include) if (!keep.has(index.get(k))) return null;

  const density = (x) => (x.cost <= 0 ? Infinity : x.w / x.cost);
  const sorted = [...keep]
    .map((i) => ({ i, w: all[i].peso, cost: setCost([i]) }))
    .sort((a, b) => {
      const da = density(a);
      const db = density(b);
      return da === db ? b.w - a.w : db > da ? 1 : -1;
    });
  const pos = new Map(sorted.map((x, p) => [x.i, p]));
  const items = sorted.map((x) => ({
    cand: all[x.i],
    w: x.w,
    price: price[x.i],
    mats: mats[x.i],
    minCost: x.cost,
    clos: closure[x.i].map((g) => pos.get(g)),
    dependents: [],
  }));
  items.forEach((it, p) => it.clos.forEach((q) => q !== p && items[q].dependents.push(p)));
  const forced = [...include].map((k) => pos.get(index.get(k)));
  /* unità utilizzabili di ogni materiale e costo della prossima unità dopo n già impegnate */
  const caps = MATERIALI.map((m, j) => own[j] + mag[j]);
  const slope = (j, n) => {
    const m = MATERIALI[j];
    if (n >= caps[j]) return Infinity;
    if (n < own[j]) return sellable(m) ? m.vendi : 0;
    return m.compra;
  };
  return { items, budget, matCost, forced, caps, slope };
}

/* passo dei valori: con pesi ad al più due decimali ogni piano vale un multiplo del loro
   MCD, quindi il limite superiore si può arrotondare per difetto (0 = non arrotondabile) */
function valueUnit(items) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let g = 0;
  for (const it of items) {
    const scaled = Math.round(it.w * 100);
    if (Math.abs(scaled - it.w * 100) > 1e-6) return 0;
    g = gcd(g, scaled);
  }
  return g / 100;
}

const better = (a, b) =>
  a.value > b.value + EPS ||
  (a.value > b.value - EPS && (a.slack > b.slack || (a.slack === b.slack && a.count < b.count)));

/* Branch & bound. minValue: valore minimo di un piano accettabile; novelVs: insiemi di
   chiavi di piani di riferimento, si accettano solo piani con almeno un'azione fuori da
   ciascuno (cioè non contenuti in nessuno di essi). */
function solve(model, { maxWork, minValue = 0, novelVs = [] }) {
  const { items, budget, matCost, forced, caps, slope } = model;
  const n = items.length;
  const inc = new Uint8Array(n);
  const blocked = new Uint16Array(n); /* dipendenze escluse nel ramo corrente */
  /* per ogni azione, gli indici dei piani di riferimento in cui non compare */
  const newFor = items.map((it) => novelVs.flatMap((keys, r) => (keys.has(it.cand.key) ? [] : [r])));
  const novel = new Array(novelVs.length).fill(0);
  const need = new Array(MATERIALI.length).fill(0);
  const unit = valueUnit(items);
  let value = 0;
  let cost = 0;
  let count = 0;
  let work = 0; /* azioni esaminate dai limiti superiori */
  let truncated = false;
  let best = null;

  const undo = (added) => {
    for (const q of added) {
      const it = items[q];
      inc[q] = 0;
      for (const [j, k] of it.mats) need[j] -= k;
      value -= it.w;
      count--;
      newFor[q].forEach((r) => novel[r]--);
    }
  };
  /* aggiunge l'azione p con le sue dipendenze; null se il bilancio o il magazzino non
     bastano. Il controllo avviene dopo ogni azione della chiusura: un costo infinito
     (magazzino esaurito) non deve mai entrare nei conti (∞ − ∞ darebbe NaN). */
  const add = (p) => {
    const added = [];
    let delta = 0;
    for (const q of items[p].clos) {
      if (inc[q]) continue;
      const it = items[q];
      delta += it.price;
      for (const [j, k] of it.mats) {
        delta += matCost(j, need[j] + k) - matCost(j, need[j]);
        need[j] += k;
      }
      inc[q] = 1;
      value += it.w;
      count++;
      newFor[q].forEach((r) => novel[r]++);
      added.push(q);
      if (!(cost + delta <= budget + EPS)) {
        undo(added);
        return null;
      }
    }
    cost += delta;
    return { added, delta };
  };
  const consider = () => {
    if (value < minValue - EPS || novel.some((k) => k === 0)) return;
    const cur = { value, slack: budget - cost, count };
    if (best && !better(cur, best)) return;
    best = { ...cur, sel: items.filter((_, q) => inc[q]).map((it) => it.cand) };
  };
  const roundDown = (vb) => (unit ? Math.floor(vb / unit + 1e-7) * unit : vb);
  /* zaino frazionario sulle azioni ancora libere, con i costi minimi (vincolo delle sole monete) */
  const fractionalBound = (p) => {
    let cap = budget - cost;
    let vb = value;
    for (let q = p; q < n; q++) {
      work++;
      if (inc[q] || blocked[q]) continue;
      const it = items[q];
      if (it.minCost <= cap) {
        cap -= it.minCost;
        vb += it.w;
      } else {
        vb += (it.w * cap) / it.minCost;
        break;
      }
    }
    return vb;
  };

  /* Rilassamento lagrangiano con monete e unità di ogni materiale (conta quando il limite
     sono le essenze, non le monete). Con moltiplicatori mu (monete) e lambda (unità) ≥ 0:
       valore + mu·monete residue + Σ lambda·unità residue + Σ max(0, peso − mu·costo − lambda·unità)
     è un limite superiore per qualunque scelta dei moltiplicatori. Il costo di un'azione è
     stimato per difetto con il prezzo della prossima unità (convessità); le azioni che da
     sole non stanno nelle risorse residue sono escluse. Con grad si calcola il subgradiente. */
  const used = [...new Set(items.flatMap((it) => it.mats.map(([j]) => j)))];
  const lambda = new Array(MATERIALI.length).fill(0);
  let mu = 0;
  const lagrange = (p, grad) => {
    const slack = budget - cost;
    let lb = value + mu * slack;
    if (grad) {
      grad.mu = slack;
      used.forEach((j) => (grad[j] = caps[j] - need[j]));
    }
    for (const j of used) lb += lambda[j] * (caps[j] - need[j]);
    for (let q = p; q < n; q++) {
      work++;
      if (inc[q] || blocked[q]) continue;
      const it = items[q];
      let c = it.price;
      let red = it.w;
      let fits = true;
      for (const [j, k] of it.mats) {
        if (need[j] + k > caps[j]) {
          fits = false;
          break;
        }
        const s = slope(j, need[j]);
        c += s * k;
        red -= lambda[j] * k;
      }
      if (!fits || c > slack + EPS) continue;
      red -= mu * c;
      if (red <= 0) continue;
      lb += red;
      if (grad) {
        grad.mu -= c;
        for (const [j, k] of it.mats) grad[j] -= k;
      }
    }
    return lb;
  };
  /* moltiplicatori alla radice: minimizzazione del duale con passo di Polyak su vincoli
     normalizzati alla loro capacità; target = miglior piano noto (goloso) */
  const tuneMultipliers = (target) => {
    const scaleMu = Math.max(1, budget - cost);
    const scale = (j) => Math.max(1, caps[j] - need[j]);
    let bestL = lagrange(0);
    let bestMu = mu;
    let bestLambda = [...lambda];
    let theta = 2;
    let stall = 0;
    for (let it = 0; it < LAGRANGE_ITERATIONS && theta > 1e-3; it++) {
      const grad = {};
      const L = lagrange(0, grad);
      if (L < bestL - EPS) {
        bestL = L;
        bestMu = mu;
        bestLambda = [...lambda];
        stall = 0;
      } else if (++stall >= 10) {
        theta /= 2;
        stall = 0;
      }
      const gap = L - target;
      let norm = (grad.mu / scaleMu) ** 2;
      used.forEach((j) => (norm += (grad[j] / scale(j)) ** 2));
      if (gap <= EPS || norm <= EPS) break;
      const t = (theta * gap) / norm;
      mu = Math.max(0, mu - (t * grad.mu) / scaleMu ** 2);
      used.forEach((j) => (lambda[j] = Math.max(0, lambda[j] - (t * grad[j]) / scale(j) ** 2)));
    }
    mu = bestMu;
    used.forEach((j) => (lambda[j] = bestLambda[j]));
  };
  /* piano goloso nell'ordine di rendimento: primo piano di riferimento per i limiti */
  const greedy = () => {
    const stack = [];
    for (let p = 0; p < n; p++) {
      if (inc[p] || blocked[p]) continue;
      const u = add(p);
      if (u) stack.push(u);
    }
    consider();
    const v = value;
    stack.reverse().forEach((u) => {
      undo(u.added);
      cost -= u.delta;
    });
    return v;
  };

  const prune = (vb) =>
    vb < (best ? best.value : minValue) - EPS ||
    /* a pari valore si preferisce il piano che lascia più risorse: qui non possono crescere */
    (best && vb <= best.value + EPS && budget - cost <= best.slack);
  const dfs = (p) => {
    while (p < n && (inc[p] || blocked[p])) p++;
    if (p >= n) return;
    if (work > maxWork) {
      truncated = true;
      return;
    }
    if (prune(roundDown(fractionalBound(p)))) return;
    if (useLagrange) {
      lagCalls++;
      if (prune(roundDown(lagrange(p)))) {
        lagPrunes++;
        return;
      }
      /* se scarta quasi nulla costa più di quanto fa risparmiare: si spegne */
      if (lagCalls >= LAGRANGE_PROBE && lagPrunes < lagCalls * LAGRANGE_MIN_PRUNE_RATE) useLagrange = false;
    }
    const u = add(p);
    if (u) {
      consider();
      dfs(p + 1);
      undo(u.added);
      cost -= u.delta;
      if (truncated) return;
    }
    items[p].dependents.forEach((d) => blocked[d]++);
    dfs(p + 1);
    items[p].dependents.forEach((d) => blocked[d]--);
  };

  for (const p of forced) if (!inc[p] && !add(p)) return null;
  consider();
  const greedyValue = greedy();
  tuneMultipliers(Math.max(greedyValue, best ? best.value : 0));
  /* senza materiali scarsi (tutti i lambda a 0) il limite lagrangiano non aggiunge nulla
     allo zaino frazionario: si evita di calcolarlo a ogni nodo */
  let useLagrange = used.some((j) => lambda[j] > EPS);
  let lagCalls = 0;
  let lagPrunes = 0;
  work = 0;
  dfs(0);
  if (!best) return null;
  return {
    actions: best.sel,
    keys: new Set(best.sel.map((a) => a.key)),
    value: best.value,
    slack: best.slack,
    exact: !truncated,
  };
}

/* miglior piano con tutte le azioni di include e nessuna di exclude (insiemi di chiavi);
   null se i vincoli non sono realizzabili. Un piano senza azioni è un risultato valido. */
export function searchPlan(state, include = new Set(), exclude = new Set()) {
  const model = buildModel(state, include, exclude);
  return model && solve(model, { maxWork: OPTIMIZER_MAX_WORK });
}

/* azioni di a che non sono in b */
export const diffActions = (a, b) => a.actions.filter((x) => !b.keys.has(x.key));

const withCount = (p) => ({ ...p, count: p.actions.length });
const byMerit = (a, b) => (better(withCount(a), withCount(b)) ? -1 : better(withCount(b), withCount(a)) ? 1 : 0);

/* Piani candidati da confrontare: il migliore e i successivi in ordine di valore, al più
   max, tutti con valore entro la soglia % dal migliore. Un piano contenuto in un altro
   candidato non è mai preferibile (i pesi non sono negativi), quindi ogni nuovo candidato è
   il miglior piano non contenuto in quelli già trovati. Un piano così rinuncia per forza ad
   almeno un'azione del migliore: lo spazio si divide senza sovrapposizioni (Lawler), con il
   ramo i che tiene le prime i−1 azioni del migliore ed esclude la i-esima. */
export function candidatePlans(state, max) {
  const best = searchPlan(state);
  if (!best) return [];
  const plans = [best];
  if (best.value <= EPS) return plans;
  const minValue = best.value * (1 - state.impostazioni.soglia / 100);
  while (plans.length < max) {
    const novelVs = plans.map((p) => p.keys);
    const kept = new Set();
    let next = null;
    for (const a of best.actions) {
      const model = buildModel(state, kept, new Set([a.key]));
      /* nei rami successivi interessa solo un piano almeno pari a quello già trovato */
      const floor = next ? Math.max(minValue, next.value) : minValue;
      const alt = model && solve(model, { maxWork: OPTIMIZER_CHALLENGER_WORK, minValue: floor, novelVs });
      if (alt && (!next || byMerit(alt, next) < 0)) next = alt;
      kept.add(a.key);
    }
    if (!next) break;
    plans.push(next);
  }
  /* con la ricerca fermata al limite un candidato può superare il primo: si riordina */
  plans.sort(byMerit);
  const top = plans[0].value * (1 - state.impostazioni.soglia / 100);
  return plans.filter((p) => p.value >= top - EPS);
}

/* ── Esecuzione ── */

/* azioni in ordine di esecuzione: dal peso più alto al più basso (a parità, acquisti prima
   delle costruzioni, poi più stelle); un'azione porta subito prima di sé quelle del piano
   da cui dipende (acquisto della stessa ricetta, costruzione della versione normale) */
export function executionOrder(state, actions) {
  const byKey = new Map(actions.map((a) => [a.key, a]));
  const out = [];
  const placed = new Set();
  const place = (a) => {
    if (placed.has(a.key)) return;
    placed.add(a.key);
    const deps = isBuild(a) ? ["A_" + a.r.id, buildDepKey(state, a)] : [];
    deps.forEach((k) => byKey.has(k) && place(byKey.get(k)));
    out.push(a);
  };
  [...actions]
    .sort(
      (a, b) =>
        b.peso - a.peso ||
        Number(isBuild(a)) - Number(isBuild(b)) ||
        b.r.stelle - a.r.stelle ||
        a.r.nome.localeCompare(b.r.nome),
    )
    .forEach(place);
  return out;
}

/* Step del piano: ogni azione con le vendite e gli acquisti di materiali necessari in quel
   momento. Si vende un'unità alla volta, prima fra i materiali base e, solo quando nessun
   base è più vendibile e l'impostazione lo consente, fra gli essenziali; in ciascun gruppo
   da quello più abbondante al netto di quanto serve alle costruzioni non ancora eseguite
   (a parità, quello meno richiesto dalle altre ricette). Ogni step riporta le monete
   rimaste dopo di esso. */
export function planSteps(state, plan) {
  const actions = executionOrder(state, plan.actions);
  const own = { ...state.materiali };
  const pending = {};
  actions.filter(isBuild).forEach((a) => {
    Object.entries(a.r.materiali).forEach(([m, q]) => (pending[m] = (pending[m] || 0) + q));
  });
  const built = new Set(actions.filter(isBuild).map((a) => a.r.id));
  const demand = {};
  Object.values(state.ricette).forEach((r) => {
    if (r.stelle <= 0 || r.stato === "costruita" || built.has(r.id)) return;
    Object.entries(r.materiali).forEach(([m, q]) => (demand[m] = (demand[m] || 0) + r.stelle * q));
  });
  /* gruppi di vendita in ordine di priorità */
  const sellGroups = [MATERIALI.filter((m) => !m.ess)];
  if (state.impostazioni.vendiEssenziali === true) sellGroups.push(MATERIALI.filter((m) => m.ess));
  const pickToSell = () => {
    for (const group of sellGroups) {
      let pick = null;
      let pickFree = 0;
      for (const m of group) {
        const free = (own[m.id] || 0) - (pending[m.id] || 0);
        if (free > pickFree || (pick && free === pickFree && (demand[m.id] || 0) < (demand[pick.id] || 0))) {
          pick = m;
          pickFree = free;
        }
      }
      if (pick) return pick;
    }
    return null;
  };
  let coins = state.monete;
  return actions.map((a) => {
    const sells = {};
    const buys = {};
    let cost = isBuild(a) ? 0 : a.r.costo;
    if (isBuild(a)) {
      Object.entries(a.r.materiali).forEach(([m, q]) => {
        const short = Math.max(0, q - (own[m] || 0));
        if (short > 0) {
          buys[m] = short;
          cost += short * MAT[m].compra;
        }
      });
    }
    while (coins < cost) {
      const pick = pickToSell();
      if (!pick) break; /* non accade con un piano prodotto dalla ricerca */
      own[pick.id]--;
      coins += pick.vendi;
      sells[pick.id] = (sells[pick.id] || 0) + 1;
    }
    coins -= cost;
    if (isBuild(a)) {
      Object.entries(a.r.materiali).forEach(([m, q]) => {
        own[m] = (own[m] || 0) + (buys[m] || 0) - q;
        pending[m] -= q;
      });
    }
    return { action: a, sells, buys, coinsAfter: coins };
  });
}
