/**
 * Web Worker que simula una «semana normal» (src/sim/experiments.ts) fuera del hilo de la página,
 * para que siga respondiendo durante los segundos que tarda. Recibe { seed } y contesta
 * { ok: true, run } o { ok: false, error }; lo lanza src/lib/reproduce.ts.
 */
import { runNormalWeek } from "@/sim/experiments";
import { workerRequestSchema, type WorkerReply } from "./reproduce-messages";

// El tipo del ámbito de un worker (lib «webworker») choca con el de la página («dom»).
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (reply: WorkerReply) => void;
};

scope.onmessage = (event) => {
  try {
    const { seed, days } = workerRequestSchema.parse(event.data);
    scope.postMessage({ ok: true, run: runNormalWeek(seed, days) });
  } catch (error) {
    scope.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
