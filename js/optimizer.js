/* Ottimizzatore: algoritmo puro, riceve lo stato e non tocca interfaccia né salvataggi.
   Cerca in modo esaustivo le combinazioni di acquisti e costruzioni realizzabili
   con monete, materiali e magazzino, vendendo se serve i materiali meno utili. */
import { OPTIMIZER_MAX_CANDIDATES } from "./config.js";
import { MAT, MATERIALI, RANK } from "./data.js";

/* quanto un materiale serve alle ricette ancora da costruire, pesato per priorità */
function usefulness(state, matId) {
  let u = 0;
  Object.values(state.ricette).forEach((r) => {
    if (r.stelle > 0 && r.stato !== "costruita" && r.materiali[matId]) u += r.stelle * r.materiali[matId];
  });
  return u;
}

function buildEligible(state, r) {
  if (r.stelle <= 0) return false;
  if (!r.eroi.some((h) => state.eroiSel.includes(h))) return false;
  if (r.pot && r.prereq && r.prereq.tipo === "mancante") return false;
  return true;
}

/* chiave dell'azione di costruzione da cui dipende (normale non ancora costruita), o null */
export function buildDepKey(state, c) {
  const r = c.r;
  if (r.pot && r.prereq && r.prereq.tipo === "ricetta") {
    const N = state.ricette[r.prereq.id];
    if (N && N.stato !== "costruita") return "B_" + N.id;
  }
  return null;
}

function getCandidates(state) {
  const pesi = state.impostazioni.pesi;
  const cands = [];
  Object.values(state.ricette).forEach((r) => {
    if (r.stelle <= 0) return;
    const suff = r.pot ? " +" : "";
    const stars = "★".repeat(r.stelle);
    if (r.stato === "mercato") {
      const k = "acq" + r.stelle;
      cands.push({
        key: "A_" + r.id,
        tipo: "acquisto",
        r,
        rank: RANK[k],
        peso: pesi[k],
        label: `Acquista: ${r.nome}${suff} (${stars})`,
      });
    }
    if ((r.stato === "mercato" || r.stato === "acquistata") && buildEligible(state, r)) {
      const k = "cos" + r.stelle;
      cands.push({
        key: "B_" + r.id,
        tipo: "costruzione",
        r,
        rank: RANK[k],
        peso: pesi[k],
        label: `Costruisci: ${r.nome}${suff} (${stars})`,
      });
    }
  });
  cands.sort((a, b) => a.rank - b.rank || b.peso - a.peso);
  return cands.slice(0, OPTIMIZER_MAX_CANDIDATES);
}

function evalSubset(state, cands, mask, include, exclude) {
  const chosen = [];
  for (let i = 0; i < cands.length; i++) if (mask & (1 << i)) chosen.push(cands[i]);
  const keys = new Set(chosen.map((c) => c.key));
  for (const k of include) if (!keys.has(k)) return null;
  for (const k of exclude) if (keys.has(k)) return null;
  /* dipendenze: la costruzione di una ricetta nel mercato richiede il suo acquisto
     nello stesso piano; la potenziata richiede la costruzione della normale collegata */
  for (const c of chosen) {
    if (c.tipo !== "costruzione") continue;
    if (c.r.stato === "mercato" && !keys.has("A_" + c.r.id)) return null;
    const dep = buildDepKey(state, c);
    if (dep && !keys.has(dep)) return null;
  }
  const need = {};
  chosen
    .filter((c) => c.tipo === "costruzione")
    .forEach((c) => {
      Object.entries(c.r.materiali).forEach(([m, q]) => {
        need[m] = (need[m] || 0) + q;
      });
    });
  const buys = {};
  let matCost = 0;
  for (const [m, q] of Object.entries(need)) {
    const short = Math.max(0, q - (state.materiali[m] || 0));
    if (short > (state.magazzino[m] || 0)) return null;
    if (short > 0) {
      buys[m] = short;
      matCost += short * MAT[m].compra;
    }
  }
  const coinCost = matCost + chosen.filter((c) => c.tipo === "acquisto").reduce((s, c) => s + c.r.costo, 0);
  const deficit = coinCost - state.monete;
  const sells = {};
  let sellGain = 0;
  if (deficit > 0) {
    const pool = MATERIALI.map((m) => {
      const reserved = Math.min(state.materiali[m.id] || 0, need[m.id] || 0);
      return { id: m.id, free: (state.materiali[m.id] || 0) - reserved, vendi: m.vendi, u: usefulness(state, m.id) };
    })
      .filter((x) => x.free > 0)
      .sort((a, b) => a.u - b.u || a.vendi - b.vendi);
    const sold = [];
    let gain = 0;
    outer: for (const x of pool) {
      for (let i = 0; i < x.free; i++) {
        if (gain >= deficit) break outer;
        sold.push(x);
        gain += x.vendi;
      }
    }
    if (gain < deficit) return null;
    /* raffinamento: l'ultima unità venduta (che può eccedere il fabbisogno)
       viene sostituita con l'unità più economica sufficiente a coprire il residuo */
    const last = sold[sold.length - 1];
    const resid = deficit - (gain - last.vendi);
    const counts = {};
    sold.forEach((s) => (counts[s.id] = (counts[s.id] || 0) + 1));
    counts[last.id]--;
    let best = last;
    for (const x of pool) {
      const avail = x.free - (counts[x.id] || 0);
      if (avail > 0 && x.vendi >= resid && (x.vendi < best.vendi || (x.vendi === best.vendi && x.u < best.u))) best = x;
    }
    if (best !== last) {
      sold[sold.length - 1] = best;
      gain += best.vendi - last.vendi;
    }
    sold.forEach((s) => {
      sells[s.id] = (sells[s.id] || 0) + 1;
    });
    sellGain = gain;
  }
  const value = chosen.reduce((s, c) => s + c.peso, 0);
  return {
    actions: chosen,
    keys,
    buys,
    sells,
    value,
    coinsAfter: state.monete + sellGain - coinCost,
    spend: coinCost - sellGain,
  };
}

