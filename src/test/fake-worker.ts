/** Ayudas de las pruebas: un Web Worker falso para src/lib/reproduce.ts. */
import { vi } from "vitest";

/** Un worker falso que contesta con `reply` (o con un error) al recibir el mensaje. */
export function fakeWorker(reply: unknown | ((request: unknown) => unknown), fail?: string) {
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    terminate: vi.fn(),
    postMessage: vi.fn((request: unknown) => {
      queueMicrotask(() => {
        if (fail) worker.onerror?.({ message: fail } as ErrorEvent);
        else worker.onmessage?.({ data: typeof reply === "function" ? reply(request) : reply } as MessageEvent);
      });
    }),
  };
  return worker;
}
