/* Avvio dell'app. */
import { installEvents } from "./events.js";
import { connectFirebase } from "./firebase.js";
import { firstRunModal } from "./game.js";
import { renderAll } from "./render.js";
import { restoreSandboxSession } from "./sandbox.js";
import { KEY, LS, S } from "./store.js";
import { attachGame, installSyncFlush } from "./sync.js";
import { updateSyncPill } from "./ui.js";

async function boot() {
  installEvents();
  installSyncFlush();
  S.gameCode = LS.get(KEY.code) || null;
  S.fb = await connectFirebase();
  updateSyncPill();
  if (restoreSandboxSession()) return;
  if (S.gameCode) {
    attachGame(S.gameCode);
  } else {
    renderAll(); /* app vuota dietro al popup di scelta */
    firstRunModal();
  }
}

boot();