/* tutti i piani realizzabili, dal migliore; include/exclude: chiavi di azioni imposte o vietate */
export function searchPlans(state, include, exclude) {
  const cands = getCandidates(state);
  const plans = [];
  const seen = new Set();
  const N = 1 << cands.length;
  for (let mask = 1; mask < N; mask++) {
    const pl = evalSubset(state, cands, mask, include, exclude);
    if (!pl) continue;
    const sig = [...pl.keys].sort().join("|");
    if (seen.has(sig)) continue;
    seen.add(sig);
    plans.push(pl);
  }
  plans.sort((a, b) => b.value - a.value || b.coinsAfter - a.coinsAfter || a.actions.length - b.actions.length);
  return plans;
}

const bestRankOf = (actions) => (actions.length ? Math.min(...actions.map((a) => a.rank)) : Infinity);
/* azioni di a che non sono in b */
export const diffActions = (a, b) => a.actions.filter((x) => !b.keys.has(x.key));

/* piano alternativo su cui chiedere all'utente: conflitto di priorità ("rango")
   o valore entro la soglia % dal migliore ("soglia"); null se non serve chiedere */
export function findChallenger(state, plans) {
  if (plans.length < 2) return null;
  const best = plans[0];
  const soglia = state.impostazioni.soglia;
  let rankCh = null;
  let nearCh = null;
  for (let i = 1; i < plans.length; i++) {
    const alt = plans[i];
    const exAlt = diffActions(alt, best);
    const exBest = diffActions(best, alt);
    if (!exAlt.length || !exBest.length) continue;
    if (!rankCh && bestRankOf(exAlt) < bestRankOf(exBest)) rankCh = alt;
    if (!nearCh && best.value > 0 && ((best.value - alt.value) / best.value) * 100 <= soglia) nearCh = alt;
    if (rankCh) break;
  }
  if (rankCh) return { plan: rankCh, tipo: "rango" };
  return nearCh ? { plan: nearCh, tipo: "soglia" } : null;
}

/* ordina le costruzioni: prima le normali, poi le potenziate che ne dipendono */
export function orderBuilds(state, builds) {
  const keys = new Set(builds.map((b) => b.key));
  const placed = new Set();
  const out = [];
  const pool = [...builds].sort((a, b) => a.rank - b.rank);
  while (pool.length) {
    let progressed = false;
    for (let i = 0; i < pool.length; i++) {
      const dep = buildDepKey(state, pool[i]);
      if (!dep || !keys.has(dep) || placed.has(dep)) {
        out.push(pool[i]);
        placed.add(pool[i].key);
        pool.splice(i, 1);
        progressed = true;
        break;
      }
    }
    if (!progressed) {
      out.push(...pool);
      break;
    }
  }
  return out;
}
