/**
 * Repetir en el navegador la «semana normal» de la memoria con otra semilla: la simulación corre en
 * un Web Worker (normal-week.worker.ts) y TanStack Query guarda cada resultado por semilla, así que
 * volver a la página no la repite. Si nadie espera ya el resultado (se sale de la página), el
 * worker se detiene.
 */
import { queryOptions } from "@tanstack/react-query";
import type { NormalWeekRun } from "@/sim/experiments";
import { type WorkerRequest, workerReplySchema } from "./reproduce-messages";

/** Primera semilla que se ofrece: la memoria usa de la 1 a la 5. */
export const FIRST_NEW_SEED = 6;

export interface RunOptions {
  signal?: AbortSignal;
  /** Crea el worker (en las pruebas, uno falso). */
  createWorker?: () => Worker;
}

const createNormalWeekWorker = () =>
  new Worker(new URL("./normal-week.worker.ts", import.meta.url), { type: "module", name: "semana-normal" });

/** Ejecuta la simulación en un worker nuevo y lo cierra al acabar, al fallar o al cancelarse. */
export function runInWorker(
  request: WorkerRequest,
  { signal, createWorker = createNormalWeekWorker }: RunOptions = {},
): Promise<NormalWeekRun> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const worker = createWorker();
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<unknown>) => {
      finish();
      const reply = workerReplySchema.safeParse(event.data);
      if (!reply.success) reject(new Error("El worker devolvió un resultado inesperado."));
      else if (reply.data.ok) resolve(reply.data.run);
      else reject(new Error(reply.data.error));
    };
    worker.onerror = (event: ErrorEvent) => {
      finish();
      reject(new Error(event.message || "La simulación falló."));
    };
    worker.postMessage(request);
  });
}

/** La semana normal con una semilla: se calcula una vez y no caduca (es determinista). */
export const normalWeekQuery = (seed: number, options: Omit<RunOptions, "signal"> = {}) =>
  queryOptions({
    queryKey: ["semana-normal", seed],
    queryFn: ({ signal }) => runInWorker({ seed }, { ...options, signal }),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
