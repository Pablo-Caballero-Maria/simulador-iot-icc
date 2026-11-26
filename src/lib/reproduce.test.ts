import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { runNormalWeek } from "@/sim/experiments";
import { fakeWorker } from "@/test/fake-worker";
import { normalWeekQuery, runInWorker } from "./reproduce";
import { workerReplySchema, workerRequestSchema } from "./reproduce-messages";

const run = runNormalWeek(6, 1);

describe("runInWorker", () => {
  it("envía la semilla y devuelve el resultado validado", async () => {
    const worker = fakeWorker({ ok: true, run });
    await expect(runInWorker({ seed: 6 }, { createWorker: () => worker as unknown as Worker })).resolves.toEqual(run);
    expect(worker.postMessage).toHaveBeenCalledWith({ seed: 6 });
    expect(worker.terminate).toHaveBeenCalled();
  });

  it("falla con el error del worker o con una respuesta que no es la esperada", async () => {
    const failed = fakeWorker({ ok: false, error: "sin memoria" });
    await expect(runInWorker({ seed: 6 }, { createWorker: () => failed as unknown as Worker })).rejects.toThrow(
      "sin memoria",
    );
    const odd = fakeWorker({ ok: true, run: { ...run, accuracy: 7 } });
    await expect(runInWorker({ seed: 6 }, { createWorker: () => odd as unknown as Worker })).rejects.toThrow(
      "resultado inesperado",
    );
    const crashed = fakeWorker(null, "Uncaught RangeError");
    await expect(runInWorker({ seed: 6 }, { createWorker: () => crashed as unknown as Worker })).rejects.toThrow(
      "Uncaught RangeError",
    );
    expect(crashed.terminate).toHaveBeenCalled();
  });

  it("se cancela y cierra el worker si nadie espera ya el resultado", async () => {
    const worker = fakeWorker({ ok: true, run });
    worker.postMessage.mockImplementation(() => {});
    const controller = new AbortController();
    const pending = runInWorker(
      { seed: 6 },
      { signal: controller.signal, createWorker: () => worker as unknown as Worker },
    );
    controller.abort(new Error("cancelada"));
    await expect(pending).rejects.toThrow("cancelada");
    expect(worker.terminate).toHaveBeenCalled();
    const create = vi.fn();
    await expect(runInWorker({ seed: 6 }, { signal: controller.signal, createWorker: create })).rejects.toThrow(
      "cancelada",
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe("normalWeekQuery", () => {
  it("guarda cada semilla una vez", async () => {
    const createWorker = vi.fn(() => fakeWorker({ ok: true, run }) as unknown as Worker);
    const client = new QueryClient();
    await client.fetchQuery(normalWeekQuery(6, { createWorker }));
    await client.fetchQuery(normalWeekQuery(6, { createWorker }));
    expect(createWorker).toHaveBeenCalledOnce();
    expect(client.getQueryData(["semana-normal", 6])).toEqual(run);
  });
});

describe("mensajes del worker", () => {
  it("validan la petición (7 días por defecto) y la respuesta", () => {
    expect(workerRequestSchema.parse({ seed: 6 })).toEqual({ seed: 6, days: 7 });
    expect(workerRequestSchema.safeParse({ seed: -1 }).success).toBe(false);
    expect(workerReplySchema.parse({ ok: true, run })).toEqual({ ok: true, run });
    expect(workerReplySchema.safeParse({ ok: true }).success).toBe(false);
  });
});
