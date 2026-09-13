/* Configurazione dell'app: progetto Firebase, ambiente e parametri di funzionamento. */

/* Configurazione web del progetto Firebase. Non è un segreto: la protezione dei
   dati è affidata alle regole del Realtime Database. */
export const firebaseConfig = {
  apiKey: "AIzaSyCfi5YSriQvSmHveUSRoD6AjZyPxlcXYuk",
  authDomain: "descent-excel-ma-meglio.firebaseapp.com",
  databaseURL: "https://descent-excel-ma-meglio-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "descent-excel-ma-meglio",
  storageBucket: "descent-excel-ma-meglio.firebasestorage.app",
  messagingSenderId: "742634405131",
  appId: "1:742634405131:web:d2abdebafb2eaba054760e",
};

/* SDK modulare di Firebase, importato dalla CDN solo in produzione (vedi firebase.js) */
export const FIREBASE_SDK_BASE = "https://www.gstatic.com/firebasejs/12.19.0";

/* percorso di una partita nel Realtime Database */
export const gamePath = (code) => `partite/${code}`;

/* ── Ambiente ──
   Firebase è attivo solo sull'host di produzione (GitHub Pages, https). Ovunque
   altrove (localhost, IP di rete locale come 192.168.x.x, anteprime) oppure con
   ?local nell'URL resta disattivato: i dati restano solo su questo dispositivo e
   non toccano la partita di produzione. */
export const PROD_HOST = location.protocol === "https:" && /\.github\.io$/i.test(location.hostname);
export const LOCAL_ONLY = !PROD_HOST || new URLSearchParams(location.search).has("local");

/* ── Tempi (ms) ── */
export const SAVE_DEBOUNCE_MS = 250; /* attesa prima di inviare le modifiche al server */
export const SDK_TIMEOUT_MS = 10000; /* oltre, l'app parte in modalità locale */
export const REMOTE_CHECK_TIMEOUT_MS = 8000; /* verifica che la partita esista prima di collegarsi */
export const TOAST_MS = 2200;
export const INPUT_FOCUS_DELAY_MS = 50;

/* ── Limiti ── */
export const RECENT_GAMES_MAX = 5; /* partite tenute in cache su questo dispositivo */
export const SANDBOX_RECENT_MAX = 8; /* codici proposti nel picker della sandbox */
/* lavoro massimo del branch & bound, in azioni esaminate dai limiti superiori: oltre, si
   tiene il miglior piano trovato (non garantito ottimo) */
export const OPTIMIZER_MAX_WORK = 20000000;
export const OPTIMIZER_CHALLENGER_WORK = 2000000; /* per ogni ramo della ricerca dei piani candidati */
export const HEROES_PER_MISSION = 4;
