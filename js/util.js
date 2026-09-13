/* Funzioni di utilità senza dipendenze dal DOM né dallo stato dell'app. */

export const isPlainObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/* JSON.parse che non blocca l'app se i dati sono corrotti */
export function parseJSON(str, fallback = null) {
  if (str == null) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);

export const uid = () => "R" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* valore di una mappa solo per chiavi proprie (niente "constructor", "__proto__"…) */
export const ownValue = (map, key) => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null);
