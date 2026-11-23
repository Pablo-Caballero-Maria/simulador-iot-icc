/// <reference lib="webworker" />
/**
 * El service worker (Serwist), que src/app/serwist/[path]/route.ts construye en /serwist/sw.js y
 * registra components/ui/ServiceWorker.tsx, para que el simulador funcione sin conexión:
 *
 * - al instalarse precachea los scripts, estilos y fuentes del build (three.js y la red neuronal
 *   incluidos) y la página sin conexión, y descarga todas las páginas (pages.ts);
 * - páginas: primero la red; sin conexión, la copia guardada;
 * - lo demás: las reglas de Serwist para Next.js (estáticos de la caché primero, imágenes y
 *   fuentes stale-while-revalidate…).
 *
 * La simulación es determinista y corre entera en el navegador: no necesita ningún servidor.
 */
import { defaultCache } from "@serwist/turbopack/worker";
import { NetworkFirst, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";
import { OFFLINE_FALLBACK, OFFLINE_PAGES, PAGES_CACHE } from "./pages";
import { isDocument, isPage } from "./requests";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    { matcher: isPage, handler: new NetworkFirst({ cacheName: PAGES_CACHE, networkTimeoutSeconds: 5 }) },
    ...defaultCache,
  ],
  fallbacks: { entries: [{ url: OFFLINE_FALLBACK, matcher: isDocument }] },
});

/** Descarga todas las páginas; la que falle (una conexión inestable) se guardará al visitarla. */
async function cachePages(): Promise<void> {
  const cache = await caches.open(PAGES_CACHE);
  await Promise.allSettled(OFFLINE_PAGES.map((page) => cache.add(page)));
}

self.addEventListener("install", (event) => event.waitUntil(cachePages()));
serwist.addEventListeners();
