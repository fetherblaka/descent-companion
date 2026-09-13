/* Accesso a Firebase.
   L'SDK modulare viene importato dalla CDN solo in produzione: in ambiente di
   test non entra mai nella pagina, quindi non esiste alcun canale di scrittura
   verso il database di produzione (i dati reali si leggono solo via REST, vedi
   sandbox.js). Il resto dell'app usa solo il piccolo adattatore restituito qui. */
import { FIREBASE_SDK_BASE, LOCAL_ONLY, SDK_TIMEOUT_MS, firebaseConfig } from "./config.js";

/* adattatore con le sole operazioni usate dall'app, oppure null (modalità locale):
   se la CDN non risponde entro il timeout l'app parte comunque, in locale */
export async function connectFirebase() {
  if (LOCAL_ONLY || !firebaseConfig.databaseURL) return null;
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout SDK Firebase")), SDK_TIMEOUT_MS),
    );
    const [appSdk, dbSdk] = await Promise.race([
      Promise.all([
        import(`${FIREBASE_SDK_BASE}/firebase-app.js`),
        import(`${FIREBASE_SDK_BASE}/firebase-database.js`),
      ]),
      timeout,
    ]);
    const database = dbSdk.getDatabase(appSdk.initializeApp(firebaseConfig));
    const at = (path) => dbSdk.ref(database, path);
    return {
      /* restituisce la funzione per smettere di ascoltare */
      listen: (path, onData, onError) => dbSdk.onValue(at(path), onData, onError),
      set: (path, value) => dbSdk.set(at(path), value),
      update: (path, updates) => dbSdk.update(at(path), updates),
      transaction: (path, fn) => dbSdk.runTransaction(at(path), fn),
      exists: (path) => dbSdk.get(at(path)).then((snap) => snap.exists()),
    };
  } catch {
    return null;
  }
}
